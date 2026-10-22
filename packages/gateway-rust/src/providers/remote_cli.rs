//! Remote CLI execution adapter. The control-plane peer owns node authentication,
//! bounded requests, wire framing and subscription multiplexing; this adapter owns
//! provider sessions and streamed turn completion. No network is opened implicitly.
use super::{codex_event_mapper::map_codex_notification, provider_auth::DEVICE_PROVIDER_AUTH};
use crate::{
    identifiers::uuidv7,
    text::js_trim,
    time::{Clock, default_clock, iso},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::oneshot;

pub type OperationFuture<'a> = Pin<Box<dyn Future<Output = Result<Value, String>> + Send + 'a>>;
pub type RemoteEventHandler = Arc<dyn Fn(&str, Value) + Send + Sync>;
pub type Unsubscribe = Box<dyn FnOnce() + Send + Sync>;

/// Implementations must preserve authenticated-node routing, the node's `agent`
/// capability grant for execution operations, and enforce the supplied timeout,
/// including cancellation of an abandoned request future.
pub trait RemoteProviderTransport: Send + Sync {
    fn providers(&self, node_id: &str) -> Option<Vec<String>>;
    fn operation<'a>(
        &'a self,
        node_id: &'a str,
        operation: &'a str,
        params: Value,
        timeout: Duration,
    ) -> OperationFuture<'a>;
    /// One listener per adapter, multiplexed with other users of the same peer.
    fn subscribe(&self, handler: RemoteEventHandler) -> Unsubscribe;
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionOptions {
    pub thread_id: String,
    pub working_directory: String,
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp_servers: Option<Vec<Value>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSession {
    pub id: String,
    pub provider_id: String,
    pub thread_id: String,
    pub status: String,
    pub runtime_mode: String,
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_thread_id: Option<String>,
}

struct State {
    sessions: HashMap<String, RemoteSession>,
    listeners: BTreeMap<u64, Arc<dyn Fn(Value) + Send + Sync>>,
    completions: HashMap<u64, (String, oneshot::Sender<()>)>,
    next_id: u64,
    subscription: Option<Unsubscribe>,
}
impl State {
    fn next_id(&mut self) -> u64 {
        self.next_id += 1;
        self.next_id
    }
}

#[derive(Clone)]
pub struct RemoteCliProvider {
    pub id: String,
    pub provider_type: String,
    node_id: String,
    transport: Arc<dyn RemoteProviderTransport>,
    state: Arc<Mutex<State>>,
    info: Arc<Mutex<Value>>,
    clock: Clock,
}
impl RemoteCliProvider {
    pub fn new(
        transport: Arc<dyn RemoteProviderTransport>,
        node_id: String,
        id: String,
        provider_type: Option<String>,
    ) -> Self {
        let provider_type = provider_type.unwrap_or_else(|| id.clone());
        let info = json!({"id":id,"providerType":provider_type,"name":format!("Remote {id}"),"description":format!("{id} running on remote device {node_id}"),"available":true,"modes":["full-access","supervised"],"auth":DEVICE_PROVIDER_AUTH});
        Self {
            id,
            provider_type,
            node_id,
            transport,
            info: Arc::new(Mutex::new(info)),
            state: Arc::new(Mutex::new(State {
                sessions: HashMap::new(),
                listeners: BTreeMap::new(),
                completions: HashMap::new(),
                next_id: 0,
                subscription: None,
            })),
            clock: default_clock(),
        }
    }
    pub fn with_clock(mut self, clock: Clock) -> Self {
        self.clock = clock;
        self
    }
    pub fn info(&self) -> Value {
        self.info.lock().unwrap().clone()
    }
    pub fn session(&self, id: &str) -> Option<RemoteSession> {
        self.state.lock().unwrap().sessions.get(id).cloned()
    }
    pub fn check_availability(&self) -> bool {
        let mut info = self.info.lock().unwrap();
        let Some(providers) = self.transport.providers(&self.node_id) else {
            info["available"] = json!(false);
            info["unavailableReason"] = json!(format!("Device {} is not connected", self.node_id));
            return false;
        };
        let available = providers.contains(&self.provider_type);
        info["available"] = json!(available);
        if !available {
            info["unavailableReason"] = json!(format!(
                "Provider {} not available on device {}",
                self.provider_type, self.node_id
            ));
        }
        available
    }
    fn auth_params(&self) -> Value {
        json!({"providerId":self.id,"providerType":self.provider_type})
    }
    pub async fn auth_status(&self) -> Result<Value, String> {
        self.transport
            .operation(
                &self.node_id,
                "auth-status",
                self.auth_params(),
                Duration::from_secs(60),
            )
            .await
    }
    pub async fn start_login(&self) -> Result<Value, String> {
        self.transport
            .operation(
                &self.node_id,
                "start-login",
                self.auth_params(),
                Duration::from_secs(90),
            )
            .await
    }
    pub async fn logout(&self) -> Result<Value, String> {
        self.transport
            .operation(
                &self.node_id,
                "logout",
                self.auth_params(),
                Duration::from_secs(90),
            )
            .await
    }
    /// The reference's fire-and-forget login input is awaited here so callers can
    /// retain transport errors rather than create unobserved task failures.
    pub async fn send_login_input(&self, input: &str) -> Result<Value, String> {
        let mut params = self.auth_params();
        params["input"] = json!(input);
        self.transport
            .operation(
                &self.node_id,
                "login-input",
                params,
                Duration::from_secs(60),
            )
            .await
    }
    pub async fn list_models(&self) -> Result<Value, String> {
        let result = self
            .transport
            .operation(
                &self.node_id,
                "list-models",
                self.auth_params(),
                Duration::from_secs(90),
            )
            .await?;
        if self.provider_type == "codex" {
            Ok(normalize_codex_models(&result))
        } else {
            Ok(if result.is_array() { result } else { json!([]) })
        }
    }
    pub fn on_event(&self, handler: Arc<dyn Fn(Value) + Send + Sync>) -> Unsubscribe {
        let mut state = self.state.lock().unwrap();
        let id = state.next_id();
        state.listeners.insert(id, handler);
        let weak = Arc::downgrade(&self.state);
        Box::new(move || {
            if let Some(state) = weak.upgrade() {
                state.lock().unwrap().listeners.remove(&id);
            }
        })
    }
    fn ensure_subscription(&self) {
        {
            let mut state = self.state.lock().unwrap();
            if state.subscription.is_some() {
                return;
            }
            // Reserve registration before calling the peer, which may deliver
            // buffered notifications synchronously. Never call peer code while
            // holding the session lock.
            state.subscription = Some(Box::new(|| {}));
        }
        let weak = Arc::downgrade(&self.state);
        let unsubscribe = self.transport.subscribe(Arc::new(move |session, event| {
            if let Some(state) = weak.upgrade() {
                handle_remote_event(&state, session, event);
            }
        }));
        let unused = {
            let mut state = self.state.lock().unwrap();
            if state.sessions.is_empty() {
                Some(unsubscribe)
            } else {
                state.subscription = Some(unsubscribe);
                None
            }
        };
        if let Some(unsubscribe) = unused {
            unsubscribe();
        }
    }
    pub async fn start_session(
        &self,
        options: StartSessionOptions,
    ) -> Result<RemoteSession, String> {
        let id = uuidv7();
        let session = RemoteSession {
            id: id.clone(),
            provider_id: self.id.clone(),
            thread_id: options.thread_id.clone(),
            status: "starting".into(),
            runtime_mode: options.mode.clone(),
            started_at: iso((self.clock)())?,
            completed_at: None,
            error: None,
            provider_thread_id: None,
        };
        self.state
            .lock()
            .unwrap()
            .sessions
            .insert(id.clone(), session.clone());
        let mut cleanup = StartCleanup {
            state: Arc::downgrade(&self.state),
            session: Some(id.clone()),
        };
        self.ensure_subscription();
        let mut params = serde_json::to_value(options).map_err(|e| e.to_string())?;
        params.as_object_mut().unwrap().remove("threadId");
        params["sessionId"] = json!(id);
        params["providerId"] = json!(self.id);
        params["providerType"] = json!(self.provider_type);
        match self
            .transport
            .operation(
                &self.node_id,
                "start-session",
                params,
                Duration::from_secs(90),
            )
            .await
        {
            Ok(result) => {
                let mut session = session;
                session.status = "running".into();
                // Reference emits session.started before storing the remote ID.
                if let Some(stored) = self.state.lock().unwrap().sessions.get_mut(&id) {
                    *stored = session.clone();
                }
                emit(
                    &self.state,
                    json!({"type":"session.started","sessionId":id}),
                );
                session.provider_thread_id = result
                    .get("providerThreadId")
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned);
                if let Some(stored) = self.state.lock().unwrap().sessions.get_mut(&id) {
                    *stored = session.clone();
                }
                cleanup.session = None;
                Ok(session)
            }
            Err(error) => {
                remove_session(&self.state, &id);
                emit(
                    &self.state,
                    json!({"type":"session.error","sessionId":id,"error":error}),
                );
                Err(error)
            }
        }
    }
    pub async fn send_turn(
        &self,
        session_id: &str,
        message: &str,
        attachments: Option<Vec<Value>>,
    ) -> Result<(), String> {
        let session = self
            .session(session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;
        let (send, receive) = oneshot::channel();
        let key = {
            let mut state = self.state.lock().unwrap();
            let key = state.next_id();
            state.completions.insert(key, (session_id.into(), send));
            key
        };
        let _cleanup = CompletionCleanup {
            state: Arc::downgrade(&self.state),
            key,
        };
        // Run the reference's independent completion timer while the operation is
        // pending. A hung request still obeys its longer transport deadline.
        let state = self.state.clone();
        let id = session_id.to_owned();
        let provider = self.id.clone();
        let timer = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(1800)).await;
            let pending = state.lock().unwrap().completions.remove(&key);
            if let Some((_, done)) = pending {
                emit(
                    &state,
                    json!({"type":"session.error","sessionId":id,"error":format!("Remote {provider} turn timed out waiting for completion")}),
                );
                let _ = done.send(());
            }
        });
        let _timer = AbortTimer(timer);
        let mut params = json!({"sessionId":session_id,"message":message,"providerThreadId":session.provider_thread_id.unwrap_or_else(||session_id.to_owned())});
        if let Some(attachments) = attachments.filter(|a| !a.is_empty()) {
            params["attachments"] = json!(attachments);
        }
        let result = self
            .transport
            .operation(
                &self.node_id,
                "send-turn",
                params,
                Duration::from_secs(1830),
            )
            .await?;
        if result.get("completed").is_some_and(truthy) {
            let pending = self.state.lock().unwrap().completions.remove(&key);
            if pending.is_some() {
                emit(
                    &self.state,
                    json!({"type":"turn.completed","sessionId":session_id}),
                );
                return Ok(());
            }
        }
        let _ = receive.await;
        Ok(())
    }
    pub async fn stop_session(&self, id: &str) -> Result<(), String> {
        let result = self
            .transport
            .operation(
                &self.node_id,
                "stop-session",
                json!({"sessionId":id}),
                Duration::from_secs(15),
            )
            .await?;
        if result.get("stopped") == Some(&Value::Bool(false)) {
            return Err(format!(
                "Remote session {id} is no longer tracked on device {}",
                self.node_id
            ));
        }
        remove_session(&self.state, id);
        Ok(())
    }
    pub async fn interrupt_turn(&self, id: &str) -> Result<(), String> {
        self.stop_session(id).await
    }
    /// Remote approvals are deliberately unsupported by the reference adapter.
    /// This does not grant approval; the execution peer retains its consent path.
    pub async fn respond_to_approval(&self, _session: &str, _request: &str, _approved: bool) {}
}
struct AbortTimer(tokio::task::JoinHandle<()>);
impl Drop for AbortTimer {
    fn drop(&mut self) {
        self.0.abort();
    }
}
struct StartCleanup {
    state: std::sync::Weak<Mutex<State>>,
    session: Option<String>,
}
impl Drop for StartCleanup {
    fn drop(&mut self) {
        if let Some(id) = &self.session
            && let Some(state) = self.state.upgrade()
        {
            remove_session(&state, id);
        }
    }
}
struct CompletionCleanup {
    state: std::sync::Weak<Mutex<State>>,
    key: u64,
}
impl Drop for CompletionCleanup {
    fn drop(&mut self) {
        if let Some(state) = self.state.upgrade() {
            state.lock().unwrap().completions.remove(&self.key);
        }
    }
}
impl Drop for State {
    fn drop(&mut self) {
        if let Some(unsubscribe) = self.subscription.take() {
            unsubscribe();
        }
    }
}

