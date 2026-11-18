//! Migration invariants for checkpoint handoffs, exercised against the real loop.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn observe(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let directory = root
        .join(".jait/artifacts/compaction-contracts")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    internal_driver::call(
        &root,
        &directory,
        json!({"version": 1, "calls": [call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}

fn active_history() -> Vec<Value> {
    let mut history = vec![
        json!({"role":"system", "content":"base instructions"}),
        json!({"role":"user", "content":"Verify authorized targets; preserve evidence"}),
        json!({"role":"system", "content":"[active-turn-summary]scope-expires-at-18:00[/active-turn-summary]"}),
    ];
    for i in 0..38 {
        history.push(json!({"role":"assistant", "content":format!("Inspect {i}"), "tool_calls":[{"id":format!("c{i}"), "type":"function", "function":{"name":"fixture_read", "arguments":"{}"}}]}));
        history.push(json!({"role":"tool", "tool_call_id":format!("c{i}"), "content":format!("result-{i} {}", "x".repeat(400))}));
    }
    history
}

#[test]
fn handoff_preserves_prior_state_and_evidence_with_consistent_provider_budgets() {
    for backend in ["ollama", "openai"] {
        let result = observe(
            json!({"op":"compaction.summary", "backend":backend, "summary":"Verified; next check rollback.", "history":[
                {"role":"system", "content":"base-not-history"},
                {"role":"system", "content":"[conversation-summary]scope-expires-at-18:00[/conversation-summary]"},
                {"role":"assistant", "content":"Verification", "thinking":"private-narration"},
                {"role":"tool", "tool_call_id":"c", "content":format!("HEADER {} FINAL: 7 passed", "x".repeat(4000))}
            ]}),
        );
        let request = &result["requests"][0];
        let input = request["messages"].to_string();
        assert!(input.contains("scope-expires-at-18:00"));
        assert!(input.contains("FINAL: 7 passed"));
        assert!(!input.contains("private-narration"));
        assert!(!input.contains("base-not-history"));
        assert!(input.contains("CONTEXT CHECKPOINT COMPACTION"));
        assert!(!input.contains("Use this EXACT format"));
        assert_eq!(request["stream"], false);
        // The checkpoint budget is the salvaged-handoff cap, independent of the
        // model context window. Backends that reject it retry at the 2048 floor
        // (see checkpoint_budget_retries_at_the_conservative_floor_when_rejected),
        // so a single 8192 request is the expected first attempt on both wires.
        assert_eq!(
            if backend == "ollama" {
                &request["options"]["num_predict"]
            } else {
                &request["max_tokens"]
            },
            8192
        );
        if backend == "ollama" {
            // The window still bounds prompt context; only the output cap is fixed.
            assert_eq!(request["options"]["num_ctx"], 2000);
        }
    }
}

#[test]
fn repeated_pruning_merges_old_checkpoint_and_latest_correction() {
    let result = observe(
        json!({"op":"compaction.prune", "summary":"scope-expires-at-18:00; tests passed; next verify rollback.", "history":[
            {"role":"system", "content":"base"},
            {"role":"system", "content":"[conversation-summary]scope-expires-at-18:00[/conversation-summary]"},
            {"role":"user", "content":format!("Prepare rollback {}", "x".repeat(10000))},
            {"role":"assistant", "content":"Tests passed"},
            {"role":"user", "content":"Correction: verify rollback first"}
        ], "passes":[[], [
            {"role":"assistant", "content":"x".repeat(12000)},
            {"role":"user", "content":"Continue verification"}
        ]]}),
    );
    assert_eq!(result["changes"], json!([true, true]));
    let requests = result["requests"].as_array().unwrap();
    assert_eq!(requests.len(), 2);
    for request in requests {
        assert!(
            request["messages"]
                .to_string()
                .contains("scope-expires-at-18:00")
        );
    }
    assert!(
        requests[0]["messages"]
            .to_string()
            .contains("Correction: verify rollback first")
    );
    let history = result["history"].as_array().unwrap();
    assert_eq!(
        history
            .iter()
            .filter(|m| m["content"]
                .as_str()
                .unwrap()
                .contains("[conversation-summary]"))
            .count(),
        1
    );
    assert_eq!(history.last().unwrap()["content"], "Continue verification");
}

#[test]
fn long_running_loop_uses_semantic_handoff_for_entire_removed_prefix() {
    let original = active_history();
    let result = observe(
        json!({"op":"compaction.run", "history":original, "summary":"scope-expires-at-18:00; verified progress; next rollback check."}),
    );
    assert!(result["error"].is_null(), "{result}");
    let requests = result["requests"].as_array().unwrap();
    let summary = requests
        .iter()
        .find(|r| r["stream"] == false)
        .expect("active loop must call summarizer");
    let input = summary["messages"].to_string();
    assert!(input.contains("scope-expires-at-18:00"));
    assert!(
        input.contains("result-0 "),
        "must include oldest removed evidence, not just last 24 messages"
    );
    let inference = requests.iter().find(|r| r["stream"] == true).unwrap();
    let messages = inference["messages"].as_array().unwrap();
    assert!(messages.iter().any(|m| {
        m["content"]
            .as_str()
            .is_some_and(|s| s.contains("[active-turn-summary]"))
    }));
    let tools: Vec<_> = messages.iter().filter(|m| m["role"] == "tool").collect();
    assert_eq!(tools.len(), 8);
    assert_eq!(
        tools[0]["content"],
        original[original.len() - 15]["content"]
    );
    assert_eq!(result["result"]["content"], "Resumed from checkpoint.");
}

#[test]
fn cancellation_keeps_original_history_and_returns_aborted_run() {
    let original = active_history();
    let result = observe(json!({"op":"compaction.run", "cancel":true, "history":original}));
    assert_eq!(result["history"], json!(original));
    assert_eq!(result["result"]["aborted"], true);
    assert_eq!(result["result"]["hitMaxRounds"], false);
    assert_eq!(result["requests"].as_array().unwrap().len(), 1);
}

#[test]
fn unavailable_summary_keeps_old_checkpoint_with_degradation_marker() {
    let result = observe(
        json!({"op":"compaction.summary", "fail":true, "summary":"incomplete", "history":[{"role":"system", "content":"[conversation-summary]scope-expires-at-18:00[/conversation-summary]"}, {"role":"user", "content":"Verify rollback"}]}),
    );
    let summary = result["summary"].as_str().unwrap();
    assert!(summary.contains("scope-expires-at-18:00"));
    assert!(summary.contains("Degraded checkpoint"));
    // The unusable model text must not be mistaken for a real checkpoint.
    assert!(!summary.contains("incomplete"));
}

#[test]
fn truncated_summary_is_kept_with_disclosure_and_the_superseded_checkpoint() {
    let result = observe(
        json!({"op":"compaction.summary", "truncated":true, "summary":"incomplete", "history":[{"role":"system", "content":"[conversation-summary]scope-expires-at-18:00[/conversation-summary]"}, {"role":"user", "content":"Verify rollback"}]}),
    );
    let summary = result["summary"].as_str().unwrap();
    // A cut-off handoff still carries real state, so it replaces the regex
    // fallback — but it is disclosed and the previous checkpoint survives.
    assert!(summary.contains("incomplete"));
    assert!(summary.contains("output token budget"));
    assert!(summary.contains("scope-expires-at-18:00"));
    assert!(!summary.contains("Degraded checkpoint"));
}

#[test]
fn checkpoint_budget_retries_at_the_conservative_floor_when_rejected() {
    for backend in ["ollama", "openai"] {
        let result = observe(
            json!({"op":"compaction.summary", "backend":backend, "rejectBudget":2048, "summary":"Verified; next check rollback.", "history":[{"role":"system", "content":"[conversation-summary]scope-expires-at-18:00[/conversation-summary]"}, {"role":"user", "content":"Verify rollback"}]}),
        );
        let requests = result["requests"].as_array().unwrap();
        let budgets: Vec<&Value> = requests
            .iter()
            .map(|r| {
                if backend == "ollama" {
                    &r["options"]["num_predict"]
                } else {
                    &r["max_tokens"]
                }
            })
            .collect();
        assert_eq!(budgets, vec![&json!(8192), &json!(2048)]);
        let summary = result["summary"].as_str().unwrap();
        assert!(summary.contains("Verified; next check rollback."));
        assert!(!summary.contains("Degraded checkpoint"));
    }
}
