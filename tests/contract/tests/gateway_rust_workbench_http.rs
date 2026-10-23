#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    contracts::bounded_json::Utf16Text,
    db,
    routes::{auth::AuthState, security_workbench::*},
    security::http_auth::{self, AuthUser},
    tools::{memory_tools::MemoryToolResult, security_dispatch::SecurityContext},
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
async fn compare(mut call: Value) {
    call["op"] = json!("nativeworkbenchhttp.run");
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/workbench-http-contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "workbench-route-fixture".into()).unwrap();
    let step = Arc::new(Mutex::new(Value::Null));
    let events = Arc::new(Mutex::new(vec![]));
    let active = step.clone();
    let calls = events.clone();
    let service: WorkbenchRoutePort = Arc::new(move |op, owner| {
        calls
            .lock()
            .unwrap()
            .push(json!({"name":op.name(),"args":op.arguments(&owner)}));
        let step = active.lock().unwrap().clone();
        Box::pin(async move {
            if let Some(error) = step["serviceError"].as_str() {
                Err(error.into())
            } else {
                Ok(step["reply"].clone())
            }
        })
    });
    let active = step.clone();
    let calls = events.clone();
    let monitor: MonitorRoutePort = Arc::new(move |input, context: SecurityContext<()>| {
        let mut context = context.fields;
        context["actionId"] = json!("<request>");
        context["projectRoot"] = json!("<project>");
        calls
            .lock()
            .unwrap()
            .push(json!({"name":"monitor","args":[input,context]}));
        let step = active.lock().unwrap().clone();
        Box::pin(async move {
            if let Some(error) = step["serviceError"].as_str() {
                return Err(error.into());
            }
            let value = &step["reply"];
            Ok(MemoryToolResult {
                ok: value["ok"].clone(),
                message: Utf16Text::from(value["message"].as_str().unwrap_or("")),
                data: value.get("data").cloned(),
            })
        })
    });
    let router = SecurityWorkbenchRoutes {
        auth: auth.clone(),
        service,
        monitor: if call["scheduler"] == true {
            Some(monitor)
        } else {
            None
        },
        project_root: root().to_string_lossy().into_owned(),
        request_id: Arc::new(|| uuid::Uuid::new_v4().to_string()),
    }
    .router();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = receive.await;
            })
            .await
            .unwrap()
    });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut results = vec![];
    for request in call["steps"].as_array().unwrap() {
        *step.lock().unwrap() = request.clone();
        let mut req = client.request(
            request["method"].as_str().unwrap().parse().unwrap(),
            format!("{base}{}", request["path"].as_str().unwrap()),
        );
        if let Some(headers) = request["headers"].as_object() {
            for (k, v) in headers {
                req = req.header(k, v.as_str().unwrap());
            }
        }
        if let Some(user) = request["user"].as_str() {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: if user == "owner" {
                        "alice".into()
                    } else {
                        "bob".into()
                    },
                },
                "workbench-route-fixture",
            )
            .unwrap();
            req = if request["cookie"] == true {
                req.header("cookie", format!("jait_token={token}"))
            } else {
                req.bearer_auth(token)
            };
        }
        if let Some(raw) = request["raw"].as_str() {
            req = req.body(raw.to_string());
        } else if let Some(body) = request.get("body") {
            req = req
                .header("content-type", "application/json")
                .body(body.to_string());
        }
        let result = req.send().await.unwrap();
        let status = result.status().as_u16();
        let raw = result.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body}));
    }
    let _ = send.send(());
    server.await.unwrap();
    auth.shutdown().await.unwrap();
    let actual = json!({"results":results,"events":*events.lock().unwrap()});
    if actual != expected {
        let out = root().join(".jait/artifacts/gateway-rust/workbench-http-diffs");
        std::fs::create_dir_all(&out).unwrap();
        let path = out.join(format!("{}.json", uuid::Uuid::new_v4()));
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(&json!({"input":call,"actual":actual,"expected":expected}))
                .unwrap(),
        )
        .unwrap();
        panic!("HTTP mismatch {}", path.display());
    }
}
fn routes() -> Vec<Value> {
    vec![
        json!({"method":"GET","path":"/api/security/workbench","reply":{"runs":[],"findings":[]}}),
        json!({"method":"POST","path":"/api/security/comparisons","body":{"beforeRunId":"before","afterRunId":"after"},"reply":{"comparable":false}}),
        json!({"method":"GET","path":"/api/security/engines","reply":[{"engine":"fixture","available":false}]}),
        json!({"method":"POST","path":"/api/security/checks","body":{"scopeId":"scope","profile":"tls","operatorId":"forged","executionNodeId":"remote"},"reply":{"id":"run","status":"running"}}),
        json!({"method":"GET","path":"/api/security/checks/run%20%E2%98%83?x=1","reply":{"id":"run ☃"}}),
        json!({"method":"POST","path":"/api/security/checks/run/cancel","reply":null}),
        json!({"method":"GET","path":"/api/security/checks/run/report","reply":{"redacted":true}}),
        json!({"method":"DELETE","path":"/api/security/checks/run","reply":null}),
        json!({"method":"GET","path":"/api/security/findings/finding/plan","reply":{"requiresApproval":true}}),
        json!({"method":"POST","path":"/api/security/findings/finding/verify","reply":{"status":"inconclusive"}}),
        json!({"method":"POST","path":"/api/security/findings/finding/decision","body":{"disposition":"accepted-risk","operatorId":"forged"},"reply":{"disposition":"accepted-risk"}}),
    ]
}
#[tokio::test]
async fn authenticated_routes_preserve_owner_inputs_statuses_and_cookie_auth() {
    let mut steps = vec![];
    for user in ["owner", "other"] {
        for (i, mut route) in routes().into_iter().enumerate() {
            route["user"] = json!(user);
            route["cookie"] = json!(i % 2 == 1);
            steps.push(route);
        }
    }
    compare(json!({"steps":steps})).await;
}
#[tokio::test]
async fn missing_invalid_tokens_and_every_service_failure_have_no_extra_effects() {
    let mut steps = vec![];
    for route in routes() {
        steps.push(route.clone());
        let mut invalid = route.clone();
        invalid["headers"] = json!({"authorization":"Bearer broken"});
        steps.push(invalid);
        let mut failure = route;
        failure["user"] = json!("owner");
        failure["serviceError"] = json!("fixture private failure");
        steps.push(failure);
    }
    compare(json!({"steps":steps})).await;
}
#[tokio::test]
async fn monitor_context_is_gateway_owned_and_failure_responses_match() {
    compare(json!({"scheduler":true,"steps":[
 {"method":"POST","path":"/api/security/monitors","body":{"input":{"scopeId":"scope"},"requestedBy":"forged"},"reply":{"ok":true,"message":"Scheduled","data":{"id":"job"}}},
 {"method":"POST","path":"/api/security/monitors","user":"owner","body":{"input":{"scopeId":"scope"},"requestedBy":"forged"},"reply":{"ok":true,"message":"Scheduled","data":{"id":"job"}}},
 {"method":"POST","path":"/api/security/monitors","user":"other","cookie":true,"body":{},"reply":{"ok":false,"message":"Scope not found"}},
 {"method":"POST","path":"/api/security/monitors","user":"owner","body":{},"serviceError":"fixture monitor failed"}
 ]})).await;
}
#[tokio::test]
async fn missing_and_null_comparison_or_decision_bodies_do_not_call_service() {
    compare(json!({"steps":[
 {"method":"POST","path":"/api/security/comparisons","user":"owner","body":null},
 {"method":"POST","path":"/api/security/comparisons","user":"owner"},
 {"method":"POST","path":"/api/security/findings/f/decision","user":"owner","body":null},
 {"method":"POST","path":"/api/security/findings/f/decision","user":"owner"},
 {"method":"POST","path":"/api/security/comparisons","user":"owner","body":{},"reply":{"comparable":false}},
 {"method":"POST","path":"/api/security/findings/f/decision","user":"owner","body":{},"reply":{"disposition":"open"}}
 ]})).await;
}
