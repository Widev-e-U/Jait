//! Active channel-turn routing only. This registry does not authenticate a caller
//! or establish authority to resolve a consent request.
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct SessionKey {
    pub owner_id: String,
    pub session_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConversationTarget {
    pub channel_id: String,
    pub conversation_id: String,
}

#[derive(Clone, Debug)]
pub struct RouteSnapshot {
    pub target: ConversationTarget,
    generation: u64,
    registry: Arc<()>,
}

impl PartialEq for RouteSnapshot {
    fn eq(&self, other: &Self) -> bool {
        self.target == other.target
            && self.generation == other.generation
            && Arc::ptr_eq(&self.registry, &other.registry)
    }
}
impl Eq for RouteSnapshot {}

#[derive(Debug, Eq, PartialEq)]
pub enum RegisterError {
    AlreadyActive,
    ConversationActive,
    GenerationExhausted,
}

#[derive(Default)]
struct State {
    next_generation: u64,
    routes: HashMap<SessionKey, RouteSnapshot>,
}

/// Shared registry for active turns. Dropping a lease, including on task
/// cancellation, removes the route without disturbing a replacement route.
#[derive(Clone, Default)]
pub struct SessionOwnership {
    state: Arc<Mutex<State>>,
    registry: Arc<()>,
}

/// Holds the routing lock only while a synchronous consent queue claim is made.
/// Never await, invoke callbacks, perform persistence, or acquire the route lock
/// again while this guard is alive. Drop it immediately after the queue claim.
/// The lock order is route registry then consent queue; the reverse is forbidden.
#[must_use]
pub struct RouteClaimGuard<'a> {
    _state: MutexGuard<'a, State>,
}

pub struct RouteLease {
    state: Weak<Mutex<State>>,
    key: SessionKey,
    generation: u64,
}

impl SessionOwnership {
    /// The caller must already have authenticated `key.owner_id` and admitted
    /// the turn. Duplicate active registrations are rejected, even for the same
    /// target: otherwise one turn could prematurely remove another's route.
    pub fn register(
        &self,
        key: SessionKey,
        target: ConversationTarget,
    ) -> Result<RouteLease, RegisterError> {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        // Consent events identify a session without an owner, so a session ID
        // must have exactly one active route across all owners.
        if state
            .routes
            .keys()
            .any(|active| active.session_id == key.session_id)
        {
            return Err(RegisterError::AlreadyActive);
        }
        if state.routes.values().any(|route| route.target == target) {
            return Err(RegisterError::ConversationActive);
        }
        let generation = state
            .next_generation
            .checked_add(1)
            .ok_or(RegisterError::GenerationExhausted)?;
        state.next_generation = generation;
        state.routes.insert(
            key.clone(),
            RouteSnapshot {
                target,
                generation,
                registry: self.registry.clone(),
            },
        );
        Ok(RouteLease {
            state: Arc::downgrade(&self.state),
            key,
            generation,
        })
    }

    pub fn lookup(&self, key: &SessionKey) -> Option<RouteSnapshot> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .routes
            .get(key)
            .cloned()
    }

    /// Serialize validation and a subsequent synchronous queue claim against
    /// lease teardown. This guard grants no authorization: the queue claim must
    /// independently check request identity, session and decision authority.
    /// Callers must use a queue primitive that only claims under its own lock;
    /// `approve`/`reject` may persist or invoke callbacks and are not suitable.
    pub fn lock_for_claim<'a>(
        &'a self,
        key: &SessionKey,
        snapshot: &RouteSnapshot,
    ) -> Option<RouteClaimGuard<'a>> {
        let state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if state.routes.get(key) != Some(snapshot) {
            return None;
        }
        Some(RouteClaimGuard { _state: state })
    }

    /// Recheck after asynchronous work. The caller must also verify the consent
    /// request is still pending and authorized at the decision boundary.
    pub fn is_current(&self, key: &SessionKey, snapshot: &RouteSnapshot) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .routes
            .get(key)
            == Some(snapshot)
    }
}

