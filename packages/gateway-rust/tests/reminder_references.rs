//! Production composition must validate reminder references even without injected ports.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};

#[tokio::test]
async fn missing_project_and_session_are_rejected() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts")
        .join(format!("reminder-references-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: root.join("gateway.sqlite"),
            project_root: root.clone(),
            jwt_secret: "test-secret".into(),
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
        app.serve(async move {
            let _ = stopped.await;
        })
        .await
        .unwrap();
    });
    let client = reqwest::Client::new();
    let registration: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"reminder-test","password":"correct-horse-1"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registration["access_token"].as_str().unwrap();
    for (field, details) in [
        ("projectId", "Project not found"),
        ("sessionId", "Session not found"),
    ] {
        let mut body = serde_json::json!({"content":"test"});
        body[field] = "missing-reference".into();
        let response = client
            .post(format!("{base}/api/reminders"))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 404);
        assert_eq!(
            response.json::<serde_json::Value>().await.unwrap()["details"],
            details
        );
    }
    let project: serde_json::Value = client
        .post(format!("{base}/api/projects"))
        .bearer_auth(token)
        .json(&serde_json::json!({"title":"owned","rootPath":root}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let session: serde_json::Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let project_id = project["id"]
        .as_str()
        .unwrap_or_else(|| panic!("project: {project}"));
    let session_id = session["id"].as_str().unwrap();
    let invite: serde_json::Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other: serde_json::Value = client.post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"other","password":"correct-horse-2","invitation":invite["invitation"]}))
        .send().await.unwrap().json().await.unwrap();
    let other_token = other["access_token"].as_str().unwrap();
    for (field, id) in [("projectId", project_id), ("sessionId", session_id)] {
        let mut body = serde_json::json!({"content":"test"});
        body[field] = id.into();
        assert_eq!(
            client
                .post(format!("{base}/api/reminders"))
                .bearer_auth(other_token)
                .json(&body)
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
        assert_eq!(
            client
                .post(format!("{base}/api/reminders"))
                .bearer_auth(token)
                .json(&body)
                .send()
                .await
                .unwrap()
                .status(),
            201
        );
    }
    stop.send(()).unwrap();
    task.await.unwrap();
    std::fs::remove_dir_all(root).unwrap();
}
