//! Reference-compatible minimal plugin manifest validation.
use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;
static ID: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?:@[A-Za-z0-9_-]+/)?[A-Za-z0-9_][A-Za-z0-9_.-]*$").unwrap());
pub fn validate_manifest(raw: &Value) -> Option<String> {
    if !raw.is_object() && !raw.is_array() {
        return Some("Manifest must be a JSON object".into());
    }
    for key in ["id", "displayName", "version"] {
        if raw[key].as_str().is_none_or(|s| s.is_empty()) {
            return Some(format!("Manifest must have a non-empty '{key}'"));
        }
    }
    let id = raw["id"].as_str().expect("validated id");
    if !ID.is_match(id) {
        return Some(format!(
            "Invalid plugin id '{id}' — use alphanumeric, hyphens, dots, and optional @scope/"
        ));
    }
    None
}
