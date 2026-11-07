//! Native port of `packages/gateway/src/providers/acp-provider.ts`.
//!
//! The TypeScript provider talks to an agent over the ACP (Agent Client
//! Protocol) JSON-RPC dialect: newline-delimited JSON on the child's
//! stdin/stdout, with an `initialize` → `session/new` → `session/prompt`
//! handshake and interleaved `session/update` notifications.
//!
//! Layering (mirrors the reference, and keeps the pure logic testable without a
//! live process):
//!
//! 1. **Framing** — [`encode_message`] / [`decode_message`] turn NDJSON lines
//!    into [`AcpInbound`] values. Pure.
//! 2. **Mapping** — [`get_acp_tool_name`], [`get_acp_tool_args`],
//!    [`changes_from_acp_content`], … and [`SessionUpdateMapper::map`] turn a
//!    `session/update` payload into [`AcpEvent`]s. Pure.
//! 3. **Transport** — [`AcpTransport`] owns the child process, correlates
//!    responses by JSON-RPC id and implements cancellation.
//!
//! Cancellation: the reference threads an `AbortSignal` through every await.
//! There is no `tokio-util` in this crate, so [`CancelToken`] provides the same
//! contract (level-triggered flag + wakeup) and call sites use
//! `tokio::select!`, which is the direct equivalent of racing a signal.
//!
//! Event shape: the shared [`ProviderEvent`] enum models the Codex CLI subset
//! and has no `thinking` / `session.started` variants, while ACP emits both.
//! [`AcpEvent`] therefore wraps the shared enum (so all common events keep the
//! exact shared representation) and adds only those two extras.

use std::{
    collections::{BTreeMap, HashMap},
    process::Stdio,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tokio::{
    io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::{Notify, mpsc, oneshot, watch},
};

use crate::{providers::codex_event_mapper::ProviderEvent, text::js_trim};

// ---------------------------------------------------------------------------
// Protocol constants
// ---------------------------------------------------------------------------

/// ACP protocol version negotiated in `initialize`.
pub const PROTOCOL_VERSION: u64 = 1;

/// Name of Jait's primary MCP server, as it appears in `mcp__<server>__<tool>`.
pub const JAIT_CORE_MCP_SERVER_NAME: &str = "jait_core";
/// Name of Jait's deferred-tool dispatcher MCP server.
pub const JAIT_DEFERRED_MCP_SERVER_NAME: &str = "jait";

/// Reference: `process.platform === "win32" ? 30_000 : 20_000`.
pub const ACP_PROBE_TIMEOUT_MS_LINUX: u64 = 20_000;
pub const ACP_PROBE_TIMEOUT_MS_WINDOWS: u64 = 30_000;
/// How long to wait for the probe child to die after `SIGTERM`.
pub const ACP_PROBE_CLOSE_TIMEOUT_MS: u64 = 1_000;
/// How long a probed auth status stays cached.
pub const AUTH_STATUS_TTL_MS: u64 = 5 * 60_000;

/// The reference's `ACP_PROBE_TIMEOUT_MS`, resolved for the host platform.
pub fn acp_probe_timeout_ms() -> u64 {
    if cfg!(windows) {
        ACP_PROBE_TIMEOUT_MS_WINDOWS
    } else {
        ACP_PROBE_TIMEOUT_MS_LINUX
    }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/// An event emitted by the ACP provider.
///
/// Common events reuse the shared [`ProviderEvent`] so downstream consumers see
/// one representation regardless of provider; only the ACP-specific extras are
/// modelled here.
#[derive(Clone, Debug, PartialEq)]
pub enum AcpEvent {
    /// Any event the shared enum already models, forwarded unchanged.
    Provider(ProviderEvent),
    /// `agent_thought_chunk` reasoning stream (no shared variant exists).
    Thinking { session_id: String, content: String },
    /// Emitted once the handshake completes.
    SessionStarted { session_id: String },
}

impl From<ProviderEvent> for AcpEvent {
    fn from(event: ProviderEvent) -> Self {
        AcpEvent::Provider(event)
    }
}

impl AcpEvent {
    /// Serialize to the same JSON shape the TypeScript emitter produces.
    ///
    /// Done by hand rather than with a derive: `ProviderEvent` is already
    /// internally tagged, and serde cannot express "flatten this enum into that
    /// enum" in a single derived attribute.
    pub fn to_value(&self) -> Value {
        match self {
            AcpEvent::Provider(event) => serde_json::to_value(event).unwrap_or(Value::Null),
            AcpEvent::Thinking {
                session_id,
                content,
            } => json!({
                "type": "thinking",
                "sessionId": session_id,
                "content": content,
            }),
            AcpEvent::SessionStarted { session_id } => json!({
                "type": "session.started",
                "sessionId": session_id,
            }),
        }
    }
}

impl Serialize for AcpEvent {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.to_value().serialize(serializer)
    }
}

// ---------------------------------------------------------------------------
// JSON-RPC framing
// ---------------------------------------------------------------------------

/// A JSON-RPC id as it appears on the wire.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Hash, Serialize)]
#[serde(untagged)]
pub enum RpcId {
    Num(i64),
    Str(String),
}

impl RpcId {
    /// A stable map key, matching how the reference keys pending requests.
    pub fn key(&self) -> String {
        match self {
            RpcId::Num(value) => value.to_string(),
            RpcId::Str(value) => value.clone(),
        }
    }
}

/// A JSON-RPC error object.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct AcpRpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl std::fmt::Display for AcpRpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} (code {})", self.message, self.code)
    }
}

/// A decoded inbound JSON-RPC frame.
#[derive(Clone, Debug, PartialEq)]
pub enum AcpInbound {
    /// A request from the agent that expects a reply (`id` present).
    Request {
        id: RpcId,
        method: String,
        params: Value,
    },
    /// A notification from the agent (no `id`).
    Notification { method: String, params: Value },
    /// A reply to one of our requests.
    Response {
        id: RpcId,
        result: Result<Value, AcpRpcError>,
    },
}

/// Serialize a message as one NDJSON line, terminator included.
pub fn encode_message(message: &Value) -> String {
    let mut line = serde_json::to_string(message).expect("JSON values always serialize");
    line.push('\n');
    line
}

/// Decode one NDJSON line.
///
/// `Ok(None)` means "blank line, skip it" — the reference's stream reader
/// ignores whitespace-only lines rather than treating them as protocol errors.
/// `Err` carries a human-readable reason and never panics on hostile input.
pub fn decode_message(line: &str) -> Result<Option<AcpInbound>, String> {
    if line.trim().is_empty() {
        return Ok(None);
    }

    let value: Value = serde_json::from_str(line)
        .map_err(|error| format!("ACP provider sent malformed JSON: {error}"))?;
    let Value::Object(object) = value else {
        return Err("ACP provider sent a non-object JSON frame".to_string());
    };

    // `method` present ⇒ request (with id) or notification (without).
    if let Some(Value::String(method)) = object.get("method") {
        let method = method.clone();
        let params = object.get("params").cloned().unwrap_or(Value::Null);

        return match object.get("id") {
            None | Some(Value::Null) => Ok(Some(AcpInbound::Notification { method, params })),
            Some(raw_id) => {
                let id = parse_rpc_id(raw_id)?;
                Ok(Some(AcpInbound::Request { id, method, params }))
            }
        };
    }

    // Otherwise it must be a reply, and replies must carry an id.
    let Some(raw_id) = object.get("id") else {
        return Err("ACP provider sent a frame with neither method nor id".to_string());
    };
    let id = parse_rpc_id(raw_id)?;

    if let Some(error) = object.get("error") {
        return match serde_json::from_value::<AcpRpcError>(error.clone()) {
            Ok(error) => Ok(Some(AcpInbound::Response {
                id,
                result: Err(error),
            })),
            Err(_) => Err("ACP provider sent a malformed JSON-RPC error".to_string()),
        };
    }

    Ok(Some(AcpInbound::Response {
        id,
        result: Ok(object.get("result").cloned().unwrap_or(Value::Null)),
    }))
}

fn parse_rpc_id(raw: &Value) -> Result<RpcId, String> {
    match raw {
        Value::Number(number) => number
            .as_i64()
            .map(RpcId::Num)
            .ok_or_else(|| "ACP provider sent a non-integer JSON-RPC id".to_string()),
        Value::String(text) => Ok(RpcId::Str(text.clone())),
        _ => Err("ACP provider sent an unsupported JSON-RPC id".to_string()),
    }
}

// ---------------------------------------------------------------------------
// Exit / stderr mapping
// ---------------------------------------------------------------------------

/// The reference's `signal ?? code ?? "unknown"` label.
pub fn exit_label(code: Option<i32>, signal: Option<&str>) -> String {
    if let Some(signal) = signal {
        return signal.to_string();
    }
    if let Some(code) = code {
        return code.to_string();
    }
    "unknown".to_string()
}

/// The exact message the reference puts on `session.error` when the child dies
/// without the session having already completed.
pub fn session_exit_error(code: Option<i32>, signal: Option<&str>) -> String {
    format!("ACP provider exited ({})", exit_label(code, signal))
}

