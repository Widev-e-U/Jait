#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::core_agent::{AgentError, SpawnPort};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};
fn thrown(error: AgentError) -> Value {
    match error {
        AgentError::Error(error) => json!({"error":error}),
        AgentError::Thrown(value) => json!({"value":value}),
    }
}
fn identity(value: &Value) -> Option<usize> {
    match value {
        Value::String(v) if !v.is_empty() => Some(v.as_ptr() as usize),
        Value::Array(v) if !v.is_empty() => Some(v.as_ptr() as usize),
        Value::Object(v) if !v.is_empty() => v
            .keys()
            .find(|k| !k.is_empty())
            .map(|k| k.as_ptr() as usize),
        _ => None,
    }
}
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
async fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(12) {
        let root = root();
        let expected = internal_driver::call(
            &root,
            &root
                .join(".jait/artifacts/gateway-rust/core-agent/contracts")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":[{"op":"nativecoreagent.run","cases":batch}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        let mut actual = vec![];
        for test in batch {
            let input = Arc::new(test["input"].clone());
            let context = Arc::new(test["context"].clone());
            let input_id = Arc::as_ptr(&input) as usize;
            let context_id = Arc::as_ptr(&context) as usize;
            let constructions = AtomicUsize::new(0);
            let requests = Arc::new(Mutex::new(vec![]));
            let result_id = Arc::new(AtomicUsize::new(0));
            let port: SpawnPort<Value> = {
                let test = test.clone();
                let requests = requests.clone();
                let result_id = result_id.clone();
                Arc::new(move |input, context| {
                    requests.lock().unwrap().push(json!({"input":input,"context":context,"sameInput":input as *const _ as usize==input_id,"sameContext":context as *const _ as usize==context_id,"sameReceiver":true}));
                    let result = if let Some(value) = test.get("thrown") {
                        Err(AgentError::Thrown(value.clone()))
                    } else if let Some(error) = test["error"].as_str().filter(|e| !e.is_empty()) {
                        Err(AgentError::Error(error.into()))
                    } else {
                        let response = test["response"].clone();
                        result_id.store(identity(&response).unwrap_or(0), Ordering::SeqCst);
                        Ok(response)
                    };
                    Box::pin(async move { result })
                })
            };
            let tool = jait_gateway::tools::core::create_agent_tool(|| {
                constructions.fetch_add(1, Ordering::SeqCst);
                match test.get("factoryThrown") {
                    Some(value) => Err(AgentError::Thrown(value.clone())),
                    None => Ok(port),
                }
            });
            let result = match tool {
                Err(error) => {
                    json!({"factoryThrown":thrown(error),"constructions":constructions.load(Ordering::SeqCst),"requests":*requests.lock().unwrap()})
                }
                Ok(tool) => {
                    let mut outcomes = vec![];
                    for _ in 0..test["repeats"].as_u64().unwrap_or(1) {
                        outcomes.push(match tool.execute(&input, &*context).await {
                            Ok(result) => {
                                let same = result_id.load(Ordering::SeqCst)
                                    == identity(&result).unwrap_or(0);
                                json!({"outcome":result,"sameResult":same})
                            }
                            Err(error) => json!({"thrown":thrown(error)}),
                        });
                    }
                    json!({"metadata":tool.definition(),"constructions":constructions.load(Ordering::SeqCst),"requests":*requests.lock().unwrap(),"outcomes":outcomes})
                }
            };
            actual.push(result);
        }
        assert_eq!(json!(actual), expected, "batch {batch:?}");
    }
}
#[tokio::test]
async fn metadata_and_raw_inputs_contexts_and_result_ownership_match_the_wrapper() {
    let mut cases = vec![];
    for input in [
        Value::Null,
        json!(false),
        json!(0),
        json!("raw"),
        json!([]),
        json!({}),
        json!({"prompt":"task","description":"label","allowedTools":" read,execute,custom ","details":"detail","__swarmRoundId":"internal","unknown":{"keep":true}}),
    ] {
        for response in [
            Value::Null,
            json!(false),
            json!("x".repeat(1024)),
            json!([1, 2, 3]),
            json!({"ok":true,"message":"finished","data":{"nested":[1,false,null]}}),
        ] {
            cases.push(json!({"input":input,"context":{"sessionId":"session","userId":"owner","extra":{"keep":true}},"response":response,"repeats":2}));
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn construction_is_eager_once_and_all_errors_propagate_unchanged() {
    let mut cases = vec![json!({"input":{},"context":null,"response":{},"repeats":0})];
    for value in [
        Value::Null,
        json!(false),
        json!(3),
        json!("plain"),
        json!({"problem":"opaque"}),
        json!([1, "x"]),
    ] {
        cases.push(json!({"input":null,"context":false,"factoryThrown":value}));
        cases.push(json!({"input":[],"context":{"sessionId":"keep"},"thrown":value,"repeats":2}));
    }
    cases.push(json!({"input":{},"context":{},"error":"backend failed","repeats":2}));
    compare(cases).await;
}
