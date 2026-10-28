//! Native port of `packages/gateway/src/tools/computer-tools.ts`.
//!
//! Visible, user-approved control of remote Windows desktops:
//!
//! * `computer.targets` — list connected desktop nodes and their control availability.
//! * `computer.session` — start / stop / inspect a time-limited control session.
//! * `computer.observe` — capture the desktop of an owned session.
//! * `computer.act`     — drive the pointer/keyboard of an owned session.
//!
//! Host port contract (mirrors the TS collaborators `availableTargets`,
//! `ComputerControlSessionService` and the remote tool proxy):
//!
//! * `nodes`  — `"list"` -> `[{ nodeId, name, role, platform, lifecycle, capabilities: { tools: [..] } }]`
//! * `sessions` — `"list"` -> `[session]`, `"start"` `(ownerSessionId, nodeId)` -> `session`,
//!   `"stop"` `(sessionId)` -> `null`, `"requireOwned"` `(sessionId, ownerSessionId)` -> `session`
//!   (returns an error when the session is unknown or owned by another conversation).
//! * `proxy`  — `"invoke"` `(toolName, input, timeoutMs)` -> remote tool result.
//!
//! Every remote result is normalised through [`as_remote_tool_result`], exactly like the TS
//! `asRemoteToolResult`, so a remote agent that returns a plain payload never looks like a
//! structured failure.

use std::sync::LazyLock;

use serde_json::{json, Value};

use crate::tools::core_io::HostError;
use crate::tools::core_jait::JaitPort;
use crate::tools::validate::{validate_tool_input, ToolInput};

pub const COMPUTER_TARGETS: &str = "computer.targets";
pub const COMPUTER_SESSION: &str = "computer.session";
pub const COMPUTER_OBSERVE: &str = "computer.observe";
pub const COMPUTER_ACT: &str = "computer.act";

/// Tools a target node must advertise before it can be controlled.
const REQUIRED_TARGET_TOOLS: [&str; 3] = [COMPUTER_SESSION, COMPUTER_OBSERVE, COMPUTER_ACT];

const SESSION_START_TIMEOUT_MS: u64 = 180_000;
const SESSION_STOP_TIMEOUT_MS: u64 = 30_000;
const OBSERVE_TIMEOUT_MS: u64 = 60_000;
const ACT_TIMEOUT_MS: u64 = 60_000;
const MAX_WAIT_AFTER_MS: f64 = 10_000.0;

