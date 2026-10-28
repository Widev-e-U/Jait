//! Primary-link node service — native port of
//! `packages/gateway/src/services/primary-link.ts`.
//!
//! A secondary ("remote") node runs this link to attach itself to a primary Jait
//! gateway over one socket. The link registers the node (`node.hello`,
//! `fs.register-node`), serves the filesystem / tool / terminal requests the
//! primary pushes at it, and streams `terminal.output`, `terminal.exit` and
//! `tool.background-complete` events back.
//!
//! This module owns the protocol, the resolution/precedence rules and the
//! reconnect policy. It deliberately owns no socket, no process and no file
//! descriptor: every host capability is behind [`PrimaryLinkHost`].
//!
//! ## Host ports assumed (no native counterpart in this crate)
//!
//! The production wiring adapter is expected to be the same adapter that provides
//! `crate::tools::core_jait::JaitPort<C>` — a boxed
//! `async fn(&str, Vec<Value>, &C) -> Result<Option<Value>, HostError>` invoked as
//! `port(name, vec![args], ctx)`. Each assumed host method name and its argument
//! shape:
//!
//! | [`PrimaryLinkHost`] method | host port name | arguments | TS counterpart |
//! |---|---|---|---|
//! | `state_directory` | *(local)* | state dir from `crate::state_directory` | `getStateDirectory()` |
//! | `read_state_file` | `node.link.read-state` | `{ "path": string }` | `readFileSync(credentialPath)` / `node-id` |
//! | `write_state_file` | `node.link.write-state` | `{ "path": string, "contents": string }` | `writeFileSync(idPath, id)` |
//! | `ensure_parent_dir` | `node.link.ensure-dir` | `{ "path": string }` | `mkdir(dirname idPath, {recursive:true})` |
//! | `hostname` | `os.query` (`{ "query": "hostname" }`) | — | `hostname()` |
//! | `open_socket` | `node.link.connect` | `{ "url": string }` | `new WebSocket(url)` |
//! | `send_text` | `node.link.send` | `{ "message": object }` | `ws.send(JSON.stringify(...))` |
//! | `close_socket` | `node.link.close` | — | `ws.close()` |
//! | `browse` | `fs.browse` | `{ "path": string }` | `this.browse(path)` |
//! | `fs_roots` | `fs.roots` | — | `this.roots()` |
//! | `run_fs_op` | `fs.<op>` | the raw `args` object | `this.fsOp(op, args)` |
//! | `run_tool` | `node.tool` | `{ "tool": string, "args": object }` | `this.toolOp(tool, args)` |
//! | `spawn_terminal` | `terminal.start` | [`TerminalSpawn`] | `new TerminalSurface(...)` |
//! | `terminal_input` | `terminal.input` | `{ "terminalId", "data" }` | `terminal.input(data)` |
//! | `resize_terminal` | `terminal.resize` | `{ "terminalId", "cols", "rows" }` | `terminal.resize(cols, rows)` |
//! | `stop_terminal` | `terminal.stop` | `{ "terminalId", "reason" }` | `terminal.stop({reason})` |
//!
//! The socket host is responsible for delivering inbound frames to
//! [`PrimaryLink::handle_message`] and for forwarding `terminal.output` /
//! `terminal.exit` produced by terminal callbacks (the TS `onOutput`/`onExit`
//! hooks) through the same send path.
//!
//! ## Approximations
//!
//! * Reconnect backoff doubles from 1s and clamps at 30s; the TS only shows the
//!   initial 1s, the 30s ceiling and the reset-to-1s on `open`, so the exact
//!   growth factor is not recoverable from the source and is not jittered.
//! * `NODE_PROTOCOL_VERSION` is not defined in this file in TS (it is imported);
//!   the native value is pinned to `1`.
//! * `String(x)` coercions of non-string JSON values go through
//!   `serde_json` rendering rather than JS `String()`.
//! * Terminal `input`/`resize` acknowledge with `{ ok: true }`; the TS `stop`
//!   case returns the surface's stop result, whose shape lives in
//!   `terminal-surface.ts` and is not reproduced here.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// JS `String.prototype.trim` for `&str` (whitespace set matches the TS runtime).
fn js_trim(value: &str) -> &str {
    value.trim()
}

/// Truncation budget for a background command's reported tail.
pub const BACKGROUND_MAX_OUTPUT_CHARS: usize = 4000;
/// Buffer ceiling for a background command's accumulated output.
pub const BACKGROUND_MAX_BUFFER_BYTES: usize = 10 * 1024 * 1024;
/// Default `terminal.run` timeout, mirroring `30_000` in TS.
pub const DEFAULT_COMMAND_TIMEOUT_MS: u64 = 30_000;
/// First reconnect delay after a disconnect.
pub const INITIAL_RECONNECT_DELAY_MS: u64 = 1_000;
/// Reconnect delay ceiling.
pub const MAX_RECONNECT_DELAY_MS: u64 = 30_000;
/// Bytes of the sha256-of-primary-gateway used as the pairing file stem.
pub const CREDENTIAL_HASH_PREFIX: usize = 24;
/// Protocol version announced in `node.hello` (imported in TS, pinned here).
pub const NODE_PROTOCOL_VERSION: u64 = 1;

/// Tools a headless node advertises and will execute for the primary.
pub const NODE_TOOLS: [&str; 14] = [
    "terminal.run",
    "jait.terminal",
    "execute",
    "read",
    "file.read",
    "edit",
    "file.write",
    "file.patch",
    "file.list",
    "file.stat",
    "image.view",
    "search",
    "file.search",
    "os.query",
];

/// Filesystem operations accepted over `fs.op-request`.
pub const FS_OPS: [&str; 12] = [
    "stat",
    "read",
    "git-file-read",
    "write",
    "patch",
    "list",
    "exists",
    "mkdir",
    "readdir",
    "search-project",
    "git",
    "gh",
];

/// Platform label announced to the primary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FsPlatform {
    Windows,
    Macos,
    Linux,
}

impl FsPlatform {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::Macos => "macos",
            Self::Linux => "linux",
        }
    }
}

/// Errors raised while serving a request. Strings are the exact TS messages.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Error {
    UnexpectedProjectSearchMode,
    MissingTerminalId,
    TerminalNotRunning,
    TerminalNotOnNode(String),
    UnsupportedTerminalOp(String),
    NotADirectory,
    MissingSearchText,
    MissingGitArgs,
    MissingGhArgs,
    UnsupportedFsOp(String),
    UnsupportedTool(String),
    MissingCommand,
    SearchFailed,
    /// A host port call failed; carries the host message verbatim.
    Host(String),
    /// A frame did not have the shape the protocol requires.
    Protocol(&'static str),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnexpectedProjectSearchMode => f.write_str("Unexpected project search mode"),
            Self::MissingTerminalId => f.write_str("Missing terminalId"),
            Self::TerminalNotRunning => f.write_str("Terminal is not running"),
            Self::TerminalNotOnNode(id) => {
                write!(f, "Terminal {id} is not running on this node")
            }
            Self::UnsupportedTerminalOp(op) => write!(f, "Unsupported terminal op: {op}"),
            Self::NotADirectory => f.write_str("Path is not a directory"),
            Self::MissingSearchText => f.write_str("Missing search text"),
            Self::MissingGitArgs => f.write_str("Missing git args"),
            Self::MissingGhArgs => f.write_str("Missing gh args"),
            Self::UnsupportedFsOp(op) => write!(f, "Unsupported fs op: {op}"),
            Self::UnsupportedTool(tool) => write!(f, "Unsupported tool on node: {tool}"),
            Self::MissingCommand => f.write_str("Missing command"),
            Self::SearchFailed => f.write_str("Search failed"),
            Self::Host(message) => f.write_str(message),
            Self::Protocol(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(_: std::io::Error) -> Self {
        Self::Host("io error".to_string())
    }
}

/// `err instanceof Error ? err.message : String(err)`.
pub fn err_msg(error: &impl fmt::Display) -> String {
    error.to_string()
}

// ---------------------------------------------------------------------------
// Pure resolution helpers
// ---------------------------------------------------------------------------

/// `detectPlatform()`: `win32` → windows, `darwin` → macos, everything else linux.
pub fn detect_platform(os: &str) -> FsPlatform {
    match os {
        "win32" => FsPlatform::Windows,
        "darwin" => FsPlatform::Macos,
        _ => FsPlatform::Linux,
    }
}

fn strip_prefix_ci<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
    if value.len() >= prefix.len() && value[..prefix.len()].eq_ignore_ascii_case(prefix) {
        Some(&value[prefix.len()..])
    } else {
        None
    }
}

fn has_scheme_ci(value: &str, scheme: &str) -> bool {
    strip_prefix_ci(value, scheme).is_some()
}

