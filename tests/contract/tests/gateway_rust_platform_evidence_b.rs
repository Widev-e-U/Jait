//! Consumer-level contract tests for platform-cluster native (`jait-gateway`) components.
//!
//! Every expectation is derived from the TypeScript reference under
//! `packages/gateway/src/**`; the native implementation is exercised through its public API only.

use std::path::Path;

mod evaluation_isolated_gateway {
    use super::Path;
    use jait_gateway::evaluation::isolated_gateway::{
        DB_RELATIVE_PATH, DEFAULT_LLM_PROVIDER, READY_PREFIX, ReadyLine, backend_from_settings,
        build_child_env, parse_ready_line, ready_line, tail_chars, validate_isolation,
    };
    use serde_json::json;

    fn env_get(env: &[(String, String)], key: &str) -> Option<String> {
        env.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone())
    }

    #[test]
    fn child_env_pins_isolation_constants_and_overrides_base() {
        assert_eq!(READY_PREFIX, "JAIT_EVAL_READY ");
        assert_eq!(DB_RELATIVE_PATH, "data/jait.db");
        assert_eq!(DEFAULT_LLM_PROVIDER, "openai");

        let base = vec![
            ("PATH".to_string(), "/usr/bin".to_string()),
            // Base values must be overridden, not duplicated.
            ("PORT".to_string(), "9999".to_string()),
            ("JWT_SECRET".to_string(), "leaked-from-parent".to_string()),
        ];
        let env = build_child_env(&base, &json!({}), Path::new("/tmp/eval-state"), "s3cret");

        assert_eq!(env_get(&env, "PATH").as_deref(), Some("/usr/bin"));
        assert_eq!(env_get(&env, "PORT").as_deref(), Some("0"));
        assert_eq!(env_get(&env, "WS_PORT").as_deref(), Some("0"));
        assert_eq!(env_get(&env, "HOST").as_deref(), Some("127.0.0.1"));
        assert_eq!(env_get(&env, "JWT_SECRET").as_deref(), Some("s3cret"));
        assert_eq!(env_get(&env, "LOG_LEVEL").as_deref(), Some("warn"));
        assert_eq!(env_get(&env, "LLM_PROVIDER").as_deref(), Some("openai"));
        assert_eq!(env_get(&env, "__JAIT_CLI").as_deref(), Some("1"));
        assert_eq!(env_get(&env, "JAIT_NODE_ONLY").as_deref(), Some("false"));
        assert_eq!(env_get(&env, "JAIT_PRIMARY_GATEWAY").as_deref(), Some(""));
        assert_eq!(env_get(&env, "JAIT_PRIMARY_TOKEN").as_deref(), Some(""));
        assert_eq!(
            env_get(&env, "JAIT_STATE_DIR").as_deref(),
            Some("/tmp/eval-state")
        );
        assert_eq!(
            env_get(&env, "JAIT_DB_PATH").as_deref(),
            Some("/tmp/eval-state/data/jait.db")
        );
        // Overrides replace in place: no duplicate keys for the child process.
        assert_eq!(env.iter().filter(|(k, _)| k == "PORT").count(), 1);
        assert_eq!(env.iter().filter(|(k, _)| k == "JWT_SECRET").count(), 1);
        // 3 base keys, one of them replaced in place, + 11 new keys.
        assert_eq!(env.len(), 13);
    }

    #[test]
    fn child_env_honours_only_string_backend_setting() {
        assert_eq!(backend_from_settings(&json!({})), "openai");
        assert_eq!(
            backend_from_settings(&json!({"jait_backend": "anthropic"})),
            "anthropic"
        );
        // Non-string (and null) settings fall back to the default provider.
        assert_eq!(backend_from_settings(&json!({"jait_backend": 5})), "openai");
        assert_eq!(
            backend_from_settings(&json!({"jait_backend": null})),
            "openai"
        );
        assert_eq!(
            backend_from_settings(&json!({"jaitBackend": "anthropic"})),
            "openai"
        );

        let env = build_child_env(
            &[],
            &json!({"jait_backend": "anthropic"}),
            Path::new("/s"),
            "jwt",
        );
        assert_eq!(env_get(&env, "LLM_PROVIDER").as_deref(), Some("anthropic"));
    }

    #[test]
    fn ready_line_wire_format_and_classification() {
        assert_eq!(
            ready_line(4100, "tok"),
            "JAIT_EVAL_READY {\"port\":4100,\"token\":\"tok\"}"
        );

        match parse_ready_line("JAIT_EVAL_READY {\"port\":51234,\"token\":\"abc\"}") {
            ReadyLine::Ready(ready) => {
                assert_eq!(ready.port, 51234);
                assert_eq!(ready.token, "abc");
            }
            other => panic!("expected Ready, got {other:?}"),
        }

        assert_eq!(parse_ready_line("listening on 8080"), ReadyLine::NotReady);
        assert_eq!(parse_ready_line("JAIT_EVAL_READY"), ReadyLine::NotReady);
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY not-json"),
            ReadyLine::Invalid
        );
        // Missing / bogus token or port is a handshake failure, never a silent default.
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":80}"),
            ReadyLine::Invalid
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":80,\"token\":7}"),
            ReadyLine::Invalid
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":0,\"token\":\"t\"}"),
            ReadyLine::Invalid
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":-1,\"token\":\"t\"}"),
            ReadyLine::Invalid
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":1.5,\"token\":\"t\"}"),
            ReadyLine::Invalid
        );
        // A prefixed line without a JSON object is invalid, not "keep reading".
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY \"x\""),
            ReadyLine::Invalid
        );
    }

    #[test]
    fn isolation_validation_denies_shared_or_traversing_database_paths() {
        assert_eq!(
            validate_isolation("/tmp/eval-state", "/tmp/eval-state/data/jait.db"),
            Ok(Path::new("/tmp/eval-state/data/jait.db").to_path_buf())
        );

        for (state, db) in [
            // Database outside the isolated state dir would be shared with the parent gateway.
            ("/tmp/eval-state", "/tmp/eval-state/other.db"),
            ("/tmp/eval-state", "/tmp/eval-state/db/jait.db"),
            ("/tmp/eval-state", "/tmp/shared/data/jait.db"),
            // Traversal must not be normalised into acceptance.
            ("/tmp/eval-state", "/tmp/eval-state/../shared/data/jait.db"),
            ("/tmp/eval-state", "/tmp/eval-state/data/../../data/jait.db"),
            ("/tmp/eval-state", ""),
            ("", "/data/jait.db"),
            ("", ""),
        ] {
            assert_eq!(
                validate_isolation(state, db),
                Err("Evaluation database isolation required".to_string()),
                "state={state:?} db={db:?}"
            );
        }
    }

    #[test]
    fn tail_chars_keeps_last_characters_only() {
        assert_eq!(tail_chars("abcdef", 3), "def");
        assert_eq!(tail_chars("abc", 5), "abc");
        assert_eq!(tail_chars("", 4), "");
        assert_eq!(tail_chars("abcdef", 6), "abcdef");
        // Counts characters, not bytes.
        assert_eq!(tail_chars("héllo", 2), "lo");
        assert_eq!(tail_chars("日本語です", 2), "です");
    }
}

mod lib_security_protocols {
    use jait_gateway::security::protocols::{
        AdapterResult, GAP_GATEWAY_OBSERVATION, GAP_HTTP_REDIRECT, GAP_HTTP_SCOPE, GAP_SSH_SCOPE,
        HttpObservation, Severity, SshIdentification, evaluate_http_response,
        evaluate_ssh_identification, hsts_enabled, parse_ssh_identification,
        parse_ssh_identification_line,
    };

