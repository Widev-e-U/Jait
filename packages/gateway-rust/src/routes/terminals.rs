//! Native port of `packages/gateway/src/routes/terminals.ts`.
//!
//! The HTTP layer owns authorization, request validation, response shaping and
//! the `/execute` output post-processing. Process control (PTY allocation, the
//! byte stream, prompt detection and command framing) lives behind
//! [`TerminalControl`] / [`TerminalHandle`], so this module never fabricates
//! terminal output, never bypasses the surface registry and never weakens an
//! ownership check.
//!
//! Routes:
//! - `GET    /api/terminals`                 list terminal surfaces owned by the caller
//! - `POST   /api/terminals`                 create a terminal surface
//! - `GET    /api/terminals/shells`          available shells
//! - `GET    /api/terminals/{id}`            snapshot
//! - `POST   /api/terminals/{id}/write`      write stdin
//! - `POST   /api/terminals/{id}/resize`     resize the PTY
//! - `POST   /api/terminals/{id}/execute`    run a command and capture output
//! - `DELETE /api/terminals/{id}`            stop the terminal
use super::auth::{self, AuthState};
use crate::security::http_auth::AuthUser;
use crate::db::identifiers::uuidv7;
use crate::execution::command_timeout::resolve_command_timeout_ms;
use crate::services::audit::{AuditEntry, AuditWriter};
use crate::surfaces::registry::{SurfaceRef, SurfaceRegistry};
use axum::{
    extract::{Path, Request, State},
    routing::{get, post},
    Router,
};
use serde_json::{json, Value};
use std::{
    future::Future,
    pin::Pin,
    sync::Arc,
};

/// Surface kind used by every route in this module.
pub const TERMINAL_KIND: &str = "terminal";
/// Session used when the caller does not ask for one.
pub const DEFAULT_SESSION_ID: &str = "default";
/// Default PTY width, matching the TS handler.
pub const DEFAULT_COLS: u16 = 120;
/// Default PTY height, matching the TS handler.
pub const DEFAULT_ROWS: u16 = 30;
/// Maximum number of characters returned by `/execute`.
pub const MAX_OUTPUT_CHARS: usize = 200_000;
/// Prefix prepended to truncated command output.
pub const TRUNCATION_NOTICE: &str = "…(truncated)\n";
/// Placeholder returned when a command produced no output.
pub const NO_OUTPUT: &str = "(no output)";
/// Prefix of the synthetic exit marker printed after a command.
pub const EXIT_MARKER_PREFIX: &str = "__JAIT_EXIT__";
/// Details used when a terminal id is unknown.
pub const TERMINAL_NOT_FOUND_DETAILS: &str = "Terminal not found";

pub type ControlFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Everything the control plane needs to attach a PTY for a new terminal.
pub struct TerminalSpawn<'a> {
    pub id: &'a str,
    pub session_id: &'a str,
    pub project_root: &'a str,
    pub cols: u16,
    pub rows: u16,
    pub shell: Option<&'a str>,
    pub node_id: &'a str,
}

/// A single command run against an attached terminal.
pub struct TerminalRun<'a> {
    pub command: &'a str,
    /// Synthetic marker the runtime must echo after the command finishes.
    pub marker: &'a str,
    /// Resolved timeout in milliseconds (1h default, 24h cap).
    pub timeout_ms: f64,
}

/// Raw result of [`TerminalRun`]; the route layer does the cleanup.
pub struct TerminalRunOutcome {
    pub raw_output: String,
    pub exit_code: Option<i64>,
    pub timed_out: bool,
}

/// Attached, writable terminal.
pub trait TerminalHandle: Send + Sync {
    fn write(&self, data: &str) -> Result<(), String>;
    fn resize(&self, cols: u16, rows: u16);
    fn run(&self, request: TerminalRun<'_>) -> ControlFuture<'_, Result<TerminalRunOutcome, String>>;
}

/// Process-control plane. Implementations are expected to register a
/// terminal surface with the registry inside [`TerminalControl::spawn`] so
/// that list/get/delete see the same object the handle writes to.
pub trait TerminalControl: Send + Sync {
    fn spawn(
        &self,
        registry: &SurfaceRegistry,
        request: &TerminalSpawn<'_>,
    ) -> Result<Arc<dyn TerminalHandle>, String>;
    fn handle(&self, id: &str) -> Option<Arc<dyn TerminalHandle>>;
    fn shell_list(&self) -> Vec<String> {
        Vec::new()
    }
    /// Owner of a remote node, or `None` when the node is unknown.
    fn node_owner(&self, node_id: &str) -> Option<String> {
        let _ = node_id;
        None
    }
}

/// Deny-by-default control plane: no terminal can be created or driven until a
/// real PTY implementation is wired in. Nothing is faked.
#[derive(Debug, Default, Clone, Copy)]
pub struct NoTerminalControl;

impl TerminalControl for NoTerminalControl {
    fn spawn(
        &self,
        _registry: &SurfaceRegistry,
        _request: &TerminalSpawn<'_>,
    ) -> Result<Arc<dyn TerminalHandle>, String> {
        Err("Terminal runtime is not available".to_string())
    }

