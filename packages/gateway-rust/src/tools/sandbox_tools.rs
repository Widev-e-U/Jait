//! Port of `packages/gateway/src/tools/sandbox-tools.ts`.
//!
//! Four tools drive the sandbox manager that lives on the TypeScript side; the
//! native adapter has no docker/port-reservation capability, so every tool is a
//! thin pass-through onto `JaitPort<C>` with the original argument shapes:
//!
//! | host method | arguments |
//! |-------------|-----------|
//! | `sandbox.windows.start` | `[{ ramSize?, cpuCores?, diskSize?, version?, rdpPort?, webViewerPort?, sshPort?, waitForWebViewer?, username?, password? }]` → `{ status, … }` |
//! | `sandbox.windows.stop` | `[containerName, { removeStorage? }]` |
//! | `sandbox.linuxDesktop.start` | `[{ projectRoot, screenRes?, mountMode, networkEnabled?, novncPort?, vncPort?, cdpPort?, waitForCdp?, hostGateway? }]` → `{ status, … }` |
//! | `sandbox.linuxDesktop.stop` | `[containerName]` |
//!
//! `projectRoot` comes from the tool context (`ToolContext.projectRoot`).
//! Cancellation mirrors `context.signal.aborted`: the aborted flag is read from
//! `context["aborted"]` or `context["signal"]["aborted"]`.

use super::core_io::HostError;
use super::core_jait::JaitPort;
use super::validate::{ToolInput, validate_tool_input};
use serde_json::{Map, Value, json};
use std::sync::LazyLock;

static METADATA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("sandbox-tools-metadata.json"))
        .expect("sandbox-tools-metadata.json")
});

pub fn metadata() -> &'static Value {
    &METADATA
}

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

/// `err.message` from the TS modules: the host error's message text.
fn error_text(error: &HostError) -> String {
    match error {
        HostError::Error(message) => message.clone(),
        HostError::Thrown(value) => match value {
            Value::String(text) => text.clone(),
            Value::Null => "Host error".into(),
            other => other.to_string(),
        },
    }
}

fn cancelled(context: &Value) -> bool {
    context
        .get("aborted")
        .and_then(Value::as_bool)
        .or_else(|| {
            context
                .get("signal")
                .and_then(|signal| signal.get("aborted"))
                .and_then(Value::as_bool)
        })
        .unwrap_or(false)
}

/// Copy `input[from]` to `request[to]` when present (null/absent keys are dropped,
/// matching `JSON.stringify` of an object literal containing `undefined`).
fn forward(request: &mut Map<String, Value>, input: &Value, from: &str, to: &str) {
    if let Some(value) = input.get(from)
        && !value.is_null()
    {
        request.insert(to.to_string(), value.clone());
    }
}

fn validation_failure(name: &str, input: &Value) -> Result<Value, Value> {
    let mut validated = ToolInput::new(input);
    let validation = validate_tool_input(&definition(name)["parameters"], &mut validated)
        .expect("static sandbox tool schema");
    if validation.valid {
        Ok(validated.value())
    } else {
        Err(fail(format!(
            "Input validation failed: {}",
            validation
                .errors
                .iter()
                .map(|s| String::from_utf16_lossy(&s.0))
                .collect::<Vec<_>>()
                .join("; ")
        )))
    }
}

pub struct SandboxTools<C> {
    pub host: JaitPort<C>,
}

impl<C: Send + Sync> SandboxTools<C> {
    pub async fn windows_start(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("windows.sandbox.start", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        let mut request = Map::new();
        forward(&mut request, &input, "ramSize", "ramSize");
        forward(&mut request, &input, "cpuCores", "cpuCores");
        forward(&mut request, &input, "diskSize", "diskSize");
        forward(&mut request, &input, "windowsVersion", "version");
        forward(&mut request, &input, "rdpPort", "rdpPort");
        forward(&mut request, &input, "webViewerPort", "webViewerPort");
        forward(&mut request, &input, "sshPort", "sshPort");
        forward(&mut request, &input, "waitForWebViewer", "waitForWebViewer");
        forward(&mut request, &input, "username", "username");
        forward(&mut request, &input, "password", "password");
        match (self.host)("sandbox.windows.start", vec![Value::Object(request)], host).await {
            Ok(Some(result)) => {
                let running = result.get("status").and_then(Value::as_str) == Some("running");
                let message = if running {
                    "Windows sandbox started"
                } else {
                    "Windows sandbox starting (first boot installs Windows; this can take 10-30 minutes)"
                };
                success(message, result)
            }
            Ok(None) => fail("Sandbox manager returned no result"),
            Err(error) => fail(error_text(&error)),
        }
    }

    pub async fn windows_stop(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("windows.sandbox.stop", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        let container = input
            .get("containerName")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let mut options = Map::new();
        forward(&mut options, &input, "removeStorage", "removeStorage");
        match (self.host)(
            "sandbox.windows.stop",
            vec![json!(container), Value::Object(options)],
            host,
        )
        .await
        {
            Ok(_) => success(
                format!("Windows sandbox {container} stopped"),
                json!({ "containerName": container }),
            ),
            Err(error) => fail(error_text(&error)),
        }
    }

    pub async fn linux_start(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("linux.desktop.sandbox.start", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        let mut request = Map::new();
        request.insert(
            "projectRoot".to_string(),
            context.get("projectRoot").cloned().unwrap_or(Value::Null),
        );
        forward(&mut request, &input, "screenRes", "screenRes");
        request.insert(
            "mountMode".to_string(),
            input
                .get("mountMode")
                .cloned()
                .unwrap_or_else(|| json!("read-only")),
        );
        forward(&mut request, &input, "networkEnabled", "networkEnabled");
        forward(&mut request, &input, "novncPort", "novncPort");
        forward(&mut request, &input, "vncPort", "vncPort");
        forward(&mut request, &input, "cdpPort", "cdpPort");
        forward(&mut request, &input, "waitForCdp", "waitForCdp");
        forward(&mut request, &input, "hostGateway", "hostGateway");
        match (self.host)(
            "sandbox.linuxDesktop.start",
            vec![Value::Object(request)],
            host,
        )
        .await
        {
            Ok(Some(result)) => success("Linux desktop sandbox started", result),
            Ok(None) => fail("Sandbox manager returned no result"),
            Err(error) => fail(error_text(&error)),
        }
    }

    pub async fn linux_stop(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("linux.desktop.sandbox.stop", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        let container = input
            .get("containerName")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        match (self.host)("sandbox.linuxDesktop.stop", vec![json!(container)], host).await {
            Ok(_) => success(
                format!("Linux desktop sandbox {container} stopped"),
                json!({ "containerName": container }),
            ),
            Err(error) => fail(error_text(&error)),
        }
    }
}
