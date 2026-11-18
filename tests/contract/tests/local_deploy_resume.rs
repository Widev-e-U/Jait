#![cfg(unix)]
use jait_gateway::execution::local_deploy::*;
use serde_json::{Value, json};
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::PathBuf,
};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/local-deploy-tests/resume")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(root.join(".jait")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::write(root.join("source.ts"), "source").unwrap();
        fs::write(root.join("bun.lock"), "lock").unwrap();
        fs::write(root.join("node_modules/pkg/index.js"), "dependency").unwrap();
        let fixture = Self(root.canonicalize().unwrap());
        fixture.context(false, "a");
        fixture
    }
    fn context(&self, fresh: bool, key: &str) {
        fs::write(
            self.0.join(".jait/verification-context.json"),
            json!({"key": key.repeat(64), "fresh": fresh}).to_string(),
        )
        .unwrap();
    }
    fn passes(&self) -> Value {
        serde_json::from_slice(&fs::read(self.0.join(".jait/verification-passes.json")).unwrap())
            .unwrap()
    }
    fn edit_passes(&self, edit: impl FnOnce(&mut Value)) {
        let mut value = self.passes();
        edit(&mut value);
        fs::write(
            self.0.join(".jait/verification-passes.json"),
            value.to_string(),
        )
        .unwrap();
    }
    async fn run(&self, name: &str, steps: &[Step]) -> Result<Proof> {
        let logs = self.0.join(".jait").join(name);
        fs::create_dir_all(&logs).unwrap();
        let mut host = FilesystemVerificationHost::new(self.0.clone(), logs, steps);
        host.enable_resume();
        let result = verify(&mut host, steps).await;
        host.save_passes().unwrap();
        result
    }
    fn reused(&self, run: &str, id: &str) -> bool {
        fs::read_to_string(self.0.join(".jait").join(run).join(format!("{id}.log")))
            .unwrap()
            .contains("reused successful verification")
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn steps() -> Vec<Step> {
    [
        "release-guard",
        "artifact-paths",
        "typecheck",
        "unit-tests",
        "workflow-tests",
        "lint",
        "rust-migration",
        "browser-tools",
        "web-e2e",
        "web-ui",
    ]
    .into_iter()
    .map(|id| Step {
        id: id.into(),
        command: "/bin/sh".into(),
        args: vec![
            "-c".into(),
            format!("echo {id} >> .jait/events; test ! -e .jait/fail-{id}"),
        ],
    })
    .collect()
}
const REUSED: [&str; 4] = ["typecheck", "unit-tests", "lint", "rust-migration"];

#[tokio::test]
async fn retry_reuses_only_completed_local_checks_and_keeps_proof_order() {
    let fixture = Fixture::new();
    let steps = steps();
    fs::write(fixture.0.join(".jait/fail-web-ui"), "").unwrap();
    assert!(fixture.run("failed", &steps).await.is_err());
    assert_eq!(fixture.passes()["checks"].as_array().unwrap().len(), 4);
    fs::remove_file(fixture.0.join(".jait/fail-web-ui")).unwrap();
    let proof = fixture.run("retry", &steps).await.unwrap();
    assert_eq!(
        proof.checks.iter().map(|c| &c.step).collect::<Vec<_>>(),
        steps.iter().collect::<Vec<_>>()
    );
    assert!(proof.checks.iter().all(|c| c.passed));
    let events = fs::read_to_string(fixture.0.join(".jait/events")).unwrap();
    for step in &steps {
        assert_eq!(
            fixture.reused("retry", &step.id),
            REUSED.contains(&step.id.as_str()),
            "{}",
            step.id
        );
        assert_eq!(
            events.lines().filter(|line| *line == step.id).count(),
            if REUSED.contains(&step.id.as_str()) {
                1
            } else {
                2
            }
        );
    }
    // Reusing a pass does not extend its expiry.
    fixture.edit_passes(|value| value["completed_at"] = json!(1));
    fixture.run("expired", &steps).await.unwrap();
    assert!(!fixture.reused("expired", "typecheck"));
}

#[tokio::test]
async fn changes_to_source_dependencies_configuration_environment_or_step_rerun_checks() {
    for change in [
        "source",
        "dependency",
        "lockfile",
        "configuration",
        "permissions",
        "symlink",
        "environment",
        "command",
        "args",
    ] {
        let fixture = Fixture::new();
        let mut steps = steps();
        fixture.run("first", &steps).await.unwrap();
        match change {
            "source" => fs::write(fixture.0.join("source.ts"), "changed").unwrap(),
            "dependency" => {
                fs::write(fixture.0.join("node_modules/pkg/index.js"), "changed").unwrap()
            }
            "lockfile" => fs::write(fixture.0.join("bun.lock"), "changed").unwrap(),
            "configuration" => fs::write(fixture.0.join("tsconfig.json"), "{}").unwrap(),
            "permissions" => fs::set_permissions(
                fixture.0.join("source.ts"),
                fs::Permissions::from_mode(0o700),
            )
            .unwrap(),
            "symlink" => symlink("source.ts", fixture.0.join("source-link")).unwrap(),
            "environment" => fixture.context(false, "b"),
            "command" => steps[2].command = "/bin/bash".into(),
            "args" => steps[2].args[1].push_str("; true"),
            _ => unreachable!(),
        }
        fixture.run("changed", &steps).await.unwrap();
        assert!(!fixture.reused("changed", "typecheck"), "{change}");
    }
}

#[tokio::test]
async fn absent_corrupt_expired_future_or_fresh_receipts_fail_closed() {
    for mode in [
        "missing",
        "corrupt",
        "version",
        "future",
        "fresh",
        "missing-context",
        "bad-context",
        "failed-pass",
    ] {
        let fixture = Fixture::new();
        let steps = steps();
        fixture.run("first", &steps).await.unwrap();
        let path = fixture.0.join(".jait/verification-passes.json");
        match mode {
            "missing" => fs::remove_file(path).unwrap(),
            "corrupt" => fs::write(path, "{truncated").unwrap(),
            "version" => fixture.edit_passes(|v| v["version"] = json!(99)),
            "future" => fixture.edit_passes(|v| v["completed_at"] = json!(u64::MAX)),
            "fresh" => fixture.context(true, "a"),
            "missing-context" => {
                fs::remove_file(fixture.0.join(".jait/verification-context.json")).unwrap()
            }
            "bad-context" => {
                fs::write(fixture.0.join(".jait/verification-context.json"), "{}").unwrap()
            }
            "failed-pass" => fixture.edit_passes(|v| {
                for c in v["checks"].as_array_mut().unwrap() {
                    c["passed"] = json!(false);
                }
            }),
            _ => unreachable!(),
        }
        fixture.run("retry", &steps).await.unwrap();
        for id in REUSED {
            assert!(!fixture.reused("retry", id), "{mode}: {id}");
        }
    }
}

#[tokio::test]
async fn failed_or_changed_checks_and_unhashed_symlinks_never_create_reusable_passes() {
    let fixture = Fixture::new();
    let step = steps()[2].clone();
    fs::write(fixture.0.join(".jait/fail-typecheck"), "").unwrap();
    assert!(
        fixture
            .run("failed", std::slice::from_ref(&step))
            .await
            .is_err()
    );
    assert_eq!(fixture.passes()["checks"], json!([]));
    fs::remove_file(fixture.0.join(".jait/fail-typecheck")).unwrap();
    fixture
        .run("retry", std::slice::from_ref(&step))
        .await
        .unwrap();
    assert!(!fixture.reused("retry", "typecheck"));
    for (name, target) in [("external", "/etc/hosts"), ("ignored", ".jait/input")] {
        let fixture = Fixture::new();
        fs::write(fixture.0.join(".jait/input"), "unhashed").unwrap();
        symlink(target, fixture.0.join("link")).unwrap();
        fixture
            .run(name, std::slice::from_ref(&step))
            .await
            .unwrap();
        assert!(!fixture.0.join(".jait/verification-passes.json").exists());
    }
    let fixture = Fixture::new();
    let mut drift = step;
    drift.args[1] = "echo changed >> source.ts".into();
    assert!(fixture.run("drift", &[drift]).await.is_err());
    assert!(!fixture.0.join(".jait/verification-passes.json").exists());
}

#[tokio::test]
async fn dependency_drift_after_reusing_a_pass_blocks_proof() {
    let fixture = Fixture::new();
    let initial = steps()[2].clone();
    fixture
        .run("first", std::slice::from_ref(&initial))
        .await
        .unwrap();
    let drift = Step {
        id: "browser-tools".into(),
        command: "/bin/sh".into(),
        args: vec![
            "-c".into(),
            "echo changed >> node_modules/pkg/index.js".into(),
        ],
    };
    let result = fixture.run("drift", &[initial, drift]).await;
    assert!(fixture.reused("drift", "typecheck"));
    assert!(result.unwrap_err().contains("inputs changed"));
}
