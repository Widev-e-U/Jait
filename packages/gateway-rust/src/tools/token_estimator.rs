//! Lightweight context estimates compatible with the gateway's UTF-16 heuristic.
use crate::services::storage::json_text;
use serde_json::{Value, json};
pub fn estimate_tokens(text: &str) -> usize {
    (text.encode_utf16().count() as f64 / 3.7).ceil() as usize
}
pub fn estimate_json_tokens(value: &Value) -> usize {
    let raw = match value {
        Value::String(s) => s.clone(),
        _ => json_text(value),
    };
    (raw.encode_utf16().count() as f64 / 4.0).ceil() as usize
}
pub fn estimate_optional_json_tokens(value: Option<&Value>) -> usize {
    value.map_or(0, estimate_json_tokens)
}
pub fn estimate_message_tokens(message: &Value) -> usize {
    // TypeScript's estimateTokens reads `.length`. At runtime an array thus
    // contributes its part count, not the text or image cost. This preserves
    // compatibility; it is not a conservative multimodal budget.
    let content_tokens = match &message["content"] {
        Value::String(text) => estimate_tokens(text),
        Value::Array(parts) => (parts.len() as f64 / 3.7).ceil() as usize,
        _ => 0,
    };
    let mut tokens = 4 + content_tokens;
    for key in ["name", "tool_call_id", "thinking"] {
        if let Some(s) = message[key].as_str() {
            tokens += estimate_tokens(s);
        }
    }
    if let Some(calls) = message.get("tool_calls").filter(|v| !v.is_null()) {
        tokens += estimate_json_tokens(calls);
    }
    tokens
}
pub fn estimate_history_tokens(messages: &[Value]) -> usize {
    3 + messages.iter().map(estimate_message_tokens).sum::<usize>()
}
pub fn estimate_tool_schema_tokens(schemas: &[Value]) -> usize {
    if schemas.is_empty() {
        return 0;
    }
    ((16 + schemas
        .iter()
        .map(|s| 8 + estimate_json_tokens(s))
        .sum::<usize>()) as f64
        * 1.1)
        .ceil() as usize
}
fn number(n: f64) -> Value {
    let v = json!(n);
    serde_json::from_str(&json_text(&v)).expect("finite JSON number")
}
pub fn compute_context_usage(messages: &[Value], schemas: &[Value], context_window: f64) -> Value {
    let (mut system, mut history, mut results) = (0, 0, 0);
    for message in messages {
        let cost = estimate_message_tokens(message);
        match message["role"].as_str() {
            Some("system") => system += cost,
            Some("tool") => results += cost,
            _ => history += cost,
        }
    }
    let tools = estimate_tool_schema_tokens(schemas);
    let total = system + history + results + tools;
    let ratio = if context_window > 0.0 {
        (total as f64 / context_window).min(1.0)
    } else {
        0.0
    };
    json!({"system":system,"history":history,"toolResults":results,"tools":tools,"total":total,"limit":number(context_window),"ratio":number(ratio)})
}

#[cfg(test)]
mod multimodal_compatibility_tests {
    use super::*;

    #[test]
    fn array_content_uses_part_count_like_typescript() {
        let parts = json!([
            {"type": "text", "text": "a very long text that is not counted by the reference"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,large"}},
            {"type": "text", "text": "another part"},
            {"type": "text", "text": "fourth"}
        ]);
        let message = json!({"role": "user", "content": parts, "thinking": "🦀"});
        assert_eq!(estimate_message_tokens(&message), 7);
        assert_eq!(estimate_history_tokens(std::slice::from_ref(&message)), 10);
        assert_eq!(compute_context_usage(&[message], &[], 100.0)["history"], 7);
        assert_eq!(estimate_message_tokens(&json!({"content": []})), 4);
        assert_eq!(estimate_message_tokens(&json!({"content": "🦀"})), 5);
    }
}
