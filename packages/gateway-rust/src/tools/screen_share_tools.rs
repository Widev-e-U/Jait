//! Native port of `packages/gateway/src/tools/screen-share-tools.ts`
//! (`screen.share`, `screen.capture`, `screen.record`).
//!
//! Device/session state is native ([`ScreenShareService`]); every effect the
//! TypeScript module performed through `WsControlPlane` or the media layer is a
//! trusted host effect behind [`ScreenSharePort`] (`src/routes/screen_share.rs`):
//!
//! | port effect    | payload                                                    | expected result                       |
//! |----------------|------------------------------------------------------------|---------------------------------------|
//! | `StartRequest` | `{ session_id, host_device_id, viewer_device_ids }`        | signaling sent to the host device     |
//! | `Broadcast`    | the committed session object                               | session pushed to every client        |
//! | `Capture`      | -                                                          | `captureScreen()` snapshot            |
//! | `Record`       | -                                                          | `startRecording()` handle             |
//!
//! Fidelity notes:
//! * `ws.sendUICommand({ command: "screen-share.open", ... })` has no
//!   `ScreenShareEffect` variant; the caller opens the panel from the returned
//!   session (`data.id` / `data.hostDeviceId`).
//! * Without a control plane (`port == None`) the viewer list is `[]` unless the
//!   caller supplied `viewerDeviceIds`, matching the TS `ws === undefined` path;
//!   `connected_device_ids` stands in for `ws.getConnectedDeviceIds()`.
//! * `createOsTool` (`os.tool` / `os_tool`) is deliberately out of scope: it needs
//!   `updateViewerTransport`, which the native service does not expose.
//! * `capture`/`record` without a port fail explicitly instead of raising inside
//!   the TS `ScreenShareService` (no native media pipeline).

use super::validate::{ToolInput, validate_tool_input};
use crate::routes::screen_share::{ScreenShareEffect, ScreenShareError, ScreenSharePort};
use crate::services::screen_share::{ScreenShareService, StartOptions};
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock, Mutex};

static METADATA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("screen-share-tools-metadata.json"))
        .expect("screen-share-tools-metadata.json")
});

/// Tool names owned by this module, in metadata order.
pub const TOOL_NAMES: [&str; 3] = ["screen.share", "screen.capture", "screen.record"];

pub fn metadata() -> &'static Value {
    &METADATA
}

/// The definition named `name`.
///
/// # Panics
/// Panics when `name` is not present in the metadata document.
pub fn definition(name: &str) -> &'static Value {
    METADATA
        .as_array()
        .and_then(|tools| {
            tools
                .iter()
                .find(|tool| tool["name"].as_str() == Some(name))
        })
        .unwrap_or_else(|| panic!("missing tool definition: {name}"))
}