impl Drop for RouteLease {
    fn drop(&mut self) {
        if let Some(state) = self.state.upgrade() {
            let mut state = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if state
                .routes
                .get(&self.key)
                .is_some_and(|route| route.generation == self.generation)
            {
                state.routes.remove(&self.key);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(owner: &str, session: &str) -> SessionKey {
        SessionKey {
            owner_id: owner.into(),
            session_id: session.into(),
        }
    }
    fn target(channel: &str, conversation: &str) -> ConversationTarget {
        ConversationTarget {
            channel_id: channel.into(),
            conversation_id: conversation.into(),
        }
    }

    #[test]
    fn lease_cleanup_invalidates_snapshot_and_replacement_is_distinct() {
        let routes = SessionOwnership::default();
        let key = key("owner", "session");
        let first = routes.register(key.clone(), target("a", "b")).unwrap();
        let snapshot = routes.lookup(&key).unwrap();
        assert!(routes.is_current(&key, &snapshot));
        drop(first);
        assert!(routes.lookup(&key).is_none());
        let second = routes.register(key.clone(), target("a", "b")).unwrap();
        assert!(!routes.is_current(&key, &snapshot));
        assert!(routes.is_current(&key, &routes.lookup(&key).unwrap()));
        drop(second);
        assert!(routes.lookup(&key).is_none());
    }

    #[test]
    fn duplicate_registration_is_rejected_and_owners_are_isolated() {
        let routes = SessionOwnership::default();
        let first_key = key("alice", "same");
        let same_session_other_owner = key("bob", "same");
        let other_key = key("bob", "other");
        let first = routes
            .register(first_key.clone(), target("channel", "one"))
            .unwrap();
        assert!(matches!(
            routes.register(first_key.clone(), target("channel", "two")),
            Err(RegisterError::AlreadyActive)
        ));
        assert!(matches!(
            routes.register(same_session_other_owner, target("channel", "two")),
            Err(RegisterError::AlreadyActive)
        ));
        assert!(matches!(
            routes.register(other_key.clone(), target("channel", "one")),
            Err(RegisterError::ConversationActive)
        ));
        let other = routes
            .register(other_key.clone(), target("channel", "two"))
            .unwrap();
        drop(first);
        assert!(routes.lookup(&first_key).is_none());
        assert_eq!(
            routes.lookup(&other_key).unwrap().target,
            target("channel", "two")
        );
        drop(other);
    }

    #[test]
    fn claim_serializes_with_teardown_and_rejects_stale_snapshot() {
        use std::sync::mpsc;
        use std::thread;
        use std::time::Duration;

        let routes = SessionOwnership::default();
        let session = key("owner", "session");
        let lease = routes
            .register(session.clone(), target("channel", "chat"))
            .unwrap();
        let snapshot = routes.lookup(&session).unwrap();
        let guard = routes.lock_for_claim(&session, &snapshot).unwrap();
        let (started_tx, started_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();
        let worker = thread::spawn(move || {
            started_tx.send(()).unwrap();
            drop(lease);
            done_tx.send(()).unwrap();
        });
        started_rx.recv().unwrap();
        assert!(done_rx.recv_timeout(Duration::from_millis(50)).is_err());
        // A real caller performs only the synchronous queue claim here.
        drop(guard);
        done_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        worker.join().unwrap();
        let replacement = routes
            .register(session.clone(), target("channel", "chat"))
            .unwrap();
        assert!(routes.lock_for_claim(&session, &snapshot).is_none());
        drop(replacement);
    }

    #[test]
    fn exhaustion_never_reuses_a_generation() {
        let routes = SessionOwnership::default();
        routes.state.lock().unwrap().next_generation = u64::MAX;
        assert!(matches!(
            routes.register(key("o", "s"), target("c", "v")),
            Err(RegisterError::GenerationExhausted)
        ));
    }
}
