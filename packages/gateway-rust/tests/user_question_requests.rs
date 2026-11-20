//! Black-box check: a pending user question is listed, owner-scoped, answerable and cancellable over HTTP.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use jait_gateway::services::input_requests::QuestionInput;
use std::time::Duration;

#[tokio::test]
async fn pending_questions_are_answered_and_cancelled_by_their_owner_only() {
    let dir = std::env::temp_dir().join(format!("jait-questions-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: dir.join("gateway.sqlite"),
            project_root: dir.clone(),
            jwt_secret: "questions-secret".into(),
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
    let questions = app.user_questions();
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
    let post = |path: String, token: String, body: serde_json::Value| {
        let client = client.clone();
        let base = base.clone();
        async move {
            client
                .post(format!("{base}{path}"))
                .bearer_auth(token)
                .json(&body)
                .send()
                .await
                .unwrap()
        }
    };
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

    let ask = |title: &str| {
        questions.ask(QuestionInput {
            session_id: "s1".into(),
            user_id: Some(alice_id.clone()),
            title: Some(title.into()),
            questions: vec![serde_json::json!({"id":"q1","question":"Which?"})],
            ..Default::default()
        })
    };
    let first = ask("first");
    let listed = |token: String| {
        let client = client.clone();
        let base = base.clone();
        async move {
            client
                .get(format!("{base}/api/user-questions/requests"))
                .bearer_auth(token)
                .send()
                .await
                .unwrap()
                .json::<serde_json::Value>()
                .await
                .unwrap()["requests"]
                .as_array()
                .unwrap()
                .len()
        }
    };
    assert_eq!(listed(alice.clone()).await, 1);
    assert_eq!(listed(bob.clone()).await, 0, "other users cannot see it");

    // Another user can neither answer nor cancel it.
    let submit = format!("/api/user-questions/requests/{}/submit", first.id);
    let body = serde_json::json!({"answers":{"q1":{"selected":["a"]}}});
    assert_eq!(
        post(submit.clone(), bob.clone(), body.clone())
            .await
            .status(),
        404
    );
    assert_eq!(
        post(
            format!("/api/user-questions/requests/{}/cancel", first.id),
            bob,
            serde_json::json!({})
        )
        .await
        .status(),
        404
    );
    assert_eq!(listed(alice.clone()).await, 1);

    // The owner answers: the waiting agent receives the normalized answer.
    assert_eq!(
        post(submit.clone(), alice.clone(), body.clone())
            .await
            .status(),
        200
    );
    let answer = first.result.await.unwrap().expect("answered");
    assert_eq!(
        answer["answers"]["q1"]["selected"],
        serde_json::json!(["a"])
    );
    assert_eq!(listed(alice.clone()).await, 0);
    assert_eq!(
        post(submit, alice.clone(), body).await.status(),
        404,
        "already resolved"
    );

    // Cancelling resolves the waiter with no answer.
    let second = ask("second");
    assert_eq!(
        post(
            format!("/api/user-questions/requests/{}/cancel", second.id),
            alice.clone(),
            serde_json::json!({})
        )
        .await
        .status(),
        200
    );
    assert!(second.result.await.unwrap().is_none());
    assert_eq!(listed(alice).await, 0);

    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
