//! Contract evidence for the native Rust ports of the `tools` cluster (batch E).
//!
//! Each `mod` maps 1:1 to a migrated TypeScript gateway module; assertions use
//! literal expectations derived from the TS source (tool names, ordering,
//! required-argument sets, refusal messages, spawn request shapes).

use serde_json::{json, Value};

fn required(tool: &Value) -> Vec<String> {
    tool["parameters"]["required"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn assert_required(tool: &Value, expected: &[&str]) {
    let want: Vec<String> = expected.iter().map(|s| (*s).to_string()).collect();
    assert_eq!(required(tool), want, "required args for {:?}", tool["name"]);
}

fn prop_keys(tool: &Value) -> Vec<String> {
    let mut keys: Vec<String> = tool["parameters"]["properties"]
        .as_object()
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default();
    keys.sort();
    keys
}

fn assert_props(tool: &Value, expected: &[&str]) {
    let mut want: Vec<String> = expected.iter().map(|s| (*s).to_string()).collect();
    want.sort();
    assert_eq!(prop_keys(tool), want, "properties for {:?}", tool["name"]);
}

fn names_of(entries: &[&Value]) -> Vec<String> {
    entries
        .iter()
        .map(|e| e["name"].as_str().unwrap_or_default().to_string())
        .collect()
}

// ---------------------------------------------------------------------------
// index.ts — personaAgentIdForContext
// ---------------------------------------------------------------------------
mod index_tools {
    use jait_gateway::tools::index as idx;
    use std::cell::RefCell;

    struct FakeThreads {
        thread: Option<idx::ThreadOwner>,
        persona_ok: bool,
        calls: RefCell<Vec<(String, String)>>,
    }

    impl idx::PersonaThreadLookup for FakeThreads {
        fn thread_for(&self, _thread_id: &str) -> Option<idx::ThreadOwner> {
            self.thread.clone()
        }
        fn has_persona_agent(&self, persona_agent_id: &str, user_id: &str) -> bool {
            self.calls
                .borrow_mut()
                .push((persona_agent_id.to_string(), user_id.to_string()));
            self.persona_ok
        }
    }

    fn owner(persona: &str) -> idx::ThreadOwner {
        idx::ThreadOwner {
            user_id: "u1".to_string(),
            persona_agent_id: Some(persona.to_string()),
        }
    }

    fn fake(thread: Option<idx::ThreadOwner>, persona_ok: bool) -> FakeThreads {
        FakeThreads {
            thread,
            persona_ok,
            calls: RefCell::new(Vec::new()),
        }
    }

    #[test]
    fn resolves_persona_for_the_owning_user_only() {
        let threads = fake(Some(owner("persona-1")), true);
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&threads), Some("u1"), Some("t1")),
            Some("persona-1".to_string())
        );
        assert_eq!(
            threads.calls.borrow().as_slice(),
            &[("persona-1".to_string(), "u1".to_string())]
        );
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&threads), Some("u2"), Some("t1")),
            None,
            "a thread owned by another user must not leak the persona agent id"
        );
        assert_eq!(
            threads.calls.borrow().len(),
            1,
            "has_persona_agent must not run for a foreign owner"
        );
    }

    #[test]
    fn returns_none_without_service_or_ids() {
        let threads = fake(Some(owner("persona-1")), true);
        assert_eq!(
            idx::persona_agent_id_for_context(None, Some("u1"), Some("t1")),
            None
        );
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&threads), None, Some("t1")),
            None
        );
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&threads), Some("u1"), None),
            None
        );
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&threads), Some(""), Some("t1")),
            None,
            "empty user ids are falsy in TS and treated as absent"
        );
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&threads), Some("u1"), Some("")),
            None,
            "empty thread ids are falsy in TS and treated as absent"
        );
        assert!(threads.calls.borrow().is_empty());
    }

    #[test]
    fn drops_missing_empty_or_unowned_personas() {
        let no_persona = fake(
            Some(idx::ThreadOwner {
                user_id: "u1".to_string(),
                persona_agent_id: None,
            }),
            true,
        );
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&no_persona), Some("u1"), Some("t1")),
            None
        );

        let empty_persona = fake(Some(owner("")), true);
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&empty_persona), Some("u1"), Some("t1")),
            None
        );

        let unowned = fake(Some(owner("persona-9")), false);
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&unowned), Some("u1"), Some("t1")),
            None,
            "an inaccessible persona id must be dropped, not surfaced"
        );
        assert_eq!(unowned.calls.borrow().len(), 1);
    }

    #[test]
    fn missing_thread_record_is_not_an_error() {
        let empty = fake(None, true);
        assert_eq!(
            idx::persona_agent_id_for_context(Some(&empty), Some("u1"), Some("missing")),
            None
        );
        assert!(empty.calls.borrow().is_empty());
    }
}