/// `encodeURIComponent`: unreserved characters are kept, everything else is
/// percent-encoded from its UTF-8 bytes.
pub fn encode_uri_component(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
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
            | b')' => out.push(*byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// `toWsUrl()`: normalize a primary gateway URL into a `ws://`/`wss://` origin.
pub fn to_ws_url(input: &str, token: Option<&str>) -> String {
    let trimmed = js_trim(input);
    let mut url = if let Some(rest) = strip_prefix_ci(trimmed, "https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = strip_prefix_ci(trimmed, "http://") {
        format!("ws://{rest}")
    } else if has_scheme_ci(trimmed, "wss://") || has_scheme_ci(trimmed, "ws://") {
        trimmed.to_string()
    } else {
        format!("ws://{trimmed}")
    };
    while url.ends_with('/') {
        url.pop();
    }
    // TS: `if (token)` — the empty string is falsy and adds nothing.
    if let Some(token) = token.filter(|t| !t.is_empty()) {
        url.push_str("?token=");
        url.push_str(&encode_uri_component(token));
    }
    url
}

/// `display = url.replace(/token=[^&]+/, "token=***")` — first occurrence only.
pub fn redact_token(url: &str) -> String {
    const MARKER: &str = "token=";
    let Some(start) = url.find(MARKER) else {
        return url.to_string();
    };
    let value_start = start + MARKER.len();
    let value_end = url[value_start..]
        .find('&')
        .map(|offset| value_start + offset)
        .unwrap_or(url.len());
    if value_end == value_start {
        return url.to_string();
    }
    let mut out = String::with_capacity(url.len());
    out.push_str(&url[..value_start]);
    out.push_str("***");
    out.push_str(&url[value_end..]);
    out
}

fn hex_lower(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    out
}

/// Pairing credential file: `sha256(primaryGateway)[0..24]` under
/// `<state>/node-pairings/`.
pub fn credential_path(state_directory: &Path, primary_gateway: &str) -> PathBuf {
    let digest = Sha256::digest(primary_gateway.as_bytes());
    let hex = hex_lower(digest.as_slice());
    let stem: String = hex.chars().take(CREDENTIAL_HASH_PREFIX).collect();
    state_directory
        .join("node-pairings")
        .join(format!("{stem}.json"))
}

/// Stable per-machine node id file under the state directory.
pub fn node_id_path(state_directory: &Path) -> PathBuf {
    state_directory.join("node-id")
}

#[derive(Deserialize)]
struct StoredPairing {
    #[serde(rename = "nodeId")]
    node_id: Option<String>,
    credential: Option<String>,
}

/// `pairedToken()`: a stored credential wins only when it belongs to this node,
/// otherwise fall back to the configured primary token.
pub fn paired_token(
    stored_json: Option<&str>,
    node_id: &str,
    fallback: Option<&str>,
) -> Option<String> {
    if let Some(raw) = stored_json
        && let Ok(stored) = serde_json::from_str::<StoredPairing>(raw)
        && stored.node_id.as_deref() == Some(node_id)
        && let Some(credential) = stored.credential
    {
        return Some(credential);
    }
    fallback.map(|value| value.to_string())
}

/// Where the node id came from; useful for logging and for tests.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeIdSource {
    Persisted,
    Generated,
    Fallback,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NodeId {
    pub id: String,
    pub source: NodeIdSource,
}

/// `node-<uuid>`.
pub fn generate_node_id(uuid: &str) -> String {
    format!("node-{uuid}")
}

/// `getNodeId()`: reuse a persisted id, otherwise mint one; if persistence is
/// unavailable the caller passes `generate = None` and the hostname fallback wins.
pub fn resolve_node_id(existing: Option<&str>, generate: Option<String>, hostname: &str) -> NodeId {
    if let Some(existing) = existing {
        let trimmed = js_trim(existing);
        if !trimmed.is_empty() {
            return NodeId {
                id: trimmed.to_string(),
                source: NodeIdSource::Persisted,
            };
        }
    }
    match generate {
        Some(id) => NodeId {
            id,
            source: NodeIdSource::Generated,
        },
        None => NodeId {
            id: format!("node-{hostname}"),
            source: NodeIdSource::Fallback,
        },
    }
}

/// `nodeName = opts.nodeName?.trim() || hostname()`.
pub fn node_name(configured: Option<&str>, hostname: &str) -> String {
    let trimmed = js_trim(configured.unwrap_or_default());
    if trimmed.is_empty() {
        hostname.to_string()
    } else {
        trimmed.to_string()
    }
}

/// Backoff step: double, clamped at `max`.
pub fn next_reconnect_delay(current_ms: u64, max_ms: u64) -> u64 {
    current_ms.saturating_mul(2).min(max_ms)
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

/// `node.hello` payload.
pub fn hello_payload(
    node_id: &str,
    name: &str,
    platform: FsPlatform,
    providers: &[String],
) -> Value {
    json!({
        "id": node_id,
        "name": name,
        "platform": platform,
        "role": "remote",
        "pairCredential": true,
        "protocolVersion": NODE_PROTOCOL_VERSION,
        "capabilities": {
            "providers": providers,
            "surfaces": ["filesystem", "terminal"],
            "tools": NODE_TOOLS,
            "screenShare": false,
            "voice": false,
            "preview": false,
        },
    })
}

/// `fs.register-node` payload.
pub fn register_node_payload(
    node_id: &str,
    name: &str,
    platform: FsPlatform,
    providers: &[String],
) -> Value {
    json!({
        "id": node_id,
        "name": name,
        "platform": platform,
        "providers": providers,
    })
}

// ---------------------------------------------------------------------------
// Inbound frames and responses
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResponseKind {
    FsBrowse,
    FsRoots,
    FsOp,
    ToolOp,
    TerminalOp,
}

impl ResponseKind {
    pub fn message_type(self) -> &'static str {
        match self {
            Self::FsBrowse => "fs.browse-response",
            Self::FsRoots => "fs.roots-response",
            Self::FsOp => "fs.op-response",
            Self::ToolOp => "tool.op-response",
            Self::TerminalOp => "terminal.op-response",
        }
    }
}

/// A request frame the primary gateway sends to this node.
#[derive(Clone, Debug, PartialEq)]
pub enum Inbound {
    FsBrowseRequest {
        request_id: Option<Value>,
        path: String,
    },
    FsRootsRequest {
        request_id: Option<Value>,
    },
    FsOpRequest {
        request_id: Option<Value>,
        op: String,
        args: Map<String, Value>,
    },
    ToolOpRequest {
        request_id: Option<Value>,
        tool: String,
        args: Map<String, Value>,
    },
    TerminalOpRequest {
        request_id: Option<Value>,
        op: String,
        params: Map<String, Value>,
    },
    Ignored,
}

/// `String(value ?? "")` for protocol fields.
fn js_string(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(text)) => text.clone(),
        Some(other) => other.to_string(),
    }
}

fn payload_object(message: &Value) -> Option<&Map<String, Value>> {
    message.get("payload").and_then(Value::as_object)
}

fn request_id(payload: &Map<String, Value>) -> Option<Value> {
    match payload.get("requestId") {
        None | Some(Value::Null) => None,
        Some(value) => Some(value.clone()),
    }
}

