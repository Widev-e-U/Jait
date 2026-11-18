#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::providers::jait_mcp::*;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn compare(raw: Vec<Option<String>>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/provider-mcp")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    let calls = raw
        .iter()
        .map(|r| match r {
            Some(r) => json!({"op":"nativemcp.merge","raw":r}),
            None => json!({"op":"nativemcp.merge"}),
        })
        .collect::<Vec<_>>();
    let expected =
        internal_driver::call(&root, &dir, json!({"version":1,"calls":calls}), &|| false).unwrap();
    for (i, r) in raw.iter().enumerate() {
        let actual = merge_jait_codex_config(r.as_deref());
        assert_eq!(json!(actual), expected[i], "config {r:?}");
        let parsed = serde_json::from_str::<Value>(&actual);
        if let Ok(Value::Object(_)) = parsed {
            assert_eq!(
                actual,
                merge_jait_codex_config(Some(&actual)),
                "idempotence"
            );
        }
    }
}
#[test]
fn malformed_non_object_and_ecmascript_whitespace_configs() {
    compare(vec![
        None,
        Some("".into()),
        Some(" \n\t".into()),
        Some("\u{feff}\u{a0}".into()),
        Some("null".into()),
        Some("true".into()),
        Some("7".into()),
        Some("[]".into()),
        Some(" \"x\" ".into()),
        Some("{bad".into()),
        Some("\u{feff}{}".into()),
        Some("\u{85}".into()),
    ]);
}
#[test]
fn nested_config_preserves_fields_filters_namespaces_and_is_idempotent() {
    compare(vec![
  Some("{}".into()),
  Some(r#"{"model":"fixture","features":{"other":true,"code_mode":{"enabled":false,"direct_only_tool_namespaces":["x","mcp__jait_core","x",null,7,"","mcp__jait_core"],"tail":1}},"last":2}"#.into()),
  Some(r#"{"features":[],"keep":{"foo":1}}"#.into()),
  Some(r#"{"features":{"code_mode":null,"enabled":true}}"#.into()),
  Some(r#"{"features":{"code_mode":{"direct_only_tool_namespaces":"x"}}}"#.into()),
  Some(r#"{"__proto__":{"safe":true},"features":{"__proto__":{},"code_mode":{"__proto__":{},"direct_only_tool_namespaces":["__proto__","constructor"]}}}"#.into()),
 ]);
}
#[test]
fn json_stringify_preserves_key_order_numeric_boundaries_and_unicode() {
    compare(vec![
  Some(r#"{"z":1,"2":"two","1":"one","0001":"zeroes","4294967295":"max","features":{"2":2,"1":1,"code_mode":{"2":2,"1":1}}}"#.into()),
  Some(r#"{"z":1,"a":-0.0,"features":{"code_mode":{"direct_only_tool_namespaces":["🦀","é","é"]}},"x":1e21,"small":1e-7,"large":9007199254740993}"#.into()),
  Some(r#"{"features":{"code_mode":{"direct_only_tool_namespaces":["a"]}},"features":{"code_mode":{"direct_only_tool_namespaces":["b"]}}}"#.into()),
 ]);
}
#[test]
fn mcp_names_match_reference() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/provider-mcp")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    let expected = internal_driver::call(
        &root,
        &dir,
        json!({"version":1,"calls":[{"op":"nativemcp.constants"}]}),
        &|| false,
    )
    .unwrap();
    assert_eq!(
        json!([
            JAIT_CORE_MCP_SERVER_NAME,
            JAIT_DEFERRED_MCP_SERVER_NAME,
            JAIT_CORE_CODE_MODE_NAMESPACE,
            OMNIROUTE_MCP_SERVER_NAME
        ]),
        expected[0]
    );
}
