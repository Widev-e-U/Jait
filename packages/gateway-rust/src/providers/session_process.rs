//! Port of `packages/gateway/src/providers/session-process.ts`.
//!
//! The reference has a single entry point, `stopSessionProcess(child)`: send
//! SIGTERM to the child's whole process group, and only if that was actually
//! delivered arm an unref'd 5 s `setTimeout` that escalates to SIGKILL. The
//! interesting part is not the two signals but everything around them, so the
//! port keeps those seams explicit:
//!
//! * **identity** — a [`SessionHandle`] names one *registration* of one
//!   session; every signal re-checks it against [`SessionProcessTable`] so a
//!   handle whose process has been reaped (or whose session has been replaced
//!   by a newer child) is refused instead of signalling a PID we no longer own.
//!   This avoids signalling a potentially reused process-group ID, but differs
//!   from the reference when the leader exits before its descendants: the
//!   reference still attempts escalation. A session owner must retain an
//!   unreaped leader through escalation to safely close that compatibility gap.
//! * **signalling** — [`GroupSignals`] is the injected `process.kill(group,
//!   name)`; tests use a recorder and never signal anything.
//! * **cancellation** — [`SessionProcessTable::escalate_after`] accepts a
//!   [`watch`] receiver that can cancel escalation. This is a native policy,
//!   not a port of `timer.unref()`: the reference leaves its escalation armed
//!   after the session owner exits. Callers must preserve descendant cleanup.
//! * **error surface** — `catch` on `process.kill` is modelled as
//!   [`SignalError`]: `ESRCH` (`NoSuchProcess`) is silent, anything else is
//!   reported through [`SignalOutcome::Failed`] for the caller to warn about
//!   (`console.warn` in the reference). Both leave the escalation unarmed.

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use tokio::sync::watch;

/// Reference: `const ESCALATION_DELAY_MS = 5_000;`
pub const ESCALATION_DELAY_MS: u64 = 5_000;

/// The two signals the reference ever sends (`signal("SIGTERM")`,
/// `signal("SIGKILL")`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionSignal {
    /// `SIGTERM` — `signal("SIGTERM")`.
    Term,
    /// `SIGKILL` — the escalation callback.
    Kill,
}

/// The `catch` arm of the reference's `signal(name)` helper.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SignalError {
    /// `error.code === "ESRCH"`: the group is already gone. The reference
    /// returns `false` silently, which also means "do not escalate".
    NoSuchProcess,
    /// Any other code: the reference warns and returns `false`.
    Failed(String),
}

impl SignalError {
    /// Helper for [`GroupSignals`] implementations: classify an OS error.
    /// `ESRCH` (`raw_os_error() == Some(3)`) is the silent case.
    pub fn from_raw_os_error(code: Option<i32>) -> Self {
        if code == Some(3) {
            Self::NoSuchProcess
        } else {
            Self::Failed(match code {
                Some(code) => format!("signal failed (errno {code})"),
                None => "signal failed".to_owned(),
            })
        }
    }
}

/// Reference: `const group = -child.pid;` + `process.kill(group, name)`.
///
/// Injected so no test touches a real process. The reference's other branch,
/// `if (process.platform === "win32" || child.pid === undefined) { killChildTree(child); return; }`,
/// is deliberately **not** modelled: this crate has no `kill_child_tree`
/// equivalent, and every handle registered here owns a POSIX process group, so
/// there is no fallback to reproduce faithfully. Callers must therefore never
/// register a session that has no process group.
///
/// Implementations must not call back into the [`SessionProcessTable`] that
/// drives them: the table holds its lock across the call so the identity check
/// and the syscall cannot be split.
pub trait GroupSignals: Send + Sync {
    fn signal_group(&self, pid: u32, signal: SessionSignal) -> Result<(), SignalError>;
}

/// Result of one delivered-or-not signal attempt.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SignalOutcome {
    /// `signal(name) === true`.
    Delivered,
    /// `ESRCH`: the group is gone; the reference silently gives up.
    AlreadyGone,
    /// Any other error; the reference warns. Carries the message to warn with.
    Failed(String),
}

