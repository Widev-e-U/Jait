#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db::{self, worker::DatabaseWorker},
    routes::{agent_github_apps::GithubAppRoutes, auth::AuthState},
    security::http_auth::{self, AuthUser},
    services::{
        agent_github_apps::{AgentGithubAppService, GithubEffect, GithubResponse},
        agent_github_port::{GithubHost, GithubOperation as Op, NativeGithubPort},
        user_secrets::UserSecretService,
    },
    tools::{agent_github::GithubTools, core_io::HostError},
};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    num::NonZeroU16,
    sync::{Arc, Mutex},
    time::Duration,
};
const NOW: i64 = 1_700_000_000_123;
const RSA_KEY: &str = include_str!("../fixtures/github-app/test-only-key.pem");
fn ok<T>(v: Result<T, HostError>) -> T {
    v.unwrap_or_else(|e| panic!("{}", error(e)))
}
fn error(e: HostError) -> String {
    match e {
        HostError::Error(v) => v,
        HostError::Thrown(v) => v.to_string(),
    }
}
fn worker() -> DatabaseWorker {
    let c = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&c).unwrap();
    DatabaseWorker::new(c, NonZeroU16::new(8).unwrap()).unwrap()
}
fn service() -> Arc<AgentGithubAppService> {
    Arc::new(AgentGithubAppService::new(
        Some(UserSecretService::with_clock(
            "github-storage-fixture",
            Arc::new(|| NOW),
        )),
        Some("state-fixture".into()),
        Arc::new(|| NOW),
    ))
}
fn host(effect: GithubEffect) -> GithubHost {
    GithubHost {
        effect,
        initialize: Arc::new(|| Box::pin(async { Ok(()) })),
        current_agent: Arc::new(|_, _| Box::pin(async { Ok(Value::Null) })),
    }
}
async fn composition(steps: Value, init_error: bool) {
    let (actual, expected) = observed_composition(steps, init_error, false).await;
    assert_eq!(actual, expected, "native/reference composition difference");
}
async fn observed_composition(steps: Value, init_error: bool, observe: bool) -> (Value, Value) {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let call = json!({"op":"nativegithubstore.run","mode":"composition","now":NOW,"secret":"state-fixture","observe":observe,"steps":steps,"initError":if init_error{json!("lifecycle unavailable")}else{Value::Null}});
    let expected = internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/agent-github-setup-journey/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    (
        native_composition(steps, init_error, observe).await,
        expected,
    )
}
async fn native_composition(steps: Value, init_error: bool, observe: bool) -> Value {
    let effects = Arc::new(Mutex::new(vec![]));
    let queue = Arc::new(Mutex::new(VecDeque::<Value>::new()));
    let (log, replies) = (effects.clone(), queue.clone());
    let effect: GithubEffect = Arc::new(move |r| {
        assert_eq!(r.user, "u");
        assert_eq!(r.agent, "a");
        assert!(!r.follow_redirects);
        assert_eq!(r.timeout, Duration::from_secs(15));
        assert_eq!(r.max_response_bytes, 1024 * 1024);
        log.lock()
            .unwrap()
            .push(json!({"url":r.url,"method":r.method,"headers":r.headers,"body":null}));
        let reply = replies
            .lock()
            .unwrap()
            .pop_front()
            .expect("unexpected outbound effect");
        Box::pin(async move {
            if let Some(e) = reply["error"].as_str() {
                Err(e.into())
            } else {
                Ok(GithubResponse {
                    status: reply["status"].as_u64().unwrap() as u16,
                    body: serde_json::to_vec(&reply["data"]).unwrap(),
                })
            }
        })
    });
    let lifecycle = Arc::new(Mutex::new(vec![]));
    let life = lifecycle.clone();
    let mut h = host(effect);
    h.initialize = Arc::new(move || {
        life.lock().unwrap().push(json!("initialize"));
        Box::pin(async move {
            if init_error {
                Err(HostError::Error("lifecycle unavailable".into()))
            } else {
                Ok(())
            }
        })
    });
    let life = lifecycle.clone();
    h.current_agent = Arc::new(move |u, t| {
        life.lock().unwrap().push(json!({"user":u,"thread":t}));
        Box::pin(async move {
            Ok(if u == "u" && t.as_deref() == Some("thread-a") {
                json!("a")
            } else {
                Value::Null
            })
        })
    });
    let worker = worker();
    let now = Arc::new(std::sync::atomic::AtomicI64::new(NOW));
    let clock = now.clone();
    let service = Arc::new(AgentGithubAppService::new(
        Some(UserSecretService::with_clock(
            "github-storage-fixture",
            Arc::new(|| NOW),
        )),
        Some("state-fixture".into()),
        Arc::new(move || clock.load(std::sync::atomic::Ordering::SeqCst)),
    ));
    let adapter = NativeGithubPort::new(
        service.clone(),
        worker.clone(),
        h,
        NonZeroU16::new(4).unwrap(),
    );
    let active = Arc::new(Mutex::new(Value::Null));
    let calls = Arc::new(Mutex::new(vec![]));
    let hook_counts = Arc::new(Mutex::new(std::collections::BTreeMap::<&str, usize>::new()));
    let route_adapter = adapter.clone();
    let (route_active, route_calls, counts) = (active.clone(), calls.clone(), hook_counts.clone());
    let route_service = service.clone();
    let route_worker = worker.clone();
    let port = Arc::new(move |op: Op| {
        let name = match &op {
            Op::PublicBaseUrl => "publicBaseUrl",
            Op::ReadState(_) => "readState",
            Op::Get(..) => "get",
            Op::CompleteSetup(..) => "completeSetup",
            Op::CompleteCallback(_) => "completeCallback",
            Op::AttachInstallation(..) => "attachInstallation",
            Op::FindByAppId(_) => "findByAppId",
            Op::FindByInstallationId(_) => "findByInstallationId",
            Op::WebhookSecret(..) => "webhookSecret",
            Op::BeginSetup { .. } => "beginSetup",
            Op::BeginInstallation(..) => "beginInstallation",
            Op::SaveManual { .. } => "saveManualApp",
            Op::Disconnect(..) => "disconnect",
            Op::List(_) => "list",
            _ => "other",
        };
        let adapter = route_adapter.clone();
        let service = route_service.clone();
        let worker = route_worker.clone();
        let step = route_active.lock().unwrap().clone();
        if observe {
            route_calls.lock().unwrap().push(name);
        }
        let n = {
            let mut counts = counts.lock().unwrap();
            let n = counts.entry(name).or_default();
            *n += 1;
            *n
        };
        Box::pin(async move {
            let result = adapter.call(op).await;
            let hook = &step["interleave"];
            if hook["operation"] == name && hook["nth"].as_u64().unwrap_or(1) == n as u64 {
                let action = hook["action"].as_str().unwrap().to_owned();
                let value = hook["value"].as_str().unwrap_or_default().to_owned();
                worker
                    .run(move |db| {
                        if action == "disconnect" {
                            service.disconnect(db, "u", "a")?;
                        } else if action == "rotate" {
                            save_webhook_secret(db, value)?;
                        }
                        Ok(())
                    })
                    .await
                    .map_err(|e| HostError::Error(e.to_string()))?;
            }
            result
        }) as futures_util::future::BoxFuture<'static, Result<Value, HostError>>
    });
    let webhooks = Arc::new(Mutex::new(vec![]));
    let (sink_events, sink_active) = (webhooks.clone(), active.clone());
    let auth_db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&auth_db).unwrap();
    auth_db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('u','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    let app = GithubAppRoutes {
        auth: AuthState::new(auth_db, "github-route-fixture".into()).unwrap(),
        port,
        agent_exists: Some(Arc::new(|u, a| u == "u" && a == "a")),
        on_webhook: Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
            let fail = sink_active.lock().unwrap()["sinkError"] == true;
            Box::pin(async move {
                if fail {
                    Err(HostError::Error("fixture sink failure".into()))
                } else {
                    Ok(())
                }
            })
        })),
    }
    .router();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
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
        .timeout(Duration::from_secs(5))
        .connect_timeout(Duration::from_secs(2))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let tools = GithubTools {
        port: adapter.port(),
        has_current_agent: true,
    };
    let mut results = vec![];
    let mut issued_states = Vec::<String>::new();
    for step in steps.as_array().unwrap() {
        *active.lock().unwrap() = step.clone();
        hook_counts.lock().unwrap().clear();
        *queue.lock().unwrap() = step["responses"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into();
        let result = match step["op"].as_str().unwrap() {
            "http" => {
                let method = step["method"].as_str().unwrap().parse().unwrap();
                let mut path = step["path"].as_str().unwrap().to_owned();
                for (i, token) in issued_states.iter().enumerate().rev() {
                    path = path.replace(&format!("$state{i}"), token);
                }
                assert!(!path.contains("$state"), "missing issued setup state");
                let mut r = client
                    .request(method, format!("{base}{path}"))
                    .header("host", "fixture.test");
                if let Some(user) = step["user"].as_str() {
                    r = r.bearer_auth(
                        http_auth::sign_auth_token(
                            &AuthUser {
                                id: user.into(),
                                username: "alice".into(),
                            },
                            "github-route-fixture",
                        )
                        .unwrap(),
                    );
                }
                if let Some(headers) = step["headers"].as_object() {
                    for (k, v) in headers {
                        if let Some(values) = v.as_array() {
                            for value in values {
                                r = r.header(k, value.as_str().unwrap());
                            }
                        } else {
                            r = r.header(k, v.as_str().unwrap());
                        }
                    }
                }
                if let Some(raw) = step["raw"].as_str() {
                    r = r.body(raw.to_owned());
                }
                if let Some(secret) = step["sign"].as_str() {
                    let raw = step["raw"]
                        .as_str()
                        .map(str::to_owned)
                        .unwrap_or_else(|| serde_json::to_string(&step["body"]).unwrap());
                    let signature = webhook_signature(secret, raw.as_bytes());
                    r = r.header("x-hub-signature-256", signature);
                }
                if step.get("body").is_some() {
                    r = r.json(&step["body"]);
                }
                let r = r.send().await.unwrap();
                let status = r.status().as_u16();
                let location = r
                    .headers()
                    .get("location")
                    .map(|v| v.to_str().unwrap().to_owned());
                let inspected_headers = json!({
                    "flow": r.headers().get("x-jait-github-installation-flow").map(|v| v.to_str().unwrap()),
                    "expose": r.headers().get("access-control-expose-headers").map(|v| v.to_str().unwrap()),
                    "cache": r.headers().get("cache-control").map(|v| v.to_str().unwrap()),
                });
                let text = r.text().await.unwrap();
                let mut body = serde_json::from_str::<Value>(&text).unwrap_or(json!(text));
                if step["captureState"] == true {
                    let token = body["state"].as_str().expect("setup state").to_owned();
                    let url_field = if body.get("installUrl").is_some() {
                        "installUrl"
                    } else {
                        "postUrl"
                    };
                    let url = body[url_field].as_str().unwrap().to_owned();
                    let parsed_url = reqwest::Url::parse(&url).unwrap();
                    assert_eq!(parsed_url.scheme(), "https");
                    assert_eq!(parsed_url.host_str(), Some("github.com"));
                    assert_eq!(
                        parsed_url
                            .query_pairs()
                            .find(|(k, _)| k == "state")
                            .unwrap()
                            .1,
                        token
                    );
                    let parsed = service.read_state(&token);
                    assert_eq!(parsed, json!({"userId":"u","agentId":"a"}));
                    body[url_field] = json!(url.replace(&token, "<state>"));
                    body["state"] = parsed;
                    assert!(!issued_states.contains(&token), "setup nonce reused");
                    issued_states.push(token);
                }
                let mut result = json!({"status":status,"body":body,"location":location});
                if step["inspectHeaders"] == true {
                    result["headers"] = inspected_headers;
                }
                Ok(result)
            }
            "maintenance" => {
                let cleanup = ok(adapter.start_expiry_cleanup(Duration::from_secs(60), 256));
                // First interval tick is immediate; the queued barrier below
                // ensures the completed SQL precedes the subsequent HTTP call.
                tokio::time::timeout(Duration::from_secs(3), async {
                    loop {
                        let revoked = worker.run(|db| {
                            Ok(db.query_row("SELECT count(*) FROM native_github_setup_challenges WHERE phase='revoked'", [], |r| r.get::<_, i64>(0))?)
                        }).await.unwrap();
                        if revoked > 0 { break }
                        tokio::task::yield_now().await;
                    }
                }).await.unwrap();
                ok(cleanup.shutdown().await);
                Ok(Value::Null)
            }
            "advance" => {
                now.fetch_add(
                    step["ms"].as_i64().unwrap(),
                    std::sync::atomic::Ordering::SeqCst,
                );
                Ok(Value::Null)
            }
            "challengeStorage" => {
                let states = issued_states.clone();
                worker.run(move |db| {
                    let (phase, generation, a, b): (String, i64, Option<String>, Option<String>) = db.query_row("SELECT phase,generation,manifest_result,installation_result FROM native_github_setup_challenges WHERE user_id='u' AND agent_id='a'", [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?;
                    for replay in [a,b].into_iter().flatten() {
                        assert!(!replay.contains("installUrl"));
                        for state in &states { assert!(!replay.contains(state), "signed state persisted in replay"); }
                    }
                    Ok(json!({"phase":phase,"generation":generation}))
                }).await.map_err(|e|HostError::Error(e.to_string()))
            }
            "issuedChallenge" => {
                let states = issued_states.clone();
                worker.run(move |db| {
                    use rusqlite::OptionalExtension;
                    let row: Option<String> = db.query_row("SELECT data FROM agent_github_apps WHERE user_id='u' AND agent_id='a'", [], |r|r.get(0)).optional()?;
                    let data = row.as_ref().map(|r|serde_json::from_str::<Value>(r)).transpose()?;
                    let state = data.as_ref().and_then(|d|d["manifestState"].as_str());
                    let index = state.map(|s|states.iter().position(|v|v==s).map(|i|i as i64).unwrap_or(-1));
                    Ok(json!({"row":row.is_some(),"active":state.is_some_and(|v|!v.is_empty()),"index":index}))
                }).await.map_err(|e|HostError::Error(e.to_string()))
            }
            "tool" => {
                tools
                    .execute(
                        step["token"] == true,
                        &step["input"],
                        step["user"].as_str(),
                        step["thread"].as_str(),
                    )
                    .await
            }
            "get" => {
                adapter
                    .call(Op::Get(
                        step["user"].as_str().unwrap().into(),
                        step["agent"].as_str().unwrap().into(),
                    ))
                    .await
            }
            "secret" => {
                let value = step["value"].as_str().unwrap().to_owned();
                worker
                    .run(move |db| {
                        save_webhook_secret(db, value)?;
                        Ok(Value::Null)
                    })
                    .await
                    .map_err(|e| HostError::Error(e.to_string()))
            }
            "sql" => {
                let sql = step["sql"].as_str().unwrap().to_owned();
                worker
                    .run(move |db| {
                        db.execute_batch(&sql)?;
                        Ok(Value::Null)
                    })
                    .await
                    .map_err(|e| HostError::Error(e.to_string()))
            }
            "env" => {
                adapter
                    .call(Op::ResolveEnv(
                        step["user"].as_str().unwrap().into(),
                        step["agent"].as_str().unwrap().into(),
                    ))
                    .await
            }
            _ => panic!("unknown composition step"),
        };
        results.push(result.unwrap_or_else(|e| json!({"error":error(e)})));
        assert!(queue.lock().unwrap().is_empty(), "unused outbound fixtures");
    }
    send.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(5), server)
        .await
        .unwrap()
        .unwrap();
    worker.shutdown().await.unwrap();
    let actual = json!({"results":results,"effects":*effects.lock().unwrap(),"lifecycle":*lifecycle.lock().unwrap(),"webhooks":*webhooks.lock().unwrap()});
    let mut actual = actual;
    if observe {
        actual["portCalls"] = json!(*calls.lock().unwrap());
    }
    actual
}
#[tokio::test]
async fn real_http_tool_and_environment_share_store_cache_and_host_authority() {
    composition(json!([
        {"op":"http","method":"GET","path":"/api/github-apps"},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/manual","user":"other","body":{"appId":"123","privateKey":RSA_KEY}},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/manual","user":"u","body":{"appId":"123","privateKey":RSA_KEY,"appSlug":"fixture"}},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation","user":"u","body":{"installationId":"99"},"responses":[{"status":200,"data":{"id":99,"account":{"login":"fixture"}}}]},
        {"op":"tool","user":"u","thread":"thread-a","input":{"action":"test"},"responses":[{"status":201,"data":{"token":"fixture-token","expires_at":"2023-11-14T23:13:20.123Z"}},{"status":200,"data":{"total_count":1,"repositories":[{"full_name":"fixture/repo"}]}}]},
        {"op":"env","user":"u","agent":"a"},
        {"op":"tool","user":"u","thread":"thread-a","token":true,"input":{}},
        {"op":"http","method":"GET","path":"/api/agents/a/github-app","user":"u"},
        {"op":"http","method":"DELETE","path":"/api/agents/a/github-app","user":"u"},
        {"op":"env","user":"u","agent":"a"}
    ]),false).await;
}
#[tokio::test]
async fn initialize_is_real_host_lifecycle_and_errors_stop_tool_effects() {
    composition(json!([{"op":"tool","user":"u","thread":"thread-a","input":{"action":"status"}},{"op":"tool","token":true,"user":"u","thread":"thread-a","input":{}}]),true).await;
}

