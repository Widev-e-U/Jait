//! Notification event construction with explicit broadcast and best-effort sinks.
//! The delivery transport is injected; this module starts no network connections.
use crate::time::{Clock, default_clock, iso};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

pub type Broadcast = Arc<dyn Fn(&Value) -> Result<(), String> + Send + Sync>;
pub type NotificationSink = Arc<dyn Fn(&mut Value) -> Result<(), String> + Send + Sync>;
type SinkArray = Arc<Mutex<Vec<NotificationSink>>>;
type SinkRegistry = Arc<Mutex<SinkArray>>;
pub struct Subscription {
    registry: SinkRegistry,
    sink: NotificationSink,
}
impl Subscription {
    /// Remove every registration of this callback identity, as Array.filter does.
    /// Calling this repeatedly is harmless. Dropping it does not unsubscribe.
    pub fn unsubscribe(&self) {
        let mut current = self.registry.lock().unwrap();
        let filtered = current
            .lock()
            .unwrap()
            .iter()
            .filter(|candidate| !Arc::ptr_eq(candidate, &self.sink))
            .cloned()
            .collect();
        *current = Arc::new(Mutex::new(filtered));
    }
}
#[derive(Clone)]
pub struct NotificationService {
    broadcast: Broadcast,
    sinks: SinkRegistry,
    clock: Clock,
}
impl NotificationService {
    pub fn new(broadcast: Broadcast) -> Self {
        Self::with_clock(broadcast, default_clock())
    }
    pub fn with_clock(broadcast: Broadcast, clock: Clock) -> Self {
        Self {
            broadcast,
            clock,
            sinks: Arc::new(Mutex::new(Arc::new(Mutex::new(Vec::new())))),
        }
    }
    pub fn add_sink(&self, sink: NotificationSink) -> Subscription {
        self.sinks
            .lock()
            .unwrap()
            .lock()
            .unwrap()
            .push(sink.clone());
        Subscription {
            registry: self.sinks.clone(),
            sink,
        }
    }
    /// Accept an object matching JaitNotification minus timestamp. Timestamp is
    /// always replaced. A failed broadcast stops delivery; sink failures do not.
    pub fn send(&self, notification: &serde_json::Map<String, Value>) -> Result<(), String> {
        let mut payload = notification.clone();
        let timestamp = iso((self.clock)())?;
        payload.insert("timestamp".into(), json!(timestamp));
        let mut payload = Value::Object(payload);
        (self.broadcast)(
            &json!({"type":"notification","sessionId":"","timestamp":timestamp,"payload":payload}),
        )?;
        // for-of keeps the original array after unsubscribe replaces it, but sees
        // callbacks appended to that same array while delivery is in progress.
        let array = self.sinks.lock().unwrap().clone();
        let mut index = 0;
        loop {
            let sink = array.lock().unwrap().get(index).cloned();
            let Some(sink) = sink else {
                break;
            };
            let _ = sink(&mut payload);
            index += 1;
        }
        Ok(())
    }
    pub fn notify(
        &self,
        level: &str,
        title: &str,
        body: &str,
        link: Option<&str>,
    ) -> Result<(), String> {
        let mut notification = json!({"id":format!("notif-{}",(self.clock)()),"title":title,"body":body,"level":level}).as_object().unwrap().clone();
        if let Some(link) = link {
            notification.insert("link".into(), json!(link));
        }
        self.send(&notification)
    }
    pub fn info(&self, title: &str, body: &str, link: Option<&str>) -> Result<(), String> {
        self.notify("info", title, body, link)
    }
    pub fn success(&self, title: &str, body: &str, link: Option<&str>) -> Result<(), String> {
        self.notify("success", title, body, link)
    }
    pub fn warning(&self, title: &str, body: &str, link: Option<&str>) -> Result<(), String> {
        self.notify("warning", title, body, link)
    }
    pub fn error(&self, title: &str, body: &str, link: Option<&str>) -> Result<(), String> {
        self.notify("error", title, body, link)
    }
}