// ---------------------------------------------------------------------------
// mcp-bridge.ts
// ---------------------------------------------------------------------------
mod mcp_bridge {
    use jait_gateway::tools::mcp_bridge as mb;
    use std::collections::BTreeMap;

    fn stdio_config(id: &str, command: Option<&str>) -> mb::McpServerConfig {
        mb::McpServerConfig {
            id: id.to_string(),
            name: format!("{id}-name"),
            transport: Some(mb::McpTransport::Stdio),
            command: command.map(str::to_string),
            ..Default::default()
        }
    }

    #[test]
    fn transport_strings_match_the_ts_union() {
        assert_eq!(mb::McpTransport::Stdio.as_str(), "stdio");
        assert_eq!(mb::McpTransport::Sse.as_str(), "sse");
        assert_eq!(
            mb::McpTransport::StreamableHttp.as_str(),
            "streamable-http"
        );
        assert_eq!(
            mb::McpTransport::parse("stdio").unwrap(),
            mb::McpTransport::Stdio
        );
        assert_eq!(
            mb::McpTransport::parse("sse").unwrap(),
            mb::McpTransport::Sse
        );
        assert_eq!(
            mb::McpTransport::parse("streamable-http").unwrap(),
            mb::McpTransport::StreamableHttp
        );
        assert_eq!(
            mb::McpTransport::parse("websocket").unwrap_err().to_string(),
            "Unsupported MCP transport: websocket"
        );
        assert_eq!(
            mb::unsupported_transport("streamable_http").to_string(),
            "Unsupported MCP transport: streamable_http"
        );
    }

    #[test]
    fn only_explicit_false_disables_a_server() {
        let mut config = stdio_config("s1", Some("node"));
        assert!(config.is_enabled(), "an unset enabled flag defaults to true");
        config.enabled = Some(true);
        assert!(config.is_enabled());
        config.enabled = Some(false);
        assert!(!config.is_enabled(), "explicit false must disable the server");
    }

    #[test]
    fn validate_transport_requires_command_for_stdio() {
        assert_eq!(
            mb::validate_transport(&stdio_config("s1", None))
                .unwrap_err()
                .to_string(),
            "MCP server 's1' (stdio) requires a 'command'"
        );
        assert_eq!(
            mb::validate_transport(&stdio_config("s2", Some("")))
                .unwrap_err()
                .to_string(),
            "MCP server 's2' (stdio) requires a 'command'",
            "an empty command string is as invalid as a missing one"
        );
        assert_eq!(mb::validate_transport(&stdio_config("s3", Some("node"))), Ok(()));

        let mut implicit = stdio_config("s4", Some("node"));
        implicit.transport = None;
        assert_eq!(
            mb::validate_transport(&implicit),
            Ok(()),
            "a missing transport defaults to stdio"
        );
    }

    #[test]
    fn validate_transport_requires_url_for_network_transports() {
        for (transport, label) in [
            (mb::McpTransport::Sse, "sse"),
            (mb::McpTransport::StreamableHttp, "streamable-http"),
        ] {
            let config = mb::McpServerConfig {
                id: "net".to_string(),
                name: "net".to_string(),
                transport: Some(transport),
                ..Default::default()
            };
            assert_eq!(
                mb::validate_transport(&config).unwrap_err().to_string(),
                format!("MCP server 'net' ({label}) requires a 'url'")
            );

            let ok = mb::McpServerConfig {
                url: Some("https://example.test/mcp".to_string()),
                ..config
            };
            assert_eq!(mb::validate_transport(&ok), Ok(()));
        }
    }

