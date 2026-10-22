//! Captured terminal completion watchers and externally owned process notifications.
use crate::{
    contracts::bounded_json::Utf16Text,
    execution::completion_output::extract_completion_output,
    time::{Clock, default_clock},
};
use futures_util::future::BoxFuture;
use regex::Regex;
use std::sync::{
    Arc, LazyLock, Mutex, Weak,
    atomic::{AtomicBool, AtomicU64, Ordering},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub const DEFAULT_MAX_WATCH_MS: f64 = 21_600_000.0;
pub const MAX_CONCURRENT_WATCHERS: usize = 50;
pub const SENTINEL_GRACE_MS: f64 = 250.0;
pub type ExitListener = Arc<dyn Fn(Option<f64>) -> Result<(), String> + Send + Sync>;
pub type OutputListener = Arc<dyn Fn(&[u16]) -> Result<(), String> + Send + Sync>;
/// Registration only attaches a listener; it must not emit output synchronously.
pub trait MonitorableSurface: Send + Sync {
    fn add_exit_listener(&self, _listener: ExitListener) {}
    fn remove_exit_listener(&self, _listener: &ExitListener) -> Result<(), String> {
        Ok(())
    }
    fn add_output_listener(&self, listener: OutputListener);
    fn remove_output_listener(&self, listener: &OutputListener) -> Result<(), String>;
}
pub type TimerCallback = Box<dyn FnOnce() -> Result<(), String> + Send>;
pub type CancelTimer = Arc<dyn Fn() + Send + Sync>;
pub type Schedule = Arc<dyn Fn(f64, TimerCallback) -> CancelTimer + Send + Sync>;
pub type WarningSink = Arc<dyn Fn(Utf16Text) + Send + Sync>;
pub type SimpleCallback = Arc<dyn Fn() -> Result<(), String> + Send + Sync>;
pub type OutputCallback = Arc<dyn Fn(Utf16Text) -> Result<(), String> + Send + Sync>;
pub type CompletionCallback = Arc<dyn Fn(Completion) -> Result<(), String> + Send + Sync>;
pub type ShouldNotify = Arc<dyn Fn() -> bool + Send + Sync>;
pub type CompletionHandler =
    Arc<dyn Fn(BackgroundCommandResult) -> BoxFuture<'static, Result<(), String>> + Send + Sync>;
#[derive(Clone, Debug)]
pub struct Completion {
    pub exit_code: Option<f64>,
    pub output: Utf16Text,
    pub timed_out: bool,
}
#[derive(Clone, Debug)]
pub struct BackgroundCommandResult {
    pub session_id: String,
    pub terminal_id: String,
    pub command: String,
    pub exit_code: Option<f64>,
    pub output: Utf16Text,
    pub duration_ms: f64,
    pub timed_out: bool,
}
pub struct TrackOptions {
    pub session_id: String,
    pub terminal_id: String,
    pub command: String,
    pub surface: Arc<dyn MonitorableSurface>,
    pub execution_id: Option<String>,
    pub on_cancel: Option<SimpleCallback>,
    pub on_timeout: Option<SimpleCallback>,
    pub completion_token: Option<String>,
    pub shell: String,
    pub max_watch_ms: Option<f64>,
    pub initial_output: Vec<u16>,
    pub started_at: Option<f64>,
    pub on_output: Option<OutputCallback>,
    pub should_notify: Option<ShouldNotify>,
    pub on_complete: Option<CompletionCallback>,
    pub on_stop: Option<SimpleCallback>,
}
pub struct ExternalOptions {
    pub session_id: String,
    pub terminal_id: String,
    pub command: String,
    pub started_at: f64,
    pub should_notify: Option<ShouldNotify>,
    pub on_cancel: Option<SimpleCallback>,
    pub execution_id: Option<String>,
    pub get_output: Option<Arc<dyn Fn() -> Utf16Text + Send + Sync>>,
}
#[derive(Clone, Debug)]
pub struct ExecutionSnapshot {
    pub terminal_id: String,
    pub execution_id: String,
    pub status: String,
    pub output: Utf16Text,
    pub exit_code: Option<f64>,
    pub duration_ms: f64,
}
fn tail(mut text: Vec<u16>, max: usize) -> Vec<u16> {
    if text.len() > max {
        text.drain(..text.len() - max);
    }
    text
}
#[derive(Clone)]
pub struct BackgroundCommandMonitor {
    core: Arc<Core>,
}
struct Core {
    active: Mutex<Vec<Arc<Entry>>>,
    handler: Mutex<Option<CompletionHandler>>,
    slots: Arc<Semaphore>,
    next_id: AtomicU64,
    clock: Clock,
    schedule: Schedule,
    warn: WarningSink,
    notifications: Mutex<Vec<tokio::task::JoinHandle<()>>>,
    history: Mutex<Vec<(String, ExecutionSnapshot)>>,
}
struct Entry {
    id: u64,
    session: String,
    terminal: String,
    kind: EntryKind,
}
enum EntryKind {
    Surface(Arc<SurfaceWatch>),
    External(Arc<ExternalWatch>),
}
impl Entry {
    fn cancel(&self) -> Result<(), String> {
        match &self.kind {
            EntryKind::Surface(w) => {
                if let Some(cancel) = &w.options.on_cancel {
                    cancel()?;
                }
                w.cleanup()
            }
            EntryKind::External(w) => w.cancel(),
        }
    }
    fn snapshot(&self) -> ExecutionSnapshot {
        match &self.kind {
            EntryKind::Surface(w) => w.snapshot("running", None),
            EntryKind::External(w) => w.snapshot("running", None, None),
        }
    }
    fn shutdown(&self) {
        match &self.kind {
            EntryKind::Surface(w) => w.shutdown(),
            EntryKind::External(w) => w.shutdown(),
        }
    }
}
struct SurfaceState {
    raw: Vec<u16>,
    finished: bool,
    stopped: bool,
    grace_pending: bool,
    timer: Option<CancelTimer>,
    grace: Option<CancelTimer>,
}
struct SurfaceWatch {
    id: u64,
    core: Weak<Core>,
    options: TrackOptions,
    started_at: f64,
    state: Mutex<SurfaceState>,
    listener: Mutex<Option<OutputListener>>,
    exit_listener: Mutex<Option<ExitListener>>,
    slot: Mutex<Option<OwnedSemaphorePermit>>,
}
struct ExternalWatch {
    id: u64,
    core: Weak<Core>,
    options: ExternalOptions,
    cancelled: AtomicBool,
    slot: Mutex<Option<OwnedSemaphorePermit>>,
    task: Mutex<Option<tokio::task::AbortHandle>>,
}
pub struct HandlerSubscription {
    core: Weak<Core>,
    handler: CompletionHandler,
}
impl HandlerSubscription {
    pub fn unsubscribe(&self) {
        if let Some(core) = self.core.upgrade() {
            let mut current = core.handler.lock().unwrap();
            if current
                .as_ref()
                .is_some_and(|h| Arc::ptr_eq(h, &self.handler))
            {
                current.take();
            }
        }
    }
}
fn default_schedule() -> Schedule {
    Arc::new(|milliseconds, callback| {
        let delay = if milliseconds.is_finite() && milliseconds > 0.0 {
            milliseconds
        } else {
            0.0
        };
        let delay = std::time::Duration::from_secs_f64((delay / 1000.0).min(u32::MAX as f64));
        let task = tokio::spawn(async move {
            tokio::time::sleep(delay).await;
            let _ = callback();
        });
        let abort = task.abort_handle();
        Arc::new(move || abort.abort())
    })
}
fn number_text(n: f64) -> String {
    if n.is_nan() {
        "NaN".into()
    } else if n == f64::INFINITY {
        "Infinity".into()
    } else if n == f64::NEG_INFINITY {
        "-Infinity".into()
    } else {
        ryu_js::Buffer::new().format(n).to_string()
    }
}
fn warning_parts(before: &str, command: &str, after: &str) -> Utf16Text {
    Utf16Text(
        before
            .encode_utf16()
            .chain(command.encode_utf16().take(80))
            .chain(after.encode_utf16())
            .collect(),
    )
}
impl Default for BackgroundCommandMonitor {
    fn default() -> Self {
        Self::new()
    }
}
impl BackgroundCommandMonitor {
    pub fn new() -> Self {
        Self::with_options(
            default_clock(),
            default_schedule(),
            Arc::new(|m| eprintln!("{}", String::from_utf16_lossy(&m.0))),
        )
    }
    pub fn with_options(clock: Clock, schedule: Schedule, warn: WarningSink) -> Self {
        Self {
            core: Arc::new(Core {
                active: Mutex::new(vec![]),
                handler: Mutex::new(None),
                slots: Arc::new(Semaphore::new(MAX_CONCURRENT_WATCHERS)),
                next_id: AtomicU64::new(1),
                clock,
                schedule,
                warn,
                notifications: Mutex::new(vec![]),
                history: Mutex::new(vec![]),
            }),
        }
    }
    pub fn inspect_execution(
        &self,
        session: &str,
        terminal: &str,
        execution: &str,
    ) -> Option<ExecutionSnapshot> {
        let entries = self.core.active.lock().unwrap().clone();
        for e in entries {
            if e.session == session && e.terminal == terminal {
                let snapshot = e.snapshot();
                if snapshot.execution_id == execution {
                    return Some(snapshot);
                }
            }
        }
        self.core
            .history
            .lock()
            .unwrap()
            .iter()
            .rev()
            .find(|(s, v)| s == session && v.terminal_id == terminal && v.execution_id == execution)
            .map(|(_, v)| v.clone())
    }
    pub fn cancel_execution(
        &self,
        session: &str,
        terminal: &str,
        execution: &str,
    ) -> Result<Option<ExecutionSnapshot>, String> {
        let entries = self.core.active.lock().unwrap().clone();
        for e in entries {
            if e.session != session || e.terminal != terminal {
                continue;
            }
            let mut snapshot = e.snapshot();
            if snapshot.execution_id != execution {
                continue;
            }
            e.cancel()?;
            snapshot.status = "cancelled".into();
            self.core.remember(session, snapshot.clone());
            return Ok(Some(snapshot));
        }
        Ok(self.inspect_execution(session, terminal, execution))
    }
    pub fn active_count(&self) -> usize {
        self.core.active.lock().unwrap().len()
    }
    pub fn has_watcher_for_terminal(&self, id: &str) -> bool {
        self.core
            .active
            .lock()
            .unwrap()
            .iter()
            .any(|e| e.terminal == id)
    }
    pub fn set_completion_handler(&self, handler: CompletionHandler) -> HandlerSubscription {
        *self.core.handler.lock().unwrap() = Some(handler.clone());
        HandlerSubscription {
            core: Arc::downgrade(&self.core),
            handler,
        }
    }
    pub fn report_completion(&self, result: BackgroundCommandResult) {
        self.core.invoke(result);
    }
    pub fn track(&self, options: TrackOptions) -> bool {
        let permit = match self.core.slots.clone().try_acquire_owned() {
            Ok(p) => p,
            Err(_) => {
                (self.core.warn)(warning_parts(
                    "[background-command] refusing to watch \"",
                    &options.command,
                    &format!(
                        "\" — already watching {} commands (cap {})",
                        self.active_count(),
                        MAX_CONCURRENT_WATCHERS
                    ),
                ));
                return false;
            }
        };
        let id = self.core.next_id.fetch_add(1, Ordering::Relaxed);
        let started_at = options
            .started_at
            .unwrap_or_else(|| (self.core.clock)() as f64);
        let raw = tail(options.initial_output.clone(), 64_000);
        let delay = options.max_watch_ms.unwrap_or(DEFAULT_MAX_WATCH_MS);
        let watcher = Arc::new(SurfaceWatch {
            id,
            core: Arc::downgrade(&self.core),
            options,
            started_at,
            state: Mutex::new(SurfaceState {
                raw,
                finished: false,
                stopped: false,
                grace_pending: false,
                timer: None,
                grace: None,
            }),
            listener: Mutex::new(None),
            exit_listener: Mutex::new(None),
            slot: Mutex::new(Some(permit)),
        });
        let weak = Arc::downgrade(&watcher);
        let listener: OutputListener = Arc::new(move |data| match weak.upgrade() {
            Some(w) => w.output(data),
            None => Ok(()),
        });
        *watcher.listener.lock().unwrap() = Some(listener.clone());
        watcher.options.surface.add_output_listener(listener);
        let weak_exit = Arc::downgrade(&watcher);
        let exit: ExitListener = Arc::new(move |code| match weak_exit.upgrade() {
            Some(w) => w.finish(code),
            None => Ok(()),
        });
        *watcher.exit_listener.lock().unwrap() = Some(exit.clone());
        watcher.options.surface.add_exit_listener(exit);
        self.core.active.lock().unwrap().push(Arc::new(Entry {
            id,
            session: watcher.options.session_id.clone(),
            terminal: watcher.options.terminal_id.clone(),
            kind: EntryKind::Surface(watcher.clone()),
        }));
        let weak = Arc::downgrade(&watcher);
        let cancel = (self.core.schedule)(
            delay,
            Box::new(move || match weak.upgrade() {
                Some(w) => w.expire(),
                None => Ok(()),
            }),
        );
        let mut state = watcher.state.lock().unwrap();
        if state.stopped {
            cancel();
        } else {
            state.timer = Some(cancel);
        }
        let has_initial = !state.raw.is_empty();
        drop(state);
        if has_initial {
            tokio::spawn(async move {
                let _ = watcher.output(&[]);
            });
        }
        true
    }
    /// The caller retains ownership of the process; cancelling only detaches this observation.
    pub fn track_external(
        &self,
        options: ExternalOptions,
        future: BoxFuture<'static, Result<Completion, String>>,
    ) -> bool {
        let Ok(permit) = self.core.slots.clone().try_acquire_owned() else {
            return false;
        };
        let id = self.core.next_id.fetch_add(1, Ordering::Relaxed);
        let watcher = Arc::new(ExternalWatch {
            id,
            core: Arc::downgrade(&self.core),
            options,
            cancelled: AtomicBool::new(false),
            slot: Mutex::new(Some(permit)),
            task: Mutex::new(None),
        });
        self.core.active.lock().unwrap().push(Arc::new(Entry {
            id,
            session: watcher.options.session_id.clone(),
            terminal: watcher.options.terminal_id.clone(),
            kind: EntryKind::External(watcher.clone()),
        }));
        let observed = watcher.clone();
        let task = tokio::spawn(async move {
            observed.resolve(future.await);
        });
        let abort = task.abort_handle();
        if watcher.cancelled.load(Ordering::Acquire) {
            abort.abort();
        }
        *watcher.task.lock().unwrap() = Some(abort);
        true
    }
    pub fn stop_for_session(&self, session: &str) -> Result<(), String> {
        let entries = self
            .core
            .active
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.session == session)
            .cloned()
            .collect::<Vec<_>>();
        for entry in entries {
            entry.cancel()?;
        }
        Ok(())
    }
    pub fn clear_for_tests(&self) -> Result<(), String> {
        let entries = self.core.active.lock().unwrap().clone();
        for entry in entries {
            entry.cancel()?;
        }
        self.core.active.lock().unwrap().clear();
        self.core.handler.lock().unwrap().take();
        self.core.history.lock().unwrap().clear();
        Ok(())
    }
    /// Drain already queued sink calls; callers may add a shutdown deadline.
    pub async fn drain_notifications(&self) {
        loop {
            let tasks = std::mem::take(&mut *self.core.notifications.lock().unwrap());
            if tasks.is_empty() {
                break;
            }
            for task in tasks {
                let _ = task.await;
            }
        }
    }
}
impl Core {
    fn remember(&self, session: &str, value: ExecutionSnapshot) {
        let mut h = self.history.lock().unwrap();
        h.retain(|(s, v)| {
            s != session
                || v.terminal_id != value.terminal_id
                || v.execution_id != value.execution_id
        });
        h.push((session.into(), value));
        if h.len() > 100 {
            h.remove(0);
        }
    }
    fn remove(&self, id: u64) {
        self.active.lock().unwrap().retain(|e| e.id != id);
    }
    fn invoke(&self, result: BackgroundCommandResult) {
        let handler = self.handler.lock().unwrap().clone();
        let Some(handler) = handler else {
            (self.warn)(warning_parts(
                &format!("[background-command] {}: \"", result.terminal_id),
                &result.command,
                "\" finished but no completion handler is registered — the agent will not be notified",
            ));
            return;
        };
        let task = tokio::spawn(async move {
            let _ = handler(result).await;
        });
        let mut tasks = self.notifications.lock().unwrap();
        tasks.retain(|t| !t.is_finished());
        tasks.push(task);
    }
}
impl Drop for Core {
    fn drop(&mut self) {
        for entry in self.active.get_mut().unwrap().drain(..) {
            entry.shutdown();
        }
    }
}
impl SurfaceWatch {
    fn snapshot(&self, status: &str, code: Option<f64>) -> ExecutionSnapshot {
        let raw = self.state.lock().unwrap().raw.clone();
        ExecutionSnapshot {
            terminal_id: self.options.terminal_id.clone(),
            execution_id: self
                .options
                .execution_id
                .clone()
                .unwrap_or_else(|| self.options.terminal_id.clone()),
            status: status.into(),
            output: extract_completion_output(&raw, &self.options.command, &self.options.shell),
            exit_code: code,
            duration_ms: self
                .core
                .upgrade()
                .map_or(0.0, |c| (c.clock)() as f64 - self.started_at),
        }
    }
    fn stop(&self) -> bool {
        let (timer, grace) = {
            let mut s = self.state.lock().unwrap();
            if s.stopped {
                return false;
            }
            s.stopped = true;
            (s.timer.take(), s.grace.take())
        };
        if let Some(cancel) = timer {
            cancel();
        }
        if let Some(cancel) = grace {
            cancel();
        }
        if let Some(listener) = self.listener.lock().unwrap().as_ref() {
            let _ = self.options.surface.remove_output_listener(listener);
        }
        if let Some(listener) = self.exit_listener.lock().unwrap().as_ref() {
            let _ = self.options.surface.remove_exit_listener(listener);
        }
        true
    }
    fn cleanup(&self) -> Result<(), String> {
        if !self.stop() {
            return Ok(());
        }
        if let Some(core) = self.core.upgrade() {
            core.remove(self.id);
        }
        self.slot.lock().unwrap().take();
        if let Some(on_stop) = &self.options.on_stop {
            on_stop()?;
        }
        Ok(())
    }
    fn shutdown(&self) {
        self.stop();
        self.slot.lock().unwrap().take();
    }
    fn expire(&self) -> Result<(), String> {
        if let Some(core) = self.core.upgrade() {
            let minutes =
                (self.options.max_watch_ms.unwrap_or(DEFAULT_MAX_WATCH_MS) / 60000.0 + 0.5).floor();
            (core.warn)(warning_parts(
                &format!(
                    "[background-command] {}: giving up on \"",
                    self.options.terminal_id
                ),
                &self.options.command,
                &format!(
                    "\" after {}min — no completion marker seen",
                    number_text(minutes)
                ),
            ));
        }
        if let Some(timeout) = &self.options.on_timeout {
            timeout()?;
            self.finish_outcome(None, true)
        } else {
            self.cleanup()
        }
    }
    fn finish(&self, exit_code: Option<f64>) -> Result<(), String> {
        self.finish_outcome(exit_code, false)
    }
    fn finish_outcome(&self, exit_code: Option<f64>, timed_out: bool) -> Result<(), String> {
        let raw = {
            let mut s = self.state.lock().unwrap();
            if s.finished || s.stopped {
                return Ok(());
            }
            s.finished = true;
            s.raw.clone()
        };
        let output = extract_completion_output(&raw, &self.options.command, &self.options.shell);
        if let Some(core) = self.core.upgrade() {
            core.remember(
                &self.options.session_id,
                self.snapshot(
                    if timed_out {
                        "timed_out"
                    } else if exit_code == Some(0.0) {
                        "completed"
                    } else {
                        "failed"
                    },
                    exit_code,
                ),
            );
        }
        if let Some(on_complete) = &self.options.on_complete {
            let _ = on_complete(Completion {
                exit_code,
                output: output.clone(),
                timed_out,
            });
        }
        self.cleanup()?;
        if self.options.should_notify.as_ref().is_some_and(|f| !f()) {
            return Ok(());
        }
        if let Some(core) = self.core.upgrade() {
            core.invoke(BackgroundCommandResult {
                session_id: self.options.session_id.clone(),
                terminal_id: self.options.terminal_id.clone(),
                command: self.options.command.clone(),
                exit_code,
                output,
                duration_ms: (core.clock)() as f64 - self.started_at,
                timed_out,
            });
        }
        Ok(())
    }
    fn output(self: &Arc<Self>, data: &[u16]) -> Result<(), String> {
        let raw = {
            let mut s = self.state.lock().unwrap();
            if s.finished || s.stopped {
                return Ok(());
            }
            s.raw.extend_from_slice(data);
            if s.raw.len() > 64_000 {
                let excess = s.raw.len() - 64_000;
                s.raw.drain(..excess);
            }
            s.raw.clone()
        };
        if let Some(on_output) = &self.options.on_output {
            on_output(Utf16Text(raw))?;
        }
        // A callback or concurrent owner can cancel while output is being delivered.
        if self.state.lock().unwrap().stopped {
            return Ok(());
        }
        let raw = String::from_utf16_lossy(&self.state.lock().unwrap().raw);
        if let Some(token) = self
            .options
            .completion_token
            .as_deref()
            .filter(|s| !s.is_empty())
        {
            let pattern = format!("{}:(-?[0-9]+)", regex::escape(token));
            let re = Regex::new(&pattern).expect("escaped sentinel");
            if let Some(found) = re.captures(&raw) {
                return self.finish(found[1].parse::<f64>().ok().filter(|n| !n.is_nan()));
            }
        }
        static OSC: LazyLock<Regex> =
            LazyLock::new(|| Regex::new(r"\x1b\]633;D;(-?[0-9]*)(?:\x07|\x1b\\)").unwrap());
        let Some(found) = OSC.captures(&raw) else {
            return Ok(());
        };
        let code = if found[1].is_empty() {
            Some(0.0)
        } else {
            found[1].parse::<f64>().ok().filter(|n| !n.is_nan())
        };
        if self
            .options
            .completion_token
            .as_ref()
            .is_some_and(|s| !s.is_empty())
        {
            let Some(core) = self.core.upgrade() else {
                return Ok(());
            };
            {
                let mut s = self.state.lock().unwrap();
                if s.grace_pending {
                    return Ok(());
                }
                s.grace_pending = true;
            }
            let weak = Arc::downgrade(self);
            let cancel = (core.schedule)(
                SENTINEL_GRACE_MS,
                Box::new(move || match weak.upgrade() {
                    Some(w) => w.finish(code),
                    None => Ok(()),
                }),
            );
            let mut s = self.state.lock().unwrap();
            if s.stopped || s.finished {
                cancel();
            } else {
                s.grace = Some(cancel);
            }
            Ok(())
        } else {
            self.finish(code)
        }
    }
}
impl Drop for SurfaceWatch {
    fn drop(&mut self) {
        self.shutdown();
    }
}
impl ExternalWatch {
    fn snapshot(
        &self,
        status: &str,
        code: Option<f64>,
        output: Option<Utf16Text>,
    ) -> ExecutionSnapshot {
        ExecutionSnapshot {
            terminal_id: self.options.terminal_id.clone(),
            execution_id: self
                .options
                .execution_id
                .clone()
                .unwrap_or_else(|| self.options.terminal_id.clone()),
            status: status.into(),
            exit_code: code,
            output: Utf16Text(tail(
                output
                    .unwrap_or_else(|| {
                        self.options
                            .get_output
                            .as_ref()
                            .map_or_else(|| Utf16Text(vec![]), |f| f())
                    })
                    .0,
                16_000,
            )),
            duration_ms: self
                .core
                .upgrade()
                .map_or(0.0, |c| (c.clock)() as f64 - self.options.started_at),
        }
    }
    fn detach(&self) {
        if let Some(core) = self.core.upgrade() {
            core.remove(self.id);
        }
        self.slot.lock().unwrap().take();
    }
    fn cancel(&self) -> Result<(), String> {
        self.cancelled.store(true, Ordering::Release);
        self.detach();
        if let Some(abort) = self.task.lock().unwrap().as_ref() {
            abort.abort();
        }
        if let Some(on_cancel) = &self.options.on_cancel {
            on_cancel()?;
        }
        Ok(())
    }
    fn shutdown(&self) {
        self.cancelled.store(true, Ordering::Release);
        if let Some(abort) = self.task.lock().unwrap().as_ref() {
            abort.abort();
        }
        self.slot.lock().unwrap().take();
    }
    fn resolve(&self, result: Result<Completion, String>) {
        self.detach();
        let Ok(result) = result else { return };
        if self.cancelled.load(Ordering::Acquire) {
            return;
        }
        if let Some(core) = self.core.upgrade() {
            core.remember(
                &self.options.session_id,
                self.snapshot(
                    if result.timed_out {
                        "timed_out"
                    } else if result.exit_code == Some(0.0) {
                        "completed"
                    } else {
                        "failed"
                    },
                    result.exit_code,
                    Some(result.output.clone()),
                ),
            );
            if self.options.should_notify.as_ref().is_some_and(|f| !f()) {
                return;
            }
            core.invoke(BackgroundCommandResult {
                session_id: self.options.session_id.clone(),
                terminal_id: self.options.terminal_id.clone(),
                command: self.options.command.clone(),
                exit_code: result.exit_code,
                output: result.output,
                duration_ms: (core.clock)() as f64 - self.options.started_at,
                timed_out: result.timed_out,
            });
        }
    }
}