    fn handle(&self, _id: &str) -> Option<Arc<dyn TerminalHandle>> {
        None
    }
}

/// Session authorization hook (the TS `access.session` check).
pub trait SessionAccess: Send + Sync {
    fn can_access_session(&self, user_id: &str, session_id: &str) -> bool;
}

/// Only the shared `default` session is reachable until a session ACL is wired in.
#[derive(Debug, Default, Clone, Copy)]
pub struct DenyNonDefaultSessions;

impl SessionAccess for DenyNonDefaultSessions {
    fn can_access_session(&self, _user_id: &str, session_id: &str) -> bool {
        session_id == DEFAULT_SESSION_ID
    }
}

enum Lookup {
    Found(SurfaceRef),
    /// Surface exists but belongs to somebody else: TS preHandler sends a bare 404.
    Forbidden,
    /// Surface is registered but is not a terminal surface.
    NotTerminal,
    /// No such surface at all.
    Missing,
}

#[derive(Clone)]
pub struct TerminalRoutes {
    auth: AuthState,
    registry: SurfaceRegistry,
    control: Arc<dyn TerminalControl>,
    sessions: Arc<dyn SessionAccess>,
    project_root: Arc<str>,
}

impl TerminalRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            registry: SurfaceRegistry::default(),
            control: Arc::new(NoTerminalControl),
            sessions: Arc::new(DenyNonDefaultSessions),
            project_root: Arc::from(default_project_root()),
        }
    }

    pub fn with_registry(mut self, registry: SurfaceRegistry) -> Self {
        self.registry = registry;
        self
    }

    pub fn with_control(mut self, control: Arc<dyn TerminalControl>) -> Self {
        self.control = control;
        self
    }

    pub fn with_session_access(mut self, sessions: Arc<dyn SessionAccess>) -> Self {
        self.sessions = sessions;
        self
    }

    pub fn with_project_root(mut self, root: impl Into<Arc<str>>) -> Self {
        self.project_root = root.into();
        self
    }

    pub fn registry(&self) -> &SurfaceRegistry {
        &self.registry
    }

    
pub fn router(self) -> Router {
        Router::new()
            .route("/api/terminals", get(list_terminals).post(create_terminal))
                        .route("/api/terminals/shells", get(terminal_shells))
            .route("/api/terminals/{id}", get(get_terminal).delete(delete_terminal))
            .route("/api/terminals/{id}/write", post(write_terminal))
            .route("/api/terminals/{id}/resize", post(resize_terminal))
            .route("/api/terminals/{id}/execute", post(execute_in_terminal))
            .with_state(self)
    }

    /// Ownership check: a surface with no recorded owner is not accessible.
    fn owned_by(&self, user: &AuthUser, id: &str) -> bool {
        self.registry
            .owner(id)
            .is_some_and(|owner| owner == user.id)
    }

    fn lookup(&self, user: &AuthUser, id: &str) -> Lookup {
        match self.registry.surface(id) {
            Some(surface) if surface.kind() == TERMINAL_KIND => {
                if self.owned_by(user, id) {
                    Lookup::Found(surface)
                } else {
                    Lookup::Forbidden
                }
            }
            Some(_) => Lookup::NotTerminal,
            None => Lookup::Missing,
        }
    }

    async fn audit(&self, session_id: &str, action: &'static str, inputs: Value, outputs: Value) {
        let auth = self.auth.clone();
        let session_id = session_id.to_string();
        let _ = auth
            .with_database(move |db| {
                AuditWriter::new(db)
                    .write(AuditEntry {
                        session_id: Some(session_id),
                        surface_type: Some(TERMINAL_KIND.to_string()),
                        device_id: None,
                        action_id: uuidv7().to_string(),
                        action_type: "tool".to_string(),
                        tool_name: Some(action.to_string()),
                        inputs: Some(inputs),
                        outputs: Some(outputs),
                        side_effects: None,
                        parent_action_id: None,
                        status: "success".to_string(),
                        consent_method: Some("user".to_string()),
                    })
                    .map(|_| ())
                    .map_err(|error| -> Box<dyn std::error::Error + Send + Sync> { Box::new(error) })
            })
            .await;
    }
}

fn default_project_root() -> String {
    std::env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| ".".to_string())
}

fn bare_not_found() -> axum::response::Response {
    auth::response(404, json!({ "error": "NOT_FOUND" }))
}

fn terminal_not_found() -> axum::response::Response {
    auth::response(
        404,
        json!({ "error": "NOT_FOUND", "details": TERMINAL_NOT_FOUND_DETAILS }),
    )
}

fn runtime_detached() -> axum::response::Response {
    auth::response(
        400,
        json!({ "error": "TERMINAL_ERROR", "details": "Terminal runtime is not attached" }),
    )
}

fn terminal_error(details: String) -> axum::response::Response {
    auth::response(400, json!({ "error": "TERMINAL_ERROR", "details": details }))
}

/// Failed execute round-trip: the TS returns 500 here (unlike write/resize).
fn terminal_error_internal(details: String) -> axum::response::Response {
    auth::response(500, json!({ "error": "TERMINAL_ERROR", "details": details }))
}

