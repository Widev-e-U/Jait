//! Black-box check: mobile approve/reject resolve a pending consent for its session owner only.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use jait_gateway::security::consent_manager::{ConsentRequestPolicy, RequestConsent};
use jait_gateway::security::contracts::Risk;
use jait_gateway::security::tool_permissions::{ConsentLevel, PolicySource};
use std::time::Duration;

fn request(session_id: &str, action: &str) -> RequestConsent {
    RequestConsent {
        action_id: action.into(),
        tool_name: "terminal.run".into(),
        summary: "run a command".into(),
        preview: serde_json::Map::new(),
        risk: Risk::High,
        policy: ConsentRequestPolicy {
            consent_level: ConsentLevel::Always,
            description: "test".into(),
            known_tool: true,
            source: PolicySource::Profile,
        },
        session_id: session_id.into(),
        timeout_ms: None,
    }
}

#[tokio::test]
async fn mobile_decisions_resolve_pending_consent_for_the_session_owner_only() {
    let dir = std::env::temp_dir().join(format!("jait-mobile-consent-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: dir.join("gateway.sqlite"),
            project_root: dir.clone(),
            jwt_secret: "mobile-consent-secret".into(),
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
    let consent = app.consent_manager().expect("chat mounts consent");
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
            v["access_token"].as_str().unwrap().to_owned()
        }
    };
    let alice = register("alice", None).await;
    let invite: serde_json::Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(&alice)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let bob = register(
        "bob",
        Some(invite["invitation"].as_str().unwrap().to_owned()),
    )
    .await;
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
    let session = created["id"].as_str().unwrap().to_owned();

    let decide = |token: String, id: String, action: &'static str| {
        let client = client.clone();
        let base = base.clone();
        async move {
            client
                .post(format!("{base}/api/mobile/consent/{id}/{action}"))
                .bearer_auth(token)
                .json(&serde_json::json!({}))
                .send()
                .await
                .unwrap()
                .status()
        }
    };

    let mut approved = consent.request_consent(request(&session, "a1")).unwrap();
    let mut rejected = consent.request_consent(request(&session, "a2")).unwrap();
    // Another user cannot decide either request.
    assert_eq!(
        decide(bob.clone(), approved.id.clone(), "approve").await,
        404
    );
    assert_eq!(decide(bob, rejected.id.clone(), "reject").await, 404);
    assert!(approved.outcome().is_none());

    assert_eq!(
        decide(alice.clone(), approved.id.clone(), "approve").await,
        200
    );
    assert!(approved.wait().await.unwrap().approved);
    assert_eq!(
        decide(alice.clone(), rejected.id.clone(), "reject").await,
        200
    );
    assert!(!rejected.wait().await.unwrap().approved);
    assert_eq!(
        decide(alice, approved.id.clone(), "approve").await,
        404,
        "already decided"
    );

    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
