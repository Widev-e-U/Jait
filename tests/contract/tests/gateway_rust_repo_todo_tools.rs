#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{core_io::HostError, repo_todos::*};
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
        &root()
            .join(".jait/artifacts/gateway-rust/repo-todo-tools")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
#[test]
fn metadata_matches_actual_factory() {
    assert_eq!(
        metadata(),
        &reference(json!({"op":"nativerepotodotools.metadata"}))
    );
}
#[tokio::test]
async fn owned_repositories_todo_fields_previews_provenance_and_failures_match() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("../fixtures/repo-todo-cases.json")).unwrap();
    for batch in cases.chunks(4) {
        let expected = reference(json!({"op":"nativerepotodotools.run","cases":batch}));
        let mut actual = vec![];
        for test in batch {
            let events = Arc::new(Mutex::new(vec![]));
            let cursor = Arc::new(Mutex::new(0usize));
            let token = Arc::new(());
            let context = TodoContext {
                fields: test["context"].clone(),
                capabilities: token.clone(),
            };
            let port: TodoPort<Arc<()>> = {
                let test = test.clone();
                let cursor = cursor.clone();
                let events = events.clone();
                Arc::new(move |service, method, args, ctx| {
                    assert!(Arc::ptr_eq(&token, &ctx.capabilities));
                    events
                        .lock()
                        .unwrap()
                        .push(json!({"service":service.name(),"method":method,"args":args}));
                    let mut cursor = cursor.lock().unwrap();
                    let step = test["steps"]
                        .as_array()
                        .unwrap()
                        .get(*cursor)
                        .unwrap_or_else(|| panic!("Unexpected {}.{method}", service.name()))
                        .clone();
                    *cursor += 1;
                    assert_eq!(step["service"], service.name());
                    assert_eq!(step["method"], method);
                    Box::pin(async move {
                        if let Some(error) = step["error"].as_str() {
                            Err(HostError::Error(error.into()))
                        } else if let Some(value) = step.get("thrown") {
                            Err(HostError::Thrown(value.clone()))
                        } else {
                            Ok(step["value"].clone())
                        }
                    })
                })
            };
            let result = RepoTodoTool {
                port,
                threads: test["threads"] == true,
            }
            .execute(&test["input"], &context)
            .await;
            let mut outcome = match result {
                Ok(result) => {
                    let mut value = json!({"ok":result.ok,"message":result.message.0});
                    if let Some(data) = result.data {
                        value["data"] = data;
                    }
                    json!({"ok":true,"result":value})
                }
                Err(HostError::Error(message)) => {
                    json!({"ok":false,"error":{"kind":"Error","message":message}})
                }
                Err(HostError::Thrown(value)) => {
                    json!({"ok":false,"error":{"kind":"Thrown","value":value}})
                }
            };
            assert_eq!(
                *cursor.lock().unwrap(),
                test["steps"].as_array().unwrap().len(),
                "expected all calls: {test}"
            );
            outcome["events"] = json!(*events.lock().unwrap());
            outcome["consumed"] = json!(*cursor.lock().unwrap());
            actual.push(outcome);
        }
        for ((actual, expected), test) in actual.iter().zip(expected.as_array().unwrap()).zip(batch)
        {
            assert_eq!(actual, expected, "case {test}");
        }
    }
}