fn args_object(payload: &Map<String, Value>) -> Map<String, Value> {
    payload
        .get("args")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

/// Classify a frame. Unknown `type` values are ignored, exactly like the TS
/// `default:` arm (provider requests are not served by a headless node).
pub fn parse_inbound(message: &Value) -> Inbound {
    let Some(payload) = payload_object(message) else {
        return Inbound::Ignored;
    };
    let kind = message
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match kind {
        "fs.browse-request" => Inbound::FsBrowseRequest {
            request_id: request_id(payload),
            path: js_string(payload.get("path")),
        },
        "fs.roots-request" => Inbound::FsRootsRequest {
            request_id: request_id(payload),
        },
        "fs.op-request" => Inbound::FsOpRequest {
            request_id: request_id(payload),
            op: js_string(payload.get("op")),
            args: args_object(payload),
        },
        "tool.op-request" => Inbound::ToolOpRequest {
            request_id: request_id(payload),
            tool: js_string(payload.get("tool")),
            args: args_object(payload),
        },
        "terminal.op-request" => Inbound::TerminalOpRequest {
            request_id: request_id(payload),
            op: js_string(payload.get("op")),
            params: payload.clone(),
        },
        _ => Inbound::Ignored,
    }
}

fn with_request_id(payload: &mut Map<String, Value>, request_id: Option<Value>) {
    if let Some(id) = request_id {
        payload.insert("requestId".to_string(), id);
    }
}

/// `{ type, payload: { requestId, result } }`.
pub fn result_response(kind: ResponseKind, request_id: Option<Value>, result: Value) -> Value {
    let mut payload = Map::new();
    with_request_id(&mut payload, request_id);
    payload.insert("result".to_string(), result);
    json!({ "type": kind.message_type(), "payload": payload })
}

/// `{ type, payload: { requestId, error } }`.
pub fn error_response(kind: ResponseKind, request_id: Option<Value>, error: &str) -> Value {
    let mut payload = Map::new();
    with_request_id(&mut payload, request_id);
    payload.insert("error".to_string(), Value::String(error.to_string()));
    json!({ "type": kind.message_type(), "payload": payload })
}

/// `fs.browse-response`: `{ requestId, ...result }`.
pub fn browse_response(request_id: Option<Value>, result: Map<String, Value>) -> Value {
    let mut payload = Map::new();
    with_request_id(&mut payload, request_id);
    for (key, value) in result {
        payload.insert(key, value);
    }
    json!({ "type": ResponseKind::FsBrowse.message_type(), "payload": payload })
}

/// `fs.roots-response`: `{ requestId, roots }`.
pub fn roots_response(request_id: Option<Value>, roots: Vec<Value>) -> Value {
    let mut payload = Map::new();
    with_request_id(&mut payload, request_id);
    payload.insert("roots".to_string(), Value::Array(roots));
    json!({ "type": ResponseKind::FsRoots.message_type(), "payload": payload })
}

/// Terminal responses are only sent when the request carried a `requestId`
/// (TS: `if (requestId) this.send(...)`).
pub fn terminal_result_response(request_id: Option<Value>, result: Value) -> Option<Value> {
    request_id.map(|id| result_response(ResponseKind::TerminalOp, Some(id), result))
}

/// Terminal error responses follow the same `if (requestId)` guard.
pub fn terminal_error_response(request_id: Option<Value>, error: &str) -> Option<Value> {
    request_id.map(|id| error_response(ResponseKind::TerminalOp, Some(id), error))
}

/// `{ type: "terminal.output", payload: { terminalId, data } }`.
pub fn terminal_output_message(terminal_id: &str, data: &str) -> Value {
    json!({
        "type": "terminal.output",
        "payload": { "terminalId": terminal_id, "data": data },
    })
}

/// `{ type: "terminal.exit", payload: { terminalId, exitCode, signal } }`.
pub fn terminal_exit_message(
    terminal_id: &str,
    exit_code: Option<i64>,
    signal: Option<&str>,
) -> Value {
    json!({
        "type": "terminal.exit",
        "payload": { "terminalId": terminal_id, "exitCode": exit_code, "signal": signal },
    })
}

/// `{ ok: false, message: "Terminal is not running" }`.
pub fn not_running_result() -> Value {
    json!({ "ok": false, "message": Error::TerminalNotRunning.to_string() })
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Reject tools this node does not advertise.
pub fn check_tool(tool: &str) -> Result<(), Error> {
    if NODE_TOOLS.contains(&tool) {
        Ok(())
    } else {
        Err(Error::UnsupportedTool(tool.to_string()))
    }
}

/// Reject filesystem operations outside the switch in TS.
pub fn check_fs_op(op: &str) -> Result<(), Error> {
    if FS_OPS.contains(&op) {
        Ok(())
    } else {
        Err(Error::UnsupportedFsOp(op.to_string()))
    }
}

/// Required-argument checks that the TS performs inside individual `fsOp` arms.
pub fn validate_fs_op_args(op: &str, args: &Map<String, Value>) -> Result<(), Error> {
    match op {
        "search-project" => {
            let pattern = args
                .get("pattern")
                .or_else(|| args.get("query"))
                .map(|value| js_string(Some(value)))
                .unwrap_or_default();
            if js_trim(&pattern).is_empty() {
                Err(Error::MissingSearchText)
            } else {
                Ok(())
            }
        }
        "git" | "gh" => {
            let raw = args.get("args").map(|value| js_string(Some(value)));
            let present = raw
                .as_deref()
                .map(|value| !value.is_empty())
                .unwrap_or(false);
            if present {
                Ok(())
            } else if op == "git" {
                Err(Error::MissingGitArgs)
            } else {
                Err(Error::MissingGhArgs)
            }
        }
        _ => Ok(()),
    }
}

/// `const command = String(args["command"] ?? ""); if (!command.trim()) throw`.
pub fn command_string(args: &Map<String, Value>) -> Result<String, Error> {
    let command = js_string(args.get("command"));
    if js_trim(&command).is_empty() {
        Err(Error::MissingCommand)
    } else {
        Ok(command)
    }
}

/// `Math.max(Number(args["timeout"]) || 30_000, 0)`.
pub fn command_timeout_ms(value: Option<&Value>) -> u64 {
    let parsed = match value {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(0.0),
        Some(Value::String(text)) => js_trim(text).parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    };
    let effective = if parsed == 0.0 || parsed.is_nan() {
        DEFAULT_COMMAND_TIMEOUT_MS as f64
    } else {
        parsed
    };
    if effective <= 0.0 {
        0
    } else {
        effective.min(u64::MAX as f64) as u64
    }
}

/// `resolve(String(args["cwd"] ?? args["projectRoot"] ?? projectRoot ?? cwd))`.
pub fn command_cwd(
    args: &Map<String, Value>,
    project_root: Option<&str>,
    process_cwd: &Path,
) -> PathBuf {
    let candidate = args
        .get("cwd")
        .or_else(|| args.get("projectRoot"))
        .map(|value| js_string(Some(value)))
        .or_else(|| project_root.map(|value| value.to_string()));
    match candidate {
        Some(value) if !value.is_empty() => PathBuf::from(value),
        _ => process_cwd.to_path_buf(),
    }
}

/// Keep only the trailing `BACKGROUND_MAX_OUTPUT_CHARS` characters.
pub fn append_output_tail(buffer: &mut String, chunk: &str) {
    buffer.push_str(chunk);
    let count = buffer.chars().count();
    if count > BACKGROUND_MAX_OUTPUT_CHARS * 2 {
        let skip = count - BACKGROUND_MAX_OUTPUT_CHARS;
        *buffer = buffer.chars().skip(skip).collect();
    }
}

/// Report the trimmed tail, marking truncation, or `(no output)`.
pub fn background_output_tail(output: &str) -> String {
    let trimmed = output.trim();
    if trimmed.is_empty() {
        return "(no output)".to_string();
    }
    let count = trimmed.chars().count();
    if count > BACKGROUND_MAX_OUTPUT_CHARS {
        let skip = count - BACKGROUND_MAX_OUTPUT_CHARS;
        let tail: String = trimmed.chars().skip(skip).collect();
        format!("…(truncated)\n{tail}")
    } else {
        trimmed.to_string()
    }
}

/// `{ type: "tool.background-complete", payload: { backgroundId, exitCode, output } }`.
pub fn background_complete_message(
    background_id: &str,
    exit_code: Option<i64>,
    output: &str,
) -> Value {
    json!({
        "type": "tool.background-complete",
        "payload": {
            "backgroundId": background_id,
            "exitCode": exit_code,
            "output": background_output_tail(output),
        },
    })
}

// ---------------------------------------------------------------------------
// Terminal protocol
// ---------------------------------------------------------------------------

/// What the host needs to spawn one terminal surface.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TerminalSpawn {
    pub terminal_id: String,
    pub project_root: String,
    pub session_id: String,
    pub shell: Option<String>,
    pub cols: u32,
    pub rows: u32,
}

/// What the node knows about a locally running terminal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TerminalSnapshot {
    pub pid: Option<u32>,
    pub shell: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TerminalOp {
    Start {
        terminal_id: String,
        reuse_only: bool,
        project_root: String,
        session_id: String,
        shell: Option<String>,
        cols: u32,
        rows: u32,
    },
    Input {
        terminal_id: String,
        data: String,
    },
    Resize {
        terminal_id: String,
        cols: u32,
        rows: u32,
    },
    Stop {
        terminal_id: String,
    },
}

fn number_field(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(number)) => number.as_f64(),
        _ => None,
    }
}

fn boolean_field(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Bool(true)))
}

/// Parse and validate a `terminal.op-request` body. `terminalId` is required for
/// every op, `reuseOnly` only for `start`.
pub fn parse_terminal_op(op: &str, params: &Map<String, Value>) -> Result<TerminalOp, Error> {
    let terminal_id = js_string(params.get("terminalId"));
    if terminal_id.is_empty() {
        return Err(Error::MissingTerminalId);
    }
    match op {
        "start" => {
            let project_root = params
                .get("projectRoot")
                .map(|value| js_string(Some(value)))
                .filter(|value| !value.is_empty())
                .unwrap_or_default();
            let session_id = params
                .get("sessionId")
                .map(|value| js_string(Some(value)))
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "default".to_string());
            let shell = match params.get("shell") {
                Some(Value::String(text)) => Some(text.clone()),
                _ => None,
            };
            let cols = number_field(params.get("cols"))
                .map(|n| n.max(0.0) as u32)
                .unwrap_or(120);
            let rows = number_field(params.get("rows"))
                .map(|n| n.max(0.0) as u32)
                .unwrap_or(30);
            Ok(TerminalOp::Start {
                terminal_id,
                reuse_only: boolean_field(params.get("reuseOnly")),
                project_root,
                session_id,
                shell,
                cols,
                rows,
            })
        }
        "input" => Ok(TerminalOp::Input {
            terminal_id,
            data: js_string(params.get("data")),
        }),
        "resize" => Ok(TerminalOp::Resize {
            terminal_id,
            cols: number_field(params.get("cols"))
                .map(|n| n.max(0.0) as u32)
                .unwrap_or(0),
            rows: number_field(params.get("rows"))
                .map(|n| n.max(0.0) as u32)
                .unwrap_or(0),
        }),
        "stop" => Ok(TerminalOp::Stop { terminal_id }),
        other => Err(Error::UnsupportedTerminalOp(other.to_string())),
    }
}