fn emit(state: &Arc<Mutex<State>>, event: Value) {
    let (listeners, completed) = {
        let mut state = state.lock().unwrap();
        let completed = if matches!(
            event["type"].as_str(),
            Some("turn.completed" | "session.completed" | "session.error")
        ) {
            let session = event["sessionId"].as_str().unwrap_or("");
            let keys = state
                .completions
                .iter()
                .filter(|(_, (id, _))| id == session)
                .map(|(k, _)| *k)
                .collect::<Vec<_>>();
            keys.into_iter()
                .filter_map(|key| state.completions.remove(&key).map(|(_, sender)| sender))
                .collect::<Vec<_>>()
        } else {
            vec![]
        };
        (
            state.listeners.values().cloned().collect::<Vec<_>>(),
            completed,
        )
    };
    for listener in listeners {
        listener(event.clone());
    }
    for done in completed {
        let _ = done.send(());
    }
}
fn remove_session(state: &Arc<Mutex<State>>, id: &str) {
    let unsubscribe = {
        let mut state = state.lock().unwrap();
        state.sessions.remove(id);
        if state.sessions.is_empty() {
            state.subscription.take()
        } else {
            None
        }
    };
    if let Some(unsubscribe) = unsubscribe {
        unsubscribe();
    }
}
fn nonempty(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|s| !js_trim(s).is_empty())
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64().is_some_and(|n| n != 0.0),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}
fn handle_remote_event(state: &Arc<Mutex<State>>, id: &str, mut event: Value) {
    if !state.lock().unwrap().sessions.contains_key(id) {
        return;
    }
    // Iterative unwrapping prevents a nested provider.line from exhausting the
    // native stack; input/output byte limits remain the transport's responsibility.
    loop {
        let kind = nonempty(event.get("type"));
        if kind == Some("provider.line") {
            let Some(line) = nonempty(event.get("line")) else {
                return;
            };
            let Ok(decoded) = serde_json::from_str(line) else {
                return;
            };
            event = decoded;
            continue;
        }
        let normalized = match kind {
            Some("provider.turn-started") => Some(json!({"type":"turn.started","sessionId":id})),
            Some("provider.turn-completed") => {
                Some(json!({"type":"turn.completed","sessionId":id}))
            }
            Some("provider.error") => Some(
                json!({"type":"session.error","sessionId":id,"error":nonempty(event.get("message")).unwrap_or("Remote provider turn failed")}),
            ),
            Some("provider.stopped") => Some(json!({"type":"session.completed","sessionId":id})),
            _ => None,
        };
        if let Some(event) = normalized {
            let terminal = matches!(
                event["type"].as_str(),
                Some("session.completed" | "session.error")
            );
            emit(state, event);
            if terminal {
                remove_session(state, id);
            }
            return;
        }
        if event.get("type").is_some_and(Value::is_string)
            && event
                .get("sessionId")
                .and_then(Value::as_str)
                .is_none_or(|session| session == id)
        {
            event["sessionId"] = json!(id);
            let terminal = matches!(
                event["type"].as_str(),
                Some("session.completed" | "session.error")
            );
            emit(state, event);
            if terminal {
                remove_session(state, id);
            }
            return;
        }
        let Some(method) = event.get("method").and_then(Value::as_str) else {
            return;
        };
        let params = event.get("params").cloned().unwrap_or_else(|| json!({}));
        for mapped in map_codex_notification(method, &params, id) {
            let event = serde_json::to_value(mapped).expect("provider event serializes");
            let terminal = event["type"] == "session.completed";
            emit(state, event);
            if terminal {
                remove_session(state, id);
            }
        }
        return;
    }
}

