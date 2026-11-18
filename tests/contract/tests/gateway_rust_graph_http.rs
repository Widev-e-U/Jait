#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    db,
    routes::{
        auth::AuthState,
        code_graph::{CodeGraphBackend, CodeGraphRoutes},
    },
    security::http_auth::{self, AuthUser},
    services::code_graph::engine::GraphError,
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
    projects: Vec<Value>,
}
impl CodeGraphBackend for Backend {
    fn list_active_projects(&self, user: String) -> BoxFuture<'_, Result<Vec<Value>, GraphError>> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"method":"projects.list","status":"active","userId":user}));
        let step = self.step.lock().unwrap().clone();
        let projects = self.projects.clone();
        Box::pin(async move {
            if let Some(error) = step["projectError"].as_str() {
                return Err(GraphError::error(error));
            }
            Ok(step["projects"].as_array().cloned().unwrap_or(projects))
        })
    }
    fn call(
        &self,
        method: &str,
        params: Value,
        signal: Option<jait_gateway::execution::process_runner::ProcessCancellation>,
    ) -> BoxFuture<'_, Result<Value, GraphError>> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"method":method,"params":params,"hasSignal":signal.is_some()}));
        let step = self.step.lock().unwrap().clone();
        Box::pin(async move {
            if step["unavailable"] == true {
                let mut e = GraphError::unavailable();
                if let Some(message) = step["error"].as_str() {
                    e.message = message.into();
                }
                return Err(e);
            }
            if let Some(error) = step["error"].as_str() {
                return Err(GraphError::error(error));
            }
            Ok(step.get("result").cloned().unwrap_or(Value::Null))
        })
    }
}
async fn compare(mut call: Value) {
    call["op"] = json!("nativegraphhttp.routes");
    let base = root()
        .join(".jait/artifacts/gateway-rust/code-graph/http")
        .join(uuid::Uuid::new_v4().to_string());
    let expected = internal_driver::call(
        &root(),
        &base.join("driver"),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "code-graph-http-fixture".into()).unwrap();
    let step = Arc::new(Mutex::new(Value::Null));
    let events = Arc::new(Mutex::new(vec![]));
    let backend = Arc::new(Backend {
        step: step.clone(),
        events: events.clone(),
        projects: call["projects"].as_array().cloned().unwrap_or_default(),
    });
    let routes = CodeGraphRoutes {
        auth: auth.clone(),
        backend,
        cwd: root().to_str().unwrap().into(),
    }
    .router();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        axum::serve(listener, routes)
            .with_graceful_shutdown(async {
                let _ = receive.await;
            })
            .await
            .unwrap()
    });
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut results = vec![];
    for s in call["steps"].as_array().unwrap() {
        *step.lock().unwrap() = s.clone();
        let mut request = client
            .request(
                s["method"].as_str().unwrap().parse().unwrap(),
                format!("{url}{}", s["path"].as_str().unwrap()),
            )
            .header("host", "fixture.local")
            .header("connection", "close");
        if let Some(headers) = s["headers"].as_object() {
            for (k, v) in headers {
                request = request.header(k, v.as_str().unwrap());
            }
        }
        if let Some(user) = s["user"].as_str().or(s["cookie"].as_str()) {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: if user == "owner" { "alice" } else { "bob" }.into(),
                },
                "code-graph-http-fixture",
            )
            .unwrap();
            request = if s["cookie"].is_string() {
                request.header("cookie", format!("jait_token={token}"))
            } else {
                request.bearer_auth(token)
            };
        }
        if let Some(raw) = s["raw"].as_str() {
            request = request.body(raw.to_owned());
        } else if let Some(body) = s.get("body") {
            request = request.json(body);
        }
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let content_type = response
            .headers()
            .get("content-type")
            .map(|v| v.to_str().unwrap().to_owned());
        let raw = response.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body,"contentType":content_type}));
    }
    send.send(()).unwrap();
    task.await.unwrap();
    auth.shutdown().await.unwrap();
    let actual = json!({"results":results,"events":*events.lock().unwrap()});
    if actual != expected {
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(
            base.join("native.json"),
            serde_json::to_string_pretty(&actual).unwrap(),
        )
        .unwrap();
        std::fs::write(
            base.join("reference.json"),
            serde_json::to_string_pretty(&expected).unwrap(),
        )
        .unwrap();
        panic!("HTTP mismatch; evidence: {}", base.display());
    }
}
fn project() -> Value {
    json!({"id":"project-a","rootPath":"/repo","nodeId":null,"metadata":"{\"repoId\":\" repository-a \"}"})
}
#[tokio::test]
async fn ownership_auth_remote_guards_and_body_precedence_match_production_routes() {
    compare(json!({"projects":[project()],"steps":[
  {"method":"GET","path":"/api/code-graph?projectRoot=/repo"},
  {"method":"GET","path":"/api/code-graph?projectRoot=/repo","user":"missing"},
  {"method":"GET","path":"/api/code-graph","user":"owner"},
  {"method":"GET","path":"/api/code-graph?projectRoot=/nope","user":"owner"},
  {"method":"GET","path":"/api/code-graph?projectRoot=/repo","cookie":"owner","result":{"status":"missing"}},
  {"method":"GET","path":"/api/code-graph?projectRoot=/repo/","user":"other","projects":[{"rootPath":"/repo","nodeId":"remote-node"}]},
  {"method":"POST","path":"/api/code-graph/index?projectRoot=/wrong","user":"owner","body":{"projectRoot":" /repo/ "},"result":{"status":"ready"}},
  {"method":"GET","path":"/api/code-graph?projectRoot=/repo","user":"owner","projectError":"storage offline"}
 ]})).await;
}
#[tokio::test]
async fn all_service_parameters_responses_and_graph_errors_match_reference() {
    let mut steps = vec![];
    for limit in [
        "",
        "?maxNodes=7junk",
        "?maxNodes=-3",
        "?maxNodes=1e2",
        "?maxNodes=Infinity",
        "?maxNodes=1&maxNodes=2",
        "?maxNodes=%EF%BB%BF%2B12tail",
        "?maxNodes=-0",
        "?maxNodes=0x20",
        "?maxNodes=9007199254740993",
        "?maxNodes=9223372036854775000",
    ] {
        let suffix = limit
            .strip_prefix('?')
            .map(|s| format!("&{s}"))
            .unwrap_or_default();
        steps.push(json!({"method":"GET","path":format!("/api/code-graph/snapshot?projectRoot=/repo{suffix}"),"user":"owner","result":{"nodes":[]}}));
    }
    for (route, extra) in [
        (
            "query",
            json!({"query":" why auth ","mode":"hybrid","maxNodes":9,"maxDepth":2}),
        ),
        ("path", json!({"source":"A","target":"B","maxDepth":4})),
        ("graphrag/prepare", json!({})),
        ("index", json!({})),
    ] {
        let mut body = json!({"projectRoot":"/repo"});
        body.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        for problem in [
            json!({"result":{"ok":"fixture"}}),
            json!({"error":"Code graph has not been indexed"}),
            json!({"error":"engine refused"}),
            json!({"unavailable":true}),
        ] {
            let mut s = json!({"method":"POST","path":format!("/api/code-graph/{route}"),"user":"owner","body":body});
            s.as_object_mut()
                .unwrap()
                .extend(problem.as_object().unwrap().clone());
            steps.push(s);
        }
    }
    steps.extend([json!({"method":"POST","path":"/api/code-graph/query","user":"owner","body":{"projectRoot":"/repo","query":" "}}),json!({"method":"POST","path":"/api/code-graph/path","user":"owner","body":{"projectRoot":"/repo","source":"A"}}),json!({"method":"POST","path":"/api/code-graph/path","user":"owner","body":{"projectRoot":"/repo","source":"A","target":"B"},"result":null})]);
    compare(json!({"projects":[project()],"steps":steps})).await;
}