    fn http(status_code: u16, secure: bool) -> HttpObservation<'static> {
        HttpObservation {
            status_code,
            secure,
            hsts: None,
            content_type_options: None,
            frame_options: None,
            content_security_policy: None,
        }
    }

    fn rule_ids(result: &AdapterResult) -> Vec<String> {
        result.rules.iter().map(|r| r.rule_id.clone()).collect()
    }

    #[test]
    fn hsts_enabled_requires_positive_max_age_directive() {
        assert!(hsts_enabled(Some("max-age=31536000")));
        assert!(hsts_enabled(Some("MAX-AGE=60")));
        assert!(hsts_enabled(Some("max-age = 86400; includeSubDomains")));
        // Zero / negative / absent max-age is not an active HSTS policy.
        assert!(!hsts_enabled(Some("max-age=0")));
        assert!(!hsts_enabled(Some("max-age=0; includeSubDomains")));
        assert!(!hsts_enabled(Some("includeSubDomains")));
        assert!(!hsts_enabled(Some("max-age=abc")));
        // The directive must start the header value (anchored regex).
        assert!(!hsts_enabled(Some("includeSubDomains; max-age=100")));
        assert!(!hsts_enabled(None));
    }

    #[test]
    fn https_response_without_hsts_raises_low_rule() {
        let observation = HttpObservation {
            content_type_options: Some("nosniff"),
            frame_options: Some("DENY"),
            ..http(200, true)
        };
        let result = evaluate_http_response("example.test", 443, &observation);

        assert_eq!(result.engine, "node-https");
        assert!(result.conclusive);
        assert_eq!(result.evidence.len(), 1);
        let evidence = &result.evidence[0];
        assert_eq!(evidence.target, "example.test");
        assert_eq!(evidence.port, Some(443));
        assert_eq!(evidence.facts["statusCode"], serde_json::json!(200));
        assert_eq!(evidence.facts["transport"], serde_json::json!("https"));
        assert_eq!(evidence.facts["hstsEnabled"], serde_json::json!(false));
        assert_eq!(evidence.facts["noSniff"], serde_json::json!(true));
        assert_eq!(
            evidence.facts["framingPolicyPresent"],
            serde_json::json!(true)
        );
        // The response body is never retained.
        assert_eq!(evidence.facts["bodyRetained"], serde_json::json!(false));

        assert_eq!(rule_ids(&result), vec!["http.hsts".to_string()]);
        let rule = &result.rules[0];
        assert_eq!(rule.severity, Severity::Low);
        assert_eq!(rule.evidence_index, 0);
        assert!(!rule.remediation.is_empty());
        assert!(!rule.rollback.is_empty());
        // Documented scope gaps only: gateway observation + GET-only HTTP scope, no redirect gap.
        assert_eq!(
            result.coverage_gaps,
            vec![
                GAP_GATEWAY_OBSERVATION.to_owned(),
                GAP_HTTP_SCOPE.to_owned()
            ]
        );

        // With HSTS present and other headers sane, no rule fires.
        let hardened = HttpObservation {
            hsts: Some("max-age=31536000"),
            content_type_options: Some("nosniff"),
            content_security_policy: Some("default-src 'self'; frame-ancestors 'none'"),
            ..http(204, true)
        };
        let hardened_result = evaluate_http_response("example.test", 443, &hardened);
        assert!(hardened_result.conclusive);
        assert!(hardened_result.rules.is_empty());
    }

    #[test]
    fn non_2xx_http_response_is_inconclusive_and_flags_redirect() {
        let failure = evaluate_http_response("example.test", 80, &http(500, false));
        assert!(!failure.conclusive);
        assert_eq!(failure.engine, "node-http");
        assert!(failure.rules.is_empty());
        assert_eq!(
            failure.evidence[0].facts["transport"],
            serde_json::json!("http")
        );
        assert_eq!(
            failure.evidence[0].facts["redirectObserved"],
            serde_json::json!(false)
        );
        // A non-2xx answer keeps the two scope gaps but never claims the redirect gap.
        assert_eq!(
            failure.coverage_gaps,
            vec![
                GAP_GATEWAY_OBSERVATION.to_owned(),
                GAP_HTTP_SCOPE.to_owned()
            ]
        );

        let redirect = evaluate_http_response("example.test", 80, &http(302, false));
        assert!(!redirect.conclusive);
        assert_eq!(
            redirect.evidence[0].facts["redirectObserved"],
            serde_json::json!(true)
        );
        // A redirect appends exactly the redirect gap, preserving order.
        assert_eq!(
            redirect.coverage_gaps,
            vec![
                GAP_GATEWAY_OBSERVATION.to_owned(),
                GAP_HTTP_SCOPE.to_owned(),
                GAP_HTTP_REDIRECT.to_owned()
            ]
        );
    }

    #[test]
    fn ssh_identification_only_flags_legacy_protocol() {
        let modern = evaluate_ssh_identification(
            "db.test",
            2222,
            &SshIdentification {
                protocol: "2.0".to_string(),
                software_identifier: "OpenSSH_9.6".to_string(),
            },
        );
        assert_eq!(modern.engine, "node-net-ssh-identification");
        assert!(modern.conclusive);
        assert!(modern.rules.is_empty());
        assert_eq!(modern.evidence.len(), 1);
        assert_eq!(modern.evidence[0].port, Some(2222));
        assert_eq!(
            modern.evidence[0].facts["protocol"],
            serde_json::json!("2.0")
        );
        assert_eq!(
            modern.evidence[0].facts["softwareIdentifier"],
            serde_json::json!("OpenSSH_9.6")
        );
        assert_eq!(
            modern.coverage_gaps,
            vec![GAP_GATEWAY_OBSERVATION.to_owned(), GAP_SSH_SCOPE.to_owned()]
        );
        // Never authenticates: the adapter is banner-only.
        assert_eq!(
            modern.evidence[0].facts["authenticationAttempted"],
            serde_json::json!(false)
        );

        let legacy = evaluate_ssh_identification(
            "db.test",
            22,
            &SshIdentification {
                protocol: "1.99".to_string(),
                software_identifier: "OpenSSH_3.9".to_string(),
            },
        );
        assert_eq!(
            rule_ids(&legacy),
            vec!["ssh.legacy-identification".to_string()]
        );
        assert_eq!(legacy.rules[0].severity, Severity::Medium);
        assert_eq!(legacy.rules[0].evidence_index, 0);
    }

    #[test]
    fn ssh_banner_parsing_ignores_partial_trailing_line() {
        assert_eq!(
            parse_ssh_identification_line("SSH-2.0-OpenSSH_9.6").map(|id| id.protocol),
            Some("2.0".to_string())
        );
        assert!(parse_ssh_identification_line("220 smtp.test ESMTP").is_none());

        // `.slice(0, -1)`: an unterminated line is never inspected.
        assert!(parse_ssh_identification("SSH-2.0-OpenSSH_9.6").is_none());
        let parsed = parse_ssh_identification("SSH-2.0-OpenSSH_9.6\r\n")
            .expect("complete banner line must parse");
        assert_eq!(parsed.protocol, "2.0");
        assert!(parsed.software_identifier.contains("OpenSSH"));

        // First matching complete line wins; junk lines are skipped.
        let first = parse_ssh_identification("garbage\nSSH-2.0-First\r\nSSH-1.5-Second\n")
            .expect("first matching line wins");
        assert_eq!(first.protocol, "2.0");
        assert!(first.software_identifier.contains("First"));
    }
}