/// Outcome of the `start` arm: reuse the running surface or spawn a new one.
#[derive(Clone, Debug, PartialEq)]
pub enum StartDecision {
    Reused(Value),
    Create,
}

/// `start` arm: an existing session is reported as `reused: true`; a
/// `reuseOnly` request for a missing session is an error.
pub fn decide_start(
    snapshot: Option<&TerminalSnapshot>,
    reuse_only: bool,
    terminal_id: &str,
) -> Result<StartDecision, Error> {
    match snapshot {
        Some(snapshot) => Ok(StartDecision::Reused(json!({
            "ok": true,
            "pid": snapshot.pid,
            "shell": snapshot.shell,
            "reused": true,
        }))),
        None if reuse_only => Err(Error::TerminalNotOnNode(terminal_id.to_string())),
        None => Ok(StartDecision::Create),
    }
}

// ---------------------------------------------------------------------------
// Host seam
// ---------------------------------------------------------------------------

/// Everything the link needs from the platform. See the module docs for the host
/// port names and argument shapes each method maps to.
pub trait PrimaryLinkHost: Send + Sync {
    fn state_directory(&self) -> PathBuf;
    fn read_state_file(&self, path: &Path) -> Result<Option<String>, String>;
    fn write_state_file(&self, path: &Path, contents: &str) -> Result<(), String>;
    fn ensure_parent_dir(&self, path: &Path) -> Result<(), String>;
    fn hostname(&self) -> String;

    fn open_socket(&self, url: &str) -> Result<(), String>;
    fn send_text(&self, message: &Value) -> Result<(), String>;
    fn close_socket(&self);

    fn browse(&self, path: &str) -> Result<Map<String, Value>, String>;
    fn fs_roots(&self) -> Vec<Value>;
    fn run_fs_op(&self, op: &str, args: &Map<String, Value>) -> Result<Value, String>;
    fn run_tool(&self, tool: &str, args: &Map<String, Value>) -> Result<Value, String>;

    fn spawn_terminal(&self, spawn: &TerminalSpawn) -> Result<TerminalSnapshot, String>;
    fn terminal_input(&self, terminal_id: &str, data: &str) -> Result<(), String>;
    fn resize_terminal(&self, terminal_id: &str, cols: u32, rows: u32) -> Result<(), String>;
    fn stop_terminal(&self, terminal_id: &str, reason: &str) -> Result<(), String>;
}

/// Construction options, mirroring `PrimaryLinkOptions`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PrimaryLinkOptions {
    pub primary_gateway: String,
    pub primary_token: Option<String>,
    pub node_name: Option<String>,
    pub providers: Vec<String>,
}

impl PrimaryLinkOptions {
    pub fn new(primary_gateway: impl Into<String>) -> Self {
        Self {
            primary_gateway: primary_gateway.into(),
            primary_token: None,
            node_name: None,
            providers: Vec::new(),
        }
    }
}

/// The link state machine: no sockets, no timers, no processes.
pub struct PrimaryLink {
    opts: PrimaryLinkOptions,
    host: Arc<dyn PrimaryLinkHost>,
    node_id: NodeId,
    platform: FsPlatform,
    stopped: bool,
    connected: bool,
    reconnect_delay_ms: u64,
    max_reconnect_delay_ms: u64,
    sessions: HashMap<String, TerminalSnapshot>,
}

impl PrimaryLink {
    pub fn new(
        opts: PrimaryLinkOptions,
        host: Arc<dyn PrimaryLinkHost>,
        platform: FsPlatform,
    ) -> Self {
        let state_directory = host.state_directory();
        let id_path = node_id_path(&state_directory);
        let existing = host.read_state_file(&id_path).ok().flatten();
        let generate = || {
            let id = generate_node_id(&uuid_like());
            host.ensure_parent_dir(&id_path).ok()?;
            host.write_state_file(&id_path, &id).ok()?;
            Some(id)
        };
        let node_id = resolve_node_id(existing.as_deref(), generate(), &host.hostname());
        Self {
            opts,
            host,
            node_id,
            platform,
            stopped: false,
            connected: false,
            reconnect_delay_ms: INITIAL_RECONNECT_DELAY_MS,
            max_reconnect_delay_ms: MAX_RECONNECT_DELAY_MS,
            sessions: HashMap::new(),
        }
    }

    pub fn node_id(&self) -> &str {
        &self.node_id.id
    }

    pub fn node_id_source(&self) -> NodeIdSource {
        self.node_id.source
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }

    pub fn is_stopped(&self) -> bool {
        self.stopped
    }

    pub fn reconnect_delay_ms(&self) -> u64 {
        self.reconnect_delay_ms
    }

    pub fn terminal_ids(&self) -> Vec<&str> {
        self.sessions.keys().map(String::as_str).collect()
    }

    fn credential_path(&self) -> PathBuf {
        credential_path(&self.host.state_directory(), &self.opts.primary_gateway)
    }

    /// `pairedToken()` against the persisted pairing file.
    fn paired_token(&self) -> Option<String> {
        let stored = self
            .host
            .read_state_file(&self.credential_path())
            .ok()
            .flatten();
        paired_token(
            stored.as_deref(),
            &self.node_id.id,
            self.opts.primary_token.as_deref(),
        )
    }

    /// `start()` — a stopped link stays stopped.
    pub fn start(&mut self) -> Result<(), Error> {
        if self.stopped {
            return Ok(());
        }
        self.connect()
    }

    /// `stop()` — stop terminals, close the socket, never reconnect again.
    pub fn stop(&mut self) -> Vec<Error> {
        self.stopped = true;
        self.connected = false;
        let mut failures = Vec::new();
        let mut ids: Vec<String> = self.sessions.keys().cloned().collect();
        ids.sort();
        for id in ids {
            if let Err(message) = self.host.stop_terminal(&id, "primary link stopped") {
                failures.push(Error::Host(message));
            }
        }
        self.sessions.clear();
        self.host.close_socket();
        failures
    }

    /// `connect()` — open the socket with the paired token and the display log
    /// line; a throw schedules a reconnect instead of propagating.
    pub fn connect(&mut self) -> Result<(), Error> {
        let url = to_ws_url(&self.opts.primary_gateway, self.paired_token().as_deref());
        let display = redact_token(&url);
        tracing_log(&format!(
            "[primary-link] connecting to primary gateway {display} as node {}",
            self.node_id.id
        ));
        match self.host.open_socket(&url) {
            Ok(()) => Ok(()),
            Err(message) => {
                tracing_log(&format!("[primary-link] failed to open WS: {message}"));
                self.schedule_reconnect();
                Err(Error::Host(message))
            }
        }
    }

    /// `scheduleReconnect()` — returns the delay to arm; the caller owns the timer.
    pub fn schedule_reconnect(&mut self) -> u64 {
        let delay = self.reconnect_delay_ms;
        self.reconnect_delay_ms =
            next_reconnect_delay(self.reconnect_delay_ms, self.max_reconnect_delay_ms);
        delay
    }

    /// `ws.on("open")` — reset backoff, then announce the node twice, in order.
    pub fn handle_open(&mut self) -> Result<(), Error> {
        self.reconnect_delay_ms = INITIAL_RECONNECT_DELAY_MS;
        self.connected = true;
        tracing_log("[primary-link] connected — registering fs node");
        let name = node_name(self.opts.node_name.as_deref(), &self.host.hostname());
        let hello = hello_payload(&self.node_id.id, &name, self.platform, &self.opts.providers);
        self.send(&hello)?;
        let register =
            register_node_payload(&self.node_id.id, &name, self.platform, &self.opts.providers);
        self.send(&register)
    }

    pub fn send(&self, message: &Value) -> Result<(), Error> {
        self.host.send_text(message).map_err(Error::Host)
    }

