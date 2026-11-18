#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::maintenance::*;
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
fn error(failure: &Value) -> Option<MaintenanceError> {
    if failure.is_null() {
        None
    } else if failure["type"] == "error" {
        Some(MaintenanceError::Message(
            failure["message"].as_str().unwrap().into(),
        ))
    } else {
        Some(MaintenanceError::Thrown(failure["value"].clone()))
    }
}
async fn native(call: &Value) -> Value {
    if call["op"] == "nativemaintenancetool.metadata" {
        return metadata().clone();
    }
    let events = Arc::new(Mutex::new(vec![]));
    let shared = events.clone();
    let fixture = call.clone();
    let backend: Backend = Arc::new(move |request| {
        let shared = shared.clone();
        let fixture = fixture.clone();
        Box::pin(async move {
            shared.lock().unwrap().push(json!({"service":request}));
            if let Some(error) = error(&fixture["backendFailure"]) {
                return Err(error);
            }
            Ok(if request.repo_id.is_some() {
                MaintenanceResponse::One(serde_json::from_value(fixture["result"].clone()).unwrap())
            } else {
                MaintenanceResponse::All(
                    serde_json::from_value(fixture.get("results").cloned().unwrap_or(json!([])))
                        .unwrap(),
                )
            })
        })
    });
    let now = call["now"].as_i64().unwrap_or(1740000000000);
    let mut tool = MaintenanceTool::new(backend).with_clock(Arc::new(move || now));
    if call["notifications"] == true {
        let shared = events.clone();
        let failure = error(&call["notificationFailure"]);
        tool = tool.with_notification_sink(Arc::new(move |notification| {
            shared
                .lock()
                .unwrap()
                .push(json!({"notification":notification}));
            match failure.clone() {
                Some(error) => Err(error),
                None => Ok(()),
            }
        }));
    }
    let result = tool
        .execute(&call["input"], call["actionId"].as_str())
        .await;
    json!({"result":result,"events":*events.lock().unwrap()})
}
async fn compare(calls: Vec<Value>) {
    for batch in calls.chunks(16) {
        let expected = internal_driver::call(
            &root(),
            &root()
                .join(".jait/artifacts/gateway-rust/maintenance-tool")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":batch}),
            &|| false,
        )
        .unwrap();
        assert_eq!(expected.as_array().unwrap().len(), batch.len());
        for (call, expected) in batch.iter().zip(expected.as_array().unwrap()) {
            assert_eq!(&native(call).await, expected, "call {call}");
        }
    }
}
fn run(passed: bool) -> Value {
    json!({"id":"run-1","repoName":"Repository 😀\nname","checks":[
        {"name":"Types","passed":true,"durationMs":0},
        {"name":"Tests\nscript","passed":passed,"durationMs":1.25}
    ],"allPassed":passed})
}
fn base(input: Value) -> Value {
    json!({"op":"nativemaintenancetool.execute","input":input,"actionId":"action-1","result":run(true),"results":[run(true)]})
}
#[tokio::test]
async fn complete_metadata_matches_actual_export() {
    compare(vec![json!({"op":"nativemaintenancetool.metadata"})]).await;
}
#[tokio::test]
async fn single_repo_summaries_plan_links_and_notification_modes_match() {
    let mut calls = vec![];
    for passed in [true, false] {
        for notifications in [false, true] {
            for plan in [None, Some(""), Some("plan/😀 ?#")] {
                let mut call = base(json!({"repoId":"repo"}));
                call["result"] = run(passed);
                call["notifications"] = json!(notifications);
                if let Some(plan) = plan {
                    call["result"]["planId"] = json!(plan);
                }
                calls.push(call);
            }
        }
    }
    // Source allPassed drives the message even when a caller supplies inconsistent checks.
    let mut unusual = base(json!({"repoId":"repo"}));
    unusual["result"]["allPassed"] = json!(false);
    unusual["result"]["checks"] = json!([]);
    unusual["notifications"] = json!(true);
    calls.push(unusual);
    compare(calls).await;
}
#[tokio::test]
async fn all_repo_empty_success_mixed_and_failed_results_match() {
    let mut calls = vec![];
    let mut failed = run(false);
    failed["id"] = json!("run-2");
    failed["repoName"] = json!("second");
    failed["planId"] = json!("plan-2");
    for results in [
        json!([]),
        json!([run(true)]),
        json!([failed.clone()]),
        json!([run(true), failed.clone()]),
        json!([failed.clone(), failed]),
    ] {
        for notifications in [false, true] {
            let mut call = base(json!({}));
            call["results"] = results.clone();
            call["notifications"] = json!(notifications);
            calls.push(call);
        }
    }
    compare(calls).await;
}
#[tokio::test]
async fn nullish_inputs_truthiness_and_job_identity_match_reference() {
    let mut calls = vec![];
    for input in [
        Value::Null,
        json!(false),
        json!(0),
        json!("value"),
        json!([]),
        json!({}),
        json!({"repoId":null}),
        json!({"repoId":""}),
        json!({"repoId":false}),
        json!({"repoId":0}),
        json!({"repoId":" "}),
        json!({"repoId":true}),
        json!({"repoId":[]}),
        json!({"repoId":{}}),
        json!({"repoId":12.5}),
        json!({"repoId":"injection'; DROP TABLE x;--"}),
    ] {
        for action in [Value::Null, json!(""), json!("manual-provided")] {
            let mut call = base(input.clone());
            call["actionId"] = action;
            call["now"] = json!(-1);
            calls.push(call);
        }
    }
    compare(calls).await;
}
#[tokio::test]
async fn backend_rejections_and_notification_failures_keep_ordered_partial_effects() {
    let mut calls = vec![];
    for input in [json!({}), json!({"repoId":"repo"})] {
        for failure in [
            json!({"type":"error","message":"runner failed\nstack omitted"}),
            json!({"type":"thrown","value":"plain string"}),
            json!({"type":"thrown","value":null}),
            json!({"type":"thrown","value":{"cause":"bad"}}),
            json!({"type":"thrown","value":[1,null,"failure"]}),
            json!({"type":"thrown","value":false}),
        ] {
            let mut call = base(input.clone());
            call["notifications"] = json!(true);
            call["backendFailure"] = failure.clone();
            calls.push(call);
            let mut call = base(input.clone());
            call["notifications"] = json!(true);
            call["notificationFailure"] = failure.clone();
            calls.push(call);
        }
    }
    compare(calls).await;
}
#[tokio::test]
async fn durations_use_javascript_number_formatting() {
    let mut call = base(json!({"repoId":"repo"}));
    call["result"]["checks"] = json!([
        {"name":"negative zero","passed":false,"durationMs":-0.0},
        {"name":"tiny","passed":true,"durationMs":1e-7},
        {"name":"large","passed":true,"durationMs":1e21},
        {"name":"decimal","passed":true,"durationMs":1.0000000000000002},
        {"name":"threshold","passed":true,"durationMs":1e-6}
    ]);
    compare(vec![call]).await;
}
#[tokio::test]
async fn default_clock_is_evaluated_only_for_missing_action_identity() {
    let backend: Backend = Arc::new(|_| Box::pin(async { Ok(MaintenanceResponse::All(vec![])) }));
    let tool = MaintenanceTool::new(backend).with_clock(Arc::new(|| {
        panic!("provided identity must not read wall clock")
    }));
    assert_eq!(
        tool.execute(&json!({}), Some("")).await,
        json!({"ok":true,"message":"No accessible repositories found"})
    );
}
#[tokio::test]
async fn notification_adapter_uses_real_native_delivery_and_propagates_broadcast_failure() {
    use jait_gateway::services::notifications::NotificationService;
    let request: MaintenanceRun = serde_json::from_value(run(false)).unwrap();
    let backend: Backend = Arc::new(move |_| {
        let request = request.clone();
        Box::pin(async move { Ok(MaintenanceResponse::One(request)) })
    });
    let events = Arc::new(Mutex::new(vec![]));
    let shared = events.clone();
    let notifications = NotificationService::with_clock(
        Arc::new(move |event| {
            shared.lock().unwrap().push(event.clone());
            Err("broadcast offline".into())
        }),
        Arc::new(|| 1740000000000),
    );
    let tool = MaintenanceTool::new(backend).with_notifications(notifications);
    assert_eq!(
        tool.execute(&json!({"repoId":"repo"}), Some("action"))
            .await,
        json!({"ok":false,"message":"broadcast offline"})
    );
    let events = events.lock().unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["payload"]["level"], "warning");
    assert_eq!(
        events[0]["payload"]["body"],
        "1 check(s) failed in Repository 😀\nname"
    );
    assert!(events[0]["payload"].get("link").is_none());
}
#[tokio::test]
async fn async_backend_completes_before_notification_and_return() {
    let (send, receive) = tokio::sync::oneshot::channel();
    let receive = Arc::new(Mutex::new(Some(receive)));
    let events = Arc::new(Mutex::new(vec![]));
    let shared = events.clone();
    let backend: Backend = Arc::new(move |_| {
        let receive = receive.lock().unwrap().take().unwrap();
        let shared = shared.clone();
        Box::pin(async move {
            shared.lock().unwrap().push("started");
            receive.await.unwrap();
            shared.lock().unwrap().push("finished");
            Ok(MaintenanceResponse::All(vec![
                serde_json::from_value(run(true)).unwrap(),
            ]))
        })
    });
    let shared = events.clone();
    let tool = MaintenanceTool::new(backend).with_notification_sink(Arc::new(move |_| {
        shared.lock().unwrap().push("notification");
        Ok(())
    }));
    let input = json!({});
    let future = tool.execute(&input, Some("action"));
    tokio::pin!(future);
    tokio::select! {
        result=&mut future=>panic!("returned before service completed: {result}"),
        _=tokio::task::yield_now()=>{}
    };
    assert_eq!(*events.lock().unwrap(), vec!["started"]);
    send.send(()).unwrap();
    assert_eq!(future.await["ok"], true);
    assert_eq!(
        *events.lock().unwrap(),
        vec!["started", "finished", "notification"]
    );
}