/// Why a handle was not allowed to signal anything.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignalRefusal {
    /// The session is not (or no longer) registered.
    Unknown,
    /// The session has been re-registered with a different child since this
    /// handle was issued — the handle is stale, its pid may belong to a
    /// stranger.
    Replaced,
    /// The process was reported reaped; signalling it would risk PID reuse.
    Reaped,
    /// SIGTERM was already delivered (or the handle was already escalated), so
    /// this is not the first attempt the reference would escalate from.
    AlreadySignalled,
    /// Escalation was requested for a handle whose SIGTERM was never delivered
    /// (`if (!signal("SIGTERM")) return;`).
    NotPending,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HandleState {
    /// Registered, nothing signalled yet.
    Running,
    /// SIGTERM delivered; the 5 s escalation window may be armed.
    Terminated,
    /// SIGKILL delivered.
    Escalated,
    /// The process is gone (delivered exit, or `ESRCH`): the reference no longer
    /// holds the child.
    Reaped,
}

/// One registration of one session's child process.
///
/// Fields are private and there is no public constructor, so a handle can only
/// come from [`SessionProcessTable::register`] and cannot be forged around the
/// identity check.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionHandle {
    session_id: String,
    generation: u64,
    pid: u32,
}

impl SessionHandle {
    /// The session this child serves (`sessionId` in `acp-provider.ts`).
    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    /// The process-group leader (`child.pid`; the group is `-pid`).
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Registration count for this session: bumps on every re-registration, so
    /// a stale handle is distinguishable from the current one.
    pub fn generation(&self) -> u64 {
        self.generation
    }
}

/// Why [`SessionProcessTable::register`] refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RegisterError {
    /// The session already has a live child. The reference tracks one child per
    /// session; registering a second would orphan the first process group.
    Duplicate { pid: u32 },
}

struct Entry {
    session_id: String,
    generation: u64,
    pid: u32,
    state: HandleState,
}

/// Port of the reference's implicit "which child belongs to which session"
/// bookkeeping, made explicit so signalling can check identity first.
#[derive(Clone, Default)]
pub struct SessionProcessTable {
    entries: Arc<Mutex<Vec<Entry>>>,
}

impl SessionProcessTable {
    pub fn new() -> Self {
        Self::default()
    }

    fn lock(&self) -> MutexGuard<'_, Vec<Entry>> {
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Track `pid` as the child of `session_id`.
    ///
    /// A session whose previous child was reaped may register again; that bumps
    /// the generation, which is what makes the old handle unusable.
    pub fn register(&self, session_id: &str, pid: u32) -> Result<SessionHandle, RegisterError> {
        let mut entries = self.lock();
        match entries.iter().position(|e| e.session_id == session_id) {
            Some(index) => {
                let entry = &mut entries[index];
                if entry.state != HandleState::Reaped {
                    return Err(RegisterError::Duplicate { pid: entry.pid });
                }
                entry.generation += 1;
                entry.pid = pid;
                entry.state = HandleState::Running;
                Ok(SessionHandle {
                    session_id: entry.session_id.clone(),
                    generation: entry.generation,
                    pid: entry.pid,
                })
            }
            None => {
                entries.push(Entry {
                    session_id: session_id.to_owned(),
                    generation: 0,
                    pid,
                    state: HandleState::Running,
                });
                Ok(SessionHandle {
                    session_id: session_id.to_owned(),
                    generation: 0,
                    pid,
                })
            }
        }
    }

    /// Current state of `handle`, or `None` when the handle is stale (the
    /// session is unknown or has been re-registered).
    pub fn state(&self, handle: &SessionHandle) -> Option<HandleState> {
        let entries = self.lock();
        let index = Self::resolve(&entries, handle).ok()?;
        Some(entries[index].state)
    }

    /// Report that the child exited and was reaped by its owner. Only the
    /// current registration is affected. Returns whether the handle was current.
    pub fn mark_reaped(&self, handle: &SessionHandle) -> bool {
        let mut entries = self.lock();
        let Ok(index) = Self::resolve(&entries, handle) else {
            return false;
        };
        entries[index].state = HandleState::Reaped;
        true
    }

    /// Forget the session entirely (tombstone cleanup). Returns whether the
    /// handle was current.
    pub fn release(&self, handle: &SessionHandle) -> bool {
        let mut entries = self.lock();
        let Ok(index) = Self::resolve(&entries, handle) else {
            return false;
        };
        entries.remove(index);
        true
    }

