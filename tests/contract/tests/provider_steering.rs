//! Behavioral migration contract for active ACP steering. Runs real TS chat
//! routes + ACP transport against an isolated local peer; this is reference
//! coverage, not native implementation credit. A Rust provider port must retain
//! these FIFO, acknowledgement, fallback, and transcript visibility guarantees.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn scenario(fixture: Value, messages: Value, wait_for_steers: usize) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let directory = root
        .join(".jait/artifacts/provider-steering")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    internal_driver::call(
        &root,
        &directory,
        json!({"version":1,"calls":[{
            "op":"providersteering.chat", "directory":directory.join("peer"),
            "fixture":fixture,"messages":messages,"waitForSteers":wait_for_steers
        }]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}

fn rows(result: &Value, kind: &str) -> Vec<Value> {
    result["wire"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|row| row["kind"] == kind)
        .cloned()
        .collect()
}
fn steering_events(result: &Value) -> Vec<Value> {
    result["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|event| event["type"] == "steering")
        .cloned()
        .collect()
}
fn assert_done(result: &Value) {
    assert_eq!(result["status"], 200);
    assert!(
        result["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|event| event["type"] == "done"),
        "{result}"
    );
    assert!(
        result["events"]
            .as_array()
            .unwrap()
            .iter()
            .all(|event| event["type"] != "error"),
        "{result}"
    );
}
fn message() -> Value {
    json!({"message":"change direction","queuedMessageId":"queue-1","displayContent":"visible guidance"})
}

#[test]
fn fifo_messages_join_the_running_turn_with_correlated_consumption_events() {
    let result = scenario(
        json!({"meta":{"steering":{"supported":true}}}),
        json!([message(),{"message":"then verify","queuedMessageId":"queue-2"}]),
        2,
    );
    assert_done(&result);
    assert_eq!(rows(&result, "prompt").len(), 1, "no extra provider turn");
    let requests = rows(&result, "steer");
    assert_eq!(requests.len(), 2);
    for (request, text) in requests.iter().zip(["change direction", "then verify"]) {
        assert_eq!(
            request["params"],
            json!({
                "sessionId":"acp-wire-session", "prompt":[{"type":"text","text":format!("[STEERING] {text}")}],
                "_meta":{"steering":{"idleBehavior":"promptRequired"}}
            })
        );
    }
    let wire = result["wire"].as_array().unwrap();
    let completion = wire
        .iter()
        .position(|row| row["kind"] == "completed")
        .unwrap();
    assert!(
        wire.iter()
            .enumerate()
            .filter(|(_, row)| row["kind"] == "steer")
            .all(|(index, _)| index < completion)
    );
    let events = steering_events(&result);
    assert_eq!(events.len(), 2);
    assert_eq!(events[0]["queuedMessageId"], "queue-1");
    assert_eq!(events[0]["displayContent"], "visible guidance");
    assert_eq!(events[1]["queuedMessageId"], "queue-2");
    for response in result["responses"].as_array().unwrap() {
        assert_eq!(response["status"], 200);
        assert_eq!(response["body"]["deferred"], true);
    }
}

#[test]
fn absent_or_misplaced_capability_uses_one_followup_after_completion() {
    for fixture in [
        json!({}),
        json!({"capabilities":{"_meta":{"steering":{"supported":true}}}}),
    ] {
        let result = scenario(fixture, json!([message()]), 0);
        assert_done(&result);
        assert!(rows(&result, "steer").is_empty());
        let prompts = rows(&result, "prompt");
        assert_eq!(prompts.len(), 2);
        assert_eq!(prompts[1]["text"], "[STEERING] change direction");
        let wire = result["wire"].as_array().unwrap();
        assert_eq!(wire[1], json!({"kind":"completed","turn":1}));
        assert_eq!(steering_events(&result).len(), 1);
    }
}

#[test]
fn idle_race_and_explicit_extension_rejection_keep_the_message_for_one_followup() {
    for extra in [json!({"outcome":"promptRequired"}), json!({"error":true})] {
        let mut fixture = json!({"meta":{"steering":{"supported":true}},"holdAck":true});
        fixture
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        let result = scenario(fixture, json!([message()]), 1);
        assert_done(&result);
        assert_eq!(rows(&result, "steer").len(), 1);
        assert_eq!(rows(&result, "prompt").len(), 2);
        assert_eq!(
            rows(&result, "prompt")[1]["text"],
            "[STEERING] change direction"
        );
        assert_eq!(steering_events(&result).len(), 1);
    }
}

#[test]
fn terminal_event_waits_for_inflight_ack_without_duplicate_followup() {
    let result = scenario(
        json!({"meta":{"steering":{"supported":true}},"holdAck":true}),
        json!([message()]),
        1,
    );
    assert_done(&result);
    assert_eq!(result["settledBeforeAck"], false);
    assert_eq!(rows(&result, "prompt").len(), 1);
    assert_eq!(steering_events(&result).len(), 1);
    let wire = result["wire"].as_array().unwrap();
    let completed = wire
        .iter()
        .position(|row| row["kind"] == "completed")
        .unwrap();
    let acknowledged = wire.iter().position(|row| row["kind"] == "ack").unwrap();
    assert!(completed < acknowledged);
}

#[test]
fn hidden_completion_guidance_is_delivered_without_entering_chat_history() {
    let secret = "private completion evidence";
    let result = scenario(
        json!({"meta":{"steering":{"supported":true}}}),
        json!([{"message":secret,"hidden":true}]),
        1,
    );
    assert_done(&result);
    assert_eq!(result["responses"][0]["status"], "steered");
    assert_eq!(rows(&result, "prompt").len(), 1);
    assert_eq!(
        rows(&result, "steer")[0]["params"]["prompt"][0]["text"],
        format!("[STEERING] {secret}")
    );
    assert!(steering_events(&result).is_empty());
    assert!(!result["events"].to_string().contains(secret));
    assert!(!result["history"].to_string().contains(secret));
}

#[test]
fn stale_or_malformed_turn_target_is_rejected_before_provider_delivery() {
    let result = scenario(
        json!({"meta":{"steering":{"supported":true}}}),
        json!([
            {"message":"stale guidance", "expectedTurnId":"previous-turn"},
            {"message":"invalid guidance", "expectedTurnId":42},
            {"message":"blank target", "expectedTurnId":" "},
            message()
        ]),
        1,
    );
    assert_done(&result);
    let responses = result["responses"].as_array().unwrap();
    assert_eq!(responses[0]["status"], 409);
    assert_eq!(responses[1]["status"], 400);
    assert_eq!(responses[2]["status"], 400);
    assert_eq!(responses[3]["status"], 200);
    assert!(
        responses[3]["body"]["turnId"]
            .as_str()
            .is_some_and(|id| !id.is_empty())
    );
    assert_eq!(rows(&result, "steer").len(), 1);
    assert_eq!(steering_events(&result).len(), 1);
    assert_eq!(
        rows(&result, "steer")[0]["params"]["prompt"][0]["text"],
        "[STEERING] change direction"
    );
}