#[tokio::test]
async fn malformed_field_types_and_duplicate_roots_match_without_service_effects() {
    let mut steps = vec![];
    for value in [json!(true), json!(7), json!([]), json!({}), Value::Null] {
        steps.push(json!({"method":"POST","path":"/api/code-graph/index","user":"owner","body":{"projectRoot":value}}));
        for field in ["query", "source", "target"] {
            let route = if field == "query" { "query" } else { "path" };
            let mut body = json!({"projectRoot":"/repo","query":"Auth","source":"A","target":"B"});
            body[field] = value.clone();
            steps.push(json!({"method":"POST","path":format!("/api/code-graph/{route}"),"user":"owner","body":body}));
        }
    }
    steps.push(json!({"method":"GET","path":"/api/code-graph?projectRoot=/repo&projectRoot=/repo","user":"owner"}));
    compare(json!({"projects":[project()],"steps":steps})).await;
}

#[tokio::test]
async fn root_normalization_repository_metadata_and_validation_order_match() {
    let mut steps = vec![];
    for (supplied, stored) in [
        (" /repo/// ", "/repo"),
        ("C:\\REPO\\", "c:/repo"),
        ("repo/../repo", "repo/../repo/"),
        ("/repo/./child", "/repo/./child"),
    ] {
        steps.push(json!({"method":"POST","path":"/api/code-graph/index","user":"owner","body":{"projectRoot":supplied},"projects":[{"rootPath":stored,"nodeId":"gateway"}],"result":{"ok":true}}));
    }
    for metadata in [
        "{}",
        "null",
        "[]",
        "broken",
        r#"{"repositoryId":" chosen ","repoId":"ignored"}"#,
        r#"{"repositoryId":null,"repoId":" fallback "}"#,
        r#"{"repositoryId":"  ","repoId":"ignored"}"#,
        r#"{"repositoryId":7,"repoId":"ignored"}"#,
    ] {
        steps.push(json!({"method":"POST","path":"/api/code-graph/index","user":"owner","body":{"projectRoot":"/repo"},"projects":[{"rootPath":"/repo","metadata":metadata}],"result":{"ok":true}}));
    }
    // Project ownership and remote checks run before query validation.
    steps.push(json!({"method":"POST","path":"/api/code-graph/query","user":"owner","body":{"projectRoot":"/absent","query":7}}));
    steps.push(json!({"method":"POST","path":"/api/code-graph/query","user":"owner","body":{"projectRoot":"/repo","query":7},"projects":[{"rootPath":"/repo","nodeId":"node-a"}]}));
    // A missing source short-circuits the invalid target's trim operation.
    steps.push(json!({"method":"POST","path":"/api/code-graph/path","user":"owner","body":{"projectRoot":"/repo","source":" ","target":7}}));
    // The synchronous getIndex call uses the framework error envelope.
    steps.push(json!({"method":"GET","path":"/api/code-graph?projectRoot=/repo","user":"owner","error":"index lookup failed"}));
    compare(json!({"projects":[project()],"steps":steps})).await;
}