fn success(message: impl Into<String>, data: Value) -> Value {
    json!({ "ok": true, "message": message.into(), "data": data })
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

/// JS template interpolation `${value}` / `String(value)` text.
fn display(value: &Value) -> String {
    match value {
        Value::Null => "undefined".into(),
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

/// `input[key] ?? fallback` reduced to a non-empty string (the TS `if (!value)`
/// guard rejects `""` too).
fn non_empty_str(input: &Value, key: &str) -> Option<String> {
    match input.get(key) {
        Some(Value::String(text)) if !text.is_empty() => Some(text.clone()),
        Some(Value::Null) | None => None,
        Some(other) => {
            let text = display(other);
            (!text.is_empty()).then_some(text)
        }
    }
}

/// `input.viewerDeviceIds ?? ws.getConnectedDeviceIds().filter(id => id !== host)`
/// (or `[]` when there is no control plane).
fn viewer_device_ids(input: &Value, host: &str, connected: Option<&[String]>) -> Vec<String> {
    match input.get("viewerDeviceIds") {
        Some(Value::Array(items)) => items.iter().map(display).collect(),
        Some(Value::Null) | None => match connected {
            Some(ids) => ids
                .iter()
                .filter(|id| id.as_str() != host)
                .cloned()
                .collect(),
            None => Vec::new(),
        },
        Some(other) => vec![display(other)],
    }
}

fn effect_error(error: &ScreenShareError) -> String {
    match error {
        ScreenShareError::Message(message) => message.clone(),
        ScreenShareError::Thrown(value) => match value {
            Value::String(text) => text.clone(),
            Value::Null => "Screen share host effect failed.".into(),
            other => other.to_string(),
        },
    }
}

/// Validated `screen.share` input, or the failure result to return.
fn validated_share(input: &Value) -> Result<Value, Value> {
    let mut tool_input = ToolInput::new(input);
    let validation =
        validate_tool_input(&definition("screen.share")["parameters"], &mut tool_input)
            .expect("static tool schema");
    if validation.valid {
        Ok(tool_input.value())
    } else {
        Err(fail(format!(
            "Input validation failed: {}",
            validation
                .errors
                .iter()
                .map(|line| String::from_utf16_lossy(&line.0))
                .collect::<Vec<_>>()
                .join("; ")
        )))
    }
}

/// `screen.share` / `screen.capture` / `screen.record` over shared device state.
#[derive(Clone)]
pub struct ScreenShareTools {
    /// The gateway's screen-share state machine.
    pub service: Arc<Mutex<ScreenShareService>>,
    /// WebSocket signaling / broadcast / media effects; `None` mirrors TS `ws === undefined`.
    pub port: Option<ScreenSharePort>,
    /// Result of `ws.getConnectedDeviceIds()` when a control plane is attached.
    pub connected_device_ids: Option<Vec<String>>,
}

impl ScreenShareTools {
    pub fn new(service: Arc<Mutex<ScreenShareService>>) -> Self {
        Self {
            service,
            port: None,
            connected_device_ids: None,
        }
    }

    pub fn with_port(mut self, port: ScreenSharePort) -> Self {
        self.port = Some(port);
        self
    }

    pub fn with_connected_device_ids(mut self, ids: Vec<String>) -> Self {
        self.connected_device_ids = Some(ids);
        self
    }

    /// Dispatch by tool name; always returns a tool result (`{ ok, message, data? }`).
    pub fn execute(&self, name: &str, input: &Value) -> Value {
        self.execute_for_chat(name, input, None)
    }

    pub fn execute_for_chat(&self, name: &str, input: &Value, chat_id: Option<&str>) -> Value {
        match name {
            "screen.share" => self.share_for_chat(input, chat_id),
            "screen.capture" => self.capture(),
            "screen.record" => self.record(),
            other => fail(format!("Unknown screen tool: {other}")),
        }
    }

    pub fn share(&self, input: &Value) -> Value {
        self.share_for_chat(input, None)
    }

    /// The caller must supply the authenticated owning chat for agent requests.
    pub fn share_for_chat(&self, input: &Value, chat_id: Option<&str>) -> Value {
        let input = match validated_share(input) {
            Ok(value) => value,
            Err(result) => return result,
        };
        match input["action"].as_str() {
            Some("list-devices") => self.list_devices(),
            Some("connect") | Some("start") => self.connect(&input, chat_id),
            Some("disconnect") => self.disconnect(chat_id),
            Some(other) => fail(format!("Unknown action: {other}")),
            None => fail(format!("Unknown action: {}", display(&input["action"]))),
        }
    }

    fn list_devices(&self) -> Value {
        let state = self.state();
        let devices = state["devices"].as_array().cloned().unwrap_or_default();
        let web: Vec<&Value> = devices
            .iter()
            .filter(|device| device["platform"] == json!("web"))
            .collect();
        let local: Option<Value> = if web.len() == 1 {
            Some(web[0]["id"].clone())
        } else {
            None
        };
        let is_current = |device: &Value| local.as_ref().is_some_and(|id| device["id"] == *id);

        let mut lines = Vec::with_capacity(devices.len());
        for device in &devices {
            lines.push(format!(
                "- {} [{}] id={}{}",
                display(&device["name"]),
                display(&device["platform"]),
                display(&device["id"]),
                if is_current(device) {
                    " (current — cannot connect to this)"
                } else {
                    ""
                }
            ));
        }
        let remote = devices.iter().filter(|device| !is_current(device)).count();

        let message = if lines.is_empty() {
            "No devices registered. The user needs to open Jait on another device first."
                .to_string()
        } else {
            let mut message = format!("Devices:\n{}", lines.join("\n"));
            if remote == 0 {
                message.push_str("\n\nNo remote devices available to connect to.");
            }
            message
        };

        let session = &state["activeSession"];
        let active_session = if session.is_object() {
            json!({
                "id": session["id"],
                "status": session["status"],
                "hostDeviceId": session["hostDeviceId"],
            })
        } else {
            Value::Null
        };

        let listed: Vec<Value> = devices
            .iter()
            .map(|device| {
                json!({
                    "id": device["id"],
                    "name": device["name"],
                    "platform": device["platform"],
                    "isCurrent": is_current(device),
                    "capabilities": device["capabilities"],
                })
            })
            .collect();

        success(
            message,
            json!({
                "localDeviceId": local.unwrap_or(Value::Null),
                "devices": listed,
                "activeSession": active_session,
            }),
        )
    }

    fn connect(&self, input: &Value, chat_id: Option<&str>) -> Value {
        let Some(chat_id) = chat_id.filter(|id| !id.trim().is_empty()) else {
            return fail("An authenticated chat is required to request a screen share.");
        };
        let Some(host) =
            non_empty_str(input, "targetDeviceId").or_else(|| non_empty_str(input, "hostDeviceId"))
        else {
            let devices = self.devices();
            if devices.is_empty() {
                return fail(
                    "No devices registered. The user needs to open Jait on the target device \
                     (desktop app, mobile app, or browser) first. Each device auto-registers when it opens.",
                );
            }
            let available = devices
                .iter()
                .map(|device| format!("{} ({})", display(&device["name"]), display(&device["id"])))
                .collect::<Vec<_>>()
                .join(", ");
            return fail(format!(
                "targetDeviceId/hostDeviceId is required. Available devices: {available}"
            ));
        };

        let viewers = viewer_device_ids(input, &host, self.connected_device_ids.as_deref());
        let mut service = self.service.lock().expect("screen share service lock");
        let previous = service.chat_session(chat_id);
        let state = match service.start_with_options(
                &host,
                Some(&viewers),
                StartOptions {
                    chat_id: Some(chat_id.to_owned()),
                    node_id: Some(host.clone()),
                    initiated_by_agent: true,
                    require_consent: true,
                    reason: Some("The agent wants to view this screen in the chat.".into()),
                },
            ) {
            Ok(session) => session,
            Err(error) => return fail(error),
        };
        let stopped = previous.as_ref().and_then(|old| old["id"].as_str())
            .and_then(|id| service.session(id)).filter(|old| old["status"] == "idle");
        drop(service);

        if let Some(port) = &self.port {
            if let Some(stopped) = stopped {
                if let Err(error) = port(ScreenShareEffect::Broadcast(stopped)) {
                    return fail(effect_error(&error));
                }
            }
            let request = ScreenShareEffect::StartRequest {
                session_id: display(&state["id"]),
                host_device_id: host.clone(),
                viewer_device_ids: Some(viewers),
                options: json!({"chatId":state["chatId"],"nodeId":state["nodeId"],"initiatedBy":state["initiatedBy"],"requireConsent":state["pendingApproval"],"reason":state["reason"]}),
            };
            if let Err(error) = port(request) {
                return fail(effect_error(&error));
            }
            if let Err(error) = port(ScreenShareEffect::Broadcast(state.clone())) {
                return fail(effect_error(&error));
            }
        }

        success(
            format!(
                "Requested screen access to \"{host}\". Waiting for the device to approve the share."
            ),
            state,
        )
    }

    fn disconnect(&self, chat_id: Option<&str>) -> Value {
        let Some(chat_id) = chat_id.filter(|id| !id.trim().is_empty()) else {
            return fail("An authenticated chat is required to stop a screen share.");
        };
        let mut service = self.service.lock().expect("screen share service lock");
        let owned = service.chat_session(chat_id);
        let state = owned.as_ref().and_then(|s| s["id"].as_str())
            .map(|id| service.stop_session(Some(id))).unwrap_or(Value::Null);
        drop(service);
        if !state.is_null() {
            if let Some(port) = &self.port {
                if let Err(error) = port(ScreenShareEffect::Broadcast(state.clone())) {
                    return fail(effect_error(&error));
                }
            }
        }
        success("Screen viewing session ended.", state)
    }

    /// `screen.capture` — `screenShare.captureScreen()` is a host media effect.
    pub fn capture(&self) -> Value {
        match &self.port {
            Some(port) => match port(ScreenShareEffect::Capture) {
                Ok(data) => success("Screen captured.", data),
                Err(error) => fail(effect_error(&error)),
            },
            None => fail("Screen capture requires a host media port."),
        }
    }

    /// `screen.record` — `screenShare.startRecording()` is a host media effect.
    pub fn record(&self) -> Value {
        match &self.port {
            Some(port) => match port(ScreenShareEffect::Record) {
                Ok(data) => success("Screen recording started.", data),
                Err(error) => fail(effect_error(&error)),
            },
            None => fail("Screen recording requires a host media port."),
        }
    }

    fn state(&self) -> Value {
        self.service
            .lock()
            .expect("screen share service lock")
            .state()
    }

    fn devices(&self) -> Vec<Value> {
        self.state()["devices"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod chat_consent_tests {
    use super::*;

    #[test]
    fn replacement_and_disconnect_only_stop_the_owning_chat() {
        let service = Arc::new(Mutex::new(ScreenShareService::default()));
        service.lock().unwrap().register_device(json!({"id":"host","name":"host","platform":"desktop","authorized":true,"capabilities":[]}));
        let events = Arc::new(Mutex::new(Vec::new()));
        let recorded = events.clone();
        let tool = ScreenShareTools::new(service.clone()).with_port(Arc::new(move |effect| {
            recorded.lock().unwrap().push(effect);
            Ok(Value::Null)
        }));
        let input = json!({"action":"connect","targetDeviceId":"host"});
        let old = tool.execute_for_chat("screen.share", &input, Some("chat-a"))["data"]["id"].as_str().unwrap().to_owned();
        let other = tool.execute_for_chat("screen.share", &input, Some("chat-b"))["data"]["id"].as_str().unwrap().to_owned();
        events.lock().unwrap().clear();
        let replacement = tool.execute_for_chat("screen.share", &input, Some("chat-a"));
        assert_eq!(replacement["ok"], true);
        assert!(matches!(&events.lock().unwrap()[0], ScreenShareEffect::Broadcast(state) if state["id"] == old && state["status"] == "idle"));
        let result = tool.execute_for_chat("screen.share", &json!({"action":"disconnect"}), Some("chat-a"));
        assert_eq!(result["data"]["status"], "idle");
        let state = service.lock().unwrap();
        assert!(state.chat_session("chat-a").is_none());
        assert_eq!(state.chat_session("chat-b").unwrap()["id"], other);
    }

    #[test]
    fn agent_share_requires_chat_and_remains_pending_for_host_approval() {
        let service = Arc::new(Mutex::new(ScreenShareService::default()));
        service.lock().unwrap().register_device(json!({"id":"host","name":"host","platform":"desktop","authorized":true,"capabilities":[]}));
        let events = Arc::new(Mutex::new(Vec::new()));
        let recorded = events.clone();
        let tool = ScreenShareTools::new(service.clone()).with_port(Arc::new(move |effect| {
            recorded.lock().unwrap().push(effect);
            Ok(Value::Null)
        }));
        let input = json!({"action":"connect","targetDeviceId":"host"});
        assert_eq!(tool.execute("screen.share", &input)["ok"], false);
        assert!(events.lock().unwrap().is_empty());
        assert!(service.lock().unwrap().chat_session("chat-a").is_none());

        let result = tool.execute_for_chat("screen.share", &input, Some("chat-a"));
        assert_eq!(result["ok"], true);
        assert_eq!(result["data"]["chatId"], "chat-a");
        assert_eq!(result["data"]["nodeId"], "host");
        assert_eq!(result["data"]["initiatedBy"], "agent");
        assert_eq!(result["data"]["pendingApproval"], true);
        let events = events.lock().unwrap();
        assert!(
            matches!(&events[0], ScreenShareEffect::StartRequest { options, .. }
            if options["chatId"] == "chat-a" && options["requireConsent"] == true)
        );
    }
}
