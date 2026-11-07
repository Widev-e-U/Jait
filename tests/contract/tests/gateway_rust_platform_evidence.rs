//! Consumer-level contract tests for the NATIVE Rust implementations of migrated
//! TypeScript gateway components (platform cluster).
//!
//! Every expectation below is transcribed from the TypeScript reference under
//! `packages/gateway/src/...`; the native code is only *observed*, never relaxed.

// ---------------------------------------------------------------------------
// evaluation/agent-eval.ts  ->  evaluation/agent_eval.rs
// ---------------------------------------------------------------------------
mod evaluation_agent_eval {
    use jait_gateway::evaluation::agent_eval::{EventParser, parse_suite};
    use serde_json::json;

    #[test]
    fn rejects_unknown_version() {
        let err =
            parse_suite(json!({"version": 2, "tasks": []})).expect_err("version 2 unsupported");
        assert!(err.contains("version"), "unexpected error: {err}");
        let err = parse_suite(json!({"tasks": []})).expect_err("missing version rejected");
        assert!(err.contains("version"), "unexpected error: {err}");
    }

    #[test]
    fn parses_valid_suite_with_defaults() {
        let suite = parse_suite(json!({
            "version": 1,
            "tasks": [{
                "id": "t1",
                "title": "T",
                "prompt": "p",
                "fixtures": {"a/b.txt": "hello"},
                "checks": [{"type": "command", "executable": "echo", "args": ["hi"]}],
                "rubric": ["mentions hi"]
            }]
        }))
        .expect("valid suite must parse");
        assert_eq!(suite.version, 1);
        assert_eq!(suite.tasks.len(), 1);
        assert_eq!(suite.tasks[0].id, "t1");
        assert_eq!(suite.tasks[0].checks.len(), 1);
        let debug = format!("{:?}", suite.tasks[0].checks[0]);
        assert!(
            debug.contains("echo"),
            "command executable must survive: {debug}"
        );
    }

    #[test]
    fn json_check_requires_equals_field() {
        let err = parse_suite(json!({
            "version": 1,
            "tasks": [{"id": "t1", "title": "T", "prompt": "p", "fixtures": {}, "checks": [{"type": "json", "path": "a.b"}]}]
        }))
        .expect_err("json check without equals must be rejected");
        assert!(err.contains("equals"), "unexpected error: {err}");
    }

    #[test]
    fn rejects_duplicate_task_ids() {
        let err = parse_suite(json!({
            "version": 1,
            "tasks": [
                {"id": "dup", "title": "T", "prompt": "p", "fixtures": {}, "checks": [{"type": "command", "executable": "x", "args": []}], "rubric": ["r"]},
                {"id": "dup", "title": "T", "prompt": "p", "fixtures": {}, "checks": [{"type": "command", "executable": "x", "args": []}], "rubric": ["r"]}
            ]
        }))
        .expect_err("duplicate ids must be rejected");
        assert!(err.contains("Duplicate task id"), "unexpected error: {err}");
    }

    #[test]
    fn rejects_path_traversal_in_fixture_paths() {
        let payload = json!({
            "version": 1,
            "tasks": [{
                "id": "t1",
                "title": "T",
                "prompt": "p",
                "fixtures": {"../escape.txt": "x"},
                "checks": [{"type": "command", "executable": "x", "args": []}],
                "rubric": ["r"]
            }]
        });
        let err = parse_suite(payload).expect_err("traversal fixture path must be rejected");
        assert!(!err.is_empty());
        // TS `relativePath`: absolute paths, backslashes and empty/"."/".." segments are
        // rejected, but a nested relative path is legal.
        for bad in [
            "./a.txt",
            "a//b.txt",
            "a/./b.txt",
            "/abs.txt",
            "C:/x.txt",
            "a\\b.txt",
        ] {
            let payload = json!({
                "version": 1,
                "tasks": [{"id": "t1", "title": "T", "prompt": "p",
                           "fixtures": {bad: "x"},
                           "checks": [{"type": "command", "executable": "x", "args": []}],
                           "rubric": ["r"]}]
            });
            assert!(
                parse_suite(payload).is_err(),
                "fixture path {bad:?} must be rejected"
            );
        }
        let ok = parse_suite(json!({
            "version": 1,
            "tasks": [{"id": "t1", "title": "T", "prompt": "p",
                       "fixtures": {"a/b.txt": "x"},
                       "checks": [{"type": "command", "executable": "x", "args": []}],
                       "rubric": ["r"]}]
        }))
        .expect("nested relative fixture path stays legal");
        assert_eq!(ok.tasks.len(), 1);
    }

