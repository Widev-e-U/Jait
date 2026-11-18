use super::*;
use serde_json::json;
use std::{num::NonZeroU16, sync::Mutex};

fn config() -> DoctorConfig {
    let cwd = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    DoctorConfig {
        jait_dir: cwd.join("fixture-state"),
        module_origin: cwd.join("fixture-package/doctor.js"),
        cwd,
        env_path: None,
        port: None,
        env_port: None,
        min_node_version: "22.5.0".into(),
        windows: cfg!(windows),
    }
}
fn output(code: i32, text: &str) -> CapturedProcessResult {
    CapturedProcessResult {
        stdout: text.as_bytes().to_vec(),
        stderr: Vec::new(),
        exit_code: Some(code),
        timed_out: false,
        cancelled: false,
        truncated: false,
    }
}
fn ready() -> RuntimeStatus {
    RuntimeStatus {
        ready: true,
        managed: true,
        command: "graphify".into(),
        version: Some("graphify 0.9.30".into()),
        expected_version: "0.9.30".into(),
        error: None,
    }
}
#[derive(Default)]
struct FakeEffects {
    existing: BTreeSet<PathBuf>,
    paths: Mutex<Vec<PathBuf>>,
    calls: Mutex<Vec<String>>,
    outputs: BTreeMap<DoctorProbe, CapturedProcessResult>,
    issues: BTreeMap<DoctorProbe, ProbeIssue>,
    graphify_failure: bool,
    filesystem_issue: Option<ProbeIssue>,
    health_issue: Option<ProbeIssue>,
    hang_all: bool,
}
impl DoctorEffects for FakeEffects {
    fn exists<'a>(
        &'a self,
        path: &'a Path,
        _context: ProbeContext,
    ) -> BoxFuture<'a, Result<bool, ProbeIssue>> {
        Box::pin(async move {
            self.paths.lock().unwrap().push(path.to_owned());
            if self.hang_all {
                return std::future::pending().await;
            }
            if let Some(issue) = &self.filesystem_issue {
                return Err(issue.clone());
            }
            Ok(self.existing.contains(path))
        })
    }
    fn process(
        &self,
        probe: DoctorProbe,
        _context: ProbeContext,
    ) -> BoxFuture<'_, Result<CapturedProcessResult, ProbeIssue>> {
        Box::pin(async move {
            self.calls.lock().unwrap().push(format!("{probe:?}"));
            if self.hang_all {
                return std::future::pending().await;
            }
            if let Some(issue) = self.issues.get(&probe) {
                return Err(issue.clone());
            }
            Ok(self.outputs.get(&probe).cloned().unwrap_or_else(|| {
                output(
                    0,
                    if probe == DoctorProbe::NodeVersion {
                        "v22.5.0\n"
                    } else {
                        ""
                    },
                )
            }))
        })
    }
    fn graphify(&self, _context: ProbeContext) -> BoxFuture<'_, Result<RuntimeStatus, ProbeIssue>> {
        Box::pin(async move {
            self.calls.lock().unwrap().push("Graphify".into());
            if self.hang_all {
                return std::future::pending().await;
            }
            let mut status = ready();
            if self.graphify_failure {
                status.ready = false;
                status.error = Some("Graphify is missing".into());
            }
            Ok(status)
        })
    }
    fn health(&self, port: u16, _context: ProbeContext) -> BoxFuture<'_, Result<bool, ProbeIssue>> {
        Box::pin(async move {
            self.calls.lock().unwrap().push(format!("health:{port}"));
            if self.hang_all {
                return std::future::pending().await;
            }
            if let Some(issue) = &self.health_issue {
                return Err(issue.clone());
            }
            Ok(true)
        })
    }
}
fn happy(config: &DoctorConfig) -> FakeEffects {
    FakeEffects {
        existing: [
            config.cwd.join(".env"),
            config.jait_dir.clone(),
            config.jait_dir.join("data/jait.db"),
        ]
        .into_iter()
        .collect(),
        ..Default::default()
    }
}
async fn run(config: &DoctorConfig, effects: &dyn DoctorEffects) -> DoctorResult {
    run_doctor(config, effects, ProcessCancellation::default())
        .await
        .unwrap()
}

