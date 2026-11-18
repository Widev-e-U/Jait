//! Migration behavior contract: exercise real TS registry + ACP provider over
//! JSON-RPC, with an isolated peer modeling codex-acp saved-name filtering.
//! Native provider integration must preserve per-chat MCP authority across
//! account aliases and saved config conflicts. This is reference coverage,
//! not native parity credit; browser missing-session guards remain mandatory.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn scenario(provider: &str) -> Value {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root = manifest
        .ancestors()
        .find(|path| path.join("tests/contract/drivers/internals.ts").is_file())
        .expect("project root above the contract manifest");
    let directory = root
        .join(".jait/artifacts/provider-mcp-binding")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    internal_driver::call(
        root,
        &directory,
        json!({"version":1,"calls":[{"op":"nativemcp.binding","providerType":provider}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}

#[test]
fn codex_account_alias_preserves_personal_chat_bindings_over_saved_config() {
    let result = scenario("codex");
    let rows = result.as_array().unwrap();
    assert_eq!(rows.len(), 2);
    for (row, chat) in rows.iter().zip(["personal-chat-a", "personal-chat-b"]) {
        assert_eq!(row["filtering"], "true");
        let servers = row["servers"].as_array().unwrap();
        for (name, tool_set) in [("jait_core", "core"), ("jait", "deferred")] {
            let server = servers.iter().find(|s| s["name"] == name).unwrap();
            assert_eq!(
                server["url"],
                format!("http://127.0.0.1:8765/mcp?sessionId={chat}&toolSet={tool_set}")
            );
        }
    }
}

#[test]
fn other_adapters_keep_their_config_filtering_policy() {
    for row in scenario("claude-code").as_array().unwrap() {
        assert_eq!(row["filtering"], "false");
    }
}