    #[test]
    fn task_id_regex_and_non_empty_lists_are_enforced() {
        // TS `id: /^[a-z0-9][a-z0-9-]{0,63}$/`, `rubric.min(1)`, `checks.min(1)`.
        for bad_id in ["", "Upper", "-lead", "a_b", "a b"] {
            let payload = json!({
                "version": 1,
                "tasks": [{"id": bad_id, "title": "T", "prompt": "p", "fixtures": {},
                           "checks": [{"type": "command", "executable": "x", "args": []}],
                           "rubric": ["r"]}]
            });
            assert!(
                parse_suite(payload).is_err(),
                "task id {bad_id:?} must be rejected"
            );
        }
        let long_id = "a".repeat(65);
        let payload = json!({
            "version": 1,
            "tasks": [{"id": long_id, "title": "T", "prompt": "p", "fixtures": {},
                       "checks": [{"type": "command", "executable": "x", "args": []}],
                       "rubric": ["r"]}]
        });
        assert!(
            parse_suite(payload).is_err(),
            "65-character task id must be rejected"
        );

        for payload in [
            json!({"version": 1, "tasks": [{"id": "t1", "title": "T", "prompt": "p",
                "fixtures": {}, "checks": [], "rubric": ["r"]}]}),
            json!({"version": 1, "tasks": [{"id": "t1", "title": "T", "prompt": "p",
                "fixtures": {}, "checks": [{"type": "command", "executable": "x", "args": []}],
                "rubric": []}]}),
            json!({"version": 1, "tasks": []}),
            json!({"version": 1, "tasks": [{"id": "t1", "title": "T", "prompt": "p",
                "fixtures": {}, "checks": [{"type": "command", "executable": "x", "args": []}],
                "rubric": ["r"], "extra": 1}]}),
        ] {
            assert!(
                parse_suite(payload.clone()).is_err(),
                "must reject {payload}"
            );
        }
    }

    #[test]
    fn stream_parser_handles_partial_lines_and_sentinel() {
        let mut parser = EventParser::default();
        assert!(
            parser
                .push("data: {\"ty", false)
                .expect("partial chunk is not an error")
                .is_empty()
        );
        let events = parser
            .push("pe\":\"delta\"}\n", false)
            .expect("completing chunk parses");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["type"], "delta");
        let done = parser
            .push("data: {\"type\":\"delta\"}\r\ndata: [DONE]\n", false)
            .expect("sentinel line is skipped");
        assert_eq!(done.len(), 1);
        assert_eq!(done[0]["type"], "delta");
        assert!(
            parser
                .push(": keepalive\n", false)
                .expect("comment line skipped")
                .is_empty()
        );
        assert!(parser.push("data: {not json}\n", false).is_err());
    }
}

// ---------------------------------------------------------------------------
// voice/service.ts  ->  voice/mod.rs
// ---------------------------------------------------------------------------
mod voice_service {
    use jait_gateway::voice::{StatePatch, VoiceService};

