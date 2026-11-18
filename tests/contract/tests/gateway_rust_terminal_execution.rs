#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::execution::command_wait::resolve_command_yield_ms;
use serde_json::{Value, json};
use std::path::PathBuf;
fn observe(calls: Vec<Value>) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let work = root.join(".jait/artifacts/terminal-execution/contracts");
    std::fs::create_dir_all(&work).unwrap();
    internal_driver::call(&root, &work, json!({"version":1,"calls":calls}), &|| false).unwrap()
}
#[test]
fn native_wait_policy_matches_real_reference_and_never_lifts_execution_deadline() {
    let mut cases = vec![];
    for value in [
        Value::Null,
        json!(0),
        json!(-1),
        json!(0.1),
        json!(25),
        json!(60_000),
        json!("10"),
        json!(true),
        json!([]),
        json!({}),
    ] {
        for timeout in [1, 500, 3600000] {
            cases.push(json!({"value":value,"timeout":timeout}));
        }
    }
    cases.push(json!({"timeout":3600000}));
    let expected = observe(vec![json!({"op":"terminalexecution.wait","cases":cases})]);
    for (i, case) in cases.iter().enumerate() {
        let actual = resolve_command_yield_ms(case.get("value"), case["timeout"].as_f64().unwrap());
        assert_eq!(actual, expected[0][i].as_f64().unwrap(), "{case}");
        assert!((1.0..=30000.0).contains(&actual));
        assert!(actual <= case["timeout"].as_f64().unwrap());
    }
}
#[test]
fn production_terminal_tool_yields_inspects_cancels_and_notifies_without_rerunning() {
    let observed = observe(
        [
            "complete",
            "cancel",
            "deadline",
            "syntax",
            "capacity",
            "startupDeadline",
        ]
        .map(|scenario| json!({"op":"terminalexecution.run","scenario":scenario}))
        .to_vec(),
    );
    for i in 0..3 {
        assert_eq!(observed[i]["yielded"], true);
        assert_eq!(
            observed[i]["timedOut"], false,
            "yield must not claim execution timeout"
        );
        assert_eq!(observed[i]["progress"], "running");
        assert_eq!(observed[i]["partial"], true);
        assert_eq!(observed[i]["foreign"], false);
        assert_eq!(observed[i]["stale"], false);
        assert_eq!(
            observed[i]["writes"], 1,
            "inspection/cancellation must not rerun the command"
        );
        assert_eq!(observed[i]["active"], 0);
    }
    assert_eq!(observed[0]["final"], "completed");
    assert_eq!(observed[0]["notifications"], 1);
    assert_eq!(observed[0]["stopped"], 0);
    assert_eq!(observed[1]["final"], "cancelled");
    assert_eq!(observed[1]["notifications"], 0);
    assert_eq!(observed[1]["stopped"], 1);
    assert_eq!(observed[2]["final"], "timed_out");
    assert_eq!(observed[2]["notifications"], 1);
    assert_eq!(observed[2]["deadlineNotification"], true);
    assert_eq!(observed[2]["stopped"], 1);
    assert_eq!(
        observed[5],
        json!({"ok":false,"timedOut":true,"stopped":1,"notifications":0,"active":0})
    );
    assert_eq!(observed[4], json!({"ok":false,"writes":0}));
    assert_eq!(
        observed[3],
        json!({"ok":false,"syntaxError":true,"writes":0,"active":0})
    );
}
