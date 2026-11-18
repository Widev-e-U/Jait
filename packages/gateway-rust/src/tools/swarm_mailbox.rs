//! Transient mailbox state shared only by members of an execution round.
use crate::time::{self, Clock};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmMessage {
    pub from: String,
    pub content: String,
    pub posted_at: i64,
}
pub type Messages = Arc<Mutex<Vec<SwarmMessage>>>;
struct Round {
    participant_count: usize,
    messages: Messages,
}
pub struct SwarmMailbox {
    rounds: Mutex<HashMap<String, Round>>,
    clock: Clock,
}
impl Default for SwarmMailbox {
    fn default() -> Self {
        Self::new(time::default_clock())
    }
}
impl SwarmMailbox {
    pub fn new(clock: Clock) -> Self {
        Self {
            rounds: Mutex::new(HashMap::new()),
            clock,
        }
    }
    pub fn create_round(&self, id: &str, participant_count: usize) {
        self.rounds.lock().unwrap().insert(
            id.into(),
            Round {
                participant_count,
                messages: Arc::new(Mutex::new(vec![])),
            },
        );
    }
    pub fn end_round(&self, id: &str) {
        self.rounds.lock().unwrap().remove(id);
    }
    pub fn post(&self, id: &str, from: &str, content: &str) -> Messages {
        let rounds = self.rounds.lock().unwrap();
        let Some(round) = rounds.get(id) else {
            return Arc::new(Mutex::new(vec![]));
        };
        round.messages.lock().unwrap().push(SwarmMessage {
            from: from.into(),
            content: content.into(),
            posted_at: (self.clock)(),
        });
        round.messages.clone()
    }
    pub fn peek(&self, id: &str) -> Messages {
        self.rounds
            .lock()
            .unwrap()
            .get(id)
            .map(|r| r.messages.clone())
            .unwrap_or_else(|| Arc::new(Mutex::new(vec![])))
    }
    pub fn participant_count(&self, id: &str) -> usize {
        self.rounds
            .lock()
            .unwrap()
            .get(id)
            .map(|r| r.participant_count)
            .unwrap_or(0)
    }
}