    #[test]
    fn default_session_state_matches_ts_shape() {
        let mut svc = VoiceService::new(64);
        let state = svc.state("s1").expect("session");
        let v = serde_json::to_value(state).expect("state serialises");
        assert_eq!(v["sessionId"], "s1");
        assert_eq!(v["wakeWordEnabled"], true);
        assert_eq!(v["talkModeEnabled"], false);
        assert_eq!(v["listening"], false);
        assert!(
            v.get("lastTranscriptAt").is_none(),
            "fresh session has no transcript"
        );
    }

    #[test]
    fn wake_word_arms_listening_only_when_enabled() {
        let mut svc = VoiceService::new(64);
        let armed = svc
            .transcribe(
                "s1",
                Some("Hey Jait, what is up?"),
                None,
                "2024-01-01T00:00:00Z",
            )
            .expect("wake transcript accepted");
        assert!(
            armed.wake_word_detected,
            "wake word must match case-insensitively"
        );
        assert!(armed.sent_to_agent);
        assert!(
            svc.state("s1").expect("session").listening,
            "enabled wake word must start listening"
        );

        svc.update(
            "s2",
            StatePatch {
                wake_word_enabled: Some(false),
                ..Default::default()
            },
        );
        let muted = svc
            .transcribe("s2", Some("Hey Jait"), None, "2024-01-01T00:00:00Z")
            .expect("muted session still transcribes");
        assert_eq!(muted.text, "Hey Jait");
        assert!(
            !svc.state("s2").expect("session").listening,
            "disabled wake word must never arm listening"
        );
    }

    #[test]
    fn blank_transcript_is_not_sent_to_agent() {
        let mut svc = VoiceService::new(64);
        let result = svc
            .transcribe("s1", Some("   \n\t "), None, "2024-01-01T00:00:00Z")
            .expect("blank ok");
        assert_eq!(result.text, "");
        assert!(!result.sent_to_agent);
        assert!(!result.wake_word_detected);
        assert!(!svc.state("s1").expect("session").listening);
        let v = serde_json::to_value(svc.state("s1").expect("session")).expect("state serialises");
        assert!(
            v.get("lastTranscriptAt").is_none(),
            "blank transcript must not stamp lastTranscriptAt"
        );
    }

    #[test]
    fn session_capacity_and_id_length_are_enforced() {
        let mut svc = VoiceService::new(1);
        svc.transcribe("a", Some("hi"), None, "2024-01-01T00:00:00Z")
            .expect("first session allowed");
        assert_eq!(
            svc.transcribe("b", Some("hi"), None, "2024-01-01T00:00:00Z")
                .unwrap_err(),
            "Voice session capacity reached"
        );
        let mut svc = VoiceService::new(64);
        let too_long = "x".repeat(513);
        assert_eq!(
            svc.transcribe(&too_long, Some("hi"), None, "2024-01-01T00:00:00Z")
                .unwrap_err(),
            "Voice session id too long"
        );
    }

    #[test]
    fn oversized_transcript_is_refused() {
        let mut svc = VoiceService::new(64);
        let huge = "a".repeat(256 * 1024 + 1);
        assert_eq!(
            svc.transcribe("s1", Some(&huge), None, "2024-01-01T00:00:00Z")
                .unwrap_err(),
            "Voice transcript too large"
        );
        let state =
            serde_json::to_value(svc.state("s1").expect("session")).expect("state serialises");
        assert_eq!(state["sessionId"], "s1");
    }
}

// ---------------------------------------------------------------------------
// surfaces/terminal.ts  ->  surfaces/terminal_output.rs
// ---------------------------------------------------------------------------
mod surfaces_terminal {
    use jait_gateway::surfaces::terminal_output::terminal_output_slice;

    fn buffer() -> Vec<String> {
        ["a", "b", "c", "d", "e"]
            .iter()
            .map(|s| s.to_string())
            .collect()
    }