/// A stderr chunk is forwarded as an `activity` event only when it is not blank.
pub fn stderr_activity(chunk: &str) -> Option<String> {
    let trimmed = js_trim(chunk);
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

// ---------------------------------------------------------------------------
// Child environment
// ---------------------------------------------------------------------------

/// Variables the reference strips from the inherited environment before handing
/// it to an agent, so a locally exported token cannot silently outrank the
/// provider account's own credentials.
pub const STRIPPED_ENV_VARS: &[&str] = &["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];

/// Build the child environment: inherited vars minus [`STRIPPED_ENV_VARS`],
/// then explicit overrides applied (which may re-add a stripped name only if
/// the caller passes it explicitly).
pub fn build_child_env(
    inherited: &BTreeMap<String, String>,
    overrides: &[(String, String)],
    strip: &[&str],
) -> BTreeMap<String, String> {
    let mut env: BTreeMap<String, String> = inherited
        .iter()
        .filter(|(name, _)| !strip.contains(&name.as_str()))
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect();
    for (name, value) in overrides {
        env.insert(name.clone(), value.clone());
    }
    env
}

/// Serialize an environment map to the ACP `env: [{ name, value }]` shape.
pub fn env_to_acp_array(env: &BTreeMap<String, String>) -> Value {
    Value::Array(
        env.iter()
            .map(|(name, value)| json!({ "name": name, "value": value }))
            .collect(),
    )
}

// ---------------------------------------------------------------------------
// MCP server descriptors
// ---------------------------------------------------------------------------

/// Port of `toAcpMcpServer`.
pub fn to_acp_mcp_server(server: &Value) -> Value {
    let transport = server
        .get("transport")
        .and_then(Value::as_str)
        .unwrap_or("");
    let name = server
        .get("name")
        .cloned()
        .unwrap_or(Value::String(String::new()));

    if transport == "stdio" {
        let args = match server.get("args") {
            Some(Value::Array(items)) => Value::Array(items.clone()),
            _ => Value::Array(Vec::new()),
        };
        return json!({
            "name": name,
            "command": server.get("command").cloned().unwrap_or(Value::String(String::new())),
            "args": args,
            "env": env_to_acp_array(&header_or_env_pairs(server.get("env"))),
        });
    }

    let headers = env_to_acp_array(&header_or_env_pairs(server.get("headers")));
    let url = server
        .get("url")
        .cloned()
        .unwrap_or(Value::String(String::new()));

    if transport == "http" {
        return json!({ "type": "http", "name": name, "url": url, "headers": headers });
    }

    json!({ "type": "sse", "name": name, "url": url, "headers": headers })
}

fn header_or_env_pairs(source: Option<&Value>) -> BTreeMap<String, String> {
    let Some(Value::Object(object)) = source else {
        return BTreeMap::new();
    };
    object
        .iter()
        .filter_map(|(name, value)| {
            value
                .as_str()
                .map(|value| (name.clone(), value.to_string()))
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Content / tool helpers (pure)
// ---------------------------------------------------------------------------

/// Port of `stringifyUnknown`: strings pass through, everything else is JSON.
pub fn stringify_unknown(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => serde_json::to_string(other).unwrap_or_else(|_| other.to_string()),
    }
}

/// Port of `stringifyToolContentItem`.
pub fn stringify_tool_content_item(item: &Value) -> String {
    let Value::Object(record) = item else {
        return stringify_unknown(item);
    };
    if record.get("type").and_then(Value::as_str) == Some("content")
        && let Some(inner) = record.get("content")
    {
        return stringify_tool_content_item(inner);
    }
    if record.get("type").and_then(Value::as_str) == Some("text")
        && let Some(text) = record.get("text").and_then(Value::as_str)
    {
        return text.to_string();
    }
    stringify_unknown(item)
}

/// Port of `stringifyToolContent`: arrays are joined with newlines.
pub fn stringify_tool_content(content: &Value) -> String {
    match content {
        Value::Array(items) => items
            .iter()
            .map(stringify_tool_content_item)
            .collect::<Vec<_>>()
            .join("\n"),
        other => stringify_unknown(other),
    }
}

/// Port of `getAcpContentText`.
///
/// Text is returned verbatim — stream chunks may be whitespace-only or split a
/// word across updates, and concatenation must reconstruct the original text.
pub fn get_acp_content_text(content: &Value) -> String {
    let Value::Object(record) = content else {
        return String::new();
    };
    match record.get("type").and_then(Value::as_str) {
        Some("text") => record
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        Some("content") => match record.get("content") {
            Some(inner) if !inner.is_null() => get_acp_content_text(inner),
            _ => String::new(),
        },
        _ => String::new(),
    }
}

/// Port of `readUpdateStatus`.
pub fn read_update_status(update: &Value) -> Option<String> {
    update
        .get("status")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Port of `hasToolCallMetadata`.
pub fn has_tool_call_metadata(update: &Value) -> bool {
    let Value::Object(record) = update else {
        return false;
    };

    if let Some(Value::Object(raw_input)) = record.get("rawInput")
        && !raw_input.is_empty()
    {
        return true;
    }
    if let Some(Value::Array(locations)) = record.get("locations")
        && !locations.is_empty()
    {
        return true;
    }
    if let Some(Value::Array(content)) = record.get("content")
        && !content.is_empty()
    {
        return true;
    }
    if let Some(title) = record.get("title").and_then(Value::as_str)
        && !js_trim(title).is_empty()
    {
        return true;
    }
    false
}

/// Port of `firstPathFromAcpLocations`.
pub fn first_path_from_acp_locations(locations: &[Value]) -> Option<String> {
    for location in locations {
        let Value::Object(record) = location else {
            continue;
        };
        if let Some(path) = record.get("path").and_then(Value::as_str)
            && !js_trim(path).is_empty()
        {
            return Some(path.to_string());
        }
    }
    None
}

/// Port of `changesFromAcpContent`.
pub fn changes_from_acp_content(content: &[Value]) -> Vec<Value> {
    let mut changes = Vec::new();
    for item in content {
        let Value::Object(record) = item else {
            continue;
        };
        let Some(path) = record.get("path").and_then(Value::as_str) else {
            continue;
        };
        if js_trim(path).is_empty() {
            continue;
        }

        let mut change = Map::new();
        change.insert("path".to_string(), Value::String(path.to_string()));
        change.insert(
            "oldText".to_string(),
            record.get("oldText").cloned().unwrap_or(Value::Null),
        );
        change.insert(
            "newText".to_string(),
            record.get("newText").cloned().unwrap_or(Value::Null),
        );
        let kind = match record.get("_meta") {
            Some(Value::Object(meta)) => meta.get("kind").cloned().unwrap_or(Value::Null),
            _ => Value::Null,
        };
        // `undefined` in the reference: omitted when absent, not `null`.
        if !kind.is_null() {
            change.insert("kind".to_string(), kind);
        }
        changes.push(Value::Object(change));
    }
    changes
}

/// Port of `readUpdateMessage`.
pub fn read_update_message(update: &Value) -> Option<String> {
    let Value::Object(record) = update else {
        return None;
    };
    if let Some(content) = record.get("content")
        && !content.is_null()
    {
        return Some(stringify_tool_content(content));
    }
    if let Some(raw_output) = record.get("rawOutput")
        && !raw_output.is_null()
    {
        return Some(stringify_unknown(raw_output));
    }
    record
        .get("status")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// A recognized Jait MCP dispatch: the normalized tool name plus its arguments.
#[derive(Clone, Debug, PartialEq)]
pub struct JaitMcpCall {
    pub tool: String,
    pub args: Map<String, Value>,
}

/// Strip `mcp__jait_core__` / `mcp__jait__`, mirroring
/// `/^mcp__(?:jait_core|jait)__(.+)$/`.
fn strip_qualified_mcp_title(title: &str) -> Option<String> {
    for prefix in ["mcp__jait_core__", "mcp__jait__"] {
        if let Some(rest) = title.strip_prefix(prefix)
            && !rest.is_empty()
        {
            return Some(rest.to_string());
        }
    }
    None
}

fn record_to_map(value: &Value) -> Option<Map<String, Value>> {
    match value {
        Value::Object(map) => Some(map.clone()),
        _ => None,
    }
}

/// Port of `getAcpJaitMcpCall`.
pub fn get_acp_jait_mcp_call(update: &Value) -> Option<JaitMcpCall> {
    let Value::Object(record) = update else {
        return None;
    };
    let wrapper = record_to_map(record.get("rawInput")?)?;

    let title = match record.get("title") {
        Some(Value::String(title)) => js_trim(title).to_string(),
        _ => String::new(),
    };

    // Shape 3 first: Claude Code calling an already-loaded Jait MCP tool
    // directly. Falling through would overwrite the tool's own `title` argument.
    if let Some(qualified) = strip_qualified_mcp_title(&title) {
        return Some(JaitMcpCall {
            tool: qualified.replace('_', "."),
            args: wrapper,
        });
    }

    let server = wrapper
        .get("server")
        .and_then(Value::as_str)
        .map(js_trim)
        .unwrap_or_default();
    let has_jait_server =
        server == JAIT_CORE_MCP_SERVER_NAME || server == JAIT_DEFERRED_MCP_SERVER_NAME;

    // Codex's code-mode wrapper carries `server`; Claude Code's bridge omits it
    // and reports the outer title as the literal string "mcp".
    if !has_jait_server && title != "mcp" {
        return None;
    }

    let mut raw_tool = match wrapper.get("tool") {
        Some(Value::String(tool)) => js_trim(tool).to_string(),
        _ => String::new(),
    };
    if raw_tool.is_empty() {
        return None;
    }

    if !has_jait_server {
        if let Some(rest) = raw_tool.strip_prefix("jait_core_") {
            raw_tool = rest.to_string();
        } else if let Some(rest) = raw_tool.strip_prefix("jait_") {
            raw_tool = rest.to_string();
        }
    }
    let normalized_tool = raw_tool.replace('_', ".");

    let raw_args = wrapper.get("arguments").or_else(|| wrapper.get("args"));
    match raw_args {
        Some(Value::Object(args)) => {
            return Some(JaitMcpCall {
                tool: normalized_tool,
                args: args.clone(),
            });
        }
        Some(Value::String(text)) => {
            if let Ok(Value::Object(parsed)) = serde_json::from_str::<Value>(text) {
                return Some(JaitMcpCall {
                    tool: normalized_tool,
                    args: parsed,
                });
            }
        }
        _ => {}
    }

    Some(JaitMcpCall {
        tool: normalized_tool,
        args: Map::new(),
    })
}

/// Port of `getAcpToolName`.
pub fn get_acp_tool_name(update: &Value) -> String {
    if let Some(call) = get_acp_jait_mcp_call(update) {
        return call.tool;
    }
    let Value::Object(record) = update else {
        return "tool".to_string();
    };

    let kind = record.get("kind").and_then(Value::as_str);
    if matches!(kind, Some("read") | Some("edit") | Some("search")) {
        return kind.unwrap_or_default().to_string();
    }

    if let Some(title) = record.get("title").and_then(Value::as_str) {
        // Note: the reference returns the untrimmed title here.
        if !js_trim(title).is_empty() {
            return title.to_string();
        }
    }
    // Third-party ACP wrappers skip `title` but set `kind`; prefer it over the
    // opaque toolCallId.
    if let Some(kind) = kind {
        return kind.to_string();
    }
    match record.get("toolCallId").and_then(Value::as_str) {
        Some(call_id) => call_id.to_string(),
        None => "tool".to_string(),
    }
}

/// Port of `getAcpToolArgs`.
pub fn get_acp_tool_args(update: &Value) -> Option<Value> {
    if let Some(call) = get_acp_jait_mcp_call(update) {
        return Some(Value::Object(call.args));
    }
    let Value::Object(record) = update else {
        return None;
    };

    let mut args = match record.get("rawInput") {
        Some(Value::Object(raw_input)) => raw_input.clone(),
        _ => Map::new(),
    };
    let kind = record.get("kind").and_then(Value::as_str);

    if let Some(Value::Array(locations)) = record.get("locations") {
        args.insert("locations".to_string(), Value::Array(locations.clone()));
        if let Some(path) = first_path_from_acp_locations(locations)
            && !matches!(args.get("path"), Some(Value::String(_)))
        {
            args.insert("path".to_string(), Value::String(path));
        }
    }

    if matches!(kind, Some("edit") | Some("read"))
        && let Some(Value::Array(content)) = record.get("content")
    {
        args.insert("content".to_string(), Value::Array(content.clone()));
        let changes = changes_from_acp_content(content);
        if !changes.is_empty() {
            let first = changes[0].clone();
            if let Some(path) = first.get("path").and_then(Value::as_str)
                && !matches!(args.get("path"), Some(Value::String(_)))
            {
                args.insert("path".to_string(), Value::String(path.to_string()));
            }
            if let Some(old_text) = first.get("oldText")
                && !matches!(args.get("search"), Some(Value::String(_)))
            {
                args.insert("search".to_string(), old_text.clone());
            }
            if let Some(new_text) = first.get("newText")
                && !matches!(args.get("replace"), Some(Value::String(_)))
            {
                args.insert("replace".to_string(), new_text.clone());
            }
            args.insert("changes".to_string(), Value::Array(changes));
        }
    }

    if !args.is_empty() {
        if let Some(title) = record.get("title").and_then(Value::as_str)
            && !js_trim(title).is_empty()
        {
            args.insert("title".to_string(), Value::String(title.to_string()));
        }
        if let Some(kind) = kind {
            args.insert("kind".to_string(), Value::String(kind.to_string()));
        }
    }

    if args.is_empty() {
        None
    } else {
        Some(Value::Object(args))
    }
}

/// Port of `isTransientJaitMcpStartupCancellation`.
pub fn is_transient_jait_mcp_startup_cancellation(update: &Value) -> bool {
    let Value::Object(record) = update else {
        return false;
    };
    if record.get("sessionUpdate").and_then(Value::as_str) != Some("tool_call") {
        return false;
    }
    if record.get("status").and_then(Value::as_str) != Some("failed") {
        return false;
    }

    let title = record
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let call_id = record
        .get("toolCallId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let message = read_update_message(update);

    [JAIT_CORE_MCP_SERVER_NAME, JAIT_DEFERRED_MCP_SERVER_NAME]
        .iter()
        .any(|server_name| {
            let identity_matches = title == format!("mcp__{server_name}__startup")
                || call_id == format!("mcp_startup.{}", encode_uri_component(server_name));
            let message_matches = message.as_deref()
                == Some(
                    format!(
                        "[codex-acp forwarded startup error] MCP server `{server_name}` startup was cancelled."
                    )
                    .as_str(),
                );
            identity_matches && message_matches
        })
}

/// Port of `isReplayableStartupEvent`.
pub fn is_replayable_startup_event(event: &ProviderEvent) -> bool {
    let (tool, call_id) = match event {
        ProviderEvent::ToolStart { tool, call_id, .. } => (tool, call_id),
        ProviderEvent::ToolResult { tool, call_id, .. } => (tool, call_id),
        _ => return false,
    };
    [JAIT_CORE_MCP_SERVER_NAME, JAIT_DEFERRED_MCP_SERVER_NAME]
        .iter()
        .any(|server_name| {
            tool == &format!("mcp__{server_name}__startup")
                || call_id == &format!("mcp_startup.{}", encode_uri_component(server_name))
        })
}

/// `encodeURIComponent`, restricted to what a server name can contain.
fn encode_uri_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => encoded.push(byte as char),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

/// Port of `readAcpSessionFailure`.
///
/// Codex negotiates a typed failure extension and reports service failures on
/// `_meta` instead of as assistant text.
pub fn read_acp_session_failure(meta: &Value) -> Option<String> {
    let failure = meta.get("jetbrains")?.get("air")?.get("sessionFailure")?;
    match failure {
        Value::Null => None,
        Value::String(text) => {
            if text.is_empty() {
                None
            } else {
                Some(text.clone())
            }
        }
        Value::Object(record) => match record.get("message").and_then(Value::as_str) {
            Some(message) if !message.is_empty() => Some(message.to_string()),
            _ => Some(stringify_unknown(failure)),
        },
        other => Some(stringify_unknown(other)),
    }
}

/// The exact assistant-text failure older Codex adapters emit with no message id.
pub const CODEX_CAPACITY_ERROR: &str =
    "Selected model is at capacity. Please try a different model.";

/// Port of `findReasoningEffortConfig`: the session config option whose id
/// identifies a reasoning-effort setting.
pub fn find_reasoning_effort_config(config_options: &Value) -> Option<String> {
    let Value::Array(options) = config_options else {
        return None;
    };
    for option in options {
        let Some(config_id) = option.get("configId").and_then(Value::as_str) else {
            continue;
        };
        let lowered = config_id.to_lowercase();
        if lowered.contains("reasoning_effort")
            || lowered.contains("reasoning-effort")
            || lowered == "effort"
        {
            return Some(config_id.to_string());
        }
    }
    None
}

// ---------------------------------------------------------------------------
// session/update mapping
// ---------------------------------------------------------------------------

/// Per-session state the mapper needs: accumulated tool calls plus the context
/// control block that `usage_update` / `available_commands_update` mutate.
#[derive(Debug, Default)]
pub struct SessionUpdateMapper {
    tool_calls: HashMap<String, Value>,
    provider_type: String,
    /// Mirrors `contextControls`: used tokens, context window, commands.
    pub used_tokens: Option<Value>,
    pub context_window: Option<Value>,
    pub commands: Option<Value>,
    /// Set when a typed failure must surface on this turn instead of as text.
    pub turn_error: Option<String>,
}

impl SessionUpdateMapper {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn for_provider(provider_type: &str) -> Self {
        Self {
            provider_type: provider_type.to_string(),
            ..Self::default()
        }
    }

    /// Port of `mergeToolCall`: fold a `tool_call_update` into the stored
    /// `tool_call` so late-arriving identity/argument metadata enriches the card.
    pub fn merge_tool_call(&mut self, update: &Value) -> Value {
        let Value::Object(record) = update else {
            return update.clone();
        };
        let Some(call_id) = record.get("toolCallId").and_then(Value::as_str) else {
            return update.clone();
        };

        let mut merged = match self.tool_calls.get(call_id) {
            Some(Value::Object(existing)) => existing.clone(),
            _ => Map::new(),
        };
        for (key, value) in record {
            if value.is_null() {
                continue;
            }
            merged.insert(key.clone(), value.clone());
        }
        let merged = Value::Object(merged);
        self.tool_calls.insert(call_id.to_string(), merged.clone());
        merged
    }

    /// Validate the agent session before applying an update to this owner's state.
    /// The returned events use the gateway session identity, never the agent's.
    pub fn map_notification(
        &mut self,
        gateway_session_id: &str,
        acp_session_id: &str,
        params: &Value,
    ) -> Result<Vec<AcpEvent>, &'static str> {
        if gateway_session_id.is_empty()
            || acp_session_id.is_empty()
            || params.get("sessionId").and_then(Value::as_str) != Some(acp_session_id)
        {
            return Err("ACP update session mismatch");
        }
        let update = params
            .get("update")
            .filter(|value| value.is_object())
            .ok_or("Invalid ACP session update")?;
        Ok(self.map(gateway_session_id, update))
    }

    /// Route the transport's raw update envelope through session validation.
    /// Other transport events pass through unchanged. The session owner must
    /// serialize calls with prompt settlement and discard this mapper on teardown.
    pub fn route_transport_event(
        &mut self,
        gateway_session_id: &str,
        acp_session_id: &str,
        event: AcpEvent,
    ) -> Result<Vec<AcpEvent>, &'static str> {
        match event {
            AcpEvent::Provider(ProviderEvent::Activity {
                ref kind,
                ref payload,
                ..
            }) if kind == "session/update" => {
                self.map_notification(gateway_session_id, acp_session_id, payload)
            }
            other => Ok(vec![other]),
        }
    }

    /// Port of `handleSessionUpdate`.
    pub fn map(&mut self, session_id: &str, update: &Value) -> Vec<AcpEvent> {
        if is_transient_jait_mcp_startup_cancellation(update) {
            return Vec::new();
        }

        if let Some(failure) = read_acp_session_failure(update.get("_meta").unwrap_or(&Value::Null))
        {
            self.turn_error = Some(failure.clone());
            return vec![AcpEvent::Provider(ProviderEvent::SessionError {
                session_id: session_id.to_string(),
                error: failure,
            })];
        }

        let session_update = update
            .get("sessionUpdate")
            .and_then(Value::as_str)
            .unwrap_or_default();

        let mut events = Vec::new();
        match session_update {
            "agent_message_chunk" => {
                let content = update.get("content").cloned().unwrap_or(Value::Null);
                if content.get("type").and_then(Value::as_str) == Some("text") {
                    let text = content
                        .get("text")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let has_message_id = update
                        .get("messageId")
                        .map(|id| !id.is_null())
                        .unwrap_or(false);
                    if self.provider_type == "codex"
                        && js_trim(&text) == CODEX_CAPACITY_ERROR
                        && !has_message_id
                    {
                        self.turn_error = Some(text.clone());
                        events.push(AcpEvent::Provider(ProviderEvent::SessionError {
                            session_id: session_id.to_string(),
                            error: text,
                        }));
                    } else {
                        events.push(AcpEvent::Provider(ProviderEvent::Token {
                            session_id: session_id.to_string(),
                            content: text,
                        }));
                    }
                }
            }
            "tool_call" => {
                let merged = self.merge_tool_call(update);
                let call_id = update
                    .get("toolCallId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                events.push(AcpEvent::Provider(ProviderEvent::ToolStart {
                    session_id: session_id.to_string(),
                    tool: get_acp_tool_name(&merged),
                    args: get_acp_tool_args(&merged).unwrap_or(Value::Null),
                    call_id: call_id.clone(),
                }));
                if read_update_status(update).as_deref() == Some("failed") {
                    events.push(AcpEvent::Provider(ProviderEvent::ToolResult {
                        session_id: session_id.to_string(),
                        tool: get_acp_tool_name(&merged),
                        ok: false,
                        message: read_update_message(update)
                            .unwrap_or_else(|| "Tool call failed".to_string()),
                        call_id,
                        data: None,
                    }));
                }
            }
            "tool_call_update" => {
                let merged = self.merge_tool_call(update);
                let call_id = update
                    .get("toolCallId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();

                // Re-emit an enriched tool.start so the web upgrades the card.
                if has_tool_call_metadata(update) {
                    events.push(AcpEvent::Provider(ProviderEvent::ToolStart {
                        session_id: session_id.to_string(),
                        tool: get_acp_tool_name(&merged),
                        args: get_acp_tool_args(&merged).unwrap_or(Value::Null),
                        call_id: call_id.clone(),
                    }));
                }
                if let Some(content) = update.get("content")
                    && !content.is_null()
                {
                    events.push(AcpEvent::Provider(ProviderEvent::ToolOutput {
                        session_id: session_id.to_string(),
                        call_id: call_id.clone(),
                        content: stringify_tool_content(content),
                    }));
                }
                let status = read_update_status(update);
                if matches!(status.as_deref(), Some("completed") | Some("failed")) {
                    let raw_output = update
                        .get("rawOutput")
                        .filter(|value| !value.is_null())
                        .cloned();
                    let message = match &raw_output {
                        Some(output) => stringify_tool_content(output),
                        None => status.clone().unwrap_or_default(),
                    };
                    events.push(AcpEvent::Provider(ProviderEvent::ToolResult {
                        session_id: session_id.to_string(),
                        tool: get_acp_tool_name(&merged),
                        ok: status.as_deref() == Some("completed"),
                        message,
                        call_id,
                        data: raw_output,
                    }));
                }
            }
            "plan" => {
                let entries = update
                    .get("entries")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let summary = entries
                    .iter()
                    .map(|entry| {
                        format!(
                            "[{}] {}",
                            entry.get("status").and_then(Value::as_str).unwrap_or(""),
                            entry.get("content").and_then(Value::as_str).unwrap_or("")
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                events.push(AcpEvent::Provider(ProviderEvent::Activity {
                    session_id: session_id.to_string(),
                    kind: "plan".to_string(),
                    summary,
                    payload: Value::Array(entries),
                }));
            }
            "agent_thought_chunk" => {
                let thinking = get_acp_content_text(update.get("content").unwrap_or(&Value::Null));
                if !thinking.is_empty() {
                    events.push(AcpEvent::Thinking {
                        session_id: session_id.to_string(),
                        content: thinking,
                    });
                }
            }
            "available_commands_update" => {
                self.commands = Some(
                    update
                        .get("availableCommands")
                        .and_then(Value::as_array)
                        .map(|commands| {
                            Value::Array(
                                commands
                                    .iter()
                                    .map(|command| {
                                        command.get("name").cloned().unwrap_or(Value::Null)
                                    })
                                    .collect(),
                            )
                        })
                        .unwrap_or(Value::Null),
                );
                events.push(AcpEvent::Provider(ProviderEvent::Activity {
                    session_id: session_id.to_string(),
                    kind: session_update.to_string(),
                    summary: session_update.to_string(),
                    payload: update.clone(),
                }));
            }
            "usage_update" => {
                self.used_tokens = Some(update.get("used").cloned().unwrap_or(Value::Null));
                self.context_window = Some(update.get("size").cloned().unwrap_or(Value::Null));
                events.push(AcpEvent::Provider(ProviderEvent::Activity {
                    session_id: session_id.to_string(),
                    kind: session_update.to_string(),
                    summary: session_update.to_string(),
                    payload: update.clone(),
                }));
            }
            "user_message_chunk"
            | "current_mode_update"
            | "config_option_update"
            | "session_info_update" => {
                events.push(AcpEvent::Provider(ProviderEvent::Activity {
                    session_id: session_id.to_string(),
                    kind: session_update.to_string(),
                    summary: session_update.to_string(),
                    payload: update.clone(),
                }));
            }
            // Unknown update kinds are dropped, exactly as the reference's
            // exhaustive `switch` does.
            _ => {}
        }
        events
    }
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
struct CancelInner {
    flag: AtomicBool,
    notify: Notify,
}

/// The native stand-in for `AbortSignal`.
///
/// Level-triggered: once cancelled it stays cancelled. Await [`Self::cancelled`]
/// inside `tokio::select!` to race an operation against cancellation, which is
/// what the reference does with `signal`.
#[derive(Clone, Debug, Default)]
pub struct CancelToken {
    inner: Arc<CancelInner>,
}

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.inner.flag.store(true, Ordering::SeqCst);
        self.inner.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.inner.flag.load(Ordering::SeqCst)
    }

    pub async fn cancelled(&self) {
        if self.is_cancelled() {
            return;
        }
        loop {
            // Re-check after registering so a cancel between the check and the
            // await is not lost.
            let notified = self.inner.notify.notified();
            if self.is_cancelled() {
                return;
            }
            notified.await;
            if self.is_cancelled() {
                return;
            }
        }
    }
}

/// Run a future, failing if the token is cancelled first.
pub async fn with_cancel<F, T>(token: &CancelToken, future: F) -> Result<T, TransportError>
where
    F: std::future::Future<Output = Result<T, TransportError>>,
{
    tokio::select! {
        biased;
        _ = token.cancelled() => Err(TransportError::Cancelled),
        result = future => result,
    }
}

/// Run a future with a timeout, mirroring the reference's `withTimeout`.
pub async fn with_timeout<F, T>(
    future: F,
    duration: Duration,
    message: &str,
) -> Result<T, TransportError>
where
    F: std::future::Future<Output = T>,
{
    match tokio::time::timeout(duration, future).await {
        Ok(value) => Ok(value),
        Err(_) => Err(TransportError::Timeout(message.to_string())),
    }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/// Errors surfaced by the ACP transport. Messages match the reference strings.
#[derive(Clone, Debug, PartialEq)]
pub enum TransportError {
    /// The probe exceeded its budget.
    Timeout(String),
    /// The caller's `AbortSignal` fired.
    Cancelled,
    /// The child process is gone.
    Exited(String),
    /// The agent answered with a JSON-RPC error.
    Rpc(AcpRpcError),
    /// The child could not be spawned.
    Spawn(String),
    /// The agent did not offer a one-time option for this decision.
    UnsupportedPermissionDecision,
    /// Framing/IO failure.
    Io(String),
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransportError::Timeout(message) => write!(f, "{message}"),
            TransportError::Cancelled => write!(f, "ACP request cancelled"),
            TransportError::Exited(message) => write!(f, "{message}"),
            TransportError::Rpc(error) => write!(f, "{error}"),
            TransportError::Spawn(message) => write!(f, "ACP spawn failed: {message}"),
            TransportError::UnsupportedPermissionDecision => {
                write!(f, "ACP agent did not offer a one-time permission option")
            }
            TransportError::Io(message) => write!(f, "ACP transport error: {message}"),
        }
    }
}

impl std::error::Error for TransportError {}

/// The exact probe-timeout message.
pub fn probe_timeout_message() -> String {
    format!(
        "ACP auth probe timed out after {}s",
        acp_probe_timeout_ms() / 1000
    )
}

/// Static configuration for one ACP-backed provider account.
#[derive(Clone, Debug)]
pub struct AcpProviderConfig {
    pub id: String,
    pub command: String,
    pub args: Vec<String>,
    /// `"codex"` enables the typed-failure extension.
    pub provider_type: String,
    /// Non-gateway execution nodes are rejected in `start_session`.
    pub execution_node_id: Option<String>,
}

/// Options accepted by [`AcpProvider::start_session`].
#[derive(Clone, Debug, Default)]
pub struct StartSessionOptions {
    pub thread_id: String,
    pub working_directory: String,
    pub mode: Option<String>,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub mcp_servers: Vec<Value>,
    pub env: Vec<(String, String)>,
}

#[derive(Default)]
struct PendingState {
    closed: bool,
    waiters: HashMap<RpcId, oneshot::Sender<Result<Value, AcpRpcError>>>,
}
type Pending = Arc<Mutex<PendingState>>;

// A request can be dropped at any await, including while writing to stdin.
// The reader removes completed waiters; this guard handles every other exit.
struct PendingRequest {
    pending: Pending,
    key: RpcId,
}

impl Drop for PendingRequest {
    fn drop(&mut self) {
        let waiter = self
            .pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .waiters
            .remove(&self.key);
        drop(waiter);
    }
}

// A cancelled or failed write may have emitted only part of a JSON frame.
// Permanently close admission so that a later frame cannot extend it.
struct FrameWriteGuard {
    pending: Pending,
    closed: watch::Sender<bool>,
    complete: bool,
}

impl Drop for FrameWriteGuard {
    fn drop(&mut self) {
        if !self.complete {
            let waiters = {
                let mut state = self.pending.lock().unwrap_or_else(|e| e.into_inner());
                state.closed = true;
                std::mem::take(&mut state.waiters)
            };
            self.closed.send_replace(true);
            drop(waiters);
        }
    }
}

// Independently cloneable so agent callbacks can reply while the original
// request awaits its response. The mutex keeps complete frames serialized.
#[derive(Clone)]
struct AcpWriter {
    stdin: Arc<tokio::sync::Mutex<tokio::process::ChildStdin>>,
    pending: Pending,
    closed: watch::Sender<bool>,
    cancel: CancelToken,
}

impl AcpWriter {
    async fn write(&self, message: &Value) -> Result<(), TransportError> {
        let mut closed = self.closed.subscribe();
        let cancel = self.cancel.clone();
        let mut stdin = tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(TransportError::Cancelled),
            _ = closed.wait_for(|is_closed| *is_closed) => return Err(TransportError::Io(
                "ACP connection closed before the response arrived".into(),
            )),
            stdin = self.stdin.lock() => stdin,
        };
        if *closed.borrow()
            || self
                .pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .closed
        {
            return Err(TransportError::Io(
                "ACP connection closed before the response arrived".into(),
            ));
        }
        // Install only after acquiring the mutex: cancellation while waiting for
        // another frame cannot have emitted a partial frame of its own.
        let mut guard = FrameWriteGuard {
            pending: Arc::clone(&self.pending),
            closed: self.closed.clone(),
            complete: false,
        };
        let line = encode_message(message);
        tokio::select! {
            biased;
            _ = cancel.cancelled() => Err(TransportError::Cancelled),
            _ = closed.wait_for(|is_closed| *is_closed) => Err(TransportError::Io(
                "ACP connection closed before the response arrived".into(),
            )),
            result = async {
                stdin.write_all(line.as_bytes()).await?;
                stdin.flush().await
            } => {
                result.map_err(|error| TransportError::Io(error.to_string()))?;
                guard.complete = true;
                Ok(())
            }
        }
    }
}

/// A control path that remains usable while the transport awaits a prompt.
/// The session owner must authenticate and match the session before using it.
#[derive(Clone)]
pub struct AcpControlHandle {
    writer: AcpWriter,
}

impl AcpControlHandle {
    /// Ask the agent to interrupt its current turn; settlement is still required.
    pub async fn interrupt(&self, acp_session_id: &str) -> Result<(), TransportError> {
        if acp_session_id.is_empty() {
            return Err(TransportError::Io("ACP session id is empty".into()));
        }
        self.writer
            .write(&json!({
                "jsonrpc": "2.0", "method": "session/cancel",
                "params": { "sessionId": acp_session_id },
            }))
            .await
    }
}

/// An agent-originated request. The session owner must authorize any effect
/// before replying; receiving a callback does not itself grant permission.
pub struct AcpCallback {
    pub id: RpcId,
    pub method: String,
    pub params: Value,
    writer: AcpWriter,
    replied: bool,
}

/// A permission request validated against the ACP session owned by the caller.
#[derive(Debug, PartialEq)]
pub struct AcpPermissionRequest {
    pub tool_call: Value,
    pub options: Vec<(String, String)>,
}

/// Parse only the permission callback for this session. This performs no
/// authorization: callers must obtain an explicit decision through the owner.
pub fn parse_permission_callback(
    method: &str,
    params: &Value,
    expected_session_id: &str,
) -> Result<AcpPermissionRequest, AcpRpcError> {
    let error = |code, message: &str| AcpRpcError {
        code,
        message: message.into(),
        data: None,
    };
    if method != "session/request_permission" {
        return Err(error(-32601, "Unsupported ACP callback method"));
    }
    if expected_session_id.is_empty()
        || params.get("sessionId").and_then(Value::as_str) != Some(expected_session_id)
    {
        return Err(error(-32602, "ACP callback session mismatch"));
    }
    let tool_call = params
        .get("toolCall")
        .filter(|value| value.is_object())
        .cloned()
        .ok_or_else(|| error(-32602, "Invalid ACP tool call"))?;
    let values = params
        .get("options")
        .and_then(Value::as_array)
        .filter(|values| !values.is_empty())
        .ok_or_else(|| error(-32602, "Invalid ACP permission options"))?;
    let mut options = Vec::with_capacity(values.len());
    for value in values {
        let id = value
            .get("optionId")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| error(-32602, "Invalid ACP permission option"))?;
        let kind = value
            .get("kind")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| error(-32602, "Invalid ACP permission option"))?;
        if options.iter().any(|(existing, _)| existing == id) {
            return Err(error(-32602, "Duplicate ACP permission option"));
        }
        options.push((id.to_owned(), kind.to_owned()));
    }
    Ok(AcpPermissionRequest { tool_call, options })
}

impl AcpCallback {
    /// Consume the callback so a response can be sent at most once.
    pub async fn respond(
        mut self,
        result: Result<Value, AcpRpcError>,
    ) -> Result<(), TransportError> {
        let message = match result {
            Ok(value) => json!({"jsonrpc": "2.0", "id": self.id, "result": value}),
            Err(error) => json!({"jsonrpc": "2.0", "id": self.id, "error": error}),
        };
        self.writer.write(&message).await?;
        self.replied = true;
        Ok(())
    }
}

// A callback may be dropped even before it acquires the writer lock. The agent
// is waiting for its reply, so closing the transport is the only safe recovery.
impl Drop for AcpCallback {
    fn drop(&mut self) {
        if !self.replied {
            drop(FrameWriteGuard {
                pending: Arc::clone(&self.writer.pending),
                closed: self.writer.closed.clone(),
                complete: false,
            });
        }
    }
}

/// Owns pending permission callbacks for one gateway and ACP session pair.
/// The surrounding session must serialize access and cancel these on teardown.
pub struct AcpApprovalOwner {
    gateway_session_id: String,
    acp_session_id: String,
    pending: HashMap<String, (AcpCallback, AcpPermissionRequest)>,
}

impl AcpApprovalOwner {
    pub fn new(gateway_session_id: String, acp_session_id: String) -> Result<Self, &'static str> {
        if gateway_session_id.is_empty() || acp_session_id.is_empty() {
            return Err("Session identities must be nonempty");
        }
        Ok(Self {
            gateway_session_id,
            acp_session_id,
            pending: HashMap::new(),
        })
    }

    /// Admit one callback and create an event for the existing approval path.
    /// Invalid and overloaded callbacks receive errors and never enter the map.
    pub async fn admit(
        &mut self,
        callback: AcpCallback,
    ) -> Result<Option<crate::providers::contracts::ProviderEvent>, TransportError> {
        let parsed =
            parse_permission_callback(&callback.method, &callback.params, &self.acp_session_id);
        let request = match parsed {
            Ok(request) if self.pending.len() < 32 => request,
            Ok(_) => {
                callback
                    .respond(Err(AcpRpcError {
                        code: -32000,
                        message: "ACP approval capacity exceeded".into(),
                        data: None,
                    }))
                    .await?;
                return Ok(None);
            }
            Err(error) => {
                callback.respond(Err(error)).await?;
                return Ok(None);
            }
        };
        let request_id = uuid::Uuid::new_v4().to_string();
        let tool = request
            .tool_call
            .get("title")
            .and_then(Value::as_str)
            .or_else(|| request.tool_call.get("toolCallId").and_then(Value::as_str))
            .unwrap_or("ACP tool")
            .to_string();
        let args = request
            .tool_call
            .get("rawInput")
            .cloned()
            .unwrap_or(Value::Null);
        self.pending.insert(request_id.clone(), (callback, request));
        Ok(Some(
            crate::providers::contracts::ProviderEvent::ToolApprovalRequired {
                session_id: self.gateway_session_id.clone(),
                tool,
                args,
                request_id,
            },
        ))
    }

    /// Resolve only an approval addressed to this gateway session and request.
    /// A missing corresponding option cancels rather than selecting another.
    pub async fn resolve(
        &mut self,
        session_id: &str,
        request_id: &str,
        approved: bool,
    ) -> Result<bool, TransportError> {
        if session_id != self.gateway_session_id {
            return Ok(false);
        }
        let Some((callback, request)) = self.pending.remove(request_id) else {
            return Ok(false);
        };
        let outcome = one_time_permission_outcome(&request, approved);
        let cancelled = outcome["outcome"] == "cancelled";
        callback.respond(Ok(json!({"outcome":outcome}))).await?;
        if cancelled {
            return Err(TransportError::UnsupportedPermissionDecision);
        }
        Ok(true)
    }

    /// Cancel outstanding approvals before ending the owning session.
    pub async fn cancel_all(&mut self) -> Result<(), TransportError> {
        let pending = std::mem::take(&mut self.pending);
        for (_, (callback, _)) in pending {
            callback
                .respond(Ok(json!({"outcome":{"outcome":"cancelled"}})))
                .await?;
        }
        Ok(())
    }
}

// Dropping an owner with unanswered callbacks must not strand the agent or
// the gateway request waiting for it. Closing admission wakes all waiters.
impl Drop for AcpApprovalOwner {
    fn drop(&mut self) {
        if let Some((callback, _)) = self.pending.values().next() {
            drop(FrameWriteGuard {
                pending: Arc::clone(&callback.writer.pending),
                closed: callback.writer.closed.clone(),
                complete: false,
            });
        }
    }
}

// A boolean approval carries no authority to grant future requests. If the
// agent offers only persistent choices, cancel instead of widening consent.
fn one_time_permission_outcome(request: &AcpPermissionRequest, approved: bool) -> Value {
    let kind = if approved {
        "allow_once"
    } else {
        "reject_once"
    };
    match request
        .options
        .iter()
        .find(|(_, candidate)| candidate == kind)
    {
        Some((id, _)) => json!({"outcome":"selected", "optionId":id}),
        None => json!({"outcome":"cancelled"}),
    }
}

/// A live ACP child process plus its request plumbing.
pub struct AcpTransport {
    provider_type: String,
    child: Child,
    writer: AcpWriter,
    pending: Pending,
    closed: watch::Sender<bool>,
    next_id: i64,
    cancel: CancelToken,
    events: mpsc::Sender<AcpEvent>,
    callbacks: Option<mpsc::Receiver<AcpCallback>>,
    /// Aborted on drop so inherited pipe handles cannot leave detached readers.
    _reader: tokio::task::JoinHandle<()>,
    _stderr: tokio::task::JoinHandle<()>,
}

impl Drop for AcpTransport {
    fn drop(&mut self) {
        self._reader.abort();
        self._stderr.abort();
        // The reader no longer runs its normal EOF cleanup after abort. Close
        // admission here too, including for independently cloned writers.
        let waiters = {
            let mut state = self.pending.lock().unwrap_or_else(|e| e.into_inner());
            state.closed = true;
            std::mem::take(&mut state.waiters)
        };
        self.closed.send_replace(true);
        drop(waiters);
    }
}

// Bound each inbound JSON frame before allocating or decoding it. A frame larger
// than this is a terminal protocol error; the connection cannot safely resync.
const ACP_MAX_FRAME_BYTES: u64 = 4 * 1024 * 1024;

async fn read_acp_frame<R: AsyncBufRead + Unpin>(
    reader: &mut R,
) -> std::io::Result<Option<String>> {
    let mut bytes = Vec::new();
    let count = reader
        .take(ACP_MAX_FRAME_BYTES + 1)
        .read_until(b'\n', &mut bytes)
        .await?;
    if count as u64 > ACP_MAX_FRAME_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "ACP stdout frame exceeds 4 MiB",
        ));
    }
    if count == 0 {
        return Ok(None);
    }
    if bytes.last() == Some(&b'\n') {
        bytes.pop();
    }
    if bytes.last() == Some(&b'\r') {
        bytes.pop();
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))
}

