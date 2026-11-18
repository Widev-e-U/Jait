//! Owned bounded project watching. Linux uses inotify; other Unix platforms use
//! bounded snapshot reconciliation. Windows fails closed until rooted I/O exists.
//! No detached subscriptions, unbounded callback queues, HTTP or subprocesses.
use super::project_search::{
    self, Budgets, Cancellation, Error, IndexCoverage, IndexEntry, IndexOptions, ProjectIndex,
    ProjectRoot, Result,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, AtomicU8, Ordering},
        mpsc::{self, Receiver, SyncSender, TryRecvError, TrySendError},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub const DEFAULT_IGNORE: &[&str] = &[
    "**/.git/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/.nuxt/**",
    "**/build/**",
    "**/.cache/**",
    "**/.parcel-cache/**",
    "**/__pycache__/**",
    "**/.jait/**",
    "**/target/**",
    "**/.turbo/**",
    "**/.nx/**",
    "**/.angular/**",
    "**/.svelte-kit/**",
    "**/.gradle/**",
    "**/.terraform/**",
    "**/.venv/**",
    "**/coverage/**",
    "**/.pytest_cache/**",
    "**/.mypy_cache/**",
    "**/.ruff_cache/**",
    "**/.bun/**",
    "**/.cargo/**",
    "**/.rustup/**",
    "**/.npm/**",
    "**/.yarn/**",
    "**/.pnpm-store/**",
    "**/.gradle-docker/**",
    "**/.android/**",
    "**/site-packages/**",
    "**/.DS_Store",
    "**/Thumbs.db",
    "**/*.swp",
    "**/*.swo",
    "**/*~",
];
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileChangeType {
    Created,
    Updated,
    Deleted,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct FileChangeEvent {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: FileChangeType,
}
/// Preserve filesystem case and first-seen order, matching the reference coalescer.
pub fn coalesce_events(events: impl IntoIterator<Item = FileChangeEvent>) -> Vec<FileChangeEvent> {
    let mut positions = HashMap::<String, usize>::new();
    let mut output: Vec<Option<FileChangeEvent>> = Vec::new();
    for event in events {
        if let Some(&position) = positions.get(&event.path) {
            let prior = output[position].as_mut().expect("live coalescer position");
            match (prior.kind, event.kind) {
                (FileChangeType::Created, FileChangeType::Deleted) => {
                    positions.remove(&event.path);
                    output[position] = None;
                }
                (FileChangeType::Deleted, FileChangeType::Created) => {
                    prior.kind = FileChangeType::Updated
                }
                (FileChangeType::Created, FileChangeType::Updated) => {}
                _ => prior.kind = event.kind,
            }
        } else {
            positions.insert(event.path.clone(), output.len());
            output.push(Some(event));
        }
    }
    output.into_iter().flatten().collect()
}
#[derive(Clone, Debug)]
pub struct ProjectWatcherOptions {
    pub ignore: Vec<String>,
    pub coalesce: Duration,
    pub reconcile_interval: Duration,
    /// Explicit renewable lease: callers must reauthorize after expiry.
    pub lifetime: Duration,
    pub max_batch_size: usize,
    pub max_batch_bytes: usize,
    pub channel_capacity: usize,
    pub allow_generated_root: bool,
    /// These caps apply to every reconciliation, not the lifetime of a watcher.
    pub budgets: Budgets,
}
impl Default for ProjectWatcherOptions {
    fn default() -> Self {
        Self {
            ignore: DEFAULT_IGNORE.iter().map(|s| (*s).into()).collect(),
            coalesce: Duration::from_millis(150),
            reconcile_interval: Duration::from_secs(2),
            lifetime: Duration::from_secs(3600),
            max_batch_size: 500,
            max_batch_bytes: 256 * 1024,
            channel_capacity: 8,
            allow_generated_root: false,
            budgets: Budgets::default(),
        }
    }
}
impl ProjectWatcherOptions {
    fn validate(&self) -> Result<()> {
        self.budgets.validate()?;
        if self.ignore.len() > 128
            || self.max_batch_size == 0
            || self.max_batch_size > 500
            || self.max_batch_bytes < 128
            || self.max_batch_bytes > 1024 * 1024
            || self.channel_capacity == 0
            || self.channel_capacity > 16
            || self.coalesce.is_zero()
            || self.coalesce > Duration::from_secs(2)
            || self.reconcile_interval < Duration::from_millis(100)
            || self.reconcile_interval > Duration::from_secs(60)
            || self.lifetime.is_zero()
            || self.lifetime > Duration::from_secs(24 * 3600)
        {
            return Err(Error::Input("invalid watcher bounds".into()));
        }
        for pattern in &self.ignore {
            project_search::ignore::glob(pattern, false, false)?;
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchBatch {
    pub changes: Vec<FileChangeEvent>,
    pub rescan_required: bool,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WatchState {
    Starting,
    Watching,
    Stopped,
    Failed,
}
struct Shared {
    state: AtomicU8,
    lost: AtomicBool,
    error: Mutex<Option<String>>,
    wake: (Mutex<bool>, Condvar),
}
#[derive(Clone)]
pub struct WatcherSupervisor {
    permits: Arc<Semaphore>,
}
impl WatcherSupervisor {
    /// Instantiate once per runtime, never once per request. Admission is rejected
    /// before thread creation and retained until the worker has actually exited.
    pub fn new(max_watchers: usize) -> Result<Self> {
        if !(1..=32).contains(&max_watchers) {
            return Err(Error::Input("watcher capacity must be 1..32".into()));
        }
        Ok(Self {
            permits: Arc::new(Semaphore::new(max_watchers)),
        })
    }
    pub fn watch(
        &self,
        root: ProjectRoot,
        options: ProjectWatcherOptions,
        cancel: Cancellation,
    ) -> Result<Option<ProjectWatcher>> {
        options.validate()?;
        if !options.allow_generated_root
            && root.path().components().any(|c| c.as_os_str() == ".jait")
        {
            return Ok(None);
        }
        let permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| Error::Input("project watcher capacity exhausted".into()))?;
        let (sender, receiver) = mpsc::sync_channel(options.channel_capacity);
        let shared = Arc::new(Shared {
            state: AtomicU8::new(0),
            lost: AtomicBool::new(false),
            error: Mutex::new(None),
            wake: (Mutex::new(false), Condvar::new()),
        });
        let child_shared = shared.clone();
        let child_cancel = cancel.clone();
        let path = root.path().to_owned();
        let thread = thread::Builder::new()
            .name("jait-project-watch".into())
            .spawn(move || {
                let _permit: OwnedSemaphorePermit = permit;
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    run(root, options, child_cancel.clone(), sender, &child_shared)
                }));
                match result {
                    Ok(Ok(())) | Ok(Err(Error::Cancelled)) => {
                        child_shared.state.store(2, Ordering::Release)
                    }
                    other => {
                        let message = match other {
                            Ok(Err(error)) => error.to_string(),
                            _ => "project watcher worker panicked".into(),
                        };
                        if let Ok(mut error) = child_shared.error.lock() {
                            *error = Some(message);
                        }
                        child_shared.lost.store(true, Ordering::Release);
                        child_shared.state.store(3, Ordering::Release);
                    }
                }
            })?;
        Ok(Some(ProjectWatcher {
            root: path,
            thread: Some(thread),
            shared,
            cancel,
            receiver,
        }))
    }
    pub fn close(&self) {
        self.permits.close();
    }
}
/// One owner consumes this receiver and owns shutdown. A replacement starts only
/// after `stop` joins the old worker. Dropping the receiver cannot leave a worker.
pub struct ProjectWatcher {
    root: std::path::PathBuf,
    thread: Option<JoinHandle<()>>,
    shared: Arc<Shared>,
    cancel: Cancellation,
    receiver: Receiver<WatchBatch>,
}
impl ProjectWatcher {
    pub fn root(&self) -> &std::path::Path {
        &self.root
    }
    pub fn state(&self) -> WatchState {
        match self.shared.state.load(Ordering::Acquire) {
            0 => WatchState::Starting,
            1 => WatchState::Watching,
            2 => WatchState::Stopped,
            _ => WatchState::Failed,
        }
    }
    pub fn watching(&self) -> bool {
        self.state() == WatchState::Watching
    }
    pub fn error(&self) -> Option<String> {
        self.shared
            .error
            .lock()
            .ok()
            .and_then(|error| error.clone())
    }
    pub fn try_recv(&self) -> std::result::Result<WatchBatch, TryRecvError> {
        match self.receiver.try_recv() {
            Ok(mut batch) => {
                batch.rescan_required |= self.shared.lost.swap(false, Ordering::AcqRel);
                Ok(batch)
            }
            Err(_) if self.shared.lost.swap(false, Ordering::AcqRel) => Ok(WatchBatch {
                changes: vec![],
                rescan_required: true,
            }),
            Err(error) => Err(error),
        }
    }
    /// Cancels independently of a full changes queue; flushes pending events best
    /// effort, joins and releases kernel watches before returning. Call on a
    /// blocking lane when stopping from async code. Filesystem syscalls themselves
    /// are not forcibly interruptible (notably on hung remote mounts).
    pub fn stop(&mut self) {
        self.cancel.cancel();
        if let Ok(mut stop) = self.shared.wake.0.lock() {
            *stop = true;
            self.shared.wake.1.notify_all();
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
impl Drop for ProjectWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

struct Emitter<'a> {
    sender: SyncSender<WatchBatch>,
    shared: &'a Shared,
    pending: Vec<FileChangeEvent>,
    bytes: usize,
    since: Option<Instant>,
    max_events: usize,
    max_bytes: usize,
}
impl<'a> Emitter<'a> {
    fn push(&mut self, event: FileChangeEvent) -> Result<()> {
        let bytes = serde_json::to_vec(&event)
            .map_err(|_| Error::Input("watch event serialization failed".into()))?
            .len()
            .saturating_add(64);
        if bytes > self.max_bytes {
            self.shared.lost.store(true, Ordering::Release);
            return Ok(());
        }
        if self.pending.len() >= self.max_events || self.bytes + bytes > self.max_bytes {
            self.flush()?;
        }
        self.bytes += bytes;
        self.since.get_or_insert_with(Instant::now);
        self.pending.push(event);
        if self.pending.len() >= self.max_events {
            self.flush()?;
        }
        Ok(())
    }
    fn flush(&mut self) -> Result<()> {
        if self.pending.is_empty() {
            return Ok(());
        }
        let batch = WatchBatch {
            changes: coalesce_events(std::mem::take(&mut self.pending)),
            rescan_required: false,
        };
        self.bytes = 0;
        self.since = None;
        match self.sender.try_send(batch) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(_)) => {
                self.shared.lost.store(true, Ordering::Release);
                Ok(())
            }
            Err(TrySendError::Disconnected(_)) => Err(Error::Cancelled),
        }
    }
}
fn diff(
    previous: &ProjectIndex,
    next: &ProjectIndex,
    emit: &mut Emitter<'_>,
    cancel: &Cancellation,
) -> Result<()> {
    for (path, entry) in &next.entries {
        if cancel.is_cancelled() {
            return Err(Error::Cancelled);
        }
        let kind = match previous.entries.get(path) {
            None => Some(FileChangeType::Created),
            Some(old) if old != entry => Some(FileChangeType::Updated),
            _ => None,
        };
        if let Some(kind) = kind {
            emit.push(FileChangeEvent {
                path: path.clone(),
                kind,
            })?;
        }
    }
    if next.coverage.limited || next.coverage.unreadable > 0 {
        emit.shared.lost.store(true, Ordering::Release);
    } else {
        for path in previous
            .entries
            .keys()
            .filter(|path| !next.entries.contains_key(*path))
        {
            if cancel.is_cancelled() {
                return Err(Error::Cancelled);
            }
            emit.push(FileChangeEvent {
                path: path.clone(),
                kind: FileChangeType::Deleted,
            })?;
        }
    }
    Ok(())
}
/// Advance the snapshot when delivering a native event, so periodic recovery
/// cannot deliver that same change again. Keep deleted children until the next
/// scan: directory deletion may have no separate native child notifications.
fn acknowledge_native_event(
    index: &mut ProjectIndex,
    event: &FileChangeEvent,
    budgets: &Budgets,
) -> Result<bool> {
    if event.kind == FileChangeType::Deleted {
        if let Some(old) = index.entries.remove(&event.path) {
            index.coverage.path_bytes -= event.path.len();
            if old.directory {
                index.coverage.directories = index.coverage.directories.saturating_sub(1);
            } else {
                index.coverage.files -= 1;
            }
        }
        return Ok(true);
    }
    let metadata = match index.root.metadata(&event.path) {
        Ok(metadata) if metadata.is_file() || metadata.is_dir() => metadata,
        _ => return Ok(false),
    };
    let entry = IndexEntry::from_metadata(&metadata);
    let old = index.entries.get(&event.path);
    let files = index.coverage.files + usize::from(!entry.directory)
        - usize::from(old.is_some_and(|e| !e.directory));
    let directories = index.coverage.directories + usize::from(entry.directory)
        - usize::from(old.is_some_and(|e| e.directory));
    let path_bytes = index.coverage.path_bytes + if old.is_none() { event.path.len() } else { 0 };
    if files > budgets.max_files
        || directories > budgets.max_directories
        || index.entries.len() + usize::from(old.is_none()) > budgets.max_entries
        || path_bytes > budgets.max_path_bytes
    {
        return Err(Error::Input(
            "watch root exceeds snapshot budget; narrow the root".into(),
        ));
    }
    index.coverage.files = files;
    index.coverage.directories = directories;
    index.coverage.path_bytes = path_bytes;
    index.entries.insert(event.path.clone(), entry);
    Ok(true)
}
fn run(
    root: ProjectRoot,
    options: ProjectWatcherOptions,
    cancel: Cancellation,
    sender: SyncSender<WatchBatch>,
    shared: &Shared,
) -> Result<()> {
    let index_options = IndexOptions {
        include_ignored_files: true,
        exclude: options.ignore.clone(),
        budgets: options.budgets.clone(),
    };
    let exclusions = options
        .ignore
        .iter()
        .map(|p| project_search::ignore::glob(p, false, false))
        .collect::<Result<Vec<_>>>()?;
    let deadline = Instant::now() + options.lifetime;
    let snapshot = || -> Result<ProjectIndex> {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(Error::TimedOut);
        }
        let mut bounded = index_options.clone();
        bounded.budgets.duration = bounded.budgets.duration.min(remaining);
        project_search::build_index(&root, &bounded, &cancel)
    };
    let watch_operation = project_search::Operation::new(options.lifetime, &cancel);
    let mut native = Native::new(&root)?;
    let mut previous = snapshot()?;
    require_complete(&previous.coverage)?;
    native.synchronize(&root, &previous, &watch_operation)?;
    let mut emit = Emitter {
        sender,
        shared,
        pending: vec![],
        bytes: 0,
        since: None,
        max_events: options.max_batch_size,
        max_bytes: options.max_batch_bytes,
    };
    // Close the initial subscribe/scan window with another bounded snapshot.
    let initial = snapshot()?;
    require_complete(&initial.coverage)?;
    diff(&previous, &initial, &mut emit, &cancel)?;
    native.synchronize(&root, &initial, &watch_operation)?;
    previous = initial;
    shared.state.store(1, Ordering::Release);
    let mut reconciled = Instant::now();
    loop {
        if Instant::now() >= deadline {
            emit.flush()?;
            return Err(Error::TimedOut);
        }
        if cancel.is_cancelled() {
            emit.flush()?;
            return Ok(());
        }
        let (events, lost, structural) = match native.read(&root, &watch_operation) {
            Ok(events) => events,
            Err(error @ (Error::Cancelled | Error::TimedOut)) => {
                emit.flush()?;
                return Err(error);
            }
            Err(error) => return Err(error),
        };
        if lost {
            shared.lost.store(true, Ordering::Release);
        }
        for event in events {
            if cancel.is_cancelled() {
                emit.flush()?;
                return Ok(());
            }
            if project_search::ignore::hard_excluded(&event.path)
                || root.validate(&event.path).is_err()
                || exclusions
                    .iter()
                    .any(|re| re.is_match(&event.path) || re.is_match(&format!("{}/", event.path)))
            {
                continue;
            }
            if acknowledge_native_event(&mut previous, &event, &options.budgets)? {
                emit.push(event)?;
            }
        }
        if structural || lost || reconciled.elapsed() >= options.reconcile_interval {
            let next = match snapshot() {
                Ok(index) => index,
                Err(Error::Cancelled) => {
                    emit.flush()?;
                    return Ok(());
                }
                Err(error) => return Err(error),
            };
            diff(&previous, &next, &mut emit, &cancel)?;
            require_complete(&next.coverage)?;
            native.synchronize(&root, &next, &watch_operation)?;
            previous = next;
            reconciled = Instant::now();
        }
        if emit
            .since
            .is_some_and(|time| time.elapsed() >= options.coalesce)
        {
            emit.flush()?;
        }
        let stop = shared.wake.0.lock().map_err(|_| Error::Cancelled)?;
        if *stop {
            emit.flush()?;
            return Ok(());
        }
        let _ = shared
            .wake
            .1
            .wait_timeout(stop, Duration::from_millis(25))
            .map_err(|_| Error::Cancelled)?;
    }
}
fn require_complete(coverage: &IndexCoverage) -> Result<()> {
    if coverage.limited {
        return Err(Error::Input(
            "watch root exceeds snapshot budget; narrow the root".into(),
        ));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
struct Native {
    file: std::fs::File,
    watches: HashMap<i32, (String, (u64, u64))>,
}
#[cfg(target_os = "linux")]
impl Native {
    fn new(root: &ProjectRoot) -> Result<Self> {
        use std::os::fd::FromRawFd;
        // SAFETY: descriptor has a single File owner and is closed on every exit.
        let fd = unsafe { libc::inotify_init1(libc::IN_NONBLOCK | libc::IN_CLOEXEC) };
        if fd < 0 {
            return Err(Error::Io(std::io::Error::last_os_error()));
        }
        let mut native = Self {
            file: unsafe { std::fs::File::from_raw_fd(fd) },
            watches: HashMap::new(),
        };
        native.add(root, "")?;
        Ok(native)
    }
    fn add(&mut self, root: &ProjectRoot, relative: &str) -> Result<()> {
        use std::os::fd::AsRawFd;
        let directory = root.open_directory(relative)?;
        let metadata = directory.metadata()?;
        use std::os::unix::fs::MetadataExt;
        let identity = (metadata.dev(), metadata.ino());
        let path =
            std::ffi::CString::new(format!("/proc/self/fd/{}", directory.as_raw_fd())).unwrap();
        let mask = libc::IN_CREATE
            | libc::IN_MODIFY
            | libc::IN_ATTRIB
            | libc::IN_CLOSE_WRITE
            | libc::IN_DELETE
            | libc::IN_MOVED_FROM
            | libc::IN_MOVED_TO
            | libc::IN_DELETE_SELF
            | libc::IN_MOVE_SELF
            | libc::IN_ONLYDIR
            | libc::IN_EXCL_UNLINK;
        // Following this procfd link targets the *opened* directory, never an
        // attacker-controlled pathname. It stays pinned until add_watch returns.
        let wd = unsafe { libc::inotify_add_watch(self.file.as_raw_fd(), path.as_ptr(), mask) };
        if wd < 0 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() == Some(libc::ENOSPC) {
                return Err(Error::Input("OS file-watch descriptors exhausted; narrow exclusions or review inotify limits".into()));
            }
            return Err(Error::Io(error));
        }
        self.watches.insert(wd, (relative.into(), identity));
        Ok(())
    }
    fn synchronize(
        &mut self,
        root: &ProjectRoot,
        index: &ProjectIndex,
        operation: &project_search::Operation,
    ) -> Result<()> {
        operation.check()?;
        use std::os::fd::AsRawFd;
        let obsolete: Vec<_> = self
            .watches
            .iter()
            .filter(|(_, (path, identity))| {
                !path.is_empty()
                    && !index
                        .entries
                        .get(path)
                        .is_some_and(|entry| entry.directory && entry.identity == *identity)
            })
            .map(|(wd, _)| *wd)
            .collect();
        for wd in obsolete {
            operation.check()?;
            unsafe {
                libc::inotify_rm_watch(self.file.as_raw_fd(), wd);
            }
            self.watches.remove(&wd);
        }
        let present: std::collections::HashSet<_> =
            self.watches.values().map(|(p, _)| p.clone()).collect();
        for (path, entry) in &index.entries {
            operation.check()?;
            if entry.directory && !present.contains(path) {
                self.add(root, path)?;
            }
        }
        Ok(())
    }
    fn read(
        &mut self,
        root: &ProjectRoot,
        operation: &project_search::Operation,
    ) -> Result<(Vec<FileChangeEvent>, bool, bool)> {
        use std::{io::Read, os::unix::fs::MetadataExt};
        operation.check()?;
        root.check_identity()?;
        let mut buffer = [0u8; 64 * 1024];
        let size = match self.file.read(&mut buffer) {
            Ok(size) => size,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                return Ok((vec![], false, false));
            }
            Err(error) => return Err(Error::Io(error)),
        };
        let mut offset = 0;
        let mut events = Vec::new();
        let mut lost = false;
        let mut structural = false;
        while offset + std::mem::size_of::<libc::inotify_event>() <= size {
            operation.check()?;
            // Buffer alignment is unspecified; read_unaligned copies the header.
            let event = unsafe {
                std::ptr::read_unaligned(buffer.as_ptr().add(offset).cast::<libc::inotify_event>())
            };
            let header = std::mem::size_of::<libc::inotify_event>();
            let end = offset + header + event.len as usize;
            if end > size {
                lost = true;
                break;
            }
            if event.mask & libc::IN_Q_OVERFLOW != 0 {
                lost = true;
            }
            if event.mask & libc::IN_IGNORED != 0 {
                self.watches.remove(&event.wd);
                structural = true;
            }
            let name = &buffer[offset + header..end];
            offset = end;
            let Some((directory, identity)) = self.watches.get(&event.wd) else {
                continue;
            };
            if event.mask & (libc::IN_MOVE_SELF | libc::IN_DELETE_SELF | libc::IN_UNMOUNT) != 0 {
                if directory.is_empty() {
                    return Err(Error::RootChanged);
                }
                structural = true;
                continue;
            }
            let current = root
                .open_directory(directory)
                .and_then(|f| f.metadata().map_err(Error::Io));
            if !current.is_ok_and(|m| (m.dev(), m.ino()) == *identity) {
                lost = true;
                structural = true;
                continue;
            }
            let name = &name[..name.iter().position(|b| *b == 0).unwrap_or(name.len())];
            let Ok(name) = std::str::from_utf8(name) else {
                lost = true;
                continue;
            };
            if name.is_empty() {
                continue;
            }
            let path = if directory.is_empty() {
                name.into()
            } else {
                format!("{directory}/{name}")
            };
            if event.mask & libc::IN_ISDIR != 0 {
                structural = true;
            }
            let kind = if event.mask & (libc::IN_DELETE | libc::IN_MOVED_FROM) != 0 {
                FileChangeType::Deleted
            } else if event.mask & (libc::IN_CREATE | libc::IN_MOVED_TO) != 0 {
                FileChangeType::Created
            } else {
                FileChangeType::Updated
            };
            if events.len() >= 2000 {
                lost = true;
                break;
            }
            events.push(FileChangeEvent { path, kind });
        }
        Ok((events, lost, structural))
    }
}
#[cfg(not(target_os = "linux"))]
struct Native;
#[cfg(not(target_os = "linux"))]
impl Native {
    fn new(_: &ProjectRoot) -> Result<Self> {
        Ok(Self)
    }
    fn synchronize(
        &mut self,
        _: &ProjectRoot,
        _: &ProjectIndex,
        operation: &project_search::Operation,
    ) -> Result<()> {
        operation.check()
    }
    fn read(
        &mut self,
        _: &ProjectRoot,
        operation: &project_search::Operation,
    ) -> Result<(Vec<FileChangeEvent>, bool, bool)> {
        operation.check()?;
        Ok((vec![], false, false))
    }
}

#[cfg(test)]
#[path = "project_search/watcher_tests.rs"]
mod tests;
