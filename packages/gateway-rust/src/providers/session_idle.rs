//! Port of `packages/gateway/src/providers/session-idle.ts`.
//!
//! The reference retires an ACP CLI session when no *human* message and no
//! in-flight prompt has touched it for [`CLI_USER_IDLE_TIMEOUT_MS`]. Its shape
//! is a process-wide `cliSessionIdle` singleton holding two `Map`s plus a
//! `setInterval` reaper. The native port keeps the same state machine but
//! splits the `setInterval` out into [`CliSessionIdleTracker::drive`], an async
//! loop the caller spawns when [`CliSessionIdleTracker::watch`] reports that it
//! created the timer (the reference's `this.timer ??= setInterval(...)`).
//!
//! Seams: every clock read goes through the injected [`Clock`], teardown is
//! returned to the caller as [`Expired`] (the reference stores an `expire`
//! closure; `acp-provider.ts` passes `() => this.stopSession(sessionId)`).
//! The returned IDs do not prove registry ownership if a session is replaced
//! before teardown; integration must provide that authority. The current native
//! ACP provider does not own a session registry or a driver supervisor. An
//! eventual owner must atomically check the registry entry identity at removal
//! and prevent driver restart during shutdown. Timer cancellation arrives as a
//! [`watch`] receiver. Tests do not spawn a process.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::Duration;

use tokio::sync::watch;

use crate::time::Clock;

/// `export const CLI_USER_IDLE_TIMEOUT_MS = 10 * 60_000;`
pub const CLI_USER_IDLE_TIMEOUT_MS: i64 = 600_000;

/// `this.timer ??= setInterval(() => this.reap(), 5_000);`
pub const REAP_INTERVAL_MS: u64 = 5_000;

/// `isBusy: () => boolean` — the per-session liveness probe the caller owns.
pub type BusyProbe = Arc<dyn Fn() -> bool + Send + Sync>;

/// A session the tracker has just retired, in reaping order.
///
/// The reference calls `forget(id)` and then `void session.expire()`; the
/// caller of [`CliSessionIdleTracker::drive`] performs that teardown.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Expired {
    /// Reference: the `id` key of `this.sessions`.
    pub session_id: String,
    /// Reference: `session.threadId`.
    pub thread_id: String,
}

/// Reference: `interface IdleSession`.
struct IdleSession {
    /// Changes on replacement or user activity, even when the clock is unchanged.
    identity: Arc<()>,
    /// `session.threadId`
    thread_id: String,
    /// `session.lastUserMessageAt`
    last_user_message_at: i64,
    /// `session.isBusy`
    is_busy: BusyProbe,
}

/// The reference's two `Map`s plus `this.timer`.
/// Ownership of one armed driver generation.
#[must_use = "the token must be passed to drive to keep the timer armed"]
pub struct DriverToken(Arc<()>, Weak<Mutex<State>>);

impl Drop for DriverToken {
    fn drop(&mut self) {
        let Some(state) = self.1.upgrade() else {
            return;
        };
        let mut state = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if state
            .timer_generation
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(&self.0, current))
        {
            state.timer_generation = None;
        }
    }
}

struct State {
    /// `this.sessions` — kept in insertion order, like a JS `Map`.
    sessions: Vec<(String, IdleSession)>,
    /// `this.userMessages`
    user_messages: HashMap<String, i64>,
    /// `this.timer !== undefined`: a driver loop owns this tracker.
    timer_generation: Option<Arc<()>>,
}

impl State {
    /// Reference `pruneMessages(now)`:
    /// `if (now - at >= CLI_USER_IDLE_TIMEOUT_MS) this.userMessages.delete(id);`
    ///
    /// Note the `>=` (a message aged exactly to the timeout is dropped) and
    /// that this never touches `sessions`, which hold their own copy.
    fn prune_messages(&mut self, now: i64) {
        let timeout = i128::from(CLI_USER_IDLE_TIMEOUT_MS);
        self.user_messages
            .retain(|_, at| i128::from(now) - i128::from(*at) < timeout);
    }

    fn position(&self, session_id: &str) -> Option<usize> {
        self.sessions.iter().position(|(id, _)| id == session_id)
    }

    /// Reference `forget(id)` followed by
    /// `if (this.sessions.size === 0 && this.timer) { clearInterval(...); }`.
    fn forget(&mut self, session_id: &str) -> Option<IdleSession> {
        let index = self.position(session_id)?;
        let (_, removed) = self.sessions.remove(index);
        if self.sessions.is_empty() {
            self.timer_generation = None;
        }
        Some(removed)
    }
}

