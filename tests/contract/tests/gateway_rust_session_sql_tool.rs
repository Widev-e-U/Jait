#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::session_sql::{SessionSqlRequest, SessionSqlTool};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
async fn compare(cases: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/session-sql-tool/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[{"op":"nativesessionsqltool.run","cases":cases.clone()}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    for (case, expected) in cases.iter().zip(expected.as_array().unwrap()) {
        let requests = Arc::new(Mutex::new(vec![]));
        let captured = requests.clone();
        let response = case["response"].clone();
        let thrown = case["thrown"].as_str().map(str::to_string);
        let tool = SessionSqlTool::new(Arc::new(move |request| {
            let request = match request {
                SessionSqlRequest::Schema => json!({"mode":"schema"}),
                SessionSqlRequest::Query { sql, max_rows } => {
                    let mut query = json!({"mode":"query","sql":sql});
                    if let Some(n) = max_rows {
                        query["maxRows"] = n;
                    }
                    query
                }
            };
            captured.lock().unwrap().push(request);
            let result = if let Some(error) = &thrown {
                Err(error.clone())
            } else {
                Ok(response.clone())
            };
            Box::pin(async move { result })
        }));
        let mut actual = match tool.execute(&case["input"]).await {
            Ok(result) => json!({"outcome":result}),
            Err(error) => json!({"thrown":error}),
        };
        actual["requests"] = json!(*requests.lock().unwrap());
        actual["metadata"] = tool.metadata().clone();
        assert_eq!(&actual, expected, "case {case}");
    }
}
#[tokio::test]
async fn schema_discovery_and_query_results_preserve_service_boundary() {
    let mut cases = vec![];
    for input in [
        json!({"mode":"schema","sql":"DELETE FROM users"}),
        json!({"sql":" SELECT id FROM sessions ","max_rows":12}),
        json!({"sql":"WITH x AS (SELECT 1) SELECT * FROM x"}),
        json!({"sql":"SELECT 1","max_rows":null}),
    ] {
        for response in [
            json!({"ok":true,"data":{"tables":[{"table":"sessions","columns":[{"name":"id","type":"TEXT"}]}],"blockedTables":["users"]}}),
            json!({"ok":true,"data":{"columns":["id"],"rows":[{"id":"s1"}],"rowCount":1,"truncated":false,"tables":["sessions"]}}),
            json!({"ok":true,"data":{"columns":[],"rows":[],"rowCount":0,"truncated":true}}),
            json!({"ok":false,"error":"blocked_table","message":"Table is blocked"}),
        ] {
            cases.push(json!({"input":input,"response":response}));
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn invalid_input_does_not_reach_service_and_unhandled_service_errors_propagate() {
    let mut cases = vec![];
    for input in [
        json!({}),
        json!({"sql":null}),
        json!({"sql":1}),
        json!({"sql":false}),
        json!({"sql":[]}),
        json!({"sql":""}),
        json!({"sql":"\u{feff}\t\n"}),
    ] {
        cases.push(json!({"input":input,"thrown":"must not run"}));
    }
    for input in [json!({"mode":"schema"}), json!({"sql":"SELECT 1"})] {
        cases.push(json!({"input":input,"thrown":"service failed"}));
    }
    compare(cases).await;
}