#[tokio::test]
async fn cli_doctor_preserves_check_order_wire_counts_and_text() {
    let config = config();
    let effects = happy(&config);
    let result = run(&config, &effects).await;
    let ids: Vec<_> = result.checks.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "env-file",
            "jait-dir",
            "database",
            "node-version",
            "bun",
            "playwright",
            "graphify-runtime",
            "provider-codex",
            "provider-claude-code",
            "gateway-health"
        ]
    );
    assert!(result.ok);
    assert_eq!(result.exit_code(), 0);
    assert!(
        result
            .checks
            .iter()
            .all(|c| c.status == DoctorStatus::Pass && c.observation == Observation::Observed)
    );
    let wire = serde_json::to_value(result.diagnostics()).unwrap();
    assert_eq!(wire["counts"], json!({"pass":10,"warn":0,"fail":0}));
    assert_eq!(
        wire["checks"][4],
        json!({"id":"bun","label":"Bun runtime","status":"pass","summary":"bun is available on PATH","details":[]})
    );
    let original = serde_json::to_value(&result).unwrap();
    assert_eq!(original["failureCount"], 0);
    assert!(original["checks"][0].get("observation").is_none());
    assert!(original["checks"][0].get("fix").is_none());
    assert!(
        result
            .render()
            .ends_with("  Summary: 10 passed, 0 warnings, 0 failed\n  Result:  ok\n\n")
    );
    assert_eq!(
        *effects.calls.lock().unwrap(),
        [
            "NodeVersion",
            "Bun",
            "Playwright",
            "Graphify",
            "Codex",
            "Claude",
            "health:8000"
        ]
    );
}

#[tokio::test]
async fn cli_doctor_env_priority_relative_paths_and_fallback_match_reference() {
    let mut config = config();
    config.env_path = Some(PathBuf::from("custom.env"));
    assert_eq!(
        resolve_doctor_env_candidates(&config),
        [
            PathBuf::from("custom.env"),
            config.cwd.join(".env"),
            config.jait_dir.join(".env")
        ]
    );
    let effects = happy(&config);
    let result = run(&config, &effects).await;
    assert_eq!(result.checks[0].status, DoctorStatus::Pass);
    assert_eq!(
        &effects.paths.lock().unwrap()[..2],
        &[config.cwd.join("custom.env"), config.cwd.join(".env")]
    );
    // Missing explicit file still falls through to project/state candidates.
    let effects = FakeEffects::default();
    let result = run(&config, &effects).await;
    assert_eq!(result.checks[0].status, DoctorStatus::Fail);
    assert_eq!(
        result.checks[0].remediation.as_ref().unwrap().code,
        "env-configured-missing"
    );
    assert_eq!(
        result.checks[0].message,
        "Configured env file was not found: custom.env"
    );
    assert_eq!(
        config.absolute(&config.jait_dir.join(".env")),
        config.jait_dir.join(".env")
    );
}

#[tokio::test]
async fn cli_doctor_missing_files_optional_tools_and_required_versions_have_stable_facts() {
    let config = config();
    let effects = FakeEffects {
        graphify_failure: true,
        outputs: [
            (DoctorProbe::NodeVersion, output(0, "v20.0.0")),
            (DoctorProbe::Bun, output(1, "")),
            (DoctorProbe::Playwright, output(1, "")),
            (DoctorProbe::Codex, output(1, "")),
            (DoctorProbe::Claude, output(1, "")),
        ]
        .into_iter()
        .collect(),
        ..Default::default()
    };
    let result = run(&config, &effects).await;
    assert!(!result.ok);
    assert_eq!(result.exit_code(), 1);
    assert_eq!((result.failure_count, result.warning_count), (2, 7));
    assert_eq!(result.checks[6].message, "Graphify is missing");
    assert_eq!(
        result.checks[3].remediation.as_ref().unwrap().code,
        "node-upgrade"
    );
    for check in result.checks.iter().filter(|c| c.fix.is_some()) {
        let fact = check.remediation.as_ref().unwrap();
        assert!(fact.requires_repair_authority && fact.requires_rollback);
    }
}

