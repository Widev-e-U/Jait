//! Owner-bound legacy browser RPC with explicit gateway precedence and no retries.
use crate::{
    contracts::bounded_json::Utf16Text,
    text::js_trim,
    time::{Clock, default_clock},
};
use futures_util::future::{BoxFuture, ready};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, Weak},
    time::Duration,
};
use tokio::{sync::oneshot, task::AbortHandle};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MessengerToolResponse {
    pub ok: bool,
    pub message: Utf16Text,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}
impl MessengerToolResponse {
    fn denied(message: &str) -> Self {
        Self {
            ok: false,
            message: message.into(),
            data: None,
        }
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessengerRequest {
    pub request_id: String,
    pub expires_at: f64,
    pub command: Value,
}
/// Mirrors the shared strict command schema; defaults are added only after validation.
pub fn parse_messenger_command(input: &Value) -> Option<Value> {
    let object = input.as_object()?;
    let action = object.get("action")?.as_str()?;
    let keys: &[&str] = match action {
        "status" => &["action"],
        "rooms" => &["action", "query", "service", "limit"],
        "messages" => &["action", "roomId", "limit", "earlier"],
        "search" => &["action", "query", "roomId", "limit"],
        "send" => &["action", "roomId", "text"],
        "open" => &["action", "userId"],
        _ => return None,
    };
    if object.keys().any(|key| !keys.contains(&key.as_str())) {
        return None;
    }
    let mut result = input.clone();
    let length = |s: &str| s.encode_utf16().count();
    let room = |s: &str| s.starts_with('!') && (3..=512).contains(&length(s));
    if matches!(action, "rooms" | "messages" | "search") {
        let limit = object.get("limit").map_or(Some(20.0), Value::as_f64)?;
        if !limit.is_finite() || limit.fract() != 0.0 || !(1.0..=50.0).contains(&limit) {
            return None;
        }
        result["limit"] = json!(limit as u32);
    }
    match action {
        "rooms" => {
            let query = object.get("query").map_or(Some(""), Value::as_str)?;
            if length(query) > 200 {
                return None;
            }
            result["query"] = json!(query);
            if let Some(service) = object.get("service")
                && length(service.as_str()?) > 100
            {
                return None;
            }
        }
        "messages" => {
            if !room(object.get("roomId")?.as_str()?) {
                return None;
            }
            result["earlier"] = json!(object.get("earlier").map_or(Some(false), Value::as_bool)?);
        }
        "search" => {
            let query = js_trim(object.get("query")?.as_str()?);
            if !(1..=200).contains(&length(query)) {
                return None;
            }
            result["query"] = json!(query);
            if let Some(id) = object.get("roomId")
                && !room(id.as_str()?)
            {
                return None;
            }
        }
        "send" => {
            if !room(object.get("roomId")?.as_str()?) {
                return None;
            }
            let text = object.get("text")?.as_str()?;
            if !(1..=10_000).contains(&length(text)) || js_trim(text).is_empty() {
                return None;
            }
        }
        "open" => {
            let user = object.get("userId")?.as_str()?;
            let (name, server) = user.strip_prefix('@')?.split_once(':')?;
            if name.is_empty()
                || server.is_empty()
                || length(user) > 512
                || name
                    .chars()
                    .chain(server.chars())
                    .any(crate::text::js_whitespace)
            {
                return None;
            }
        }
        _ => {}
    }
    Some(result)
}

type AbortCallback = Arc<dyn Fn() + Send + Sync>;
#[derive(Default)]
struct SignalState {
    aborted: bool,
    next: u64,
    callbacks: BTreeMap<u64, AbortCallback>,
}
/// Synchronous abort delivery preserves cancellation-before-completion ordering.
#[derive(Clone, Default)]
pub struct MessengerAbortSignal(Arc<Mutex<SignalState>>);
impl MessengerAbortSignal {
    pub fn is_aborted(&self) -> bool {
        self.0.lock().unwrap().aborted
    }
    pub fn abort(&self) {
        let callbacks = {
            let mut state = self.0.lock().unwrap();
            if state.aborted {
                return;
            }
            state.aborted = true;
            std::mem::take(&mut state.callbacks)
        };
        for callback in callbacks.into_values() {
            callback();
        }
    }
    fn subscribe(&self, callback: AbortCallback) -> u64 {
        let mut state = self.0.lock().unwrap();
        let key = state.next;
        state.next += 1;
        state.callbacks.insert(key, callback);
        key
    }
    fn unsubscribe(&self, key: u64) {
        self.0.lock().unwrap().callbacks.remove(&key);
    }
}
pub type GatewayHandler = Arc<
    dyn Fn(
            String,
            Value,
            Option<MessengerAbortSignal>,
        ) -> BoxFuture<'static, Result<MessengerToolResponse, String>>
        + Send
        + Sync,
>;
#[derive(Clone)]
pub struct BrowserClient {
    pub user_id: String,
    pub active: Arc<dyn Fn() -> Result<bool, String> + Send + Sync>,
    pub send: Arc<dyn Fn(MessengerRequest) -> Result<(), String> + Send + Sync>,
}
struct Pending {
    client_id: String,
    resolve: oneshot::Sender<MessengerToolResponse>,
    abort: Option<(MessengerAbortSignal, u64)>,
    timer: Option<AbortHandle>,
}
#[derive(Default)]
struct State {
    clients: Vec<(String, BrowserClient)>,
    pending: Vec<(String, Pending)>,
    gateway: Option<GatewayHandler>,
}
#[derive(Clone)]
pub struct MessengerBridge {
    state: Arc<Mutex<State>>,
    clock: Clock,
}
impl Default for MessengerBridge {
    fn default() -> Self {
        Self::new()
    }
}
impl MessengerBridge {
    pub fn new() -> Self {
        Self::with_clock(default_clock())
    }
    pub fn with_clock(clock: Clock) -> Self {
        Self {
            state: Arc::new(Mutex::new(State::default())),
            clock,
        }
    }
    pub fn set_gateway_handler(&self, handler: Option<GatewayHandler>) {
        self.state.lock().unwrap().gateway = handler;
    }
    pub fn register(&self, client_id: String, browser: BrowserClient) {
        self.unregister(&client_id);
        self.state
            .lock()
            .unwrap()
            .clients
            .push((client_id, browser));
    }
    pub fn unregister(&self, client_id: &str) {
        let ids = {
            let mut state = self.state.lock().unwrap();
            state.clients.retain(|(id, _)| id != client_id);
            state
                .pending
                .iter()
                .filter(|(_, pending)| pending.client_id == client_id)
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>()
        };
        for id in ids {
            finish(
                &self.state,
                &id,
                MessengerToolResponse::denied(
                    "Messenger access ended. If a send was in progress, check the room before retrying.",
                ),
            );
        }
    }
    pub fn complete(&self, client_id: &str, user_id: &str, request_id: &str, result: &Value) {
        {
            let state = self.state.lock().unwrap();
            if !state
                .pending
                .iter()
                .find(|(id, _)| id == request_id)
                .is_some_and(|(_, pending)| pending.client_id == client_id)
                || !state
                    .clients
                    .iter()
                    .any(|(id, client)| id == client_id && client.user_id == user_id)
            {
                return;
            }
        }
        let (Some(ok), Some(message)) = (
            result.get("ok").and_then(Value::as_bool),
            result.get("message").and_then(Value::as_str),
        ) else {
            return;
        };
        if json_output_exceeds_limit(result, 150_000) {
            finish(
                &self.state,
                request_id,
                MessengerToolResponse::denied(
                    "Messenger output exceeded the limit. Narrow your query.",
                ),
            );
        } else {
            finish(
                &self.state,
                request_id,
                MessengerToolResponse {
                    ok,
                    message: Utf16Text(message.encode_utf16().take(2000).collect()),
                    data: result.get("data").cloned(),
                },
            );
        }
    }
    /// Runs authorization and browser send synchronously before returning the future.
    pub fn request(
        &self,
        user_id: Option<&str>,
        input: &Value,
        signal: Option<MessengerAbortSignal>,
        timeout_ms: Option<f64>,
    ) -> BoxFuture<'static, Result<MessengerToolResponse, String>> {
        let denied = |message: &str| {
            Box::pin(ready(Ok(MessengerToolResponse::denied(message))))
                as BoxFuture<'static, Result<MessengerToolResponse, String>>
        };
        let Some(command) = parse_messenger_command(input) else {
            return denied("Invalid Messenger command.");
        };
        let Some(owner) = user_id.filter(|user| !user.is_empty()) else {
            return denied("An authenticated Jait user is required.");
        };
        if signal
            .as_ref()
            .is_some_and(MessengerAbortSignal::is_aborted)
        {
            return denied("Cancelled.");
        }
        let gateway = self.state.lock().unwrap().gateway.clone();
        if let Some(gateway) = gateway {
            return gateway(owner.into(), command, signal);
        }
        let clients = self.state.lock().unwrap().clients.clone();
        let mut active = vec![];
        for (id, client) in clients {
            if client.user_id != owner {
                continue;
            }
            match (client.active)() {
                Ok(true) => active.push((id, client)),
                Ok(false) => {}
                Err(error) => return Box::pin(ready(Err(error))),
            }
        }
        if active.len() != 1 {
            return denied(if active.is_empty() {
                "Open /messenger, connect Matrix, and enable Allow assistant access in Connections."
            } else {
                "Multiple Messenger tabs have assistant access enabled. Disable it in all but the intended tab."
            });
        }
        let (client_id, client) = active.pop().unwrap();
        let request_id = uuid::Uuid::new_v4().to_string();
        let (resolve, receive) = oneshot::channel();
        {
            let mut state = self.state.lock().unwrap();
            if state.pending.len() >= 32 {
                return denied("Messenger is busy. Try again later.");
            }
            state.pending.push((
                request_id.clone(),
                Pending {
                    client_id,
                    resolve,
                    abort: None,
                    timer: None,
                },
            ));
        }
        let timeout = timeout_ms.unwrap_or(15_000.0);
        let delay = if !timeout.is_finite() || !(1.0..=2_147_483_647.0).contains(&timeout) {
            1
        } else {
            timeout.trunc() as u64
        };
        let state = self.state.clone();
        let id = request_id.clone();
        let deadline = tokio::time::Instant::now() + Duration::from_millis(delay);
        let (dispatch_done, wait_dispatch) = oneshot::channel();
        let timer = tokio::spawn(async move {
            let _ = wait_dispatch.await;
            tokio::time::sleep_until(deadline).await;
            finish(&state, &id, MessengerToolResponse::denied("Messenger timed out. If sending had started, delivery is uncertain; check the room before retrying."));
        }).abort_handle();
        if let Some(pending) = self
            .state
            .lock()
            .unwrap()
            .pending
            .iter_mut()
            .find(|(id, _)| id == &request_id)
            .map(|(_, pending)| pending)
        {
            pending.timer = Some(timer);
        } else {
            timer.abort();
        }
        if let Some(signal) = signal {
            let weak: Weak<Mutex<State>> = Arc::downgrade(&self.state);
            let id = request_id.clone();
            let mut state = self.state.lock().unwrap();
            if let Some((_, pending)) = state.pending.iter_mut().find(|(id, _)| id == &request_id) {
                let token = signal.subscribe(Arc::new(move || {
                    if let Some(state) = weak.upgrade() {
                        finish(&state, &id, MessengerToolResponse::denied("Cancelled. If sending had started, check the room before retrying."));
                    }
                }));
                pending.abort = Some((signal, token));
            }
        }
        let request = MessengerRequest {
            request_id: request_id.clone(),
            expires_at: (self.clock)() as f64 + timeout,
            command,
        };
        if (client.send)(request).is_err() {
            finish(
                &self.state,
                &request_id,
                MessengerToolResponse::denied("Messenger browser disconnected."),
            );
        }
        let _ = dispatch_done.send(());
        Box::pin(async move {
            receive
                .await
                .map_err(|_| "Messenger bridge stopped before resolving request".into())
        })
    }
    pub fn stop(&self) {
        let ids = self
            .state
            .lock()
            .unwrap()
            .clients
            .iter()
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        for id in ids {
            self.unregister(&id);
        }
    }
    pub fn pending_count(&self) -> usize {
        self.state.lock().unwrap().pending.len()
    }
}
// Count ECMAScript JSON UTF-16 units without recursive graph conversion or a
// second full copy of untrusted browser output. Stop as soon as the cap is crossed.
fn json_output_exceeds_limit(value: &Value, limit: usize) -> bool {
    fn quoted_length(text: &str, remaining: usize) -> usize {
        let mut length: usize = 2;
        for ch in text.chars() {
            length = length.saturating_add(match ch {
                '"' | '\\' | '\u{0008}' | '\u{000c}' | '\n' | '\r' | '\t' => 2,
                '\u{0000}'..='\u{001f}' => 6,
                _ => ch.len_utf16(),
            });
            if length > remaining {
                break;
            }
        }
        length
    }
    let mut length = 0usize;
    let mut pending = vec![value];
    while let Some(value) = pending.pop() {
        let amount = match value {
            Value::Null => 4,
            Value::Bool(value) => {
                if *value {
                    4
                } else {
                    5
                }
            }
            Value::Number(value) => {
                let value = value.as_f64().unwrap_or(f64::NAN);
                if !value.is_finite() {
                    4
                } else if value == 0.0 {
                    1
                } else {
                    ryu_js::Buffer::new().format(value).len()
                }
            }
            Value::String(text) => quoted_length(text, limit.saturating_sub(length)),
            Value::Array(values) => {
                let punctuation = 2usize.saturating_add(values.len().saturating_sub(1));
                if length.saturating_add(punctuation) > limit {
                    return true;
                }
                pending.extend(values.iter().rev());
                punctuation
            }
            Value::Object(values) => {
                let mut punctuation = 2usize.saturating_add(values.len().saturating_sub(1));
                for key in values.keys() {
                    punctuation = punctuation
                        .saturating_add(quoted_length(
                            key,
                            limit.saturating_sub(length.saturating_add(punctuation)),
                        ))
                        .saturating_add(1);
                    if length.saturating_add(punctuation) > limit {
                        return true;
                    }
                }
                pending.extend(values.values().rev());
                punctuation
            }
        };
        length = length.saturating_add(amount);
        if length > limit {
            return true;
        }
    }
    false
}

fn finish(state: &Arc<Mutex<State>>, request_id: &str, result: MessengerToolResponse) {
    let pending = {
        let mut state = state.lock().unwrap();
        state
            .pending
            .iter()
            .position(|(id, _)| id == request_id)
            .map(|index| state.pending.remove(index).1)
    };
    if let Some(pending) = pending {
        if let Some(timer) = pending.timer {
            timer.abort();
        }
        if let Some((signal, token)) = pending.abort {
            signal.unsubscribe(token);
        }
        let _ = pending.resolve.send(result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn client() -> BrowserClient {
        BrowserClient {
            user_id: "owner".into(),
            active: Arc::new(|| Ok(true)),
            send: Arc::new(|_| Ok(())),
        }
    }
    #[tokio::test(start_paused = true)]
    async fn outstanding_request_outlives_the_last_external_bridge_handle() {
        let bridge = MessengerBridge::new();
        bridge.register("tab".into(), client());
        let weak = Arc::downgrade(&bridge.state);
        let request = bridge.request(Some("owner"), &json!({"action":"status"}), None, Some(10.0));
        drop(bridge);
        assert!(
            weak.upgrade().is_some(),
            "timer must retain pending request state"
        );
        tokio::time::advance(Duration::from_millis(10)).await;
        let response = request.await.unwrap();
        assert!(!response.ok);
        assert_eq!(
            response.message,
            Utf16Text::from(
                "Messenger timed out. If sending had started, delivery is uncertain; check the room before retrying."
            )
        );
        tokio::task::yield_now().await;
        assert!(
            weak.upgrade().is_none(),
            "settled request must release its state"
        );
    }
    #[tokio::test(start_paused = true)]
    async fn abandoned_receiver_still_releases_capacity_and_abort_subscription() {
        let bridge = MessengerBridge::new();
        bridge.register("tab".into(), client());
        let signal = MessengerAbortSignal::default();
        let request = bridge.request(
            Some("owner"),
            &json!({"action":"status"}),
            Some(signal.clone()),
            Some(10.0),
        );
        drop(request);
        assert_eq!(bridge.pending_count(), 1);
        assert_eq!(signal.0.lock().unwrap().callbacks.len(), 1);
        tokio::time::advance(Duration::from_millis(10)).await;
        tokio::task::yield_now().await;
        assert_eq!(bridge.pending_count(), 0);
        assert!(signal.0.lock().unwrap().callbacks.is_empty());
    }
    #[tokio::test(start_paused = true)]
    async fn abort_resolves_before_a_later_completion_even_without_polling() {
        let bridge = MessengerBridge::new();
        let sent = Arc::new(Mutex::new(None));
        let sent_clone = sent.clone();
        let mut browser = client();
        browser.send = Arc::new(move |request| {
            *sent_clone.lock().unwrap() = Some(request);
            Ok(())
        });
        bridge.register("tab".into(), browser);
        let signal = MessengerAbortSignal::default();
        let request = bridge.request(
            Some("owner"),
            &json!({"action":"status"}),
            Some(signal.clone()),
            None,
        );
        signal.abort();
        assert_eq!(bridge.pending_count(), 0);
        bridge.complete(
            "tab",
            "owner",
            &sent.lock().unwrap().as_ref().unwrap().request_id,
            &json!({"ok":true,"message":"too late"}),
        );
        let response = request.await.unwrap();
        assert!(!response.ok);
        assert_eq!(
            response.message,
            Utf16Text::from("Cancelled. If sending had started, check the room before retrying.")
        );
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn timeout_waits_for_the_synchronous_send_callback_to_return() {
        let bridge = MessengerBridge::new();
        let inside = bridge.clone();
        let mut browser = client();
        browser.send = Arc::new(move |_| {
            std::thread::sleep(Duration::from_millis(20));
            assert_eq!(
                inside.pending_count(),
                1,
                "source timers cannot interrupt synchronous dispatch"
            );
            Ok(())
        });
        bridge.register("tab".into(), browser);
        let request = bridge.request(Some("owner"), &json!({"action":"status"}), None, Some(1.0));
        assert!(!request.await.unwrap().ok);
        bridge.stop();
    }
    #[tokio::test(start_paused = true)]
    async fn deeply_nested_valid_json_does_not_panic_in_output_budget_check() {
        let bridge = MessengerBridge::new();
        let captured = Arc::new(Mutex::new(None));
        let target = captured.clone();
        let mut browser = client();
        browser.send = Arc::new(move |request| {
            *target.lock().unwrap() = Some(request);
            Ok(())
        });
        bridge.register("tab".into(), browser);
        let request = bridge.request(Some("owner"), &json!({"action":"status"}), None, None);
        let mut data = json!(0);
        for _ in 0..600 {
            data = Value::Array(vec![data]);
        }
        bridge.complete(
            "tab",
            "owner",
            &captured.lock().unwrap().as_ref().unwrap().request_id,
            &json!({"ok":true,"message":"deep","data":data}),
        );
        assert!(request.await.unwrap().ok);
        bridge.stop();
    }
}
