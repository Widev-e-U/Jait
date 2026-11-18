#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{
        agent_control::{AgentControlRoutes, StateChanged},
        auth::AuthState,
    },
    security::http_auth::{self, AuthUser},
    services::{
        agent_control::{
            AgentControlHooks, AgentControlService, AgentControlState, AgentStopResult,
        },
        audit::AuditWriter,
    },
    time::iso,
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
    time::Duration,
};
const INITIAL_TIME: i64 = 1792476000000;
struct Change(StateChanged);
impl AgentControlHooks for Change {
    fn on_change(&mut self, user: &str, state: &AgentControlState) -> Result<(), String> {
        (self.0)(user, state)
    }
}
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn auth() -> AuthState {
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    AuthState::new(db, "agent-control-http-secret".into()).unwrap()
}
fn token(user: &str) -> String {
    http_auth::sign_auth_token(
        &AuthUser {
            id: user.into(),
            username: if user == "owner" { "alice" } else { "bob" }.into(),
        },
        "agent-control-http-secret",
    )
    .unwrap()
}
async fn scenario(mut call: Value) -> Value {
    call["op"] = json!("nativeagentcontrolhttp.routes");
    let directory = root()
        .join(".jait/artifacts/gateway-rust/agent-control-http")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let expected = internal_driver::call(
        &root(),
        &directory,
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let auth = auth();
    if let Some(sql) = call["sql"].as_str() {
        let sql = sql.to_string();
        auth.with_database(move |db| {
            db.execute_batch(&sql)?;
            Ok(())
        })
        .await
        .unwrap();
    }
    let now = Arc::new(AtomicI64::new(INITIAL_TIME));
    let current = Arc::new(Mutex::new(json!({})));
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let mut routes = AgentControlRoutes::new(auth.clone());
    let clock = now.clone();
    routes.clock = Arc::new(move || clock.load(Ordering::SeqCst));
    let changed = events.clone();
    let step = current.clone();
    let on_change: StateChanged = Arc::new(move |user, state| {
        changed
            .lock()
            .unwrap()
            .push(json!({"op":"change","user":user,"state":state}));
        match step.lock().unwrap()["changeThrow"]
            .as_str()
            .filter(|s| !s.is_empty())
        {
            Some(message) => Err(message.into()),
            None => Ok(()),
        }
    });
    routes.on_change = on_change.clone();
    let stop_auth = auth.clone();
    let step = current.clone();
    let stopped = events.clone();
    let clock = now.clone();
    routes.stop_running = Arc::new(move |user| {
        let auth = stop_auth.clone();
        let current = step.lock().unwrap().clone();
        let events = stopped.clone();
        let change = on_change.clone();
        let clock = clock.clone();
        Box::pin(async move {
            let owner = user.clone();
            let state = auth
                .with_database(move |db| {
                    Ok(AgentControlService::new(db, &|| String::new()).get_state(&owner)?)
                })
                .await
                .unwrap();
            events
                .lock()
                .unwrap()
                .push(json!({"op":"stop","user":user,"state":state}));
            tokio::task::yield_now().await;
            if current["interleaveResume"] == true {
                let owner = user.clone();
                let time = iso(clock.load(Ordering::SeqCst)).unwrap();
                auth.with_database(move |db| {
                    Ok(AgentControlService::new(db, &|| time.clone())
                        .resume(&owner, &mut Change(change))?)
                })
                .await
                .unwrap();
            }
            if let Some(message) = current["stopThrow"].as_str() {
                return Err(message.into());
            }
            let result = &current["stopResult"];
            if result.is_object() {
                Ok(AgentStopResult::Details {
                    stopped: result["stopped"].as_f64().unwrap_or(0.0),
                    errors: result["errors"]
                        .as_array()
                        .map(|a| a.iter().map(|s| s.as_str().unwrap().to_string()).collect())
                        .unwrap_or_default(),
                })
            } else {
                Ok(AgentStopResult::Count(result.as_f64().unwrap_or(0.0)))
            }
        })
    });
    if call["noAudit"] != true {
        let step = current.clone();
        routes.audit = Some(Arc::new(move |db, entry| {
            if step.lock().unwrap()["auditThrow"] == true {
                return Err("fixture audit failure".into());
            }
            AuditWriter::new(db)
                .write(entry)
                .map(|_| ())
                .map_err(|e| e.to_string())
        }));
    }
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_agent_control(routes);
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(gateway.serve(async {
        let _ = receive.await;
    }));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        *current.lock().unwrap() = step.clone();
        if let Some(time) = step["now"].as_str() {
            now.store(
                chrono::DateTime::parse_from_rfc3339(time)
                    .unwrap()
                    .timestamp_millis(),
                Ordering::SeqCst,
            );
        }
        let mut request = client
            .request(
                step["method"].as_str().unwrap().parse().unwrap(),
                format!("{base}{}", step["path"].as_str().unwrap()),
            )
            .header("host", "fixture.local")
            .header("connection", "close");
        if let Some(headers) = step["headers"].as_object() {
            for (k, v) in headers {
                request = request.header(k, v.as_str().unwrap());
            }
        }
        if let Some(user) = step["user"].as_str() {
            request = request.bearer_auth(token(user));
        }
        if let Some(user) = step["cookie"].as_str() {
            request = request.header("cookie", format!("jait_token={}", token(user)));
        }
        if let Some(raw) = step["raw"].as_str() {
            request = request.body(raw.to_string());
        } else if let Some(body) = step.get("body") {
            // Keep explicit content type fixtures rather than replacing them via .json().
            request = request.body(body.to_string());
            if step["headers"].get("content-type").is_none() {
                request = request.header("content-type", "application/json");
            }
        }
        let res = request.send().await.unwrap();
        let status = res.status().as_u16();
        let raw = res.text().await.unwrap();
        results.push(json!({"status":status,"body":serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw))}));
    }
    let data=auth.with_database(|db|{
        let rows=db.prepare("SELECT user_id,halted,reason,halted_at,updated_at FROM agent_control ORDER BY user_id")?.query_map([],|r|Ok(json!({"user_id":r.get::<_,String>(0)?,"halted":r.get::<_,i64>(1)?,"reason":r.get::<_,Option<String>>(2)?,"halted_at":r.get::<_,Option<String>>(3)?,"updated_at":r.get::<_,String>(4)?})))?.collect::<rusqlite::Result<Vec<_>>>()?;
        let audits=db.prepare("SELECT action_id,action_type,tool_name,inputs,outputs,status FROM audit_log ORDER BY rowid")?.query_map([],|r|{
            let inputs=r.get::<_,Option<String>>(3)?.map(|s|serde_json::from_str::<Value>(&s).unwrap()).unwrap_or(Value::Null);
            let outputs=r.get::<_,Option<String>>(4)?.map(|s|serde_json::from_str::<Value>(&s).unwrap()).unwrap_or(Value::Null);
            Ok(json!({"action_id":r.get::<_,String>(0)?,"action_type":r.get::<_,String>(1)?,"tool_name":r.get::<_,Option<String>>(2)?,"inputs":inputs,"outputs":outputs,"status":r.get::<_,String>(5)?}))
        })?.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok((rows,audits))
    }).await.unwrap();
    let actual =
        json!({"results":results,"events":*events.lock().unwrap(),"rows":data.0,"audits":data.1});
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    std::fs::write(
        directory.join("expected.json"),
        serde_json::to_string_pretty(&expected).unwrap(),
    )
    .unwrap();
    std::fs::write(
        directory.join("actual.json"),
        serde_json::to_string_pretty(&actual).unwrap(),
    )
    .unwrap();
    assert_eq!(actual, expected);
    actual
}
#[tokio::test]
async fn authenticated_owner_state_lifecycle_and_partial_stop_audits() {
    scenario(json!({"steps":[
        {"method":"GET","path":"/api/agent-control","user":"owner"},
        {"method":"POST","path":"/api/agent-control/halt","user":"owner","body":{"reason":" \u{feff} runaway \u{a0} "},"stopResult":3},
        {"method":"GET","path":"/api/agent-control","user":"other"},
        {"method":"POST","path":"/api/agent-control/halt","cookie":"owner","body":null,"now":"2026-10-20T07:00:00.000Z","stopResult":{"stopped":2,"errors":["offline","busy"]}},
        {"method":"GET","path":"/api/agent-control","cookie":"owner"},
        {"method":"POST","path":"/api/agent-control/resume","user":"other","body":false},
        {"method":"POST","path":"/api/agent-control/resume","user":"owner","now":"2026-10-20T08:00:00.000Z"}
    ]})).await;
}
#[tokio::test]
async fn all_actions_require_existing_user_and_origin_policy() {
    let mut steps = vec![];
    for (method, path) in [
        ("GET", "/api/agent-control"),
        ("POST", "/api/agent-control/halt"),
        ("POST", "/api/agent-control/resume"),
    ] {
        for extra in [
            json!({}),
            json!({"headers":{"authorization":"Bearer invalid"}}),
            json!({"user":"missing"}),
            json!({"cookie":"owner","headers":{"origin":"https://foreign.invalid"}}),
            json!({"user":"owner","headers":{"origin":"https://foreign.invalid"}}),
        ] {
            let mut step = json!({"method":method,"path":path});
            step.as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            steps.push(step);
        }
    }
    scenario(json!({"steps":steps})).await;
}
#[tokio::test]
async fn halt_body_schema_limits_trimmed_utf16_and_rejects_bad_shapes() {
    let mut steps = vec![];
    for body in [
        json!(null),
        json!({}),
        json!({"unknown":1}),
        json!({"reason":null}),
        json!({"reason":3}),
        json!({"reason":false}),
        json!([]),
        json!(""),
        json!(false),
        json!({"reason":"x".repeat(500)}),
        json!({"reason":"x".repeat(501)}),
        json!({"reason":"😀".repeat(500)}),
        json!({"reason":"😀".repeat(501)}),
        json!({"reason":format!(" {} ","😀".repeat(250))}),
        json!({"reason":"😀".repeat(251)}),
        json!({"reason":" \u{feff}\u{a0} "}),
    ] {
        steps.push(
            json!({"method":"POST","path":"/api/agent-control/halt","user":"owner","body":body}),
        );
    }
    scenario(json!({"steps":steps})).await;
}
#[tokio::test]
async fn service_errors_preserve_commits_and_audit_is_best_effort() {
    scenario(json!({"steps":[
        {"method":"POST","path":"/api/agent-control/halt","user":"owner","stopThrow":"node refused"},
        {"method":"POST","path":"/api/agent-control/halt","user":"owner","stopThrow":""},
        {"method":"POST","path":"/api/agent-control/resume","user":"owner","auditThrow":true},
        {"method":"POST","path":"/api/agent-control/halt","user":"owner","auditThrow":true,"changeThrow":"change failed"},
        {"method":"GET","path":"/api/agent-control","user":"owner"},
        {"method":"POST","path":"/api/agent-control/resume","user":"owner","changeThrow":"change failed"},
        {"method":"GET","path":"/api/agent-control","user":"owner"}
    ]})).await;
    scenario(json!({"noAudit":true,"steps":[{"method":"POST","path":"/api/agent-control/halt","user":"owner"},{"method":"POST","path":"/api/agent-control/resume","user":"owner"}]})).await;
}
#[tokio::test]
async fn failed_persistence_prevents_stop_and_concurrent_resume_wins() {
    scenario(json!({"sql":"CREATE TRIGGER refuse_halt BEFORE INSERT ON agent_control BEGIN SELECT RAISE(FAIL,'refuse'); END","steps":[{"method":"POST","path":"/api/agent-control/halt","user":"owner"},{"method":"GET","path":"/api/agent-control","user":"owner"}]})).await;
    scenario(json!({"steps":[{"method":"POST","path":"/api/agent-control/halt","user":"owner","interleaveResume":true,"stopResult":1},{"method":"GET","path":"/api/agent-control","user":"owner"}]})).await;
}
#[tokio::test]
async fn malformed_json_content_types_and_poisoned_fields_never_stop_work() {
    scenario(json!({"steps":[
        {"method":"POST","path":"/api/agent-control/halt","user":"owner","raw":"{","headers":{"content-type":"application/json"}},
        {"method":"POST","path":"/api/agent-control/halt","user":"owner","raw":"","headers":{"content-type":"application/json"}},
        {"method":"POST","path":"/api/agent-control/halt","user":"owner","body":{"__proto__":{"polluted":true}}},
        {"method":"POST","path":"/api/agent-control/halt","user":"owner","body":{"nested":{"constructor":{"prototype":{}}}}},
        {"method":"POST","path":"/api/agent-control/halt","user":"owner","body":{"reason":"valid"},"headers":{"content-type":"application/xml"}},
        {"method":"POST","path":"/api/agent-control/resume","user":"owner","raw":"ignored","headers":{"content-type":"text/plain"}},
        {"method":"GET","path":"/api/agent-control","user":"owner"}
    ]})).await;
}
#[tokio::test]
async fn pending_teardown_keeps_halt_readable_and_resumable_over_http() {
    let auth = auth();
    let mut routes = AgentControlRoutes::new(auth.clone());
    let entered = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let started = entered.clone();
    let wait = release.clone();
    routes.stop_running = Arc::new(move |_| {
        let started = started.clone();
        let wait = wait.clone();
        Box::pin(async move {
            started.notify_one();
            wait.notified().await;
            Ok(AgentStopResult::Count(1.0))
        })
    });
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_agent_control(routes);
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(gateway.serve(async {
        let _ = receive.await;
    }));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap();
    let req = client
        .post(format!("{base}/api/agent-control/halt"))
        .bearer_auth(token("owner"))
        .header("connection", "close");
    let pending =
        tokio::spawn(async move { req.send().await.unwrap().json::<Value>().await.unwrap() });
    tokio::time::timeout(Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    let read = client
        .get(format!("{base}/api/agent-control"))
        .bearer_auth(token("owner"))
        .header("connection", "close")
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(read["state"]["halted"], true);
    let resume = client
        .post(format!("{base}/api/agent-control/resume"))
        .bearer_auth(token("owner"))
        .header("connection", "close")
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(resume["state"]["halted"], false);
    release.notify_one();
    assert_eq!(pending.await.unwrap()["state"]["halted"], false);
    send.send(()).unwrap();
    server.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
}