#[tokio::test]
async fn cli_doctor_skip_unknown_error_never_become_pass_or_missing() {
    let config = config();
    let effects = FakeEffects {
        filesystem_issue: Some(ProbeIssue::error("filesystem-check-error")),
        issues: [
            (
                DoctorProbe::NodeVersion,
                ProbeIssue::skipped("process-not-authorized"),
            ),
            (DoctorProbe::Bun, ProbeIssue::unknown("process-capacity")),
        ]
        .into_iter()
        .collect(),
        health_issue: Some(ProbeIssue::unknown("health-invalid-json")),
        ..Default::default()
    };
    let result = run(&config, &effects).await;
    for (index, kind) in [
        (0, Observation::Error),
        (3, Observation::Skipped),
        (4, Observation::Unknown),
        (9, Observation::Unknown),
    ] {
        assert_eq!(result.checks[index].observation, kind);
        assert_eq!(result.checks[index].status, DoctorStatus::Warn);
        assert!(result.checks[index].remediation.is_none());
    }
    // Compatibility: ok means zero failures, not full diagnostic coverage.
    assert!(result.ok);
    assert!(result.warning_count >= 4);
}

#[tokio::test]
async fn cli_doctor_process_timeout_truncation_signal_and_malformed_output_are_unknown_or_error() {
    let config = config();
    let mut timed_out = output(0, "v999.0.0");
    timed_out.timed_out = true;
    let mut truncated = output(0, "v999.0.0");
    truncated.truncated = true;
    let mut signalled = output(0, "v999.0.0");
    signalled.exit_code = None;
    for (result, observation) in [
        (timed_out, Observation::Unknown),
        (truncated, Observation::Unknown),
        (signalled, Observation::Error),
    ] {
        let effects = FakeEffects {
            outputs: [(DoctorProbe::NodeVersion, result)].into_iter().collect(),
            ..happy(&config)
        };
        let report = run(&config, &effects).await;
        assert_eq!(report.checks[3].observation, observation);
        assert_ne!(report.checks[3].status, DoctorStatus::Pass);
    }
    let mut result = output(0, "secret\nPASS v99.0.0");
    result.timed_out = true;
    assert_eq!(node_version(&result).unwrap_err().code, "process-timeout");
    result.timed_out = false;
    assert_eq!(
        node_version(&result).unwrap_err().code,
        "node-version-malformed"
    );
    result.stdout = vec![0xff];
    assert_eq!(
        node_version(&result).unwrap_err().code,
        "node-version-encoding"
    );
    assert_eq!(compare_semver("v22.5.0", "22.5"), std::cmp::Ordering::Equal);
    assert_eq!(
        compare_semver("v22.5.0", "22.5.1beta"),
        std::cmp::Ordering::Less
    );
}

#[tokio::test]
async fn cli_doctor_port_precedence_prefix_and_socket_limits() {
    let mut config = config();
    config.env_port = Some("9000".into());
    config.port = Some("8001suffix".into());
    let effects = happy(&config);
    let report = run(&config, &effects).await;
    assert_eq!(report.checks[9].status, DoctorStatus::Pass);
    assert!(
        effects
            .calls
            .lock()
            .unwrap()
            .contains(&"health:8001".into())
    );
    for invalid in [
        "nope",
        "0",
        "-1",
        "65536",
        "9999999999999999999999999",
        "0x20",
    ] {
        config.port = Some(invalid.into());
        let effects = happy(&config);
        let report = run(&config, &effects).await;
        assert_eq!(report.checks[9].status, DoctorStatus::Fail);
        assert_eq!(
            report.checks[9].remediation.as_ref().unwrap().code,
            "port-invalid"
        );
        assert!(
            !effects
                .calls
                .lock()
                .unwrap()
                .iter()
                .any(|c| c.starts_with("health:"))
        );
    }
    assert_eq!(parse_port(" +65535junk"), Some(65535));
}

#[tokio::test]
async fn cli_doctor_cancelled_report_has_no_effects_and_no_false_passes() {
    let config = config();
    let effects = happy(&config);
    let cancellation = ProcessCancellation::default();
    cancellation.cancel();
    let report = run_doctor(&config, &effects, cancellation).await.unwrap();
    assert_eq!(report.checks.len(), 10);
    assert!(
        report
            .checks
            .iter()
            .all(|c| c.observation == Observation::Skipped && c.status == DoctorStatus::Warn)
    );
    assert!(effects.calls.lock().unwrap().is_empty());
    assert!(effects.paths.lock().unwrap().is_empty());
}

