//! Byte-bounded persisted tool calls, retaining original JSON until compaction is needed.
use crate::contracts::bounded_json::{JsonGraph, limit_utf8, serialize_bounded_json};
use serde::Deserialize;
use serde_json::{Map, Value, json};
#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SerializationOptions {
    pub max_bytes: Option<f64>,
    pub force_compact: bool,
    pub detail_bytes: Option<f64>,
    pub text_bytes: Option<f64>,
    pub mark_compacted: bool,
}
fn stringify(value: &Value) -> String {
    JsonGraph::from_value(value)
        .stringify()
        .expect("JSON value is serializable")
}
fn compact(
    value: &Value,
    index: usize,
    detail: usize,
    text: usize,
    marked: bool,
    metadata_only: bool,
) -> Value {
    let mut out = Map::new();
    let id = value["callId"]
        .as_str()
        .map(String::from)
        .unwrap_or_else(|| format!("truncated-{index}"));
    out.insert("callId".into(), json!(limit_utf8(&id, 1024, Some(""))));
    out.insert(
        "tool".into(),
        json!(limit_utf8(
            value["tool"].as_str().unwrap_or("unknown"),
            1024,
            Some("")
        )),
    );
    let args = if value["args"].is_null() {
        json!({})
    } else {
        value["args"].clone()
    };
    let bounded = |value: &Value| {
        serde_json::from_str::<Value>(&serialize_bounded_json(value, detail)).expect("bounded JSON")
    };
    out.insert("args".into(), bounded(&args));
    out.insert("ok".into(), json!(value["ok"] == true));
    out.insert(
        "message".into(),
        json!(limit_utf8(
            value["message"].as_str().unwrap_or(""),
            text,
            None
        )),
    );
    for key in [
        "parentCallId",
        "status",
        "approvalRequestId",
        "approvalState",
    ] {
        if let Some(value) = value[key].as_str() {
            out.insert(key.into(), json!(limit_utf8(value, 1024, Some(""))));
        }
    }
    for key in ["startedAt", "completedAt", "retryCount"] {
        if value[key].is_number() {
            out.insert(key.into(), value[key].clone());
        }
    }
    if !metadata_only {
        if let Some(value) = value["output"].as_str() {
            out.insert("output".into(), json!(limit_utf8(value, text, None)));
        }
        if let Some(value) = value.as_object().and_then(|o| o.get("data")) {
            out.insert("data".into(), bounded(value));
        }
    }
    if marked {
        out.insert("storageCompacted".into(), json!(true));
    }
    Value::Object(out)
}
pub fn serialize_persisted_tool_calls(
    tool_calls: Option<&str>,
    options: &SerializationOptions,
) -> Option<String> {
    let raw = tool_calls.filter(|v| !v.is_empty())?;
    let parsed = match serde_json::from_str::<Value>(raw) {
        Ok(Value::Array(values)) => values,
        _ => return Some("[]".into()),
    };
    let max = options.max_bytes.unwrap_or(512000.0).floor().max(1024.0) as usize;
    if !options.force_compact && raw.len() <= max {
        return Some(raw.into());
    }
    let detail = options.detail_bytes.unwrap_or(32000.0).floor().max(128.0) as usize;
    let text = options.text_bytes.unwrap_or(8000.0).floor().max(128.0) as usize;
    // Account for each encoded entry once; never serialize a growing prefix.
    let encode = |detail, text, metadata_only| {
        let mut parts = Vec::new();
        let mut bytes = 2usize; // []
        for (i, value) in parsed.iter().enumerate() {
            let part = stringify(&compact(
                value,
                i,
                detail,
                text,
                options.mark_compacted,
                metadata_only,
            ));
            let next = bytes + usize::from(!parts.is_empty()) + part.len();
            if next > max {
                return if metadata_only {
                    Some(format!("[{}]", parts.join(",")))
                } else {
                    None
                };
            }
            parts.push(part);
            bytes = next;
        }
        Some(format!("[{}]", parts.join(",")))
    };
    for (detail, text) in [
        (detail, text),
        (detail.min(4000), text.min(2000)),
        (detail.min(512), text.min(512)),
    ] {
        if let Some(serialized) = encode(detail, text, false) {
            return Some(serialized);
        }
    }
    encode(128, 128, true)
}
