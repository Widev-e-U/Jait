#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    routes::{auth::AuthState, consent::*},
    runtime::blocking::BlockingLane,
    security::{
        consent_manager::*,
        http_auth::{self, AuthUser},
    },
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    num::NonZeroU16,
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
fn normalize(value: Value, ids: &HashMap<String, String>) -> Value {
    match value {
        Value::String(v) => json!(ids.get(&v).unwrap_or(&v)),
        Value::Array(v) => Value::Array(v.into_iter().map(|v| normalize(v, ids)).collect()),
        Value::Object(v) => Value::Object(
            v.into_iter()
                .map(|(k, v)| {
                    let v = if matches!(k.as_str(), "createdAt" | "expiresAt" | "decidedAt") {
                        json!("<time>")
                    } else {
                        normalize(v, ids)
                    };
                    (k, v)
                })
                .collect(),
        ),
        v => v,
    }
}
fn ask(alias: &str, session: &str) -> Value {
    json!({"ask":alias,"input":{"actionId":format!("action-{alias}"),"toolName":"terminal.execute","summary":format!("request {alias}"),"preview":{"command":"fixture"},"risk":"high","policy":{"consentLevel":"always","description":"explicit","knownTool":true,"source":"profile"},"sessionId":session}})
}
fn http(method: &str, path: &str) -> Value {
    json!({"method":method,"path":path,"user":"owner"})
}
async fn compare(call: Value) {
    let mut request = call.clone();
    request["op"] = json!("nativeconsenthttp.run");
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/consent-http/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[request]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "consent-http-fixture".into()).unwrap();
    let active = Arc::new(Mutex::new(Value::Null));
    let events = Arc::new(Mutex::new(vec![]));
    let current = active.clone();
    let log = events.clone();
    let manager = ConsentManager::new(ConsentManagerOptions {
        on_decision: Some(Arc::new(move |d| {
            log.lock()
                .unwrap()
                .push(json!({"kind":"decision","value":d}));
            if current.lock().unwrap()["throwDecision"] == true {
                Err("decision failed".into())
            } else {
                Ok(())
            }
        })),
        ..Default::default()
    });
    let ownership = call.clone();
    let log = events.clone();
    let current = active.clone();
    let routes = ConsentRoutes {
        auth: auth.clone(),
        manager: manager.clone(),
        lane: BlockingLane::new(NonZeroU16::new(1).unwrap()),
        owns_session: Arc::new(move |s, u| {
            if ownership["accessError"] == true {
                return Err("ownership failed".into());
            }
            Ok(ownership["owners"][s] == u || ownership["threads"][s] == u)
        }),
        audit: Arc::new(move |mut event| {
            let id = uuid::Uuid::parse_str(event["actionId"].as_str().unwrap()).unwrap();
            assert_eq!(id.get_version_num(), 7);
            event["actionId"] = json!("<audit-id>");
            log.lock()
                .unwrap()
                .push(json!({"kind":"audit","value":event}));
            if current.lock().unwrap()["throwAudit"] == true {
                Err("audit failed".into())
            } else {
                Ok(())
            }
        }),
        active_profile_name: call["profile"].as_str().map(str::to_owned),
        permissions: serde_json::from_value(call.get("permissions").cloned().unwrap_or(json!([])))
            .unwrap(),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (send, stop) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        axum::serve(listener, routes.router())
            .with_graceful_shutdown(async {
                let _ = stop.await;
            })
            .await
            .unwrap()
    });
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let mut ids = HashMap::new();
    let mut aliases = HashMap::new();
    let mut results = vec![];
    let mut handles = vec![];
    for step in call["steps"].as_array().unwrap() {
        *active.lock().unwrap() = step.clone();
        if let Some(alias) = step["ask"].as_str() {
            let handle = manager
                .request_consent(serde_json::from_value(step["input"].clone()).unwrap())
                .unwrap();
            ids.insert(handle.id.clone(), alias.to_owned());
            aliases.insert(alias.to_owned(), handle.id.clone());
            handles.push(handle);
            results.push(json!({"asked":alias}));
            continue;
        }
        let mut path = step["path"].as_str().unwrap().to_owned();
        // Replace longest aliases first so $a never consumes a prefix of $aa.
        let mut keys: Vec<_> = aliases.keys().collect();
        keys.sort_by_key(|k| std::cmp::Reverse(k.len()));
        for key in keys {
            path = path.replace(&format!("${key}"), &aliases[key]);
        }
        let mut request = client.request(
            step["method"].as_str().unwrap().parse().unwrap(),
            format!("{base}{path}"),
        );
        if let Some(headers) = step["headers"].as_object() {
            for (k, v) in headers {
                request = request.header(k, v.as_str().unwrap());
            }
        }
        if let Some(user) = step["user"].as_str() {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: "alice".into(),
                },
                "consent-http-fixture",
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
        let reply = request.send().await.unwrap();
        let status = reply.status().as_u16();
        let raw = reply.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(normalize(json!({"status":status,"body":body}), &ids));
    }
    let enabled: serde_json::Map<String, Value> = call["owners"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(s, _)| {
            (
                s.clone(),
                json!(manager.is_approve_all_enabled_for_session(s)),
            )
        })
        .collect();
    let actual = json!({"results":results,"events":normalize(json!(*events.lock().unwrap()),&ids),"pending":normalize(json!(manager.list_pending(None).iter().map(|r|r.snapshot()).collect::<Vec<_>>()),&ids),"enabled":enabled});
    let _ = send.send(());
    server.await.unwrap();
    let _ = manager.cancel_all(Some("fixture done"));
    drop(handles);
    auth.shutdown().await.unwrap();
    assert_eq!(actual, expected);
}
#[tokio::test]
async fn policy_requires_auth_and_preserves_permission_order() {
    compare(json!({"profile":"standard","permissions":[{"toolName":"z","consentLevel":"always","risk":"high","description":"Z"},{"toolName":"a","consentLevel":"none","risk":"low","description":"A","allowedPaths":["/owned"]}],"steps":[{"method":"GET","path":"/api/consent/policy"},http("GET","/api/consent/policy"),{"method":"GET","path":"/api/consent/policy","headers":{"authorization":"Bearer invalid"}}, {"method":"GET","path":"/api/consent/policy","user":"owner","cookie":true}, {"method":"GET","path":"/api/trust"}]})).await;
    compare(json!({"steps":[http("GET","/api/consent/policy")]})).await;
}
#[tokio::test]
async fn pending_reads_filter_sessions_and_threads_and_hide_foreign_requests() {
    compare(json!({"owners":{"s":"owner","t":"other"},"threads":{"worker":"owner"},"steps":[ask("a","s"),ask("b","t"),ask("c","worker"),http("GET","/api/consent/pending"),http("GET","/api/consent/count"),http("GET","/api/consent/pending/s"),http("GET","/api/consent/pending/worker"),http("GET","/api/consent/pending/t"),http("GET","/api/consent/$a"),http("GET","/api/consent/$b"),http("GET","/api/consent/missing")]})).await;
    compare(json!({"steps":[ask("a","s"),http("GET","/api/consent/pending"),http("GET","/api/consent/$a")]})).await;
}
#[tokio::test]
async fn decisions_preserve_reason_defaults_audit_and_replay_denials() {
    let mut steps = vec![];
    for (i, body) in [
        json!({}),
        json!({"reason":""}),
        json!({"reason":false}),
        json!({"reason":"approved by owner"}),
    ]
    .into_iter()
    .enumerate()
    {
        let alias = format!("a{i}");
        steps.push(ask(&alias, "s"));
        let mut req = http("POST", &format!("/api/consent/${alias}/approve"));
        req["body"] = body.clone();
        steps.push(req);
        steps.push(http("POST", &format!("/api/consent/${alias}/approve")));
        let alias = format!("r{i}");
        steps.push(ask(&alias, "s"));
        let mut req = http("POST", &format!("/api/consent/${alias}/reject"));
        req["body"] = body;
        steps.push(req);
    }
    steps.extend([
        ask("foreign", "t"),
        http("POST", "/api/consent/$foreign/approve"),
        http("POST", "/api/consent/missing/reject"),
        http("GET", "/api/consent/count"),
    ]);
    compare(json!({"owners":{"s":"owner","t":"other"},"steps":steps})).await;
}
#[tokio::test]
async fn notification_bulk_only_approves_current_session_without_future_override() {
    compare(json!({"owners":{"s":"owner","t":"other"},"steps":[ask("a","s"),ask("b","s"),ask("foreign","t"),http("POST","/api/consent/$foreign/approve-all"),http("POST","/api/consent/$a/approve-all"),http("GET","/api/consent/pending/s/approve-all"),ask("later","s"),http("GET","/api/consent/pending/s"),http("POST","/api/consent/$a/approve-all")]})).await;
}
#[tokio::test]
async fn session_bulk_persists_override_and_clear_with_empty_and_foreign_cases() {
    compare(json!({"owners":{"s":"owner","t":"other","empty":"owner"},"steps":[ask("a","s"),ask("b","s"),ask("foreign","t"),{"method":"POST","path":"/api/consent/pending/s/approve-all","user":"owner","body":{"reason":"bulk owner"}},http("GET","/api/consent/pending/s/approve-all"),http("POST","/api/consent/pending/empty/approve-all"),http("POST","/api/consent/pending/t/approve-all"),http("DELETE","/api/consent/pending/t/approve-all"),http("DELETE","/api/consent/pending/s/approve-all"),http("DELETE","/api/consent/pending/s/approve-all"),http("GET","/api/consent/pending/s/approve-all")]})).await;
}
#[tokio::test]
async fn observer_and_audit_failures_preserve_completed_effects_and_stop_bulk() {
    for failure in ["throwAudit", "throwDecision"] {
        let mut req = http("POST", "/api/consent/pending/s/approve-all");
        req[failure] = json!(true);
        compare(json!({"owners":{"s":"owner"},"steps":[ask("a","s"),ask("b","s"),req,http("GET","/api/consent/pending/s"),http("GET","/api/consent/pending/s/approve-all")]})).await;
        let mut req = http("POST", "/api/consent/$a/approve");
        req[failure] = json!(true);
        compare(json!({"owners":{"s":"owner"},"steps":[ask("a","s"),req,http("GET","/api/consent/count")]})).await;
    }
    compare(json!({"accessError":true,"steps":[ask("a","s"),http("POST","/api/consent/$a/approve"),http("GET","/api/consent/pending")]})).await;
}
#[tokio::test]
async fn parse_failures_and_encoded_session_boundaries_precede_mutation() {
    compare(json!({"owners":{"s/a":"owner","s":"owner"},"steps":[ask("a","s/a"),http("GET","/api/consent/pending/s%2Fa"),http("POST","/api/consent/pending/s%2Fa/approve-all"),{"method":"POST","path":"/api/consent/missing/approve","raw":"{","headers":{"content-type":"application/json"}},http("GET","/api/consent/%GG"),http("GET","/api/consent/%FF"),{"method":"POST","path":"/api/consent/pending/s/approve-all","user":"owner","body":null},http("GET","/api/consent/pending/s/approve-all")]})).await;
}

