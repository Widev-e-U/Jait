//! Deferred steering messages for a running agent loop.
//!
//! A steer is *accepted* the moment the user sends it, but it is only
//! *injected* into the transcript at the loop's next round boundary: after the
//! in-flight tool round has finished and before the next model call. This keeps
//! the transcript honest — the user message shows up below the tool calls it was
//! actually racing, never above them.
//!
//! The UI mirrors that lifecycle by showing the steer as a pending queued
//! message until the matching [`SteeringEvent`] arrives, so the contract here is
//! strict: [`SteeringQueue::steer`] never delivers, and
//! [`SteeringQueue::drain_round`] delivers exactly once per accepted message.
//!
//! Callbacks are invoked outside the registry lock so an observer may reenter
//! (`pending`, `has_pending`, even `steer`).
use crate::db::identifiers::uuidv7;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

/// One accepted-but-not-yet-injected steer.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SteeringMessage {
    /// Correlation id echoed back to the client on the `steering` event.
    pub id: String,
    pub session_id: String,
    pub content: String,
    /// What the UI renders (may differ from the model-facing `content`).
    pub display_content: Option<String>,
}

impl SteeringMessage {
    pub fn new(session_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: uuidv7().to_string(),
            session_id: session_id.into(),
            content: content.into(),
            display_content: None,
        }
    }

    /// Reuse a client-supplied correlation id (the UI generates one so it can
    /// promote its pending row when this message comes back out of the queue).
    pub fn with_id(mut self, id: Option<String>) -> Self {
        if let Some(id) = id.filter(|id| !id.trim().is_empty()) {
            self.id = id;
        }
        self
    }

    pub fn with_display_content(mut self, display: Option<String>) -> Self {
        self.display_content = display.filter(|text| !text.is_empty());
        self
    }
}

/// Why an observer is being notified. `Queued` fires on accept, `Steered` fires
/// when the message is actually injected at a round boundary.
#[derive(Clone, Debug, PartialEq)]
pub enum SteeringPhase {
    Queued,
    Steered,
}

#[derive(Clone, Debug)]
pub struct SteeringEvent {
    pub phase: SteeringPhase,
    pub message: SteeringMessage,
}

pub type Observer = Arc<dyn Fn(SteeringEvent) + Send + Sync>;

pub struct SteeringQueue {
    /// Insertion-ordered: steers keep the order the user sent them in.
    pending: Mutex<Vec<SteeringMessage>>,
    on_event: Option<Observer>,
}

impl Default for SteeringQueue {
    fn default() -> Self {
        Self::new(None)
    }
}

impl SteeringQueue {
    pub fn new(on_event: Option<Observer>) -> Self {
        Self {
            pending: Mutex::new(Vec::new()),
            on_event,
        }
    }

    fn notify(&self, phase: SteeringPhase, message: SteeringMessage) {
        if let Some(observer) = &self.on_event {
            observer(SteeringEvent { phase, message });
        }
    }

    /// Accept a steer. Nothing is injected here — that is the whole point: the
    /// running loop still has a tool round to finish.
    ///
    /// Re-sending the same id updates the parked text instead of queueing a
    /// duplicate, so a retried POST cannot steer twice.
    pub fn steer(&self, message: SteeringMessage) -> String {
        let id = message.id.clone();
        {
            let mut pending = self.pending.lock().unwrap();
            if let Some(existing) = pending.iter_mut().find(|entry| entry.id == id) {
                existing.content = message.content;
                existing.display_content = message.display_content;
                return id;
            }
            pending.push(message.clone());
        }
        // Notified outside the lock: callbacks may call back into the queue.
        self.notify(SteeringPhase::Queued, message);
        id
    }

    pub fn has_pending(&self) -> bool {
        !self.pending.lock().unwrap().is_empty()
    }

    /// Snapshot of the parked steers, oldest first.
    pub fn pending(&self) -> Vec<SteeringMessage> {
        self.pending.lock().unwrap().clone()
    }

    pub fn pending_for(&self, session_id: &str) -> Vec<SteeringMessage> {
        self.pending
            .lock()
            .unwrap()
            .iter()
            .filter(|entry| entry.session_id == session_id)
            .cloned()
            .collect()
    }

    /// Round boundary: take every parked steer for injection. Taking removes
    /// them, so a second drain returns nothing — each steer is injected once.
    pub fn drain_round(&self) -> Vec<SteeringMessage> {
        let drained = std::mem::take(&mut *self.pending.lock().unwrap());
        for message in &drained {
            self.notify(SteeringPhase::Steered, message.clone());
        }
        drained
    }

    /// Round boundary scoped to one session (parallel chats share this queue).
    pub fn drain_round_for(&self, session_id: &str) -> Vec<SteeringMessage> {
        let drained = {
            let mut pending = self.pending.lock().unwrap();
            let (mine, rest): (Vec<_>, Vec<_>) = std::mem::take(&mut *pending)
                .into_iter()
                .partition(|entry| entry.session_id == session_id);
            *pending = rest;
            mine
        };
        for message in &drained {
            self.notify(SteeringPhase::Steered, message.clone());
        }
        drained
    }

