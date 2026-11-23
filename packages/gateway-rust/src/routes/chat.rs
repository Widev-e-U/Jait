//! Explicitly mounted candidate chat HTTP/SSE adapter. It shares authenticated
//! session admission and native persistence; it does not activate a provider.
use super::auth::{self, AuthState, response};
use super::chat_queue;
use super::threads::{ThreadEventSink, thread_status_event};
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
    services::{
        projects::local_execution_allowed,
        sessions::{SessionFilter, SessionRecord, SessionService},
        users::UserService,
    },
};
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Path, Request, State},
    http::{StatusCode, header},
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
    collections::{HashMap, HashSet},
    convert::Infallible,
    future::Future,
    num::NonZeroU16,
    path::PathBuf,
    pin::Pin,
    sync::{
        Arc, Mutex, Weak,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
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
/// The per-turn choices a web client sends with a message. Each field names something the owner
/// has already configured (a registered provider, or a model and effort the owner's backend
/// accepts). None of them can supply a URL, credential, tool, root, ownership or execution mode.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TurnSelection {
    /// The provider the user picked. `None` is the native OpenAI-compatible path.
    pub provider: Option<String>,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    /// A non-default response style (`simple`, `caveman` or `caveman-ultra`). `None` is `normal`.
    pub response_style: Option<String>,
}
/// Why a turn cannot start. `Refused` is a choice the server will not honor, and its status and
/// code go back to the client unchanged. `Unavailable` is the generic configuration failure.
#[derive(Debug)]
pub enum PrepareError {
    Unavailable,
    Refused { status: u16, code: &'static str },
}
impl PrepareError {
    pub fn refused(status: u16, code: &'static str) -> Self {
        Self::Refused { status, code }
    }
}
impl From<String> for PrepareError {
    fn from(_: String) -> Self {
        Self::Unavailable
    }
}
impl From<&str> for PrepareError {
    fn from(_: &str) -> Self {
        Self::Unavailable
    }
}
/// Server-owned configuration only. Preparation must be read-only and must not execute tools or
/// discover ambient credentials. The selection is checked against the owner's configuration, and
/// an unknown or unconfigured choice is refused rather than replaced with a default.
pub trait ChatFactory: Send + Sync {
    fn prepare(
        &self,
        user: AuthUser,
        session: SessionRecord,
        selection: TurnSelection,
    ) -> BoxFuture<'_, Result<PreparedChat, PrepareError>>;
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
    thread: bool,
    cancellation: ProcessCancellation,
    done: watch::Sender<bool>,
}
#[derive(Default)]
struct ActiveState {
    closed: AtomicBool,
    // Entries exist only while at least one snapshot for that session is in flight.
    database_owner: Option<Arc<std::fs::File>>,
    snapshots: Mutex<HashMap<String, Weak<AtomicU64>>>,
    turns: Mutex<HashMap<String, ActiveTurn>>,
    device_changes: Mutex<HashSet<String>>,
    // Guarded by turns when admitting or releasing a lease.
    queue_waiters: Mutex<HashMap<String, (String, tokio::runtime::Handle)>>,
}
// Lease transitions and snapshot registration are serialized by `turns`.
// The snapshots mutex is always acquired after `turns` when both are needed.
impl ActiveState {
    fn changed(&self, session: &str) {
        if let Some(revision) = self
            .snapshots
            .lock()
            .unwrap()
            .get(session)
            .and_then(Weak::upgrade)
        {
            revision.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn snapshot(self: &Arc<Self>, session: &str) -> SnapshotRevision {
        let _turns = self.turns.lock().unwrap();
        let mut snapshots = self.snapshots.lock().unwrap();
        let revision = snapshots
            .get(session)
            .and_then(Weak::upgrade)
            .unwrap_or_else(|| {
                let revision = Arc::new(AtomicU64::new(0));
                snapshots.insert(session.to_owned(), Arc::downgrade(&revision));
                revision
            });
        SnapshotRevision {
            state: self.clone(),
            session: session.to_owned(),
            revision: Some(revision),
        }
    }
}

struct SnapshotRevision {
    state: Arc<ActiveState>,
    session: String,
    revision: Option<Arc<AtomicU64>>,
}
impl Drop for SnapshotRevision {
    fn drop(&mut self) {
        let mut snapshots = self.state.snapshots.lock().unwrap();
        drop(self.revision.take());
        if snapshots
            .get(&self.session)
            .is_some_and(|revision| revision.strong_count() == 0)
        {
            snapshots.remove(&self.session);
        }
    }
}

/// Sends a session-scoped event `(owner, session, kind, payload)` to the owner's sockets.
pub type SessionEventSink = Arc<dyn Fn(&str, &str, &str, Value) + Send + Sync>;

#[derive(Clone)]
pub struct ChatRoutes {
    pub(crate) auth: AuthState,
    factory: Arc<dyn ChatFactory>,
    manager: SessionTurnManager,
    project_root: PathBuf,
    pub(crate) limits: ChatLimits,
    active: Arc<ActiveState>,
    pub(crate) events: Arc<EventBus>,
    /// Per-user WS fan-out for `chat.updated`; absent when no hub is mounted.
    pub(crate) user_events: Option<super::repositories::RepositoryEventSink>,
    /// Broadcasts `thread.status` to every authorized socket; absent when no hub is mounted.
    pub(crate) thread_events: Option<ThreadEventSink>,
    /// Carries `ui.state-sync` for the queue to the owner's sockets; absent when no hub is mounted.
    pub(crate) session_events: Option<SessionEventSink>,
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
            user_events: None,
            thread_events: None,
            session_events: None,
        })
    }
    pub(crate) fn device_change_lease(&self, session: &str) -> Option<Box<dyn Send>> {
        let turns = self.active.turns.lock().ok()?;
        if turns.contains_key(session) {
            return None;
        }
        let mut changes = self.active.device_changes.lock().ok()?;
        if !changes.insert(session.to_owned()) {
            return None;
        }
        Some(Box::new(DeviceChangeLease {
            routes: self.clone(),
            session: session.to_owned(),
        }))
    }

    pub(crate) fn turn_active(&self, session: &str) -> bool {
        self.active
            .turns
            .lock()
            .map_or(true, |turns| turns.contains_key(session))
    }

