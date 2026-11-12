//! Black-box checks for `POST /api/preview/reopen` through the composed binary.
//! No browser backend is attached, so an owned, valid request must fail closed with 503.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use std::time::Duration;

#[tokio::test]
async fn reopen_is_auth_gated_validated_owner_scoped_and_fails_closed_without_backend() {
    let dir = std::env::temp_dir().join(format!("jait-reopen-{}", uuid::Uuid::new_v4()));
    let project = dir.join("project");
    std::fs::create_dir_all(&project).unwrap();
    let mut app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: dir.join("gateway.sqlite"),
            project_root: dir.clone(),
            jwt_secret: "reopen-secret".into(),
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
    let register = |name: &'static str, invitation: Option<serde_json::Value>| {
        let client = client.clone();
        let base = base.clone();
        async move {
            let v: serde_json::Value = client
                .post(format!("{base}/api/auth/register"))
                .json(&serde_json::json!({"username":name,"password":"correct-horse-1","invitation":invitation}))
                .timeout(Duration::from_secs(60))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            v["access_token"].as_str().unwrap().to_owned()
        }
    };
    let token = register("reopener", None).await;
    let invite: serde_json::Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other = register("stranger", Some(invite["invitation"].clone())).await;
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
    let url = format!("{base}/api/preview/reopen");
    let post = |tok: Option<&str>, body: serde_json::Value| {
        let mut r = client.post(&url).json(&body);
        if let Some(t) = tok {
            r = r.bearer_auth(t);
        }
        r.send()
    };

    let good = serde_json::json!({"sessionId": sid, "url": "http://localhost:3000"});
    assert_eq!(post(None, good.clone()).await.unwrap().status(), 401);
    assert_eq!(
        post(
            Some(&token),
            serde_json::json!({"url":"http://localhost:3000"})
        )
        .await
        .unwrap()
        .status(),
        400
    );
    assert_eq!(
        post(
            Some(&token),
            serde_json::json!({"sessionId": sid, "url": ""})
        )
        .await
        .unwrap()
        .status(),
        400
    );
    assert_eq!(
        post(
            Some(&token),
            serde_json::json!({"sessionId": sid, "url": "http://localhost:3000", "extra": 1})
        )
        .await
        .unwrap()
        .status(),
        400
    );
    assert_eq!(
        post(
            Some(&token),
            serde_json::json!({"sessionId": "nope", "url": "http://localhost:3000"})
        )
        .await
        .unwrap()
        .status(),
        404
    );
    assert_eq!(
        post(Some(&other), good.clone()).await.unwrap().status(),
        404
    );
    assert_eq!(post(Some(&token), good).await.unwrap().status(), 503);

    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