    /// Drop a parked steer (client-side failure path: the POST never landed, so
    /// nothing will ever drain it).
    pub fn discard(&self, id: &str) -> bool {
        let mut pending = self.pending.lock().unwrap();
        let before = pending.len();
        pending.retain(|entry| entry.id != id);
        pending.len() != before
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn msg(id: &str, content: &str) -> SteeringMessage {
        SteeringMessage::new("session", content).with_id(Some(id.into()))
    }

    /// The regression this module exists for: a steer sent mid-tool-loop must
    /// stay parked (visibly "queued") and only be injected once, at the round
    /// boundary.
    #[test]
    fn mid_loop_steer_is_deferred_until_the_round_boundary() {
        let steered: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let seen = steered.clone();
        let queue = SteeringQueue::new(Some(Arc::new(move |event| {
            if event.phase == SteeringPhase::Steered {
                seen.lock().unwrap().push(event.message.id);
            }
        })));

        // Tool round in flight, user steers: accepted, not injected.
        let id = queue.steer(msg("steer-1", "actually, check the tests first"));
        assert_eq!(id, "steer-1");
        assert!(queue.has_pending());
        assert!(
            steered.lock().unwrap().is_empty(),
            "steer must not be injected mid-round"
        );
        assert_eq!(queue.pending().len(), 1);

        // Tool round finishes → the loop drains at the boundary.
        let injected = queue.drain_round();
        assert_eq!(injected.len(), 1);
        assert_eq!(injected[0].content, "actually, check the tests first");
        assert_eq!(*steered.lock().unwrap(), vec!["steer-1".to_string()]);

        // Exactly once: a later boundary has nothing left to inject.
        assert!(queue.drain_round().is_empty());
        assert!(!queue.has_pending());
        assert_eq!(steered.lock().unwrap().len(), 1);
    }

    #[test]
    fn steers_keep_send_order_and_inject_once_per_boundary() {
        let queue = SteeringQueue::default();
        queue.steer(msg("a", "first"));
        queue.steer(msg("b", "second"));
        let ids: Vec<String> = queue.drain_round().into_iter().map(|m| m.id).collect();
        assert_eq!(ids, vec!["a".to_string(), "b".to_string()]);
        assert!(queue.drain_round().is_empty());
    }

    #[test]
    fn repeated_post_with_same_id_does_not_steer_twice() {
        let steered = Arc::new(AtomicUsize::new(0));
        let counter = steered.clone();
        let queue = SteeringQueue::new(Some(Arc::new(move |event| {
            if event.phase == SteeringPhase::Steered {
                counter.fetch_add(1, Ordering::SeqCst);
            }
        })));
        queue.steer(msg("steer-1", "check the tests"));
        queue.steer(msg("steer-1", "check the tests"));
        assert_eq!(queue.pending().len(), 1);
        assert_eq!(queue.drain_round().len(), 1);
        assert_eq!(steered.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn drain_is_scoped_to_the_steered_session() {
        let queue = SteeringQueue::default();
        queue.steer(SteeringMessage::new("s1", "for chat one"));
        queue.steer(SteeringMessage::new("s2", "for chat two"));
        let drained = queue.drain_round_for("s1");
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].content, "for chat one");
        assert_eq!(
            queue.pending(),
            vec![SteeringMessage {
                id: queue.pending()[0].id.clone(),
                session_id: "s2".into(),
                content: "for chat two".into(),
                display_content: None,
            }]
        );
    }

    #[test]
    fn discard_releases_a_parked_steer_that_will_never_be_sent() {
        let queue = SteeringQueue::default();
        queue.steer(msg("steer-1", "queued but the POST failed"));
        assert!(queue.discard("steer-1"));
        assert!(!queue.has_pending());
        assert!(queue.drain_round().is_empty());
        assert!(!queue.discard("steer-1"));
    }

    /// Observers run outside the lock, so a callback may inspect the queue.
    #[test]
    fn observer_may_reenter_the_queue() {
        let depth = Arc::new(AtomicUsize::new(0));
        let probe = depth.clone();
        let queue: Arc<Mutex<Option<Arc<SteeringQueue>>>> = Arc::new(Mutex::new(None));
        let handle = queue.clone();
        let inner = Arc::new(SteeringQueue::new(Some(Arc::new(move |_event| {
            let queue = handle.lock().unwrap().clone();
            if let Some(queue) = queue {
                probe.store(queue.pending().len(), Ordering::SeqCst);
            }
        }))));
        *queue.lock().unwrap() = Some(inner.clone());
        inner.steer(msg("steer-1", "no deadlock"));
        assert_eq!(depth.load(Ordering::SeqCst), 1);
        assert_eq!(inner.drain_round().len(), 1);
        assert_eq!(depth.load(Ordering::SeqCst), 0);
    }
}
