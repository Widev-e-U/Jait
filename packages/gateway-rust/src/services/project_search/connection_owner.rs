//! Connection lifecycle and bounded admission for a future primary-link host.
//!
//! The host must authenticate the connection and supply an already-authorized,
//! pinned search dispatch as `authority`. This module does not create authority,
//! perform transport I/O, or change the bridge's caller-drop cancellation. A
//! socket close stops admission for that generation but does not cancel admitted
//! handlers, matching the existing TypeScript close behavior.

use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex, MutexGuard};

/// Opaque identity for a single socket attempt; never derived from peer input.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Generation(u64);

#[derive(Debug, Eq, PartialEq)]
pub enum AdmissionError {
    Stopped,
    StaleConnection,
    AtCapacity,
}

struct State {
    next: u64,
    current: Option<Generation>,
    stopped: bool,
    active: usize,
}

struct Shared<A> {
    authority: A,
    limit: NonZeroUsize,
    state: Mutex<State>,
}

/// One instance belongs to one authenticated primary-link host, across reconnects.
/// The limit covers handlers from all generations, including those still running
/// after a disconnect. The host must retain and supervise each admitted handler.
pub struct ConnectionOwner<A> {
    shared: Arc<Shared<A>>,
}

/// Keeps both authority and admission occupied until the handler actually ends.
pub struct SearchLease<A> {
    shared: Arc<Shared<A>>,
}

impl<A> Shared<A> {
    fn lock(&self) -> MutexGuard<'_, State> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl<A> ConnectionOwner<A> {
    pub fn new(authority: A, limit: NonZeroUsize) -> Self {
        Self {
            shared: Arc::new(Shared {
                authority,
                limit,
                state: Mutex::new(State {
                    next: 0,
                    current: None,
                    stopped: false,
                    active: 0,
                }),
            }),
        }
    }

    /// Begin a new socket attempt. Exhaustion fails closed; IDs are never reused.
    pub fn connect(&self) -> Option<Generation> {
        let mut state = self.shared.lock();
        if state.stopped {
            return None;
        }
        let Some(next) = state.next.checked_add(1) else {
            state.current = None;
            return None;
        };
        state.next = next;
        let generation = Generation(next);
        state.current = Some(generation);
        Some(generation)
    }

    /// Returns true only for the current close, for which the host may reconnect.
    /// Old close notifications cannot retire a replacement or schedule its retry.
    pub fn closed(&self, generation: Generation) -> bool {
        let mut state = self.shared.lock();
        if state.stopped || state.current != Some(generation) {
            return false;
        }
        state.current = None;
        true
    }

    /// Terminal stop prevents later connections and admissions. Existing handlers
    /// remain owned by the host until completion, as with a socket close.
    pub fn stop(&self) {
        let mut state = self.shared.lock();
        state.stopped = true;
        state.current = None;
    }

    pub fn admit(&self, generation: Generation) -> Result<SearchLease<A>, AdmissionError> {
        let mut state = self.shared.lock();
        if state.stopped {
            return Err(AdmissionError::Stopped);
        }
        if state.current != Some(generation) {
            return Err(AdmissionError::StaleConnection);
        }
        if state.active >= self.shared.limit.get() {
            return Err(AdmissionError::AtCapacity);
        }
        state.active += 1;
        Ok(SearchLease {
            shared: Arc::clone(&self.shared),
        })
    }
}

impl<A> SearchLease<A> {
    pub fn authority(&self) -> &A {
        &self.shared.authority
    }
}

impl<A> Drop for SearchLease<A> {
    fn drop(&mut self) {
        let mut state = self.shared.lock();
        state.active -= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconnect_does_not_release_old_work_or_accept_stale_events() {
        let owner = ConnectionOwner::new("pinned", NonZeroUsize::new(1).unwrap());
        let old = owner.connect().unwrap();
        let lease = owner.admit(old).ok().unwrap();
        assert!(owner.closed(old));
        let new = owner.connect().unwrap();
        assert!(!owner.closed(old));
        assert!(matches!(
            owner.admit(old),
            Err(AdmissionError::StaleConnection)
        ));
        assert!(matches!(owner.admit(new), Err(AdmissionError::AtCapacity)));
        assert_eq!(*lease.authority(), "pinned");
        drop(lease);
        assert!(owner.admit(new).is_ok());
    }

    #[test]
    fn generation_exhaustion_retires_current_connection() {
        let owner = ConnectionOwner::new(42, NonZeroUsize::new(1).unwrap());
        let generation = owner.connect().unwrap();
        owner.shared.lock().next = u64::MAX;
        assert!(owner.connect().is_none());
        assert!(matches!(
            owner.admit(generation),
            Err(AdmissionError::StaleConnection)
        ));
        assert!(!owner.closed(generation));
    }

    #[test]
    fn stop_is_terminal_but_does_not_revoke_admitted_work() {
        let owner = ConnectionOwner::new(42, NonZeroUsize::new(1).unwrap());
        let generation = owner.connect().unwrap();
        let lease = owner.admit(generation).ok().unwrap();
        owner.stop();
        assert!(!owner.closed(generation));
        assert!(owner.connect().is_none());
        assert!(matches!(
            owner.admit(generation),
            Err(AdmissionError::Stopped)
        ));
        assert_eq!(*lease.authority(), 42);
    }
}
