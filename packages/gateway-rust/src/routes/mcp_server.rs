//! Native port of `packages/gateway/src/routes/mcp-server.ts`.
//!
//! Route surface (identical to the TS router):
//!
//! | method | path            | TS handler                  | here                  |
//! |--------|-----------------|-----------------------------|-----------------------|
//! | GET    | `/mcp`          | inline SSE keepalive        | [`get_mcp`]           |
//! | POST   | `/mcp`          | `handleStreamableMcpPost`   | [`post_mcp`]          |
//! | POST   | `/mcp/sse`      | `handleStreamableMcpPost`   | [`post_mcp_sse`]      |
//! | DELETE | `/mcp`          | inline 405 handler          | [`delete_mcp`]        |
//! | GET    | `/mcp/sse`      | legacy SSE endpoint         | [`get_mcp_sse`]       |
//! | POST   | `/mcp/messages` | legacy SSE request handler  | [`post_mcp_messages`] |
//!
//! Mapping notes for symbols that only exist as TS closures/objects:
//!
//! * `handleMcpRequest` → [`handle_request`] (pure JSON-RPC dispatcher, no I/O
//!   besides the injected [`McpToolSource`]).
//! * `toolRegistry` / `list_for_mcp` → the [`McpToolSource`] trait. The crate's
//!   `tools::registry::ToolRegistry` is `Rc`-based and therefore not `Send`, so
//!   the route layer talks to a `Send + Sync` port instead of borrowing the
//!   registry directly; [`McpToolDescriptor::from_registry_entry`] documents the
//!   field mapping for a single-threaded adapter.
//! * `resolveMcpToolSet` → [`ToolSet::parse`] / [`parse_tool_set`].
//! * `resolveRequestedProtocolVersion` → [`resolve_requested_protocol_version`].
//! * `resolveMcpProgressToken` → [`resolve_progress_token`].
//! * `createMcpProgressNotification` → [`progress_notification`].
//! * `mcpContentForToolResult` → [`McpToolOutcome`] (content is produced by the
//!   tool adapter; the route layer only wraps it, exactly like the TS helper).
//! * `clients` map for the legacy SSE transport → [`SessionRegistry`].
//! * `resolveMcpToolContext` → [`McpAuthenticator`] + [`McpToolContext`].
//!
//! Nothing here logs request bodies, bearer tokens or session secrets: reject
//! paths carry fixed strings only.

use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use futures_util::stream::Stream;
use serde_json::{json, Map, Value};
use tokio::sync::mpsc;

/// MCP revisions accepted from clients, newest first (TS: `SUPPORTED_PROTOCOL_VERSIONS`).
pub const SUPPORTED_PROTOCOL_VERSIONS: [&str; 4] =
    ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

/// Version advertised when the client sends none (TS: `DEFAULT_MCP_PROTOCOL_VERSION`).
pub const DEFAULT_PROTOCOL_VERSION: &str = "2025-03-26";

/// Response header echoing the negotiated revision.
pub const PROTOCOL_HEADER: &str = "mcp-protocol-version";

/// Per-request body cap. TS relies on the global Fastify body limit; here the
/// bound is explicit so a hostile client cannot buffer without limit.
pub const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

/// Cap on concurrently registered legacy SSE sessions (TS: unbounded `clients`).
pub const MAX_SESSIONS: usize = 64;

/// Bounded per-session outbound queue; overflow drops the session rather than
/// growing memory without limit.
pub const SESSION_QUEUE_CAPACITY: usize = 64;

/// SSE keepalive cadence (TS: `setInterval(..., 15_000)`).
pub const KEEPALIVE: Duration = Duration::from_secs(15);

/// Server instructions surfaced during `initialize`.
pub const INSTRUCTIONS: &str = "Jait gateway MCP endpoint. Tools operate on the local gateway: \
filesystem, shell, git, chat sessions, and browser control. Every tool call runs with the \
authenticated user's permissions.";

// ---------------------------------------------------------------------------
// Tool model
// ---------------------------------------------------------------------------

/// Port of one entry of the TS `ToolRegistry` metadata that MCP exposes
/// (`name`, `displayName`, `description`, `parameters`, `risk`, `category`).
#[derive(Clone, Debug)]
pub struct McpToolDescriptor {
    /// Canonical tool name using the internal dot convention (`shell.exec`).
    pub name: String,
    pub display_name: String,
    pub description: String,
    /// JSON Schema object for the tool arguments.
    pub parameters: Value,
    pub risk: String,
    pub category: String,
    /// Membership in `MCP_EXPOSED_CORE_TOOL_NAMES`; drives the `toolSet=core`
    /// / `toolSet=deferred` filters.
    pub core: bool,
}

impl McpToolDescriptor {
    /// Minimal descriptor used by tests and by adapters that only expose a name.
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            display_name: name.to_string(),
            description: String::new(),
            parameters: json!({ "type": "object", "properties": {} }),
            risk: "read".to_string(),
            category: "core".to_string(),
            core: true,
        }
    }

    /// Field mapping from a `tools::registry::RegisteredTool` row. Kept free of
    /// the registry type so the route layer stays `Send + Sync`.
    pub fn from_registry_entry(
        name: &str,
        display_name: &str,
        description: &str,
        parameters: Value,
        risk: &str,
        category: &str,
        core: bool,
    ) -> Self {
        Self {
            name: name.to_string(),
            display_name: display_name.to_string(),
            description: description.to_string(),
            parameters,
            risk: risk.to_string(),
            category: category.to_string(),
            core,
        }
    }

    /// MCP name projection: internal dotted names become underscore names.
    pub fn mcp_name(&self) -> String {
        self.name.replace('.', "_")
    }

    /// Port of the `tools/list` row builder.
    pub fn to_mcp_tool(&self) -> Value {
        let (read_only, destructive, idempotent) = match self.risk.as_str() {
            "read" => (true, false, true),
            "write" | "execute" => (false, true, false),
            _ => (false, false, false),
        };
        let mut annotations = Map::new();
        annotations.insert("title".into(), json!(self.display_name));
        annotations.insert("readOnlyHint".into(), json!(read_only));
        annotations.insert("destructiveHint".into(), json!(destructive));
        annotations.insert("idempotentHint".into(), json!(idempotent));
        json!({
            "name": self.mcp_name(),
            "title": self.display_name,
            "description": self.description,
            "inputSchema": self.parameters,
            "annotations": Value::Object(annotations),
        })
    }
}

