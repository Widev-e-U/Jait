//! Model-history projection and clipping. The UI input is preserved.
use serde_json::{Value, json};

pub fn project_model_data(value: &Value) -> Value {
    let mut value = value.clone();
    if let Some(object) = value.as_object_mut() {
        object.shift_remove("terminalOutputAnsi");
        if object.get("output").is_some_and(Value::is_string) {
            object.shift_remove("terminalOutput");
        }
    }
    value
}

fn js_len(text: &str) -> usize {
    text.encode_utf16().count()
}
fn prefix(text: &str, length: usize) -> String {
    let mut units: Vec<u16> = text.encode_utf16().take(length).collect();
    if units.last().is_some_and(|u| (0xd800..=0xdbff).contains(u)) {
        units.pop();
    }
    String::from_utf16(&units).expect("complete UTF-16 pairs")
}
pub const MODEL_RESULT_MAX_CHARS: usize = 30_000;

fn stringify(value: &Value) -> String {
    crate::contracts::bounded_json::JsonGraph::from_value(value)
        .stringify()
        .expect("JSON value")
}

pub fn bound_model_data(value: &Value, max_chars: usize) -> Value {
    bound_model_data_with_limit(value, max_chars as f64)
}

/// Preserve the reference comparison for fractional and negative Number budgets.
/// Tiny budgets may be smaller than the minimum evidence envelope itself.
pub fn bound_model_data_with_limit(value: &Value, max_chars: f64) -> Value {
    let serialized = stringify(value);
    if js_len(&serialized) as f64 <= max_chars {
        return value.clone();
    }
    let mut output = json!({"truncated":true,"originalChars":js_len(&serialized),"preview":""});
    for key in [
        "ok",
        "exitCode",
        "timedOut",
        "needsInteraction",
        "terminalId",
        "executionId",
        "status",
        "yielded",
        "isBackground",
        "watched",
        "outputOffset",
        "outputEndOffset",
    ] {
        if let Some(v) = value.get(key)
            && (v.is_null() || v.is_boolean() || v.is_number() || v.is_string())
        {
            output[key] = v
                .as_str()
                .map(|s| json!(prefix(s, 128)))
                .unwrap_or_else(|| v.clone());
        }
    }
    if value.is_object() {
        for key in [
            "error",
            "errors",
            "warnings",
            "coverage",
            "limitations",
            "total",
            "count",
            "hasMore",
            "nextOffset",
        ] {
            if let Some(v) = value.get(key)
                && js_len(&stringify(v)) as f64 <= 1024_f64.min((max_chars / 4.).floor())
            {
                output[key] = v.clone();
                if js_len(&stringify(&output)) as f64 > max_chars / 2. {
                    output.as_object_mut().unwrap().shift_remove(key);
                }
            }
        }
    }
    let text = value
        .get("output")
        .and_then(Value::as_str)
        .unwrap_or(&serialized);
    let excerpt = |length: usize| -> String {
        if length >= js_len(text) {
            return text.to_owned();
        }
        let head = length.div_ceil(2);
        let tail = length / 2;
        let units: Vec<u16> = text.encode_utf16().collect();
        let mut start = units.len() - tail;
        if units
            .get(start)
            .is_some_and(|u| (0xdc00..=0xdfff).contains(u))
        {
            start += 1;
        }
        let suffix = String::from_utf16(&units[start..]).expect("scalar boundaries");
        format!(
            "{}{}{}",
            prefix(text, head),
            if max_chars < 256. {
                "…"
            } else {
                "\n… [omitted middle; full evidence available] …\n"
            },
            suffix
        )
    };
    let (mut low, mut high) = (0, js_len(text));
    while low < high {
        let mid = low + (high - low).div_ceil(2);
        output["preview"] = json!(excerpt(mid));
        if js_len(&stringify(&output)) as f64 <= max_chars {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    output["preview"] = json!(if low > 0 { excerpt(low) } else { String::new() });
    output
}

/// Serialize only the copy entering model history. Missing data is distinct from null.
pub fn serialize_tool_result_for_model(ok: bool, message: &str, data: Option<&Value>) -> String {
    let mut data = data.map(project_model_data);
    if let Some(Value::Object(object)) = data.as_mut() {
        object.retain(|_, value| value.as_str() != Some(message));
        if object.is_empty() {
            data = None;
        }
    }
    let mut result = json!({"ok":ok,"message":message});
    if let Some(data) = data {
        result["data"] = data;
    }
    stringify(&bound_model_data(&result, MODEL_RESULT_MAX_CHARS))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copy_projection_and_message_deduplication_preserve_ui_evidence() {
        let data = json!({"output":"same","terminalOutput":"echo","terminalOutputAnsi":"ansi","other":"same","nested":{"output":"same"}});
        assert_eq!(
            serialize_tool_result_for_model(true, "same", Some(&data)),
            r#"{"ok":true,"message":"same","data":{"nested":{"output":"same"}}}"#
        );
        assert_eq!(data["terminalOutputAnsi"], "ansi");
        assert_eq!(
            project_model_data(
                &json!({"terminalOutput":"only evidence","terminalOutputAnsi":"ansi"})
            ),
            json!({"terminalOutput":"only evidence"})
        );
        assert_eq!(
            serialize_tool_result_for_model(true, "same", None),
            r#"{"ok":true,"message":"same"}"#
        );
        assert_eq!(
            serialize_tool_result_for_model(true, "same", Some(&Value::Null)),
            r#"{"ok":true,"message":"same","data":null}"#
        );
    }
    #[test]
    fn decimal_metadata_uses_the_same_budget_as_integer_spelling() {
        let mut data = json!({"output":"x".repeat(300),"outputOffset":1.0});
        let decimal = bound_model_data(&data, 100);
        data["outputOffset"] = json!(1);
        let integer = bound_model_data(&data, 100);
        assert_eq!(decimal["preview"], integer["preview"]);
        assert_eq!(js_len(&stringify(&decimal)), 100);
    }
    #[test]
    fn utf16_prefix_drops_a_trailing_high_surrogate() {
        assert_eq!(prefix("x🦀y", 2), "x");
        assert_eq!(prefix("x🦀y", 3), "x🦀");
        let clipped = bound_model_data(&json!("🦀".repeat(200)), 100);
        assert!(js_len(&stringify(&clipped)) <= 100);
        assert_eq!(clipped["originalChars"], 402);
    }
    #[test]
    fn scalar_status_survives_and_tiny_budgets_keep_the_envelope() {
        let data = json!({"output":"x".repeat(200),"ok":false,"exitCode":2,"terminalId":"term-1","timedOut":{},"outputOffset":null});
        let clipped = bound_model_data(&data, 0);
        assert_eq!(clipped["preview"], "");
        assert_eq!(clipped["ok"], false);
        assert_eq!(clipped["exitCode"], 2);
        assert_eq!(clipped["terminalId"], "term-1");
        assert!(clipped.get("timedOut").is_none());
        assert_eq!(clipped.get("outputOffset"), Some(&Value::Null));
    }
    #[test]
    fn default_serialization_budget_and_nonempty_execution_evidence() {
        let result = serialize_tool_result_for_model(
            false,
            "failed",
            Some(&json!({"output":"🦀".repeat(30_000)})),
        );
        assert!(js_len(&result) <= MODEL_RESULT_MAX_CHARS);
        let value: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(value["ok"], false);
        assert_eq!(value["truncated"], true);
        assert!(value["preview"].as_str().unwrap().contains("failed"));
    }
}