fn lookup_response(lookup: Lookup) -> Result<SurfaceRef, axum::response::Response> {
    match lookup {
        Lookup::Found(surface) => Ok(surface),
        Lookup::Forbidden => Err(bare_not_found()),
        Lookup::NotTerminal | Lookup::Missing => Err(terminal_not_found()),
    }
}

/// Clamp a requested PTY dimension into the representable range.
fn dimension(value: Option<&Value>, default: u16) -> u16 {
    match value.and_then(Value::as_u64) {
        Some(raw) => raw.clamp(1, u64::from(u16::MAX)) as u16,
        None => default,
    }
}

fn snapshot_body(snapshot: crate::surfaces::registry::SurfaceSnapshot) -> Value {
    serde_json::to_value(&snapshot).unwrap_or(Value::Null)
}

fn string_field(body: &Value, name: &str) -> Option<String> {
    body.get(name).and_then(Value::as_str).map(str::to_string)
}

async fn authorize(
    state: &TerminalRoutes,
    headers: &axum::http::HeaderMap,
) -> Result<AuthUser, axum::response::Response> {
    auth::require_user(&state.auth, headers)
        .await
        .map_err(|response| *response)
}

async fn authorize_with_body(
    state: &TerminalRoutes,
    request: Request,
) -> Result<(AuthUser, Value), axum::response::Response> {
    let headers = request.headers().clone();
    let user = authorize(state, &headers).await?;
    let body = auth::parse_body(request.into_body(), &headers)
        .await
        .map_err(|response| *response)?;
    Ok((user, body))
}

async fn list_terminals(State(state): State<TerminalRoutes>, request: Request) -> axum::response::Response {
    let user = match authorize(&state, request.headers()).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let mut terminals = Vec::new();
    for surface in state.registry.list() {
        if surface.kind() != TERMINAL_KIND || !state.owned_by(&user, surface.id()) {
            continue;
        }
        if let Ok(snapshot) = surface.snapshot() {
            terminals.push(snapshot_body(snapshot));
        }
    }
    auth::response(200, json!({ "terminals": terminals }))
}

async fn terminal_shells(State(state): State<TerminalRoutes>, request: Request) -> axum::response::Response {
    if let Err(response) = authorize(&state, request.headers()).await {
        return response;
    }
    auth::response(200, json!({ "shells": state.control.shell_list() }))
}

async fn create_terminal(State(state): State<TerminalRoutes>, request: Request) -> axum::response::Response {
    let (user, body) = match authorize_with_body(&state, request).await {
        Ok(parsed) => parsed,
        Err(response) => return response,
    };

    let session_id = string_field(&body, "sessionId").unwrap_or_else(|| DEFAULT_SESSION_ID.to_string());
    let project_root = string_field(&body, "projectRoot")
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| state.project_root.to_string());
    let node_id = string_field(&body, "nodeId").unwrap_or_default();
    let shell = string_field(&body, "shell").filter(|value| !value.is_empty());
    let cols = dimension(body.get("cols"), DEFAULT_COLS);
    let rows = dimension(body.get("rows"), DEFAULT_ROWS);

    if !state.sessions.can_access_session(&user.id, &session_id) {
        return auth::response(404, json!({ "error": "Session not found" }));
    }
    if !node_id.is_empty() && state.control.node_owner(&node_id).as_deref() != Some(user.id.as_str()) {
        return auth::response(404, json!({ "error": "Node not found" }));
    }

    let term_id = format!("term-{}", uuidv7());
    state.registry.set_owner(&term_id, &user.id);

    let spawn = TerminalSpawn {
        id: &term_id,
        session_id: &session_id,
        project_root: &project_root,
        cols,
        rows,
        shell: shell.as_deref(),
        node_id: &node_id,
    };
    if let Err(details) = state.control.spawn(&state.registry, &spawn) {
        state.registry.unregister(&term_id);
        let details = if details.trim().is_empty() {
            "Failed to create terminal".to_string()
        } else {
            details
        };
        return auth::response(500, json!({ "error": "TERMINAL_ERROR", "details": details }));
    }

    let snapshot = match state.registry.surface(&term_id).map(|surface| surface.snapshot()) {
        Some(Ok(snapshot)) => snapshot,
        Some(Err(error)) => {
            state.registry.unregister(&term_id);
            return auth::response(
                500,
                json!({ "error": "TERMINAL_ERROR", "details": error.to_string() }),
            );
        }
        None => {
            state.registry.unregister(&term_id);
            return auth::response(
                500,
                json!({ "error": "TERMINAL_ERROR", "details": "Failed to create terminal" }),
            );
        }
    };

    state
        .audit(
            &session_id,
            "terminal.create",
            json!({ "cols": cols, "rows": rows, "shell": shell, "nodeId": node_id }),
            json!({ "terminalId": term_id }),
        )
        .await;

    auth::response(201, snapshot_body(snapshot))
}