#[tokio::test]
async fn native_disconnect_cancels_only_the_request_execution_signal() {
    use jait_gateway::execution::process_runner::ProcessCancellation;
    struct PendingBackend {
        entered: Arc<tokio::sync::Notify>,
        signal: Arc<Mutex<Option<ProcessCancellation>>>,
    }
    impl CodeGraphBackend for PendingBackend {
        fn list_active_projects(
            &self,
            _user: String,
        ) -> BoxFuture<'_, Result<Vec<Value>, GraphError>> {
            Box::pin(async { Ok(vec![project()]) })
        }
        fn call(
            &self,
            method: &str,
            _params: Value,
            signal: Option<ProcessCancellation>,
        ) -> BoxFuture<'_, Result<Value, GraphError>> {
            assert_eq!(method, "index");
            let signal = signal.expect("every index request has its own cancellation signal");
            *self.signal.lock().unwrap() = Some(signal.clone());
            self.entered.notify_one();
            Box::pin(async move {
                signal.wait_cancelled().await;
                Err(GraphError::error("request cancelled"))
            })
        }
    }
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "code-graph-http-fixture".into()).unwrap();
    let entered = Arc::new(tokio::sync::Notify::new());
    let captured = Arc::new(Mutex::new(None));
    let router = CodeGraphRoutes {
        auth: auth.clone(),
        backend: Arc::new(PendingBackend {
            entered: entered.clone(),
            signal: captured.clone(),
        }),
        cwd: root().to_str().unwrap().into(),
    }
    .router();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "http://{}/api/code-graph/index",
        listener.local_addr().unwrap()
    );
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = stopped.await;
            })
            .await
            .unwrap()
    });
    let token = http_auth::sign_auth_token(
        &AuthUser {
            id: "owner".into(),
            username: "alice".into(),
        },
        "code-graph-http-fixture",
    )
    .unwrap();
    let request = tokio::spawn(async move {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(8))
            .pool_max_idle_per_host(0)
            .build()
            .unwrap()
            .post(url)
            .header("connection", "close")
            .bearer_auth(token)
            .json(&json!({"projectRoot":"/repo"}))
            .send()
            .await
    });
    tokio::time::timeout(Duration::from_secs(5), entered.notified())
        .await
        .unwrap();
    let signal = captured.lock().unwrap().clone().unwrap();
    request.abort();
    let _ = request.await;
    let cancelled = tokio::time::timeout(Duration::from_secs(2), signal.wait_cancelled())
        .await
        .is_ok();
    // Cleanup also runs on an assertion failure so the test cannot strand a server.
    signal.cancel();
    let _ = stop.send(());
    tokio::time::timeout(Duration::from_secs(5), server)
        .await
        .unwrap()
        .unwrap();
    auth.shutdown().await.unwrap();
    assert!(cancelled, "disconnect must cancel the scoped index request");
}
