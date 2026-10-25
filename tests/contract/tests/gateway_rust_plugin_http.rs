#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    routes::{auth::AuthState, plugins::*},
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
fn operation(op: PluginOperation) -> (&'static str, Vec<Value>) {
    match op {
        PluginOperation::List => ("listInstalled", vec![]),
        PluginOperation::Get(id) => ("getPlugin", vec![json!(id)]),
        PluginOperation::Enable(id) => ("enable", vec![json!(id)]),
        PluginOperation::Disable(id) => ("disable", vec![json!(id)]),
        PluginOperation::Uninstall(id) => ("uninstall", vec![json!(id)]),
        PluginOperation::GetConfig(id) => ("getPluginConfig", vec![json!(id)]),
        PluginOperation::SetConfig(id, value) => ("setPluginConfig", vec![json!(id), json!(value)]),
        PluginOperation::SyncAndLoad => ("syncAndLoad", vec![]),
    }
}
async fn compare(steps: Value) {
    let call = json!({"op":"nativepluginshttp.run","steps":steps});
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/plugin-http/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "plugins-route-fixture".into()).unwrap();
    let active = Arc::new(Mutex::new(Value::Null));
    let events = Arc::new(Mutex::new(vec![]));
    let state = active.clone();
    let log = events.clone();
    let manager: PluginManagerPort = Arc::new(move |op| {
        let (name, args) = operation(op);
        log.lock().unwrap().push(json!({"name":name,"args":args}));
        let step = state.lock().unwrap().clone();
        Box::pin(async move {
            if step["errorAt"] == name {
                return Err(if let Some(v) = step.get("thrown") {
                    PluginError::Thrown(v.clone())
                } else {
                    PluginError::Message(step["error"].as_str().unwrap().into())
                });
            }
            Ok(step["replies"]
                .get(name)
                .cloned()
                .unwrap_or_else(|| match name {
                    "listInstalled" => json!([]),
                    "getPluginConfig" => json!({}),
                    _ => Value::Null,
                }))
        })
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let app = PluginRoutes {
        auth: auth.clone(),
        manager,
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
                "plugins-route-fixture",
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
async fn plugin_authentication_and_all_routes_match_actual_registration() {
    let mut steps = vec![];
    for (method, path, replies, body) in [
        (
            "GET",
            "/api/plugins",
            json!({"listInstalled":[{"id":"one","enabled":true}]}),
            None,
        ),
        (
            "GET",
            "/api/plugins/one",
            json!({"getPlugin":{"id":"one","config":{"key":1}}}),
            None,
        ),
        (
            "GET",
            "/api/plugins/one/config",
            json!({"getPlugin":{"config":{"key":1}}}),
            None,
        ),
        (
            "POST",
            "/api/plugins/one/enable",
            json!({"enable":{"ok":true}}),
            None,
        ),
        (
            "POST",
            "/api/plugins/one/disable",
            json!({"disable":{"ok":false,"message":"kept"}}),
            None,
        ),
        ("DELETE", "/api/plugins/one", json!({}), None),
        (
            "PATCH",
            "/api/plugins/a%2Fb/config",
            json!({"getPluginConfig":{"keep":1,"nested":{"old":true}}}),
            Some(json!({"nested":{"new":true},"added":null})),
        ),
        (
            "POST",
            "/api/plugins/scan",
            json!({"listInstalled":[{"id":"fresh"}]}),
            None,
        ),
    ] {
        let mut step = json!({"method":method,"path":path,"replies":replies});
        if let Some(body) = body {
            step["body"] = body;
        }
        steps.push(step.clone());
        step["user"] = json!("owner");
        step["cookie"] = json!(true);
        steps.push(step);
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn plugin_missing_configs_and_caught_vs_unhandled_errors_match() {
    let mut steps = vec![
        json!({"method":"GET","path":"/api/plugins/missing","user":"owner"}),
        json!({"method":"GET","path":"/api/plugins/missing/config","user":"owner"}),
        json!({"method":"GET","path":"/api/plugins/scan","user":"owner","replies":{"getPlugin":{"id":"scan"}}}),
    ];
    for (method, path, name) in [
        ("GET", "/api/plugins", "listInstalled"),
        ("GET", "/api/plugins/one", "getPlugin"),
        ("GET", "/api/plugins/one/config", "getPlugin"),
        ("POST", "/api/plugins/one/enable", "enable"),
        ("POST", "/api/plugins/one/disable", "disable"),
        ("DELETE", "/api/plugins/one", "uninstall"),
        ("PATCH", "/api/plugins/one/config", "getPluginConfig"),
        ("PATCH", "/api/plugins/one/config", "setPluginConfig"),
        ("POST", "/api/plugins/scan", "syncAndLoad"),
        ("POST", "/api/plugins/scan", "listInstalled"),
    ] {
        steps.push(json!({"method":method,"path":path,"user":"owner","errorAt":name,"error":"plugin failed","body":{}}));
    }
    for value in [
        Value::Null,
        json!([1,{"deep":2}]),
        json!("abc"),
        json!(false),
        json!(5),
    ] {
        steps.push(json!({"method":"PATCH","path":"/api/plugins/one/config","user":"owner","body":value,"replies":{"getPluginConfig":{"keep":true}}}));
    }
    for thrown in [json!("plain failure"), json!(null), json!({"error":"data"})] {
        steps.push(json!({"method":"POST","path":"/api/plugins/one/enable","user":"owner","errorAt":"enable","thrown":thrown}));
    }
    steps.push(json!({"method":"DELETE","path":"/api/plugins/scan","user":"owner"}));
    compare(json!(steps)).await;
}
#[tokio::test]
async fn plugin_malformed_body_is_rejected_without_manager_calls() {
    compare(json!([
        {"method":"PATCH","path":"/api/plugins/one/config","raw":"{","headers":{"content-type":"application/json"}},
        {"method":"PATCH","path":"/api/plugins/one/config","user":"owner","raw":"{","headers":{"content-type":"application/json"}}
    ])).await;
}

#[tokio::test]
async fn malformed_plugin_ids_fail_before_manager_dispatch() {
    compare(json!([
        {"method":"GET","path":"/api/plugins/%GG","user":"owner"},
        {"method":"GET","path":"/api/plugins/%FF/config","user":"owner"}
    ]))
    .await;
}
