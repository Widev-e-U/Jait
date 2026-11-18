#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::thread_history::{
    ExecutionCheckpoint, ReplayActivity, TaskContext, ThreadHistorySource, ThreadLocation,
    build_thread_history_replay_prompt,
};
use serde_json::{Value, json};
use std::{cell::RefCell, fs, path::PathBuf};
struct Source {
    data: Value,
    calls: RefCell<Vec<Value>>,
}
impl Source {
    fn observe(&self, name: &str, id: &str, limit: Option<usize>) -> Result<(), String> {
        self.calls.borrow_mut().push(match limit {
            Some(limit) => json!([name, id, limit]),
            None => json!([name, id]),
        });
        if self.data["errorAt"] == name {
            Err("fixture source error".into())
        } else {
            Ok(())
        }
    }
}
impl ThreadHistorySource for Source {
    type Error = String;
    fn activities(&self, id: &str, limit: usize) -> Result<Vec<ReplayActivity>, String> {
        self.observe("activities", id, Some(limit))?;
        Ok(
            serde_json::from_value(self.data.get("activities").cloned().unwrap_or(json!([])))
                .unwrap(),
        )
    }
    fn task_context(&self, id: &str) -> Result<Option<TaskContext>, String> {
        if self.data["omitTask"] == true {
            return Ok(None);
        }
        self.observe("task", id, None)?;
        Ok(serde_json::from_value(self.data["task"].clone()).unwrap())
    }
    fn location(&self, id: &str) -> Result<Option<ThreadLocation>, String> {
        if self.data["omitLocation"] == true {
            return Ok(None);
        }
        self.observe("location", id, None)?;
        Ok(serde_json::from_value(self.data["location"].clone()).unwrap())
    }
    fn execution_checkpoint(&self, id: &str) -> Result<Option<ExecutionCheckpoint>, String> {
        if self.data["omitExecution"] == true {
            return Ok(None);
        }
        self.observe("execution", id, None)?;
        Ok(serde_json::from_value(self.data["execution"].clone()).unwrap())
    }
}
fn scenario(mut input: Value) -> Value {
    input["op"] = json!("nativereplay.build");
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-replay")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    let expected =
        internal_driver::call(&root, &dir, json!({"version":1,"calls":[input]}), &|| false)
            .unwrap()[0]
            .clone();
    let source = Source {
        data: input,
        calls: RefCell::new(vec![]),
    };
    let actual = match build_thread_history_replay_prompt(
        &source,
        source.data["id"].as_str().unwrap_or("thread"),
    ) {
        Ok(value) => {
            json!({"prompt":serde_json::to_string(&value).unwrap(),"calls":*source.calls.borrow()})
        }
        Err(_) => json!({"error":true,"calls":*source.calls.borrow()}),
    };
    assert_eq!(actual, expected);
    actual
}
fn message(time: i64, role: &str, content: &str) -> Value {
    json!({"kind":"message","createdAtMs":time,"payload":{"role":role,"content":content}})
}
#[test]
fn no_replay_without_messages_or_original_task_and_optional_source_methods_work() {
    let result = scenario(json!({}));
    assert_eq!(result["prompt"], "null");
    assert_eq!(
        result["calls"],
        json!([["activities", "thread", 2000], ["task", "thread"]])
    );
    scenario(json!({"task":{"latestInstruction":"only latest"}}));
    scenario(
        json!({"activities":[message(0,"user"," hello ")],"omitTask":true,"omitLocation":true,"omitExecution":true}),
    );
    scenario(
        json!({"task":{"originalTask":"Persisted task","latestInstruction":"Continue"},"location":{"workingDirectory":"/owned/project","branch":"main"},"execution":{"calls":7,"lastAction":"test","stopReason":"resource limit"}}),
    );
}
#[test]
fn replay_sorts_by_timestamp_and_reverses_ties_before_stable_sorting() {
    scenario(
        json!({"activities":[message(3000,"assistant","new"),message(1000,"user","old first in source"),message(1000,"assistant","old second in source"),message(2000,"user","middle"),message(-1000,"user","before epoch")]}),
    );
}
#[test]
fn message_payloads_are_filtered_and_full_content_wins_even_when_empty() {
    let activities = vec![
        message(1, "system", "ignored"),
        message(2, "user", " \n "),
        message(3, "assistant", "\u{feff}kept 🦀\u{a0}"),
        json!({"kind":"tool.result","createdAtMs":4,"summary":"tool evidence","payload":{"role":"user","content":"not a message"}}),
        json!({"kind":"message","createdAtMs":5,"payload":null}),
        json!({"kind":"message","createdAtMs":6,"payload":{"role":"assistant","fullContent":"","content":"ignored fallback"}}),
        json!({"kind":"message","createdAtMs":7,"payload":{"role":"user","fullContent":false,"content":"fallback"}}),
        json!({"kind":"message","createdAtMs":8,"payload":{"role":"assistant","fullContent":"full","content":"partial"}}),
        json!({"kind":"message","createdAtMs":9,"payload":[]}),
    ];
    scenario(
        json!({"activities":activities,"location":{"workingDirectory":"","branch":""},"execution":{"calls":0,"lastAction":"","stopReason":""}}),
    );
}
#[test]
fn replay_keeps_first_user_task_when_the_24_message_tail_moves_on() {
    let mut activities = (0..31)
        .map(|i| {
            message(
                i,
                if i % 2 == 0 { "user" } else { "assistant" },
                &format!("message {i}"),
            )
        })
        .collect::<Vec<_>>();
    activities.reverse();
    let result = scenario(json!({"activities":activities}));
    assert!(
        result["prompt"]
            .as_str()
            .unwrap()
            .contains("Original task: message 0")
    );
    assert!(
        result["prompt"]
            .as_str()
            .unwrap()
            .contains("Only the most recent")
    );
}
#[test]
fn replay_retains_both_sides_of_large_responses_and_respects_utf16_budget() {
    let activities = vec![
        message(7, "assistant", &"new ".repeat(1250)),
        message(6, "user", &"follow up ".repeat(500)),
        message(5, "assistant", &"response ".repeat(600)),
        message(4, "user", "middle"),
        message(3, "assistant", &"older ".repeat(850)),
        message(1, "user", "original"),
    ];
    scenario(
        json!({"activities":activities,"task":{"originalTask":"Persisted original task","latestInstruction":"Latest steering"}}),
    );
}
#[test]
fn checkpoints_keep_only_six_outcomes_and_the_latest_todo_in_sorted_order() {
    let mut activities = vec![message(0, "user", "task")];
    for i in 1..10 {
        activities.push(json!({"kind":if i%2==0{"tool.result"}else{"tool.error"},"createdAtMs":i,"summary":format!("outcome {i} {}","a".repeat(250)),"payload":{}}));
    }
    activities
        .push(json!({"kind":"todo","createdAtMs":4,"summary":"old","payload":{"remaining":"old"}}));
    activities.push(json!({"kind":"todo","createdAtMs":11,"summary":"new","payload":{"2":2,"1":1e-7,"remaining":["test","report"]}}));
    activities.reverse();
    let result = scenario(json!({"activities":activities}));
    let raw = result["prompt"].as_str().unwrap();
    assert!(!raw.contains("Recorded tool outcome: outcome 3"));
    assert!(raw.contains("Recorded tool outcome: outcome 4"));
    assert!(raw.contains("Remaining plan:"));
}
#[test]
fn truncation_preserves_lone_utf16_surrogates_in_messages_tasks_outcomes_and_todo() {
    let original = format!("{}🦀 end", "a".repeat(3999));
    let latest = format!("{}🦀 end", "b".repeat(3999));
    let content = format!("{}🦀{}", "c".repeat(1999), "d".repeat(3000));
    let summary = format!("{}🦀", "e".repeat(239));
    let todo = format!("{}🦀 end", "f".repeat(1593));
    scenario(
        json!({"activities":[message(1,"user",&content),json!({"kind":"tool.error","createdAtMs":2,"summary":summary,"payload":null}),json!({"kind":"todo","createdAtMs":3,"payload":{"x":todo}})],"task":{"originalTask":original,"latestInstruction":latest}}),
    );
}
#[test]
fn source_errors_propagate_without_requesting_later_records() {
    for point in ["activities", "task", "location", "execution"] {
        scenario(json!({"activities":[message(1,"user","task")],"errorAt":point}));
    }
}
