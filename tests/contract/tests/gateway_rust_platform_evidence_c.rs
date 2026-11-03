//! Platform cluster evidence: worker `w-platform` (third target).
//!
//! Consumer-level contract tests for the native `jait-gateway` implementations of
//! migrated TS gateway components: evaluation child bootstrap, the os-control
//! barrel, the security barrel, the voice-assistant realtime session service and
//! the voice service helpers.

// ---------------------------------------------------------------------------
// packages/gateway/src/evaluation/isolated-gateway-child.ts
//   -> packages/gateway-rust/src/evaluation/isolated_gateway_child.rs
// ---------------------------------------------------------------------------
mod evaluation_isolated_gateway_child {
    use jait_gateway::evaluation::isolated_gateway::HostFuture;
    use jait_gateway::evaluation::isolated_gateway_child::{bootstrap, IsolatedChildHost};
    use serde_json::Value;
    use std::path::Path;
    use std::sync::{Arc, Mutex};

    const STATE_DIR: &str = "/state";
    const DB_PATH: &str = "/state/data/jait.db";
    const JWT_SECRET: &str = "jwt-secret";

    #[derive(Clone)]
    struct Harness {
        calls: Arc<Mutex<Vec<String>>>,
        fail: Option<&'static str>,
        port: u32,
    }

    impl Harness {
        fn new() -> Self {
            Self {
                calls: Arc::new(Mutex::new(Vec::new())),
                fail: None,
                port: 4321,
            }
        }

        fn failing(step: &'static str) -> Self {
            Self {
                fail: Some(step),
                ..Self::new()
            }
        }

        fn push(&self, entry: String) {
            self.calls.lock().unwrap().push(entry);
        }

        fn take(&self) -> Vec<String> {
            std::mem::take(&mut *self.calls.lock().unwrap())
        }

        fn fails(&self, step: &str) -> bool {
            self.fail == Some(step)
        }
    }

    impl IsolatedChildHost for Harness {
        fn open_database<'a>(&'a mut self, path: &'a Path) -> HostFuture<'a, Result<(), String>> {
            let me = self.clone();
            let entry = format!("open:{}", path.display());
            Box::pin(async move {
                me.push(entry);
                if me.fails("open") {
                    return Err("open failed".into());
                }
                Ok(())
            })
        }

        fn migrate_database(&mut self) -> HostFuture<'_, Result<(), String>> {
            let me = self.clone();
            Box::pin(async move {
                me.push("migrate".into());
                if me.fails("migrate") {
                    return Err("migrate failed".into());
                }
                Ok(())
            })
        }