async fn rejected(adapter: &NativeGithubPort, op: Op, expected: &str) {
    let result = adapter.call(op).await;
    assert!(result.is_err(), "operation unexpectedly admitted");
    assert_eq!(error(result.err().unwrap()), expected);
}
#[tokio::test]
async fn owner_admission_bounds_effects_allows_independent_progress_and_cleans_on_drop() {
    let worker = worker();
    let s = service();
    let started = Arc::new(tokio::sync::Notify::new());
    let live = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    struct InFlight(Arc<std::sync::atomic::AtomicUsize>);
    impl Drop for InFlight {
        fn drop(&mut self) {
            self.0.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        }
    }
    let (signal, count) = (started.clone(), live.clone());
    let effect: GithubEffect = Arc::new(move |_| {
        let (signal, count) = (signal.clone(), count.clone());
        Box::pin(async move {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let _active = InFlight(count);
            signal.notify_one();
            std::future::pending().await
        })
    });
    let adapter =
        NativeGithubPort::new(s, worker.clone(), host(effect), NonZeroU16::new(2).unwrap());
    let port = adapter.port();
    let first = tokio::spawn(async move {
        port(Op::CompleteSetup("u".into(), "a".into(), json!("code"))).await
    });
    tokio::time::timeout(Duration::from_secs(5), started.notified())
        .await
        .unwrap();
    rejected(
        &adapter,
        Op::Disconnect("u".into(), "a".into()),
        "GitHub agent operation is busy",
    )
    .await;
    rejected(
        &adapter,
        Op::BeginInstallation("u".into(), "a".into()),
        "GitHub agent operation is busy",
    )
    .await;
    // Same agent id under another user remains independent.
    assert!(ok(adapter.call(Op::Get("other".into(), "a".into())).await).is_null());
    assert_eq!(
        worker
            .run(|db| Ok(db.query_row("SELECT 41+1", [], |r| r.get::<_, i64>(0))?))
            .await
            .unwrap(),
        42
    );
    let port = adapter.port();
    let second = tokio::spawn(async move {
        port(Op::CompleteSetup("other".into(), "a".into(), json!("code"))).await
    });
    tokio::time::timeout(Duration::from_secs(5), started.notified())
        .await
        .unwrap();
    rejected(
        &adapter,
        Op::Get("third".into(), "a".into()),
        "GitHub operation capacity unavailable",
    )
    .await;
    assert_eq!(live.load(std::sync::atomic::Ordering::SeqCst), 2);
    first.abort();
    let _ = first.await;
    assert_eq!(live.load(std::sync::atomic::Ordering::SeqCst), 1);
    // Cancelled setup did not commit credential data; its owner can retry.
    assert!(ok(adapter.call(Op::Get("u".into(), "a".into())).await).is_null());
    second.abort();
    let _ = second.await;
    assert_eq!(live.load(std::sync::atomic::Ordering::SeqCst), 0);
    ok(adapter.call(Op::Disconnect("u".into(), "a".into())).await);
    adapter.close();
    rejected(
        &adapter,
        Op::Get("u".into(), "a".into()),
        "GitHub operation capacity unavailable",
    )
    .await;
    worker.shutdown().await.unwrap();
}
#[tokio::test]
async fn cancelled_queued_operation_retains_admission_until_database_drains() {
    let worker = worker();
    let effect: GithubEffect = Arc::new(|_| panic!("unexpected network"));
    let adapter = NativeGithubPort::new(
        service(),
        worker.clone(),
        host(effect),
        NonZeroU16::new(2).unwrap(),
    );
    let (entered, started) = tokio::sync::oneshot::channel();
    let (release, wait) = std::sync::mpsc::channel();
    let db = worker.clone();
    let blocker = tokio::spawn(async move {
        db.run(move |_| {
            entered.send(()).unwrap();
            wait.recv_timeout(Duration::from_secs(5)).unwrap();
            Ok(())
        })
        .await
    });
    tokio::time::timeout(Duration::from_secs(5), started)
        .await
        .unwrap()
        .unwrap();
    // Poll once: admission succeeds and the SQL job enters the blocked mailbox.
    let mut op = Box::pin(adapter.call(Op::BeginSetup {
        user: "u".into(),
        agent: "a".into(),
        options: json!({"appName":"cancelled"}),
    }));
    assert!(futures_util::poll!(&mut op).is_pending());
    drop(op);
    rejected(
        &adapter,
        Op::Disconnect("u".into(), "a".into()),
        "GitHub agent operation is busy",
    )
    .await;
    release.send(()).unwrap();
    blocker.await.unwrap().unwrap();
    // A FIFO SQL fence proves the skipped queued job released its lease.
    worker.run(|_| Ok(())).await.unwrap();
    assert!(ok(adapter.call(Op::Get("u".into(), "a".into())).await).is_null());
    worker.shutdown().await.unwrap();
}

