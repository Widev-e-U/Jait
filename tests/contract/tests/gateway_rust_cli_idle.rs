//! Reference contracts for the Rust migration's provider-session owner.
//! Runs actual TypeScript lifecycle code. Native ACP session orchestration is
//! still incomplete; these tests do not award native runtime parity credit.
#[path = "../src/internal_driver.rs"]
mod internal_driver;

use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn reference(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let scratch = root
        .join(".jait/artifacts/gateway-rust/cli-idle")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&scratch).unwrap();
    internal_driver::call(
        &root,
        &scratch,
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}

#[test]
fn ten_minutes_are_measured_from_the_user_message() {
    let result = reference(json!({"op":"cliidle.timeline","actions":[
        {"kind":"user","thread":"chat","at":0},
        {"kind":"watch","id":"a","thread":"chat","at":0},
        {"kind":"busy","id":"a","at":0},
        {"kind":"idle","id":"a","at":599999},
        {"kind":"tick","at":600000},
        {"kind":"tick","at":1200000}
    ]}));
    assert_eq!(result["timeout"], 600000);
    assert_eq!(result["results"], json!([[], [], [], [], ["a"], ["a"]]));
}

#[test]
fn new_user_messages_reset_only_their_own_chat() {
    let result = reference(json!({"op":"cliidle.timeline","actions":[
        {"kind":"watch","id":"a","thread":"chat-a","at":0},
        {"kind":"watch","id":"b","thread":"chat-b","at":0},
        {"kind":"user","thread":"chat-a","at":540000},
        {"kind":"tick","at":600000},
        {"kind":"tick","at":1139999},
        {"kind":"tick","at":1140000}
    ]}));
    assert_eq!(
        result["results"],
        json!([[], [], [], ["b"], ["b"], ["b", "a"]])
    );
}

#[test]
fn long_turns_are_protected_without_renewing_the_user_deadline() {
    let result = reference(json!({"op":"cliidle.timeline","actions":[
        {"kind":"watch","id":"a","thread":"chat","at":0},
        {"kind":"busy","id":"a","at":0},
        {"kind":"tick","at":1800000},
        {"kind":"idle","id":"a","at":1800001}
    ]}));
    assert_eq!(result["results"], json!([[], [], [], ["a"]]));
}

#[test]
fn unused_prewarms_expire_and_new_sessions_get_the_new_user_deadline() {
    let result = reference(json!({"op":"cliidle.timeline","actions":[
        {"kind":"watch","id":"old","thread":"chat","at":0},
        {"kind":"tick","at":600000},
        {"kind":"user","thread":"chat","at":600001},
        {"kind":"watch","id":"fresh","thread":"chat","at":600002},
        {"kind":"tick","at":1200000},
        {"kind":"forget","id":"fresh","at":1200000},
        {"kind":"tick","at":1800000}
    ]}));
    assert_eq!(
        result["results"],
        json!([[], ["old"], ["old"], ["old"], ["old"], ["old"], ["old"]])
    );
}

#[test]
fn actual_acp_turn_survives_expiry_then_retires_and_reopens() {
    let result = reference(json!({"op":"cliidle.provider"}));
    assert_eq!(
        result,
        json!({"activeProtected":true,"retiredSynchronously":true,"completed":true,"freshSession":true,"error":false})
    );
}

#[test]
#[cfg(target_os = "linux")]
fn process_tree_cleanup_escalates_without_signalling_unrelated_processes() {
    let result = reference(json!({"op":"cliidle.process"}));
    assert_eq!(
        result,
        json!({"gracefulAttemptDidNotKillResistantChild":true,"parentStopped":true,"descendantStopped":true,"unrelatedProcessAlive":true})
    );
}
