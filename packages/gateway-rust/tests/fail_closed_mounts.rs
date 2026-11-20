//! Fail-closed routers through the composed application over HTTP. Each router is mounted, requires a login, and refuses
//! the effect that production cannot perform: no preview backend, no security scope, no DevTools browser. These tests
//! prove the refusal and its validation order. They do not count as native, since no effect is implemented.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use serde_json::{Value, json};
use std::{path::PathBuf, time::Duration};

const SECRET: &str = "fail-closed-mount-secret";

struct Session {
    base: String,
    client: reqwest::Client,
    token: String,
    dir: PathBuf,
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

async fn start() -> Session {
    let dir = std::env::temp_dir().join(format!("jait-fail-closed-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: dir.join("gateway.sqlite"),
            project_root: dir.clone(),
            jwt_secret: SECRET.into(),
            cors_origin: String::new(),
            web_root: None,
            health: None,
        },
    )
    .await
    .unwrap();
    app.mount_websocket(
        jait_gateway::ws::WsHubConfig::default(),
        std::num::NonZeroUsize::new(8).unwrap(),
        Duration::from_secs(5),
    )
    .unwrap();
    let base = format!("http://{}", app.local_addr().unwrap());
    tokio::spawn(async move {
        app.serve(std::future::pending::<()>()).await.unwrap();
    });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap();
    let registered: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"operator","password":"correct-horse-1"}))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap().to_owned();
    Session {
        base,
        client,
        token,
        dir,
    }
}

#[tokio::test]
async fn preview_routes_are_mounted_and_refuse_unknown_sessions() {
    let session = start().await;
    let start_url = format!("{}/api/preview/start", session.base);
    let anonymous = session
        .client
        .post(&start_url)
        .json(&json!({"sessionId":"missing"}))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);
    assert_eq!(
        anonymous.json::<Value>().await.unwrap()["detail"],
        "login_required"
    );
    let unknown = session
        .client
        .post(&start_url)
        .bearer_auth(&session.token)
        .json(&json!({"sessionId":"missing"}))
        .send()
        .await
        .unwrap();
    assert_eq!(unknown.status(), 404);
    assert_eq!(
        unknown.json::<Value>().await.unwrap()["error"],
        "Session not found"
    );
}

#[tokio::test]
async fn security_workbench_routes_are_mounted_and_refuse_checks_without_a_scope() {
    let session = start().await;
    let history_url = format!("{}/api/security/workbench", session.base);
    let anonymous = session.client.get(&history_url).send().await.unwrap();
    assert_eq!(anonymous.status(), 401);
    let history = session
        .client
        .get(&history_url)
        .bearer_auth(&session.token)
        .send()
        .await
        .unwrap();
    assert_eq!(history.status(), 200);
    let history = history.json::<Value>().await.unwrap();
    assert!(
        history["runs"].is_array() && history["findings"].is_array(),
        "{history}"
    );
    let refused = session
        .client
        .post(format!("{}/api/security/checks", session.base))
        .bearer_auth(&session.token)
        .json(&json!({"target":"127.0.0.1"}))
        .send()
        .await
        .unwrap();
    assert_eq!(refused.status(), 400);
    assert_eq!(
        refused.json::<Value>().await.unwrap()["error"],
        "Scope not found"
    );
}

#[tokio::test]
async fn devtools_routes_are_mounted_and_validate_before_any_browser_is_reached() {
    let session = start().await;
    let devtools_url = format!("{}/api/preview/devtools", session.base);
    let anonymous = session
        .client
        .post(&devtools_url)
        .json(&json!({"sessionId":"missing"}))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);
    let invalid = session
        .client
        .post(&devtools_url)
        .bearer_auth(&session.token)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), 400);
    let invalid = invalid.json::<Value>().await.unwrap();
    assert_eq!(invalid["code"], "FST_ERR_VALIDATION");
    assert_eq!(
        invalid["message"],
        "body must have required property 'sessionId'"
    );
    let unknown = session
        .client
        .post(&devtools_url)
        .bearer_auth(&session.token)
        .json(&json!({"sessionId":"missing"}))
        .send()
        .await
        .unwrap();
    assert_eq!(unknown.status(), 404);
    assert_eq!(
        unknown.json::<Value>().await.unwrap()["error"],
        "Session not found"
    );
}
