//! Black-box checks for `POST /api/voice/wake-candidate` through the composed binary.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use std::time::Duration;

#[tokio::test]
async fn wake_candidate_requires_auth_and_never_activates_without_a_reviewer() {
    let dir = std::env::temp_dir().join(format!("jait-wake-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: dir.join("gateway.sqlite"),
            project_root: dir.clone(),
            jwt_secret: "wake-secret".into(),
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
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        app.serve(async move {
            let _ = stopped.await;
        })
        .await
        .unwrap();
    });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let registered: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"waker","password":"correct-horse-1"}))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap().to_owned();
    let url = format!("{base}/api/voice/wake-candidate");

    let anonymous = client
        .post(&url)
        .json(&serde_json::json!({"transcript":"hey jake"}))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);

    for body in [
        serde_json::json!({"transcript":"hey jake what time is it"}),
        serde_json::json!({"transcript":"   "}),
        serde_json::json!({"transcript": "x".repeat(1001)}),
        serde_json::json!({"transcript": 7}),
        serde_json::json!({}),
    ] {
        let response = client
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200, "{body}");
        assert_eq!(
            response.json::<serde_json::Value>().await.unwrap(),
            serde_json::json!({"activate": false}),
            "{body}"
        );
    }

    let oversized = client
        .post(&url)
        .bearer_auth(&token)
        .header("content-type", "application/json")
        .body(format!(r#"{{"transcript":"{}"}}"#, "y".repeat(8000)))
        .send()
        .await
        .unwrap();
    assert_eq!(oversized.status(), 413);

    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
