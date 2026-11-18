//! Per-session lifecycle bookkeeping for a thread execution owner.
//!
//! This type does not authorize requests, stop providers, persist status, or
//! supervise tasks. The owning runtime must perform those operations and call
//! `finish_turn` only after the corresponding task and its effects have ended.
//! Event checks and event commits must be serialized by that same owner.

use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_OWNER: AtomicU64 = AtomicU64::new(1);

/// Opaque callback identity: a token from another owner or an earlier turn
/// cannot authorize an event for the current turn.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TurnToken {
    owner: u64,
    sequence: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LifecycleError {
    TurnAlreadyActive,
    Stopping,
    StaleTurn,
    SequenceExhausted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cancellation {
    /// A running task must be cancelled and joined before a replacement starts.
    CancelTurn(TurnToken),
    /// No task is active. A full stop still requires provider/session cleanup.
    NoActiveTurn,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TurnState {
    Idle,
    Running(TurnToken),
    Cancelling(TurnToken),
}

/// One value belongs to one thread session owner, never a global user registry.
/// External authorization must precede any operation that changes this state.
pub struct ThreadLifecycle {
    owner: u64,
    sequence: u64,
    turn: TurnState,
    stopping: bool,
}

impl ThreadLifecycle {
    pub fn new() -> Result<Self, LifecycleError> {
        let owner = NEXT_OWNER
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_add(1))
            .map_err(|_| LifecycleError::SequenceExhausted)?;
        Ok(Self {
            owner,
            sequence: 0,
            turn: TurnState::Idle,
            stopping: false,
        })
    }

    pub fn begin_turn(&mut self) -> Result<TurnToken, LifecycleError> {
        if self.stopping {
            return Err(LifecycleError::Stopping);
        }
        if self.turn != TurnState::Idle {
            return Err(LifecycleError::TurnAlreadyActive);
        }
        self.sequence = self
            .sequence
            .checked_add(1)
            .ok_or(LifecycleError::SequenceExhausted)?;
        let token = TurnToken {
            owner: self.owner,
            sequence: self.sequence,
        };
        self.turn = TurnState::Running(token);
        Ok(token)
    }

    /// Reject events immediately when cancellation starts, including events
    /// emitted by a provider that has not acknowledged the cancellation yet.
    pub fn accepts_event(&self, token: TurnToken) -> bool {
        !self.stopping && self.turn == TurnState::Running(token)
    }

    /// Interrupt only the active turn; retain the session for later use after
    /// the cancelled turn has actually finished and been joined.
    pub fn interrupt_turn(&mut self) -> Cancellation {
        match self.turn {
            TurnState::Running(token) => {
                self.turn = TurnState::Cancelling(token);
                Cancellation::CancelTurn(token)
            }
            TurnState::Cancelling(token) => Cancellation::CancelTurn(token),
            TurnState::Idle => Cancellation::NoActiveTurn,
        }
    }

    /// Full stop permanently closes this owner to new turns, even while the
    /// current provider task is still shutting down. The caller remains
    /// responsible for stopping the provider, cleanup, and persistence.
    pub fn stop(&mut self) -> Cancellation {
        self.stopping = true;
        self.interrupt_turn()
    }

    /// Release a completed task only when its token still matches the owner.
    /// This is not evidence that a task or its external effects actually ended.
    pub fn finish_turn(&mut self, token: TurnToken) -> Result<(), LifecycleError> {
        match self.turn {
            TurnState::Running(current) | TurnState::Cancelling(current) if current == token => {
                self.turn = TurnState::Idle;
                Ok(())
            }
            _ => Err(LifecycleError::StaleTurn),
        }
    }

    /// Readiness for session cleanup, not proof cleanup has completed.
    pub fn ready_to_cleanup(&self) -> bool {
        self.stopping && self.turn == TurnState::Idle
    }
}

/// A single-thread event owner. The runtime must keep this value exclusively in
/// its session owner and authorize each external operation before reaching it.
/// Its synchronous dispatch serializes the token check and activity write.
/// Provider subscription, cancellation, task joining and persistence of session
/// status remain the caller's responsibility.
pub struct ThreadEventOwner {
    lifecycle: ThreadLifecycle,
    events: crate::services::thread_provider_events::FencedThreadProviderEvents,
    lease: crate::services::thread_provider_events::ProviderEventLease,
}

impl ThreadEventOwner {
    /// The caller must bind this identity from an authorized provider session.
    pub fn new(thread_id: String, provider_session_id: String) -> Result<Self, LifecycleError> {
        let lifecycle = ThreadLifecycle::new()?;
        let mut events =
            crate::services::thread_provider_events::FencedThreadProviderEvents::default();
        let lease = events.begin_session(&thread_id, &provider_session_id);
        Ok(Self {
            lifecycle,
            events,
            lease,
        })
    }

    pub fn begin_turn(&mut self) -> Result<TurnToken, LifecycleError> {
        self.lifecycle.begin_turn()
    }

    /// A rejected late event has no database or pending-context effects.
    pub fn dispatch(
        &mut self,
        db: &rusqlite::Connection,
        token: TurnToken,
        event: &serde_json::Value,
    ) -> rusqlite::Result<crate::services::thread_provider_events::ProviderEventDispatch> {
        if !self.lifecycle.accepts_event(token) {
            return Ok(crate::services::thread_provider_events::ProviderEventDispatch::Stale);
        }
        self.events.dispatch_bound_session(db, &self.lease, event)
    }

    /// Fence callbacks immediately; returned cancellation must be delivered to
    /// the actual running task, which must then be joined before finish_turn.
    pub fn interrupt_turn(&mut self) -> Cancellation {
        let action = self.lifecycle.interrupt_turn();
        self.events.clear_pending(&self.lease);
        action
    }

    pub fn stop(&mut self) -> Cancellation {
        let action = self.lifecycle.stop();
        self.events.revoke(&self.lease);
        action
    }

    pub fn finish_turn(&mut self, token: TurnToken) -> Result<(), LifecycleError> {
        self.lifecycle.finish_turn(token)?;
        // An abnormal provider exit may not send a terminal event to flush the
        // coalesced context; never carry it into a later turn.
        self.events.clear_pending(&self.lease);
        Ok(())
    }

    pub fn ready_to_cleanup(&self) -> bool {
        self.lifecycle.ready_to_cleanup()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interrupt_fences_events_until_task_joins_then_allows_new_turn() {
        let mut owner = ThreadLifecycle::new().unwrap();
        let old = owner.begin_turn().unwrap();
        assert!(owner.accepts_event(old));
        assert_eq!(owner.interrupt_turn(), Cancellation::CancelTurn(old));
        assert!(!owner.accepts_event(old));
        assert_eq!(owner.begin_turn(), Err(LifecycleError::TurnAlreadyActive));
        owner.finish_turn(old).unwrap();
        let new = owner.begin_turn().unwrap();
        assert!(!owner.accepts_event(old));
        assert!(owner.accepts_event(new));
        assert_eq!(owner.finish_turn(old), Err(LifecycleError::StaleTurn));
    }

    #[test]
    fn stop_fences_and_requires_join_before_cleanup_without_reopening() {
        let mut owner = ThreadLifecycle::new().unwrap();
        let token = owner.begin_turn().unwrap();
        assert_eq!(owner.stop(), Cancellation::CancelTurn(token));
        assert_eq!(owner.stop(), Cancellation::CancelTurn(token));
        assert!(!owner.accepts_event(token));
        assert!(!owner.ready_to_cleanup());
        owner.finish_turn(token).unwrap();
        assert!(owner.ready_to_cleanup());
        assert_eq!(owner.begin_turn(), Err(LifecycleError::Stopping));
    }

    #[test]
    fn tokens_are_isolated_across_owners_and_idle_stop_is_terminal() {
        let mut first = ThreadLifecycle::new().unwrap();
        let mut second = ThreadLifecycle::new().unwrap();
        let a = first.begin_turn().unwrap();
        let b = second.begin_turn().unwrap();
        assert!(!first.accepts_event(b));
        assert_eq!(first.finish_turn(b), Err(LifecycleError::StaleTurn));
        assert!(first.accepts_event(a));
        second.finish_turn(b).unwrap();
        assert_eq!(second.stop(), Cancellation::NoActiveTurn);
        assert!(second.ready_to_cleanup());
        assert_eq!(second.begin_turn(), Err(LifecycleError::Stopping));
    }
}
