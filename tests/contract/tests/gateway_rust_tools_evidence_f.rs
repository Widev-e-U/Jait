//! Contract evidence for the final `tools` cluster components:
//! `agent_acp_runner`, `agent_loop`, `preview_tools`, `project_tools`.
//!
//! Expectations are derived from the TypeScript references
//! (`packages/gateway/src/tools/*` + the ACP runner/specialist helpers) and
//! asserted against literal values produced by the native Rust port.

// ─────────────────────────────────────────────────────────────────────────
// agent_acp_runner
// ─────────────────────────────────────────────────────────────────────────
mod agent_acp_runner {
    use jait_gateway::tools::agent_acp_runner::{
        AcpApprovalRequest, AcpProviderInfo, AcpSession, AcpSpecialistData, AcpSpecialistResult,
        AcpSpecialistRunOptions, ProviderEvent, DEFAULT_RUNTIME_MODE, DEFAULT_TIMEOUT_MS,
        IN_PROGRESS_MESSAGE, NO_RESULT_MESSAGE,
    };
    use serde_json::json;

    #[test]
    fn constants_match_typescript_specialist_defaults() {
        // TS: `timeoutMs ?? 8 * 60 * 1000`, runtime mode `'full-access'`, and the
        // two sentinel transcript strings the caller falls back to.
        assert_eq!(DEFAULT_TIMEOUT_MS, 480_000);
        assert_eq!(DEFAULT_RUNTIME_MODE, "full-access");
        assert_eq!(IN_PROGRESS_MESSAGE, "(in progress)");
        assert_eq!(
            NO_RESULT_MESSAGE,
            "(no result — sub-agent stopped before completing)"
        );
    }

    #[test]
    fn run_options_new_binds_identity_and_leaves_overrides_unset() {
        let options = AcpSpecialistRunOptions::new(
            "acp.claude",
            "user-42",
            "sub-7",
            "/srv/jait/proj",
            "refactor the parser",
        );
        assert_eq!(options.provider_id, "acp.claude");
        assert_eq!(options.user_id, "user-42");
        assert_eq!(options.sub_agent_id, "sub-7");
        assert_eq!(options.project_root, "/srv/jait/proj");
        assert_eq!(options.prompt, "refactor the parser");
        // Every override stays unset so the runner picks TS defaults.
        assert!(options.system_prompt.is_none());
        assert!(options.model.is_none());
        assert!(options.runtime_mode.is_none());
        assert!(options.timeout_ms.is_none());
        assert!(options.abort.is_none());
        assert!(options.on_approval_required.is_none());
        assert!(options.config.is_none());
        assert!(options.now.is_none());
    }

    #[test]
    fn provider_event_session_id_is_exposed_on_all_seven_variants() {
        let events = vec![
            ProviderEvent::Token {
                session_id: "s-acp-1".into(),
                content: "hi".into(),
            },
            ProviderEvent::Thinking {
                session_id: "s-acp-1".into(),
                content: "hmm".into(),
            },
            ProviderEvent::SessionError {
                session_id: "s-acp-1".into(),
                error: "boom".into(),
            },
            ProviderEvent::ToolStart {
                session_id: "s-acp-1".into(),
                call_id: Some("call-1".into()),
                tool: "read_file".into(),
                args: json!({ "path": "src/lib.rs" }),
                parent_call_id: None,
            },
            ProviderEvent::ToolOutput {
                session_id: "s-acp-1".into(),
                call_id: "call-1".into(),
                content: "line".into(),
            },
            ProviderEvent::ToolResult {
                session_id: "s-acp-1".into(),
                call_id: Some("call-1".into()),
                tool: "read_file".into(),
                ok: true,
                message: "ok".into(),
                data: Some(json!({ "bytes": 12 })),
                parent_call_id: None,
            },
            ProviderEvent::ApprovalRequired {
                session_id: "s-acp-1".into(),
                tool: "shell".into(),
                args: json!({ "command": "ls" }),
                request_id: "req-9".into(),
            },
        ];
        assert_eq!(events.len(), 7);
        for event in &events {
            assert_eq!(event.session_id(), "s-acp-1");
        }
        // A foreign session id is reported verbatim, never rewritten.
        let foreign = ProviderEvent::Token {
            session_id: "s-other".into(),
            content: "x".into(),
        };
        assert_eq!(foreign.session_id(), "s-other");
    }