async fn get_terminal(
    State(state): State<TerminalRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> axum::response::Response {
    let user = match authorize(&state, request.headers()).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let surface = match lookup_response(state.lookup(&user, &id)) {
        Ok(surface) => surface,
        Err(response) => return response,
    };
    match surface.snapshot() {
        Ok(snapshot) => auth::response(200, snapshot_body(snapshot)),
        Err(error) => auth::response(
            500,
            json!({ "error": "TERMINAL_ERROR", "details": error.to_string() }),
        ),
    }
}

async fn write_terminal(
    State(state): State<TerminalRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> axum::response::Response {
    let (user, body) = match authorize_with_body(&state, request).await {
        Ok(parsed) => parsed,
        Err(response) => return response,
    };
    let data = body.get("data").and_then(Value::as_str).unwrap_or("").to_string();
    if let Err(response) = lookup_response(state.lookup(&user, &id)) {
        return response;
    }
    let Some(handle) = state.control.handle(&id) else {
        return runtime_detached();
    };
    match handle.write(&data) {
        Ok(()) => auth::response(200, json!({ "ok": true })),
        Err(message) => {
            let details = if message.trim().is_empty() {
                "Write failed".to_string()
            } else {
                message
            };
            terminal_error(details)
        }
    }
}

async fn resize_terminal(
    State(state): State<TerminalRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> axum::response::Response {
    let (user, body) = match authorize_with_body(&state, request).await {
        Ok(parsed) => parsed,
        Err(response) => return response,
    };
    let cols = dimension(body.get("cols"), DEFAULT_COLS);
    let rows = dimension(body.get("rows"), DEFAULT_ROWS);
    if let Err(response) = lookup_response(state.lookup(&user, &id)) {
        return response;
    }
    let Some(handle) = state.control.handle(&id) else {
        return runtime_detached();
    };
    handle.resize(cols, rows);
    auth::response(200, json!({ "ok": true, "cols": cols, "rows": rows }))
}

async fn delete_terminal(
    State(state): State<TerminalRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> axum::response::Response {
    let user = match authorize(&state, request.headers()).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    if let Err(response) = lookup_response(state.lookup(&user, &id)) {
        return response;
    }
    match state.registry.stop_surface(&id, Some("user request".to_string())).await {
        Ok(true) => {
            let session_id = state
                .registry
                .surface(&id)
                .and_then(|surface| surface.session_id())
                .unwrap_or_else(|| DEFAULT_SESSION_ID.to_string());
            state
                .audit(&session_id, "terminal.stop", json!({ "terminalId": id }), json!({ "ok": true }))
                .await;
            auth::response(200, json!({ "ok": true }))
        }
        _ => terminal_not_found(),
    }
}

async fn execute_in_terminal(
    State(state): State<TerminalRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> axum::response::Response {
    let (user, body) = match authorize_with_body(&state, request).await {
        Ok(parsed) => parsed,
        Err(response) => return response,
    };
    let command = body.get("command").and_then(Value::as_str).unwrap_or("").to_string();
    if command.trim().is_empty() {
        return auth::response(
            400,
            json!({ "error": "VALIDATION_ERROR", "details": "command is required" }),
        );
    }
    let timeout_ms = resolve_command_timeout_ms(Some(&body));
    if let Err(response) = lookup_response(state.lookup(&user, &id)) {
        return response;
    }
    let Some(handle) = state.control.handle(&id) else {
        return runtime_detached();
    };

    let marker = exit_marker();
    let outcome = match handle
        .run(TerminalRun {
            command: &command,
            marker: &marker,
            timeout_ms,
        })
        .await
    {
        Ok(outcome) => outcome,
        Err(message) => {
            let details = if message.trim().is_empty() {
                "Command failed".to_string()
            } else {
                message
            };
            return terminal_error_internal(details);
        }
    };

    let output = cap_output(&finish_output(&outcome.raw_output, &command, &marker));
    let output = if output.is_empty() { NO_OUTPUT.to_string() } else { output };
    auth::response(
        200,
        json!({
            "output": output,
            "exitCode": outcome.exit_code,
            "timedOut": outcome.timed_out,
        }),
    )
}

/// Synthetic marker echoed by the shell after the command finishes. It only
/// contains an epoch millisecond stamp and a random suffix.
fn exit_marker() -> String {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default();
    let nonce = uuidv7().to_string().replace('-', "");
    let tail = &nonce[nonce.len().saturating_sub(12)..];
    format!("{EXIT_MARKER_PREFIX}{stamp}_{tail}__")
}

/// Remove OSC sequences, optionally keeping those whose body matches `keep`.
fn strip_osc(input: &str, keep: impl Fn(&str) -> bool) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] == 0x1b && bytes.get(index + 1) == Some(&b']') {
            let body_start = index + 2;
            let mut cursor = body_start;
            let mut end = None;
            while cursor < bytes.len() {
                if bytes[cursor] == 0x07 {
                    end = Some((cursor + 1, cursor));
                    break;
                }
                if bytes[cursor] == 0x1b && bytes.get(cursor + 1) == Some(&b'\\') {
                    end = Some((cursor + 2, cursor));
                    break;
                }
                cursor += 1;
            }
            if let Some((next, body_end)) = end {
                if keep(&input[body_start..body_end]) {
                    out.push_str(&input[index..next]);
                }
                index = next;
                continue;
            }
            index = body_start;
            continue;
        }
        let character = input[index..].chars().next().unwrap_or('\u{fffd}');
        out.push(character);
        index += character.len_utf8();
    }
    out
}

/// Drop iTerm/VS Code style `OSC 633 ; ...` prompt integration sequences.
fn strip_osc633(input: &str) -> String {
    strip_osc(input, |body| !body.starts_with("633;"))
}

/// Drop every ANSI/CSI/OSC escape sequence.
fn strip_ansi(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] == 0x1b {
            match bytes.get(index + 1) {
                Some(b'[') => {
                    let mut cursor = index + 2;
                    while cursor < bytes.len() && !(0x40..=0x7e).contains(&bytes[cursor]) {
                        cursor += 1;
                    }
                    index = (cursor + 1).min(bytes.len());
                }
                Some(b']') => {
                    let mut cursor = index + 2;
                    while cursor < bytes.len() {
                        if bytes[cursor] == 0x07 {
                            cursor += 1;
                            break;
                        }
                        if bytes[cursor] == 0x1b && bytes.get(cursor + 1) == Some(&b'\\') {
                            cursor += 2;
                            break;
                        }
                        cursor += 1;
                    }
                    index = cursor;
                }
                Some(_) => index = (index + 2).min(bytes.len()),
                None => index = bytes.len(),
            }
            continue;
        }
        let character = input[index..].chars().next().unwrap_or('\u{fffd}');
        out.push(character);
        index += character.len_utf8();
    }
    out
}

