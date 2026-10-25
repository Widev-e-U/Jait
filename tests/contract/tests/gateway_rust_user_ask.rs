#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    services::input_requests::{Observer, UserQuestionService},
    tools::user_ask,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
const NOW: &str = "2026-10-18T12:00:00.000Z";
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let directory = root()
        .join(".jait/artifacts/gateway-rust/native-user-ask")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).unwrap();
    internal_driver::call(
        &root(),
        &directory,
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn normalize(value: &mut Value) {
    let id = value["events"][0]["request"]["id"]
        .as_str()
        .map(String::from);
    if let Some(id) = id {
        assert_eq!(uuid::Uuid::parse_str(&id).unwrap().get_version_num(), 7);
        fn visit(v: &mut Value, id: &str) {
            match v {
                Value::String(s) if s == id => *s = "<request>".into(),
                Value::Object(map) => {
                    for v in map.values_mut() {
                        visit(v, id);
                    }
                }
                Value::Array(array) => {
                    for v in array {
                        visit(v, id);
                    }
                }
                _ => {}
            }
        }
        visit(value, &id);
    }
}
async fn scenario(vector: &Value) -> Value {
    let mut call = vector.clone();
    call["op"] = json!("nativeask.run");
    call["now"] = json!(NOW);
    let mut expected = tokio::task::spawn_blocking(move || reference(call))
        .await
        .unwrap();
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let observer = |kind: &'static str| -> Observer {
        let events = events.clone();
        Arc::new(move |request| {
            events
                .lock()
                .unwrap()
                .push(json!({"kind":kind,"request":request}))
        })
    };
    let service = UserQuestionService::new(
        Arc::new(|| 1_792_324_800_000),
        Some(observer("request")),
        Some(observer("resolved")),
    );
    let worker = service.clone();
    let context = serde_json::from_value(vector["context"].clone()).unwrap();
    let input = serde_json::from_value(vector["input"].clone()).unwrap();
    let task = tokio::spawn(async move { user_ask::execute(&worker, input, &context).await });
    for _ in 0..8 {
        tokio::task::yield_now().await;
    }
    let id = events
        .lock()
        .unwrap()
        .first()
        .and_then(|e| e["request"]["id"].as_str())
        .unwrap_or("missing")
        .to_string();
    let mut actions = vec![];
    for action in vector["actions"].as_array().unwrap() {
        let user = action["user"].as_str();
        actions.push(match action["op"].as_str().unwrap() {
            "list" => json!(service.list_pending(action["session"].as_str(), user)),
            "submit" => json!(service.submit(&id, action["value"].clone(), user)),
            "cancel" => json!(service.cancel(&id, user)),
            _ => panic!("unknown action"),
        });
        for _ in 0..8 {
            tokio::task::yield_now().await;
        }
    }
    let settled = task.is_finished();
    let result = if settled {
        task.await.unwrap()
    } else {
        task.abort();
        Value::Null
    };
    let mut actual = json!({"settled":settled,"result":result,"actions":actions,
        "events":*events.lock().unwrap(),"pending":service.list_pending(None,None)});
    normalize(&mut actual);
    normalize(&mut expected);
    assert_eq!(actual, expected, "{}", vector["name"]);
    actual
}
fn vectors() -> Vec<Value> {
    serde_json::from_str(include_str!("../vectors/native-user-ask.json")).unwrap()
}
#[test]
fn user_ask_metadata_matches_real_constructor() {
    assert_eq!(
        *user_ask::metadata(),
        reference(json!({"op":"nativeask.metadata"}))
    );
    assert_eq!(user_ask::metadata()["name"], "user.ask");
}
#[tokio::test]
async fn user_ask_rejects_blank_fields_and_ordered_duplicate_ids_before_requesting() {
    for vector in vectors().into_iter().take(5) {
        let v = scenario(&vector).await;
        assert_eq!(v["settled"], true);
        assert_eq!(v["result"]["ok"], false);
        assert_eq!(v["events"], json!([]));
    }
}
#[tokio::test]
async fn user_ask_normalizes_questions_and_uses_authenticated_context_then_returns_answers() {
    let v = scenario(&vectors()[5]).await;
    assert_eq!(v["actions"][2], false);
    assert_eq!(v["actions"][3], true);
    assert_eq!(v["result"]["ok"], true);
    assert_eq!(v["events"][0]["request"]["sessionId"], "context-session");
    assert_eq!(v["events"][0]["request"]["userId"], "owner");
    assert_eq!(v["events"][0]["request"]["requestedBy"], "user.ask");
    assert_eq!(
        v["events"][0]["request"]["questions"][0]["options"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}
#[tokio::test]
async fn user_ask_cancellation_and_unanswered_requests_match_reference() {
    let v = scenario(&vectors()[6]).await;
    assert_eq!(v["result"]["ok"], false);
    let v = scenario(&vectors()[7]).await;
    assert_eq!(v["settled"], false);
    assert_eq!(v["pending"][0]["expiresAt"], Value::Null);
}

#[tokio::test]
async fn answered_card_payload_keeps_multiselect_free_text_and_skipped_answers() {
    let answers = json!({"target":{"selected":["Homelab","Local"],"freeText":"Only the lab 🦀","skipped":false},"later":{"selected":[],"freeText":null,"skipped":true}});
    let result = scenario(&json!({"name":"answered card contract","input":{"questions":[
        {"id":"target","header":"Target","question":"Where should it run?","multiSelect":true,"options":[{"label":"Homelab"},{"label":"Local"}]},
        {"id":"later","header":"Later","question":"Anything else?"}
    ]},"context":{"sessionId":"session","userId":"owner"},"actions":[
        {"op":"submit","user":"foreign","value":{"answers":answers}},
        {"op":"submit","user":"owner","value":{"answers":answers}}
    ]})).await;
    assert_eq!(result["result"]["data"]["answers"], answers);
    assert_eq!(result["pending"], json!([]));
}