    #[test]
    fn tool_names_and_descriptions_are_namespaced_per_server() {
        assert_eq!(mb::mcp_tool_prefix("github"), "mcp.github.");
        assert_eq!(
            mb::build_jait_tool_name("github", "create_issue"),
            "mcp.github.create_issue"
        );
        assert_eq!(
            mb::build_jait_description("github", "Create an issue"),
            "[MCP: github] Create an issue"
        );
        assert_eq!(
            mb::build_jait_description("github", ""),
            "[MCP: github] "
        );

        let mut env = BTreeMap::new();
        env.insert("TOKEN".to_string(), "t".to_string());
        let config = mb::McpServerConfig {
            id: "srv".to_string(),
            name: "Server".to_string(),
            transport: Some(mb::McpTransport::Stdio),
            command: Some("node".to_string()),
            args: Some(vec!["server.js".to_string()]),
            env: Some(env),
            cwd: Some("/tmp".to_string()),
            enabled: Some(true),
            url: None,
        };
        let round_trip: mb::McpServerConfig =
            serde_json::from_value(serde_json::to_value(&config).unwrap()).unwrap();
        assert_eq!(round_trip, config, "config serde must be camelCase-stable");
    }

    #[test]
    fn connection_status_serialises_to_the_ts_literals() {
        use mb::McpConnectionStatus as S;
        assert_eq!(serde_json::to_value(S::Connected).unwrap(), serde_json::json!("connected"));
        assert_eq!(
            serde_json::to_value(S::Disconnected).unwrap(),
            serde_json::json!("disconnected")
        );
        assert_eq!(serde_json::to_value(S::Error).unwrap(), serde_json::json!("error"));
    }
}

// ---------------------------------------------------------------------------
// elevated-tools.ts
// ---------------------------------------------------------------------------
mod elevated_tools {
    use super::*;
    use jait_gateway::tools::elevated_tools as el;

    #[test]
    fn metadata_declares_only_elevated_run_requiring_command() {
        let md = el::metadata();
        assert_eq!(md.as_array().unwrap().len(), 1);
        let tool = &md[0];
        assert_eq!(tool["name"], json!("elevated.run"));
        assert_required(tool, &["command"]);
        assert_props(tool, &["command", "cwd", "reason", "timeoutMs", "username"]);
        assert_eq!(tool["tier"], json!("standard"));
        assert_eq!(tool["category"], json!("os"));
        assert_eq!(tool["source"], json!("builtin"));
    }

    #[test]
    fn definition_carries_the_ts_schema_and_unknown_tools_are_null() {
        let def = el::definition("elevated.run");
        assert_eq!(def["name"], json!("elevated.run"));
        assert_required(&def, &["command"]);
        assert_props(&def, &["command", "cwd", "reason", "timeoutMs", "username"]);
        assert!(el::definition("elevated.other").is_null());
    }

    #[test]
    fn windows_uac_spawn_encodes_the_command_for_powershell() {
        let spawn = el::windows_uac_spawn("echo hi", "C:\\work");
        assert_eq!(spawn.command, "powershell.exe");
        assert_eq!(spawn.args.len(), 4);
        assert_eq!(spawn.args[0], "-NoProfile");
        assert_eq!(spawn.args[1], "-NonInteractive");
        assert_eq!(spawn.args[2], "-EncodedCommand");
        assert!(
            !spawn.args[3].is_empty(),
            "the wrapper script is base64-utf16le encoded for -EncodedCommand"
        );
        let mut env: Vec<(&str, &str)> = spawn
            .env
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        env.sort();
        assert_eq!(
            env,
            vec![
                ("JAIT_ELEVATED_COMMAND_B64", "ZWNobyBoaQ=="),
                ("JAIT_ELEVATED_CWD", "C:\\work"),
            ]
        );
        assert_eq!(spawn.cwd, "C:\\work");
        assert_eq!(spawn.timeout_ms, 30_000);
        assert!(spawn.windows_hide);
        assert!(spawn.stdin.is_none());
    }

