//! Black-box checks for `GET /api/live-view/{port}/focus` and `GET /preview/{token}/live/{port}/focus`.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use std::time::Duration;

const SECRET: &str = "live-view-focus-secret";

#[tokio::test]
async fn focus_only_answers_for_live_view_ports_registered_to_the_caller() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts")
        .join(format!("jait-live-focus-{}", uuid::Uuid::new_v4()));
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
    let live = app.live_view_ports();
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
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let registered: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"viewer","password":"correct-horse-1"}))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap().to_owned();
    let user_id = registered["user"]["id"].as_str().unwrap().to_owned();
    let port = 6080u16;

    assert_eq!(
        client
            .get(format!("{base}/api/live-view/{port}/focus"))
            .send()
            .await
            .unwrap()
            .status(),
        401,
        "anonymous"
    );
    let unregistered = client
        .get(format!("{base}/api/live-view/{port}/focus"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(unregistered.status(), 403);
    assert_eq!(
        unregistered.json::<serde_json::Value>().await.unwrap()["error"],
        "LIVE_VIEW_NOT_REGISTERED"
    );
    live.register("someone-else", port);
    assert_eq!(
        client
            .get(format!("{base}/api/live-view/{port}/focus"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .status(),
        403,
        "another owner's port"
    );

    live.register(&user_id, port);
    let ok = client
        .get(format!("{base}/api/live-view/{port}/focus"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(ok.status(), 200);
    assert_eq!(ok.headers()["cache-control"], "no-store");
    assert_eq!(
        ok.json::<serde_json::Value>().await.unwrap()["editing"],
        false
    );

    // Token form: scoped to `live:{port}`, no bearer needed.
    let grant = jait_gateway::security::preview_token::sign_preview_token(
        &user_id,
        &format!("live:{port}"),
        SECRET,
    )
    .unwrap();
    let shared = client
        .get(format!("{base}/preview/{grant}/live/{port}/focus"))
        .send()
        .await
        .unwrap();
    assert_eq!(shared.status(), 200);
    assert_eq!(
        shared.json::<serde_json::Value>().await.unwrap()["editing"],
        false
    );
    let wrong_scope = jait_gateway::security::preview_token::sign_preview_token(
        &user_id,
        &format!("proxy:{port}"),
        SECRET,
    )
    .unwrap();
    assert_eq!(
        client
            .get(format!("{base}/preview/{wrong_scope}/live/{port}/focus"))
            .send()
            .await
            .unwrap()
            .status(),
        401,
        "a proxy-scoped token must not open a live view"
    );

    live.unregister(&user_id, port);
    assert_eq!(
        client
            .get(format!("{base}/preview/{grant}/live/{port}/focus"))
            .send()
            .await
            .unwrap()
            .status(),
        403,
        "closed live view"
    );

    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