fn remove_marker(text: &str, marker: &str) -> String {
    if marker.is_empty() {
        return text.to_string();
    }
    let bytes = text.as_bytes();
    let mut last: Option<(usize, usize)> = None;
    let mut search = 0usize;
    while search < text.len() {
        let Some(found) = text[search..].find(marker) else {
            break;
        };
        let start = search + found;
        let mut end = start + marker.len();
        let mut idx = end;
        if idx < bytes.len() && bytes[idx] == b'-' {
            idx += 1;
        }
        let digits_start = idx;
        while idx < bytes.len() && bytes[idx].is_ascii_digit() {
            idx += 1;
        }
        if idx > digits_start {
            end = idx;
        }
        last = Some((start, end));
        search = end.max(start + 1);
    }
    match last {
        Some((start, end)) => format!("{}{}", &text[..start], &text[end..]),
        None => text.to_string(),
    }
}

/// Prompt heuristic: a short trailing line that ends with a shell sigil.
fn looks_like_prompt(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 200 {
        return false;
    }
    matches!(trimmed.chars().last(), Some('$') | Some('#') | Some('%') | Some('>'))
        && !trimmed.contains(char::is_control)
}


/// Port of the TS `finish()` pipeline: strip OSC 633 + ANSI, drop `\r`, remove
/// the exit marker, drop echoed command lines, trim trailing blank lines and
/// drop the trailing prompt line, then rejoin.
fn finish_output(raw: &str, command: &str, marker: &str) -> String {
    let cleaned = strip_ansi(&strip_osc633(raw));
    let without_marker = remove_marker(&cleaned, marker);
    let normalized = without_marker.replace('\r', "");
    let mut echoed: Vec<String> = command
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();
    let mut lines: Vec<&str> = normalized.split('\n').collect();
    // Mirrors the TS loop: consume the echoed command head line by head line.
    while let (Some(head), Some(cmd_head)) = (lines.first(), echoed.first()) {
        let head = head.trim();
        if head == cmd_head || head.ends_with(cmd_head.as_str()) || cmd_head.starts_with(head) {
            lines.remove(0);
            echoed.remove(0);
        } else {
            break;
        }
    }
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }
    if lines.len() > 1 && lines.last().is_some_and(|line| looks_like_prompt(line)) {
        lines.pop();
        while lines.last().is_some_and(|line| line.trim().is_empty()) {
            lines.pop();
        }
    }
    lines.join("\n").trim_end().to_string()
}