/// Result of one tool invocation, mirroring the TS `ToolResult` fields the MCP
/// helper `mcpContentForToolResult` consumes.
#[derive(Clone, Debug)]
pub struct McpToolOutcome {
    pub ok: bool,
    pub content: Vec<Value>,
}

impl McpToolOutcome {
    pub fn text(text: impl Into<String>) -> Self {
        Self { ok: true, content: vec![json!({ "type": "text", "text": text.into() })] }
    }
}

/// Progress sink type (TS: `onOutputChunk` / `onProgress`).
pub type ProgressSink = Arc<dyn Fn(Value) + Send + Sync>;

/// Per-call context handed to a tool (TS: `ToolContext`).
#[derive(Clone)]
pub struct McpToolContext {
    pub session_id: Option<String>,
    pub thread_id: Option<String>,
    /// True when the session came from the legacy last-active fallback rather
    /// than an explicit `x-jait-session-id` or session-scoped URL.
    pub session_id_inferred: bool,
    pub user_id: Option<String>,
    pub project_root: Option<String>,
    pub provider_id: Option<String>,
    pub model: Option<String>,
    pub runtime_mode: Option<String>,
    pub action_id: String,
    pub progress: Option<ProgressSink>,
}

impl Default for McpToolContext {
    fn default() -> Self {
        Self {
            session_id: None,
            thread_id: None,
            session_id_inferred: false,
            user_id: None,
            project_root: None,
            provider_id: None,
            model: None,
            runtime_mode: None,
            action_id: uuid::Uuid::new_v4().to_string(),
            progress: None,
        }
    }
}

impl McpToolContext {
    /// Emits a `notifications/progress` frame when a sink is attached.
    pub fn notify_progress(&self, token: &Value, progress: u64, message: &str) {
        if let Some(sink) = &self.progress {
            sink(progress_notification(token.clone(), progress, message));
        }
    }
}

// Manual `Debug`: `progress` is an `Arc<dyn Fn>` and the context carries session
// identifiers that must never be printed verbatim, so only presence is shown.
impl std::fmt::Debug for McpToolContext {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("McpToolContext")
            .field("session_id", &self.session_id.is_some())
            .field("thread_id", &self.thread_id.is_some())
            .field("user_id", &self.user_id.is_some())
            .field("session_id_inferred", &self.session_id_inferred)
            .field("action_id", &self.action_id)
            .field("provider_id", &self.provider_id)
            .field("model", &self.model)
            .field("runtime_mode", &self.runtime_mode)
            .field("has_progress_sink", &self.progress.is_some())
            .finish()
    }
}


/// Tool access port (TS: the `toolRegistry` argument of `handleMcpRequest`).
pub trait McpToolSource: Send + Sync {
    /// All tools exposed to MCP, already filtered the way `list_for_mcp` filters.
    fn list(&self) -> Vec<McpToolDescriptor>;
    /// Exact-name lookup using the internal dotted name.
    fn get(&self, name: &str) -> Option<McpToolDescriptor>;
    /// Runs one tool. Errors are surfaced as `isError` text, as in the TS route.
    fn execute<'a>(
        &'a self,
        name: &'a str,
        args: Value,
        ctx: McpToolContext,
    ) -> futures_util::future::BoxFuture<'a, Result<McpToolOutcome, String>>;
}

/// Session/auth port (TS: `resolveMcpToolContext` + `sessionService`/`userService`).
pub trait McpAuthenticator: Send + Sync {
    /// Resolves the caller. Denials must already be `401`/`403` responses with
    /// the gateway's standard error envelope.
    fn resolve<'a>(
        &'a self,
        headers: &'a HeaderMap,
        query: &'a HashMap<String, String>,
    ) -> futures_util::future::BoxFuture<'a, Result<McpToolContext, Response>>;
}

// ---------------------------------------------------------------------------
// Protocol helpers
// ---------------------------------------------------------------------------

/// TS: `resolveMcpToolSet` — selects which slice of the registry is visible.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToolSet {
    All,
    Core,
    Deferred,
}

impl ToolSet {
    pub fn parse(value: Option<&str>) -> Self {
        match value.map(str::trim) {
            Some("core") => ToolSet::Core,
            Some("deferred") => ToolSet::Deferred,
            _ => ToolSet::All,
        }
    }

    fn admits(&self, tool: &McpToolDescriptor) -> bool {
        match self {
            ToolSet::All => true,
            ToolSet::Core => tool.core,
            ToolSet::Deferred => !tool.core,
        }
    }
}

/// TS: `resolveMcpToolSet(request.query)`.
pub fn parse_tool_set(query: &HashMap<String, String>) -> ToolSet {
    ToolSet::parse(query.get("toolSet").map(String::as_str))
}

/// TS: `resolveRequestedProtocolVersion` — body `params.protocolVersion` wins,
/// then the `mcp-protocol-version` header. Returns `None` when a value was
/// supplied but is not supported.
pub fn resolve_requested_protocol_version(
    body: &Value,
    headers: &HeaderMap,
) -> Option<&'static str> {
    let from_body = body
        .get("params")
        .and_then(|p| p.get("protocolVersion"))
        .and_then(Value::as_str);
    let from_header = headers.get(PROTOCOL_HEADER).and_then(|v| v.to_str().ok());
    for candidate in [from_body, from_header].into_iter().flatten() {
        let candidate = candidate.trim();
        if let Some(supported) = SUPPORTED_PROTOCOL_VERSIONS.iter().find(|v| **v == candidate) {
            return Some(supported);
        }
    }
    None
}

/// TS: `resolveMcpProgressToken` — `params._meta.progressToken`.
pub fn resolve_progress_token(body: &Value) -> Option<Value> {
    body.get("params")
        .and_then(|p| p.get("_meta"))
        .and_then(|m| m.get("progressToken"))
        .filter(|t| !t.is_null())
        .cloned()
}

/// TS: `createMcpProgressNotification`.
pub fn progress_notification(token: Value, progress: u64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "method": "notifications/progress",
        "params": {
            "progressToken": token,
            "progress": progress,
            "message": message,
        }
    })
}

