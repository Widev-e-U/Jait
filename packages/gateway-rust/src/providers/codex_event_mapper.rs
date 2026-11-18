//! Mapping from raw Codex CLI JSON-RPC notifications to provider events.
//!
//! Ports `packages/gateway/src/providers/codex-event-mapper.ts`. The TypeScript
//! module is shared by `RemoteCliProvider` and Codex sessions proxied over WS,
//! so the native mapper must reproduce notification handling exactly, including
//! the events it deliberately drops.
//!
//! Usage counters are not re-derived here: `crate::context_overhead` already
//! carries `parse_codex_usage`, and this module hands it the same `params`
//! object the TypeScript code passes.
//!
//! Two coercions appear in the reference and are kept distinct on purpose:
//! `typeof x === "string"` (any string, including `""` and whitespace) and the
//! `asString` helper (a string with non-whitespace content). Mixing them would
//! change which fallback in a `??` chain wins.
//!
//! Non-object `params` are treated as an empty object. JSON-RPC notifications
//! always carry an object; the TypeScript implementation would throw on `null`.

use std::cell::Cell;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{
    context_overhead::{ModelUsage, parse_codex_usage},
    text::js_trim,
};

/// The subset of the TypeScript `ProviderEvent` union this mapper emits.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(tag = "type")]
pub enum ProviderEvent {
    #[serde(rename = "token")]
    Token {
        #[serde(rename = "sessionId")]
        session_id: String,
        content: String,
    },
    #[serde(rename = "message")]
    Message {
        #[serde(rename = "sessionId")]
        session_id: String,
        role: String,
        content: String,
    },
    #[serde(rename = "activity")]
    Activity {
        #[serde(rename = "sessionId")]
        session_id: String,
        kind: String,
        summary: String,
        payload: Value,
    },
    #[serde(rename = "tool.start")]
    ToolStart {
        #[serde(rename = "sessionId")]
        session_id: String,
        tool: String,
        args: Value,
        #[serde(rename = "callId")]
        call_id: String,
    },
    #[serde(rename = "tool.output")]
    ToolOutput {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "callId")]
        call_id: String,
        content: String,
    },
    #[serde(rename = "tool.result")]
    ToolResult {
        #[serde(rename = "sessionId")]
        session_id: String,
        tool: String,
        ok: bool,
        message: String,
        #[serde(rename = "callId")]
        call_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        data: Option<Value>,
    },
    #[serde(rename = "turn.started")]
    TurnStarted {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    #[serde(rename = "turn.completed")]
    TurnCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    #[serde(rename = "session.completed")]
    SessionCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    #[serde(rename = "session.error")]
    SessionError {
        #[serde(rename = "sessionId")]
        session_id: String,
        error: String,
    },
    #[serde(rename = "usage")]
    Usage {
        #[serde(rename = "sessionId")]
        session_id: String,
        usage: ModelUsage,
    },
}

thread_local! {
    /// Mirrors the TypeScript module-level `_nextFallbackId` counter. Keeping it
    /// thread-local makes fallback ids reproducible for tests that run in
    /// parallel while staying monotonic within a session.
    static FALLBACK_ID: Cell<u64> = const { Cell::new(1) };
}

fn next_fallback_id(prefix: &str) -> String {
    FALLBACK_ID.with(|counter| {
        let id = counter.get();
        counter.set(id + 1);
        format!("{prefix}-{id}")
    })
}

#[cfg(test)]
fn reset_fallback_ids() {
    FALLBACK_ID.with(|counter| counter.set(1));
}

