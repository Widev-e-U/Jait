//! Consumer-level contract evidence for the NATIVE Rust ports of the
//! top-level (`(root)` cluster) gateway modules and the `cli`/`lib` singletons.
//!
//! Every expectation below is transcribed from the TypeScript reference:
//!   * `packages/gateway/src/config.ts`            -> `jait_gateway::app_config`
//!   * `packages/gateway/scripts/bundle-web.mjs`   -> `jait_gateway::bundle_web`
//!
//! The crate is consumed exactly the way a downstream binary consumes it
//! (`jait_gateway::<module>::<fn>`), not through the module-private test hooks.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};

use jait_gateway::app_config::{self, AppConfig, LlmProvider};
use jait_gateway::bundle_web::{self, BundleResult};

/// Build an `AppConfig` from a literal environment map, the same way
/// `loadConfig()` reads `process.env`.
fn config_with(pairs: &[(&str, &str)]) -> AppConfig {
    let map: HashMap<String, String> = pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    app_config::load_with(|key| map.get(key).cloned())
}

/// Unique, self-cleaning scratch directory (the contract crate has no
/// `tempfile` dev-dependency, and `Cargo.toml` must not be edited).
struct Scratch(PathBuf);

impl Scratch {
    fn new(tag: &str) -> Self {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "jait-root-evidence-{tag}-{}-{n}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("scratch dir");
        Self(dir)
    }

