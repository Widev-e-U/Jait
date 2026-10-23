#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    contracts::ecmascript_json::JsonDocument,
    tools::{
        code_graph::{CodeGraphTools, GraphToolContext, metadata},
        core_io::{HostError, HostPort},
    },
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
async fn native(call: &Value) -> Value {
    if call["op"] == "nativegraphtools.metadata" {
        return metadata().clone();
    }
    let events = Arc::new(Mutex::new(vec![]));
    let log = events.clone();
    let response = call.clone();
    let marker = Arc::new(());
    let expected_marker = marker.clone();
    let port: HostPort<GraphToolContext<Arc<()>>> = Arc::new(move |method, params, context| {
        assert!(
            Arc::ptr_eq(&context.capabilities, &expected_marker),
            "opaque execution context identity must survive"
        );
        let signal = response["signal"] == true && method == "index";
        // Undefined is equal to undefined in the reference when no signal exists.
        let same = signal || response["signal"] != true;
        log.lock().unwrap().push(json!({"method":method,"params":params,"contextSignal":same,"aborted":if signal{json!(response["aborted"]==true)}else{Value::Null}}));
        let response = response.clone();
        Box::pin(async move {
            if let Some(message) = response["error"].as_str() {
                return Err(HostError::Error(message.into()));
            }
            if let Some(thrown) = response.get("thrown") {
                return Err(HostError::Thrown(thrown.clone()));
            }
            Ok(response["result"].clone())
        })
    });
    let tools = CodeGraphTools { port };
    let context = GraphToolContext {
        fields: call["context"].clone(),
        capabilities: marker,
    };
    let result = tools
        .execute(
            call["name"].as_str().unwrap(),
            call.get("input").unwrap_or(&json!({})),
            &context,
        )
        .await;
    let value = json!({"result":result,"events":*events.lock().unwrap()});
    serde_json::from_str(&JsonDocument::parse(&value.to_string()).unwrap().stringify()).unwrap()
}
async fn compare(calls: Vec<Value>) {
    let work = root().join(".jait/artifacts/gateway-rust/code-graph/tools");
    for batch in calls.chunks(20) {
        let expected = internal_driver::call(
            &root(),
            &work.join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":batch}),
            &|| false,
        )
        .unwrap();
        for (call, expected) in batch.iter().zip(expected.as_array().unwrap()) {
            assert_eq!(native(call).await, *expected, "tool case: {call}");
        }
    }
}
#[tokio::test]
async fn all_five_tool_metadata_and_owner_project_arguments_match_reference_factory() {
    let mut calls = vec![json!({"op":"nativegraphtools.metadata"})];
    for name in [
        "codegraph.index",
        "codegraph.query",
        "codegraph.path",
        "codegraph.prepare_graphrag",
        "codegraph.status",
    ] {
        let result = match name {
            "codegraph.index" => json!({"stats":{"nodeCount":5,"edgeCount":3}}),
            "codegraph.query" => {
                json!({"nodes":[{"label":"Beta","type":"class","degree":2},{"label":"Alpha","type":"function","degree":2},{"label":"Top","type":"module","degree":10}],"edges":[]})
            }
            "codegraph.path" => json!({"nodes":[{"label":"A"},{"label":"B"}],"edges":[{}]}),
            "codegraph.prepare_graphrag" => {
                json!({"manifest":{"entityCount":3,"relationshipCount":2}})
            }
            _ => json!({"status":"ready"}),
        };
        for context in [
            json!({"projectRoot":" /project ","userId":"owner"}),
            json!({"projectRoot":"/repo"}),
            json!({"projectRoot":" "}),
            json!({}),
        ] {
            calls.push(json!({"op":"nativegraphtools.execute","name":name,"context":context,"signal":true,"aborted":true,"input":{"query":"foo","mode":"hybrid","maxDepth":2,"maxNodes":8,"source":"A","target":"B","ignored":"drop"},"result":result}));
        }
    }
    compare(calls).await;
}
#[tokio::test]
async fn errors_thrown_values_empty_results_and_ranked_node_summaries_match_reference() {
    let mut calls = vec![];
    for name in [
        "codegraph.index",
        "codegraph.query",
        "codegraph.path",
        "codegraph.prepare_graphrag",
        "codegraph.status",
    ] {
        for problem in [
            json!({"error":"scanner refused"}),
            json!({"thrown":"error text"}),
            json!({"thrown":{"message":"object"}}),
            json!({"thrown":null}),
        ] {
            let mut call = json!({"op":"nativegraphtools.execute","name":name,"context":{"projectRoot":"/project"}});
            call.as_object_mut()
                .unwrap()
                .extend(problem.as_object().unwrap().clone());
            calls.push(call);
        }
    }
    for result in [
        json!({"nodes":[],"edges":[]}),
        json!({"nodes":(0..15).map(|i|json!({"label":format!("Node {i}"),"type":"function","degree":i})).collect::<Vec<_>>(),"edges":[{}]}),
    ] {
        calls.push(json!({"op":"nativegraphtools.execute","name":"codegraph.query","context":{"projectRoot":"/project","userId":null},"result":result}));
    }
    for (name, result) in [
        ("codegraph.path", Value::Null),
        (
            "codegraph.path",
            json!({"nodes":[{"label":"Self"}],"edges":[]}),
        ),
        ("codegraph.status", json!({"status":"error"})),
        ("codegraph.index", json!({})),
    ] {
        calls.push(json!({"op":"nativegraphtools.execute","name":name,"context":{"projectRoot":"/project"},"result":result}));
    }
    compare(calls).await;
}