#[tokio::test(start_paused = true)]
async fn cli_doctor_hanging_ports_are_bounded_by_whole_report_deadline() {
    let config = config();
    let effects = FakeEffects {
        hang_all: true,
        ..Default::default()
    };
    let started = Instant::now();
    let report = run(&config, &effects).await;
    assert!(started.elapsed() <= REPORT_TIMEOUT);
    assert_eq!(report.checks.len(), 10);
    assert!(
        report
            .checks
            .iter()
            .all(|c| c.status == DoctorStatus::Warn && c.observation == Observation::Unknown)
    );
    assert!(
        report
            .checks
            .iter()
            .all(|c| c.issue_code == Some("deadline-exceeded"))
    );
}

fn native(config: DoctorConfig, scope: DoctorScope) -> Result<NativeDoctorEffects, ProbeIssue> {
    NativeDoctorEffects::new(
        config,
        scope,
        ProcessPool::new(NonZeroU16::new(1).unwrap()),
        BlockingLane::new(NonZeroU16::new(1).unwrap()),
    )
}
fn context() -> ProbeContext {
    ProbeContext {
        deadline: Instant::now() + CHECK_TIMEOUT,
        cancellation: ProcessCancellation::default(),
    }
}

#[tokio::test]
async fn cli_doctor_native_requests_have_fixed_argv_and_no_ambient_environment() {
    let config = config();
    let mut scope = DoctorScope::default();
    for probe in [
        DoctorProbe::NodeVersion,
        DoctorProbe::Bun,
        DoctorProbe::Playwright,
        DoctorProbe::Codex,
        DoctorProbe::Claude,
        DoctorProbe::GraphifyVersion,
    ] {
        scope.processes.insert(
            probe,
            ProcessGrant {
                program: config.cwd.join("authorized-fixture-executable"),
                environment: BTreeMap::new(),
            },
        );
    }
    let effects = native(config.clone(), scope).unwrap();
    let request = effects
        .request(DoctorProbe::Playwright, &context())
        .unwrap();
    assert_eq!(request.argv[1], "--input-type=commonjs");
    assert!(request.argv[3].contains("createRequire(process.argv[1]).resolve('playwright')"));
    assert_eq!(request.argv[4], config.module_origin.to_string_lossy());
    assert!(request.environment.is_empty());
    assert!(request.input.is_none());
    assert_eq!(request.output_limit, PROCESS_OUTPUT_LIMIT);
    assert!(request.timeout <= CHECK_TIMEOUT);
    assert_eq!(
        effects
            .request(DoctorProbe::Claude, &context())
            .unwrap()
            .argv[1..],
        ["claude"]
    );
    assert_eq!(
        effects
            .request(DoctorProbe::GraphifyVersion, &context())
            .unwrap()
            .argv[1..],
        ["--version"]
    );
    let empty = native(config.clone(), DoctorScope::default()).unwrap();
    assert_eq!(
        empty
            .process(DoctorProbe::Codex, context())
            .await
            .unwrap_err()
            .code,
        "process-not-authorized"
    );
    assert_eq!(
        empty.health(8000, context()).await.unwrap_err().code,
        "health-not-authorized"
    );
    assert_eq!(
        empty
            .exists(&config.cwd.join(".env"), context())
            .await
            .unwrap_err()
            .code,
        "metadata-not-authorized"
    );
    let mut scope = DoctorScope::default();
    scope.processes.insert(
        DoctorProbe::NodeVersion,
        ProcessGrant {
            program: config.cwd.join("node"),
            environment: [("NODE_OPTIONS".into(), "--require=secret".into())]
                .into_iter()
                .collect(),
        },
    );
    assert!(matches!(
        native(config.clone(), scope),
        Err(ProbeIssue {
            code: "process-scope-invalid",
            ..
        })
    ));
    let mut scope = DoctorScope::default();
    scope.health_ports.insert(9000);
    assert!(matches!(
        native(config, scope),
        Err(ProbeIssue {
            code: "health-scope-mismatch",
            ..
        })
    ));
}

