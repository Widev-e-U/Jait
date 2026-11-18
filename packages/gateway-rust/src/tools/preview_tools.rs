//! Port of `packages/gateway/src/tools/preview-tools.ts`.
//!
//! The live-preview service is a TypeScript-side capability (browser session
//! supervision, VNC/noVNC capture, log ring buffers); the native adapter has no
//! counterpart, so every tool is a thin pass-through onto `JaitPort<C>` with the
//! original argument shapes:
//!
//! | host method | arguments |
//! |-------------|-----------|
//! | `preview.service` | `[]` → truthy when the preview service exists, `null`/absent otherwise |
//! | `preview.start` | `[{ sessionId, projectRoot, target?, command?, port?, frameworkHint? }]` → `{ status, url, mode, lastError?, … }` |
//! | `preview.stop` | `[sessionId]` → `true` when a session was stopped |
//! | `preview.restart` | `[sessionId]` → session object, or `null` |
//! | `preview.refreshSessionCapture` | `[sessionId]` → session object, or `null` |
//! | `preview.logs` | `[sessionId, { sinceId }]` → `{ logs, console, errors, metrics, … }` |
//! | `preview.inspect` | `[sessionId, { screenshot }]` → `{ browserId, status, url?, browserEvents, errors?, … }` |
//!
//! `projectRoot` falls back to `context.projectRoot`; the session id comes from
//! `resolvePreviewSessionId(context)` (`context.sessionId`, then
//! `context.session.id`). Cancellation mirrors `context.signal.aborted`: the flag
//! is read from `context["aborted"]` or `context["signal"]["aborted"]`.

use super::core_io::HostError;
use super::core_jait::JaitPort;
use super::validate::{ToolInput, validate_tool_input};
use serde_json::{Map, Value, json};
use std::sync::LazyLock;

static METADATA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("preview-tools-metadata.json"))
        .expect("preview-tools-metadata.json")
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

fn success_without_data(message: impl Into<String>) -> Value {
    json!({ "ok": true, "message": message.into() })
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

/// Copy `input[from]` to `request[to]` when present (null/absent keys are dropped).
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
        .expect("static preview tool schema");
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

/// `resolvePreviewSessionId(context)`: explicit session id, then nested session id.
fn resolve_session_id(context: &Value) -> Option<String> {
    context
        .get("sessionId")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            context
                .get("session")
                .and_then(|session| session.get("id"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
        })
        .map(str::to_string)
}

/// `PREVIEW_MAX_ITEMS` from `list-preview.ts`. (`ellipsizeText`'s 120-char
/// default is never exercised by this module; every TS call site passes an
/// explicit width, so only the explicit-width form is ported.)
const PREVIEW_MAX_ITEMS: usize = 8;

/// `ellipsizeText(value, maxChars)`: collapse whitespace, trim, ellipsise.
fn ellipsize_text(value: &str, max_chars: usize) -> String {
    let clean = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if max_chars == 0 {
        return String::new();
    }
    if clean.chars().count() <= max_chars {
        return clean;
    }
    let kept: String = clean.chars().take(max_chars - 1).collect();
    format!("{}…", kept.trim_end())
}

/// `formatEllipsedList(lines, maxItems)`: join preview lines, appending an
/// `… (+N more)` marker when truncated.
fn format_ellipsed_list(lines: &[String]) -> String {
    if lines.is_empty() {
        return String::new();
    }
    let mut parts: Vec<String> = lines.iter().take(PREVIEW_MAX_ITEMS).cloned().collect();
    let hidden = lines.len() - parts.len();
    if hidden > 0 {
        parts.push(format!("… (+{hidden} more)"));
    }
    parts.join("\n")
}

/// `shortenUrl(url)`: `pathname + search`, falling back to the host, then to an
/// ellipsised raw URL. The URL is parsed by hand because this crate has no
/// `url`-style parser available.
fn shorten_url(url: Option<&str>) -> String {
    let url = match url {
        Some(value) if !value.is_empty() => value,
        _ => return "unknown".to_string(),
    };
    if let Some((_scheme, rest)) = url.split_once("://") {
        let split = rest.find(['/', '?', '#']);
        let (authority, tail) = match split {
            Some(index) => (&rest[..index], &rest[index..]),
            None => (rest, ""),
        };
        let target: &str = tail.split('#').next().unwrap_or("");
        if target.is_empty() {
            return authority.to_string();
        }
        return target.to_string();
    }
    ellipsize_text(url, 60)
}

fn str_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn array_len(value: &Value, key: &str) -> usize {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0)
}

