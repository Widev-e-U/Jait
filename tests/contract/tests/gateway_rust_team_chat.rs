#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{
    core_io::HostError,
    core_jait::JaitPort,
    team_chat::{TeamChat, metadata},
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
        &root()
            .join(".jait/artifacts/gateway-rust/team-chat-adapter/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
#[test]
fn metadata_matches_actual_team_chat_factory() {
    assert_eq!(
        metadata(),
        &reference(json!({"op":"nativeteamchat.metadata"}))
    );
}
#[tokio::test]
async fn routing_attribution_validation_retries_and_service_failures_match_typescript() {
    let fixture: Value =
        serde_json::from_str(include_str!("../fixtures/team-chat-cases.json")).unwrap();
    for test in fixture["cases"].as_array().unwrap() {
        let expected = reference(json!({"op":"nativeteamchat.cases","cases":[test]}))[0].clone();
        let events = Arc::new(Mutex::new(vec![]));
        let log = events.clone();
        let responses = test["responses"].clone();
        let port: JaitPort<()> = Arc::new(move |method, args, _| {
            log.lock()
                .unwrap()
                .push(json!({"method":method,"args":args}));
            let response = responses
                .get(method)
                .unwrap_or_else(|| panic!("unscripted {method}"));
            let outcome = if let Some(e) = response["error"].as_str() {
                Err(HostError::Error(e.into()))
            } else if let Some(e) = response.get("thrown") {
                Err(HostError::Thrown(e.clone()))
            } else {
                Ok(response.get("value").cloned())
            };
            Box::pin(async move { outcome })
        });
        let tool = TeamChat {
            service: port,
            retry_key: Arc::new(|| "<uuidv7>".into()),
        };
        let result = tool.execute(&test["input"], &test["context"], &()).await;
        let actual = json!({"result":result,"events":*events.lock().unwrap()});
        assert_eq!(actual, expected, "{} input {}", test["name"], test["input"]);
    }
}
