//! Consumer-level contracts for the native channel presentation routes.
//! Transport (`TcpListener` on loopback) is in-process only: no external network.
use futures_util::future::BoxFuture;
use jait_gateway::{
    db,
    integrations::channel_contracts::{ChannelPairOptions, ChannelStatus},
    routes::{
        auth::AuthState,
        channels::{
            ChannelFields, ChannelHost, ChannelRecord, ChannelResult, ChannelRoutes,
            ManagedChannel,
        },
    },
    security::http_auth::{self, AuthUser},
};
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

const SECRET: &str = "w-data-channels-fixture";
const USER: &str = "owner";

mod channels {
    use super::*;

    struct Host {
        config: Mutex<ChannelFields>,
        events: Mutex<Vec<Value>>,
        record: ChannelRecord,
        qr: Mutex<Value>,
        guide: Mutex<Option<Value>>,
        missing: bool,
    }

    impl Host {
        fn new(config: Value, status: ChannelStatus, detail: Value) -> Self {
            let record = Arc::new(Mutex::new(ManagedChannel {
                id: "telegram".into(),
                status,
                detail: detail.as_object().cloned().unwrap_or_default(),
            }));
            Self {
                config: Mutex::new(jait_gateway::contracts::bounded_json::object_spread(
                    &config,
                )),
                events: Mutex::new(vec![]),
                record,
                qr: Mutex::new(Value::Null),
                guide: Mutex::new(None),
                missing: false,
            }
        }
        fn effect(&self, name: &str, args: Value) -> ChannelResult<()> {
            self.events
                .lock()
                .unwrap()
                .push(json!({"name":name,"args":args}));
            Ok(())
        }
        fn recorded(&self) -> Value {
            Value::Array(self.events.lock().unwrap().clone())
        }
    }