    #[test]
    fn specialist_data_serializes_camel_case_and_omits_absent_performative() {
        let data = AcpSpecialistData {
            sub_agent_id: "sub-7".into(),
            provider: "acp.claude".into(),
            content: "done".into(),
            segments: vec![json!({ "kind": "text" })],
            tool_calls: vec![json!({ "tool": "read_file" })],
            duration_ms: 1234,
            performative: None,
        };
        let bare = serde_json::to_value(&data).expect("serialize");
        let object = bare.as_object().expect("object");
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                "content",
                "durationMs",
                "provider",
                "segments",
                "subAgentId",
                "toolCalls"
            ]
        );
        assert_eq!(bare["subAgentId"], json!("sub-7"));
        assert_eq!(bare["durationMs"], json!(1234));
        assert_eq!(bare["segments"][0]["kind"], json!("text"));

        let with_performative = AcpSpecialistData {
            performative: Some("inform".into()),
            ..data
        };
        let tagged = serde_json::to_value(&with_performative).expect("serialize");
        assert_eq!(tagged["performative"], json!("inform"));
    }

    #[test]
    fn specialist_result_omits_data_until_a_transcript_exists() {
        let failed = AcpSpecialistResult {
            ok: false,
            message: "provider unavailable".into(),
            data: None,
        };
        assert_eq!(
            serde_json::to_value(&failed).expect("serialize"),
            json!({ "ok": false, "message": "provider unavailable" })
        );

        let succeeded = AcpSpecialistResult {
            ok: true,
            message: "done".into(),
            data: Some(AcpSpecialistData {
                sub_agent_id: "sub-7".into(),
                provider: "acp.claude".into(),
                content: "done".into(),
                segments: vec![],
                tool_calls: vec![],
                duration_ms: 5,
                performative: None,
            }),
        };
        let value = serde_json::to_value(&succeeded).expect("serialize");
        assert_eq!(value["ok"], json!(true));
        assert_eq!(value["data"]["subAgentId"], json!("sub-7"));
        assert_eq!(value["data"]["durationMs"], json!(5));
    }

    #[test]
    fn provider_info_default_is_available_and_keeps_mode_preference_order() {
        let absent = AcpProviderInfo::default();
        assert!(absent.modes.is_empty());
        assert!(absent.unavailable_reason.is_none());

        let info = AcpProviderInfo {
            modes: vec!["full-access".into(), "supervised".into()],
            unavailable_reason: Some("claude CLI not logged in".into()),
        };
        assert_eq!(info.modes, vec!["full-access", "supervised"]);
        assert_eq!(
            info.unavailable_reason.as_deref(),
            Some("claude CLI not logged in")
        );
        assert_eq!(AcpSession { id: "s-1".into() }.id, "s-1");
        assert_eq!(
            AcpApprovalRequest {
                tool: "shell".into(),
                args: json!({ "command": "rm -rf build" }),
                request_id: "req-1".into(),
            }
            .tool,
            "shell"
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────
// preview_tools
// ─────────────────────────────────────────────────────────────────────────
mod preview_tools {
    use jait_gateway::tools::preview_tools::{definition, metadata};
    use serde_json::Value;

    fn names() -> Vec<String> {
        metadata()
            .as_array()
            .expect("metadata array")
            .iter()
            .map(|tool| tool["name"].as_str().expect("name").to_string())
            .collect()
    }

    #[test]
    fn metadata_lists_seven_preview_tools_in_registry_order() {
        assert_eq!(
            names(),
            vec![
                "preview.start",
                "preview.open",
                "preview.stop",
                "preview.restart",
                "preview.status",
                "preview.logs",
                "preview.inspect",
            ]
        );
        let tools = metadata().as_array().expect("array");
        assert_eq!(tools.len(), 7);
        for tool in tools {
            assert!(tool["description"].as_str().is_some_and(|d| !d.is_empty()));
            assert_eq!(tool["parameters"]["type"], "object");
        }
    }

    #[test]
    fn definition_returns_matching_entry_and_panics_on_unknown_name() {
        assert_eq!(definition("preview.start")["name"], "preview.start");
        assert_eq!(definition("preview.inspect")["name"], "preview.inspect");

        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));
        let caught = std::panic::catch_unwind(|| definition("preview.nope"));
        std::panic::set_hook(previous);

        let payload = caught.expect_err("unknown tool must panic");
        let message = payload
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| payload.downcast_ref::<&str>().map(|s| s.to_string()))
            .expect("string panic payload");
        assert_eq!(message, "missing tool definition: preview.nope");
    }

    #[test]
    fn start_and_open_share_five_optional_session_arguments() {
        for tool_name in ["preview.start", "preview.open"] {
            let params = &definition(tool_name)["parameters"];
            let mut props: Vec<&str> = params["properties"]
                .as_object()
                .expect("properties")
                .keys()
                .map(String::as_str)
                .collect();
            props.sort();
            assert_eq!(
                props,
                vec!["command", "frameworkHint", "port", "projectRoot", "target"]
            );
            // TS declares no `required` key at all: every session argument is optional.
            assert!(params.get("required").is_none());
            assert_eq!(params["properties"]["port"]["type"], "number");
            assert_eq!(params["properties"]["command"]["type"], "string");
            assert_eq!(params["properties"]["target"]["type"], "string");
        }
    }

    #[test]
    fn logs_and_inspect_expose_stream_and_screenshot_arguments() {
        let logs = &definition("preview.logs")["parameters"];
        let mut log_props: Vec<&str> = logs["properties"]
            .as_object()
            .expect("properties")
            .keys()
            .map(String::as_str)
            .collect();
        log_props.sort();
        assert_eq!(log_props, vec!["sinceId", "stream"]);
        assert_eq!(logs["properties"]["sinceId"]["type"], "number");
        let stream_enum = logs["properties"]["stream"]["enum"]
            .as_array()
            .expect("stream enum");
        // Enum order is part of the schema the model sees.
        assert_eq!(
            stream_enum,
            &vec![
                serde_json::json!("stdout"),
                serde_json::json!("stderr"),
                serde_json::json!("system"),
                serde_json::json!("all"),
            ]
        );

        let inspect = &definition("preview.inspect")["parameters"];
        assert_eq!(inspect["properties"]["screenshot"]["type"], "boolean");
        // TS encodes the default in prose (no `default` keyword in the schema).
        assert!(inspect["properties"]["screenshot"].get("default").is_none());
        assert_eq!(
            inspect["properties"]["screenshot"]["description"],
            "Whether to include a base64 screenshot (default: false)"
        );

        // Session-less tools declare no arguments at all.
        for tool_name in ["preview.stop", "preview.restart", "preview.status"] {
            let params: &Value = &definition(tool_name)["parameters"];
            assert_eq!(
                params["properties"].as_object().map(|o| o.len()),
                Some(0),
                "{tool_name} must take no arguments"
            );
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
// project_tools
// ─────────────────────────────────────────────────────────────────────────
mod project_tools {
    use jait_gateway::tools::project_tools::{
        definition, metadata, tool_names, ProjectTools, ProjectToolsHost,
    };
    use serde_json::{json, Value};

    struct DummyHost;

    impl ProjectToolsHost for DummyHost {
        fn path_exists(&self, _node_id: &str, _path: &str) -> Result<Option<bool>, String> {
            Ok(None)
        }
        fn broadcast(&self, _user_id: &str, _event: &str, _payload: Value) {}
        fn assign_repository(
            &self,
            _project_id: &str,
            _repository_id: &str,
            _user_id: &str,
        ) -> Result<Option<String>, String> {
            Ok(None)
        }
    }

    fn entries() -> Vec<Value> {
        metadata().as_array().expect("metadata array").to_vec()
    }

    fn entry(name: &str) -> Value {
        entries()
            .into_iter()
            .find(|tool| tool["name"] == name)
            .unwrap_or_else(|| panic!("missing metadata for {name}"))
    }

    #[test]
    fn tool_names_and_metadata_registry_shape() {
        assert_eq!(
            tool_names(),
            vec![
                "project.create",
                "project.list",
                "project.assign_repository",
                "project.move",
                "project.transfer",
            ]
        );
        let all = entries();
        assert_eq!(all.len(), 5);
        for tool in &all {
            let object = tool.as_object().expect("object entry");
            for key in ["name", "description", "parameters", "risk", "consent"] {
                assert!(object.contains_key(key), "missing key {key} in {tool}");
            }
            assert!(tool["description"].as_str().is_some_and(|d| !d.is_empty()));
            assert!(tool["risk"].as_str().is_some_and(|r| !r.is_empty()));
            assert_eq!(tool["parameters"]["type"], "object");
        }
    }

    #[test]
    fn only_transfer_requires_consent() {
        assert_eq!(entry("project.transfer")["consent"], json!(true));
        for name in [
            "project.create",
            "project.list",
            "project.assign_repository",
            "project.move",
        ] {
            assert_eq!(entry(name)["consent"], json!(false), "{name}");
        }
    }

    #[test]
    fn definitions_pin_required_arguments() {
        let create = definition("project.create").expect("project.create definition");
        assert_eq!(create["name"], "project.create");
        assert_eq!(create["parameters"]["required"], json!(["title"]));
        assert!(create["parameters"]["properties"]["title"].is_object());

        let list = definition("project.list").expect("project.list definition");
        let mut list_props: Vec<&str> = list["parameters"]["properties"]
            .as_object()
            .expect("properties")
            .keys()
            .map(String::as_str)
            .collect();
        list_props.sort();
        assert_eq!(list_props, vec!["limit", "query"]);

        // Every declared tool resolves; unknown names return None (no panic).
        for name in tool_names() {
            assert_eq!(definition(&name).expect("definition").get("name"), Some(&json!(name)));
        }
        assert!(definition("project.nope").is_none());
    }

    #[test]
    fn unknown_tool_fails_with_registry_message() {
        let connection = rusqlite::Connection::open_in_memory().expect("in-memory db");
        let host = DummyHost;
        let tools = ProjectTools::new(&connection, &host);
        assert_eq!(
            tools.execute("project.nope", &json!({}), "user-1"),
            json!({ "ok": false, "message": "Unknown project tool: project.nope" })
        );
    }

    #[test]
    fn create_without_title_refuses_before_touching_the_store() {
        let connection = rusqlite::Connection::open_in_memory().expect("in-memory db");
        let host = DummyHost;
        let tools = ProjectTools::new(&connection, &host);
        // Missing and blank titles both refuse with the same message, proving
        // validation happens before any SQL runs (the schema does not exist).
        assert_eq!(
            tools.execute("project.create", &json!({ "description": "notes" }), "user-1"),
            json!({ "ok": false, "message": "title is required" })
        );
        assert_eq!(
            tools.execute("project.create", &json!({ "title": "   " }), "user-1"),
            json!({ "ok": false, "message": "title is required" })
        );
    }
}