mod skills_index {
    use jait_gateway::execution::process_runner::ProcessCancellation;
    use jait_gateway::integrations::skills::{
        MAX_SKILL_BYTES, Skill, SkillSource, format_skills_for_prompt, parse_frontmatter,
        scan_skill_dir, user_skills_dir,
    };
    use std::path::{Path, PathBuf};

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "jait-contract-skills-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("temp root");
        dir
    }

    #[test]
    fn user_skills_dir_requires_absolute_state_override() {
        assert_eq!(
            user_skills_dir(Path::new("/home/ada"), None).expect("default state dir"),
            Path::new("/home/ada/.jait/skills").to_path_buf()
        );
        assert_eq!(
            user_skills_dir(Path::new("/home/ada"), Some("   "))
                .expect("blank override falls back"),
            Path::new("/home/ada/.jait/skills").to_path_buf()
        );
        assert_eq!(
            user_skills_dir(Path::new("/home/ada"), Some("/srv/jait-state"))
                .expect("absolute override"),
            Path::new("/srv/jait-state/skills").to_path_buf()
        );
        // Relative state overrides are rejected rather than resolved against the CWD.
        let err = user_skills_dir(Path::new("/home/ada"), Some("jait-state"))
            .expect_err("relative override must fail");
        assert_eq!(err, "JAIT_STATE_DIR must be an absolute path");
    }

    #[test]
    fn frontmatter_parsing_requires_name_and_description() {
        let fm = parse_frontmatter("---\nname: Deploy\ndescription: Ship the app\n---\nbody\n")
            .expect("valid frontmatter");
        assert_eq!(fm.name.as_deref(), Some("Deploy"));
        assert_eq!(fm.description.as_deref(), Some("Ship the app"));

        // No `---` fence: an empty descriptor, never an error.
        let plain = parse_frontmatter("# Just markdown\n").expect("no frontmatter is fine");
        assert_eq!(plain.name, None);
        assert_eq!(plain.description, None);

        // Unterminated fence is likewise empty, not partially parsed.
        let unterminated = parse_frontmatter("---\nname: Deploy\ndescription: Ship\n").expect("ok");
        assert_eq!(unterminated.name, None);

        // CRLF fences parse the same way.
        let crlf = parse_frontmatter("---\r\nname: Crlf\r\ndescription: Windows\r\n---\r\nbody")
            .expect("crlf frontmatter");
        assert_eq!(crlf.name.as_deref(), Some("Crlf"));
        assert_eq!(crlf.description.as_deref(), Some("Windows"));

        // Byte budget is enforced before parsing.
        let huge = "x".repeat(MAX_SKILL_BYTES + 1);
        assert_eq!(
            parse_frontmatter(&huge).unwrap_err(),
            "Skill document exceeds byte budget"
        );
    }

    #[test]
    fn frontmatter_rejects_yaml_aliases_and_falls_back_to_line_scan() {
        // Aliases/anchors are refused outright (no YAML expansion of untrusted markdown),
        // so the plain line scan supplies name/description.
        let aliased =
            parse_frontmatter("---\nname: &a Alias\ndescription: *a\n---\n").expect("fallback");
        // The raw scalar text survives verbatim; the alias is never expanded to "Alias".
        assert_eq!(aliased.name.as_deref(), Some("&a Alias"));
        assert_eq!(aliased.description.as_deref(), Some("*a"));

        // Malformed YAML still yields the scalar fields via the fallback scanner.
        let broken = parse_frontmatter("---\nname: Plain\ndescription: A skill\n  : broken\n---\n")
            .expect("fallback");
        assert_eq!(broken.name.as_deref(), Some("Plain"));
        assert_eq!(broken.description.as_deref(), Some("A skill"));
        assert_eq!(broken.homepage, None);
        assert!(broken.requires.is_none());
        assert!(broken.install.is_none());
    }

    #[test]
    fn discovery_prompt_only_appears_when_skills_exist() {
        assert_eq!(format_skills_for_prompt(&[]), "");
        let skill = Skill {
            id: "deploy".into(),
            name: "Deploy".into(),
            description: "Ship the app".into(),
            file_path: PathBuf::from("/skills/deploy/SKILL.md"),
            source: SkillSource::User,
            enabled: true,
            requires: None,
            install: None,
        };
        let prompt = format_skills_for_prompt(&[skill]);
        assert!(prompt.starts_with("\n\n<skillDiscovery>\n"));
        assert!(prompt.ends_with("\n</skillDiscovery>"));
        assert!(prompt.contains("Discover skills.search and skills.read with tools.search"));
        // Skills are discovered on demand: no per-skill listing leaks into the prompt.
        assert!(!prompt.contains("deploy"));
    }

    #[test]
    fn scan_skill_dir_keeps_only_well_formed_visible_skills() {
        let root = temp_root("scan");
        // Valid skill.
        std::fs::create_dir_all(root.join("good")).unwrap();
        std::fs::write(
            root.join("good/SKILL.md"),
            "---\nname: Good\ndescription: A good skill\n---\nbody\n",
        )
        .unwrap();
        // Hidden directory is never scanned.
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(
            root.join(".git/SKILL.md"),
            "---\nname: Hidden\ndescription: hidden\n---\n",
        )
        .unwrap();
        // Missing description: rejected.
        std::fs::create_dir_all(root.join("nodesc")).unwrap();
        std::fs::write(root.join("nodesc/SKILL.md"), "---\nname: NoDesc\n---\n").unwrap();
        // No SKILL.md at all: rejected.
        std::fs::create_dir_all(root.join("empty")).unwrap();
        // Oversized document: rejected by the byte budget.
        std::fs::create_dir_all(root.join("huge")).unwrap();
        std::fs::write(
            root.join("huge/SKILL.md"),
            format!(
                "---\nname: Huge\ndescription: {}",
                "x".repeat(MAX_SKILL_BYTES)
            ),
        )
        .unwrap();

        let cancel = ProcessCancellation::default();
        let skills = scan_skill_dir(&root, SkillSource::User, &cancel).expect("scan");
        let ids: Vec<_> = skills.iter().map(|s| s.id.clone()).collect();
        assert_eq!(ids, vec!["good".to_string()]);
        let good = &skills[0];
        assert_eq!(good.name, "Good");
        assert_eq!(good.description, "A good skill");
        assert!(good.enabled);
        assert_eq!(good.source, SkillSource::User);
        assert_eq!(good.file_path, root.join("good/SKILL.md"));

        // Missing root is an empty skill set, not an error.
        assert!(
            scan_skill_dir(&root.join("does-not-exist"), SkillSource::User, &cancel)
                .expect("missing root")
                .is_empty()
        );

        // A cancelled operation must not return partial results.
        let cancelled = ProcessCancellation::default();
        cancelled.cancel();
        assert_eq!(
            scan_skill_dir(&root, SkillSource::User, &cancelled).unwrap_err(),
            "Skill operation cancelled"
        );
        std::fs::remove_dir_all(&root).ok();
    }
}

mod skills_install {
    use jait_gateway::execution::process_runner::ProcessRequest;
    use jait_gateway::integrations::skills::install::{
        render_skill_markdown, slugify_skill_id, tool_install_request,
    };
    use jait_gateway::integrations::skills::{
        MAX_SKILL_BYTES, Skill, SkillInstallSpec, SkillSource, parse_frontmatter,
    };
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::time::Duration;

    fn skill_with(install: Option<Vec<SkillInstallSpec>>) -> Skill {
        Skill {
            id: "deploy".into(),
            name: "Deploy".into(),
            description: "Ship the app".into(),
            file_path: PathBuf::from("/skills/deploy/SKILL.md"),
            source: SkillSource::User,
            enabled: true,
            requires: None,
            install,
        }
    }

    fn host_npm() -> ProcessRequest {
        ProcessRequest {
            argv: vec!["/usr/bin/npm".into()],
            cwd: PathBuf::from("/tmp"),
            environment: HashMap::new(),
            input: None,
            timeout: Duration::from_secs(5),
            output_limit: 1024,
        }
    }

    #[test]
    fn slugify_lowercases_and_collapses_separators() {
        assert_eq!(slugify_skill_id("Deploy Skill"), "deploy-skill");
        assert_eq!(slugify_skill_id("  --Hello,  World!!  "), "hello-world");
        assert_eq!(slugify_skill_id("a_b.c/d"), "a-b-c-d");
        assert_eq!(slugify_skill_id(""), "");
        assert_eq!(slugify_skill_id("!!!"), "");
        assert_eq!(slugify_skill_id("123abc"), "123abc");
        // Truncated to 64 characters.
        assert_eq!(slugify_skill_id(&"a".repeat(80)), "a".repeat(64));
    }

