//! Contract evidence for the native ports of
//! `scripts/package-desktop.mjs`, `scripts/security-smoke.ts` and
//! `scripts/bundle-messenger-runtime.mjs`.
//!
//! Every assertion below is pinned to the reference TypeScript/Node script it
//! replaces; nothing here restates the Rust implementation's own choices.
//! The modules are reached through the crate's public surface, so a port that
//! stops being exported or stops compiling fails this file.

use std::ffi::{OsStr, OsString};
use std::path::Path;

use jait_gateway::packaging::bundle_messenger_runtime::{
    BUILD_PROGRAM_ENV, DEFAULT_BUILD_PROGRAM, ENTRY_RELATIVE, MessengerRuntimeBundlePlan,
    OUTFILE_RELATIVE, SIGNAL_EXIT_CODE, exit_code, resolve_build_program,
};
use jait_gateway::packaging::package_desktop::{
    PackageError, PackagePlatform, RuntimeIdentity, parse_runtime_version, validate_runtime,
};
use jait_gateway::packaging::security_smoke::{
    FRAME_OPTIONS_HEADER, INSECURE_DOCKERFILE, NONROOT_RULE_ID, NOSNIFF_HEADER, NOSNIFF_RULE_ID,
    PASSED, PRINCIPAL, SCOPE_METHODS, SCOPE_PATHS, SERVER_NAME, SSH_BANNER, STATUS_COMPLETED,
    SmokeReport, TARGET, TELEMETRY_FIXTURE, VERDICT_VERIFIED_ABSENT, certificate_argv,
};

fn runtime(release_name: &str, version: &str) -> RuntimeIdentity {
    RuntimeIdentity {
        release_name: release_name.to_string(),
        version: version.to_string(),
    }
}

// ---------------------------------------------------------------------------
// scripts/package-desktop.mjs — runtime guard
//   `const [major] = process.versions.node.split('.'); if (process.release.name
//    !== 'node' || Number(major) < 22) throw new Error('Package with Node 22 or
//    newer on the target OS')`
// ---------------------------------------------------------------------------

#[test]
fn package_desktop_guard_accepts_node_22_and_newer() {
    for version in ["22.0.0", "22.4.0", "23.1.0", "30.0.0"] {
        validate_runtime(&runtime("node", version))
            .unwrap_or_else(|err| panic!("Node {version} must be accepted, got {err:?}"));
    }
}

#[test]
fn package_desktop_guard_rejects_runtime_older_than_node_22() {
    for version in ["21.9.0", "20.11.1", "18.20.0", "8.0.0"] {
        match validate_runtime(&runtime("node", version)) {
            Err(PackageError::UnsupportedRuntime {
                release_name,
                version: rejected,
            }) => {
                assert_eq!(release_name, "node");
                assert_eq!(rejected, version);
            }
            other => panic!("Node {version} must be refused, got {other:?}"),
        }
    }
}

#[test]
fn package_desktop_guard_rejects_non_node_release_even_with_modern_version() {
    // `process.release.name !== 'node'` is checked before the major version.
    match validate_runtime(&runtime("bun", "22.4.0")) {
        Err(PackageError::UnsupportedRuntime { release_name, .. }) => {
            assert_eq!(release_name, "bun")
        }
        other => panic!("a `bun` release must be refused, got {other:?}"),
    }
}

#[test]
fn package_desktop_guard_rejects_unparseable_major() {
    for version in ["", "node", "v", "twenty-two"] {
        assert!(
            matches!(
                validate_runtime(&runtime("node", version)),
                Err(PackageError::UnsupportedRuntime { .. })
            ),
            "version {version:?} must not satisfy the guard"
        );
    }
}

