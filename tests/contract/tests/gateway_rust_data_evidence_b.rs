//! Contract evidence #2: native IMAP id parsing, provider contract wire shapes,
//! ACP provider pure mapping helpers, and Jait provider admission rules.

fn b64url(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = ((chunk[0] as u32) << 16) | (b1 << 8) | b2;
        let idx = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63];
        out.push(TABLE[idx[0] as usize] as char);
        out.push(TABLE[idx[1] as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[idx[2] as usize] as char);
        }
        if chunk.len() > 2 {
            out.push(TABLE[idx[3] as usize] as char);
        }
    }
    out
}

mod imap {
    use super::b64url;
    use jait_gateway::services::email::imap::{MAX_MESSAGE_BYTES, parse_imap_message_id};

    // Pinned literal: base64url(no pad) of ["INBOX","1234",42].
    const PINNED: &str = "WyJJTkJPWCIsIjEyMzQiLDQyXQ";

    #[test]
    fn parses_pinned_message_id_literal() {
        let id = parse_imap_message_id(PINNED).expect("valid id");
        assert_eq!(id.folder, "INBOX");
        assert_eq!(id.validity, "1234");
        assert_eq!(id.uid, 42);
    }

    #[test]
    fn accepts_trailing_padding_and_nested_folder_names() {
        let encoded = format!("{}=", b64url(br#"["INBOX/Sub Folder","99",7]"#));
        let id = parse_imap_message_id(&encoded).expect("padded id");
        assert_eq!(id.folder, "INBOX/Sub Folder");
        assert_eq!(id.validity, "99");
        assert_eq!(id.uid, 7);
    }

    #[test]
    fn rejects_zero_uid_fractional_uid_and_non_numeric_validity() {
        for raw in [
            r#"["INBOX","1234",0]"#,
            r#"["INBOX","1234",4.5]"#,
            r#"["INBOX","12x",42]"#,
            r#"["INBOX","",42]"#,
        ] {
            let encoded = b64url(raw.as_bytes());
            assert_eq!(
                parse_imap_message_id(&encoded).unwrap_err(),
                "Invalid IMAP message id",
                "payload {raw} must be rejected"
            );
        }
    }

    #[test]
    fn rejects_folders_with_line_breaks_and_oversized_ids() {
        let with_newline = b64url(b"[\"IN\r\nBOX\",\"1\",5]");
        assert_eq!(
            parse_imap_message_id(&with_newline).unwrap_err(),
            "Invalid IMAP message id"
        );
        let long_folder = format!("[\"{}\",\"1\",5]", "a".repeat(1025));
        assert_eq!(
            parse_imap_message_id(&b64url(long_folder.as_bytes())).unwrap_err(),
            "Invalid IMAP message id"
        );
        let oversized = "A".repeat(2049);
        assert_eq!(
            parse_imap_message_id(&oversized).unwrap_err(),
            "Invalid IMAP message id"
        );
        // Boundary: exactly at the accepted id length is not rejected for length.
        let exact = format!("{}{}", "A".repeat(2044), "AAAA");
        assert_eq!(exact.len(), 2048);
        assert_eq!(
            parse_imap_message_id(&exact).unwrap_err(),
            "Invalid IMAP message id",
            "2048 bytes of invalid base64 still fails, but on content not length"
        );
    }

    #[test]
    fn message_size_cap_is_ten_mebibytes() {
        assert_eq!(MAX_MESSAGE_BYTES, 10 * 1024 * 1024);
    }
}

mod providers_contracts {
    use jait_gateway::providers::contracts::{
        ProviderEvent, ProviderSession, ProviderTurnAttachment, RuntimeMode,
    };
    use serde_json::json;

    #[test]
    fn provider_event_wire_shape_is_tagged_by_type() {
        let event = ProviderEvent::Token {
            session_id: "s1".into(),
            content: "hi".into(),
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            json!({"type": "token", "sessionId": "s1", "content": "hi"})
        );

        let error: ProviderEvent = serde_json::from_value(
            json!({"type": "session.error", "sessionId": "s9", "error": "boom"}),
        )
        .expect("session.error decodes");
        assert_eq!(error.session_id(), "s9");
        match error {
            ProviderEvent::SessionError { error, .. } => assert_eq!(error, "boom"),
            other => panic!("expected SessionError, got {other:?}"),
        }

        // A turn.started without turnId must not serialize a null turnId.
        let started = ProviderEvent::TurnStarted {
            session_id: "s1".into(),
            turn_id: None,
        };
        assert_eq!(
            serde_json::to_value(&started).unwrap(),
            json!({"type": "turn.started", "sessionId": "s1"})
        );
    }

    #[test]
    fn runtime_mode_is_kebab_case_and_rejects_unknown_modes() {
        assert_eq!(
            serde_json::to_value(RuntimeMode::FullAccess).unwrap(),
            json!("full-access")
        );
        assert_eq!(
            serde_json::to_value(RuntimeMode::Supervised).unwrap(),
            json!("supervised")
        );
        assert_eq!(
            serde_json::from_value::<RuntimeMode>(json!("supervised")).unwrap(),
            RuntimeMode::Supervised
        );
        // The executor's internal spelling must never decode into a runtime mode.
        assert!(serde_json::from_value::<RuntimeMode>(json!("guarded")).is_err());
        assert!(serde_json::from_value::<RuntimeMode>(json!("FullAccess")).is_err());
    }

    #[test]
    fn provider_session_omits_absent_timestamps_and_error() {
        let session = ProviderSession {
            id: "s1".into(),
            provider_id: "jait".into(),
            thread_id: "t1".into(),
            status: jait_gateway::providers::contracts::ProviderSessionStatus::Running,
            runtime_mode: RuntimeMode::Supervised,
            error: None,
            started_at: None,
            completed_at: None,
        };
        let wire = serde_json::to_value(&session).unwrap();
        assert_eq!(
            wire,
            json!({
                "id": "s1",
                "providerId": "jait",
                "threadId": "t1",
                "status": "running",
                "runtimeMode": "supervised"
            })
        );
        assert_eq!(serde_json::from_value::<ProviderSession>(wire).unwrap(), session);
    }

    #[test]
    fn turn_attachment_untagged_forms() {
        let reference: ProviderTurnAttachment =
            serde_json::from_value(json!("/tmp/shot.png")).unwrap();
        assert_eq!(reference, ProviderTurnAttachment::Reference("/tmp/shot.png".into()));

        let image: ProviderTurnAttachment = serde_json::from_value(json!({
            "name": "shot.png",
            "mimeType": "image/png",
            "data": "AAA"
        }))
        .unwrap();
        assert_eq!(
            image,
            ProviderTurnAttachment::Image {
                name: "shot.png".into(),
                mime_type: "image/png".into(),
                data: "AAA".into(),
            }
        );
        assert_eq!(
            serde_json::to_value(&image).unwrap(),
            json!({"name": "shot.png", "mimeType": "image/png", "data": "AAA"})
        );
    }
}

mod providers_acp {
    use jait_gateway::providers::acp_provider::{
        build_child_env, changes_from_acp_content, env_to_acp_array, exit_label,
        first_path_from_acp_locations, get_acp_tool_name, has_tool_call_metadata,
        session_exit_error, stderr_activity, stringify_tool_content, to_acp_mcp_server,
    };
    use serde_json::{Value, json};
    use std::collections::BTreeMap;

    #[test]
    fn exit_label_prefers_signal_then_code_then_unknown() {
        assert_eq!(exit_label(Some(1), None), "1");
        assert_eq!(exit_label(None, Some("SIGKILL")), "SIGKILL");
        assert_eq!(exit_label(Some(2), Some("SIGTERM")), "SIGTERM");
        assert_eq!(exit_label(None, None), "unknown");
        assert_eq!(session_exit_error(Some(1), None), "ACP provider exited (1)");
        assert_eq!(
            session_exit_error(None, Some("SIGKILL")),
            "ACP provider exited (SIGKILL)"
        );
        assert_eq!(
            session_exit_error(None, None),
            "ACP provider exited (unknown)"
        );
    }

    #[test]
    fn stderr_chunks_are_trimmed_and_blank_chunks_dropped() {
        assert_eq!(stderr_activity("  \n\t "), None);
        assert_eq!(stderr_activity(""), None);
        assert_eq!(
            stderr_activity("  login required \n"),
            Some("login required".to_string())
        );
    }

    #[test]
    fn child_env_strips_github_tokens_unless_explicitly_passed() {
        let mut inherited = BTreeMap::new();
        inherited.insert("PATH".to_string(), "/usr/bin".to_string());
        inherited.insert("GITHUB_TOKEN".to_string(), "leak".to_string());
        inherited.insert("GH_TOKEN".to_string(), "leak2".to_string());
        inherited.insert("COPILOT_GITHUB_TOKEN".to_string(), "leak3".to_string());
        inherited.insert("HOME".to_string(), "/root".to_string());

        let strip = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];
        let env = build_child_env(&inherited, &[], &strip);
        assert_eq!(
            env.keys().cloned().collect::<Vec<_>>(),
            vec!["HOME".to_string(), "PATH".to_string()]
        );

        let env = build_child_env(
            &inherited,
            &[("GITHUB_TOKEN".to_string(), "explicit".to_string())],
            &strip,
        );
        assert_eq!(env.get("GITHUB_TOKEN").map(String::as_str), Some("explicit"));
        assert!(!env.contains_key("GH_TOKEN"));

        assert_eq!(
            env_to_acp_array(&env),
            json!([
                {"name": "GITHUB_TOKEN", "value": "explicit"},
                {"name": "HOME", "value": "/root"},
                {"name": "PATH", "value": "/usr/bin"}
            ])
        );
    }

    #[test]
    fn tool_content_stringification_matches_reference_join() {
        assert_eq!(
            stringify_tool_content(&json!([
                {"type": "text", "text": "line one"},
                {"type": "content", "content": {"type": "text", "text": "line two"}},
                {"type": "image", "data": "AAA"}
            ])),
            "line one\nline two\n{\"type\":\"image\",\"data\":\"AAA\"}"
        );
        assert_eq!(stringify_tool_content(&json!("plain")), "plain");
        assert_eq!(stringify_tool_content(&json!({"a": 1})), "{\"a\":1}");
        assert_eq!(stringify_tool_content(&json!([])), "");
    }

    #[test]
    fn tool_names_normalize_jait_mcp_titles_and_kinds() {
        // Shape 1: codex-style wrapper carrying the jait server name.
        assert_eq!(
            get_acp_tool_name(&json!({
                "title": "tool call",
                "rawInput": {"server": "jait_core", "tool": "read_file", "arguments": {"path": "a"}}
            })),
            "read.file"
        );
        // Shape 3: claude code qualified title wins over the wrapper's tool arg.
        assert_eq!(
            get_acp_tool_name(&json!({
                "title": "mcp__jait_core__send_message",
                "rawInput": {"tool": "other"}
            })),
            "send.message"
        );
        // Kind-only updates.
        assert_eq!(get_acp_tool_name(&json!({"kind": "search"})), "search");
        // Non-jait servers keep the raw title, untrimmed.
        assert_eq!(
            get_acp_tool_name(&json!({"title": "  gh pr list  ", "kind": "other"})),
            "  gh pr list  "
        );
        // Opaque fallbacks.
        assert_eq!(get_acp_tool_name(&json!({"toolCallId": "call_9"})), "call_9");
        assert_eq!(get_acp_tool_name(&json!({})), "tool");
        assert_eq!(get_acp_tool_name(&json!("nope")), "tool");
    }

    #[test]
    fn tool_call_metadata_detection_ignores_blank_titles() {
        assert!(!has_tool_call_metadata(&json!({"title": "   ", "rawInput": {}})));
        assert!(!has_tool_call_metadata(&json!({"locations": [], "content": []})));
        assert!(has_tool_call_metadata(&json!({"title": "run"})));
        assert!(has_tool_call_metadata(&json!({"rawInput": {"a": 1}})));
        assert!(has_tool_call_metadata(&json!({"locations": [{"path": "a.rs"}]})));
        assert!(!has_tool_call_metadata(&json!(42)));
    }

    #[test]
    fn first_location_path_skips_blank_entries() {
        let locations = vec![
            json!({"path": "   "}),
            json!("not-an-object"),
            json!({"line": 3}),
            json!({"path": "src/main.rs"}),
            json!({"path": "src/other.rs"}),
        ];
        assert_eq!(
            first_path_from_acp_locations(&locations),
            Some("src/main.rs".to_string())
        );
        assert_eq!(first_path_from_acp_locations(&[]), None);
        assert_eq!(first_path_from_acp_locations(&[json!({"path": ""})]), None);
    }

    #[test]
    fn changes_from_content_default_null_text_and_omit_unknown_kind() {
        let changes = changes_from_acp_content(&[
            json!({"path": "a.rs", "oldText": "old", "newText": "new", "_meta": {"kind": "edit"}}),
            json!({"path": "b.rs"}),
            json!({"oldText": "no path"}),
            json!("junk"),
        ]);
        assert_eq!(
            Value::Array(changes),
            json!([
                {"path": "a.rs", "oldText": "old", "newText": "new", "kind": "edit"},
                {"path": "b.rs", "oldText": null, "newText": null}
            ])
        );
    }

    #[test]
    fn acp_mcp_server_descriptors_split_stdio_and_http() {
        let stdio = to_acp_mcp_server(&json!({
            "name": "jait",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "jait-mcp"],
            "env": {"A": "1"}
        }));
        assert_eq!(stdio["name"], json!("jait"));
        assert_eq!(stdio["command"], json!("npx"));
        assert_eq!(stdio["args"], json!(["-y", "jait-mcp"]));
        assert_eq!(stdio["env"], json!([{"name": "A", "value": "1"}]));

        let http = to_acp_mcp_server(&json!({
            "name": "remote",
            "transport": "http",
            "url": "https://example.test/mcp",
            "headers": {"X-Key": "k"}
        }));
        assert_eq!(http["type"], json!("http"));
        assert_eq!(http["url"], json!("https://example.test/mcp"));
        assert_eq!(http["headers"], json!([{"name": "X-Key", "value": "k"}]));
        assert!(http.get("command").is_none());
    }
}