        fn create_evaluation_user(&mut self) -> HostFuture<'_, Result<String, String>> {
            let me = self.clone();
            Box::pin(async move {
                me.push("user".into());
                if me.fails("user") {
                    return Err("user failed".into());
                }
                Ok("eval-user".into())
            })
        }

        fn update_settings<'a>(
            &'a mut self,
            user: &'a str,
            settings: Value,
        ) -> HostFuture<'a, Result<(), String>> {
            let me = self.clone();
            let entry = format!("settings:{user}:{settings}");
            Box::pin(async move {
                me.push(entry);
                if me.fails("settings") {
                    return Err("settings failed".into());
                }
                Ok(())
            })
        }

        fn sign_token<'a>(
            &'a mut self,
            user: &'a str,
            secret: &'a str,
        ) -> HostFuture<'a, Result<String, String>> {
            let me = self.clone();
            let entry = format!("sign:{user}:{secret}");
            Box::pin(async move {
                me.push(entry);
                if me.fails("sign") {
                    return Err("sign failed".into());
                }
                Ok("token-1".into())
            })
        }

        fn close_database(&mut self) -> HostFuture<'_, Result<(), String>> {
            let me = self.clone();
            Box::pin(async move {
                me.push("close".into());
                if me.fails("close") {
                    return Err("close failed".into());
                }
                Ok(())
            })
        }

        fn start_evaluation_gateway(&mut self) -> HostFuture<'_, Result<u32, String>> {
            let me = self.clone();
            let port = self.port;
            Box::pin(async move {
                me.push("start".into());
                if me.fails("start") {
                    return Err("start failed".into());
                }
                Ok(port)
            })
        }

        fn emit_ready<'a>(&'a mut self, line: &'a str) -> HostFuture<'a, Result<(), String>> {
            let me = self.clone();
            let entry = format!("ready:{line}");
            Box::pin(async move {
                me.push(entry);
                if me.fails("ready") {
                    return Err("ready failed".into());
                }
                Ok(())
            })
        }

        fn cancel_cleanup(&mut self) -> HostFuture<'_, Result<(), String>> {
            let me = self.clone();
            Box::pin(async move {
                me.push("cancel_cleanup".into());
                Ok(())
            })
        }

        fn wait_for_gateway_stop(&mut self) -> HostFuture<'_, Result<(), String>> {
            let me = self.clone();
            Box::pin(async move {
                me.push("wait_stop".into());
                Ok(())
            })
        }
    }

    #[tokio::test]
    async fn bootstrap_runs_host_steps_in_order_and_projects_only_known_settings() {
        let mut host = Harness::new();
        bootstrap(
            &mut host,
            r#"{"api_keys":{"x":"secret"},"jait_backend":"test","ignored":42,"port":9999}"#,
            STATE_DIR,
            DB_PATH,
            JWT_SECRET,
        )
        .await
        .expect("bootstrap succeeds");
        assert_eq!(
            host.take(),
            [
                format!("open:{DB_PATH}"),
                "migrate".to_string(),
                "user".to_string(),
                r#"settings:eval-user:{"apiKeys":{"x":"secret"},"jaitBackend":"test"}"#.to_string(),
                format!("sign:eval-user:{JWT_SECRET}"),
                "close".to_string(),
                "start".to_string(),
                r#"ready:JAIT_EVAL_READY {"port":4321,"token":"token-1"}"#.to_string(),
            ]
        );
    }

    #[tokio::test]
    async fn bootstrap_rejects_non_isolated_and_traversing_database_paths() {
        for bad_db in ["/etc/jait.db", "/state/../etc/jait.db", "/state/data/other.db", ""] {
            let mut host = Harness::new();
            let error = bootstrap(&mut host, "{}", STATE_DIR, bad_db, JWT_SECRET)
                .await
                .expect_err("non-isolated database path must be refused");
            assert_eq!(error, "Evaluation database isolation required", "db {bad_db}");
            assert!(host.take().is_empty(), "no host call may run for {bad_db}");
        }
    }

    #[tokio::test]
    async fn bootstrap_rejects_null_and_malformed_settings_before_touching_host() {
        let mut host = Harness::new();
        let error = bootstrap(&mut host, "null", STATE_DIR, DB_PATH, JWT_SECRET)
            .await
            .expect_err("null settings must be refused");
        assert_eq!(error, "Invalid evaluation settings");
        assert!(host.take().is_empty());

        let mut host = Harness::new();
        let error = bootstrap(&mut host, "{not json", STATE_DIR, DB_PATH, JWT_SECRET)
            .await
            .expect_err("malformed settings must be refused");
        assert!(error.contains("key must be a string"), "unexpected error: {error}");
        assert!(host.take().is_empty());
    }

    #[tokio::test]
    async fn bootstrap_closes_database_then_skips_ready_when_signing_fails() {
        let mut host = Harness::failing("sign");
        let error = bootstrap(&mut host, "{}", STATE_DIR, DB_PATH, JWT_SECRET)
            .await
            .expect_err("signing failure must propagate");
        assert_eq!(error, "sign failed");
        assert_eq!(
            host.take(),
            [
                format!("open:{DB_PATH}"),
                "migrate".to_string(),
                "user".to_string(),
                "settings:eval-user:{}".to_string(),
                format!("sign:eval-user:{JWT_SECRET}"),
                "close".to_string(),
            ],
            "database must be closed and no listener started on failure"
        );
    }

    #[tokio::test]
    async fn bootstrap_propagates_close_failure_without_starting_listener() {
        let mut host = Harness::failing("close");
        let error = bootstrap(&mut host, "{}", STATE_DIR, DB_PATH, JWT_SECRET)
            .await
            .expect_err("close failure must propagate");
        assert_eq!(error, "close failed");
        let calls = host.take();
        assert_eq!(calls.last().unwrap(), "close");
        assert!(!calls.iter().any(|call| call.starts_with("start") || call.starts_with("ready")));
    }
}