#[cfg(unix)]
struct Fixture(PathBuf);
#[cfg(unix)]
impl Fixture {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/parallel-implementation")
            .join(format!("doctor-fixture-{}", uuid::Uuid::new_v4()));
        let root = PathBuf::from(path_join(&[root.to_str().unwrap()]));
        std::fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    fn config(&self) -> DoctorConfig {
        DoctorConfig {
            cwd: self.0.clone(),
            jait_dir: self.0.join("state"),
            module_origin: self.0.join("doctor.js"),
            ..config()
        }
    }
}
#[cfg(unix)]
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[cfg(unix)]
#[tokio::test]
async fn cli_doctor_native_files_use_pinned_roots_and_deny_symlink_scope_escape() {
    let fixture = Fixture::new();
    let config = fixture.config();
    std::fs::write(fixture.0.join(".env"), "do not load or print this secret").unwrap();
    std::os::unix::fs::symlink(fixture.0.join(".env"), fixture.0.join("link.env")).unwrap();
    let root = ProjectRoot::open(&fixture.0).unwrap();
    let mut scope = DoctorScope::default();
    scope.metadata.insert(
        config.cwd.join(".env"),
        MetadataGrant {
            root: root.clone(),
            relative: ".env".into(),
        },
    );
    scope.metadata.insert(
        config.jait_dir.clone(),
        MetadataGrant {
            root: root.clone(),
            relative: "state".into(),
        },
    );
    let effects = native(config.clone(), scope).unwrap();
    assert!(
        effects
            .exists(&config.cwd.join(".env"), context())
            .await
            .unwrap()
    );
    assert!(!effects.exists(&config.jait_dir, context()).await.unwrap());
    let mut linked_config = config.clone();
    linked_config.env_path = Some(fixture.0.join("link.env"));
    let mut scope = DoctorScope::default();
    scope.metadata.insert(
        fixture.0.join("link.env"),
        MetadataGrant {
            root: root.clone(),
            relative: "link.env".into(),
        },
    );
    let effects = native(linked_config, scope).unwrap();
    assert!(
        effects
            .exists(&fixture.0.join("link.env"), context())
            .await
            .is_err()
    );
    let mut scope = DoctorScope::default();
    scope.metadata.insert(
        config.cwd.join(".env"),
        MetadataGrant {
            root,
            relative: "../.env".into(),
        },
    );
    assert!(matches!(
        native(config, scope),
        Err(ProbeIssue {
            code: "metadata-scope-mismatch",
            ..
        })
    ));
}

#[cfg(unix)]
#[tokio::test]
async fn cli_doctor_native_graphify_only_probes_and_reuses_canonical_pinned_version() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = Fixture::new();
    let config = fixture.config();
    let program =
        PathBuf::from(runtime_paths(config.jait_dir.to_str().unwrap(), false).command_path);
    std::fs::create_dir_all(program.parent().unwrap()).unwrap();
    std::fs::write(
        &program,
        "#!/bin/sh\n[ \"$1\" = --version ] || exit 2\nprintf 'graphify 0.9.30\\n'\n",
    )
    .unwrap();
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o700)).unwrap();
    let mut scope = DoctorScope::default();
    scope.processes.insert(
        DoctorProbe::GraphifyVersion,
        ProcessGrant {
            program: program.clone(),
            environment: BTreeMap::new(),
        },
    );
    let effects = native(config, scope).unwrap();
    let status = effects.graphify(context()).await.unwrap();
    assert!(status.ready && status.managed);
    std::fs::write(&program, "#!/bin/sh\nprintf 'graphify 0.9.29\\n'\n").unwrap();
    let status = effects.graphify(context()).await.unwrap();
    assert!(!status.ready);
    assert_eq!(
        status.error.as_deref(),
        Some("Expected Graphify 0.9.30, found graphify 0.9.29")
    );
    assert!(
        !fixture
            .0
            .join("state/runtime/graphify/runtime.json")
            .exists()
    );
}

#[tokio::test]
async fn cli_doctor_native_health_uses_only_scoped_loopback_and_json_truthiness() {
    use tokio::{io::AsyncWriteExt, net::TcpListener};
    for body in ["{}", "false", "null", "[]", "0", "\"\""] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let mut config = config();
        config.port = Some(port.to_string());
        let mut scope = DoctorScope::default();
        scope.health_ports.insert(port);
        let effects = native(config, scope).unwrap();
        let response = format!(
            "HTTP/1.1 500 Error\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let request = read_request(&mut socket).await;
            assert!(String::from_utf8_lossy(&request).starts_with("GET /health HTTP/1.1\r\n"));
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        assert_eq!(
            effects.health(port, context()).await.unwrap(),
            matches!(body, "{}" | "[]")
        );
        server.await.unwrap();
    }
}

