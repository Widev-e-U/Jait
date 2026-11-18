#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    contracts::bounded_json::Utf16Text,
    services::background_command_monitor::{
        BackgroundCommandMonitor, ExecutionSnapshot, ExternalOptions,
    },
    tools::terminal_execution::{self, ExecutionMonitor},
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
struct Scripted {
    responses: Vec<Value>,
    cursor: Mutex<usize>,
    calls: Mutex<Vec<Value>>,
}
impl Scripted {
    fn invoke(
        &self,
        action: &str,
        session: &str,
        terminal: &str,
        execution: &str,
    ) -> Result<Option<ExecutionSnapshot>, String> {
        self.calls.lock().unwrap().push(json!({"action":action,"sessionId":session,"terminalId":terminal,"executionId":execution}));
        let mut cursor = self.cursor.lock().unwrap();
        let response = &self.responses[*cursor];
        *cursor += 1;
        if let Some(error) = response["error"].as_str() {
            return Err(error.into());
        }
        let value = &response["result"];
        Ok(if value.is_null() {
            None
        } else {
            Some(ExecutionSnapshot {
                terminal_id: value["terminalId"].as_str().unwrap().into(),
                execution_id: value["executionId"].as_str().unwrap().into(),
                status: value["status"].as_str().unwrap().into(),
                output: Utf16Text::from(value["output"].as_str().unwrap()),
                exit_code: value["exitCode"].as_f64(),
                duration_ms: value["durationMs"].as_f64().unwrap(),
            })
        })
    }
}
impl ExecutionMonitor for Scripted {
    fn inspect(&self, s: &str, t: &str, e: &str) -> Option<ExecutionSnapshot> {
        self.invoke("inspect", s, t, e).unwrap()
    }
    fn cancel(&self, s: &str, t: &str, e: &str) -> Result<Option<ExecutionSnapshot>, String> {
        self.invoke("cancel", s, t, e)
    }
}
#[test]
fn metadata_and_dispatch_match_actual_factory_without_hiding_fields() {
    let mut steps = vec![];
    let mut responses = vec![];
    for status in ["running", "completed", "cancelled", "timed_out"] {
        for action in ["inspect", "cancel", "unknown"] {
            steps.push(json!({"sessionId":"owned-context","input":{"action":action,"terminalId":"t/α","executionId":"e-123","sessionId":"spoofed"}}));
            responses.push(json!({"result":{"terminalId":"t/α","executionId":"e-123","status":status,"output":"line 1\r\n😀output","exitCode":if status=="running"{Value::Null}else{json!(7)},"durationMs":1234}}));
        }
    }
    for session in ["owner", "foreign"] {
        for action in ["inspect", "cancel"] {
            steps.push(json!({"sessionId":session,"input":{"action":action,"terminalId":"missing","executionId":"expired"}}));
            responses.push(json!({}));
        }
    }
    steps.push(
        json!({"sessionId":"owner","input":{"action":"cancel","terminalId":"t","executionId":"e"}}),
    );
    responses.push(json!({"error":"surface stop failed"}));
    let work = root()
        .join(".jait/artifacts/gateway-rust/terminal-helpers/inspect-contract")
        .join(uuid::Uuid::new_v4().to_string());
    let expected=internal_driver::call(&root(),&work,json!({"version":1,"calls":[{"op":"nativeterminalinspect.sequence","steps":steps,"responses":responses}]}),&||false).unwrap()[0].clone();
    let monitor = Scripted {
        responses,
        cursor: Mutex::new(0),
        calls: Mutex::new(vec![]),
    };
    let actual = steps
        .iter()
        .map(|step| {
            match terminal_execution::execute(
                &step["input"],
                step["sessionId"].as_str().unwrap(),
                &monitor,
            ) {
                Ok(result) => json!({"value":serde_json::to_value(result).unwrap()}),
                Err(error) => json!({"error":error}),
            }
        })
        .collect::<Vec<_>>();
    assert_eq!(terminal_execution::metadata(), &expected["metadata"]);
    assert_eq!(
        &*monitor.calls.lock().unwrap(),
        expected["calls"].as_array().unwrap()
    );
    for (i, result) in actual.iter().enumerate() {
        let mut expected = expected["results"][i].clone();
        if let Some(data) = expected.get_mut("value").and_then(|v| v.get_mut("data")) {
            data["durationMs"] = json!(data["durationMs"].as_f64().unwrap());
            if !data["exitCode"].is_null() {
                data["exitCode"] = json!(data["exitCode"].as_f64().unwrap());
            }
        }
        assert_eq!(result, &expected, "step {i}");
    }
}
#[tokio::test]
async fn actual_native_monitor_enforces_owner_and_preserves_cancellation_history() {
    let monitor = BackgroundCommandMonitor::with_options(
        Arc::new(|| 5000),
        Arc::new(|_, _| Arc::new(|| {})),
        Arc::new(|_| {}),
    );
    let cancellations = Arc::new(AtomicUsize::new(0));
    let counted = cancellations.clone();
    assert!(monitor.track_external(
        ExternalOptions {
            session_id: "owner".into(),
            terminal_id: "terminal".into(),
            execution_id: Some("execution".into()),
            command: "already-authorized".into(),
            started_at: 4500.0,
            should_notify: None,
            on_cancel: Some(Arc::new(move || {
                counted.fetch_add(1, Ordering::SeqCst);
                Ok(())
            })),
            get_output: Some(Arc::new(|| Utf16Text::from("partial output"))),
        },
        Box::pin(std::future::pending())
    ));
    let input = json!({"action":"cancel","terminalId":"terminal","executionId":"execution","sessionId":"owner"});
    assert!(
        !terminal_execution::execute(&input, "foreign", &monitor)
            .unwrap()
            .ok
    );
    assert_eq!(monitor.active_count(), 1);
    assert_eq!(cancellations.load(Ordering::SeqCst), 0);
    let stale = json!({"action":"cancel","terminalId":"terminal","executionId":"stale"});
    assert!(
        !terminal_execution::execute(&stale, "owner", &monitor)
            .unwrap()
            .ok
    );
    let inspect = json!({"action":"inspect","terminalId":"terminal","executionId":"execution"});
    let snapshot = terminal_execution::execute(&inspect, "owner", &monitor)
        .unwrap()
        .data
        .unwrap();
    assert_eq!(snapshot.status, "running");
    assert_eq!(snapshot.output.0, Utf16Text::from("partial output").0);
    assert_eq!(snapshot.duration_ms, 500.0);
    let cancelled = terminal_execution::execute(&input, "owner", &monitor)
        .unwrap()
        .data
        .unwrap();
    assert_eq!(cancelled.status, "cancelled");
    assert_eq!(monitor.active_count(), 0);
    assert_eq!(cancellations.load(Ordering::SeqCst), 1);
    assert_eq!(
        terminal_execution::execute(&inspect, "owner", &monitor)
            .unwrap()
            .data
            .unwrap()
            .status,
        "cancelled"
    );
    assert_eq!(
        terminal_execution::execute(&input, "owner", &monitor)
            .unwrap()
            .data
            .unwrap()
            .status,
        "cancelled"
    );
    assert_eq!(cancellations.load(Ordering::SeqCst), 1);
    assert!(
        !terminal_execution::execute(&inspect, "foreign", &monitor)
            .unwrap()
            .ok
    );
    monitor.clear_for_tests().unwrap();
    assert!(
        !terminal_execution::execute(&inspect, "owner", &monitor)
            .unwrap()
            .ok
    );
}