    #[test]
    fn render_markdown_quotes_scalars_and_roundtrips() {
        let rendered =
            render_skill_markdown("  Deploy\nApp ", "Ship   the app", "\n  body line\n").unwrap();
        assert_eq!(
            rendered,
            "---\nname: \"Deploy App\"\ndescription: \"Ship the app\"\n---\n\nbody line\n"
        );
        // Round-trip through the reader: the rendered document is a valid skill document.
        let fm = parse_frontmatter(&rendered).expect("rendered frontmatter parses");
        assert_eq!(fm.name.as_deref(), Some("Deploy App"));
        assert_eq!(fm.description.as_deref(), Some("Ship the app"));

        // Oversized documents are rejected before rendering.
        let err = render_skill_markdown("name", "desc", &"x".repeat(MAX_SKILL_BYTES)).unwrap_err();
        assert_eq!(err, "Skill document exceeds byte budget");
    }

    #[test]
    fn install_request_requires_node_spec_and_host_absolute_npm() {
        let spec = SkillInstallSpec {
            id: Some("cli".into()),
            kind: Some("node".into()),
            package: Some("@example/cli@1.2.3".into()),
            bins: Some(vec!["cli".into()]),
            label: Some("CLI".into()),
        };
        let (package, request) = tool_install_request(
            &skill_with(Some(vec![spec.clone()])),
            Some("cli"),
            host_npm(),
        )
        .expect("valid node install");
        assert_eq!(package, "@example/cli@1.2.3");
        assert_eq!(
            request.argv,
            vec![
                "/usr/bin/npm".to_string(),
                "install".into(),
                "-g".into(),
                "--".into(),
                "@example/cli@1.2.3".into()
            ]
        );
        assert_eq!(request.timeout, Duration::from_secs(180));
        assert_eq!(request.output_limit, 64 * 1024);

        // Unknown install id: refuse, never fall back to another spec.
        assert_eq!(
            tool_install_request(
                &skill_with(Some(vec![spec.clone()])),
                Some("other"),
                host_npm()
            )
            .unwrap_err(),
            "No matching install option for this skill"
        );
        // No install options at all.
        assert_eq!(
            tool_install_request(&skill_with(None), None, host_npm()).unwrap_err(),
            "No matching install option for this skill"
        );
        // Non-node kinds are reported as unsupported instead of being executed.
        let brew = SkillInstallSpec {
            kind: Some("brew".into()),
            package: Some("ripgrep".into()),
            ..spec.clone()
        };
        let err = tool_install_request(&skill_with(Some(vec![brew])), Some("cli"), host_npm())
            .unwrap_err();
        assert!(
            err.starts_with("Unsupported install kind \"brew\"."),
            "{err}"
        );
        assert!(err.contains("cli"), "missing-bin hint preserved: {err}");
    }

    #[test]
    fn install_request_rejects_unsafe_package_specifiers_and_hosts() {
        let make = |package: &str| SkillInstallSpec {
            id: Some("cli".into()),
            kind: Some("node".into()),
            package: Some(package.into()),
            bins: None,
            label: None,
        };
        for package in [
            "--force",
            "-g",
            "https://evil.test/pkg.tgz",
            "file:/etc/passwd",
            "git+ssh://git@evil.test/x",
            "alias@npm:other",
            "pkg; rm -rf /",
            "pkg name",
        ] {
            assert_eq!(
                tool_install_request(&skill_with(Some(vec![make(package)])), None, host_npm())
                    .unwrap_err(),
                "Invalid or unsupported npm package specifier",
                "package={package:?}"
            );
        }
        // Over-long specifiers are rejected as well.
        assert_eq!(
            tool_install_request(
                &skill_with(Some(vec![make(&"a".repeat(257))])),
                None,
                host_npm()
            )
            .unwrap_err(),
            "Invalid or unsupported npm package specifier"
        );

        // An empty package never reaches the npm argv: it degrades to the manual-install hint.
        assert_eq!(
            tool_install_request(&skill_with(Some(vec![make("")])), None, host_npm()).unwrap_err(),
            "Unsupported install kind \"node\". Install required tools manually: "
        );

        // Host must hand over an absolute npm with an absolute cwd and no stdin.
        let mut relative = host_npm();
        relative.argv = vec!["npm".into()];
        assert_eq!(
            tool_install_request(
                &skill_with(Some(vec![make("@example/cli")])),
                None,
                relative
            )
            .unwrap_err(),
            "Host must supply an absolute npm executable/cwd and no stdin"
        );
        let mut extra_arg = host_npm();
        extra_arg.argv.push("--registry".into());
        assert_eq!(
            tool_install_request(
                &skill_with(Some(vec![make("@example/cli")])),
                None,
                extra_arg
            )
            .unwrap_err(),
            "Host must supply an absolute npm executable/cwd and no stdin"
        );
        let mut with_stdin = host_npm();
        with_stdin.input = Some(b"payload".to_vec());
        assert_eq!(
            tool_install_request(
                &skill_with(Some(vec![make("@example/cli")])),
                None,
                with_stdin
            )
            .unwrap_err(),
            "Host must supply an absolute npm executable/cwd and no stdin"
        );
        let mut relative_cwd = host_npm();
        relative_cwd.cwd = PathBuf::from("tmp");
        assert_eq!(
            tool_install_request(
                &skill_with(Some(vec![make("@example/cli")])),
                None,
                relative_cwd
            )
            .unwrap_err(),
            "Host must supply an absolute npm executable/cwd and no stdin"
        );
    }
}

mod voice_assistant_tools {
    use jait_gateway::voice::VoiceFuture;
    use jait_gateway::voice_assistant::tools::{
        BackgroundTask, BackgroundTasks, CancelTask, ConsentExecutor, RegistryTool, TaskStatus,
        ToolContext, ToolResult, ToolSchema, execute_registry, schemas,
    };
    use serde_json::{Value, json};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn schema(name: &str) -> ToolSchema {
        ToolSchema {
            kind: "function".into(),
            name: name.into(),
            description: format!("{name} tool"),
            parameters: json!({"type":"object"}),
        }
    }

    fn registry_tool(name: &str, external: bool) -> RegistryTool {
        RegistryTool {
            schema: schema(name),
            external,
        }
    }

    fn task(id: &str) -> BackgroundTask {
        BackgroundTask {
            id: id.into(),
            title: format!("task {id}"),
            thread_id: "thread".into(),
            session_id: None,
            provider_id: "codex".into(),
            status: TaskStatus::Running,
            cancelled: false,
            result: None,
            error: None,
            started_at: 7,
        }
    }

    struct CountingCancel(Arc<AtomicUsize>);
    impl CancelTask for CountingCancel {
        fn cancel(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[test]
    fn schemas_expose_only_trusted_registry_tools() {
        let builtins = vec![schema("voice_status")];
        let merged = schemas(
            &builtins,
            vec![
                // External (MCP-style) tools are never handed to the model.
                registry_tool("mcp_tool", true),
                // Builtin names cannot be shadowed by a registry tool.
                registry_tool("voice_status", false),
                registry_tool("read_file", false),
            ],
        );
        let names: Vec<_> = merged.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["voice_status", "read_file"]);
        // The builtin definition wins on collision.
        assert_eq!(merged[0].description, "voice_status tool");
        assert_eq!(merged[1].kind, "function");
        // Empty registry returns the builtins unchanged.
        assert_eq!(schemas(&builtins, vec![]).len(), 1);
    }

    #[test]
    fn registration_enforces_duplicates_capacity_and_metadata_budget() {
        let mut tasks = BackgroundTasks::new(2);
        tasks.register(task("a"), None).expect("first");
        assert_eq!(
            tasks.register(task("a"), None).unwrap_err(),
            "Duplicate background task"
        );
        tasks.register(task("b"), None).expect("second");
        assert_eq!(
            tasks.register(task("c"), None).unwrap_err(),
            "Background task capacity reached"
        );

        let mut oversized = BackgroundTasks::new(1);
        let mut big_title = task("big");
        big_title.title = "t".repeat(8193);
        assert_eq!(
            oversized.register(big_title, None).unwrap_err(),
            "Background task metadata too large"
        );
        let mut big_id = task(&"i".repeat(513));
        big_id.title = "ok".into();
        assert_eq!(
            oversized.register(big_id, None).unwrap_err(),
            "Background task metadata too large"
        );
        // Rejected registrations never consume capacity.
        assert!(oversized.list().is_empty());
        assert!(oversized.register(task("ok"), None).is_ok());
    }