    pub(crate) fn with_user_events(
        mut self,
        sink: super::repositories::RepositoryEventSink,
    ) -> Self {
        self.user_events = Some(sink);
        self
    }
    pub(crate) fn with_database_owner(mut self, owner: Arc<std::fs::File>) -> Self {
        // This is called before the routes are cloned or accept requests. TurnLease
        // retains ActiveState even if shutdown times out or the router is dropped.
        Arc::get_mut(&mut self.active)
            .expect("new chat state")
            .database_owner = Some(owner);
        self
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
            .route("/api/sessions/{id}/runtime", get(runtime))
            .route("/api/sessions/streaming", get(streaming_sessions))
            .route(
                "/api/sessions/{id}/loop",
                get(session_loop).post(session_loop_control),
            )
            .route("/api/sessions/{id}/fork", post(session_fork))
            .route(
                "/api/sessions/{id}/messages/{index}/context-flow",
                get(message_context_flow),
            )
            .route(
                "/api/sessions/{id}/sub-agents/{sub_agent}",
                get(session_sub_agent),
            )
            .route("/api/sessions/{id}/plan", get(session_plan))
            .route("/api/sessions/{id}/plan/reject", post(session_plan))
            .route("/api/sessions/{id}/plan/execute", post(session_plan))
            .route("/api/sessions/{id}/retry-tool", post(session_retry_tool))
            .route("/api/chat/prewarm", post(prewarm))
            .route("/api/threads/{id}/approve", post(thread_approve))
            .route("/api/threads/{id}/start", post(thread_start))
            .route("/api/threads/{id}/send", post(thread_send))
            .route("/api/threads/{id}/resume", post(thread_resume))
            .route("/api/threads/{id}/steer", post(thread_steer))
            .route("/api/sessions/{id}/stream", get(super::chat_events::stream))
            .route("/api/sessions/{id}/events", get(super::chat_events::stream))
            .route(
                "/api/sessions/{id}/trajectory",
                get(super::chat_events::trajectory),
            )
            .route("/api/sessions/{id}/approve", post(session_approve))
            .route("/api/sessions/{id}/steer", post(session_steer))
            .route(
                "/api/sessions/{id}/restart-from",
                post(session_restart_from),
            )
            .with_state(self.clone())
    }
    /// Stop admission and signal active turns even when no async cleanup is polled.
    pub(crate) fn close(&self) {
        self.active.closed.store(true, Ordering::Release);
        self.events.close_all();
        let active = self.active.turns.lock().unwrap();
        self.active.queue_waiters.lock().unwrap().clear();
        for turn in active.values() {
            turn.cancellation.cancel();
        }
    }
    #[cfg(test)]
    pub(crate) fn is_closed(&self) -> bool {
        self.active.closed.load(Ordering::Acquire)
    }
    #[cfg(test)]
    pub(crate) fn test_admit(&self) -> (impl Drop + use<>, ProcessCancellation) {
        let lease = self.admit("test-owner", "test-session", false).unwrap();
        let cancellation = lease.cancellation.clone();
        (lease, cancellation)
    }
    /// Cancel and drain before shutting down the shared auth/database worker.
    pub async fn shutdown(&self) -> Result<(), String> {
        self.close();
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
    pub(crate) fn cancel_owner_threads(&self, owner: &str) {
        let active = self.active.turns.lock().unwrap();
        for turn in active
            .values()
            .filter(|turn| turn.thread && turn.owner == owner)
        {
            turn.cancellation.cancel();
        }
    }
    /// Cancels the native turn that `owner` runs on chat `session`, if one is active. The returned
    /// receiver resolves once that turn has released the session.
    pub(crate) fn cancel_thread_turn(
        &self,
        owner: &str,
        session: &str,
    ) -> Option<watch::Receiver<bool>> {
        let turns = self.active.turns.lock().unwrap();
        let turn = turns
            .get(session)
            .filter(|turn| turn.thread && turn.owner == owner)?;
        turn.cancellation.cancel();
        Some(turn.done.subscribe())
    }
    pub fn with_thread_events(mut self, events: ThreadEventSink) -> Self {
        self.thread_events = Some(events);
        self
    }
    pub(crate) fn with_session_events(mut self, events: SessionEventSink) -> Self {
        self.session_events = Some(events);
        self
    }
    fn try_admit(&self, owner: &str, session: &str, thread: bool) -> Result<TurnLease, AdmitError> {
        self.try_admit_inner(owner, session, thread, false)
    }
    fn try_admit_inner(
        &self,
        owner: &str,
        session: &str,
        thread: bool,
        queued: bool,
    ) -> Result<TurnLease, AdmitError> {
        let mut active = self.active.turns.lock().unwrap();
        if self.active.closed.load(Ordering::Acquire) {
            return Err(AdmitError::Closed);
        }
        if let Some(turn) = active.get(session) {
            if queued {
                self.active.queue_waiters.lock().unwrap().insert(
                    session.into(),
                    (owner.into(), tokio::runtime::Handle::current()),
                );
            }
            return Err(AdmitError::Busy {
                chat_turn: !turn.thread,
            });
        }
        if self.active.device_changes.lock().unwrap().contains(session) {
            if queued {
                self.active.queue_waiters.lock().unwrap().insert(
                    session.into(),
                    (owner.into(), tokio::runtime::Handle::current()),
                );
            }
            return Err(AdmitError::Busy { chat_turn: false });
        }
        if active.len() >= usize::from(self.limits.max_active.get()) {
            if queued {
                self.active.queue_waiters.lock().unwrap().insert(
                    session.into(),
                    (owner.into(), tokio::runtime::Handle::current()),
                );
            }
            return Err(AdmitError::Capacity);
        }
        let cancellation = ProcessCancellation::default();
        let (done, _) = watch::channel(false);
        active.insert(
            session.into(),
            ActiveTurn {
                owner: owner.into(),
                thread,
                cancellation: cancellation.clone(),
                done: done.clone(),
            },
        );
        self.active.changed(session);
        Ok(TurnLease {
            routes: self.clone(),
            session: session.into(),
            cancellation,
            done,
        })
    }
    fn admit(&self, owner: &str, session: &str, thread: bool) -> Result<TurnLease, Box<Response>> {
        self.try_admit(owner, session, thread)
            .map_err(|error| Box::new(error.response()))
    }
}
/// Why a turn was not admitted. Only a chat turn that is running lets a send queue behind it.
enum AdmitError {
    Closed,
    Busy { chat_turn: bool },
    Capacity,
}
impl AdmitError {
    fn response(self) -> Response {
        match self {
            Self::Closed => response(503, json!({"error":"CHAT_CLOSED"})),
            Self::Busy { .. } => response(409, json!({"error":"CHAT_BUSY"})),
            Self::Capacity => response(503, json!({"error":"CHAT_CAPACITY"})),
        }
    }
}
struct DeviceChangeLease {
    routes: ChatRoutes,
    session: String,
}
impl Drop for DeviceChangeLease {
    fn drop(&mut self) {
        let turns = self.routes.active.turns.lock().unwrap();
        self.routes
            .active
            .device_changes
            .lock()
            .unwrap()
            .remove(&self.session);
        let waiters = std::mem::take(&mut *self.routes.active.queue_waiters.lock().unwrap());
        drop(turns);
        self.routes.wake_queue_waiters(waiters);
    }
}

struct TurnLease {
    routes: ChatRoutes,
    session: String,
    cancellation: ProcessCancellation,
    done: watch::Sender<bool>,
}
impl Drop for TurnLease {
    fn drop(&mut self) {
        self.cancellation.cancel();
        let waiters = {
            let mut turns = self.routes.active.turns.lock().unwrap();
            turns.remove(&self.session);
            self.routes.active.changed(&self.session);
            std::mem::take(&mut *self.routes.active.queue_waiters.lock().unwrap())
        };
        let _ = self.done.send(true);
        self.routes.wake_queue_waiters(waiters);
    }
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct ChatBody {
    #[serde(rename = "sessionId", alias = "session_id")]
    session_id: String,
    #[serde(alias = "message")]
    content: String,
    // Like the Node route, anything but a well-formed string is ignored.
    #[serde(rename = "clientMessageId", default)]
    client_message_id: Option<Value>,
    // Filled from the web options by `parse_chat_request`, never read from the body itself.
    #[serde(skip)]
    selection: TurnSelection,
    #[serde(skip)]
    display_segments: Option<String>,
    // The queue entry this send was taken from. `parse_chat_request` sets it from the body's
    // `queuedMessageId`. A queue drain carries none, because its entry is already consumed.
    #[serde(skip)]
    queued_message_id: Option<String>,
}
fn client_message_id(input: &ChatBody) -> Option<String> {
    let id = input.client_message_id.as_ref()?.as_str()?;
    let suffix = id.strip_prefix("user-")?;
    ((8..=100).contains(&suffix.len())
        && suffix
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-'))
    .then(|| id.to_owned())
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
// Check session ownership and project authority together on the database worker.
// A later project change is not synchronized with an already running turn.
async fn local_turn_session(
    state: &ChatRoutes,
    owner: &str,
    session: &str,
) -> Result<SessionRecord, Box<Response>> {
    let owner = owner.to_owned();
    let session = session.to_owned();
    match state
        .auth
        .with_database(move |db| {
            let session = SessionService::new(db)
                .get(&session, Some(&owner))?
                .filter(|session| session.status.as_deref() == Some("active"));
            let Some(session) = session else {
                return Ok(None);
            };
            let local = local_execution_allowed(db, &owner, session.project_id.as_deref())?;
            Ok(Some((session, local)))
        })
        .await
    {
        Ok(Some((session, true))) => Ok(session),
        Ok(Some((_, false))) => Err(Box::new(response(
            503,
            json!({"error":"REMOTE_NODE_UNAVAILABLE"}),
        ))),
        Ok(None) => Err(Box::new(response(
            404,
            json!({"error":"SESSION_NOT_FOUND"}),
        ))),
        Err(_) => Err(Box::new(auth::internal_error())),
    }
}
// These fields carry semantics the native turn does not implement yet. Reject their presence,
// including null or empty values: omission can select a server default while an explicit value can
// express provider or security intent. Persona, attachment and queue-drain options stay here until
// the native turn can apply them.
const UNSUPPORTED_CHAT_OPTIONS: &[&str] = &[
    "personaAgentId",
    "attachments",
    "_queuedDrain",
    "_queuedMessageId",
    "_systemNotification",
    "_systemNotice",
    "_recoveryAttempts",
    "_loopRevision",
];

fn invalid_chat_request() -> Box<Response> {
    Box::new(response(400, json!({"error":"INVALID_CHAT_REQUEST"})))
}

/// Parses a request. The web options the native turn applies are read here and removed from the
/// body, so `deny_unknown_fields` still rejects every other key.
fn parse_chat_request(mut value: Value) -> Result<ChatBody, Box<Response>> {
    if let Some(object) = value.as_object()
        && let Some(option) = UNSUPPORTED_CHAT_OPTIONS
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
    let choices = chat_selection(&mut value)?;
    let mut body: ChatBody = serde_json::from_value(value).map_err(|_| invalid_chat_request())?;
    body.selection = choices.selection;
    body.display_segments = choices.display_segments;
    body.queued_message_id = choices.queued_message_id;
    Ok(body)
}

/// The web options one send carries, read out of the body before it is deserialized.
#[derive(Default)]
struct WebChoices {
    selection: TurnSelection,
    display_segments: Option<String>,
    queued_message_id: Option<String>,
}

/// Reads the web options out of the body. A malformed value is refused rather than replaced with a
/// default, because a silent default would run a provider, model or posture the user did not ask for.
fn chat_selection(value: &mut Value) -> Result<WebChoices, Box<Response>> {
    let Some(object) = value.as_object_mut() else {
        return Ok(WebChoices::default());
    };
    // `null` means the same as an omitted key for every option read here.
    let mut take = |key: &str| object.remove(key).filter(|v| !v.is_null());
    match take("mode") {
        None => {}
        Some(Value::String(mode)) if mode == "agent" => {}
        Some(_) => {
            return Err(Box::new(response(
                400,
                json!({"error":"UNSUPPORTED_CHAT_OPTION","option":"mode"}),
            )));
        }
    }
    match take("runtimeMode") {
        None => {}
        // The native turn always runs the guarded posture, which the wire calls `supervised`.
        Some(Value::String(mode)) if mode == "supervised" => {}
        Some(Value::String(mode)) if mode == "full-access" => {
            return Err(Box::new(response(
                400,
                json!({"error":"RUNTIME_MODE_UNSUPPORTED","runtimeMode":"full-access"}),
            )));
        }
        Some(_) => return Err(invalid_chat_request()),
    }
    let provider = option_text(take("provider"))?.filter(|id| id != "jait");
    if provider
        .as_deref()
        .is_some_and(|id| id.len() > 128 || id.chars().any(char::is_control))
    {
        return Err(invalid_chat_request());
    }
    let model = option_text(take("model"))?;
    if model
        .as_deref()
        .is_some_and(|id| id.len() > 256 || id.chars().any(char::is_control))
    {
        return Err(invalid_chat_request());
    }
    let reasoning_effort = match option_text(take("reasoningEffort"))? {
        None => None,
        Some(effort) if valid_reasoning_effort(&effort) => Some(effort),
        Some(_) => return Err(invalid_chat_request()),
    };
    // A style the server does not know is refused, not replaced with `normal`. `normal` is the
    // default, so it is carried as no style.
    let response_style = match take("responseStyle") {
        None => None,
        Some(Value::String(style)) if crate::prompts::is_response_style(&style) => {
            (style != "normal").then_some(style)
        }
        Some(_) => return Err(invalid_chat_request()),
    };
    let display_segments = display_segments(take("displaySegments"))?;
    let queued_message_id = option_text(take("queuedMessageId"))?;
    if queued_message_id
        .as_deref()
        .is_some_and(|id| id.len() > 128 || id.chars().any(char::is_control))
    {
        return Err(invalid_chat_request());
    }
    Ok(WebChoices {
        selection: TurnSelection {
            provider,
            model,
            reasoning_effort,
            response_style,
        },
        display_segments,
        queued_message_id,
    })
}

fn option_text(value: Option<Value>) -> Result<Option<String>, Box<Response>> {
    match value {
        None => Ok(None),
        Some(Value::String(text)) => {
            let text = text.trim();
            Ok((!text.is_empty()).then(|| text.to_owned()))
        }
        Some(_) => Err(invalid_chat_request()),
    }
}

/// The Node gateway's effort pattern: one alphanumeric character, then up to 63 of `[a-z0-9._-]`.
fn valid_reasoning_effort(value: &str) -> bool {
    let bytes = value.as_bytes();
    (1..=64).contains(&bytes.len())
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

/// Display segments are stored as given on the user message. Each one must be an object with a
/// short string `type`, and the whole list is bounded.
fn display_segments(value: Option<Value>) -> Result<Option<String>, Box<Response>> {
    const MAX_SEGMENTS: usize = 64;
    const MAX_BYTES: usize = 256 * 1024;
    match value {
        None => Ok(None),
        Some(Value::Array(segments)) if segments.is_empty() => Ok(None),
        Some(Value::Array(segments))
            if segments.len() <= MAX_SEGMENTS
                && segments.iter().all(|segment| {
                    segment
                        .get("type")
                        .and_then(Value::as_str)
                        .is_some_and(|kind| (1..=32).contains(&kind.len()))
                }) =>
        {
            let encoded = serde_json::to_string(&segments).map_err(|_| invalid_chat_request())?;
            if encoded.len() > MAX_BYTES {
                return Err(invalid_chat_request());
            }
            Ok(Some(encoded))
        }
        Some(_) => Err(invalid_chat_request()),
    }
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
    if let Err(error) = owned_session(&state, &user.id, &input.session_id).await {
        return *error;
    }
    // A queued send whose entry already ran is answered before anything else. It neither starts a
    // turn nor joins the queue again, so a client that retries a delivered message gets no duplicate.
    if let Some(id) = input.queued_message_id.clone() {
        match state.queue_id_consumed(&input.session_id, &id).await {
            Ok(false) => {}
            Ok(true) => return skipped_queued_send(&id),
            Err(()) => return auth::internal_error(),
        }
    }
    let client_id = client_message_id(&input);
    if let Some(id) = client_id.clone() {
        let taken = state
            .auth
            .with_database(move |db| {
                // SQLite resolves table names at prepare time, so the table must exist.
                db.execute_batch(crate::runtime::chat_projection::CLIENT_IDS_SCHEMA)?;
                let known: bool = db.query_row(
                    "SELECT EXISTS(SELECT 1 FROM messages WHERE id=?1) OR EXISTS(SELECT 1 FROM rust_chat_client_ids WHERE client_id=?1)",
                    [&id],
                    |row| row.get(0),
                )?;
                Ok(known)
            })
            .await;
        match taken {
            Ok(false) => {}
            Ok(true) => return response(409, json!({"error":"MESSAGE_ID_ALREADY_EXISTS"})),
            Err(_) => return auth::internal_error(),
        }
    }
    let lease = match state.try_admit(&user.id, &input.session_id, false) {
        Ok(lease) => lease,
        // A send during a chat turn joins the session's queue, as Node's does. A thread turn or a
        // device change still refuses with CHAT_BUSY.
        Err(AdmitError::Busy { chat_turn: true }) => {
            return state.queue_send(&user.id, &input).await;
        }
        Err(error) => return error.response(),
    };
    start_turn(&state, user, input, lease, Admission::Direct).await
}

/// How a turn was admitted. A direct send is checked against the queue and claims its entry before
/// it runs. A queue drain has already taken its entry out of the queue.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Admission {
    Direct,
    Drained,
}

/// What a direct send did to the queue when it claimed its place to run.
enum Claim {
    /// The send's queue id already ran, so no turn starts.
    Consumed,
    /// The send may run. The queue is returned when the claim changed it.
    Claimed(Option<Vec<Value>>),
}

/// What a send that arrived during a turn did with the queue.
enum Queueing {
    Consumed,
    Joined {
        entry: Value,
        queue: Vec<Value>,
        created: bool,
    },
}

/// Runs an admitted chat turn and returns its event stream. Dropping the stream does not stop the
/// turn: delivery failures are recorded, and the turn still completes and is persisted.
async fn start_turn(
    state: &ChatRoutes,
    user: AuthUser,
    input: ChatBody,
    lease: TurnLease,
    admission: Admission,
) -> Response {
    let client_id = client_message_id(&input);
    let owner = user.id.clone();
    let session = match local_turn_session(state, &user.id, &input.session_id).await {
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
    let cancellation = lease.cancellation.clone();
    let prepared = tokio::select! {biased;
        _=cancellation.wait_cancelled()=>return response(409,json!({"error":"CHAT_CANCELLED"})),
        result=tokio::time::timeout(Duration::from_secs(10),state.factory.prepare(user.clone(),session,input.selection.clone()))=>match result{
            Ok(Ok(prepared))=>prepared,
            Ok(Err(PrepareError::Refused{status,code}))=>return response(status,json!({"error":code})),
            _=>return response(503,json!({"error":"CHAT_CONFIGURATION_UNAVAILABLE"})),
        },
    };
    let display_segments = input.display_segments.clone();
    let store = match SqliteTurnStore::new(
        state.auth.clone(),
        user.id.clone(),
        input.session_id.clone(),
    )
    .map(|store| {
        store
            .with_events(state.events.clone())
            .with_database_owner(state.active.database_owner.clone())
            .with_client_message_id(client_id)
            .with_display_segments(display_segments)
            .with_turn()
    }) {
        Ok(store) => store,
        Err(_) => return auth::internal_error(),
    };
    if store.check_stream_capacity().await.is_err() {
        return response(503, json!({"error":"CHAT_STREAM_CAPACITY_UNAVAILABLE"}));
    }
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
    let admitted = match state
        .manager
        .prepare(&prepared.config, &store, &context)
        .await
    {
        Ok(admitted) => admitted,
        Err(SessionTurnError::SessionBusy) => return response(409, json!({"error":"CHAT_BUSY"})),
        Err(SessionTurnError::Turn(TurnError::Cancelled)) => {
            return response(409, json!({"error":"CHAT_CANCELLED"}));
        }
        Err(_) => return response(503, json!({"error":"CHAT_ADMISSION_UNAVAILABLE"})),
    };
    if admitted
        .validate_user_content(&input.content, prepared.config.max_history_bytes)
        .is_err()
    {
        return response(503, json!({"error":"CHAT_ADMISSION_UNAVAILABLE"}));
    }
    // The claim is the last check before the turn starts, so a refused send keeps its queue entry.
    if admission == Admission::Direct {
        match state
            .claim_send(
                &input.session_id,
                input.queued_message_id.as_deref(),
                &input.content,
            )
            .await
        {
            Ok(Claim::Claimed(queue)) => {
                if let Some(queue) = queue {
                    state.publish_queue(&owner, &input.session_id, &queue);
                }
            }
            Ok(Claim::Consumed) => {
                return skipped_queued_send(input.queued_message_id.as_deref().unwrap_or_default());
            }
            Err(()) => return auth::internal_error(),
        }
    }
    // Keep the previous failure visible if preparation or capacity checks fail.
    state.events.clear_failure(&input.session_id);
    let (sender, receiver) = mpsc::channel(state.limits.channel_capacity);
    // The terminal frame has its own bounded slot, so a full token channel
    // cannot discard completion/error after cancellation.
    let (terminal_sender, terminal_receiver) = oneshot::channel();
    let serial = Arc::new(tokio::sync::Mutex::new(()));
    let flags = StreamFlags {
        closed: Arc::new(AtomicBool::new(false)),
        delivery_failed: Arc::new(AtomicBool::new(false)),
        stream_failed: Arc::new(AtomicBool::new(false)),
    };
    let sink = event_sink(
        sender.clone(),
        cancellation.clone(),
        state.limits.clone(),
        store.clone(),
        serial.clone(),
        flags.clone(),
    );
    let manager = state.manager.clone();
    let events = state.events.clone();
    let drain = state.clone();
    let session_id = input.session_id;
    tokio::spawn(async move {
        let _lease = lease;
        let result = manager
            .run_prepared(
                SessionTurn {
                    config: prepared.config,
                    provider: &*prepared.provider,
                    tools: &*prepared.tools,
                    store: &store,
                    context: &context,
                    user_content: input.content,
                    sink,
                },
                admitted,
            )
            .await;
        let _serial = serial.lock().await;
        flags.closed.store(true, Ordering::Release);
        let event = if flags.stream_failed.load(Ordering::Acquire) {
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
        } else if flags.delivery_failed.load(Ordering::Acquire) {
            json!({"type":"replay_required"})
        } else {
            event
        };
        let _ = terminal_sender.send(format!("data: {terminal}\n\n"));
        drop(sender);
        // Release the session before draining, so the next queued message can start in its place.
        drop(_lease);
        drain.drain_queued_soon(&owner, &session_id);
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
impl ChatRoutes {
    /// Keeps a send that arrived during a chat turn in the session's queue, and answers it the way
    /// Node does: an event stream with a `queued` event and `done`, status 202. A send that names an
    /// entry joins that entry, and so does a send with the same text as a queued entry.
    async fn queue_send(&self, owner: &str, input: &ChatBody) -> Response {
        let session_db = input.session_id.clone();
        let content_db = input.content.clone();
        let queued_db = input.queued_message_id.clone();
        let selection = input.selection.clone();
        let segments = input
            .display_segments
            .as_deref()
            .and_then(|text| serde_json::from_str::<Value>(text).ok());
        let stored = self
            .auth
            .with_database(move |db| {
                let (stored, consumed) = chat_queue::read(db, &session_db)?;
                // An entry whose id already ran is neither joined nor counted as waiting.
                if queued_db
                    .as_deref()
                    .is_some_and(|id| consumed.iter().any(|known| known == id))
                {
                    return Ok(Queueing::Consumed);
                }
                let mut queue = chat_queue::without_consumed(stored, &consumed);
                let existing = queue
                    .iter()
                    .find(|entry| {
                        queued_db
                            .as_deref()
                            .is_some_and(|id| chat_queue::id_of(entry) == Some(id))
                    })
                    .or_else(|| {
                        queue
                            .iter()
                            .find(|entry| chat_queue::same_text(entry, &content_db))
                    })
                    .cloned();
                if let Some(entry) = existing {
                    return Ok(Queueing::Joined {
                        entry,
                        queue,
                        created: false,
                    });
                }
                let entry = chat_queue::new_entry(
                    queued_db.as_deref(),
                    &content_db,
                    &selection,
                    segments.as_ref(),
                );
                queue.push(entry.clone());
                chat_queue::store(db, &session_db, &queue, &consumed)?;
                Ok(Queueing::Joined {
                    entry,
                    queue,
                    created: true,
                })
            })
            .await;
        match stored {
            Ok(Queueing::Consumed) => {
                skipped_queued_send(input.queued_message_id.as_deref().unwrap_or_default())
            }
            Ok(Queueing::Joined {
                entry,
                queue,
                created,
            }) => {
                if created {
                    self.publish_queue(owner, &input.session_id, &queue);
                }
                // The turn may have ended while this write was in flight; the queue must not wait for it.
                self.drain_queued_soon(owner, &input.session_id);
                queued_stream(&input.session_id, &entry, queue.len())
            }
            Err(_) => auth::internal_error(),
        }
    }

    /// Whether the session's queue has already consumed this id.
    async fn queue_id_consumed(&self, session: &str, id: &str) -> Result<bool, ()> {
        let (session_db, id_db) = (session.to_owned(), id.to_owned());
        self.auth
            .with_database(move |db| {
                let consumed = chat_queue::consumed(db, &session_db)?;
                Ok(consumed.contains(&id_db))
            })
            .await
            .map_err(|_| ())
    }

    /// Claims a direct send's place in the queue. An id that already ran is not run again. Otherwise
    /// the id and every queued entry with the same text are consumed, as Node's send does, in one
    /// state write.
    async fn claim_send(
        &self,
        session: &str,
        queued: Option<&str>,
        content: &str,
    ) -> Result<Claim, ()> {
        let (session_db, queued_db, content_db) = (
            session.to_owned(),
            queued.map(str::to_owned),
            content.to_owned(),
        );
        self.auth
            .with_database(move |db| {
                let (stored, mut consumed) = chat_queue::read(db, &session_db)?;
                if queued_db
                    .as_deref()
                    .is_some_and(|id| consumed.iter().any(|known| known == id))
                {
                    return Ok(Claim::Consumed);
                }
                let mut kept = Vec::new();
                for entry in chat_queue::without_consumed(stored.clone(), &consumed) {
                    if chat_queue::same_text(&entry, &content_db) {
                        if let Some(id) = chat_queue::id_of(&entry) {
                            chat_queue::remember(&mut consumed, id);
                        }
                    } else {
                        kept.push(entry);
                    }
                }
                if let Some(id) = queued_db.as_deref() {
                    chat_queue::remember(&mut consumed, id);
                }
                let kept = chat_queue::without_consumed(kept, &consumed);
                let changed = kept != stored;
                if changed || queued_db.is_some() {
                    chat_queue::store(db, &session_db, &kept, &consumed)?;
                }
                Ok(Claim::Claimed(changed.then_some(kept)))
            })
            .await
            .map_err(|_| ())
    }

    /// Stop-and-send: moves a queued entry to the head of the queue and releases its hold. Only an
    /// entry still waiting in the queue can be selected, and only while a turn is running to stop.
    async fn select_queued_now(
        &self,
        owner: &str,
        session: &str,
        id: &str,
    ) -> Result<(), Box<Response>> {
        let running = self
            .active
            .turns
            .lock()
            .unwrap()
            .get(session)
            .is_some_and(|turn| turn.owner == owner && !turn.cancellation.is_cancelled());
        if !running {
            return Err(Box::new(response(
                409,
                json!({"error":"CONFLICT","details":"No active turn to stop"}),
            )));
        }
        let (session_db, id_db) = (session.to_owned(), id.to_owned());
        let moved = self
            .auth
            .with_database(move |db| {
                let (stored, consumed) = chat_queue::read(db, &session_db)?;
                let mut queue = chat_queue::without_consumed(stored, &consumed);
                let Some(position) = queue
                    .iter()
                    .position(|entry| chat_queue::id_of(entry) == Some(id_db.as_str()))
                else {
                    return Ok(None);
                };
                let mut selected = queue.remove(position);
                if let Some(fields) = selected.as_object_mut() {
                    fields.insert("held".to_owned(), Value::Bool(false));
                }
                queue.insert(0, selected);
                chat_queue::store(db, &session_db, &queue, &consumed)?;
                Ok(Some(queue))
            })
            .await;
        match moved {
            Ok(Some(queue)) => {
                self.publish_queue(owner, session, &queue);
                Ok(())
            }
            Ok(None) => Err(Box::new(response(
                404,
                json!({"error":"NOT_FOUND","details":"Queued message not found"}),
            ))),
            Err(_) => Err(Box::new(auth::internal_error())),
        }
    }

    /// Starts the next queued message once the session is idle. Each queue write and each turn end
    /// calls this. A write that lands while another turn holds the session is picked up by that
    /// turn's end, so no entry waits behind an idle session.
    pub(crate) fn drain_queued_soon(&self, owner: &str, session: &str) {
        let routes = self.clone();
        let (owner, session) = (owner.to_owned(), session.to_owned());
        tokio::spawn(async move { routes.drain_queued(&owner, &session).await });
    }

    fn wake_queue_waiters(&self, waiters: HashMap<String, (String, tokio::runtime::Handle)>) {
        if waiters.is_empty() || self.active.closed.load(Ordering::Acquire) {
            return;
        }
        let runtime = waiters.values().next().unwrap().1.clone();
        let routes = self.clone();
        runtime.spawn(async move {
            for (session, (owner, _)) in waiters {
                if routes.active.closed.load(Ordering::Acquire) {
                    break;
                }
                routes.drain_queued(&owner, &session).await;
            }
        });
    }

    async fn drain_queued(&self, owner: &str, session: &str) {
        // Only a head that can start earns a lease. Admitting an idle session that has nothing to
        // start would hold it for a moment, and a send or a thread turn arriving then would see it busy.
        if !self.head_startable(owner, session).await {
            return;
        }
        // Admission comes first. While another turn holds the session, the queue stays as it is.
        let Ok(lease) = self.try_admit_inner(owner, session, false, true) else {
            return;
        };
        let (owner_db, session_db) = (owner.to_owned(), session.to_owned());
        let next = self
            .auth
            .with_database(move |db| {
                let Some(user) = UserService::new(db).find_by_id(&owner_db)? else {
                    return Ok(None);
                };
                let (stored, mut consumed) = chat_queue::read(db, &session_db)?;
                let stored_len = stored.len();
                let mut queue = chat_queue::without_consumed(stored, &consumed);
                let Some(head) = queue.first().cloned() else {
                    if stored_len > 0 {
                        chat_queue::store(db, &session_db, &queue, &consumed)?;
                    }
                    return Ok(None);
                };
                // A held entry, or one whose options this binary cannot honor, stays queued rather
                // than being dropped or run as something else.
                if head.get("held") == Some(&Value::Bool(true)) {
                    return Ok(None);
                }
                let Some(input) = queued_request(&session_db, &head) else {
                    return Ok(None);
                };
                queue.remove(0);
                if let Some(id) = chat_queue::id_of(&head) {
                    chat_queue::remember(&mut consumed, id);
                }
                chat_queue::store(db, &session_db, &queue, &consumed)?;
                let user = AuthUser {
                    id: user.id,
                    username: user.username,
                };
                Ok(Some((user, head, input, queue)))
            })
            .await;
        let next = match next {
            Ok(next) => next,
            Err(_) => return,
        };
        let Some((user, entry, input, rest)) = next else {
            drop(lease);
            // A write that landed while this drain held the session would otherwise wait for a turn
            // end that never comes. Look again now that the session is free.
            if self.head_startable(owner, session).await {
                self.drain_queued_soon(owner, session);
            }
            return;
        };
        self.publish_queue(owner, session, &rest);
        let started = start_turn(self, user, input, lease, Admission::Drained).await;
        if !started.status().is_success() {
            // The turn did not start (for example, the configured provider is unavailable), so the
            // message stays queued for the next turn end or queue write.
            self.restore_queued(owner, session, entry).await;
        }
    }

    /// Drops the entries that already ran, then reports whether the head could start now: its owner
    /// exists and nothing holds it. It takes no lease, so an idle session is never held for this check.
    async fn head_startable(&self, owner: &str, session: &str) -> bool {
        let (owner_db, session_db) = (owner.to_owned(), session.to_owned());
        self.auth
            .with_database(move |db| {
                if UserService::new(db).find_by_id(&owner_db)?.is_none() {
                    return Ok(false);
                }
                let (stored, consumed) = chat_queue::read(db, &session_db)?;
                let stored_len = stored.len();
                let queue = chat_queue::without_consumed(stored, &consumed);
                if queue.len() != stored_len {
                    chat_queue::store(db, &session_db, &queue, &consumed)?;
                }
                Ok(queue.first().is_some_and(|head| {
                    head.get("held") != Some(&Value::Bool(true))
                        && queued_request(&session_db, head).is_some()
                }))
            })
            .await
            .unwrap_or(false)
    }

    /// Puts a message back at the head of the queue after its turn failed to start.
    async fn restore_queued(&self, owner: &str, session: &str, entry: Value) {
        let session_db = session.to_owned();
        let restored = self
            .auth
            .with_database(move |db| {
                let (queue, mut consumed) = chat_queue::read(db, &session_db)?;
                let entry_id = chat_queue::id_of(&entry).map(str::to_owned);
                if let Some(id) = entry_id.as_deref() {
                    chat_queue::forget(&mut consumed, id);
                }
                let mut restored = vec![entry];
                restored.extend(queue.into_iter().filter(|item| {
                    entry_id.is_none() || chat_queue::id_of(item) != entry_id.as_deref()
                }));
                chat_queue::store(db, &session_db, &restored, &consumed)?;
                Ok(restored)
            })
            .await;
        if let Ok(queue) = restored {
            self.publish_queue(owner, session, &queue);
        }
    }

    /// Sends the queue to the owner's sockets as Node does: `ui.state-sync` with the whole queue,
    /// or null when it is empty.
    fn publish_queue(&self, owner: &str, session: &str, queue: &[Value]) {
        let Some(sink) = &self.session_events else {
            return;
        };
        let value = if queue.is_empty() {
            Value::Null
        } else {
            Value::Array(queue.to_vec())
        };
        sink(
            owner,
            session,
            "ui.state-sync",
            json!({"key": chat_queue::QUEUE_KEY, "value": value}),
        );
    }
}

/// The options a queue entry carries, under the names a send uses.
const QUEUED_OPTIONS: &[&str] = &[
    "provider",
    "model",
    "reasoningEffort",
    "displaySegments",
    "mode",
    "runtimeMode",
    "responseStyle",
    "personaAgentId",
    "attachments",
];

/// The request a queue entry replays. The queue is also written by the client, so an entry goes
/// through the validation a send gets. An option this binary cannot honor keeps the entry queued,
/// rather than running it as something else.
fn queued_request(session: &str, entry: &Value) -> Option<ChatBody> {
    let content = entry.get("content")?.as_str()?;
    if content.trim().is_empty() || content.len() > 32 * 1024 {
        return None;
    }
    let mut value = json!({"sessionId": session, "content": content});
    for key in QUEUED_OPTIONS {
        let Some(option) = entry.get(*key).filter(|option| !option.is_null()) else {
            continue;
        };
        // An empty list is the same as no list, and the normal response style is the default.
        let empty = option.as_array().is_some_and(Vec::is_empty);
        if empty || (*key == "responseStyle" && option.as_str() == Some("normal")) {
            continue;
        }
        value[*key] = option.clone();
    }
    parse_chat_request(value).ok()
}

/// The answer to a queued send whose entry already ran: accepted, with no turn and no queue change.
fn skipped_queued_send(id: &str) -> Response {
    response(
        202,
        json!({"ok":true,"skipped":"queue-already-consumed","queuedMessageId":id}),
    )
}

/// The 202 answer to a send that joined the queue: a `queued` event, then `done`.
fn queued_stream(session: &str, message: &Value, queue_length: usize) -> Response {
    let queued = json!({
        "type": "queued",
        "session_id": session,
        "message": message,
        "queue_length": queue_length,
    });
    let done = json!({
        "type": "done",
        "session_id": session,
        "prompt_count": null,
        "remaining_prompts": null,
    });
    (
        StatusCode::ACCEPTED,
        [
            (header::CONTENT_TYPE, "text/event-stream"),
            (header::CACHE_CONTROL, "no-cache"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        format!("data: {queued}\n\ndata: {done}\n\n"),
    )
        .into_response()
}
#[derive(Clone, Copy, PartialEq)]
enum ThreadAction {
    Start,
    Send,
    Resume,
    Steer,
}
const RESUME_PROMPT: &str = "Continue the interrupted task from the saved history and current workspace. Preserve completed work, verify side effects before repeating actions, and finish the remaining steps.";
type DbError = Box<dyn std::error::Error + Send + Sync>;

async fn check_thread_halt(
    state: &ChatRoutes,
    owner: &str,
    action: ThreadAction,
) -> Result<(), Box<Response>> {
    let owner = owner.to_owned();
    let control = state
        .auth
        .with_database(move |db| {
            Ok::<_, DbError>(
                crate::services::agent_control::AgentControlService::new(db, &String::new)
                    .get_state(&owner)?,
            )
        })
        .await
        .map_err(|_| Box::new(auth::internal_error()))?;
    if control.halted {
        let action = match action {
            ThreadAction::Start => "start-thread",
            ThreadAction::Send => "send-message",
            ThreadAction::Resume => "resume-thread",
            ThreadAction::Steer => "steer-thread",
        };
        return Err(Box::new(response(
            409,
            json!(crate::services::agent_control::agent_halted_body(
                &control,
                Some(action)
            )),
        )));
    }
    Ok(())
}

async fn thread_start(
    State(state): State<ChatRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    thread_turn(state, id, request, ThreadAction::Start).await
}
async fn thread_send(
    State(state): State<ChatRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    thread_turn(state, id, request, ThreadAction::Send).await
}
async fn thread_steer(
    State(state): State<ChatRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    thread_turn(state, id, request, ThreadAction::Steer).await
}
/// Thread turns here run on the gateway's own agent loop, where tool approvals are consent
/// requests answered through `/api/consent`. Like Node's built-in provider, there is no provider
/// approval channel, so a well-formed request for a thread that has a session answers 409.
async fn thread_approve(
    State(state): State<ChatRoutes>,
    Path(id): Path<String>,
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
    let (owner, lookup) = (user.id.clone(), id);
    let row = state
        .auth
        .with_database(move |db| {
            use rusqlite::OptionalExtension;
            Ok::<_, DbError>(
                db.query_row(
                    "SELECT session_id FROM agent_threads WHERE id = ?1 AND user_id = ?2",
                    rusqlite::params![lookup, owner],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()?,
            )
        })
        .await;
    let session_id = match row {
        Ok(Some(session_id)) => session_id,
        Ok(None) => return response(404, json!({"error":"Thread not found"})),
        Err(_) => return auth::internal_error(),
    };
    let request_id = value["requestId"].as_str().unwrap_or_default();
    if request_id.trim().is_empty() || !value["approved"].is_boolean() {
        return response(
            400,
            json!({"error":"A requestId and explicit approval decision are required"}),
        );
    }
    if session_id.as_deref().is_none_or(str::is_empty) {
        return response(409, json!({"error":"Thread has no active session"}));
    }
    response(
        409,
        json!({"error":"Thread approval is not supported by this provider"}),
    )
}
async fn thread_resume(
    State(state): State<ChatRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    thread_turn(state, id, request, ThreadAction::Resume).await
}

/// Records a thread status change and broadcasts `thread.status`, as Node's `broadcastThreadStatus`
/// does. A guarded write (a turn's own outcome) never replaces `interrupted`, so an event that
/// arrives after a stop cannot undo it. Completion-like states stamp `completed_at`.
async fn write_thread_status(
    auth: &AuthState,
    events: Option<ThreadEventSink>,
    id: &str,
    status: &'static str,
    error: Option<&str>,
    activity: Option<(&'static str, String, Value)>,
    guarded: bool,
) -> Result<(), ()> {
    let (id, error) = (id.to_owned(), error.map(str::to_owned));
    let payload = auth.with_database(move |db| {
        let now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
        let guard = if guarded {
            " AND status IS NOT 'interrupted'"
        } else {
            ""
        };
        let changed = db.execute(
            &format!(
                "UPDATE agent_threads SET status = ?2, error = ?3, \
                 completed_at = CASE WHEN ?2 IN ('completed','error','interrupted') THEN {now} ELSE NULL END, \
                 updated_at = {now} WHERE id = ?1{guard}"
            ),
            rusqlite::params![id, status, error],
        )?;
        if changed == 0 {
            return Ok::<_, DbError>(None);
        }
        if let Some((kind, summary, payload)) = activity {
            db.execute(
                &format!(
                    "INSERT INTO agent_thread_activities (id, thread_id, kind, summary, payload, created_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, {now})"
                ),
                rusqlite::params![
                    crate::db::identifiers::uuidv7().to_string(),
                    id,
                    kind,
                    summary.chars().take(500).collect::<String>(),
                    payload.to_string()
                ],
            )?;
        }
        Ok::<_, DbError>(Some(thread_status_event(
            db,
            &id,
            status,
            error.as_deref(),
        )?))
    })
    .await
    .map_err(|_| ())?;
    if let (Some(events), Some(payload)) = (events, payload) {
        events("thread.status", payload);
    }
    Ok(())
}

/// Runs one agent turn for a thread on its session, through the same provider, tool and consent
/// path as `/api/chat`. The response returns once the turn is admitted; progress and the outcome
/// reach clients through the thread status, its activities and the session event stream.
async fn thread_turn(
    state: ChatRoutes,
    id: String,
    request: Request,
    action: ThreadAction,
) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    if matches!(action, ThreadAction::Send | ThreadAction::Steer)
        && let Err(error) = check_thread_halt(&state, &user.id, action).await
    {
        return *error;
    }
    let message = if action == ThreadAction::Resume {
        RESUME_PROMPT.to_owned()
    } else {
        let value = match body(&state, request).await {
            Ok(value) => value,
            Err(error) => return *error,
        };
        value["message"].as_str().unwrap_or_default().to_owned()
    };
    if message.trim().is_empty() || message.len() > 32 * 1024 {
        return response(
            400,
            json!({"error":"VALIDATION_ERROR","details":"message is required"}),
        );
    }
    let (owner, lookup) = (user.id.clone(), id.clone());
    let row = state
        .auth
        .with_database(move |db| {
            use rusqlite::OptionalExtension;
            Ok::<_, DbError>(
                db.query_row(
                    "SELECT session_id, status, pr_state FROM agent_threads WHERE id = ?1 AND user_id = ?2",
                    rusqlite::params![lookup, owner],
                    |row| {
                        Ok((
                            row.get::<_, Option<String>>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                        ))
                    },
                )
                .optional()?,
            )
        })
        .await;
    let (session_id, status, pr_state) = match row {
        Ok(Some(row)) => row,
        Ok(None) => return response(404, json!({"error":"Thread not found"})),
        Err(_) => return auth::internal_error(),
    };
    let status = status.unwrap_or_default();
    if action == ThreadAction::Resume {
        if !matches!(status.as_str(), "error" | "interrupted")
            || matches!(pr_state.as_deref(), Some("merged" | "closed"))
        {
            return response(
                409,
                json!({"error":"Only stopped or failed work can be resumed"}),
            );
        }
    } else if action == ThreadAction::Steer {
        if status != "running" {
            return response(
                409,
                json!({"error":"CONFLICT","details":"No running thread session to steer"}),
            );
        }
    } else if status == "running" {
        return response(409, json!({"error":"A turn is already in progress"}));
    }
    if let Err(error) = check_thread_halt(&state, &user.id, action).await {
        return *error;
    }
    let Some(session_id) = session_id.filter(|s| valid_session(s)) else {
        return response(409, json!({"error":"Thread has no chat session"}));
    };
    if let Err(error) = owned_session(&state, &user.id, &session_id).await {
        return *error;
    }
    if action == ThreadAction::Steer {
        // The chat turn has no mid-round injection point, so steering stops the active turn at
        // its next cancellation check and starts a new one on the same history with the message.
        let waiting = {
            let turns = state.active.turns.lock().unwrap();
            turns
                .get(&session_id)
                .filter(|turn| turn.owner == user.id)
                .map(|turn| {
                    turn.cancellation.cancel();
                    turn.done.subscribe()
                })
        };
        let Some(mut done) = waiting else {
            return response(
                409,
                json!({"error":"CONFLICT","details":"No running thread session to steer"}),
            );
        };
        let drained = tokio::time::timeout(Duration::from_secs(8), async {
            while !*done.borrow_and_update() {
                if done.changed().await.is_err() {
                    break;
                }
            }
        })
        .await;
        if drained.is_err() {
            return response(
                500,
                json!({"error":"STEER_FAILED","details":"Running turn did not stop"}),
            );
        }
    }
    let lease = match state.admit(&user.id, &session_id, true) {
        Ok(lease) => lease,
        Err(error) => return *error,
    };
    if let Err(error) = check_thread_halt(&state, &user.id, action).await {
        return *error;
    }
    let session = match local_turn_session(&state, &user.id, &session_id).await {
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
    let cancellation = lease.cancellation.clone();
    let prepared = tokio::select! {biased;
        _=cancellation.wait_cancelled()=>return response(409,json!({"error":"CHAT_CANCELLED"})),
        result=tokio::time::timeout(Duration::from_secs(10),state.factory.prepare(user.clone(),session,TurnSelection::default()))=>match result{
            Ok(Ok(prepared))=>prepared,
            Ok(Err(PrepareError::Refused{status,code}))=>return response(status,json!({"error":code})),
            _=>return response(503,json!({"error":"CHAT_CONFIGURATION_UNAVAILABLE"})),
        },
    };
    let store = match SqliteTurnStore::new(state.auth.clone(), user.id.clone(), session_id.clone())
        .map(|store| {
            store
                .with_events(state.events.clone())
                .with_database_owner(state.active.database_owner.clone())
                .with_turn()
        }) {
        Ok(store) => store,
        Err(_) => return auth::internal_error(),
    };
    if store.check_stream_capacity().await.is_err() {
        return response(503, json!({"error":"CHAT_STREAM_CAPACITY_UNAVAILABLE"}));
    }
    state.events.clear_failure(&session_id);
    let shown = if action == ThreadAction::Resume {
        "Continue from where you left off."
    } else {
        message.as_str()
    };
    let activity = (
        "message",
        shown.to_owned(),
        json!({"role":"user","content":shown,"fullContent":message}),
    );
    if write_thread_status(
        &state.auth,
        state.thread_events.clone(),
        &id,
        "running",
        None,
        Some(activity),
        false,
    )
    .await
    .is_err()
    {
        return auth::internal_error();
    }
    let context = ToolExecutionContext {
        user_id: user.id.clone(),
        session_id: session_id.clone(),
        action_id: uuid::Uuid::new_v4().to_string(),
        project_root,
        origin: ExecutionOrigin::Agent,
        runtime_mode: RuntimeMode::Guarded,
        cancellation: cancellation.clone(),
        on_output: None,
    };
    let (sender, mut receiver) = mpsc::channel(state.limits.channel_capacity);
    tokio::spawn(async move { while receiver.recv().await.is_some() {} });
    let serial = Arc::new(tokio::sync::Mutex::new(()));
    let flags = StreamFlags {
        closed: Arc::new(AtomicBool::new(false)),
        delivery_failed: Arc::new(AtomicBool::new(false)),
        stream_failed: Arc::new(AtomicBool::new(false)),
    };
    let sink = event_sink(
        sender.clone(),
        cancellation.clone(),
        state.limits.clone(),
        store.clone(),
        serial.clone(),
        flags.clone(),
    );
    let manager = state.manager.clone();
    let auth_state = state.auth.clone();
    let thread_events = state.thread_events.clone();
    let thread_id = id.clone();
    tokio::spawn(async move {
        let _lease = lease;
        let result = manager
            .run(SessionTurn {
                config: prepared.config,
                provider: &*prepared.provider,
                tools: &*prepared.tools,
                store: &store,
                context: &context,
                user_content: message,
                sink,
            })
            .await;
        let _serial = serial.lock().await;
        flags.closed.store(true, Ordering::Release);
        let (event, status, error) = match &result {
            _ if flags.stream_failed.load(Ordering::Acquire) => (
                json!({"type":"error","message":"Chat stream could not be persisted"}),
                "error",
                Some("Chat stream could not be persisted"),
            ),
            Ok(outcome) => (
                json!({"type":"done","session_id":session_id,"prompt_count":null,"remaining_prompts":null,"rounds":outcome.rounds}),
                "completed",
                None,
            ),
            Err(SessionTurnError::Turn(TurnError::Cancelled)) => (
                json!({"type":"done","session_id":session_id,"cancelled":true,"prompt_count":null,"remaining_prompts":null}),
                "interrupted",
                None,
            ),
            Err(error) => (
                json!({"type":"error","message":public_error(error)}),
                "error",
                Some(public_error(error)),
            ),
        };
        let _ = store.append_stream_terminal(event).await;
        // A turn's own outcome is guarded: once a stop has interrupted the thread, it is not overwritten.
        let _ = write_thread_status(
            &auth_state,
            thread_events,
            &thread_id,
            status,
            error,
            None,
            true,
        )
        .await;
        drop(sender);
    });
    if action == ThreadAction::Steer {
        return response(200, json!({"ok":true,"steered":true,"status":"running"}));
    }
    response(200, json!({"ok":true,"threadId":id,"status":"running"}))
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
        SessionTurnError::Turn(TurnError::SettingRejected(message)) => message,
        _ => "Chat turn could not complete",
    }
}
// A panic in a detached stream operation must not be mistaken for a
// successfully persisted stream when the provider has stopped awaiting it.
struct StreamTaskFailure(Arc<AtomicBool>);
impl Drop for StreamTaskFailure {
    fn drop(&mut self) {
        if std::thread::panicking() {
            self.0.store(true, Ordering::Release);
        }
    }
}
/// Lifecycle flags shared by the sink and the turn task for one chat stream.
#[derive(Clone, Default)]
struct StreamFlags {
    closed: Arc<AtomicBool>,
    delivery_failed: Arc<AtomicBool>,
    stream_failed: Arc<AtomicBool>,
}

fn event_sink(
    sender: mpsc::Sender<String>,
    cancellation: ProcessCancellation,
    limits: ChatLimits,
    store: SqliteTurnStore,
    serial: Arc<tokio::sync::Mutex<()>>,
    flags: StreamFlags,
) -> EventSink {
    let bytes = Arc::new(AtomicUsize::new(0));
    Arc::new(move |event| {
        let sender = sender.clone();
        let cancellation = cancellation.clone();
        let bytes = bytes.clone();
        let limits = limits.clone();
        let store = store.clone();
        let serial = serial.clone();
        let flags = flags.clone();
        Box::pin(async move {
            // Acquire before spawning, so abandoned waiters cannot queue detached
            // tasks. Once acquired, the task keeps the guard until SQLite replies
            // even if the provider drops its sink future on timeout.
            let serial_guard = serial.lock_owned().await;
            tokio::spawn(async move {
                let _serial = serial_guard;
                let _panic_failure = StreamTaskFailure(flags.stream_failed.clone());
                if flags.closed.load(Ordering::Acquire) || cancellation.is_cancelled() {
                    return Err("Chat stream cancelled".into());
                }
                let data = format!("data: {event}\n\n");
                if data.len() > limits.event_bytes
                    || bytes
                        .try_update(Ordering::AcqRel, Ordering::Acquire, |bytes| {
                            bytes
                                .checked_add(data.len())
                                .filter(|total| *total <= limits.stream_bytes - 1024)
                        })
                        .is_err()
                {
                    flags.stream_failed.store(true, Ordering::Release);
                    cancellation.cancel();
                    return Err("Chat stream limit reached".into());
                }
                if store.append_stream_event(event).await.is_err() {
                    flags.stream_failed.store(true, Ordering::Release);
                    cancellation.cancel();
                    return Err("Chat stream could not be persisted".into());
                }
                if !flags.delivery_failed.load(Ordering::Acquire) {
                    let delivered = tokio::select! {
                        biased;
                        _ = cancellation.wait_cancelled() => return Err("Chat stream cancelled".into()),
                        result = tokio::time::timeout(limits.send_timeout, sender.send(data)) =>
                            matches!(result, Ok(Ok(()))),
                    };
                    if !delivered {
                        flags.delivery_failed.store(true, Ordering::Release);
                    }
                }
                Ok(())
            })
            .await
            .map_err(|_| "Chat stream storage task failed".to_string())?
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
fn validation(details: &str) -> Response {
    response(400, json!({"error":"VALIDATION_ERROR","details":details}))
}
/// Native turns ask for tool approval through `/api/consent`; there is no provider approval
/// channel, so a well-formed request for an owned session has no provider session to answer.
async fn session_approve(
    State(state): State<ChatRoutes>,
    Path(session): Path<String>,
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
    if value["requestId"].as_str().is_none_or(str::is_empty) {
        return validation("requestId is required");
    }
    if !valid_session(&session) {
        return response(
            404,
            json!({"error":"NOT_FOUND","details":"Session not found"}),
        );
    }
    if let Err(error) = owned_session(&state, &user.id, &session).await {
        return *error;
    }
    response(
        409,
        json!({"error":"CONFLICT","details":"No active provider session for approval"}),
    )
}
/// Node injects steering text into a running loop. The native loop has no injection point, so
/// an active turn is refused instead of silently dropping the message.
async fn session_steer(
    State(state): State<ChatRoutes>,
    Path(session): Path<String>,
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
    if !valid_session(&session) {
        return response(
            404,
            json!({"error":"NOT_FOUND","details":"Session not found"}),
        );
    }
    if let Err(error) = owned_session(&state, &user.id, &session).await {
        return *error;
    }
    if value["message"]
        .as_str()
        .is_none_or(|m| m.trim().is_empty())
    {
        return validation("message is required");
    }
    let active = state
        .active
        .turns
        .lock()
        .unwrap()
        .get(&session)
        .is_some_and(|turn| turn.owner == user.id);
    if !active {
        return response(
            409,
            json!({"error":"CONFLICT","details":"No active stream for this session — steering only works during streaming"}),
        );
    }
    response(
        409,
        json!({"error":"CONFLICT","details":"The active turn does not accept steering"}),
    )
}
/// Node retries from an in-memory log of the live loop's executed calls. Native turns keep no such
/// log, so after the same checks Node applies, an idle owned session has no retryable call.
async fn session_retry_tool(
    State(state): State<ChatRoutes>,
    Path(session): Path<String>,
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
    if !valid_session(&session) {
        return response(
            404,
            json!({"error":"NOT_FOUND","details":"Session not found"}),
        );
    }
    if let Err(error) = owned_session(&state, &user.id, &session).await {
        return *error;
    }
    if value["callId"].as_str().is_none_or(str::is_empty) {
        return validation("callId is required");
    }
    if state.active.turns.lock().unwrap().contains_key(&session) {
        return response(
            409,
            json!({"error":"CONFLICT","details":"Cannot retry while session is streaming"}),
        );
    }
    response(
        404,
        json!({"error":"NOT_FOUND","details":"No tool calls recorded for this session"}),
    )
}
enum Restart {
    NotFound,
    NotUser,
    Changed,
    Done,
}
/// Resolves the edited user message against the persisted visible rows, then deletes it and every
/// row after it. Mirrors Node's id/fromEnd/index resolution, user-row fallback and
/// `expectedContent` re-anchoring.
async fn session_restart_from(
    State(state): State<ChatRoutes>,
    Path(session): Path<String>,
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
    if !valid_session(&session) {
        return response(
            404,
            json!({"error":"NOT_FOUND","details":"Session not found"}),
        );
    }
    if let Err(error) = owned_session(&state, &user.id, &session).await {
        return *error;
    }
    let message_id = value["messageId"].as_str().unwrap_or("").to_string();
    let number = |key: &str| {
        value[key]
            .as_f64()
            .filter(|n| n.is_finite())
            .map(|n| n.floor() as i64)
    };
    let index = number("messageIndex").unwrap_or(-1);
    let from_end = number("messageFromEnd").unwrap_or(-1);
    let expected = value["expectedContent"].as_str().map(str::to_string);
    if message_id.is_empty() && index < 0 && from_end < 0 {
        return validation("messageId, messageFromEnd, or messageIndex is required");
    }
    let turn_cancel = state
        .active
        .turns
        .lock()
        .unwrap()
        .get(&session)
        .filter(|turn| turn.owner == user.id)
        .map(|turn| turn.cancellation.clone());
    if let Some(cancel) = turn_cancel {
        cancel.cancel();
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
        while state.active.turns.lock().unwrap().contains_key(&session) {
            if tokio::time::Instant::now() >= deadline {
                return response(
                    409,
                    json!({"error":"CONFLICT","details":"Cannot restart while session is streaming"}),
                );
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    }
    let target_session = session.clone();
    let outcome = state
        .auth
        .with_database(move |db| {
            let mut statement = db.prepare(
                "SELECT id, role, content FROM messages WHERE session_id = ?1 AND role != 'tool' ORDER BY created_at, id",
            )?;
            let visible: Vec<(String, String, String)> = statement
                .query_map([&target_session], |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    ))
                })?
                .collect::<Result<_, _>>()?;
            let len = visible.len() as i64;
            let mut target = (0..visible.len())
                .find(|i| !message_id.is_empty() && format!("{target_session}-{i}") == message_id)
                .map(|i| i as i64)
                .unwrap_or(-1);
            if target == -1 && (0..len).contains(&from_end) {
                target = len - 1 - from_end;
            }
            if target == -1 && (0..len).contains(&index) {
                target = index;
            }
            if target == -1 {
                return Ok(Restart::NotFound);
            }
            if visible[target as usize].1 != "user" {
                match (0..target as usize).rev().find(|i| visible[*i].1 == "user") {
                    Some(i) => target = i as i64,
                    None => return Ok(Restart::NotUser),
                }
            }
            if let Some(expected) = &expected
                && &visible[target as usize].2 != expected
            {
                let best = (0..visible.len())
                    .filter(|i| visible[*i].1 == "user" && &visible[*i].2 == expected)
                    .min_by_key(|i| (*i as i64 - target).abs());
                match best {
                    Some(i) => target = i as i64,
                    None => return Ok(Restart::Changed),
                }
            }
            let target_id = &visible[target as usize].0;
            let mut all = db.prepare(
                "SELECT id FROM messages WHERE session_id = ?1 ORDER BY created_at, id",
            )?;
            let ids: Vec<String> = all
                .query_map([&target_session], |row| row.get(0))?
                .collect::<Result<_, _>>()?;
            if let Some(cut) = ids.iter().position(|id| id == target_id) {
                for id in &ids[cut..] {
                    db.execute("DELETE FROM messages WHERE id = ?1", [id])?;
                }
            }
            Ok(Restart::Done)
        })
        .await;
    match outcome {
        Ok(Restart::NotFound) => response(
            404,
            json!({"error":"NOT_FOUND","details":"Message not found"}),
        ),
        Ok(Restart::NotUser) => validation("Only user messages can be edited/restarted"),
        Ok(Restart::Changed) => response(
            409,
            json!({"error":"CONFLICT","details":"The message changed or is no longer present; refresh the chat before editing it"}),
        ),
        Ok(Restart::Done) => {
            match crate::runtime::chat_projection::project_messages(
                state.auth.clone(),
                user.id.clone(),
                session.clone(),
                None,
                None,
            )
            .await
            {
                Ok(mut projected) => {
                    projected["ok"] = json!(true);
                    projected["sessionId"] = json!(session);
                    projected["streaming"] = json!(false);
                    response(200, projected)
                }
                Err(_) => auth::internal_error(),
            }
        }
        Err(_) => auth::internal_error(),
    }
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
    let (session, send_now) = match path_session {
        Some(session) => match send_now_target(&value) {
            Ok(target) => (session, target),
            Err(error) => return *error,
        },
        None => match serde_json::from_value::<CancelBody>(value) {
            Ok(body) => (body.session_id, None),
            Err(_) => return response(400, json!({"error":"INVALID_CANCEL_REQUEST"})),
        },
    };
    if !valid_session(&session) {
        return response(400, json!({"error":"INVALID_CANCEL_REQUEST"}));
    }
    if let Err(error) = owned_session(&state, &user.id, &session).await {
        return *error;
    }
    // A stop-and-send first moves the selected entry to the head of the queue. The turn's end then
    // drains the queue, so that entry runs next.
    if let Some(id) = &send_now
        && let Err(error) = state.select_queued_now(&user.id, &session, id).await
    {
        return *error;
    }
    let cancelled = {
        let active = state.active.turns.lock().unwrap();
        active
            .get(&session)
            .filter(|turn| turn.owner == user.id)
            .map(|turn| {
                turn.cancellation.cancel();
                true
            })
            .unwrap_or(false)
    };
    // The entry moved, but no turn was left to end and drain it.
    if send_now.is_some() && !cancelled {
        state.drain_queued_soon(&user.id, &session);
    }
    response(200, json!({"ok":true,"cancelled":cancelled}))
}

/// What a path cancel may carry. Node reads only `queuedMessageId`: when it is present it must be a
/// non-empty string, and it names the entry to send next. Any other body is an ordinary cancel.
fn send_now_target(value: &Value) -> Result<Option<String>, Box<Response>> {
    let Some(id) = value
        .as_object()
        .and_then(|object| object.get("queuedMessageId"))
    else {
        return Ok(None);
    };
    match id.as_str() {
        Some(id) if !id.trim().is_empty() => Ok(Some(id.to_owned())),
        _ => Err(Box::new(validation(
            "queuedMessageId must be a non-empty string",
        ))),
    }
}
/// List live turns only while their sessions remain active and owned by the caller.
async fn streaming_sessions(
    State(state): State<ChatRoutes>,
    headers: axum::http::HeaderMap,
) -> Response {
    if !state.auth.origin_allowed(&headers) {
        return response(403, json!({"error":"ORIGIN_FORBIDDEN"}));
    }
    let Some(user) = state.auth.resolve_user(&headers) else {
        return auth::denied();
    };
    let ids: Vec<String> = state
        .active
        .turns
        .lock()
        .unwrap()
        .iter()
        .filter(|(_, turn)| turn.owner == user.id)
        .map(|(id, _)| id.clone())
        .collect();
    let owner = user.id;
    match state
        .auth
        .with_database(move |db| {
            let sessions = SessionService::new(db).list(SessionFilter {
                status: Some("active"),
                user_id: Some(&owner),
                ..Default::default()
            })?;
            Ok(sessions
                .into_iter()
                .filter(|session| ids.contains(&session.id))
                .map(|session| session.id)
                .collect::<Vec<_>>())
        })
        .await
    {
        Ok(ids) => response(200, json!({"sessionIds": ids})),
        Err(_) => auth::internal_error(),
    }
}

/// Lightweight overview polling: whether a native turn is active for an owned session.
async fn runtime(
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
    let running = state
        .active
        .turns
        .lock()
        .unwrap()
        .get(&session)
        .is_some_and(|turn| turn.owner == user.id);
    response(200, json!({"running":running,"startedAt":Value::Null}))
}
async fn session_loop(
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
    let owner = user.id.clone();
    let found = state
        .auth
        .with_database(move |db| {
            let exists = SessionService::new(db)
                .get(&session, Some(&owner))?
                .is_some();
            let current = if exists {
                crate::services::chat_loops::ChatLoopService::new(db, Default::default())
                    .get(&session, Some(&owner))
                    .ok()
                    .flatten()
            } else {
                None
            };
            Ok((exists, current))
        })
        .await;
    match found {
        Ok((false, _)) => response(404, json!({"error":"NOT_FOUND"})),
        Ok((true, current)) => response(200, json!({"loop": current})),
        Err(_) => auth::internal_error(),
    }
}
/// Pause or resume the chat's loop goal. The new state is persisted; the
/// `chat.updated` broadcast is delivered to the owner. The wake that starts
/// the next turn on resume is not wired natively yet.
async fn session_loop_control(
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
    let body = match body(&state, request).await {
        Ok(body) => body,
        Err(error) => return *error,
    };
    let action = match body.get("action").and_then(Value::as_str) {
        Some(action @ ("pause" | "resume")) => Some(action.to_owned()),
        _ => None,
    };
    let owner = user.id.clone();
    let broadcast: Option<crate::services::chat_loops::Broadcast> =
        state.user_events.clone().map(|sink| {
            Arc::new(move |user: &str, event: Value| {
                let payload = event.get("payload").cloned().unwrap_or(Value::Null);
                sink(user, "chat.updated", payload);
                Ok(())
            }) as crate::services::chat_loops::Broadcast
        });
    // Ownership is answered before validation, as in Node.
    let controlled = state
        .auth
        .with_database(move |db| {
            if SessionService::new(db)
                .get(&session, Some(&owner))?
                .is_none()
            {
                return Ok(None);
            }
            Ok(Some(action.map(|action| {
                let runtime = crate::services::chat_loops::LoopRuntime {
                    broadcast,
                    ..Default::default()
                };
                crate::services::chat_loops::ChatLoopService::new(db, runtime).control(
                    &session,
                    &action,
                    Some(&owner),
                )
            })))
        })
        .await;
    match controlled {
        Ok(None) => response(404, json!({"error":"NOT_FOUND"})),
        Ok(Some(None)) => response(400, json!({"error":"VALIDATION_ERROR"})),
        Ok(Some(Some(Ok(current)))) => response(200, json!({"loop": current})),
        Ok(Some(Some(Err(details)))) => {
            response(409, json!({"error":"LOOP_CONFLICT","details":details}))
        }
        Err(_) => auth::internal_error(),
    }
}
/// Branch a session. Live streaming snapshots and the `chat.created` user
/// broadcast are not wired here; the branch is the durable persisted state.
async fn session_fork(
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
    let owner = user.id.clone();
    let forked = state
        .auth
        .with_database(move |db| {
            let branch = SessionService::new(db).fork(&session, &owner, None)?;
            if let Some(project) = branch.as_ref().and_then(|b| b.project_id.as_deref()) {
                let _ = crate::services::projects::ProjectService::new(db).touch(project);
            }
            Ok(branch)
        })
        .await;
    match forked {
        Ok(Some(branch)) => response(201, serde_json::to_value(branch).unwrap_or(Value::Null)),
        Ok(None) => response(
            404,
            json!({"error":"NOT_FOUND","details":"Session not found"}),
        ),
        Err(_) => auth::internal_error(),
    }
}
/// Plan mode is not implemented natively, so no session can hold a pending plan.
/// After the ownership check this answers exactly as Node does without one.
async fn session_plan(
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
    let owner = user.id.clone();
    let found = state
        .auth
        .with_database(move |db| {
            Ok(SessionService::new(db)
                .get(&session, Some(&owner))?
                .is_some())
        })
        .await;
    match found {
        Ok(true) => response(
            404,
            json!({"error":"NOT_FOUND","details":"No pending plan for this session"}),
        ),
        Ok(false) => response(
            404,
            json!({"error":"NOT_FOUND","details":"Session not found"}),
        ),
        Err(_) => auth::internal_error(),
    }
}
/// Lazily loaded identity/context snapshot of one visible message. Rows follow the messages
/// endpoint order; empty assistant placeholders are not visible. The Node gateway also
/// recomputes size metrics for old snapshots; the stored JSON is returned as persisted here.
async fn message_context_flow(
    State(state): State<ChatRoutes>,
    Path((session, index)): Path<(String, String)>,
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
    let digits = index.trim_start().trim_start_matches('+');
    let (negative, digits) = match digits.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, digits),
    };
    let digits: String = digits.chars().take_while(char::is_ascii_digit).collect();
    let parsed = digits.parse::<usize>().ok();
    let Some(index) = parsed.filter(|n| !negative || *n == 0) else {
        return response(
            400,
            json!({"error":"VALIDATION_ERROR","details":"messageIndex must be a non-negative integer"}),
        );
    };
    let flow = state
        .auth
        .with_database(move |db| {
            let mut statement = db.prepare(
                "SELECT context_flow, role, content, tool_calls FROM messages WHERE session_id = ?1 ORDER BY created_at, id",
            )?;
            let rows = statement.query_map([&session], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?;
            let mut visible = 0usize;
            for row in rows {
                let (flow, role, content, calls) = row?;
                let empty = |v: &Option<String>| v.as_deref().is_none_or(str::is_empty);
                if role == "assistant" && empty(&content) && empty(&calls) {
                    continue;
                }
                if visible == index {
                    return Ok(Some(flow));
                }
                visible += 1;
            }
            Ok(None)
        })
        .await;
    match flow {
        Ok(Some(flow)) => {
            let parsed = flow
                .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                .filter(|v| v["rounds"].is_array());
            response(200, json!({"contextFlow":parsed}))
        }
        Ok(None) => response(
            404,
            json!({"error":"NOT_FOUND","details":"Message not found"}),
        ),
        Err(_) => auth::internal_error(),
    }
}
/// Full persisted body of one sub-agent, loaded when its card is expanded.
async fn session_sub_agent(
    State(state): State<ChatRoutes>,
    Path((session, sub_agent)): Path<(String, String)>,
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
    let found = state
        .auth
        .with_database(move |db| {
            use rusqlite::OptionalExtension;
            db.query_row(
                "SELECT sub_agent_id, session_id, message_id, performative, rounds, duration_ms, created_at, content, segments, tool_calls FROM sub_agent_history WHERE sub_agent_id = ?1 AND session_id = ?2",
                [&sub_agent, &session],
                |row| {
                    let json_column = |i: usize| -> rusqlite::Result<Value> {
                        Ok(row
                            .get::<_, Option<String>>(i)?
                            .and_then(|text| serde_json::from_str(&text).ok())
                            .unwrap_or(Value::Null))
                    };
                    Ok(json!({
                        "subAgentId": row.get::<_, String>(0)?,
                        "sessionId": row.get::<_, Option<String>>(1)?,
                        "messageId": row.get::<_, Option<String>>(2)?,
                        "performative": row.get::<_, Option<String>>(3)?,
                        "rounds": row.get::<_, Option<i64>>(4)?,
                        "durationMs": row.get::<_, Option<i64>>(5)?,
                        "createdAt": row.get::<_, rusqlite::types::Value>(6)?.into_json(),
                        "content": json_column(7)?,
                        "segments": json_column(8)?,
                        "toolCalls": json_column(9)?,
                    }))
                },
            )
            .optional()
            .map_err(Into::into)
        })
        .await;
    match found {
        Ok(Some(sub_agent)) => response(200, json!({"subAgent":sub_agent})),
        Ok(None) => response(
            404,
            json!({"error":"NOT_FOUND","details":"Sub-agent not found"}),
        ),
        Err(_) => auth::internal_error(),
    }
}
trait IntoJson {
    fn into_json(self) -> Value;
}
impl IntoJson for rusqlite::types::Value {
    fn into_json(self) -> Value {
        match self {
            Self::Integer(n) => json!(n),
            Self::Real(n) => json!(n),
            Self::Text(s) => json!(s),
            _ => Value::Null,
        }
    }
}
/// Pre-warming is an optimisation only. This gateway starts provider sessions
/// per turn, so it never warms one and says so, which clients treat as a no-op.
async fn prewarm(State(state): State<ChatRoutes>, request: Request) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    let payload = match body(&state, request).await {
        Ok(payload) => payload,
        Err(error) => return *error,
    };
    let session = match payload["sessionId"].as_str() {
        Some(id) if !id.is_empty() => id.to_owned(),
        _ => {
            return response(
                400,
                json!({"error":"VALIDATION_ERROR","details":"sessionId is required"}),
            );
        }
    };
    let provider = payload["provider"].as_str().unwrap_or_default();
    if provider.is_empty() || provider == "jait" {
        return response(
            200,
            json!({"status":"skipped","reason":"not-a-cli-provider"}),
        );
    }
    if !valid_session(&session) {
        return response(400, json!({"error":"INVALID_SESSION"}));
    }
    let owner = user.id.clone();
    let found = state
        .auth
        .with_database(move |db| {
            Ok(SessionService::new(db)
                .get(&session, Some(&owner))?
                .is_some())
        })
        .await;
    match found {
        Ok(true) => response(
            200,
            json!({"status":"skipped","reason":"prewarm-unavailable"}),
        ),
        Ok(false) => response(
            404,
            json!({"error":"NOT_FOUND","details":"Session not found"}),
        ),
        Err(_) => auth::internal_error(),
    }
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
    // Preserve the route's authorization-before-validation behavior. The
    // projection independently rechecks access in its own data transaction.
    let session_id = session.clone();
    let reader_id = user.id.clone();
    let owner = match state
        .auth
        .with_database(move |db| {
            use rusqlite::OptionalExtension;
            Ok(db
                .query_row(
                    "SELECT s.user_id FROM sessions s WHERE s.id=?1 AND s.status='active' AND (s.user_id=?2 OR (s.shared_with_project=1 AND EXISTS (SELECT 1 FROM projects p WHERE p.id=s.project_id AND p.status='active' AND (p.user_id=?2 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=?2)))))",
                    rusqlite::params![session_id, reader_id],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()?
                .flatten())
        })
        .await
    {
        Ok(Some(owner)) => owner,
        Ok(None) => return response(404, json!({"error":"SESSION_NOT_FOUND"})),
        Err(_) => return auth::internal_error(),
    };
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
    match consistent_snapshot(&state.active, &owner, &session, || async {
        crate::runtime::chat_projection::project_messages_for_reader(
            state.auth.clone(),
            user.id.clone(),
            session.clone(),
            limit,
            before.clone(),
            true,
        )
        .await
        .map(|result| result.unwrap_or(Value::Null))
    })
    .await
    {
        Ok(Some(Value::Null)) => response(404, json!({"error":"SESSION_NOT_FOUND"})),
        Ok(Some(value)) => response(200, value),
        Ok(None) => response(503, json!({"error":"CHAT_SNAPSHOT_BUSY"})),
        Err(_) => auth::internal_error(),
    }
}

// A successful projection and its lease state must cover the same interval.
// Three attempts bound work when this session itself is changing continuously.
async fn consistent_snapshot<F, Fut, E>(
    active: &Arc<ActiveState>,
    owner: &str,
    session: &str,
    mut project: F,
) -> Result<Option<Value>, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<Value, E>>,
{
    let snapshot = active.snapshot(session);
    for _ in 0..3 {
        let revision = snapshot.revision.as_ref().unwrap().load(Ordering::Relaxed);
        let mut value = project().await?;
        let turns = active.turns.lock().unwrap();
        if snapshot.revision.as_ref().unwrap().load(Ordering::Relaxed) != revision {
            continue;
        }
        if !value.is_null() {
            value["streaming"] = json!(turns.get(session).is_some_and(|turn| turn.owner == owner));
        }
        return Ok(Some(value));
    }
    Ok(None)
}
#[cfg(test)]
#[path = "chat_tests.rs"]
mod tests;