// Retain only a prefix of each diagnostic line while draining the rest, so a
// child cannot exhaust memory or block forever on an oversized stderr write.
const ACP_MAX_STDERR_LINE_BYTES: usize = 16 * 1024;

async fn read_stderr_line<R: AsyncBufRead + Unpin>(
    reader: &mut R,
) -> std::io::Result<Option<String>> {
    let mut bytes = Vec::new();
    let mut truncated = false;
    let mut saw_input = false;
    loop {
        let chunk = reader.fill_buf().await?;
        if chunk.is_empty() {
            break;
        }
        saw_input = true;
        let end = chunk.iter().position(|byte| *byte == b'\n');
        let payload_len = end.unwrap_or(chunk.len());
        let retained = payload_len.min(ACP_MAX_STDERR_LINE_BYTES.saturating_sub(bytes.len()));
        bytes.extend_from_slice(&chunk[..retained]);
        truncated |= retained < payload_len;
        let consumed = payload_len + usize::from(end.is_some());
        reader.consume(consumed);
        if end.is_some() {
            break;
        }
    }
    if !saw_input {
        return Ok(None);
    }
    if !truncated && bytes.last() == Some(&b'\r') {
        bytes.pop();
    }
    // Diagnostics are untrusted bytes; replacement decoding keeps draining
    // subsequent lines even when an agent emits invalid UTF-8.
    let mut line = String::from_utf8_lossy(&bytes).into_owned();
    if truncated {
        line.push_str(" [stderr line truncated]");
    }
    Ok(Some(line))
}