    #[test]
    fn absolute_offsets_select_the_requested_range() {
        // TS: chunks join with no separator, then because the slice starts at the
        // buffer's offset (not past it) the partial line preceding the offset is
        // prepended -> "a" + "bc".
        let out = terminal_output_slice(&buffer(), 5, 1.0, Some(3.0), f64::NAN, true);
        assert_eq!(out, "abc", "chunks concat + partial-line reconnect prefix");
    }

    #[test]
    fn evicted_prefix_shifts_absolute_offsets() {
        let evicted: Vec<String> = ["c", "d", "e"].iter().map(|s| s.to_string()).collect();
        assert_eq!(
            terminal_output_slice(&evicted, 5, 0.0, Some(4.0), f64::NAN, true),
            "cd"
        );
        assert_eq!(
            terminal_output_slice(&evicted, 5, 3.0, None, f64::NAN, true),
            "cde"
        );
    }

    #[test]
    fn unbounded_ranges_honour_line_cap_and_bounded_ranges_ignore_it() {
        assert_eq!(
            terminal_output_slice(&buffer(), 5, 0.0, None, 2.0, true),
            "de"
        );
        assert_eq!(
            terminal_output_slice(&buffer(), 5, 0.0, Some(5.0), 2.0, true),
            "abcde",
            "bounded end ignores the line cap"
        );
    }

    #[test]
    fn partial_first_line_prepends_buffer_prefix() {
        let chunks = vec!["first\npart".to_string(), "ial".to_string()];
        assert_eq!(
            terminal_output_slice(&chunks, 2, 1.0, Some(2.0), f64::NAN, true),
            "partial"
        );
    }

    #[test]
    fn done_marker_truncates_only_when_trim_requested() {
        let chunks = vec!["a\u{1b}]633;Dtail".to_string()];
        assert_eq!(
            terminal_output_slice(&chunks, 1, 0.0, None, f64::NAN, true),
            "a"
        );
        assert_eq!(
            terminal_output_slice(&chunks, 1, 0.0, None, f64::NAN, false),
            "a\u{1b}]633;Dtail"
        );
    }
}

// ---------------------------------------------------------------------------
// security/sandbox-manager.ts  ->  security/sandbox_manager.rs
// ---------------------------------------------------------------------------
mod security_sandbox_manager {
    use jait_gateway::security::sandbox_manager::SandboxKind;

    /// TS parses `JAIT_MAX_BROWSER_SANDBOXES` with `Number.parseInt` semantics and
    /// falls back to the per-kind default for anything unusable.
    #[test]
    fn max_active_uses_parse_int_semantics() {
        assert_eq!(SandboxKind::Browser.max_active(Some("3")), 3.0);
        assert_eq!(SandboxKind::Browser.max_active(Some("+5")), 5.0);
        assert_eq!(SandboxKind::Browser.max_active(Some("3junk")), 3.0);
        assert_eq!(SandboxKind::Browser.max_active(Some("2.9")), 2.0);
    }

    /// Defaults and invalid values fall back per kind (browser 2, others 1).
    #[test]
    fn defaults_and_invalid_values_fall_back_per_kind() {
        assert_eq!(SandboxKind::Browser.max_active(None), 2.0);
        assert_eq!(SandboxKind::Browser.max_active(Some("")), 2.0);
        assert_eq!(SandboxKind::Browser.max_active(Some("abc")), 2.0);
        assert_eq!(SandboxKind::Browser.max_active(Some("0")), 2.0);
        assert_eq!(SandboxKind::LinuxDesktop.max_active(None), 1.0);
        assert_eq!(SandboxKind::Browser.max_active(Some("-2")), 2.0);
    }