    #[test]
    fn windows_credential_spawn_exposes_credentials_only_through_env() {
        let spawn = el::windows_credential_spawn("whoami", "D:\\job", "admin", "s3cret");
        assert_eq!(spawn.command, "powershell.exe");
        assert_eq!(spawn.args.len(), 4);
        assert_eq!(spawn.args[0], "-NoProfile");
        assert_eq!(spawn.args[1], "-NonInteractive");
        assert_eq!(spawn.args[2], "-EncodedCommand");
        let mut env: Vec<(&str, &str)> = spawn
            .env
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        env.sort();
        assert_eq!(
            env,
            vec![
                ("JAIT_ELEVATED_COMMAND_B64", "d2hvYW1p"),
                ("JAIT_ELEVATED_CWD", "D:\\job"),
                ("JAIT_ELEVATED_PASSWORD", "s3cret"),
                ("JAIT_ELEVATED_USERNAME", "admin"),
            ]
        );
        assert_eq!(spawn.cwd, "D:\\job");
        assert_eq!(spawn.timeout_ms, 30_000);
        assert!(spawn.windows_hide);
        assert!(
            !spawn.args[3].contains("s3cret"),
            "the password must never be embedded in the encoded script"
        );
    }

    #[test]
    fn platform_detection_matches_the_build_target() {
        let platform = el::Platform::current();
        let expected = if cfg!(windows) {
            el::Platform::Windows
        } else {
            el::Platform::Other
        };
        assert_eq!(platform, expected);
    }
}

// ---------------------------------------------------------------------------
// os-control-tools.ts
// ---------------------------------------------------------------------------
mod os_control_tools {
    use super::*;
    use jait_gateway::tools::os_control_tools as os;

    fn assert_panics_on_unknown() {
        let result = std::panic::catch_unwind(|| os::definition("os.nope"));
        let err = result.expect_err("unknown os control tools must panic");
        let msg = err
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| err.downcast_ref::<&str>().map(|s| (*s).to_string()))
            .unwrap_or_default();
        assert!(
            msg.contains("unknown os control tool: os.nope"),
            "unexpected panic message: {msg}"
        );
    }

    #[test]
    fn tool_names_are_in_registration_order() {
        assert_eq!(
            os::tool_names(),
            vec![
                "os.screenshot",
                "os.click",
                "os.mouse",
                "os.type",
                "os.keyboard",
                "os.scroll",
                "os.exec",
                "os.sandbox.list",
            ]
        );
        assert_eq!(os::OS_SCREENSHOT, "os.screenshot");
        assert_eq!(os::OS_MOUSE, "os.mouse");
        assert_eq!(os::OS_EXEC, "os.exec");
        assert_eq!(os::OS_SANDBOX_LIST, "os.sandbox.list");
    }

    #[test]
    fn metadata_tiers_categories_and_sources_match_the_ts_toolset() {
        let md = os::metadata().as_array().unwrap();
        assert_eq!(md.len(), 8);
        for tool in md {
            assert_eq!(tool["category"], json!("os"));
            assert_eq!(tool["source"], json!("builtin"));
            let expected_tier = if tool["name"] == json!("os.sandbox.list") {
                "standard"
            } else {
                "core"
            };
            assert_eq!(tool["tier"], json!(expected_tier), "tier for {}", tool["name"]);
        }
        assert_eq!(
            names_of(&md.iter().collect::<Vec<_>>()),
            os::tool_names()
        );
    }

    #[test]
    fn required_arguments_per_tool_match_the_ts_schemas() {
        let cases: [(&str, &[&str]); 8] = [
            ("os.screenshot", &[]),
            ("os.click", &["x", "y"]),
            ("os.mouse", &["x", "y"]),
            ("os.type", &["text"]),
            ("os.keyboard", &["combo"]),
            ("os.scroll", &[]),
            ("os.exec", &["command"]),
            ("os.sandbox.list", &[]),
        ];
        for (name, expected) in cases {
            let def = os::definition(name);
            assert_eq!(def["name"], json!(name));
            assert_required(def, expected);
        }
    }

    #[test]
    fn definitions_are_stable_references_and_unknown_names_panic() {
        let first = os::definition("os.exec") as *const Value;
        let second = os::definition("os.exec") as *const Value;
        assert_eq!(first, second, "definitions are static, not rebuilt per call");
        assert_props(os::definition("os.exec"), &["command", "containerName", "cwd", "env", "timeoutMs"]);
        assert_panics_on_unknown();
    }
}

