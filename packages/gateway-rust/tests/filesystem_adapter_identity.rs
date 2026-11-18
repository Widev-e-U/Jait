use jait_gateway::{
    db::migrate_database,
    routes::{
        auth::AuthState,
        filesystem::{BrowseEnvironment, BrowseFuture, FilesystemNodes, FilesystemRoutes},
    },
    security::http_auth::{AuthUser, sign_auth_token},
    services::users::UserService,
};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Default)]
struct RecordingAdapter(Mutex<Vec<(String, String)>>);
impl FilesystemNodes for RecordingAdapter {
    fn register_gateway(&self, _: Value) {}
    fn nodes(&self, user_id: &str) -> Value {
        self.0
            .lock()
            .unwrap()
            .push(("nodes".into(), user_id.into()));
        json!([])
    }
    fn roots<'a>(&'a self, user_id: &'a str, _: Value) -> BrowseFuture<'a> {
        self.0
            .lock()
            .unwrap()
            .push(("roots".into(), user_id.into()));
        Box::pin(async { Ok(json!([])) })
    }
    fn browse<'a>(&'a self, user_id: &'a str, _: Value, _: Value) -> BrowseFuture<'a> {
        self.0
            .lock()
            .unwrap()
            .push(("browse".into(), user_id.into()));
        Box::pin(async { Ok(json!({})) })
    }
}

#[tokio::test]
async fn adapter_receives_authenticated_caller_for_each_operation() {
    let db = Connection::open_in_memory().unwrap();
    migrate_database(&db).unwrap();
    let owner = UserService::new(&db)
        .create_user("owner", "password-123")
        .unwrap();
    let user_id = owner.id.clone();
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
    let adapter = Arc::new(RecordingAdapter::default());
    let router = FilesystemRoutes::new(
        AuthState::new(db, secret.into()).unwrap(),
        env,
        Some(adapter.clone()),
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
    for route in ["nodes", "roots?nodeId=remote", "browse?nodeId=remote"] {
        let url = format!("http://{address}/api/filesystem/{route}");
        assert_eq!(client.get(&url).send().await.unwrap().status(), 401);
        assert_eq!(
            client
                .get(&url)
                .bearer_auth(&token)
                .send()
                .await
                .unwrap()
                .status(),
            200
        );
    }
    assert_eq!(
        *adapter.0.lock().unwrap(),
        vec![
            ("nodes".into(), user_id.clone()),
            ("roots".into(), user_id.clone()),
            ("browse".into(), user_id)
        ]
    );
    server.abort();
}