// ---------------------------------------------------------------------------
// packages/gateway/src/os-control/index.ts
//   -> packages/gateway-rust/src/integrations/os_control/index.rs
// ---------------------------------------------------------------------------
mod os_control_index {
    use futures_util::future::BoxFuture;
    use jait_gateway::integrations::os_control::contracts::{OsControlDriver, SandboxRunResult};
    use jait_gateway::integrations::os_control::index::{
        LinuxDesktopOsControlDriver, MouseButton, OsClickOptions, OsDriverBinding, OsDriverType,
        OsExecOptions, OsKeyOptions, OsScrollOptions, OsTypeOptions, ScrollDirection,
    };
    use jait_gateway::integrations::os_control::linux_desktop::LinuxDesktopShell;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    struct NoopShell {
        seen: Mutex<Vec<String>>,
    }

    impl NoopShell {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                seen: Mutex::new(Vec::new()),
            })
        }
    }

    impl LinuxDesktopShell for NoopShell {
        fn exec_shell<'a>(
            &'a self,
            container_name: &'a str,
            command: &'a str,
            _timeout_ms: u64,
        ) -> BoxFuture<'a, Result<SandboxRunResult, String>> {
            self.seen.lock().unwrap().push(command.to_string());
            let container_name = container_name.to_string();
            Box::pin(async move {
                Ok(SandboxRunResult {
                    ok: true,
                    output: String::new(),
                    exit_code: Some(0.0),
                    timed_out: false,
                    container_name,
                })
            })
        }
    }

    #[test]
    fn driver_type_and_pointer_enums_serialize_to_wire_literals() {
        assert_eq!(serde_json::to_value(OsDriverType::LinuxDesktop).unwrap(), json!("linux-desktop"));
        assert_eq!(serde_json::to_value(OsDriverType::Windows).unwrap(), json!("windows"));
        assert_eq!(serde_json::to_value(MouseButton::Right).unwrap(), json!("right"));
        assert_eq!(serde_json::to_value(ScrollDirection::Down).unwrap(), json!("down"));

        let parsed: OsDriverType = serde_json::from_value(json!("windows")).unwrap();
        assert_eq!(parsed, OsDriverType::Windows);
        let error = serde_json::from_value::<OsDriverType>(json!("Windows"))
            .expect_err("variants are case sensitive");
        assert!(error.to_string().contains("unknown variant"), "unexpected error: {error}");
    }

    #[test]
    fn click_options_default_is_empty_and_rejects_unknown_button() {
        assert_eq!(OsClickOptions::default(), serde_json::from_value(json!({})).unwrap());
        let options: OsClickOptions = serde_json::from_value(json!({"button":"right","x":1.5,"y":2.0}))
            .expect("known button parses");
        assert_eq!(options.button, Some(MouseButton::Right));
        assert!(serde_json::from_value::<OsClickOptions>(json!({"button":"sideways"}))
            .expect_err("unknown button must be refused")
            .to_string()
            .contains("unknown variant"));

        assert_eq!(OsTypeOptions::default(), serde_json::from_value(json!({})).unwrap());
        assert_eq!(OsKeyOptions::default(), serde_json::from_value(json!({})).unwrap());
        assert_eq!(OsScrollOptions::default(), serde_json::from_value(json!({})).unwrap());
        assert_eq!(OsExecOptions::default(), serde_json::from_value(json!({})).unwrap());
        assert!(serde_json::from_value::<OsScrollOptions>(json!({"direction":"sideways"}))
            .expect_err("unknown scroll direction must be refused")
            .to_string()
            .contains("unknown variant"));
    }

    #[tokio::test]
    async fn driver_binding_reachable_through_barrel_carries_container_and_type() {
        let shell = NoopShell::new();
        let driver = LinuxDesktopOsControlDriver::new(shell.clone(), "jait-desktop");
        let binding = OsDriverBinding {
            driver,
            container_name: "jait-desktop".to_string(),
            r#type: OsDriverType::LinuxDesktop,
        };
        assert_eq!(binding.container_name, "jait-desktop");
        assert_eq!(binding.r#type, OsDriverType::LinuxDesktop);
        let output = binding
            .driver
            .exec(
                "printf hi",
                Some(OsExecOptions {
                    timeout_ms: Some(30_000.0),
                    ..OsExecOptions::default()
                }),
            )
            .await
            .expect("stub shell accepts plain commands");
        assert_eq!(output.container_name, "jait-desktop");
        assert!(output.ok);
        assert_eq!(output.exit_code, Some(0.0));
        assert_eq!(*shell.seen.lock().unwrap(), vec!["printf hi".to_string()]);
    }
}