// ---------------------------------------------------------------------------
// agent-tools.ts
// ---------------------------------------------------------------------------
mod agent_tools {
    use super::*;
    use jait_gateway::tools::agent_tools as ag;

    #[test]
    fn declares_exactly_agent_spawn() {
        assert_eq!(ag::names(), vec!["agent.spawn"]);
        assert_eq!(ag::TOOL_NAMES, &["agent.spawn"]);
        let md = ag::metadata();
        assert_eq!(md.len(), 1);
        assert_eq!(md[0]["name"], json!("agent.spawn"));
        let def = ag::definition("agent.spawn").expect("agent.spawn is declared");
        assert_eq!(def["name"], json!("agent.spawn"));
        assert!(
            !def["description"].as_str().unwrap_or_default().is_empty(),
            "the definition must carry the TS description"
        );
        assert!(ag::definition("agent.other").is_none());
    }

    #[test]
    fn default_subagent_toolset_is_the_read_only_subset() {
        assert_eq!(
            ag::DEFAULT_SUBAGENT_TOOLS,
            &[
                "file.read",
                "file.list",
                "search.files",
                "search.content",
                "web.search",
                "web.fetch",
                "terminal.run",
                "todo.list",
                "todo.add",
                "todo.update",
            ]
        );
        assert_eq!(ag::SUBAGENT_MAX_ROUNDS, 30);
        assert_eq!(
            ag::parse_allowed_tools(None),
            ag::DEFAULT_SUBAGENT_TOOLS
                .iter()
                .map(|s| (*s).to_string())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn parse_allowed_tools_splits_trims_and_drops_empties() {
        assert_eq!(
            ag::parse_allowed_tools(Some(" file.read , web.search ,,  ")),
            vec!["file.read".to_string(), "web.search".to_string()]
        );
        assert_eq!(
            ag::parse_allowed_tools(Some("file.read,file.read")),
            vec!["file.read".to_string(), "file.read".to_string()],
            "the TS split does not de-duplicate"
        );
        assert!(ag::parse_allowed_tools(Some("   ")).is_empty());
        assert!(ag::parse_allowed_tools(Some("")).is_empty());
    }

    #[test]
    fn render_tool_calls_projects_the_parent_facing_shape() {
        let calls = vec![json!({
            "id": "c1",
            "name": "file.read",
            "input": { "path": "a.txt" },
            "ok": true,
            "message": "done",
            "data": { "bytes": 3 },
            "startedAt": 10,
            "completedAt": 20,
            "ignored": "drop me",
        })];
        let rendered = ag::render_tool_calls(&calls);
        assert_eq!(rendered.len(), 1);
        let call = &rendered[0];
        let mut keys: Vec<&str> = call.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                "args",
                "callId",
                "completedAt",
                "data",
                "message",
                "ok",
                "startedAt",
                "tool",
            ]
        );
        assert_eq!(call["callId"], json!("c1"));
        assert_eq!(call["tool"], json!("file.read"));
        assert_eq!(call["args"], json!({ "path": "a.txt" }));
        assert_eq!(call["ok"], json!(true));
        assert_eq!(call["message"], json!("done"));
        assert_eq!(call["data"], json!({ "bytes": 3 }));
        assert_eq!(call["startedAt"], json!(10));
        assert_eq!(call["completedAt"], json!(20));
    }

    #[test]
    fn render_tool_calls_prefers_canonical_keys_and_nulls_the_rest() {
        let calls = vec![
            json!({ "callId": "canon", "id": "legacy", "tool": "web.search", "name": "other",
                    "args": { "query": "q" }, "input": { "query": "ignored" } }),
            json!({ "id": "only-legacy" }),
            json!("not an object"),
        ];
        let rendered = ag::render_tool_calls(&calls);
        assert_eq!(rendered[0]["callId"], json!("canon"));
        assert_eq!(rendered[0]["tool"], json!("web.search"));
        assert_eq!(rendered[0]["args"], json!({ "query": "q" }));
        assert!(rendered[0]["ok"].is_null());
        assert!(rendered[0]["message"].is_null());
        assert!(rendered[0]["data"].is_null());
        assert!(rendered[0]["startedAt"].is_null());
        assert!(rendered[0]["completedAt"].is_null());

        assert_eq!(rendered[1]["callId"], json!("only-legacy"));
        assert!(rendered[1]["tool"].is_null());
        assert!(rendered[1]["args"].is_null());

        assert_eq!(rendered[2], json!({}), "non-object calls render as an empty record");
    }
}