    /// Serve one inbound frame; returns the outbound frames to send, in order.
    pub fn handle_message(&mut self, message: &Value) -> Vec<Value> {
        match parse_inbound(message) {
            Inbound::Ignored => Vec::new(),
            Inbound::FsBrowseRequest { request_id, path } => match self.host.browse(&path) {
                Ok(result) => vec![browse_response(request_id, result)],
                Err(message) => vec![error_response(ResponseKind::FsBrowse, request_id, &message)],
            },
            Inbound::FsRootsRequest { request_id } => {
                vec![roots_response(request_id, self.host.fs_roots())]
            }
            Inbound::FsOpRequest {
                request_id,
                op,
                args,
            } => {
                let outcome = check_fs_op(&op)
                    .and_then(|()| validate_fs_op_args(&op, &args))
                    .and_then(|()| self.host.run_fs_op(&op, &args).map_err(Error::Host));
                vec![match outcome {
                    Ok(result) => result_response(ResponseKind::FsOp, request_id, result),
                    Err(error) => {
                        error_response(ResponseKind::FsOp, request_id, &error.to_string())
                    }
                }]
            }
            Inbound::ToolOpRequest {
                request_id,
                tool,
                args,
            } => {
                let outcome = check_tool(&tool)
                    .and_then(|()| self.host.run_tool(&tool, &args).map_err(Error::Host));
                vec![match outcome {
                    Ok(result) => result_response(ResponseKind::ToolOp, request_id, result),
                    Err(error) => {
                        error_response(ResponseKind::ToolOp, request_id, &error.to_string())
                    }
                }]
            }
            Inbound::TerminalOpRequest {
                request_id,
                op,
                params,
            } => match self.terminal_op(&op, &params) {
                Ok(result) => terminal_result_response(request_id, result)
                    .into_iter()
                    .collect(),
                Err(error) => terminal_error_response(request_id, &error.to_string())
                    .into_iter()
                    .collect(),
            },
        }
    }

    fn terminal_op(&mut self, op: &str, params: &Map<String, Value>) -> Result<Value, Error> {
        match parse_terminal_op(op, params)? {
            TerminalOp::Start {
                terminal_id,
                reuse_only,
                project_root,
                session_id,
                shell,
                cols,
                rows,
            } => match decide_start(self.sessions.get(&terminal_id), reuse_only, &terminal_id)? {
                StartDecision::Reused(value) => Ok(value),
                StartDecision::Create => {
                    let spawn = TerminalSpawn {
                        terminal_id: terminal_id.clone(),
                        project_root,
                        session_id,
                        shell,
                        cols,
                        rows,
                    };
                    let snapshot = self.host.spawn_terminal(&spawn).map_err(Error::Host)?;
                    self.sessions.insert(terminal_id, snapshot.clone());
                    Ok(json!({
                        "ok": true,
                        "pid": snapshot.pid,
                        "shell": snapshot.shell,
                        "reused": false,
                    }))
                }
            },
            TerminalOp::Input { terminal_id, data } => {
                if !self.sessions.contains_key(&terminal_id) {
                    return Ok(not_running_result());
                }
                self.host
                    .terminal_input(&terminal_id, &data)
                    .map_err(Error::Host)?;
                Ok(json!({ "ok": true }))
            }
            TerminalOp::Resize {
                terminal_id,
                cols,
                rows,
            } => {
                if !self.sessions.contains_key(&terminal_id) {
                    return Ok(not_running_result());
                }
                self.host
                    .resize_terminal(&terminal_id, cols, rows)
                    .map_err(Error::Host)?;
                Ok(json!({ "ok": true }))
            }
            TerminalOp::Stop { terminal_id } => {
                if self.sessions.remove(&terminal_id).is_none() {
                    return Ok(not_running_result());
                }
                self.host
                    .stop_terminal(&terminal_id, "requested by primary gateway")
                    .map_err(Error::Host)?;
                Ok(json!({ "ok": true }))
            }
        }
    }
}

/// Process-wide log line. The TS uses `console.log`/`console.error`; the crate
/// keeps its own sink so tests stay quiet.
fn tracing_log(line: &str) {
    if js_trim(&std::env::var("JAIT_PRIMARY_LINK_LOG").unwrap_or_default()) == "1" {
        eprintln!("{line}");
    }
}

/// A v4-shaped id is not available without a uuid dependency; the host may pass
/// a deterministic value in tests by pre-seeding `<state>/node-id`.
fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let pid = std::process::id();
    let digest = Sha256::digest(format!("{nanos:x}:{pid}").as_bytes());
    let hex = hex_lower(digest.as_slice());
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

// ---------------------------------------------------------------------------
// Project search bridge (`runPrimaryProjectSearch` / `runPrimarySearchTool`)
// ---------------------------------------------------------------------------
//
// The TS file imports `searchProject`, `normalizeProjectSearchLimit`,
// `PROJECT_SEARCH_DEFAULT_RESULTS` and `ProjectSearchUnavailableError` from
// `services/project-search.ts` — a host capability with no reachable native
// counterpart (the Rust `services/project_search` tree is present on disk but is
// not declared as a module yet).  The functions below therefore take a
// [`ProjectSearchBridge`] seam; a wiring layer adapts it onto
// `services::project_search::search_project` once that module is registered.
// Everything else (limit normalisation, message strings, retry ordering) is
// transcribed verbatim.

/// `PROJECT_SEARCH_DEFAULT_RESULTS`.
pub const PROJECT_SEARCH_DEFAULT_RESULTS: usize = 20;
/// `PROJECT_SEARCH_MAX_RESULTS`.
pub const PROJECT_SEARCH_MAX_RESULTS: usize = 200;
/// Default limit used by the `search-project` filesystem op in the TS (`50`).
pub const SEARCH_PROJECT_OP_DEFAULT_LIMIT: usize = 50;

/// `ProjectSearchMode` from the TS search service.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ProjectSearchMode {
    Files,
    #[default]
    Content,
}

impl ProjectSearchMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Files => "files",
            Self::Content => "content",
        }
    }
}

/// One element of the TS `SearchResult["files"]` array.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RawFileHit {
    pub path: String,
    pub relative_path: String,
    pub name: String,
    pub score: i32,
}

/// One element of the TS `SearchResult["matches"]` array.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RawContentHit {
    pub file: String,
    pub relative_path: String,
    pub line: usize,
    pub content: String,
    pub score: i32,
}

/// TS `SearchResult` as returned by the host's `searchProject()`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RawSearchResult {
    Files {
        query: String,
        files: Vec<RawFileHit>,
        limited: bool,
    },
    Content {
        query: String,
        matches: Vec<RawContentHit>,
        limited: bool,
    },
}

/// Argument of [`ProjectSearchBridge::search_project`]; mirrors the TS
/// `searchProject(options)` options bag.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ProjectSearchRequest {
    pub root: PathBuf,
    pub query: String,
    pub mode: ProjectSearchMode,
    pub limit: Option<usize>,
    pub include: Option<String>,
    pub is_regexp: bool,
    pub include_ignored_files: bool,
}

/// A rejected search. `reason` is only set for `ProjectSearchUnavailableError`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProjectSearchFailure {
    pub message: String,
    pub reason: Option<String>,
}

impl ProjectSearchFailure {
    /// `ProjectSearchInputError` / plain `Error`.
    pub fn input(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            reason: None,
        }
    }

    /// `ProjectSearchUnavailableError`.
    pub fn unavailable(message: impl Into<String>, reason: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            reason: Some(reason.into()),
        }
    }
}

impl std::fmt::Display for ProjectSearchFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for ProjectSearchFailure {}

/// Host seam for `searchProject()`.
pub trait ProjectSearchBridge {
    fn search_project(
        &self,
        request: &ProjectSearchRequest,
    ) -> Result<RawSearchResult, ProjectSearchFailure>;
}

/// One file of [`PrimaryProjectSearchResult::Files`].
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct PrimarySearchFile {
    pub path: String,
    pub name: String,
}

/// One match of [`PrimaryProjectSearchResult::Content`].
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct PrimarySearchMatch {
    pub file: String,
    pub line: usize,
    pub content: String,
}

/// TS `PrimaryProjectSearchResult` (relative paths, no scores).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum PrimaryProjectSearchResult {
    Files {
        query: String,
        limited: bool,
        files: Vec<PrimarySearchFile>,
    },
    Content {
        query: String,
        limited: bool,
        matches: Vec<PrimarySearchMatch>,
    },
}

impl PrimaryProjectSearchResult {
    pub fn query(&self) -> &str {
        match self {
            Self::Files { query, .. } | Self::Content { query, .. } => query,
        }
    }

    pub fn limited(&self) -> bool {
        match self {
            Self::Files { limited, .. } | Self::Content { limited, .. } => *limited,
        }
    }
}

/// Options bag of [`run_primary_project_search`].
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PrimaryProjectSearchOptions {
    pub root: PathBuf,
    pub query: String,
    pub mode: ProjectSearchMode,
    pub limit: Option<usize>,
    pub include: Option<String>,
    pub is_regexp: bool,
    pub include_ignored_files: bool,
}

impl PrimaryProjectSearchOptions {
    fn request(&self) -> ProjectSearchRequest {
        ProjectSearchRequest {
            root: self.root.clone(),
            query: self.query.clone(),
            mode: self.mode,
            limit: self.limit,
            include: self.include.clone(),
            is_regexp: self.is_regexp,
            include_ignored_files: self.include_ignored_files,
        }
    }
}

/// `normalizeProjectSearchLimit(value, fallback)`.
pub fn normalize_project_search_limit(
    value: Option<&Value>,
    fallback: usize,
) -> Result<usize, ProjectSearchFailure> {
    let candidate = match value {
        None | Some(Value::Null) => Some(fallback as f64),
        Some(Value::String(text)) if text.is_empty() => Some(fallback as f64),
        Some(other) => number_coerce(other),
    };
    let candidate = match candidate {
        Some(number) if number.is_finite() && number.fract() == 0.0 && number >= 1.0 => number,
        _ => {
            return Err(ProjectSearchFailure::input(
                "limit must be a positive integer",
            ));
        }
    };
    Ok((candidate as usize).min(PROJECT_SEARCH_MAX_RESULTS))
}

