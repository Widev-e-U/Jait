//! Consumer-level contract evidence for the NATIVE Rust port of the `cli`
//! component `packages/gateway/src/cli/doctor.ts`
//! (`jait_gateway::cli_doctor`).
//!
//! The doctor is driven by the embedding CLI, so the pinned contract is the
//! data-and-reporting surface the CLI consumes: `.env` candidate resolution
//! order, host-configuration validation refusals, the rendered report text
//! (PASS/WARN/FAIL markers, hints, summary), the process exit code, and the
//! serialized JSON shape.

use std::path::{Path, PathBuf};

use jait_gateway::cli_doctor::{
    self, DoctorCheck, DoctorConfig, DoctorResult, DoctorStatus, Observation, Remediation,
};

fn valid_config() -> DoctorConfig {
    DoctorConfig {
        cwd: PathBuf::from("/home/dev/project"),
        jait_dir: PathBuf::from("/home/dev/.jait"),
        env_path: Some(PathBuf::from("/home/dev/project/.env.local")),
        port: None,
        env_port: Some("8123".to_string()),
        min_node_version: "20.0.0".to_string(),
        module_origin: PathBuf::from("/home/dev/project/node_modules/.bin/jait"),
        windows: false,
    }
}

fn check(
    id: &str,
    label: &str,
    status: DoctorStatus,
    message: &str,
    fix: Option<&str>,
) -> DoctorCheck {
    DoctorCheck {
        id: id.to_string(),
        label: label.to_string(),
        status,
        message: message.to_string(),
        fix: fix.map(str::to_string),
        observation: Observation::Observed,
        issue_code: None,
        remediation: None,
    }
}

// ===========================================================================
// (cli) packages/gateway/src/cli/doctor.ts
// ===========================================================================
mod cli_doctor_ts {
    use super::*;

    /// `resolveDoctorEnvCandidates`: explicit path first, then `cwd/.env`, then
    /// `<jaitDir>/.env`; falsy values are dropped (TS `.filter(Boolean)`).
    #[test]
    fn env_candidates_follow_explicit_then_cwd_then_state_dir() {
        let config = valid_config();
        assert_eq!(
            cli_doctor::resolve_doctor_env_candidates(&config),
            vec![
                PathBuf::from("/home/dev/project/.env.local"),
                PathBuf::from("/home/dev/project/.env"),
                PathBuf::from("/home/dev/.jait/.env"),
            ]
        );

        // No explicit envPath -> only the two discovered locations.
        let mut none = valid_config();
        none.env_path = None;
        assert_eq!(
            cli_doctor::resolve_doctor_env_candidates(&none),
            vec![
                PathBuf::from("/home/dev/project/.env"),
                PathBuf::from("/home/dev/.jait/.env"),
            ]
        );

        // An empty-string envPath is falsy in TS and must not be a candidate.
        let mut empty = valid_config();
        empty.env_path = Some(PathBuf::new());
        assert_eq!(
            cli_doctor::resolve_doctor_env_candidates(&empty),
            vec![
                PathBuf::from("/home/dev/project/.env"),
                PathBuf::from("/home/dev/.jait/.env"),
            ]
        );

        // Duplicates are preserved, not deduplicated.
        let mut dup = valid_config();
        dup.env_path = Some(PathBuf::from("/home/dev/project/.env"));
        assert_eq!(
            cli_doctor::resolve_doctor_env_candidates(&dup),
            vec![
                PathBuf::from("/home/dev/project/.env"),
                PathBuf::from("/home/dev/project/.env"),
                PathBuf::from("/home/dev/.jait/.env"),
            ]
        );
    }