#[tokio::test]
async fn cli_doctor_native_health_rejects_redirect_invalid_json_and_body_limit() {
    use tokio::{io::AsyncWriteExt, net::TcpListener};
    for (response, expected) in [
        (
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/health\r\nContent-Length: 0\r\n\r\n",
            "health-redirect",
        ),
        (
            "HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nnope",
            "health-invalid-json",
        ),
        (
            "HTTP/1.1 200 OK\r\nContent-Length: 65537\r\n\r\n",
            "health-body-limit",
        ),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let mut config = config();
        config.port = Some(port.to_string());
        let mut scope = DoctorScope::default();
        scope.health_ports.insert(port);
        let effects = native(config, scope).unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let _ = read_request(&mut socket).await;
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        assert_eq!(
            effects.health(port, context()).await.unwrap_err().code,
            expected
        );
        server.await.unwrap();
    }
}

#[tokio::test]
async fn cli_doctor_invalid_captured_configuration_is_rejected_before_effects() {
    let mut config = config();
    config.min_node_version = "22.5.0\nPASS".into();
    let effects = FakeEffects::default();
    assert_eq!(
        run_doctor(&config, &effects, ProcessCancellation::default())
            .await
            .unwrap_err()
            .code,
        "invalid-host-configuration"
    );
    assert!(effects.calls.lock().unwrap().is_empty());
    assert!(effects.paths.lock().unwrap().is_empty());
}

async fn read_request(socket: &mut tokio::net::TcpStream) -> Vec<u8> {
    use tokio::io::AsyncReadExt;
    let mut request = Vec::new();
    while !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
        let mut chunk = [0; 1024];
        let count = socket.read(&mut chunk).await.unwrap();
        assert!(count > 0 && request.len() + count <= 4096);
        request.extend_from_slice(&chunk[..count]);
    }
    request
}

#[tokio::test]
async fn cli_doctor_node_absence_is_a_failed_requirement_not_a_skipped_check() {
    let config = config();
    let effects = FakeEffects {
        issues: [(
            DoctorProbe::NodeVersion,
            ProbeIssue::unknown("executable-not-found"),
        )]
        .into_iter()
        .collect(),
        ..happy(&config)
    };
    let result = run(&config, &effects).await;
    assert_eq!(result.checks[3].status, DoctorStatus::Fail);
    assert_eq!(result.checks[3].observation, Observation::Observed);
    assert_eq!(
        result.checks[3].remediation.as_ref().unwrap().code,
        "node-install"
    );
    assert!(!result.ok);
    assert_eq!(
        node_version(&output(0, "v22.5.0-rc.1")).unwrap(),
        "v22.5.0-rc.1"
    );
    let result = output(0, &"9".repeat(PROCESS_OUTPUT_LIMIT + 1));
    assert_eq!(
        node_version(&result).unwrap_err().code,
        "process-output-limit"
    );
}

#[cfg(unix)]
#[tokio::test]
async fn cli_doctor_native_missing_graphify_is_failed_inspection_with_no_installation() {
    let fixture = Fixture::new();
    let config = fixture.config();
    let command =
        PathBuf::from(runtime_paths(config.jait_dir.to_str().unwrap(), false).command_path);
    let mut scope = DoctorScope::default();
    scope.processes.insert(
        DoctorProbe::GraphifyVersion,
        ProcessGrant {
            program: command,
            environment: BTreeMap::new(),
        },
    );
    let effects = native(config, scope).unwrap();
    let status = effects.graphify(context()).await.unwrap();
    assert!(!status.ready && status.managed);
    assert_eq!(status.error.as_deref(), Some("Graphify is unavailable"));
    assert!(!fixture.0.join("state").exists());
}

#[tokio::test]
async fn cli_doctor_native_health_cancels_pending_headers_without_retries() {
    use tokio::{net::TcpListener, sync::oneshot};
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let mut config = config();
    config.port = Some(port.to_string());
    let mut scope = DoctorScope::default();
    scope.health_ports.insert(port);
    let effects = native(config, scope).unwrap();
    let cancellation = ProcessCancellation::default();
    let mut context = context();
    context.cancellation = cancellation.clone();
    let (accepted, wait_for_accept) = oneshot::channel();
    let (release, hold) = oneshot::channel::<()>();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let _ = read_request(&mut socket).await;
        accepted.send(()).unwrap();
        let _ = hold.await;
    });
    let check = tokio::spawn(async move { effects.health(port, context).await });
    wait_for_accept.await.unwrap();
    cancellation.cancel();
    let result = tokio::time::timeout(Duration::from_secs(1), check)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(result.unwrap_err().code, "cancelled");
    release.send(()).unwrap();
    server.await.unwrap();
}