impl AcpTransport {
    /// Spawn the agent and start pumping stdout/stderr.
    ///
    /// `cwd` is the session working directory (the reference passes
    /// `options.workingDirectory`, and `process.cwd()` for the auth probe).
    pub fn spawn(
        config: &AcpProviderConfig,
        cwd: &str,
        env: &BTreeMap<String, String>,
    ) -> Result<(Self, mpsc::Receiver<AcpEvent>, CancelToken), TransportError> {
        let mut command = Command::new(&config.command);
        command
            .args(&config.args)
            .current_dir(cwd)
            .env_clear()
            .envs(env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = command
            .spawn()
            .map_err(|error| TransportError::Spawn(error.to_string()))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| TransportError::Spawn("ACP child has no stdin".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| TransportError::Spawn("ACP child has no stdout".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| TransportError::Spawn("ACP child has no stderr".to_string()))?;

        let pending: Pending = Arc::new(Mutex::new(PendingState::default()));
        let (closed, _) = watch::channel(false);
        // One extra slot is reserved for an explicit terminal overload event.
        // Protocol events never wait here: the reader must keep processing
        // responses and callbacks, or fail the connection visibly.
        let (event_tx, event_rx) = mpsc::channel(65);
        let mut overload_slot = Some(
            event_tx
                .clone()
                .try_reserve_owned()
                .expect("empty ACP event queue"),
        );
        let cancel = CancelToken::new();
        let writer = AcpWriter {
            stdin: Arc::new(tokio::sync::Mutex::new(stdin)),
            pending: Arc::clone(&pending),
            closed: closed.clone(),
            cancel: cancel.clone(),
        };
        let reader_writer = writer.clone();
        // Never await a full callback queue in the stdout reader: that would
        // prevent it from processing replies and deadlock in-flight requests.
        let (callback_tx, callback_rx) = mpsc::channel(32);

        let reader_pending = Arc::clone(&pending);
        let reader_closed = closed.clone();
        let reader_events = event_tx.clone();
        let reader_cancel = cancel.clone();
        let reader = tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            loop {
                match read_acp_frame(&mut reader).await {
                    Ok(Some(line)) => match decode_message(&line) {
                        Ok(Some(AcpInbound::Response { id, result })) => {
                            let waiter = reader_pending
                                .lock()
                                .expect("pending map poisoned")
                                .waiters
                                .remove(&id);
                            if let Some(waiter) = waiter {
                                let _ = waiter.send(result);
                            }
                        }
                        Ok(Some(AcpInbound::Notification { method, params })) => {
                            if method == "session/update" {
                                // Routed by the provider layer, which owns the
                                // per-session mapper.
                                if reader_events
                                    .try_send(AcpEvent::Provider(ProviderEvent::Activity {
                                        session_id: params
                                            .get("sessionId")
                                            .and_then(Value::as_str)
                                            .unwrap_or_default()
                                            .to_string(),
                                        kind: "session/update".to_string(),
                                        summary: "session/update".to_string(),
                                        payload: params,
                                    }))
                                    .is_err()
                                {
                                    if let Some(slot) = overload_slot.take() {
                                        slot.send(AcpEvent::Provider(ProviderEvent::SessionError {
                                            session_id: String::new(),
                                            error: "ACP event receiver unavailable or capacity exceeded".into(),
                                        }));
                                    }
                                    break;
                                }
                            }
                        }
                        Ok(Some(AcpInbound::Request { id, method, params })) => {
                            let callback = AcpCallback {
                                id,
                                method,
                                params,
                                writer: reader_writer.clone(),
                                replied: false,
                            };
                            if callback_tx.try_send(callback).is_err() {
                                // Overload or a lost owner makes further progress
                                // impossible; closing wakes every pending request.
                                if let Some(slot) = overload_slot.take() {
                                    slot.send(AcpEvent::Provider(ProviderEvent::SessionError {
                                        session_id: String::new(),
                                        error: "ACP callback receiver unavailable or full".into(),
                                    }));
                                }
                                break;
                            }
                        }
                        Ok(None) => {}
                        Err(error) => {
                            if reader_events
                                .try_send(AcpEvent::Provider(ProviderEvent::SessionError {
                                    session_id: String::new(),
                                    error,
                                }))
                                .is_err()
                            {
                                if let Some(slot) = overload_slot.take() {
                                    slot.send(AcpEvent::Provider(ProviderEvent::SessionError {
                                        session_id: String::new(),
                                        error:
                                            "ACP event receiver unavailable or capacity exceeded"
                                                .into(),
                                    }));
                                }
                                break;
                            }
                        }
                    },
                    Ok(None) => break,
                    Err(error) => {
                        if !reader_cancel.is_cancelled()
                            && let Some(slot) = overload_slot.take()
                        {
                            slot.send(AcpEvent::Provider(ProviderEvent::SessionError {
                                session_id: String::new(),
                                error: format!("ACP stdout read failed: {error}"),
                            }));
                        }
                        break;
                    }
                }
            }
            // Close admission and detach all waiters under one lock. Dropping the
            // senders wakes requests already waiting for a response.
            let waiters = {
                let mut state = reader_pending.lock().unwrap_or_else(|e| e.into_inner());
                state.closed = true;
                std::mem::take(&mut state.waiters)
            };
            reader_closed.send_replace(true);
            drop(waiters);
        });

        let stderr_events = event_tx.clone();
        let stderr_cancel = cancel.clone();
        let mut stderr_closed = closed.subscribe();
        let stderr_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            loop {
                let line = tokio::select! {
                    biased;
                    _ = stderr_cancel.cancelled() => break,
                    _ = stderr_closed.wait_for(|closed| *closed) => break,
                    result = read_stderr_line(&mut reader) => match result {
                        Ok(Some(line)) => line,
                        _ => break,
                    },
                };
                // stderr chunks surface as `activity` events, trimmed.
                if let Some(summary) = stderr_activity(&line) {
                    let event = AcpEvent::Provider(ProviderEvent::Activity {
                        session_id: String::new(),
                        kind: "stderr".to_string(),
                        summary,
                        payload: Value::Null,
                    });
                    tokio::select! {
                        biased;
                        _ = stderr_cancel.cancelled() => break,
                        _ = stderr_closed.wait_for(|closed| *closed) => break,
                        result = stderr_events.send(event) => if result.is_err() { break; },
                    }
                }
            }
        });

        Ok((
            Self {
                provider_type: config.provider_type.clone(),
                child,
                writer,
                pending,
                closed,
                next_id: 0,
                cancel: cancel.clone(),
                events: event_tx,
                callbacks: Some(callback_rx),
                _reader: reader,
                _stderr: stderr_task,
            },
            event_rx,
            cancel,
        ))
    }

    /// Take the single callback receiver before starting an in-flight request.
    /// The session owner is responsible for routing and resolving callbacks.
    pub fn take_callbacks(&mut self) -> Option<mpsc::Receiver<AcpCallback>> {
        self.callbacks.take()
    }

    pub fn event_sender(&self) -> mpsc::Sender<AcpEvent> {
        self.events.clone()
    }

    /// Obtain a separate control path before borrowing the transport for a turn.
    pub fn control_handle(&self) -> AcpControlHandle {
        AcpControlHandle {
            writer: self.writer.clone(),
        }
    }

    pub fn cancel_token(&self) -> CancelToken {
        self.cancel.clone()
    }

    /// Write one frame and flush. Framing is one JSON object per line.
    async fn write(&self, message: &Value) -> Result<(), TransportError> {
        self.writer.write(message).await
    }

    /// Send a request and await its response, aborting on cancellation.
    pub async fn request(&mut self, method: &str, params: Value) -> Result<Value, TransportError> {
        self.next_id += 1;
        let id = RpcId::Num(self.next_id);
        let (tx, rx) = oneshot::channel();
        {
            let mut state = self.pending.lock().expect("pending map poisoned");
            if state.closed {
                return Err(TransportError::Io(
                    "ACP connection closed before the response arrived".to_string(),
                ));
            }
            state.waiters.insert(id.clone(), tx);
        }
        let _pending_request = PendingRequest {
            pending: Arc::clone(&self.pending),
            key: id.clone(),
        };

        self.write(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }))
        .await?;

        let cancel = self.cancel.clone();
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                Err(TransportError::Cancelled)
            }
            response = rx => match response {
                Ok(Ok(value)) => Ok(value),
                Ok(Err(error)) => Err(TransportError::Rpc(error)),
                Err(_) => Err(TransportError::Io(
                    "ACP connection closed before the response arrived".to_string(),
                )),
            },
        }
    }

    /// Send a notification (no response expected).
    pub async fn notify(&mut self, method: &str, params: Value) -> Result<(), TransportError> {
        self.write(&json!({ "jsonrpc": "2.0", "method": method, "params": params }))
            .await
    }

    /// `initialize` with the capabilities the reference negotiates.
    pub async fn initialize(&mut self, provider_type: &str) -> Result<Value, TransportError> {
        let mut capabilities = json!({
            "fs": { "readTextFile": false, "writeTextFile": false },
            // Shell work must go through the always-visible jait.terminal tool.
            "terminal": false,
        });
        if provider_type == "codex" {
            // Codex ACP otherwise serializes service failures as assistant text.
            capabilities["_meta"] = json!({
                "jetbrains": { "air": { "version": 1, "capabilities": ["sessionFailure"] } }
            });
        }
        self.request(
            "initialize",
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "clientInfo": { "name": "Jait", "version": "0.1" },
                "clientCapabilities": capabilities,
            }),
        )
        .await
    }

    /// Terminate the child; bounded so a wedged agent cannot hang shutdown.
    pub async fn shutdown(&mut self) {
        self.cancel.cancel();
        let _ = tokio::time::timeout(Duration::from_millis(ACP_PROBE_CLOSE_TIMEOUT_MS), async {
            let _ = self.child.kill().await;
            let _ = self.child.wait().await;
        })
        .await;
        // Descendants can inherit the pipes after the direct child exits. Do not
        // leave their readers running after explicit shutdown, and wake anyone
        // observing the connection's closed state.
        self._reader.abort();
        self._stderr.abort();
        let waiters = {
            let mut state = self.pending.lock().unwrap_or_else(|e| e.into_inner());
            state.closed = true;
            std::mem::take(&mut state.waiters)
        };
        self.closed.send_replace(true);
        drop(waiters);
    }

    /// Await exit and produce the terminal event.
    ///
    /// Returns `None` when the session had already completed, matching the
    /// reference's early return from its `exit` handler.
    pub async fn wait_exit(
        &mut self,
        session_id: &str,
        already_completed: bool,
    ) -> Option<AcpEvent> {
        let status = self.child.wait().await.ok()?;
        if already_completed {
            return Some(AcpEvent::Provider(ProviderEvent::SessionCompleted {
                session_id: session_id.to_string(),
            }));
        }
        Some(AcpEvent::Provider(ProviderEvent::SessionError {
            session_id: session_id.to_string(),
            error: session_exit_error(status.code(), None),
        }))
    }
}

