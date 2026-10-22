#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{
        auth::AuthState,
        maintenance::{MaintenanceBackend, MaintenanceRoutes},
    },
    security::http_auth::{self, AuthUser},
    tools::maintenance::{MaintenanceError, NotificationSink},
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
struct Backend {
    step: Arc<Mutex<Value>>,
    events: Arc<Mutex<Vec<Value>>>,
}
fn error(step: &Value, field: &str) -> Result<(), MaintenanceError> {
    if let Some(v) = step.get(field) {
        return Err(if step["errorKind"] == "thrown" {
            MaintenanceError::Thrown(v.clone())
        } else {
            MaintenanceError::Message(v.as_str().unwrap().into())
        });
    }
    Ok(())
}
impl MaintenanceBackend for Backend {
    fn list_runs(
        &self,
        job: Option<String>,
        limit: f64,
    ) -> BoxFuture<'_, Result<Vec<Value>, MaintenanceError>> {
        self.events.lock().unwrap().push(json!({"op":"list","jobId":job,"limit":if limit.fract()==0.0{json!(limit as i64)}else{json!(limit)}}));
        let step = self.step.lock().unwrap().clone();
        Box::pin(async move {
            error(&step, "error")?;
            Ok(step["result"].as_array().cloned().unwrap_or_default())
        })
    }
    fn get_run(&self, id: String) -> BoxFuture<'_, Result<Option<Value>, MaintenanceError>> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"op":"get","id":id}));
        let step = self.step.lock().unwrap().clone();
        Box::pin(async move {
            error(&step, "error")?;
            Ok(step.get("result").filter(|v| !v.is_null()).cloned())
        })
    }
    fn run_for_repo(
        &self,
        repo_id: String,
        job_id: String,
    ) -> BoxFuture<'_, Result<Value, MaintenanceError>> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"op":"run","repoId":repo_id,"jobId":job_id}));
        let step = self.step.lock().unwrap().clone();
        Box::pin(async move {
            error(&step, "error")?;
            Ok(step["result"].clone())
        })
    }
}
async fn compare(mut call: Value) {
    let root = root();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    call["now"] = json!(now);
    call["op"] = json!("nativemaintenancehttp.routes");
    let expected = internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/maintenance-http")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let connection = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    let auth = AuthState::new(connection, "maintenance-http-fixture".into()).unwrap();
    let step = Arc::new(Mutex::new(Value::Null));
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let bstep = step.clone();
    let bevents = events.clone();
    let nstep = step.clone();
    let nevents = events.clone();
    let notifications: NotificationSink = Arc::new(move |notification| {
        let mut v = serde_json::to_value(notification).unwrap();
        v["op"] = json!("notify");
        nevents.lock().unwrap().push(v);
        error(&nstep.lock().unwrap(), "notificationError")
    });
    let routes = MaintenanceRoutes {
        auth: auth.clone(),
        clock: Arc::new(move || now),
        backend: Arc::new(Backend {
            step: step.clone(),
            events: events.clone(),
        }),
        notifications: if call["noNotifications"] == true {
            None
        } else {
            Some(notifications)
        },
        broadcast: if call["noBroadcast"] == true {
            None
        } else {
            Some(Arc::new(move |event| {
                bevents
                    .lock()
                    .unwrap()
                    .push(json!({"op":"broadcast","event":event}));
                error(&bstep.lock().unwrap(), "broadcastError")
            }))
        },
    };
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_maintenance(routes);
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
    for s in call["steps"].as_array().unwrap() {
        *step.lock().unwrap() = s.clone();
        let mut request = client
            .request(
                s["method"].as_str().unwrap().parse().unwrap(),
                format!("{base}{}", s["path"].as_str().unwrap()),
            )
            .header("host", "fixture.local")
            .header("connection", "close");
        if let Some(h) = s["headers"].as_object() {
            for (k, v) in h {
                request = request.header(k, v.as_str().unwrap());
            }
        }
        if let Some(user) = s["user"].as_str().or(s["cookie"].as_str()) {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: if user == "owner" { "alice" } else { "bob" }.into(),
                },
                "maintenance-http-fixture",
            )
            .unwrap();
            request = if s["cookie"].is_string() {
                request.header("cookie", format!("jait_token={token}"))
            } else {
                request.bearer_auth(token)
            };
        }
        if let Some(raw) = s["raw"].as_str() {
            request = request.body(raw.to_string());
        } else if let Some(body) = s.get("body") {
            request = request.json(body);
        }
        if s["oversize"] == true {
            request = request
                .header("content-type", "application/json")
                .body("x".repeat(26 * 1024 * 1024));
        }
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let content_type = response
            .headers()
            .get("content-type")
            .map(|v| v.to_str().unwrap().to_string());
        let raw = response.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body,"contentType":content_type}));
    }
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    let actual = json!({"results":results,"events":*events.lock().unwrap()});
    for (i, (a, e)) in actual["results"]
        .as_array()
        .unwrap()
        .iter()
        .zip(expected["results"].as_array().unwrap())
        .enumerate()
    {
        assert_eq!(a, e, "maintenance HTTP parity response {i}");
    }
    assert_eq!(actual, expected, "maintenance HTTP parity");
}
fn run(passed: bool, plan: Option<Value>) -> Value {
    let mut v = json!({"id":"run-1","jobId":"job-1","repoId":"repo-1","repoName":"Fixture 🦀","checks":[{"name":"Tests","command":"fixture test","passed":passed,"output":"evidence","durationMs":12}],"allPassed":passed,"startedAt":"start","completedAt":"end"});
    if let Some(p) = plan {
        v["planId"] = p;
    }
    v
}
#[tokio::test]
async fn authentication_filters_limits_details_and_no_side_effects_on_denied_requests() {
    let mut steps = vec![
        json!({"method":"GET","path":"/api/maintenance/runs"}),
        json!({"method":"GET","path":"/api/maintenance/runs","user":"missing"}),
        json!({"method":"POST","path":"/api/maintenance/run","body":{"repoId":"r"}}),
        json!({"method":"GET","path":"/api/maintenance/runs/nope","cookie":"owner"}),
        json!({"method":"GET","path":"/api/maintenance/runs/a%2Fb","user":"other","result":run(true,None)}),
        json!({"method":"GET","path":"/api/maintenance/runs/%FF","user":"owner"}),
        json!({"method":"GET","path":"/api/maintenance/runs/%zz","user":"owner"}),
    ];
    for q in [
        "",
        "?jobId=x",
        "?jobId=&limit=0",
        "?jobId=a&jobId=b&limit=7",
        "?limit=1.5",
        "?limit=-4",
        "?limit=999",
        "?limit=Infinity",
        "?limit=-Infinity",
        "?limit=NaN",
        "?limit=0x10",
        "?limit=0b10",
        "?limit=0o10",
        "?limit=1e2",
        "?limit=1&limit=2",
        "?limit=%EF%BB%BF7%EF%BB%BF",
        "?limit=7junk",
        "?limit=inf",
    ] {
        steps.push(json!({"method":"GET","path":format!("/api/maintenance/runs{q}"),"user":"owner","result":[run(true,None)]}));
    }
    compare(json!({"steps":steps})).await;
}
#[tokio::test]
async fn run_success_failure_broadcast_notification_payloads_and_optional_sinks() {
    for (no_broadcast, no_notifications) in
        [(false, false), (true, false), (false, true), (true, true)]
    {
        compare(json!({"noBroadcast":no_broadcast,"noNotifications":no_notifications,"steps":[
   {"method":"POST","path":"/api/maintenance/run","user":"owner","body":{"repoId":"repo-1"},"result":run(true,None)},
   {"method":"POST","path":"/api/maintenance/run","cookie":"other","body":{"repoId":"  repo-1  "},"result":run(false,Some(json!("plan-1")))},
   {"method":"POST","path":"/api/maintenance/run","user":"owner","body":{"repoId":"repo-1"},"result":run(false,Some(json!("")))},
   {"method":"POST","path":"/api/maintenance/run","user":"owner","body":{"repoId":"repo-1"},"result":run(false,Some(Value::Null))}
  ]})).await;
    }
}
#[tokio::test]
async fn rejects_invalid_repo_values_and_propagates_service_and_sink_errors() {
    let mut steps = vec![];
    for body in [
        Value::Null,
        json!({}),
        json!([]),
        json!(7),
        json!({"repoId":false}),
        json!({"repoId":7}),
        json!({"repoId":[]}),
        json!({"repoId":""}),
    ] {
        steps.push(
            json!({"method":"POST","path":"/api/maintenance/run","user":"owner","body":body}),
        );
    }
    for field in ["error", "broadcastError", "notificationError"] {
        for thrown in [false, true] {
            let mut step = json!({"method":"POST","path":"/api/maintenance/run","user":"owner","body":{"repoId":"repo-1"},"result":run(false,Some(json!("plan-1")))});
            step[field] = if thrown {
                json!({"rejected":"fixture"})
            } else {
                json!("fixture rejected")
            };
            if thrown {
                step["errorKind"] = json!("thrown");
            }
            steps.push(step);
        }
    }
    steps.push(json!({"method":"GET","path":"/api/maintenance/runs","user":"owner","error":"list rejected"}));
    steps.push(json!({"method":"GET","path":"/api/maintenance/runs/id","user":"owner","error":"get rejected"}));
    compare(json!({"steps":steps})).await;
}

#[tokio::test]
async fn malformed_json_poisoning_media_types_and_head_do_not_dispatch_runs() {
    compare(json!({"steps":[
 {"method":"HEAD","path":"/api/maintenance/runs","user":"owner","result":[]},
 {"method":"HEAD","path":"/api/maintenance/runs/id","user":"owner","result":run(true,None)},
 {"method":"POST","path":"/api/maintenance/run","user":"owner","raw":"{","headers":{"content-type":"application/json"}},
 {"method":"POST","path":"/api/maintenance/run","user":"owner","raw":"","headers":{"content-type":"application/json"}},
 {"method":"POST","path":"/api/maintenance/run","user":"owner","body":{"repoId":"r","__proto__":{"polluted":true}}},
 {"method":"POST","path":"/api/maintenance/run","user":"owner","body":{"repoId":"r","constructor":{"prototype":{"polluted":true}}}},
 {"method":"POST","path":"/api/maintenance/run","user":"owner","raw":"x","headers":{"content-type":"application/octet-stream"}},
 {"method":"POST","path":"/api/maintenance/run","user":"owner","raw":"repo","headers":{"content-type":"text/plain"}},
 {"method":"POST","path":"/api/maintenance/run","user":"owner","oversize":true}
 ]})).await;
}