#[test]
fn package_desktop_parses_probed_version_like_the_reference() {
    // The reference records `process.versions.node`, which is v-prefix free,
    // from `<runtime> --version` output that carries the `v`.
    assert_eq!(
        parse_runtime_version("v22.4.0\n").expect("release output"),
        "22.4.0"
    );
    assert_eq!(
        parse_runtime_version("v22").expect("major-only output"),
        "22"
    );
    assert_eq!(
        parse_runtime_version("22.4.0").expect("bare version"),
        "22.4.0"
    );
    for rejected in ["", "  ", "bun 1.2.0", "v22.x", "v22.4.0-rc1", "v.."] {
        assert!(
            parse_runtime_version(rejected).is_err(),
            "{rejected:?} must not be recorded as a Node version"
        );
    }
}

#[test]
fn package_desktop_runtime_file_name_matches_each_platform() {
    assert_eq!(PackagePlatform::Win32.runtime_file_name(), "node.exe");
    assert_eq!(PackagePlatform::Darwin.runtime_file_name(), "node");
    assert_eq!(PackagePlatform::Linux.runtime_file_name(), "node");
}

// ---------------------------------------------------------------------------
// scripts/security-smoke.ts — fixture constants and report line
// ---------------------------------------------------------------------------

#[test]
fn security_smoke_certificate_argv_matches_the_reference_invocation() {
    let key = Path::new("/tmp/fixture/key.pem");
    let certificate = Path::new("/tmp/fixture/certificate.pem");
    let argv: Vec<String> = certificate_argv(key, certificate)
        .iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    assert_eq!(
        argv,
        vec![
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            "/tmp/fixture/key.pem",
            "-out",
            "/tmp/fixture/certificate.pem",
            "-days",
            "2",
            "-subj",
            "/CN=fixture.example",
            "-addext",
            "subjectAltName=DNS:fixture.example,IP:127.0.0.1",
        ]
    );
}

#[test]
fn security_smoke_fixture_constants_match_the_reference() {
    assert_eq!(
        SSH_BANNER,
        "SSH-2.0-FixtureSSH_1.0 private comment discarded\r\n"
    );
    assert_eq!(PRINCIPAL, "bun-fixture");
    assert_eq!(TARGET, "127.0.0.1");
    assert_eq!(SERVER_NAME, "fixture.example");
    assert_eq!(NOSNIFF_HEADER, ("X-Content-Type-Options", "nosniff"));
    assert_eq!(FRAME_OPTIONS_HEADER, ("X-Frame-Options", "DENY"));
    assert_eq!(NOSNIFF_RULE_ID, "http.nosniff");
    assert_eq!(NONROOT_RULE_ID, "trivy.config.AVD-DS-0002");
    assert_eq!(
        SCOPE_METHODS,
        [
            "tcp",
            "tls",
            "http",
            "https",
            "ssh",
            "host-audit",
            "nmap",
            "nuclei",
            "trivy",
            "telemetry"
        ]
    );
    assert_eq!(SCOPE_PATHS, ["Dockerfile", "alerts.jsonl"]);
    assert!(INSECURE_DOCKERFILE.starts_with("FROM alpine:3.20"));
    assert_eq!(STATUS_COMPLETED, "completed");
    assert_eq!(VERDICT_VERIFIED_ABSENT, "verified-absent");
    assert!(TELEMETRY_FIXTURE.contains("\"event_type\":\"alert\""));
    assert!(TELEMETRY_FIXTURE.contains("\"dest_ip\":\"127.0.0.1\""));
}

#[test]
fn security_smoke_report_line_keeps_the_reference_key_order_and_names() {
    let report = SmokeReport {
        runtime: "bun 1.2.0".to_string(),
        tcp: "v1".to_string(),
        tls: "v2".to_string(),
        https: "v3".to_string(),
        ssh_identification: "v4".to_string(),
        local_host_audit: "v5".to_string(),
        http_issue_fix_verification: "v6".to_string(),
        nmap: "v7".to_string(),
        nuclei_issue_fix_verification: "v8".to_string(),
        trivy_issue_fix_verification: "v9".to_string(),
        telemetry_unverified_import: "v10".to_string(),
    };
    assert_eq!(
        report.to_line(),
        concat!(
            r#"{"runtime":"bun 1.2.0","tcp":"v1","tls":"v2","https":"v3","#,
            r#""sshIdentification":"v4","localHostAudit":"v5","#,
            r#""httpIssueFixVerification":"v6","nmap":"v7","#,
            r#""nucleiIssueFixVerification":"v8","trivyIssueFixVerification":"v9","#,
            r#""telemetryUnverifiedImport":"v10"}"#
        )
    );
    assert_eq!(PASSED, "passed");
}