/// A single prompt owned together with its transport, callbacks and cleanup.
/// The caller must authenticate the session pair before constructing this owner.
/// A fresh owner is required for each turn: ACP updates have no turn identifier.
pub struct AcpSessionOwner {
    controls: mpsc::Sender<OwnerControl>,
    stop: CancelToken,
    task: Option<tokio::task::JoinHandle<AcpTurnSettlement>>,
}

/// Completion is returned only after callback and child teardown has finished.
#[derive(Debug)]
pub struct AcpTurnSettlement {
    pub turn_id: String,
    pub result: Result<Value, String>,
}

#[derive(Debug)]
pub struct AcpOwnedEvent {
    pub turn_id: String,
    pub event: AcpOwnerEvent,
}

#[derive(Debug)]
pub enum AcpOwnerEvent {
    Update(AcpEvent),
    Approval(crate::providers::contracts::ProviderEvent),
}

enum OwnerControl {
    Interrupt(oneshot::Sender<Result<(), String>>),
    Approval {
        session_id: String,
        request_id: String,
        approved: bool,
        reply: oneshot::Sender<Result<bool, String>>,
    },
}

impl AcpSessionOwner {
    /// Start one prompt on an initialized transport and established ACP session.
    /// Event consumers must keep up; overflow terminates the turn and child.
    pub fn start(
        mut transport: AcpTransport,
        mut transport_events: mpsc::Receiver<AcpEvent>,
        gateway_session_id: String,
        acp_session_id: String,
        turn_id: String,
        prompt: Value,
    ) -> Result<(Self, mpsc::Receiver<AcpOwnedEvent>), &'static str> {
        if turn_id.is_empty() {
            return Err("Turn identity must be nonempty");
        }
        let mut approvals =
            AcpApprovalOwner::new(gateway_session_id.clone(), acp_session_id.clone())?;
        let mut callbacks = transport
            .take_callbacks()
            .ok_or("ACP callback receiver already taken")?;
        let control = transport.control_handle();
        let (controls, mut control_rx) = mpsc::channel(32);
        let (event_tx, event_rx) = mpsc::channel(64);
        let stop = CancelToken::new();
        let task_stop = stop.clone();
        let task = tokio::spawn(async move {
            let mut mapper = SessionUpdateMapper::for_provider(&transport.provider_type);
            let result = {
                let prompt_request = transport.request(
                    "session/prompt",
                    json!({
                        "sessionId": acp_session_id, "prompt": prompt,
                    }),
                );
                tokio::pin!(prompt_request);
                loop {
                    tokio::select! {
                        _ = task_stop.cancelled() => break Err("ACP owner stopped".to_string()),
                        event = transport_events.recv() => {
                            let Some(event) = event else { break Err("ACP event stream closed".into()); };
                            match mapper.route_transport_event(&gateway_session_id, &acp_session_id, event) {
                                Ok(events) => {
                                    let mut overflow = false;
                                    for event in events {
                                        if event_tx.try_send(AcpOwnedEvent { turn_id: turn_id.clone(), event: AcpOwnerEvent::Update(event) }).is_err() {
                                            overflow = true;
                                            break;
                                        }
                                    }
                                    if overflow {
                                        break Err("ACP owner event capacity exceeded or receiver closed".into());
                                    }
                                }
                                Err(error) => break Err(error.into()),
                            }
                        }
                        callback = callbacks.recv() => {
                            let Some(callback) = callback else { break Err("ACP callback stream closed".into()); };
                            match tokio::time::timeout(Duration::from_secs(1), approvals.admit(callback)).await {
                                Ok(Ok(Some(event))) => {
                                    if event_tx.try_send(AcpOwnedEvent { turn_id: turn_id.clone(), event: AcpOwnerEvent::Approval(event) }).is_err() {
                                        break Err("ACP owner event capacity exceeded or receiver closed".into());
                                    }
                                }
                                Ok(Ok(None)) => {}
                                Ok(Err(error)) => break Err(error.to_string()),
                                Err(_) => break Err("ACP callback reply timed out".into()),
                            }
                        }
                        command = control_rx.recv() => {
                            let Some(command) = command else { break Err("ACP owner controls closed".into()); };
                            match command {
                                OwnerControl::Interrupt(reply) => {
                                    let result = tokio::time::timeout(Duration::from_secs(1), control.interrupt(&acp_session_id)).await
                                        .map_err(|_| "ACP interrupt timed out".to_string())
                                        .and_then(|result| result.map_err(|error| error.to_string()));
                                    let failed = result.is_err();
                                    let _ = reply.send(result);
                                    if failed { break Err("ACP interrupt failed".into()); }
                                }
                                OwnerControl::Approval { session_id, request_id, approved, reply } => {
                                    let result = tokio::time::timeout(Duration::from_secs(1), approvals.resolve(&session_id, &request_id, approved)).await
                                        .map_err(|_| "ACP approval reply timed out".to_string())
                                        .and_then(|result| result.map_err(|error| error.to_string()));
                                    let failed = result.is_err();
                                    let _ = reply.send(result);
                                    if failed { break Err("ACP approval reply failed".into()); }
                                }
                            }
                        }
                        result = &mut prompt_request => {
                            // The reader queues notifications before delivering a later
                            // response. Drain that queue before publishing settlement.
                            let mut failure = None;
                            let mut drained = 0;
                            while let Ok(event) = transport_events.try_recv() {
                                drained += 1;
                                if drained > 64 {
                                    failure = Some("ACP owner settlement event limit exceeded".to_string());
                                    break;
                                }
                                match mapper.route_transport_event(&gateway_session_id, &acp_session_id, event) {
                                    Ok(events) => for event in events {
                                        if event_tx.try_send(AcpOwnedEvent { turn_id: turn_id.clone(), event: AcpOwnerEvent::Update(event) }).is_err() {
                                            failure = Some("ACP owner event capacity exceeded or receiver closed".to_string());
                                            break;
                                        }
                                    },
                                    Err(error) => failure = Some(error.to_string()),
                                }
                                if failure.is_some() { break; }
                            }
                            break match failure { Some(error) => Err(error), None => result.map_err(|error| error.to_string()) };
                        }
                    }
                }
            };
            // A timeout or dropped reply closes the writer through callback guards.
            let _ = tokio::time::timeout(Duration::from_secs(1), approvals.cancel_all()).await;
            drop(approvals);
            transport.shutdown().await;
            AcpTurnSettlement { turn_id, result }
        });
        Ok((
            Self {
                controls,
                stop,
                task: Some(task),
            },
            event_rx,
        ))
    }

    pub async fn interrupt(&self) -> Result<(), String> {
        let (reply, result) = oneshot::channel();
        self.controls
            .try_send(OwnerControl::Interrupt(reply))
            .map_err(|_| "ACP owner control queue unavailable".to_string())?;
        result.await.map_err(|_| "ACP owner stopped".to_string())?
    }

    pub async fn resolve_approval(
        &self,
        session_id: String,
        request_id: String,
        approved: bool,
    ) -> Result<bool, String> {
        let (reply, result) = oneshot::channel();
        self.controls
            .try_send(OwnerControl::Approval {
                session_id,
                request_id,
                approved,
                reply,
            })
            .map_err(|_| "ACP owner control queue unavailable".to_string())?;
        result.await.map_err(|_| "ACP owner stopped".to_string())?
    }

    /// Cancellation bypasses the control queue. Await settlement to observe cleanup.
    pub fn cancel(&self) {
        self.stop.cancel();
    }

    pub async fn settle(mut self) -> Result<AcpTurnSettlement, String> {
        self.task
            .take()
            .expect("owner task exists")
            .await
            .map_err(|error| error.to_string())
    }
}

impl Drop for AcpSessionOwner {
    fn drop(&mut self) {
        self.stop.cancel();
    }
}

/// The provider-level entry point.
pub struct AcpProvider {
    pub config: AcpProviderConfig,
    auth_cache: Mutex<Option<(String, Instant)>>,
}

impl AcpProvider {
    pub fn new(config: AcpProviderConfig) -> Self {
        Self {
            config,
            auth_cache: Mutex::new(None),
        }
    }

    /// Non-gateway execution nodes cannot host a local agent process.
    pub fn ensure_local(&self) -> Result<(), String> {
        match self.config.execution_node_id.as_deref() {
            Some(node) if node != "gateway" => Err(format!(
                "Provider account {} must run on device {}",
                self.config.id, node
            )),
            _ => Ok(()),
        }
    }

    /// Cached `authenticated`/`unauthenticated` verdict with a TTL.
    pub fn cached_auth_status(&self) -> Option<String> {
        let guard = self.auth_cache.lock().expect("auth cache poisoned");
        guard.as_ref().and_then(|(status, expires_at)| {
            if *expires_at > Instant::now() {
                Some(status.clone())
            } else {
                None
            }
        })
    }

    pub fn store_auth_status(&self, status: &str) {
        let mut guard = self.auth_cache.lock().expect("auth cache poisoned");
        *guard = Some((
            status.to_string(),
            Instant::now() + Duration::from_millis(AUTH_STATUS_TTL_MS),
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn supervised_owner_routes_approval_and_interrupt_during_prompt() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r prompt; printf '%s\n' '{"jsonrpc":"2.0","id":"cb","method":"session/request_permission","params":{"sessionId":"agent","toolCall":{"title":"Run"},"options":[{"optionId":"yes","kind":"allow_once"}]}}'; IFS= read -r approval; IFS= read -r interrupt; printf '{"jsonrpc":"2.0","id":1,"result":{"approval":%s,"interrupt":%s}}\n' "$approval" "$interrupt"; IFS= read -r keep_open"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (transport, events, _) = AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let (owner, mut events) = AcpSessionOwner::start(
            transport,
            events,
            "gateway".into(),
            "agent".into(),
            "turn-1".into(),
            json!([]),
        )
        .unwrap();
        let event = tokio::time::timeout(Duration::from_secs(3), events.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(event.turn_id, "turn-1");
        let AcpOwnerEvent::Approval(
            crate::providers::contracts::ProviderEvent::ToolApprovalRequired { request_id, .. },
        ) = event.event
        else {
            panic!("expected approval")
        };
        assert!(
            !owner
                .resolve_approval("other".into(), request_id.clone(), true)
                .await
                .unwrap()
        );
        assert!(
            owner
                .resolve_approval("gateway".into(), request_id, true)
                .await
                .unwrap()
        );
        owner.interrupt().await.unwrap();
        let settled = tokio::time::timeout(Duration::from_secs(3), owner.settle())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(settled.turn_id, "turn-1");
        let result = settled.result.unwrap();
        assert_eq!(result["approval"]["result"]["outcome"]["optionId"], "yes");
        assert_eq!(result["interrupt"]["method"], "session/cancel");
    }

    #[tokio::test]
    async fn supervised_owner_rejects_mismatched_update_and_cleans_up() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r prompt; printf '%s\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"other","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"wrong"}}}}'; IFS= read -r keep_open"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (transport, events, _) = AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let (owner, mut events) = AcpSessionOwner::start(
            transport,
            events,
            "gateway".into(),
            "agent".into(),
            "turn-2".into(),
            json!([]),
        )
        .unwrap();
        let settled = tokio::time::timeout(Duration::from_secs(3), owner.settle())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(settled.result.unwrap_err(), "ACP update session mismatch");
        assert!(events.recv().await.is_none());
    }

    #[test]
    fn notification_checks_session_before_mutating_mapper() {
        let mut mapper = SessionUpdateMapper::new();
        let params = json!({"sessionId":"other", "update":{
            "sessionUpdate":"usage_update", "used":123, "size":456
        }});
        assert!(
            mapper
                .map_notification("gateway", "agent", &params)
                .is_err()
        );
        assert!(mapper.used_tokens.is_none());
        assert!(mapper.map_notification("gateway", "", &params).is_err());
        assert!(
            mapper
                .map_notification("gateway", "agent", &json!({"sessionId":"agent"}))
                .is_err()
        );
        let valid = json!({"sessionId":"agent", "update":{
            "sessionUpdate":"agent_message_chunk", "content":{"type":"text", "text":"hello"}
        }});
        let events = mapper.map_notification("gateway", "agent", &valid).unwrap();
        assert!(
            events
                .iter()
                .any(|event| event.to_value()["sessionId"] == "gateway")
        );
    }

