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
    sync::Arc,
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
    pub errors: Vec<String>,
    pub skipped_reason: Option<String>,
    pub truncated: bool,
}
/// The lease must exclude all owning-thread/sandbox/scratch writers and renames
/// through completion, including if the caller drops its future. Recheck expiry here.
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
        }
    }
    pub fn stop(&self) {
        self.stopped.cancel();
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
                                entries(&outer, &mut budget)?
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
            let (reason, branch) = match kind {
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
            let c = cancel.clone();
            let stop = self.stopped.clone();
            let bytes = self
                .lane
                .run(move || {
                    size(
                        &measure,
                        &mut Budget::new(100_000, Duration::from_secs(2), c, stop),
                        0,
                    )
                })
                .await
                .map_err(|e| e.to_string())?;
            match bytes {
                Ok(bytes) => plan.entries.push(ReapedEntry {
                    path,
                    bytes,
                    reason,
                    kind,
                    branch,
                    root,
                    stamp,
                }),
                Err(e) => errors.push(e.to_string()),
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
        let guard = Arc::new(permit);
        let mut cancellation_guard = RunCancellation {
            token: cancel.clone(),
            finished: false,
        };
        let plan = self.plan(now_ms, cancel.clone()).await?;
        report.errors = plan.errors;
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
                    report.errors.push(e);
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
    ) -> Result<(), String> {
        if cancel.is_cancelled() || self.stopped.is_cancelled() {
            return Err("janitor cancelled".into());
        }
        let lease = authority.lease_entry(entry)?;
        // The external lease MUST exclude a concurrent owner activation until all effects finish.
        if entry.kind == EntryKind::Worktree {
            let thread = self.thread(&entry.path).await?;
            if decision(thread.as_ref(), now, entry.stamp.modified_ms, &self.policy).is_none() {
                return Err("worktree no longer eligible".into());
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
        self.lane
            .run(move || {
                let _lease = lease2;
                let _guard = guard2;
                checked_path(&e.root, &e.path)?;
                if stamp(&fs::symlink_metadata(&e.path)?)? != e.stamp {
                    return Err(io::Error::other("cleanup entry changed before delete"));
                }
                remove_bounded(
                    &e.path,
                    &mut Budget::new(100_000, Duration::from_secs(5), c, stop),
                    Some(&e.stamp),
                )
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("cleanup incomplete: {e}"))?;
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
                let _git_lease = authority
                    .authorize_git(entry, &request)
                    .map_err(|e| format!("disk removed; git authorization denied: {e}"))?;
                if self.stopped.is_cancelled() {
                    return Err("janitor stopped after disk removal; git metadata pending".into());
                }
                let result = self
                    .processes
                    .run(request, cancel.clone())
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
    pub async fn run_scheduled(
        &self,
        authority: Arc<dyn JanitorAuthority>,
        cancel: ProcessCancellation,
        reports: tokio::sync::watch::Sender<Option<DiskJanitorReport>>,
    ) -> Result<(), String> {
        let mut delay = self.policy.initial_delay_ms;
        while self.policy.enabled && !self.stopped.is_cancelled() && !cancel.is_cancelled() {
            tokio::select! {_=cancel.wait_cancelled()=>break,_=self.stopped.wait_cancelled()=>break,_=tokio::time::sleep(Duration::from_millis(delay.clamp(1,30*DAY)))=>{}}
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
                .min(u64::MAX as u128) as u64;
            let report = self
                .run(now, false, authority.clone(), cancel.clone())
                .await?;
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
use scoped_io::remove_bounded;
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
