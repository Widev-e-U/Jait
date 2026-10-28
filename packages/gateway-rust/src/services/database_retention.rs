//! Retention of replay/debug detail. All SQL stays on the canonical database owner.
//! Scheduling is explicitly driven by the host; construction opens no live database.
use crate::{
    contracts::bounded_json::{limit_utf8, serialize_bounded_json},
    db::worker::{DatabaseError, DatabaseWorker},
    execution::process_runner::ProcessCancellation,
    services::persisted_tool_calls::{SerializationOptions, serialize_persisted_tool_calls},
};
use chrono::{DateTime, Utc};
use rusqlite::{Connection, params, params_from_iter, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;

const DAY: i64 = 86_400_000;
const PARSE_LIMIT: usize = 8 * 1024 * 1024;
const RUN_DURATION: Duration = Duration::from_secs(30);
const VM_INSTRUCTIONS: u64 = 10_000_000;
const PROGRESS_INTERVAL: i32 = 1000;
const TRANSIENT: &str = "'thinking','agent_thought_chunk','codex/event/agent_reasoning_delta','codex/event/exec_command_output_delta','codex/event/reasoning_content_delta','account/rateLimits/updated','available_commands_update','codex/event/mcp_startup_update','mcpServer/startupStatus/updated','session_info_update','thread/status/changed','usage_update'";
const SEARCHABLE: &str = "'message','tool.result','tool.error','error'";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseRetentionPolicy {
    pub enabled: bool,
    pub search_index_cleanup_enabled: bool,
    pub context_flow_days: Option<u32>,
    pub tool_detail_days: Option<u32>,
    pub transient_activity_days: Option<u32>,
    pub audit_payload_days: Option<u32>,
    pub audit_row_days: Option<u32>,
    pub stale_session_days: Option<u32>,
    pub batch_size: usize,
    pub max_batches_per_run: usize,
    pub initial_delay_ms: u64,
    pub interval_ms: u64,
}
impl Default for DatabaseRetentionPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            search_index_cleanup_enabled: true,
            context_flow_days: Some(90),
            tool_detail_days: Some(90),
            transient_activity_days: Some(14),
            audit_payload_days: Some(90),
            audit_row_days: None,
            stale_session_days: Some(30),
            batch_size: 100,
            max_batches_per_run: 20,
            initial_delay_ms: 300_000,
            interval_ms: DAY as u64,
        }
    }
}
/// Parse a captured environment; never reads the process environment implicitly.
impl DatabaseRetentionPolicy {
    pub fn from_env(env: &BTreeMap<String, String>) -> Self {
        let mut p = Self::default();
        p.enabled = env_bool(env, "JAIT_RETENTION_ENABLED", p.enabled);
        p.search_index_cleanup_enabled = env_bool(
            env,
            "JAIT_SEARCH_INDEX_CLEANUP_ENABLED",
            p.search_index_cleanup_enabled,
        );
        for (key, field) in [
            ("CONTEXT_FLOW", &mut p.context_flow_days),
            ("TOOL_DETAIL", &mut p.tool_detail_days),
            ("TRANSIENT_ACTIVITY", &mut p.transient_activity_days),
            ("AUDIT_PAYLOAD", &mut p.audit_payload_days),
            ("AUDIT_ROW", &mut p.audit_row_days),
            ("STALE_SESSION", &mut p.stale_session_days),
        ] {
            if let Some(s) = env
                .get(&format!("JAIT_RETENTION_{key}_DAYS"))
                .filter(|s| !s.trim().is_empty())
            {
                *field = parse_positive(s).and_then(|n| u32::try_from(n).ok());
            }
        }
        p.batch_size = env_positive(env, "JAIT_RETENTION_BATCH_SIZE", p.batch_size as u64) as usize;
        p.max_batches_per_run = env_positive(
            env,
            "JAIT_RETENTION_MAX_BATCHES",
            p.max_batches_per_run as u64,
        ) as usize;
        p.initial_delay_ms =
            env_positive(env, "JAIT_RETENTION_INITIAL_DELAY_MS", p.initial_delay_ms);
        p.interval_ms = env_positive(env, "JAIT_RETENTION_INTERVAL_MS", p.interval_ms);
        p
    }
}
pub(crate) fn parse_positive(s: &str) -> Option<u64> {
    let s = s.trim_start().strip_prefix('+').unwrap_or(s.trim_start());
    let digits: String = s.chars().take_while(char::is_ascii_digit).collect();
    digits.parse::<u64>().ok().filter(|n| *n > 0)
}
pub(crate) fn env_bool(env: &BTreeMap<String, String>, key: &str, fallback: bool) -> bool {
    env.get(key)
        .map(|s| {
            matches!(
                s.trim().to_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(fallback)
}
pub(crate) fn env_positive(env: &BTreeMap<String, String>, key: &str, fallback: u64) -> u64 {
    env.get(key)
        .and_then(|s| parse_positive(s))
        .unwrap_or(fallback)
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RetentionMutation {
    SearchIndexRowsRemoved,
    ContextFlowsCompacted,
    ToolCallsCompacted,
    ActivityPayloadsCompacted,
    TransientActivitiesDeleted,
    AuditPayloadsCleared,
    AuditRowsDeleted,
    StaleSessionsArchived,
}
impl RetentionMutation {
    fn key(self) -> &'static str {
        match self {
            Self::SearchIndexRowsRemoved => "searchIndexRowsRemoved",
            Self::ContextFlowsCompacted => "contextFlowsCompacted",
            Self::ToolCallsCompacted => "toolCallsCompacted",
            Self::ActivityPayloadsCompacted => "activityPayloadsCompacted",
            Self::TransientActivitiesDeleted => "transientActivitiesDeleted",
            Self::AuditPayloadsCleared => "auditPayloadsCleared",
            Self::AuditRowsDeleted => "auditRowsDeleted",
            Self::StaleSessionsArchived => "staleSessionsArchived",
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionStep {
    pub candidate: String,
    pub mutation: RetentionMutation,
    pub cutoff: Option<String>,
    pub batch_size: usize,
    pub max_batches: usize,
    // Predicates are generated only by plan(); never accepted from serialized requests.
    table: String,
    predicate: String,
    byte_expression: String,
    order: String,
    parameters: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionPlan {
    pub cutoffs: BTreeMap<String, Option<String>>,
    pub steps: Vec<RetentionStep>,
    pub max_batches: usize,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionCandidate {
    pub rows: u64,
    pub bytes: u64,
    pub bounded: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionReport {
    pub enabled: bool,
    pub dry_run: bool,
    pub cutoffs: BTreeMap<String, Option<String>>,
    pub candidates: BTreeMap<String, RetentionCandidate>,
    pub processed: BTreeMap<String, usize>,
    pub batches: usize,
    pub busy: bool,
    pub errors: Vec<String>,
    pub skipped_reason: Option<String>,
}
/// Returns a retained host lease. Implementations must check current scope/expiry,
/// including session mutation authority for StaleSessionsArchived. No default grant.
/// This synchronous check runs on the DB owner: validate captured authority here;
/// do not wait for approvals, perform blocking I/O, or recursively enqueue DB work.
pub trait RetentionAuthority: Send + Sync {
    fn authorize(&self, step: &RetentionStep) -> Result<Arc<dyn Send + Sync>, String>;
}
/// Shared across every scan/batch in a run; queue time consumes the deadline too.
#[derive(Clone)]
struct RetentionBounds {
    deadline: Instant,
    remaining: Arc<AtomicU64>,
    cancel: ProcessCancellation,
    stop: ProcessCancellation,
    abandoned: ProcessCancellation,
}
impl RetentionBounds {
    fn new(cancel: ProcessCancellation, stop: ProcessCancellation) -> Self {
        Self {
            deadline: Instant::now() + RUN_DURATION,
            remaining: Arc::new(AtomicU64::new(VM_INSTRUCTIONS)),
            cancel,
            stop,
            abandoned: ProcessCancellation::default(),
        }
    }
    fn reason(&self) -> Option<&'static str> {
        if self.cancel.is_cancelled() || self.stop.is_cancelled() {
            Some("stopped")
        } else if self.abandoned.is_cancelled() {
            Some("caller-dropped")
        } else if Instant::now() >= self.deadline {
            Some("duration-budget")
        } else if self.remaining.load(Ordering::Relaxed) == 0 {
            Some("scan-budget")
        } else {
            None
        }
    }
    fn check(&self) -> Result<(), crate::db::worker::OperationError> {
        match self.reason() {
            Some(reason) => {
                Err(std::io::Error::new(std::io::ErrorKind::Interrupted, reason).into())
            }
            None => Ok(()),
        }
    }
    fn progress(&self) -> bool {
        let _ = self
            .remaining
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
                Some(n.saturating_sub(PROGRESS_INTERVAL as u64))
            });
        self.reason().is_some()
    }
}
struct CancelOnDrop(ProcessCancellation);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

/// Installed only inside the current canonical worker job. No connection-wide
/// interrupt handle or detached timer can interrupt a predecessor/successor.
/// The canonical connection currently has no custom progress/busy handler. The
/// host must preserve that ownership rule; rusqlite cannot retrieve an old hook.
struct RetentionSqlScope<'a> {
    db: &'a Connection,
    busy_ms: u64,
}
impl<'a> RetentionSqlScope<'a> {
    fn new(
        db: &'a Connection,
        bounds: &RetentionBounds,
    ) -> Result<Self, crate::db::worker::OperationError> {
        bounds.check()?;
        let busy_ms =
            u64::try_from(db.query_row("PRAGMA busy_timeout", [], |row| row.get::<_, i64>(0))?)?;
        db.busy_timeout(Duration::ZERO)?;
        let scope = Self { db, busy_ms };
        let bounds = bounds.clone();
        db.progress_handler(PROGRESS_INTERVAL, Some(move || bounds.progress()))?;
        Ok(scope)
    }
}
impl Drop for RetentionSqlScope<'_> {
    fn drop(&mut self) {
        // Must run before transaction rollback, including errors and unwinding.
        let _ = self.db.progress_handler(0, None::<fn() -> bool>);
        let _ = self.db.busy_timeout(Duration::from_millis(self.busy_ms));
    }
}

/// Stop queued retention promptly without interrupting unrelated active work.
/// If our job started, observe its rollback/commit before reporting its outcome.
async fn run_bounded<T: Send + 'static>(
    db: &DatabaseWorker,
    bounds: &RetentionBounds,
    operation: impl FnOnce(&Connection) -> Result<T, crate::db::worker::OperationError> + Send + 'static,
) -> Result<T, DatabaseError> {
    bounds.check().map_err(DatabaseError::Operation)?;
    let started = Arc::new(AtomicBool::new(false));
    let job_started = started.clone();
    let job_bounds = bounds.clone();
    let job = db.run(move |db| {
        job_started.store(true, Ordering::Release);
        job_bounds.check()?;
        operation(db)
    });
    tokio::pin!(job);
    tokio::select! {
        result = &mut job => result,
        _ = async {
            tokio::select! {
                _ = bounds.cancel.wait_cancelled() => {},
                _ = bounds.stop.wait_cancelled() => {},
                _ = bounds.abandoned.wait_cancelled() => {},
                _ = tokio::time::sleep_until(bounds.deadline.into()) => {},
            }
        } => {
            if started.load(Ordering::Acquire) {
                job.await
            } else {
                // A racing start must recheck the now-expired/cancelled bounds
                // before obtaining authority or touching SQL.
                Err(DatabaseError::Operation(std::io::Error::new(
                    std::io::ErrorKind::Interrupted,
                    bounds.reason().unwrap_or("stopped"),
                ).into()))
            }
        }
    }
}

pub struct DatabaseRetentionService {
    db: DatabaseWorker,
    pub policy: DatabaseRetentionPolicy,
    running: Arc<Semaphore>,
    stopped: ProcessCancellation,
}
impl DatabaseRetentionService {
    pub fn new(db: DatabaseWorker, policy: DatabaseRetentionPolicy) -> Self {
        Self {
            db,
            policy,
            running: Arc::new(Semaphore::new(1)),
            stopped: ProcessCancellation::default(),
        }
    }
    pub fn stop(&self) {
        self.stopped.cancel();
    }
    pub fn plan(
        &self,
        now: DateTime<Utc>,
        max_batches: Option<usize>,
    ) -> Result<RetentionPlan, String> {
        self.build_plan(now, max_batches, false)
    }
    fn build_plan(
        &self,
        now: DateTime<Utc>,
        max_batches: Option<usize>,
        inspection: bool,
    ) -> Result<RetentionPlan, String> {
        let p = &self.policy;
        let mut cutoffs = BTreeMap::new();
        for (key, days) in [
            ("contextFlow", p.context_flow_days),
            ("toolDetails", p.tool_detail_days),
            ("transientActivities", p.transient_activity_days),
            ("auditPayloads", p.audit_payload_days),
            ("auditRows", p.audit_row_days),
            ("staleSessions", p.stale_session_days),
        ] {
            let cutoff = days
                .map(|days| {
                    now.checked_sub_signed(chrono::Duration::milliseconds(i64::from(days) * DAY))
                        .ok_or("retention cutoff overflow")
                        .map(|date| date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
                })
                .transpose()?;
            cutoffs.insert(key.into(), cutoff);
        }
        let max = max_batches.unwrap_or(p.max_batches_per_run).clamp(1, 1000);
        let size = p.batch_size.clamp(1, 1000);
        let mut steps = vec![];
        let mut add = |candidate: &str,
                       mutation,
                       table: &str,
                       predicate: String,
                       byte_expression: &str,
                       order: &str,
                       cutoff: Option<String>,
                       batch_size,
                       max_batches| {
            steps.push(RetentionStep {
                candidate: candidate.into(),
                mutation,
                table: table.into(),
                predicate,
                byte_expression: byte_expression.into(),
                order: order.into(),
                parameters: cutoff.iter().cloned().collect(),
                cutoff,
                batch_size,
                max_batches,
            });
        };
        use RetentionMutation::*;
        if p.search_index_cleanup_enabled || inspection {
            add(
                "unsearchableFtsRows",
                SearchIndexRowsRemoved,
                "agent_thread_activities_fts f LEFT JOIN agent_thread_activities a ON a.rowid=f.rowid",
                format!("a.rowid IS NULL OR a.kind NOT IN ({SEARCHABLE})"),
                "length(f.body)",
                "f.rowid",
                None,
                size,
                max.saturating_sub(if p.enabled { 10 } else { 0 }).max(1),
            );
        }
        if p.enabled || inspection {
            for (
                candidate,
                mutation,
                table,
                field,
                threshold,
                cutoff_key,
                marker,
                expression,
                order,
            ) in [
                (
                    "ContextFlows",
                    ContextFlowsCompacted,
                    "messages",
                    "context_flow",
                    512000,
                    "contextFlow",
                    "retentionCompacted",
                    "length(context_flow)",
                    "created_at,id",
                ),
                (
                    "ToolCalls",
                    ToolCallsCompacted,
                    "messages",
                    "tool_calls",
                    64000,
                    "toolDetails",
                    "storageCompacted",
                    "length(tool_calls)",
                    "created_at,id",
                ),
            ] {
                add(
                    &format!("oversized{candidate}"),
                    mutation,
                    table,
                    format!("{field} IS NOT NULL AND length({field})>{threshold}"),
                    expression,
                    order,
                    None,
                    1,
                    if candidate == "ContextFlows" { 2 } else { 1 },
                );
                if let Some(cutoff) = cutoffs[cutoff_key].clone() {
                    add(
                        &format!("aged{candidate}"),
                        mutation,
                        table,
                        format!(
                            "{field} IS NOT NULL AND created_at<? AND {field} NOT LIKE '%\"{marker}\":true%'"
                        ),
                        expression,
                        order,
                        Some(cutoff),
                        1,
                        1,
                    );
                }
            }
            let table = "agent_thread_activities a LEFT JOIN agent_threads t ON t.id=a.thread_id";
            let bytes = "COALESCE(length(a.payload),0)+length(a.summary)";
            add("oversizedActivityPayloads", ActivityPayloadsCompacted, table, "(length(a.payload)>512000 OR length(a.summary)>8000) AND COALESCE(t.status,'')!='running'".into(), bytes, "a.created_at,a.id", None, 1, 1);
            if let Some(c) = cutoffs["toolDetails"].clone() {
                add("agedActivityPayloads", ActivityPayloadsCompacted, table, "a.created_at<? AND (length(a.payload)>64000 OR length(a.summary)>8000) AND COALESCE(t.status,'')!='running'".into(), bytes, "a.created_at,a.id", Some(c), 1, 1);
            }
            if let Some(c) = cutoffs["transientActivities"].clone() {
                add(
                    "transientActivities",
                    TransientActivitiesDeleted,
                    table,
                    format!(
                        "a.kind IN ({TRANSIENT}) AND a.created_at<? AND COALESCE(t.status,'')!='running'"
                    ),
                    bytes,
                    "a.created_at,a.id",
                    Some(c),
                    size,
                    1,
                );
            }
            for (candidate, mutation, extra) in [
                (
                    "auditPayloads",
                    AuditPayloadsCleared,
                    " AND (inputs IS NOT NULL OR outputs IS NOT NULL OR side_effects IS NOT NULL)",
                ),
                ("auditRows", AuditRowsDeleted, ""),
            ] {
                if let Some(c) = cutoffs[candidate].clone() {
                    add(
                        candidate,
                        mutation,
                        "audit_log",
                        format!("timestamp<?{extra}"),
                        "COALESCE(length(inputs),0)+COALESCE(length(outputs),0)+COALESCE(length(side_effects),0)",
                        "timestamp,id",
                        Some(c),
                        size,
                        1,
                    );
                }
            }
            if let Some(c) = cutoffs["staleSessions"].clone() {
                add("staleSessions", StaleSessionsArchived, "sessions s LEFT JOIN agent_threads t ON t.session_id=s.id AND t.status='running'", "s.status='active' AND (CASE WHEN s.viewed_at IS NOT NULL AND s.viewed_at>s.last_active_at THEN s.viewed_at ELSE s.last_active_at END)<? AND t.id IS NULL".into(), "0", "s.last_active_at,s.id", Some(c), size, 1);
            }
        }
        Ok(RetentionPlan {
            cutoffs,
            steps,
            max_batches: max,
        })
    }
    pub async fn inspect(&self, now: DateTime<Utc>) -> Result<RetentionReport, DatabaseError> {
        self.inspect_cancellable(now, ProcessCancellation::default())
            .await
    }
    pub async fn inspect_cancellable(
        &self,
        now: DateTime<Utc>,
        cancellation: ProcessCancellation,
    ) -> Result<RetentionReport, DatabaseError> {
        let bounds = RetentionBounds::new(cancellation, self.stopped.clone());
        let _cancel_on_drop = CancelOnDrop(bounds.abandoned.clone());
        let plan = self
            .build_plan(now, None, true)
            .map_err(|s| DatabaseError::Operation(std::io::Error::other(s).into()))?;
        let Ok(permit) = self.running.clone().try_acquire_owned() else {
            let mut report = self.report(&plan, true);
            for candidate in report.candidates.values_mut() {
                candidate.bounded = true;
            }
            report.skipped_reason = Some("already-running".into());
            return Ok(report);
        };
        self.inspect_with_bounds(now, self.db.with_job_guard(Arc::new(permit)), bounds)
            .await
    }
    async fn inspect_with_bounds(
        &self,
        now: DateTime<Utc>,
        db: DatabaseWorker,
        bounds: RetentionBounds,
    ) -> Result<RetentionReport, DatabaseError> {
        let plan = self
            .build_plan(now, None, true)
            .map_err(|s| DatabaseError::Operation(std::io::Error::other(s).into()))?;
        let mut report = self.report(&plan, true);
        // Until a scan finishes, zero is unknown rather than a confirmed count.
        for candidate in report.candidates.values_mut() {
            candidate.bounded = true;
        }
        for step in plan.steps {
            let name = step.candidate.clone();
            let sql_bounds = bounds.clone();
            let result = run_bounded(&db, &bounds, move |db| {
                let _scope = RetentionSqlScope::new(db, &sql_bounds)?;
                let sql = format!("SELECT COUNT(*),COALESCE(SUM(n),0) FROM (SELECT {} AS n FROM {} WHERE {} ORDER BY {} LIMIT 100001)", step.byte_expression, step.table, step.predicate, step.order);
                let (rows, bytes) = db.query_row(&sql, params_from_iter(&step.parameters), |r| Ok((r.get::<_,i64>(0)? as u64, r.get::<_,i64>(1)? as u64)))?;
                sql_bounds.check()?;
                Ok(RetentionCandidate { rows, bytes, bounded: rows == 100001 })
            }).await;
            match result {
                Ok(candidate) => {
                    report.candidates.insert(name, candidate);
                }
                Err(error) => {
                    if let Some(reason) = bounds.reason() {
                        report.skipped_reason = Some(reason.into());
                        break;
                    }
                    return Err(error);
                }
            }
        }
        Ok(report)
    }
    fn report(&self, plan: &RetentionPlan, dry_run: bool) -> RetentionReport {
        use RetentionMutation::*;
        RetentionReport {
            enabled: self.policy.enabled,
            dry_run,
            cutoffs: plan.cutoffs.clone(),
            candidates: [
                "unsearchableFtsRows",
                "oversizedContextFlows",
                "agedContextFlows",
                "oversizedToolCalls",
                "agedToolCalls",
                "oversizedActivityPayloads",
                "agedActivityPayloads",
                "transientActivities",
                "auditPayloads",
                "auditRows",
                "staleSessions",
            ]
            .into_iter()
            .map(|s| {
                (
                    s.into(),
                    RetentionCandidate {
                        bounded: dry_run,
                        ..RetentionCandidate::default()
                    },
                )
            })
            .collect(),
            processed: [
                SearchIndexRowsRemoved,
                ContextFlowsCompacted,
                ToolCallsCompacted,
                ActivityPayloadsCompacted,
                TransientActivitiesDeleted,
                AuditPayloadsCleared,
                AuditRowsDeleted,
                StaleSessionsArchived,
            ]
            .into_iter()
            .map(|m| (m.key().into(), 0))
            .collect(),
            batches: 0,
            busy: false,
            errors: vec![],
            skipped_reason: None,
        }
    }
    pub async fn run_once(
        &self,
        now: DateTime<Utc>,
        dry_run: bool,
        max_batches: Option<usize>,
        authority: Arc<dyn RetentionAuthority>,
        cancellation: ProcessCancellation,
    ) -> Result<RetentionReport, DatabaseError> {
        let bounds = RetentionBounds::new(cancellation.clone(), self.stopped.clone());
        let _cancel_on_drop = CancelOnDrop(bounds.abandoned.clone());
        let plan = self
            .plan(now, max_batches)
            .map_err(|s| DatabaseError::Operation(std::io::Error::other(s).into()))?;
        let mut report = self.report(&plan, dry_run);
        if self.stopped.is_cancelled() || cancellation.is_cancelled() {
            report.skipped_reason = Some("stopped".into());
            return Ok(report);
        }
        if !self.policy.enabled && !self.policy.search_index_cleanup_enabled {
            report.skipped_reason = Some("disabled".into());
            return Ok(report);
        }
        let Ok(permit) = self.running.clone().try_acquire_owned() else {
            report.skipped_reason = Some("already-running".into());
            return Ok(report);
        };
        let db = self.db.with_job_guard(Arc::new(permit));
        if dry_run {
            return self.inspect_with_bounds(now, db, bounds).await;
        }
        'steps: for step in plan.steps {
            for _ in 0..step.max_batches {
                if report.batches >= plan.max_batches {
                    break 'steps;
                }
                if let Some(reason) = bounds.reason() {
                    report.skipped_reason = Some(reason.into());
                    break 'steps;
                }
                let s = step.clone();
                let auth = authority.clone();
                let sql_bounds = bounds.clone();
                let result = run_bounded(&db, &bounds, move |db| {
                    let _lease = auth.authorize(&s).map_err(std::io::Error::other)?;
                    sql_bounds.check()?;
                    // BEGIN DEFERRED takes no lock. Declare the transaction first
                    // so the SQL scope always drops before rollback on any exit.
                    let tx = db.unchecked_transaction()?;
                    let changed = {
                        let _scope = RetentionSqlScope::new(&tx, &sql_bounds)?;
                        let changed = execute_batch(&tx, &s, &sql_bounds)?;
                        sql_bounds.check()?;
                        // Keep COMMIT interruptible while retaining the outer
                        // transaction for rollback after the hook is removed.
                        tx.execute_batch("COMMIT")?;
                        changed
                    };
                    tx.finish()?;
                    Ok(changed)
                })
                .await;
                match result {
                    Ok(0) => break,
                    Ok(n) => {
                        *report
                            .processed
                            .get_mut(step.mutation.key())
                            .expect("mutation") += n;
                        report.batches += 1;
                    }
                    Err(e) => {
                        report.busy = matches!(e, DatabaseError::Busy)
                            || matches!(&e,DatabaseError::Operation(cause) if cause.downcast_ref::<rusqlite::Error>().is_some_and(|e| matches!(e,rusqlite::Error::SqliteFailure(code,_) if matches!(code.code,rusqlite::ErrorCode::DatabaseBusy|rusqlite::ErrorCode::DatabaseLocked))));
                        if let Some(reason) = bounds.reason() {
                            report.skipped_reason = Some(reason.into());
                        } else if !report.busy {
                            report.errors.push(e.to_string());
                        }
                        break 'steps;
                    }
                }
                tokio::task::yield_now().await;
            }
        }
        Ok(report)
    }
    /// Host owns this future and must await it during shutdown. It creates no detached task.
    pub async fn run_scheduled(
        &self,
        authority: Arc<dyn RetentionAuthority>,
        cancel: ProcessCancellation,
        reports: tokio::sync::watch::Sender<Option<RetentionReport>>,
    ) -> Result<(), DatabaseError> {
        let mut delay = self.policy.initial_delay_ms;
        while !self.stopped.is_cancelled()
            && !cancel.is_cancelled()
            && (self.policy.enabled || self.policy.search_index_cleanup_enabled)
        {
            tokio::select! { _ = self.stopped.wait_cancelled() => break, _ = cancel.wait_cancelled() => break, _ = tokio::time::sleep(Duration::from_millis(delay.clamp(1, 86_400_000 * 30))) => {} }
            let report = self
                .run_once(Utc::now(), false, None, authority.clone(), cancel.clone())
                .await?;
            reports.send_replace(Some(report));
            delay = self.policy.interval_ms;
        }
        Ok(())
    }
}
fn execute_batch(
    db: &Connection,
    s: &RetentionStep,
    bounds: &RetentionBounds,
) -> Result<usize, crate::db::worker::OperationError> {
    use RetentionMutation::*;
    let id = match s.mutation {
        SearchIndexRowsRemoved => "f.rowid",
        ActivityPayloadsCompacted | TransientActivitiesDeleted => "a.id",
        StaleSessionsArchived => "s.id",
        _ => "id",
    };
    let detail = match s.mutation {
        ContextFlowsCompacted => {
            ",substr(CAST(context_flow AS BLOB),1,8388609),length(CAST(context_flow AS BLOB))"
        }
        ToolCallsCompacted => {
            ",substr(CAST(tool_calls AS BLOB),1,8388609),length(CAST(tool_calls AS BLOB))"
        }
        ActivityPayloadsCompacted => {
            ",substr(CAST(a.summary AS BLOB),1,32001),substr(CAST(a.payload AS BLOB),1,8388609)"
        }
        _ => "",
    };
    let sql = format!(
        "SELECT {id}{detail} FROM {} WHERE {} ORDER BY {} LIMIT ?",
        s.table, s.predicate, s.order
    );
    let mut parameters: Vec<SqlValue> = s.parameters.iter().cloned().map(SqlValue::Text).collect();
    parameters.push(SqlValue::Integer(s.batch_size as i64));
    // Finish the bounded selection before updating its table (especially FTS5).
    // Blob batches have cardinality one; other rows contain only identifiers.
    struct Selected {
        key: SqlValue,
        bytes: Vec<u8>,
        source_bytes: usize,
        payload: Option<Vec<u8>>,
    }
    let selected = {
        let mut query = db.prepare(&sql)?;
        query
            .query_map(params_from_iter(parameters), |row| {
                let mut selected = Selected {
                    key: row.get(0)?,
                    bytes: vec![],
                    source_bytes: 0,
                    payload: None,
                };
                match s.mutation {
                    ContextFlowsCompacted | ToolCallsCompacted => {
                        selected.bytes = row.get(1)?;
                        selected.source_bytes = row.get::<_, i64>(2)? as usize;
                    }
                    ActivityPayloadsCompacted => {
                        selected.bytes = row.get(1)?;
                        selected.payload = row.get(2)?;
                    }
                    _ => {}
                }
                Ok(selected)
            })?
            .collect::<Result<Vec<_>, _>>()?
    };
    let mut changed = 0;
    for row in selected {
        bounds.check()?;
        let key = row.key;
        match s.mutation {
            SearchIndexRowsRemoved => {
                db.execute(
                    "DELETE FROM agent_thread_activities_fts WHERE rowid=?",
                    [key],
                )?;
            }
            ContextFlowsCompacted | ToolCallsCompacted => {
                let bytes = row.bytes;
                let source_bytes = row.source_bytes;
                // Do not silently replace unparsed tool identities. Oversize tool input is an explicit error.
                if s.mutation == ToolCallsCompacted && source_bytes > PARSE_LIMIT {
                    return Err(std::io::Error::other(
                        "tool_calls exceeds bounded retention parser; skipped",
                    )
                    .into());
                }
                let text = String::from_utf8_lossy(&bytes);
                let compact = if s.mutation == ContextFlowsCompacted {
                    retained_context_flow(&text, source_bytes)
                } else {
                    serialize_persisted_tool_calls(
                        Some(&text),
                        &SerializationOptions {
                            max_bytes: Some(64000.0),
                            force_compact: true,
                            detail_bytes: Some(2000.0),
                            text_bytes: Some(2000.0),
                            mark_compacted: true,
                        },
                    )
                    .unwrap_or_else(|| "[]".into())
                };
                let field = if s.mutation == ContextFlowsCompacted {
                    "context_flow"
                } else {
                    "tool_calls"
                };
                bounds.check()?;
                db.execute(
                    &format!("UPDATE messages SET {field}=? WHERE id=?"),
                    params![compact, key],
                )?;
            }
            ActivityPayloadsCompacted => {
                let summary = row.bytes;
                let payload = row.payload;
                let compact = payload.map(|bytes| {
                    let value = if bytes.len()>PARSE_LIMIT { json!({"__jait_retention_compacted__":true,"reason":"parse limit","preview":String::from_utf8_lossy(&bytes[..64000])}) } else { serde_json::from_slice(&bytes).unwrap_or_else(|_| json!({"__jait_retention_compacted__":true,"reason":"invalid JSON","preview":String::from_utf8_lossy(&bytes)})) };
                    serialize_bounded_json(&value,64000)
                });
                bounds.check()?;
                db.execute(
                    "UPDATE agent_thread_activities SET summary=?,payload=? WHERE id=?",
                    params![
                        limit_utf8(&String::from_utf8_lossy(&summary), 8000, None),
                        compact,
                        key
                    ],
                )?;
            }
            TransientActivitiesDeleted => {
                db.execute("DELETE FROM agent_thread_activities WHERE id=?", [key])?;
            }
            AuditPayloadsCleared => {
                db.execute(
                    "UPDATE audit_log SET inputs=NULL,outputs=NULL,side_effects=NULL WHERE id=?",
                    [key],
                )?;
            }
            AuditRowsDeleted => {
                db.execute("DELETE FROM audit_log WHERE id=?", [key])?;
            }
            StaleSessionsArchived => {
                db.execute(
                    "UPDATE sessions SET status='archived' WHERE id=? AND status='active'",
                    [key],
                )?;
            }
        }
        changed += 1;
    }
    Ok(changed)
}
pub fn retained_context_flow(raw: &str, source_bytes: usize) -> String {
    let mut result = json!({"provider":"unknown","rounds":[],"note":"Detailed context was compacted by Jait retention; message content and memory-provenance metadata remain available.","retentionCompacted":true});
    if source_bytes > PARSE_LIMIT {
        result["truncatedBytes"] = json!(source_bytes);
        return result.to_string();
    }
    let parsed = serde_json::from_str::<Value>(raw).unwrap_or(Value::Null);
    for key in ["provider", "model"] {
        if let Some(s) = parsed[key].as_str() {
            result[key] = json!(limit_utf8(s, 1024, Some("")));
        }
    }
    let source = parsed["rounds"].as_array().cloned().unwrap_or_default();
    let selected = source
        .iter()
        .enumerate()
        .filter(|(i, _)| source.len() <= 100 || *i == 0 || *i >= source.len() - 99);
    let rounds: Vec<_> = selected.enumerate().map(|(index,(_,round))| {
        let mut compact=json!({"round":round["round"].as_number().cloned().map(Value::Number).unwrap_or(json!(index+1)),"messages":[]});
        for key in ["createdAt","model"] { if let Some(s)=round[key].as_str() { compact[key]=json!(limit_utf8(s,1024,Some(""))); } }
        if round["metrics"].is_object() || round["metrics"].is_array() { compact["metrics"]=serde_json::from_str(&serialize_bounded_json(&round["metrics"],4000)).unwrap_or(Value::Null); }
        compact
    }).collect();
    result["rounds"] = json!(rounds);
    let serialized = result.to_string();
    if serialized.len() <= 64000 {
        serialized
    } else {
        result["rounds"] = json!([]);
        result["truncatedRounds"] = json!(source.len());
        result.to_string()
    }
}
#[cfg(test)]
#[path = "database_retention_tests.rs"]
mod tests;
