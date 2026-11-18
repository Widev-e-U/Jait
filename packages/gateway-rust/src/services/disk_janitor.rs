//! Deterministic, bounded cleanup of explicitly supplied managed roots.
//! The host must lease ownership against writers, sandbox users and renames.
//! No root discovery, ambient consent, or automatic cleanup at construction.
use crate::{
    db::worker::DatabaseWorker,
    execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest},
    runtime::blocking::BlockingLane,
    security::{path_guard::PathGuard, worktree_sandbox::worktree_git_mount_args},
    services::{
        database_retention::{env_bool, env_positive},
        disk_space_watchdog::{DiskSample, sample_native},
    },
};
use rusqlite::params;
use serde::Serialize;
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Semaphore;
const DAY: u64 = 86_400_000;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskJanitorPolicy {
    pub enabled: bool,
    pub worktree_grace_ms: u64,
    pub orphan_worktree_grace_ms: u64,
    pub preserve_branches: bool,
    pub temp_scratch_max_age_ms: u64,
    pub sandbox_storage_max_age_ms: u64,
    pub initial_delay_ms: u64,
    pub interval_ms: u64,
}
impl Default for DiskJanitorPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            worktree_grace_ms: 2 * DAY,
            orphan_worktree_grace_ms: DAY,
            preserve_branches: true,
            temp_scratch_max_age_ms: 3 * DAY,
            sandbox_storage_max_age_ms: DAY,
            initial_delay_ms: 120_000,
            interval_ms: 6 * 3_600_000,
        }
    }
}
impl DiskJanitorPolicy {
    pub fn from_env(env: &BTreeMap<String, String>) -> Self {
        let mut p = Self {
            enabled: env_bool(env, "JAIT_DISK_JANITOR_ENABLED", true),
            preserve_branches: env_bool(env, "JAIT_JANITOR_PRESERVE_BRANCHES", true),
            ..Self::default()
        };
        for (key, field) in [
            ("WORKTREE_GRACE", &mut p.worktree_grace_ms),
            ("ORPHAN_WORKTREE_GRACE", &mut p.orphan_worktree_grace_ms),
            ("TEMP_SCRATCH", &mut p.temp_scratch_max_age_ms),
            ("SANDBOX_STORAGE", &mut p.sandbox_storage_max_age_ms),
        ] {
            *field = env_positive(env, &format!("JAIT_JANITOR_{key}_DAYS"), *field / DAY)
                .saturating_mul(DAY);
        }
        p.initial_delay_ms = env_positive(env, "JAIT_JANITOR_INITIAL_DELAY_MS", p.initial_delay_ms);
        p.interval_ms = env_positive(env, "JAIT_JANITOR_INTERVAL_MS", p.interval_ms);
        p
    }
}
#[derive(Clone, Debug)]
pub struct DiskJanitorRoots {
    pub worktrees: PathBuf,
    pub sandbox_storage: PathBuf,
    pub temp: PathBuf,
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    Worktree,
    SandboxStorage,
    TempScratch,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
struct Stamp {
    modified_ms: u64,
    size: u64,
    directory: bool,
    device: u64,
    inode: u64,
}
fn stamp(meta: &fs::Metadata) -> io::Result<Stamp> {
    if meta.file_type().is_symlink() || !(meta.is_file() || meta.is_dir()) {
        return Err(io::Error::other("symlink or special file excluded"));
    }
    let modified_ms = meta
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?
        .as_millis()
        .try_into()
        .map_err(io::Error::other)?;
    #[cfg(unix)]
    let (device, inode) = {
        use std::os::unix::fs::MetadataExt;
        (meta.dev(), meta.ino())
    };
    #[cfg(not(unix))]
    let (device, inode) = (0, 0);
    Ok(Stamp {
        modified_ms,
        size: meta.len(),
        directory: meta.is_dir(),
        device,
        inode,
    })
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReapedEntry {
    pub path: PathBuf,
    pub bytes: u64,
    pub reason: String,
    pub kind: EntryKind,
    pub branch: Option<String>,
    root: PathBuf,
    stamp: Stamp,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskJanitorPlan {
    pub now_ms: u64,
    pub entries: Vec<ReapedEntry>,
    pub errors: Vec<String>,
    pub blocked_foreign_owned: usize,
    pub truncated: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskJanitorReport {
    pub enabled: bool,
    pub dry_run: bool,
    pub worktrees: Vec<ReapedEntry>,
    pub temp_scratch: Vec<ReapedEntry>,
    pub sandbox_storage: Vec<ReapedEntry>,
    pub bytes_reclaimed: u64,
    pub blocked_foreign_owned: usize,
    pub removal_failures: Vec<RemovalFailure>,
    pub errors: Vec<String>,
    pub skipped_reason: Option<String>,
    pub truncated: bool,
}
/// A failed filesystem removal retains its OS error classification for callers.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemovalFailure {
    pub path: PathBuf,
    pub kind: EntryKind,
    pub permission_denied: bool,
    pub raw_os_error: Option<i32>,
    pub message: String,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DiskJanitorWarning {
    pub title: String,
    pub body: String,
}
enum ReapError {
    Other(String),
    Removal(RemovalFailure),
}
impl From<String> for ReapError {
    fn from(value: String) -> Self {
        Self::Other(value)
    }
}
impl From<&str> for ReapError {
    fn from(value: &str) -> Self {
        Self::Other(value.into())
    }
}
fn removal_failure(entry: &ReapedEntry, error: io::Error) -> ReapError {
    ReapError::Removal(RemovalFailure {
        path: entry.path.clone(),
        kind: entry.kind,
        permission_denied: error.kind() == io::ErrorKind::PermissionDenied,
        raw_os_error: error.raw_os_error(),
        message: format!("cleanup incomplete: {error}"),
    })
}
/// The lease is an external host obligation, not a kernel-enforced lock. It must
/// exclude all writers and namespace changes to the entry, its descendants and
/// path ancestors, including replacement of names in their parents, through all
/// effects and cleanup even if the caller drops its future. Recheck expiry here.
/// Do not grant a lease when any actor with such access cannot be excluded.
/// This contract alone does not enable empty-container removal; that operation
/// remains disabled until its parent namespace has enforceable exclusion.
pub trait JanitorAuthority: Send + Sync {
    fn lease_entry(&self, entry: &ReapedEntry) -> Result<Arc<dyn Send + Sync>, String>;
    /// Git can affect metadata outside managed roots; authorize each exact argv/cwd.
    fn authorize_git(
        &self,
        entry: &ReapedEntry,
        request: &ProcessRequest,
    ) -> Result<Arc<dyn Send + Sync>, String>;
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct Thread {
    status: String,
    branch: Option<String>,
    updated_at: String,
}
struct RunCancellation {
    token: ProcessCancellation,
    finished: bool,
}
impl Drop for RunCancellation {
    fn drop(&mut self) {
        if !self.finished {
            self.token.cancel();
        }
    }
}
enum CandidateScan {
    Eligible(u64),
    Recent,
    ForeignOwned,
}
// The task owns both effect leases and the run permit until ProcessPool has killed
// and reaped the direct child. Dropping the caller requests cancellation but does
// not abort the task, so those authorities outlive asynchronous child cleanup.
async fn run_git_supervised(
    pool: ProcessPool,
    request: ProcessRequest,
    cancel: ProcessCancellation,
    stop: ProcessCancellation,
    entry_lease: Arc<dyn Send + Sync>,
    git_lease: Arc<dyn Send + Sync>,
    permit: Arc<tokio::sync::OwnedSemaphorePermit>,
) -> io::Result<crate::execution::process_runner::ProcessResult> {
    let mut guard = RunCancellation {
        token: cancel.clone(),
        finished: false,
    };
    let child_cancel = cancel.clone();
    let task = tokio::spawn(async move {
        let _authority = (entry_lease, git_lease, permit);
        let run = pool.run(request, child_cancel.clone());
        tokio::pin!(run);
        tokio::select! {
            result = &mut run => result,
            _ = stop.wait_cancelled() => {
                child_cancel.cancel();
                run.await
            }
        }
    });
    let result = task.await.map_err(io::Error::other)?;
    guard.finished = true;
    result
}
struct Budget {
    remaining: usize,
    deadline: Instant,
    cancel: ProcessCancellation,
    stop: ProcessCancellation,
}
impl Budget {
    fn new(
        max: usize,
        duration: Duration,
        cancel: ProcessCancellation,
        stop: ProcessCancellation,
    ) -> Self {
        Self {
            remaining: max,
            deadline: Instant::now() + duration,
            cancel,
            stop,
        }
    }
    fn tick(&mut self) -> io::Result<()> {
        if self.cancel.is_cancelled() || self.stop.is_cancelled() {
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "janitor cancelled",
            ));
        }
        if self.remaining == 0 || Instant::now() >= self.deadline {
            return Err(io::Error::other("janitor traversal budget exhausted"));
        }
        self.remaining -= 1;
        Ok(())
    }
}
/// Strict component boundary and canonical native path policy; refuse links in any ancestor.
fn checked_path(root: &Path, path: &Path) -> io::Result<PathBuf> {
    if !root.is_absolute() || !path.is_absolute() || path == root || !path.starts_with(root) {
        return Err(io::Error::other("path outside managed root"));
    }
    PathGuard::new(root, &[], true)?
        .validate_with_symlink_check(
            path.to_str()
                .ok_or_else(|| io::Error::other("non UTF-8 managed path"))?,
        )
        .map_err(io::Error::other)?;
    for ancestor in path.ancestors() {
        if fs::symlink_metadata(ancestor)?.file_type().is_symlink() {
            return Err(io::Error::other("symlink ancestor excluded"));
        }
    }
    let real = fs::canonicalize(path)?;
    let canonical_root = fs::canonicalize(root)?;
    if real != path
        || canonical_root != root
        || real == canonical_root
        || !real.starts_with(&canonical_root)
    {
        return Err(io::Error::other("non canonical managed path"));
    }
    Ok(real)
}
fn entries(root: &Path, budget: &mut Budget) -> io::Result<Vec<PathBuf>> {
    if !root.is_absolute() {
        return Err(io::Error::other("managed root must be absolute"));
    }
    if root.exists() {
        for ancestor in root.ancestors() {
            if fs::symlink_metadata(ancestor)?.file_type().is_symlink() {
                return Err(io::Error::other("managed root has symlink ancestor"));
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        scoped_io::entries(root, budget)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = budget;
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "bounded handle-relative traversal unavailable on this host",
        ))
    }
}
#[cfg(target_os = "linux")]
fn size(path: &Path, budget: &mut Budget, _depth: usize) -> io::Result<u64> {
    scoped_io::size(path, budget)
}
#[cfg(not(target_os = "linux"))]
fn size(_path: &Path, _budget: &mut Budget, _depth: usize) -> io::Result<u64> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "bounded handle-relative traversal unavailable on this host",
    ))
}
fn old(now: u64, then: u64, age: u64) -> bool {
    now.checked_sub(then).is_some_and(|elapsed| elapsed >= age)
}
fn decision(
    thread: Option<&Thread>,
    now: u64,
    mtime: u64,
    p: &DiskJanitorPolicy,
) -> Option<(String, Option<String>)> {
    match thread {
        None if old(now, mtime, p.orphan_worktree_grace_ms) => {
            Some(("orphaned: no owning thread".into(), None))
        }
        Some(t) if matches!(t.status.as_str(), "completed" | "error" | "interrupted") => {
            let updated = chrono::DateTime::parse_from_rfc3339(&t.updated_at)
                .ok()?
                .timestamp_millis();
            if updated < 0 || !old(now, updated as u64, p.worktree_grace_ms) {
                None
            } else {
                Some((format!("thread {}", t.status), t.branch.clone()))
            }
        }
        _ => None,
    }
}
pub struct DiskJanitor {
    db: DatabaseWorker,
    lane: BlockingLane,
    processes: ProcessPool,
    environment: std::collections::HashMap<String, String>,
    pub policy: DiskJanitorPolicy,
    roots: DiskJanitorRoots,
    running: Arc<Semaphore>,
    stopped: ProcessCancellation,
    last_warning: Mutex<Option<(PathBuf, usize, usize)>>,
}
impl DiskJanitor {
    pub fn new(
        db: DatabaseWorker,
        lane: BlockingLane,
        processes: ProcessPool,
        environment: std::collections::HashMap<String, String>,
        policy: DiskJanitorPolicy,
        roots: DiskJanitorRoots,
    ) -> Self {
        Self {
            db,
            lane,
            processes,
            environment,
            policy,
            roots,
            running: Arc::new(Semaphore::new(1)),
            stopped: ProcessCancellation::default(),
            last_warning: Mutex::new(None),
        }
    }
    pub fn stop(&self) {
        self.stopped.cancel();
    }
    /// Stop future runs and wait for an admitted run's retained permit. Blocking
    /// cleanup and the supervised direct Git child retain that permit until they
    /// finish. The host must also stop callers of `plan` and supervise process
    /// descendants; this method does not drain either of those independently.
    pub async fn stop_and_drain(&self) -> Result<(), String> {
        self.stop();
        let _permit = self.running.acquire().await.map_err(|e| e.to_string())?;
        Ok(())
    }
    async fn thread(&self, path: &Path) -> Result<Option<Thread>, String> {
        let text = path.to_str().ok_or("non UTF-8 worktree")?.to_owned();
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or("worktree name missing")?
            .replace('!', "!!")
            .replace('%', "!%")
            .replace('_', "!_");
        self.db.run(move|db|{
            let mut stmt=db.prepare("SELECT status,branch,updated_at FROM agent_threads WHERE working_directory=?1 OR working_directory LIKE ?2 ESCAPE '!' OR working_directory LIKE ?3 ESCAPE '!' ORDER BY updated_at DESC,id LIMIT 101")?;
            let rows=stmt.query_map(params![text,format!("%/{name}"),format!("%\\{name}")],|row|Ok(Thread{status:row.get(0)?,branch:row.get(1)?,updated_at:row.get(2)?}))?.collect::<Result<Vec<_>,_>>()?;
            if rows.len()>100{return Err(io::Error::other("ambiguous worktree ownership exceeds bound").into());}
            // Any active matching owner excludes cleanup, including cross-host name matches.
            if let Some(live)=rows.iter().find(|t|!matches!(t.status.as_str(),"completed"|"error"|"interrupted")){return Ok(Some(live.clone()));}
            Ok(rows.into_iter().next())
        }).await.map_err(|e|e.to_string())
    }
    pub async fn plan(
        &self,
        now_ms: u64,
        cancel: ProcessCancellation,
    ) -> Result<DiskJanitorPlan, String> {
        let roots = self.roots.clone();
        let stop = self.stopped.clone();
        let c = cancel.clone();
        let (raw, mut errors, truncated) = self
            .lane
            .run(move || {
                let mut raw = vec![];
                let mut errors = vec![];
                let mut budget = Budget::new(10_000, Duration::from_secs(5), c, stop);
                let mut truncated = false;
                for (root, kind) in [
                    (&roots.worktrees, EntryKind::Worktree),
                    (&roots.sandbox_storage, EntryKind::SandboxStorage),
                    (&roots.temp, EntryKind::TempScratch),
                ] {
                    let scan = (|| -> io::Result<()> {
                        for outer in entries(root, &mut budget)? {
                            let paths = if kind == EntryKind::Worktree {
                                checked_path(root, &outer)?;
                                if !outer.is_dir() {
                                    continue;
                                }
                                let children = entries(&outer, &mut budget)?;
                                if children.is_empty()
                                    && ![&roots.sandbox_storage, &roots.temp]
                                        .iter()
                                        .any(|other| other.starts_with(&outer))
                                    && container_empty(&outer, &mut budget)?
                                {
                                    if raw.len() >= 1000 {
                                        truncated = true;
                                        return Ok(());
                                    }
                                    let meta = fs::symlink_metadata(&outer)?;
                                    raw.push((root.clone(), outer.clone(), kind, stamp(&meta)?));
                                }
                                children
                            } else {
                                vec![outer]
                            };
                            for path in paths {
                                budget.tick()?;
                                if raw.len() >= 1000 {
                                    truncated = true;
                                    return Ok(());
                                }
                                if kind == EntryKind::TempScratch
                                    && (path == roots.sandbox_storage
                                        || !path.file_name().is_some_and(|n| {
                                            n.to_string_lossy().starts_with("jait-")
                                        }))
                                {
                                    continue;
                                }
                                // Never let a broader root absorb another managed root or its ancestor.
                                if [&roots.worktrees, &roots.sandbox_storage]
                                    .iter()
                                    .any(|other| *other != root && other.starts_with(&path))
                                {
                                    continue;
                                }
                                checked_path(root, &path)?;
                                let meta = fs::symlink_metadata(&path)?;
                                if kind != EntryKind::TempScratch && !meta.is_dir() {
                                    continue;
                                }
                                raw.push((root.clone(), path, kind, stamp(&meta)?));
                            }
                        }
                        Ok(())
                    })();
                    if let Err(e) = scan {
                        errors.push(e.to_string());
                        truncated = true;
                    }
                }
                (raw, errors, truncated)
            })
            .await
            .map_err(|e| e.to_string())?;
        let mut plan = DiskJanitorPlan {
            now_ms,
            entries: vec![],
            errors: vec![],
            blocked_foreign_owned: 0,
            truncated,
        };
        let deadline = Instant::now() + Duration::from_secs(30);
        for (root, path, kind, stamp) in raw {
            if cancel.is_cancelled() || self.stopped.is_cancelled() || Instant::now() >= deadline {
                plan.truncated = true;
                break;
            }
            if plan.entries.len() >= 100 {
                plan.truncated = true;
                break;
            }
            let is_container = kind == EntryKind::Worktree && path.parent() == Some(root.as_path());
            let (reason, branch) = match kind {
                EntryKind::Worktree if is_container => {
                    if !old(
                        now_ms,
                        stamp.modified_ms,
                        self.policy.orphan_worktree_grace_ms,
                    ) {
                        continue;
                    }
                    ("empty worktree container".into(), None)
                }
                EntryKind::Worktree => match self.thread(&path).await {
                    Ok(t) => match decision(t.as_ref(), now_ms, stamp.modified_ms, &self.policy) {
                        Some(d) => d,
                        None => continue,
                    },
                    Err(e) => {
                        errors.push(e);
                        continue;
                    }
                },
                EntryKind::SandboxStorage
                    if old(
                        now_ms,
                        stamp.modified_ms,
                        self.policy.sandbox_storage_max_age_ms,
                    ) =>
                {
                    ("stale sandbox VM disk".into(), None)
                }
                EntryKind::TempScratch
                    if old(
                        now_ms,
                        stamp.modified_ms,
                        self.policy.temp_scratch_max_age_ms,
                    ) =>
                {
                    ("stale temp scratch".into(), None)
                }
                _ => continue,
            };
            let measure = path.clone();
            let scan_root = root.clone();
            let expected = stamp.clone();
            let max_age = match kind {
                EntryKind::TempScratch => Some(self.policy.temp_scratch_max_age_ms),
                EntryKind::SandboxStorage => Some(self.policy.sandbox_storage_max_age_ms),
                EntryKind::Worktree => None,
            };
            let c = cancel.clone();
            let stop = self.stopped.clone();
            let bytes = self
                .lane
                .run(move || {
                    let mut budget = Budget::new(100_000, Duration::from_secs(2), c, stop);
                    if is_container {
                        return if container_empty(&measure, &mut budget)? {
                            Ok(CandidateScan::Eligible(0))
                        } else {
                            Ok(CandidateScan::Recent)
                        };
                    }
                    if let Some(age) = max_age
                        && !old(now_ms, newest_mtime(&measure, &mut budget)?, age)
                    {
                        return Ok(CandidateScan::Recent);
                    }
                    if kind == EntryKind::TempScratch
                        && sticky_foreign_owned(&scan_root, &measure, &expected, &mut budget)?
                    {
                        return Ok(CandidateScan::ForeignOwned);
                    }
                    size(&measure, &mut budget, 0).map(CandidateScan::Eligible)
                })
                .await
                .map_err(|e| e.to_string())?;
            match bytes {
                Ok(CandidateScan::Eligible(bytes)) => plan.entries.push(ReapedEntry {
                    path,
                    bytes,
                    reason,
                    kind,
                    branch,
                    root,
                    stamp,
                }),
                Ok(CandidateScan::ForeignOwned) => plan.blocked_foreign_owned += 1,
                Ok(CandidateScan::Recent) => {}
                Err(e) => {
                    plan.truncated = true;
                    errors.push(e.to_string());
                }
            }
        }
        plan.errors = errors.into_iter().take(100).collect();
        Ok(plan)
    }
    /// Reuse the canonical watchdog sampler; sampling never grants cleanup authority.
    pub async fn disk_sample(&self, path: PathBuf) -> Result<DiskSample, String> {
        self.lane
            .run(move || {
                sample_native(path.to_str().ok_or("non UTF-8 sample path")?).map_err(|e| e.display)
            })
            .await
            .map_err(|e| e.to_string())?
    }
    pub async fn run(
        &self,
        now_ms: u64,
        dry_run: bool,
        authority: Arc<dyn JanitorAuthority>,
        cancel: ProcessCancellation,
    ) -> Result<DiskJanitorReport, String> {
        let mut report = DiskJanitorReport {
            enabled: self.policy.enabled,
            dry_run,
            worktrees: vec![],
            temp_scratch: vec![],
            sandbox_storage: vec![],
            bytes_reclaimed: 0,
            blocked_foreign_owned: 0,
            removal_failures: vec![],
            errors: vec![],
            skipped_reason: None,
            truncated: false,
        };
        if self.stopped.is_cancelled() || cancel.is_cancelled() {
            report.skipped_reason = Some("stopped".into());
            return Ok(report);
        }
        if !self.policy.enabled {
            report.skipped_reason = Some("disabled".into());
            return Ok(report);
        }
        let Ok(permit) = self.running.clone().try_acquire_owned() else {
            report.skipped_reason = Some("already-running".into());
            return Ok(report);
        };
        // `stop_and_drain` may have completed while this call was between its
        // initial stop check and admission. Recheck before any work starts.
        if self.stopped.is_cancelled() || cancel.is_cancelled() {
            report.skipped_reason = Some("stopped".into());
            return Ok(report);
        }
        let guard = Arc::new(permit);
        let mut cancellation_guard = RunCancellation {
            token: cancel.clone(),
            finished: false,
        };
        let plan = self.plan(now_ms, cancel.clone()).await?;
        report.errors = plan.errors;
        report.blocked_foreign_owned = plan.blocked_foreign_owned;
        report.truncated = plan.truncated;
        for entry in plan.entries {
            if cancel.is_cancelled() || self.stopped.is_cancelled() {
                report.skipped_reason = Some("stopped".into());
                break;
            }
            if !dry_run {
                let result = self
                    .reap(
                        &entry,
                        now_ms,
                        authority.clone(),
                        cancel.clone(),
                        guard.clone(),
                    )
                    .await;
                if let Err(e) = result {
                    match e {
                        ReapError::Other(message) => report.errors.push(message),
                        ReapError::Removal(failure) => {
                            report.errors.push(failure.message.clone());
                            report.removal_failures.push(failure);
                        }
                    }
                    continue;
                }
            }
            report.bytes_reclaimed = report.bytes_reclaimed.saturating_add(entry.bytes);
            match entry.kind {
                EntryKind::Worktree => report.worktrees.push(entry),
                EntryKind::SandboxStorage => report.sandbox_storage.push(entry),
                EntryKind::TempScratch => report.temp_scratch.push(entry),
            }
        }
        cancellation_guard.finished = true;
        Ok(report)
    }
    async fn reap(
        &self,
        entry: &ReapedEntry,
        now: u64,
        authority: Arc<dyn JanitorAuthority>,
        cancel: ProcessCancellation,
        guard: Arc<tokio::sync::OwnedSemaphorePermit>,
    ) -> Result<(), ReapError> {
        if cancel.is_cancelled() || self.stopped.is_cancelled() {
            return Err("janitor cancelled".into());
        }
        let lease = authority.lease_entry(entry)?;
        // The external lease MUST exclude a concurrent owner activation until all effects finish.
        let is_container =
            entry.kind == EntryKind::Worktree && entry.path.parent() == Some(entry.root.as_path());
        if is_container {
            let e = entry.clone();
            let stop = self.stopped.clone();
            let age = self.policy.orphan_worktree_grace_ms;
            return self
                .lane
                .run(move || {
                    let _authority = (lease, guard);
                    checked_path(&e.root, &e.path)?;
                    let current = stamp(&fs::symlink_metadata(&e.path)?)?;
                    if current != e.stamp || !old(now, current.modified_ms, age) {
                        return Err(io::Error::other("worktree container changed or is recent"));
                    }
                    let mut budget = Budget::new(100_000, Duration::from_secs(5), cancel, stop);
                    remove_empty_container(&e.path, &e.stamp, &mut budget)
                })
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| removal_failure(entry, e));
        }
        if entry.kind == EntryKind::Worktree {
            let thread = self.thread(&entry.path).await?;
            let (_, current_branch) =
                decision(thread.as_ref(), now, entry.stamp.modified_ms, &self.policy)
                    .ok_or_else(|| "worktree no longer eligible".to_string())?;
            if current_branch != entry.branch {
                return Err("worktree branch changed since plan".into());
            }
        }
        let e = entry.clone();
        let lease2 = lease.clone();
        let guard2 = guard.clone();
        let git_root = self
            .lane
            .run(move || -> io::Result<Option<PathBuf>> {
                let _lease = lease2;
                let _guard = guard2;
                checked_path(&e.root, &e.path)?;
                if stamp(&fs::symlink_metadata(&e.path)?)? != e.stamp {
                    return Err(io::Error::other("cleanup entry changed since plan"));
                }
                if e.kind != EntryKind::Worktree {
                    return Ok(None);
                }
                if fs::symlink_metadata(e.path.join(".git")).is_ok_and(|m| m.len() > 65536) {
                    return Err(io::Error::other("oversized worktree Git marker"));
                }
                let args = worktree_git_mount_args(&e.path)?;
                // The canonical validator rejects colons and checks backlink/common-dir ownership.
                Ok(args
                    .get(1)
                    .and_then(|s| s.split(':').next())
                    .map(PathBuf::from)
                    .and_then(|p| p.parent().map(Path::to_path_buf)))
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        // Remove files under native budgets first, then remove only this worktree's
        // Git registration. The entry lease must prevent recreation during both effects.
        let e = entry.clone();
        let c = cancel.clone();
        let stop = self.stopped.clone();
        let lease2 = lease.clone();
        let guard2 = guard.clone();
        let max_age = match entry.kind {
            EntryKind::TempScratch => Some(self.policy.temp_scratch_max_age_ms),
            EntryKind::SandboxStorage => Some(self.policy.sandbox_storage_max_age_ms),
            EntryKind::Worktree => None,
        };
        self.lane
            .run(move || {
                let _lease = lease2;
                let _guard = guard2;
                checked_path(&e.root, &e.path)?;
                if stamp(&fs::symlink_metadata(&e.path)?)? != e.stamp {
                    return Err(io::Error::other("cleanup entry changed before delete"));
                }
                let mut budget = Budget::new(100_000, Duration::from_secs(5), c, stop);
                if let Some(age) = max_age
                    && !old(now, newest_mtime(&e.path, &mut budget)?, age)
                {
                    return Err(io::Error::other("cleanup tree has recent activity"));
                }
                if e.kind == EntryKind::TempScratch
                    && sticky_foreign_owned(&e.root, &e.path, &e.stamp, &mut budget)?
                {
                    return Err(io::Error::other("sticky-root entry is foreign-owned"));
                }
                Ok(remove_bounded(&e.path, &mut budget, Some(&e.stamp)))
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e: io::Error| e.to_string())?
            .map_err(|e| removal_failure(entry, e))?;
        if let Some(root) = git_root {
            let mut commands = vec![vec![
                "git".into(),
                "worktree".into(),
                "remove".into(),
                "--force".into(),
                "--".into(),
                entry.path.to_string_lossy().into_owned(),
            ]];
            if !self.policy.preserve_branches
                && let Some(branch) = entry.branch.as_ref()
            {
                commands.push(vec![
                    "git".into(),
                    "branch".into(),
                    "-D".into(),
                    "--".into(),
                    branch.clone(),
                ]);
            }
            for argv in commands {
                let mut environment = self.environment.clone();
                environment.insert("GIT_TERMINAL_PROMPT".into(), "0".into());
                let request = ProcessRequest {
                    argv,
                    cwd: root.clone(),
                    environment,
                    input: None,
                    timeout: Duration::from_secs(10),
                    output_limit: 64_000,
                };
                let git_lease = authority
                    .authorize_git(entry, &request)
                    .map_err(|e| format!("disk removed; git authorization denied: {e}"))?;
                if self.stopped.is_cancelled() {
                    return Err("janitor stopped after disk removal; git metadata pending".into());
                }
                let result = run_git_supervised(
                    self.processes.clone(),
                    request,
                    cancel.clone(),
                    self.stopped.clone(),
                    lease.clone(),
                    git_lease,
                    guard.clone(),
                )
                .await
                .map_err(|e| format!("disk removed; git cleanup failed: {e}"))?;
                if result.exit_code != Some(0)
                    || result.cancelled
                    || result.timed_out
                    || result.truncated
                {
                    return Err("disk removed; authorized git metadata cleanup incomplete".into());
                }
            }
        }
        Ok(())
    }
    /// Produce at most one warning per distinct blocked condition. The host decides
    /// whether and where to deliver it; this method has no cleanup authority.
    pub fn warning_for_report(&self, report: &DiskJanitorReport) -> Option<DiskJanitorWarning> {
        if report.dry_run || report.skipped_reason.is_some() {
            return None;
        }
        let failures: Vec<_> = report
            .removal_failures
            .iter()
            .filter(|f| f.kind == EntryKind::TempScratch && f.permission_denied)
            .collect();
        let foreign = report.blocked_foreign_owned;
        if foreign == 0 && failures.is_empty() {
            return None;
        }
        let signature = (self.roots.temp.clone(), foreign, failures.len());
        let mut last = self.last_warning.lock().unwrap_or_else(|e| e.into_inner());
        if last.as_ref() == Some(&signature) {
            return None;
        }
        *last = Some(signature);
        let body = if foreign > 0 {
            format!(
                "{foreign} jait-* entries in {} belong to another user and cannot be removed from the sticky directory. Review ownership and remove eligible entries with appropriate authority.",
                self.roots.temp.display()
            )
        } else {
            format!(
                "{} jait-* entries in {} could not be removed due to permissions. Check ownership and directory permissions at {}.",
                failures.len(),
                self.roots.temp.display(),
                failures[0].path.display()
            )
        };
        Some(DiskJanitorWarning {
            title: "Disk cleanup blocked".into(),
            body,
        })
    }
    async fn wait_for_scheduled_pass(
        cancel: &ProcessCancellation,
        stopped: &ProcessCancellation,
        delay: impl std::future::Future<Output = ()>,
    ) -> bool {
        tokio::select! {
            biased;
            _ = cancel.wait_cancelled() => false,
            _ = stopped.wait_cancelled() => false,
            _ = delay => true,
        }
    }
    pub async fn run_scheduled(
        &self,
        authority: Arc<dyn JanitorAuthority>,
        cancel: ProcessCancellation,
        reports: tokio::sync::watch::Sender<Option<DiskJanitorReport>>,
    ) -> Result<(), String> {
        let mut delay = self.policy.initial_delay_ms;
        while self.policy.enabled && !self.stopped.is_cancelled() && !cancel.is_cancelled() {
            if !Self::wait_for_scheduled_pass(
                &cancel,
                &self.stopped,
                tokio::time::sleep(Duration::from_millis(delay.clamp(1, 30 * DAY))),
            )
            .await
            {
                break;
            }
            // Cancellation can arrive as the timer completes. Avoid admitting a
            // fresh pass when it is already visible at this boundary.
            if cancel.is_cancelled() || self.stopped.is_cancelled() {
                break;
            }
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
                .min(u64::MAX as u128) as u64;
            // A failed pass cancels its own token when the run guard unwinds.
            // Keep that token separate from the scheduler token so a transient
            // admission failure does not permanently stop future passes. The
            // select drops the pass on shutdown, triggering its cancellation guard;
            // no next pass starts until the previous future has completed. A dropped
            // blocking operation may still run: cleanup retains its permit and lease.
            // Hosts must use stop_and_drain and separately supervise read-only plan
            // scans and process descendants; scheduler return is not a drain barrier.
            let pass_cancel = ProcessCancellation::default();
            let pass = self.run(now, false, authority.clone(), pass_cancel);
            let result = tokio::select! {
                biased;
                _ = cancel.wait_cancelled() => break,
                _ = self.stopped.wait_cancelled() => break,
                result = pass => result,
            };
            let report = match result {
                Ok(report) => report,
                Err(error) => DiskJanitorReport {
                    enabled: self.policy.enabled,
                    dry_run: false,
                    worktrees: vec![],
                    temp_scratch: vec![],
                    sandbox_storage: vec![],
                    bytes_reclaimed: 0,
                    blocked_foreign_owned: 0,
                    removal_failures: vec![],
                    errors: vec![format!(
                        "janitor run failed: {}",
                        error.chars().take(1024).collect::<String>()
                    )],
                    skipped_reason: None,
                    truncated: true,
                },
            };
            reports.send_replace(Some(report));
            delay = self.policy.interval_ms;
        }
        Ok(())
    }
}
/// Linux fd-relative traversal never follows a substituted symlink. Every
/// ancestor is opened with O_NOFOLLOW, including ancestors of the managed root.
#[cfg(target_os = "linux")]
mod scoped_io {
    use super::*;
    use std::{
        ffi::CString,
        os::{
            fd::{AsRawFd, FromRawFd, OwnedFd},
            unix::ffi::OsStrExt,
        },
    };
    fn cstr(name: &std::ffi::OsStr) -> io::Result<CString> {
        CString::new(name.as_bytes()).map_err(io::Error::other)
    }
    fn open(parent: i32, name: &CString) -> io::Result<OwnedFd> {
        // SAFETY: NUL terminated name; owned fd constructed only on success.
        let fd = unsafe {
            libc::openat(
                parent,
                name.as_ptr(),
                libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_DIRECTORY,
            )
        };
        if fd < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(unsafe { OwnedFd::from_raw_fd(fd) })
        }
    }
    fn directory(path: &Path) -> io::Result<OwnedFd> {
        if !path.is_absolute() {
            return Err(io::Error::other("managed path must be absolute"));
        }
        let mut fd = open(libc::AT_FDCWD, &CString::new("/").expect("literal"))?;
        for component in path.components() {
            match component {
                std::path::Component::RootDir => {}
                std::path::Component::Normal(name) => fd = open(fd.as_raw_fd(), &cstr(name)?)?,
                _ => return Err(io::Error::other("non canonical managed path")),
            }
        }
        Ok(fd)
    }
    fn metadata(parent: i32, name: &CString) -> io::Result<libc::stat> {
        let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
        // SAFETY: valid output storage and NUL terminated component name.
        if unsafe {
            libc::fstatat(
                parent,
                name.as_ptr(),
                stat.as_mut_ptr(),
                libc::AT_SYMLINK_NOFOLLOW,
            )
        } != 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(unsafe { stat.assume_init() })
    }
    fn stable_open(parent: i32, name: &CString, expected: &libc::stat) -> io::Result<OwnedFd> {
        // Refuse nested mounts (including same-device bind mounts), symlinks and
        // escapes. ENOSYS fails closed on kernels without openat2 (Linux < 5.6).
        #[repr(C)]
        struct OpenHow {
            flags: u64,
            mode: u64,
            resolve: u64,
        }
        let how = OpenHow {
            flags: (libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW) as u64,
            mode: 0,
            resolve: 0x01 | 0x04 | 0x08,
        };
        // SAFETY: the kernel reads the initialized OpenHow and owned CString.
        let raw = unsafe {
            libc::syscall(
                libc::SYS_openat2,
                parent,
                name.as_ptr(),
                &how,
                std::mem::size_of::<OpenHow>(),
            )
        };
        if raw < 0 {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: a successful syscall returns a new owned file descriptor.
        let fd = unsafe { OwnedFd::from_raw_fd(raw as i32) };
        let mut actual = std::mem::MaybeUninit::<libc::stat>::uninit();
        // SAFETY: fd remains owned; fstat initializes storage only on success.
        if unsafe { libc::fstat(fd.as_raw_fd(), actual.as_mut_ptr()) } != 0 {
            return Err(io::Error::last_os_error());
        }
        let actual = unsafe { actual.assume_init() };
        if actual.st_dev != expected.st_dev || actual.st_ino != expected.st_ino {
            return Err(io::Error::other(
                "managed directory changed during traversal",
            ));
        }
        Ok(fd)
    }
    pub(super) fn entries(root: &Path, budget: &mut Budget) -> io::Result<Vec<PathBuf>> {
        let fd = match directory(root) {
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(vec![]),
            result => result?,
        };
        let mut paths = vec![];
        for entry in child_names(&fd)? {
            budget.tick()?;
            let entry = entry?;
            let kind = entry.file_type()?;
            if kind.is_dir() || kind.is_file() {
                paths.push(root.join(entry.file_name()));
            }
        }
        paths.sort();
        Ok(paths)
    }
    fn child_names(fd: &OwnedFd) -> io::Result<fs::ReadDir> {
        fs::read_dir(format!("/proc/self/fd/{}", fd.as_raw_fd()))
    }
    fn measure(parent: i32, name: &CString, budget: &mut Budget, depth: usize) -> io::Result<u64> {
        budget.tick()?;
        if depth > 64 {
            return Err(io::Error::other("janitor depth limit"));
        }
        let stat = metadata(parent, name)?;
        match stat.st_mode & libc::S_IFMT {
            libc::S_IFREG => Ok(stat.st_size.max(0) as u64),
            libc::S_IFDIR => {
                let fd = stable_open(parent, name, &stat)?;
                let mut total = 0u64;
                for entry in child_names(&fd)? {
                    let entry = entry?;
                    total = total.saturating_add(measure(
                        fd.as_raw_fd(),
                        &cstr(&entry.file_name())?,
                        budget,
                        depth + 1,
                    )?);
                }
                Ok(total)
            }
            _ => Ok(0),
        }
    }
    fn remove(parent: i32, name: &CString, budget: &mut Budget, depth: usize) -> io::Result<()> {
        budget.tick()?;
        if depth > 64 {
            return Err(io::Error::other("cleanup depth limit"));
        }
        let stat = metadata(parent, name)?;
        let directory = stat.st_mode & libc::S_IFMT == libc::S_IFDIR;
        if directory {
            let fd = stable_open(parent, name, &stat)?;
            for entry in child_names(&fd)? {
                let entry = entry?;
                remove(
                    fd.as_raw_fd(),
                    &cstr(&entry.file_name())?,
                    budget,
                    depth + 1,
                )?;
            }
        }
        budget.tick()?;
        let current = metadata(parent, name)?;
        if current.st_dev != stat.st_dev || current.st_ino != stat.st_ino {
            return Err(io::Error::other("cleanup entry changed during traversal"));
        }
        // SAFETY: parent directory is owned by the caller; never follow symlinks.
        if unsafe {
            libc::unlinkat(
                parent,
                name.as_ptr(),
                if directory { libc::AT_REMOVEDIR } else { 0 },
            )
        } != 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
    fn parent(path: &Path) -> io::Result<(OwnedFd, CString)> {
        Ok((
            directory(
                path.parent()
                    .ok_or_else(|| io::Error::other("missing parent"))?,
            )?,
            cstr(
                path.file_name()
                    .ok_or_else(|| io::Error::other("missing cleanup name"))?,
            )?,
        ))
    }
    fn newest(parent: i32, name: &CString, budget: &mut Budget, depth: usize) -> io::Result<u64> {
        budget.tick()?;
        if depth > 64 {
            return Err(io::Error::other("janitor depth limit"));
        }
        let stat = metadata(parent, name)?;
        let seconds = u64::try_from(stat.st_mtime).map_err(io::Error::other)?;
        let nanos = u64::try_from(stat.st_mtime_nsec).map_err(io::Error::other)?;
        if nanos >= 1_000_000_000 {
            return Err(io::Error::other("invalid modification time"));
        }
        let mut latest = seconds
            .checked_mul(1000)
            .and_then(|v| v.checked_add(nanos / 1_000_000))
            .ok_or_else(|| io::Error::other("modification time overflow"))?;
        if stat.st_mode & libc::S_IFMT == libc::S_IFDIR {
            let fd = stable_open(parent, name, &stat)?;
            for entry in child_names(&fd)? {
                let entry = entry?;
                latest = latest.max(newest(
                    fd.as_raw_fd(),
                    &cstr(&entry.file_name())?,
                    budget,
                    depth + 1,
                )?);
            }
        }
        Ok(latest)
    }
    pub(super) fn sticky_foreign_owned(
        root: &Path,
        path: &Path,
        expected: &Stamp,
        budget: &mut Budget,
    ) -> io::Result<bool> {
        // Match process.getuid(), which reports the real user ID.
        sticky_foreign_owned_as(root, path, expected, budget, unsafe { libc::getuid() })
    }
    pub(super) fn sticky_foreign_owned_as(
        root: &Path,
        path: &Path,
        expected: &Stamp,
        budget: &mut Budget,
        uid: libc::uid_t,
    ) -> io::Result<bool> {
        budget.tick()?;
        if path.parent() != Some(root) {
            return Err(io::Error::other(
                "scratch entry is not a direct child of its root",
            ));
        }
        let fd = directory(root)?;
        let mut root_stat = std::mem::MaybeUninit::<libc::stat>::uninit();
        // SAFETY: the descriptor remains owned and fstat initializes the result.
        if unsafe { libc::fstat(fd.as_raw_fd(), root_stat.as_mut_ptr()) } != 0 {
            return Err(io::Error::last_os_error());
        }
        let root_stat = unsafe { root_stat.assume_init() };
        let name = cstr(
            path.file_name()
                .ok_or_else(|| io::Error::other("missing scratch name"))?,
        )?;
        let child = metadata(fd.as_raw_fd(), &name)?;
        if child.st_dev != expected.device || child.st_ino != expected.inode {
            return Err(io::Error::other("scratch identity changed"));
        }
        Ok(sticky_owner_blocked(root_stat.st_mode, child.st_uid, uid))
    }
    pub(super) fn newest_mtime(path: &Path, budget: &mut Budget) -> io::Result<u64> {
        let (fd, name) = parent(path)?;
        newest(fd.as_raw_fd(), &name, budget, 0)
    }
    pub(super) fn container_empty(path: &Path, budget: &mut Budget) -> io::Result<bool> {
        budget.tick()?;
        let (parent, name) = parent(path)?;
        let stat = metadata(parent.as_raw_fd(), &name)?;
        let fd = stable_open(parent.as_raw_fd(), &name, &stat)?;
        match child_names(&fd)?.next() {
            Some(entry) => {
                entry?;
                Ok(false)
            }
            None => Ok(true),
        }
    }
    pub(super) fn remove_empty_container(
        _path: &Path,
        _expected: &Stamp,
        budget: &mut Budget,
    ) -> io::Result<()> {
        budget.tick()?;
        // unlinkat(AT_REMOVEDIR) resolves a name, not the open directory. An
        // inode check cannot prevent a replacement between that check and unlink.
        // A host lease is only a promise and does not enforce parent exclusion.
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "empty worktree container removal requires enforceable parent namespace exclusion",
        ))
    }
    pub(super) fn size(path: &Path, budget: &mut Budget) -> io::Result<u64> {
        let (fd, name) = parent(path)?;
        measure(fd.as_raw_fd(), &name, budget, 0)
    }
    pub(super) fn remove_bounded(
        path: &Path,
        budget: &mut Budget,
        expected: Option<&Stamp>,
    ) -> io::Result<()> {
        let (fd, name) = parent(path)?;
        if let Some(expected) = expected {
            let current = metadata(fd.as_raw_fd(), &name)?;
            if current.st_dev != expected.device || current.st_ino != expected.inode {
                return Err(io::Error::other("planned cleanup identity changed"));
            }
        }
        remove(fd.as_raw_fd(), &name, budget, 0)
    }
}
#[cfg(target_os = "linux")]
use scoped_io::{
    container_empty, newest_mtime, remove_bounded, remove_empty_container, sticky_foreign_owned,
};
#[cfg(target_os = "linux")]
fn sticky_owner_blocked(mode: libc::mode_t, owner: libc::uid_t, user: libc::uid_t) -> bool {
    mode & libc::S_ISVTX != 0 && owner != user
}
#[cfg(not(target_os = "linux"))]
fn container_empty(_: &Path, _: &mut Budget) -> io::Result<bool> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "bounded handle-relative cleanup unavailable on this host",
    ))
}
#[cfg(not(target_os = "linux"))]
fn remove_empty_container(_: &Path, _: &Stamp, _: &mut Budget) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "bounded handle-relative cleanup unavailable on this host",
    ))
}
#[cfg(not(target_os = "linux"))]
fn sticky_foreign_owned(_: &Path, _: &Path, _: &Stamp, _: &mut Budget) -> io::Result<bool> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "bounded handle-relative cleanup unavailable on this host",
    ))
}
#[cfg(not(target_os = "linux"))]
fn newest_mtime(_: &Path, _: &mut Budget) -> io::Result<u64> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "bounded handle-relative cleanup unavailable on this host",
    ))
}
#[cfg(not(target_os = "linux"))]
fn remove_bounded(_: &Path, _: &mut Budget, _: Option<&Stamp>) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "bounded handle-relative cleanup unavailable on this host",
    ))
}
#[cfg(test)]
#[path = "disk_janitor_tests.rs"]
mod tests;

