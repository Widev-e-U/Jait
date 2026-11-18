//! Release regressions execute the shipped Node updater with real ESM dependencies.
use serde_json::{Value, json};
use std::{fs, path::PathBuf, process::Command};

fn fixture(mode: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let directory = root
        .join(".jait/artifacts/gateway-update-regressions")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    let output = Command::new("node")
        .arg(root.join("tests/contract/drivers/gateway-updates.mjs"))
        .arg(&directory)
        .arg(mode)
        .current_dir(&root)
        .output()
        .expect("run real updater fixture");
    assert!(
        output.status.success(),
        "fixture failed: {}; evidence {}",
        String::from_utf8_lossy(&output.stderr),
        directory.display()
    );
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        result["started"], false,
        "validation must not start a server"
    );
    assert_eq!(
        result["lockExists"], false,
        "must permit a corrected update"
    );
    result
}

#[test]
fn missing_shared_export_is_rejected_before_stopping_or_replacing_the_live_gateway() {
    let result = fixture("missing-export");
    assert!(
        result["error"]
            .as_str()
            .unwrap()
            .contains("sessionWaitLabel")
    );
    assert_eq!(result["events"], json!(["syntax", "version", "link"]));
    assert_eq!(result["version"], "0.1.956");
    assert_eq!(result["preserved"], true);
    assert!(result["result"].is_null());
}

#[test]
fn corrected_shared_package_links_before_activation_and_retains_the_previous_installation() {
    let result = fixture("compatible");
    assert!(result["error"].is_null());
    assert_eq!(
        result["events"],
        json!([
            "syntax",
            "version",
            "link",
            "stop",
            "restart",
            "health:0.1.957"
        ])
    );
    assert_eq!(result["version"], "0.1.957");
    assert_eq!(result["previousPreserved"], true);
    assert_eq!(result["result"]["ok"], true);
}

#[test]
fn startup_failure_after_linking_restores_the_previous_installation_and_checks_its_health() {
    let result = fixture("startup-failure");
    assert!(result["error"].as_str().unwrap().contains("startup failed"));
    assert_eq!(
        result["events"],
        json!([
            "syntax",
            "version",
            "link",
            "stop",
            "restart",
            "health:0.1.957",
            "stop",
            "restart",
            "health:0.1.956"
        ])
    );
    assert_eq!(result["version"], "0.1.956");
    assert_eq!(result["preserved"], true);
    assert_eq!(result["result"]["ok"], false);
    assert_eq!(result["result"]["rolledBack"], true);
}
