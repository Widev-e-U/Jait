//! FIFO CLI steering delivery. Queue ownership and the provider connection remain
//! with the session host; this adapter never grants another session access.
use crate::tools::core_io::HostError;
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SteeringMessage {
    pub message: String,
    #[serde(flatten)]
    pub metadata: Map<String, Value>,
}

pub type PendingListener = Arc<dyn Fn() + Send + Sync>;
pub type Unsubscribe = Box<dyn FnOnce() + Send>;
/// The session-owned queue must preserve object identity, including equal-valued
/// arrivals. `consume` removes precisely the peeked object, wherever it now sits.
/// Notifications are synchronous, after enqueue, and never during registration.
/// The owner enforces its queue/byte budgets before accepting guidance.
pub trait SteeringSource: Send + Sync {
    fn has_pending(&self) -> bool;
    fn peek(&self) -> Option<Arc<SteeringMessage>>;
    fn consume(&self, message: &Arc<SteeringMessage>) -> bool;
    fn on_pending(&self, listener: PendingListener) -> Unsubscribe;
}
pub type Deliver = Arc<dyn Fn(String) -> BoxFuture<'static, Result<bool, HostError>> + Send + Sync>;
pub type Consumed = Arc<dyn Fn(Arc<SteeringMessage>) -> Result<(), HostError> + Send + Sync>;
pub type Failed = Arc<dyn Fn(HostError) -> Result<(), HostError> + Send + Sync>;
/// The host defers polling until after sendTurn has submitted the initial prompt,
/// tracks the task through shutdown, and observes its result. No detached spawn.
/// Queue operations and dispatcher control/callbacks use the same session lane.
pub type Schedule = Arc<dyn Fn(BoxFuture<'static, Result<(), HostError>>) + Send + Sync>;

type Outcome = Result<(), HostError>;
struct Pending(watch::Sender<Option<Outcome>>);
impl Pending {
    fn new() -> Self {
        Self(watch::channel(None).0)
    }
    async fn wait(&self) -> Outcome {
        let mut receiver = self.0.subscribe();
        loop {
            if let Some(result) = receiver.borrow().clone() {
                return result;
            }
            // This Pending owns the sender throughout the wait.
            receiver
                .changed()
                .await
                .expect("steering completion sender");
        }
    }
}
#[derive(Default)]
struct State {
    active: bool,
    blocked: bool,
    disposed: bool,
    pending: Option<Arc<Pending>>,
}
pub struct ProviderSteeringDispatcher {
    queue: Arc<dyn SteeringSource>,
    deliver: Deliver,
    consumed: Consumed,
    failed: Failed,
    schedule: Schedule,
    state: Mutex<State>,
    unsubscribe: Mutex<Option<Unsubscribe>>,
}
impl ProviderSteeringDispatcher {
    pub fn new(
        queue: Arc<dyn SteeringSource>,
        deliver: Deliver,
        consumed: Consumed,
        failed: Failed,
        schedule: Schedule,
    ) -> Arc<Self> {
        let dispatcher = Arc::new(Self {
            queue,
            deliver,
            consumed,
            failed,
            schedule,
            state: Mutex::new(State::default()),
            unsubscribe: Mutex::new(None),
        });
        let weak = Arc::downgrade(&dispatcher);
        let unsubscribe = dispatcher.queue.on_pending(Arc::new(move || {
            if let Some(dispatcher) = weak.upgrade() {
                dispatcher.kick();
            }
        }));
        *dispatcher.unsubscribe.lock().unwrap() = Some(unsubscribe);
        dispatcher
    }

    pub fn start(self: &Arc<Self>) {
        {
            let mut state = self.state.lock().unwrap();
            if state.disposed {
                return;
            }
            state.active = true;
            state.blocked = false;
        }
        self.kick();
    }

    /// Close admission synchronously, then wait for the captured in-flight ack.
    /// Later arrivals stay pending for the next turn/fallback.
    pub fn pause(&self) -> BoxFuture<'static, Outcome> {
        let pending = {
            let mut state = self.state.lock().unwrap();
            state.active = false;
            state.pending.clone()
        };
        Box::pin(async move {
            if let Some(pending) = pending {
                pending.wait().await
            } else {
                Ok(())
            }
        })
    }

    pub fn dispose(&self) {
        {
            let mut state = self.state.lock().unwrap();
            state.active = false;
            state.disposed = true;
        }
        let unsubscribe = self.unsubscribe.lock().unwrap().take();
        if let Some(unsubscribe) = unsubscribe {
            unsubscribe();
        }
    }

    fn kick(self: &Arc<Self>) {
        if !self.queue.has_pending() {
            return;
        }
        let pending = {
            let mut state = self.state.lock().unwrap();
            if !state.active || state.blocked || state.disposed || state.pending.is_some() {
                return;
            }
            let pending = Arc::new(Pending::new());
            state.pending = Some(pending.clone());
            pending
        };
        // Construct the guard before scheduling: even dropping an unpolled task
        // must release pause waiters and must not retry an uncertain delivery.
        let mut guard = TaskGuard {
            dispatcher: self.clone(),
            pending,
            finished: false,
        };
        let dispatcher = self.clone();
        (self.schedule)(Box::pin(async move {
            let outcome = dispatcher.run().await;
            guard.finish(outcome.clone(), false);
            outcome
        }));
    }

    async fn run(&self) -> Outcome {
        loop {
            {
                let state = self.state.lock().unwrap();
                if !state.active || state.disposed {
                    break;
                }
            }
            let Some(message) = self.queue.peek() else {
                break;
            };
            let accepted = match (self.deliver)(format!("[STEERING] {}", message.message)).await {
                Ok(value) => value,
                Err(error) => {
                    (self.failed)(error)?;
                    false
                }
            };
            if !accepted {
                self.state.lock().unwrap().blocked = true;
                break;
            }
            // Acknowledgement owns this object even if pause/dispose ran while
            // waiting. Disposal suppresses its late transcript notification.
            if self.queue.consume(&message) && !self.state.lock().unwrap().disposed {
                (self.consumed)(message)?;
            }
        }
        Ok(())
    }
}
struct TaskGuard {
    dispatcher: Arc<ProviderSteeringDispatcher>,
    pending: Arc<Pending>,
    finished: bool,
}
impl TaskGuard {
    fn finish(&mut self, outcome: Outcome, cancelled: bool) {
        self.finished = true;
        {
            let mut state = self.dispatcher.state.lock().unwrap();
            if state
                .pending
                .as_ref()
                .is_some_and(|current| Arc::ptr_eq(current, &self.pending))
            {
                state.pending = None;
                if cancelled {
                    state.blocked = true;
                }
            }
        }
        // Promise.finally clears pending and kicks before pause resolves.
        self.dispatcher.kick();
        self.pending.0.send_replace(Some(outcome));
    }
}
impl Drop for TaskGuard {
    fn drop(&mut self) {
        if !self.finished {
            self.finish(
                Err(HostError::Error("Steering task cancelled".into())),
                true,
            );
        }
    }
}
impl Drop for ProviderSteeringDispatcher {
    fn drop(&mut self) {
        if let Some(unsubscribe) = self.unsubscribe.get_mut().unwrap().take() {
            unsubscribe();
        }
    }
}