/// Convert a raw Codex JSON-RPC notification into zero or more provider events.
///
/// Returns an empty vector for notifications that are ignored as noisy,
/// redundant, or user echoes.
#[must_use]
pub fn map_codex_notification(
    method: &str,
    params: &Value,
    session_id: &str,
) -> Vec<ProviderEvent> {
    let empty = Map::new();
    let body = params.as_object().unwrap_or(&empty);
    let session = session_id.to_owned();
    let activity = |kind: &str| ProviderEvent::Activity {
        session_id: session.clone(),
        kind: kind.to_owned(),
        summary: format!("Codex: {kind}"),
        payload: params.clone(),
    };

    match method {
        // ── Streaming text tokens ──
        "item/agentMessage/delta"
        | "codex/event/agent_message_delta"
        | "codex/event/agent_message_content_delta" => {
            let delta = raw_text(body.get("delta"))
                .or_else(|| raw_text(body.get("text")))
                .or_else(|| raw_text(body.get("content")))
                .unwrap_or("");
            if delta.is_empty() {
                return Vec::new();
            }
            vec![ProviderEvent::Token {
                session_id: session.clone(),
                content: delta.to_owned(),
            }]
        }

        "item/reasoning/textDelta" | "item/reasoning/summaryTextDelta" => {
            let delta = raw_text(body.get("delta")).unwrap_or("");
            if delta.is_empty() {
                return Vec::new();
            }
            vec![ProviderEvent::Activity {
                session_id: session.clone(),
                kind: "thinking".into(),
                summary: delta.to_owned(),
                payload: params.clone(),
            }]
        }

        // ── Tool/command output deltas ──
        "item/commandExecution/outputDelta" | "item/fileChange/outputDelta" => {
            let delta = raw_text(body.get("delta")).unwrap_or("");
            if delta.is_empty() {
                return Vec::new();
            }
            let call_id = extract_item_id(body);
            vec![ProviderEvent::ToolOutput {
                session_id: session.clone(),
                call_id,
                content: delta.to_owned(),
            }]
        }

        // ── Item lifecycle for tool calls ──
        "item/started" => {
            let item = envelope(body, "item", &empty);
            let call_id = extract_item_id(body);
            let item_type = item_type_of(item);
            if !is_tool_item_type(&item_type) {
                return Vec::new();
            }
            let category = map_item_to_category(&item_type, item);
            vec![ProviderEvent::ToolStart {
                session_id: session.clone(),
                tool: category.clone(),
                args: Value::Object(build_tool_args(item, &category)),
                call_id,
            }]
        }

        "item/completed" => {
            let item = envelope(body, "item", &empty);
            let call_id = extract_item_id(body);
            let item_type = item_type_of(item);
            if is_tool_item_type(&item_type) {
                let category = map_item_to_category(&item_type, item);
                let status = raw_text(item.get("status")).unwrap_or("completed");
                let message = raw_text(item.get("output"))
                    .or_else(|| raw_text(item.get("summary")))
                    .unwrap_or("");
                return vec![ProviderEvent::ToolResult {
                    session_id: session.clone(),
                    tool: category,
                    ok: !matches!(status, "error" | "failed"),
                    message: message.to_owned(),
                    call_id,
                    data: extract_tool_result_data(item),
                }];
            }
            // Non-tool item completed (e.g. agent message).
            match assistant_text(item) {
                Some(content) => vec![ProviderEvent::Message {
                    session_id: session.clone(),
                    role: "assistant".into(),
                    content,
                }],
                None => Vec::new(),
            }
        }

        "item/mcpToolCall/progress" => {
            let call_id = extract_item_id(body);
            let message = raw_text(body.get("message")).unwrap_or("");
            if !message.is_empty() {
                return vec![ProviderEvent::ToolOutput {
                    session_id: session.clone(),
                    call_id,
                    content: message.to_owned(),
                }];
            }
            let tool = raw_text(body.get("name"))
                .or_else(|| raw_text(body.get("toolName")))
                .unwrap_or("mcp-tool");
            vec![ProviderEvent::ToolStart {
                session_id: session.clone(),
                tool: tool.to_owned(),
                args: pick_arguments(body),
                call_id,
            }]
        }

        "item/mcpToolCall/completed" | "item/mcpToolCall/failed" => {
            let call_id = extract_item_id(body);
            let tool = raw_text(body.get("name"))
                .or_else(|| raw_text(body.get("toolName")))
                .or_else(|| raw_text(body.get("tool")))
                .unwrap_or("mcp-tool");
            let status = raw_text(body.get("status")).unwrap_or(if method.ends_with("/failed") {
                "failed"
            } else {
                "completed"
            });
            let message = raw_text(body.get("output"))
                .or_else(|| raw_text(body.get("summary")))
                .or_else(|| raw_text(body.get("message")))
                .unwrap_or("");
            vec![ProviderEvent::ToolResult {
                session_id: session.clone(),
                tool: tool.to_owned(),
                ok: !matches!(status, "error" | "failed"),
                message: message.to_owned(),
                call_id,
                data: extract_tool_result_data(body),
            }]
        }

        // ── codex/event item lifecycle (codex 0.111.0+ envelope format) ──
        "codex/event/item_started" => {
            let msg = envelope(body, "msg", &empty);
            let call_id = extract_codex_event_item_id(body);
            let item_type = envelope_type_of(msg);
            if !is_tool_item_type(&item_type) {
                return Vec::new();
            }
            let category = map_item_to_category(&item_type, msg);
            vec![ProviderEvent::ToolStart {
                session_id: session.clone(),
                tool: category.clone(),
                args: Value::Object(build_tool_args(msg, &category)),
                call_id,
            }]
        }

        "codex/event/item_completed" => {
            let msg = envelope(body, "msg", &empty);
            let call_id = extract_codex_event_item_id(body);
            let item_type = envelope_type_of(msg);
            if is_tool_item_type(&item_type) {
                let category = map_item_to_category(&item_type, msg);
                let status = raw_text(msg.get("status")).unwrap_or("completed");
                let message = raw_text(msg.get("output"))
                    .or_else(|| raw_text(msg.get("summary")))
                    .or_else(|| raw_text(msg.get("last_agent_message")))
                    .unwrap_or("");
                return vec![ProviderEvent::ToolResult {
                    session_id: session.clone(),
                    tool: category,
                    ok: !matches!(status, "error" | "failed"),
                    message: message.to_owned(),
                    call_id,
                    data: extract_tool_result_data(msg),
                }];
            }
            // Non-tool item completed (e.g. agent message).
            match assistant_text(msg) {
                Some(content) => vec![ProviderEvent::Message {
                    session_id: session.clone(),
                    role: "assistant".into(),
                    content,
                }],
                None => Vec::new(),
            }
        }

        // ── Turn lifecycle ──
        "turn/started" => vec![ProviderEvent::TurnStarted {
            session_id: session.clone(),
        }],

        "turn/completed" => {
            let turn = body.get("turn").and_then(Value::as_object);
            let status = turn
                .and_then(|turn| raw_text(turn.get("status")))
                .unwrap_or("");
            if status == "failed" {
                let error = as_string(
                    turn.and_then(|turn| turn.get("error"))
                        .and_then(Value::as_object)
                        .and_then(|error| error.get("message")),
                )
                .unwrap_or("Codex turn failed");
                return vec![ProviderEvent::SessionError {
                    session_id: session.clone(),
                    error: error.to_owned(),
                }];
            }
            vec![ProviderEvent::TurnCompleted {
                session_id: session.clone(),
            }]
        }

        // ── Errors ──
        "error" => {
            // Codex reports transient failures while retrying. The desktop runner
            // keeps the turn active in this case, so do not end the gateway session.
            if body.get("willRetry").and_then(Value::as_bool) == Some(true) {
                return Vec::new();
            }
            let message = raw_text(
                body.get("error")
                    .and_then(Value::as_object)
                    .and_then(|error| error.get("message")),
            )
            .unwrap_or("Codex error");
            vec![ProviderEvent::SessionError {
                session_id: session.clone(),
                error: message.to_owned(),
            }]
        }

        // ── Agent complete messages ──
        "codex/event/agent_message" => {
            let text = raw_text(body.get("content"))
                .or_else(|| raw_text(body.get("text")))
                .or_else(|| raw_text(body.get("message")))
                .or_else(|| raw_text(body.get("delta")))
                .unwrap_or("");
            if text.is_empty() {
                return Vec::new();
            }
            vec![ProviderEvent::Message {
                session_id: session.clone(),
                role: "assistant".into(),
                content: text.to_owned(),
            }]
        }

        // ── User echo — ignore ──
        "codex/event/user_message" => Vec::new(),

        // ── Noisy / redundant events — skip ──
        "item/plan/delta" | "turn/plan/updated" | "turn/diff/updated" => Vec::new(),

        "thread/tokenUsage/updated" | "codex/event/token_count" => {
            match parse_codex_usage(params) {
                Some(usage) => vec![ProviderEvent::Usage {
                    session_id: session.clone(),
                    usage,
                }],
                None => Vec::new(),
            }
        }

        // ── Known lifecycle / status notifications → emit as activity ──
        "thread/started"
        | "thread/status/changed"
        | "thread/name/updated"
        | "model/rerouted"
        | "configWarning"
        | "deprecationNotice"
        | "account/updated"
        | "skills/changed"
        | "codex/event/mcp_startup_complete"
        | "codex/event/skills_update_available" => vec![activity(method)],

        "codex/event/task_started" => vec![
            ProviderEvent::TurnStarted {
                session_id: session.clone(),
            },
            activity(method),
        ],

        "codex/event/task_complete" => {
            let msg = envelope(body, "msg", &empty);
            let text = extract_text_content(msg);
            if text.is_empty() {
                return vec![activity(method)];
            }
            vec![ProviderEvent::Message {
                session_id: session.clone(),
                role: "assistant".into(),
                content: text,
            }]
        }

        "codex/event/agent_reasoning" => vec![activity(method)],

        // ── Session completed (from child exit wrapper) ──
        "session/completed" => vec![ProviderEvent::SessionCompleted {
            session_id: session.clone(),
        }],

        // ── Turn diff — codex envelope format (noisy) ──
        "codex/event/turn_diff" => Vec::new(),

        _ => vec![activity(method)],
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

/// `params.item ?? params` / `params.msg ?? params`, with a non-object value
/// treated as an empty record (TypeScript reads `undefined` fields from it).
fn envelope<'a>(
    params: &'a Map<String, Value>,
    key: &str,
    empty: &'a Map<String, Value>,
) -> &'a Map<String, Value> {
    match params.get(key) {
        Some(value) if !value.is_null() => value.as_object().unwrap_or(empty),
        _ => params,
    }
}

