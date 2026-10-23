#![cfg(unix)]
use jait_gateway::execution::local_deploy::*;
use serde_json::{Value, json};
use std::{
    fs,
    os::unix::fs::PermissionsExt,
    path::PathBuf,
    process::{Command, Stdio},
    time::Duration,
};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/local-deploy-tests/native-host")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        Self(root.canonicalize().unwrap())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
struct Child(std::process::Child);
impl Drop for Child {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn executable(path: &std::path::Path, text: &str) {
    fs::write(path, text).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
}
fn binary() -> &'static str {
    env!("CARGO_BIN_EXE_jait-local-deploy")
}

// CI runners install node into the setup-node toolcache rather than /usr/bin,
// so resolve the interpreter from PATH instead of hardcoding a distro path.
fn node_binary() -> PathBuf {
    for dir in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        let candidate = dir.join("node");
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from("node")
}

#[test]
fn native_cli_executes_all_mandatory_gates_and_never_issues_failed_or_changed_build_proof() {
    for mode in ["pass", "fail", "drift"] {
        let fixture = Fixture::new();
        let workspace = fixture.0.join("workspace");
        let logs = fixture.0.join("logs");
        let bin = fixture.0.join("bin");
        for path in [workspace.join(".github/scripts"), logs.clone(), bin.clone()] {
            fs::create_dir_all(path).unwrap();
        }
        fs::write(workspace.join(".github/scripts/a.test.mjs"), "").unwrap();
        let engine = "#!/bin/sh\nprintf '%s\\n' \"$*\"\ncase \"$*\" in *test:e2e:ui*)\nif [ \"$SCENARIO\" = fail ]; then exit 7; fi\nif [ \"$SCENARIO\" = drift ]; then printf changed > \"$WORKSPACE/drift\"; fi;; esac\n";
        for name in ["bun", "node"] {
            executable(&bin.join(name), engine);
        }
        fs::write(logs.join("proof.json"), "stale evidence").unwrap();
        let output = Command::new(binary())
            .args([
                "--verify",
                workspace.to_str().unwrap(),
                logs.to_str().unwrap(),
            ])
            .env("PATH", &bin)
            .env("SCENARIO", mode)
            .env("WORKSPACE", &workspace)
            .output()
            .unwrap();
        assert_eq!(
            output.status.success(),
            mode == "pass",
            "{mode}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(logs.join("proof.json").exists(), mode == "pass");
        if mode == "pass" {
            let proof: Proof =
                serde_json::from_slice(&fs::read(logs.join("proof.json")).unwrap()).unwrap();
            validate_proof(&proof, &verification_steps(&workspace).unwrap()).unwrap();
            assert_eq!(proof.fingerprint, tree_digest(&workspace).unwrap());
            assert_eq!(proof.checks.len(), 10);
        } else {
            let error = String::from_utf8_lossy(&output.stderr);
            assert!(error.contains(if mode == "fail" { "failed" } else { "changed" }));
        }
        assert!(
            fs::read_to_string(logs.join("web-ui.log"))
                .unwrap()
                .contains("test:e2e:ui")
        );
    }
}

#[tokio::test]
async fn production_controller_writes_backup_activates_and_restores_using_fake_systemd() {
    use axum::{Router, routing::get};
    use std::sync::{Arc, Mutex};
    let fixture = Fixture::new();
    let base = &fixture.0;
    let home = base.join("home");
    let bin = base.join("bin");
    let runtime = base.join("releases/one");
    let run = base.join("runs/one");
    for path in [
        home.join(".config/systemd/user/jait-gateway.service.d"),
        bin.clone(),
        runtime.join(".github/scripts"),
        run.clone(),
        base.join("installed/bin"),
    ] {
        fs::create_dir_all(path).unwrap();
    }
    let entry = base.join("installed/bin/jait.mjs");
    fs::write(&entry, "setInterval(()=>{},1000)").unwrap();
    fs::write(
        base.join("installed/package.json"),
        r#"{"name":"@jait/gateway","version":"old"}"#,
    )
    .unwrap();
    let node = node_binary();
    let mut service = Child(
        Command::new(&node)
            .arg(&entry)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    // Wait for exec to replace the forked command before reading /proc.
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    let expected = vec![
        node.to_string_lossy().to_string(),
        entry.to_string_lossy().to_string(),
    ];
    loop {
        let argv: Vec<_> = fs::read_to_string(format!("/proc/{}/cmdline", service.0.id()))
            .unwrap()
            .split('\0')
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        if argv == expected {
            break;
        }
        assert!(std::time::Instant::now() < deadline);
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    executable(
        &bin.join("systemctl"),
        &format!(
            "#!/bin/sh\nprintf '%s\\n' \"$*\" >> '{}'\ncase \"$*\" in *MainPID*) printf '%s\\n' {};; esac\n",
            base.join("systemd-events").display(),
            service.0.id()
        ),
    );
    let version = Arc::new(Mutex::new("new".to_string()));
    let state = version.clone();
    let app =
        Router::new().route(
            "/health",
            get(move || {
                let state = state.clone();
                async move {
                    axum::Json(json!({"healthy":true,"version":state.lock().unwrap().clone()}))
                }
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let hash = tree_digest(&runtime).unwrap();
    let plan = Plan {
        artifact_root: base.clone(),
        previous_argv: expected.clone(),
        unit: "jait-gateway.service".into(),
        port,
        previous_version: "old".into(),
        version: "new".into(),
        build_id: "one".into(),
        runtime: runtime.clone(),
        runtime_hash: hash.clone(),
        r#override: home.join(".config/systemd/user/jait-gateway.service.d/90-jait-local.conf"),
        unit_text: override_unit(
            &expected,
            runtime
                .join("packages/gateway/bin/jait.mjs")
                .to_str()
                .unwrap(),
        )
        .unwrap(),
        proof: Proof {
            fingerprint: hash,
            checks: verification_steps(&runtime)
                .unwrap()
                .into_iter()
                .map(|step| Check { step, passed: true })
                .collect(),
        },
    };
    fs::write(&plan.r#override, "previous local override").unwrap();
    let path = run.join("plan.json");
    fs::write(&path, serde_json::to_vec(&plan).unwrap()).unwrap();
    for op in ["--activate", "--restore"] {
        fs::create_dir(base.join("lock")).unwrap();
        if op == "--restore" {
            // A newer override and a malformed backup must both fail before touching the service.
            fs::remove_dir_all(base.join("lock")).unwrap();
            let backup = fs::read(run.join("rollback.json")).unwrap();
            for stale in [true, false] {
                fs::create_dir(base.join("lock")).unwrap();
                fs::write(
                    &plan.r#override,
                    if stale {
                        "newer deployment"
                    } else {
                        &plan.unit_text
                    },
                )
                .unwrap();
                if !stale {
                    fs::write(run.join("rollback.json"), "{}").unwrap();
                }
                let rejected = tokio::process::Command::new(binary())
                    .args(["--restore", path.to_str().unwrap()])
                    .env("HOME", &home)
                    .env("PATH", &bin)
                    .output()
                    .await
                    .unwrap();
                assert!(!rejected.status.success());
                assert!(
                    String::from_utf8_lossy(&rejected.stderr).contains(if stale {
                        "newer deployment"
                    } else {
                        "Malformed"
                    })
                );
                assert_eq!(
                    fs::read_to_string(&plan.r#override).unwrap(),
                    if stale {
                        "newer deployment"
                    } else {
                        &plan.unit_text
                    }
                );
                assert!(!base.join("lock").exists());
            }
            fs::write(run.join("rollback.json"), backup).unwrap();
            fs::create_dir(base.join("lock")).unwrap();
            *version.lock().unwrap() = "old".into();
        }
        let output = tokio::process::Command::new(binary())
            .args([op, path.to_str().unwrap()])
            .env("HOME", &home)
            .env("PATH", &bin)
            .output()
            .await
            .unwrap();
        assert!(
            output.status.success(),
            "{op}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let evidence = run.join(if op == "--activate" {
            "activation.json"
        } else {
            "rollback-result.json"
        });
        let evidence: Value = serde_json::from_slice(&fs::read(evidence).unwrap()).unwrap();
        assert_eq!(evidence["passed"], true);
        assert!(!base.join("lock").exists());
        assert_eq!(
            fs::read_to_string(&plan.r#override).unwrap(),
            if op == "--activate" {
                plan.unit_text.as_str()
            } else {
                "previous local override"
            }
        );
    }
    let backup: Value =
        serde_json::from_slice(&fs::read(run.join("rollback.json")).unwrap()).unwrap();
    assert_eq!(backup["override"], "previous local override");
    let events = fs::read_to_string(base.join("systemd-events")).unwrap();
    assert_eq!(
        events
            .matches("--user restart jait-gateway.service")
            .count(),
        2
    );
    server.abort();
    service.0.kill().unwrap();
}

#[tokio::test]
async fn timeout_kills_signal_resistant_descendants_in_the_stage_process_group() {
    let fixture = Fixture::new();
    let result = run_logged(
        "/bin/sh",
        &[
            "-c".into(),
            "trap '' TERM; /bin/sleep 30 & echo $! > sleeper.pid; wait".into(),
        ],
        &fixture.0,
        &fixture.0.join("timeout.log"),
        Duration::from_millis(100),
    )
    .await;
    assert!(result.unwrap_err().contains("exceeded"));
    let pid = fs::read_to_string(fixture.0.join("sleeper.pid")).unwrap();
    let stat = fs::read_to_string(format!("/proc/{}/stat", pid.trim())).unwrap_or_default();
    assert!(
        stat.is_empty() || stat.split(") ").nth(1).unwrap().starts_with('Z'),
        "descendant still executing: {stat}"
    );
}