    #[test]
    fn cancel_and_late_finish_cannot_resurrect_a_task() {
        let signals = Arc::new(AtomicUsize::new(0));
        let mut tasks = BackgroundTasks::new(4);
        tasks
            .register(task("a"), Some(Box::new(CountingCancel(signals.clone()))))
            .expect("register");

        assert!(tasks.cancel("a"));
        assert_eq!(signals.load(Ordering::SeqCst), 1);
        let cancelled = tasks.get("a").expect("present");
        assert_eq!(cancelled.status, TaskStatus::Cancelled);
        assert!(cancelled.cancelled);

        // Idempotent cancel: a non-running task is not signalled twice.
        assert!(!tasks.cancel("a"));
        assert_eq!(signals.load(Ordering::SeqCst), 1);
        assert!(!tasks.cancel("missing"));

        // A late provider completion is dropped instead of overwriting the cancel.
        assert_eq!(tasks.finish("a", Ok("late".into())), Ok(false));
        assert_eq!(
            tasks.get("a").expect("present").status,
            TaskStatus::Cancelled
        );
        assert!(tasks.get("a").expect("present").result.is_none());
        assert_eq!(tasks.finish("missing", Ok("x".into())), Ok(false));

        // Completion of a running task records the result and clears the handle.
        let signals2 = Arc::new(AtomicUsize::new(0));
        tasks
            .register(task("b"), Some(Box::new(CountingCancel(signals2.clone()))))
            .expect("register b");
        assert_eq!(tasks.finish("b", Ok("done".into())), Ok(true));
        let done = tasks.get("b").expect("present");
        assert_eq!(done.status, TaskStatus::Completed);
        assert_eq!(done.result.as_deref(), Some("done"));
        assert!(done.error.is_none());
        // Handle consumed: a later cancel does not signal a completed task.
        assert!(!tasks.cancel("b"));
        assert_eq!(signals2.load(Ordering::SeqCst), 0);

        // Failures are recorded separately from results.
        tasks.register(task("c"), None).expect("register c");
        assert_eq!(tasks.finish("c", Err("boom".into())), Ok(true));
        assert_eq!(tasks.get("c").expect("present").status, TaskStatus::Error);
        assert_eq!(
            tasks.get("c").expect("present").error.as_deref(),
            Some("boom")
        );
    }

    #[test]
    fn oversized_results_are_refused_and_clear_cancels_running_tasks() {
        let mut tasks = BackgroundTasks::new(4);
        tasks.register(task("big"), None).expect("register");
        assert_eq!(
            tasks
                .finish("big", Ok("r".repeat(256 * 1024 + 1)))
                .unwrap_err(),
            "Background result too large"
        );
        // Rejected completion leaves the task running.
        assert_eq!(
            tasks.get("big").expect("present").status,
            TaskStatus::Running
        );
        assert_eq!(
            tasks
                .finish("big", Err("e".repeat(256 * 1024 + 1)))
                .unwrap_err(),
            "Background result too large"
        );
        // Exactly at the budget is allowed.
        assert_eq!(tasks.finish("big", Ok("r".repeat(256 * 1024))), Ok(true));

        let signals = Arc::new(AtomicUsize::new(0));
        tasks
            .register(task("run"), Some(Box::new(CountingCancel(signals.clone()))))
            .expect("register run");
        tasks.register(task("idle"), None).expect("register idle");
        assert_eq!(tasks.finish("idle", Ok("ok".into())), Ok(true));
        // `clear` is the shutdown path: running tasks are signalled once, then every
        // entry (running or finished) is dropped so nothing can be resumed.
        tasks.clear();
        assert_eq!(signals.load(Ordering::SeqCst), 1);
        assert!(tasks.get("run").is_none());
        assert!(tasks.get("idle").is_none());
        assert!(tasks.list().is_empty());

        // `remove` cancels and forgets, preserving order for the survivors.
        let mut ordered = BackgroundTasks::new(4);
        ordered.register(task("1"), None).expect("1");
        ordered.register(task("2"), None).expect("2");
        ordered.remove("1");
        assert!(ordered.get("1").is_none());
        assert_eq!(
            ordered
                .list()
                .iter()
                .map(|t| t.id.as_str())
                .collect::<Vec<_>>(),
            vec!["2"]
        );
    }

    #[test]
    fn late_audio_is_suppressed_and_transcripts_are_normalised() {
        let mut session = jait_gateway::voice_assistant::RealtimeSession::default();
        session.opened(json!({}));
        // A provider delta starts a response and is forwarded.
        let effects = session
            .provider(&json!({"type":"response.audio.delta","delta":"AA=="}))
            .expect("delta");
        assert_eq!(
            effects,
            vec![
                jait_gateway::voice_assistant::Effect::Client(
                    json!({"type":"audio","data":"AA=="})
                ),
                jait_gateway::voice_assistant::Effect::Client(
                    json!({"type":"status","status":"speaking"})
                ),
            ]
        );
        // User speech interrupts: cancel is requested and audio suppressed.
        let interrupt = session
            .provider(&json!({"type":"input_audio_buffer.speech_started"}))
            .expect("speech");
        assert_eq!(interrupt.len(), 3);
        assert_eq!(
            interrupt[0],
            jait_gateway::voice_assistant::Effect::Provider(json!({"type":"response.cancel"}))
        );
        // Late audio for the cancelled response produces no client audio.
        assert!(
            session
                .provider(&json!({"type":"response.audio.delta","delta":"BB=="}))
                .expect("late delta")
                .is_empty()
        );
        // Transcript normalisation applies to user speech ("jade" -> "Jait").
        assert_eq!(
            session
                .provider(&json!({"type":"conversation.item.input_audio_transcription.completed","transcript":"hey jade"}))
                .expect("transcript"),
            vec![jait_gateway::voice_assistant::Effect::Client(
                json!({"type":"transcript","role":"user","text":"hey Jait","final":true})
            )]
        );
    }

    struct StubHost {
        result: std::sync::Mutex<Option<(bool, String, Option<Value>)>>,
        seen_name: std::sync::Mutex<String>,
    }

    impl ConsentExecutor for StubHost {
        fn execute<'a>(
            &'a self,
            name: &'a str,
            arguments: Value,
            context: ToolContext,
        ) -> VoiceFuture<'a, ToolResult> {
            Box::pin(async move {
                *self.seen_name.lock().unwrap() =
                    format!("{name}:{}:{}", arguments, context.user_id);
                let (ok, message, data) = self.result.lock().unwrap().clone().expect("stub result");
                Ok(ToolResult { ok, message, data })
            })
        }
    }

    fn host(ok: bool, message: &str, data: Option<Value>) -> StubHost {
        StubHost {
            result: std::sync::Mutex::new(Some((ok, message.into(), data))),
            seen_name: std::sync::Mutex::new(String::new()),
        }
    }

    fn context() -> ToolContext {
        ToolContext {
            session_id: "s".into(),
            action_id: "a".into(),
            project_root: "/repo".into(),
            requested_by: "user".into(),
            user_id: "u1".into(),
            api_keys: Default::default(),
        }
    }

    #[tokio::test]
    async fn execute_registry_validates_input_and_formats_results() {
        let ok_host = host(true, "done", Some(json!({"k":1})));
        assert_eq!(
            execute_registry(&ok_host, "read_file", json!({"path":"a"}), context()).await,
            "done\n{\"k\":1}"
        );
        assert_eq!(
            *ok_host.seen_name.lock().unwrap(),
            "read_file:{\"path\":\"a\"}:u1"
        );

        // Non-object arguments never reach the host.
        let untouched = host(true, "never", None);
        assert_eq!(
            execute_registry(&untouched, "read_file", json!("raw"), context()).await,
            "Tool blocked: arguments must be an object"
        );
        assert_eq!(*untouched.seen_name.lock().unwrap(), "");

        // Oversized names are refused before dispatch.
        let untouched2 = host(true, "never", None);
        assert_eq!(
            execute_registry(&untouched2, &"n".repeat(257), json!({}), context()).await,
            "Tool blocked: voice tool input too large"
        );
        assert_eq!(*untouched2.seen_name.lock().unwrap(), "");
    }

    #[tokio::test]
    async fn execute_registry_preserves_blocked_and_oversized_results() {
        let denied = host(false, "consent required", None);
        assert_eq!(
            execute_registry(&denied, "run_command", json!({}), context()).await,
            "Tool blocked: consent required"
        );
        let big = host(true, &"x".repeat(256 * 1024 + 1), None);
        assert_eq!(
            execute_registry(&big, "read_file", json!({}), context()).await,
            "Tool error: voice tool result too large"
        );
        let plain = host(true, "just a message", None);
        assert_eq!(
            execute_registry(&plain, "read_file", json!({}), context()).await,
            "just a message"
        );
    }
}