    /// `signal("SIGTERM")` on the child's process group.
    ///
    /// Mirrors the reference's first step: identity first, then one SIGTERM.
    /// `Err(AlreadySignalled)` is the case where the reference would have
    /// signalled a second time; `Err(Reaped | Replaced | Unknown)` are the cases
    /// the reference cannot hit (its child object *is* the identity) but which a
    /// long-lived native handle must not skip.
    pub fn stop(
        &self,
        handle: &SessionHandle,
        signals: &dyn GroupSignals,
    ) -> Result<SignalOutcome, SignalRefusal> {
        let mut entries = self.lock();
        let index = Self::resolve(&entries, handle)?;
        match entries[index].state {
            HandleState::Running => {}
            HandleState::Terminated | HandleState::Escalated => {
                return Err(SignalRefusal::AlreadySignalled);
            }
            HandleState::Reaped => return Err(SignalRefusal::Reaped),
        }
        // The signal is sent while the table lock is held: the identity check
        // above and the syscall must not be split by a concurrent
        // `mark_reaped`/`register`, which would signal a PID we no longer own.
        match signals.signal_group(entries[index].pid, SessionSignal::Term) {
            Ok(()) => {
                entries[index].state = HandleState::Terminated;
                Ok(SignalOutcome::Delivered)
            }
            Err(SignalError::NoSuchProcess) => {
                entries[index].state = HandleState::Reaped;
                Ok(SignalOutcome::AlreadyGone)
            }
            // Reference: `catch (error) { console.warn(...); return false; }` —
            // no state change, so a retry is allowed and escalation stays off.
            Err(SignalError::Failed(message)) => Ok(SignalOutcome::Failed(message)),
        }
    }

    /// The escalation callback: `signal("SIGKILL")`, only ever reached when
    /// SIGTERM was delivered (`if (!signal("SIGTERM")) return;`).
    pub fn escalate(
        &self,
        handle: &SessionHandle,
        signals: &dyn GroupSignals,
    ) -> Result<SignalOutcome, SignalRefusal> {
        let mut entries = self.lock();
        let index = Self::resolve(&entries, handle)?;
        match entries[index].state {
            HandleState::Terminated => {}
            HandleState::Running => return Err(SignalRefusal::NotPending),
            HandleState::Escalated => return Err(SignalRefusal::AlreadySignalled),
            HandleState::Reaped => return Err(SignalRefusal::Reaped),
        }
        match signals.signal_group(entries[index].pid, SessionSignal::Kill) {
            Ok(()) => {
                entries[index].state = HandleState::Escalated;
                Ok(SignalOutcome::Delivered)
            }
            Err(SignalError::NoSuchProcess) => {
                entries[index].state = HandleState::Reaped;
                Ok(SignalOutcome::AlreadyGone)
            }
            Err(SignalError::Failed(message)) => Ok(SignalOutcome::Failed(message)),
        }
    }

    /// The reference's `setTimeout(...).unref()` window, as an awaitable.
    ///
    /// Waits [`ESCALATION_DELAY_MS`] and then escalates, unless `cancel` fires
    /// first (the session went away) or the handle stopped naming the process we
    /// own (reaped, or replaced by a newer child) — in which case nothing is
    /// signalled.
    pub async fn escalate_after(
        &self,
        handle: SessionHandle,
        signals: Arc<dyn GroupSignals>,
        mut cancel: watch::Receiver<bool>,
    ) -> Escalation {
        if *cancel.borrow() {
            return Escalation::Cancelled;
        }
        tokio::select! {
            () = tokio::time::sleep(Duration::from_millis(ESCALATION_DELAY_MS)) => {}
            _ = cancel.changed() => return Escalation::Cancelled,
        }
        if *cancel.borrow() {
            return Escalation::Cancelled;
        }
        match self.escalate(&handle, signals.as_ref()) {
            Ok(outcome) => Escalation::Elapsed(outcome),
            Err(refusal) => Escalation::Refused(refusal),
        }
    }

    fn resolve(entries: &[Entry], handle: &SessionHandle) -> Result<usize, SignalRefusal> {
        let Some(index) = entries
            .iter()
            .position(|entry| entry.session_id == handle.session_id)
        else {
            return Err(SignalRefusal::Unknown);
        };
        if entries[index].generation != handle.generation {
            return Err(SignalRefusal::Replaced);
        }
        Ok(index)
    }
}