static METADATA: LazyLock<Value> = LazyLock::new(|| {
    json!([
        {
            "name": COMPUTER_TARGETS,
            "displayName": "List Computers",
            "description": "List connected desktop computers that support visible, user-approved mouse and keyboard control.",
            "tier": "standard",
            "category": "screen",
            "source": "builtin",
            "risk": "low",
            "defaultConsentLevel": "none",
            "discovery": {
                "aliases": ["desktop control", "remote computer", "windows pc", "computer use"],
                "capabilities": ["discover controllable Windows PCs", "list desktop control targets"],
                "examples": ["Which computers can you control?", "Use my Windows PC"],
                "priority": 20
            },
            "parameters": { "type": "object", "properties": {} }
        },
        {
            "name": COMPUTER_SESSION,
            "displayName": "Computer Control Session",
            "description": "Start, inspect, or stop a time-limited control session on a Windows desktop. Starting requires approval on both the gateway and target PC; Ctrl+Alt+Escape stops it locally.",
            "tier": "standard",
            "category": "screen",
            "source": "builtin",
            "risk": "high",
            "defaultConsentLevel": "once",
            "discovery": {
                "aliases": ["start computer control", "stop computer control", "control session"],
                "capabilities": ["start a control session", "stop a control session", "inspect control sessions"],
                "examples": ["Start controlling my Windows PC", "Stop computer control"],
                "priority": 30
            },
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["start", "stop", "status"],
                        "description": "Start a new session, stop an existing one, or inspect sessions."
                    },
                    "nodeId": {
                        "type": "string",
                        "description": "Target node ID. Optional only when exactly one target is available."
                    },
                    "sessionId": {
                        "type": "string",
                        "description": "Control session ID, required for stop and optional for status."
                    }
                },
                "required": ["action"]
            }
        },
        {
            "name": COMPUTER_OBSERVE,
            "displayName": "Observe Computer",
            "description": "Capture the current Windows desktop during an active, user-approved computer control session.",
            "tier": "standard",
            "category": "screen",
            "source": "builtin",
            "risk": "low",
            "defaultConsentLevel": "none",
            "discovery": {
                "aliases": ["look at desktop", "capture remote screen", "see my pc"],
                "capabilities": ["capture an active control session"],
                "examples": ["What is on my Windows desktop?", "Show me the remote screen"],
                "priority": 25
            },
            "parameters": {
                "type": "object",
                "properties": {
                    "sessionId": { "type": "string", "description": "Active control session ID." }
                },
                "required": ["sessionId"]
            }
        },
        {
            "name": COMPUTER_ACT,
            "displayName": "Control Computer",
            "description": "Move or click the pointer, type text, press a key combination, or scroll on a Windows desktop during an active control session.",
            "tier": "standard",
            "category": "screen",
            "source": "builtin",
            "risk": "high",
            "defaultConsentLevel": "none",
            "discovery": {
                "aliases": ["click on desktop", "type on pc", "press key on computer", "scroll desktop"],
                "capabilities": ["click a remote desktop", "type text on a remote desktop", "send key combos"],
                "examples": ["Click the Start button", "Type hello in Notepad"],
                "priority": 30
            },
            "parameters": {
                "type": "object",
                "properties": {
                    "sessionId": { "type": "string", "description": "Active control session ID." },
                    "action": {
                        "type": "string",
                        "enum": ["move", "click", "type", "key", "scroll"],
                        "description": "Action to perform on the remote desktop."
                    },
                    "x": { "type": "number", "description": "Virtual desktop X coordinate for move/click." },
                    "y": { "type": "number", "description": "Virtual desktop Y coordinate for move/click." },
                    "button": {
                        "type": "string",
                        "enum": ["left", "right", "middle"],
                        "description": "Mouse button for click. Default left."
                    },
                    "clicks": { "type": "number", "description": "Click count for click. 1-3. Default 1." },
                    "text": { "type": "string", "description": "Text to type for type." },
                    "combo": { "type": "string", "description": "Key combination for key, e.g. win+r or ctrl+l." },
                    "direction": {
                        "type": "string",
                        "enum": ["up", "down", "left", "right"],
                        "description": "Scroll direction for scroll. Default down."
                    },
                    "amount": { "type": "number", "description": "Wheel steps for scroll. Default 1." },
                    "includeScreenshot": {
                        "type": "boolean",
                        "description": "Ask the target to return a screenshot with the action result."
                    },
                    "waitAfterMs": {
                        "type": "number",
                        "description": "Delay after the action in ms, 0-10000. Default 0."
                    }
                },
                "required": ["sessionId", "action"]
            }
        }
    ])
});

/// Full tool metadata bundle, mirroring `createComputerTools()` in the TS module.
pub fn metadata() -> &'static Value {
    &METADATA
}

/// Metadata for a single computer tool.
///
/// Panics when `name` is not one of the four ported tools — callers in this crate only pass
/// the constants above, so a panic is a programming error, matching the sibling modules.
pub fn definition(name: &str) -> &'static Value {
    metadata()
        .as_array()
        .and_then(|tools| tools.iter().find(|tool| tool["name"] == name))
        .unwrap_or_else(|| panic!("unknown computer tool: {name}"))
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

fn success(message: impl Into<String>, data: Value) -> Value {
    json!({ "ok": true, "message": message.into(), "data": data })
}

fn host_error_message(error: HostError) -> String {
    match error {
        HostError::Error(message) => message,
        HostError::Thrown(value) => value
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| value.to_string()),
    }
}

fn cancelled(context: &Value) -> bool {
    context["aborted"].as_bool().unwrap_or(false)
        || context["signal"]["aborted"].as_bool().unwrap_or(false)
}

fn cancelled_result() -> Value {
    fail("Computer control was cancelled.")
}

fn owner_of(context: &Value) -> String {
    context["sessionId"].as_str().unwrap_or_default().to_owned()
}

fn validated(name: &str, input: &Value) -> Result<Value, Value> {
    let mut tool_input = ToolInput::new(input);
    let validation = validate_tool_input(&definition(name)["parameters"], &mut tool_input)
        .expect("static computer tool schema");
    if validation.valid {
        Ok(tool_input.value())
    } else {
        Err(fail(validation.errors.first().map(|e| String::from_utf16_lossy(&e.0)).unwrap_or_else(|| format!("Invalid input for {name}."))))
    }
}

fn finite(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64).filter(|n| n.is_finite())
}

fn opt_str(value: Option<&Value>) -> Option<&str> {
    value.and_then(Value::as_str)
}