#[tokio::test]
async fn native_origin_deleted_user_and_closed_lane_deny_before_consent_effects() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "consent-http-fixture".into()).unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let reads = calls.clone();
    let writes = calls.clone();
    let manager = ConsentManager::default();
    let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
    lane.close();
    let routes = ConsentRoutes {
        auth: auth.clone(),
        manager: manager.clone(),
        lane,
        owns_session: Arc::new(move |_, _| {
            reads.fetch_add(1, Ordering::SeqCst);
            Ok(true)
        }),
        audit: Arc::new(move |_| {
            writes.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }),
        active_profile_name: None,
        permissions: vec![],
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!(
        "http://{}/api/consent/pending/s/approve-all",
        listener.local_addr().unwrap()
    );
    let (send, stop) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        axum::serve(listener, routes.router())
            .with_graceful_shutdown(async {
                let _ = stop.await;
            })
            .await
            .unwrap()
    });
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    assert_eq!(client.post(&base).send().await.unwrap().status(), 401);
    let token = |id: &str| {
        http_auth::sign_auth_token(
            &AuthUser {
                id: id.into(),
                username: "alice".into(),
            },
            "consent-http-fixture",
        )
        .unwrap()
    };
    assert_eq!(
        client
            .post(&base)
            .header("cookie", format!("jait_token={}", token("owner")))
            .header("origin", "https://foreign.invalid")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        client
            .post(&base)
            .bearer_auth(token("deleted"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let reply = client
        .post(&base)
        .bearer_auth(token("owner"))
        .send()
        .await
        .unwrap();
    assert_eq!(reply.status(), 500);
    assert_eq!(
        reply.json::<Value>().await.unwrap()["message"],
        "blocking lane is closed"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert!(!manager.is_approve_all_enabled_for_session("s"));
    let _ = send.send(());
    server.await.unwrap();
    auth.shutdown().await.unwrap();
}

#[tokio::test]
async fn reserved_parameter_names_keep_method_routing_and_ownership_checks() {
    compare(json!({"owners":{"approve":"owner","reject":"owner","approve-all":"owner","s":"owner"},"steps":[ask("a","approve"),http("GET","/api/consent/pending/approve"),http("POST","/api/consent/pending/approve"),http("POST","/api/consent/pending/reject"),http("POST","/api/consent/pending/approve-all"),http("POST","/api/consent/policy/approve"),http("POST","/api/consent/count/reject"),http("POST","/api/consent/policy/approve-all"),http("GET","/api/consent/pending/approve-all"),http("GET","/api/consent/pending/reject"),http("GET","/api/consent/%70olicy"),http("GET","/api/consent/%63ount"),http("GET","/api/consent/%70ending")]})).await;
}