fn extract_item_id(params: &Map<String, Value>) -> String {
    as_string(params.get("itemId"))
        .or_else(|| {
            as_string(
                params
                    .get("item")
                    .and_then(Value::as_object)
                    .and_then(|item| item.get("id")),
            )
        })
        .or_else(|| as_string(params.get("id")))
        .map_or_else(|| next_fallback_id("codex-item"), str::to_owned)
}

fn extract_codex_event_item_id(params: &Map<String, Value>) -> String {
    let msg = params.get("msg").and_then(Value::as_object);
    as_string(msg.and_then(|msg| msg.get("item_id")))
        .or_else(|| as_string(msg.and_then(|msg| msg.get("itemId"))))
        .or_else(|| as_string(params.get("id")))
        .or_else(|| as_string(msg.and_then(|msg| msg.get("id"))))
        .map_or_else(|| next_fallback_id("codex-evt"), str::to_owned)
}

/// TypeScript's `asString`: the original text, but only when it has content.
fn as_string(value: Option<&Value>) -> Option<&str> {
    raw_text(value).filter(|text| !js_trim(text).is_empty())
}

/// TypeScript's `typeof value === "string" ? value : ...`: any string counts.
fn raw_text(value: Option<&Value>) -> Option<&str> {
    value.and_then(Value::as_str)
}

fn pick_strings(values: &[Option<&Value>]) -> Option<String> {
    values
        .iter()
        .find_map(|value| as_string(*value))
        .map(str::to_owned)
}

fn first_object<'a>(values: &[Option<&'a Value>]) -> Option<&'a Map<String, Value>> {
    values.iter().flatten().find_map(|value| value.as_object())
}

fn parse_json_object(value: Option<&Value>) -> Option<Map<String, Value>> {
    let text = raw_text(value)?;
    serde_json::from_str::<Value>(text)
        .ok()?
        .as_object()
        .cloned()
}

fn extract_tool_result_data(item: &Map<String, Value>) -> Option<Value> {
    first_object(&[item.get("result"), item.get("output"), item.get("data")])
        .map(|object| Value::Object(object.clone()))
        .or_else(|| {
            parse_json_object(item.get("result"))
                .or_else(|| parse_json_object(item.get("output")))
                .or_else(|| parse_json_object(item.get("data")))
                .map(Value::Object)
        })
        .or_else(|| {
            item.get("result")
                .filter(|value| value.is_string() || value.is_array())
                .cloned()
        })
        .or_else(|| item.get("output").filter(|value| value.is_array()).cloned())
        .or_else(|| {
            item.get("data")
                .filter(|value| value.is_string() || value.is_array())
                .cloned()
        })
}

