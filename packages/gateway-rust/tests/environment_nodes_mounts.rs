//! The composed environment snapshot uses the live gateway node and filesystem stores.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use serde_json::{Value, json};
use std::{num::NonZeroUsize, time::Duration};

#[tokio::test]
async fn snapshot_reports_live_gateway_and_repository_connectivity() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/environment-nodes-tests")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&root).unwrap();
    let mut app = Application::bind_with_settings_chat(
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
    app.mount_websocket(
        jait_gateway::ws::WsHubConfig::default(),
        NonZeroUsize::new(8).unwrap(),
        Duration::from_secs(5),
    )
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
    assert_eq!(
        client
            .get(format!("{base}/api/environment/snapshot"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let registration: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"environment-user","password":"correct-horse-1"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registration["access_token"].as_str().unwrap();
    for (name, path, device) in [
        ("local", "/local", Value::Null),
        ("gateway", "/gateway", json!("gateway")),
        ("remote", "/remote", json!("absent-node")),
    ] {
        let response = client
            .post(format!("{base}/api/repos"))
            .bearer_auth(token)
            .json(&json!({"name":name,"localPath":path,"deviceId":device}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
    }
    let filesystem: Value = client
        .get(format!("{base}/api/filesystem/nodes"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let response = client
        .get(format!("{base}/api/environment/snapshot"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let body: Value = response.json().await.unwrap();
    let snapshot = &body["snapshot"];
    let node = &snapshot["nodes"][0];
    assert_eq!(node["id"], "gateway");
    assert_eq!(node["name"], filesystem["nodes"][0]["name"]);
    assert_eq!(node["lifecycle"], "ready");
    assert_eq!(node["capabilities"]["surfaces"], json!(["filesystem"]));
    let connector = snapshot["connectors"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == "gateway")
        .unwrap();
    assert_eq!(connector["status"], "ready");
    let repos = snapshot["repositories"].as_array().unwrap();
    let repo = |name: &str| repos.iter().find(|r| r["name"] == name).unwrap();
    assert_eq!(repo("local")["nodeName"], "Gateway");
    assert_eq!(repo("gateway")["nodeName"], node["name"]);
    assert_eq!(repo("gateway")["connected"], true);
    assert_eq!(repo("remote")["nodeName"], Value::Null);
    assert_eq!(repo("remote")["connected"], false);
    let _ = stop.send(());
    task.await.unwrap();
    std::fs::remove_dir_all(root).unwrap();
}
