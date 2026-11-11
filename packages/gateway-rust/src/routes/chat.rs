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
    // Entries exist only while at least one snapshot for that session is in flight.
    database_owner: Option<Arc<std::fs::File>>,
    snapshots: Mutex<HashMap<String, Weak<AtomicU64>>>,
    turns: Mutex<HashMap<String, ActiveTurn>>,
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
            .route("/api/sessions/{id}/loop", get(session_loop))
            .route("/api/sessions/{id}/fork", post(session_fork))
            .route("/api/sessions/{id}/plan", get(session_plan))
            .route("/api/sessions/{id}/plan/reject", post(session_plan))
            .route("/api/chat/prewarm", post(prewarm))
            .route("/api/threads/{id}/start", post(thread_start))
            .route("/api/threads/{id}/send", post(thread_send))
            .route("/api/threads/{id}/resume", post(thread_resume))
            .route("/api/threads/{id}/steer", post(thread_steer))
            .route("/api/sessions/{id}/stream", get(super::chat_events::stream))
            .route("/api/sessions/{id}/events", get(super::chat_events::stream))
            .with_state(self.clone())
    }
    /// Stop admission and signal active turns even when no async cleanup is polled.
    pub(crate) fn close(&self) {
        self.active.closed.store(true, Ordering::Release);
        self.events.close_all();
        let active = self.active.turns.lock().unwrap();
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
        let lease = self.admit("test-owner", "test-session").unwrap();
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
        self.active.changed(session);
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
        {
            let mut turns = self.state.turns.lock().unwrap();
            turns.remove(&self.session);
            self.state.changed(&self.session);
        }
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
#[derive(Clone, Copy, PartialEq)]
enum ThreadAction {
    Start,
    Send,
    Resume,
    Steer,
}
const RESUME_PROMPT: &str = "Continue the interrupted task from the saved history and current workspace. Preserve completed work, verify side effects before repeating actions, and finish the remaining steps.";
type DbError = Box<dyn std::error::Error + Send + Sync>;

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
async fn thread_resume(
    State(state): State<ChatRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    thread_turn(state, id, request, ThreadAction::Resume).await
}

/// Records a thread status change; completion-like states stamp `completed_at`.
async fn set_thread_status(
    auth: &AuthState,
    id: &str,
    status: &'static str,
    error: Option<&str>,
    activity: Option<(&'static str, String, Value)>,
) -> Result<(), ()> {
    let (id, error) = (id.to_owned(), error.map(str::to_owned));
    auth.with_database(move |db| {
        let now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
        db.execute(
            &format!(
                "UPDATE agent_threads SET status = ?2, error = ?3, \
                 completed_at = CASE WHEN ?2 IN ('completed','error','interrupted') THEN {now} ELSE NULL END, \
                 updated_at = {now} WHERE id = ?1"
            ),
            rusqlite::params![id, status, error],
        )?;
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
        Ok::<_, DbError>(())
    })
    .await
    .map_err(|_| ())
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
    let Some(session_id) = session_id.filter(|s| valid_session(s)) else {
        return response(409, json!({"error":"Thread has no chat session"}));
    };
    let session = match owned_session(&state, &user.id, &session_id).await {
        Ok(session) => session,
        Err(error) => return *error,
    };
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
    let project_root = session
        .project_path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| state.project_root.clone());
    if !project_root.is_absolute() {
        return response(409, json!({"error":"SESSION_PROJECT_ROOT_INVALID"}));
    }
    let lease = match state.admit(&user.id, &session_id) {
        Ok(lease) => lease,
        Err(error) => return *error,
    };
    let cancellation = lease.cancellation.clone();
    let prepared = tokio::select! {biased;
        _=cancellation.wait_cancelled()=>return response(409,json!({"error":"CHAT_CANCELLED"})),
        result=tokio::time::timeout(Duration::from_secs(10),state.factory.prepare(user.clone(),session))=>match result{Ok(Ok(prepared))=>prepared,_=>return response(503,json!({"error":"CHAT_CONFIGURATION_UNAVAILABLE"}))},
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
    if set_thread_status(&state.auth, &id, "running", None, Some(activity))
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
        let _ = set_thread_status(&auth_state, &thread_id, status, error, None).await;
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
    match consistent_snapshot(&state.active, &user.id, &session, || {
        crate::runtime::chat_projection::project_messages(
            state.auth.clone(),
            user.id.clone(),
            session.clone(),
            limit,
            before.clone(),
        )
    })
    .await
    {
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
        value["streaming"] = json!(turns.get(session).is_some_and(|turn| turn.owner == owner));
        return Ok(Some(value));
    }
    Ok(None)
}
#[cfg(test)]
#[path = "chat_tests.rs"]
mod tests;