fn extract_text_content(item: &Map<String, Value>) -> String {
    for key in ["content", "text", "message", "output", "last_agent_message"] {
        if let Some(text) = as_string(item.get(key)) {
            return text.to_owned();
        }
    }
    if let Some(parts) = item.get("content").and_then(Value::as_array) {
        let texts = parts
            .iter()
            .filter(|part| {
                matches!(
                    part.get("type").and_then(Value::as_str),
                    Some("text" | "output_text")
                )
            })
            .map(|part| raw_text(part.get("text")).unwrap_or(""))
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>();
        if !texts.is_empty() {
            return texts.join("\n");
        }
    }
    String::new()
}

/// Non-tool items become assistant messages unless they are user echoes.
fn assistant_text(item: &Map<String, Value>) -> Option<String> {
    let role = raw_text(item.get("role")).unwrap_or("");
    let raw_type = raw_text(item.get("type")).unwrap_or("");
    let is_user_item = role == "user" || raw_type.to_lowercase().contains("user");
    if is_user_item {
        return None;
    }
    let text = extract_text_content(item);
    if text.is_empty() { None } else { Some(text) }
}

fn item_type_of(item: &Map<String, Value>) -> String {
    normalize_item_type(raw_text(item.get("type")).unwrap_or(""))
}

/// codex/event envelopes name the item type `type`, falling back to `kind`.
fn envelope_type_of(msg: &Map<String, Value>) -> String {
    normalize_item_type(
        raw_text(msg.get("type"))
            .or_else(|| raw_text(msg.get("kind")))
            .unwrap_or(""),
    )
}

fn normalize_item_type(raw: &str) -> String {
    let mut camel = String::with_capacity(raw.len() + 8);
    let mut characters = raw.chars().peekable();
    while let Some(current) = characters.next() {
        camel.push(current);
        if current.is_ascii_lowercase()
            && characters
                .peek()
                .is_some_and(|next| next.is_ascii_uppercase())
        {
            camel.push(' ');
        }
    }
    let separated = collapse(|c| matches!(c, '_' | '-' | '/'), &camel, ' ');
    js_trim(&separated).to_lowercase()
}

/// Replace runs of separator characters with a single replacement character.
fn collapse(separator: impl Fn(char) -> bool, value: &str, replacement: char) -> String {
    let mut output = String::with_capacity(value.len());
    let mut in_run = false;
    for character in value.chars() {
        if separator(character) {
            if !in_run {
                output.push(replacement);
                in_run = true;
            }
        } else {
            output.push(character);
            in_run = false;
        }
    }
    output
}

fn is_tool_item_type(normalized: &str) -> bool {
    // `file_change` / `file_read` cannot survive normalization, but they are
    // retained so this list stays a literal transcription of the TS source.
    [
        "subagent",
        "command",
        "tool",
        "function",
        "file change",
        "file_change",
        "file read",
        "file_read",
        "patch",
        "edit",
        "mcp",
        "web search",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

fn map_item_to_category(normalized: &str, item: &Map<String, Value>) -> String {
    if let Some(name) = extract_provider_tool_name(item)
        && is_provider_agent_tool(name)
    {
        return name.to_owned();
    }
    if normalized.contains("subagent") {
        return "agent".into();
    }
    if normalized.contains("command") {
        return "execute".into();
    }
    if normalized.contains("file change")
        || normalized.contains("file_change")
        || normalized.contains("patch")
        || normalized.contains("edit")
    {
        return "edit".into();
    }
    if normalized.contains("file read") || normalized.contains("file_read") {
        return "read".into();
    }
    if normalized.contains("web search") || normalized.contains("web_search") {
        return "web".into();
    }
    if normalized.contains("mcp") {
        return "mcp-tool".into();
    }
    if normalized.contains("function") || normalized.contains("tool") {
        return "execute".into();
    }
    if normalized.is_empty() {
        "tool".into()
    } else {
        normalized.to_owned()
    }
}

fn extract_provider_tool_name(item: &Map<String, Value>) -> Option<&str> {
    let nested = first_object(&[item.get("action"), item.get("input"), item.get("arguments")]);
    const NAMES: [&str; 5] = [
        "name",
        "tool",
        "toolName",
        "recipient_name",
        "recipientName",
    ];
    NAMES
        .iter()
        .find_map(|key| as_string(item.get(*key)))
        .or_else(|| {
            NAMES
                .iter()
                .find_map(|key| as_string(nested.and_then(|object| object.get(*key))))
        })
}

fn is_provider_agent_tool(name: &str) -> bool {
    let stripped = name
        .strip_prefix("functions.")
        .or_else(|| name.strip_prefix("functions_"))
        .unwrap_or(name);
    let normalized = collapse(|c| !c.is_ascii_alphanumeric(), stripped, '_').to_lowercase();
    matches!(
        normalized.as_str(),
        "agent"
            | "spawn_agent"
            | "wait_agent"
            | "close_agent"
            | "resume_agent"
            | "send_input"
            | "run_subagent"
            | "search_subagent"
    )
}

fn pick_arguments(params: &Map<String, Value>) -> Value {
    params
        .get("arguments")
        .filter(|value| !value.is_null())
        .or_else(|| params.get("args").filter(|value| !value.is_null()))
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()))
}