/// A controllable desktop target, mirroring the TS `ComputerTarget` shape.
#[derive(Debug, Clone, PartialEq)]
pub struct Target {
    pub node_id: String,
    pub name: String,
    pub available: bool,
    pub reason: Option<String>,
}

impl Target {
    fn to_json(&self) -> Value {
        let mut map = json!({
            "nodeId": self.node_id,
            "name": self.name,
            "available": self.available,
        });
        if let Some(reason) = &self.reason {
            map["reason"] = json!(reason);
        }
        map
    }
}

/// `targetFromNode` — desktop + ready nodes only, Windows-only control.
pub fn target_from_node(node: &Value) -> Option<Target> {
    if opt_str(node.get("role")) != Some("desktop") || opt_str(node.get("lifecycle")) != Some("ready") {
        return None;
    }
    let node_id = node
        .get("nodeId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let name = node
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.is_empty())
        .unwrap_or(&node_id)
        .to_owned();

    if opt_str(node.get("platform")) != Some("windows") {
        return Some(Target {
            node_id,
            name,
            available: false,
            reason: Some(
                "Computer control is currently available on Windows desktop nodes only".to_owned(),
            ),
        });
    }

    let tools = node
        .get("capabilities")
        .and_then(|caps| caps.get("tools"))
        .and_then(Value::as_array)
        .map(|tools| tools.iter().filter_map(Value::as_str).collect::<Vec<_>>())
        .unwrap_or_default();

    match REQUIRED_TARGET_TOOLS
        .iter()
        .find(|required| !tools.contains(required))
    {
        Some(missing) => Some(Target {
            node_id,
            name,
            available: false,
            reason: Some(format!("Desktop update required ({missing} is unavailable)")),
        }),
        None => Some(Target {
            node_id,
            name,
            available: true,
            reason: None,
        }),
    }
}

