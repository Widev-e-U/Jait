//! Rust assertions over the shipping TypeScript browser helpers, not native parity credit.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn reference(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let directory = root
        .join(".jait/artifacts/browser-control-contract")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    internal_driver::call(
        &root,
        &directory,
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn events(result: &Value) -> &[Value] {
    result["events"].as_array().unwrap()
}
fn clicks(result: &Value) -> usize {
    events(result)
        .iter()
        .filter(|event| event["op"] == "click")
        .count()
}

#[test]
fn visible_tab_selection_skips_closed_and_navigating_pages() {
    let result = reference(
        json!({"op":"browsercontrol.visible", "fallback":"original", "pages":[
            {"id":"original"}, {"id":"closed", "closed":true,"visible":true,"focused":true},
            {"id":"navigating","fails":true}, {"id":"sign-in","visible":true,"focused":true}
        ]}),
    );
    assert_eq!(result["selected"], "sign-in");
    assert_eq!(
        result["inspected"],
        json!(["original", "navigating", "sign-in"])
    );
}

#[test]
fn adopted_visible_tab_wins_ambiguous_window_focus() {
    let result = reference(
        json!({"op":"browsercontrol.visible","fallback":"adopted", "pages":[
            {"id":"older","visible":true,"focused":true}, {"id":"adopted","visible":true,"focused":true}
        ]}),
    );
    assert_eq!(result["selected"], "adopted");
}

#[test]
fn visible_unfocused_tab_wins_over_hidden_fallback() {
    let result = reference(
        json!({"op":"browsercontrol.visible","fallback":"original", "pages":[
            {"id":"original","focused":true}, {"id":"popup","visible":true}
        ]}),
    );
    assert_eq!(result["selected"], "popup");
    let result = reference(
        json!({"op":"browsercontrol.visible","fallback":"original", "pages":[
            {"id":"popup","visible":true}, {"id":"original","visible":true}
        ]}),
    );
    assert_eq!(result["selected"], "original");
}

#[test]
fn unavailable_visibility_retains_the_adopted_page() {
    let result = reference(
        json!({"op":"browsercontrol.visible","fallback":"original", "pages":[
            {"id":"original","fails":true}, {"id":"closing","closed":true}
        ]}),
    );
    assert_eq!(result["selected"], "original");
}

#[test]
fn pointer_arrives_before_click_and_remembers_its_position() {
    let result =
        reference(json!({"op":"browsercontrol.cursor","selectors":["#sign-in","#confirm"]}));
    assert_eq!(result["error"], Value::Null);
    assert_eq!(clicks(&result), 2);
    let stream = events(&result);
    let first_click = stream
        .iter()
        .position(|event| event["op"] == "click")
        .unwrap();
    let moves: Vec<_> = stream[..first_click]
        .iter()
        .filter(|event| event["op"] == "move")
        .collect();
    assert!(
        moves.len() > 1,
        "The cursor must visibly travel before activation"
    );
    assert!(moves[0]["x"].as_f64().unwrap() < 100.0);
    assert_eq!(moves.last().unwrap()["x"], 100.0);
    assert_eq!(moves.last().unwrap()["y"], 50.0);
    assert_eq!(stream[first_click]["selector"], "#sign-in");
    let next_move = stream[first_click + 1..]
        .iter()
        .find(|event| event["op"] == "move")
        .unwrap();
    assert_eq!(
        next_move["x"], 100.0,
        "A second click must not jump back to the origin"
    );
    assert_eq!(stream.last().unwrap()["selector"], "#confirm");
}

#[test]
fn cancellation_before_or_during_movement_prevents_activation() {
    let before = reference(json!({"op":"browsercontrol.cursor","cancelled":true}));
    assert_eq!(before["error"], "Cancelled");
    assert!(events(&before).is_empty());
    let during = reference(json!({"op":"browsercontrol.cursor","cancelAfterMoves":3}));
    assert_eq!(during["error"], "Cancelled");
    assert_eq!(clicks(&during), 0);
    assert_eq!(
        events(&during)
            .iter()
            .filter(|event| event["op"] == "move")
            .count(),
        3
    );
}

#[test]
fn missing_pointer_or_bounds_preserves_selector_click_semantics() {
    for option in ["noPointer", "noBox"] {
        let mut call = json!({"op":"browsercontrol.cursor"});
        call[option] = json!(true);
        let result = reference(call);
        assert_eq!(result["error"], Value::Null);
        assert_eq!(clicks(&result), 1);
        assert!(!events(&result).iter().any(|event| event["op"] == "move"));
        assert_eq!(events(&result).last().unwrap()["selector"], "#sign-in");
    }
}

#[test]
fn invisible_targets_fail_before_movement_or_click() {
    let result =
        reference(json!({"op":"browsercontrol.cursor","waitError":"Target never became visible"}));
    assert_eq!(result["error"], "Target never became visible");
    assert_eq!(clicks(&result), 0);
    assert!(!events(&result).iter().any(|event| event["op"] == "move"));
}

#[test]
fn failed_selector_click_is_reported_without_retrying_activation() {
    let result = reference(json!({"op":"browsercontrol.cursor","clickError":"Target detached"}));
    assert_eq!(result["error"], "Target detached");
    assert_eq!(clicks(&result), 1);
}
