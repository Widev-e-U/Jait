//! Durable scheduler with explicit SQLite, execution and preflight boundaries.
//! Database work never spans an external tool await. Construction starts no jobs.
use super::cron::is_valid_cron_expression;
use crate::{
    db::worker::{DatabaseError, DatabaseWorker, OperationError},
    services::{calendar::truthy, storage::json_text, subscription_usage_fetchers::js_date_parse},
    text::js_trim,
    time::{Clock, default_clock, iso},
};
use futures_util::future::{BoxFuture, join_all};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
    time::Duration,
};

pub const MINUTE_MS: i64 = 60_000;
pub const ONE_SHOT_RETENTION_MS: i64 = 86_400_000;
pub const PURGE_INTERVAL_MS: i64 = 3_600_000;
type Result<T> = std::result::Result<T, OperationError>;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledJobRecord {
    pub id: String,
    pub user_id: Option<String>,
    pub name: String,
    pub cron: String,
    pub tool_name: String,
    pub input: Value,
    pub session_id: String,
    pub project_root: String,
    pub enabled: bool,
    pub last_run_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateJob {
    pub user_id: Option<String>,
    pub name: String,
    pub cron: String,
    pub tool_name: String,
    pub input: Option<Value>,
    pub session_id: Option<String>,
    pub project_root: Option<String>,
    pub enabled: Option<bool>,
}

pub fn normalize_tool_name(name: &str) -> String {
    let name = js_trim(name);
    if name.contains('.') {
        name.into()
    } else {
        name.replacen('_', ".", 1)
    }
}
pub fn is_one_shot_job(input: &Value) -> bool {
    input["__jaitJobMeta"]["once"] == Value::Bool(true)
}
pub fn scheduled_time_zone(input: &Value) -> Option<&str> {
    input["__jaitJobMeta"]["timeZone"].as_str()
}
/// Object rest/spread is only used on object-like inputs in the source.
pub fn normalize_scheduled_execution(job: &ScheduledJobRecord) -> Value {
    let tool = normalize_tool_name(&job.tool_name);
    let input = &job.input;
    let meta = &input["__jaitJobMeta"];
    let is_agent = matches!(
        meta["jobType"].as_str(),
        Some("agent_task" | "agent_thread_job")
    );
    let mut execution = json!({"toolName":tool,"input":input,"sessionId":job.session_id,
        "projectRoot":job.project_root,"userId":job.user_id});
    if !is_agent {
        return execution;
    }
    let mut stripped = input.as_object().cloned().unwrap_or_default();
    stripped.remove("title");
    if tool == "thread.control" {
        let root = stripped
            .get("workingDirectory")
            .and_then(Value::as_str)
            .unwrap_or(&job.project_root)
            .to_owned();
        for (key, value) in [
            ("action", json!("create")),
            ("kind", json!("delivery")),
            ("workingDirectory", json!(root)),
            ("start", json!(true)),
            ("detach", json!(true)),
        ] {
            stripped.insert(key.into(), value);
        }
        execution["input"] = Value::Object(stripped);
    } else if tool != "agent.spawn" {
        execution["input"] = Value::Object(stripped);
    } else {
        execution["toolName"] = json!("thread.control");
        let mut request = json!({"action":"create","kind":"delivery","workingDirectory":job.project_root,
            "start":true,"detach":true,"prompt":input["prompt"].as_str().unwrap_or("")});
        for (from, to) in [("model", "model"), ("provider", "providerId")] {
            if let Some(value) = meta[from].as_str() {
                request[to] = json!(value)
            }
        }
        execution["input"] = request;
    }
    execution
}

pub struct SchedulerRepository<'a> {
    pub db: &'a Connection,
    pub now_ms: i64,
    pub project_root: &'a str,
}
impl SchedulerRepository<'_> {
    fn now(&self) -> Result<String> {
        Ok(iso(self.now_ms)?)
    }
    fn map(&self, row: &rusqlite::Row<'_>) -> rusqlite::Result<ScheduledJobRecord> {
        let input: Option<String> = row.get("input")?;
        let parsed = input
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_else(|| json!({}));
        Ok(ScheduledJobRecord {
            id: row.get("id")?,
            user_id: row.get("user_id")?,
            name: row.get("name")?,
            cron: row.get("cron")?,
            tool_name: normalize_tool_name(&row.get::<_, String>("tool_name")?),
            input: parsed,
            session_id: row
                .get::<_, Option<String>>("session_id")?
                .unwrap_or("default".into()),
            project_root: row
                .get::<_, Option<String>>("project_root")?
                .unwrap_or_else(|| self.project_root.into()),
            enabled: row.get::<_, i64>("enabled")? == 1,
            last_run_at: row.get("last_run_at")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
    pub fn list(&self, user: Option<&str>) -> Result<Vec<ScheduledJobRecord>> {
        let mut q = self
            .db
            .prepare("SELECT * FROM scheduled_jobs ORDER BY updated_at DESC")?;
        let rows = q
            .query_map([], |row| self.map(row))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows
            .into_iter()
            .filter(|job| {
                user.filter(|s| !s.is_empty())
                    .is_none_or(|u| job.user_id.as_deref().is_none_or(|owner| owner == u))
            })
            .collect())
    }
    pub fn get(&self, id: &str, user: Option<&str>) -> Result<Option<ScheduledJobRecord>> {
        let job = self
            .db
            .query_row("SELECT * FROM scheduled_jobs WHERE id=?", [id], |row| {
                self.map(row)
            })
            .optional()?;
        Ok(job.filter(|job| {
            user.filter(|s| !s.is_empty())
                .is_none_or(|u| job.user_id.as_deref().is_none_or(|owner| owner == u))
        }))
    }
    pub fn create(&self, request: CreateJob) -> Result<ScheduledJobRecord> {
        if !is_valid_cron_expression(&request.cron) {
            return Err("Invalid cron expression".into());
        }
        let now = self.now()?;
        let id = crate::db::identifiers::uuidv7().to_string();
        let input = request
            .input
            .filter(|v| !v.is_null())
            .unwrap_or_else(|| json!({}));
        self.db.execute("INSERT INTO scheduled_jobs(id,user_id,name,cron,tool_name,input,session_id,project_root,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            params![id,request.user_id,request.name,request.cron,normalize_tool_name(&request.tool_name),json_text(&input),request.session_id.unwrap_or("default".into()),request.project_root.unwrap_or_else(||self.project_root.into()),i64::from(request.enabled!=Some(false)),now,now])?;
        self.get(&id, None)?
            .ok_or_else(|| "created job disappeared".into())
    }
    pub fn remove(&self, id: &str, user: Option<&str>) -> Result<bool> {
        if self.get(id, user)?.is_none() {
            return Ok(false);
        }
        self.db
            .execute("DELETE FROM scheduled_jobs WHERE id=?", [id])?;
        Ok(true)
    }
    pub fn update(
        &self,
        id: &str,
        patch: &Value,
        user: Option<&str>,
    ) -> Result<Option<ScheduledJobRecord>> {
        let Some(existing) = self.get(id, user)? else {
            return Ok(None);
        };
        if let Some(cron) = patch.get("cron") {
            let Some(cron) = cron.as_str() else {
                return Err("Invalid cron expression".into());
            };
            if !is_valid_cron_expression(cron) {
                return Err("Invalid cron expression".into());
            }
        }
        let name = patch["name"].as_str().unwrap_or(&existing.name);
        let cron = patch["cron"].as_str().unwrap_or(&existing.cron);
        let tool = patch["toolName"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(normalize_tool_name)
            .unwrap_or(existing.tool_name);
        let enabled = patch.get("enabled").map(truthy).unwrap_or(existing.enabled);
        let input = patch.get("input").unwrap_or(&existing.input);
        self.db.execute("UPDATE scheduled_jobs SET name=?,cron=?,tool_name=?,enabled=?,input=?,updated_at=? WHERE id=?",
            params![name,cron,tool,i64::from(enabled),json_text(input),self.now()?,id])?;
        self.get(id, user)
    }
    pub fn list_runs(&self, job_id: &str) -> Result<Vec<Value>> {
        let mut q = self
            .db
            .prepare("SELECT * FROM scheduled_job_runs WHERE job_id=? ORDER BY started_at DESC")?;
        Ok(q.query_map([job_id],|r|Ok(json!({
            "id":r.get::<_,String>("id")?,"jobId":r.get::<_,String>("job_id")?,"status":r.get::<_,String>("status")?,
            "triggeredBy":r.get::<_,String>("triggered_by")?,"output":r.get::<_,Option<String>>("output")?,
            "error":r.get::<_,Option<String>>("error")?,"planId":r.get::<_,Option<String>>("plan_id")?,
            "startedAt":r.get::<_,String>("started_at")?,"completedAt":r.get::<_,Option<String>>("completed_at")?
        })))?.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    fn forget(&self, id: &str) -> Result<()> {
        self.db
            .execute("DELETE FROM scheduled_job_runs WHERE job_id=?", [id])?;
        self.db
            .execute("DELETE FROM scheduled_jobs WHERE id=?", [id])?;
        Ok(())
    }
    pub fn purge_spent_one_shots(&self, now_ms: i64, retention_ms: f64) -> Result<usize> {
        let cutoff = now_ms as f64 - retention_ms;
        let spent = self
            .list(None)?
            .into_iter()
            .filter(|job| {
                !job.enabled
                    && is_one_shot_job(&job.input)
                    && job
                        .last_run_at
                        .as_deref()
                        .and_then(js_date_parse)
                        .is_some_and(|ms| (ms as f64) <= cutoff)
            })
            .collect::<Vec<_>>();
        for job in &spent {
            self.forget(&job.id)?
        }
        Ok(spent.len())
    }
    fn begin(&self, id: &str, user: Option<&str>, run_ms: i64, trigger: &str) -> Result<Run> {
        let job = self
            .get(id, user)?
            .ok_or_else(|| format!("Job not found: {id}"))?;
        let action_id = crate::db::identifiers::uuidv7().to_string();
        let started = iso(run_ms)?;
        self.db.execute("INSERT INTO scheduled_job_runs(id,job_id,status,triggered_by,started_at) VALUES(?,?,'running',?,?)",
            params![action_id,id,trigger,started])?;
        Ok(Run {
            job,
            action_id,
            started,
            scheduled: trigger == "schedule",
        })
    }
    fn finish(&self, run: &Run, result: &std::result::Result<Value, String>) -> Result<()> {
        let now = self.now()?;
        let succeeded = result.as_ref().is_ok_and(|r| truthy(&r["ok"]));
        let (output, error) = match result {
            Ok(result) if succeeded => {
                let data = result
                    .get("data")
                    .filter(|v| !v.is_null())
                    .or_else(|| result.get("message"));
                (
                    data.map(|v| {
                        v.as_str()
                            .map(str::to_owned)
                            .unwrap_or_else(|| json_text(v))
                    }),
                    None,
                )
            }
            Ok(result) => (None, result["message"].as_str().map(str::to_owned)),
            Err(error) => (None, Some(error.clone())),
        };
        self.db.execute(
            "UPDATE scheduled_job_runs SET status=?,output=?,error=?,completed_at=? WHERE id=?",
            params![
                if succeeded { "completed" } else { "failed" },
                output,
                error,
                now,
                run.action_id
            ],
        )?;
        let one_shot = run.scheduled && is_one_shot_job(&run.job.input);
        if one_shot && succeeded {
            self.forget(&run.job.id)?
        } else {
            if one_shot {
                self.db.execute(
                    "UPDATE scheduled_jobs SET last_run_at=?,updated_at=?,enabled=0 WHERE id=?",
                    params![run.started, now, run.job.id],
                )?;
            } else {
                self.db.execute(
                    "UPDATE scheduled_jobs SET last_run_at=?,updated_at=? WHERE id=?",
                    params![run.started, now, run.job.id],
                )?;
            }
        }
        Ok(())
    }
}
struct Run {
    job: ScheduledJobRecord,
    action_id: String,
    started: String,
    scheduled: bool,
}
pub type ExecuteTool =
    Arc<dyn Fn(Value) -> BoxFuture<'static, std::result::Result<Value, String>> + Send + Sync>;
pub type BeforeTick =
    Arc<dyn Fn() -> BoxFuture<'static, std::result::Result<(), String>> + Send + Sync>;
pub type OnExecuted = Arc<dyn Fn(&Value) -> std::result::Result<(), String> + Send + Sync>;
pub type Log = Arc<dyn Fn(&str) + Send + Sync>;
pub struct SchedulerOptions {
    pub db: DatabaseWorker,
    pub project_root: String,
    pub execute_tool: ExecuteTool,
    pub clock: Clock,
    pub before_tick: Option<BeforeTick>,
    pub on_executed: Option<OnExecuted>,
    pub log: Log,
}
impl SchedulerOptions {
    pub fn new(db: DatabaseWorker, project_root: String, execute_tool: ExecuteTool) -> Self {
        Self {
            db,
            project_root,
            execute_tool,
            clock: default_clock(),
            before_tick: None,
            on_executed: None,
            log: Arc::new(|message| eprintln!("{message}")),
        }
    }
}
struct Inner {
    options: SchedulerOptions,
    running: Mutex<HashSet<String>>,
    last_purge: AtomicI64,
    timer: Mutex<Option<tokio::task::AbortHandle>>,
}
#[derive(Clone)]
pub struct SchedulerService {
    inner: Arc<Inner>,
}
struct RunningGuard {
    inner: Arc<Inner>,
    id: String,
}
impl Drop for RunningGuard {
    fn drop(&mut self) {
        if let Ok(mut running) = self.inner.running.lock() {
            running.remove(&self.id);
        }
    }
}
fn database_message(error: DatabaseError) -> String {
    match error {
        DatabaseError::Operation(cause) => cause.to_string(),
        other => other.to_string(),
    }
}
impl SchedulerService {
    pub fn new(options: SchedulerOptions) -> Self {
        Self {
            inner: Arc::new(Inner {
                options,
                running: Mutex::new(HashSet::new()),
                last_purge: AtomicI64::new(0),
                timer: Mutex::new(None),
            }),
        }
    }
    pub async fn with_repository<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&SchedulerRepository<'_>) -> Result<T> + Send + 'static,
    ) -> std::result::Result<T, String> {
        let now_ms = (self.inner.options.clock)();
        let root = self.inner.options.project_root.clone();
        self.inner
            .options
            .db
            .run(move |db| {
                operation(&SchedulerRepository {
                    db,
                    now_ms,
                    project_root: &root,
                })
            })
            .await
            .map_err(database_message)
    }
    pub async fn create(
        &self,
        request: CreateJob,
    ) -> std::result::Result<ScheduledJobRecord, String> {
        self.with_repository(move |r| r.create(request)).await
    }
    pub async fn list(
        &self,
        user: Option<String>,
    ) -> std::result::Result<Vec<ScheduledJobRecord>, String> {
        self.with_repository(move |r| r.list(user.as_deref())).await
    }
    pub async fn get(
        &self,
        id: String,
        user: Option<String>,
    ) -> std::result::Result<Option<ScheduledJobRecord>, String> {
        self.with_repository(move |r| r.get(&id, user.as_deref()))
            .await
    }
    pub async fn update(
        &self,
        id: String,
        patch: Value,
        user: Option<String>,
    ) -> std::result::Result<Option<ScheduledJobRecord>, String> {
        self.with_repository(move |r| r.update(&id, &patch, user.as_deref()))
            .await
    }
    pub async fn remove(
        &self,
        id: String,
        user: Option<String>,
    ) -> std::result::Result<bool, String> {
        self.with_repository(move |r| r.remove(&id, user.as_deref()))
            .await
    }
    pub async fn list_runs(&self, id: String) -> std::result::Result<Vec<Value>, String> {
        self.with_repository(move |r| r.list_runs(&id)).await
    }
    pub async fn purge_spent_one_shots(
        &self,
        now_ms: i64,
        retention_ms: f64,
    ) -> std::result::Result<usize, String> {
        self.with_repository(move |r| r.purge_spent_one_shots(now_ms, retention_ms))
            .await
    }
    pub async fn trigger(
        &self,
        id: String,
        user: Option<String>,
        run_ms: i64,
        trigger: String,
    ) -> std::result::Result<Value, String> {
        let run = self
            .with_repository(move |r| r.begin(&id, user.as_deref(), run_ms, &trigger))
            .await?;
        let result =
            (self.inner.options.execute_tool)(normalize_scheduled_execution(&run.job)).await;
        let payload =
            json!({"jobId":run.job.id,"actionId":run.action_id,"result":result.as_ref().ok()});
        self.with_repository(move |r| {
            r.finish(&run, &result)?;
            Ok(result)
        })
        .await??;
        if let Some(on_executed) = &self.inner.options.on_executed {
            on_executed(&payload)?;
        }
        Ok(payload)
    }
    /// Idempotent interval startup. Like setInterval, a slow tick does not block a later tick.
    pub fn start(&self, poll_ms: Option<u64>) {
        let mut timer = self.inner.timer.lock().expect("scheduler timer");
        if timer.is_some() {
            return;
        }
        let period = Duration::from_millis(poll_ms.unwrap_or(MINUTE_MS as u64).max(1));
        let service = self.clone();
        let deadline = tokio::time::Instant::now() + period;
        let task = tokio::spawn(async move {
            let mut interval = tokio::time::interval_at(deadline, period);
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                interval.tick().await;
                let service = service.clone();
                let now_ms = (service.inner.options.clock)();
                tokio::spawn(async move {
                    if let Err(error) = service.tick(now_ms).await {
                        (service.inner.options.log)(&format!(
                            "Scheduler preflight failed: {error}"
                        ));
                    }
                });
            }
        });
        *timer = Some(task.abort_handle());
    }
    /// Stops future polls; already-started executions finish and persist their result.
    pub fn stop(&self) {
        if let Some(timer) = self.inner.timer.lock().expect("scheduler timer").take() {
            timer.abort();
        }
    }
    pub async fn tick(&self, now_ms: i64) -> std::result::Result<(), String> {
        if let Some(before) = &self.inner.options.before_tick {
            before().await?;
        }
        let jobs = self.list(None).await?;
        let mut selected = vec![];
        {
            let mut running = self
                .inner
                .running
                .lock()
                .map_err(|_| "scheduler state unavailable")?;
            for job in jobs {
                if job.enabled
                    && !running.contains(&job.id)
                    && super::minute::matches_cron_minute(
                        &job.cron,
                        Some(now_ms),
                        scheduled_time_zone(&job.input),
                    )
                    && !job
                        .last_run_at
                        .as_deref()
                        .and_then(js_date_parse)
                        .is_some_and(|v| v.div_euclid(MINUTE_MS) == now_ms.div_euclid(MINUTE_MS))
                {
                    running.insert(job.id.clone());
                    selected.push(job.id);
                }
            }
        }
        let executions = selected
            .into_iter()
            .map(|id| {
                let service = self.clone();
                let guard = RunningGuard {
                    inner: self.inner.clone(),
                    id: id.clone(),
                };
                async move {
                    let _guard = guard;
                    if let Err(error) = service
                        .trigger(id.clone(), None, now_ms, "schedule".into())
                        .await
                    {
                        (service.inner.options.log)(&format!("Scheduled job failed: {id} {error}"));
                    }
                }
            })
            .collect::<Vec<_>>();
        let housekeeping = async {
            let previous = self.inner.last_purge.load(Ordering::SeqCst);
            if now_ms.saturating_sub(previous) < PURGE_INTERVAL_MS {
                return;
            }
            if self
                .inner
                .last_purge
                .compare_exchange(previous, now_ms, Ordering::SeqCst, Ordering::SeqCst)
                .is_err()
            {
                return;
            }
            match self
                .purge_spent_one_shots(now_ms, ONE_SHOT_RETENTION_MS as f64)
                .await
            {
                Ok(removed) if removed > 0 => (self.inner.options.log)(&format!(
                    "Scheduler: cleaned up {removed} spent one-off job(s)"
                )),
                Err(error) => {
                    (self.inner.options.log)(&format!("Scheduler cleanup failed: {error}"))
                }
                _ => {}
            }
        };
        tokio::join!(join_all(executions), housekeeping);
        Ok(())
    }
}
impl crate::tools::cron::CronScheduler for SchedulerRepository<'_> {
    fn call(&self, operation: &str, args: Vec<Value>) -> std::result::Result<Value, String> {
        let user = |i: usize| args.get(i).and_then(Value::as_str);
        let id = || args.first().and_then(Value::as_str).unwrap_or("");
        let result: Result<Value> = (|| {
            Ok(match operation {
                "create" => json!(self.create(serde_json::from_value(args[0].clone())?)?),
                "list" => json!(self.list(user(0))?),
                "remove" => json!(self.remove(id(), user(1))?),
                "update" => json!(self.update(id(), &args[1], user(2))?),
                _ => return Err("unknown scheduler operation".into()),
            })
        })();
        result.map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{num::NonZeroU16, path::Path, sync::atomic::AtomicUsize};
    #[tokio::test]
    async fn stopping_polls_keeps_inflight_execution_and_its_persisted_result() {
        let connection = crate::db::open_database(Path::new(":memory:")).unwrap();
        crate::db::migrate_database(&connection).unwrap();
        let worker = DatabaseWorker::new(connection, NonZeroU16::new(32).unwrap()).unwrap();
        let entered = Arc::new(tokio::sync::Semaphore::new(0));
        let release = Arc::new(tokio::sync::Semaphore::new(0));
        let finished = Arc::new(tokio::sync::Semaphore::new(0));
        let captured_entered = entered.clone();
        let captured_release = release.clone();
        let mut options = SchedulerOptions::new(
            worker.clone(),
            "/fixture".into(),
            Arc::new(move |_| {
                captured_entered.add_permits(1);
                let release = captured_release.clone();
                Box::pin(async move {
                    release.acquire().await.unwrap().forget();
                    Ok(json!({"ok":true,"message":"delivered"}))
                })
            }),
        );
        options.clock = Arc::new(|| 60_000);
        options.log = Arc::new(|_| {});
        let captured_finished = finished.clone();
        options.on_executed = Some(Arc::new(move |_| {
            captured_finished.add_permits(1);
            Ok(())
        }));
        let service = SchedulerService::new(options);
        let job = service
            .create(CreateJob {
                user_id: Some("alice".into()),
                name: "owned fixture".into(),
                cron: "* * * * *".into(),
                tool_name: "fixture.execute".into(),
                input: None,
                session_id: None,
                project_root: None,
                enabled: None,
            })
            .await
            .unwrap();
        service.start(Some(1));
        tokio::time::timeout(Duration::from_secs(2), entered.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        service.stop();
        let running = service.list_runs(job.id.clone()).await.unwrap();
        assert_eq!(running.len(), 1);
        assert_eq!(running[0]["status"], "running");
        release.add_permits(1);
        tokio::time::timeout(Duration::from_secs(2), finished.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        let runs = service.list_runs(job.id.clone()).await.unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0]["status"], "completed");
        assert_eq!(runs[0]["output"], "delivered");
        assert_eq!(
            service
                .get(job.id, Some("alice".into()))
                .await
                .unwrap()
                .unwrap()
                .last_run_at
                .as_deref(),
            Some("1970-01-01T00:01:00.000Z")
        );
        assert_eq!(entered.available_permits(), 0);
        worker.shutdown().await.unwrap();
    }

    #[tokio::test(start_paused = true)]
    async fn interval_start_is_idempotent_and_stop_prevents_future_polls() {
        let connection = crate::db::open_database(Path::new(":memory:")).unwrap();
        crate::db::migrate_database(&connection).unwrap();
        let worker = DatabaseWorker::new(connection, NonZeroU16::new(32).unwrap()).unwrap();
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        let mut options = SchedulerOptions::new(
            worker.clone(),
            "/fixture".into(),
            Arc::new(|_| Box::pin(async { panic!("empty scheduler must not execute") })),
        );
        options.clock = Arc::new(|| 0);
        options.log = Arc::new(|_| {});
        options.before_tick = Some(Arc::new(move || {
            captured.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Ok(()) })
        }));
        let service = SchedulerService::new(options);
        service.start(Some(10));
        service.start(Some(1));
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_millis(9)).await;
        tokio::task::yield_now().await;
        assert_eq!(count.load(Ordering::SeqCst), 0);
        tokio::time::advance(Duration::from_millis(1)).await;
        tokio::task::yield_now().await;
        assert_eq!(count.load(Ordering::SeqCst), 1);
        service.stop();
        service.stop();
        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert_eq!(count.load(Ordering::SeqCst), 1);
        service.start(Some(7));
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_millis(6)).await;
        tokio::task::yield_now().await;
        assert_eq!(count.load(Ordering::SeqCst), 1);
        tokio::time::advance(Duration::from_millis(1)).await;
        tokio::task::yield_now().await;
        assert_eq!(count.load(Ordering::SeqCst), 2);
        service.stop();
        worker.shutdown().await.unwrap();
    }
}