// ---------------------------------------------------------------------------
// packages/gateway/src/security/index.ts
//   -> packages/gateway-rust/src/security/index.rs
// ---------------------------------------------------------------------------
mod security_index {
    use jait_gateway::security::contracts::Risk;
    use jait_gateway::security::index::{
        get_unknown_tool_permission, requires_consent, ConsentLevel, PathGuard, PathTraversalError,
        PolicySource, ToolPermission,
    };
    use std::collections::HashSet;
    use std::path::{Path, PathBuf};

    fn permission(level: ConsentLevel) -> ToolPermission {
        ToolPermission {
            tool_name: "shell.run".to_string(),
            consent_level: level,
            risk: Risk::High,
            allowed_commands: Some(vec!["ls".to_string()]),
            denied_commands: None,
            allowed_paths: None,
            denied_paths: None,
            description: "Run a shell command".to_string(),
        }
    }

    #[test]
    fn unknown_tool_is_default_denied_as_dangerous() {
        let resolved = get_unknown_tool_permission("mystery_tool");
        assert_eq!(resolved.permission.tool_name, "mystery_tool");
        assert_eq!(resolved.permission.consent_level, ConsentLevel::Dangerous);
        assert_eq!(resolved.permission.risk, Risk::High);
        assert_eq!(resolved.permission.allowed_commands, None);
        assert_eq!(resolved.permission.denied_commands, None);
        assert_eq!(
            resolved.permission.description,
            "Tool is not part of the active security profile and is treated as dangerous until explicitly configured."
        );
        assert!(!resolved.known_tool);
        assert!(matches!(resolved.source, PolicySource::UnknownTool));
        assert!(
            requires_consent(Some(&resolved.permission), 5.0, &HashSet::new()),
            "dangerous tools require consent even at maximum trust"
        );
    }

    #[test]
    fn requires_consent_matrix_follows_profile_levels() {
        let none: HashSet<String> = HashSet::new();
        let mut approved = HashSet::new();
        approved.insert("shell.run".to_string());

        assert!(!requires_consent(Some(&permission(ConsentLevel::None)), f64::NAN, &none));
        assert!(requires_consent(None, 5.0, &none), "unconfigured tools always require consent");

        assert!(requires_consent(Some(&permission(ConsentLevel::Once)), 1.0, &none));
        assert!(!requires_consent(Some(&permission(ConsentLevel::Once)), 2.0, &none));
        assert!(!requires_consent(Some(&permission(ConsentLevel::Once)), 0.0, &approved));

        assert!(requires_consent(Some(&permission(ConsentLevel::Always)), 2.9, &approved));
        assert!(requires_consent(Some(&permission(ConsentLevel::Always)), f64::NAN, &none));
        assert!(!requires_consent(Some(&permission(ConsentLevel::Always)), 3.0, &none));
        assert!(requires_consent(Some(&permission(ConsentLevel::Dangerous)), 9.0, &approved));
    }

