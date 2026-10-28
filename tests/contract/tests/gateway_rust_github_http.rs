#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    routes::{agent_github_apps::*, auth::AuthState},
    security::http_auth::{self, AuthUser},
    tools::{
        agent_github::{GithubOperation, GithubPort},
        core_io::HostError,
    },
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn operation(op: GithubOperation) -> (&'static str, Vec<Value>) {
    match op {
        GithubOperation::List(u) => ("list", vec![json!(u)]),
        GithubOperation::Get(u, a) => ("get", vec![json!(u), json!(a)]),
        GithubOperation::PublicBaseUrl => ("publicBaseUrl", vec![]),
        GithubOperation::WebhookSecret(u, a) => ("webhookSecret", vec![json!(u), json!(a)]),
        GithubOperation::Test(u, a) => ("testConnection", vec![json!(u), json!(a)]),
        GithubOperation::BeginSetup {
            user,
            agent,
            options,
        } => ("beginSetup", vec![json!(user), json!(agent), options]),
        GithubOperation::SaveManual {
            user,
            agent,
            options,
        } => ("saveManualApp", vec![json!(user), json!(agent), options]),
        GithubOperation::AttachInstallation(u, a, id) => {
            ("attachInstallation", vec![json!(u), json!(a), json!(id)])
        }
        GithubOperation::Verify(u, a) => ("verify", vec![json!(u), json!(a)]),
        GithubOperation::Disconnect(u, a) => ("disconnect", vec![json!(u), json!(a)]),
        GithubOperation::ReadState(v) => ("readState", vec![v]),
        GithubOperation::CompleteSetup(u, a, v) => ("completeSetup", vec![json!(u), json!(a), v]),
        GithubOperation::CompleteCallback(v) => (
            "completeCallback",
            vec![
                json!({"user":v.user,"agent":v.agent,"state":v.state,"code":v.code,"installation":v.installation}),
            ],
        ),
        GithubOperation::FindByAppId(id) => ("findByAppId", vec![json!(id)]),
        GithubOperation::FindByInstallationId(id) => ("findByInstallationId", vec![json!(id)]),
        _ => panic!("HTTP invoked tool-only operation"),
    }
}
async fn compare(steps: Value) {
    compare_options(steps, false, false).await;
}
async fn compare_options(steps: Value, no_checker: bool, no_sink: bool) {
    let (actual, reference) = observed_options(steps, no_checker, no_sink).await;
    assert_eq!(actual, reference);
}
async fn observed_options(steps: Value, no_checker: bool, no_sink: bool) -> (Value, Value) {
    let call =
        json!({"op":"nativegithubhttp.run","steps":steps,"noChecker":no_checker,"noSink":no_sink});
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/agent-github-http/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "github-route-fixture".into()).unwrap();
    let active = Arc::new(Mutex::new(Value::Null));
    let events = Arc::new(Mutex::new(vec![]));
    let state = active.clone();
    let log = events.clone();
    let counts = Arc::new(Mutex::new(
        std::collections::BTreeMap::<String, usize>::new(),
    ));
    let port_counts = counts.clone();
    let manager: GithubPort = Arc::new(move |op| {
        let (name, args) = operation(op);
        log.lock().unwrap().push(json!({"name":name,"args":args}));
        let step = state.lock().unwrap().clone();
        let index = {
            let mut c = port_counts.lock().unwrap();
            let n = c.entry(name.into()).or_default();
            let i = *n;
            *n += 1;
            i
        };
        Box::pin(async move {
            if step.get("nativeErrorAt").unwrap_or(&step["errorAt"]) == name {
                return Err(if let Some(v) = step.get("thrown") {
                    HostError::Thrown(v.clone())
                } else {
                    HostError::Error(step["error"].as_str().unwrap().into())
                });
            }
            let mut value = step["nativeReplies"]
                .get(name)
                .or_else(|| step["replies"].get(name))
                .cloned();
            if let Some(seq) = value.as_ref().and_then(|v| v["sequence"].as_array()) {
                value = Some(seq[index.min(seq.len() - 1)].clone());
            }
            if let Some(e) = value.as_ref().and_then(|v| v["__error"].as_str()) {
                return Err(HostError::Error(e.into()));
            }
            Ok(value.unwrap_or_else(|| match name {
                "list" => json!([]),
                "publicBaseUrl" => json!("https://jait.test"),
                _ => Value::Null,
            }))
        })
    });
    let exists_state = active.clone();
    let exists_log = events.clone();
    let sink_state = active.clone();
    let sink_log = events.clone();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let app = GithubAppRoutes {
        auth: auth.clone(),
        port: manager,
        agent_exists: (!no_checker).then(|| {
            Arc::new(move |u: &str, a: &str| {
                exists_log
                    .lock()
                    .unwrap()
                    .push(json!({"name":"agentExists","args":[u,a]}));
                exists_state.lock().unwrap()["agentMissing"] != true
            }) as AgentExists
        }),
        on_webhook: (!no_sink).then(|| {
            Arc::new(move |e| {
                sink_log
                    .lock()
                    .unwrap()
                    .push(json!({"name":"onWebhook","args":[e]}));
                let step = sink_state.lock().unwrap().clone();
                Box::pin(async move {
                    if step["errorAt"] == "onWebhook" {
                        Err(HostError::Error("sink failed".into()))
                    } else {
                        Ok(())
                    }
                })
                    as futures_util::future::BoxFuture<'static, Result<(), HostError>>
            }) as WebhookSink
        }),
    }
    .router();
    let (send, receive) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = receive.await;
            })
            .await
            .unwrap()
    });
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let mut results = vec![];
    for step in steps.as_array().unwrap() {
        *active.lock().unwrap() = step.clone();
        counts.lock().unwrap().clear();
        let method = step["method"].as_str().unwrap().parse().unwrap();
        let mut request = client
            .request(method, format!("{base}{}", step["path"].as_str().unwrap()))
            .header("host", "fixture.test");
        if let Some(headers) = step["headers"].as_object() {
            for (key, value) in headers {
                if let Some(values) = value.as_array() {
                    if step["wireDuplicate"] == true {
                        for value in values {
                            request = request.header(key, value.as_str().unwrap());
                        }
                    } else {
                        request = request.header(
                            key,
                            values
                                .iter()
                                .map(|v| v.as_str().unwrap())
                                .collect::<Vec<_>>()
                                .join(", "),
                        );
                    }
                } else {
                    request = request.header(key, value.as_str().unwrap());
                }
            }
        }
        if let Some(user) = step["user"].as_str() {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: "alice".into(),
                },
                "github-route-fixture",
            )
            .unwrap();
            request = if step["cookie"] == true {
                request.header("cookie", format!("jait_token={token}"))
            } else {
                request.bearer_auth(token)
            };
        }
        if let Some(raw) = step["raw"].as_str() {
            request = request.body(raw.to_owned());
        } else if let Some(body) = step.get("body") {
            request = request
                .header("content-type", "application/json")
                .body(body.to_string());
        }
        if let Some(secret) = step["sign"].as_str() {
            use hmac::{Hmac, Mac};
            let body = step["raw"]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| step["body"].to_string());
            let mut mac = Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).unwrap();
            mac.update(body.as_bytes());
            let bytes = mac.finalize().into_bytes();
            request = request.header(
                "x-hub-signature-256",
                format!(
                    "sha256={}",
                    bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
                ),
            );
        }
        let result = request.send().await.unwrap();
        let location = result
            .headers()
            .get("location")
            .map(|s| s.to_str().unwrap().to_owned());
        let status = result.status().as_u16();
        let raw = result.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body,"location":location}));
    }
    let _ = send.send(());
    server.await.unwrap();
    auth.shutdown().await.unwrap();
    let actual = json!({"results":results,"events":*events.lock().unwrap()});
    (actual, expected)
}
#[tokio::test]
async fn authentication_and_agent_boundaries() {
    compare(json!([
 {"method":"GET","path":"/api/github-apps"},
 {"method":"POST","path":"/api/agents/a/github-app/setup","body":{"appName":"x"}},
 {"method":"GET","path":"/api/agents/a/github-app","user":"owner","agentMissing":true},
 {"method":"POST","path":"/api/agents/a/github-app/test","user":"owner","agentMissing":true},
 {"method":"DELETE","path":"/api/agents/a/github-app","user":"owner","agentMissing":true,"replies":{"disconnect":{"disconnected":true}}},
 {"method":"GET","path":"/api/github-apps","user":"owner","cookie":true,"replies":{"list":[{"agentId":"a","status":"connected"},{"agentId":"b","status":"pending"}]}},
 {"method":"GET","path":"/api/agents/a/github-app","user":"owner","replies":{"get":{"agentId":"a"},"webhookSecret":"synthetic-not-returned"}}
 ])).await;
}
#[tokio::test]
async fn setup_manual_and_installation_coercion() {
    let mut steps = vec![];
    for body in [
        json!({}),
        json!({"appName":2}),
        json!({"appName":" \u{feff}"}),
        json!({"appName":" x ","organization":false,"description":"d","homepage":1}),
    ] {
        steps.push(json!({"method":"POST","path":"/api/agents/a/github-app/setup","user":"owner","body":body,"headers":{"x-forwarded-proto":"https, http","x-forwarded-host":"public.test, internal"},"replies":{"beginSetup":{"url":"https://github.test/new"}}}));
    }
    for body in [
        json!({}),
        json!({"appId":"42","privateKey":"synthetic-key","appName":"app","appSlug":3}),
    ] {
        steps.push(json!({"method":"POST","path":"/api/agents/a/github-app/manual","user":"owner","body":body,"replies":{"saveManualApp":{"status":"installed"}}}));
    }
    for id in [
        json!(" 0012 "),
        json!(123),
        json!(0),
        json!(-1),
        json!(1.5),
        json!(true),
        Value::Null,
        json!("1e3"),
        json!("１２"),
    ] {
        steps.push(json!({"method":"POST","path":"/api/agents/a/github-app/installation","user":"owner","body":{"installationId":id},"replies":{"attachInstallation":{"status":"connected"}}}));
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn service_catches_and_uncaught_failures() {
    let mut steps = vec![];
    for (action, op) in [
        ("setup", "beginSetup"),
        ("manual", "saveManualApp"),
        ("installation", "attachInstallation"),
        ("verify", "verify"),
        ("test", "testConnection"),
    ] {
        for thrown in [false, true] {
            let mut s = json!({"method":"POST","path":format!("/api/agents/a/github-app/{action}"),"user":"owner","body":{"appName":"x","installationId":"123"},"errorAt":op,"error":"service failed"});
            if thrown {
                s["thrown"] = json!({"denied":true});
            }
            steps.push(s);
        }
    }
    for (method, path, op) in [
        ("GET", "/api/github-apps", "list"),
        ("GET", "/api/agents/a/github-app", "get"),
        ("DELETE", "/api/agents/a/github-app", "disconnect"),
    ] {
        steps.push(
            json!({"method":method,"path":path,"user":"owner","errorAt":op,"error":"host failed"}),
        );
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn callback_states_order_and_redirect_escaping() {
    let signed = json!({"userId":"owner","agentId":"a /&é"});
    let (actual,reference)=observed_options(json!([
 {"method":"GET","path":"/api/github/apps/callback?state=bad"},
 {"method":"GET","path":"/api/github/apps/callback?state=ok","replies":{"readState":signed}},
 {"method":"GET","path":"/api/github/apps/callback?state=ok&code=new","nativeReplies":{"completeCallback":{"installationId":"5"}},"replies":{"readState":signed,"get":{"sequence":[null,{"installationId":"5"}]}}},
 {"method":"GET","path":"/api/github/apps/callback?state=ok&code=old&installation_id=42","nativeReplies":{"completeCallback":{"installationId":"42"}},"replies":{"readState":signed,"get":{"sequence":[{"appId":"1"},{"status":"connected"}]}}},
 {"method":"GET","path":"/api/github/apps/callback?state=ok&installation_id=42","replies":{"readState":signed,"get":{"sequence":[null,{"status":"pending"},null]}}},
 {"method":"GET","path":"/api/github/apps/callback?state=ok&code=x","replies":{"readState":signed},"errorAt":"completeSetup","nativeErrorAt":"completeCallback","error":"bad & code / é"},
 {"method":"GET","path":"/api/github/apps/callback?state=ok&code=x","replies":{"readState":signed},"errorAt":"completeSetup","nativeErrorAt":"completeCallback","thrown":0}
 ]),false,false).await;
    assert_eq!(actual["results"], reference["results"]);
    let callbacks: Vec<_> = actual["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["name"] == "completeCallback")
        .collect();
    assert_eq!(callbacks.len(), 5);
    assert_eq!(
        callbacks[0]["args"][0],
        json!({"user":"owner","agent":"a /&é","state":"ok","code":"new","installation":null})
    );
    assert!(actual["events"].as_array().unwrap().iter().all(|e| {
        !["get", "completeSetup", "attachInstallation"].contains(&e["name"].as_str().unwrap())
    }));
}
#[tokio::test]
async fn webhook_auth_raw_signature_and_owner_precedence() {
    let owner = json!({"userId":"owner","agentId":"a"});
    let raw = "{ \"installation\": {\"id\":42}, \"text\":\"é\" }";
    let mut steps = vec![];
    for kind in 0..7 {
        let mut s = json!({"method":"POST","path":"/api/github/apps/webhook","raw":raw,"headers":{"content-type":"application/json","x-github-hook-installation-target-id":"app-1","x-github-event":"push","x-github-delivery":"delivery-1"},"replies":{"findByAppId":owner,"webhookSecret":"secret"}});
        match kind {
            0 => s["sign"] = json!("secret"),
            1 => s["sign"] = json!("wrong"),
            2 => {}
            3 => s["replies"]["webhookSecret"] = Value::Null,
            4 => {
                s["replies"]["findByAppId"] = Value::Null;
                s["replies"]["findByInstallationId"] = owner.clone();
                s["sign"] = json!("secret");
            }
            5 => s["replies"]["findByAppId"] = Value::Null,
            _ => {
                s["sign"] = json!("secret");
                s["errorAt"] = json!("onWebhook");
                s["error"] = json!("sink failed");
            }
        }
        steps.push(s);
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn webhook_malformed_and_target_filtering() {
    let mut steps = vec![];
    for raw in [
        "{",
        "null",
        "[]",
        "1",
        "\"text\"",
        "{\"installation\":{\"id\":null}}",
    ] {
        steps.push(json!({"method":"POST","path":"/api/github/apps/webhook","raw":raw,"headers":{"content-type":"application/json"}}));
    }
    steps.push(json!({"method":"POST","path":"/api/github/apps/webhook","raw":"{","headers":{"content-type":"application/json","x-github-hook-installation-target-type":"repository"}}));
    let (actual, reference) = observed_options(json!(steps), false, false).await;
    let statuses: Vec<_> = reference["results"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["status"].clone())
        .collect();
    assert_eq!(
        statuses,
        json!([400, 500, 404, 404, 404, 404, 202])
            .as_array()
            .unwrap()
            .clone()
    );
    for i in [0, 5, 6] {
        assert_eq!(actual["results"][i], reference["results"][i]);
    }
    for i in 1..5 {
        assert_eq!(
            actual["results"][i],
            json!({"status":400,"body":{"detail":"invalid_payload"},"location":null})
        );
    }
    let mut calls = vec![];
    for id in ["", "", "", "null"] {
        calls.push(json!({"name":"findByAppId","args":[""]}));
        calls.push(json!({"name":"findByInstallationId","args":[id]}));
    }
    assert_eq!(reference["events"], json!(calls));
    assert_eq!(
        actual["events"],
        json!([
            {"name":"findByAppId","args":[""]},
            {"name":"findByInstallationId","args":["null"]}
        ])
    );
}
#[tokio::test]
async fn parser_scope_and_encoded_agents() {
    compare(json!([
 {"method":"GET","path":"/api/agents/a%20%2F%26%C3%A9/github-app","user":"owner"},
 {"method":"GET","path":"/api/agents/bad%ZZ/github-app","user":"owner"},
 {"method":"GET","path":"/api/agents/bad%FF/github-app"},
 {"method":"POST","path":"/api/agents/a/github-app/setup","user":"owner","raw":"{","headers":{"content-type":"application/json"}},
 {"method":"POST","path":"/api/agents/a/github-app/manual","user":"owner","body":{"__proto__":{"x":1}}},
 {"method":"POST","path":"/api/agents/a/github-app/setup","user":"owner","raw":"hello","headers":{"content-type":"text/plain"}},
 {"method":"POST","path":"/api/github/apps/webhook"},
 {"method":"POST","path":"/api/github/apps/webhook","raw":"","headers":{"content-type":"application/json"}},
 {"method":"POST","path":"/api/github/apps/webhook","raw":"{}","headers":{"content-type":"application/octet-stream"}},
 {"method":"POST","path":"/api/github/apps/webhook","raw":"{}","headers":{"content-type":"text/plain"}},
 {"method":"POST","path":"/api/github/apps/webhook","raw":"{\"__proto__\":{\"x\":1}}","headers":{"content-type":"application/json"}}
 ])).await;
}
#[tokio::test]
async fn callback_repeated_parameters_and_error_length() {
    let signed = json!({"userId":"owner","agentId":"a~!*'()"});
    let mut steps = vec![];
    steps.push(json!({"method":"GET","path":"/api/github/apps/callback?state=x&state=y&code=a&code=b&installation_id=1&installation_id=2","replies":{"readState":signed,"get":{"appId":"exists"}}}));
    for error in [
        "e".repeat(190),
        "😀".repeat(100),
        format!("{}😀", "a".repeat(179)),
    ] {
        steps.push(json!({"method":"GET","path":"/api/github/apps/callback?state=x&code=a","replies":{"readState":signed},"errorAt":"completeSetup","nativeErrorAt":"completeCallback","error":error}));
    }
    let (actual, reference) = observed_options(json!(steps), false, false).await;
    assert!(
        actual["results"][0]["location"]
            .as_str()
            .unwrap()
            .ends_with("reason=invalid_state")
    );
    for i in 1..4 {
        assert_eq!(actual["results"][i], reference["results"][i]);
    }
    assert_eq!(
        actual["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["name"] == "completeCallback")
            .count(),
        3
    );
}
#[tokio::test]
async fn optional_checker_sink_and_second_owner() {
    let owner = json!({"userId":"other","agentId":"same-agent"});
    let (actual, reference) = observed_options(json!([
 {"method":"GET","path":"/api/agents/same-agent/github-app","user":"other","agentMissing":true},
 {"method":"POST","path":"/api/agents/same-agent/github-app/verify","user":"other","replies":{"verify":{"verified":true}}},
 {"method":"POST","path":"/api/agents/same-agent/github-app/test","user":"other","replies":{"testConnection":{"ok":true}}},
 {"method":"POST","path":"/api/github/apps/webhook","raw":"{}","sign":"secret","headers":{"content-type":"application/json","x-github-event":["push","issues"]},"replies":{"findByAppId":owner,"webhookSecret":"secret"}}
 ]),true,true).await;
    for i in 0..3 {
        assert_eq!(actual["results"][i], reference["results"][i]);
    }
    assert_eq!(
        reference["results"][3],
        json!({"status":200,"body":{"accepted":true,"agentId":"same-agent","event":"push, issues"},"location":null})
    );
    assert_eq!(
        actual["results"][3],
        json!({"status":400,"body":{"detail":"ambiguous_headers"},"location":null})
    );
    assert_eq!(
        actual["events"],
        json!([
            {"name":"get","args":["other","same-agent"]},
            {"name":"webhookSecret","args":["other","same-agent"]},
            {"name":"verify","args":["other","same-agent"]},
            {"name":"testConnection","args":["other","same-agent"]}
        ])
    );
    let mut reference_events = actual["events"].as_array().unwrap().clone();
    reference_events.extend([
        json!({"name":"findByAppId","args":[""]}),
        json!({"name":"webhookSecret","args":["other","same-agent"]}),
    ]);
    assert_eq!(reference["events"], json!(reference_events));
}

#[tokio::test]
async fn duplicate_signature_and_target_headers() {
    let owner = json!({"userId":"owner","agentId":"a"});
    let (actual, reference) = observed_options(json!([
 {"wireDuplicate":true,"method":"POST","path":"/api/github/apps/webhook","raw":"{}","headers":{"content-type":"application/json","x-hub-signature-256":["sha256=77325902caca812dc259733aacd046b73817372c777b8d95b402647474516e13","wrong"]},"replies":{"findByAppId":owner,"webhookSecret":"secret"}},
 {"wireDuplicate":true,"method":"POST","path":"/api/github/apps/webhook","raw":"{}","headers":{"content-type":"application/json","x-github-hook-installation-target-type":["integration","repository"]}}
 ]),false,false).await;
    assert_eq!(
        reference["results"][0],
        json!({"status":401,"body":{"detail":"invalid_signature"},"location":null})
    );
    assert_eq!(
        reference["results"][1],
        json!({"status":202,"body":{"ignored":"not_an_app_delivery"},"location":null})
    );
    for i in 0..2 {
        assert_eq!(
            actual["results"][i],
            json!({"status":400,"body":{"detail":"ambiguous_headers"},"location":null})
        );
    }
    assert_eq!(
        reference["events"],
        json!([
            {"name":"findByAppId","args":[""]},
            {"name":"webhookSecret","args":["owner","a"]}
        ])
    );
    assert_eq!(actual["events"], json!([]));
}
