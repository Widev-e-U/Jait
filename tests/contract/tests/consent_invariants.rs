//! Requirements-first safety checks, independent of translated TypeScript test expectations.
#[allow(dead_code)]
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

const MODES: &[&str] = &[
    "approve",
    "reject",
    "shutdown",
    "timeout",
    "abort-before-approval",
    "abort-after-approval",
    "already-aborted-full-access",
    "already-aborted-consent",
    "dry-run",
];
fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn artifacts(label: &str) -> PathBuf {
    let p = root()
        .join(".jait/artifacts/test-strength-consent")
        .join(format!("{label}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&p).unwrap();
    p
}
fn request() -> Value {
    let calls = [false, true]
        .iter()
        .flat_map(|delegate| {
            MODES
                .iter()
                .map(move |mode| json!({"op":"consent.lifecycle","mode":mode,"delegate":delegate}))
        })
        .collect::<Vec<_>>();
    json!({"version":1,"calls":calls})
}
fn violations(reply: &Value) -> Vec<String> {
    let mut errors = Vec::new();
    let rows = reply.as_array().expect("observations");
    assert_eq!(rows.len(), MODES.len() * 2);
    for (call, row) in request()["calls"].as_array().unwrap().iter().zip(rows) {
        let mode = call["mode"].as_str().unwrap();
        let route = if call["delegate"] == true {
            "delegate"
        } else {
            "registry"
        };
        let label = format!("{mode}/{route}");
        if row["before"]["effects"] != json!([]) {
            errors.push(format!(
                "{label}: effect before approval/cancellation check"
            ));
        }
        let expected = if mode == "approve" {
            json!([route])
        } else {
            json!([])
        };
        if row["effects"] != expected {
            errors.push(format!(
                "{label}: expected effects {expected}, got {}",
                row["effects"]
            ));
        }
        let ok = mode == "approve" || mode == "dry-run";
        if row["ok"] != ok {
            errors.push(format!("{label}: incorrect result status"));
        }
        if row["pending"] != 0 {
            errors.push(format!("{label}: unsettled consent request"));
        }
        let approvals = if mode == "approve" { 1 } else { 0 };
        if row["approvedCount"] != approvals {
            errors.push(format!("{label}: unauthorized trust progression"));
        }
        if row["sessionApprovals"] != json!([]) {
            errors.push(format!(
                "{label}: dangerous tool acquired persistent approval"
            ));
        }
        let queued = !mode.starts_with("already-aborted") && mode != "dry-run";
        if row["before"]["pending"] != usize::from(queued) {
            errors.push(format!("{label}: incorrect request lifecycle"));
        }
    }
    errors
}
#[test]
fn consent_lifecycle_never_starts_cancelled_or_unapproved_effects() {
    let dir = artifacts("lifecycle");
    let reply =
        internal_driver::call(&root(), &dir, request(), &|| false).expect("real consent adapter");
    let errors = violations(&reply);
    fs::write(
        dir.join("summary.json"),
        serde_json::to_vec_pretty(
            &json!({"scenarios":MODES.len()*2,"violations":errors,"success":errors.is_empty()}),
        )
        .unwrap(),
    )
    .unwrap();
    assert!(errors.is_empty(), "{}", errors.join("\n"));
}

// Mutate disposable source copies, then require successful execution with an
// observable violation. Build errors, timeouts and adapter errors never count
// as a killed behavioral mutant.
fn mutation_root(directory: &Path, source: &str) -> PathBuf {
    let drivers = directory.join("tests/contract/drivers");
    fs::create_dir_all(&drivers).unwrap();
    let permission = serde_json::to_string(
        root()
            .join("packages/gateway/src/security/tool-permissions.ts")
            .to_str()
            .unwrap(),
    )
    .unwrap();
    let executor_path = directory.join("consent-executor.ts");
    fs::write(
        &executor_path,
        source.replace("\"./tool-permissions.js\"", &permission),
    )
    .unwrap();
    let mut adapter = fs::read_to_string(root().join("tests/contract/drivers/consent.ts")).unwrap();
    for name in ["consent-executor", "consent-manager", "trust-engine"] {
        let target = if name == "consent-executor" {
            executor_path.clone()
        } else {
            root().join(format!("packages/gateway/src/security/{name}.ts"))
        };
        adapter = adapter.replace(
            &format!("'../../../packages/gateway/src/security/{name}.ts'"),
            &serde_json::to_string(target.to_str().unwrap()).unwrap(),
        );
    }
    fs::write(drivers.join("consent.ts"), adapter).unwrap();
    fs::write(drivers.join("internals.ts"), r#"
import { dispatch } from './consent.ts';
let text = '';
for await (const chunk of Bun.stdin.stream()) { text += Buffer.from(chunk).toString('utf8'); if(text.length > 65536) throw Error('input limit'); }
const request = JSON.parse(text);
const results = [];
for(const call of request.calls) results.push(await dispatch(call));
console.log(JSON.stringify({version:1,results}));
"#).unwrap();
    directory.to_owned()
}
#[test]
fn consent_oracle_catches_removed_safety_guards() {
    let directory = artifacts("mutations");
    let source =
        fs::read_to_string(root().join("packages/gateway/src/security/consent-executor.ts"))
            .unwrap();
    let mutations = [
        (
            "allow-already-cancelled-request",
            "if (context.signal?.aborted) return { ok: false, message: \"Cancelled\" };",
            "",
        ),
        (
            "allow-late-approval-after-cancellation",
            "if (context.signal?.aborted) return Promise.resolve({ ok: false, message: \"Cancelled\" });",
            "",
        ),
        (
            "execute-after-rejection",
            "if (!decision.approved) {",
            "if (false) {",
        ),
        (
            "execute-before-decision",
            "const decision = await this.consentManager.requestConsent({",
            "void this.runTool(toolName, input, context);\n    const decision = await this.consentManager.requestConsent({",
        ),
        ("ignore-dry-run", "if (options.dryRun) {", "if (false) {"),
    ];
    // The copied, unmodified source must obey the same oracle before mutation.
    let baseline = mutation_root(&directory.join("copy-baseline"), &source);
    let reply =
        internal_driver::call(&baseline, &baseline.join("run"), request(), &|| false).unwrap();
    assert!(
        violations(&reply).is_empty(),
        "source-copy harness changed baseline behavior"
    );
    let mut rows = Vec::new();
    for (name, needle, replacement) in mutations {
        assert_eq!(
            source.matches(needle).count(),
            1,
            "mutation target changed: {name}"
        );
        let copy = mutation_root(
            &directory.join(name),
            &source.replacen(needle, replacement, 1),
        );
        let reply = internal_driver::call(&copy, &copy.join("run"), request(), &|| false)
            .unwrap_or_else(|error| {
                panic!("{name}: execution error is not a behavioral kill: {error:#}")
            });
        let errors = violations(&reply);
        rows.push(json!({"mutation":name,"caught":!errors.is_empty(),"violations":errors}));
    }
    fs::write(
        directory.join("summary.json"),
        serde_json::to_vec_pretty(&json!({"mutants":rows,"baseline_passed":true})).unwrap(),
    )
    .unwrap();
    assert!(
        rows.iter().all(|row| row["caught"] == true),
        "surviving mutation: {rows:?}"
    );
}