    #[test]
    fn path_guard_allows_in_root_and_denies_traversal_null_bytes_and_denied_dirs() {
        let guard = PathGuard::new(Path::new("."), &["secrets".to_string()], false)
            .expect("guard rooted at the contract crate");
        let ok = guard.validate("src/lib.rs").expect("in-root path is allowed");
        assert!(ok.starts_with(guard.project_root()));
        assert!(ok.ends_with("src/lib.rs"));

        let traversal = guard
            .validate("../escape.rs")
            .expect_err("traversal must be refused")
            .downcast::<PathTraversalError>()
            .expect("traversal error keeps its concrete type");
        assert_eq!(traversal.message, "Path escapes project boundary: ../escape.rs");
        assert_eq!(traversal.path, PathBuf::from("../escape.rs"));
        assert_eq!(traversal.boundary.as_path(), guard.project_root());

        let null = guard
            .validate("a\0b")
            .expect_err("null byte must be refused")
            .downcast::<PathTraversalError>()
            .expect("null-byte error keeps its concrete type");
        assert_eq!(null.message, "Path contains null byte: a\0b");

        let denied = guard
            .validate("secrets/token.txt")
            .expect_err("paths under a denied directory must be refused")
            .downcast::<PathTraversalError>()
            .expect("denied-path error keeps its concrete type");
        assert_eq!(
            denied.message,
            "Access denied: path matches denied entry 'secrets'"
        );
    }
}

// ---------------------------------------------------------------------------
// packages/gateway/src/voice-assistant/service.ts
//   -> packages/gateway-rust/src/voice_assistant/mod.rs
// ---------------------------------------------------------------------------
mod voice_assistant_service {
    use jait_gateway::voice_assistant::{Effect, RealtimeSession};
    use serde_json::json;

    #[tokio::test]
    async fn opening_a_session_updates_provider_announces_and_listens_once() {
        let mut session = RealtimeSession::default();
        let effects = session.opened(json!({"type":"session.created","session":{"id":"s1"}}));
        assert_eq!(
            effects,
            vec![
                Effect::Provider(json!({"type":"session.created","session":{"id":"s1"}})),
                Effect::Client(json!({"type":"session.started"})),
                Effect::Client(json!({"type":"status","status":"listening"})),
            ]
        );
        assert_eq!(
            session.opened(json!({"type":"session.created"})),
            Vec::<Effect>::new()
        );
    }

    #[tokio::test]
    async fn close_emits_single_normal_close_and_ignores_late_events() {
        let mut session = RealtimeSession::default();
        session.opened(json!({"type":"session.created"}));
        assert_eq!(
            session.close("bye"),
            vec![Effect::Close {
                code: 1000,
                reason: "bye"
            }]
        );
        assert_eq!(session.close("again"), Vec::<Effect>::new());
        assert_eq!(
            session.client(&json!({"type":"audio","data":"AA=="})).expect("audio event accepted"),
            Vec::<Effect>::new(),
            "events after close must not reach the provider"
        );
    }

