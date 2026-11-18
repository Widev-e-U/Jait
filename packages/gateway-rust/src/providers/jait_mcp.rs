//! Provider MCP names and Codex configuration merging.
use crate::{contracts::bounded_json::JsonGraph, text::js_trim};
use serde_json::{Map, Value, json};
pub const JAIT_CORE_MCP_SERVER_NAME: &str = "jait_core";
pub const JAIT_DEFERRED_MCP_SERVER_NAME: &str = "jait";
pub const JAIT_CORE_CODE_MODE_NAMESPACE: &str = "mcp__jait_core";
pub const OMNIROUTE_MCP_SERVER_NAME: &str = "omniroute";
pub fn merge_jait_codex_config(raw: Option<&str>) -> String {
    let mut config = Map::new();
    if let Some(raw) = raw.filter(|s| !js_trim(s).is_empty()) {
        let Ok(Value::Object(parsed)) = serde_json::from_str::<Value>(raw) else {
            return raw.into();
        };
        config = parsed;
    }
    let mut features = config
        .get("features")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut mode = features
        .get("code_mode")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut namespaces = vec![];
    if let Some(values) = mode
        .get("direct_only_tool_namespaces")
        .and_then(Value::as_array)
    {
        for s in values.iter().filter_map(Value::as_str) {
            if !namespaces.iter().any(|v| v == s) {
                namespaces.push(s.to_string());
            }
        }
    }
    if !namespaces
        .iter()
        .any(|s| s == JAIT_CORE_CODE_MODE_NAMESPACE)
    {
        namespaces.push(JAIT_CORE_CODE_MODE_NAMESPACE.into());
    }
    mode.insert("direct_only_tool_namespaces".into(), json!(namespaces));
    features.insert("code_mode".into(), Value::Object(mode));
    config.insert("features".into(), Value::Object(features));
    JsonGraph::from_value(&Value::Object(config))
        .stringify()
        .expect("acyclic JSON config")
}