/// `selectTarget` — resolves an explicit `nodeId`, otherwise requires a single candidate.
pub fn select_target(targets: &[Target], node_id: Option<&str>) -> Result<Target, String> {
    match node_id.filter(|id| !id.is_empty()) {
        Some(id) => {
            let target = targets
                .iter()
                .find(|target| target.node_id == id)
                .ok_or_else(|| format!("Computer target {id} is not connected"))?;
            if !target.available {
                return Err(target
                    .reason
                    .clone()
                    .unwrap_or_else(|| format!("Computer target {id} is unavailable")));
            }
            Ok(target.clone())
        }
        None => {
            let available = targets.iter().filter(|t| t.available).collect::<Vec<_>>();
            match available.len() {
                0 => Err("No controllable Windows desktop is connected".to_owned()),
                1 => Ok(available[0].clone()),
                _ => Err(format!(
                    "More than one computer is available; choose nodeId: {}",
                    available
                        .iter()
                        .map(|t| t.node_id.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                )),
            }
        }
    }
}

/// `validateActInput` — ordered manual validation that runs *after* schema validation.
pub fn validate_act_input(input: &Value) -> Result<(), String> {
    let action = input["action"].as_str().unwrap_or_default();

    if matches!(action, "move" | "click") && (finite(input.get("x")).is_none() || finite(input.get("y")).is_none())
    {
        return Err(format!(
            "{action} requires finite x and y coordinates"
        ));
    }

    if action == "click"
        && let Some(clicks) = finite(input.get("clicks"))
            && (clicks.fract() != 0.0 || !(1.0..=3.0).contains(&clicks)) {
                return Err("clicks must be an integer from 1 to 3".to_owned());
            }

    if action == "type" {
        match opt_str(input.get("text")) {
            Some(text) if !text.is_empty() => {}
            _ => return Err("type requires non-empty text".to_owned()),
        }
    }

    if action == "key" {
        match opt_str(input.get("combo")) {
            Some(combo) if !combo.trim().is_empty() => {}
            _ => return Err("key requires a key combo such as win+r or ctrl+l".to_owned()),
        }
    }

    if action == "scroll" && opt_str(input.get("direction")).is_none_or(|d| d.is_empty()) {
        return Err("scroll requires a direction".to_owned());
    }

    if let Some(amount) = finite(input.get("amount"))
        && amount <= 0.0 {
            return Err("amount must be a positive number".to_owned());
        }

    if let Some(wait) = finite(input.get("waitAfterMs"))
        && !(0.0..=MAX_WAIT_AFTER_MS).contains(&wait) {
            return Err(format!(
                "waitAfterMs must be between 0 and {}",
                MAX_WAIT_AFTER_MS as u64
            ));
        }

    Ok(())
}

/// `asRemoteToolResult` — structured remote results pass through, opaque payloads are wrapped.
pub fn as_remote_tool_result(value: &Value, fallback: &str) -> Value {
    if let Value::Object(map) = value
        && map.get("ok").and_then(Value::as_bool).is_some()
            && map.get("message").and_then(Value::as_str).is_some()
        {
            let mut result = json!({
                "ok": map["ok"].clone(),
                "message": map["message"].clone(),
            });
            if let Some(data) = map.get("data") {
                result["data"] = data.clone();
            }
            return result;
        }
    success(fallback, value.clone())
}

fn session_data(value: &Value) -> Value {
    json!({
        "id": value.get("id").cloned().unwrap_or(Value::Null),
        "nodeId": value.get("nodeId").cloned().unwrap_or(Value::Null),
        "expiresAt": value.get("expiresAt").cloned().unwrap_or(Value::Null),
    })
}

/// Computer control tools over injected host ports.
pub struct ComputerTools<C> {
    /// Node registry port (`"list"`).
    pub nodes: JaitPort<C>,
    /// Control session service port.
    pub sessions: JaitPort<C>,
    /// Remote tool proxy port (`"invoke"`).
    pub proxy: JaitPort<C>,
}

impl<C: Send + Sync> ComputerTools<C> {
    /// Dispatch by tool name. Unknown names produce a structured failure, never a panic.
    pub async fn call(&self, name: &str, input: &Value, context: &Value, host: &C) -> Value {
        match name {
            COMPUTER_TARGETS => self.computer_targets(input, context, host).await,
            COMPUTER_SESSION => self.computer_session(input, context, host).await,
            COMPUTER_OBSERVE => self.computer_observe(input, context, host).await,
            COMPUTER_ACT => self.computer_act(input, context, host).await,
            other => fail(format!("Unknown computer tool: {other}")),
        }
    }

    /// `computer.targets`
    pub async fn computer_targets(&self, input: &Value, _context: &Value, host: &C) -> Value {
        match self.computer_targets_inner(input, host).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(error)),
        }
    }

    async fn computer_targets_inner(&self, _input: &Value, host: &C) -> Result<Value, HostError> {
        let targets = self.list_targets(host).await?;
        if targets.is_empty() {
            return Ok(success(
                "No desktop computers are connected.",
                json!({ "targets": [] }),
            ));
        }
        let lines = targets
            .iter()
            .map(|target| {
                let status = if target.available {
                    "available".to_owned()
                } else {
                    target.reason.clone().unwrap_or_default()
                };
                format!("{} ({}): {}", target.name, target.node_id, status)
            })
            .collect::<Vec<_>>()
            .join("\n");
        Ok(success(
            lines,
            json!({
                "targets": targets.iter().map(Target::to_json).collect::<Vec<_>>(),
            }),
        ))
    }

    /// `computer.session`
    pub async fn computer_session(&self, input: &Value, context: &Value, host: &C) -> Value {
        if cancelled(context) {
            return cancelled_result();
        }
        let input = match validated(COMPUTER_SESSION, input) {
            Ok(input) => input,
            Err(result) => return result,
        };
        match self.computer_session_inner(&input, context, host).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(error)),
        }
    }

    async fn computer_session_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let owner = owner_of(context);
        match input["action"].as_str().unwrap_or_default() {
            "status" => {
                let sessions = match opt_str(input.get("sessionId")) {
                    Some(session_id) => {
                        let session = self.require_owned(session_id, &owner, host).await?;
                        vec![session]
                    }
                    None => self.list_sessions(&owner, host).await?,
                };
                let message = if sessions.is_empty() {
                    "No active computer session.".to_owned()
                } else {
                    format!("{} active computer session(s).", sessions.len())
                };
                Ok(success(message, json!({ "sessions": sessions })))
            }
            "start" => {
                let targets = self.list_targets(host).await?;
                let target = match select_target(&targets, opt_str(input.get("nodeId"))) {
                    Ok(target) => target,
                    Err(message) => return Ok(fail(message)),
                };
                if cancelled(context) {
                    return Ok(cancelled_result());
                }
                let session = match self
                    .invoke(
                        &self.sessions,
                        "start",
                        vec![json!(owner), json!(target.node_id)],
                        host,
                    )
                    .await
                {
                    Ok(session) => session,
                    Err(error) => return Ok(fail(host_error_message(error))),
                };
                let session_id = session
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                let remote = self
                    .invoke(
                        &self.proxy,
                        "invoke",
                        vec![
                            json!(COMPUTER_SESSION),
                            json!({
                                "action": "start",
                                "sessionId": session_id,
                                "expiresAt": session.get("expiresAt").cloned().unwrap_or(Value::Null),
                            }),
                            json!(SESSION_START_TIMEOUT_MS),
                        ],
                        host,
                    )
                    .await;
                let remote = match remote {
                    Ok(remote) => as_remote_tool_result(&remote, "Computer control started."),
                    Err(error) => json!({ "ok": false, "message": host_error_message(error) }),
                };
                if remote["ok"].as_bool() != Some(true) {
                    let _ = self
                        .invoke(&self.sessions, "stop", vec![json!(session_id)], host)
                        .await;
                    return Ok(remote);
                }
                Ok(json!({
                    "ok": true,
                    "message": format!(
                        "Computer control started on {}. A visible Jait cursor is active; Ctrl+Alt+Escape stops it locally.",
                        target.name
                    ),
                    "data": {
                        "session": session_data(&session),
                        "remote": remote.get("data").cloned().unwrap_or(Value::Null),
                    }
                }))
            }
            "stop" => {
                let Some(session_id) = opt_str(input.get("sessionId")) else {
                    return Ok(fail("sessionId is required to stop computer control"));
                };
                let session = match self.require_owned(session_id, &owner, host).await {
                    Ok(session) => session,
                    Err(error) => return Ok(fail(host_error_message(error))),
                };
                let remote = self
                    .invoke(
                        &self.proxy,
                        "invoke",
                        vec![
                            json!(COMPUTER_SESSION),
                            json!({ "action": "stop", "sessionId": session_id }),
                            json!(SESSION_STOP_TIMEOUT_MS),
                        ],
                        host,
                    )
                    .await
                    .map(|value| as_remote_tool_result(&value, "Computer control stopped."))
                    .unwrap_or_else(|error| json!({ "ok": false, "message": host_error_message(error) }));
                let _ = self
                    .invoke(&self.sessions, "stop", vec![json!(session["id"].clone())], host)
                    .await;
                Ok(remote)
            }
            other => Ok(fail(format!("Unsupported computer session action: {other}"))),
        }
    }

    /// `computer.observe`
    pub async fn computer_observe(&self, input: &Value, context: &Value, host: &C) -> Value {
        if cancelled(context) {
            return cancelled_result();
        }
        let input = match validated(COMPUTER_OBSERVE, input) {
            Ok(input) => input,
            Err(result) => return result,
        };
        match self.computer_observe_inner(&input, context, host).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(error)),
        }
    }

    async fn computer_observe_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let owner = owner_of(context);
        let session_id = input["sessionId"].as_str().unwrap_or_default();
        self.require_owned(session_id, &owner, host).await?;
        if cancelled(context) {
            return Ok(cancelled_result());
        }
        let remote = self
            .invoke(
                &self.proxy,
                "invoke",
                vec![
                    json!(COMPUTER_OBSERVE),
                    json!({ "sessionId": session_id }),
                    json!(OBSERVE_TIMEOUT_MS),
                ],
                host,
            )
            .await?;
        Ok(as_remote_tool_result(&remote, "Desktop captured."))
    }

    /// `computer.act`
    pub async fn computer_act(&self, input: &Value, context: &Value, host: &C) -> Value {
        if cancelled(context) {
            return cancelled_result();
        }
        let input = match validated(COMPUTER_ACT, input) {
            Ok(input) => input,
            Err(result) => return result,
        };
        if let Err(message) = validate_act_input(&input) {
            return fail(message);
        }
        match self.computer_act_inner(&input, context, host).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(error)),
        }
    }

    async fn computer_act_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let owner = owner_of(context);
        let session_id = input["sessionId"].as_str().unwrap_or_default().to_owned();
        self.require_owned(&session_id, &owner, host).await?;
        if cancelled(context) {
            return Ok(cancelled_result());
        }
        let action = input["action"].as_str().unwrap_or_default().to_owned();
        let remote = self
            .invoke(
                &self.proxy,
                "invoke",
                vec![
                    json!(COMPUTER_ACT),
                    input.clone(),
                    json!(ACT_TIMEOUT_MS),
                ],
                host,
            )
            .await?;
        Ok(as_remote_tool_result(
            &remote,
            &format!("Computer action {action} completed."),
        ))
    }

    async fn invoke(
        &self,
        port: &JaitPort<C>,
        method: &str,
        args: Vec<Value>,
        host: &C,
    ) -> Result<Value, HostError> {
        Ok(port(method, args, host).await?.unwrap_or(Value::Null))
    }

    async fn list_targets(&self, host: &C) -> Result<Vec<Target>, HostError> {
        let nodes = self.invoke(&self.nodes, "list", Vec::new(), host).await?;
        Ok(nodes
            .as_array()
            .map(|nodes| nodes.iter().filter_map(target_from_node).collect())
            .unwrap_or_default())
    }

    async fn list_sessions(&self, owner: &str, host: &C) -> Result<Vec<Value>, HostError> {
        let sessions = self
            .invoke(&self.sessions, "list", vec![json!(owner)], host)
            .await?;
        Ok(sessions
            .as_array()
            .map(|sessions| sessions.iter().map(session_data).collect())
            .unwrap_or_default())
    }

    async fn require_owned(
        &self,
        session_id: &str,
        owner: &str,
        host: &C,
    ) -> Result<Value, HostError> {
        if session_id.is_empty() {
            return Err(HostError::Error(
                "An active computer control session is required.".to_owned(),
            ));
        }
        let session = self
            .invoke(
                &self.sessions,
                "requireOwned",
                vec![json!(session_id), json!(owner)],
                host,
            )
            .await?;
        Ok(session_data(&session))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use futures_util::future::BoxFuture;

    use super::*;

    type Ctx = Value;

    fn port<F>(handler: F) -> JaitPort<Ctx>
    where
        F: for<'a> Fn(&'a str, Vec<Value>) -> BoxFuture<'a, Result<Option<Value>, HostError>>
            + Send
            + Sync
            + 'static,
    {
        Arc::new(move |method: &str, args: Vec<Value>, _host: &Ctx| handler(method, args))
    }

    fn nodes_port(nodes: Value) -> JaitPort<Ctx> {
        port(move |method, _args| {
            let nodes = nodes.clone();
            Box::pin(async move {
                match method {
                    "list" => Ok(Some(nodes)),
                    _ => Ok(None),
                }
            })
        })
    }

    fn session_port() -> JaitPort<Ctx> {
        port(|method, args| {
            Box::pin(async move {
                match method {
                    "start" => Ok(Some(json!({
                        "id": "sess-1",
                        "nodeId": args[1].clone(),
                        "ownerSessionId": args[0].clone(),
                        "expiresAt": "2024-01-01T00:15:00Z"
                    }))),
                    "stop" => Ok(Some(Value::Null)),
                    "requireOwned" => {
                        if args[0] == json!("sess-1") && !args[1].as_str().unwrap_or_default().is_empty() {
                            Ok(Some(json!({
                                "id": "sess-1",
                                "nodeId": "node-a",
                                "expiresAt": "2024-01-01T00:15:00Z"
                            })))
                        } else {
                            Err(HostError::Error(format!(
                                "Computer session {} is not active or is owned by another conversation.",
                                args[0].as_str().unwrap_or_default()
                            )))
                        }
                    }
                    "list" => Ok(Some(json!([]))),
                    _ => Ok(None),
                }
            })
        })
    }

    fn proxy_port(result: Value) -> JaitPort<Ctx> {
        port(move |method, _args| {
            let result = result.clone();
            Box::pin(async move {
                match method {
                    "invoke" => Ok(Some(result)),
                    _ => Ok(None),
                }
            })
        })
    }

    fn windows_node(tools: Value) -> Value {
        json!({
            "nodeId": "node-a",
            "name": "Study PC",
            "role": "desktop",
            "platform": "windows",
            "lifecycle": "ready",
            "capabilities": { "tools": tools }
        })
    }

    fn mac_node() -> Value {
        let mut mac = windows_node(json!(["computer.session"]));
        mac["nodeId"] = json!("node-b");
        mac["name"] = json!("Mac");
        mac["platform"] = json!("darwin");
        mac
    }

    fn windows_node_with_id(node_id: &str) -> Value {
        let mut node = windows_node(json!([
            "computer.session",
            "computer.observe",
            "computer.act"
        ]));
        node["nodeId"] = json!(node_id);
        node
    }

    fn tools() -> ComputerTools<Ctx> {
        ComputerTools {
            nodes: nodes_port(json!([windows_node(json!([
                "computer.session",
                "computer.observe",
                "computer.act"
            ]))])),
            sessions: session_port(),
            proxy: proxy_port(json!({ "ok": true, "message": "remote ok", "data": { "frames": 1 } })),
        }
    }

    #[test]
    fn metadata_lists_all_four_tools() {
        let names = metadata()
            .as_array()
            .unwrap()
            .iter()
            .map(|tool| tool["name"].as_str().unwrap().to_owned())
            .collect::<Vec<_>>();
        assert_eq!(
            names,
            vec![
                COMPUTER_TARGETS.to_owned(),
                COMPUTER_SESSION.to_owned(),
                COMPUTER_OBSERVE.to_owned(),
                COMPUTER_ACT.to_owned()
            ]
        );
    }

    #[test]
    fn definition_matches_metadata_and_risk_levels() {
        assert_eq!(definition(COMPUTER_SESSION)["risk"], json!("high"));
        assert_eq!(definition(COMPUTER_SESSION)["defaultConsentLevel"], json!("once"));
        assert_eq!(definition(COMPUTER_ACT)["risk"], json!("high"));
        assert_eq!(definition(COMPUTER_TARGETS)["defaultConsentLevel"], json!("none"));
    }

    #[test]
    fn target_from_node_filters_non_desktop_and_non_ready_nodes() {
        assert!(target_from_node(&json!({ "role": "gateway", "lifecycle": "ready" })).is_none());
        assert!(target_from_node(&json!({ "role": "desktop", "lifecycle": "offline" })).is_none());
    }

    #[test]
    fn target_from_node_reports_platform_and_missing_tools() {
        let mac = target_from_node(&json!({
            "nodeId": "node-mac",
            "name": "Mac",
            "role": "desktop",
            "platform": "darwin",
            "lifecycle": "ready"
        }))
        .unwrap();
        assert!(!mac.available);
        assert!(mac.reason.unwrap().contains("Windows desktop nodes only"));

        let stale = target_from_node(&windows_node(json!(["computer.session"]))).unwrap();
        assert!(!stale.available);
        assert_eq!(
            stale.reason.unwrap(),
            "Desktop update required (computer.observe is unavailable)"
        );

        let ready = target_from_node(&windows_node(json!([
            "computer.session",
            "computer.observe",
            "computer.act"
        ])))
        .unwrap();
        assert!(ready.available);
        assert!(ready.reason.is_none());
    }

    #[test]
    fn select_target_requires_disambiguation_and_known_nodes() {
        let targets = vec![
            Target { node_id: "a".into(), name: "A".into(), available: true, reason: None },
            Target { node_id: "b".into(), name: "B".into(), available: true, reason: None },
        ];
        assert_eq!(
            select_target(&targets, None).unwrap_err(),
            "More than one computer is available; choose nodeId: a, b"
        );
        assert_eq!(
            select_target(&targets, Some("zzz")).unwrap_err(),
            "Computer target zzz is not connected"
        );
        assert_eq!(select_target(&targets, Some("b")).unwrap().node_id, "b");

        let unavailable = vec![Target {
            node_id: "c".into(),
            name: "C".into(),
            available: false,
            reason: Some("Desktop update required (computer.act is unavailable)".into()),
        }];
        assert_eq!(
            select_target(&unavailable, None).unwrap_err(),
            "No controllable Windows desktop is connected"
        );
    }

    #[test]
    fn validate_act_input_enforces_ordered_bounds() {
        assert_eq!(
            validate_act_input(&json!({ "action": "click" })).unwrap_err(),
            "click requires finite x and y coordinates"
        );
        assert_eq!(
            validate_act_input(&json!({ "action": "click", "x": 1, "y": 2, "clicks": 4 })).unwrap_err(),
            "clicks must be an integer from 1 to 3"
        );
        assert_eq!(
            validate_act_input(&json!({ "action": "click", "x": 1, "y": 2, "clicks": 1.5 })).unwrap_err(),
            "clicks must be an integer from 1 to 3"
        );
        assert_eq!(
            validate_act_input(&json!({ "action": "type", "text": "" })).unwrap_err(),
            "type requires non-empty text"
        );
        assert_eq!(
            validate_act_input(&json!({ "action": "key", "combo": "   " })).unwrap_err(),
            "key requires a key combo such as win+r or ctrl+l"
        );
        assert_eq!(
            validate_act_input(&json!({ "action": "scroll" })).unwrap_err(),
            "scroll requires a direction"
        );
        assert_eq!(
            validate_act_input(&json!({ "action": "scroll", "direction": "down", "amount": 0 })).unwrap_err(),
            "amount must be a positive number"
        );
        assert_eq!(
            validate_act_input(&json!({ "action": "move", "x": 1, "y": 2, "waitAfterMs": 10001 })).unwrap_err(),
            "waitAfterMs must be between 0 and 10000"
        );
        assert!(validate_act_input(&json!({ "action": "move", "x": 1, "y": 2, "waitAfterMs": 0 })).is_ok());
    }

    #[tokio::test]
    async fn targets_reports_availability_lines() {
        let tools = ComputerTools {
            nodes: nodes_port(json!([
                windows_node(json!(["computer.session", "computer.observe", "computer.act"])),
                mac_node()
            ])),
            sessions: session_port(),
            proxy: proxy_port(Value::Null),
        };
        let result = tools.computer_targets(&json!({}), &json!({}), &json!({})).await;
        assert_eq!(result["ok"], json!(true));
        assert!(result["message"].as_str().unwrap().contains("Study PC (node-a): available"));
        assert_eq!(result["data"]["targets"].as_array().unwrap().len(), 2);
        assert_eq!(result["data"]["targets"][1]["available"], json!(false));
    }

    #[tokio::test]
    async fn session_start_requires_a_resolvable_target() {
        let mut tools = tools();
        tools.nodes = nodes_port(json!([
            windows_node(json!(["computer.session", "computer.observe", "computer.act"])),
            windows_node_with_id("node-b")
        ]));
        let denied = tools
            .computer_session(&json!({ "action": "start" }), &json!({ "sessionId": "chat-1" }), &json!({}))
            .await;
        assert_eq!(denied["ok"], json!(false));
        assert!(denied["message"].as_str().unwrap().contains("choose nodeId"));

        let started = tools
            .computer_session(
                &json!({ "action": "start", "nodeId": "node-a" }),
                &json!({ "sessionId": "chat-1" }),
                &json!({}),
            )
            .await;
        assert_eq!(started["ok"], json!(true));
        assert_eq!(started["data"]["session"]["id"], json!("sess-1"));
        assert_eq!(started["data"]["remote"]["frames"], json!(1));
        assert!(started["message"].as_str().unwrap().contains("Ctrl+Alt+Escape"));
    }

    #[tokio::test]
    async fn observe_denies_unowned_session() {
        let result = tools()
            .computer_observe(
                &json!({ "sessionId": "sess-other" }),
                &json!({ "sessionId": "chat-1" }),
                &json!({}),
            )
            .await;
        assert_eq!(result["ok"], json!(false));
        assert!(result["message"].as_str().unwrap().contains("another conversation"));
    }

    #[tokio::test]
    async fn observe_wraps_opaque_remote_payloads() {
        let mut tools = tools();
        tools.proxy = proxy_port(json!({ "pngBase64": "AAA", "width": 10 }));
        let result = tools
            .computer_observe(
                &json!({ "sessionId": "sess-1" }),
                &json!({ "sessionId": "chat-1" }),
                &json!({}),
            )
            .await;
        assert_eq!(result["ok"], json!(true));
        assert_eq!(result["message"], json!("Desktop captured."));
        assert_eq!(result["data"]["width"], json!(10));
    }

    #[tokio::test]
    async fn act_rejects_invalid_input_before_touching_ports() {
        let result = tools()
            .computer_act(
                &json!({ "sessionId": "sess-1", "action": "type", "text": "" }),
                &json!({ "sessionId": "chat-1" }),
                &json!({}),
            )
            .await;
        assert_eq!(result["ok"], json!(false));
        assert_eq!(result["message"], json!("type requires non-empty text"));
    }

    #[tokio::test]
    async fn act_forwards_owned_session_actions() {
        let result = tools()
            .computer_act(
                &json!({ "sessionId": "sess-1", "action": "click", "x": 10, "y": 20, "clicks": 2 }),
                &json!({ "sessionId": "chat-1" }),
                &json!({}),
            )
            .await;
        assert_eq!(result["ok"], json!(true));
        assert_eq!(result["message"], json!("remote ok"));
        assert_eq!(result["data"]["frames"], json!(1));
    }

    #[tokio::test]
    async fn cancellation_short_circuits_every_tool() {
        let context = json!({ "sessionId": "chat-1", "signal": { "aborted": true } });
        for name in [COMPUTER_SESSION, COMPUTER_OBSERVE, COMPUTER_ACT] {
            let result = tools()
                .call(name, &json!({ "action": "status", "sessionId": "sess-1" }), &context, &json!({}))
                .await;
            assert_eq!(result["ok"], json!(false), "{name} should be cancelled");
            assert_eq!(result["message"], json!("Computer control was cancelled."));
        }
    }

    #[tokio::test]
    async fn unknown_tool_name_is_a_structured_failure() {
        let result = tools().call("computer.nope", &json!({}), &json!({}), &json!({})).await;
        assert_eq!(result["ok"], json!(false));
        assert!(result["message"].as_str().unwrap().contains("Unknown computer tool"));
    }
}