    /// Browser launches default to `mountMode ?? "read-only"` (TS lines 509/807)
    /// with networking enabled, while `MountMode` itself defaults to read-write
    /// for command sessions; `--add-host` renders `host-gateway` verbatim.
    #[test]
    fn browser_defaults_are_read_only_with_network_and_host_gateway_literal() {
        use jait_gateway::security::sandbox_manager::{
            BrowserHostGateway, BrowserOptions, MountMode,
        };

        let options = BrowserOptions::new("/repo".to_string());
        assert_eq!(options.project_root, "/repo");
        assert_eq!(
            options.mount_mode,
            MountMode::ReadOnly,
            "browser preview is read-only by default"
        );
        assert!(
            options.network_enabled,
            "preview browser keeps networking unless explicitly disabled"
        );
        assert_eq!(
            MountMode::default(),
            MountMode::ReadWrite,
            "generic command sessions default to read-write"
        );
        assert_eq!(BrowserHostGateway::HostGateway.to_string(), "host-gateway");
        assert_eq!(
            BrowserHostGateway::Address("10.0.0.5".parse().expect("ip literal")).to_string(),
            "10.0.0.5"
        );
    }
}

// ---------------------------------------------------------------------------
// lib/security/host-software.ts  ->  security/host_software.rs
// ---------------------------------------------------------------------------
mod lib_security_host_software {
    use jait_gateway::security::host_software::{is_gateway_address, parse_telemetry};

    #[test]
    fn gateway_address_is_loopback_or_listed_local_address() {
        assert!(is_gateway_address("127.0.0.1", &[]));
        assert!(is_gateway_address("::1", &[]));
        assert!(is_gateway_address("localhost", &[]));
        let locals = vec!["10.0.0.5".to_string()];
        assert!(is_gateway_address("10.0.0.5", &locals));
        assert!(
            !is_gateway_address("10.0.0.9", &locals),
            "unlisted address is not the gateway"
        );
        assert!(
            !is_gateway_address("localhost:8787", &locals),
            "authority form does not match the bare-address comparison"
        );
    }

    #[test]
    fn telemetry_import_is_bounded() {
        let huge = "x".repeat(65537);
        let err = parse_telemetry(&huge, "suricata", &[]).expect_err("oversized import refused");
        assert!(err.to_string().contains("65536"), "got {err}");
    }

    #[test]
    fn telemetry_import_labels_engine_and_keeps_raw() {
        let result = parse_telemetry("", "suricata", &[]).expect("empty import accepted");
        assert_eq!(result.engine, "suricata-import");
        assert_eq!(result.engine_version, "reported-version-unknown");
        assert_eq!(result.raw.as_deref(), Some(""));
        assert!(result.conclusive);
        let ndjson = parse_telemetry(
            "{\"dest_ip\":\"10.0.0.5\"}\n\n",
            "suricata",
            &["10.0.0.5".to_string()],
        )
        .expect("ndjson accepted");
        assert_eq!(ndjson.engine, "suricata-import");
        assert!(ndjson.conclusive);
    }

    #[test]
    fn telemetry_import_rejects_unparseable_events() {
        let err =
            parse_telemetry("{not json}\n", "suricata", &[]).expect_err("invalid event refused");
        assert!(err.to_string().contains("is not valid JSON"), "got {err}");
    }
}

// ---------------------------------------------------------------------------
// lib/security/engines.ts  ->  security/engines.rs
// ---------------------------------------------------------------------------
mod lib_security_engines {
    use jait_gateway::security::engines::{parse_nuclei, parse_trivy};

    #[test]
    fn nuclei_rejects_non_url_targets() {
        let err = parse_nuclei("", "not-a-url", "3.1.0").expect_err("bad target refused");
        assert!(
            err.to_string().contains("Nuclei target is not a valid URL"),
            "got {err}"
        );
        assert!(
            parse_nuclei("", "ftp://example.test/x", "3.1.0").is_ok(),
            "TS oracle: new URL() accepts any scheme, only unparseable targets throw"
        );
    }

    #[test]
    fn nuclei_rejects_oversized_output() {
        let huge = "x".repeat(9 * 1024 * 1024);
        let err =
            parse_nuclei(&huge, "https://example.test", "3.1.0").expect_err("oversized refused");
        assert!(
            err.to_string().contains("Oversized Nuclei output"),
            "got {err}"
        );
    }

