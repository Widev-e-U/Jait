//! Rust-owned behavior assertions against the real TypeScript native provider.
//! Model I/O is a deterministic fixture; this does not claim native Rust parity.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn scenario(phase: &str, cancel: bool) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let directory = root
        .join(".jait/artifacts/jait-steering")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    internal_driver::call(
        &root,
        &directory,
        json!({"version":1,"calls":[{
            "op":"jaitsteering.provider", "phase":phase, "cancel":cancel,
            "messages":["Change direction", "Then verify"]
        }]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn messages(request: &Value) -> Vec<Value> {
    request["messages"].as_array().unwrap().clone()
}
fn assert_rejected_boundaries(result: &Value) {
    for key in [
        "idle",
        "stale",
        "empty",
        "afterCompletion",
        "staleDuringNext",
    ] {
        assert_eq!(result[key], false, "{key}: {result}");
    }
    assert_eq!(result["accepted"], json!([true, true]));
    assert_eq!(result["beforeRelease"], json!({"requests":1,"consumed":0}));
    let wire = result["requests"].to_string();
    for rejected in [
        "stale guidance",
        "too late",
        "stale next-turn guidance",
        "after cancellation",
    ] {
        assert!(
            !wire.contains(rejected),
            "rejected input leaked: {rejected}"
        );
    }
}
#[test]
fn user_steering_continues_after_streaming_final_answer_without_starting_another_turn() {
    assert_continuation("stream");
}
#[test]
fn user_steering_waits_for_tool_result_then_joins_the_next_request_in_fifo_order() {
    assert_continuation("tool");
}
fn assert_continuation(phase: &str) {
    let result = scenario(phase, false);
    assert_rejected_boundaries(&result);
    let requests = result["requests"].as_array().unwrap();
    assert_eq!(
        requests.len(),
        3,
        "initial, continued, explicit next turn: {result}"
    );
    let first = messages(&requests[0]);
    assert!(!first.iter().any(|m| m["content"] == "Change direction"));
    let continued = messages(&requests[1]);
    let steering: Vec<_> = continued
        .iter()
        .filter(|m| m["content"] == "Change direction" || m["content"] == "Then verify")
        .collect();
    assert_eq!(
        steering,
        vec![
            &json!({"role":"user","content":"Change direction"}),
            &json!({"role":"user","content":"Then verify"})
        ]
    );
    let events = result["events"].as_array().unwrap();
    assert_eq!(
        events
            .iter()
            .filter(|e| e["type"] == "turn.started")
            .count(),
        2,
        "steering must reuse the active turn"
    );
    assert_eq!(
        events
            .iter()
            .filter(|e| e["type"] == "turn.completed")
            .count(),
        2
    );
    assert!(
        !events.iter().any(|e| e["type"] == "session.error"),
        "{result}"
    );
    assert_eq!(events.iter().filter(|e| e["kind"] == "steering").count(), 2);
    let next = messages(&requests[2]);
    for text in ["Change direction", "Then verify"] {
        assert_eq!(
            next.iter().filter(|m| m["content"] == text).count(),
            1,
            "steering replayed into next turn"
        );
    }
    if phase == "tool" {
        let result_index = continued.iter().position(|m| m["role"] == "tool").unwrap();
        let steer_index = continued
            .iter()
            .position(|m| m["content"] == "Change direction")
            .unwrap();
        assert!(result_index < steer_index);
        let order = result["order"].as_array().unwrap();
        assert!(
            order.iter().position(|v| v == "tool-end").unwrap()
                < order.iter().position(|v| v == "consumed").unwrap()
        );
    }
}
#[test]
fn cancelled_turn_rejects_new_steering_and_does_not_deliver_pending_input_to_next_turn() {
    let result = scenario("tool", true);
    assert_rejected_boundaries(&result);
    assert_eq!(result["afterCancel"], false);
    assert_eq!(result["requests"].as_array().unwrap().len(), 2);
    let next = messages(&result["requests"][1]);
    assert!(
        !next
            .iter()
            .any(|m| m["content"] == "Change direction" || m["content"] == "Then verify")
    );
}