#[cfg(test)]
mod schedule_retry_tests {
    use super::*;
    use std::{collections::HashMap, num::NonZeroU16};

    struct Deny;
    impl JanitorAuthority for Deny {
        fn lease_entry(&self, _: &ReapedEntry) -> Result<Arc<dyn Send + Sync>, String> {
            panic!("closed lane must not reach cleanup")
        }
        fn authorize_git(
            &self,
            _: &ReapedEntry,
            _: &ProcessRequest,
        ) -> Result<Arc<dyn Send + Sync>, String> {
            panic!("closed lane must not reach Git")
        }
    }

    #[tokio::test]
    async fn cancellation_wins_when_delay_is_also_ready() {
        let cancel = ProcessCancellation::default();
        let stopped = ProcessCancellation::default();
        assert!(
            DiskJanitor::wait_for_scheduled_pass(&cancel, &stopped, std::future::ready(())).await
        );
        cancel.cancel();
        assert!(
            !DiskJanitor::wait_for_scheduled_pass(&cancel, &stopped, std::future::ready(())).await
        );
        let cancel = ProcessCancellation::default();
        stopped.cancel();
        assert!(
            !DiskJanitor::wait_for_scheduled_pass(&cancel, &stopped, std::future::ready(())).await
        );
    }

    #[tokio::test]
    async fn cancelled_scheduler_does_not_admit_a_pass() {
        let db = DatabaseWorker::new(
            rusqlite::Connection::open_in_memory().unwrap(),
            NonZeroU16::new(1).unwrap(),
        )
        .unwrap();
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        lane.close();
        let service = DiskJanitor::new(
            db.clone(),
            lane,
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            HashMap::new(),
            DiskJanitorPolicy {
                initial_delay_ms: 1,
                ..DiskJanitorPolicy::default()
            },
            DiskJanitorRoots {
                worktrees: "/unused/worktrees".into(),
                sandbox_storage: "/unused/sandbox".into(),
                temp: "/unused/temp".into(),
            },
        );
        let cancel = ProcessCancellation::default();
        cancel.cancel();
        let (tx, rx) = tokio::sync::watch::channel(None);
        service
            .run_scheduled(Arc::new(Deny), cancel, tx)
            .await
            .unwrap();
        assert!(rx.borrow().is_none());
        db.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn scheduler_reports_failed_passes_and_stops_on_cancellation() {
        let db = DatabaseWorker::new(
            rusqlite::Connection::open_in_memory().unwrap(),
            NonZeroU16::new(1).unwrap(),
        )
        .unwrap();
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        lane.close();
        let service = Arc::new(DiskJanitor::new(
            db.clone(),
            lane,
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            HashMap::new(),
            DiskJanitorPolicy {
                initial_delay_ms: 1,
                interval_ms: 30,
                ..DiskJanitorPolicy::default()
            },
            DiskJanitorRoots {
                worktrees: "/unused/worktrees".into(),
                sandbox_storage: "/unused/sandbox".into(),
                temp: "/unused/temp".into(),
            },
        ));
        let cancel = ProcessCancellation::default();
        let (tx, mut rx) = tokio::sync::watch::channel(None);
        let worker = {
            let service = service.clone();
            let cancel = cancel.clone();
            tokio::spawn(async move { service.run_scheduled(Arc::new(Deny), cancel, tx).await })
        };
        for _ in 0..2 {
            tokio::time::timeout(Duration::from_secs(2), rx.changed())
                .await
                .unwrap()
                .unwrap();
            let report = rx.borrow_and_update();
            let report = report.as_ref().unwrap();
            assert!(report.truncated);
            assert!(report.errors[0].contains("blocking lane is closed"));
            assert_eq!(report.bytes_reclaimed, 0);
        }
        cancel.cancel();
        tokio::time::timeout(Duration::from_secs(2), worker)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        db.shutdown().await.unwrap();
    }
}
