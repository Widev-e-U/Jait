//! Port of `packages/gateway/src/tools/redeploy-tools.ts`.
//!
//! The TypeScript implementation shells out (`npm view`, `npm install -g`,
//! `systemctl`/detached respawn) and streams canary health checks. The native
//! adapter has no package-manager/self-restart capability, so the tool is a thin
//! pass-through onto `JaitPort<C>` with the original argument shapes:
//!
//! | host method | arguments |
//! |-------------|-----------|
//! | `gateway.updateInfo` | `[]` → `{ managed, desktopManaged?, installDir?, version?, … }` |
//! | `gateway.redeploy` | `[{ version, skipCanary }]` → `{ started, version, pid?, logPath?, canary?, … }` |
//!
//! Cancellation mirrors `context.signal.aborted`: the flag is read from
//! `context["aborted"]` or `context["signal"]["aborted"]`.

use super::core_io::HostError;
use super::core_jait::JaitPort;
use super::validate::{ToolInput, validate_tool_input};
use serde_json::{Map, Value, json};
use std::sync::LazyLock;

static METADATA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("redeploy-tools-metadata.json"))
        .expect("redeploy-tools-metadata.json")
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

/// `err.message` from the TS module: the host error's message text.
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

fn validation_failure(name: &str, input: &Value) -> Result<Value, Value> {
    let mut validated = ToolInput::new(input);
    let validation = validate_tool_input(&definition(name)["parameters"], &mut validated)
        .expect("static redeploy tool schema");
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

fn str_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

pub struct RedeployTools<C> {
    pub host: JaitPort<C>,
}

impl<C: Send + Sync> RedeployTools<C> {
    /// `gateway.redeploy`: refuse desktop/externally managed installs, then hand
    /// the version request to the host, which performs the actual update.
    pub async fn redeploy(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("gateway.redeploy", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }

        let info = match (self.host)("gateway.updateInfo", vec![], host).await {
            Ok(value) => value.unwrap_or(Value::Null),
            Err(error) => return fail(error_text(&error)),
        };
        if !info.is_null() && info.get("managed").and_then(Value::as_bool) == Some(true) {
            return fail(
                "This gateway installation is managed by another process; redeploy it from there instead",
            );
        }

        let version = str_field(&input, "version")
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| "latest".to_string());
        let skip_canary = input
            .get("skipCanary")
            .and_then(Value::as_bool)
            .unwrap_or(false);

        let mut request = Map::new();
        request.insert("version".to_string(), json!(version));
        request.insert("skipCanary".to_string(), json!(skip_canary));

        if cancelled(context) {
            return fail("Cancelled");
        }

        match (self.host)("gateway.redeploy", vec![Value::Object(request)], host).await {
            Ok(Some(result)) if !result.is_null() => {
                let mut message = format!("Redeploying gateway to {version}");
                if skip_canary {
                    message.push_str(" (canary health check skipped)");
                }
                message.push_str(". The gateway will restart shortly.");
                success(message, result)
            }
            Ok(Some(_)) | Ok(None) => fail("Redeploy host returned no result"),
            Err(error) => fail(error_text(&error)),
        }
    }
}