/// TS: the `!body || body.jsonrpc !== "2.0" || !body.method` guard that answers
/// `400 {"error":"Invalid JSON-RPC request"}`.
pub fn is_valid_jsonrpc_request(body: &Value) -> bool {
    let Some(object) = body.as_object() else { return false };
    if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return false;
    }
    object
        .get("method")
        .and_then(Value::as_str)
        .is_some_and(|m| !m.is_empty())
}

/// Internal tool name from an MCP name: underscore names map back to the dotted
/// form, unless a dotted name is already registered.
pub fn internal_tool_name(source: &dyn McpToolSource, mcp_name: &str) -> Option<McpToolDescriptor> {
    if let Some(found) = source.get(mcp_name) {
        return Some(found);
    }
    let dotted = mcp_name.replace('_', ".");
    source.get(&dotted)
}

fn error(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message.into() } })
}

fn tool_error(id: Value, message: impl Into<String>) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "content": [{ "type": "text", "text": message.into() }],
            "isError": true,
        }
    })
}

/// TS: `handleMcpRequest` — the JSON-RPC dispatcher. Returns `Value::Null` for
/// notifications that must not be answered.
pub async fn handle_request(
    request: &Value,
    source: Option<&dyn McpToolSource>,
    protocol_version: &str,
    ctx: &McpToolContext,
    tool_set: ToolSet,
) -> Value {
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let method = request.get("method").and_then(Value::as_str).unwrap_or_default();
    let params = request.get("params").cloned().unwrap_or(Value::Null);

    match method {
        "initialize" => {
            let mut result = json!({
                "protocolVersion": protocol_version,
                "capabilities": {
                    "tools": { "listChanged": false },
                    "logging": {},
                    "prompts": { "listChanged": false },
                    "resources": { "subscribe": false, "listChanged": false },
                },
                "serverInfo": { "name": "jait-gateway", "version": env!("CARGO_PKG_VERSION") },
                "instructions": INSTRUCTIONS,
            });
            if let Some(obj) = result.as_object_mut() {
                obj.insert("protocolVersion".into(), json!(protocol_version));
            }
            json!({ "jsonrpc": "2.0", "id": id, "result": result })
        }
        "tools/list" => {
            let tools: Vec<Value> = source
                .map(|s| {
                    s.list()
                        .into_iter()
                        .filter(|t| tool_set.admits(t))
                        .map(|t| t.to_mcp_tool())
                        .collect()
                })
                .unwrap_or_default();
            json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools } })
        }
        "tools/call" => tools_call(id, source, ctx, tool_set, params).await,
        "resources/list" => {
            json!({ "jsonrpc": "2.0", "id": id, "result": { "resources": [] } })
        }
        "resources/templates/list" => {
            json!({ "jsonrpc": "2.0", "id": id, "result": { "resourceTemplates": [] } })
        }
        "prompts/list" => {
            json!({ "jsonrpc": "2.0", "id": id, "result": { "prompts": [] } })
        }
        "notifications/initialized" | "initialized" | "ping" => {
            json!({ "jsonrpc": "2.0", "id": id, "result": {} })
        }
        // JSON-RPC 2.0 §4.1: notifications are never answered. TS returns
        // `-32601` here; the HTTP layer discards the body for `id == null`, so
        // honouring the cancellation without a reply is wire-compatible.
        "notifications/cancelled" => {
            if let Some(progress) = &ctx.progress {
                progress(json!({
                    "jsonrpc": "2.0",
                    "method": "notifications/cancelled",
                    "params": params,
                }));
            }
            Value::Null
        }
        other => error(id, -32601, format!("Method not found: {other}")),
    }
}

async fn tools_call(
    id: Value,
    source: Option<&dyn McpToolSource>,
    ctx: &McpToolContext,
    tool_set: ToolSet,
    params: Value,
) -> Value {
    let Some(source) = source else {
        return tool_error(id, "No tools are available in this gateway runtime.");
    };
    let mcp_name = params.get("name").and_then(Value::as_str).unwrap_or_default();
    if mcp_name.is_empty() {
        return error(id, -32602, "Invalid params: missing tool name");
    }
    let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
    if !args.is_object() {
        return error(id, -32602, "Invalid params: arguments must be an object");
    }

    let Some(tool) = internal_tool_name(source, mcp_name) else {
        return tool_error(id, format!("Unknown tool: {mcp_name}"));
    };
    if !tool_set.admits(&tool) {
        return tool_error(id, format!("Unknown tool: {mcp_name}"));
    }

    // Browser control and handoff are bound to one conversation; the legacy
    // last-active fallback cannot authorise them (TS guard, verbatim text).
    let starts_browser = tool.name == "surfaces.start"
        && args.get("type").and_then(Value::as_str) == Some("browser");
    if ctx.session_id_inferred && (tool.category == "browser" || starts_browser) {
        return tool_error(
            id,
            "Browser tools require an explicit sessionId for the originating chat. Reconnect \
using this chat's session-scoped MCP URL or x-jait-session-id; the last-active chat cannot be \
used for browser control or handoff.",
        );
    }
    if ctx.session_id.is_none() {
        return tool_error(
            id,
            "Tool execution requires a sessionId. Authenticate with an active session or provide \
x-jait-session-id.",
        );
    }

    match source.execute(&tool.name, args, ctx.clone()).await {
        Ok(outcome) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "content": outcome.content,
                "isError": !outcome.ok,
            }
        }),
        Err(message) => tool_error(id, format!("Tool execution error: {message}")),
    }
}

// ---------------------------------------------------------------------------
// Legacy SSE sessions (TS: the module-level `clients` map)
// ---------------------------------------------------------------------------

struct SessionEntry {
    sender: mpsc::Sender<String>,
    /// Owner stamp (TS tracks the authenticated user per client).
    #[allow(dead_code)]
    owner: Option<String>,
}

