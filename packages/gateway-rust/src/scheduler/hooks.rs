//! Synchronous lifecycle hooks. Run file-reading built-ins on a blocking worker.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    error::Error,
    fmt, fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HookEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub timestamp: String,
    pub payload: Value,
}
#[derive(Debug)]
pub enum HookError {
    Io(std::io::Error),
    Handler(String),
}
impl fmt::Display for HookError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => write!(f, "{e}"),
            Self::Handler(e) => f.write_str(e),
        }
    }
}
impl Error for HookError {}
impl From<std::io::Error> for HookError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}
pub type Handler = Arc<dyn Fn(&mut HookEvent, &HookBus) -> Result<(), HookError> + Send + Sync>;
struct Bucket {
    name: String,
    handlers: Vec<Option<Handler>>,
}
#[derive(Default)]
struct State {
    buckets: Vec<Option<Bucket>>,
    emissions: usize,
}
#[derive(Clone)]
pub struct HookBus {
    state: Arc<Mutex<State>>,
    clock: Arc<dyn Fn() -> String + Send + Sync>,
}
struct EmissionGuard(Arc<Mutex<State>>);
impl Drop for EmissionGuard {
    fn drop(&mut self) {
        let mut state = self.0.lock().expect("hook state");
        state.emissions -= 1;
        if state.emissions == 0 {
            prune(&mut state)
        }
    }
}
fn prune(state: &mut State) {
    state.buckets.retain(Option::is_some);
    for bucket in state.buckets.iter_mut().flatten() {
        bucket.handlers.retain(Option::is_some)
    }
}
pub struct Subscription {
    bus: HookBus,
    event_type: String,
    handler: Handler,
}
impl Subscription {
    /// Explicit unsubscribe matches the reference. Dropping this handle retains registration.
    pub fn unsubscribe(&self) {
        self.bus.off(&self.event_type, &self.handler)
    }
}
impl Default for HookBus {
    fn default() -> Self {
        Self::with_clock(now_iso)
    }
}
impl HookBus {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn with_clock(clock: impl Fn() -> String + Send + Sync + 'static) -> Self {
        Self {
            state: Arc::new(Mutex::new(State::default())),
            clock: Arc::new(clock),
        }
    }
    pub fn on(&self, event_type: &str, handler: Handler) -> Subscription {
        let mut state = self.state.lock().expect("hook state");
        if let Some(bucket) = state
            .buckets
            .iter_mut()
            .flatten()
            .find(|b| b.name == event_type)
        {
            if !bucket
                .handlers
                .iter()
                .flatten()
                .any(|h| Arc::ptr_eq(h, &handler))
            {
                bucket.handlers.push(Some(handler.clone()));
            }
        } else {
            state.buckets.push(Some(Bucket {
                name: event_type.into(),
                handlers: vec![Some(handler.clone())],
            }))
        }
        Subscription {
            bus: self.clone(),
            event_type: event_type.into(),
            handler,
        }
    }
    pub fn off(&self, event_type: &str, handler: &Handler) {
        let mut state = self.state.lock().expect("hook state");
        if let Some(slot) = state
            .buckets
            .iter_mut()
            .find(|b| b.as_ref().is_some_and(|b| b.name == event_type))
        {
            let bucket = slot.as_mut().expect("present bucket");
            for slot in &mut bucket.handlers {
                if slot.as_ref().is_some_and(|h| Arc::ptr_eq(h, handler)) {
                    *slot = None
                }
            }
            if bucket.handlers.iter().all(Option::is_none) {
                *slot = None
            }
        }
        if state.emissions == 0 {
            prune(&mut state)
        }
    }
    pub fn emit(&self, event_type: &str, payload: Value) -> Result<(), HookError> {
        self.state.lock().expect("hook state").emissions += 1;
        let _guard = EmissionGuard(self.state.clone());
        let mut event = HookEvent {
            event_type: event_type.into(),
            timestamp: (self.clock)(),
            payload,
        };
        let mut bucket_index = 0;
        loop {
            let matches = {
                let state = self.state.lock().expect("hook state");
                let Some(bucket) = state.buckets.get(bucket_index) else {
                    break;
                };
                bucket.as_ref().is_some_and(|b| {
                    b.name == event_type
                        || b.name
                            .strip_suffix(".*")
                            .is_some_and(|prefix| event_type.starts_with(&format!("{prefix}.")))
                })
            };
            if matches {
                let mut handler_index = 0;
                loop {
                    let handler = {
                        let state = self.state.lock().expect("hook state");
                        state
                            .buckets
                            .get(bucket_index)
                            .and_then(Option::as_ref)
                            .and_then(|b| b.handlers.get(handler_index))
                            .cloned()
                    };
                    let Some(handler) = handler else { break };
                    if let Some(handler) = handler {
                        handler(&mut event, self)?
                    }
                    handler_index += 1;
                }
            }
            bucket_index += 1;
        }
        Ok(())
    }
    pub fn listener_count(&self, event_type: Option<&str>) -> usize {
        self.state
            .lock()
            .expect("hook state")
            .buckets
            .iter()
            .flatten()
            .filter(|b| event_type.is_none_or(|v| v.is_empty() || b.name == v))
            .map(|b| b.handlers.iter().flatten().count())
            .sum()
    }
    pub fn registered_event_types(&self) -> Vec<String> {
        self.state
            .lock()
            .expect("hook state")
            .buckets
            .iter()
            .flatten()
            .map(|b| b.name.clone())
            .collect()
    }
}
const BOOTSTRAP_PATHS: [&str; 3] = [
    ".jait/bootstrap.md",
    ".jait/session-bootstrap.md",
    "BOOTSTRAP.md",
];
pub fn register_built_in_hooks(bus: &HookBus, default_root: Option<PathBuf>) {
    bus.on(
        "session.start",
        Arc::new(move |event, bus| {
            let root = event
                .payload
                .get("projectRoot")
                .and_then(Value::as_str)
                .map(PathBuf::from)
                .or_else(|| default_root.clone())
                .map(Ok)
                .unwrap_or_else(std::env::current_dir)?;
            let mut files = vec![];
            for relative in BOOTSTRAP_PATHS {
                let path = Path::new(&root).join(relative);
                if !path.exists() {
                    continue;
                }
                // Node decodes invalid UTF-8 with replacement rather than failing the read.
                let content = String::from_utf8_lossy(&fs::read(path)?).into_owned();
                files.push(json!({"path":relative,"content":content}));
            }
            let mut payload = json!({"projectRoot":root,"fileCount":files.len(),"files":files});
            if let Some(id) = event.payload.get("sessionId") {
                payload
                    .as_object_mut()
                    .expect("object")
                    .insert("sessionId".into(), id.clone());
            }
            bus.emit("session.bootstrap.loaded", payload)
        }),
    );
    for name in ["session.end", "session.compact", "agent.error", "surface.*"] {
        bus.on(name, Arc::new(|_, _| Ok(())));
    }
}
fn now_iso() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let seconds = (millis / 1000) as u64;
    let days = (seconds / 86400) as i64;
    // Proleptic Gregorian civil date from days since 1970-01-01.
    let shifted = days + 719468;
    let era = shifted.div_euclid(146097);
    let doe = shifted - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        seconds / 3600 % 24,
        seconds / 60 % 60,
        seconds % 60,
        millis % 1000
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn removed_listeners_release_captures_and_repeated_subscription_does_not_grow_slots() {
        let bus = HookBus::new();
        for _ in 0..1000 {
            let owned = Arc::new(());
            let weak = Arc::downgrade(&owned);
            let handler: Handler = Arc::new(move |_, _| {
                let _ = &owned;
                Ok(())
            });
            let subscription = bus.on("repeated", handler);
            subscription.unsubscribe();
            drop(subscription);
            assert!(weak.upgrade().is_none());
        }
        assert_eq!(bus.listener_count(None), 0);
        assert!(bus.state.lock().unwrap().buckets.is_empty());
    }
}
