#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    services::messenger_bridge::{MessengerAbortSignal, MessengerBridge, MessengerToolResponse},
    tools::{
        core_io::HostError,
        core_jait::JaitPort,
        messenger::{MessengerTools, metadata},
    },
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
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
            .join(".jait/artifacts/gateway-rust/messenger-tools/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
#[test]
fn all_seven_factory_metadata_definitions_match_source() {
    assert_eq!(
        metadata(),
        &reference(json!({"op":"nativemessengertools.metadata"}))
    );
}
struct Host {
    signal: Option<Arc<AtomicBool>>,
}
async fn actual(test: &Value) -> Value {
    let events = Arc::new(Mutex::new(vec![]));
    let log = events.clone();
    let host = Host {
        signal: if test["noSignal"] == true {
            None
        } else {
            Some(Arc::new(AtomicBool::new(test["aborted"] == true)))
        },
    };
    let expected_signal = host.signal.clone();
    let test_for_port = test.clone();
    let request: JaitPort<Host> = Arc::new(move |method, args, signal| {
        assert_eq!(method, "request");
        let same = match (&expected_signal, &signal.signal) {
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            (None, None) => true,
            _ => false,
        };
        log.lock().unwrap().push(json!({"args":args,"signalSame":same,"signalPresent":signal.signal.is_some(),"aborted":signal.signal.as_ref().is_some_and(|signal|signal.load(Ordering::SeqCst))}));
        let outcome = if let Some(error) = test_for_port
            .get("error")
            .or_else(|| test_for_port.get("reject"))
        {
            Err(HostError::Error(error.as_str().unwrap().into()))
        } else if let Some(value) = test_for_port.get("thrown") {
            Err(HostError::Thrown(value.clone()))
        } else {
            Ok(Some(test_for_port.get("response").cloned().unwrap_or(
                json!({"ok":true,"message":"scripted response","data":{"accepted":args[1]}}),
            )))
        };
        Box::pin(async move { outcome })
    });
    let mut context = json!({"userId":"owner"});
    if let Some(values) = test["context"].as_object() {
        for (key, value) in values {
            context[key] = value.clone();
        }
    }
    if test["noUser"] == true {
        context.as_object_mut().unwrap().remove("userId");
    }
    let result = MessengerTools { request }
        .execute(
            &format!("messenger.{}", test["action"].as_str().unwrap()),
            &test["input"],
            &context,
            &host,
        )
        .await;
    let mut result = match result {
        Ok(result) => json!({"result":result}),
        Err(HostError::Error(error)) => json!({"thrown":{"error":error}}),
        Err(HostError::Thrown(value)) => json!({"thrown":{"value":value}}),
    };
    result["events"] = json!(*events.lock().unwrap());
    result
}
#[tokio::test]
async fn command_validation_defaults_links_effects_and_uncaught_errors_match_typescript() {
    let fixture: Value =
        serde_json::from_str(include_str!("../fixtures/messenger-tools-cases.json")).unwrap();
    let mut batch = vec![];
    let mut size = 0;
    for test in fixture["cases"].as_array().unwrap() {
        let bytes = serde_json::to_vec(test).unwrap().len();
        if size + bytes > 40_000 {
            compare(&batch).await;
            batch.clear();
            size = 0;
        }
        batch.push(test.clone());
        size += bytes;
    }
    if !batch.is_empty() {
        compare(&batch).await;
    }
}
async fn compare(cases: &[Value]) {
    let expected = reference(json!({"op":"nativemessengertools.cases","cases":cases}));
    for (test, expected) in cases.iter().zip(expected.as_array().unwrap()) {
        assert_eq!(&actual(test).await, expected, "case {}", test);
    }
}
#[tokio::test]
async fn concrete_native_bridge_binding_preserves_owner_cancellation_and_policy() {
    let bridge = Arc::new(MessengerBridge::new());
    let calls = Arc::new(Mutex::new(vec![]));
    let events = calls.clone();
    bridge.set_gateway_handler(Some(Arc::new(move |owner,command,signal|{
        events.lock().unwrap().push(json!({"owner":owner,"command":command,"aborted":signal.as_ref().is_some_and(MessengerAbortSignal::is_aborted)}));
        if let Some(signal)=signal{signal.abort();}
        Box::pin(async{Ok(MessengerToolResponse{ok:true,message:"gateway response".into(),data:None})})
    })));
    let tools = MessengerTools::from_bridge(bridge.clone());
    let signal = MessengerAbortSignal::default();
    let result = tools
        .execute(
            "messenger.rooms",
            &json!({}),
            &json!({"userId":"owner"}),
            &Some(signal.clone()),
        )
        .await
        .unwrap();
    assert_eq!(result, json!({"ok":true,"message":"gateway response"}));
    assert!(signal.is_aborted());
    assert_eq!(
        *calls.lock().unwrap(),
        vec![
            json!({"owner":"owner","command":{"action":"rooms","query":"","limit":20},"aborted":false})
        ]
    );
    let result = tools
        .execute(
            "messenger.send",
            &json!({"roomId":"!room:server","text":"authorized test data"}),
            &json!({"userId":"owner"}),
            &Some(signal),
        )
        .await
        .unwrap();
    assert_eq!(result, json!({"ok":false,"message":"Cancelled."}));
    assert_eq!(calls.lock().unwrap().len(), 1);
    let result = tools
        .execute("messenger.status", &json!({}), &json!({}), &None)
        .await
        .unwrap();
    assert_eq!(
        result,
        json!({"ok":false,"message":"An authenticated Jait user is required."})
    );
    bridge.stop();
}