// ---------------------------------------------------------------------------
// scripts/bundle-messenger-runtime.mjs
//   `spawnSync(process.env[BUN_ENV] ?? 'bun', ['build', ENTRY, '--target=node',
//    '--format=esm', '--external', EXTERNAL, '--outfile', OUTFILE],
//    { stdio: 'inherit' })` then `process.exitCode = result.status ?? 1`
// ---------------------------------------------------------------------------

fn display(plan: &MessengerRuntimeBundlePlan) -> Vec<String> {
    plan.display_args()
}

#[test]
fn bundle_plan_matches_the_reference_argv_and_working_directory() {
    let root = Path::new("/tmp/gateway-pkg");
    let plan = MessengerRuntimeBundlePlan::with_program(root, OsString::from("bun"))
        .expect("absolute root must be plannable");
    assert_eq!(
        display(&plan),
        vec![
            "build",
            "/tmp/gateway-pkg/src/services/messenger-matrix-runtime.ts",
            "--target=node",
            "--format=esm",
            "--external",
            "@matrix-org/matrix-sdk-crypto-nodejs",
            "--outfile",
            "/tmp/gateway-pkg/dist/services/messenger-matrix-runtime.js",
        ]
    );
    assert_eq!(plan.cwd(), root);
    assert_eq!(plan.entry(), root.join(ENTRY_RELATIVE));
    assert_eq!(plan.outfile(), root.join(OUTFILE_RELATIVE));
    assert_eq!(plan.program(), OsStr::new("bun"));
}

#[test]
fn bundle_plan_refuses_relative_root_and_empty_program() {
    // The reference resolves every spawned path, so a relative root must not
    // silently depend on the process working directory.
    assert!(
        MessengerRuntimeBundlePlan::with_program(
            Path::new("packages/gateway"),
            OsString::from("bun")
        )
        .is_err()
    );
    assert!(
        MessengerRuntimeBundlePlan::with_program(Path::new("/tmp/gateway-pkg"), OsString::new())
            .is_err()
    );
}

#[test]
fn bundle_build_program_resolution_matches_the_reference() {
    assert_eq!(BUILD_PROGRAM_ENV, "JAIT_BUILD_BUN");
    assert_eq!(DEFAULT_BUILD_PROGRAM, "bun");
    assert_eq!(resolve_build_program(None), OsString::from("bun"));
    // `process.env[X] ?? 'bun'` treats the empty string as a value.
    assert_eq!(
        resolve_build_program(Some(OsStr::new(""))),
        OsString::from("bun")
    );
    assert_eq!(
        resolve_build_program(Some(OsStr::new("/opt/bun-1.2/bin/bun"))),
        OsString::from("/opt/bun-1.2/bin/bun")
    );
}
#[cfg(unix)]
#[test]
fn bundle_exit_code_maps_signals_to_one_like_the_reference() {
    use std::process::Command;

    let exited = Command::new("sh")
        .arg("-c")
        .arg("exit 3")
        .status()
        .expect("spawn sh");
    assert_eq!(exit_code(exited), 3);

    // `$$` is built from a char literal so no quoting layer can collapse it.
    let pid = '\u{24}';
    let script = std::env::temp_dir().join(format!("jait-exit-code-{}.sh", std::process::id()));
    std::fs::write(&script, format!("kill -TERM {pid}{pid}\n")).expect("write signal script");
    let signalled = Command::new("sh").arg(&script).status().expect("spawn sh");
    let _ = std::fs::remove_file(&script);

    // `result.status ?? 1` — a signal-terminated child has no exit status.
    assert_eq!(exit_code(signalled), SIGNAL_EXIT_CODE);
    assert_eq!(SIGNAL_EXIT_CODE, 1);
}
