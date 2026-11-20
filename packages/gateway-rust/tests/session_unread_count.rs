//! Black-box check for `GET /api/sessions/unread-count` through the composed binary.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use std::time::Duration;

#[tokio::test]
async fn unread_count_is_owner_scoped_and_clears_when_viewed() {
    let dir = std::env::temp_dir().join(format!("jait-unread-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let db_path = dir.join("gateway.sqlite");
    let mut app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: db_path.clone(),
            project_root: dir.clone(),
            jwt_secret: "unread-secret".into(),
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
        .timeout(Duration::from_secs(60))
        .build()
        .unwrap();
    let register = |name: &'static str, invitation: Option<String>| {
        let client = client.clone();
        let base = base.clone();
        async move {
            let v: serde_json::Value = client
                .post(format!("{base}/api/auth/register"))
                .json(&serde_json::json!({"username":name,"password":"correct-horse-1","invitation":invitation}))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            (
                v["access_token"].as_str().unwrap().to_owned(),
                v["user"]["id"].as_str().unwrap().to_owned(),
            )
        }
    };
    let (alice, alice_id) = register("alice", None).await;
    let invite: serde_json::Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(&alice)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let (bob, _) = register(
        "bob",
        Some(invite["invitation"].as_str().unwrap().to_owned()),
    )
    .await;
    let count = |token: String| {
        let client = client.clone();
        let base = base.clone();
        async move {
            let r = client
                .get(format!("{base}/api/sessions/unread-count"))
                .bearer_auth(token)
                .send()
                .await
                .unwrap();
            assert_eq!(r.status(), 200);
            r.json::<serde_json::Value>().await.unwrap()["count"]
                .as_u64()
                .unwrap()
        }
    };
    let anonymous = client
        .get(format!("{base}/api/sessions/unread-count"))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status(), 401);
    assert_eq!(count(alice.clone()).await, 0);

    let created: serde_json::Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(&alice)
        .json(&serde_json::json!({"name":"chat"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = created["id"].as_str().unwrap().to_owned();
    assert_eq!(count(alice.clone()).await, 0, "fresh chat is read");

    // Activity after the last view makes a chat unread.
    let db = rusqlite::Connection::open(&db_path).unwrap();
    db.execute(
        "UPDATE sessions SET last_active_at='2999-01-01T00:00:00.000Z' WHERE id=?1 AND user_id=?2",
        rusqlite::params![id, alice_id],
    )
    .unwrap();
    assert_eq!(count(alice.clone()).await, 1);
    assert_eq!(count(bob).await, 0, "other users never see it");
    let viewed = client
        .post(format!("{base}/api/sessions/{id}/viewed"))
        .bearer_auth(&alice)
        .send()
        .await
        .unwrap();
    assert!(viewed.status().is_success());
    db.execute(
        "UPDATE sessions SET viewed_at='2999-06-01T00:00:00.000Z' WHERE id=?1",
        [&id],
    )
    .unwrap();
    assert_eq!(count(alice).await, 0, "viewed after the activity");

    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
