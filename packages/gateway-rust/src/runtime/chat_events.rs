//! Bounded in-process fan-out of committed native turn events.
//!
//! Live frames carry the durable `session_events.log_id` allocated by the turn
//! store, so a browser that reconnects with `Last-Event-ID` resumes in the same
//! sequence it was already reading. Publication happens only after the append
//! transaction commits: subscribers never observe an event that is not durable,
//! and never observe a different order than a replay from SQLite.
use super::chat_turn::TurnEvent;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::broadcast;

/// Upper bound on concurrently fanned-out sessions; an idle entry is dropped as
/// on the next subscription after its receivers disconnect.
const MAX_SESSIONS: usize = 256;
const MAX_SUBSCRIBERS: usize = 256;
/// Per-session subscriber queue. A lagging subscriber is terminated rather than
/// served a silently truncated stream, because truncation would corrupt the
/// resumed sequence.
const CAPACITY: usize = 64;

#[derive(Clone, Debug)]
pub(crate) struct Frame {
    pub(crate) log_id: i64,
    /// One client-facing JSON body, already serialized, matching the POST sink.
    pub(crate) data: String,
}

#[derive(Clone, Debug)]
pub(crate) enum Message {
    Durable(Frame),
    Failure { owner: String, data: String },
}

struct State {
    sessions: HashMap<String, broadcast::Sender<Message>>,
    failures: HashMap<String, (String, String, Instant)>,
}

pub(crate) struct EventBus {
    state: Mutex<State>,
}