pub fn normalize_codex_models(result: &Value) -> Value {
    let Some(models) = result
        .as_array()
        .or_else(|| result.get("data").and_then(Value::as_array))
    else {
        return json!([]);
    };
    json!(
        models
            .iter()
            .filter_map(|model| {
                if !model.is_object() || model.get("hidden") == Some(&Value::Bool(true)) {
                    return None;
                }
                let id = nonempty(model.get("id")).or_else(|| nonempty(model.get("model")))?;
                let name = nonempty(model.get("displayName"))
                    .or_else(|| nonempty(model.get("name")))
                    .unwrap_or(id);
                let mut out = json!({"id":id,"name":name});
                if let Some(description) = nonempty(model.get("description")) {
                    out["description"] = json!(description);
                }
                if let Some(default) = model.get("isDefault").and_then(Value::as_bool) {
                    out["isDefault"] = json!(default);
                }
                if let Some(efforts) = model
                    .get("supportedReasoningEfforts")
                    .and_then(Value::as_array)
                {
                    let efforts = efforts
                        .iter()
                        .filter_map(|effort| {
                            let name = nonempty(effort.get("reasoningEffort"))?;
                            let mut out = json!({"reasoningEffort":name});
                            if let Some(description) = nonempty(effort.get("description")) {
                                out["description"] = json!(description);
                            }
                            Some(out)
                        })
                        .collect::<Vec<_>>();
                    out["reasoningEffortSupported"] = json!(!efforts.is_empty());
                    if !efforts.is_empty() {
                        out["supportedReasoningEfforts"] = json!(efforts);
                    }
                }
                Some(out)
            })
            .collect::<Vec<_>>()
    )
}