/// Keep the tail of the output, prefixed with the truncation notice.
fn cap_output(output: &str) -> String {
    let count = output.chars().count();
    if count <= MAX_OUTPUT_CHARS {
        return output.to_string();
    }
    let tail: String = output.chars().skip(count - MAX_OUTPUT_CHARS).collect();
    format!("{TRUNCATION_NOTICE}{tail}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::http_auth::{sign_auth_token, AuthUser};
    use crate::surfaces::registry::{
        Surface, SurfaceFuture, SurfaceRef, SurfaceResult, SurfaceSnapshot, SurfaceStartInput,
        SurfaceState,
    };
    use axum::body::{to_bytes, Body};
    use axum::http::Request as HttpRequest;
    use std::collections::HashMap;
    use std::sync::Mutex;

    const SECRET: &str = "terminals-fixture-secret";

    fn auth_state() -> AuthState {
        // A migrated, seeded database so `require_user` can resolve test tokens.
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/terminals-routes")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&root).expect("fixture dir");
        let db = crate::db::open_database(&root.join("terminals.sqlite")).expect("db");
        crate::db::migrate_database(&db).expect("migrate");
        for user in ["owner", "alice", "bob", "carol"] {
            db.execute(
                "INSERT INTO users(id, username, password_hash, created_at, updated_at) \
                 VALUES (?1, ?1, 'unused', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')",
                rusqlite::params![user],
            )
            .expect("seed user");
        }
        AuthState::new(db, SECRET.to_string()).expect("auth state")
    }

    fn token_for(user: &str) -> String {
        let principal = AuthUser {
            id: user.to_string(),
            username: user.to_string(),
        };
        sign_auth_token(&principal, SECRET).expect("auth token")
    }

    fn request(method: &str, uri: &str, user: Option<&str>, body: Option<Value>) -> Request {
        let mut builder = HttpRequest::builder().method(method).uri(uri);
        if let Some(user) = user {
            builder = builder.header("authorization", format!("Bearer {}", token_for(user)));
        }
        let payload = match body {
            Some(value) => Body::from(serde_json::to_vec(&value).expect("json body")),
            None => Body::empty(),
        };
        builder
            .header("content-type", "application/json")
            .body(payload)
            .expect("request")
    }

    async fn decode(response: axum::response::Response) -> (u16, Value) {
        let status = response.status().as_u16();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body");
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    struct FakeSurface {
        id: String,
        kind: String,
        session_id: String,
        state: SurfaceState,
    }

    impl Surface for FakeSurface {
        fn id(&self) -> &str {
            &self.id
        }

        fn kind(&self) -> &str {
            &self.kind
        }

        fn state(&self) -> SurfaceState {
            self.state
        }

        fn session_id(&self) -> Option<String> {
            Some(self.session_id.clone())
        }

        fn start(&self, _input: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
            Box::pin(async { Ok(()) })
        }

        fn stop(&self, _reason: Option<String>) -> SurfaceFuture<'_, ()> {
            Box::pin(async { Ok(()) })
        }

        fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
            Ok(SurfaceSnapshot {
                id: self.id.clone(),
                kind: self.kind.clone(),
                state: self.state,
                session_id: self.session_id.clone(),
                started_at: None,
                metadata: Default::default()
            })
        }
    }

    fn fake_surface(id: &str, kind: &str, session_id: &str) -> SurfaceRef {
        Arc::new(FakeSurface {
            id: id.to_string(),
            kind: kind.to_string(),
            session_id: session_id.to_string(),
            state: SurfaceState::Running,
        })
    }

    type RunFn = Box<dyn for<'a> Fn(&TerminalRun<'a>) -> Result<TerminalRunOutcome, String> + Send + Sync>;

    struct FakeHandle {
        writes: Mutex<Vec<String>>,
        resizes: Mutex<Vec<(u16, u16)>>,
        runs: Mutex<Vec<(String, f64)>>,
        run: RunFn,
    }

    impl FakeHandle {
        fn new() -> Self {
            Self::with_run(Box::new(|_request| {
                Ok(TerminalRunOutcome {
                    raw_output: String::new(),
                    exit_code: Some(0),
                    timed_out: false,
                })
            }))
        }

        fn with_run(run: RunFn) -> Self {
            Self {
                writes: Mutex::new(Vec::new()),
                resizes: Mutex::new(Vec::new()),
                runs: Mutex::new(Vec::new()),
                run,
            }
        }

        fn writes(&self) -> Vec<String> {
            self.writes.lock().expect("writes").clone()
        }

        fn resizes(&self) -> Vec<(u16, u16)> {
            self.resizes.lock().expect("resizes").clone()
        }

        fn runs(&self) -> Vec<(String, f64)> {
            self.runs.lock().expect("runs").clone()
        }
    }

    impl TerminalHandle for FakeHandle {
        fn write(&self, data: &str) -> Result<(), String> {
            self.writes.lock().expect("writes").push(data.to_string());
            Ok(())
        }

        fn resize(&self, cols: u16, rows: u16) {
            self.resizes.lock().expect("resizes").push((cols, rows));
        }

        fn run(
            &self,
            request: TerminalRun<'_>,
        ) -> ControlFuture<'_, Result<TerminalRunOutcome, String>> {
            self.runs
                .lock()
                .expect("runs")
                .push((request.command.to_string(), request.timeout_ms));
            let outcome = (self.run)(&request);
            Box::pin(async move { outcome })
        }
    }

    struct FakeControl {
        handles: Mutex<HashMap<String, Arc<FakeHandle>>>,
        spawn_error: Option<String>,
        shells: Vec<String>,
    }

    impl FakeControl {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                handles: Mutex::new(HashMap::new()),
                spawn_error: None,
                shells: vec!["/bin/bash".to_string(), "/bin/zsh".to_string()],
            })
        }

        fn handle_ref(&self, id: &str) -> Option<Arc<FakeHandle>> {
            self.handles.lock().expect("handles").get(id).cloned()
        }
    }

    impl TerminalControl for FakeControl {
        fn spawn(
            &self,
            registry: &SurfaceRegistry,
            request: &TerminalSpawn<'_>,
        ) -> Result<Arc<dyn TerminalHandle>, String> {
            if let Some(message) = &self.spawn_error {
                return Err(message.clone());
            }
            registry.register_instance(
                request.id,
                fake_surface(request.id, TERMINAL_KIND, request.session_id),
            );
            let handle = Arc::new(FakeHandle::new());
            self.handles
                .lock()
                .expect("handles")
                .insert(request.id.to_string(), handle.clone());
            Ok(handle)
        }

        fn handle(&self, id: &str) -> Option<Arc<dyn TerminalHandle>> {
            self.handle_ref(id)
                .map(|handle| handle as Arc<dyn TerminalHandle>)
        }

        fn shell_list(&self) -> Vec<String> {
            self.shells.clone()
        }
    }

    fn routes_with(control: Arc<FakeControl>) -> TerminalRoutes {
        TerminalRoutes::new(auth_state())
            .with_control(control)
            .with_project_root("/tmp/terminals-fixture")
    }

    async fn create(routes: &TerminalRoutes, user: &str, body: Value) -> (u16, Value) {
        let response = create_terminal(
            State(routes.clone()),
            request("POST", "/api/terminals", Some(user), Some(body)),
        )
        .await;
        decode(response).await
    }

    #[test]
    fn finish_output_strips_control_sequences_and_marker() {
        let marker = "__JAIT_EXIT__42__";
        let raw = format!(
            "echo hi\r\n\u{1b}[32mhello\u{1b}[0m\r\n\u{1b}]633;A\u{1b}\\done {marker}\r\n$ "
        );
        let output = finish_output(&raw, "echo hi", marker);
        assert_eq!(output, "hello\ndone");
    }

    #[tokio::test]
    async fn list_requires_authentication() {
        let routes = routes_with(FakeControl::new());
        let (status, body) = decode(
            list_terminals(State(routes), request("GET", "/api/terminals", None, None)).await,
        )
        .await;
        assert_eq!(status, 401);
        assert_eq!(body["detail"], "login_required");
    }

    #[tokio::test]
    async fn create_without_runtime_reports_terminal_error() {
        let routes = TerminalRoutes::new(auth_state()).with_project_root("/tmp/fixture");
        let (status, body) = create(&routes, "alice", json!({})).await;
        assert_eq!(status, 500);
        assert_eq!(body["error"], "TERMINAL_ERROR");
        assert!(routes.registry().owner("term-missing").is_none());
    }

    #[tokio::test]
    async fn create_registers_owned_terminal() {
        let control = FakeControl::new();
        let routes = routes_with(control);
        let (status, body) = create(&routes, "alice", json!({ "cols": 100, "rows": 40 })).await;
        assert_eq!(status, 201);
        assert_eq!(body["type"], TERMINAL_KIND);
        let id = body["id"].as_str().expect("terminal id").to_string();
        assert_eq!(routes.registry().owner(&id).as_deref(), Some("alice"));
        let surface = routes.registry().surface(&id).expect("registered surface");
        assert_eq!(surface.session_id().as_deref(), Some(DEFAULT_SESSION_ID));
    }

    #[tokio::test]
    async fn create_rejects_foreign_session() {
        let routes = routes_with(FakeControl::new());
        let (status, body) = create(&routes, "alice", json!({ "sessionId": "other" })).await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], "Session not found");
    }

    #[tokio::test]
    async fn create_rejects_unowned_node() {
        let routes = routes_with(FakeControl::new());
        let (status, body) = create(&routes, "alice", json!({ "nodeId": "node-7" })).await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], "Node not found");
    }

    #[tokio::test]
    async fn write_to_unknown_terminal_is_not_found() {
        let routes = routes_with(FakeControl::new());
        let (status, body) = decode(
            write_terminal(
                State(routes),
                Path("term-unknown".to_string()),
                request(
                    "POST",
                    "/api/terminals/term-unknown/write",
                    Some("alice"),
                    Some(json!({ "data": "ls\r" })),
                ),
            )
            .await,
        )
        .await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], "NOT_FOUND");
        assert_eq!(body["details"], TERMINAL_NOT_FOUND_DETAILS);
    }

    #[tokio::test]
    async fn write_denies_foreign_owner() {
        let control = FakeControl::new();
        let routes = routes_with(control.clone());
        routes
            .registry()
            .register_instance("term-owned", fake_surface("term-owned", TERMINAL_KIND, "default"));
        routes.registry().set_owner("term-owned", "bob");
        control
            .handles
            .lock()
            .expect("handles")
            .insert("term-owned".to_string(), Arc::new(FakeHandle::new()));

        let (status, body) = decode(
            write_terminal(
                State(routes.clone()),
                Path("term-owned".to_string()),
                request(
                    "POST",
                    "/api/terminals/term-owned/write",
                    Some("alice"),
                    Some(json!({ "data": "id\r" })),
                ),
            )
            .await,
        )
        .await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], "NOT_FOUND");
        let handle = control.handle_ref("term-owned").expect("handle");
        assert!(handle.writes().is_empty());
    }

    #[tokio::test]
    async fn write_forwards_payload_to_handle() {
        let control = FakeControl::new();
        let routes = routes_with(control.clone());
        let (status, body) = create(&routes, "alice", json!({})).await;
        assert_eq!(status, 201);
        let id = body["id"].as_str().expect("terminal id").to_string();

        let (status, body) = decode(
            write_terminal(
                State(routes),
                Path(id.clone()),
                request(
                    "POST",
                    &format!("/api/terminals/{id}/write"),
                    Some("alice"),
                    Some(json!({ "data": "echo hi\r" })),
                ),
            )
            .await,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(body["ok"], true);
        let handle = control.handle_ref(&id).expect("handle");
        assert_eq!(handle.writes(), vec!["echo hi\r".to_string()]);
    }

    #[tokio::test]
    async fn resize_clamps_bounds_and_reports_effective_size() {
        let control = FakeControl::new();
        let routes = routes_with(control.clone());
        let (_, body) = create(&routes, "alice", json!({})).await;
        let id = body["id"].as_str().expect("terminal id").to_string();

        let (status, body) = decode(
            resize_terminal(
                State(routes),
                Path(id.clone()),
                request(
                    "POST",
                    &format!("/api/terminals/{id}/resize"),
                    Some("alice"),
                    Some(json!({ "cols": 0, "rows": 70000 })),
                ),
            )
            .await,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(body["cols"], 1);
        assert_eq!(body["rows"], u16::MAX);
        let handle = control.handle_ref(&id).expect("handle");
        assert_eq!(handle.resizes(), vec![(1, u16::MAX)]);
    }

    #[tokio::test]
    async fn execute_requires_command() {
        let control = FakeControl::new();
        let routes = routes_with(control);
        let (_, body) = create(&routes, "alice", json!({})).await;
        let id = body["id"].as_str().expect("terminal id").to_string();

        let (status, body) = decode(
            execute_in_terminal(
                State(routes),
                Path(id.clone()),
                request(
                    "POST",
                    &format!("/api/terminals/{id}/execute"),
                    Some("alice"),
                    Some(json!({ "command": "   " })),
                ),
            )
            .await,
        )
        .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], "VALIDATION_ERROR");
        assert_eq!(body["details"], "command is required");
    }

    #[tokio::test]
    async fn execute_returns_cleaned_output_and_exit_code() {
        let control = FakeControl::new();
        let routes = routes_with(control.clone());
        let (_, body) = create(&routes, "alice", json!({})).await;
        let id = body["id"].as_str().expect("terminal id").to_string();

        // Re-register with a handle that produces terminal-ish output.
        let handle = Arc::new(FakeHandle::with_run(Box::new(|request| {
            Ok(TerminalRunOutcome {
                raw_output: format!(
                    "{}\r\n\u{1b}[32mgreened\u{1b}[0m\r\n{}\r\n$ ",
                    request.command, request.marker
                ),
                exit_code: Some(7),
                timed_out: false,
            })
        })));
        control
            .handles
            .lock()
            .expect("handles")
            .insert(id.clone(), handle.clone());

        let (status, body) = decode(
            execute_in_terminal(
                State(routes),
                Path(id.clone()),
                request(
                    "POST",
                    &format!("/api/terminals/{id}/execute"),
                    Some("alice"),
                    Some(json!({ "command": "printf greened" })),
                ),
            )
            .await,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(body["output"], "greened");
        assert_eq!(body["exitCode"], 7);
        assert_eq!(body["timedOut"], false);
        let runs = handle.runs();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].0, "printf greened");
        assert_eq!(runs[0].1, 3_600_000.0);
    }

    #[tokio::test]
    async fn execute_truncates_oversized_output_and_flags_timeouts() {
        let control = FakeControl::new();
        let routes = routes_with(control.clone());
        let (_, body) = create(&routes, "alice", json!({})).await;
        let id = body["id"].as_str().expect("terminal id").to_string();

        let handle = Arc::new(FakeHandle::with_run(Box::new(|request| {
            Ok(TerminalRunOutcome {
                raw_output: format!("{}{}\r\n", "x".repeat(MAX_OUTPUT_CHARS + 5), request.marker),
                exit_code: None,
                timed_out: true,
            })
        })));
        control
            .handles
            .lock()
            .expect("handles")
            .insert(id.clone(), handle);

        let (status, body) = decode(
            execute_in_terminal(
                State(routes),
                Path(id.clone()),
                request(
                    "POST",
                    &format!("/api/terminals/{id}/execute"),
                    Some("alice"),
                    Some(json!({ "command": "yes", "timeoutMs": 5 })),
                ),
            )
            .await,
        )
        .await;
        assert_eq!(status, 200);
        assert!(body["output"]
            .as_str()
            .expect("output")
            .starts_with(TRUNCATION_NOTICE));
        assert_eq!(body["timedOut"], true);
        assert!(body["exitCode"].is_null());
    }

    #[tokio::test]
    async fn delete_stops_terminal_and_clears_registry() {
        let control = FakeControl::new();
        let routes = routes_with(control.clone());
        let (_, body) = create(&routes, "alice", json!({})).await;
        let id = body["id"].as_str().expect("terminal id").to_string();

        let (status, body) = decode(
            delete_terminal(
                State(routes.clone()),
                Path(id.clone()),
                request(
                    "DELETE",
                    &format!("/api/terminals/{id}"),
                    Some("alice"),
                    None,
                ),
            )
            .await,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(body["ok"], true);
        assert!(routes.registry().surface(&id).is_none());

        let (status, _) = decode(
            delete_terminal(
                State(routes),
                Path(id),
                request("DELETE", "/api/terminals/gone", Some("alice"), None),
            )
            .await,
        )
        .await;
        assert_eq!(status, 404);
    }
}
