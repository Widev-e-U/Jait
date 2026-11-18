#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{agent_github::*, core_io::HostError};
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
            .join(".jait/artifacts/gateway-rust/agent-github/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
struct ScriptedPort {
    steps: Vec<Value>,
    events: Vec<Value>,
    cursor: usize,
}
impl ScriptedPort {
    fn invoke(&mut self, operation: GithubOperation) -> Result<Value, HostError> {
        let (name, args) = match operation {
            GithubOperation::BeginInstallation(..) => {
                panic!("installation URL issuance is HTTP-only")
            }
            GithubOperation::BeginSetup { .. }
            | GithubOperation::SaveManual { .. }
            | GithubOperation::AttachInstallation(..)
            | GithubOperation::Verify(..)
            | GithubOperation::Disconnect(..)
            | GithubOperation::ReadState(..)
            | GithubOperation::CompleteSetup(..)
            | GithubOperation::CompleteCallback(..)
            | GithubOperation::FindByAppId(..)
            | GithubOperation::FindByInstallationId(..) => {
                panic!("tool attempted HTTP-only operation")
            }
            GithubOperation::Initialize => ("initialize", json!([])),
            GithubOperation::CurrentAgent { user, thread } => {
                let mut context = json!({"userId":user});
                if let Some(thread) = thread {
                    context["threadId"] = json!(thread);
                }
                ("currentAgentId", json!([context]))
            }
            GithubOperation::List(user) => ("list", json!([user])),
            GithubOperation::Get(user, id) => ("get", json!([user, id])),
            GithubOperation::PublicBaseUrl => ("publicBaseUrl", json!([])),
            GithubOperation::WebhookSecret(user, id) => ("webhookSecret", json!([user, id])),
            GithubOperation::Test(user, id) => ("testConnection", json!([user, id])),
            GithubOperation::ResolveEnv(user, id) => ("resolveAgentGithubEnv", json!([user, id])),
        };
        self.events.push(json!({"name":name,"args":args}));
        let step = &self.steps[self.cursor];
        self.cursor += 1;
        assert_eq!(step["name"], name, "unexpected native port call");
        if let Some(v) = step.get("error") {
            Err(HostError::Error(v.as_str().unwrap().into()))
        } else if let Some(v) = step.get("thrown") {
            Err(HostError::Thrown(v.clone()))
        } else {
            Ok(step["value"].clone())
        }
    }
}
async fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(8) {
        let expected = reference(json!({"op":"nativeagentgithub.run","cases":batch}));
        let mut actual = vec![];
        for case in batch {
            let port = Arc::new(Mutex::new(ScriptedPort {
                steps: case["steps"].as_array().unwrap().clone(),
                events: vec![],
                cursor: 0,
            }));
            let fixture = port.clone();
            let tools = GithubTools {
                has_current_agent: case["resolver"].as_bool().unwrap_or(false),
                port: Arc::new(move |operation| {
                    let result = fixture.lock().unwrap().invoke(operation);
                    Box::pin(async move { result })
                }),
            };
            let result = tools
                .execute(
                    case["token"].as_bool().unwrap_or(false),
                    &case["input"],
                    case["user"].as_str(),
                    case["thread"].as_str(),
                )
                .await;
            let mut out = match result {
                Ok(result) => json!({"ok":true,"result":result}),
                Err(HostError::Error(message)) => {
                    json!({"ok":false,"error":{"kind":"Error","message":message}})
                }
                Err(HostError::Thrown(value)) => {
                    json!({"ok":false,"error":{"kind":"Thrown","value":value}})
                }
            };
            let state = port.lock().unwrap();
            out["events"] = json!(state.events);
            out["consumed"] = json!(state.cursor);
            actual.push(out);
        }
        assert_eq!(json!(actual), expected, "cases: {batch:?}");
    }
}
fn step(name: &str, value: Value) -> Value {
    json!({"name":name,"value":value})
}
fn init() -> Value {
    step("initialize", Value::Null)
}
fn connected() -> Value {
    json!({"status":"connected","agentId":"agent","appSlug":"fixture-app"})
}
fn case(token: bool, input: Value, steps: Vec<Value>) -> Value {
    json!({"user":"owner","token":token,"input":input,"steps":steps})
}
#[test]
fn complete_factory_metadata_preserves_consent() {
    assert_eq!(
        metadata(),
        &reference(json!({"op":"nativeagentgithub.metadata"}))
    );
    assert_eq!(metadata()[1]["risk"], "high");
    assert_eq!(metadata()[1]["defaultConsentLevel"], "once");
}
#[tokio::test]
async fn authentication_and_identity_resolution_order_match() {
    let mut cases = vec![];
    for token in [false, true] {
        for user in [Value::Null, json!("")] {
            let mut c = case(token, json!({"action":"status"}), vec![]);
            c["user"] = user;
            c["resolver"] = json!(true);
            cases.push(c);
        }
    }
    for token in [false, true] {
        for id in [Value::Null, json!(""), json!(" \t\u{feff}\u{a0}")] {
            for resolver in [false, true] {
                let mut steps = if token { vec![] } else { vec![init()] };
                if resolver {
                    steps.push(step("currentAgentId", Value::Null));
                }
                if !token && !id.as_str().is_some_and(|s| !s.is_empty()) {
                    steps.extend([
                        step("list", json!([])),
                        step("publicBaseUrl", json!("https://fixture.invalid")),
                    ]);
                }
                let mut c = case(token, json!({"action":"status","agentId":id}), steps);
                c["resolver"] = json!(resolver);
                c["thread"] = json!("thread");
                cases.push(c);
            }
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn status_connections_explicit_and_inferred_identity_match() {
    let mut cases = vec![case(
        false,
        json!({"action":"status"}),
        vec![
            init(),
            step("list", json!([connected(),{"status":"error"}])),
            step("publicBaseUrl", json!("https://fixture.invalid/")),
        ],
    )];
    for id in [" agent ", "\u{feff}agent\u{a0}", "\u{85}agent\u{85}"] {
        for value in [Value::Null, connected(), json!({"status":"disconnected"})] {
            cases.push(case(
                false,
                json!({"action":"status","agentId":id}),
                vec![
                    init(),
                    step("list", json!([connected()])),
                    step("get", value),
                    step("publicBaseUrl", json!("https://fixture.invalid")),
                    step("webhookSecret", json!("fixture-not-secret")),
                ],
            ));
        }
    }
    let mut c = case(
        false,
        json!({"action":"status","agentId":" "}),
        vec![
            init(),
            step("currentAgentId", json!("inferred")),
            step("list", json!([])),
            step("get", Value::Null),
            step("publicBaseUrl", json!("https://fixture.invalid")),
            step("webhookSecret", json!("")),
        ],
    );
    c["resolver"] = json!(true);
    cases.push(c);
    for c in &mut cases {
        if c["input"]["agentId"].is_string() {
            c["resolver"] = json!(true);
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn instructions_and_test_defaults_and_caught_values_match() {
    let mut cases = vec![
        case(
            false,
            json!({"action":"instructions"}),
            vec![
                init(),
                step("publicBaseUrl", json!("https://first.invalid")),
                step("publicBaseUrl", json!("https://second.invalid")),
            ],
        ),
        case(false, json!({"action":"test"}), vec![init()]),
    ];
    for result in [
        json!({"ok":true}),
        json!({"ok":true,"botLogin":null,"repositoryCount":null}),
        json!({"ok":true,"botLogin":"","repositoryCount":0}),
        json!({"ok":true,"botLogin":"fixture[bot]","repositoryCount":5}),
        json!({"ok":false,"error":"denied"}),
    ] {
        cases.push(case(
            false,
            json!({"action":"test","agentId":"agent"}),
            vec![init(), step("testConnection", result)],
        ));
    }
    for error in [
        json!({"error":"network failed"}),
        json!({"thrown":"raw"}),
        json!({"thrown":{"message":"object"}}),
        json!({"thrown":null}),
    ] {
        let mut e = error;
        e["name"] = json!("testConnection");
        cases.push(case(
            false,
            json!({"action":"test","agentId":"agent"}),
            vec![init(), e],
        ));
    }
    compare(cases).await;
}
#[tokio::test]
async fn token_connection_gates_env_defaults_and_usage_match() {
    let mut cases = vec![];
    for connection in [
        Value::Null,
        json!({"status":"error"}),
        json!({"status":"pending","lastError":null}),
        json!({"status":"error","lastError":""}),
        json!({"status":"error","lastError":"revoked"}),
    ] {
        cases.push(case(
            true,
            json!({"agentId":"agent"}),
            vec![init(), step("get", connection)],
        ));
    }
    for env in [
        Value::Null,
        json!({}),
        json!({"GH_TOKEN":"fixture-token","JAIT_GITHUB_TOKEN_EXPIRES_AT":"2099-01-01T00:00:00Z"}),
        json!({"GH_TOKEN":"fixture-token","GITHUB_APP_BOT_LOGIN":"fixture[bot]","GITHUB_APP_SLUG":"fixture","GITHUB_APP_INSTALLATION_ID":"42","JAIT_GITHUB_TOKEN_EXPIRES_AT":"2099-01-01T00:00:00Z","EXTRA":"retained"}),
        json!({"GH_TOKEN":"","GITHUB_APP_BOT_LOGIN":"","GITHUB_APP_SLUG":"","GITHUB_APP_INSTALLATION_ID":""}),
    ] {
        cases.push(case(
            true,
            json!({"agentId":" agent "}),
            vec![
                init(),
                step("get", connected()),
                step("resolveAgentGithubEnv", env),
            ],
        ));
    }
    let mut c = case(
        true,
        json!({}),
        vec![
            step("currentAgentId", json!("agent")),
            init(),
            step("get", connected()),
            step("resolveAgentGithubEnv", Value::Null),
        ],
    );
    c["resolver"] = json!(true);
    cases.push(c);
    for error in [
        json!({"error":"mint denied"}),
        json!({"thrown":"raw"}),
        json!({"thrown":{"message":"object"}}),
        json!({"thrown":["a",null,2]}),
    ] {
        let mut e = error;
        e["name"] = json!("resolveAgentGithubEnv");
        cases.push(case(
            true,
            json!({"agentId":"agent"}),
            vec![init(), step("get", connected()), e],
        ));
    }
    compare(cases).await;
}
#[tokio::test]
async fn errors_outside_async_catch_remain_thrown_match() {
    let mut cases = vec![];
    for token in [false, true] {
        for (name, steps) in [("initialize", vec![]), ("get", vec![init()])] {
            for e in [
                json!({"error":"service unavailable"}),
                json!({"thrown":{"private":"fixture"}}),
            ] {
                if !token && name == "get" {
                    continue;
                }
                let mut error = e;
                error["name"] = json!(name);
                let mut steps = steps.clone();
                steps.push(error);
                cases.push(case(
                    token,
                    json!({"agentId":"agent","action":"status"}),
                    steps,
                ));
            }
        }
    }
    for name in ["list", "get", "publicBaseUrl", "webhookSecret"] {
        let mut steps = vec![init()];
        for phase in ["list", "get", "publicBaseUrl", "webhookSecret"] {
            if phase == name {
                steps.push(json!({"name":phase,"error":"boundary"}));
                break;
            }
            steps.push(step(
                phase,
                match phase {
                    "list" => json!([]),
                    "get" => connected(),
                    _ => json!("https://fixture.invalid"),
                },
            ));
        }
        cases.push(case(
            false,
            json!({"action":"status","agentId":"agent"}),
            steps,
        ));
    }
    for token in [false, true] {
        let mut steps = if token { vec![] } else { vec![init()] };
        steps.push(json!({"name":"currentAgentId","error":"resolver failed"}));
        let mut c = case(token, json!({"action":"test"}), steps);
        c["resolver"] = json!(true);
        cases.push(c);
    }
    compare(cases).await;
}