pub struct PreviewTools<C> {
    pub host: JaitPort<C>,
}

impl<C: Send + Sync> PreviewTools<C> {
    async fn service_available(&self, host: &C) -> Result<bool, Value> {
        match (self.host)("preview.service", vec![], host).await {
            Ok(value) => Ok(match value {
                Some(value) => !value.is_null() && value != Value::Bool(false),
                None => false,
            }),
            Err(error) => Err(fail(error_text(&error))),
        }
    }

    /// Shared body of `preview.start` and its `preview.open` alias.
    async fn start_with(&self, name: &str, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure(name, input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        let project_root = str_field(&input, "projectRoot")
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .or_else(|| {
                str_field(context, "projectRoot")
                    .map(str::to_string)
                    .filter(|value| !value.is_empty())
            })
            .unwrap_or_default();

        match self.service_available(host).await {
            Ok(true) => {}
            Ok(false) => return fail("Preview service is not available"),
            Err(error) => return error,
        }

        let session_id = match resolve_session_id(context) {
            Some(session_id) => session_id,
            None => return fail("A valid session is required to start a preview"),
        };

        let mut request = Map::new();
        request.insert("sessionId".to_string(), json!(session_id));
        request.insert("projectRoot".to_string(), json!(project_root));
        forward(&mut request, &input, "target", "target");
        forward(&mut request, &input, "command", "command");
        forward(&mut request, &input, "port", "port");
        forward(&mut request, &input, "frameworkHint", "frameworkHint");

        match (self.host)("preview.start", vec![Value::Object(request)], host).await {
            Ok(Some(preview)) => {
                let ready = str_field(&preview, "status") == Some("ready");
                let message = if ready {
                    format!(
                        "Preview started at {} ({} mode)",
                        str_field(&preview, "url").unwrap_or("unknown"),
                        str_field(&preview, "mode").unwrap_or("unknown")
                    )
                } else {
                    format!(
                        "Preview failed: {}",
                        str_field(&preview, "lastError").unwrap_or("unknown error")
                    )
                };
                json!({ "ok": ready, "message": message, "data": preview })
            }
            Ok(None) => fail("Preview service is not available"),
            Err(error) => fail(error_text(&error)),
        }
    }

    pub async fn start(&self, input: &Value, context: &Value, host: &C) -> Value {
        self.start_with("preview.start", input, context, host).await
    }

    pub async fn open(&self, input: &Value, context: &Value, host: &C) -> Value {
        self.start_with("preview.open", input, context, host).await
    }

    pub async fn stop(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("preview.stop", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        match self.service_available(host).await {
            Ok(true) => {}
            Ok(false) => return fail("Preview service is not available"),
            Err(error) => return error,
        }
        let session_id = match resolve_session_id(context) {
            Some(session_id) => session_id,
            None => return fail("No active session"),
        };
        let _ = input;
        match (self.host)("preview.stop", vec![json!(session_id)], host).await {
            Ok(Some(stopped)) if stopped.as_bool() == Some(true) => {
                success_without_data("Preview session stopped")
            }
            Ok(Some(_)) | Ok(None) => fail("No active preview session found"),
            Err(error) => fail(error_text(&error)),
        }
    }

    pub async fn restart(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("preview.restart", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        match self.service_available(host).await {
            Ok(true) => {}
            Ok(false) => return fail("Preview service is not available"),
            Err(error) => return error,
        }
        let session_id = match resolve_session_id(context) {
            Some(session_id) => session_id,
            None => return fail("No active session"),
        };
        let _ = input;
        match (self.host)("preview.restart", vec![json!(session_id)], host).await {
            Ok(Some(session)) if !session.is_null() => {
                let ready = str_field(&session, "status") == Some("ready");
                let message = if ready {
                    format!(
                        "Preview restarted at {}",
                        str_field(&session, "url").unwrap_or("unknown")
                    )
                } else {
                    format!(
                        "Preview restart failed: {}",
                        str_field(&session, "lastError").unwrap_or("unknown")
                    )
                };
                json!({ "ok": ready, "message": message, "data": session })
            }
            Ok(Some(_)) | Ok(None) => fail("No active preview session to restart"),
            Err(error) => fail(error_text(&error)),
        }
    }

    pub async fn status(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("preview.status", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        match self.service_available(host).await {
            Ok(true) => {}
            Ok(false) => return fail("Preview service is not available"),
            Err(error) => return error,
        }
        let session_id = match resolve_session_id(context) {
            Some(session_id) => session_id,
            None => return fail("No active session"),
        };
        let _ = input;
        match (self.host)(
            "preview.refreshSessionCapture",
            vec![json!(session_id)],
            host,
        )
        .await
        {
            Ok(Some(session)) if !session.is_null() => {
                let url = str_field(&session, "url").unwrap_or("unknown");
                let mode = str_field(&session, "mode").unwrap_or("unknown");
                let status = str_field(&session, "status").unwrap_or("unknown");
                let shared = session
                    .get("sharedWithAgent")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let event_count = if shared {
                    array_len(&session, "browserEvents")
                } else {
                    0
                };
                let log_count = array_len(&session, "logs");
                let metrics = if shared {
                    session.get("metrics").cloned().unwrap_or(Value::Null)
                } else {
                    Value::Null
                };
                success(
                    format!("Preview {status} at {url} ({mode} mode)"),
                    json!({
                        "active": true,
                        "browserId": session.get("browserId").cloned().unwrap_or(Value::Null),
                        "status": session.get("status").cloned().unwrap_or(Value::Null),
                        "mode": session.get("mode").cloned().unwrap_or(Value::Null),
                        "url": session.get("url").cloned().unwrap_or(Value::Null),
                        "port": session.get("port").cloned().unwrap_or(Value::Null),
                        "command": session.get("command").cloned().unwrap_or(Value::Null),
                        "processId": session.get("processId").cloned().unwrap_or(Value::Null),
                        "containerId": session.get("containerId").cloned().unwrap_or(Value::Null),
                        "lastError": session.get("lastError").cloned().unwrap_or(Value::Null),
                        "sharedWithAgent": session
                            .get("sharedWithAgent")
                            .cloned()
                            .unwrap_or(Value::Null),
                        "eventCount": event_count,
                        "logCount": log_count,
                        "metrics": metrics,
                    }),
                )
            }
            Ok(Some(_)) | Ok(None) => {
                success("No active preview session", json!({ "active": false }))
            }
            Err(error) => fail(error_text(&error)),
        }
    }

    pub async fn logs(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("preview.logs", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        match self.service_available(host).await {
            Ok(true) => {}
            Ok(false) => return fail("Preview service is not available"),
            Err(error) => return error,
        }
        let session_id = match resolve_session_id(context) {
            Some(session_id) => session_id,
            None => return fail("No active session"),
        };
        let since_id = input.get("sinceId").and_then(Value::as_i64).unwrap_or(0);
        let stream = str_field(&input, "stream").unwrap_or("all").to_string();
        match (self.host)(
            "preview.logs",
            vec![json!(session_id), json!({ "sinceId": since_id })],
            host,
        )
        .await
        {
            Ok(Some(payload)) if !payload.is_null() => {
                let logs = payload
                    .get("logs")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                // `previewService.getLogs` filtering is client-side in the TS module,
                // so the port keeps the original two-argument call shape.
                let logs: Vec<Value> = if stream != "all" {
                    logs.into_iter()
                        .filter(|entry| str_field(entry, "stream") == Some(stream.as_str()))
                        .collect()
                } else {
                    logs
                };
                let console = array_len(&payload, "console");
                let errors = array_len(&payload, "errors");
                let log_lines: Vec<String> = logs
                    .iter()
                    .rev()
                    .take(6)
                    .rev()
                    .map(|entry| {
                        format!(
                            "[{}] {}",
                            str_field(entry, "stream").unwrap_or("system"),
                            str_field(entry, "text").unwrap_or("")
                        )
                    })
                    .collect();
                let last_log_id = logs
                    .last()
                    .and_then(|entry| entry.get("id"))
                    .cloned()
                    .unwrap_or_else(|| json!(0));
                let mut message = format!(
                    "{} log entries, {console} console messages, {errors} browser errors",
                    logs.len()
                );
                if !log_lines.is_empty() {
                    message.push_str(&format!(
                        "\nRecent logs:\n{}",
                        format_ellipsed_list(&log_lines)
                    ));
                }
                success(
                    message,
                    json!({
                        "logs": logs.iter().rev().take(100).rev().collect::<Vec<_>>(),
                        "console": payload
                            .get("console")
                            .and_then(Value::as_array)
                            .map(|entries| entries.iter().rev().take(50).rev().cloned().collect::<Vec<_>>())
                            .unwrap_or_default(),
                        "errors": payload
                            .get("errors")
                            .and_then(Value::as_array)
                            .map(|entries| entries.iter().rev().take(30).rev().cloned().collect::<Vec<_>>())
                            .unwrap_or_default(),
                        "lastLogId": last_log_id,
                        "metrics": payload.get("metrics").cloned().unwrap_or(Value::Null),
                    }),
                )
            }
            Ok(Some(_)) | Ok(None) => fail("No active preview session"),
            Err(error) => fail(error_text(&error)),
        }
    }

    pub async fn inspect(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validation_failure("preview.inspect", input) {
            Ok(input) => input,
            Err(error) => return error,
        };
        if cancelled(context) {
            return fail("Cancelled");
        }
        match self.service_available(host).await {
            Ok(true) => {}
            Ok(false) => return fail("Preview service is not available"),
            Err(error) => return error,
        }
        let session_id = match resolve_session_id(context) {
            Some(session_id) => session_id,
            None => return fail("No active session"),
        };
        let screenshot = input
            .get("screenshot")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        match (self.host)("preview.inspect", vec![json!(session_id)], host).await {
            Ok(Some(result)) if !result.is_null() => {
                let events = result
                    .get("browserEvents")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                // Mirrors the TS `errorCount` predicate.
                let error_count = events
                    .iter()
                    .filter(|event| match str_field(event, "type") {
                        Some("pageerror") | Some("requestfailed") => true,
                        Some("response") => {
                            event.get("status").and_then(Value::as_i64).unwrap_or(0) >= 400
                        }
                        _ => false,
                    })
                    .count();
                // Newest first (`slice(-6).reverse()`).
                let event_lines: Vec<String> = events
                    .iter()
                    .rev()
                    .take(6)
                    .map(|event| {
                        let event_type = str_field(event, "type").unwrap_or("event");
                        let method = str_field(event, "method").unwrap_or("GET");
                        let detail = match event_type {
                            "response" => format!(
                                "{method} {} {}",
                                event.get("status").and_then(Value::as_i64).unwrap_or(0),
                                shorten_url(str_field(event, "url"))
                            ),
                            "requestfailed" => {
                                format!("{method} {}", shorten_url(str_field(event, "url")))
                            }
                            _ => ellipsize_text(str_field(event, "text").unwrap_or(""), 80),
                        };
                        let level = match str_field(event, "level") {
                            Some(level) => format!("/{level}"),
                            None => String::new(),
                        };
                        format!("• [{event_type}{level}] {detail}")
                    })
                    .collect();
                // `data: { browserId, ...result }` — the spread wins on conflicts.
                let mut data = match result.clone() {
                    Value::Object(map) => map,
                    _ => Map::new(),
                };
                if !data.contains_key("browserId") {
                    data.insert("browserId".to_string(), Value::Null);
                }
                if !screenshot {
                    data.insert("screenshot".to_string(), Value::Null);
                }
                let metrics_included = data.get("metrics").is_some_and(|value| !value.is_null());
                let screenshot_included =
                    data.get("screenshot").is_some_and(|value| !value.is_null());
                let mut message = format!(
                    "Preview {} at {} — {} events, {error_count} errors{}{}",
                    str_field(&result, "status").unwrap_or("unknown"),
                    str_field(&result, "url").unwrap_or("unknown"),
                    events.len(),
                    if metrics_included {
                        ", metrics included"
                    } else {
                        ""
                    },
                    if screenshot_included {
                        ", screenshot included"
                    } else {
                        ""
                    },
                );
                if !event_lines.is_empty() {
                    message.push_str(&format!(
                        "\nRecent events:\n{}",
                        format_ellipsed_list(&event_lines)
                    ));
                }
                success(message, Value::Object(data))
            }
            Ok(Some(_)) | Ok(None) => fail("No active preview session"),
            Err(error) => fail(error_text(&error)),
        }
    }
}
