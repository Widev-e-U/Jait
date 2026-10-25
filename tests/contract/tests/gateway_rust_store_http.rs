#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    routes::{auth::AuthState, store::*},
    security::http_auth::{self, AuthUser},
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
fn ryu_js_number(value: f64) -> String {
    if value.is_finite() {
        if value.fract() == 0.0 && value.abs() < 1e18 {
            format!("{value:.0}")
        } else {
            value.to_string()
        }
    } else {
        "null".into()
    }
}
fn operation(op: StoreOperation) -> (&'static str, Vec<Value>) {
    match op {
        StoreOperation::ListInstalled => ("listInstalled", vec![]),
        StoreOperation::Search { query, limit } => (
            "search",
            vec![query, serde_json::from_str(&ryu_js_number(limit)).unwrap()],
        ),
        StoreOperation::GetSkill(id) => ("getSkill", vec![json!(id)]),
        StoreOperation::IsInstalled(id) => ("isInstalled", vec![json!(id)]),
        StoreOperation::Install { slug, version } => {
            ("install", vec![json!(slug), version.unwrap_or(Value::Null)])
        }
        StoreOperation::Uninstall(id) => ("uninstall", vec![json!(id)]),
        StoreOperation::ListPackages { limit } => (
            "packages",
            vec![serde_json::from_str(&ryu_js_number(limit)).unwrap()],
        ),
    }
}
async fn compare(steps: Value) {
    let call = json!({"op":"nativestorehttp.run","steps":steps});
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/store/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "store-route-fixture".into()).unwrap();
    let active = Arc::new(Mutex::new(Value::Null));
    let events = Arc::new(Mutex::new(vec![]));
    let state = active.clone();
    let log = events.clone();
    let manager: StorePort = Arc::new(move |op| {
        let (name, args) = operation(op);
        log.lock()
            .unwrap()
            .push(json!({"name":name,"args":args.clone()}));
        let step = state.lock().unwrap().clone();
        Box::pin(async move {
            if step["errorAt"] == name {
                return Err(if let Some(v) = step.get("thrown") {
                    StoreError::Thrown(v.clone())
                } else {
                    StoreError::Message(step["error"].as_str().unwrap().into())
                });
            }
            let value = if name == "getSkill" && step.get("details").is_some() {
                step["details"].get(args[0].as_str().unwrap()).cloned()
            } else {
                step["replies"].get(name).cloned()
            };
            if let Some(message) = value.as_ref().and_then(|v| v["__error"].as_str()) {
                return Err(StoreError::Message(message.into()));
            }
            if value.as_ref().is_some_and(|v| v["__pending"] == true) {
                std::future::pending::<()>().await;
            }
            Ok(value.unwrap_or_else(|| match name {
                "listInstalled" | "search" | "packages" => json!([]),
                "isInstalled" => json!(false),
                _ => Value::Null,
            }))
        })
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let app = StoreRoutes {
        auth: auth.clone(),
        port: manager,
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
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let mut results = vec![];
    for step in steps.as_array().unwrap() {
        *active.lock().unwrap() = step.clone();
        let method = step["method"].as_str().unwrap().parse().unwrap();
        let mut request =
            client.request(method, format!("{base}{}", step["path"].as_str().unwrap()));
        if let Some(headers) = step["headers"].as_object() {
            for (key, value) in headers {
                request = request.header(key, value.as_str().unwrap());
            }
        }
        if let Some(user) = step["user"].as_str() {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: "alice".into(),
                },
                "store-route-fixture",
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
        let result = request.send().await.unwrap();
        let status = result.status().as_u16();
        let raw = result.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body}));
    }
    let _ = send.send(());
    server.await.unwrap();
    auth.shutdown().await.unwrap();
    assert_eq!(
        json!({"results":results,"events":*events.lock().unwrap()}),
        expected
    );
}
#[tokio::test]
async fn store_queries_and_enrichment_match_actual_typescript() {
    let mut steps = vec![];
    for query in [
        "",
        "?q=rust&limit=4",
        "?sort=trending",
        "?q=&sort=newest",
        "?limit=0",
        "?limit=-4",
        "?limit=200",
        "?limit=NaN",
        "?limit=Infinity",
        "?limit=-Infinity",
        "?limit=0x20",
        "?limit=2.75",
        "?limit=2&limit=3",
        "?q=a&q=b",
        "?q=%F0%9F%90%88&cursor=ignored",
    ] {
        steps.push(json!({"method":"GET","path":format!("/api/store/skills{query}"),"user":"owner","replies":{"listInstalled":[{"id":"one"}],"search":[{"slug":"one","score":1,"stats":{"old":1}},{"slug":"two"},{"summary":"no slug"}]},"details":{"one":{"skill":{"stats":{"downloads":50,"stars":2}},"latestVersion":{"version":"1.2"}},"two":{"__error":"optional lookup failed"},"":null}}));
    }
    for limit in [
        "",
        "?limit=1000",
        "?limit=-2",
        "?limit=abc",
        "?limit=0",
        "?limit=1&limit=2",
    ] {
        steps.push(json!({"method":"GET","path":format!("/api/store/packages{limit}"),"user":"owner","replies":{"packages":[{"name":"plugin"}]}}));
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn store_detail_install_uninstall_and_failures_match_typescript() {
    let mut steps = vec![];
    for slug in ["one", "install", "a%2Fb", "%F0%9F%90%88", "a%20b"] {
        steps.push(json!({"method":"GET","path":format!("/api/store/skills/{slug}"),"user":"owner","replies":{"getSkill":{"skill":{"slug":"one"},"owner":null,"installed":"overwritten"},"isInstalled":true}}));
    }
    for body in [
        json!({}),
        json!(null),
        json!({"version":"1.2"}),
        json!({"version":null}),
        json!({"version":false}),
        json!([]),
        json!("abc"),
    ] {
        steps.push(json!({"method":"POST","path":"/api/store/skills/one/install","user":"owner","body":body,"replies":{"install":{"id":"one","source":"clawhub"}}}));
    }
    steps.push(json!({"method":"DELETE","path":"/api/store/skills/one","user":"owner"}));
    for (method, path, op) in [
        ("GET", "/api/store/skills", "listInstalled"),
        ("GET", "/api/store/skills", "search"),
        ("GET", "/api/store/skills/one", "getSkill"),
        ("GET", "/api/store/skills/one", "isInstalled"),
        ("GET", "/api/store/packages", "packages"),
        ("POST", "/api/store/skills/one/install", "install"),
        ("DELETE", "/api/store/skills/one", "uninstall"),
    ] {
        for error in ["host failure", "not a ClawHub-installed skill: one"] {
            steps.push(
                json!({"method":method,"path":path,"user":"owner","errorAt":op,"error":error}),
            );
        }
        if method != "GET" {
            for thrown in [
                json!(null),
                json!({"reason":"denied"}),
                json!([1, 2]),
                json!(false),
            ] {
                steps.push(json!({"method":method,"path":path,"user":"owner","errorAt":op,"thrown":thrown}));
            }
        }
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn store_auth_and_body_parser_reject_before_effects() {
    compare(json!([
        {"method":"GET","path":"/api/store/skills"},
        {"method":"DELETE","path":"/api/store/skills/one"},
        {"method":"POST","path":"/api/store/skills/one/install","raw":"{","headers":{"content-type":"application/json"}},
        {"method":"POST","path":"/api/store/skills/one/install","user":"owner","raw":"{","headers":{"content-type":"application/json"}},
        {"method":"GET","path":"/api/store/skills/bad%ZZ","user":"owner"},
        {"method":"GET","path":"/api/store/skills/%FF","user":"owner"},
        {"method":"GET","path":"/api/store/packages","user":"owner","cookie":true}
    ])).await;
}
#[tokio::test]
async fn store_optional_lookup_times_out_without_losing_search_result() {
    compare(json!([{"method":"GET","path":"/api/store/skills","user":"owner","replies":{"search":[{"slug":"pending","score":1}]},"details":{"pending":{"__pending":true}}}])).await;
}