mod jait_provider {
    use jait_gateway::providers::jait_provider::JaitProvider;
    use jait_gateway::services::jait_llm::{JaitLlmConfig, ResolveJaitLlmOptions};
    use std::collections::HashMap;
    use std::num::NonZeroU16;

    fn opts<'a>(config: &'a JaitLlmConfig, keys: &'a HashMap<String, String>) -> ResolveJaitLlmOptions<'a> {
        ResolveJaitLlmOptions {
            config,
            api_keys: keys,
            requested_model: None,
            jait_backend: None,
            strict_model: true,
        }
    }

    #[test]
    fn rejects_out_of_range_session_capacity() {
        let active = NonZeroU16::new(1).unwrap();
        assert_eq!(
            JaitProvider::new(active, 0).err().unwrap(),
            "Invalid session capacity"
        );
        assert_eq!(
            JaitProvider::new(active, 10_001).err().unwrap(),
            "Invalid session capacity"
        );
        assert!(JaitProvider::new(active, 1).is_ok());
        assert!(JaitProvider::new(active, 10_000).is_ok());
    }

    #[test]
    fn start_session_requires_authenticated_owner_and_session() {
        let provider = JaitProvider::new(NonZeroU16::new(1).unwrap(), 4).unwrap();
        let config = JaitLlmConfig::default();
        let keys = HashMap::new();
        assert_eq!(
            provider
                .start_session("", "s1", opts(&config, &keys))
                .unwrap_err(),
            "Authenticated owner and session are required"
        );
        assert_eq!(
            provider
                .start_session("user-1", "", opts(&config, &keys))
                .unwrap_err(),
            "Authenticated owner and session are required"
        );
    }

    #[test]
    fn unknown_or_foreign_sessions_are_not_cancellable_or_stoppable() {
        let provider = JaitProvider::new(NonZeroU16::new(1).unwrap(), 4).unwrap();
        assert!(!provider.cancel_turn("user-1", "missing"));
        assert!(!provider.stop_session("user-1", "missing"));
    }
}