    /// `DoctorConfig::validate` rejects malformed host wiring before any probe
    /// runs, with the issue codes the CLI maps to skip/error reporting.
    #[test]
    fn host_configuration_is_validated_before_probing() {
        assert_eq!(valid_config().validate().unwrap(), ());

        // Relative host paths are refused (all three absolute roots required).
        for broken in [
            DoctorConfig {
                cwd: PathBuf::from("relative/project"),
                ..valid_config()
            },
            DoctorConfig {
                jait_dir: PathBuf::from("./jait"),
                ..valid_config()
            },
            DoctorConfig {
                module_origin: PathBuf::from("x/jait"),
                ..valid_config()
            },
        ] {
            let issue = broken.validate().unwrap_err();
            assert_eq!(issue.code, "invalid-host-path");
            assert_eq!(issue.observation, Observation::Error);
        }

        // `.`/`..` components are refused even though the path is absolute.
        let dotted = DoctorConfig {
            cwd: PathBuf::from("/home/dev/../project"),
            ..valid_config()
        };
        assert_eq!(dotted.validate().unwrap_err().code, "invalid-host-path");

        // Over-long / control-character host values are refused.
        let long_port = DoctorConfig {
            port: Some("8".repeat(129)),
            ..valid_config()
        };
        assert_eq!(
            long_port.validate().unwrap_err().code,
            "invalid-host-configuration"
        );
        let control_port = DoctorConfig {
            port: Some("80\n00".to_string()),
            ..valid_config()
        };
        assert_eq!(
            control_port.validate().unwrap_err().code,
            "invalid-host-configuration"
        );
        let long_node = DoctorConfig {
            min_node_version: "2".repeat(129),
            ..valid_config()
        };
        assert_eq!(
            long_node.validate().unwrap_err().code,
            "invalid-host-configuration"
        );
        let bad_env = DoctorConfig {
            env_path: Some(PathBuf::from("/home/dev/\u{0}.env")),
            ..valid_config()
        };
        assert_eq!(
            bad_env.validate().unwrap_err().code,
            "invalid-host-configuration"
        );

        // Boundary values are accepted (limit is inclusive, 128/4096).
        let boundary = DoctorConfig {
            port: Some("8".repeat(128)),
            min_node_version: "2".repeat(128),
            ..valid_config()
        };
        assert_eq!(boundary.validate().unwrap(), ());
    }

    /// The rendered terminal report and the process exit code are what the CLI
    /// actually prints/returns; both are pinned byte-for-byte.
    #[test]
    fn report_rendering_and_exit_codes_match_cli_output() {
        let result = DoctorResult {
            checks: vec![
                check("node", "Node.js", DoctorStatus::Pass, "v22.3.0", None),
                check(
                    "playwright",
                    "Playwright",
                    DoctorStatus::Warn,
                    "not installed",
                    Some("npm install -D playwright"),
                ),
                check(
                    "codex",
                    "Codex CLI",
                    DoctorStatus::Fail,
                    "codex not found on PATH",
                    Some("npm install -g @openai/codex"),
                ),
            ],
            ok: false,
            warning_count: 1,
            failure_count: 1,
        };

        assert_eq!(
            result.render(),
            "  [PASS] Node.js: v22.3.0\n\
             \x20 [WARN] Playwright: not installed\n\
             \x20        npm install -D playwright\n\
             \x20 [FAIL] Codex CLI: codex not found on PATH\n\
             \x20        npm install -g @openai/codex\n\
             \n\
             \x20 Summary: 1 passed, 1 warnings, 1 failed\n\
             \x20 Result:  issues found\n\
             \n"
        );
        assert_eq!(result.exit_code(), 1);

        // All-green run: exit 0 and "ok".
        let healthy = DoctorResult {
            checks: vec![
                check("node", "Node.js", DoctorStatus::Pass, "v22.3.0", None),
                check("bun", "Bun", DoctorStatus::Pass, "1.3.10", None),
            ],
            ok: true,
            warning_count: 0,
            failure_count: 0,
        };
        assert_eq!(
            healthy.render(),
            "  [PASS] Node.js: v22.3.0\n  [PASS] Bun: 1.3.10\n\
             \n  Summary: 2 passed, 0 warnings, 0 failed\n  Result:  ok\n\n"
        );
        assert_eq!(healthy.exit_code(), 0);

        // A warning-only run is still `ok` (warnings never set ok=false).
        let warned = DoctorResult {
            checks: vec![check(
                "bun",
                "Bun",
                DoctorStatus::Warn,
                "older than 1.3",
                None,
            )],
            ok: true,
            warning_count: 1,
            failure_count: 0,
        };
        assert_eq!(warned.exit_code(), 0);
        assert!(
            warned
                .render()
                .contains("\n  Summary: 0 passed, 1 warnings, 0 failed\n")
        );
        assert!(warned.render().ends_with("  Result:  ok\n\n"));
    }