/// JS `Number(value)`; `None` stands for `NaN`.
fn number_coerce(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::Bool(flag) => Some(if *flag { 1.0 } else { 0.0 }),
        Value::String(text) => {
            let trimmed = js_trim(text);
            if trimmed.is_empty() {
                Some(0.0)
            } else {
                trimmed.parse::<f64>().ok()
            }
        }
        _ => None,
    }
}

/// `runPrimaryProjectSearch(options)`.
pub fn run_primary_project_search(
    bridge: &dyn ProjectSearchBridge,
    options: PrimaryProjectSearchOptions,
) -> Result<PrimaryProjectSearchResult, ProjectSearchFailure> {
    let result = bridge.search_project(&options.request())?;
    Ok(match result {
        RawSearchResult::Files {
            query,
            files,
            limited,
        } => PrimaryProjectSearchResult::Files {
            query,
            limited,
            files: files
                .into_iter()
                .map(|hit| PrimarySearchFile {
                    path: hit.relative_path,
                    name: hit.name,
                })
                .collect(),
        },
        RawSearchResult::Content {
            query,
            matches,
            limited,
        } => PrimaryProjectSearchResult::Content {
            query,
            limited,
            matches: matches
                .into_iter()
                .map(|hit| PrimarySearchMatch {
                    file: hit.relative_path,
                    line: hit.line,
                    content: hit.content,
                })
                .collect(),
        },
    })
}

/// `fsOp("search-project", params)` in the TS.
pub fn search_project_op(
    bridge: &dyn ProjectSearchBridge,
    params: &Map<String, Value>,
) -> Result<PrimaryProjectSearchResult, ProjectSearchFailure> {
    let cwd = std::env::current_dir().unwrap_or_default();
    let requested = js_string(params.get("path"));
    let mode = match params.get("mode") {
        Some(Value::String(value)) if value == "content" => ProjectSearchMode::Content,
        _ => ProjectSearchMode::Files,
    };
    run_primary_project_search(
        bridge,
        PrimaryProjectSearchOptions {
            root: resolve_against(&cwd, &requested),
            query: js_string(params.get("query")),
            mode,
            limit: Some(normalize_project_search_limit(
                params.get("limit"),
                SEARCH_PROJECT_OP_DEFAULT_LIMIT,
            )?),
            include: None,
            is_regexp: false,
            include_ignored_files: matches!(
                params.get("includeIgnoredFiles"),
                Some(Value::Bool(true))
            ),
        },
    )
}

fn home_directory() -> PathBuf {
    std::env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_default()
}

/// JS `resolve(base, requested)`.
fn resolve_against(base: &Path, requested: &str) -> PathBuf {
    let candidate = Path::new(requested);
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        base.join(candidate)
    };
    let mut normalized = PathBuf::new();
    for component in joined.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

fn content_hits(
    result: RawSearchResult,
) -> Result<(Vec<RawContentHit>, bool), ProjectSearchFailure> {
    match result {
        RawSearchResult::Content {
            matches, limited, ..
        } => Ok((matches, limited)),
        RawSearchResult::Files { .. } => Err(ProjectSearchFailure::input(
            "Unexpected project search mode",
        )),
    }
}

/// `runPrimarySearchTool(args, projectRoot)` — returns a `ToolResult` value.
pub fn run_primary_search_tool(
    bridge: &dyn ProjectSearchBridge,
    args: &Map<String, Value>,
    project_root: Option<&Path>,
) -> Value {
    let pattern = match args.get("pattern") {
        Some(Value::Null) | None => js_string(args.get("query")),
        Some(Value::String(text)) => text.clone(),
        Some(other) => other.to_string(),
    };
    let mode = match args.get("mode") {
        Some(Value::String(value)) if value == "files" => ProjectSearchMode::Files,
        _ => ProjectSearchMode::Content,
    };
    let base_root = match project_root {
        Some(root) => root.to_path_buf(),
        None => home_directory(),
    };
    let requested_path = match args.get("path") {
        Some(Value::String(text)) => text.clone(),
        _ => String::new(),
    };
    let root = if requested_path.is_empty() {
        base_root
    } else {
        resolve_against(&base_root, &requested_path)
    };

    match run_search_tool_inner(bridge, args, &root, &pattern, mode) {
        Ok(value) => value,
        Err(failure) => match failure.reason {
            Some(reason) => json!({
                "ok": false,
                "message": failure.message,
                "data": { "reason": reason },
            }),
            None => json!({ "ok": false, "message": failure.message }),
        },
    }
}