    #[test]
    fn trivy_rejects_unsupported_json() {
        let err = parse_trivy("not json", "example.test", "0.50.1").expect_err("garbage refused");
        assert!(
            err.to_string().contains("Unsupported Trivy JSON"),
            "got {err}"
        );
        let err = parse_trivy("{\"SchemaVersion\":9}", "example.test", "0.50.1")
            .expect_err("unknown schema refused");
        assert!(
            err.to_string().contains("Unsupported Trivy JSON"),
            "got {err}"
        );
    }

    #[test]
    fn trivy_rejects_oversized_output() {
        let huge = "x".repeat(9 * 1024 * 1024);
        let err = parse_trivy(&huge, "example.test", "0.50.1").expect_err("oversized refused");
        assert!(
            err.to_string().contains("Oversized Trivy output"),
            "got {err}"
        );
    }
}

// ---------------------------------------------------------------------------
// clawhub/client.ts  ->  integrations/clawhub.rs
// ---------------------------------------------------------------------------
mod clawhub_client {
    use jait_gateway::integrations::clawhub::validate_slug;

    /// TS slug rule: 1..=128 chars of `[A-Za-z0-9_-]`, no leading dot.
    #[test]
    fn valid_slugs_are_accepted() {
        for slug in ["hello", "hello-world_2", "A1", "a-b_c"] {
            assert!(
                validate_slug(slug).is_ok(),
                "slug {slug:?} should be accepted"
            );
        }
    }

    /// Security-critical negatives: traversal, separators and leading dots are
    /// rejected before any filesystem write happens.
    #[test]
    fn traversal_and_separator_slugs_are_rejected() {
        for slug in [
            "../etc/passwd",
            "a/b",
            "a\\b",
            ".hidden",
            "..",
            "/abs",
            "a b",
            "a.b",
        ] {
            assert!(
                validate_slug(slug).is_err(),
                "slug {slug:?} must be rejected"
            );
        }
    }

    #[test]
    fn empty_and_overlong_slugs_are_rejected() {
        assert!(validate_slug("").is_err(), "empty slug must be rejected");
        let long = "a".repeat(129);
        assert!(
            validate_slug(&long).is_err(),
            "129-char slug must be rejected"
        );
        let ok = "a".repeat(128);
        assert!(validate_slug(&ok).is_ok(), "128-char slug is the limit");
    }
}

// ---------------------------------------------------------------------------
// plugins/manager.ts  ->  plugins/manifest.rs (+ manager.rs discovery)
// ---------------------------------------------------------------------------
mod plugins_manager {
    use jait_gateway::plugins::manifest::validate_manifest;
    use serde_json::json;

    fn valid_manifest() -> serde_json::Value {
        json!({
            "id": "demo",
            "displayName": "Demo",
            "version": "1.0.0",
            "main": "index.js"
        })
    }

    #[test]
    fn accepts_minimal_valid_manifest() {
        assert_eq!(validate_manifest(&valid_manifest()), None);
        assert_eq!(
            validate_manifest(&json!({"id": "@scope/pkg", "displayName": "S", "version": "0.0.1"})),
            None,
            "scoped ids stay legal"
        );
    }

    #[test]
    fn rejects_invalid_ids_including_traversal() {
        for id in ["", "../escape", "a/b", "..", "a b", "-lead"] {
            let mut manifest = valid_manifest();
            manifest["id"] = json!(id);
            let message = validate_manifest(&manifest).expect("invalid id must be rejected");
            assert!(
                message.contains("id"),
                "id {id:?} produced unexpected message: {message}"
            );
        }
    }