/// JavaScript `String(value)` coercion for the scalars a CLI command holds.
fn js_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => ryu_js::Buffer::new()
            .format(number.as_f64().unwrap_or_default())
            .to_owned(),
        Value::Array(items) => items.iter().map(js_string).collect::<Vec<_>>().join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

fn build_tool_args(item: &Map<String, Value>, category: &str) -> Map<String, Value> {
    let nested = first_object(&[item.get("action"), item.get("input"), item.get("arguments")]);
    let nested_get = |key: &str| nested.and_then(|object| object.get(key));
    let mut args = Map::new();
    match category {
        "execute" => {
            let command = pick_strings(&[item.get("command"), item.get("commandLine")])
                .or_else(|| {
                    item.get("command")
                        .and_then(Value::as_array)
                        .map(|parts| parts.iter().map(js_string).collect::<Vec<_>>().join(" "))
                })
                .or_else(|| pick_strings(&[nested_get("command")]))
                .or_else(|| pick_strings(&[item.get("name"), item.get("title")]))
                .unwrap_or_default();
            args.insert("command".into(), Value::String(command));
        }
        "edit" | "read" => {
            let path = pick_strings(&[
                item.get("path"),
                item.get("file_path"),
                item.get("filePath"),
                item.get("file"),
                item.get("filename"),
                item.get("target_file"),
                item.get("targetFile"),
                item.get("name"),
                item.get("title"),
                nested_get("path"),
                nested_get("file_path"),
                nested_get("filePath"),
                nested_get("file"),
                nested_get("filename"),
            ])
            .unwrap_or_default();
            args.insert("path".into(), Value::String(path));
            let search = pick_strings(&[
                item.get("search"),
                item.get("old_string"),
                item.get("oldString"),
                nested_get("search"),
                nested_get("old_string"),
                nested_get("oldString"),
            ]);
            let replace = pick_strings(&[
                item.get("replace"),
                item.get("new_string"),
                item.get("newString"),
                nested_get("replace"),
                nested_get("new_string"),
                nested_get("newString"),
            ]);
            let content = pick_strings(&[
                item.get("content"),
                item.get("new_file_contents"),
                item.get("newFileContents"),
                nested_get("content"),
                nested_get("new_file_contents"),
                nested_get("newFileContents"),
            ]);
            for (key, found) in [
                ("search", search),
                ("replace", replace),
                ("content", content),
            ] {
                if let Some(found) = found.filter(|found| !found.is_empty()) {
                    args.insert(key.into(), Value::String(found));
                }
            }
        }
        "web" => {
            let query = pick_strings(&[
                item.get("query"),
                item.get("search_query"),
                item.get("searchQuery"),
                item.get("q"),
                nested_get("query"),
                nested_get("search_query"),
                nested_get("searchQuery"),
                nested_get("q"),
                item.get("name"),
            ])
            .unwrap_or_default();
            let url = pick_strings(&[
                item.get("url"),
                item.get("uri"),
                nested_get("url"),
                nested_get("uri"),
            ])
            .unwrap_or_default();
            if !query.is_empty() {
                args.insert("query".into(), Value::String(query));
            }
            if !url.is_empty() {
                args.insert("url".into(), Value::String(url));
            }
        }
        _ => {}
    }
    for (key, value) in item {
        args.insert(key.clone(), value.clone());
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn mapped(method: &str, params: Value) -> Value {
        serde_json::to_value(map_codex_notification(method, &params, "session-1")).unwrap()
    }

    #[test]
    fn emits_token_for_text_deltas() {
        assert_eq!(
            mapped("item/agentMessage/delta", json!({"delta": "Hel"})),
            json!([{"type": "token", "sessionId": "session-1", "content": "Hel"}])
        );
        assert_eq!(
            mapped("codex/event/agent_message_delta", json!({"text": "lo"})),
            json!([{"type": "token", "sessionId": "session-1", "content": "lo"}])
        );
        assert_eq!(mapped("item/agentMessage/delta", json!({})), json!([]));
    }

    #[test]
    fn accepts_whitespace_only_deltas_and_skips_empty_strings() {
        // `if (delta)` in the reference accepts " " but rejects "".
        assert_eq!(
            mapped("item/agentMessage/delta", json!({"delta": " "})),
            json!([{"type": "token", "sessionId": "session-1", "content": " "}])
        );
        assert_eq!(
            mapped("item/agentMessage/delta", json!({"delta": ""})),
            json!([])
        );
        // An empty string is still a string, so it wins over `text`.
        assert_eq!(
            mapped("item/agentMessage/delta", json!({"delta": "", "text": "x"})),
            json!([])
        );
    }

    #[test]
    fn maps_reasoning_deltas_to_thinking_activity() {
        assert_eq!(
            mapped("item/reasoning/textDelta", json!({"delta": "Checking"})),
            json!([{
                "type": "activity",
                "sessionId": "session-1",
                "kind": "thinking",
                "summary": "Checking",
                "payload": {"delta": "Checking"},
            }])
        );
        assert_eq!(
            mapped("item/reasoning/summaryTextDelta", json!({})),
            json!([])
        );
    }

    #[test]
    fn streams_command_output_using_item_id() {
        assert_eq!(
            mapped(
                "item/commandExecution/outputDelta",
                json!({"itemId": "call-1", "delta": "RUN v3\n"})
            ),
            json!([{
                "type": "tool.output",
                "sessionId": "session-1",
                "callId": "call-1",
                "content": "RUN v3\n",
            }])
        );
        assert_eq!(
            mapped("item/fileChange/outputDelta", json!({"delta": ""})),
            json!([])
        );
    }

    #[test]
    fn tool_output_deltas_ignore_text_and_content_fallbacks() {
        // `text`/`content` are token fallbacks only; tool output reads `delta` alone.
        assert_eq!(
            mapped(
                "item/commandExecution/outputDelta",
                json!({"itemId": "call-1", "text": "ignored"})
            ),
            json!([])
        );
        assert_eq!(
            mapped(
                "item/fileChange/outputDelta",
                json!({"itemId": "call-2", "content": "ignored"})
            ),
            json!([])
        );
        // A whitespace delta is truthy in the reference, so it still streams.
        assert_eq!(
            mapped(
                "item/commandExecution/outputDelta",
                json!({"itemId": "call-3", "delta": " ", "text": "ignored"})
            ),
            json!([{
                "type": "tool.output",
                "sessionId": "session-1",
                "callId": "call-3",
                "content": " ",
            }])
        );
    }

    #[test]
    fn blank_identifiers_are_treated_as_missing() {
        reset_fallback_ids();
        // `asString` trims, so a whitespace id never wins over the item envelope.
        assert_eq!(
            mapped(
                "item/commandExecution/outputDelta",
                json!({"itemId": "  ", "item": {"id": "item-1"}, "delta": "out"})
            ),
            json!([{
                "type": "tool.output",
                "sessionId": "session-1",
                "callId": "item-1",
                "content": "out",
            }])
        );
        assert_eq!(
            mapped(
                "item/commandExecution/outputDelta",
                json!({"itemId": "  ", "item": {"id": "  "}, "id": "\n\t", "delta": "out"})
            ),
            json!([{
                "type": "tool.output",
                "sessionId": "session-1",
                "callId": "codex-item-1",
                "content": "out",
            }])
        );
        // The codex envelope falls back in its own order and uses its own prefix.
        assert_eq!(
            mapped(
                "codex/event/item_started",
                json!({"msg": {"item_id": "", "itemId": " ", "id": "msg-1", "kind": "command"}})
            ),
            json!([{
                "type": "tool.start",
                "sessionId": "session-1",
                "tool": "execute",
                "args": {
                    "command": "",
                    "item_id": "",
                    "itemId": " ",
                    "id": "msg-1",
                    "kind": "command",
                },
                "callId": "msg-1",
            }])
        );
        assert_eq!(
            mapped(
                "codex/event/item_started",
                json!({"msg": {"item_id": "  ", "itemId": "", "id": " ", "kind": "command"}})
            ),
            json!([{
                "type": "tool.start",
                "sessionId": "session-1",
                "tool": "execute",
                "args": {
                    "command": "",
                    "item_id": "  ",
                    "itemId": "",
                    "id": " ",
                    "kind": "command",
                },
                "callId": "codex-evt-2",
            }])
        );
    }

    #[test]
    fn maps_started_command_item_to_tool_start() {
        assert_eq!(
            mapped(
                "item/started",
                json!({"item": {
                    "id": "item-1",
                    "type": "commandExecution",
                    "command": ["bash", "-lc", "ls -la"],
                }})
            ),
            json!([{
                "type": "tool.start",
                "sessionId": "session-1",
                "tool": "execute",
                // `buildToolArgs` spreads the item last, so the array wins.
                "args": {
                    "command": ["bash", "-lc", "ls -la"],
                    "id": "item-1",
                    "type": "commandExecution",
                },
                "callId": "item-1",
            }])
        );
    }

    #[test]
    fn keeps_provider_agent_tool_names_as_categories() {
        let params = json!({"item": {
            "id": "agent-1",
            "type": "function_call",
            "name": "spawn_agent",
            "arguments": {"prompt": "review"},
        }});
        assert_eq!(
            mapped("item/started", params.clone()),
            json!([{
                "type": "tool.start",
                "sessionId": "session-1",
                "tool": "spawn_agent",
                "args": {
                    "id": "agent-1",
                    "type": "function_call",
                    "name": "spawn_agent",
                    "arguments": {"prompt": "review"},
                },
                "callId": "agent-1",
            }])
        );
        assert_eq!(
            mapped("item/completed", params),
            json!([{
                "type": "tool.result",
                "sessionId": "session-1",
                "tool": "spawn_agent",
                "ok": true,
                "message": "",
                "callId": "agent-1",
            }])
        );
    }

    #[test]
    fn maps_completed_file_read_without_data_key() {
        assert_eq!(
            mapped(
                "item/completed",
                json!({"item": {
                    "id": "item-2",
                    "type": "file_read",
                    "file_path": "/home/user/project/src/main.ts",
                }})
            ),
            json!([{
                "type": "tool.result",
                "sessionId": "session-1",
                "tool": "read",
                "ok": true,
                "message": "",
                "callId": "item-2",
            }])
        );
    }

    #[test]
    fn maps_failed_tool_items_to_not_ok() {
        assert_eq!(
            mapped(
                "item/completed",
                json!({"item": {
                    "id": "item-3",
                    "type": "mcpToolCall",
                    "status": "failed",
                    "output": "boom",
                }})
            ),
            json!([{
                "type": "tool.result",
                "sessionId": "session-1",
                "tool": "mcp-tool",
                "ok": false,
                "message": "boom",
                "callId": "item-3",
            }])
        );
    }

    #[test]
    fn parses_json_string_tool_result_data() {
        assert_eq!(
            mapped(
                "item/mcpToolCall/completed",
                json!({"id": "call-1", "name": "todo", "result": "{\"items\":[1,2]}"})
            ),
            json!([{
                "type": "tool.result",
                "sessionId": "session-1",
                "tool": "todo",
                "ok": true,
                "message": "",
                "callId": "call-1",
                "data": {"items": [1, 2]},
            }])
        );
    }

    #[test]
    fn maps_mcp_progress_to_output_then_start() {
        assert_eq!(
            mapped(
                "item/mcpToolCall/progress",
                json!({"itemId": "call-1", "message": "RUN v3\n"})
            ),
            json!([{
                "type": "tool.output",
                "sessionId": "session-1",
                "callId": "call-1",
                "content": "RUN v3\n",
            }])
        );
        assert_eq!(
            mapped(
                "item/mcpToolCall/progress",
                json!({"itemId": "call-2", "name": "todo", "arguments": {"limit": 5}})
            ),
            json!([{
                "type": "tool.start",
                "sessionId": "session-1",
                "tool": "todo",
                "args": {"limit": 5},
                "callId": "call-2",
            }])
        );
        // An empty name is still a string, so it is kept instead of "mcp-tool".
        assert_eq!(
            mapped("item/mcpToolCall/progress", json!({"id": "c"})),
            json!([{
                "type": "tool.start",
                "sessionId": "session-1",
                "tool": "mcp-tool",
                "args": {},
                "callId": "c",
            }])
        );
    }

    #[test]
    fn ignores_retrying_errors_and_reports_fatal_ones() {
        assert_eq!(
            mapped(
                "error",
                json!({"error": {"message": "temporary connection issue"}, "willRetry": true})
            ),
            json!([])
        );
        assert_eq!(
            mapped("error", json!({"error": {"message": "auth failed"}})),
            json!([{
                "type": "session.error",
                "sessionId": "session-1",
                "error": "auth failed",
            }])
        );
        assert_eq!(
            mapped("error", json!({})),
            json!([{
                "type": "session.error",
                "sessionId": "session-1",
                "error": "Codex error",
            }])
        );
    }

    #[test]
    fn failed_turn_with_null_error_still_ends_the_session() {
        assert_eq!(
            mapped(
                "turn/completed",
                json!({"turn": {"status": "failed", "error": null}})
            ),
            json!([{
                "type": "session.error",
                "sessionId": "session-1",
                "error": "Codex turn failed",
            }])
        );
        assert_eq!(
            mapped("turn/completed", json!({"turn": {"status": "completed"}})),
            json!([{"type": "turn.completed", "sessionId": "session-1"}])
        );
        assert_eq!(
            mapped("turn/completed", json!({})),
            json!([{"type": "turn.completed", "sessionId": "session-1"}])
        );
    }

    #[test]
    fn maps_completed_agent_message_item_to_assistant_message() {
        assert_eq!(
            mapped(
                "item/completed",
                json!({"item": {
                    "id": "msg-1",
                    "type": "agent_message",
                    "content": "Agent finished the task.",
                }})
            ),
            json!([{
                "type": "message",
                "sessionId": "session-1",
                "role": "assistant",
                "content": "Agent finished the task.",
            }])
        );
        // User echoes are dropped.
        assert_eq!(
            mapped(
                "item/completed",
                json!({"item": {"type": "user_message", "content": "run it"}})
            ),
            json!([])
        );
    }

    #[test]
    fn joins_text_content_parts() {
        assert_eq!(
            mapped(
                "item/completed",
                json!({"item": {
                    "type": "agent_message",
                    "content": [
                        {"type": "text", "text": "line one"},
                        {"type": "reasoning", "text": "hidden"},
                        {"type": "output_text", "text": "line two"},
                    ],
                }})
            ),
            json!([{
                "type": "message",
                "sessionId": "session-1",
                "role": "assistant",
                "content": "line one\nline two",
            }])
        );
    }

    #[test]
    fn uses_last_agent_message_for_task_complete() {
        assert_eq!(
            mapped(
                "codex/event/task_complete",
                json!({"msg": {"last_agent_message": "Agent finished the task."}})
            ),
            json!([{
                "type": "message",
                "sessionId": "session-1",
                "role": "assistant",
                "content": "Agent finished the task.",
            }])
        );
        assert_eq!(
            mapped("codex/event/task_complete", json!({"msg": {}})),
            json!([{
                "type": "activity",
                "sessionId": "session-1",
                "kind": "codex/event/task_complete",
                "summary": "Codex: codex/event/task_complete",
                "payload": {"msg": {}},
            }])
        );
    }

    #[test]
    fn emits_turn_started_and_activity_for_task_started() {
        assert_eq!(
            mapped(
                "codex/event/task_started",
                json!({"msg": {"type": "task_started"}})
            ),
            json!([
                {"type": "turn.started", "sessionId": "session-1"},
                {
                    "type": "activity",
                    "sessionId": "session-1",
                    "kind": "codex/event/task_started",
                    "summary": "Codex: codex/event/task_started",
                    "payload": {"msg": {"type": "task_started"}},
                },
            ])
        );
    }

    #[test]
    fn maps_envelope_items_using_kind_fallback() {
        assert_eq!(
            mapped(
                "codex/event/item_started",
                json!({"msg": {"id": "evt-1", "kind": "exec_command", "command": "ls"}})
            ),
            json!([{
                "type": "tool.start",
                "sessionId": "session-1",
                "tool": "execute",
                "args": {"command": "ls", "id": "evt-1", "kind": "exec_command", "command": "ls"},
                "callId": "evt-1",
            }])
        );
        assert_eq!(
            mapped(
                "codex/event/item_started",
                json!({"msg": {"kind": "agent_message"}})
            ),
            json!([])
        );
    }

    #[test]
    fn emits_usage_from_codex_token_count() {
        let events = mapped(
            "codex/event/token_count",
            json!({"msg": {"tokenUsage": {
                "total": {"inputTokens": 120, "outputTokens": 30, "totalTokens": 150},
                "last": {"inputTokens": 40, "outputTokens": 10},
            }}}),
        );
        assert_eq!(
            events,
            json!([{
                "type": "usage",
                "sessionId": "session-1",
                "usage": {
                    "inputTokens": 120,
                    "outputTokens": 30,
                    "scope": "session",
                    "totalTokens": 150,
                    "lastRequest": {"inputTokens": 40, "outputTokens": 10, "scope": "turn"},
                },
            }])
        );
        assert_eq!(mapped("codex/event/token_count", json!({})), json!([]));
    }

    #[test]
    fn falls_back_to_generated_call_ids() {
        reset_fallback_ids();
        assert_eq!(
            mapped("item/mcpToolCall/progress", json!({"message": "x"})),
            json!([{
                "type": "tool.output",
                "sessionId": "session-1",
                "callId": "codex-item-1",
                "content": "x",
            }])
        );
        assert_eq!(
            mapped(
                "codex/event/item_started",
                json!({"msg": {"kind": "command"}})
            ),
            json!([{
                "type": "tool.start",
                "sessionId": "session-1",
                "tool": "execute",
                "args": {"command": "", "kind": "command"},
                "callId": "codex-evt-2",
            }])
        );
        // The counter advances even when the event is dropped.
        assert_eq!(
            mapped("item/started", json!({"item": {"type": "agent_message"}})),
            json!([])
        );
        assert_eq!(
            mapped("item/mcpToolCall/progress", json!({"message": "y"})),
            json!([{
                "type": "tool.output",
                "sessionId": "session-1",
                "callId": "codex-item-4",
                "content": "y",
            }])
        );
    }

    #[test]
    fn ignores_noisy_and_unknown_events() {
        for method in [
            "codex/event/user_message",
            "item/plan/delta",
            "turn/plan/updated",
            "turn/diff/updated",
            "codex/event/turn_diff",
        ] {
            assert_eq!(mapped(method, json!({})), json!([]), "{method}");
        }
        assert_eq!(
            mapped("session/completed", json!({})),
            json!([{"type": "session.completed", "sessionId": "session-1"}])
        );
        assert_eq!(
            mapped("thread/status/changed", json!({"status": "busy"})),
            json!([{
                "type": "activity",
                "sessionId": "session-1",
                "kind": "thread/status/changed",
                "summary": "Codex: thread/status/changed",
                "payload": {"status": "busy"},
            }])
        );
        assert_eq!(
            mapped("something/new", json!({"a": 1})),
            json!([{
                "type": "activity",
                "sessionId": "session-1",
                "kind": "something/new",
                "summary": "Codex: something/new",
                "payload": {"a": 1},
            }])
        );
    }

    #[test]
    fn tolerates_non_object_params() {
        assert_eq!(
            mapped("something/new", json!("text")),
            json!([{
                "type": "activity",
                "sessionId": "session-1",
                "kind": "something/new",
                "summary": "Codex: something/new",
                "payload": "text",
            }])
        );
        assert_eq!(mapped("item/started", json!(null)), json!([]));
        assert_eq!(
            mapped("turn/completed", json!([])),
            json!([{
                "type": "turn.completed",
                "sessionId": "session-1",
            }])
        );
    }

    #[test]
    fn normalizes_item_types_like_ecmascript() {
        assert_eq!(normalize_item_type("commandExecution"), "command execution");
        assert_eq!(normalize_item_type("file_change"), "file change");
        assert_eq!(normalize_item_type("FILE_READ"), "file read");
        assert_eq!(normalize_item_type("mcp--tool//call"), "mcp tool call");
        assert_eq!(normalize_item_type("  patch  "), "patch");
        assert_eq!(normalize_item_type(""), "");
    }

    #[test]
    fn recognizes_agent_tool_name_variants() {
        for name in [
            "spawn_agent",
            "functions.spawn_agent",
            "functions_spawn_agent",
            "wait-agent",
            "send-input",
            "run_subagent",
            "search_subagent",
        ] {
            assert!(is_provider_agent_tool(name), "{name}");
        }
        // `SpawnAgent` normalizes to `spawnagent`; the reference only matches the
        // underscore form, so camel-cased tool names stay ordinary tools.
        for name in ["spawn", "todo", "agentic", "", "SpawnAgent", "SendInput"] {
            assert!(!is_provider_agent_tool(name), "{name}");
        }
    }

    #[test]
    fn builds_edit_arguments_with_nested_fallbacks() {
        assert_eq!(
            Value::Object(build_tool_args(
                &json!({
                    "type": "fileChange",
                    "input": {"path": "a.ts", "old_string": "before", "newString": "after"},
                })
                .as_object()
                .unwrap()
                .clone(),
                "edit",
            )),
            json!({
                "path": "a.ts",
                "search": "before",
                "replace": "after",
                "type": "fileChange",
                "input": {"path": "a.ts", "old_string": "before", "newString": "after"},
            })
        );
    }

    #[test]
    fn builds_web_arguments_in_reference_order() {
        assert_eq!(
            Value::Object(build_tool_args(
                &json!({"type": "webSearch", "input": {"q": "rust"}, "url": "https://e.test"})
                    .as_object()
                    .unwrap()
                    .clone(),
                "web",
            )),
            json!({
                "query": "rust",
                "url": "https://e.test",
                "type": "webSearch",
                "input": {"q": "rust"},
            })
        );
    }
}
