//! Black-box checks that routers are served by the composed application binary path.
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use jait_gateway::config::GatewayConfig;
use std::time::Duration;

async fn start() -> (String, tokio::sync::oneshot::Sender<()>, tokio::task::JoinHandle<()>, std::path::PathBuf) {
    let dir = std::env::temp_dir().join(format!("jait-mounts-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let app = Application::bind(
        GatewayConfig { address: "127.0.0.1:0".parse().unwrap() },
        ApplicationConfig {
            database_path: dir.join("gateway.sqlite"),
            project_root: dir.clone(),
            jwt_secret: "mount-secret".into(),
            cors_origin: String::new(),
            health: None,
        },
    )
    .await
    .unwrap();
    let base = format!("http://{}", app.local_addr().unwrap());
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        app.serve(async move { let _ = stopped.await; }).await.unwrap();
    });
    (base, stop, task, dir)
}

async fn token(client: &reqwest::Client, base: &str) -> String {
    let r: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"mounter","password":"correct-horse-1"}))
        .send().await.unwrap().json().await.unwrap();
    r["access_token"].as_str().unwrap_or_else(|| panic!("no token: {r}")).to_owned()
}

#[tokio::test]
async fn threads_and_reminders_are_served_and_authenticated() {
    let (base, stop, task, dir) = start().await;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(5)).build().unwrap();
    for path in ["/api/threads", "/api/reminders"] {
        let anon = client.get(format!("{base}{path}")).send().await.unwrap();
        assert_eq!(anon.status(), 401, "{path} must require auth, not 404");
    }
    let token = token(&client, &base).await;
    for path in ["/api/threads", "/api/reminders"] {
        let ok = client.get(format!("{base}{path}")).bearer_auth(&token).send().await.unwrap();
        assert_eq!(ok.status(), 200, "{path}");
    }
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task).await.unwrap().unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