    #[test]
    fn rejects_missing_display_name() {
        let mut manifest = valid_manifest();
        manifest
            .as_object_mut()
            .expect("object")
            .remove("displayName");
        let message = validate_manifest(&manifest).expect("missing displayName rejected");
        assert!(
            message.contains("displayName"),
            "unexpected message: {message}"
        );
    }

    #[test]
    fn rejects_non_string_version() {
        let mut manifest = valid_manifest();
        manifest["version"] = json!(1);
        assert!(
            validate_manifest(&manifest).is_some(),
            "numeric version must be rejected"
        );
        let mut manifest = valid_manifest();
        manifest["version"] = json!("");
        assert!(
            validate_manifest(&manifest).is_some(),
            "empty version must be rejected"
        );
    }
}

// ---------------------------------------------------------------------------
// plugins/openclaw-adapter.ts  ->  plugins/openclaw_adapter.rs
// ---------------------------------------------------------------------------
mod plugins_openclaw_adapter {
    use jait_gateway::plugins::openclaw_adapter::to_jait_manifest;
    use serde_json::json;

    #[test]
    fn converts_minimal_manifest_with_namespaced_id() {
        let converted =
            to_jait_manifest(&json!({"id": "demo"})).expect("minimal manifest converts");
        assert_eq!(converted["id"], "openclaw:demo");
        assert_eq!(converted["displayName"], "demo");
        assert_eq!(converted["version"], "0.0.0");
        assert_eq!(converted["author"], "OpenClaw");
        assert_eq!(converted["main"], "index.ts");
        assert_eq!(converted["categories"], json!(["openclaw"]));
        assert_eq!(converted["contributes"]["tools"], json!([]));
    }

    #[test]
    fn maps_tools_channels_and_display_fields() {
        let converted = to_jait_manifest(&json!({
            "id": "demo",
            "name": "Demo Plugin",
            "version": "1.2.0",
            "description": "does things",
            "contracts": {"tools": ["read", "write"]},
            "channels": ["chat"]
        }))
        .expect("full manifest converts");
        assert_eq!(converted["displayName"], "Demo Plugin");
        assert_eq!(converted["version"], "1.2.0");
        assert_eq!(converted["description"], "does things");
        assert_eq!(converted["contributes"]["tools"][0]["name"], "read");
        assert_eq!(converted["contributes"]["tools"][1]["name"], "write");
        assert_eq!(converted["contributes"]["channels"][0]["id"], "chat");
        assert_eq!(
            converted["contributes"]["channels"][0]["displayName"],
            "Demo Plugin"
        );
    }

    #[test]
    fn rejects_unknown_or_path_escaping_ids() {
        for bad in [
            json!({}),
            json!({"id": ""}),
            json!({"id": "../escape"}),
            json!({"id": "a/b"}),
        ] {
            let err = to_jait_manifest(&bad).expect_err("bad id must be refused");
            assert!(
                !format!("{err:?}").is_empty(),
                "error must explain refusal for {bad}"
            );
        }
    }

    #[test]
    fn rejects_wrong_field_types() {
        let err =
            to_jait_manifest(&json!({"id": "demo", "name": 42})).expect_err("numeric name refused");
        assert!(
            format!("{err:?}").contains("must be a string"),
            "got {err:?}"
        );
        assert!(
            to_jait_manifest(&json!({"id": "demo", "channels": "chat"})).is_err(),
            "string channels must be refused"
        );
        assert!(
            to_jait_manifest(&json!({"id": "demo", "contracts": {"tools": [1]}})).is_err(),
            "non-string tool entries must be refused"
        );
    }
}

// ---------------------------------------------------------------------------
// surfaces/index.ts  ->  surfaces/registry.rs
// ---------------------------------------------------------------------------
mod surfaces_index {
    use jait_gateway::surfaces::registry::SurfaceRegistry;