/// Bounded registry of legacy SSE clients. Mapping to the TS `clients` map,
/// with an explicit [`MAX_SESSIONS`] ceiling and a bounded outbound queue per
/// client so a stalled reader cannot grow memory.
pub struct SessionRegistry {
    inner: Mutex<HashMap<String, SessionEntry>>,
    counter: AtomicU64,
}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()), counter: AtomicU64::new(0) }
    }

    /// Registers a client and returns its id plus the outbound frame receiver.
    /// Returns `None` when [`MAX_SESSIONS`] is reached (denial, not eviction).
    pub fn register(&self, owner: Option<String>) -> Option<(String, mpsc::Receiver<String>)> {
        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if guard.len() >= MAX_SESSIONS {
            return None;
        }
        let seq = self.counter.fetch_add(1, Ordering::Relaxed);
        let id = format!("mcp-{}-{seq}", uuid::Uuid::new_v4().simple());
        let (sender, receiver) = mpsc::channel(SESSION_QUEUE_CAPACITY);
        guard.insert(id.clone(), SessionEntry { sender, owner });
        Some((id, receiver))
    }

    pub fn remove(&self, id: &str) {
        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        guard.remove(id);
    }

    /// Queues one SSE frame. A full or closed queue drops the session.
    pub fn push(&self, id: &str, frame: String) -> bool {
        let guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        match guard.get(id) {
            Some(entry) => match entry.sender.try_send(frame) {
                Ok(()) => true,
                Err(_) => {
                    drop(guard);
                    self.remove(id);
                    false
                }
            },
            None => false,
        }
    }

    pub fn contains(&self, id: &str) -> bool {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).contains_key(id)
    }

    pub fn len(&self) -> usize {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Removes the session when its stream is dropped, mirroring the TS
/// `reply.raw.on("close", ...)` cleanup.
struct SessionGuard {
    registry: Arc<SessionRegistry>,
    id: String,
}

impl Drop for SessionGuard {
    fn drop(&mut self) {
        self.registry.remove(&self.id);
    }
}

// ---------------------------------------------------------------------------
// Route state
// ---------------------------------------------------------------------------

/// State for the `/mcp*` routes.
#[derive(Clone)]
pub struct McpRoutes {
    pub tools: Option<Arc<dyn McpToolSource>>,
    pub auth: Option<Arc<dyn McpAuthenticator>>,
    pub sessions: Arc<SessionRegistry>,
}

impl McpRoutes {
    pub fn new() -> Self {
        Self { tools: None, auth: None, sessions: Arc::new(SessionRegistry::new()) }
    }

    pub fn with_tools(mut self, tools: Arc<dyn McpToolSource>) -> Self {
        self.tools = Some(tools);
        self
    }

    pub fn with_auth(mut self, auth: Arc<dyn McpAuthenticator>) -> Self {
        self.auth = Some(auth);
        self
    }

    /// Resolves the caller, falling back to a header-derived context when no
    /// authenticator is wired (the server pipeline owns real authentication).
    async fn authorize(
        &self,
        headers: &HeaderMap,
        query: &HashMap<String, String>,
    ) -> Result<McpToolContext, Response> {
        if let Some(auth) = &self.auth {
            return auth.resolve(headers, query).await;
        }
        let session = headers
            .get("x-jait-session-id")
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        Ok(McpToolContext { session_id: session, session_id_inferred: false, ..Default::default() })
    }
}

impl Default for McpRoutes {
    fn default() -> Self {
        Self::new()
    }
}

pub const ROUTE_TABLE: [(&str, &str, &str); 6] = [
    ("GET", "/mcp", "get_mcp"),
    ("POST", "/mcp", "post_mcp"),
    ("POST", "/mcp/sse", "post_mcp_sse"),
    ("DELETE", "/mcp", "delete_mcp"),
    ("GET", "/mcp/sse", "get_mcp_sse"),
    ("POST", "/mcp/messages", "post_mcp_messages"),
];

pub fn router(state: McpRoutes) -> Router {
    Router::new()
        .route("/mcp", get(get_mcp).post(post_mcp).delete(delete_mcp))
        .route("/mcp/sse", get(get_mcp_sse).post(post_mcp_sse))
        .route("/mcp/messages", post(post_mcp_messages))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn query_params(uri: &axum::http::Uri) -> HashMap<String, String> {
    uri.query()
        .map(|raw| {
            url::form_urlencoded::parse(raw.as_bytes())
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect()
        })
        .unwrap_or_default()
}

fn json_error(status: StatusCode, message: &str) -> Response {
    (status, axum::Json(json!({ "error": message }))).into_response()
}

fn sse_response(body: Body, version: Option<&str>) -> Response {
    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "text/event-stream")
        .header("cache-control", "no-cache")
        .header("connection", "keep-alive")
        .header("x-accel-buffering", "no");
    if let Some(version) = version {
        builder = builder.header(PROTOCOL_HEADER, version);
    }
    builder.body(body).unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn frame_stream(rx: mpsc::Receiver<String>, guard: Option<SessionGuard>) -> impl Stream<Item = Result<String, Infallible>> + Send + 'static {
    futures_util::stream::unfold((rx, guard), |(mut rx, guard)| async move {
        let item = rx.recv().await;
        match item {
            Some(frame) => Some((Ok::<_, Infallible>(frame), (rx, guard))),
            None => {
                drop(guard);
                None
            }
        }
    })
}

/// Streams frames pushed into a registered legacy session, interleaved with
/// keepalive comments every [`KEEPALIVE`].
fn session_stream(
    rx: mpsc::Receiver<String>,
    guard: SessionGuard,
) -> impl Stream<Item = Result<String, Infallible>> + Send + 'static {
    struct State {
        rx: mpsc::Receiver<String>,
        ticker: tokio::time::Interval,
        guard: Option<SessionGuard>,
    }
    futures_util::stream::unfold(
        State { rx, ticker: tokio::time::interval(KEEPALIVE), guard: Some(guard) },
        |mut state| async move {
            tokio::select! {
                item = state.rx.recv() => match item {
                    Some(frame) => Some((Ok::<_, Infallible>(frame), state)),
                    None => {
                        drop(state.guard.take());
                        None
                    }
                },
                _ = state.ticker.tick() => {
                    Some((Ok::<_, Infallible>(": keepalive\n\n".to_string()), state))
                }
            }
        },
    )
}

