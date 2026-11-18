#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    db,
    integrations::channel_contracts::{ChannelPairOptions, ChannelStatus},
    routes::{auth::AuthState, channels::*},
    security::http_auth::{self, AuthUser},
};
use serde::Serialize;
use serde_json::{Map, Value, json};
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
// Only lone surrogate strings need an explicit comparison representation.
// Both code units are still asserted on the actual native wire below.
fn normalized_text(text: &str) -> Result<Value, serde_json::Error> {
    serde_json::from_str(
        &text
            .replace(r#""\ud83d""#, r#""<unit-d83d>""#)
            .replace(r#""\ude00""#, r#""<unit-de00>""#),
    )
}
fn normalized(v: impl Serialize) -> Value {
    normalized_text(&serde_json::to_string(&v).unwrap()).unwrap()
}
struct Host {
    active: Mutex<Value>,
    events: Mutex<Vec<Value>>,
    config: Mutex<ChannelFields>,
    record: ChannelRecord,
}
impl Host {
    fn effect(&self, name: &str, args: Value) -> ChannelResult<()> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"name":name,"args":args}));
        let step = self.active.lock().unwrap();
        if step["errorAt"] == name {
            return Err(if let Some(v) = step.get("thrown") {
                ChannelError::Thrown(v.clone())
            } else {
                ChannelError::Message(step["error"].as_str().unwrap_or("host failed").into())
            });
        }
        Ok(())
    }
    fn update(&self, v: &Value) {
        let mut record = self.record.lock().unwrap();
        record.id = v["id"].as_str().unwrap_or("telegram").into();
        record.status =
            serde_json::from_value(v.get("status").cloned().unwrap_or(json!("stopped"))).unwrap();
        record.detail = v["detail"].as_object().cloned().unwrap_or_default();
    }
    fn after(&self) {
        let step = self.active.lock().unwrap().clone();
        if let Some(v) = step.get("after") {
            self.update(v);
        }
    }
}
impl ChannelHost for Host {
    fn list(&self) -> ChannelResult<Vec<ChannelFields>> {
        self.effect("list", json!([]))?;
        let step = self.active.lock().unwrap();
        if let Some(items) = step["list"].as_array() {
            return Ok(items
                .iter()
                .map(jait_gateway::contracts::bounded_json::object_spread)
                .collect());
        }
        let mut row = jait_gateway::contracts::bounded_json::object_spread(
            &json!({"id":"telegram","label":"Telegram","status":self.record.lock().unwrap().status}),
        );
        row.insert(
            "config".into(),
            serde_json::value::to_raw_value(&*self.config.lock().unwrap()).unwrap(),
        );
        Ok(vec![row])
    }
    fn get(&self, id: &str) -> ChannelResult<Option<ChannelRecord>> {
        self.effect("get", json!([id]))?;
        Ok(if self.active.lock().unwrap()["missing"] == true {
            None
        } else {
            Some(self.record.clone())
        })
    }
    fn config(&self, id: &str) -> ChannelResult<ChannelFields> {
        self.effect("config", json!([id]))?;
        Ok(self.config.lock().unwrap().clone())
    }
    fn set_config(&self, id: &str, patch: ChannelFields) -> ChannelResult<ChannelFields> {
        self.effect("setConfig", normalized((id, &patch)))?;
        let mut config = self.config.lock().unwrap();
        config.extend(patch);
        Ok(config.clone())
    }
    fn current_qr(&self, id: &str) -> ChannelResult<Value> {
        self.effect("currentQr", json!([id]))?;
        Ok(self.active.lock().unwrap()["qr"].clone())
    }
    fn setup(&self, id: String) -> BoxFuture<'_, ChannelResult<Option<Value>>> {
        Box::pin(async move {
            self.effect("setup", json!([id]))?;
            Ok(self.active.lock().unwrap().get("guide").cloned())
        })
    }
    fn start(&self, id: String, options: ChannelPairOptions) -> BoxFuture<'_, ChannelResult<()>> {
        Box::pin(async move {
            self.effect("start", json!([id, options]))?;
            self.after();
            Ok(())
        })
    }
    fn stop(&self, id: String) -> BoxFuture<'_, ChannelResult<()>> {
        Box::pin(async move { self.effect("stop", json!([id])) })
    }
    fn pair(&self, id: String, options: ChannelPairOptions) -> BoxFuture<'_, ChannelResult<()>> {
        Box::pin(async move {
            self.effect("pair", json!([id, options]))?;
            self.after();
            Ok(())
        })
    }
}
async fn compare(steps: Value) {
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/channels-http/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[{"op":"nativechannelshttp.run","steps":steps}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "channels-http-fixture".into()).unwrap();
    let host = Arc::new(Host {
        active: Mutex::new(Value::Null),
        events: Mutex::new(vec![]),
        config: Mutex::new(jait_gateway::contracts::bounded_json::object_spread(
            &json!({"enabled":true,"token":" fixture-secret "}),
        )),
        record: Arc::new(Mutex::new(ManagedChannel {
            id: "telegram".into(),
            status: ChannelStatus::Stopped,
            detail: Map::new(),
        })),
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let app = ChannelRoutes {
        auth: auth.clone(),
        host: host.clone(),
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
        *host.active.lock().unwrap() = step.clone();
        host.update(&step["state"]);
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
                "channels-http-fixture",
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
        let body = normalized_text(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body}));
    }
    let _ = send.send(());
    server.await.unwrap();
    auth.shutdown().await.unwrap();
    assert_eq!(
        json!({"results":results,"events":*host.events.lock().unwrap(),"config":normalized(&*host.config.lock().unwrap())}),
        expected
    );
}
#[tokio::test]
async fn authentication_and_missing_channels_match_typescript() {
    let mut steps = vec![];
    for (method, path) in [
        ("GET", "/api/channels"),
        ("GET", "/api/channels/x/status"),
        ("GET", "/api/channels/x/setup"),
        ("POST", "/api/channels/x/start"),
        ("POST", "/api/channels/x/pair"),
        ("POST", "/api/channels/x/stop"),
        ("PATCH", "/api/channels/x/config"),
    ] {
        steps.push(json!({"method":method,"path":path}));
        steps
            .push(json!({"method":method,"path":path,"user":"owner","cookie":true,"missing":true}));
        steps.push(
            json!({"method":method,"path":path,"headers":{"authorization":"Bearer invalid"}}),
        );
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn status_list_and_lazy_qr_match_typescript() {
    compare(json!([
 {"method":"GET","path":"/api/channels","user":"owner"},
 {"method":"GET","path":"/api/channels","user":"owner","list":[{"id":"one","config":{"token":" \u{feff}","unknown":4,"tokenSet":true},"extra":"keep"},{"id":"two","config":{"token":"private"}}]},
 {"method":"GET","path":"/api/channels/tele%67ram/status","user":"owner","qr":"connector-qr"},
 {"method":"GET","path":"/api/channels/x/status","user":"owner","state":{"id":"telegram","status":"qr","detail":{"qr":"detail-qr","link":"","expiresAt":0,"error":"failure"}},"errorAt":"currentQr"},
 {"method":"GET","path":"/api/channels/x/status","user":"owner","state":{"detail":{"qr":null,"link":null,"error":null}},"qr":"fallback"},
 {"method":"GET","path":"/api/channels/x/status","user":"owner","state":{"detail":{"qr":""}},"qr":"unused"}
 ])).await;
}
#[tokio::test]
async fn config_redaction_and_token_extraction_match_typescript() {
    let token = format!("123456:{}", "Ab_9-z".repeat(6));
    let mut steps = vec![];
    for body in [
        json!({"model":"m"}),
        json!({"token":"  "}),
        json!({"token":false}),
        json!({"token":42}),
        json!({"token":null}),
        json!({"token":" \u{feff} "}),
        json!({"token":"  custom-token  ","unknown":{"k":1}}),
        json!({"token":format!("BotFather: {token}\nKeep private")}),
        json!({"token":format!("é{token}é")}),
        json!({"token":format!("x{token}!")}),
        json!({"token":" \u{85} "}),
        json!(null),
        json!(["x", 7]),
        json!("abc"),
        json!(false),
    ] {
        steps.push(
            json!({"method":"PATCH","path":"/api/channels/x/config","user":"owner","body":body}),
        );
        steps.push(json!({"method":"GET","path":"/api/channels/x/status","user":"owner"}));
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn start_pair_and_setup_match_typescript() {
    let mut steps = vec![];
    for action in ["start", "pair"] {
        for body in [
            json!({"returnUrl":"","token":"ignored","enabled":true}),
            json!({"returnUrl":"http://fixture.invalid/cb"}),
            json!({"returnUrl":8}),
            json!(null),
            json!([1]),
        ] {
            steps.push(json!({"method":"POST","path":format!("/api/channels/x/{action}"),"user":"owner","body":body,"after":{"status":"qr","detail":{"qr":"new-qr","link":"pair-link","expiresAt":42,"error":"start-only"}}}));
        }
    }
    steps.extend([json!({"method":"GET","path":"/api/channels/x/setup","user":"owner","guide":{"link":"setup","qr":null,"suggestedName":"Fixture","suggestedUsername":"fixture"}}),json!({"method":"GET","path":"/api/channels/x/setup","user":"owner"}),json!({"method":"POST","path":"/api/channels/x/stop","user":"owner"})]);
    compare(json!(steps)).await;
}
#[tokio::test]
async fn host_failures_and_thrown_values_match_typescript() {
    let mut steps = vec![];
    for (method, action, ops) in [
        ("GET", "status", vec!["get", "currentQr", "config"]),
        ("GET", "setup", vec!["setup"]),
        ("POST", "start", vec!["start", "get", "currentQr"]),
        ("POST", "pair", vec!["get", "pair", "currentQr"]),
        ("POST", "stop", vec!["stop"]),
        ("PATCH", "config", vec!["get", "setConfig"]),
    ] {
        for op in ops {
            steps.push(json!({"method":method,"path":format!("/api/channels/x/{action}"),"user":"owner","errorAt":op,"error":"host failed"}));
            if ["setup", "start", "pair", "stop"].contains(&op) {
                for thrown in [
                    json!(null),
                    json!(7),
                    json!({"private":"object"}),
                    json!([1, 2]),
                ] {
                    steps.push(json!({"method":method,"path":format!("/api/channels/x/{action}"),"user":"owner","errorAt":op,"thrown":thrown}));
                }
            }
        }
    }
    steps.push(json!({"method":"GET","path":"/api/channels","user":"owner","errorAt":"list","error":"host failed"}));
    compare(json!(steps)).await;
}
#[tokio::test]
async fn request_parsing_and_encoded_ids_match_typescript() {
    compare(json!([
 {"method":"PATCH","path":"/api/channels/x/config","user":"owner","raw":"{","headers":{"content-type":"application/json"}},
 {"method":"POST","path":"/api/channels/x/start","user":"owner","raw":"x","headers":{"content-type":"application/xml"}},
 {"method":"GET","path":"/api/channels/tele%2Fgram/status","user":"owner"},
 {"method":"GET","path":"/api/channels/%ZZ/status","user":"owner"},
 {"method":"GET","path":"/api/channels/%C3/status","user":"owner"},
 {"method":"POST","path":"/api/channels/x/start","raw":"{","headers":{"content-type":"application/json"}}
 ])).await;
}

#[tokio::test]
async fn config_string_spread_preserves_utf16_units() {
    compare(json!([
        {"method":"PATCH","path":"/api/channels/x/config","user":"owner","body":"😀"},
        {"method":"GET","path":"/api/channels/x/status","user":"owner"},
        {"method":"GET","path":"/api/channels","user":"owner"}
    ]))
    .await;
    let fields = jait_gateway::contracts::bounded_json::object_spread(&json!("😀"));
    assert_eq!(fields["0"].get(), r#""\ud83d""#);
    assert_eq!(fields["1"].get(), r#""\ude00""#);
}
