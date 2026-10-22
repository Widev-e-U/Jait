#![cfg(unix)]
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::execution::local_deploy::*;
use serde_json::{Value, json};
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::{Path, PathBuf},
    time::Duration,
};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = root()
            .join(".jait/artifacts/local-deploy-tests/rust")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn observe(calls: Vec<Value>) -> Value {
    let fixture = Fixture::new();
    internal_driver::call(
        &root(),
        &fixture.0,
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap()
}
struct FakeVerifier {
    events: Vec<String>,
    fail: Option<String>,
    drift: bool,
    fingerprints: usize,
}
impl VerificationHost for FakeVerifier {
    async fn fingerprint(&mut self) -> Result<String> {
        self.fingerprints += 1;
        Ok(if self.drift {
            self.fingerprints.to_string()
        } else {
            "exact-build".into()
        })
    }
    async fn run(&mut self, step: &Step) -> Result<()> {
        self.events.push(step.id.clone());
        if self.fail.as_deref() == Some(&step.id) {
            Err("failed stage".into())
        } else {
            Ok(())
        }
    }
}
#[tokio::test]
async fn native_gate_matches_reference_for_success_drift_and_every_failed_stage() {
    let steps = verification_steps(&root()).unwrap();
    assert_eq!(
        serde_json::to_value(&steps).unwrap(),
        observe(vec![json!({"op":"localdeploy.steps"})])[0]
    );
    let required: Vec<_> = steps.iter().map(|step| step.id.as_str()).collect();
    assert_eq!(
        required,
        [
            "release-guard",
            "artifact-paths",
            "typecheck",
            "unit-tests",
            "workflow-tests",
            "lint",
            "browser-tools",
            "rust-migration",
            "web-e2e",
            "web-ui"
        ]
    );
    let mut calls = vec![
        json!({"op":"localdeploy.check"}),
        json!({"op":"localdeploy.check","drift":true}),
    ];
    calls.extend(
        required
            .iter()
            .map(|id| json!({"op":"localdeploy.check","fail":id})),
    );
    let reference = observe(calls.clone());
    for (i, call) in calls.iter().enumerate() {
        let mut host = FakeVerifier {
            events: vec![],
            fail: call["fail"].as_str().map(String::from),
            drift: call["drift"] == true,
            fingerprints: 0,
        };
        let result = verify(&mut host, &steps).await;
        let native = json!({"required":required,"events":host.events,"activated":usize::from(result.is_ok()),"error":result.err()});
        assert_eq!(native, reference[i], "case {call}");
    }
}
struct FakeActivation {
    events: Vec<Value>,
    fail: Option<String>,
    failed: bool,
    absent: bool,
    rollback_failure: bool,
}
impl FakeActivation {
    fn event(&mut self, name: &str, value: Option<Value>) -> Result<()> {
        self.events.push(match value {
            Some(v) => json!([name, v]),
            None => json!([name]),
        });
        if self.fail.as_deref() == Some(name) && !self.failed {
            self.failed = true;
            Err("injected failure".into())
        } else if self.rollback_failure && self.failed && name == "restart" {
            Err("previous service restart failed".into())
        } else {
            Ok(())
        }
    }
}
impl ActivationHost for FakeActivation {
    async fn read_override(&mut self) -> Result<Option<String>> {
        self.event("read", None)?;
        Ok(if self.absent {
            None
        } else {
            Some("old override".into())
        })
    }
    async fn backup(&mut self, previous: &Option<String>) -> Result<()> {
        self.event("backup", Some(json!(previous)))
    }
    async fn write_override(&mut self, text: &str) -> Result<()> {
        self.event("write", Some(json!(text)))
    }
    async fn remove_override(&mut self) -> Result<()> {
        self.event("remove", None)
    }
    async fn reload(&mut self) -> Result<()> {
        self.event("reload", None)
    }
    async fn restart(&mut self) -> Result<()> {
        self.event("restart", None)
    }
    async fn health(&mut self, version: &str) -> Result<()> {
        self.event("health", Some(json!(version)))
    }
}
fn fake_activation(call: &Value) -> FakeActivation {
    FakeActivation {
        events: vec![],
        fail: call["fail"].as_str().map(String::from),
        failed: false,
        absent: call["absent"] == true,
        rollback_failure: false,
    }
}
fn plan(fixture: &Fixture) -> Plan {
    let base = &fixture.0;
    let runtime = base.join("releases/one");
    let run = base.join("runs/one");
    fs::create_dir_all(runtime.join(".github/scripts")).unwrap();
    fs::create_dir_all(&run).unwrap();
    fs::write(run.join("plan.json"), "{}").unwrap();
    let argv = vec![
        "/usr/bin/node".into(),
        "--max-old-space-size=2048".into(),
        "/old/bin/jait.mjs".into(),
        "--port".into(),
        "8000".into(),
    ];
    let fingerprint = tree_digest(&runtime).unwrap();
    let checks = verification_steps(&runtime)
        .unwrap()
        .into_iter()
        .map(|step| Check { step, passed: true })
        .collect();
    Plan {
        artifact_root: base.clone(),
        previous_argv: argv.clone(),
        unit: "jait-gateway.service".into(),
        port: 8000,
        previous_version: "old".into(),
        version: "new".into(),
        build_id: "one".into(),
        runtime_hash: fingerprint.clone(),
        r#override: base
            .join("home/.config/systemd/user/jait-gateway.service.d/90-jait-local.conf"),
        unit_text: override_unit(
            &argv,
            runtime
                .join("packages/gateway/bin/jait.mjs")
                .to_str()
                .unwrap(),
        )
        .unwrap(),
        runtime,
        proof: Proof {
            fingerprint,
            checks,
        },
    }
}
#[tokio::test]
async fn native_activation_matches_reference_for_success_and_every_effect_failure() {
    let fixture = Fixture::new();
    let mut plan = plan(&fixture);
    plan.unit_text = "new override".into();
    let mut calls = vec![];
    for absent in [true, false] {
        for fail in [
            None,
            Some("read"),
            Some("backup"),
            Some("write"),
            Some("reload"),
            Some("restart"),
            Some("health"),
        ] {
            calls.push(json!({"op":"localdeploy.activate","absent":absent,"fail":fail}));
        }
    }
    let reference = observe(calls.clone());
    for (i, call) in calls.iter().enumerate() {
        let mut host = fake_activation(call);
        let result = activate(&mut host, &plan).await;
        assert_eq!(
            json!({"events":host.events,"error":result.err()}),
            reference[i],
            "case {call}"
        );
    }
}
#[tokio::test]
async fn failed_rollback_never_claims_the_previous_service_was_restored() {
    let fixture = Fixture::new();
    let mut host = fake_activation(&json!({"fail":"health"}));
    host.rollback_failure = true;
    let error = activate(&mut host, &plan(&fixture)).await.unwrap_err();
    assert!(error.contains("rollback failed: previous service restart failed"));
    assert!(!error.contains("configuration restored"));
}
#[test]
fn native_literal_service_arguments_match_reference() {
    let argv = vec![
        "/usr/bin/node",
        "--max-old-space-size=1234",
        "/old/bin/jait.mjs",
        "--env",
        "/a b/$x%q\\\".env",
    ];
    let entry = "/project/a b%/bin/jait.mjs";
    let mut calls: Vec<Value> = ["", "hello", "$HOME %n \"x\" \\ z", "🦀", "\n", "\0", "\r"]
        .iter()
        .map(|value| json!({"op":"localdeploy.quote","value":value}))
        .collect();
    calls.push(json!({"op":"localdeploy.quote","argv":argv,"entry":entry}));
    calls.push(
        json!({"op":"localdeploy.quote","argv":["/bin/sh","/old/bin/jait.mjs"],"entry":entry}),
    );
    let reference = observe(calls.clone());
    for (i, call) in calls.iter().enumerate() {
        let result = if let Some(argv) = call["argv"].as_array() {
            override_unit(
                &argv
                    .iter()
                    .map(|s| s.as_str().unwrap().into())
                    .collect::<Vec<_>>(),
                call["entry"].as_str().unwrap(),
            )
        } else {
            systemd_quote(call["value"].as_str().unwrap())
        };
        let native = match result {
            Ok(value) => json!({"result":value,"error":null}),
            Err(error) => json!({"result":null,"error":error}),
        };
        assert_eq!(native, reference[i]);
    }
}
#[test]
fn native_build_fingerprint_matches_reference_and_detects_bytes_modes_and_links() {
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.0.join("node_modules")).unwrap();
    fs::write(fixture.0.join("node_modules/ignored"), "deps").unwrap();
    fs::write(fixture.0.join("z"), "one").unwrap();
    fs::write(fixture.0.join("🦀"), "unicode").unwrap();
    fs::write(fixture.0.join("\u{e000}"), "utf16 order").unwrap();
    symlink("z", fixture.0.join("link")).unwrap();
    let mut before = tree_digest(&fixture.0).unwrap();
    assert_eq!(
        json!(before),
        observe(vec![json!({"op":"localdeploy.digest","root":fixture.0})])[0]
    );
    for change in 0..3 {
        match change {
            0 => fs::write(fixture.0.join("z"), "two").unwrap(),
            1 => {
                fs::set_permissions(fixture.0.join("z"), fs::Permissions::from_mode(0o700)).unwrap()
            }
            _ => {
                fs::remove_file(fixture.0.join("link")).unwrap();
                symlink("🦀", fixture.0.join("link")).unwrap();
            }
        }
        let after = tree_digest(&fixture.0).unwrap();
        assert_ne!(after, before);
        assert_eq!(
            json!(after),
            observe(vec![json!({"op":"localdeploy.digest","root":fixture.0})])[0]
        );
        before = after;
    }
}
#[test]
fn proof_requires_exact_order_commands_arguments_counts_and_build_binding() {
    let fixture = Fixture::new();
    let plan = plan(&fixture);
    let path = fixture.0.join("runs/one/plan.json");
    let home = fixture.0.join("home");
    validate_plan(&plan, &path, &home).unwrap();
    for mutation in 0..12 {
        let mut altered = plan.clone();
        match mutation {
            0 => {
                altered.proof.checks.pop();
            }
            1 => altered.proof.checks[0].passed = false,
            2 => altered.proof.checks.swap(0, 1),
            3 => altered.proof.checks[0].step.command = "true".into(),
            4 => altered.proof.checks[0].step.args.push("--skip".into()),
            5 => altered.proof.checks.push(altered.proof.checks[0].clone()),
            6 => altered.runtime_hash = "b".repeat(64),
            7 => altered.unit = "other.service".into(),
            8 => altered.r#override = home.join("other.conf"),
            9 => altered.unit_text.push_str("ExecStart=/bin/true\n"),
            10 => altered.runtime = fixture.0.join("releases"),
            _ => altered.port = 0,
        }
        assert!(
            validate_plan(&altered, &path, &home).is_err(),
            "mutation {mutation}"
        );
    }
    symlink(&plan.runtime, fixture.0.join("releases/alias")).unwrap();
    let mut alias = plan.clone();
    alias.runtime = fixture.0.join("releases/alias");
    assert!(validate_plan(&alias, &path, &home).is_err());
    assert!(validate_plan(&plan, &fixture.0.join("runs/one/../one/plan.json"), &home).is_err());
}
#[tokio::test]
async fn real_process_nonzero_signal_timeout_and_partial_logs_cannot_pass() {
    let fixture = Fixture::new();
    for (name, script, limit, success) in [
        ("success", "printf passed", 1000, true),
        ("nonzero", "printf partial; exit 7", 1000, false),
        ("signal", "kill -TERM $$", 1000, false),
        ("timeout", "sleep 30", 30, false),
    ] {
        let log = fixture.0.join(format!("{name}.log"));
        let result = run_logged(
            "/bin/sh",
            &["-c".into(), script.into()],
            &fixture.0,
            &log,
            Duration::from_millis(limit),
        )
        .await;
        assert_eq!(result.is_ok(), success, "{name}: {result:?}");
        if name == "nonzero" {
            assert_eq!(fs::read_to_string(log).unwrap(), "partial");
        }
    }
    assert!(
        run_logged(
            "/missing/jait-deploy-program",
            &[],
            &fixture.0,
            &fixture.0.join("spawn.log"),
            Duration::from_secs(1)
        )
        .await
        .is_err()
    );
}
#[tokio::test]
async fn real_loopback_health_rejects_wrong_versions_unhealthy_and_redirects() {
    use axum::{
        Router,
        response::{IntoResponse, Response},
        routing::get,
    };
    async fn health(axum::extract::State(body): axum::extract::State<Value>) -> Response {
        if body["redirect"] == true {
            return axum::response::Redirect::temporary("/healthy").into_response();
        }
        axum::Json(body).into_response()
    }
    for (body, expected) in [
        (json!({"version":"new","healthy":true}), true),
        (json!({"version":"old","healthy":true}), false),
        (json!({"version":"new","healthy":false}), false),
        (json!({"redirect":true}), false),
    ] {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let app = Router::new()
            .route("/health", get(health))
            .route(
                "/healthy",
                get(|| async { axum::Json(json!({"version":"new","healthy":true})) }),
            )
            .with_state(body);
        let task = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let result = wait_for_version(port, "new", Duration::from_millis(100)).await;
        task.abort();
        assert_eq!(result.is_ok(), expected);
    }
}
fn native_binary() -> &'static Path {
    Path::new(env!("CARGO_BIN_EXE_jait-local-deploy"))
}
#[test]
fn real_native_controller_refuses_tampered_plan_before_service_changes() {
    let fixture = Fixture::new();
    let mut plan = plan(&fixture);
    plan.proof.checks.clear();
    let path = fixture.0.join("runs/one/plan.json");
    fs::write(&path, serde_json::to_vec(&plan).unwrap()).unwrap();
    let output = std::process::Command::new(native_binary())
        .args(["--activate", path.to_str().unwrap()])
        .env("HOME", fixture.0.join("home"))
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("Missing mandatory verification evidence")
    );
    assert!(!plan.r#override.exists());
    assert!(!path.parent().unwrap().join("activation.json").exists());
}
#[test]
fn real_native_verification_cancellation_kills_the_running_stage_without_proof() {
    let fixture = Fixture::new();
    let bin = fixture.0.join("bin");
    let logs = fixture.0.join("logs");
    fs::create_dir_all(&bin).unwrap();
    fs::create_dir_all(&logs).unwrap();
    fs::create_dir_all(fixture.0.join(".github/scripts")).unwrap();
    let bun = bin.join("bun");
    fs::write(&bun, "#!/bin/sh\nprintf started\nexec /bin/sleep 30\n").unwrap();
    fs::set_permissions(&bun, fs::Permissions::from_mode(0o700)).unwrap();
    let mut child = std::process::Command::new(native_binary())
        .args([
            "--verify",
            fixture.0.to_str().unwrap(),
            logs.to_str().unwrap(),
        ])
        .env("PATH", &bin)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while !fs::read_to_string(logs.join("release-guard.log"))
        .unwrap_or_default()
        .contains("started")
    {
        assert!(std::time::Instant::now() < deadline, "stage did not start");
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(
        std::process::Command::new("/bin/kill")
            .args(["-TERM", &child.id().to_string()])
            .status()
            .unwrap()
            .success()
    );
    let deadline = std::time::Instant::now() + Duration::from_secs(8);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            panic!("cancelled controller did not exit");
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    assert!(!status.success());
    assert!(!logs.join("proof.json").exists());
}
