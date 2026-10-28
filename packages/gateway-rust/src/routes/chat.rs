//! Explicitly mounted candidate chat HTTP/SSE adapter. It shares authenticated
//! session admission and native persistence; it does not activate a provider.
use super::auth::{self, AuthState, response};
use crate::{
    execution::process_runner::ProcessCancellation,
    providers::openai_stream::EventSink,
    runtime::{
        chat_events::EventBus,
        chat_sessions::{SessionTurn, SessionTurnError, SessionTurnManager},
        chat_store::SqliteTurnStore,
        chat_turn::{TurnConfig, TurnError, TurnProvider, TurnTools},
    },
    security::{
        consent_executor::{ExecutionOrigin, RuntimeMode, ToolExecutionContext},
        http_auth::AuthUser,
    },
    services::sessions::{SessionRecord, SessionService},
};
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Path, Request, State},
    http::header,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::{
    Stream,
    future::{BoxFuture, join_all},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    convert::Infallible,
    future::Future,
    num::NonZeroU16,
    path::PathBuf,
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    task::{Context, Poll},
    time::Duration,
};
use tokio::sync::{mpsc, oneshot, watch};

pub struct PreparedChat {
    pub config: TurnConfig,
    pub provider: Arc<dyn TurnProvider>,
    pub tools: Arc<dyn TurnTools>,
}
/// Server-owned configuration only. Preparation must be read-only and must not
/// execute tools or discover ambient credentials. Request fields never select
/// provider URLs, credentials, tools, roots, ownership or execution modes.
pub trait ChatFactory: Send + Sync {
    fn prepare(
        &self,
        user: AuthUser,
        session: SessionRecord,
    ) -> BoxFuture<'_, Result<PreparedChat, String>>;
}
#[derive(Clone, Debug)]
pub struct ChatLimits {
    pub body_bytes: usize,
    pub stream_bytes: usize,
    pub event_bytes: usize,
    pub channel_capacity: usize,
    pub max_active: NonZeroU16,
    pub send_timeout: Duration,
}
impl Default for ChatLimits {
    fn default() -> Self {
        Self {
            body_bytes: 64 * 1024,
            stream_bytes: 1024 * 1024,
            event_bytes: 128 * 1024,
            channel_capacity: 8,
            max_active: NonZeroU16::new(8).unwrap(),
            send_timeout: Duration::from_secs(5),
        }
    }
}
impl ChatLimits {
    fn valid(&self) -> bool {
        (1024..=1024 * 1024).contains(&self.body_bytes)
            && (4096..=8 * 1024 * 1024).contains(&self.stream_bytes)
            && (256..=256 * 1024).contains(&self.event_bytes)
            && self.event_bytes <= self.stream_bytes
            && (1..=32).contains(&self.channel_capacity)
            && self.max_active.get() <= 128
            && !self.send_timeout.is_zero()
            && self.send_timeout <= Duration::from_secs(5)
    }
}
struct ActiveTurn {
    owner: String,
    cancellation: ProcessCancellation,
    done: watch::Sender<bool>,
}
#[derive(Default)]
struct ActiveState {
    closed: AtomicBool,
    turns: Mutex<HashMap<String, ActiveTurn>>,
}
#[derive(Clone)]
pub struct ChatRoutes {
    pub(crate) auth: AuthState,
    factory: Arc<dyn ChatFactory>,
    manager: SessionTurnManager,
    project_root: PathBuf,
    pub(crate) limits: ChatLimits,
    active: Arc<ActiveState>,
    pub(crate) events: Arc<EventBus>,
}
impl ChatRoutes {
    pub fn new(
        auth: AuthState,
        factory: Arc<dyn ChatFactory>,
        manager: SessionTurnManager,
        project_root: PathBuf,
    ) -> Result<Self, String> {
        if !project_root.is_absolute() {
            return Err("Chat fallback project root must be absolute".into());
        }
        Ok(Self {
            auth,
            factory,
            manager,
            project_root,
            limits: ChatLimits::default(),
            active: Arc::new(ActiveState::default()),
            events: EventBus::new(),
        })
    }
    pub fn with_limits(mut self, limits: ChatLimits) -> Result<Self, String> {
        if !limits.valid() {
            return Err("Invalid chat HTTP limits".into());
        }
        self.limits = limits;
        Ok(self)
    }
    pub fn router(&self) -> Router {
        Router::new()
            .route("/api/chat", post(chat))
            .route("/api/chat/cancel", post(cancel))
            .route("/api/sessions/{id}/cancel", post(cancel_path))
            .route("/api/sessions/{id}/messages", get(messages))
            .route("/api/sessions/{id}/stream", get(super::chat_events::stream))
            .route("/api/sessions/{id}/events", get(super::chat_events::stream))
            .with_state(self.clone())
    }
    /// Cancel and drain before shutting down the shared auth/database worker.
    pub async fn shutdown(&self) -> Result<(), String> {
        self.active.closed.store(true, Ordering::Release);
        self.events.close_all();
        let waiting = {
            let active = self.active.turns.lock().unwrap();
            active
                .values()
                .map(|turn| {
                    turn.cancellation.cancel();
                    turn.done.subscribe()
                })
                .collect::<Vec<_>>()
        };
        tokio::time::timeout(
            Duration::from_secs(8),
            join_all(waiting.into_iter().map(|mut done| async move {
                while !*done.borrow_and_update() {
                    if done.changed().await.is_err() {
                        break;
                    }
                }
            })),
        )
        .await
        .map_err(|_| "Chat shutdown exceeded cleanup deadline".to_owned())?;
        Ok(())
    }
    fn admit(&self, owner: &str, session: &str) -> Result<TurnLease, Box<Response>> {
        let mut active = self.active.turns.lock().unwrap();
        if self.active.closed.load(Ordering::Acquire) {
            return Err(Box::new(response(503, json!({"error":"CHAT_CLOSED"}))));
        }
        if active.contains_key(session) {
            return Err(Box::new(response(409, json!({"error":"CHAT_BUSY"}))));
        }
        if active.len() >= usize::from(self.limits.max_active.get()) {
            return Err(Box::new(response(503, json!({"error":"CHAT_CAPACITY"}))));
        }
        let cancellation = ProcessCancellation::default();
        let (done, _) = watch::channel(false);
        active.insert(
            session.into(),
            ActiveTurn {
                owner: owner.into(),
                cancellation: cancellation.clone(),
                done: done.clone(),
            },
        );
        Ok(TurnLease {
            state: self.active.clone(),
            session: session.into(),
            cancellation,
            done,
        })
    }
}
struct TurnLease {
    state: Arc<ActiveState>,
    session: String,
    cancellation: ProcessCancellation,
    done: watch::Sender<bool>,
}
impl Drop for TurnLease {
    fn drop(&mut self) {
        self.cancellation.cancel();
        self.state.turns.lock().unwrap().remove(&self.session);
        let _ = self.done.send(true);
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ChatBody {
    #[serde(rename = "sessionId", alias = "session_id")]
    session_id: String,
    #[serde(alias = "message")]
    content: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CancelBody {
    #[serde(rename = "sessionId", alias = "session_id")]
    session_id: String,
}
fn valid_session(id: &str) -> bool {
    !id.is_empty() && id.len() <= 256 && !id.chars().any(char::is_control)
}
async fn body(state: &ChatRoutes, request: Request) -> Result<Value, Box<Response>> {
    let headers = request.headers().clone();
    let bytes = tokio::time::timeout(
        Duration::from_secs(10),
        to_bytes(request.into_body(), state.limits.body_bytes),
    )
    .await
    .map_err(|_| Box::new(response(408, json!({"error":"BODY_TIMEOUT"}))))?
    .map_err(|_| Box::new(response(413, json!({"error":"BODY_TOO_LARGE"}))))?;
    auth::parse_body(Body::from(bytes), &headers).await
}
pub(crate) async fn owned_session(
    state: &ChatRoutes,
    owner: &str,
    session: &str,
) -> Result<SessionRecord, Box<Response>> {
    let owner = owner.to_owned();
    let session = session.to_owned();
    match state
        .auth
        .with_database(move |db| {
            Ok(SessionService::new(db)
                .get(&session, Some(&owner))?
                .filter(|session| session.status.as_deref() == Some("active")))
        })
        .await
    {
        Ok(Some(session)) => Ok(session),
        Ok(None) => Err(Box::new(response(
            404,
            json!({"error":"SESSION_NOT_FOUND"}),
        ))),
        Err(_) => Err(Box::new(auth::internal_error())),
    }
}
// These fields carry semantics that the native turn does not yet implement.
// Reject their presence, including null or empty values: omission can select a
// server default while an explicit value can express provider or security intent.
const UNSUPPORTED_CHAT_OPTIONS: &[&str] = &[
    "personaAgentId",
    "queuedMessageId",
    "mode",
    "provider",
    "runtimeMode",
    "responseStyle",
    "model",
    "reasoningEffort",
    "displaySegments",
    "attachments",
    "_queuedDrain",
    "_queuedMessageId",
    "_systemNotification",
    "_systemNotice",
    "_recoveryAttempts",
    "_loopRevision",
];

fn parse_chat_request(value: Value) -> Result<ChatBody, Box<Response>> {
    if let Some(object) = value.as_object() {
        if let Some(option) = UNSUPPORTED_CHAT_OPTIONS
            .iter()
            .find(|key| object.contains_key(**key))
        {
            return Err(Box::new(response(
                400,
                json!({
                    "error": "UNSUPPORTED_CHAT_OPTION", "option": option
                }),
            )));
        }
    }
    serde_json::from_value(value)
        .map_err(|_| Box::new(response(400, json!({"error":"INVALID_CHAT_REQUEST"}))))
}
async fn chat(State(state): State<ChatRoutes>, request: Request) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    let input = match body(&state, request).await.and_then(parse_chat_request) {
        Ok(input) => input,
        Err(error) => return *error,
    };
    if !valid_session(&input.session_id)
        || input.content.trim().is_empty()
        || input.content.len() > 32 * 1024
    {
        return response(400, json!({"error":"INVALID_CHAT_REQUEST"}));
    }
    let session = match owned_session(&state, &user.id, &input.session_id).await {
        Ok(session) => session,
        Err(error) => return *error,
    };
    let project_root = session
        .project_path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| state.project_root.clone());
    if !project_root.is_absolute() {
        return response(409, json!({"error":"SESSION_PROJECT_ROOT_INVALID"}));
    }
    let lease = match state.admit(&user.id, &input.session_id) {
        Ok(lease) => lease,
        Err(error) => return *error,
    };
    let cancellation = lease.cancellation.clone();
    let prepared = tokio::select! {biased;
        _=cancellation.wait_cancelled()=>return response(409,json!({"error":"CHAT_CANCELLED"})),
        result=tokio::time::timeout(Duration::from_secs(10),state.factory.prepare(user.clone(),session))=>match result{Ok(Ok(prepared))=>prepared,_=>return response(503,json!({"error":"CHAT_CONFIGURATION_UNAVAILABLE"}))},
    };
    let store = match SqliteTurnStore::new(
        state.auth.clone(),
        user.id.clone(),
        input.session_id.clone(),
    )
    .map(|store| store.with_events(state.events.clone()))
    {
        Ok(store) => store,
        Err(_) => return auth::internal_error(),
    };
    if store.check_stream_capacity().await.is_err() {
        return response(503, json!({"error":"CHAT_STREAM_CAPACITY_UNAVAILABLE"}));
    }
    // Keep the previous failure visible if preparation or capacity checks fail.
    state.events.clear_failure(&input.session_id);
    let context = ToolExecutionContext {
        user_id: user.id,
        session_id: input.session_id.clone(),
        action_id: uuid::Uuid::new_v4().to_string(),
        project_root,
        origin: ExecutionOrigin::Agent,
        runtime_mode: RuntimeMode::Guarded,
        cancellation: cancellation.clone(),
        on_output: None,
    };
    let (sender, receiver) = mpsc::channel(state.limits.channel_capacity);
    // The terminal frame has its own bounded slot, so a full token channel
    // cannot discard completion/error after cancellation.
    let (terminal_sender, terminal_receiver) = oneshot::channel();
    let serial = Arc::new(tokio::sync::Mutex::new(()));
    let sink_closed = Arc::new(AtomicBool::new(false));
    let delivery_failed = Arc::new(AtomicBool::new(false));
    let stream_failed = Arc::new(AtomicBool::new(false));
    let sink = event_sink(
        sender.clone(),
        cancellation.clone(),
        state.limits.clone(),
        store.clone(),
        serial.clone(),
        sink_closed.clone(),
        delivery_failed.clone(),
        stream_failed.clone(),
    );
    let manager = state.manager.clone();
    let events = state.events.clone();
    let session_id = input.session_id;
    tokio::spawn(async move {
        let _lease = lease;
        let result = manager
            .run(SessionTurn {
                config: prepared.config,
                provider: &*prepared.provider,
                tools: &*prepared.tools,
                store: &store,
                context: &context,
                user_content: input.content,
                sink,
            })
            .await;
        let _serial = serial.lock().await;
        sink_closed.store(true, Ordering::Release);
        let event = if stream_failed.load(Ordering::Acquire) {
            json!({"type":"error","message":"Chat stream could not be persisted"})
        } else {
            match result {
                Ok(outcome) => {
                    json!({"type":"done","session_id":session_id,"prompt_count":null,"remaining_prompts":null,"rounds":outcome.rounds})
                }
                Err(SessionTurnError::Turn(TurnError::Cancelled)) => {
                    json!({"type":"done","session_id":session_id,"cancelled":true,"prompt_count":null,"remaining_prompts":null})
                }
                Err(error) => json!({"type":"error","message":public_error(&error)}),
            }
        };
        let persisted = store.append_stream_terminal(event.clone()).await.is_ok();
        let terminal = if !persisted {
            let failure = json!({"type":"error","message":"Chat stream could not be persisted"});
            events.publish_failure(&session_id, &context.user_id, failure.to_string());
            failure
        } else if delivery_failed.load(Ordering::Acquire) {
            json!({"type":"replay_required"})
        } else {
            event
        };
        let _ = terminal_sender.send(format!("data: {terminal}\n\n"));
        drop(sender);
    });
    let stream = ChatStream {
        receiver,
        terminal: Some(terminal_receiver),
        ready_terminal: None,
    };
    (
        [
            (header::CONTENT_TYPE, "text/event-stream"),
            (header::CACHE_CONTROL, "no-cache, no-transform"),
            (header::CONTENT_ENCODING, "identity"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        Body::from_stream(stream),
    )
        .into_response()
}
fn public_error(error: &SessionTurnError) -> &'static str {
    match error {
        SessionTurnError::SessionBusy => "A turn is already active",
        SessionTurnError::Capacity => "Chat capacity unavailable",
        SessionTurnError::Turn(TurnError::TimedOut) => "Chat turn timed out",
        SessionTurnError::Turn(TurnError::RoundLimit | TurnError::ToolCallLimit) => {
            "Chat turn reached its execution limit"
        }
        SessionTurnError::Turn(TurnError::HistoryLimit) => "Chat history limit reached",
        _ => "Chat turn could not complete",
    }
}
fn event_sink(
    sender: mpsc::Sender<String>,
    cancellation: ProcessCancellation,
    limits: ChatLimits,
    store: SqliteTurnStore,
    serial: Arc<tokio::sync::Mutex<()>>,
    closed: Arc<AtomicBool>,
    delivery_failed: Arc<AtomicBool>,
    stream_failed: Arc<AtomicBool>,
) -> EventSink {
    let bytes = Arc::new(AtomicUsize::new(0));
    Arc::new(move |event| {
        let sender = sender.clone();
        let cancellation = cancellation.clone();
        let bytes = bytes.clone();
        let limits = limits.clone();
        let store = store.clone();
        let serial = serial.clone();
        let closed = closed.clone();
        let delivery_failed = delivery_failed.clone();
        let stream_failed = stream_failed.clone();
        Box::pin(async move {
            let _serial = serial.lock().await;
            if closed.load(Ordering::Acquire) || cancellation.is_cancelled() {
                return Err("Chat stream cancelled".into());
            }
            let data = format!("data: {event}\n\n");
            if data.len() > limits.event_bytes
                || bytes
                    .fetch_update(Ordering::AcqRel, Ordering::Acquire, |bytes| {
                        bytes
                            .checked_add(data.len())
                            .filter(|total| *total <= limits.stream_bytes - 1024)
                    })
                    .is_err()
            {
                stream_failed.store(true, Ordering::Release);
                cancellation.cancel();
                return Err("Chat stream limit reached".into());
            }
            if store.append_stream_event(event).await.is_err() {
                stream_failed.store(true, Ordering::Release);
                cancellation.cancel();
                return Err("Chat stream could not be persisted".into());
            }
            if !delivery_failed.load(Ordering::Acquire) {
                let delivered = tokio::select! {
                    biased;
                    _ = cancellation.wait_cancelled() => return Err("Chat stream cancelled".into()),
                    result = tokio::time::timeout(limits.send_timeout, sender.send(data)) =>
                        matches!(result, Ok(Ok(()))),
                };
                if !delivered {
                    delivery_failed.store(true, Ordering::Release);
                }
            }
            Ok(())
        })
    })
}
struct ChatStream {
    receiver: mpsc::Receiver<String>,
    terminal: Option<oneshot::Receiver<String>>,
    ready_terminal: Option<String>,
}
impl Stream for ChatStream {
    type Item = Result<String, Infallible>;
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match self.receiver.poll_recv(cx) {
            Poll::Ready(Some(event)) => Poll::Ready(Some(Ok(event))),
            // A trusted adapter may retain a sink clone. Once its turn has
            // completed, an empty token queue must not hide the final frame.
            Poll::Pending | Poll::Ready(None) => match self.terminal.as_mut() {
                None => Poll::Ready(self.ready_terminal.take().map(Ok)),
                Some(terminal) => match Pin::new(terminal).poll(cx) {
                    Poll::Pending => Poll::Pending,
                    Poll::Ready(result) => {
                        self.terminal = None;
                        self.receiver.close();
                        self.ready_terminal = result.ok();
                        // Closing prevents late adapter writes. Drain any token
                        // accepted between the empty check and final readiness.
                        self.as_mut().poll_next(cx)
                    }
                },
            },
        }
    }
}
async fn cancel(State(state): State<ChatRoutes>, request: Request) -> Response {
    cancel_request(state, None, request).await
}
async fn cancel_path(
    State(state): State<ChatRoutes>,
    Path(session): Path<String>,
    request: Request,
) -> Response {
    cancel_request(state, Some(session), request).await
}
async fn cancel_request(
    state: ChatRoutes,
    path_session: Option<String>,
    request: Request,
) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    let value = match body(&state, request).await {
        Ok(value) => value,
        Err(error) => return *error,
    };
    let session = match path_session {
        Some(session)
            if value.is_null() || value.as_object().is_some_and(|object| object.is_empty()) =>
        {
            session
        }
        None => match serde_json::from_value::<CancelBody>(value) {
            Ok(body) => body.session_id,
            Err(_) => return response(400, json!({"error":"INVALID_CANCEL_REQUEST"})),
        },
        _ => return response(400, json!({"error":"INVALID_CANCEL_REQUEST"})),
    };
    if !valid_session(&session) {
        return response(400, json!({"error":"INVALID_CANCEL_REQUEST"}));
    }
    if let Err(error) = owned_session(&state, &user.id, &session).await {
        return *error;
    }
    let active = state.active.turns.lock().unwrap();
    let cancelled = active
        .get(&session)
        .filter(|turn| turn.owner == user.id)
        .map(|turn| {
            turn.cancellation.cancel();
            true
        })
        .unwrap_or(false);
    response(200, json!({"ok":true,"cancelled":cancelled}))
}
async fn messages(
    State(state): State<ChatRoutes>,
    Path(session): Path<String>,
    request: Request,
) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    if !valid_session(&session) {
        return response(400, json!({"error":"INVALID_SESSION"}));
    }
    if let Err(error) = owned_session(&state, &user.id, &session).await {
        return *error;
    }
    let mut limit = None;
    let mut before = None;
    for (key, value) in url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes())
    {
        match key.as_ref() {
            "limit" if limit.is_none() => match value.parse::<usize>() {
                Ok(value) if (1..=100).contains(&value) => limit = Some(value),
                _ => return response(400, json!({"error":"INVALID_QUERY"})),
            },
            "before"
                if before.is_none()
                    && !value.is_empty()
                    && value.len() <= 20
                    && value.bytes().all(|byte| byte.is_ascii_digit())
                    && value.parse::<usize>().is_ok() =>
            {
                before = Some(value.into_owned())
            }
            _ => return response(400, json!({"error":"INVALID_QUERY"})),
        }
    }
    match crate::runtime::chat_projection::project_messages(
        state.auth.clone(),
        user.id.clone(),
        session.clone(),
        limit,
        before,
    )
    .await
    {
        Ok(mut value) => {
            value["streaming"] = json!(
                state
                    .active
                    .turns
                    .lock()
                    .unwrap()
                    .get(&session)
                    .is_some_and(|turn| turn.owner == user.id)
            );
            response(200, value)
        }
        Err(_) => auth::internal_error(),
    }
}
#[cfg(test)]
#[path = "chat_tests.rs"]
mod tests;