impl EventBus {
    pub(crate) fn new() -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(State {
                sessions: HashMap::new(),
                failures: HashMap::new(),
            }),
        })
    }

    /// Subscribe *before* replaying durable rows: an event committed between the
    /// replay query and the subscription would otherwise be lost, and the
    /// caller deduplicates by `log_id` instead of guessing a race margin.
    pub(crate) fn subscribe(
        &self,
        session: &str,
        owner: &str,
    ) -> Result<(broadcast::Receiver<Message>, Option<String>), String> {
        let mut state = self.state.lock().map_err(|_| "Event bus poisoned")?;
        state
            .failures
            .retain(|_, (_, _, at)| at.elapsed() < Duration::from_secs(300));
        // Observing a different owner invalidates a retained notice.
        if state
            .failures
            .get(session)
            .is_some_and(|(previous, _, _)| previous != owner)
        {
            state.failures.remove(session);
        }
        let failure = state.failures.get(session).map(|(_, data, _)| data.clone());
        let sessions = &mut state.sessions;
        // Reclaim disconnected sessions before admission. Dropping a response
        // drops its receiver, including cancellation during initial replay.
        sessions.retain(|_, sender| sender.receiver_count() > 0);
        if sessions
            .values()
            .map(|sender| sender.receiver_count())
            .sum::<usize>()
            >= MAX_SUBSCRIBERS
        {
            return Err("Too many streaming connections".into());
        }
        if let Some(sender) = sessions.get(session) {
            return Ok((sender.subscribe(), failure));
        }
        if sessions.len() >= MAX_SESSIONS {
            return Err("Too many streaming sessions".into());
        }
        let (sender, receiver) = broadcast::channel(CAPACITY);
        sessions.insert(session.to_owned(), sender);
        Ok((receiver, failure))
    }

    /// Publish one committed event. A session with no subscribers costs a lock
    /// and nothing else; the store calls this for every append.
    pub(crate) fn publish(
        &self,
        session: &str,
        log_id: i64,
        event: &TurnEvent,
    ) -> Result<(), String> {
        let data = serde_json::to_string(event).map_err(|_| "Unserializable turn event")?;
        self.publish_serialized(session, log_id, data)
    }

    pub(crate) fn publish_serialized(
        &self,
        session: &str,
        log_id: i64,
        data: String,
    ) -> Result<(), String> {
        let sender = {
            let state = self.state.lock().map_err(|_| "Event bus poisoned")?;
            match state.sessions.get(session) {
                Some(sender) if sender.receiver_count() > 0 => sender.clone(),
                _ => return Ok(()),
            }
        };
        // Err only means every subscriber went away between the count and the
        // send; the event is already durable, so this is not a turn failure.
        let _ = sender.send(Message::Durable(Frame { log_id, data }));
        Ok(())
    }

    /// Best-effort only: retained in memory for five minutes, with bounded
    /// admission. It has no durable cursor and is never written to the log.
    pub(crate) fn publish_failure(&self, session: &str, owner: &str, data: String) {
        if let Ok(mut state) = self.state.lock() {
            state
                .failures
                .retain(|_, (_, _, at)| at.elapsed() < Duration::from_secs(300));
            if !state.failures.contains_key(session) && state.failures.len() >= MAX_SESSIONS {
                if let Some(oldest) = state
                    .failures
                    .iter()
                    .min_by_key(|(_, (_, _, at))| *at)
                    .map(|(key, _)| key.clone())
                {
                    state.failures.remove(&oldest);
                }
            }
            state
                .failures
                .insert(session.into(), (owner.into(), data.clone(), Instant::now()));
            if let Some(sender) = state.sessions.get(session) {
                let _ = sender.send(Message::Failure {
                    owner: owner.into(),
                    data,
                });
            }
        }
    }

    pub(crate) fn clear_failure(&self, session: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.failures.remove(session);
        }
    }

    pub(crate) fn unsubscribe(&self, session: &str) {
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return,
        };
        let sessions = &mut state.sessions;
        if sessions
            .get(session)
            .is_some_and(|sender| sender.receiver_count() == 0)
        {
            sessions.remove(session);
        }
    }

    /// Drop every channel so subscribed streams observe end-of-stream instead of
    /// blocking through shutdown. Called from `ChatRoutes::shutdown`.
    pub(crate) fn close_all(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.sessions.clear();
            state.failures.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failure_is_owner_scoped_retained_and_has_no_durable_id() {
        let bus = EventBus::new();
        let (mut live, retained) = bus.subscribe("session", "owner").unwrap();
        assert!(retained.is_none());
        bus.publish_failure("session", "owner", r#"{"type":"error"}"#.into());
        match live.try_recv().unwrap() {
            Message::Failure { owner, data } => {
                assert_eq!(owner, "owner");
                assert_eq!(data, r#"{"type":"error"}"#);
            }
            _ => panic!("failure must not be a durable frame"),
        }
        assert_eq!(
            bus.subscribe("session", "owner").unwrap().1.as_deref(),
            Some(r#"{"type":"error"}"#)
        );
        assert!(bus.subscribe("session", "new-owner").unwrap().1.is_none());
        assert!(bus.subscribe("session", "owner").unwrap().1.is_none());
    }

    #[test]
    fn failure_retention_is_bounded_and_clearable() {
        let bus = EventBus::new();
        for i in 0..=MAX_SESSIONS {
            bus.publish_failure(&format!("session-{i}"), "owner", "error".into());
        }
        assert_eq!(bus.state.lock().unwrap().failures.len(), MAX_SESSIONS);
        bus.clear_failure(&format!("session-{MAX_SESSIONS}"));
        assert!(
            bus.subscribe(&format!("session-{MAX_SESSIONS}"), "owner")
                .unwrap()
                .1
                .is_none()
        );
    }

    #[test]
    fn disconnected_sessions_do_not_exhaust_subscription_capacity() {
        let bus = EventBus::new();
        for i in 0..MAX_SESSIONS * 2 {
            let receiver = bus
                .subscribe(&format!("session-{i}"), "owner")
                .map(|(receiver, _)| receiver)
                .unwrap();
            drop(receiver);
        }
        assert!(bus.subscribe("still-available", "owner").is_ok());
        assert_eq!(bus.state.lock().unwrap().sessions.len(), 1);
    }

    #[test]
    fn same_session_connections_share_a_bounded_total_and_release_admission() {
        let bus = EventBus::new();
        let mut receivers: Vec<_> = (0..MAX_SUBSCRIBERS)
            .map(|_| bus.subscribe("one-session", "owner").unwrap().0)
            .collect();
        assert!(bus.subscribe("one-session", "owner").is_err());
        assert!(bus.subscribe("another-session", "owner").is_err());
        receivers.pop();
        assert!(bus.subscribe("another-session", "owner").is_ok());
    }

    #[test]
    fn fanout_delivers_the_same_durable_ids_and_shutdown_closes_receivers() {
        let bus = EventBus::new();
        let mut first = bus.subscribe("session", "owner").unwrap().0;
        let mut second = bus.subscribe("session", "owner").unwrap().0;
        let event = TurnEvent::User {
            content: "hello".into(),
        };
        bus.publish("session", 7, &event).unwrap();
        bus.publish("other-session", 8, &event).unwrap();
        for receiver in [&mut first, &mut second] {
            let Message::Durable(frame) = receiver.try_recv().unwrap() else {
                panic!("expected durable frame")
            };
            assert_eq!(frame.log_id, 7);
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(&frame.data).unwrap()["content"],
                "hello"
            );
            assert!(matches!(
                receiver.try_recv(),
                Err(broadcast::error::TryRecvError::Empty)
            ));
        }
        bus.close_all();
        assert!(matches!(
            first.try_recv(),
            Err(broadcast::error::TryRecvError::Closed)
        ));
    }
}