fn keepalive_stream(
    opening: Vec<String>,
    guard: Option<SessionGuard>,
) -> impl Stream<Item = Result<String, Infallible>> + Send + 'static {
    let (tx, rx) = mpsc::channel(SESSION_QUEUE_CAPACITY);
    tokio::spawn(async move {
        for frame in opening {
            if tx.send(frame).await.is_err() {
                return;
            }
        }
        let mut ticker = tokio::time::interval(KEEPALIVE);
        ticker.tick().await;
        loop {
            ticker.tick().await;
            if tx.send(": keepalive\n\n".to_string()).await.is_err() {
                return;
            }
        }
    });
    frame_stream(rx, guard)
}

fn sse_frame(value: &Value) -> String {
    format!("event: message\ndata: {value}\n\n")
}

fn accepts_event_stream(headers: &HeaderMap) -> bool {
    headers
        .get("accept")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/event-stream"))
}

/// TS: `appendMcpContextQuery` — forwards unrelated query params (toolSet,
/// session hints) onto the legacy POST endpoint.
fn endpoint_url(headers: &HeaderMap, client_id: &str, query: &HashMap<String, String>) -> String {
    let mut extras: Vec<(String, String)> = query
        .iter()
        .filter(|(k, _)| k.as_str() != "clientId")
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    extras.sort();
    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    serializer.append_pair("clientId", client_id);
    for (k, v) in &extras {
        serializer.append_pair(k, v);
    }
    let qs = serializer.finish();
    match headers.get("host").and_then(|v| v.to_str().ok()) {
        Some(host) if !host.is_empty() => format!("http://{host}/mcp/messages?{qs}"),
        _ => format!("/mcp/messages?{qs}"),
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /mcp` — streamable HTTP SSE channel that only carries keepalives.
pub async fn get_mcp() -> Response {
    let stream = keepalive_stream(vec![": connected\n\n".to_string()], None);
    sse_response(Body::from_stream(stream), None)
}

/// `DELETE /mcp` — session termination is not supported.
pub async fn delete_mcp() -> Response {
    json_error(StatusCode::METHOD_NOT_ALLOWED, "Session termination not supported")
}

/// `POST /mcp` and `POST /mcp/sse` (TS shares `handleStreamableMcpPost`).
pub async fn post_mcp(
    State(state): State<McpRoutes>,
    headers: HeaderMap,
    uri: axum::http::Uri,
    body: Body,
) -> Response {
    streamable_post(state, headers, uri, body).await
}

/// `POST /mcp/sse` — compatibility alias for legacy configs.
pub async fn post_mcp_sse(
    State(state): State<McpRoutes>,
    headers: HeaderMap,
    uri: axum::http::Uri,
    body: Body,
) -> Response {
    streamable_post(state, headers, uri, body).await
}

async fn streamable_post(
    state: McpRoutes,
    headers: HeaderMap,
    uri: axum::http::Uri,
    body: Body,
) -> Response {
    let bytes = match axum::body::to_bytes(body, MAX_MESSAGE_BYTES).await {
        Ok(bytes) => bytes,
        Err(_) => return json_error(StatusCode::PAYLOAD_TOO_LARGE, "MCP request body too large"),
    };
    let Ok(request) = serde_json::from_slice::<Value>(&bytes) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid JSON-RPC request");
    };
    if !is_valid_jsonrpc_request(&request) {
        return json_error(StatusCode::BAD_REQUEST, "Invalid JSON-RPC request");
    }

    let requested = resolve_requested_protocol_version(&request, &headers);
    if headers.contains_key(PROTOCOL_HEADER) && requested.is_none() {
        return json_error(StatusCode::BAD_REQUEST, "Invalid or unsupported MCP-Protocol-Version");
    }
    let negotiated = requested.unwrap_or(DEFAULT_PROTOCOL_VERSION);

    let query = query_params(&uri);
    let context = match state.authorize(&headers, &query).await {
        Ok(context) => context,
        Err(response) => return response,
    };
    let tool_set = parse_tool_set(&query);

    let has_id = request.get("id").map(|id| !id.is_null()).unwrap_or(false);
    let is_tool_call = request.get("method").and_then(Value::as_str) == Some("tools/call");
    let progress_token = resolve_progress_token(&request);

    // Streaming branch: only when the client both accepts SSE and asked for
    // progress on a tool call.
    if has_id && is_tool_call && progress_token.is_some() && accepts_event_stream(&headers) {
        let (tx, rx) = mpsc::channel::<String>(32);
        let sink: ProgressSink = {
            let tx = tx.clone();
            Arc::new(move |notification: Value| {
                // Bounded: a stalled reader drops progress frames but the final
                // response is still attempted below.
                let _ = tx.try_send(sse_frame(&notification));
            })
        };
        let mut context = context;
        context.progress = Some(sink);
        let tools = state.tools.clone();
        let request_clone = request.clone();
        tokio::spawn(async move {
            let response = handle_request(
                &request_clone,
                tools.as_deref(),
                negotiated,
                &context,
                tool_set,
            )
            .await;
            let _ = tx.try_send(sse_frame(&response));
        });
        return sse_response(Body::from_stream(frame_stream(rx, None)), Some(negotiated));
    }

    let response = handle_request(&request, state.tools.as_deref(), negotiated, &context, tool_set)
        .await;

    if !has_id {
        return StatusCode::ACCEPTED.into_response();
    }
    if response.is_null() {
        return StatusCode::ACCEPTED.into_response();
    }
    let mut response = axum::Json(response).into_response();
    if let Ok(value) = negotiated.parse::<axum::http::HeaderValue>() {
        response.headers_mut().insert(PROTOCOL_HEADER, value);
    }
    response
}

/// `GET /mcp/sse` — legacy SSE transport: register a client, announce the POST
/// endpoint, then keep the stream alive.
pub async fn get_mcp_sse(
    State(state): State<McpRoutes>,
    headers: HeaderMap,
    uri: axum::http::Uri,
) -> Response {
    let query = query_params(&uri);
    let owner = match state.authorize(&headers, &query).await {
        Ok(context) => context.user_id,
        Err(response) => return response,
    };
    let Some((client_id, rx)) = state.sessions.register(owner) else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "Too many MCP sessions");
    };
    let guard = SessionGuard { registry: state.sessions.clone(), id: client_id.clone() };
    let endpoint = endpoint_url(&headers, &client_id, &query);
    state
        .sessions
        .push(&client_id, format!("event: endpoint\ndata: {endpoint}\n\n"));
    let stream = session_stream(rx, guard);
    sse_response(Body::from_stream(stream), None)
}

/// `POST /mcp/messages` — legacy SSE request endpoint: the JSON-RPC response is
/// delivered over the already-open SSE stream and the POST itself returns 202.
pub async fn post_mcp_messages(
    State(state): State<McpRoutes>,
    headers: HeaderMap,
    uri: axum::http::Uri,
    body: Body,
) -> Response {
    let query = query_params(&uri);
    let client_id = query.get("clientId").map(String::as_str).unwrap_or_default();
    if client_id.is_empty() || !state.sessions.contains(client_id) {
        return json_error(StatusCode::BAD_REQUEST, "Invalid or missing clientId");
    }

    let bytes = match axum::body::to_bytes(body, MAX_MESSAGE_BYTES).await {
        Ok(bytes) => bytes,
        Err(_) => return json_error(StatusCode::PAYLOAD_TOO_LARGE, "MCP request body too large"),
    };
    let Ok(request) = serde_json::from_slice::<Value>(&bytes) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid JSON-RPC request");
    };
    if !is_valid_jsonrpc_request(&request) {
        return json_error(StatusCode::BAD_REQUEST, "Invalid JSON-RPC request");
    }

    let requested = resolve_requested_protocol_version(&request, &headers);
    if headers.contains_key(PROTOCOL_HEADER) && requested.is_none() {
        return json_error(StatusCode::BAD_REQUEST, "Invalid or unsupported MCP-Protocol-Version");
    }
    let negotiated = requested.unwrap_or(DEFAULT_PROTOCOL_VERSION);

    let context = match state.authorize(&headers, &query).await {
        Ok(context) => context,
        Err(response) => return response,
    };
    let tool_set = parse_tool_set(&query);
    let response = handle_request(&request, state.tools.as_deref(), negotiated, &context, tool_set)
        .await;
    if !response.is_null() {
        state.sessions.push(client_id, sse_frame(&response));
    }
    StatusCode::ACCEPTED.into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::future::BoxFuture;
    use std::sync::Mutex as StdMutex;

    struct FakeTools {
        tools: Vec<McpToolDescriptor>,
        calls: StdMutex<Vec<(String, Value)>>,
        fail: bool,
    }

    impl FakeTools {
        fn with(tools: Vec<McpToolDescriptor>) -> Self {
            Self { tools, calls: StdMutex::new(Vec::new()), fail: false }
        }
        fn failing() -> Self {
            let mut fake = Self::with(vec![McpToolDescriptor::new("shell.exec")]);
            fake.fail = true;
            fake
        }
    }

    impl McpToolSource for FakeTools {
        fn list(&self) -> Vec<McpToolDescriptor> {
            self.tools.clone()
        }
        fn get(&self, name: &str) -> Option<McpToolDescriptor> {
            self.tools.iter().find(|t| t.name == name).cloned()
        }
        fn execute<'a>(
            &'a self,
            name: &'a str,
            args: Value,
            _ctx: McpToolContext,
        ) -> BoxFuture<'a, Result<McpToolOutcome, String>> {
            Box::pin(async move {
                self.calls.lock().unwrap().push((name.to_string(), args));
                if self.fail {
                    return Err("boom".to_string());
                }
                Ok(McpToolOutcome::text("done"))
            })
        }
    }

    struct DenyingAuth;
    impl McpAuthenticator for DenyingAuth {
        fn resolve<'a>(
            &'a self,
            _headers: &'a HeaderMap,
            _query: &'a HashMap<String, String>,
        ) -> BoxFuture<'a, Result<McpToolContext, Response>> {
            Box::pin(async move {
                Err(json_error(StatusCode::UNAUTHORIZED, "Authentication required"))
            })
        }
    }

    fn session_ctx() -> McpToolContext {
        McpToolContext {
            session_id: Some("sess-1".to_string()),
            thread_id: Some("thread-1".to_string()),
            user_id: Some("user-1".to_string()),
            ..Default::default()
        }
    }

    fn call_request(name: &str) -> Value {
        json!({
            "jsonrpc": "2.0",
            "id": 7,
            "method": "tools/call",
            "params": { "name": name, "arguments": { "cmd": "ls" } }
        })
    }

    #[test]
    fn route_table_matches_ts_router() {
        let paths: Vec<&str> = ROUTE_TABLE.iter().map(|r| r.1).collect();
        assert_eq!(paths.iter().filter(|p| **p == "/mcp").count(), 3);
        assert!(ROUTE_TABLE.contains(&("GET", "/mcp", "get_mcp")));
        assert!(ROUTE_TABLE.contains(&("POST", "/mcp/sse", "post_mcp_sse")));
        assert!(ROUTE_TABLE.contains(&("DELETE", "/mcp", "delete_mcp")));
        assert!(ROUTE_TABLE.contains(&("POST", "/mcp/messages", "post_mcp_messages")));
        let mut unique: Vec<&str> = paths.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique, vec!["/mcp", "/mcp/messages", "/mcp/sse"]);
    }

    #[test]
    fn tool_set_parse_variants() {
        assert_eq!(ToolSet::parse(Some("core")), ToolSet::Core);
        assert_eq!(ToolSet::parse(Some(" deferred ")), ToolSet::Deferred);
        assert_eq!(ToolSet::parse(Some("all")), ToolSet::All);
        assert_eq!(ToolSet::parse(None), ToolSet::All);
        let mut query = HashMap::new();
        query.insert("toolSet".to_string(), "core".to_string());
        assert_eq!(parse_tool_set(&query), ToolSet::Core);
    }

    #[test]
    fn tool_descriptor_projection_uses_underscores_and_annotations() {
        let write = McpToolDescriptor::from_registry_entry(
            "files.write",
            "Write File",
            "Writes a file",
            json!({ "type": "object", "properties": { "path": { "type": "string" } } }),
            "write",
            "filesystem",
            true,
        );
        let projected = write.to_mcp_tool();
        assert_eq!(projected["name"], json!("files_write"));
        assert_eq!(projected["title"], json!("Write File"));
        assert_eq!(projected["inputSchema"]["properties"]["path"]["type"], json!("string"));
        assert_eq!(projected["annotations"]["readOnlyHint"], json!(false));
        assert_eq!(projected["annotations"]["destructiveHint"], json!(true));
        assert_eq!(projected["annotations"]["idempotentHint"], json!(false));

        let read = McpToolDescriptor::new("fs.read");
        let projected = read.to_mcp_tool();
        assert_eq!(projected["annotations"]["readOnlyHint"], json!(true));
        assert_eq!(projected["annotations"]["destructiveHint"], json!(false));
    }

    #[test]
    fn protocol_version_prefers_body_then_header_and_rejects_unknown() {
        let body = json!({ "params": { "protocolVersion": "2025-06-18" } });
        let mut headers = HeaderMap::new();
        headers.insert(PROTOCOL_HEADER, "2024-11-05".parse().unwrap());
        assert_eq!(resolve_requested_protocol_version(&body, &headers), Some("2025-06-18"));

        let bare = json!({});
        assert_eq!(resolve_requested_protocol_version(&bare, &headers), Some("2024-11-05"));

        let mut unsupported = HeaderMap::new();
        unsupported.insert(PROTOCOL_HEADER, "1999-01-01".parse().unwrap());
        assert_eq!(resolve_requested_protocol_version(&bare, &unsupported), None);
        assert_eq!(resolve_requested_protocol_version(&json!({}), &HeaderMap::new()), None);
    }

    #[test]
    fn progress_token_nested_lookup() {
        let request = json!({ "params": { "_meta": { "progressToken": "tok-1" } } });
        assert_eq!(resolve_progress_token(&request), Some(json!("tok-1")));
        let numeric = json!({ "params": { "_meta": { "progressToken": 5 } } });
        assert_eq!(resolve_progress_token(&numeric), Some(json!(5)));
        assert_eq!(resolve_progress_token(&json!({ "params": {} })), None);
        assert_eq!(
            resolve_progress_token(&json!({ "params": { "_meta": { "progressToken": null } } })),
            None
        );
        let notification = progress_notification(json!("tok-1"), 2, "halfway");
        assert_eq!(notification["method"], json!("notifications/progress"));
        assert_eq!(notification["params"]["progress"], json!(2));
    }

    #[test]
    fn jsonrpc_validation_rejects_malformed_requests() {
        assert!(is_valid_jsonrpc_request(&json!({ "jsonrpc": "2.0", "method": "ping" })));
        assert!(!is_valid_jsonrpc_request(&json!({ "method": "ping" })));
        assert!(!is_valid_jsonrpc_request(&json!({ "jsonrpc": "1.0", "method": "ping" })));
        assert!(!is_valid_jsonrpc_request(&json!({ "jsonrpc": "2.0", "method": "" })));
        assert!(!is_valid_jsonrpc_request(&json!([{ "jsonrpc": "2.0", "method": "ping" }])));
        assert!(!is_valid_jsonrpc_request(&json!("ping")));
    }

    #[tokio::test]
    async fn initialize_advertises_capabilities_and_instructions() {
        let request = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} });
        let response =
            handle_request(&request, None, DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All)
                .await;
        assert_eq!(response["jsonrpc"], json!("2.0"));
        assert_eq!(response["id"], json!(1));
        assert_eq!(response["result"]["protocolVersion"], json!(DEFAULT_PROTOCOL_VERSION));
        assert_eq!(response["result"]["serverInfo"]["name"], json!("jait-gateway"));
        assert_eq!(response["result"]["capabilities"]["tools"]["listChanged"], json!(false));
        assert!(response["result"]["instructions"].as_str().unwrap().starts_with("Jait gateway"));
        assert!(response.get("error").is_none());
    }

    #[tokio::test]
    async fn tools_list_filters_by_tool_set() {
        let core = McpToolDescriptor::new("fs.read");
        let mut extra = McpToolDescriptor::new("browser.click");
        extra.core = false;
        let fake = FakeTools::with(vec![core, extra]);
        let request = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });

        let all = handle_request(&request, Some(&fake), DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(all["result"]["tools"].as_array().unwrap().len(), 2);

        let core_only = handle_request(&request, Some(&fake), DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::Core).await;
        let names: Vec<&str> = core_only["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, vec!["fs_read"]);

        let deferred = handle_request(&request, Some(&fake), DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::Deferred).await;
        assert_eq!(deferred["result"]["tools"].as_array().unwrap().len(), 1);

        let none = handle_request(&request, None, DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(none["result"]["tools"], json!([]));
    }

    #[tokio::test]
    async fn tools_call_maps_underscore_name_and_wraps_content() {
        let fake = FakeTools::with(vec![McpToolDescriptor::new("shell.exec")]);
        let response = handle_request(
            &call_request("shell_exec"),
            Some(&fake),
            DEFAULT_PROTOCOL_VERSION,
            &session_ctx(),
            ToolSet::All,
        )
        .await;
        assert_eq!(response["result"]["isError"], json!(false));
        assert_eq!(response["result"]["content"][0]["type"], json!("text"));
        assert_eq!(response["result"]["content"][0]["text"], json!("done"));
        let calls = fake.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "shell.exec", "MCP name maps back to the dotted registry name");
        assert_eq!(calls[0].1["cmd"], json!("ls"));
    }

    #[tokio::test]
    async fn tools_call_unknown_tool_and_tool_set_denial() {
        let mut extra = McpToolDescriptor::new("browser.click");
        extra.core = false;
        let fake = FakeTools::with(vec![extra]);

        let unknown = handle_request(&call_request("nope_nothing"), Some(&fake), DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(unknown["result"]["isError"], json!(true));
        assert!(unknown["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .starts_with("Unknown tool:"));

        let filtered = handle_request(&call_request("browser_click"), Some(&fake), DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::Core).await;
        assert_eq!(filtered["result"]["isError"], json!(true));

        let no_source = handle_request(&call_request("browser_click"), None, DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(no_source["result"]["isError"], json!(true));
    }

    #[tokio::test]
    async fn tools_call_validates_params_and_session() {
        let fake = FakeTools::with(vec![McpToolDescriptor::new("fs.read")]);

        let missing_name = json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {} });
        let response = handle_request(&missing_name, Some(&fake), DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(response["error"]["code"], json!(-32602));

        let bad_args = json!({
            "jsonrpc": "2.0", "id": 4, "method": "tools/call",
            "params": { "name": "fs.read", "arguments": [1, 2] }
        });
        let response = handle_request(&bad_args, Some(&fake), DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(response["error"]["code"], json!(-32602));

        let no_session = McpToolContext { session_id: None, ..Default::default() };
        let response = handle_request(&call_request("fs_read"), Some(&fake), DEFAULT_PROTOCOL_VERSION, &no_session, ToolSet::All).await;
        assert_eq!(response["result"]["isError"], json!(true));
        assert!(response["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("requires a sessionId"));
        assert!(fake.calls.lock().unwrap().is_empty(), "denied calls must not reach the tool");
    }

    #[tokio::test]
    async fn browser_tool_guard_blocks_inferred_session() {
        let mut browser = McpToolDescriptor::new("browser.click");
        browser.category = "browser".to_string();
        let mut start = McpToolDescriptor::new("surfaces.start");
        start.category = "surfaces".to_string();
        let fake = FakeTools::with(vec![browser, start]);

        let inferred = McpToolContext {
            session_id: Some("sess-1".to_string()),
            session_id_inferred: true,
            ..Default::default()
        };
        let response = handle_request(&call_request("browser_click"), Some(&fake), DEFAULT_PROTOCOL_VERSION, &inferred, ToolSet::All).await;
        assert_eq!(response["result"]["isError"], json!(true));
        assert!(response["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("explicit sessionId"));

        let start_browser = json!({
            "jsonrpc": "2.0", "id": 9, "method": "tools/call",
            "params": { "name": "surfaces_start", "arguments": { "type": "browser" } }
        });
        let response = handle_request(&start_browser, Some(&fake), DEFAULT_PROTOCOL_VERSION, &inferred, ToolSet::All).await;
        assert_eq!(response["result"]["isError"], json!(true));

        // Explicit sessions are allowed through.
        let response = handle_request(&call_request("browser_click"), Some(&fake), DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(response["result"]["isError"], json!(false));
    }

    #[tokio::test]
    async fn tool_execution_failure_is_wrapped_not_leaked_as_stack() {
        let fake = FakeTools::failing();
        let response = handle_request(&call_request("shell_exec"), Some(&fake), DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(response["result"]["isError"], json!(true));
        let text = response["result"]["content"][0]["text"].as_str().unwrap();
        assert_eq!(text, "Tool execution error: boom");
        assert!(!text.contains("at Object"), "no host stack frames are echoed");
    }

    #[tokio::test]
    async fn ping_unknown_method_and_cancelled_notification() {
        let ping = json!({ "jsonrpc": "2.0", "id": 11, "method": "ping" });
        let response = handle_request(&ping, None, DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(response["result"], json!({}));

        let unknown = json!({ "jsonrpc": "2.0", "id": 12, "method": "resources/subscribe" });
        let response = handle_request(&unknown, None, DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(response["error"]["code"], json!(-32601));
        assert_eq!(response["error"]["message"], json!("Method not found: resources/subscribe"));

        let cancel = json!({ "jsonrpc": "2.0", "method": "notifications/cancelled", "params": { "requestId": 12 } });
        let response = handle_request(&cancel, None, DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert!(response.is_null(), "notifications are never answered");

        let resources = json!({ "jsonrpc": "2.0", "id": 13, "method": "resources/list" });
        let response = handle_request(&resources, None, DEFAULT_PROTOCOL_VERSION, &session_ctx(), ToolSet::All).await;
        assert_eq!(response["result"]["resources"], json!([]));
    }

    #[tokio::test]
    async fn session_registry_enforces_bounds_and_liveness() {
        let registry = Arc::new(SessionRegistry::new());
        let mut registrations = Vec::new();
        for _ in 0..MAX_SESSIONS {
            registrations.push(registry.register(None).expect("within cap"));
        }
        assert_eq!(registry.len(), MAX_SESSIONS);
        assert!(registry.register(None).is_none(), "over-cap registration is denied");

        let (id, mut rx) = registrations.remove(0);
        assert!(registry.push(&id, "event: message\ndata: {}\n\n".to_string()));
        let frame = rx.recv().await.expect("frame delivered");
        assert!(frame.starts_with("event: message"));

        let guard = SessionGuard { registry: registry.clone(), id: id.clone() };
        drop(guard);
        assert!(!registry.contains(&id), "dropping the stream removes the session");
        assert!(!registry.push(&id, "x".to_string()));
    }

    #[tokio::test]
    async fn auth_denial_is_passed_through_untouched() {
        let state = McpRoutes::new().with_auth(Arc::new(DenyingAuth));
        let response = state
            .authorize(&HeaderMap::new(), &HashMap::new())
            .await
            .expect_err("denial must not yield a context");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let bytes = axum::body::to_bytes(response.into_body(), 4096).await.unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["error"], json!("Authentication required"));
        assert!(!body.to_string().contains("token"), "denial bodies carry no credentials");
    }

    #[tokio::test]
    async fn authorize_falls_back_to_session_header_without_authenticator() {
        let state = McpRoutes::new();
        let mut headers = HeaderMap::new();
        headers.insert("x-jait-session-id", "sess-42".parse().unwrap());
        let context = state.authorize(&headers, &HashMap::new()).await.expect("context");
        assert_eq!(context.session_id.as_deref(), Some("sess-42"));
        assert!(!context.session_id_inferred);
        assert!(!context.action_id.is_empty(), "each call gets a correlation id");
    }

    #[test]
    fn endpoint_url_forwards_context_query_but_not_client_id() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "gateway.local:8787".parse().unwrap());
        let mut query = HashMap::new();
        query.insert("clientId".to_string(), "old".to_string());
        query.insert("toolSet".to_string(), "core".to_string());
        let url = endpoint_url(&headers, "abc", &query);
        assert!(url.starts_with("http://gateway.local:8787/mcp/messages?"));
        assert!(url.contains("clientId=abc"));
        assert!(url.contains("toolSet=core"));
        assert!(!url.contains("clientId=old"));

        let relative = endpoint_url(&HeaderMap::new(), "abc", &HashMap::new());
        assert_eq!(relative, "/mcp/messages?clientId=abc");
    }
}