    #[tokio::test]
    async fn transport_updates_are_validated_before_mapping() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r request; printf '%s\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"other","update":{"sessionUpdate":"usage_update","used":123,"size":456}}}' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"agent","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"hello"}}}}' '{"jsonrpc":"2.0","id":1,"result":{}}'; sleep 1"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (mut transport, mut events, _) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let task = tokio::spawn(async move {
            let result = transport
                .request("session/prompt", json!({"sessionId":"agent"}))
                .await;
            transport.shutdown().await;
            result
        });
        let mut mapper = SessionUpdateMapper::new();
        let first = tokio::time::timeout(Duration::from_secs(2), events.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(
            mapper
                .route_transport_event("gateway", "agent", first)
                .is_err()
        );
        assert!(mapper.used_tokens.is_none());
        let second = tokio::time::timeout(Duration::from_secs(2), events.recv())
            .await
            .unwrap()
            .unwrap();
        let mapped = mapper
            .route_transport_event("gateway", "agent", second)
            .unwrap();
        assert!(
            mapped
                .iter()
                .any(|event| event.to_value()["sessionId"] == "gateway")
        );
        assert!(
            tokio::time::timeout(Duration::from_secs(2), task)
                .await
                .unwrap()
                .unwrap()
                .is_ok()
        );
    }

    #[test]
    fn permission_callback_requires_matching_session_and_valid_options() {
        let params = json!({"sessionId":"agent-session", "toolCall":{"toolCallId":"t"},
            "options":[{"optionId":"yes","kind":"allow_once"},{"optionId":"no","kind":"reject_once"}]});
        let request =
            parse_permission_callback("session/request_permission", &params, "agent-session")
                .unwrap();
        assert_eq!(request.options.len(), 2);
        assert!(parse_permission_callback("session/request_permission", &params, "other").is_err());
        assert!(parse_permission_callback("session/request_permission", &params, "").is_err());
        assert_eq!(
            parse_permission_callback("terminal/create", &params, "agent-session")
                .unwrap_err()
                .code,
            -32601
        );
        let mut invalid = params.clone();
        invalid["options"][1]["optionId"] = json!("yes");
        assert!(
            parse_permission_callback("session/request_permission", &invalid, "agent-session")
                .is_err()
        );
        invalid["options"] = json!([]);
        assert!(
            parse_permission_callback("session/request_permission", &invalid, "agent-session")
                .is_err()
        );
    }

