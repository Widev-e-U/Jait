//! Black-box checks for `GET /api/browser/screenshot` through the composed binary.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use std::time::Duration;

#[tokio::test]
async fn screenshot_is_auth_gated_project_scoped_and_image_only() {
    let dir = std::env::temp_dir().join(format!("jait-shot-{}", uuid::Uuid::new_v4()));
    let project = dir.join("project");
    std::fs::create_dir_all(project.join(".jait/shots")).unwrap();
    std::fs::write(project.join(".jait/shots/a.png"), b"\x89PNG-bytes").unwrap();
    std::fs::write(project.join("notes.txt"), b"secret").unwrap();
    std::fs::write(dir.join("outside.png"), b"outside").unwrap();
    let mut app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: dir.join("gateway.sqlite"),
            project_root: dir.clone(),
            jwt_secret: "shot-secret".into(),
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
        .json(&serde_json::json!({"username":"shooter","password":"correct-horse-1"}))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap().to_owned();
    let session: serde_json::Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"projectPath": project.to_str().unwrap()}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let sid = session["id"].as_str().unwrap().to_owned();
    let url = format!("{base}/api/browser/screenshot");
    let get = |path: &str, sid: &str, auth: bool| {
        let full = url::Url::parse_with_params(&url, [("path", path), ("sessionId", sid)]).unwrap();
        let mut r = client.get(full);
        if auth {
            r = r.bearer_auth(&token);
        }
        r.send()
    };

    assert_eq!(
        get(".jait/shots/a.png", &sid, false)
            .await
            .unwrap()
            .status(),
        401
    );
    let ok = get(".jait/shots/a.png", &sid, true).await.unwrap();
    assert_eq!(ok.status(), 200);
    assert_eq!(ok.headers()["content-type"], "image/png");
    assert_eq!(ok.bytes().await.unwrap().as_ref(), b"\x89PNG-bytes");
    assert_eq!(
        get("../outside.png", &sid, true).await.unwrap().status(),
        403
    );
    assert_eq!(get("notes.txt", &sid, true).await.unwrap().status(), 400);
    assert_eq!(get("missing.png", &sid, true).await.unwrap().status(), 404);
    assert_eq!(
        get(".jait/shots/a.png", "nosuchsession", true)
            .await
            .unwrap()
            .status(),
        404
    );
    let no_session = client
        .get(format!("{url}?path=a.png"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(no_session.status(), 400);

    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