mod os_control_resolver {
    use futures_util::future::BoxFuture;
    use jait_gateway::integrations::os_control::contracts::{
        OsClickOptions, OsControlDriver, OsDriverType, OsExecOptions, OsKeyOptions, OsScreenshot,
        OsScrollOptions, OsTypeOptions, SandboxRunResult,
    };
    use jait_gateway::integrations::os_control::resolver::{
        OsControlResolver, OsDriverFactory, OsSandboxConnection, OsSandboxInfo, OsSandboxSource,
        ResolverError, WindowsSshConfig,
    };
    use serde_json::{Value, json};
    use std::sync::{Arc, Mutex};

    struct FakeDriver;
    impl OsControlDriver for FakeDriver {
        type Error = String;
        fn os_type(&self) -> OsDriverType {
            OsDriverType::LinuxDesktop
        }
        fn screenshot(&self) -> BoxFuture<'_, Result<OsScreenshot, String>> {
            Box::pin(async { Err("no os control in contract tests".into()) })
        }
        fn click(
            &self,
            _: f64,
            _: f64,
            _: Option<OsClickOptions>,
        ) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async { Err("no os control in contract tests".into()) })
        }
        fn mouse_move(&self, _: f64, _: f64) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async { Err("no os control in contract tests".into()) })
        }
        fn r#type<'a>(
            &'a self,
            _: &'a str,
            _: Option<OsTypeOptions>,
        ) -> BoxFuture<'a, Result<(), String>> {
            Box::pin(async { Err("no os control in contract tests".into()) })
        }
        fn key<'a>(
            &'a self,
            _: &'a str,
            _: Option<OsKeyOptions>,
        ) -> BoxFuture<'a, Result<(), String>> {
            Box::pin(async { Err("no os control in contract tests".into()) })
        }
        fn scroll(&self, _: Option<OsScrollOptions>) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async { Err("no os control in contract tests".into()) })
        }
        fn exec<'a>(
            &'a self,
            _: &'a str,
            _: Option<OsExecOptions>,
        ) -> BoxFuture<'a, Result<SandboxRunResult, String>> {
            Box::pin(async { Err("no os control in contract tests".into()) })
        }
    }

    struct Source(Vec<OsSandboxInfo>);
    impl OsSandboxSource for Source {
        fn list_running_os_sandboxes(
            &self,
        ) -> BoxFuture<'_, Result<Vec<OsSandboxInfo>, ResolverError>> {
            let infos = self.0.clone();
            Box::pin(async move { Ok(infos) })
        }
    }

    #[derive(Default)]
    struct RecordingFactory {
        calls: Mutex<Vec<String>>,
        fail: Option<&'static str>,
    }
    impl OsDriverFactory<FakeDriver> for RecordingFactory {
        fn linux_desktop(
            &self,
            _manager: Arc<dyn OsSandboxSource>,
            name: &str,
        ) -> Result<FakeDriver, ResolverError> {
            self.calls.lock().unwrap().push(format!("linux:{name}"));
            match self.fail {
                Some(message) => Err(ResolverError::Message(message.into())),
                None => Ok(FakeDriver),
            }
        }
        fn windows(
            &self,
            name: &str,
            username: &str,
            password: Option<&str>,
        ) -> Result<FakeDriver, ResolverError> {
            self.calls.lock().unwrap().push(format!(
                "windows:{name}:{username}:{}",
                password.unwrap_or("-")
            ));
            match self.fail {
                Some(message) => Err(ResolverError::Message(message.into())),
                None => Ok(FakeDriver),
            }
        }
    }

    fn info(name: &str, kind: OsDriverType, running: bool) -> OsSandboxInfo {
        OsSandboxInfo {
            container_name: name.into(),
            r#type: kind,
            running,
            vnc_port: None,
            novnc_port: None,
            rdp_port: None,
            web_viewer_port: None,
            ssh_port: None,
        }
    }

    fn resolver(
        infos: Vec<OsSandboxInfo>,
        ssh: WindowsSshConfig,
    ) -> (OsControlResolver<FakeDriver>, Arc<RecordingFactory>) {
        let factory = Arc::new(RecordingFactory::default());
        let resolver = OsControlResolver::new(
            Arc::new(Source(infos)),
            factory.clone() as Arc<dyn OsDriverFactory<FakeDriver>>,
            ssh,
        );
        (resolver, factory)
    }

    async fn denial<F, T>(fut: F) -> String
    where
        F: std::future::Future<Output = Result<T, ResolverError>>,
    {
        message(fut.await.err().expect("expected a resolver refusal"))
    }

    fn message(err: ResolverError) -> String {
        match err {
            ResolverError::Message(m) => m,
            other => panic!("unexpected resolver error variant: {other:?}"),
        }
    }

    #[tokio::test]
    async fn named_sandbox_resolution_denies_unknown_and_stopped() {
        let (r, factory) = resolver(
            vec![
                info("desk", OsDriverType::LinuxDesktop, true),
                info("stopped", OsDriverType::LinuxDesktop, false),
            ],
            WindowsSshConfig::default(),
        );

        let binding = r
            .resolve(Some("desk"))
            .await
            .expect("known running sandbox");
        assert_eq!(binding.container_name, "desk");
        assert_eq!(binding.r#type, OsDriverType::LinuxDesktop);
        assert_eq!(*factory.calls.lock().unwrap(), vec!["linux:desk"]);

        // The name is trimmed before matching, matching the TS resolver.
        let trimmed = r.resolve(Some("  desk \n")).await.expect("trimmed name");
        assert_eq!(trimmed.container_name, "desk");

        // Security negative: an unknown container name is refused, never
        // defaulting to some other running sandbox.
        assert_eq!(
            denial(r.resolve(Some("ghost"))).await,
            "No OS sandbox named \"ghost\" was found. Start one first (see os.sandbox list) and try again."
        );
        // Present but not running is a different refusal.
        assert_eq!(
            denial(r.resolve(Some("stopped"))).await,
            "OS sandbox \"stopped\" is not running. Start it first."
        );
        // Refusals never reach the driver factory.
        assert_eq!(
            *factory.calls.lock().unwrap(),
            vec!["linux:desk", "linux:desk"]
        );
    }

    #[tokio::test]
    async fn default_selection_uses_last_running_and_denies_when_none_run() {
        let (r, factory) = resolver(
            vec![
                info("a", OsDriverType::LinuxDesktop, true),
                info("b", OsDriverType::Windows, false),
                info("c", OsDriverType::Windows, true),
                info("d", OsDriverType::LinuxDesktop, false),
            ],
            WindowsSshConfig {
                username: Some("admin".into()),
                password: Some("pw".into()),
            },
        );
        // `resolve(None)` picks the last *running* sandbox (c), skipping d.
        let binding = r.resolve(None).await.expect("last running");
        assert_eq!(binding.container_name, "c");
        assert_eq!(binding.r#type, OsDriverType::Windows);
        assert_eq!(*factory.calls.lock().unwrap(), vec!["windows:c:admin:pw"]);
        // Blank names are treated as "no name given".
        assert_eq!(
            r.resolve(Some("   ")).await.expect("blank").container_name,
            "c"
        );

        let (empty, empty_factory) = resolver(
            vec![info("idle", OsDriverType::LinuxDesktop, false)],
            WindowsSshConfig::default(),
        );
        assert_eq!(
            denial(empty.resolve(None)).await,
            "No OS sandbox is running. Start a Linux desktop or Windows sandbox first, or pass a containerName."
        );
        assert!(empty_factory.calls.lock().unwrap().is_empty());

        // Windows credentials default to the dockur user and no password.
        let (win, win_factory) = resolver(
            vec![info("vm", OsDriverType::Windows, true)],
            WindowsSshConfig::default(),
        );
        win.resolve(Some("vm")).await.expect("windows sandbox");
        assert_eq!(
            *win_factory.calls.lock().unwrap(),
            vec!["windows:vm:docker:-"]
        );
    }

    #[tokio::test]
    async fn list_sandboxes_filters_stopped_and_serialises_default_ports() {
        let (r, _) = resolver(
            vec![
                info("desk", OsDriverType::LinuxDesktop, true),
                info("gone", OsDriverType::LinuxDesktop, false),
                info("vm", OsDriverType::Windows, true),
            ],
            WindowsSshConfig::default(),
        );
        let listed = r.list_sandboxes().await.expect("list");
        let json = serde_json::to_value(&listed).expect("serialisable");
        assert_eq!(
            json,
            json!([
                {"type":"linux-desktop","containerName":"desk","display":":99","vncPort":5900,"novncPort":6080},
                {"type":"windows","containerName":"vm","rdpPort":3389,"webViewerPort":8006,"sshPort":2222},
            ])
        );
        assert!(matches!(
            &listed[0],
            OsSandboxConnection::LinuxDesktop { display, .. } if *display == ":99"
        ));
        let values: Vec<Value> = serde_json::to_value(&listed)
            .unwrap()
            .as_array()
            .unwrap()
            .clone();
        assert_eq!(values.len(), 2);
    }

    #[tokio::test]
    async fn factory_refusal_propagates_without_binding() {
        let factory = Arc::new(RecordingFactory {
            calls: Mutex::new(Vec::new()),
            fail: Some("Windows VM driver is not available on this host"),
        });
        let r = OsControlResolver::new(
            Arc::new(Source(vec![info("vm", OsDriverType::Windows, true)])),
            factory.clone() as Arc<dyn OsDriverFactory<FakeDriver>>,
            WindowsSshConfig::default(),
        );
        assert_eq!(
            denial(r.resolve(None)).await,
            "Windows VM driver is not available on this host"
        );
        // The factory was consulted exactly once and no driver was handed out.
        assert_eq!(*factory.calls.lock().unwrap(), vec!["windows:vm:docker:-"]);
    }
}

mod os_control_linux_desktop_driver {
    use base64::Engine as _;
    use futures_util::future::BoxFuture;
    use jait_gateway::integrations::os_control::contracts::{
        MouseButton, OsClickOptions, OsControlDriver, OsExecOptions, OsKeyOptions, OsScrollOptions,
        OsTypeOptions, SandboxRunResult, ScrollDirection,
    };
    use jait_gateway::integrations::os_control::linux_desktop::{
        LinuxDesktopOsControlDriver, LinuxDesktopShell, build_xdotool_keys, decode_base64, png_size,
    };
    use std::collections::BTreeMap;
    use std::sync::{Arc, Mutex};

    struct RecordingShell {
        commands: Mutex<Vec<(String, u64)>>,
        reply: (bool, String, Option<f64>),
    }

    impl RecordingShell {
        fn new(ok: bool, output: &str, exit_code: Option<f64>) -> Arc<Self> {
            Arc::new(Self {
                commands: Mutex::new(Vec::new()),
                reply: (ok, output.to_string(), exit_code),
            })
        }
        fn take(&self) -> Vec<(String, u64)> {
            std::mem::take(&mut *self.commands.lock().unwrap())
        }
        fn only_command(&self) -> (String, u64) {
            let all = self.take();
            assert_eq!(
                all.len(),
                1,
                "exactly one shell command expected, got {all:?}"
            );
            all.into_iter().next().unwrap()
        }
    }

    impl LinuxDesktopShell for RecordingShell {
        fn exec_shell<'a>(
            &'a self,
            container_name: &'a str,
            command: &'a str,
            timeout_ms: u64,
        ) -> BoxFuture<'a, Result<SandboxRunResult, String>> {
            self.commands
                .lock()
                .unwrap()
                .push((command.to_string(), timeout_ms));
            let (ok, output, exit_code) = self.reply.clone();
            let container_name = container_name.to_string();
            Box::pin(async move {
                Ok(SandboxRunResult {
                    ok,
                    output,
                    exit_code,
                    timed_out: false,
                    container_name,
                })
            })
        }
    }

    fn driver(shell: &Arc<RecordingShell>) -> LinuxDesktopOsControlDriver {
        LinuxDesktopOsControlDriver::new(shell.clone(), "jait-desktop")
    }

    #[tokio::test]
    async fn pointer_and_scroll_commands_are_pinned() {
        let shell = RecordingShell::new(true, "", Some(0.0));
        let d = driver(&shell);
        assert_eq!(d.display(), ":99");
        assert_eq!(d.container_name(), "jait-desktop");

        d.click(10.4, 20.4, None).await.expect("click");
        assert_eq!(
            shell.only_command(),
            (
                "DISPLAY=:99 xdotool mousemove 10 20 click --repeat 1 1".to_string(),
                15_000
            )
        );

        d.click(
            0.0,
            0.0,
            Some(OsClickOptions {
                button: Some(MouseButton::Right),
                clicks: Some(3.0),
            }),
        )
        .await
        .expect("right click");
        assert_eq!(
            shell.only_command(),
            (
                "DISPLAY=:99 xdotool mousemove 0 0 click --repeat 3 3".to_string(),
                15_000
            )
        );

        // Sub-1 click counts clamp up to a single click instead of vanishing.
        d.click(
            1.0,
            1.0,
            Some(OsClickOptions {
                button: Some(MouseButton::Middle),
                clicks: Some(0.25),
            }),
        )
        .await
        .expect("middle click");
        assert_eq!(
            shell.only_command(),
            (
                "DISPLAY=:99 xdotool mousemove 1 1 click --repeat 1 2".to_string(),
                15_000
            )
        );

        d.mouse_move(-5.5, 7.4).await.expect("move");
        assert_eq!(
            shell.only_command(),
            ("DISPLAY=:99 xdotool mousemove -5 7".to_string(), 15_000)
        );

        d.scroll(None).await.expect("scroll default");
        assert_eq!(
            shell.only_command(),
            ("DISPLAY=:99 xdotool click --repeat 1 5".to_string(), 15_000)
        );

        d.scroll(Some(OsScrollOptions {
            x: Some(4.4),
            y: Some(9.6),
            direction: Some(ScrollDirection::Up),
            amount: Some(2.6),
        }))
        .await
        .expect("scroll up at point");
        assert_eq!(
            shell.only_command(),
            (
                "DISPLAY=:99 xdotool mousemove 4 10 click --repeat 3 4".to_string(),
                15_000
            )
        );

        // A half-specified position must not emit a mousemove.
        d.scroll(Some(OsScrollOptions {
            x: Some(1.0),
            y: None,
            direction: Some(ScrollDirection::Left),
            amount: Some(0.2),
        }))
        .await
        .expect("scroll left");
        assert_eq!(
            shell.only_command(),
            ("DISPLAY=:99 xdotool click --repeat 1 5".to_string(), 15_000)
        );
    }

    #[tokio::test]
    async fn typed_text_is_escaped_for_the_shell_and_xdotool() {
        let shell = RecordingShell::new(true, "", Some(0.0));
        let d = driver(&shell);
        d.r#type("it's \"q\" $HOME `id` \\ end\nnext", None)
            .await
            .expect("type");
        assert_eq!(
            shell.only_command(),
            (
                "DISPLAY=:99 xdotool type --delay 12 \"it's \\\"q\\\" \\$HOME \\`id\\` \\\\ end\\nnext\""
                    .to_string(),
                15_000
            )
        );

        let custom = LinuxDesktopOsControlDriver::new(shell.clone(), "box").with_display(":1");
        assert_eq!(custom.display(), ":1");
        custom
            .r#type(
                "ok",
                Some(OsTypeOptions {
                    delay_ms: Some(-40.0),
                }),
            )
            .await
            .expect("negative delay clamps to zero");
        assert_eq!(
            shell.only_command(),
            (
                "DISPLAY=:1 xdotool type --delay 0 \"ok\"".to_string(),
                15_000
            )
        );

        custom
            .r#type(
                "x",
                Some(OsTypeOptions {
                    delay_ms: Some(25.6),
                }),
            )
            .await
            .expect("rounded delay");
        assert_eq!(
            shell.only_command(),
            (
                "DISPLAY=:1 xdotool type --delay 26 \"x\"".to_string(),
                15_000
            )
        );
    }

    #[tokio::test]
    async fn key_combos_map_to_xdotool_keysyms_and_reject_empty_combos() {
        assert_eq!(
            build_xdotool_keys("Ctrl + Shift + T "),
            vec!["ctrl", "shift", "t"]
        );
        assert_eq!(
            build_xdotool_keys("Meta+PageDown"),
            vec!["super", "Page_Down"]
        );
        assert_eq!(
            build_xdotool_keys("control + alt + enter"),
            vec!["ctrl", "alt", "Return"]
        );
        assert_eq!(build_xdotool_keys("ctrl++a"), vec!["ctrl", "a"]);
        // Unknown key names fall through lowercased (TS `toLowerCase` on every token).
        assert_eq!(build_xdotool_keys("F5"), vec!["f5"]);
        assert!(build_xdotool_keys("   ").is_empty());

        let shell = RecordingShell::new(true, "", Some(0.0));
        let d = driver(&shell);
        d.key("ctrl+shift+t", None).await.expect("combo");
        assert_eq!(
            shell.only_command(),
            ("DISPLAY=:99 xdotool key ctrl shift t".to_string(), 15_000)
        );

        d.key(
            "enter",
            Some(OsKeyOptions {
                hold_ms: Some(500.0),
            }),
        )
        .await
        .expect("held key");
        assert_eq!(
            shell.only_command(),
            (
                "DISPLAY=:99 xdotool keydown Return; sleep 0.500; DISPLAY=:99 xdotool keyup Return"
                    .to_string(),
                15_000
            )
        );

        // Security negative: an empty combo refuses instead of typing anything.
        assert_eq!(
            d.key("   ", None).await.expect_err("empty combo"),
            "os.keyboard: empty or invalid combo \"   \""
        );
        assert!(shell.take().is_empty());
    }

    #[tokio::test]
    async fn exec_prefixes_env_and_cwd_with_shell_quoting() {
        let shell = RecordingShell::new(true, "uid\n", Some(0.0));
        let d = driver(&shell);

        let plain = d.exec("ls -la", None).await.expect("plain exec");
        assert_eq!(plain.output, "uid\n");
        assert_eq!(plain.container_name, "jait-desktop");
        assert!(!plain.timed_out);
        assert_eq!(shell.only_command(), ("ls -la".to_string(), 30_000));

        let mut env = BTreeMap::new();
        env.insert("B".to_string(), "2".to_string());
        env.insert("A".to_string(), "it's".to_string());
        d.exec(
            "id -u",
            Some(OsExecOptions {
                cwd: Some("/tmp/it's \"$(id)\"".to_string()),
                env: Some(env),
                timeout_ms: Some(-5.0),
            }),
        )
        .await
        .expect("quoted exec");
        // Env keys are sorted, single quotes are escaped, so the injected
        // `$(id)` stays a literal path component rather than running.
        assert_eq!(
            shell.only_command(),
            (
                "A='it'\\''s' B='2' cd '/tmp/it'\\''s \"$(id)\"' && id -u".to_string(),
                0
            )
        );

        d.exec(
            "pwd",
            Some(OsExecOptions {
                cwd: None,
                env: Some(BTreeMap::new()),
                timeout_ms: Some(5_000.0),
            }),
        )
        .await
        .expect("empty env");
        assert_eq!(shell.only_command(), ("pwd".to_string(), 5_000));
    }

    #[tokio::test]
    async fn preflight_reports_missing_desktop_tooling() {
        let shell = RecordingShell::new(false, "missing:import\r\nmissing:xdotool\n", Some(1.0));
        let d = driver(&shell);
        assert_eq!(
            d.preflight().await.expect_err("missing tools"),
            "Linux desktop sandbox is missing tools required for OS control: missing:import, missing:xdotool. Rebuild the sandbox image from docker/Dockerfile.linux-desktop."
        );
        assert_eq!(
            shell.only_command(),
            (
                "for t in import xdotool; do command -v \"$t\" >/dev/null 2>&1 || echo \"missing:$t\"; done"
                    .to_string(),
                15_000
            )
        );

        let broken = RecordingShell::new(false, "bash: xdotool: not found\n", Some(127.0));
        assert_eq!(
            driver(&broken)
                .preflight()
                .await
                .expect_err("probe failure"),
            "Failed to probe container tools: bash: xdotool: not found\n"
        );

        let healthy = RecordingShell::new(true, "", Some(0.0));
        driver(&healthy).preflight().await.expect("tools present");
    }

    #[tokio::test]
    async fn screenshot_decodes_png_and_refuses_broken_captures() {
        let mut png = vec![0x89, 0x50, 0x4e, 0x47];
        png.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        png.extend_from_slice(&800u32.to_be_bytes());
        png.extend_from_slice(&600u32.to_be_bytes());
        let encoded = base64::engine::general_purpose::STANDARD.encode(&png);

        let shell = RecordingShell::new(true, &encoded, Some(0.0));
        let shot = driver(&shell).screenshot().await.expect("screenshot");
        assert_eq!((shot.width, shot.height), (800.0, 600.0));
        assert_eq!(shot.png.0, png);
        assert_eq!(
            shell.only_command(),
            (
                "DISPLAY=:99 import -window root /tmp/jait-os-screenshot.png 2>/dev/null; if [ ! -s /tmp/jait-os-screenshot.png ]; then echo \"__NO_SCREENSHOT__\"; exit 3; fi; base64 -w0 /tmp/jait-os-screenshot.png 2>/dev/null || base64 /tmp/jait-os-screenshot.png"
                    .to_string(),
                30_000
            )
        );

        let empty = RecordingShell::new(true, "__NO_SCREENSHOT__\n", Some(3.0));
        assert_eq!(
            driver(&empty).screenshot().await.expect_err("no capture"),
            "os.screenshot failed inside the sandbox (exit 3): __NO_SCREENSHOT__"
        );

        let no_exit = RecordingShell::new(false, "", None);
        assert_eq!(
            driver(&no_exit)
                .screenshot()
                .await
                .expect_err("no exit code"),
            "os.screenshot failed inside the sandbox (exit undefined): no image produced"
        );
    }

    #[test]
    fn png_and_base64_helpers_reject_garbage() {
        assert_eq!(png_size(&[]), (0.0, 0.0));
        assert_eq!(png_size(&[0u8; 24]), (0.0, 0.0));
        assert_eq!(decode_base64(" aGk=\n\t"), b"hi".to_vec());
        assert_eq!(decode_base64("!!!!"), Vec::<u8>::new());
        assert_eq!(decode_base64(""), Vec::<u8>::new());
    }
}