fn run_search_tool_inner(
    bridge: &dyn ProjectSearchBridge,
    args: &Map<String, Value>,
    root: &Path,
    pattern: &str,
    mode: ProjectSearchMode,
) -> Result<Value, ProjectSearchFailure> {
    let limit = normalize_project_search_limit(args.get("limit"), PROJECT_SEARCH_DEFAULT_RESULTS)?;
    let include = match args.get("include") {
        Some(Value::String(text)) => Some(text.clone()),
        _ => None,
    };
    let include_ignored_files = matches!(args.get("includeIgnoredFiles"), Some(Value::Bool(true)));
    let limit_suffix =
        format!(" (stopped at the {limit}-result limit — narrow the pattern to see the rest)");

    if mode == ProjectSearchMode::Files {
        let result = bridge.search_project(&ProjectSearchRequest {
            root: root.to_path_buf(),
            query: pattern.to_string(),
            mode,
            limit: Some(limit),
            include: None,
            is_regexp: false,
            include_ignored_files,
        })?;
        let (files, limited) = match result {
            RawSearchResult::Files { files, limited, .. } => (files, limited),
            RawSearchResult::Content { .. } => {
                return Err(ProjectSearchFailure::input(
                    "Unexpected project search mode",
                ));
            }
        };
        let files: Vec<String> = files.into_iter().map(|hit| hit.path).collect();
        let suffix = if limited { limit_suffix } else { String::new() };
        let message = if files.is_empty() {
            format!("No files matching \"{pattern}\"")
        } else {
            format!(
                "Found {} file{} matching \"{pattern}\"{suffix}",
                files.len(),
                if files.len() == 1 { "" } else { "s" }
            )
        };
        return Ok(json!({
            "ok": true,
            "message": message,
            "data": { "pattern": pattern, "files": files },
        }));
    }

    let run_content_search = |is_regexp: bool| {
        bridge.search_project(&ProjectSearchRequest {
            root: root.to_path_buf(),
            query: pattern.to_string(),
            mode: ProjectSearchMode::Content,
            limit: Some(limit),
            include: include.clone(),
            is_regexp,
            include_ignored_files,
        })
    };

    let initial_mode = matches!(args.get("isRegexp"), Some(Value::Bool(true)));
    let mut retried_as: Option<&'static str> = None;
    let (mut hits, mut limited) = content_hits(run_content_search(initial_mode)?)?;
    if hits.is_empty() {
        // Opportunistic retry with the opposite interpretation; if the pattern is
        // not valid the other way, keep the original empty result.
        if let Ok(retry) = run_content_search(!initial_mode)
            && let Ok((retry_hits, retry_limited)) = content_hits(retry)
            && !retry_hits.is_empty()
        {
            hits = retry_hits;
            limited = retry_limited;
            retried_as = Some(if initial_mode { "literal" } else { "regex" });
        }
    }
    let matches: Vec<PrimarySearchMatch> = hits
        .into_iter()
        .map(|hit| PrimarySearchMatch {
            file: hit.relative_path,
            line: hit.line,
            content: hit.content,
        })
        .collect();
    let retry_suffix = match retried_as {
        Some(kind) => format!(" (retried as {kind})"),
        None => String::new(),
    };
    let message = if matches.is_empty() {
        format!("No matches for \"{pattern}\"")
    } else {
        format!(
            "Found {} match{} for \"{pattern}\"{}{retry_suffix}",
            matches.len(),
            if matches.len() == 1 { "" } else { "es" },
            if limited { limit_suffix.as_str() } else { "" }
        )
    };
    Ok(json!({
        "ok": true,
        "message": message,
        "data": { "pattern": pattern, "matches": matches },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_ws_url_normalizes_schemes_and_token() {
        assert_eq!(
            to_ws_url("https://primary.example/", None),
            "wss://primary.example"
        );
        assert_eq!(
            to_ws_url("HTTP://primary.example//", None),
            "ws://primary.example"
        );
        assert_eq!(to_ws_url("primary.example", None), "ws://primary.example");
        assert_eq!(
            to_ws_url("wss://primary.example", Some("a b/c")),
            "wss://primary.example?token=a%20b%2Fc"
        );
        assert_eq!(to_ws_url("  ws://host  ", Some("")), "ws://host");
    }

    #[test]
    fn redact_token_hides_only_the_credential() {
        assert_eq!(
            redact_token("ws://h?token=secret&x=1"),
            "ws://h?token=***&x=1"
        );
        assert_eq!(redact_token("ws://h?token=secret"), "ws://h?token=***");
        assert_eq!(redact_token("ws://h"), "ws://h");
    }

    #[test]
    fn detect_platform_maps_node_platforms() {
        assert_eq!(detect_platform("win32"), FsPlatform::Windows);
        assert_eq!(detect_platform("darwin"), FsPlatform::Macos);
        assert_eq!(detect_platform("linux"), FsPlatform::Linux);
        assert_eq!(detect_platform("freebsd"), FsPlatform::Linux);
    }

    #[test]
    fn paired_token_prefers_a_matching_stored_credential() {
        let stored = r#"{"nodeId":"node-a","credential":"saved"}"#;
        assert_eq!(
            paired_token(Some(stored), "node-a", Some("configured")),
            Some("saved".to_string())
        );
        assert_eq!(
            paired_token(Some(stored), "node-b", Some("configured")),
            Some("configured".to_string())
        );
        assert_eq!(paired_token(Some("not json"), "node-a", None), None);
        assert_eq!(
            paired_token(None, "node-a", Some("configured")),
            Some("configured".to_string())
        );
    }

    #[test]
    fn credential_path_is_stable_and_24_hex_chars() {
        let path = credential_path(Path::new("/state"), "https://primary.example");
        assert_eq!(path.parent(), Some(Path::new("/state/node-pairings")));
        let stem = path.file_stem().unwrap().to_string_lossy().to_string();
        assert_eq!(stem.len(), CREDENTIAL_HASH_PREFIX);
        assert!(stem.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(
            path,
            credential_path(Path::new("/state"), "https://primary.example")
        );
    }

    #[test]
    fn resolve_node_id_reuses_then_generates_then_falls_back() {
        let persisted = resolve_node_id(Some(" node-abc\n"), Some("node-new".into()), "host");
        assert_eq!(persisted.id, "node-abc");
        assert_eq!(persisted.source, NodeIdSource::Persisted);

        let generated = resolve_node_id(Some("   "), Some("node-new".into()), "host");
        assert_eq!(generated.id, "node-new");
        assert_eq!(generated.source, NodeIdSource::Generated);

        let fallback = resolve_node_id(None, None, "host");
        assert_eq!(fallback.id, "node-host");
        assert_eq!(fallback.source, NodeIdSource::Fallback);
    }

    #[test]
    fn reconnect_delay_doubles_and_clamps() {
        assert_eq!(
            next_reconnect_delay(INITIAL_RECONNECT_DELAY_MS, MAX_RECONNECT_DELAY_MS),
            2_000
        );
        assert_eq!(
            next_reconnect_delay(20_000, MAX_RECONNECT_DELAY_MS),
            MAX_RECONNECT_DELAY_MS
        );
        assert_eq!(node_name(Some("  "), "host"), "host");
        assert_eq!(node_name(Some(" custom "), "host"), "custom");
    }

    #[test]
    fn parse_terminal_op_requires_ids_and_defaults_geometry() {
        assert_eq!(
            parse_terminal_op("start", &Map::new()),
            Err(Error::MissingTerminalId)
        );
        let mut params = Map::new();
        params.insert("terminalId".into(), json!("t1"));
        params.insert("reuseOnly".into(), json!(true));
        assert_eq!(
            parse_terminal_op("start", &params),
            Ok(TerminalOp::Start {
                terminal_id: "t1".into(),
                reuse_only: true,
                project_root: String::new(),
                session_id: "default".into(),
                shell: None,
                cols: 120,
                rows: 30,
            })
        );
        assert_eq!(
            parse_terminal_op("nope", &params).unwrap_err().to_string(),
            "Unsupported terminal op: nope"
        );
    }

    #[test]
    fn start_decision_prefers_reuse_and_guards_reuse_only() {
        let snapshot = TerminalSnapshot {
            pid: Some(42),
            shell: Some("/bin/zsh".into()),
        };
        match decide_start(Some(&snapshot), true, "t1").unwrap() {
            StartDecision::Reused(value) => {
                assert_eq!(value["reused"], json!(true));
                assert_eq!(value["pid"], json!(42));
                assert_eq!(value["shell"], json!("/bin/zsh"));
            }
            StartDecision::Create => panic!("expected reuse"),
        }
        assert_eq!(decide_start(None, false, "t1"), Ok(StartDecision::Create));
        assert_eq!(
            decide_start(None, true, "t1").unwrap_err().to_string(),
            "Terminal t1 is not running on this node"
        );
    }

    #[test]
    fn validation_messages_match_the_typescript_strings() {
        assert_eq!(
            check_tool("provider.chat").unwrap_err().to_string(),
            "Unsupported tool on node: provider.chat"
        );
        assert_eq!(check_tool("terminal.run"), Ok(()));
        assert_eq!(
            check_fs_op("rm-rf").unwrap_err().to_string(),
            "Unsupported fs op: rm-rf"
        );
        assert_eq!(check_fs_op("readdir"), Ok(()));
        let mut args = Map::new();
        assert_eq!(
            validate_fs_op_args("git", &args),
            Err(Error::MissingGitArgs)
        );
        assert_eq!(validate_fs_op_args("gh", &args), Err(Error::MissingGhArgs));
        assert_eq!(
            validate_fs_op_args("search-project", &args),
            Err(Error::MissingSearchText)
        );
        assert_eq!(command_string(&args), Err(Error::MissingCommand));
        args.insert("args".into(), json!("status"));
        assert_eq!(validate_fs_op_args("git", &args), Ok(()));
    }

    #[test]
    fn command_timeout_treats_zero_as_falsy() {
        assert_eq!(command_timeout_ms(None), DEFAULT_COMMAND_TIMEOUT_MS);
        assert_eq!(
            command_timeout_ms(Some(&json!(0))),
            DEFAULT_COMMAND_TIMEOUT_MS
        );
        assert_eq!(command_timeout_ms(Some(&json!(5000))), 5_000);
        assert_eq!(command_timeout_ms(Some(&json!(-3))), 0);
        assert_eq!(command_timeout_ms(Some(&json!("2500"))), 2_500);
    }

    #[test]
    fn background_output_is_tail_bounded_and_marked() {
        assert_eq!(background_output_tail("   "), "(no output)");
        assert_eq!(background_output_tail("  ok \n"), "ok");
        let long = "x".repeat(BACKGROUND_MAX_OUTPUT_CHARS + 10);
        let tail = background_output_tail(&long);
        assert!(tail.starts_with("…(truncated)\n"));
        assert_eq!(
            tail.chars().count(),
            BACKGROUND_MAX_OUTPUT_CHARS + "…(truncated)\n".chars().count()
        );

        let mut buffer = String::new();
        for _ in 0..5 {
            append_output_tail(&mut buffer, &"y".repeat(BACKGROUND_MAX_OUTPUT_CHARS));
        }
        assert_eq!(buffer.chars().count(), BACKGROUND_MAX_OUTPUT_CHARS);
    }

    #[test]
    fn hello_payload_advertises_filesystem_and_terminal() {
        let payload = hello_payload(
            "node-a",
            "laptop",
            FsPlatform::Macos,
            &["anthropic".to_string()],
        );
        assert_eq!(payload["id"], json!("node-a"));
        assert_eq!(payload["platform"], json!("macos"));
        assert_eq!(payload["role"], json!("remote"));
        assert_eq!(payload["pairCredential"], json!(true));
        assert_eq!(payload["protocolVersion"], json!(NODE_PROTOCOL_VERSION));
        assert_eq!(
            payload["capabilities"]["surfaces"],
            json!(["filesystem", "terminal"])
        );
        assert_eq!(
            payload["capabilities"]["tools"].as_array().unwrap().len(),
            NODE_TOOLS.len()
        );
        assert_eq!(payload["capabilities"]["screenShare"], json!(false));

        let register = register_node_payload("node-a", "laptop", FsPlatform::Linux, &[]);
        assert_eq!(register["platform"], json!("linux"));
        assert_eq!(register["providers"], json!([]));
    }

    #[test]
    fn parse_inbound_and_responses_echo_request_ids() {
        let frame = json!({
            "type": "fs.op-request",
            "payload": { "requestId": "r1", "op": "readdir", "args": { "path": "/tmp" } }
        });
        match parse_inbound(&frame) {
            Inbound::FsOpRequest {
                request_id,
                op,
                args,
            } => {
                assert_eq!(request_id, Some(json!("r1")));
                assert_eq!(op, "readdir");
                assert_eq!(args["path"], json!("/tmp"));
            }
            other => panic!("unexpected {other:?}"),
        }

        let response = result_response(
            ResponseKind::FsOp,
            Some(json!("r1")),
            json!({ "entries": [] }),
        );
        assert_eq!(response["type"], json!("fs.op-response"));
        assert_eq!(response["payload"]["requestId"], json!("r1"));
        assert_eq!(response["payload"]["result"]["entries"], json!([]));

        let error = error_response(ResponseKind::ToolOp, Some(json!("r2")), "boom");
        assert_eq!(error["type"], json!("tool.op-response"));
        assert_eq!(error["payload"]["error"], json!("boom"));

        assert!(terminal_result_response(None, json!({})).is_none());
        assert_eq!(
            terminal_error_response(Some(json!("r3")), "nope").unwrap()["payload"]["error"],
            json!("nope")
        );

        let roots = roots_response(
            None,
            vec![json!({ "name": "/", "path": "/", "type": "dir" })],
        );
        assert!(roots["payload"].get("requestId").is_none());
        assert_eq!(roots["payload"]["roots"][0]["path"], json!("/"));

        let browse = browse_response(
            Some(json!("r4")),
            Map::from_iter([("entries".to_string(), json!([]))]),
        );
        assert_eq!(browse["payload"]["requestId"], json!("r4"));
        assert_eq!(browse["payload"]["entries"], json!([]));

        assert_eq!(
            parse_inbound(&json!({ "type": "provider.request" })),
            Inbound::Ignored
        );
        assert_eq!(
            parse_inbound(&json!({ "type": "terminal.op-request", "payload": {} })),
            Inbound::TerminalOpRequest {
                request_id: None,
                op: String::new(),
                params: Map::new(),
            }
        );
    }

    struct ScriptedSearch {
        files: Vec<RawFileHit>,
        content: Vec<RawContentHit>,
        literal_only: bool,
        unavailable: Option<String>,
        seen: std::sync::Mutex<Vec<ProjectSearchRequest>>,
    }

    impl ScriptedSearch {
        fn new(files: Vec<RawFileHit>, content: Vec<RawContentHit>) -> Self {
            Self {
                files,
                content,
                literal_only: false,
                unavailable: None,
                seen: std::sync::Mutex::new(Vec::new()),
            }
        }

        fn seen(&self) -> Vec<ProjectSearchRequest> {
            self.seen.lock().unwrap().clone()
        }
    }

    impl ProjectSearchBridge for ScriptedSearch {
        fn search_project(
            &self,
            request: &ProjectSearchRequest,
        ) -> Result<RawSearchResult, ProjectSearchFailure> {
            self.seen.lock().unwrap().push(request.clone());
            if let Some(reason) = &self.unavailable {
                return Err(ProjectSearchFailure::unavailable(
                    "Project search unavailable",
                    reason.clone(),
                ));
            }
            match request.mode {
                ProjectSearchMode::Files => Ok(RawSearchResult::Files {
                    query: request.query.clone(),
                    files: self.files.clone(),
                    limited: self.files.len() > 1,
                }),
                ProjectSearchMode::Content => {
                    let matches = if self.literal_only && request.is_regexp {
                        Vec::new()
                    } else {
                        self.content.clone()
                    };
                    Ok(RawSearchResult::Content {
                        query: request.query.clone(),
                        matches,
                        limited: false,
                    })
                }
            }
        }
    }

    fn file_hit(path: &str, relative: &str, name: &str) -> RawFileHit {
        RawFileHit {
            path: path.to_string(),
            relative_path: relative.to_string(),
            name: name.to_string(),
            score: 7,
        }
    }

    fn content_hit(relative: &str, line: usize, content: &str) -> RawContentHit {
        RawContentHit {
            file: format!("/abs/{relative}"),
            relative_path: relative.to_string(),
            line,
            content: content.to_string(),
            score: 3,
        }
    }

    #[test]
    fn search_limit_normalisation_matches_the_typescript() {
        assert_eq!(
            normalize_project_search_limit(None, PROJECT_SEARCH_DEFAULT_RESULTS).unwrap(),
            20
        );
        assert_eq!(
            normalize_project_search_limit(Some(&json!(null)), 50).unwrap(),
            50
        );
        assert_eq!(
            normalize_project_search_limit(Some(&json!("")), 50).unwrap(),
            50
        );
        assert_eq!(
            normalize_project_search_limit(Some(&json!(" 12 ")), 20).unwrap(),
            12
        );
        assert_eq!(
            normalize_project_search_limit(Some(&json!(5000)), 20).unwrap(),
            200
        );
        let failure = normalize_project_search_limit(Some(&json!(0)), 20).unwrap_err();
        assert_eq!(failure.message, "limit must be a positive integer");
        assert_eq!(
            normalize_project_search_limit(Some(&json!("nope")), 20)
                .unwrap_err()
                .message,
            "limit must be a positive integer"
        );
        assert!(normalize_project_search_limit(Some(&json!(1.5)), 20).is_err());
    }

    #[test]
    fn project_search_maps_relative_paths_and_drops_scores() {
        let bridge = ScriptedSearch::new(
            vec![file_hit("/root/src/a.rs", "src/a.rs", "a.rs")],
            vec![content_hit("src/b.rs", 4, "let x = 1;")],
        );
        let files = run_primary_project_search(
            &bridge,
            PrimaryProjectSearchOptions {
                root: PathBuf::from("/root"),
                query: "a".into(),
                mode: ProjectSearchMode::Files,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            files,
            PrimaryProjectSearchResult::Files {
                query: "a".into(),
                limited: false,
                files: vec![PrimarySearchFile {
                    path: "src/a.rs".into(),
                    name: "a.rs".into()
                }],
            }
        );
        let content = run_primary_project_search(
            &bridge,
            PrimaryProjectSearchOptions {
                root: PathBuf::from("/root"),
                query: "x".into(),
                mode: ProjectSearchMode::Content,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            content,
            PrimaryProjectSearchResult::Content {
                query: "x".into(),
                limited: false,
                matches: vec![PrimarySearchMatch {
                    file: "src/b.rs".into(),
                    line: 4,
                    content: "let x = 1;".into()
                }],
            }
        );
    }

    #[test]
    fn search_tool_file_mode_uses_absolute_paths_and_pluralises() {
        let bridge = ScriptedSearch::new(
            vec![
                file_hit("/root/a.rs", "a.rs", "a.rs"),
                file_hit("/root/b.rs", "b.rs", "b.rs"),
            ],
            vec![],
        );
        let mut args = Map::new();
        args.insert("query".into(), json!("main"));
        args.insert("mode".into(), json!("files"));
        args.insert("path".into(), json!("repo/../repo"));
        let result = run_primary_search_tool(&bridge, &args, Some(Path::new("/home/me")));
        assert_eq!(result["ok"], json!(true));
        assert_eq!(
            result["message"],
            json!(
                r#"Found 2 files matching "main" (stopped at the 20-result limit — narrow the pattern to see the rest)"#
            )
        );
        assert_eq!(result["data"]["files"], json!(["/root/a.rs", "/root/b.rs"]));
        let seen = bridge.seen();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].root, PathBuf::from("/home/me/repo"));
        assert_eq!(seen[0].limit, Some(20));
        assert_eq!(seen[0].mode, ProjectSearchMode::Files);
        assert_eq!(seen[0].include, None);
        assert!(!seen[0].include_ignored_files);
    }

    #[test]
    fn search_tool_content_mode_retries_with_the_opposite_interpretation() {
        let bridge = ScriptedSearch {
            files: Vec::new(),
            content: vec![content_hit("src/lib.rs", 9, "fn main() {}")],
            literal_only: true,
            unavailable: None,
            seen: std::sync::Mutex::new(Vec::new()),
        };
        let mut args = Map::new();
        args.insert("pattern".into(), json!("a.c"));
        args.insert("isRegexp".into(), json!(true));
        args.insert("limit".into(), json!(5));
        let result = run_primary_search_tool(&bridge, &args, Some(Path::new("/root")));
        assert_eq!(result["ok"], json!(true));
        assert_eq!(
            result["message"],
            json!(r#"Found 1 match for "a.c" (retried as literal)"#)
        );
        assert_eq!(
            result["data"]["matches"],
            json!([{ "file": "src/lib.rs", "line": 9, "content": "fn main() {}" }])
        );
        let seen = bridge.seen();
        assert_eq!(seen.len(), 2);
        assert!(seen[0].is_regexp);
        assert!(!seen[1].is_regexp);
        assert_eq!(seen[0].limit, Some(5));
    }

    #[test]
    fn search_tool_reports_empty_results_and_unavailable_reason() {
        let empty = ScriptedSearch::new(Vec::new(), Vec::new());
        let mut args = Map::new();
        args.insert("pattern".into(), json!("zzz"));
        let result = run_primary_search_tool(&empty, &args, Some(Path::new("/root")));
        assert_eq!(result["message"], json!(r#"No matches for "zzz""#));
        assert_eq!(result["data"]["matches"], json!([]));

        let mut broken = ScriptedSearch::new(Vec::new(), Vec::new());
        broken.unavailable = Some("no git".into());
        let failure = run_primary_search_tool(&broken, &args, Some(Path::new("/root")));
        assert_eq!(failure["ok"], json!(false));
        assert_eq!(failure["message"], json!("Project search unavailable"));
        assert_eq!(failure["data"]["reason"], json!("no git"));
    }
}