    #[test]
    fn reservation_blocks_duplicate_owner_until_finished() {
        let registry = SurfaceRegistry::default();
        let token = registry
            .reserve_owner("shell", "alice")
            .expect("fresh id reserved");
        assert_eq!(registry.owner("shell").as_deref(), Some("alice"));
        assert_eq!(
            registry.reserve_owner("shell", "bob"),
            None,
            "reserved id cannot be taken"
        );
        assert!(registry.finish_reservation("shell", &token, true));
        assert_eq!(registry.owner("shell"), None, "cleanup releases the owner");
        let second = registry
            .reserve_owner("shell", "bob")
            .expect("id is free again");
        assert!(registry.finish_reservation("shell", &second, true));
    }

    #[test]
    fn stale_token_cannot_finish_someone_elses_attempt() {
        let registry = SurfaceRegistry::default();
        let mine = registry.reserve_owner("shell", "alice").expect("reserved");
        let stale = std::sync::Arc::new(());
        assert!(
            !registry.finish_reservation("shell", &stale, true),
            "a foreign token must not release the reservation"
        );
        assert_eq!(registry.owner("shell").as_deref(), Some("alice"));
        assert!(!registry.finish_reservation("missing", &mine, true));
        assert!(registry.finish_reservation("shell", &mine, true));
    }

    #[test]
    fn owner_lookup_and_listing_are_empty_for_unknown_ids() {
        let registry = SurfaceRegistry::default();
        assert_eq!(registry.owner("nope"), None);
        assert!(
            registry.list().is_empty(),
            "fresh registry lists no surfaces"
        );
        let token = registry.reserve_owner("shell", "alice").expect("reserved");
        assert!(
            registry.list().is_empty(),
            "reservations are not listed as surfaces"
        );
        assert!(registry.finish_reservation("shell", &token, true));
    }
}

// ---------------------------------------------------------------------------
// surfaces/shell-integration-assets.ts  ->  surfaces/shell_integration_assets.rs
// ---------------------------------------------------------------------------
mod surfaces_shell_integration_assets {
    use jait_gateway::surfaces::shell_integration_assets::{
        BASH_INSTALL_MARKER, ShellIntegrationAsset, ZSH_INSTALL_MARKER, shell_integration_asset,
    };

    #[test]
    fn known_keys_resolve_to_embedded_scripts() {
        let bash = shell_integration_asset("bash.sh").expect("bash.sh asset");
        let zsh = shell_integration_asset("zsh.sh").expect("zsh.sh asset");
        let pwsh = shell_integration_asset("pwsh.ps1").expect("pwsh.ps1 asset");
        assert!(bash.len() > 100 && zsh.len() > 100 && pwsh.len() > 100);
        assert_eq!(bash, ShellIntegrationAsset::Bash.content());
        assert!(bash.contains(BASH_INSTALL_MARKER));
        assert!(zsh.contains(ZSH_INSTALL_MARKER));
        assert_ne!(bash, zsh);
        assert_ne!(zsh, pwsh);
    }

    #[test]
    fn unknown_and_malformed_keys_yield_none() {
        for key in [
            "",
            "bash",
            "BASH.SH",
            "Bash.sh",
            "../bash.sh",
            "pwsh",
            "fish.sh",
        ] {
            assert_eq!(
                shell_integration_asset(key),
                None,
                "key {key:?} must not resolve"
            );
        }
    }

    #[test]
    fn key_lookup_matches_asset_enum() {
        assert_eq!(
            ShellIntegrationAsset::from_key("bash.sh"),
            Some(ShellIntegrationAsset::Bash)
        );
        assert_eq!(
            ShellIntegrationAsset::from_key("zsh.sh"),
            Some(ShellIntegrationAsset::Zsh)
        );
        assert_eq!(
            ShellIntegrationAsset::from_key("pwsh.ps1"),
            Some(ShellIntegrationAsset::Pwsh)
        );
        assert_eq!(ShellIntegrationAsset::from_key("sh"), None);
        assert_eq!(ShellIntegrationAsset::all().len(), 3);
    }
}