    impl ChannelHost for Host {
        fn list(&self) -> ChannelResult<Vec<ChannelFields>> {
            self.effect("list", json!([]))?;
            let mut row = jait_gateway::contracts::bounded_json::object_spread(&json!({
                "id":"telegram",
                "label":"Telegram",
                "extra":"keep",
                "status":self.record.lock().unwrap().status,
            }));
            row.insert(
                "config".into(),
                serde_json::value::to_raw_value(&*self.config.lock().unwrap()).unwrap(),
            );
            Ok(vec![row])
        }
        fn get(&self, id: &str) -> ChannelResult<Option<ChannelRecord>> {
            self.effect("get", json!([id]))?;
            Ok(if self.missing {
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
            self.effect("setConfig", json!([id, patch]))?;
            let mut config = self.config.lock().unwrap();
            config.extend(patch);
            Ok(config.clone())
        }
        fn current_qr(&self, id: &str) -> ChannelResult<Value> {
            self.effect("currentQr", json!([id]))?;
            Ok(self.qr.lock().unwrap().clone())
        }
        fn setup(&self, id: String) -> BoxFuture<'_, ChannelResult<Option<Value>>> {
            Box::pin(async move {
                self.effect("setup", json!([id]))?;
                Ok(self.guide.lock().unwrap().clone())
            })
        }
        fn start(&self, id: String, options: ChannelPairOptions) -> BoxFuture<'_, ChannelResult<()>> {
            Box::pin(async move { self.effect("start", json!([id, options])) })
        }
        fn stop(&self, id: String) -> BoxFuture<'_, ChannelResult<()>> {
            Box::pin(async move { self.effect("stop", json!([id])) })
        }
        fn pair(&self, id: String, options: ChannelPairOptions) -> BoxFuture<'_, ChannelResult<()>> {
            Box::pin(async move { self.effect("pair", json!([id, options])) })
        }
    }

    struct Harness {
        base: String,
        host: Arc<Host>,
        send: Option<tokio::sync::oneshot::Sender<()>>,
        server: tokio::task::JoinHandle<()>,
        auth: AuthState,
    }

    impl Harness {
        async fn stop(mut self) {
            let _ = self.send.take().expect("shutdown sender").send(());
            self.server.await.unwrap();
            self.auth.shutdown().await.unwrap();
        }
    }

    async fn boot(host: Host) -> Harness {
        let database = rusqlite::Connection::open_in_memory().unwrap();
        db::migrate_database(&database).unwrap();
        database
            .execute_batch(
                "INSERT INTO users(id,username,password_hash,created_at,updated_at) \
                 VALUES('owner','alice','fixture','old','old')",
            )
            .unwrap();
        let auth = AuthState::new(database, SECRET.into()).unwrap();
        let host = Arc::new(host);
        let app = ChannelRoutes {
            auth: auth.clone(),
            host: host.clone(),
        }
        .router();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let (send, receive) = tokio::sync::oneshot::channel::<()>();
        let server = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = receive.await;
                })
                .await
                .unwrap()
        });
        Harness {
            base,
            host,
            send: Some(send),
            server,
            auth,
        }
    }

    fn client() -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap()
    }

    fn token() -> String {
        http_auth::sign_auth_token(
            &AuthUser {
                id: USER.into(),
                username: "alice".into(),
            },
            SECRET,
        )
        .unwrap()
    }

    async fn call(
        client: &reqwest::Client,
        base: &str,
        method: reqwest::Method,
        path: &str,
        body: Option<Value>,
        authenticated: bool,
    ) -> (u16, Value) {
        let mut request = client.request(method, format!("{base}{path}"));
        if authenticated {
            request = request.bearer_auth(token());
        }
        if let Some(body) = body {
            request = request
                .header("content-type", "application/json")
                .body(body.to_string());
        }
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let text = response.text().await.unwrap();
        (status, serde_json::from_str(&text).unwrap_or(json!(text)))
    }

    #[tokio::test]
    async fn list_redacts_tokens_and_keeps_unknown_fields() {
        let harness = boot(Host::new(
            json!({"enabled":true,"token":"  s3cret  ","custom":{"nested":[1,2]}}),
            ChannelStatus::Connected,
            json!({}),
        ))
        .await;
        let (status, body) =
            call(&client(), &harness.base, reqwest::Method::GET, "/api/channels", None, true).await;
        assert_eq!(status, 200);
        assert_eq!(
            body,
            json!([{
                "id": "telegram",
                "label": "Telegram",
                "extra": "keep",
                "status": "connected",
                // `token` is replaced by a boolean `tokenSet`; every other key survives.
                "config": {"enabled": true, "tokenSet": true, "custom": {"nested": [1, 2]}},
            }])
        );
        harness.stop().await;
    }

    #[tokio::test]
    async fn status_presents_connector_state_and_falls_back_to_current_qr() {
        let harness = boot(Host::new(
            json!({"token":""}),
            ChannelStatus::Qr,
            json!({"qr":null,"link":"https://t.me/x","expiresAt":1700000000,"error":"boom"}),
        ))
        .await;
        *harness.host.qr.lock().unwrap() = json!("connector-qr");
        let (status, body) = call(
            &client(),
            &harness.base,
            reqwest::Method::GET,
            "/api/channels/telegram/status",
            None,
            true,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(
            body,
            json!({
                "id": "telegram",
                "status": "qr",
                // detail.qr is null, so the connector's live QR is presented instead.
                "qr": "connector-qr",
                "link": "https://t.me/x",
                "expiresAt": 1700000000,
                "error": "boom",
                "config": {"tokenSet": false},
            })
        );
        harness.stop().await;
    }

    #[tokio::test]
    async fn unknown_channel_and_missing_setup_map_to_their_guards() {
        let mut host = Host::new(json!({"token":"x"}), ChannelStatus::Stopped, json!({}));
        host.missing = true;
        let harness = boot(host).await;
        let client = client();
        for (method, path) in [
            (reqwest::Method::GET, "/api/channels/ghost/status"),
            (reqwest::Method::POST, "/api/channels/ghost/pair"),
            (reqwest::Method::PATCH, "/api/channels/ghost/config"),
        ] {
            let (status, body) =
                call(&client, &harness.base, method, path, None, true).await;
            assert_eq!(status, 404, "{path}");
            assert_eq!(body, json!({"error":"Channel not found"}), "{path}");
        }
        harness.stop().await;

        let harness = boot(Host::new(
            json!({"token":"x"}),
            ChannelStatus::Stopped,
            json!({}),
        ))
        .await;
        let (status, body) = call(
            &client,
            &harness.base,
            reqwest::Method::GET,
            "/api/channels/telegram/setup",
            None,
            true,
        )
        .await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error":"Channel needs no setup step"}));
        harness.stop().await;
    }

    #[tokio::test]
    async fn config_patch_extracts_the_telegram_bot_token() {
        let bot = format!("123456789:{}", "Ab_9-z".repeat(5));
        let harness = boot(Host::new(
            json!({"enabled":true,"token":"old"}),
            ChannelStatus::Stopped,
            json!({}),
        ))
        .await;
        let (status, body) = call(
            &client(),
            &harness.base,
            reqwest::Method::PATCH,
            "/api/channels/telegram/config",
            Some(json!({"token": format!("paste this: {bot} thanks"), "enabled": false, "note": "n"})),
            true,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(
            body,
            json!({"enabled": false, "note": "n", "tokenSet": true})
        );
        // The host receives the extracted bot token, not the pasted blob.
        let events = harness.host.recorded();
        let set_config = events
            .as_array()
            .unwrap()
            .iter()
            .find(|event| event["name"] == "setConfig")
            .unwrap();
        assert_eq!(set_config["args"][0], json!("telegram"));
        assert_eq!(set_config["args"][1]["token"], json!(bot));
        assert_eq!(set_config["args"][1]["enabled"], json!(false));
        harness.stop().await;
    }

    #[tokio::test]
    async fn config_patch_null_token_clears_token_set() {
        let harness = boot(Host::new(
            json!({"token":"live","enabled":true}),
            ChannelStatus::Stopped,
            json!({}),
        ))
        .await;
        let (status, body) = call(
            &client(),
            &harness.base,
            reqwest::Method::PATCH,
            "/api/channels/telegram/config",
            Some(json!({"token": null})),
            true,
        )
        .await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"enabled": true, "tokenSet": false}));
        harness.stop().await;
    }

    #[tokio::test]
    async fn requests_without_a_session_are_denied() {
        let harness = boot(Host::new(
            json!({"token":"live"}),
            ChannelStatus::Stopped,
            json!({}),
        ))
        .await;
        let client = client();
        let (status, body) =
            call(&client, &harness.base, reqwest::Method::GET, "/api/channels", None, false).await;
        assert_eq!(status, 401);
        assert_eq!(body, json!({"detail":"login_required"}));

        let response = client
            .get(format!("{}/api/channels/telegram/status", harness.base))
            .header("authorization", "Bearer not-a-token")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), 401);
        assert_eq!(response.text().await.unwrap(), r#"{"detail":"login_required"}"#);
        // Guarded requests never reach the host.
        assert!(harness.host.recorded().as_array().unwrap().is_empty());
        harness.stop().await;
    }
}