    #[tokio::test]
    async fn audio_frames_are_forwarded_to_the_provider_with_a_hard_frame_budget() {
        let mut session = RealtimeSession::default();
        assert_eq!(
            session
                .client(&json!({"type":"audio","data":"AA=="}))
                .expect("events before open are dropped, not rejected"),
            Vec::<Effect>::new()
        );
        session.opened(json!({"type":"session.created"}));
        assert_eq!(
            session
                .client(&json!({"type":"audio","data":"AA=="}))
                .expect("audio event accepted"),
            vec![Effect::Provider(
                json!({"type":"input_audio_buffer.append","audio":"AA=="})
            )]
        );
        assert_eq!(
            session
                .client(&json!({"type":"audio"}))
                .expect_err("audio without data is rejected"),
            "Invalid audio"
        );
        assert_eq!(
            session
                .client(&json!({"type":"audio","data":"A".repeat(512 * 1024 + 1)}))
                .expect_err("audio frame over 512 KiB is rejected"),
            "Audio frame too large"
        );
        assert_eq!(
            session
                .client(&json!({"type":"audio","data":"A".repeat(512 * 1024)}))
                .expect("a frame exactly at the 512 KiB budget is accepted")
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn provider_transcripts_are_normalized_and_audio_deltas_switch_to_speaking() {
        let mut session = RealtimeSession::default();
        session.opened(json!({"type":"session.created"}));
        assert_eq!(
            session
                .provider(&json!({"type":"conversation.item.input_audio_transcription.completed","transcript":"hey jade"}))
                .expect("transcription accepted"),
            vec![Effect::Client(
                json!({"type":"transcript","role":"user","text":"hey Jait","final":true})
            )]
        );
        assert_eq!(
            session
                .provider(&json!({"type":"response.audio.delta","delta":"AA=="}))
                .expect("audio delta accepted"),
            vec![
                Effect::Client(json!({"type":"audio","data":"AA=="})),
                Effect::Client(json!({"type":"status","status":"speaking"})),
            ]
        );
        assert_eq!(
            session.close("done"),
            vec![Effect::Close {
                code: 1000,
                reason: "done"
            }]
        );
        assert_eq!(
            session
                .provider(&json!({"type":"response.audio.delta","delta":"AA=="}))
                .expect("provider events after close are dropped"),
            Vec::<Effect>::new()
        );
    }
}

// ---------------------------------------------------------------------------
// packages/gateway/src/voice/service.ts -> packages/gateway-rust/src/voice/mod.rs
// ---------------------------------------------------------------------------
mod voice_service {
    use jait_gateway::voice::{decode_node_base64, normalize_transcript};

    #[test]
    fn transcript_normalization_pins_vendor_name_variants() {
        assert_eq!(normalize_transcript("hey jade"), "hey Jait");
        assert_eq!(normalize_transcript("JADE"), "JAIT");
        assert_eq!(normalize_transcript("open jaid and jate now"), "open Jait and Jait now");
        assert_eq!(normalize_transcript("jayd"), "Jait");
        assert_eq!(normalize_transcript("jade_jade"), "jade_jade");
        assert_eq!(normalize_transcript("jadestone"), "jadestone");
    }

    #[test]
    fn node_base64_decoding_is_lenient_and_strips_whitespace() {
        assert_eq!(decode_node_base64("aGk=").unwrap(), b"hi".to_vec());
        assert_eq!(decode_node_base64(" aGk=\n\t").unwrap(), b"hi".to_vec());
        assert_eq!(decode_node_base64("a!G#i").unwrap(), b"hh".to_vec());
        assert_eq!(decode_node_base64("-_8").unwrap(), vec![0xfb, 0xff]);
        assert_eq!(decode_node_base64("!!!!").unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn oversized_audio_frames_are_refused_before_decoding() {
        let oversized = "A".repeat(16 * 1024 * 1024 * 2 + 1);
        assert_eq!(decode_node_base64(&oversized).unwrap_err(), "Voice audio too large");
        assert_eq!(
            decode_node_base64(&"A".repeat(22_369_620))
                .expect("decoded bytes just under the 16 MiB budget are accepted")
                .len(),
            16 * 1024 * 1024 - 1
        );
        assert_eq!(
            decode_node_base64(&"A".repeat(22_369_624)).unwrap_err(),
            "Voice audio too large",
            "decoded bytes over the 16 MiB budget are refused"
        );
    }
}