/// Port of `class CliSessionIdleTracker` (the reference exports the singleton
/// `cliSessionIdle`; this type is cheap to clone and clones share state).
#[derive(Clone)]
pub struct CliSessionIdleTracker {
    state: Arc<Mutex<State>>,
    clock: Clock,
}

impl CliSessionIdleTracker {
    pub fn new(clock: Clock) -> Self {
        Self {
            state: Arc::new(Mutex::new(State {
                sessions: Vec::new(),
                user_messages: HashMap::new(),
                timer_generation: None,
            })),
            clock,
        }
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        // The reference cannot observe a poisoned tracker; recovering keeps a
        // panicking `isBusy` probe from wedging every later session.
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Reference `recordUserMessage(threadId)`. Only human messages extend the
    /// lease; tokens, tools and automatic turns do not.
    ///
    /// Order matters and is mirrored exactly: prune with `now`, remember
    /// `userMessages[threadId] = now`, then push `now` into every *live
    /// session* of that thread — the second step is what resets a deadline.
    pub fn record_user_message(&self, thread_id: &str) {
        let now = (self.clock)();
        let mut state = self.lock();
        state.prune_messages(now);
        state.user_messages.insert(thread_id.to_owned(), now);
        for (_, session) in state.sessions.iter_mut() {
            if session.thread_id == thread_id {
                session.identity = Arc::new(());
                session.last_user_message_at = now;
            }
        }
    }

    /// Reference `watch(id, threadId, isBusy, expire)`.
    ///
    /// Returns a driver token when this call created the timer, i.e. when the caller
    /// must start exactly one [`Self::drive`]. Dropping the token or aborting
    /// the driver disarms that generation; tracked sessions remain and a later
    /// watch can arm another driver. A supervisor must arrange that restart.
    pub fn watch(
        &self,
        session_id: &str,
        thread_id: &str,
        is_busy: BusyProbe,
    ) -> Option<DriverToken> {
        let mut state = self.lock();
        // `this.pruneMessages(Date.now());` — first clock read.
        state.prune_messages((self.clock)());
        // `lastUserMessageAt: this.userMessages.get(threadId) ?? Date.now()`
        // — `??` only evaluates the right-hand side when the entry is absent,
        // so the clock is read a second time only for a thread with no fresh
        // message.
        let last_user_message_at = match state.user_messages.get(thread_id) {
            Some(at) => *at,
            None => (self.clock)(),
        };
        let session = IdleSession {
            identity: Arc::new(()),
            thread_id: thread_id.to_owned(),
            last_user_message_at,
            is_busy,
        };
        let replaced = match state.position(session_id) {
            // `Map.set` on an existing key replaces the value but keeps its
            // insertion position.
            Some(index) => Some(std::mem::replace(&mut state.sessions[index].1, session)),
            None => {
                state.sessions.push((session_id.to_owned(), session));
                None
            }
        };
        let token = if state.timer_generation.is_none() {
            let generation = Arc::new(());
            state.timer_generation = Some(Arc::clone(&generation));
            Some(DriverToken(generation, Arc::downgrade(&self.state)))
        } else {
            None
        };
        // Caller-owned probe destructors may re-enter the tracker.
        drop(state);
        drop(replaced);
        token
    }

    /// Reference `forget(id)`. Returns whether the session was tracked, and
    /// disarms the timer when the last session is gone.
    pub fn forget(&self, session_id: &str) -> bool {
        let removed = self.lock().forget(session_id);
        removed.is_some()
    }

    /// Claim a replacement driver for tracked sessions after a driver exits.
    ///
    /// The supervisor is responsible for calling this after unexpected exit and
    /// for stopping retries during shutdown. Concurrent callers cannot both
    /// claim the same tracker, and an empty tracker never starts a driver.
    pub fn rearm_driver(&self) -> Option<DriverToken> {
        let mut state = self.lock();
        if state.sessions.is_empty() || state.timer_generation.is_some() {
            return None;
        }
        let generation = Arc::new(());
        state.timer_generation = Some(Arc::clone(&generation));
        Some(DriverToken(generation, Arc::downgrade(&self.state)))
    }

    /// `this.timer !== undefined`.
    pub fn timer_armed(&self) -> bool {
        self.lock().timer_generation.is_some()
    }

    /// Whether `session_id` is currently tracked (`this.sessions.has(id)`).
    pub fn is_tracking(&self, session_id: &str) -> bool {
        self.lock().position(session_id).is_some()
    }

    /// Reference `reap(now = Date.now())`.
    pub fn reap(&self) -> Vec<Expired> {
        self.reap_at((self.clock)())
    }

    /// Reference `reap(now)`, i.e. `reap` with its default argument supplied.
    ///
    /// ```text
    /// if (now - session.lastUserMessageAt < CLI_USER_IDLE_TIMEOUT_MS || session.isBusy()) continue;
    /// ```
    ///
    /// Two details are load-bearing: the comparison is `<` (a session aged
    /// exactly to the timeout *is* retired), and `isBusy()` is short-circuited
    /// behind the arithmetic, so a probe is only consulted past the deadline.
    /// Retiring is synchronous (`this.forget(id)` runs before the teardown
    /// starts) so a message that arrives afterwards opens a fresh session.
    pub fn reap_at(&self, now: i64) -> Vec<Expired> {
        self.reap_at_owned(now, None)
    }

    fn reap_at_owned(&self, now: i64, generation: Option<&Arc<()>>) -> Vec<Expired> {
        let timeout = i128::from(CLI_USER_IDLE_TIMEOUT_MS);
        // Snapshot under the lock: `sessions` doubles as the reference's
        // iteration source (insertion order) and its mutation target.
        let candidates: Vec<(String, String, i64, BusyProbe, Arc<()>)> = {
            let mut state = self.lock();
            if generation.is_some_and(|g| {
                !state
                    .timer_generation
                    .as_ref()
                    .is_some_and(|current| Arc::ptr_eq(g, current))
            }) {
                return Vec::new();
            }
            state.prune_messages(now);
            state
                .sessions
                .iter()
                .map(|(id, session)| {
                    (
                        id.clone(),
                        session.thread_id.clone(),
                        session.last_user_message_at,
                        Arc::clone(&session.is_busy),
                        Arc::clone(&session.identity),
                    )
                })
                .collect()
        };
        let mut expired = Vec::new();
        for (session_id, thread_id, last_user_message_at, is_busy, identity) in candidates {
            if i128::from(now) - i128::from(last_user_message_at) < timeout {
                continue;
            }
            // Probes run outside the tracker lock: a probe is caller code and
            // may legitimately touch the tracker.
            if is_busy() {
                continue;
            }
            let mut state = self.lock();
            if generation.is_some_and(|g| {
                !state
                    .timer_generation
                    .as_ref()
                    .is_some_and(|current| Arc::ptr_eq(g, current))
            }) {
                break;
            }
            let Some(index) = state.position(&session_id) else {
                continue;
            };
            // The probe ran without the lock, so re-check that this is still
            // the same lease and activity timestamp before
            // retiring it — a user message in between must win.
            let session = &state.sessions[index].1;
            if !Arc::ptr_eq(&session.identity, &identity)
                || session.thread_id != thread_id
                || session.last_user_message_at != last_user_message_at
            {
                continue;
            }
            let removed = state.forget(&session_id);
            drop(state);
            drop(removed);
            expired.push(Expired {
                session_id,
                thread_id,
            });
        }
        expired
    }

    /// Port of `setInterval(() => this.reap(), 5_000)`.
    ///
    /// Ticks every [`REAP_INTERVAL_MS`] while the timer is armed and hands each
    /// retired session to `on_expire` in reaping order. `on_expire` mirrors
    /// `void session.expire()`: it must start the teardown and return, so one
    /// slow teardown cannot delay the next tick or block the loop past the
    /// reference's fixed cadence.
    ///
    /// `cancel` mirrors "the session/caller went away": the timer stops without
    /// firing (no reap happens once cancellation is observed) and the tracker is
    /// left disarmed so a later [`Self::watch`] starts a fresh timer.
    ///
    /// The loop also returns when nothing is tracked any more, which is the
    /// reference's `clearInterval` in `forget`.
    pub async fn drive<F>(
        &self,
        token: DriverToken,
        mut cancel: watch::Receiver<bool>,
        mut on_expire: F,
    ) where
        F: FnMut(Expired),
    {
        let interval = Duration::from_millis(REAP_INTERVAL_MS);
        let mut next_tick = tokio::time::Instant::now() + interval;
        loop {
            if *cancel.borrow() {
                break;
            }
            // Reference: `forget` already cleared the interval.
            if !self
                .lock()
                .timer_generation
                .as_ref()
                .is_some_and(|current| Arc::ptr_eq(&token.0, current))
            {
                return;
            }
            tokio::select! {
                biased;
                // A dropped sender counts as cancellation too: an unbounded wait
                // would otherwise outlive its owner. A false update is not cancellation.
                changed = cancel.changed() => {
                    if changed.is_err() || *cancel.borrow() {
                        break;
                    }
                    continue;
                }
                () = tokio::time::sleep_until(next_tick) => {}
            }
            next_tick += interval;
            // `setInterval` keeps its cadence and drops the ticks missed while a
            // reap ran instead of queueing them.
            let now = tokio::time::Instant::now();
            if next_tick <= now {
                next_tick = now + interval;
            }
            // Cancellation that lands exactly on a tick wins the race: the
            // reference's timer stops without firing.
            if *cancel.borrow() {
                break;
            }
            for expired in self.reap_at_owned((self.clock)(), Some(&token.0)) {
                on_expire(expired);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn supervisor_can_rearm_only_one_driver_for_retained_sessions() {
        use std::sync::{Arc, Barrier};
        let tracker = Arc::new(super::CliSessionIdleTracker::new(Arc::new(|| 0)));
        assert!(tracker.rearm_driver().is_none());
        let original = tracker
            .watch("session", "thread", Arc::new(|| false))
            .unwrap();
        assert!(tracker.rearm_driver().is_none());
        drop(original);
        let barrier = Arc::new(Barrier::new(3));
        let attempts: Vec<_> = (0..2)
            .map(|_| {
                let tracker = Arc::clone(&tracker);
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    let token = tracker.rearm_driver();
                    barrier.wait();
                    token
                })
            })
            .collect();
        barrier.wait();
        barrier.wait();
        let tokens: Vec<_> = attempts
            .into_iter()
            .filter_map(|attempt| attempt.join().unwrap())
            .collect();
        assert_eq!(tokens.len(), 1);
        assert!(tracker.is_tracking("session"));
        drop(tokens);
        assert!(!tracker.timer_armed());
        assert!(tracker.forget("session"));
        assert!(tracker.rearm_driver().is_none());
    }

    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
    use tokio::sync::mpsc::{UnboundedReceiver, unbounded_channel};
    use tokio::task::JoinHandle;

    #[test]
    fn probe_destructors_run_outside_tracker_lock() {
        struct ProbeDrop {
            tracker: CliSessionIdleTracker,
            unlocked: Arc<AtomicBool>,
        }
        impl Drop for ProbeDrop {
            fn drop(&mut self) {
                self.unlocked
                    .store(self.tracker.state.try_lock().is_ok(), Ordering::SeqCst);
            }
        }
        let (clock, _) = manual_clock(0);
        let tracker = CliSessionIdleTracker::new(clock);
        let unlocked = Arc::new(AtomicBool::new(false));
        let make_probe = || -> BusyProbe {
            let guard = ProbeDrop {
                tracker: tracker.clone(),
                unlocked: unlocked.clone(),
            };
            Arc::new(move || {
                let _ = &guard;
                false
            })
        };
        let token = tracker.watch("session", "thread", make_probe()).unwrap();
        assert!(tracker.watch("session", "thread", make_probe()).is_none());
        assert!(
            unlocked.swap(false, Ordering::SeqCst),
            "replacement dropped probe under lock"
        );
        assert!(tracker.forget("session"));
        assert!(
            unlocked.load(Ordering::SeqCst),
            "forget dropped probe under lock"
        );
        drop(token);
    }

    /// A clock the test owns outright: no wall clock, no sleeping.
    fn manual_clock(start: i64) -> (Clock, Arc<AtomicI64>) {
        let now = Arc::new(AtomicI64::new(start));
        let handle = Arc::clone(&now);
        let clock: Clock = Arc::new(move || handle.load(Ordering::SeqCst));
        (clock, now)
    }

    /// A clock over tokio's pausable monotonic time, for driver tests: it only
    /// moves when the test calls `tokio::time::advance`.
    fn paused_clock() -> Clock {
        let origin = tokio::time::Instant::now();
        Arc::new(move || i64::try_from(origin.elapsed().as_millis()).unwrap_or(i64::MAX))
    }

    /// Advances tokio's paused clock by `ms` and then lets the driver observe it.
    ///
    /// `tokio::time::advance` only guarantees a single yield, while a `sleep_until`
    /// woken by the advance is polled on a later turn; settling here keeps the
    /// tests deterministic without touching the wall clock.
    async fn advance_ms(ms: u64) {
        tokio::time::advance(Duration::from_millis(ms)).await;
        for _ in 0..8 {
            tokio::task::yield_now().await;
        }
    }

    fn never_busy() -> BusyProbe {
        Arc::new(|| false)
    }

    fn expiry(session_id: &str, thread_id: &str) -> Expired {
        Expired {
            session_id: session_id.to_owned(),
            thread_id: thread_id.to_owned(),
        }
    }

    /// A running `drive` loop plus its cancellation switch, so tests observe
    /// expirations without touching the wall clock.
    struct Driver {
        expired: UnboundedReceiver<Expired>,
        cancel: watch::Sender<bool>,
        join: JoinHandle<()>,
    }

    impl Driver {
        /// Advances paused time by whole reap intervals, i.e. exactly one
        /// `setInterval` tick each (the loop keeps a fixed cadence).
        async fn tick(&mut self, times: usize) {
            for _ in 0..times {
                advance_ms(REAP_INTERVAL_MS).await;
            }
        }

        fn take(&mut self) -> Vec<Expired> {
            let mut out = Vec::new();
            while let Ok(expired) = self.expired.try_recv() {
                out.push(expired);
            }
            out
        }
    }

    async fn spawn_driver(tracker: &CliSessionIdleTracker, token: DriverToken) -> Driver {
        let (cancel, cancel_rx) = watch::channel(false);
        let (tx, expired) = unbounded_channel();
        let tracker = tracker.clone();
        let join = tokio::spawn(async move {
            tracker
                .drive(token, cancel_rx, |expired| {
                    let _ = tx.send(expired);
                })
                .await;
        });
        // Poll the loop once so its first tick is scheduled from "now" instead of
        // drifting with the first `advance` call.
        tokio::task::yield_now().await;
        Driver {
            expired,
            cancel,
            join,
        }
    }

    /// `if (now - session.lastUserMessageAt < CLI_USER_IDLE_TIMEOUT_MS ...)` —
    /// a session aged exactly to the timeout is retired, one millisecond less is
    /// not, and the deadline is reached by the timer, never anticipated.
    #[tokio::test(start_paused = true)]
    async fn fires_exactly_at_the_deadline_and_never_before() {
        let tracker = CliSessionIdleTracker::new(paused_clock());
        tracker.record_user_message("t1");
        let token = tracker.watch("s1", "t1", never_busy()).unwrap();
        let mut driver = spawn_driver(&tracker, token).await;

        // 119 ticks of 5 s: 595 s elapsed, one interval short of the deadline.
        driver.tick(119).await;
        assert!(
            driver.take().is_empty(),
            "must not fire before the deadline"
        );
        advance_ms(REAP_INTERVAL_MS - 1).await;
        assert!(
            driver.take().is_empty(),
            "must not fire a single millisecond early"
        );
        advance_ms(1).await;
        assert_eq!(driver.take(), vec![expiry("s1", "t1")]);

        // The last session is gone, so `forget` cleared the interval and the
        // driver finishes on its own.
        driver.join.await.unwrap();
        assert!(!tracker.timer_armed());
        assert!(!tracker.is_tracking("s1"));
    }

    /// Reference `recordUserMessage`: `session.lastUserMessageAt = now` for every
    /// live session of that thread, which pushes the deadline out.
    #[tokio::test(start_paused = true)]
    async fn activity_resets_the_deadline() {
        let tracker = CliSessionIdleTracker::new(paused_clock());
        tracker.record_user_message("t1");
        let token = tracker.watch("s1", "t1", never_busy()).unwrap();
        let mut driver = spawn_driver(&tracker, token).await;

        driver.tick(60).await; // 300 s
        tracker.record_user_message("t1"); // deadline moves to 900 s
        driver.tick(60).await; // 600 s: the original deadline passes
        assert!(
            driver.take().is_empty(),
            "activity must push the deadline out"
        );
        driver.tick(59).await; // 895 s
        assert!(driver.take().is_empty());
        advance_ms(REAP_INTERVAL_MS - 1).await; // 899_999
        assert!(
            driver.take().is_empty(),
            "must not fire one millisecond early"
        );
        advance_ms(1).await; // 900 s
        assert_eq!(driver.take(), vec![expiry("s1", "t1")]);
        driver.join.await.unwrap();
    }

    /// A message on an unrelated thread must not extend this session's lease.
    #[test]
    fn activity_on_another_thread_does_not_reset_the_deadline() {
        let (clock, now) = manual_clock(0);
        let tracker = CliSessionIdleTracker::new(clock);
        tracker.record_user_message("t1");
        tracker.watch("s1", "t1", never_busy());
        now.store(CLI_USER_IDLE_TIMEOUT_MS - 1, Ordering::SeqCst);
        tracker.record_user_message("other");
        now.store(CLI_USER_IDLE_TIMEOUT_MS, Ordering::SeqCst);
        assert_eq!(
            tracker.reap(),
            vec![expiry("s1", "t1")],
            "only the session's own thread extends its lease"
        );
    }

    /// The reference stops its `setInterval` when the caller goes away; a stopped
    /// timer must never reap.
    #[tokio::test(start_paused = true)]
    async fn cancellation_stops_the_timer_without_firing() {
        let tracker = CliSessionIdleTracker::new(paused_clock());
        tracker.record_user_message("t1");
        let token = tracker.watch("s1", "t1", never_busy()).unwrap();
        let mut driver = spawn_driver(&tracker, token).await;
        // One tick proves the timer was live.
        driver.tick(1).await;
        assert!(driver.take().is_empty());

        // Cancellation delivered on a tick boundary: `clearInterval` wins.
        let _ = driver.cancel.send(true);
        driver.tick(121).await; // > 600 s
        assert!(driver.take().is_empty(), "a cancelled timer never fires");
        driver.join.await.unwrap();
        assert!(!tracker.timer_armed());
        assert!(
            tracker.is_tracking("s1"),
            "cancellation must not retire the session"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn stale_driver_cannot_disarm_or_reap_replacement() {
        let tracker = CliSessionIdleTracker::new(paused_clock());
        let old = tracker.watch("old", "t", never_busy()).unwrap();
        assert!(tracker.forget("old"));
        let replacement = tracker.watch("new", "t", never_busy()).unwrap();
        assert!(
            tracker
                .reap_at_owned(CLI_USER_IDLE_TIMEOUT_MS, Some(&old.0))
                .is_empty()
        );
        let (cancel, rx) = watch::channel(true);
        tracker
            .drive(old, rx, |_| panic!("stale driver expired a session"))
            .await;
        assert!(tracker.timer_armed());
        assert!(tracker.is_tracking("new"));
        let (_, rx) = watch::channel(true);
        tracker.drive(replacement, rx, |_| {}).await;
        assert!(!tracker.timer_armed());
        drop(cancel);
    }

    #[test]
    fn generation_replaced_during_probe_cannot_retire_new_watch() {
        let (clock, _) = manual_clock(0);
        let tracker = CliSessionIdleTracker::new(clock);
        let probe_tracker = tracker.clone();
        let replacement_token = Arc::new(Mutex::new(None));
        let probe_token = Arc::clone(&replacement_token);
        let probe: BusyProbe = Arc::new(move || {
            assert!(probe_tracker.forget("old"));
            *probe_token.lock().unwrap() = probe_tracker.watch("new", "t", never_busy());
            false
        });
        let old = tracker.watch("old", "t", probe).unwrap();
        assert!(
            tracker
                .reap_at_owned(CLI_USER_IDLE_TIMEOUT_MS, Some(&old.0))
                .is_empty()
        );
        let replacement = replacement_token.lock().unwrap().take().unwrap();
        assert!(tracker.timer_armed());
        assert!(tracker.is_tracking("new"));
        assert_eq!(
            tracker.reap_at_owned(CLI_USER_IDLE_TIMEOUT_MS, Some(&replacement.0)),
            vec![expiry("new", "t")]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn dropped_and_aborted_tokens_disarm_only_their_generation() {
        let tracker = CliSessionIdleTracker::new(paused_clock());
        let old = tracker.watch("old", "t", never_busy()).unwrap();
        assert!(tracker.forget("old"));
        let replacement = tracker.watch("new", "t", never_busy()).unwrap();
        drop(old);
        assert!(
            tracker.timer_armed(),
            "stale token must not disarm replacement"
        );
        drop(replacement);
        assert!(
            !tracker.timer_armed(),
            "an unstarted token disarms its generation"
        );
        assert!(tracker.is_tracking("new"));

        let token = tracker.watch("new", "t", never_busy()).unwrap();
        let driver = spawn_driver(&tracker, token).await;
        driver.join.abort();
        assert!(driver.join.await.unwrap_err().is_cancelled());
        assert!(
            !tracker.timer_armed(),
            "aborting the driver releases its token"
        );
        assert!(tracker.is_tracking("new"));
        assert!(tracker.watch("new", "t", never_busy()).is_some());
    }

    #[tokio::test(start_paused = true)]
    async fn false_cancellation_update_keeps_driver_running() {
        let tracker = CliSessionIdleTracker::new(paused_clock());
        let token = tracker.watch("s1", "t1", never_busy()).unwrap();
        let mut driver = spawn_driver(&tracker, token).await;
        driver.cancel.send(false).unwrap();
        tokio::task::yield_now().await;
        assert!(tracker.timer_armed());
        driver.tick(120).await;
        assert_eq!(driver.take(), vec![expiry("s1", "t1")]);
        driver.join.await.unwrap();
    }

    /// `this.timer ??= setInterval(...)`: after a fire (or a cancellation) the
    /// next `watch` arms a fresh timer.
    #[tokio::test(start_paused = true)]
    async fn the_timer_rearms_after_it_fires() {
        let tracker = CliSessionIdleTracker::new(paused_clock());
        tracker.record_user_message("t1");
        let token = tracker.watch("s1", "t1", never_busy()).unwrap();
        let mut driver = spawn_driver(&tracker, token).await;
        driver.tick(120).await; // 600 s
        assert_eq!(driver.take(), vec![expiry("s1", "t1")]);
        driver.join.await.unwrap();
        assert!(!tracker.timer_armed());

        tracker.record_user_message("t2");
        let token = tracker
            .watch("s2", "t2", never_busy())
            .expect("watch must arm a new timer");
        let mut driver = spawn_driver(&tracker, token).await;
        assert!(tracker.timer_armed());
        driver.tick(119).await;
        assert!(driver.take().is_empty());
        driver.tick(1).await;
        assert_eq!(driver.take(), vec![expiry("s2", "t2")]);
        driver.join.await.unwrap();
    }

    /// Reference `reap(now)`: the `<` boundary, a clock that jumps backwards, and
    /// the fact that a retired session is forgotten exactly once.
    #[test]
    fn deadline_arithmetic_matches_the_reference() {
        let (clock, _now) = manual_clock(0);
        let tracker = CliSessionIdleTracker::new(clock);
        tracker.record_user_message("t1");
        assert!(tracker.watch("s1", "t1", never_busy()).is_some());

        assert!(tracker.reap_at(CLI_USER_IDLE_TIMEOUT_MS - 1).is_empty());
        // A clock that goes backwards yields a negative age: still alive.
        assert!(tracker.reap_at(-1).is_empty());
        assert!(tracker.reap_at(-CLI_USER_IDLE_TIMEOUT_MS).is_empty());
        assert_eq!(
            tracker.reap_at(CLI_USER_IDLE_TIMEOUT_MS),
            vec![expiry("s1", "t1")]
        );
        // Forgotten, so a later reap has nothing left to do.
        assert!(
            tracker
                .reap_at(CLI_USER_IDLE_TIMEOUT_MS + 60_000)
                .is_empty()
        );
        assert!(
            tracker.reap_at(i64::MAX).is_empty(),
            "no overflow on absurd clocks"
        );
    }

    /// `pruneMessages` drops a user message aged `>= TIMEOUT`, so `watch` then
    /// stamps `Date.now()` instead of backdating the new session — a session
    /// created after a long silence does not expire immediately.
    #[test]
    fn a_stale_user_message_does_not_backdate_a_new_session() {
        let (clock, now) = manual_clock(0);
        let tracker = CliSessionIdleTracker::new(clock);
        tracker.record_user_message("t1");
        now.store(CLI_USER_IDLE_TIMEOUT_MS, Ordering::SeqCst);
        assert!(tracker.watch("s1", "t1", never_busy()).is_some());
        assert!(
            tracker.reap_at(CLI_USER_IDLE_TIMEOUT_MS).is_empty(),
            "an expired user message must not backdate the session"
        );
        assert_eq!(
            tracker.reap_at(2 * CLI_USER_IDLE_TIMEOUT_MS),
            vec![expiry("s1", "t1")]
        );
    }

    /// `isBusy()` sits behind `||`, so it is only consulted past the deadline,
    /// and a busy session is spared until the probe reports idle.
    #[test]
    fn the_busy_probe_is_short_circuited_and_spares_the_session() {
        let (clock, now) = manual_clock(0);
        let tracker = CliSessionIdleTracker::new(clock);
        let busy = Arc::new(AtomicBool::new(false));
        let probes = Arc::new(AtomicI64::new(0));
        tracker.record_user_message("t1");
        let probe: BusyProbe = {
            let busy = Arc::clone(&busy);
            let probes = Arc::clone(&probes);
            Arc::new(move || {
                probes.fetch_add(1, Ordering::SeqCst);
                busy.load(Ordering::SeqCst)
            })
        };
        tracker.watch("s1", "t1", probe);

        now.store(CLI_USER_IDLE_TIMEOUT_MS - 1, Ordering::SeqCst);
        assert!(tracker.reap().is_empty());
        assert_eq!(
            probes.load(Ordering::SeqCst),
            0,
            "isBusy() must not be consulted before the deadline"
        );

        now.store(CLI_USER_IDLE_TIMEOUT_MS, Ordering::SeqCst);
        busy.store(true, Ordering::SeqCst);
        assert!(
            tracker.reap().is_empty(),
            "a busy session survives its deadline"
        );
        assert_eq!(probes.load(Ordering::SeqCst), 1);
        busy.store(false, Ordering::SeqCst);
        assert_eq!(tracker.reap(), vec![expiry("s1", "t1")]);
    }

    #[test]
    fn rewatch_during_busy_probe_does_not_retire_replacement() {
        let (clock, _) = manual_clock(0);
        let tracker = CliSessionIdleTracker::new(clock);
        let probe_tracker = tracker.clone();
        let probe: BusyProbe = Arc::new(move || {
            probe_tracker.watch("s1", "t1", never_busy());
            false
        });
        tracker.watch("s1", "t1", probe);
        assert!(tracker.reap_at(CLI_USER_IDLE_TIMEOUT_MS).is_empty());
        assert!(tracker.is_tracking("s1"));
        assert_eq!(
            tracker.reap_at(CLI_USER_IDLE_TIMEOUT_MS),
            vec![expiry("s1", "t1")]
        );
    }

    #[test]
    fn same_timestamp_activity_during_probe_prevents_stale_retirement() {
        let (clock, _) = manual_clock(0);
        let tracker = CliSessionIdleTracker::new(clock);
        let probe_tracker = tracker.clone();
        let called = Arc::new(AtomicBool::new(false));
        let probe_called = Arc::clone(&called);
        let probe: BusyProbe = Arc::new(move || {
            if !probe_called.swap(true, Ordering::SeqCst) {
                probe_tracker.record_user_message("t1");
            }
            false
        });
        tracker.watch("s1", "t1", probe);
        assert!(tracker.reap_at(CLI_USER_IDLE_TIMEOUT_MS).is_empty());
        assert!(tracker.is_tracking("s1"));
        assert_eq!(
            tracker.reap_at(CLI_USER_IDLE_TIMEOUT_MS),
            vec![expiry("s1", "t1")]
        );
    }

    /// Reference `forget` + `sessions.size === 0 && timer`: the interval is
    /// cleared only with the last session, and re-watching keeps it.
    #[test]
    fn the_timer_is_disarmed_only_with_the_last_session() {
        let (clock, _now) = manual_clock(0);
        let tracker = CliSessionIdleTracker::new(clock);
        let _token = tracker
            .watch("a", "ta", never_busy())
            .expect("first watch arms");
        assert!(
            tracker.watch("b", "tb", never_busy()).is_none(),
            "timer already armed"
        );
        assert!(
            tracker.watch("a", "ta", never_busy()).is_none(),
            "re-watch keeps it"
        );
        assert!(tracker.timer_armed());

        assert!(tracker.forget("a"));
        assert!(tracker.timer_armed(), "one session still needs the timer");
        assert!(!tracker.forget("a"), "forgetting twice is a no-op");
        assert!(tracker.forget("b"));
        assert!(!tracker.timer_armed());
    }
}