    #[tokio::test]
    async fn oversized_stdout_frame_closes_pending_requests() {
        let script = "read request; head -c 4194305 /dev/zero | tr '\\0' x; sleep 2";
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec!["-c".into(), script.into()],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, mut events, _) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let result =
            tokio::time::timeout(Duration::from_secs(5), transport.request("test", json!({})))
                .await
                .expect("oversized frame left request pending");
        assert!(matches!(result, Err(TransportError::Io(_))));
        assert!(
            matches!(events.recv().await, Some(AcpEvent::Provider(ProviderEvent::SessionError { error, .. })) if error.contains("frame exceeds 4 MiB"))
        );
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn raw_event_pressure_fails_connection_with_terminal_error() {
        let script = r#"read request; i=0; while [ "$i" -lt 65 ]; do printf '%s\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s"}}'; i=$((i+1)); done; sleep 5"#;
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec!["-c".into(), script.into()],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, mut events, _) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let result =
            tokio::time::timeout(Duration::from_secs(3), transport.request("test", json!({})))
                .await
                .expect("request hung under pressure");
        assert!(matches!(result, Err(TransportError::Io(_))));
        for _ in 0..64 {
            assert!(matches!(
                events.recv().await,
                Some(AcpEvent::Provider(ProviderEvent::Activity { .. }))
            ));
        }
        assert!(
            matches!(events.recv().await, Some(AcpEvent::Provider(ProviderEvent::SessionError { error, .. })) if error.contains("capacity exceeded"))
        );
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn raw_event_pressure_preserves_callback_and_response_before_limit() {
        let script = r#"read request; i=0; while [ "$i" -lt 63 ]; do printf '%s\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s"}}'; i=$((i+1)); done; printf '%s\n' '{"jsonrpc":"2.0","id":"approval","method":"session/request_permission","params":{}}'; read reply; printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}'; sleep 1"#;
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec!["-c".into(), script.into()],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, _) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let mut callbacks = transport.take_callbacks().unwrap();
        let task = tokio::spawn(async move {
            let result = transport.request("test", json!({})).await;
            transport.shutdown().await;
            result
        });
        let callback = tokio::time::timeout(Duration::from_secs(3), callbacks.recv())
            .await
            .expect("callback blocked by events")
            .unwrap();
        callback.respond(Ok(json!({}))).await.unwrap();
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(3), task)
                .await
                .unwrap()
                .unwrap()
                .unwrap(),
            json!({"ok":true})
        );
    }

    #[tokio::test]
    async fn oversized_stderr_is_drained_and_following_line_is_delivered() {
        let script =
            r#"head -c 1048576 /dev/zero | tr '\0' x >&2; printf '\nafter\n' >&2; exec sleep 5"#;
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec!["-c".into(), script.into()],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, mut events, _) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let first = tokio::time::timeout(Duration::from_secs(5), events.recv())
            .await
            .expect("oversized stderr blocked")
            .unwrap();
        assert!(
            matches!(first, AcpEvent::Provider(ProviderEvent::Activity { summary, .. }) if summary.len() == ACP_MAX_STDERR_LINE_BYTES + " [stderr line truncated]".len() && summary.ends_with(" [stderr line truncated]"))
        );
        let second = tokio::time::timeout(Duration::from_secs(5), events.recv())
            .await
            .expect("following stderr line blocked")
            .unwrap();
        assert!(
            matches!(second, AcpEvent::Provider(ProviderEvent::Activity { summary, .. }) if summary == "after")
        );
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn invalid_utf8_stderr_does_not_stop_following_diagnostics() {
        let input = &b"bad\xff\nafter\n"[..];
        let mut reader = BufReader::new(input);
        assert_eq!(
            read_stderr_line(&mut reader).await.unwrap().as_deref(),
            Some("bad\u{fffd}")
        );
        assert_eq!(
            read_stderr_line(&mut reader).await.unwrap().as_deref(),
            Some("after")
        );
        assert!(read_stderr_line(&mut reader).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn cancellation_interrupts_unterminated_stderr_read() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec!["-c".into(), "printf partial >&2; exec sleep 5".into()],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        cancel.cancel();
        tokio::time::timeout(Duration::from_secs(3), async {
            while !transport._stderr.is_finished() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("stderr read ignored cancellation");
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn raw_event_pressure_cancellation_releases_blocked_stderr() {
        let script = r#"while :; do printf '%s\n' diagnostic >&2; done"#;
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec!["-c".into(), script.into()],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        tokio::time::timeout(Duration::from_secs(3), async {
            while transport.events.capacity() != 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("stderr queue did not fill");
        cancel.cancel();
        tokio::time::timeout(Duration::from_secs(3), async {
            while !transport._stderr.is_finished() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("blocked stderr sender ignored cancellation");
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn shutdown_aborts_pipe_readers_and_closes_admission() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/cat".into(),
            args: vec![],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        transport.shutdown().await;
        tokio::task::yield_now().await;
        assert!(transport._reader.is_finished());
        assert!(transport._stderr.is_finished());
        assert!(transport.pending.lock().unwrap().closed);
        assert!(*transport.closed.borrow());
        assert!(
            transport
                .request("after-shutdown", json!({}))
                .await
                .is_err()
        );
    }

    #[test]
    fn boolean_approval_never_selects_persistent_permission() {
        let mut request = AcpPermissionRequest {
            tool_call: json!({}),
            options: vec![
                ("always".into(), "allow_always".into()),
                ("deny-always".into(), "reject_always".into()),
            ],
        };
        assert_eq!(
            one_time_permission_outcome(&request, true),
            json!({"outcome":"cancelled"})
        );
        assert_eq!(
            one_time_permission_outcome(&request, false),
            json!({"outcome":"cancelled"})
        );
        request.options.push(("once".into(), "allow_once".into()));
        request
            .options
            .push(("deny-once".into(), "reject_once".into()));
        assert_eq!(
            one_time_permission_outcome(&request, true)["optionId"],
            "once"
        );
        assert_eq!(
            one_time_permission_outcome(&request, false)["optionId"],
            "deny-once"
        );
    }

    #[tokio::test]
    async fn approval_owner_binds_session_and_resolves_once() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r request; printf '%s\n' '{"jsonrpc":"2.0","id":"cb","method":"session/request_permission","params":{"sessionId":"agent","toolCall":{"title":"Run"},"options":[{"optionId":"yes","kind":"allow_once"},{"optionId":"no","kind":"reject_once"}]}}'; IFS= read -r reply; printf '{"jsonrpc":"2.0","id":1,"result":%s}\n' "$reply"; sleep 1"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let mut callbacks = transport.take_callbacks().unwrap();
        let handler = tokio::spawn(async move {
            let mut owner = AcpApprovalOwner::new("gateway".into(), "agent".into()).unwrap();
            let event = owner
                .admit(callbacks.recv().await.unwrap())
                .await
                .unwrap()
                .unwrap();
            let crate::providers::contracts::ProviderEvent::ToolApprovalRequired {
                request_id,
                session_id,
                ..
            } = event
            else {
                panic!("wrong event")
            };
            assert_eq!(session_id, "gateway");
            assert!(!owner.resolve("other", &request_id, true).await.unwrap());
            assert!(owner.resolve("gateway", &request_id, false).await.unwrap());
            assert!(!owner.resolve("gateway", &request_id, true).await.unwrap());
        });
        let reply = tokio::time::timeout(
            Duration::from_secs(2),
            transport.request("prompt", json!({})),
        )
        .await
        .unwrap()
        .unwrap();
        handler.await.unwrap();
        assert_eq!(reply["result"]["outcome"]["optionId"], "no");
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn persistent_only_approval_cancels_and_reports_failure() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r request; printf '%s\n' '{"jsonrpc":"2.0","id":"cb","method":"session/request_permission","params":{"sessionId":"agent","toolCall":{},"options":[{"optionId":"always","kind":"allow_always"}]}}'; IFS= read -r reply; printf '{"jsonrpc":"2.0","id":1,"result":%s}\n' "$reply"; sleep 1"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let mut callbacks = transport.take_callbacks().unwrap();
        let handler = tokio::spawn(async move {
            let mut owner = AcpApprovalOwner::new("gateway".into(), "agent".into()).unwrap();
            let event = owner
                .admit(callbacks.recv().await.unwrap())
                .await
                .unwrap()
                .unwrap();
            let crate::providers::contracts::ProviderEvent::ToolApprovalRequired {
                request_id, ..
            } = event
            else {
                panic!("wrong event")
            };
            assert_eq!(
                owner.resolve("gateway", &request_id, true).await,
                Err(TransportError::UnsupportedPermissionDecision)
            );
            assert!(!owner.resolve("gateway", &request_id, true).await.unwrap());
        });
        let reply = tokio::time::timeout(
            Duration::from_secs(2),
            transport.request("prompt", json!({})),
        )
        .await
        .unwrap()
        .unwrap();
        handler.await.unwrap();
        assert_eq!(reply["result"]["outcome"]["outcome"], "cancelled");
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn dropping_approval_owner_wakes_inflight_request() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r request; printf '%s\n' '{"jsonrpc":"2.0","id":"a","method":"session/request_permission","params":{"sessionId":"agent","toolCall":{},"options":[{"optionId":"yes","kind":"allow_once"}]}}'; sleep 5"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let mut callbacks = transport.take_callbacks().unwrap();
        let handler = tokio::spawn(async move {
            let mut owner = AcpApprovalOwner::new("gateway".into(), "agent".into()).unwrap();
            assert!(
                owner
                    .admit(callbacks.recv().await.unwrap())
                    .await
                    .unwrap()
                    .is_some()
            );
            drop(owner);
        });
        let result = tokio::time::timeout(
            Duration::from_secs(2),
            transport.request("prompt", json!({})),
        )
        .await
        .expect("owner drop stranded request");
        assert!(result.is_err());
        handler.await.unwrap();
        assert!(transport.pending.lock().unwrap().waiters.is_empty());
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn cancelled_approval_reply_waiting_for_writer_wakes_request() {
        for cancel_all in [false, true] {
            let config = AcpProviderConfig {
                id: "test".into(),
                command: "/bin/cat".into(),
                args: vec![],
                provider_type: "test".into(),
                execution_node_id: None,
            };
            let (mut transport, _events, _cancel) =
                AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
            let writer = transport.writer.clone();
            let (tx, rx) = oneshot::channel();
            transport
                .pending
                .lock()
                .unwrap()
                .waiters
                .insert(RpcId::Num(99), tx);
            let callback = AcpCallback {
                id: RpcId::Num(1),
                method: "session/request_permission".into(),
                params: json!({"sessionId":"agent","toolCall":{},"options":[{"optionId":"yes","kind":"allow_once"}]}),
                writer: writer.clone(),
                replied: false,
            };
            let mut owner = AcpApprovalOwner::new("gateway".into(), "agent".into()).unwrap();
            let event = owner.admit(callback).await.unwrap().unwrap();
            let crate::providers::contracts::ProviderEvent::ToolApprovalRequired {
                request_id, ..
            } = event
            else {
                panic!("wrong event")
            };
            let lock = writer.stdin.lock().await;
            {
                let future: std::pin::Pin<
                    Box<dyn std::future::Future<Output = Result<(), TransportError>> + '_>,
                > = if cancel_all {
                    Box::pin(owner.cancel_all())
                } else {
                    Box::pin(async {
                        owner
                            .resolve("gateway", &request_id, true)
                            .await
                            .map(|_| ())
                    })
                };
                let mut future = future;
                assert!(
                    tokio::time::timeout(Duration::from_millis(20), &mut future)
                        .await
                        .is_err()
                );
            }
            assert!(
                tokio::time::timeout(Duration::from_secs(1), rx)
                    .await
                    .unwrap()
                    .is_err()
            );
            assert!(*writer.closed.borrow());
            drop(lock);
            transport.shutdown().await;
        }
    }

    #[tokio::test]
    async fn approval_owner_teardown_cancels_all_pending_callbacks() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r request; printf '%s\n' '{"jsonrpc":"2.0","id":"a","method":"session/request_permission","params":{"sessionId":"agent","toolCall":{},"options":[{"optionId":"yes","kind":"allow_once"}]}}' '{"jsonrpc":"2.0","id":"b","method":"session/request_permission","params":{"sessionId":"agent","toolCall":{},"options":[{"optionId":"yes","kind":"allow_once"}]}}'; IFS= read -r first; IFS= read -r second; printf '{"jsonrpc":"2.0","id":1,"result":[%s,%s]}\n' "$first" "$second"; sleep 1"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let mut callbacks = transport.take_callbacks().unwrap();
        let handler = tokio::spawn(async move {
            let mut owner = AcpApprovalOwner::new("gateway".into(), "agent".into()).unwrap();
            for _ in 0..2 {
                assert!(
                    owner
                        .admit(callbacks.recv().await.unwrap())
                        .await
                        .unwrap()
                        .is_some()
                );
            }
            owner.cancel_all().await.unwrap();
            assert!(owner.pending.is_empty());
            owner.cancel_all().await.unwrap();
        });
        let replies = tokio::time::timeout(
            Duration::from_secs(2),
            transport.request("prompt", json!({})),
        )
        .await
        .unwrap()
        .unwrap();
        handler.await.unwrap();
        for reply in replies.as_array().unwrap() {
            assert_eq!(reply["result"]["outcome"]["outcome"], "cancelled");
        }
        assert_eq!(replies.as_array().unwrap().len(), 2);
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn interrupt_control_remains_responsive_during_request() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r request; IFS= read -r cancel; printf '{"jsonrpc":"2.0","id":1,"result":%s}\n' "$cancel"; sleep 1"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let control = transport.control_handle();
        assert!(control.interrupt("").await.is_err());
        let (result, interrupted) = tokio::join!(
            transport.request("session/prompt", json!({"sessionId":"agent"})),
            async {
                tokio::task::yield_now().await;
                control.interrupt("agent").await
            }
        );
        interrupted.unwrap();
        let notification = result.unwrap();
        assert_eq!(notification["method"], "session/cancel");
        assert_eq!(notification["params"]["sessionId"], "agent");
        assert!(notification.get("id").is_none());
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn callback_reply_unblocks_inflight_request() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r request; printf '%s\n' '{"jsonrpc":"2.0","id":"cb","method":"session/request_permission","params":{"sessionId":"s"}}'; IFS= read -r reply; printf '{"jsonrpc":"2.0","id":1,"result":%s}\n' "$reply"; sleep 1"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let mut callbacks = transport.take_callbacks().unwrap();
        assert!(transport.take_callbacks().is_none());
        let handler = tokio::spawn(async move {
            let callback = callbacks.recv().await.unwrap();
            assert_eq!(callback.method, "session/request_permission");
            assert_eq!(callback.params["sessionId"], "s");
            callback
                .respond(Ok(json!({"outcome": "cancelled"})))
                .await
                .unwrap();
        });
        let reply = tokio::time::timeout(
            Duration::from_secs(2),
            transport.request("prompt", json!({})),
        )
        .await
        .expect("callback deadlocked")
        .unwrap();
        handler.await.unwrap();
        assert_eq!(reply["id"], "cb");
        assert_eq!(reply["result"]["outcome"], "cancelled");
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn callback_receiver_loss_or_overload_wakes_inflight_request() {
        for receiver_lost in [true, false] {
            let config = AcpProviderConfig {
                id: "test".into(), command: "/bin/sh".into(),
                args: vec!["-c".into(), r#"IFS= read -r request; i=0; while [ "$i" -lt 33 ]; do printf '%s\n' '{"jsonrpc":"2.0","id":"cb","method":"session/request_permission","params":{}}'; i=$((i+1)); done; sleep 2"#.into()],
                provider_type: "test".into(), execution_node_id: None,
            };
            let (mut transport, _events, _cancel) =
                AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
            let callbacks = transport.take_callbacks().unwrap();
            let retained_callbacks = if receiver_lost {
                drop(callbacks);
                None
            } else {
                Some(callbacks)
            };
            let result = tokio::time::timeout(
                Duration::from_secs(1),
                transport.request("prompt", json!({})),
            )
            .await
            .expect("in-flight request was not woken");
            assert!(result.is_err());
            assert!(*transport.closed.borrow());
            assert!(transport.pending.lock().unwrap().waiters.is_empty());
            drop(retained_callbacks);
            transport.shutdown().await;
        }
    }

    #[tokio::test]
    async fn dropping_transport_closes_cloned_writer_and_wakes_waiters() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/cat".into(),
            args: vec![],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let writer = transport.writer.clone();
        let (tx, rx) = oneshot::channel();
        transport
            .pending
            .lock()
            .unwrap()
            .waiters
            .insert(RpcId::Num(99), tx);
        drop(transport);
        assert!(rx.await.is_err());
        assert!(matches!(
            writer.write(&json!({"method": "test"})).await,
            Err(TransportError::Io(_))
        ));
        let state = writer.pending.lock().unwrap();
        assert!(state.closed && state.waiters.is_empty());
    }

    #[tokio::test]
    async fn response_id_preserves_number_and_string_identity() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r request; printf '%s\n' '{"jsonrpc":"2.0","id":"1","result":"wrong"}' '{"jsonrpc":"2.0","id":1,"result":"right"}'; sleep 1"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let result =
            tokio::time::timeout(Duration::from_secs(2), transport.request("test", json!({})))
                .await
                .expect("request timed out")
                .unwrap();
        assert_eq!(result, json!("right"));
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn independent_writer_unblocks_inflight_request() {
        let config = AcpProviderConfig {
            id: "test".into(), command: "/bin/sh".into(),
            args: vec!["-c".into(), r#"IFS= read -r first; printf '%s\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s"}}'; IFS= read -r second; printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}'; sleep 1"#.into()],
            provider_type: "test".into(), execution_node_id: None,
        };
        let (mut transport, mut events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let writer = transport.writer.clone();
        let task = tokio::spawn(async move { transport.request("test", json!({})).await });
        tokio::time::timeout(Duration::from_secs(2), events.recv())
            .await
            .expect("agent did not receive request")
            .expect("event channel closed");
        writer
            .write(&json!({"jsonrpc":"2.0", "id": "callback", "result": {}}))
            .await
            .expect("callback reply write failed");
        let result = tokio::time::timeout(Duration::from_secs(2), task)
            .await
            .expect("request remained blocked")
            .unwrap()
            .unwrap();
        assert_eq!(result, json!({"ok": true}));
    }

    #[tokio::test]
    async fn cancelling_writer_waiting_for_lock_keeps_transport_open() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/cat".into(),
            args: vec![],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let writer = transport.writer.clone();
        let lock = writer.stdin.lock().await;
        assert!(
            tokio::time::timeout(Duration::from_millis(50), writer.write(&json!({"id": 1})))
                .await
                .is_err()
        );
        assert!(!transport.pending.lock().unwrap().closed);
        drop(lock);
        transport.notify("after-cancel", json!({})).await.unwrap();
        transport.shutdown().await;
    }

    #[tokio::test]
    async fn dropping_transport_aborts_pipe_readers() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/cat".into(),
            args: vec![],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let reader = transport._reader.abort_handle();
        let stderr = transport._stderr.abort_handle();
        drop(transport);
        tokio::time::timeout(Duration::from_secs(2), async {
            while !reader.is_finished() || !stderr.is_finished() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("transport pipe readers remained detached");
    }

    #[tokio::test]
    async fn aborted_transport_request_releases_its_pending_waiter() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/cat".into(),
            args: vec![],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let pending = Arc::clone(&transport.pending);
        let task = tokio::spawn(async move { transport.request("test", json!({})).await });
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if !pending.lock().unwrap().waiters.is_empty() {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("request was not registered");
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(pending.lock().unwrap().waiters.is_empty());
    }

    #[tokio::test]
    async fn stdout_closure_releases_waiters_and_rejects_later_requests() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec!["-c".into(), "read line; exec 1>&-; sleep 5".into()],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let first =
            tokio::time::timeout(Duration::from_secs(2), transport.request("test", json!({})))
                .await
                .expect("pending request hung after stdout closed");
        assert!(matches!(first, Err(TransportError::Io(_))));
        let second = tokio::time::timeout(
            Duration::from_secs(2),
            transport.request("again", json!({})),
        )
        .await
        .expect("request admitted after stdout closed");
        assert!(matches!(second, Err(TransportError::Io(_))));
        let state = transport.pending.lock().unwrap();
        assert!(state.closed && state.waiters.is_empty());
    }

    #[tokio::test]
    async fn stdout_closure_interrupts_a_blocked_request_write() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec![
                "-c".into(),
                "dd bs=1 count=1 of=/dev/null 2>/dev/null; exec 1>&-; sleep 5".into(),
            ],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        let result = tokio::time::timeout(
            Duration::from_secs(2),
            transport.request("test", json!({"data": "x".repeat(2_000_000)})),
        )
        .await
        .expect("request write hung after stdout closed");
        assert!(matches!(result, Err(TransportError::Io(_))));
    }

    #[tokio::test]
    async fn dropped_blocked_write_closes_transport_before_reuse() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec![
                "-c".into(),
                "dd bs=1 count=1 of=/dev/null 2>/dev/null; sleep 5".into(),
            ],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        assert!(
            tokio::time::timeout(
                Duration::from_millis(200),
                transport.request("test", json!({"data": "x".repeat(2_000_000)})),
            )
            .await
            .is_err()
        );
        assert!(matches!(
            transport.request("again", json!({})).await,
            Err(TransportError::Io(_))
        ));
        let state = transport.pending.lock().unwrap();
        assert!(state.closed && state.waiters.is_empty());
    }

    #[tokio::test]
    async fn dropped_blocked_notification_closes_transport_before_reuse() {
        let config = AcpProviderConfig {
            id: "test".into(),
            command: "/bin/sh".into(),
            args: vec![
                "-c".into(),
                "dd bs=1 count=1 of=/dev/null 2>/dev/null; sleep 5".into(),
            ],
            provider_type: "test".into(),
            execution_node_id: None,
        };
        let (mut transport, _events, _cancel) =
            AcpTransport::spawn(&config, ".", &BTreeMap::new()).unwrap();
        assert!(
            tokio::time::timeout(
                Duration::from_millis(200),
                transport.notify("test", json!({"data": "x".repeat(2_000_000)})),
            )
            .await
            .is_err()
        );
        assert!(matches!(
            transport.request("again", json!({})).await,
            Err(TransportError::Io(_))
        ));
        let state = transport.pending.lock().unwrap();
        assert!(state.closed && state.waiters.is_empty());
    }

    // -- framing ------------------------------------------------------------

    #[test]
    fn framing_encodes_ndjson() {
        let line = encode_message(&json!({ "jsonrpc": "2.0", "method": "ping" }));
        assert!(line.ends_with('\n'));
        assert_eq!(line.matches('\n').count(), 1);
        assert!(!line.trim_end().contains('\n'));
    }

    #[test]
    fn framing_skips_blank_lines() {
        assert_eq!(decode_message(""), Ok(None));
        assert_eq!(decode_message("   \n"), Ok(None));
    }

    #[test]
    fn framing_classifies_notification_request_and_response() {
        assert_eq!(
            decode_message(r#"{"jsonrpc":"2.0","method":"session/update","params":{"a":1}}"#),
            Ok(Some(AcpInbound::Notification {
                method: "session/update".to_string(),
                params: json!({ "a": 1 }),
            }))
        );
        assert_eq!(
            decode_message(r#"{"jsonrpc":"2.0","id":7,"method":"initialize","params":{}}"#),
            Ok(Some(AcpInbound::Request {
                id: RpcId::Num(7),
                method: "initialize".to_string(),
                params: json!({}),
            }))
        );
        // A null id alongside a method is a notification, not a request.
        assert!(matches!(
            decode_message(r#"{"jsonrpc":"2.0","id":null,"method":"x"}"#),
            Ok(Some(AcpInbound::Notification { .. }))
        ));
        assert_eq!(
            decode_message(r#"{"jsonrpc":"2.0","id":"abc","result":{"ok":true}}"#),
            Ok(Some(AcpInbound::Response {
                id: RpcId::Str("abc".to_string()),
                result: Ok(json!({ "ok": true })),
            }))
        );
    }

    #[test]
    fn framing_surfaces_rpc_errors() {
        assert_eq!(
            decode_message(
                r#"{"jsonrpc":"2.0","id":3,"error":{"code":-32601,"message":"Method not found"}}"#
            ),
            Ok(Some(AcpInbound::Response {
                id: RpcId::Num(3),
                result: Err(AcpRpcError {
                    code: -32601,
                    message: "Method not found".to_string(),
                    data: None,
                }),
            }))
        );
    }

    #[test]
    fn framing_rejects_malformed_frames() {
        assert!(
            decode_message("{not json")
                .unwrap_err()
                .contains("malformed JSON")
        );
        assert!(
            decode_message("[1,2,3]")
                .unwrap_err()
                .contains("non-object")
        );
        assert!(
            decode_message(r#"{"jsonrpc":"2.0"}"#)
                .unwrap_err()
                .contains("neither method nor id")
        );
        assert!(
            decode_message(r#"{"id":1.5,"result":{}}"#)
                .unwrap_err()
                .contains("non-integer")
        );
    }

    // -- exit / stderr ------------------------------------------------------

    #[test]
    fn exit_label_precedence_is_signal_then_code_then_unknown() {
        assert_eq!(exit_label(Some(1), Some("SIGTERM")), "SIGTERM");
        assert_eq!(exit_label(Some(1), None), "1");
        assert_eq!(exit_label(None, None), "unknown");
    }

    #[test]
    fn exit_error_uses_reference_wording() {
        assert_eq!(
            session_exit_error(None, Some("SIGKILL")),
            "ACP provider exited (SIGKILL)"
        );
        assert_eq!(session_exit_error(Some(2), None), "ACP provider exited (2)");
        assert_eq!(
            session_exit_error(None, None),
            "ACP provider exited (unknown)"
        );
    }

    #[test]
    fn stderr_activity_drops_blank_chunks() {
        assert_eq!(stderr_activity("  \n\t "), None);
        assert_eq!(stderr_activity("  boom  "), Some("boom".to_string()));
    }

    // -- environment --------------------------------------------------------

    #[test]
    fn child_env_strips_tokens_but_honours_overrides() {
        let mut inherited = BTreeMap::new();
        inherited.insert("PATH".to_string(), "/usr/bin".to_string());
        inherited.insert("GITHUB_TOKEN".to_string(), "leaked".to_string());
        inherited.insert("GH_TOKEN".to_string(), "leaked".to_string());

        let env = build_child_env(&inherited, &[], STRIPPED_ENV_VARS);
        assert_eq!(env.get("PATH").map(String::as_str), Some("/usr/bin"));
        assert!(!env.contains_key("GITHUB_TOKEN"));
        assert!(!env.contains_key("GH_TOKEN"));

        let overridden = build_child_env(
            &inherited,
            &[("GITHUB_TOKEN".to_string(), "explicit".to_string())],
            STRIPPED_ENV_VARS,
        );
        assert_eq!(
            overridden.get("GITHUB_TOKEN").map(String::as_str),
            Some("explicit")
        );
    }

    // -- MCP descriptors ----------------------------------------------------

    #[test]
    fn mcp_server_transports_deserialize_as_acp_expects() {
        assert_eq!(
            to_acp_mcp_server(&json!({
                "transport": "stdio", "name": "jait",
                "command": "npx", "args": ["-y", "srv"],
                "env": { "A": "1" },
            })),
            json!({
                "name": "jait", "command": "npx", "args": ["-y", "srv"],
                "env": [{ "name": "A", "value": "1" }],
            })
        );
        assert_eq!(
            to_acp_mcp_server(&json!({ "transport": "http", "name": "h", "url": "https://x" })),
            json!({ "type": "http", "name": "h", "url": "https://x", "headers": [] })
        );
        assert_eq!(
            to_acp_mcp_server(&json!({ "transport": "sse", "name": "s", "url": "https://y" })),
            json!({ "type": "sse", "name": "s", "url": "https://y", "headers": [] })
        );
    }

    // -- content helpers ----------------------------------------------------

    #[test]
    fn tool_content_stringification() {
        assert_eq!(stringify_tool_content(&json!("plain")), "plain");
        assert_eq!(
            stringify_tool_content(
                &json!([{ "type": "text", "text": "a" }, { "type": "text", "text": "b" }])
            ),
            "a\nb"
        );
        // The `{ type: "content", content }` wrapper is unwrapped only for array
        // items; a bare non-array goes through `stringifyUnknown` (reference:
        // `if (!Array.isArray(content)) return stringifyUnknown(content)`).
        assert_eq!(
            stringify_tool_content(
                &json!([{ "type": "content", "content": { "type": "text", "text": "x" } }])
            ),
            "x"
        );
        assert_eq!(
            stringify_tool_content(&json!({ "type": "text", "text": "x" })),
            r#"{"type":"text","text":"x"}"#
        );
        assert_eq!(stringify_unknown(&json!({ "k": 1 })), r#"{"k":1}"#);
    }

    #[test]
    fn acp_content_text_preserves_whitespace_chunks() {
        assert_eq!(
            get_acp_content_text(&json!({ "type": "text", "text": " " })),
            " "
        );
        assert_eq!(
            get_acp_content_text(
                &json!({ "type": "content", "content": { "type": "text", "text": "hi" } })
            ),
            "hi"
        );
        assert_eq!(get_acp_content_text(&json!({ "type": "image" })), "");
        assert_eq!(get_acp_content_text(&Value::Null), "");
    }

    #[test]
    fn metadata_detection_and_locations() {
        assert!(!has_tool_call_metadata(&json!({})));
        assert!(!has_tool_call_metadata(&json!({ "rawInput": {} })));
        assert!(has_tool_call_metadata(&json!({ "rawInput": { "a": 1 } })));
        assert!(has_tool_call_metadata(&json!({ "title": " Read " })));
        assert!(!has_tool_call_metadata(&json!({ "title": "   " })));
        assert_eq!(
            first_path_from_acp_locations(&[json!({ "path": "  " }), json!({ "path": "/a.rs" })]),
            Some("/a.rs".to_string())
        );
        assert_eq!(first_path_from_acp_locations(&[]), None);
    }

    #[test]
    fn changes_skip_entries_without_a_path() {
        let changes = changes_from_acp_content(&[
            json!({ "path": "/a.rs", "oldText": "x", "newText": "y", "_meta": { "kind": "edit" } }),
            json!({ "oldText": "no path" }),
        ]);
        assert_eq!(changes.len(), 1);
        assert_eq!(
            changes[0].get("path").and_then(Value::as_str),
            Some("/a.rs")
        );
        assert_eq!(changes[0].get("kind").and_then(Value::as_str), Some("edit"));
    }

    // -- Jait MCP call unwrapping -------------------------------------------

    #[test]
    fn qualified_title_shape_wins_over_arguments() {
        let call = get_acp_jait_mcp_call(&json!({
            "title": "mcp__jait_core__user_ask",
            "rawInput": { "title": "own argument" },
        }))
        .expect("recognized");
        assert_eq!(call.tool, "user.ask");
        assert_eq!(
            call.args.get("title").and_then(Value::as_str),
            Some("own argument")
        );
    }

    #[test]
    fn codex_server_field_shape_normalizes_underscores() {
        let call = get_acp_jait_mcp_call(&json!({
            "title": "anything",
            "rawInput": { "server": "jait_core", "tool": "agent_spawn", "arguments": { "a": 1 } },
        }))
        .expect("recognized");
        assert_eq!(call.tool, "agent.spawn");
        assert_eq!(call.args.get("a"), Some(&json!(1)));
    }

    #[test]
    fn claude_collapsed_shape_strips_server_prefix() {
        let call = get_acp_jait_mcp_call(&json!({
            "title": "mcp",
            "rawInput": { "tool": "jait_agent_spawn", "args": "{\"x\":true}" },
        }))
        .expect("recognized");
        assert_eq!(call.tool, "agent.spawn");
        assert_eq!(call.args.get("x"), Some(&json!(true)));
    }

    #[test]
    fn non_jait_tool_calls_are_not_recognized() {
        assert_eq!(
            get_acp_jait_mcp_call(&json!({ "title": "Read", "rawInput": { "tool": "read" } })),
            None
        );
        assert_eq!(get_acp_jait_mcp_call(&json!({ "rawInput": [] })), None);
    }

    // -- tool name / args ---------------------------------------------------

    #[test]
    fn tool_name_falls_back_kind_then_call_id() {
        assert_eq!(
            get_acp_tool_name(&json!({ "kind": "search", "title": "Grep" })),
            "search"
        );
        assert_eq!(
            get_acp_tool_name(&json!({ "kind": "other", "title": " Deploy " })),
            " Deploy "
        );
        assert_eq!(get_acp_tool_name(&json!({ "kind": "other" })), "other");
        assert_eq!(
            get_acp_tool_name(&json!({ "toolCallId": "call-1" })),
            "call-1"
        );
        assert_eq!(get_acp_tool_name(&Value::Null), "tool");
    }

    #[test]
    fn tool_args_enrich_with_locations_and_changes() {
        let args = get_acp_tool_args(&json!({
            "kind": "edit",
            "title": "Edit",
            "locations": [{ "path": "/b.rs" }],
            "content": [{ "path": "/b.rs", "oldText": "o", "newText": "n" }],
        }))
        .expect("has args");
        assert_eq!(args.get("path").and_then(Value::as_str), Some("/b.rs"));
        assert_eq!(args.get("search").and_then(Value::as_str), Some("o"));
        assert_eq!(args.get("replace").and_then(Value::as_str), Some("n"));
        assert_eq!(args.get("kind").and_then(Value::as_str), Some("edit"));
        assert_eq!(args.get("title").and_then(Value::as_str), Some("Edit"));
        assert_eq!(get_acp_tool_args(&json!({})), None);
    }

    // -- transient cancellation & replay ------------------------------------

    #[test]
    fn transient_mcp_startup_cancellation_is_suppressed() {
        let update = json!({
            "sessionUpdate": "tool_call",
            "status": "failed",
            "title": "mcp__jait_core__startup",
            "content": [{ "type": "text", "text": "[codex-acp forwarded startup error] MCP server `jait_core` startup was cancelled." }],
        });
        assert!(is_transient_jait_mcp_startup_cancellation(&update));

        let mut other = update.clone();
        other["status"] = json!("completed");
        assert!(!is_transient_jait_mcp_startup_cancellation(&other));
    }

    #[test]
    fn replayable_startup_events_are_tool_events_for_jait_servers() {
        let event = ProviderEvent::ToolStart {
            session_id: "s".to_string(),
            tool: "mcp__jait__startup".to_string(),
            args: Value::Null,
            call_id: "c".to_string(),
        };
        assert!(is_replayable_startup_event(&event));
        let unrelated = ProviderEvent::ToolStart {
            session_id: "s".to_string(),
            tool: "Read".to_string(),
            args: Value::Null,
            call_id: "c".to_string(),
        };
        assert!(!is_replayable_startup_event(&unrelated));
    }

    // -- session update mapping ---------------------------------------------

    fn map_one(update: Value) -> Vec<AcpEvent> {
        SessionUpdateMapper::new().map("s1", &update)
    }

    #[test]
    fn agent_message_chunk_emits_exact_token_text() {
        let events = map_one(json!({
            "sessionUpdate": "agent_message_chunk",
            "content": { "type": "text", "text": "  world " },
        }));
        assert_eq!(
            events,
            vec![AcpEvent::Provider(ProviderEvent::Token {
                session_id: "s1".to_string(),
                content: "  world ".to_string(),
            })]
        );
    }

    #[test]
    fn capacity_text_without_message_id_becomes_turn_error() {
        let mut mapper = SessionUpdateMapper::for_provider("codex");
        let events = mapper.map(
            "s1",
            &json!({
                "sessionUpdate": "agent_message_chunk",
                "content": { "type": "text", "text": CODEX_CAPACITY_ERROR },
            }),
        );
        assert!(matches!(
            events.as_slice(),
            [AcpEvent::Provider(ProviderEvent::SessionError { .. })]
        ));
        assert_eq!(mapper.turn_error.as_deref(), Some(CODEX_CAPACITY_ERROR));

        let mut other = SessionUpdateMapper::for_provider("claude-code");
        let events = other.map(
            "s1",
            &json!({
                "sessionUpdate": "agent_message_chunk",
                "content": { "type": "text", "text": CODEX_CAPACITY_ERROR },
            }),
        );
        assert!(matches!(
            events.as_slice(),
            [AcpEvent::Provider(ProviderEvent::Token { .. })]
        ));
        assert!(other.turn_error.is_none());

        // A real delta carries a messageId and must stay a token.
        let mut codex_delta = SessionUpdateMapper::for_provider("codex");
        let events = codex_delta.map(
            "s1",
            &json!({
                "sessionUpdate": "agent_message_chunk",
                "messageId": "m1",
                "content": { "type": "text", "text": CODEX_CAPACITY_ERROR },
            }),
        );
        assert!(matches!(
            events.as_slice(),
            [AcpEvent::Provider(ProviderEvent::Token { .. })]
        ));
    }

    #[test]
    fn tool_call_failed_emits_start_then_result() {
        let events = map_one(json!({
            "sessionUpdate": "tool_call",
            "toolCallId": "c1",
            "kind": "other",
            "title": "Run",
            "status": "failed",
            "content": [{ "type": "text", "text": "boom" }],
        }));
        assert_eq!(events.len(), 2);
        assert!(matches!(
            &events[0],
            AcpEvent::Provider(ProviderEvent::ToolStart { tool, call_id, .. })
                if tool == "Run" && call_id == "c1"
        ));
        assert!(matches!(
            &events[1],
            AcpEvent::Provider(ProviderEvent::ToolResult { ok: false, message, .. }) if message == "boom"
        ));
    }

    #[test]
    fn tool_call_update_emits_output_and_completed_result() {
        let mut mapper = SessionUpdateMapper::new();
        mapper.map(
            "s1",
            &json!({
                "sessionUpdate": "tool_call", "toolCallId": "c1", "title": "Run", "kind": "other",
            }),
        );
        let events = mapper.map(
            "s1",
            &json!({
                "sessionUpdate": "tool_call_update",
                "toolCallId": "c1",
                "status": "completed",
                "content": [{ "type": "text", "text": "out" }],
                "rawOutput": { "exitCode": 0 },
            }),
        );
        let kinds: Vec<&str> = events
            .iter()
            .map(|event| match event {
                AcpEvent::Provider(ProviderEvent::ToolStart { .. }) => "start",
                AcpEvent::Provider(ProviderEvent::ToolOutput { .. }) => "output",
                AcpEvent::Provider(ProviderEvent::ToolResult { .. }) => "result",
                _ => "other",
            })
            .collect();
        // `content` counts as metadata, so an enriched tool.start leads.
        assert_eq!(kinds, vec!["start", "output", "result"]);
    }

    #[test]
    fn plan_and_thinking_map_to_their_event_shapes() {
        let events = map_one(json!({
            "sessionUpdate": "plan",
            "entries": [{ "status": "pending", "content": "step" }],
        }));
        assert!(matches!(
            &events[0],
            AcpEvent::Provider(ProviderEvent::Activity { kind, summary, .. })
                if kind == "plan" && summary == "[pending] step"
        ));

        let events = map_one(json!({
            "sessionUpdate": "agent_thought_chunk",
            "content": { "type": "content", "content": { "type": "text", "text": "hmm" } },
        }));
        assert_eq!(
            events,
            vec![AcpEvent::Thinking {
                session_id: "s1".to_string(),
                content: "hmm".to_string()
            }]
        );

        // Empty reasoning emits nothing.
        assert!(
            map_one(json!({
                "sessionUpdate": "agent_thought_chunk",
                "content": { "type": "text", "text": "" },
            }))
            .is_empty()
        );
    }

    #[test]
    fn usage_update_records_context_counters() {
        let mut mapper = SessionUpdateMapper::new();
        mapper.map(
            "s1",
            &json!({ "sessionUpdate": "usage_update", "used": 10, "size": 200 }),
        );
        assert_eq!(mapper.used_tokens, Some(json!(10)));
        assert_eq!(mapper.context_window, Some(json!(200)));
    }

    #[test]
    fn unknown_update_kinds_are_dropped() {
        assert!(map_one(json!({ "sessionUpdate": "who_knows" })).is_empty());
        assert!(map_one(json!({})).is_empty());
    }

    #[test]
    fn typed_session_failure_short_circuits_mapping() {
        let mut mapper = SessionUpdateMapper::new();
        let events = mapper.map(
            "s1",
            &json!({
                "sessionUpdate": "agent_message_chunk",
                "content": { "type": "text", "text": "ignored" },
                "_meta": { "jetbrains": { "air": { "sessionFailure": { "message": "quota" } } } },
            }),
        );
        assert!(matches!(
            &events[0],
            AcpEvent::Provider(ProviderEvent::SessionError { error, .. }) if error == "quota"
        ));
        assert_eq!(mapper.turn_error.as_deref(), Some("quota"));
    }

    #[test]
    fn reasoning_effort_config_lookup() {
        assert_eq!(
            find_reasoning_effort_config(&json!([
                { "configId": "model" },
                { "configId": "reasoning_effort" },
            ])),
            Some("reasoning_effort".to_string())
        );
        assert_eq!(
            find_reasoning_effort_config(&json!([{ "configId": "model" }])),
            None
        );
        assert_eq!(find_reasoning_effort_config(&Value::Null), None);
    }

    // -- provider surface ---------------------------------------------------

    #[test]
    fn non_gateway_execution_nodes_are_rejected() {
        let provider = AcpProvider::new(AcpProviderConfig {
            id: "acct".to_string(),
            command: "true".to_string(),
            args: vec![],
            provider_type: "claude-code".to_string(),
            execution_node_id: None,
        });
        assert!(provider.ensure_local().is_ok());

        let remote = AcpProvider::new(AcpProviderConfig {
            id: "acct".to_string(),
            command: "true".to_string(),
            args: vec![],
            provider_type: "claude-code".to_string(),
            execution_node_id: Some("device-1".to_string()),
        });
        assert_eq!(
            remote.ensure_local().unwrap_err(),
            "Provider account acct must run on device device-1"
        );
    }

    #[test]
    fn probe_timeout_message_uses_whole_seconds() {
        let message = probe_timeout_message();
        assert!(message.starts_with("ACP auth probe timed out after "));
        assert!(message.ends_with("s"));
    }

    #[tokio::test]
    async fn cancel_token_is_level_triggered() {
        let token = CancelToken::new();
        assert!(!token.is_cancelled());
        token.cancel();
        token.cancel();
        assert!(token.is_cancelled());
        // Already-cancelled tokens return immediately.
        tokio::time::timeout(Duration::from_millis(50), token.cancelled())
            .await
            .expect("cancelled() resolves for an already-cancelled token");
    }

    #[tokio::test]
    async fn with_cancel_aborts_a_pending_future() {
        let token = CancelToken::new();
        let canceller = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(5)).await;
            canceller.cancel();
        });
        let outcome: Result<(), TransportError> = with_cancel(&token, async {
            tokio::time::sleep(Duration::from_secs(30)).await;
            Ok(())
        })
        .await;
        assert_eq!(outcome, Err(TransportError::Cancelled));
    }

    #[tokio::test]
    async fn with_timeout_reports_the_reference_message() {
        let outcome: Result<(), TransportError> = with_timeout(
            std::future::pending(),
            Duration::from_millis(5),
            &probe_timeout_message(),
        )
        .await;
        assert_eq!(
            outcome,
            Err(TransportError::Timeout(probe_timeout_message()))
        );
    }
}
