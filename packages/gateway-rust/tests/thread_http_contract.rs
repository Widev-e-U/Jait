//! HTTP expectations derived from packages/gateway/src/routes/threads.ts.
//! These exercise a real loopback listener and an isolated migrated database.
//! Known differences are asserted as TypeScript contracts, so they remain visible
//! to the coordinator as test failures until the route implementation catches up.
use axum::Router;
use jait_gateway::{
    db::migrate_database,
    routes::{auth::AuthState, threads::ThreadRoutes},
    security::http_auth::{AuthUser, sign_auth_token},
    services::users::UserService,
};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::time::Duration;

const SECRET: &str = "thread-http-contract-secret-at-least-32-bytes";

struct Server {
    base: String,
    owner: String,
    other: String,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn fixture_with_delete_failure(fail_delete: bool) -> Server {
    fixture_with_options(fail_delete, 0).await
}

async fn fixture_with_options(fail_delete: bool, additional_activities: usize) -> Server {
    let db = Connection::open_in_memory().unwrap();
    migrate_database(&db).unwrap();
    let owner = UserService::new(&db)
        .create_user("thread-owner", "fixture-password")
        .unwrap();
    let other = UserService::new(&db)
        .create_user("thread-other", "fixture-password")
        .unwrap();
    for (id, user_id, updated) in [
        ("owned", &owner.id, "2026-01-02T00:00:00.000Z"),
        ("older", &owner.id, "2026-01-01T00:00:00.000Z"),
        ("foreign", &other.id, "2026-01-03T00:00:00.000Z"),
    ] {
        db.execute("INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, created_at, updated_at) VALUES (?1, ?2, 'shared-session', ?1, 'provider', ?3, ?3)", params![id, user_id, updated]).unwrap();
    }
    db.execute("INSERT INTO agent_thread_activities (id, thread_id, kind, summary, payload, created_at) VALUES ('message', 'owned', 'message', 'hello', '{\"role\":\"user\"}', '2026-01-02T00:00:00.000Z')", []).unwrap();
    for index in 0..additional_activities {
        db.execute("INSERT INTO agent_thread_activities (id, thread_id, kind, summary, created_at) VALUES (?1, 'owned', 'message', 'extra', '2026-01-01T00:00:00.000Z')", params![format!("extra-{index}")]).unwrap();
    }
    if fail_delete {
        db.execute_batch("CREATE TRIGGER fail_thread_delete BEFORE DELETE ON agent_threads BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
    }
    let token =
        |id: String, username: String| sign_auth_token(&AuthUser { id, username }, SECRET).unwrap();
    let owner = token(owner.id, owner.username);
    let other = token(other.id, other.username);
    let router: Router = ThreadRoutes::new(AuthState::new(db, SECRET.into()).unwrap()).router();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    Server {
        base,
        owner,
        other,
        task,
    }
}

async fn fixture() -> Server {
    fixture_with_delete_failure(false).await
}

async fn request(
    server: &Server,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (u16, Value) {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap();
    let mut request = client.request(method.parse().unwrap(), format!("{}{}", server.base, path));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request.send().await.unwrap();
    let status = response.status().as_u16();
    let bytes = response.bytes().await.unwrap();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    (status, body)
}

#[tokio::test]
async fn authentication_and_ownership_are_enforced_on_http_routes() {
    let s = fixture().await;
    for (method, path) in [
        ("GET", "/api/threads"),
        ("GET", "/api/threads/owned"),
        ("PATCH", "/api/threads/owned"),
        ("DELETE", "/api/threads/owned"),
        ("GET", "/api/threads/owned/runtime"),
        ("GET", "/api/threads/owned/activities"),
        ("GET", "/api/persona-agents"),
        ("PUT", "/api/persona-agents/a"),
        ("DELETE", "/api/persona-agents/a"),
    ] {
        assert_eq!(
            request(&s, method, path, None, None).await,
            (401, json!({"detail":"login_required"})),
            "{method} {path}"
        );
        assert_eq!(
            request(&s, method, path, Some("invalid"), None).await.0,
            401,
            "{method} {path}"
        );
    }
    for (method, path) in [
        ("GET", "/api/threads/owned"),
        ("PATCH", "/api/threads/owned"),
        ("DELETE", "/api/threads/owned"),
        ("GET", "/api/threads/owned/runtime"),
        ("GET", "/api/threads/owned/activities"),
    ] {
        assert_eq!(
            request(&s, method, path, Some(&s.other), Some(json!({}))).await,
            (404, json!({"error":"Thread not found"})),
            "{method} {path}"
        );
    }
    assert_eq!(
        request(&s, "GET", "/api/threads/owned", Some(&s.owner), None)
            .await
            .0,
        200
    );
}

#[tokio::test]
async fn get_patch_runtime_activities_and_delete() {
    let s = fixture().await;
    let auth = Some(s.owner.as_str());
    let (status, thread) = request(&s, "GET", "/api/threads/owned", auth, None).await;
    assert_eq!(status, 200);
    assert_eq!(thread["title"], "owned");
    let (status, updated) = request(
        &s,
        "PATCH",
        "/api/threads/owned",
        auth,
        Some(json!({"title":"renamed", "runtimeMode":"supervised"})),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(updated["title"], "renamed");
    assert_eq!(updated["runtimeMode"], "supervised");
    assert_eq!(
        request(
            &s,
            "PATCH",
            "/api/threads/owned",
            auth,
            Some(json!({"personaAgentId":"missing"}))
        )
        .await,
        (400, json!({"error":"Agent profile not found"}))
    );
    let (status, runtime) = request(&s, "GET", "/api/threads/owned/runtime", auth, None).await;
    assert_eq!(status, 200);
    assert_eq!(runtime["startedAt"], "2026-01-02T00:00:00.000Z");
    let (status, activities) =
        request(&s, "GET", "/api/threads/owned/activities", auth, None).await;
    assert_eq!(status, 200);
    assert_eq!(activities["activities"][0]["id"], "message");
    assert_eq!(
        request(&s, "DELETE", "/api/threads/owned", auth, None).await,
        (204, Value::Null)
    );
    assert_eq!(
        request(&s, "GET", "/api/threads/owned", auth, None).await,
        (404, json!({"error":"Thread not found"}))
    );
}

#[tokio::test]
async fn list_includes_pagination() {
    let s = fixture().await;
    let (status, body) = request(&s, "GET", "/api/threads?limit=1", Some(&s.owner), None).await;
    assert_eq!(status, 200);
    assert_eq!(body["threads"].as_array().unwrap().len(), 1);
    assert_eq!(body["threads"][0]["id"], "owned");
    assert_eq!(body["hasMore"], true);
}

#[tokio::test]
async fn list_limit_matches_parse_int_and_session_filter_order() {
    let s = fixture().await;
    for (query, expected_len, has_more) in [
        ("limit=1suffix", 1, true),
        ("limit=1.9", 1, true),
        ("limit=%2B1", 1, true),
        ("limit=%C2%851", 2, false),
        ("limit=%EF%BB%BF1", 1, true),
        ("limit=0x10", 2, false),
        ("limit=1&limit=1", 2, false),
        ("sessionId=shared-session&limit=1", 1, false),
        ("sessionId=shared-session&limit=2", 2, false),
    ] {
        let (status, body) = request(
            &s,
            "GET",
            &format!("/api/threads?{query}"),
            Some(&s.owner),
            None,
        )
        .await;
        assert_eq!(status, 200, "{query}");
        assert_eq!(
            body["threads"].as_array().unwrap().len(),
            expected_len,
            "{query}"
        );
        assert_eq!(body["hasMore"], has_more, "{query}");
    }
}

#[tokio::test]
async fn activity_limit_and_after_follow_http_contract() {
    let s = fixture().await;
    for query in [
        "limit=0",
        "limit=-8",
        "limit=1tail",
        "limit=2000",
        "after=9999-12-31",
    ] {
        let (status, body) = request(
            &s,
            "GET",
            &format!("/api/threads/owned/activities?{query}"),
            Some(&s.owner),
            None,
        )
        .await;
        assert_eq!(status, 200, "{query}");
        assert_eq!(body["activities"].as_array().unwrap().len(), 1, "{query}");
    }
}

#[tokio::test]
async fn activities_limit_clamps_to_typescript_boundaries() {
    let s = fixture_with_options(false, 2001).await;
    for (query, expected) in [
        ("limit=0", 1),
        ("limit=101", 101),
        ("limit=2000", 2000),
        ("limit=9000", 2000),
        ("limit=invalid", 2002),
    ] {
        let (status, body) = request(
            &s,
            "GET",
            &format!("/api/threads/owned/activities?{query}"),
            Some(&s.owner),
            None,
        )
        .await;
        assert_eq!(status, 200, "{query}");
        assert_eq!(
            body["activities"].as_array().unwrap().len(),
            expected,
            "{query}"
        );
    }
}

#[tokio::test]
async fn duplicate_session_id_returns_internal_error() {
    let s = fixture().await;
    for query in [
        "sessionId=shared-session&sessionId=other",
        "sessionId=&sessionId=shared-session",
    ] {
        let (status, _) = request(
            &s,
            "GET",
            &format!("/api/threads?{query}"),
            Some(&s.owner),
            None,
        )
        .await;
        assert_eq!(status, 500, "{query}");
    }
}

#[tokio::test]
async fn session_list_filters_by_owner() {
    let s = fixture().await;
    let (status, body) = request(
        &s,
        "GET",
        "/api/threads?sessionId=shared-session",
        Some(&s.owner),
        None,
    )
    .await;
    assert_eq!(status, 200);
    let ids: Vec<_> = body["threads"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, ["owned", "older"]);
    assert_eq!(body["hasMore"], false);
}

#[tokio::test]
async fn invalid_runtime_mode_is_ignored_like_typescript() {
    let s = fixture().await;
    let (status, body) = request(
        &s,
        "PATCH",
        "/api/threads/owned",
        Some(&s.owner),
        Some(json!({"runtimeMode":"invalid"})),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(body["runtimeMode"], "full-access");
}

#[tokio::test]
async fn delete_database_failure_rolls_back_activities_and_thread() {
    let s = fixture_with_delete_failure(true).await;
    let auth = Some(s.owner.as_str());
    assert_eq!(
        request(&s, "DELETE", "/api/threads/owned", auth, None).await,
        (500, json!({"error":"Internal Server Error"}))
    );
    let (status, thread) = request(&s, "GET", "/api/threads/owned", auth, None).await;
    assert_eq!(status, 200);
    assert_eq!(thread["id"], "owned");
    let (status, activities) =
        request(&s, "GET", "/api/threads/owned/activities", auth, None).await;
    assert_eq!(status, 200);
    assert_eq!(activities["activities"].as_array().unwrap().len(), 1);
    assert_eq!(activities["activities"][0]["id"], "message");
}