/// Outcome of [`SessionProcessTable::escalate_after`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Escalation {
    /// The window ended and the handle was still ours.
    Elapsed(SignalOutcome),
    /// The window ended but the handle no longer named our process.
    Refused(SignalRefusal),
    /// `cancel` fired first: the reference's unref'd timer never ran.
    Cancelled,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    /// Records what would have been signalled. No process is ever touched.
    #[derive(Default)]
    struct Recorder {
        calls: StdMutex<Vec<(u32, SessionSignal)>>,
    }

    impl Recorder {
        fn calls(&self) -> Vec<(u32, SessionSignal)> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl GroupSignals for Recorder {
        fn signal_group(&self, pid: u32, signal: SessionSignal) -> Result<(), SignalError> {
            self.calls.lock().unwrap().push((pid, signal));
            Ok(())
        }
    }

    /// `catch (error) { if (error.code === "ESRCH") return false; ... }`
    struct Gone;

    impl GroupSignals for Gone {
        fn signal_group(&self, _pid: u32, _signal: SessionSignal) -> Result<(), SignalError> {
            Err(SignalError::NoSuchProcess)
        }
    }

    fn table_with_recorder() -> (SessionProcessTable, Arc<Recorder>) {
        (SessionProcessTable::new(), Arc::new(Recorder::default()))
    }

    /// A registered session is tracked by identity and survives one SIGTERM plus
    /// one SIGKILL, both addressed to the process group.
    #[test]
    fn registering_tracks_the_session_process() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 4242).unwrap();
        assert_eq!(handle.session_id(), "s1");
        assert_eq!(handle.pid(), 4242);
        assert_eq!(handle.generation(), 0);
        assert_eq!(table.state(&handle), Some(HandleState::Running));

        assert_eq!(
            table.stop(&handle, recorder.as_ref()),
            Ok(SignalOutcome::Delivered)
        );
        assert_eq!(table.state(&handle), Some(HandleState::Terminated));
        assert_eq!(
            table.escalate(&handle, recorder.as_ref()),
            Ok(SignalOutcome::Delivered)
        );
        assert_eq!(table.state(&handle), Some(HandleState::Escalated));
        assert_eq!(
            recorder.calls(),
            vec![(4242, SessionSignal::Term), (4242, SessionSignal::Kill)]
        );
    }

    /// One child per session: registering a second would orphan the first
    /// process group, so the duplicate is rejected and nothing is signalled.
    #[test]
    fn a_duplicate_registration_is_rejected() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 111).unwrap();
        assert_eq!(
            table.register("s1", 222),
            Err(RegisterError::Duplicate { pid: 111 })
        );
        // The original registration is untouched and still the one we signal.
        assert_eq!(table.state(&handle), Some(HandleState::Running));
        table.stop(&handle, recorder.as_ref()).unwrap();
        assert_eq!(recorder.calls(), vec![(111, SessionSignal::Term)]);
    }

    /// A handle whose process was reaped must never signal: the pid may already
    /// belong to something else.
    #[test]
    fn a_reaped_handle_is_never_signalled() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 111).unwrap();
        assert!(table.mark_reaped(&handle));
        assert_eq!(table.state(&handle), Some(HandleState::Reaped));
        assert_eq!(
            table.stop(&handle, recorder.as_ref()),
            Err(SignalRefusal::Reaped)
        );
        assert_eq!(
            table.escalate(&handle, recorder.as_ref()),
            Err(SignalRefusal::Reaped)
        );
        assert!(
            recorder.calls().is_empty(),
            "no signals for a reaped process"
        );
    }

    /// A session that restarted gets a new generation; the old handle is stale
    /// and must not signal the replacement's pid.
    #[test]
    fn a_replaced_handle_is_never_signalled() {
        let (table, recorder) = table_with_recorder();
        let old = table.register("s1", 111).unwrap();
        assert!(table.mark_reaped(&old));
        let new = table.register("s1", 222).unwrap();
        assert_eq!(new.generation(), old.generation() + 1);
        assert_eq!(new.pid(), 222);

        assert_eq!(
            table.stop(&old, recorder.as_ref()),
            Err(SignalRefusal::Replaced)
        );
        assert_eq!(
            table.escalate(&old, recorder.as_ref()),
            Err(SignalRefusal::Replaced)
        );
        assert!(recorder.calls().is_empty());

        table.stop(&new, recorder.as_ref()).unwrap();
        assert_eq!(recorder.calls(), vec![(222, SessionSignal::Term)]);
    }

    /// `if (!signal("SIGTERM")) return;`: the window only opens once, and only
    /// after a delivered SIGTERM.
    #[test]
    fn signalling_happens_at_most_once_per_step() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 111).unwrap();
        assert_eq!(
            table.escalate(&handle, recorder.as_ref()),
            Err(SignalRefusal::NotPending),
            "no escalation without a delivered SIGTERM"
        );
        table.stop(&handle, recorder.as_ref()).unwrap();
        assert_eq!(
            table.stop(&handle, recorder.as_ref()),
            Err(SignalRefusal::AlreadySignalled)
        );
        table.escalate(&handle, recorder.as_ref()).unwrap();
        assert_eq!(
            table.escalate(&handle, recorder.as_ref()),
            Err(SignalRefusal::AlreadySignalled)
        );
        assert_eq!(
            recorder.calls(),
            vec![(111, SessionSignal::Term), (111, SessionSignal::Kill)]
        );
    }

    /// `ESRCH` is silent in the reference and returns false, so no escalation is
    /// armed and the entry is treated as gone.
    #[test]
    fn a_missing_group_is_silently_gone() {
        let (table, _recorder) = table_with_recorder();
        let handle = table.register("s1", 111).unwrap();
        assert_eq!(table.stop(&handle, &Gone), Ok(SignalOutcome::AlreadyGone));
        assert_eq!(table.state(&handle), Some(HandleState::Reaped));
        assert_eq!(table.stop(&handle, &Gone), Err(SignalRefusal::Reaped));
    }

    /// Other errors are surfaced for the caller to warn about, and leave the
    /// entry retryable exactly like the reference's `return false`.
    #[test]
    fn other_signal_errors_are_surfaced() {
        struct Broken;
        impl GroupSignals for Broken {
            fn signal_group(&self, _pid: u32, _signal: SessionSignal) -> Result<(), SignalError> {
                Err(SignalError::Failed("EPERM".to_owned()))
            }
        }
        let table = SessionProcessTable::new();
        let handle = table.register("s1", 111).unwrap();
        assert_eq!(
            table.stop(&handle, &Broken),
            Ok(SignalOutcome::Failed("EPERM".to_owned()))
        );
        assert_eq!(table.state(&handle), Some(HandleState::Running));
        assert_eq!(
            SignalError::from_raw_os_error(Some(3)),
            SignalError::NoSuchProcess
        );
        assert!(matches!(
            SignalError::from_raw_os_error(Some(1)),
            SignalError::Failed(_)
        ));
        assert!(matches!(
            SignalError::from_raw_os_error(None),
            SignalError::Failed(_)
        ));
    }

    /// The 5 s `setTimeout` window: SIGKILL arrives at the deadline, not before.
    #[tokio::test(start_paused = true)]
    async fn escalation_fires_only_after_the_reference_delay() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 4242).unwrap();
        let signals: Arc<dyn GroupSignals> = recorder.clone();
        assert_eq!(
            table.stop(&handle, signals.as_ref()),
            Ok(SignalOutcome::Delivered)
        );

        let (cancel, cancel_rx) = watch::channel(false);
        let task = {
            let table = table.clone();
            let handle = handle.clone();
            let signals = Arc::clone(&signals);
            tokio::spawn(async move { table.escalate_after(handle, signals, cancel_rx).await })
        };
        tokio::task::yield_now().await;

        tokio::time::advance(Duration::from_millis(ESCALATION_DELAY_MS - 1)).await;
        assert_eq!(
            recorder.calls(),
            vec![(4242, SessionSignal::Term)],
            "SIGKILL must not be sent before the 5 s window ends"
        );
        tokio::time::advance(Duration::from_millis(1)).await;
        assert_eq!(
            task.await.unwrap(),
            Escalation::Elapsed(SignalOutcome::Delivered)
        );
        assert_eq!(
            recorder.calls(),
            vec![(4242, SessionSignal::Term), (4242, SessionSignal::Kill)]
        );
        assert_eq!(table.state(&handle), Some(HandleState::Escalated));
        drop(cancel);
    }

    /// The window is unref'd: if the session goes away first, no SIGKILL.
    #[tokio::test(start_paused = true)]
    async fn cancellation_skips_the_escalation() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 4242).unwrap();
        let signals: Arc<dyn GroupSignals> = recorder.clone();
        table.stop(&handle, signals.as_ref()).unwrap();

        let (cancel, cancel_rx) = watch::channel(false);
        let task = {
            let table = table.clone();
            let handle = handle.clone();
            let signals = Arc::clone(&signals);
            tokio::spawn(async move { table.escalate_after(handle, signals, cancel_rx).await })
        };
        tokio::task::yield_now().await;
        let _ = cancel.send(true);

        tokio::time::advance(Duration::from_millis(ESCALATION_DELAY_MS * 2)).await;
        assert_eq!(task.await.unwrap(), Escalation::Cancelled);
        assert_eq!(
            recorder.calls(),
            vec![(4242, SessionSignal::Term)],
            "a cancelled window must never escalate"
        );
        assert_eq!(table.state(&handle), Some(HandleState::Terminated));
    }

    /// Already cancelled before the window opens: nothing is armed at all.
    #[tokio::test(start_paused = true)]
    async fn an_already_cancelled_window_never_runs() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 4242).unwrap();
        let signals: Arc<dyn GroupSignals> = recorder.clone();
        table.stop(&handle, signals.as_ref()).unwrap();
        let (cancel, cancel_rx) = watch::channel(true);
        assert_eq!(
            table
                .escalate_after(handle.clone(), signals, cancel_rx)
                .await,
            Escalation::Cancelled
        );
        assert_eq!(recorder.calls(), vec![(4242, SessionSignal::Term)]);
        drop(cancel);
    }

    /// The process is reaped (or replaced) *during* the window: the escalation
    /// must be refused rather than signalling a pid we no longer own.
    #[tokio::test(start_paused = true)]
    async fn escalation_is_refused_when_the_child_changed_during_the_window() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 4242).unwrap();
        let signals: Arc<dyn GroupSignals> = recorder.clone();
        table.stop(&handle, signals.as_ref()).unwrap();

        let (_cancel, cancel_rx) = watch::channel(false);
        let task = {
            let table = table.clone();
            let handle = handle.clone();
            let signals = Arc::clone(&signals);
            tokio::spawn(async move { table.escalate_after(handle, signals, cancel_rx).await })
        };
        tokio::task::yield_now().await;
        assert!(table.mark_reaped(&handle));
        tokio::time::advance(Duration::from_millis(ESCALATION_DELAY_MS)).await;
        assert_eq!(
            task.await.unwrap(),
            Escalation::Refused(SignalRefusal::Reaped)
        );
        assert_eq!(recorder.calls(), vec![(4242, SessionSignal::Term)]);
    }

    /// Same window, but the session restarted with a new child: the stale handle
    /// is refused (and the new child is untouched).
    #[tokio::test(start_paused = true)]
    async fn escalation_is_refused_for_a_handle_replaced_during_the_window() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 4242).unwrap();
        let signals: Arc<dyn GroupSignals> = recorder.clone();
        table.stop(&handle, signals.as_ref()).unwrap();

        let (_cancel, cancel_rx) = watch::channel(false);
        let task = {
            let table = table.clone();
            let handle = handle.clone();
            let signals = Arc::clone(&signals);
            tokio::spawn(async move { table.escalate_after(handle, signals, cancel_rx).await })
        };
        tokio::task::yield_now().await;
        table.mark_reaped(&handle);
        let replacement = table.register("s1", 5555).unwrap();
        tokio::time::advance(Duration::from_millis(ESCALATION_DELAY_MS)).await;
        assert_eq!(
            task.await.unwrap(),
            Escalation::Refused(SignalRefusal::Replaced)
        );
        assert_eq!(
            recorder.calls(),
            vec![(4242, SessionSignal::Term)],
            "the replacement child must not be signalled by a stale handle"
        );
        assert_eq!(table.state(&replacement), Some(HandleState::Running));
    }

    /// Handles for unknown sessions signal nothing.
    #[test]
    fn an_unknown_session_is_refused() {
        let (table, recorder) = table_with_recorder();
        let handle = table.register("s1", 111).unwrap();
        assert!(table.release(&handle));
        assert_eq!(table.state(&handle), None);
        assert_eq!(
            table.stop(&handle, recorder.as_ref()),
            Err(SignalRefusal::Unknown)
        );
        assert!(!table.mark_reaped(&handle));
        assert!(recorder.calls().is_empty());
    }
}