    /// `diagnostics()` recomputes pass counts while preserving the stored
    /// warn/fail tallies, and the JSON contract stays stable for `--json`.
    #[test]
    fn diagnostics_and_json_shape_are_stable() {
        let result = DoctorResult {
            checks: vec![
                check("node", "Node.js", DoctorStatus::Pass, "v22.3.0", None),
                check(
                    "codex",
                    "Codex CLI",
                    DoctorStatus::Fail,
                    "codex not found on PATH",
                    Some("npm install -g @openai/codex"),
                ),
            ],
            ok: false,
            warning_count: 0,
            failure_count: 1,
        };

        let report = result.diagnostics();
        assert!(!report.ok);
        assert_eq!(report.counts.pass, 1);
        assert_eq!(report.counts.warn, 0);
        assert_eq!(report.counts.fail, 1);
        assert_eq!(report.checks.len(), 2);
        assert_eq!(report.checks[1].id, "codex");
        assert_eq!(report.checks[1].label, "Codex CLI");
        assert_eq!(report.checks[1].status, DoctorStatus::Fail);
        // Fix hints become `details`; absent hints yield an empty list.
        assert_eq!(report.checks[0].details, Vec::<String>::new());
        assert_eq!(
            report.checks[1].details,
            vec!["npm install -g @openai/codex".to_string()]
        );

        // JSON: lowercase statuses, camelCase counters, omitted `fix`,
        // and internal probe bookkeeping (observation/issue_code/remediation)
        // never leaks to consumers.
        let mut failing = result.checks[1].clone();
        failing.observation = Observation::Skipped;
        failing.issue_code = Some("process-not-authorized");
        failing.remediation = Some(Remediation {
            code: "install-codex",
            requires_repair_authority: true,
            requires_rollback: false,
        });
        let json = serde_json::to_value(DoctorResult {
            checks: vec![failing],
            ok: false,
            warning_count: 2,
            failure_count: 1,
        })
        .unwrap();
        assert_eq!(json["ok"], serde_json::json!(false));
        assert_eq!(json["warningCount"], serde_json::json!(2));
        assert_eq!(json["failureCount"], serde_json::json!(1));
        let entry = &json["checks"][0];
        assert_eq!(entry["id"], serde_json::json!("codex"));
        assert_eq!(entry["status"], serde_json::json!("fail"));
        assert_eq!(
            entry["message"],
            serde_json::json!("codex not found on PATH")
        );
        assert_eq!(
            entry["fix"],
            serde_json::json!("npm install -g @openai/codex")
        );
        assert!(entry.get("observation").is_none());
        assert!(entry.get("issue_code").is_none());
        assert!(entry.get("remediation").is_none());

        // Status serialization is the TS union `"pass" | "warn" | "fail"`.
        assert_eq!(
            serde_json::to_value(DoctorStatus::Pass).unwrap(),
            serde_json::json!("pass")
        );
        assert_eq!(
            serde_json::to_value(DoctorStatus::Warn).unwrap(),
            serde_json::json!("warn")
        );

        // `None` fix is omitted rather than serialized as null.
        let no_fix =
            serde_json::to_value(check("node", "Node.js", DoctorStatus::Pass, "v22", None))
                .unwrap();
        assert!(no_fix.get("fix").is_none());
        let _ = Path::new("/");
    }
}
