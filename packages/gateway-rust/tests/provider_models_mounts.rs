use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use std::time::Duration;

#[tokio::test]
async fn composed_provider_and_jobs_expose_builtin_models() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/provider-models-tests")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&root).unwrap();
    let app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: root.join("gateway.sqlite"),
            project_root: root.clone(),
            jwt_secret: "test-secret-at-least-32-bytes-long".into(),
            cors_origin: String::new(),
            web_root: None,
            health: None,
        },
    )
    .await
    .unwrap();
    let base = format!("http://{}", app.local_addr().unwrap());
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        app.serve(async {
            let _ = stopped.await;
        })
        .await
        .unwrap()
    });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .unwrap();
    let registration: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"models-user","password":"correct-horse-1"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registration["access_token"].as_str().unwrap();
    let response = client
        .get(format!("{base}/api/providers/jait/models"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let models: serde_json::Value = response.json().await.unwrap();
    assert_eq!(models["models"][0]["id"], "gpt-4o");
    assert_eq!(models["models"][0]["isDefault"], true);
    let response = client
        .get(format!("{base}/api/jobs/providers/available"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let jobs: serde_json::Value = response.json().await.unwrap();
    assert_eq!(jobs["providers"]["jait"]["models"][0], "gpt-4o");
    assert_eq!(
        jobs["providers"]["jait"]["models"]
            .as_array()
            .unwrap()
            .len(),
        models["models"].as_array().unwrap().len()
    );
    let _ = stop.send(());
    task.await.unwrap();
    std::fs::remove_dir_all(root).unwrap();
}