// ---------------------------------------------------------------------------
// browser-tools.ts
// ---------------------------------------------------------------------------
mod browser_tools {
    use super::*;
    use jait_gateway::tools::browser_tools as br;

    /// `browser_tools::definition` already returns the argument schema itself.
    fn schema_required(schema: &Value) -> Vec<String> {
        schema["required"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    }

    fn schema_props(schema: &Value) -> Vec<String> {
        let mut keys: Vec<String> = schema["properties"]
            .as_object()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default();
        keys.sort();
        keys
    }

    #[test]
    fn declares_seven_tools_in_registration_order() {
        assert_eq!(
            br::TOOL_NAMES,
            [
                "browser.navigate",
                "browser.snapshot",
                "browser.inspect",
                "browser.screenshot",
                "web.fetch",
                "web.search",
                "browser.sandbox.start",
            ]
        );
        let all = br::all_metadata();
        assert_eq!(all.len(), 7);
        assert_eq!(
            names_of(&all),
            br::TOOL_NAMES.iter().map(|s| (*s).to_string()).collect::<Vec<_>>()
        );
        assert_eq!(br::DEFAULT_BROWSER_ID, "browser-default");
    }

    #[test]
    fn metadata_is_categorised_browser_vs_web() {
        for name in br::TOOL_NAMES {
            let entry = br::metadata(name).expect("declared tools have metadata");
            assert_eq!(entry["name"], json!(name));
            assert_eq!(entry["tier"], json!("standard"));
            assert_eq!(entry["source"], json!("builtin"));
            let expected_category = if name.starts_with("web.") { "web" } else { "browser" };
            assert_eq!(entry["category"], json!(expected_category), "category for {name}");
            assert!(!entry["description"].as_str().unwrap_or_default().is_empty());
        }
        assert!(br::metadata("browser.nope").is_none());
        assert!(br::definition("browser.nope").is_none());
    }

    #[test]
    fn required_arguments_match_the_ts_schemas() {
        assert_eq!(
            schema_required(br::definition("browser.navigate").unwrap()),
            vec!["url".to_string()]
        );
        assert_eq!(
            schema_required(br::definition("web.fetch").unwrap()),
            vec!["url".to_string()]
        );
        assert_eq!(
            schema_required(br::definition("web.search").unwrap()),
            vec!["query".to_string()]
        );
        for name in [
            "browser.snapshot",
            "browser.inspect",
            "browser.screenshot",
            "browser.sandbox.start",
        ] {
            assert!(
                schema_required(br::definition(name).unwrap()).is_empty(),
                "{name} takes no required arguments"
            );
        }
        assert_eq!(
            br::definition("browser.navigate").unwrap()["properties"]["url"]["type"],
            json!("string")
        );
    }

    #[test]
    fn fetch_schema_enumerates_methods_and_bounds_the_body() {
        let def = br::definition("web.fetch").unwrap();
        assert_eq!(
            schema_props(def),
            ["body", "headers", "ignoreTlsErrors", "maxBytes", "method", "timeoutMs", "url"]
                .iter()
                .map(|s| (*s).to_string())
                .collect::<Vec<_>>()
        );
        assert_eq!(
            def["properties"]["method"]["enum"],
            json!(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
        );
        assert_eq!(def["additionalProperties"], json!(false));
        assert_eq!(def["type"], json!("object"));
    }

    #[test]
    fn search_schema_accepts_query_provider_and_bounded_limit() {
        let def = br::definition("web.search").unwrap();
        assert_eq!(
            schema_props(def),
            vec!["limit".to_string(), "provider".to_string(), "query".to_string()]
        );
        assert_eq!(def["properties"]["query"]["type"], json!("string"));
        assert_eq!(
            def["properties"]["limit"]["description"],
            json!("Maximum number of results (1-10).")
        );
        assert_eq!(
            br::definition("browser.snapshot").unwrap()["properties"]["browserId"]["type"],
            json!("string")
        );
    }
}