#[tokio::test]
async fn environment_composition_preserves_sparse_null_empty_and_explicit_bot_metadata() {
    for expression in [
        "json_remove(data,'$.appSlug','$.botLogin')",
        "json_set(data,'$.appSlug',NULL,'$.botLogin',NULL)",
        "json_set(data,'$.appSlug','','$.botLogin','')",
        "json_set(data,'$.appSlug','fixture','$.botLogin','explicit[bot]')",
    ] {
        composition(json!([
            {"op":"http","method":"POST","path":"/api/agents/a/github-app/manual","user":"u","body":{"appId":"123","privateKey":RSA_KEY}},
            {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation","user":"u","body":{"installationId":"99"},"responses":[{"status":200,"data":{"id":99}}]},
            {"op":"sql","sql":format!("UPDATE agent_github_apps SET data={expression} WHERE user_id='u' AND agent_id='a'")},
            {"op":"env","user":"u","agent":"a","responses":[{"status":201,"data":{"token":"fixture-token","expires_at":"2023-11-14T23:13:20.123Z"}}]},
            {"op":"tool","token":true,"input":{"agentId":"a"},"user":"u"}
        ]),false).await;
    }
}

#[tokio::test]
async fn payload_rejection_flows_through_canonical_port_and_shared_environment_cache() {
    let worker = worker();
    let replies = Arc::new(Mutex::new(VecDeque::from(vec![
        json!({"id":42,"app_id":123}),
        json!({"token":7}),
        json!({"token":"ghs_first"}),
        json!({"total_count":1,"repositories":[null]}),
        json!({"token":"ghs_recovered"}),
    ])));
    let effects = Arc::new(Mutex::new(vec![]));
    let (queue, record) = (replies.clone(), effects.clone());
    let effect: GithubEffect = Arc::new(move |r| {
        record.lock().unwrap().push((r.url, r.headers));
        let data = queue
            .lock()
            .unwrap()
            .pop_front()
            .expect("unexpected effect");
        Box::pin(async move {
            Ok(GithubResponse {
                status: 200,
                body: serde_json::to_vec(&data).unwrap(),
            })
        })
    });
    let adapter = NativeGithubPort::new(
        service(),
        worker.clone(),
        host(effect),
        NonZeroU16::new(2).unwrap(),
    );
    ok(adapter
        .call(Op::SaveManual {
            user: "u".into(),
            agent: "a".into(),
            options: json!({"appId":"123","privateKey":RSA_KEY,"appSlug":"robot"}),
        })
        .await);
    ok(adapter
        .call(Op::AttachInstallation("u".into(), "a".into(), json!("42")))
        .await);
    assert_eq!(
        error(
            adapter
                .call(Op::Test("u".into(), "a".into()))
                .await
                .unwrap_err()
        ),
        "GitHub returned an invalid installation token payload."
    );
    assert_eq!(
        effects.lock().unwrap().len(),
        2,
        "rejected token cannot reach repository effect"
    );
    assert_eq!(
        ok(adapter.call(Op::ResolveEnv("u".into(), "a".into())).await)["GH_TOKEN"],
        "ghs_first"
    );
    assert_eq!(
        error(
            adapter
                .call(Op::Test("u".into(), "a".into()))
                .await
                .unwrap_err()
        ),
        "GitHub returned an invalid repository payload."
    );
    assert_eq!(
        ok(adapter.call(Op::ResolveEnv("u".into(), "a".into())).await)["GH_TOKEN"],
        "ghs_recovered"
    );
    assert_eq!(
        ok(adapter.call(Op::ResolveEnv("u".into(), "a".into())).await)["GH_TOKEN"],
        "ghs_recovered"
    );
    assert!(replies.lock().unwrap().is_empty());
    let recorded = effects.lock().unwrap();
    assert_eq!(recorded.len(), 5);
    assert!(
        recorded[3]
            .1
            .iter()
            .any(|(k, v)| k == "authorization" && v == "Bearer ghs_first")
    );
    assert!(
        !recorded
            .iter()
            .any(|(_, h)| h.iter().any(|(_, v)| v == "Bearer 7"))
    );
    drop(recorded);
    adapter.close();
    worker.shutdown().await.unwrap();
}

fn save_webhook_secret(
    db: &rusqlite::Connection,
    value: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use jait_gateway::services::user_secrets::SaveSecretParams;
    UserSecretService::with_clock("github-storage-fixture", Arc::new(|| NOW)).save(
        db,
        SaveSecretParams {
            user_id: Some("u".into()),
            r#type: "github-app".into(),
            key: "agent:a:webhook".into(),
            label: "fixture".into(),
            value,
        },
    )?;
    Ok(())
}
fn hmac_bytes(secret: &str, raw: &[u8]) -> Vec<u8> {
    use hmac::{Hmac, Mac};
    let mut mac = Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(raw);
    mac.finalize().into_bytes().to_vec()
}
fn webhook_signature(secret: &str, raw: &[u8]) -> String {
    format!("sha256={}", hex::encode(hmac_bytes(secret, raw)))
}
fn callback_state() -> String {
    use base64::Engine;
    let encoder = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let body = encoder.encode(br#"{"userId":"u","agentId":"a","nonce":"fixture","exp":1}"#);
    let signed = encoder.encode(hmac_bytes("state-fixture", body.as_bytes()));
    format!("{body}.{signed}")
}
fn manual_step() -> Value {
    json!({"op":"http","method":"POST","path":"/api/agents/a/github-app/manual","user":"u","body":{"appId":"123","privateKey":RSA_KEY,"webhookSecret":"fixture-webhook"}})
}
fn callback_step(suffix: &str) -> Value {
    json!({"op":"http","method":"GET","path":format!("/api/github/apps/callback?state={}{suffix}",callback_state())})
}
#[tokio::test]
async fn legacy_signed_state_has_no_authority_but_reference_replays_effects() {
    let mut first = callback_step("&installation_id=99");
    first["referenceResponses"] = json!([setup_installation()]);
    let (actual, reference) = observed_composition(
        json!([manual_step(),first.clone(),first,{"op":"get","user":"u","agent":"a"}]),
        false,
        true,
    )
    .await;
    assert_eq!(actual["effects"], json!([]));
    assert_eq!(reference["effects"].as_array().unwrap().len(), 2);
    for i in [1, 2] {
        assert_callback_error(&actual["results"][i]);
        assert_redirect(&reference["results"][i], "connected");
    }
    assert!(actual["results"][3]["installationId"].is_null());
    assert_eq!(
        actual["portCalls"],
        json!([
            "saveManualApp",
            "publicBaseUrl",
            "readState",
            "completeCallback",
            "publicBaseUrl",
            "readState",
            "completeCallback"
        ])
    );
}
#[tokio::test]
async fn callback_invalid_and_missing_inputs_stop_before_effects_in_actual_service() {
    let steps = json!([
        {"op":"http","method":"GET","path":"/api/github/apps/callback?state=bad&code=unused"},
        {"op":"http","method":"GET","path":format!("/api/github/apps/callback?state={}x&code=unused",callback_state())},
        callback_step(""),callback_step("&code=&installation_id=")
    ]);
    let (actual, expected) = observed_composition(steps, false, true).await;
    assert_eq!(actual, expected);
    assert_eq!(actual["effects"], json!([]));
    assert_eq!(
        actual["portCalls"],
        json!([
            "publicBaseUrl",
            "readState",
            "publicBaseUrl",
            "readState",
            "publicBaseUrl",
            "readState",
            "publicBaseUrl",
            "readState"
        ])
    );
}
#[tokio::test]
async fn callback_uses_compound_authority_without_legacy_get_interleave() {
    let mut cb = issued_callback(0, "&installation_id=99", json!([setup_installation()]));
    cb["referenceResponses"] = json!([]);
    cb["interleave"] = json!({"operation":"get","action":"disconnect"});
    let (actual, reference) = observed_composition(
        json!([
            manual_step(), setup_start(), cb, {"op":"get","user":"u","agent":"a"}
        ]),
        false,
        true,
    )
    .await;
    assert_redirect(&actual["results"][2], "connected");
    assert_callback_error(&reference["results"][2]);
    assert_eq!(actual["results"][3]["installationId"], "99");
    assert!(reference["results"][3].is_null());
    assert_eq!(actual["effects"].as_array().unwrap().len(), 1);
    assert_eq!(reference["effects"], json!([]));
    assert_eq!(
        actual["portCalls"],
        json!([
            "saveManualApp",
            "beginSetup",
            "publicBaseUrl",
            "readState",
            "completeCallback"
        ])
    );
}
fn webhook_step(raw: &str) -> Value {
    json!({"op":"http","method":"POST","path":"/api/github/apps/webhook","raw":raw,"sign":"fixture-webhook","headers":{"content-type":"application/json","x-github-hook-installation-target-id":"123","x-github-event":"push","x-github-delivery":"fixture-delivery"}})
}
#[tokio::test]
async fn webhook_real_owner_secret_raw_bytes_and_sink_failures_compose() {
    let valid = webhook_step(r#"{ "installation": {"id": 99}, "text": "é" }"#);
    let mut invalid = valid.clone();
    invalid["sign"] = json!("wrong-secret");
    let mut sink = valid.clone();
    sink["sinkError"] = json!(true);
    let (actual, expected) = observed_composition(
        json!([manual_step(), secret_step(), valid, invalid, sink]),
        false,
        true,
    )
    .await;
    assert_eq!(actual, expected);
    assert_eq!(actual["webhooks"].as_array().unwrap().len(), 2);
    assert_eq!(actual["results"][2]["status"], 200);
    assert_eq!(actual["results"][3]["status"], 401);
    assert_eq!(actual["results"][4]["status"], 200);
    assert_eq!(
        actual["portCalls"],
        json!([
            "saveManualApp",
            "findByAppId",
            "webhookSecret",
            "findByAppId",
            "webhookSecret",
            "findByAppId",
            "webhookSecret"
        ])
    );
}
#[tokio::test]
async fn webhook_disconnect_and_secret_rotation_between_lookups_are_observed() {
    let mut rotate = webhook_step(r#"{"installation":{"id":99}}"#);
    rotate["interleave"] =
        json!({"operation":"findByAppId","action":"rotate","value":"new-secret"});
    let mut fresh = rotate.clone();
    fresh.as_object_mut().unwrap().remove("interleave");
    fresh["sign"] = json!("new-secret");
    let mut removed = fresh.clone();
    removed["interleave"] = json!({"operation":"findByAppId","action":"disconnect"});
    let (actual, expected) =
        observed_composition(json!([manual_step(), rotate, fresh, removed]), false, true).await;
    assert_eq!(actual, expected);
    assert_eq!(actual["results"][1]["status"], 401);
    assert_eq!(actual["results"][2]["status"], 200);
    assert_eq!(actual["results"][3]["status"], 202);
    assert_eq!(actual["webhooks"].as_array().unwrap().len(), 1);
}

fn secret_step() -> Value {
    json!({"op":"secret","user":"u","key":"agent:a:webhook","value":"fixture-webhook"})
}
fn conversion_reply() -> Value {
    json!({"status":201,"data":{"id":123,"slug":"fixture","name":"Fixture","pem":RSA_KEY,"webhook_secret":"fixture-webhook","client_id":"client"}})
}
#[tokio::test]
async fn legacy_callback_conversion_is_denied_without_challenge_before_effects() {
    let mut cb = callback_step("&code=fixture-code&installation_id=99");
    cb["referenceResponses"] = json!([conversion_reply(), setup_installation()]);
    let (actual, reference) =
        observed_composition(json!([cb,{"op":"get","user":"u","agent":"a"}]), false, true).await;
    assert_callback_error(&actual["results"][0]);
    assert_redirect(&reference["results"][0], "connected");
    assert!(actual["results"][1].is_null());
    assert_eq!(actual["effects"], json!([]));
    assert_eq!(reference["effects"].as_array().unwrap().len(), 2);
    assert_eq!(
        actual["portCalls"],
        json!(["publicBaseUrl", "readState", "completeCallback"])
    );
}
#[tokio::test]
async fn callback_repeated_queries_have_explicit_native_rejections_without_effects() {
    let repeated_state = json!({"op":"http","method":"GET","path":format!("/api/github/apps/callback?state={}&state=other&code=x",callback_state())});
    let mut code = callback_step("&code=x&code=y");
    code["referenceResponses"] = json!([{"status":400,"data":{"message":"fixture code rejected"}}]);
    let (actual, expected) = observed_composition(
        json!([
            repeated_state,
            code,
            callback_step("&installation_id=99&installation_id=100")
        ]),
        false,
        true,
    )
    .await;
    assert_eq!(actual["effects"], json!([]));
    assert_eq!(expected["effects"].as_array().unwrap().len(), 1);
    assert_eq!(
        expected["effects"][0]["url"],
        "https://api.github.com/app-manifests/x%2Cy/conversions"
    );
    assert_eq!(actual["results"][0]["status"], 302);
    assert_eq!(expected["results"][0]["status"], 500);
    assert!(
        actual["results"][0]["location"]
            .as_str()
            .unwrap()
            .ends_with("reason=invalid_state")
    );
    for (i, reason) in [
        (1, "Invalid%20GitHub%20setup%20callback"),
        (2, "Invalid%20GitHub%20setup%20callback"),
    ] {
        assert_eq!(actual["results"][i]["status"], 302);
        assert_eq!(expected["results"][i]["status"], 302);
        assert!(
            actual["results"][i]["location"]
                .as_str()
                .unwrap()
                .ends_with(reason)
        );
    }
    assert!(
        expected["results"][1]["location"]
            .as_str()
            .unwrap()
            .ends_with("fixture%20code%20rejected")
    );
    assert!(
        expected["results"][2]["location"]
            .as_str()
            .unwrap()
            .contains("registration%20is%20incomplete")
    );
    assert_eq!(
        actual["portCalls"],
        json!([
            "publicBaseUrl",
            "publicBaseUrl",
            "readState",
            "publicBaseUrl",
            "readState"
        ])
    );
}
#[tokio::test]
async fn webhook_app_owner_precedes_installation_fallback_and_rejection_order_is_real() {
    let copy = json!({"op":"sql","sql":"INSERT INTO agent_github_apps(id,user_id,agent_id,status,data,updated_at) SELECT 'conflict','other','b',status,json_set(data,'$.agentId','b','$.appId','999','$.installationId','99'),updated_at FROM agent_github_apps WHERE user_id='u' AND agent_id='a'"});
    let valid = webhook_step(r#"{"installation":{"id":99}}"#);
    let mut fallback = valid.clone();
    fallback["headers"]["x-github-hook-installation-target-id"] = json!("missing");
    let mut unknown = fallback.clone();
    unknown["raw"] = json!("{}");
    let mut malformed = valid.clone();
    malformed["raw"] = json!("{");
    let mut ignored = malformed.clone();
    ignored["headers"]["x-github-hook-installation-target-type"] = json!("repository");
    let (actual, expected) = observed_composition(
        json!([
            manual_step(),
            secret_step(),
            copy,
            valid,
            fallback,
            unknown,
            malformed,
            ignored
        ]),
        false,
        true,
    )
    .await;
    assert_eq!(actual, expected);
    assert_eq!(actual["webhooks"].as_array().unwrap().len(), 1);
    assert_eq!(actual["webhooks"][0]["userId"], "u");
    assert_eq!(actual["webhooks"][0]["agentId"], "a");
    for (i, status) in [(3, 200), (4, 202), (5, 404), (6, 400), (7, 202)] {
        assert_eq!(actual["results"][i]["status"], status);
    }
    assert_eq!(
        actual["portCalls"],
        json!([
            "saveManualApp",
            "findByAppId",
            "webhookSecret",
            "findByAppId",
            "findByInstallationId",
            "webhookSecret",
            "findByAppId",
            "findByInstallationId"
        ])
    );
}
#[tokio::test]
async fn webhook_secret_read_does_not_make_later_sink_atomic() {
    let mut rotate = webhook_step(r#"{"installation":{"id":99}}"#);
    rotate["interleave"] =
        json!({"operation":"webhookSecret","action":"rotate","value":"new-secret"});
    let stale = webhook_step(r#"{"installation":{"id":99}}"#);
    let (actual, expected) = observed_composition(
        json!([manual_step(), secret_step(), rotate, stale]),
        false,
        true,
    )
    .await;
    assert_eq!(actual, expected);
    assert_eq!(actual["results"][2]["status"], 200);
    assert_eq!(actual["results"][3]["status"], 401);
    assert_eq!(actual["webhooks"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn completed_operations_allow_immediate_same_owner_followup() {
    let worker = worker();
    let effect: GithubEffect =
        Arc::new(|_| panic!("no outbound request authorized by this fixture"));
    let adapter = NativeGithubPort::new(
        service(),
        worker.clone(),
        host(effect),
        NonZeroU16::new(1).unwrap(),
    );
    for _ in 0..128 {
        assert!(ok(adapter.call(Op::Get("u".into(), "a".into())).await).is_null());
    }
    worker.shutdown().await.unwrap();
}

// These are explicit admission differences. The actual reference is observed
// alongside the candidate; valid object deliveries retain the existing route.
#[tokio::test]
async fn webhook_non_object_json_stops_before_owner_secret_and_sink() {
    let inputs = [
        "null",
        "true",
        "false",
        "0",
        "1",
        "\"fixture\"",
        "[]",
        "[{\"installation\":{\"id\":99}}]",
    ];
    let mut steps = vec![manual_step(), secret_step()];
    steps.extend(inputs.iter().map(|raw| webhook_step(raw)));
    let (actual, reference) = observed_composition(json!(steps), false, true).await;
    assert_eq!(reference["results"][2]["status"], 500);
    for i in 3..steps.len() {
        assert_eq!(
            reference["results"][i]["status"],
            200,
            "reference shape {}",
            inputs[i - 2]
        );
    }
    assert_eq!(
        reference["webhooks"].as_array().unwrap().len(),
        inputs.len() - 1
    );
    for i in 2..steps.len() {
        assert_eq!(
            actual["results"][i],
            json!({"status":400,"body":{"detail":"invalid_payload"},"location":null}),
            "native shape {}",
            inputs[i - 2]
        );
    }
    assert_eq!(actual["portCalls"], json!(["saveManualApp"]));
    assert_eq!(actual["webhooks"], json!([]));
    assert_eq!(actual["effects"], json!([]));
}
#[tokio::test]
async fn webhook_repeated_headers_stop_before_owner_secret_and_sink() {
    let raw = r#"{"installation":{"id":99}}"#;
    let sig = webhook_signature("fixture-webhook", raw.as_bytes());
    let duplicates = [
        (
            "x-github-hook-installation-target-type",
            json!(["integration", "integration"]),
        ),
        (
            "x-github-hook-installation-target-id",
            json!(["123", "123"]),
        ),
        ("x-hub-signature-256", json!([sig.clone(), sig])),
        ("x-github-event", json!(["ping", "push"])),
        ("x-github-delivery", json!(["first", "second"])),
    ];
    let mut steps = vec![manual_step(), secret_step()];
    for (name, values) in &duplicates {
        let mut step = webhook_step(raw);
        step["wire"] = json!(true);
        step["headers"][name] = values.clone();
        // The explicit signature values, rather than the helper, go on the wire.
        if *name == "x-hub-signature-256" {
            step.as_object_mut().unwrap().remove("sign");
        }
        steps.push(step);
    }
    let (actual, reference) = observed_composition(json!(steps), false, true).await;
    assert_eq!(reference["results"][2]["status"], 202);
    assert_eq!(reference["results"][3]["status"], 404);
    assert_eq!(reference["results"][4]["status"], 401);
    assert_eq!(reference["results"][5]["status"], 200);
    assert_eq!(reference["results"][6]["status"], 200);
    assert_eq!(reference["webhooks"][0]["event"], "ping, push");
    assert_eq!(reference["webhooks"][1]["deliveryId"], "first, second");
    for (i, (name, _)) in duplicates.iter().enumerate() {
        assert_eq!(
            actual["results"][i + 2],
            json!({"status":400,"body":{"detail":"ambiguous_headers"},"location":null}),
            "repeated {name}"
        );
    }
    assert_eq!(actual["portCalls"], json!(["saveManualApp"]));
    assert_eq!(actual["webhooks"], json!([]));
    assert_eq!(actual["effects"], json!([]));
}
#[tokio::test]
async fn webhook_single_headers_and_object_payloads_keep_real_client_contracts() {
    for raw in [
        "{}",
        "{\"installation\":null}",
        "{\"installation\":99}",
        "{\"installation\":[99]}",
        "{\"installation\":{\"id\":99}}",
    ] {
        let mut step = webhook_step(raw);
        step["wire"] = json!(true);
        let (actual, reference) =
            observed_composition(json!([manual_step(), secret_step(), step]), false, true).await;
        assert_eq!(actual, reference, "valid object {raw}");
        assert_eq!(actual["results"][2]["status"], 200);
        assert_eq!(actual["webhooks"].as_array().unwrap().len(), 1);
        assert_eq!(
            actual["portCalls"],
            json!(["saveManualApp", "findByAppId", "webhookSecret"])
        );
    }
}

#[tokio::test]
async fn webhook_coalesced_headers_stop_before_owner_secret_and_sink() {
    let values = [
        (
            "x-github-hook-installation-target-type",
            "integration, integration",
        ),
        ("x-github-hook-installation-target-id", "123, 123"),
        ("x-hub-signature-256", "sha256=a, sha256=b"),
        ("x-github-event", "ping, push"),
        ("x-github-delivery", "first, second"),
    ];
    let mut steps = vec![manual_step(), secret_step()];
    for (name, value) in &values {
        let mut step = webhook_step("{}");
        step["wire"] = json!(true);
        step["headers"][name] = json!(value);
        if *name == "x-hub-signature-256" {
            step.as_object_mut().unwrap().remove("sign");
        }
        steps.push(step);
    }
    let (actual, reference) = observed_composition(json!(steps), false, true).await;
    for (i, (name, _)) in values.iter().enumerate() {
        assert_eq!(
            actual["results"][i + 2],
            json!({"status":400,"body":{"detail":"ambiguous_headers"},"location":null}),
            "coalesced {name}"
        );
    }
    assert_eq!(reference["results"][2]["status"], 202);
    assert_eq!(reference["results"][3]["status"], 404);
    assert_eq!(reference["results"][4]["status"], 401);
    assert_eq!(reference["webhooks"][0]["event"], "ping, push");
    assert_eq!(reference["webhooks"][1]["deliveryId"], "first, second");
    assert_eq!(actual["portCalls"], json!(["saveManualApp"]));
    assert_eq!(actual["webhooks"], json!([]));
}

// Valid setup clients use fresh state issued over HTTP, not a forged HMAC fixture.
fn setup_start() -> Value {
    json!({"op":"http","method":"POST","path":"/api/agents/a/github-app/setup","user":"u","captureState":true,"body":{"appName":"Journey","organization":"fixture-org"},"wire":true})
}
fn setup_conversion() -> Value {
    json!({"status":200,"data":{"id":123,"slug":"journey","name":"Journey","pem":RSA_KEY,"webhook_secret":"fixture-webhook"}})
}
fn setup_installation() -> Value {
    json!({"status":200,"data":{"id":99,"account":{"login":"fixture"},"repository_selection":"selected","permissions":{"contents":"write"}}})
}
fn issued_callback(index: usize, suffix: &str, responses: Value) -> Value {
    json!({"op":"http","method":"GET","path":format!("/api/github/apps/callback?state=$state{index}{suffix}"),"responses":responses,"wire":true})
}
fn challenge_snapshot() -> Value {
    json!({"op":"issuedChallenge"})
}
fn assert_public_equal(actual: &Value, reference: &Value) {
    let (mut actual, mut reference) = (actual.clone(), reference.clone());
    actual.as_object_mut().unwrap().remove("portCalls");
    reference.as_object_mut().unwrap().remove("portCalls");
    assert_eq!(actual, reference);
}
fn assert_callback_error(result: &Value) {
    assert_eq!(result["status"], 302);
    assert!(
        result["location"]
            .as_str()
            .unwrap()
            .contains("github=error")
    );
}
fn rejected_issued_callback(index: usize, suffix: &str, reference_responses: Value) -> Value {
    dual_issued_callback(index, suffix, json!([]), reference_responses)
}
fn dual_issued_callback(
    index: usize,
    suffix: &str,
    native: Value,
    reference_responses: Value,
) -> Value {
    let mut step = issued_callback(index, suffix, native);
    step["referenceResponses"] = reference_responses;
    step
}
fn assert_redirect(result: &Value, status: &str) {
    assert_eq!(result["status"], 302);
    assert_eq!(
        result["location"],
        format!("http://localhost:8787/agents?github={status}&agentId=a")
    );
}
#[tokio::test]
async fn issued_setup_state_survives_real_two_stage_conversion_and_installation() {
    let (actual,reference)=observed_composition(json!([
        setup_start(),challenge_snapshot(),
        issued_callback(0,"&code=manifest-code",json!([setup_conversion()])),challenge_snapshot(),
        issued_callback(0,"&installation_id=99",json!([setup_installation()])),
        {"op":"get","user":"u","agent":"a"}
    ]),false,true).await;
    assert_public_equal(&actual, &reference);
    let results = &actual["results"];
    assert_eq!(
        results[0]["body"]["state"],
        json!({"userId":"u","agentId":"a"})
    );
    assert_eq!(
        results[0]["body"]["postUrl"],
        "https://github.com/organizations/fixture-org/settings/apps/new?state=<state>"
    );
    let manifest = &results[0]["body"]["manifest"];
    for field in ["redirect_url", "setup_url"] {
        assert_eq!(
            manifest[field],
            "http://fixture.test/api/github/apps/callback"
        );
    }
    assert_eq!(
        manifest["callback_urls"],
        json!(["http://fixture.test/api/github/apps/callback"])
    );
    assert_eq!(results[1], json!({"row":true,"active":true,"index":0}));
    assert_eq!(results[3], json!({"row":true,"active":false,"index":null}));
    assert_redirect(&results[2], "installed");
    assert_redirect(&results[4], "connected");
    assert_eq!(results[5]["appId"], "123");
    assert_eq!(results[5]["installationId"], "99");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 2);
    assert!(
        actual["effects"][0]["url"]
            .as_str()
            .unwrap()
            .ends_with("/app-manifests/manifest-code/conversions")
    );
    assert!(
        actual["effects"][1]["url"]
            .as_str()
            .unwrap()
            .ends_with("/app/installations/99")
    );
    assert_eq!(
        actual["portCalls"],
        json!([
            "beginSetup",
            "publicBaseUrl",
            "readState",
            "completeCallback",
            "publicBaseUrl",
            "readState",
            "completeCallback"
        ])
    );
}
#[tokio::test]
async fn issued_setup_state_supports_combined_conversion_and_installation_callback() {
    let (actual,reference)=observed_composition(json!([
        setup_start(),issued_callback(0,"&code=manifest-code&installation_id=99",json!([setup_conversion(),setup_installation()])),
        {"op":"get","user":"u","agent":"a"}
    ]),false,true).await;
    assert_public_equal(&actual, &reference);
    assert_redirect(&actual["results"][1], "connected");
    assert_eq!(actual["results"][2]["status"], "connected");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 2);
}
#[tokio::test]
async fn newer_setup_revokes_prior_state_and_keeps_fresh_challenge_usable() {
    let (actual, reference) = observed_composition(
        json!([
            setup_start(),
            setup_start(),
            challenge_snapshot(),
            rejected_issued_callback(0, "&code=older-code", json!([setup_conversion()])),
            challenge_snapshot(),
            dual_issued_callback(
                1,
                "&code=fresh-code&installation_id=99",
                json!([setup_conversion(), setup_installation()]),
                json!([setup_installation()])
            )
        ]),
        false,
        true,
    )
    .await;
    assert_callback_error(&actual["results"][3]);
    assert_redirect(&reference["results"][3], "installed");
    assert_eq!(
        actual["results"][4],
        json!({"row":true,"active":true,"index":1})
    );
    assert_redirect(&actual["results"][5], "connected");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 2);
    assert!(
        actual["effects"][0]["url"]
            .as_str()
            .unwrap()
            .contains("fresh-code")
    );
    assert!(
        reference["effects"][0]["url"]
            .as_str()
            .unwrap()
            .contains("older-code")
    );
}
#[tokio::test]
async fn disconnect_revokes_issued_state_without_remote_effects() {
    let (actual,reference)=observed_composition(json!([
        setup_start(),{"op":"http","method":"DELETE","path":"/api/agents/a/github-app","user":"u"},challenge_snapshot(),
        rejected_issued_callback(0,"&code=after-disconnect",json!([setup_conversion()])),{"op":"get","user":"u","agent":"a"}
    ]),false,true).await;
    assert_callback_error(&actual["results"][3]);
    assert_redirect(&reference["results"][3], "installed");
    assert!(actual["results"][4].is_null());
    assert_eq!(actual["effects"], json!([]));
    assert_eq!(reference["effects"].as_array().unwrap().len(), 1);
}
#[tokio::test]
async fn manual_app_replacement_revokes_prior_state_and_preserves_replacement() {
    let mut manual = manual_step();
    manual["body"]["appId"] = json!("456");
    let (actual,reference)=observed_composition(json!([
        setup_start(),manual,challenge_snapshot(),
        rejected_issued_callback(0,"&installation_id=99",json!([setup_installation()])),{"op":"get","user":"u","agent":"a"}
    ]),false,true).await;
    assert_callback_error(&actual["results"][3]);
    assert_redirect(&reference["results"][3], "connected");
    assert_eq!(actual["results"][4]["appId"], "456");
    assert!(actual["results"][4]["installationId"].is_null());
    assert_eq!(actual["effects"], json!([]));
    assert_eq!(reference["effects"].as_array().unwrap().len(), 1);
}
#[tokio::test]
async fn issued_state_expires_before_effects_after_controlled_clock_advance() {
    let (actual,reference)=observed_composition(json!([
        setup_start(),{"op":"advance","ms":86400000},
        rejected_issued_callback(0,"&code=after-one-day",json!([setup_conversion()])),{"op":"get","user":"u","agent":"a"}
    ]),false,true).await;
    assert_callback_error(&actual["results"][2]);
    assert_redirect(&reference["results"][2], "installed");
    assert!(actual["results"][3]["appId"].is_null());
    assert_eq!(actual["effects"], json!([]));
    assert_eq!(reference["effects"].as_array().unwrap().len(), 1);
}
#[tokio::test]
async fn failed_conversion_retains_uncertainty_and_requires_fresh_setup_for_retry() {
    let (actual, reference) = observed_composition(
        json!([
            setup_start(),
            issued_callback(
                0,
                "&code=retry-code",
                json!([{"status":503,"data":{"message":"fixture temporarily unavailable"}}])
            ),
            challenge_snapshot(),
            rejected_issued_callback(0, "&code=retry-code", json!([setup_conversion()])),
            setup_start(),
            dual_issued_callback(
                1,
                "&code=fresh-code",
                json!([setup_conversion()]),
                json!([])
            )
        ]),
        false,
        true,
    )
    .await;
    assert_callback_error(&actual["results"][1]);
    assert_callback_error(&actual["results"][3]);
    assert_redirect(&reference["results"][3], "installed");
    assert_redirect(&actual["results"][5], "installed");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 2);
    assert_eq!(
        actual["results"][2],
        json!({"row":true,"active":true,"index":0})
    );
}
#[tokio::test]
async fn failed_installation_retains_uncertainty_until_fresh_setup_recovery() {
    let (actual, reference) = observed_composition(
        json!([
            setup_start(),
            issued_callback(0, "&code=manifest-code", json!([setup_conversion()])),
            issued_callback(
                0,
                "&installation_id=99",
                json!([{"status":503,"data":{"message":"fixture temporarily unavailable"}}])
            ),
            rejected_issued_callback(0, "&installation_id=99", json!([setup_installation()])),
            setup_start(),
            issued_callback(1, "&installation_id=99", json!([setup_installation()]))
        ]),
        false,
        true,
    )
    .await;
    assert_redirect(&actual["results"][1], "installed");
    assert_callback_error(&actual["results"][2]);
    assert_callback_error(&actual["results"][3]);
    assert_redirect(&reference["results"][3], "connected");
    assert_redirect(&actual["results"][5], "connected");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 3);
    assert_eq!(
        actual["effects"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["url"].as_str().unwrap().contains("conversions"))
            .count(),
        1
    );
}
#[tokio::test]
async fn manual_installation_uses_authenticated_form_when_callback_has_no_state() {
    let mut manual = manual_step();
    manual["body"]["appSlug"] = json!("journey");
    let (actual,reference)=observed_composition(json!([
        manual,{"op":"http","method":"GET","path":"/api/github/apps/callback?installation_id=99","wire":true},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation","body":{"installationId":"99"}},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation","user":"other","body":{"installationId":"99"}},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation","user":"u","body":{"installationId":"99"},"responses":[setup_installation()]}
    ]),false,true).await;
    assert_public_equal(&actual, &reference);
    assert_eq!(
        actual["results"][0]["body"]["connection"]["appSlug"],
        "journey"
    );
    assert_eq!(
        actual["results"][1]["location"],
        "http://localhost:8787/agents?github=error&reason=invalid_state"
    );
    assert_eq!(actual["results"][2]["status"], 401);
    assert_eq!(actual["results"][3]["status"], 404);
    assert_eq!(
        actual["results"][4]["body"]["connection"]["status"],
        "connected"
    );
    assert_eq!(actual["effects"].as_array().unwrap().len(), 1);
}
#[tokio::test]
async fn missing_code_callback_does_not_consume_fresh_issued_setup_state() {
    let (actual, reference) = observed_composition(
        json!([
            setup_start(),
            issued_callback(0, "", json!([])),
            challenge_snapshot(),
            issued_callback(0, "&code=manifest-code", json!([setup_conversion()]))
        ]),
        false,
        true,
    )
    .await;
    assert_public_equal(&actual, &reference);
    assert!(
        actual["results"][1]["location"]
            .as_str()
            .unwrap()
            .contains("reason=missing_code")
    );
    assert_eq!(
        actual["results"][2],
        json!({"row":true,"active":true,"index":0})
    );
    assert_redirect(&actual["results"][3], "installed");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn http_exact_replay_returns_public_result_without_effect_and_rejects_changed_inputs() {
    let mut changed_installation = setup_installation();
    changed_installation["data"]["id"] = json!(100);
    let (actual, reference) = observed_composition(json!([
        setup_start(),
        issued_callback(0,"&code=manifest-code&installation_id=99",json!([setup_conversion(),setup_installation()])),
        rejected_issued_callback(0,"&code=manifest-code&installation_id=99",json!([setup_installation()])),
        rejected_issued_callback(0,"&code=other-code",json!([])),
        rejected_issued_callback(0,"&installation_id=100",json!([changed_installation])),
        {"op":"get","user":"u","agent":"a"}
    ]),false,true).await;
    assert_redirect(&actual["results"][1], "connected");
    assert_eq!(actual["results"][1], actual["results"][2]);
    for i in [3, 4] {
        assert_callback_error(&actual["results"][i]);
        assert_redirect(&reference["results"][i], "connected");
    }
    assert_eq!(actual["results"][5]["installationId"], "99");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 2);
    assert_eq!(reference["effects"].as_array().unwrap().len(), 4);
}

#[tokio::test]
async fn http_conversion_does_not_renew_absolute_deadline_for_installation() {
    let (actual, reference) = observed_composition(
        json!([
            setup_start(),{"op":"advance","ms":899999},
            issued_callback(0,"&code=manifest-code",json!([setup_conversion()])),
            {"op":"advance","ms":1},
            rejected_issued_callback(0,"&installation_id=99",json!([setup_installation()])),
            {"op":"get","user":"u","agent":"a"}
        ]),
        false,
        true,
    )
    .await;
    assert_redirect(&actual["results"][2], "installed");
    assert_callback_error(&actual["results"][4]);
    assert_redirect(&reference["results"][4], "connected");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 1);
    assert_eq!(reference["effects"].as_array().unwrap().len(), 2);
    assert!(actual["results"][5]["installationId"].is_null());
}

#[tokio::test]
async fn http_clock_rollback_denies_effect_without_consuming_valid_challenge() {
    let (actual, reference) = observed_composition(
        json!([
            setup_start(),{"op":"advance","ms":-1},
            rejected_issued_callback(0,"&code=rollback-code",json!([setup_conversion()])),
            {"op":"advance","ms":1},
            dual_issued_callback(0,"&code=valid-code",json!([setup_conversion()]),json!([]))
        ]),
        false,
        true,
    )
    .await;
    assert_callback_error(&actual["results"][2]);
    assert_redirect(&reference["results"][2], "installed");
    assert_redirect(&actual["results"][4], "installed");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 1);
    assert!(
        actual["effects"][0]["url"]
            .as_str()
            .unwrap()
            .contains("valid-code")
    );
}

#[tokio::test]
async fn http_repeated_code_does_not_consume_fresh_challenge() {
    let (actual, reference) = observed_composition(
        json!([
            setup_start(),
            rejected_issued_callback(0, "&code=x&code=y", json!([setup_conversion()])),
            challenge_snapshot(),
            dual_issued_callback(
                0,
                "&code=valid-code",
                json!([setup_conversion()]),
                json!([])
            )
        ]),
        false,
        true,
    )
    .await;
    assert_callback_error(&actual["results"][1]);
    assert_redirect(&reference["results"][1], "installed");
    assert_eq!(
        actual["results"][2],
        json!({"row":true,"active":true,"index":0})
    );
    assert_redirect(&actual["results"][3], "installed");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 1);
    assert!(
        actual["effects"][0]["url"]
            .as_str()
            .unwrap()
            .contains("valid-code")
    );
    assert!(
        reference["effects"][0]["url"]
            .as_str()
            .unwrap()
            .contains("x%2Cy")
    );
}

#[tokio::test]
async fn http_callback_after_idle_maintenance_denies_expired_state_and_preserves_credentials() {
    let actual = native_composition(
        json!([
            setup_start(),
            issued_callback(0,"&code=converted",json!([setup_conversion()])),
            {"op":"advance","ms":900000}, {"op":"maintenance"},
            rejected_issued_callback(0,"&installation_id=99",json!([])),
            {"op":"get","user":"u","agent":"a"}
        ]),
        false,
        true,
    )
    .await;
    assert_redirect(&actual["results"][1], "installed");
    assert_callback_error(&actual["results"][4]);
    assert!(
        actual["results"][4]["location"]
            .as_str()
            .unwrap()
            .contains("Invalid%20GitHub%20setup%20challenge")
    );
    assert_eq!(actual["results"][5]["appId"], "123");
    assert_eq!(actual["results"][5]["hasPrivateKey"], true);
    assert!(actual["results"][5]["installationId"].is_null());
    assert_eq!(actual["effects"].as_array().unwrap().len(), 1);
}

fn installation_url_start() -> Value {
    json!({"op":"http","method":"POST","path":"/api/agents/a/github-app/installation-url","user":"u","body":{},"captureState":true})
}
fn manual_app(slug: &str) -> Value {
    json!({"op":"http","method":"POST","path":"/api/agents/a/github-app/manual","user":"u","body":{"appId":"123","privateKey":RSA_KEY,"appSlug":slug}})
}
#[tokio::test]
async fn installation_url_browser_state_drives_actual_callback_and_exact_replay() {
    let actual = native_composition(
        json!([
            manual_app("fixture"), installation_url_start(),
            issued_callback(0,"&installation_id=99",json!([setup_installation()])),
            issued_callback(0,"&installation_id=99",json!([])),
            rejected_issued_callback(0,"&installation_id=100",json!([])),
            {"op":"challengeStorage"}, {"op":"get","user":"u","agent":"a"}
        ]),
        false,
        true,
    )
    .await;
    assert_eq!(
        actual["results"][1]["body"]["installUrl"],
        "https://github.com/apps/fixture/installations/new?state=<state>"
    );
    assert_redirect(&actual["results"][2], "connected");
    assert_redirect(&actual["results"][3], "connected");
    assert_callback_error(&actual["results"][4]);
    assert_eq!(actual["results"][5]["phase"], "complete");
    assert_eq!(actual["results"][6]["installationId"], "99");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 1);
}
#[tokio::test]
async fn installation_url_reissuance_replaces_prior_authority_after_manifest_conversion() {
    let actual = native_composition(
        json!([
            setup_start(), issued_callback(0,"&code=converted",json!([setup_conversion()])),
            installation_url_start(),
            rejected_issued_callback(0,"&installation_id=99",json!([])),
            issued_callback(1,"&installation_id=99",json!([setup_installation()])),
            {"op":"challengeStorage"}
        ]),
        false,
        true,
    )
    .await;
    assert_callback_error(&actual["results"][3]);
    assert_redirect(&actual["results"][4], "connected");
    assert_eq!(
        actual["results"][5],
        json!({"phase":"complete","generation":2})
    );
    assert_eq!(actual["effects"].as_array().unwrap().len(), 2);
}
#[tokio::test]
async fn installation_url_requires_authenticated_owner_and_current_app_key_and_slug() {
    let actual = native_composition(json!([
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation-url","body":{}},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation-url","user":"other","body":{}},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation-url","user":"u","body":{}},
        manual_app("fixture"), installation_url_start(),
        {"op":"sql","sql":"DELETE FROM user_secrets WHERE user_id='u'"},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation-url","user":"u","body":{}},
        {"op":"challengeStorage"}
    ]),false,true).await;
    for (index, status) in [(0, 401), (1, 404), (2, 400), (6, 400)] {
        assert_eq!(actual["results"][index]["status"], status);
    }
    assert_eq!(
        actual["results"][7],
        json!({"phase":"awaiting_installation","generation":2})
    );
    assert_eq!(actual["effects"], json!([]));
    assert_eq!(
        actual["portCalls"],
        json!([
            "beginInstallation",
            "saveManualApp",
            "beginInstallation",
            "beginInstallation"
        ])
    );
}
#[tokio::test]
async fn installation_url_rejects_untrusted_slug_without_rotating_prior_challenge() {
    for slug in [
        "..",
        "../escape",
        "fixture?state=forged",
        "fixture#fragment",
        "https://other.invalid/",
        "",
        "f%2fescape",
    ] {
        let update = format!(
            "UPDATE agent_github_apps SET data=json_set(data,'$.appSlug', '{}') WHERE user_id='u' AND agent_id='a'",
            slug
        );
        let actual = native_composition(json!([
            manual_app("fixture"), installation_url_start(),
            {"op":"sql","sql":update},
            {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation-url","user":"u","body":{}},
            {"op":"challengeStorage"}
        ]),false,true).await;
        assert_eq!(actual["results"][3]["status"], 400, "{slug}");
        assert_eq!(
            actual["results"][4],
            json!({"phase":"awaiting_installation","generation":2})
        );
        assert_eq!(actual["effects"], json!([]));
    }
}
#[tokio::test]
async fn installation_url_expiry_tick_and_manual_replacement_revoke_callback_authority() {
    let actual = native_composition(
        json!([
            manual_app("fixture"), installation_url_start(),
            {"op":"advance","ms":900000},{"op":"maintenance"},
            rejected_issued_callback(0,"&installation_id=99",json!([])),
            installation_url_start(),manual_app("replacement"),
            rejected_issued_callback(1,"&installation_id=99",json!([])),
            {"op":"get","user":"u","agent":"a"}
        ]),
        false,
        true,
    )
    .await;
    assert_callback_error(&actual["results"][4]);
    assert_callback_error(&actual["results"][7]);
    assert_eq!(actual["results"][8]["appSlug"], "replacement");
    assert_eq!(actual["results"][8]["hasPrivateKey"], true);
    assert!(actual["results"][8]["installationId"].is_null());
    assert_eq!(actual["effects"], json!([]));
}

#[tokio::test]
async fn installation_url_binding_detects_direct_credential_edits_before_effects() {
    for sql in [
        "UPDATE agent_github_apps SET data=json_set(data,'$.appId','456') WHERE user_id='u' AND agent_id='a'",
        "DELETE FROM user_secrets WHERE user_id='u'",
    ] {
        let actual = native_composition(
            json!([
                manual_app("fixture"), installation_url_start(),
                {"op":"sql","sql":sql},
                rejected_issued_callback(0,"&installation_id=99",json!([])),
                {"op":"challengeStorage"}
            ]),
            false,
            true,
        )
        .await;
        assert_callback_error(&actual["results"][3]);
        assert!(
            actual["results"][3]["location"]
                .as_str()
                .unwrap()
                .contains("credentials%20changed")
        );
        assert_eq!(actual["results"][4]["phase"], "awaiting_installation");
        assert_eq!(actual["effects"], json!([]));
    }
}
#[tokio::test]
async fn installation_url_persistence_failure_rolls_back_state_and_keeps_prior_url_usable() {
    let actual = native_composition(json!([
        manual_app("fixture"), installation_url_start(),
        {"op":"sql","sql":"CREATE TRIGGER deny_issuance BEFORE UPDATE OF state_hash ON native_github_setup_challenges BEGIN SELECT RAISE(ABORT,'fixture issuance failure'); END"},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation-url","user":"u","body":{}},
        {"op":"issuedChallenge"},{"op":"challengeStorage"},
        {"op":"sql","sql":"DROP TRIGGER deny_issuance"},
        issued_callback(0,"&installation_id=99",json!([setup_installation()]))
    ]),false,true).await;
    assert_eq!(actual["results"][3]["status"], 400);
    assert_eq!(
        actual["results"][4],
        json!({"row":true,"active":true,"index":0})
    );
    assert_eq!(
        actual["results"][5],
        json!({"phase":"awaiting_installation","generation":2})
    );
    assert_redirect(&actual["results"][7], "connected");
    assert_eq!(actual["effects"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn browser_capability_reads_do_not_issue_or_rotate_installation_authority() {
    let mut issue = installation_url_start();
    issue["inspectHeaders"] = json!(true);
    let read = json!({"op":"http","method":"GET","path":"/api/agents/a/github-app","user":"u","inspectHeaders":true});
    let actual = native_composition(json!([
        manual_app("fixture"),
        {"op":"sql","sql":"CREATE TRIGGER forbid_read_insert BEFORE INSERT ON native_github_setup_challenges BEGIN SELECT RAISE(ABORT,'read issued challenge'); END; CREATE TRIGGER forbid_read_update BEFORE UPDATE ON native_github_setup_challenges BEGIN SELECT RAISE(ABORT,'read rotated challenge'); END;"},
        read.clone(), read.clone(),
        {"op":"sql","sql":"DROP TRIGGER forbid_read_insert; DROP TRIGGER forbid_read_update;"},
        issue,
        {"op":"challengeStorage"}, read, {"op":"challengeStorage"},
        issued_callback(0,"&installation_id=99",json!([setup_installation()])),
        {"op":"http","method":"GET","path":"/api/agents/a/github-app","inspectHeaders":true},
        {"op":"http","method":"POST","path":"/api/agents/a/github-app/installation-url","user":"other","inspectHeaders":true}
    ]),false,true).await;
    for i in [2, 3, 7] {
        assert_eq!(actual["results"][i]["status"], 200);
        assert_eq!(
            actual["results"][i]["headers"],
            json!({"flow":"stateful","expose":"x-jait-github-installation-flow","cache":"no-store"})
        );
    }
    assert_eq!(actual["results"][5]["headers"]["cache"], "no-store");
    assert_eq!(actual["results"][6], actual["results"][8]);
    assert_redirect(&actual["results"][9], "connected");
    assert_eq!(actual["results"][10]["status"], 401);
    assert!(actual["results"][10]["headers"]["flow"].is_null());
    assert_eq!(actual["results"][11]["status"], 404);
    assert!(actual["results"][11]["headers"]["flow"].is_null());
}
