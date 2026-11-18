//! Missing remote transports must not silently browse the local machine.
use jait_gateway::{
    db::migrate_database,
    routes::{
        auth::AuthState,
        filesystem::{BrowseEnvironment, FilesystemRoutes},
    },
    security::http_auth::{AuthUser, sign_auth_token},
    services::users::UserService,
};
use rusqlite::Connection;
use std::{path::PathBuf, sync::Arc, time::Duration};

#[tokio::test]
async fn remote_requests_fail_closed_without_node_adapter() {
    let db = Connection::open_in_memory().unwrap();
    migrate_database(&db).unwrap();
    let owner = UserService::new(&db)
        .create_user("owner", "password-123")
        .unwrap();
    let secret = "filesystem-test-secret-at-least-32-bytes";
    let token = sign_auth_token(
        &AuthUser {
            id: owner.id,
            username: owner.username,
        },
        secret,
    )
    .unwrap();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let env = BrowseEnvironment {
        home: root.clone(),
        cwd: root,
        hostname: "test".into(),
        platform: "linux".into(),
        drives: Arc::new(|| Ok(String::new())),
    };
    let router = FilesystemRoutes::new(
        AuthState::new(db, secret.into()).unwrap(),
        env,
        None,
        String::new(),
    )
    .router();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    for path in ["roots", "browse"] {
        for node_query in [
            "nodeId=remote",
            "nodeId=gateway&nodeId=remote",
            "nodeId=&nodeId=remote",
        ] {
            let response = client
                .get(format!(
                    "http://{address}/api/filesystem/{path}?{node_query}&path=."
                ))
                .bearer_auth(&token)
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), 502);
            assert_eq!(
                response.json::<serde_json::Value>().await.unwrap()["error"],
                "NODE_BROWSE_FAILED"
            );
        }
    }
    let response = client
        .get(format!(
            "http://{address}/api/filesystem/roots?nodeId=gateway"
        ))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    server.abort();
}
