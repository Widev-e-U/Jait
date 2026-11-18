#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::cron::{self, CronContext, CronScheduler};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Mutex};

struct Scheduler {
    response: Value,
    thrown: Option<String>,
    requests: Mutex<Vec<Value>>,
}
impl CronScheduler for Scheduler {
    fn call(&self, operation: &str, args: Vec<Value>) -> Result<Value, String> {
        self.requests
            .lock()
            .unwrap()
            .push(json!({"op":operation,"args":args}));
        match &self.thrown {
            Some(error) => Err(error.clone()),
            None => Ok(self.response.clone()),
        }
    }
}
fn case(operation: &str, input: Value, response: Value) -> Value {
    json!({"operation":operation,"input":input,"response":response,
        "context":{"userId":"owner-A","projectRoot":"/explicit/project"}})
}
fn compare(cases: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    // Keep each source bridge below its 64 KiB input/output limits.
    for batch in cases.chunks(24) {
        let expected = internal_driver::call(
            &root,
            &root
                .join(".jait/artifacts/gateway-rust/cron/contracts")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":[{"op":"nativecron.run","cases":batch}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        assert_eq!(expected.as_array().unwrap().len(), batch.len());
        for (case, expected) in batch.iter().zip(expected.as_array().unwrap()) {
            let scheduler = Scheduler {
                response: case["response"].clone(),
                thrown: case["thrown"].as_str().map(str::to_string),
                requests: Mutex::new(vec![]),
            };
            let operation = case["operation"].as_str().unwrap();
            let context = CronContext {
                user_id: case["context"]["userId"].as_str(),
                project_root: case["context"]["projectRoot"].as_str().unwrap(),
            };
            let mut actual = match cron::execute(&scheduler, operation, &case["input"], context) {
                Ok(outcome) => json!({"outcome":outcome}),
                Err(thrown) => json!({"thrown":thrown}),
            };
            actual["requests"] = json!(*scheduler.requests.lock().unwrap());
            actual["metadata"] = cron::metadata(operation).unwrap();
            assert_eq!(&actual, expected, "case {case}");
        }
    }
}
#[test]
fn add_preserves_defaults_aliases_raw_input_and_owner() {
    let mut cases = vec![];
    for input in [
        Value::Null,
        json!({}),
        json!(false),
        json!([]),
        json!({"name":"backup","cron":"*/5 * * * *","toolName":" shell_execute_more ","input":{"command":"fixture"},"sessionId":"s1","projectRoot":"/override"}),
    ] {
        cases.push(case("add", input, json!({"id":"job"})));
    }
    for value in [
        Value::Null,
        json!(false),
        json!(0),
        json!([]),
        json!({}),
        json!(""),
        json!(" \u{feff}memory_search_more\u{00a0} "),
        json!("\u{0085}a_b\u{0085}"),
        json!("\u{180e}a_b\u{180e}"),
        json!("\u{2028}a_b\u{2029}"),
        json!("a_b_c"),
        json!("already.dotted"),
        json!("_leading"),
        json!("a__b"),
        json!("a b"),
    ] {
        let mut input = json!({});
        for key in [
            "name",
            "cron",
            "toolName",
            "sessionId",
            "projectRoot",
            "input",
        ] {
            input[key] = value.clone();
        }
        cases.push(case("add", input, json!({"id":"created"})));
    }
    compare(cases);
}
#[test]
fn updates_preserve_typed_fields_and_nullish_response_semantics() {
    let mut cases = vec![];
    for input in [
        Value::Null,
        json!({}),
        json!({"id":12,"name":4,"cron":false,"enabled":0}),
        json!({"id":"job","name":"","cron":"* * * * *","enabled":false,"input":null}),
        json!({"id":"job","name":null,"cron":[],"enabled":true,"input":{"x":[1,2]}}),
    ] {
        for response in [
            Value::Null,
            json!(false),
            json!(0),
            json!(""),
            json!([]),
            json!({}),
            json!({"id":"job","enabled":false}),
        ] {
            cases.push(case("update", input.clone(), response));
        }
    }
    compare(cases);
}
#[test]
fn list_preview_counts_truncation_disabled_jobs_and_unicode_are_exact() {
    let mut cases = vec![];
    for count in [0, 1, 24, 25, 26, 32] {
        let jobs:Vec<_>=(0..count).map(|i|json!({"id":format!("j{i}"),"name":format!("job {i} — 🦀\nnext"),"cron":"* * * * *","toolName":"memory.search","enabled":i%2==0})).collect();
        cases.push(case("list", json!({}), json!(jobs)));
    }
    cases.push(case(
        "list",
        Value::Null,
        json!([{"name":"a".repeat(250),"cron":"0 0 * * *","toolName":"tool.run","enabled":true}]),
    ));
    compare(cases);
}
#[test]
fn removals_and_scheduler_failures_propagate_without_retries() {
    let mut cases = vec![];
    for id in [
        Value::Null,
        json!(false),
        json!(23),
        json!(""),
        json!(" job-id "),
    ] {
        for removed in [false, true] {
            cases.push(case("remove", json!({"id":id}), json!(removed)));
        }
    }
    for operation in ["add", "list", "remove", "update"] {
        let mut input = case(operation, json!({"id":"job"}), Value::Null);
        input["thrown"] = json!("fixture scheduler unavailable");
        cases.push(input);
    }
    compare(cases);
}

#[test]
fn optional_and_distinct_owners_are_forwarded_without_inventing_identity() {
    let mut cases = vec![];
    for context in [
        json!({"projectRoot":"/fallback"}),
        json!({"userId":"","projectRoot":"/empty-owner"}),
        json!({"userId":"owner-B","projectRoot":"/other"}),
    ] {
        for operation in ["add", "list", "remove", "update"] {
            let mut test = case(
                operation,
                json!({"id":"fixture","toolName":"test_run"}),
                if operation == "list" {
                    json!([])
                } else {
                    json!({"id":"fixture"})
                },
            );
            test["context"] = context.clone();
            cases.push(test);
        }
    }
    compare(cases);
}
