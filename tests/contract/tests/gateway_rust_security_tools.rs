#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    time::Clock,
    tools::{core_io::HostError, security_dispatch::*, security_tools, security_workbench_tools},
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &root().join(".jait/artifacts/gateway-rust/security-tool-contracts"),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
struct Capabilities {
    token: Arc<()>,
    has_signal: bool,
    aborted: bool,
}
fn cases() -> Vec<Value> {
    serde_json::from_str(include_str!("../fixtures/security-tool-cases.json")).unwrap()
}
// JSON numeric values share ECMAScript Number semantics at this tool boundary;
// this does not alter strings, field presence, call order or capability checks.
fn js_numbers(value: &Value) -> Value {
    match value {
        Value::Number(n) => serde_json::from_str(
            &jait_gateway::contracts::ecmascript_json::JsonDocument::parse(&n.to_string())
                .unwrap()
                .stringify(),
        )
        .unwrap(),
        Value::Array(a) => Value::Array(a.iter().map(js_numbers).collect()),
        Value::Object(m) => {
            Value::Object(m.iter().map(|(k, v)| (k.clone(), js_numbers(v))).collect())
        }
        v => v.clone(),
    }
}
async fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(4) {
        let expected = reference(json!({"op":"nativesecuritytools.run","cases":batch}));
        let mut actual = vec![];
        for test in batch {
            let events = Arc::new(Mutex::new(Vec::<Value>::new()));
            let cursor = Arc::new(Mutex::new(0usize));
            let token = Arc::new(());
            let context = SecurityContext {
                fields: test["context"].clone(),
                capabilities: Capabilities {
                    token: token.clone(),
                    has_signal: test["hasSignal"] != false,
                    aborted: test["aborted"] == true,
                },
            };
            let port: SecurityPort<Capabilities> = {
                let events = events.clone();
                let cursor = cursor.clone();
                let test = test.clone();
                Arc::new(move |service, method, mut args, signal, c| {
                    assert!(
                        Arc::ptr_eq(&token, &c.capabilities.token),
                        "original cancellation capability must survive dispatch"
                    );
                    let indices = if signal && c.capabilities.has_signal {
                        vec![args.len()]
                    } else {
                        vec![]
                    };
                    if signal {
                        args.push(if c.capabilities.has_signal {
                            json!("<signal>")
                        } else {
                            Value::Null
                        });
                    }
                    let aborted = if indices.is_empty() {
                        Value::Null
                    } else {
                        json!(c.capabilities.aborted)
                    };
                    events.lock().unwrap().push(json!({"service":service.name(),"method":method,"args":args,"signalIndices":indices,"aborted":aborted}));
                    let mut cursor = cursor.lock().unwrap();
                    let step = test["steps"]
                        .as_array()
                        .unwrap()
                        .get(*cursor)
                        .unwrap_or_else(|| {
                            panic!("Unexpected {}.{method}: {test:?}", service.name())
                        })
                        .clone();
                    *cursor += 1;
                    assert_eq!(step["service"], service.name());
                    assert_eq!(step["method"], method);
                    Box::pin(async move {
                        if let Some(error) = step.get("error").or_else(|| step.get("reject")) {
                            Err(HostError::Error(error.as_str().unwrap().into()))
                        } else if let Some(value) = step.get("thrown") {
                            Err(HostError::Thrown(value.clone()))
                        } else {
                            Ok(step["value"].clone())
                        }
                    })
                })
            };
            let now = test["now"].as_i64().unwrap();
            let clock: Clock = Arc::new(move || now);
            let result = if test["kind"] == "assessment" {
                security_tools::SecurityTools { port }
                    .execute(test["name"].as_str().unwrap(), &test["input"], &context)
                    .await
            } else {
                security_workbench_tools::SecurityWorkbenchTools {
                    port,
                    clock,
                    scheduler: test["scheduler"] == true,
                }
                .execute(test["name"].as_str().unwrap(), &test["input"], &context)
                .await
            };
            let mut value = json!({"ok":result.ok,"message":result.message.0});
            if let Some(data) = result.data {
                value["data"] = data;
            }
            assert_eq!(
                *cursor.lock().unwrap(),
                test["steps"].as_array().unwrap().len(),
                "all expected calls must execute"
            );
            actual.push(json!({"result":value,"events":*events.lock().unwrap(),"consumed":*cursor.lock().unwrap()}));
        }
        for (i, (actual, expected)) in actual.iter().zip(expected.as_array().unwrap()).enumerate() {
            assert_eq!(
                js_numbers(actual),
                js_numbers(expected),
                "case {i}: {:?}",
                batch[i]
            );
        }
    }
}
#[test]
fn complete_factory_metadata_including_scopes_profiles_and_consent_matches() {
    let expected = reference(json!({"op":"nativesecuritytools.metadata"}));
    assert_eq!(security_tools::metadata(), &expected["assessment"]);
    assert_eq!(security_workbench_tools::metadata(false), &expected["base"]);
    assert_eq!(
        security_workbench_tools::metadata(true),
        &expected["scheduled"]
    );
}
#[tokio::test]
async fn assessment_owner_vantage_summary_limits_cancellation_and_failures_match() {
    compare(
        cases()
            .into_iter()
            .filter(|c| c["kind"] == "assessment")
            .collect(),
    )
    .await;
}
#[tokio::test]
async fn workbench_profiles_saved_results_redacted_reports_and_failures_match() {
    compare(
        cases()
            .into_iter()
            .filter(|c| {
                c["kind"] == "workbench"
                    && !c["name"].as_str().unwrap().starts_with("security.monitor.")
            })
            .collect(),
    )
    .await;
}
#[tokio::test]
async fn monitor_authorizes_before_create_preserves_stored_targets_and_disables_expiry() {
    compare(
        cases()
            .into_iter()
            .filter(|c| c["name"].as_str().unwrap().starts_with("security.monitor."))
            .collect(),
    )
    .await;
}