    fn join(&self, rel: &str) -> PathBuf {
        self.0.join(rel)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

// ===========================================================================
// (root) src/config.ts -> jait_gateway::app_config
// ===========================================================================
mod config_ts {
    use super::*;

    /// TS `loadConfig()` with an empty environment: every documented default.
    #[test]
    fn empty_environment_yields_ts_defaults() {
        let c = config_with(&[]);

        assert_eq!(c.port, 8000);
        assert_eq!(c.ws_port, 18789);
        assert_eq!(c.host, "0.0.0.0");
        assert_eq!(c.log_level, "info");
        assert_eq!(c.cors_origin, "http://localhost:3000");
        assert_eq!(c.node_env, "development");

        assert_eq!(c.ollama_url, "http://localhost:11434");
        assert_eq!(
            c.ollama_model,
            "CognitiveComputations/dolphin-mistral-nemo:12b"
        );
        assert_eq!(c.openai_base_url, "https://api.openai.com/v1");
        assert_eq!(c.omniroute_base_url, "http://localhost:20128/v1");

        // Unset credentials are the empty string, never a placeholder.
        assert_eq!(c.openai_api_key, "");
        assert_eq!(c.omniroute_api_key, "");
        assert_eq!(c.primary_token, "");
        assert_eq!(c.node_name, "");
        assert_eq!(c.primary_gateway, "");

        // No OPENAI_API_KEY and no LLM_PROVIDER => auto-detect picks ollama.
        assert_eq!(c.llm_provider, LlmProvider::Ollama);
        assert_eq!(c.openai_model, "gpt-4o");

        // `inferContextWindow("gpt-4o")`.
        assert_eq!(c.context_window, 128_000);
        assert_eq!(c.agent_max_rounds, 0);
        assert_eq!(c.ollama_context_window, 32_768);

        assert_eq!(c.heartbeat_cron, "* * * * *");
        assert_eq!(c.whisper_url, "http://localhost:8178");
        assert_eq!(c.realtime_model, "gpt-realtime");
        assert_eq!(c.realtime_transcribe_model, "gpt-4o-transcribe");
        assert_eq!(c.realtime_voice, "alloy");
        assert_eq!(c.voice_escalation_async_ms, 12_000);
        assert_eq!(c.voice_escalation_filler_ms, 2_500);
        assert_eq!(c.stt_prompt, app_config::DEFAULT_STT_PROMPT);
        assert_eq!(
            app_config::DEFAULT_STT_PROMPT,
            "Jait (the assistant's name, pronounced like 'jate'), Hey Jait"
        );

        // dockur Windows sandbox image defaults.
        assert_eq!(c.windows_ssh_username, "Docker");
        assert_eq!(c.windows_ssh_password, "admin");

        // No primary gateway => this is not a node-only instance.
        assert!(!c.node_only);
    }

    /// `LLM_PROVIDER` is an unchecked cast in TS: explicit wins over
    /// auto-detection and unknown values pass through verbatim.
    #[test]
    fn llm_provider_precedence_and_verbatim_passthrough() {
        // Explicit ollama beats a present OPENAI_API_KEY.
        let c = config_with(&[("OPENAI_API_KEY", "sk-live"), ("LLM_PROVIDER", "ollama")]);
        assert_eq!(c.llm_provider, LlmProvider::Ollama);
        assert!(c.llm_provider.is_ollama());
        assert!(!c.llm_provider.is_openai());

        // Explicit openai with no key at all.
        let c = config_with(&[("LLM_PROVIDER", "openai")]);
        assert_eq!(c.llm_provider, LlmProvider::OpenAi);
        assert!(c.llm_provider.is_openai());
        assert_eq!(c.llm_provider.to_string(), "openai");

        // Unknown/empty values are preserved byte-for-byte (TS `as LlmProvider`).
        let c = config_with(&[("LLM_PROVIDER", "OpenAI ")]);
        assert_eq!(c.llm_provider, LlmProvider::Other("OpenAI ".to_string()));
        assert_eq!(c.llm_provider.as_str(), "OpenAI ");
        assert!(!c.llm_provider.is_openai());
        assert!(!c.llm_provider.is_ollama());

        let c = config_with(&[("LLM_PROVIDER", "")]);
        assert_eq!(c.llm_provider, LlmProvider::Other(String::new()));
        assert_eq!(c.llm_provider.as_str(), "");

        // Presence alone (not truthiness) of the key auto-detects openai.
        let c = config_with(&[("OPENAI_API_KEY", "")]);
        assert_eq!(c.llm_provider, LlmProvider::OpenAi);
    }

    /// `JAIT_NODE_ONLY` explicit parsing versus the primary-gateway fallback.
    #[test]
    fn node_only_truthiness_and_primary_gateway_fallback() {
        for truthy in ["1", "true", "yes", "on", "TRUE", "Yes", " 1 "] {
            let c = config_with(&[("JAIT_NODE_ONLY", truthy)]);
            assert!(c.node_only, "JAIT_NODE_ONLY={truthy:?} must be truthy");
        }
        for falsy in ["0", "false", "no", "off", "maybe", "2"] {
            let c = config_with(&[("JAIT_NODE_ONLY", falsy)]);
            assert!(!c.node_only, "JAIT_NODE_ONLY={falsy:?} must be falsy");
        }

        // Unset => fall back to "is a primary gateway configured?".
        let c = config_with(&[("JAIT_PRIMARY_GATEWAY", "http://primary:8000")]);
        assert!(c.node_only);
        assert_eq!(c.primary_gateway, "http://primary:8000");

        // Blank marker is treated as unset, so the fallback still applies.
        let c = config_with(&[
            ("JAIT_NODE_ONLY", "   "),
            ("JAIT_PRIMARY_GATEWAY", "http://primary:8000"),
        ]);
        assert!(c.node_only);

        // An explicit falsey marker overrides a configured primary gateway.
        let c = config_with(&[
            ("JAIT_NODE_ONLY", "off"),
            ("JAIT_PRIMARY_GATEWAY", "http://primary:8000"),
        ]);
        assert!(!c.node_only);
    }

    /// `CONTEXT_WINDOW` override semantics and `inferContextWindow` branch order.
    #[test]
    fn context_window_override_and_model_inference() {
        // Explicit non-zero override wins over model inference.
        let c = config_with(&[("OPENAI_MODEL", "gpt-4"), ("CONTEXT_WINDOW", "64000")]);
        assert_eq!(c.context_window, 64_000);

        // `parseInt(...) || infer(...)`: a real zero is falsy -> inference.
        let c = config_with(&[("OPENAI_MODEL", "gpt-4"), ("CONTEXT_WINDOW", "0")]);
        assert_eq!(c.context_window, 8_192);
        // NaN is falsy -> inference.
        let c = config_with(&[("OPENAI_MODEL", "gpt-4"), ("CONTEXT_WINDOW", "abc")]);
        assert_eq!(c.context_window, 8_192);
        // Trailing garbage is tolerated by parseInt.
        let c = config_with(&[("CONTEXT_WINDOW", "12abc")]);
        assert_eq!(c.context_window, 12);

        // Branch order matters: gpt-4-turbo and gpt-4o are tested before gpt-4.
        let cases: &[(&str, u32)] = &[
            ("gpt-4o", 128_000),
            ("gpt-4.1-mini", 128_000),
            ("gpt-4-turbo", 128_000),
            ("gpt-5", 400_000),
            ("gpt-4", 8_192),
            ("gpt-3.5-turbo", 16_385),
            ("claude-3-opus", 200_000),
            ("claude-4-sonnet", 200_000),
            ("claude-instant", 100_000),
            ("gemini-2.5-pro", 128_000),
            ("o3-mini", 200_000),
            ("deepseek-chat", 64_000),
            ("mixtral-8x7b", 32_000),
            ("llama3", 8_192),
            ("auto/coding", 128_000),
            ("totally-unknown", 128_000),
        ];
        for (model, expected) in cases {
            let c = config_with(&[("OPENAI_MODEL", model)]);
            assert_eq!(c.context_window, *expected, "model {model:?}");
        }
    }

    /// `parseInt` port semantics for every numeric field, including the
    /// out-of-range and negative fallbacks that TS gets from `||`.
    #[test]
    fn numeric_env_parsing_and_fallbacks() {
        // Ports have no `|| fallback`: unrepresentable values take the default.
        assert_eq!(config_with(&[("PORT", "9000")]).port, 9000);
        assert_eq!(config_with(&[("PORT", "9000x")]).port, 9000);
        assert_eq!(config_with(&[("PORT", "70000")]).port, 8000);
        assert_eq!(config_with(&[("PORT", "-1")]).port, 8000);
        assert_eq!(config_with(&[("PORT", "abc")]).port, 8000);
        assert_eq!(config_with(&[("PORT", " 18790 ")]).port, 18790);
        assert_eq!(config_with(&[("WS_PORT", "0")]).ws_port, 0);

        // `|| fallback` fields: zero and NaN fall back, negatives too.
        assert_eq!(config_with(&[("JAIT_MAX_ROUNDS", "7")]).agent_max_rounds, 7);
        assert_eq!(
            config_with(&[("JAIT_MAX_ROUNDS", "1e3")]).agent_max_rounds,
            1
        );
        assert_eq!(config_with(&[("JAIT_MAX_ROUNDS", "0")]).agent_max_rounds, 0);
        assert_eq!(config_with(&[("JAIT_MAX_ROUNDS", "x")]).agent_max_rounds, 0);
        assert_eq!(
            config_with(&[("JAIT_MAX_ROUNDS", "-4")]).agent_max_rounds,
            0,
            "negative is truthy in JS but unrepresentable as u32"
        );
        assert_eq!(
            config_with(&[("OLLAMA_CONTEXT_LENGTH", "0")]).ollama_context_window,
            32_768
        );
        assert_eq!(
            config_with(&[("OLLAMA_CONTEXT_LENGTH", "8192")]).ollama_context_window,
            8_192
        );

        assert_eq!(
            config_with(&[("JAIT_VOICE_ESCALATION_ASYNC_MS", "500")]).voice_escalation_async_ms,
            500
        );
        assert_eq!(
            config_with(&[("JAIT_VOICE_ESCALATION_ASYNC_MS", "abc")]).voice_escalation_async_ms,
            12_000
        );
        assert_eq!(
            config_with(&[("JAIT_VOICE_ESCALATION_FILLER_MS", "-5")]).voice_escalation_filler_ms,
            2_500
        );
    }

    /// The three distinct TS trim idioms and the generated-secret lifecycle.
    #[test]
    fn trim_idioms_and_generated_secrets() {
        // `??` (no trim): surrounding whitespace survives.
        let c = config_with(&[("HOST", "  127.0.0.1  "), ("LOG_LEVEL", " debug ")]);
        assert_eq!(c.host, "  127.0.0.1  ");
        assert_eq!(c.log_level, " debug ");

        // `?.trim() ??` (trim, blank does NOT fall back).
        let c = config_with(&[("JAIT_PRIMARY_GATEWAY", "  http://p:1  ")]);
        assert_eq!(c.primary_gateway, "http://p:1");
        let c = config_with(&[("JAIT_STT_PROMPT", "   ")]);
        assert_eq!(
            c.stt_prompt, "",
            "whitespace trims to empty, default unused"
        );

        // `?.trim() ||` (trim, blank falls back).
        let c = config_with(&[("OPENAI_REALTIME_MODEL", "   ")]);
        assert_eq!(c.realtime_model, "gpt-realtime");
        // config.ts:207 `OPENAI_REALTIME_VOICE ?? "alloy"` -- no trim idiom,
        // so surrounding whitespace is preserved verbatim.
        let c = config_with(&[("OPENAI_REALTIME_VOICE", "  echo  ")]);
        assert_eq!(c.realtime_voice, "  echo  ");
        let c = config_with(&[("OPENAI_REALTIME_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")]);
        assert_eq!(c.realtime_transcribe_model, "gpt-4o-mini-transcribe");

        // Generated secrets: 32 random bytes as 64 lowercase hex chars, and
        // stable for the process lifetime (`generatedJwtSecret ??= ...`).
        let a = config_with(&[]);
        let b = config_with(&[]);
        assert_eq!(a.jwt_secret, b.jwt_secret);
        assert_eq!(a.hook_secret, b.hook_secret);
        assert_ne!(a.jwt_secret, a.hook_secret);
        for secret in [&a.jwt_secret, &a.hook_secret] {
            assert_eq!(secret.len(), 64, "randomBytes(32).toString('hex')");
            assert!(
                secret
                    .chars()
                    .all(|ch| ch.is_ascii_hexdigit() && !ch.is_uppercase())
            );
        }

        // An explicit secret is trimmed and used verbatim instead.
        let c = config_with(&[("JWT_SECRET", "  explicit-secret  "), ("HOOK_SECRET", "hk")]);
        assert_eq!(c.jwt_secret, "explicit-secret");
        assert_eq!(c.hook_secret, "hk");
        // Blank is falsy for `||`, so the generated secret is kept.
        let c = config_with(&[("JWT_SECRET", "   ")]);
        assert_eq!(c.jwt_secret.len(), 64);
    }

    /// `.env` bootstrapping helpers: `dotenv` file syntax and the CLI gate.
    #[test]
    fn dotenv_parsing_and_cli_marker_gate() {
        let pairs = app_config::parse_dotenv(
            "# comment\n\
             \n\
             PORT=9001\n\
             export WS_PORT=18790\n\
             QUOTED=\"a b\"\n\
             SINGLE='c d'\n\
             EMPTY=\n\
             WITH_EQUALS=a=b\n\
             INLINE=value # note\n\
             EXPANDED=${OTHER}\n\
             NOEQUALS\n\
             =novalue\n\
             PORT=9002\n",
        );
        let expected: Vec<(String, String)> = vec![
            ("PORT".into(), "9001".into()),
            ("WS_PORT".into(), "18790".into()),
            ("QUOTED".into(), "a b".into()),
            ("SINGLE".into(), "c d".into()),
            ("EMPTY".into(), "".into()),
            ("WITH_EQUALS".into(), "a=b".into()),
            ("INLINE".into(), "value # note".into()),
            ("EXPANDED".into(), "${OTHER}".into()),
            ("PORT".into(), "9002".into()),
        ];
        assert_eq!(pairs, expected);

        // Consumers insert in order, so last-wins matches `dotenv`.
        let last = pairs.iter().rev().find(|(k, _)| k == "PORT").unwrap();
        assert_eq!(last.1, "9002");

        // `if (!process.env["__JAIT_CLI"])`: only a non-empty marker suppresses.
        assert!(app_config::should_load_dotenv(None));
        assert!(app_config::should_load_dotenv(Some("")));
        assert!(!app_config::should_load_dotenv(Some("1")));
        assert!(!app_config::should_load_dotenv(Some("0")));
    }
}

// ===========================================================================
// (root) scripts/bundle-web.mjs -> jait_gateway::bundle_web
// ===========================================================================
mod bundle_web_ts {
    use super::*;

    /// No `index.html` => the build is skipped and nothing is created.
    #[test]
    fn missing_build_is_skipped_without_creating_destination() {
        let scratch = Scratch::new("bundle-missing");
        let source = scratch.join("web-dist");
        let destination = scratch.join("stage");
        std::fs::create_dir(&source).unwrap();
        std::fs::write(source.join("app.js"), b"only-js").unwrap();

        assert_eq!(
            bundle_web::stage_web(&source, &destination).unwrap(),
            BundleResult::MissingBuild
        );
        assert!(!destination.exists(), "skip must not create the stage dir");
    }

    /// A real build is staged byte-for-byte and an existing destination is
    /// never clobbered (`web-dist` replacement requires the owner lock).
    #[test]
    fn stages_nested_tree_then_refuses_to_clobber() {
        let scratch = Scratch::new("bundle-stage");
        let source = scratch.join("web-dist");
        std::fs::create_dir_all(source.join("assets/chunks")).unwrap();
        std::fs::write(source.join("index.html"), b"<html>jait</html>").unwrap();
        std::fs::write(source.join("assets/app.js"), b"console.log(1)").unwrap();
        std::fs::write(source.join("assets/chunks/vendor.js"), b"vendor").unwrap();

        let destination = scratch.join("stage");
        assert_eq!(
            bundle_web::stage_web(&source, &destination).unwrap(),
            BundleResult::Staged
        );
        assert_eq!(
            std::fs::read(destination.join("index.html")).unwrap(),
            b"<html>jait</html>"
        );
        assert_eq!(
            std::fs::read(destination.join("assets/app.js")).unwrap(),
            b"console.log(1)"
        );
        assert_eq!(
            std::fs::read(destination.join("assets/chunks/vendor.js")).unwrap(),
            b"vendor"
        );

        // Second stage into the same name: AlreadyExists, old bytes intact.
        std::fs::write(destination.join("index.html"), b"old").unwrap();
        let err = bundle_web::stage_web(&source, &destination).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(
            std::fs::read(destination.join("index.html")).unwrap(),
            b"old"
        );
    }

    /// `index.html` that is not a regular file is rejected before any staging
    /// directory is created.
    #[test]
    fn directory_index_is_rejected_before_staging() {
        let scratch = Scratch::new("bundle-indexdir");
        let source = scratch.join("web-dist");
        std::fs::create_dir_all(source.join("index.html")).unwrap();
        let destination = scratch.join("stage");

        let err = bundle_web::stage_web(&source, &destination).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
        assert_eq!(err.to_string(), "index.html must be a regular file");
        assert!(!destination.exists());
    }

    /// Containment guards: the destination may not live inside the source and
    /// the source itself must be a real directory, not a symlink.
    #[test]
    fn rejects_destination_inside_source_and_symlinked_source() {
        let scratch = Scratch::new("bundle-containment");
        let source = scratch.join("web-dist");
        std::fs::create_dir(&source).unwrap();
        std::fs::write(source.join("index.html"), b"index").unwrap();

        let err = bundle_web::stage_web(&source, &source.join("nested")).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
        assert_eq!(err.to_string(), "destination cannot be inside source");
        assert!(!source.join("nested").exists());

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let link = scratch.join("link-dist");
            symlink(&source, &link).unwrap();
            let err = bundle_web::stage_web(&link, &scratch.join("stage-link")).unwrap_err();
            assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
            assert_eq!(err.to_string(), "source must be a real directory");
            assert!(!scratch.join("stage-link").exists());
        }
    }
}
