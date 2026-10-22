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

pub(crate) struct EventBus {
    sessions: Mutex<HashMap<String, broadcast::Sender<Frame>>>,
}

impl EventBus {
    pub(crate) fn new() -> Arc<Self> {
        Arc::new(Self {
            sessions: Mutex::new(HashMap::new()),
        })
    }

    /// Subscribe *before* replaying durable rows: an event committed between the
    /// replay query and the subscription would otherwise be lost, and the
    /// caller deduplicates by `log_id` instead of guessing a race margin.
    pub(crate) fn subscribe(&self, session: &str) -> Result<broadcast::Receiver<Frame>, String> {
        let mut sessions = self.sessions.lock().map_err(|_| "Event bus poisoned")?;
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
            return Ok(sender.subscribe());
        }
        if sessions.len() >= MAX_SESSIONS {
            return Err("Too many streaming sessions".into());
        }
        let (sender, receiver) = broadcast::channel(CAPACITY);
        sessions.insert(session.to_owned(), sender);
        Ok(receiver)
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
        let sender = {
            let sessions = self.sessions.lock().map_err(|_| "Event bus poisoned")?;
            match sessions.get(session) {
                Some(sender) if sender.receiver_count() > 0 => sender.clone(),
                _ => return Ok(()),
            }
        };
        // Err only means every subscriber went away between the count and the
        // send; the event is already durable, so this is not a turn failure.
        let _ = sender.send(Frame { log_id, data });
        Ok(())
    }

    pub(crate) fn unsubscribe(&self, session: &str) {
        let mut sessions = match self.sessions.lock() {
            Ok(sessions) => sessions,
            Err(_) => return,
        };
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
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disconnected_sessions_do_not_exhaust_subscription_capacity() {
        let bus = EventBus::new();
        for i in 0..MAX_SESSIONS * 2 {
            let receiver = bus.subscribe(&format!("session-{i}")).unwrap();
            drop(receiver);
        }
        assert!(bus.subscribe("still-available").is_ok());
        assert_eq!(bus.sessions.lock().unwrap().len(), 1);
    }

    #[test]
    fn same_session_connections_share_a_bounded_total_and_release_admission() {
        let bus = EventBus::new();
        let mut receivers: Vec<_> = (0..MAX_SUBSCRIBERS)
            .map(|_| bus.subscribe("one-session").unwrap())
            .collect();
        assert!(bus.subscribe("one-session").is_err());
        assert!(bus.subscribe("another-session").is_err());
        receivers.pop();
        assert!(bus.subscribe("another-session").is_ok());
    }

    #[test]
    fn fanout_delivers_the_same_durable_ids_and_shutdown_closes_receivers() {
        let bus = EventBus::new();
        let mut first = bus.subscribe("session").unwrap();
        let mut second = bus.subscribe("session").unwrap();
        let event = TurnEvent::User {
            content: "hello".into(),
        };
        bus.publish("session", 7, &event).unwrap();
        bus.publish("other-session", 8, &event).unwrap();
        for receiver in [&mut first, &mut second] {
            let frame = receiver.try_recv().unwrap();
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
