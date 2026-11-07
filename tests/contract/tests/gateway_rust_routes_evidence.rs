//! Consumer-level contract tests for the native Rust `routes` cluster.
//!
//! Every test mounts the *native* route builder on a real TCP listener and talks
//! HTTP to it, so routing, method dispatch, auth gating, status codes and body
//! shapes are all exercised through the public `jait_gateway` API only.

use serde_json::{Value, json};

pub const SECRET: &str = "contract-test-secret-0123456789abcdef0123456789";
pub const OWNER: &str = "u-owner";

/// Auth state backed by a freshly migrated in-memory database.
pub fn auth_seeded(
    seed: impl FnOnce(&rusqlite::Connection),
) -> jait_gateway::routes::auth::AuthState {
    let db = rusqlite::Connection::open_in_memory().unwrap();
    jait_gateway::db::migrate_database(&db).unwrap();
    db.execute(
        "INSERT INTO users(id,username,password_hash,created_at,updated_at) \
         VALUES(?1,'owner','x','2024-01-01T00:00:00.000Z','2024-01-01T00:00:00.000Z')",
        rusqlite::params![OWNER],
    )
    .unwrap();
    seed(&db);
    jait_gateway::routes::auth::AuthState::new(db, SECRET.to_string()).unwrap()
}

pub fn auth() -> jait_gateway::routes::auth::AuthState {
    auth_seeded(|_| {})
}

pub fn token() -> String {
    jait_gateway::security::http_auth::sign_auth_token(
        &jait_gateway::security::http_auth::AuthUser {
            id: OWNER.to_string(),
            username: "owner".to_string(),
        },
        SECRET,
    )
    .unwrap()
}

/// A live HTTP endpoint serving one native router.
pub struct Api {
    pub base: String,
    pub client: reqwest::Client,
    pub bearer: String,
    task: tokio::task::JoinHandle<()>,
    auth: jait_gateway::routes::auth::AuthState,
}

impl Api {
    pub async fn start(router: axum::Router, auth: jait_gateway::routes::auth::AuthState) -> Self {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });
        Self {
            base: format!("http://{addr}"),
            client: reqwest::Client::new(),
            bearer: token(),
            task,
            auth,
        }
    }

    pub async fn send(
        &self,
        method: &str,
        path: &str,
        bearer: Option<&str>,
        body: Option<Value>,
    ) -> (u16, Value) {
        let mut req = self
            .client
            .request(method.parse().unwrap(), format!("{}{}", self.base, path));
        if let Some(token) = bearer {
            req = req.header("authorization", format!("Bearer {token}"));
        }
        if let Some(payload) = body {
            req = req.json(&payload);
        }
        let res = req.send().await.unwrap();
        let status = res.status().as_u16();
        let text = res.text().await.unwrap();
        let parsed = serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text));
        (status, parsed)
    }

    /// Authenticated request.
    pub async fn ok(&self, method: &str, path: &str) -> (u16, Value) {
        self.send(method, path, Some(&self.bearer), None).await
    }

    pub async fn with(&self, method: &str, path: &str, body: Value) -> (u16, Value) {
        self.send(method, path, Some(&self.bearer), Some(body))
            .await
    }

    /// Authenticated request carrying extra headers (used for Origin checks).
    pub async fn with_headers(
        &self,
        method: &str,
        path: &str,
        bearer: Option<&str>,
        body: Option<Value>,
        headers: &[(&str, &str)],
    ) -> (u16, Value) {
        let mut req = self
            .client
            .request(method.parse().unwrap(), format!("{}{}", self.base, path));
        for (name, value) in headers {
            req = req.header(*name, *value);
        }
        if let Some(token) = bearer {
            req = req.header("authorization", format!("Bearer {token}"));
        }
        if let Some(payload) = body {
            req = req.json(&payload);
        }
        let res = req.send().await.unwrap();
        let status = res.status().as_u16();
        let text = res.text().await.unwrap();
        let parsed = serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text));
        (status, parsed)
    }

    pub async fn stop(self) {
        self.task.abort();
        self.auth.shutdown().await;
    }
}

pub fn seed_repository(db: &rusqlite::Connection, id: &str, name: &str) {
    db.execute(
        "INSERT INTO automation_repositories(id,user_id,name,default_branch,local_path,created_at,updated_at) \
         VALUES(?1,?2,?3,'main','/tmp/repo','2024-01-01T00:00:00.000Z','2024-01-01T00:00:00.000Z')",
        rusqlite::params![id, OWNER, name],
    )
    .unwrap();
}

mod plans {
    use super::*;
    use jait_gateway::routes::plans::PlanRoutes;

    async fn api() -> Api {
        let auth = auth_seeded(|db| seed_repository(db, "repo-1", "jait"));
        let router = PlanRoutes::new(auth.clone()).router();
        Api::start(router, auth).await
    }

    #[tokio::test]
    async fn unauthenticated_list_is_rejected() {
        let server = api().await;
        let (status, body) = server
            .send("GET", "/api/repos/repo-1/plans", None, None)
            .await;
        assert_eq!(status, 401);
        assert_eq!(body, json!({"detail": "login_required"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn create_defaults_title_and_status() {
        let server = api().await;
        let (status, body) = server
            .with("POST", "/api/repos/repo-1/plans", json!({}))
            .await;
        assert_eq!(status, 201);
        let plan = &body["plan"];
        assert_eq!(plan["title"], json!("New Plan"));
        assert_eq!(plan["status"], json!("draft"));
        assert_eq!(plan["repoId"], json!("repo-1"));
        assert_eq!(plan["userId"], json!(OWNER));
        assert_eq!(plan["tasks"], json!([]));
        assert!(plan["id"].as_str().is_some_and(|id| !id.is_empty()));
        server.stop().await;
    }

    #[tokio::test]
    async fn created_plan_is_readable_and_listed() {
        let server = api().await;
        let (_, created) = server
            .with(
                "POST",
                "/api/repos/repo-1/plans",
                json!({"title": "Ship it"}),
            )
            .await;
        let id = created["plan"]["id"].as_str().unwrap().to_string();

        let (status, body) = server.ok("GET", &format!("/api/plans/{id}")).await;
        assert_eq!(status, 200);
        assert_eq!(body["plan"]["id"], json!(id));
        assert_eq!(body["plan"]["title"], json!("Ship it"));

        let (status, body) = server.ok("GET", "/api/repos/repo-1/plans").await;
        assert_eq!(status, 200);
        let listed = body["plans"].as_array().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0]["id"], json!(id));
        server.stop().await;
    }

    #[tokio::test]
    async fn unknown_plan_is_404_with_error_body() {
        let server = api().await;
        let (status, body) = server.ok("GET", "/api/plans/does-not-exist").await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": "Plan not found"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn unknown_repository_is_refused() {
        let server = api().await;
        let (status, body) = server.ok("GET", "/api/repos/nope/plans").await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": "Repository not found"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn patch_ignores_unknown_status_and_delete_removes() {
        let server = api().await;
        let (_, created) = server
            .with("POST", "/api/repos/repo-1/plans", json!({}))
            .await;
        let id = created["plan"]["id"].as_str().unwrap().to_string();

        let (status, body) = server
            .with(
                "PATCH",
                &format!("/api/plans/{id}"),
                json!({"status": "bogus", "title": "Renamed"}),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["plan"]["title"], json!("Renamed"));
        assert_eq!(body["plan"]["status"], json!("draft"));

        let (status, body) = server.ok("DELETE", &format!("/api/plans/{id}")).await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"ok": true}));

        let (status, body) = server.ok("GET", &format!("/api/plans/{id}")).await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": "Plan not found"}));
        server.stop().await;
    }
}

// ---------------------------------------------------------------------------
// routes/preview.ts -> packages/gateway-rust/src/routes/preview.rs
// ---------------------------------------------------------------------------
mod preview {
    use super::*;
    use jait_gateway::routes::preview::PreviewRoutes;

    async fn api() -> Api {
        let auth = auth();
        let router = PreviewRoutes::new(auth.clone()).router();
        Api::start(router, auth).await
    }

    async fn api_with_session(id: &str) -> Api {
        let auth = auth_seeded(|db| {
            db.execute(
                "INSERT INTO sessions(id,user_id,name,project_path,created_at,last_active_at,status) \
                 VALUES(?1,?2,'s','/tmp','2024-01-01T00:00:00Z','2024-01-01T00:00:00Z','active')",
                rusqlite::params![id, OWNER],
            )
            .expect("seed session");
        });
        let router = PreviewRoutes::new(auth.clone()).router();
        Api::start(router, auth).await
    }

    #[tokio::test]
    async fn unauthenticated_preview_calls_are_401() {
        let server = api().await;
        for path in [
            "/api/preview/session/any",
            "/api/preview/screenshot/any",
            "/api/preview/logs/any",
            "/api/preview/inspect/any",
        ] {
            let (status, body) = server.send("GET", path, None, None).await;
            assert_eq!(status, 401, "path {path}");
            assert_eq!(body, json!({"detail": "login_required"}), "path {path}");
        }
        let (status, body) = server
            .send(
                "POST",
                "/api/preview/start",
                None,
                Some(json!({"sessionId": "s"})),
            )
            .await;
        assert_eq!(status, 401);
        assert_eq!(body, json!({"detail": "login_required"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn unknown_session_is_404_and_unknown_action_is_plain_not_found() {
        let server = api().await;
        for path in [
            "/api/preview/session/missing",
            "/api/preview/screenshot/missing",
            "/api/preview/logs/missing",
            "/api/preview/inspect/missing",
        ] {
            let (status, body) = server.ok("GET", path).await;
            assert_eq!(status, 404, "path {path}");
            assert_eq!(body["error"], json!("Session not found"), "path {path}");
        }
        // Paths outside the preview router are not matched at all: bare 404.
        let (status, body) = server.ok("GET", "/api/preview/download/missing").await;
        assert_eq!(status, 404);
        assert_eq!(body, json!(""));
        server.stop().await;
    }

    #[tokio::test]
    async fn control_requests_validate_shape_and_limits() {
        let server = api().await;

        let (status, body) = server.with("POST", "/api/preview/start", json!({})).await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("sessionId is required"));

        // `share` reuses the same guard but words the message differently.
        let (status, body) = server.with("POST", "/api/preview/share", json!({})).await;
        assert_eq!(status, 400);
        assert_eq!(
            body["error"],
            json!("sessionId and sharedWithAgent are required")
        );

        // sessionId is capped at 4096 chars.
        let (status, body) = server
            .with(
                "POST",
                "/api/preview/start",
                json!({"sessionId": "x".repeat(4097)}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("Invalid sessionId"));
        let (status, _) = server
            .with(
                "POST",
                "/api/preview/start",
                json!({"sessionId": "x".repeat(4096)}),
            )
            .await;
        assert_ne!(status, 400, "4096-char sessionId must pass validation");

        // navigate accepts only sessionId+url keys.
        let (status, body) = server
            .with(
                "POST",
                "/api/preview/navigate",
                json!({"sessionId": "s", "url": "http://x", "extra": 1}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("Invalid preview request"));

        // ...and rejects an empty or over-long url.
        for url in ["".to_string(), "u".repeat(8193)] {
            let (status, body) = server
                .with(
                    "POST",
                    "/api/preview/navigate",
                    json!({"sessionId": "s", "url": url}),
                )
                .await;
            assert_eq!(status, 400);
            assert_eq!(body["error"], json!("Invalid preview URL"));
        }

        // share requires a real boolean.
        let (status, body) = server
            .with(
                "POST",
                "/api/preview/share",
                json!({"sessionId": "s", "sharedWithAgent": "yes"}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(
            body["error"],
            json!("sessionId and sharedWithAgent are required")
        );

        // Unknown action stays 404, never 400.
        let (status, body) = server
            .with("POST", "/api/preview/levitate", json!({"sessionId": "s"}))
            .await;
        assert_eq!(status, 404);
        // Unregistered preview paths fall through to the bare router 404 (empty body).
        assert_eq!(body, json!(""));
        server.stop().await;
    }

    #[tokio::test]
    async fn owned_session_without_a_backend_reports_503() {
        let server = api_with_session("sess-1").await;
        let (status, body) = server.ok("GET", "/api/preview/session/sess-1").await;
        assert_eq!(status, 503);
        assert_eq!(body["error"], json!("Preview backend unavailable"));
        let (status, body) = server
            .with("POST", "/api/preview/stop", json!({"sessionId": "sess-1"}))
            .await;
        assert_eq!(status, 503);
        assert_eq!(body["error"], json!("Preview backend unavailable"));
        // Another user's / unknown session stays hidden.
        let (status, body) = server.ok("GET", "/api/preview/session/other").await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("Session not found"));
        server.stop().await;
    }

    #[tokio::test]
    async fn logs_cursor_parsing_decides_between_empty_page_and_backend_call() {
        let server = api_with_session("sess-1").await;
        // Unparseable cursor short-circuits to an empty page.
        let (status, body) = server
            .ok("GET", "/api/preview/logs/sess-1?sinceId=abc")
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["logs"], json!([]));
        // A parseable (or absent) cursor must hit the preview backend.
        for query in ["", "?sinceId=0"] {
            let (status, body) = server
                .ok("GET", &format!("/api/preview/logs/sess-1{query}"))
                .await;
            assert_eq!(status, 503, "query {query:?}");
            assert_eq!(body["error"], json!("Preview backend unavailable"));
        }
        server.stop().await;
    }
}

// ---------------------------------------------------------------------------
// routes/projects.ts -> packages/gateway-rust/src/routes/projects.rs
// ---------------------------------------------------------------------------
mod projects {
    use super::*;
    use jait_gateway::routes::projects::ProjectCollectionRoutes;

    async fn api() -> Api {
        let auth = auth();
        let router = ProjectCollectionRoutes::new(auth.clone()).router();
        Api::start(router, auth).await
    }

    #[tokio::test]
    async fn collection_requires_authentication() {
        let server = api().await;
        let (status, body) = server.send("GET", "/api/projects", None, None).await;
        assert_eq!(status, 401);
        assert_eq!(body, json!({"detail": "login_required"}));
        let (status, body) = server
            .send("POST", "/api/projects", None, Some(json!({"title": "x"})))
            .await;
        assert_eq!(status, 401);
        assert_eq!(body, json!({"detail": "login_required"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn created_project_is_listed_as_active_and_absent_status_defaults_to_active() {
        let server = api().await;
        let (status, body) = server
            .with(
                "POST",
                "/api/projects",
                json!({"title": "Alpha", "rootPath": "/tmp/jait-alpha"}),
            )
            .await;
        assert_eq!(status, 201, "body: {body}");
        assert_eq!(body["title"], json!("Alpha"));
        let id = body["id"].as_str().expect("id").to_string();

        let (status, body) = server.ok("GET", "/api/projects").await;
        assert_eq!(status, 200);
        let listed: Vec<&str> = body["projects"]
            .as_array()
            .expect("projects array")
            .iter()
            .filter_map(|p| p["id"].as_str())
            .collect();
        assert_eq!(listed, vec![id.as_str()], "default status=active lists it");

        // A status filter that does not match hides the project.
        let (status, body) = server.ok("GET", "/api/projects?status=archived").await;
        assert_eq!(status, 200);
        assert_eq!(body["projects"], json!([]));
        server.stop().await;
    }

    #[tokio::test]
    async fn exclusive_root_collision_is_409_naming_the_existing_owner() {
        let server = api().await;
        let (status, _) = server
            .with(
                "POST",
                "/api/projects",
                json!({"title": "Alpha", "rootPath": "/tmp/jait-shared-root"}),
            )
            .await;
        assert_eq!(status, 201);
        let (status, body) = server
            .with(
                "POST",
                "/api/projects",
                json!({"title": "Beta", "exclusiveRoot": "/tmp/jait-shared-root"}),
            )
            .await;
        assert_eq!(status, 409);
        assert_eq!(body["error"], json!("ROOT_PATH_IN_USE"));
        assert_eq!(
            body["details"],
            json!("\"Alpha\" already uses that folder.")
        );

        // A different root is accepted.
        let (status, _) = server
            .with(
                "POST",
                "/api/projects",
                json!({"title": "Gamma", "rootPath": "/tmp/jait-other-root"}),
            )
            .await;
        assert_eq!(status, 201);
        server.stop().await;
    }

    #[tokio::test]
    async fn missing_ids_are_404_and_unsupported_methods_are_405() {
        let server = api().await;
        let (status, body) = server
            .with("PATCH", "/api/projects/nope", json!({"title": "x"}))
            .await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("NOT_FOUND"));
        let (status, body) = server.with("DELETE", "/api/projects/nope", json!({})).await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("NOT_FOUND"));
        let (status, body) = server
            .with("POST", "/api/projects/nope/restore", json!({}))
            .await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("NOT_FOUND"));

        let (status, body) = server.ok("PUT", "/api/projects").await;
        assert_eq!(status, 405);
        assert_eq!(body["error"], json!("METHOD_NOT_ALLOWED"));
        let (status, body) = server.ok("DELETE", "/api/projects").await;
        assert_eq!(status, 405);
        assert_eq!(body["error"], json!("METHOD_NOT_ALLOWED"));
        server.stop().await;
    }

    #[tokio::test]
    async fn archived_surface_and_single_project_reads_report_their_shapes() {
        let server = api().await;
        let (status, body) = server.ok("GET", "/api/projects/archived").await;
        assert_eq!(status, 200);
        assert_eq!(body["projects"], json!([]));
        let (status, body) = server.ok("DELETE", "/api/projects/archived").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"ok": true, "removed": 0}));

        let (status, body) = server
            .with("POST", "/api/projects", json!({"title": "Delta"}))
            .await;
        assert_eq!(status, 201);
        let id = body["id"].as_str().expect("id").to_string();

        let (status, body) = server.ok("GET", &format!("/api/projects/{id}")).await;
        assert_eq!(status, 200);
        assert_eq!(body["id"], json!(id));

        let (status, body) = server
            .ok("GET", &format!("/api/projects/{id}/subtree"))
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["projectId"], json!(id));
        assert_eq!(body["descendantIds"], json!([]));
        assert_eq!(body["descendantCount"], json!(0));

        let (status, body) = server
            .ok("GET", &format!("/api/projects/{id}/sessions"))
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["sessions"], json!([]));

        // Repository management has no native implementation yet.
        let (status, body) = server
            .with("POST", &format!("/api/projects/{id}/repository"), json!({}))
            .await;
        assert_eq!(status, 503);
        assert_eq!(body["error"], json!("SURFACE_UNAVAILABLE"));
        server.stop().await;
    }
}

// ---------------------------------------------------------------------------
// routes/project.ts -> packages/gateway-rust/src/routes/project.rs
// ---------------------------------------------------------------------------
mod project {
    use super::*;
    use jait_gateway::routes::project::ProjectRoutes;
    use jait_gateway::routes::projects::ProjectCollectionRoutes;

    fn temp_root(tag: &str) -> String {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("jait-project-{tag}-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        path.to_string_lossy().into_owned()
    }

    async fn api() -> Api {
        let auth = auth();
        let router = ProjectRoutes::new(auth.clone())
            .router()
            .merge(ProjectCollectionRoutes::new(auth.clone()).router());
        Api::start(router, auth).await
    }

    async fn api_with_project(root: &str) -> Api {
        let auth = auth();
        let router = ProjectRoutes::new(auth.clone())
            .router()
            .merge(ProjectCollectionRoutes::new(auth.clone()).router());
        let server = Api::start(router, auth).await;
        let (status, body) = server
            .with(
                "POST",
                "/api/projects",
                json!({"title": "Project", "rootPath": root}),
            )
            .await;
        assert_eq!(status, 201, "create project body: {body}");
        server
    }

    #[tokio::test]
    async fn unknown_route_is_404_and_known_route_with_wrong_method_is_405() {
        let server = api().await;
        let (status, body) = server.ok("GET", "/api/project/teleport").await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("NOT_FOUND"));
        let (status, body) = server.ok("PUT", "/api/project/info").await;
        assert_eq!(status, 405);
        assert_eq!(body["error"], json!("METHOD_NOT_ALLOWED"));
        let (status, body) = server.ok("DELETE", "/api/project/list").await;
        assert_eq!(status, 405);
        assert_eq!(body["error"], json!("METHOD_NOT_ALLOWED"));
        server.stop().await;
    }

    #[tokio::test]
    async fn filesystem_operations_require_an_open_project() {
        let server = api().await;
        let (status, body) = server.ok("GET", "/api/project/info").await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("NO_PROJECT"));
        for path in [
            "/api/project/list",
            "/api/project/read?path=a.txt",
            "/api/project/stat?path=a.txt",
        ] {
            let (status, body) = server.ok("GET", path).await;
            assert_eq!(status, 404, "path {path}");
            assert_eq!(body["error"], json!("NO_PROJECT"), "path {path}");
        }
        let (status, body) = server
            .with(
                "POST",
                "/api/project/write",
                json!({"path": "a.txt", "content": "hello"}),
            )
            .await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("NO_PROJECT"));
        server.stop().await;
    }

    #[tokio::test]
    async fn search_options_are_validated_before_the_project_lookup() {
        let server = api().await;
        let (status, body) = server.ok("GET", "/api/project/search").await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("VALIDATION_ERROR"));
        assert_eq!(body["message"], json!("query is required"));

        let (status, body) = server
            .ok("GET", "/api/project/search?query=x&mode=bogus")
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("VALIDATION_ERROR"));
        assert_eq!(body["message"], json!("mode must be files or content"));

        // A non-local surface is refused even without an open project.
        let (status, body) = server
            .ok("GET", "/api/project/search?query=x&surfaceId=abc")
            .await;
        assert_eq!(status, 501);
        assert_eq!(body["error"], json!("NOT_SUPPORTED"));

        // With valid options but no project, the project guard wins.
        let (status, body) = server.ok("GET", "/api/project/search?query=x").await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("NO_PROJECT"));
        server.stop().await;
    }

    #[tokio::test]
    async fn origin_header_is_checked_before_the_route_handles_the_request() {
        let server = api().await;
        let (status, body) = server
            .with_headers(
                "GET",
                "/api/project/info",
                None,
                None,
                &[("origin", "https://evil.example")],
            )
            .await;
        assert_eq!(status, 403);
        assert_eq!(body["error"], json!("ORIGIN_FORBIDDEN"));

        // A bearer token bypasses the origin gate.
        let (status, body) = server
            .with_headers(
                "GET",
                "/api/project/info",
                Some(&token()),
                None,
                &[("origin", "https://evil.example")],
            )
            .await;
        assert_ne!(status, 403);
        assert_eq!(body["error"], json!("NO_PROJECT"));

        // Localhost origins are always allowed.
        let (status, _) = server
            .with_headers(
                "GET",
                "/api/project/info",
                None,
                None,
                &[("origin", server.base.as_str())],
            )
            .await;
        assert_eq!(status, 401);
        server.stop().await;
    }

    #[tokio::test]
    async fn write_read_stat_list_round_trip_and_path_confinement() {
        let root = temp_root("fs");
        let server = api_with_project(&root).await;

        let (status, body) = server.ok("GET", "/api/project/info").await;
        assert_eq!(status, 200);
        assert_eq!(body["open"], json!(true));
        assert_eq!(body["root"], json!(root));

        let (status, body) = server
            .with(
                "POST",
                "/api/project/write",
                json!({"path": "a.txt", "content": "hello"}),
            )
            .await;
        assert_eq!(status, 200, "write body: {body}");
        assert_eq!(body["ok"], json!(true));
        assert_eq!(body["path"], json!("a.txt"));
        assert_eq!(body["bytes"], json!(5));
        assert_eq!(
            std::fs::read_to_string(std::path::Path::new(&root).join("a.txt")).unwrap(),
            "hello"
        );

        let (status, body) = server.ok("GET", "/api/project/read?path=a.txt").await;
        assert_eq!(status, 200);
        assert_eq!(body["content"], json!("hello"));

        let (status, body) = server.ok("GET", "/api/project/stat?path=a.txt").await;
        assert_eq!(status, 200);
        assert_eq!(body["exists"], json!(true));
        assert_eq!(body["isFile"], json!(true));
        assert_eq!(body["isDirectory"], json!(false));
        assert_eq!(body["size"], json!(5));

        let (status, body) = server.ok("GET", "/api/project/list?path=.").await;
        assert_eq!(status, 200);
        let names: Vec<String> = body["entries"]
            .as_array()
            .expect("entries")
            .iter()
            .map(|e| e["name"].as_str().unwrap_or_default().to_string())
            .collect();
        assert_eq!(names, vec!["a.txt".to_string()]);

        // Missing files map to per-operation errors.
        let (status, body) = server.ok("GET", "/api/project/stat?path=missing.txt").await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("STAT_FAILED"));
        let (status, body) = server.ok("GET", "/api/project/read?path=missing.txt").await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("NOT_FOUND"));

        // Escaping the root is refused.
        let (status, body) = server
            .ok("GET", "/api/project/read?path=../../etc/passwd")
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("INVALID_PATH"));
        server.stop().await;
    }

    #[tokio::test]
    async fn filesystem_surface_operations_are_not_wired_yet() {
        let root = temp_root("surface");
        let server = api_with_project(&root).await;
        for op in ["backup", "undo", "undo-all", "apply-diff"] {
            let (status, body) = server
                .with("POST", &format!("/api/project/{op}"), json!({}))
                .await;
            assert_eq!(status, 501, "op {op}");
            assert_eq!(body["error"], json!("SURFACE_UNAVAILABLE"), "op {op}");
        }
        // `reveal` is answered natively without a desktop shell.
        let (status, body) = server.with("POST", "/api/project/reveal", json!({})).await;
        assert_eq!(status, 200);
        assert_eq!(body["ok"], json!(true));
        server.stop().await;
    }

    #[tokio::test]
    async fn local_file_search_runs_against_the_open_project() {
        let root = temp_root("search");
        std::fs::write(std::path::Path::new(&root).join("a.txt"), "hello needle").unwrap();
        std::fs::create_dir_all(std::path::Path::new(&root).join("nested")).unwrap();
        std::fs::write(std::path::Path::new(&root).join("nested/b.txt"), "nothing").unwrap();
        let server = api_with_project(&root).await;

        let (status, body) = server
            .ok("GET", "/api/project/search?query=needle&mode=content")
            .await;
        assert_eq!(status, 200, "content search body: {body}");
        assert_eq!(body["mode"], json!("content"));
        let matches = body["matches"].as_array().expect("matches");
        assert_eq!(matches.len(), 1, "matches: {matches:?}");
        assert_eq!(matches[0]["file"], json!("a.txt"));
        assert_eq!(matches[0]["line"], json!(1));
        assert_eq!(matches[0]["content"], json!("hello needle"));

        // Case-insensitive filename search finds the nested file, not a.txt.
        let (status, body) = server
            .ok("GET", "/api/project/search?query=B.TXT&mode=files")
            .await;
        assert_eq!(status, 200, "file search body: {body}");
        assert_eq!(body["mode"], json!("files"));
        let files = body["files"].as_array().expect("files");
        assert_eq!(files.len(), 1, "files: {files:?}");
        assert_eq!(files[0]["name"], json!("b.txt"));
        assert_eq!(files[0]["path"], json!("nested/b.txt"));
        assert_eq!(body["limited"], json!(false));
        server.stop().await;
    }
}

// ---------------------------------------------------------------------------
// routes/repositories.ts — /api/repos
// ---------------------------------------------------------------------------
mod repositories {
    use super::*;
    use jait_gateway::routes::repositories::RepositoryRoutes;

    async fn server() -> Api {
        let state = auth();
        Api::start(RepositoryRoutes::new(state.clone()).router(), state).await
    }

    #[tokio::test]
    async fn collection_and_create_require_authentication() {
        let server = server().await;
        let (status, body) = server.send("GET", "/api/repos", None, None).await;
        assert_eq!(status, 401);
        assert_eq!(body, json!({"detail": "login_required"}));

        let (status, body) = server
            .send(
                "POST",
                "/api/repos",
                None,
                Some(json!({"name": "x", "localPath": "/tmp/x"})),
            )
            .await;
        assert_eq!(status, 401);
        assert_eq!(body, json!({"detail": "login_required"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn create_requires_name_and_local_path() {
        let server = server().await;
        let (status, body) = server.with("POST", "/api/repos", json!({})).await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("name and localPath are required"));

        let (status, body) = server
            .with("POST", "/api/repos", json!({"name": "Alpha"}))
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("name and localPath are required"));

        let (status, body) = server
            .with("POST", "/api/repos", json!({"localPath": "/tmp/alpha"}))
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("name and localPath are required"));
        server.stop().await;
    }

    #[tokio::test]
    async fn created_repository_is_listed_once_after_reposting_same_local_path() {
        let server = server().await;
        let (status, body) = server
            .with(
                "POST",
                "/api/repos",
                json!({"name": "Alpha", "localPath": "/tmp/alpha"}),
            )
            .await;
        assert_eq!(status, 200, "create body: {body}");
        let repo = body["repo"].clone();
        assert_eq!(repo["name"], json!("Alpha"));
        assert_eq!(repo["localPath"], json!("/tmp/alpha"));
        assert_eq!(repo["userId"], json!(OWNER));
        let id = repo["id"].as_str().expect("repo id").to_string();

        // Re-posting the same local path reuses the existing row (same id, original name)
        // instead of duplicating it.
        let (status, body) = server
            .with(
                "POST",
                "/api/repos",
                json!({"name": "Alpha Renamed", "localPath": "/tmp/alpha"}),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["repo"]["id"], json!(id));
        assert_eq!(body["repo"]["name"], json!("Alpha"));

        let (status, body) = server.ok("GET", "/api/repos").await;
        assert_eq!(status, 200);
        let repos = body["repos"].as_array().expect("repos array");
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0]["id"], json!(id));
        assert_eq!(repos[0]["name"], json!("Alpha"));
        server.stop().await;
    }

    #[tokio::test]
    async fn collection_has_no_get_for_a_single_repository_and_unknown_ids_are_404_on_write() {
        let server = server().await;
        // Only PATCH/DELETE are registered on the item route, so GET is a 405.
        let (status, body) = server.ok("GET", "/api/repos/missing").await;
        assert_eq!(status, 405, "body: {body}");

        let (status, body) = server
            .with("PATCH", "/api/repos/missing", json!({"name": "Beta"}))
            .await;
        assert_eq!(status, 404);
        assert_eq!(
            body["error"],
            json!({"error": "Repository not found"})["error"]
        );

        let (status, body) = server.ok("DELETE", "/api/repos/missing").await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("Repository not found"));
        server.stop().await;
    }
}

// ---------------------------------------------------------------------------
// routes/repo-proposals.ts — /api/repos/{id}/proposals
// ---------------------------------------------------------------------------
mod repo_proposals {
    use super::*;
    use jait_gateway::routes::repo_proposals::RepoProposalRoutes;
    use jait_gateway::routes::repositories::RepositoryRoutes;

    async fn server() -> (Api, String) {
        let state = auth();
        let router = RepositoryRoutes::new(state.clone())
            .router()
            .merge(RepoProposalRoutes::new(state.clone()).router());
        let server = Api::start(router, state).await;
        let (status, body) = server
            .with(
                "POST",
                "/api/repos",
                json!({"name": "Alpha", "localPath": "/tmp/alpha"}),
            )
            .await;
        assert_eq!(status, 200, "repo create: {body}");
        let id = body["repo"]["id"].as_str().unwrap().to_string();
        (server, id)
    }

    #[tokio::test]
    async fn empty_collection_and_required_message() {
        let (server, id) = server().await;
        let (status, body) = server
            .ok("GET", &format!("/api/repos/{id}/proposals"))
            .await;
        assert_eq!(status, 200, "list body: {body}");
        assert_eq!(body["proposals"], json!([]));

        let (status, body) = server
            .with("POST", &format!("/api/repos/{id}/proposals"), json!({}))
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("message is required"));

        let (status, body) = server
            .with(
                "POST",
                &format!("/api/repos/{id}/proposals"),
                json!({"message": "   "}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("message is required"));
        server.stop().await;
    }

    #[tokio::test]
    async fn create_trims_message_and_accepts_known_priority() {
        let (server, id) = server().await;
        let (status, body) = server
            .with(
                "POST",
                &format!("/api/repos/{id}/proposals"),
                json!({"message": "  add logout  ", "priority": "high"}),
            )
            .await;
        assert_eq!(status, 201, "create body: {body}");
        let proposal = body["proposal"].clone();
        assert_eq!(proposal["message"], json!("add logout"));
        assert_eq!(proposal["priority"], json!("high"));
        assert_eq!(proposal["repoId"], json!(id));

        let (status, body) = server
            .ok("GET", &format!("/api/repos/{id}/proposals"))
            .await;
        assert_eq!(status, 200);
        let list = body["proposals"].as_array().expect("proposals");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["message"], json!("add logout"));
        server.stop().await;
    }

    #[tokio::test]
    async fn patch_validates_priority_and_status_then_deletes() {
        let (server, id) = server().await;
        let (_, created) = server
            .with(
                "POST",
                &format!("/api/repos/{id}/proposals"),
                json!({"message": "keep"}),
            )
            .await;
        let pid = created["proposal"]["id"].as_str().unwrap().to_string();

        let (status, body) = server
            .with(
                "PATCH",
                &format!("/api/repo-proposals/{pid}"),
                json!({"priority": "urgent"}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("invalid priority"));

        let (status, body) = server
            .with(
                "PATCH",
                &format!("/api/repo-proposals/{pid}"),
                json!({"status": "bogus"}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("invalid status"));

        let (status, body) = server
            .with(
                "PATCH",
                &format!("/api/repo-proposals/{pid}"),
                json!({"message": "   "}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("message must not be empty"));

        let (status, body) = server
            .with(
                "PATCH",
                &format!("/api/repo-proposals/{pid}"),
                json!({"status": "done"}),
            )
            .await;
        assert_eq!(status, 200, "patch body: {body}");
        assert_eq!(body["proposal"]["status"], json!("done"));

        let (status, body) = server
            .ok("DELETE", &format!("/api/repo-proposals/{pid}"))
            .await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"ok": true}));

        let (status, body) = server
            .with(
                "PATCH",
                &format!("/api/repo-proposals/{pid}"),
                json!({"status": "open"}),
            )
            .await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("Todo not found"));
        server.stop().await;
    }
}

// ---------------------------------------------------------------------------
// routes/threads.ts — /api/threads
// ---------------------------------------------------------------------------
mod threads {
    use super::*;
    use jait_gateway::routes::threads::ThreadRoutes;

    fn seed(db: &rusqlite::Connection) {
        for (id, user, title, updated) in [
            ("t-old", OWNER, "Older", "2024-01-01T00:00:00.000Z"),
            ("t-new", OWNER, "Newer", "2024-01-03T00:00:00.000Z"),
            ("t-other", "u-other", "Foreign", "2024-01-04T00:00:00.000Z"),
        ] {
            db.execute(
                "INSERT INTO agent_threads(id,user_id,title,provider_id,status,created_at,updated_at) \
                 VALUES(?1,?2,?3,'codex','running','2024-01-01T00:00:00.000Z',?4)",
                rusqlite::params![id, user, title, updated],
            )
            .unwrap();
        }
    }

    async fn server() -> Api {
        let state = auth_seeded(seed);
        Api::start(ThreadRoutes::new(state.clone()).router(), state).await
    }

    #[tokio::test]
    async fn listing_is_scoped_to_the_user_newest_first_and_honours_limit() {
        let server = server().await;
        let (status, body) = server.send("GET", "/api/threads", None, None).await;
        assert_eq!(status, 401);
        assert_eq!(body, json!({"detail": "login_required"}));

        let (status, body) = server.ok("GET", "/api/threads").await;
        assert_eq!(status, 200, "list body: {body}");
        let list = body["threads"].as_array().expect("threads");
        assert_eq!(list.len(), 2, "foreign thread leaked: {list:?}");
        assert_eq!(list[0]["id"], json!("t-new"));
        assert_eq!(list[1]["id"], json!("t-old"));
        assert_eq!(list[0]["title"], json!("Newer"));
        assert_eq!(list[0]["runtimeMode"], json!("full-access"));

        let (status, body) = server.ok("GET", "/api/threads?limit=1").await;
        assert_eq!(status, 200);
        let list = body["threads"].as_array().expect("threads");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["id"], json!("t-new"));

        // sessionId filter narrows to that session only (none seeded here).
        let (status, body) = server.ok("GET", "/api/threads?sessionId=s-1").await;
        assert_eq!(status, 200);
        assert_eq!(body["threads"], json!([]));
        server.stop().await;
    }

    #[tokio::test]
    async fn foreign_and_unknown_threads_are_404() {
        let server = server().await;
        let (status, body) = server.ok("GET", "/api/threads/t-other").await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("Thread not found"));

        let (status, body) = server.ok("GET", "/api/threads/nope").await;
        assert_eq!(status, 404);
        assert_eq!(body["error"], json!("Thread not found"));

        let (status, body) = server.ok("GET", "/api/threads/t-new").await;
        assert_eq!(status, 200);
        assert_eq!(body["id"], json!("t-new"));
        assert_eq!(body["status"], json!("running"));
        server.stop().await;
    }

    #[tokio::test]
    async fn patch_validates_enums_then_updates_and_delete_removes() {
        let server = server().await;
        let (status, body) = server
            .with(
                "PATCH",
                "/api/threads/t-new",
                json!({"runtimeMode": "root"}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("Invalid runtime mode"));

        let (status, body) = server
            .with(
                "PATCH",
                "/api/threads/t-new",
                json!({"personaAgentId": "missing"}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("Agent profile not found"));

        let (status, body) = server
            .with("PATCH", "/api/threads/t-new", json!({"providerId": null}))
            .await;
        assert_eq!(status, 400);
        assert_eq!(body["error"], json!("No provider available"));

        let (status, body) = server
            .with(
                "PATCH",
                "/api/threads/t-new",
                json!({"title": "Renamed", "runtimeMode": "supervised"}),
            )
            .await;
        assert_eq!(status, 200, "patch body: {body}");
        assert_eq!(body["title"], json!("Renamed"));
        assert_eq!(body["runtimeMode"], json!("supervised"));

        // A successful delete answers 204 No Content with an empty body.
        let (status, body) = server.ok("DELETE", "/api/threads/t-new").await;
        assert_eq!(status, 204, "delete body: {body}");
        assert_eq!(body, json!(""));

        let (status, _) = server.ok("GET", "/api/threads/t-new").await;
        assert_eq!(status, 404);
        server.stop().await;
    }
}

// ---------------------------------------------------------------------------
// routes/mcp_server.ts -> packages/gateway-rust/src/routes/mcp_server.rs
// ---------------------------------------------------------------------------
mod mcp_server {
    use super::*;
    use jait_gateway::routes::mcp_server::{McpToolContext, handle_request, parse_tool_set};
    use std::collections::HashMap;

    fn tool_set() -> jait_gateway::routes::mcp_server::ToolSet {
        parse_tool_set(&HashMap::new())
    }

    #[tokio::test]
    async fn initialize_reports_protocol_version_and_server_info() {
        let ctx = McpToolContext::default();
        let result = handle_request(
            &json!({"jsonrpc": "2.0", "id": 7, "method": "initialize", "params": {}}),
            None,
            "2025-06-18",
            &ctx,
            tool_set(),
        )
        .await;
        assert_eq!(result["jsonrpc"], json!("2.0"));
        assert_eq!(result["id"], json!(7));
        assert_eq!(result["result"]["protocolVersion"], json!("2025-06-18"));
        assert_eq!(
            result["result"]["serverInfo"]["name"],
            json!("jait-gateway")
        );
        assert_eq!(
            result["result"]["capabilities"]["tools"],
            json!({"listChanged": false})
        );
        assert_eq!(
            result["result"]["capabilities"]["resources"],
            json!({"subscribe": false, "listChanged": false})
        );
        assert_eq!(
            result["result"]["capabilities"]["prompts"],
            json!({"listChanged": false})
        );
    }

    #[tokio::test]
    async fn empty_listings_are_returned_without_tool_source() {
        let ctx = McpToolContext::default();
        for (method, key) in [
            ("tools/list", "tools"),
            ("resources/list", "resources"),
            ("prompts/list", "prompts"),
        ] {
            let result = handle_request(
                &json!({"jsonrpc": "2.0", "id": 1, "method": method}),
                None,
                "2025-06-18",
                &ctx,
                tool_set(),
            )
            .await;
            assert_eq!(result["result"][key], json!([]), "method {method}");
        }
        let templates = handle_request(
            &json!({"jsonrpc": "2.0", "id": 2, "method": "resources/templates/list"}),
            None,
            "2025-06-18",
            &ctx,
            tool_set(),
        )
        .await;
        assert_eq!(templates["result"]["resourceTemplates"], json!([]));
    }

    #[tokio::test]
    async fn unknown_method_is_jsonrpc_method_not_found() {
        let ctx = McpToolContext::default();
        let result = handle_request(
            &json!({"jsonrpc": "2.0", "id": "a1", "method": "does/not/exist"}),
            None,
            "2025-06-18",
            &ctx,
            tool_set(),
        )
        .await;
        assert_eq!(result["id"], json!("a1"));
        assert_eq!(result["error"]["code"], json!(-32601));
        assert_eq!(
            result["error"]["message"],
            json!("Method not found: does/not/exist")
        );
    }

    #[tokio::test]
    async fn ping_and_initialized_notifications_are_acknowledged() {
        let ctx = McpToolContext::default();
        let ping = handle_request(
            &json!({"jsonrpc": "2.0", "id": 3, "method": "ping"}),
            None,
            "2025-06-18",
            &ctx,
            tool_set(),
        )
        .await;
        assert_eq!(ping, json!({"jsonrpc": "2.0", "id": 3, "result": {}}));
        let initialized = handle_request(
            &json!({"jsonrpc": "2.0", "id": 4, "method": "notifications/initialized"}),
            None,
            "2025-06-18",
            &ctx,
            tool_set(),
        )
        .await;
        assert_eq!(
            initialized,
            json!({"jsonrpc": "2.0", "id": 4, "result": {}})
        );
    }

    #[tokio::test]
    async fn cancelled_notification_produces_no_reply() {
        let ctx = McpToolContext::default();
        let result = handle_request(
            &json!({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {}}),
            None,
            "2025-06-18",
            &ctx,
            tool_set(),
        )
        .await;
        assert_eq!(result, Value::Null);
    }
}

// ---------------------------------------------------------------------------
// routes/pull_requests.ts -> packages/gateway-rust/src/routes/pull_requests.rs
// ---------------------------------------------------------------------------
mod pull_requests {
    use super::*;
    use jait_gateway::routes::pull_requests::PullRequestRoutes;

    async fn api(auth: jait_gateway::routes::auth::AuthState) -> Api {
        Api::start(PullRequestRoutes::new(auth.clone()).router(), auth).await
    }

    fn seeded() -> jait_gateway::routes::auth::AuthState {
        auth_seeded(|db| {
            db.execute(
                "INSERT INTO automation_repositories(id,user_id,name,default_branch,local_path,created_at,updated_at) \
                 VALUES('repo-1',?1,'Alpha','main','/tmp/repo','2024-01-01T00:00:00.000Z','2024-01-01T00:00:00.000Z')",
                rusqlite::params![OWNER],
            )
            .unwrap();
        })
    }

    #[tokio::test]
    async fn list_requires_login() {
        let server = api(seeded()).await;
        let (status, body) = server
            .send("GET", "/api/repos/repo-1/pull-requests", None, None)
            .await;
        assert_eq!(status, 401, "body={body}");
        assert_eq!(body, json!({"detail": "login_required"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn unknown_repository_is_not_found() {
        let server = api(seeded()).await;
        let (status, body) = server.ok("GET", "/api/repos/unknown/pull-requests").await;
        assert_eq!(status, 404, "body={body}");
        server.stop().await;
    }

    #[tokio::test]
    async fn github_backed_routes_fail_503_without_operations() {
        let server = api(seeded()).await;
        let (status, body) = server.ok("GET", "/api/repos/repo-1/pull-requests").await;
        assert_eq!(status, 503, "body={body}");
        assert_eq!(
            body,
            json!({"error": "GitHub pull request service is unavailable"})
        );
        let (patch_status, patch_body) = server
            .with(
                "PATCH",
                "/api/repos/repo-1/pull-requests/7",
                json!({"title": "x"}),
            )
            .await;
        assert_eq!(patch_status, 503, "body={patch_body}");
        assert_eq!(
            patch_body,
            json!({"error": "GitHub pull request service is unavailable"})
        );
        server.stop().await;
    }
}

// ---------------------------------------------------------------------------
// routes/voice.ts -> packages/gateway-rust/src/routes/voice.rs
// ---------------------------------------------------------------------------
mod voice {
    use super::*;
    use axum::body::Body;
    use axum::http::HeaderMap;
    use jait_gateway::routes::voice::{VoiceRouteConfig, VoiceRoutes};

    fn json_headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::CONTENT_TYPE,
            "application/json".parse().unwrap(),
        );
        headers
    }

    fn routes() -> VoiceRoutes {
        VoiceRoutes::new(auth(), VoiceRouteConfig::default())
    }

    async fn read(response: axum::response::Response) -> (u16, Value) {
        let status = response.status().as_u16();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        if bytes.is_empty() {
            return (status, Value::Null);
        }
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }

    #[tokio::test]
    async fn transcribe_without_input_is_a_validation_error() {
        let (status, body) = read(
            routes()
                .post_transcribe(json_headers(), Body::from("{}"))
                .await,
        )
        .await;
        assert_eq!(status, 400, "body={body}");
        assert_eq!(
            body,
            json!({"error": "VALIDATION_ERROR", "details": "No transcript or audio provided"})
        );
    }

    #[tokio::test]
    async fn speak_requires_non_blank_text() {
        let (status, body) =
            read(routes().post_speak(json_headers(), Body::from("{}")).await).await;
        assert_eq!(status, 400, "body={body}");
        assert_eq!(
            body,
            json!({"error": "VALIDATION_ERROR", "details": "text is required"})
        );
        let (blank_status, blank_body) = read(
            routes()
                .post_speak(
                    json_headers(),
                    Body::from(json!({"text": "   "}).to_string()),
                )
                .await,
        )
        .await;
        assert_eq!(blank_status, 400, "body={blank_body}");
        assert_eq!(
            blank_body,
            json!({"error": "VALIDATION_ERROR", "details": "text is required"})
        );
    }

    #[tokio::test]
    async fn missing_json_content_type_is_rejected_as_415() {
        let (status, body) = read(
            routes()
                .post_speak(HeaderMap::new(), Body::from("{}"))
                .await,
        )
        .await;
        assert_eq!(status, 415, "body={body}");
        assert_eq!(
            body,
            json!({
                "statusCode": 415,
                "code": "FST_ERR_CTP_INVALID_MEDIA_TYPE",
                "error": "Unsupported Media Type",
                "message": "Unsupported Media Type"
            })
        );
    }

    #[tokio::test]
    async fn audio_transcription_without_providers_is_501() {
        let (status, body) = read(
            routes()
                .post_transcribe_audio(json_headers(), Body::from("{}"))
                .await,
        )
        .await;
        assert_eq!(status, 501, "body={body}");
        assert_eq!(
            body,
            json!({"error": "NOT_CONFIGURED", "details": "Voice audio transcription not available"})
        );
    }
}

// ---------------------------------------------------------------------------
// routes/browser_devtools.ts -> packages/gateway-rust/src/routes/browser_devtools.rs
// ---------------------------------------------------------------------------
mod browser_devtools {
    use super::*;
    use axum::body::Body;
    use axum::extract::State;
    use axum::http::HeaderMap;
    use jait_gateway::routes::browser_devtools::{
        BrowserDevToolsState, valid_endpoint, valid_target_id, validate_asset,
    };
    use jait_gateway::security::http_auth::AuthUser;

    async fn read(response: axum::response::Response) -> (u16, Value) {
        let status = response.status().as_u16();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        if bytes.is_empty() {
            return (status, Value::Null);
        }
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }

    #[tokio::test]
    async fn create_requires_login() {
        let state = BrowserDevToolsState::new(auth(), SECRET);
        let (status, body) = read(
            BrowserDevToolsState::create(State(state), HeaderMap::new(), Body::from("{}")).await,
        )
        .await;
        assert_eq!(status, 401, "body={body}");
        assert_eq!(body, json!({"detail": "login_required"}));
    }

    #[tokio::test]
    async fn revoking_unknown_grant_is_not_found() {
        let state = BrowserDevToolsState::new(auth(), SECRET);
        let user = AuthUser {
            id: OWNER.to_string(),
            username: "owner".to_string(),
        };
        let (status, body) = read(state.revoke_for(&user, "grant-missing")).await;
        assert_eq!(status, 404, "body={body}");
        assert_eq!(body, json!({"error": "DevTools panel not found"}));
    }

    #[tokio::test]
    async fn target_endpoint_and_asset_validators_enforce_the_contract() {
        assert!(valid_target_id("target-1"));
        assert!(!valid_target_id(""));
        assert!(!valid_target_id("target_1"));
        assert!(valid_endpoint("http://127.0.0.1:9222"));
        assert!(!valid_endpoint("ws://127.0.0.1:9222"));
        assert!(!valid_endpoint("http://user:pw@127.0.0.1:9222"));
        assert!(!valid_endpoint("http://127.0.0.1:9222?x=1"));
        assert_eq!(validate_asset("assets/app.js"), Some("assets/app.js"));
        assert_eq!(validate_asset("../app.js"), None);
        assert_eq!(validate_asset("/app.js"), None);
        assert_eq!(validate_asset("app.exe"), None);
    }
}

// ---------------------------------------------------------------------------
// routes/providers.ts -> packages/gateway-rust/src/routes/providers.rs
// ---------------------------------------------------------------------------
mod providers {
    use super::*;
    use axum::response::Response;
    use jait_gateway::routes::providers::{
        GATEWAY_NODE_NAME, MAX_CREDENTIAL_INPUT, ROUTE_TABLE, RefreshMode, account_node,
        is_secret_key, parse_fresh, parse_refresh_mode, provider_entry, redact_text, redact_value,
        valid_account_create, valid_account_label, valid_code_input, valid_ollama_api_key,
        valid_ollama_session, validate_base_url,
    };

    async fn error_of(result: Result<impl std::fmt::Debug, Response>) -> (u16, Value) {
        let response = result.expect_err("expected a refusal");
        let status = response.status().as_u16();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }

    #[tokio::test]
    async fn secret_keys_and_redaction_cover_the_credential_surface() {
        assert!(is_secret_key("apiKey"));
        assert!(is_secret_key("OPENAI_API_KEY"));
        assert!(is_secret_key("sessionCookie"));
        assert!(is_secret_key("authorization"));
        assert!(!is_secret_key("deviceCode"));
        assert!(!is_secret_key("userCode"));
        assert!(!is_secret_key("displayName"));

        assert_eq!(redact_text("plain text"), "plain text");
        assert_eq!(redact_text("sk-abcdef123456"), "sk-[redacted]");
        assert_eq!(redact_text("ghp_deadbeef"), "ghp_[redacted]");
        assert_eq!(redact_text("Bearer abcdef"), "Bearer [redacted]");

        assert_eq!(
            redact_value(&json!({
                "id": "openai",
                "apiKey": "sk-abc",
                "deviceCode": "dev-code",
                "nested": {"token": "x"},
                "items": ["ghp_dead"]
            })),
            json!({
                "id": "openai",
                "apiKey": "[redacted]",
                "deviceCode": "dev-code",
                "nested": {"token": "[redacted]"},
                "items": ["ghp_[redacted]"]
            })
        );
    }

    #[tokio::test]
    async fn code_and_label_validators_trim_and_reject() {
        assert_eq!(
            valid_code_input(Some(&json!("  ab-12  "))).unwrap(),
            "ab-12"
        );
        assert_eq!(
            error_of(valid_code_input(Some(&json!("   ")))).await,
            (400, json!({"error": "Missing or empty code"}))
        );
        assert_eq!(
            error_of(valid_code_input(None)).await,
            (400, json!({"error": "Missing or empty code"}))
        );
        let long_code = "a".repeat(MAX_CREDENTIAL_INPUT + 1);
        assert_eq!(
            error_of(valid_code_input(Some(&json!(long_code)))).await,
            (400, json!({"error": "Code is too long"}))
        );

        assert_eq!(
            valid_account_label(Some(&json!(" My work "))).unwrap(),
            "My work"
        );
        assert_eq!(
            error_of(valid_account_label(Some(&json!("")))).await,
            (400, json!({"error": "Missing or empty label"}))
        );
        let long_label = "b".repeat(129);
        assert_eq!(
            error_of(valid_account_label(Some(&json!(long_label)))).await,
            (400, json!({"error": "Label is too long"}))
        );
    }

    #[tokio::test]
    async fn ollama_credential_validators() {
        assert_eq!(
            valid_ollama_api_key(Some(&json!("  key-1 "))).unwrap(),
            "key-1"
        );
        assert_eq!(
            error_of(valid_ollama_api_key(Some(&json!("  ")))).await,
            (400, json!({"error": "Enter an Ollama Cloud API key."}))
        );
        assert_eq!(
            error_of(valid_ollama_api_key(None)).await,
            (400, json!({"error": "Enter an Ollama Cloud API key."}))
        );

        assert_eq!(valid_ollama_session(None).unwrap(), None);
        assert_eq!(valid_ollama_session(Some(&Value::Null)).unwrap(), None);
        assert_eq!(
            valid_ollama_session(Some(&json!(" cookie=1 "))).unwrap(),
            Some("cookie=1".to_string())
        );
        assert_eq!(
            error_of(valid_ollama_session(Some(&json!(7)))).await,
            (400, json!({"error": "Enter an Ollama browser session."}))
        );
    }

    #[tokio::test]
    async fn base_urls_must_be_absolute_and_credential_free() {
        assert_eq!(
            validate_base_url("  https://api.example.com/v1/ ").unwrap(),
            "https://api.example.com/v1"
        );
        assert_eq!(
            error_of(validate_base_url("")).await,
            (400, json!({"error": "Missing base URL"}))
        );
        assert_eq!(
            error_of(validate_base_url("ftp://example.com")).await,
            (400, json!({"error": "Base URL must be an http(s) URL"}))
        );
        assert_eq!(
            error_of(validate_base_url("http://")).await,
            (400, json!({"error": "Base URL must include a host"}))
        );
        assert_eq!(
            error_of(validate_base_url("http://user:pw@example.com")).await,
            (
                400,
                json!({"error": "Base URL must not contain credentials"})
            )
        );
    }

    #[tokio::test]
    async fn account_creation_and_provider_entries_are_shaped_and_redacted() -> Result<(), Response>
    {
        let body = json!({"providerType": " anthropic ", "label": null});
        let (provider_type, label) = valid_account_create(body.as_object().unwrap())?;
        assert_eq!(provider_type, "anthropic");
        assert_eq!(label, "");

        let missing = json!({"label": "x"});
        let (status, payload) = error_of(valid_account_create(missing.as_object().unwrap())).await;
        assert_eq!(status, 400);
        assert_eq!(payload, json!({"error": "Missing provider type"}));

        let bad_label = json!({"providerType": "ollama", "label": 5});
        let (status, payload) =
            error_of(valid_account_create(bad_label.as_object().unwrap())).await;
        assert_eq!(status, 400);
        assert_eq!(payload, json!({"error": "Invalid label"}));

        assert_eq!(account_node(None), GATEWAY_NODE_NAME);
        assert_eq!(account_node(Some(&json!({"nodeId": "node-7"}))), "node-7");
        assert_eq!(account_node(Some(&json!({"nodeId": ""}))), "gateway");

        assert_eq!(
            provider_entry(&json!({"id": "openai", "apiKey": "sk-x"}), Some("icon.svg")),
            json!({
                "id": "openai",
                "apiKey": "[redacted]",
                "icon": "icon.svg",
                "nodeId": "gateway",
                "nodeName": "gateway"
            })
        );
        assert_eq!(
            provider_entry(&json!("ollama"), None),
            json!({"id": "ollama", "nodeId": "gateway", "nodeName": "gateway"})
        );
        Ok(())
    }

    #[tokio::test]
    async fn route_table_and_query_flag_parsing_match_the_registered_surface() {
        assert_eq!(ROUTE_TABLE.len(), 19);
        for expected in [
            ("GET", "/api/providers"),
            ("POST", "/api/providers/{id}/auth/login/input"),
            ("POST", "/api/providers/models/reset"),
            ("GET", "/api/providers/{id}/models"),
            ("POST", "/api/provider-accounts/{id}/opencode-go"),
            ("GET", "/api/provider-usage/summary"),
        ] {
            assert!(ROUTE_TABLE.contains(&expected), "missing {expected:?}");
        }
        assert!(ROUTE_TABLE.contains(&("GET", "/api/provider-accounts")));
        assert!(ROUTE_TABLE.contains(&("POST", "/api/provider-accounts")));

        assert_eq!(parse_refresh_mode(Some("0")), RefreshMode::Cached);
        assert_eq!(parse_refresh_mode(Some("force")), RefreshMode::Force);
        assert_eq!(parse_refresh_mode(None), RefreshMode::Refresh);
        assert_eq!(parse_refresh_mode(Some("1")), RefreshMode::Refresh);
        assert!(parse_fresh(Some("1")));
        assert!(parse_fresh(Some("true")));
        assert!(!parse_fresh(Some("yes")));
        assert!(!parse_fresh(None));
    }
}

// ---------------------------------------------------------------------------
// routes/mobile.ts -> packages/gateway-rust/src/routes/mobile.rs
// ---------------------------------------------------------------------------
mod mobile {
    use super::*;
    use jait_gateway::routes::mobile::{
        ConsentStore, ControlAccessView, DEFAULT_TEST_MESSAGE, DEVICE_NOT_FOUND,
        DeviceRegistration, DeviceStore, INVALID_PAYLOAD, INVALID_ROUTINE_KIND, INVALID_TIME,
        MobileRoutes, PUSH_DEVICE_NOT_FOUND, PUSH_UNAVAILABLE, PushDevices, RoutineStore,
        SCHEDULER_UNAVAILABLE, SessionList,
    };
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct Devices(Mutex<Vec<Value>>);

    impl DeviceStore for Devices {
        fn register(&self, r: DeviceRegistration) -> Value {
            let device = json!({
                "id": r.id,
                "name": r.name,
                "platform": r.platform,
                "capabilities": r.capabilities,
            });
            self.0.lock().unwrap().push(device.clone());
            device
        }
        fn heartbeat(&self, device_id: &str) -> Option<Value> {
            self.0
                .lock()
                .unwrap()
                .iter()
                .find(|device| device["id"] == json!(device_id))
                .cloned()
        }
        fn list(&self) -> Vec<Value> {
            self.0.lock().unwrap().clone()
        }
    }

    #[derive(Default)]
    struct Push {
        token: Mutex<Vec<(String, String)>>,
        sent: Mutex<Vec<Value>>,
    }

    impl PushDevices for Push {
        fn register(&self, device_id: &str, user_id: &str, _token: &str) {
            self.token
                .lock()
                .unwrap()
                .push((device_id.to_string(), user_id.to_string()));
        }
        fn list(&self, user_id: &str) -> Vec<String> {
            self.token
                .lock()
                .unwrap()
                .iter()
                .filter(|(_, owner)| owner == user_id)
                .map(|(device, _)| device.clone())
                .collect()
        }
        fn unregister(&self, device_id: &str, user_id: &str) -> bool {
            let mut tokens = self.token.lock().unwrap();
            let before = tokens.len();
            tokens.retain(|(device, owner)| !(device == device_id && owner == user_id));
            tokens.len() != before
        }
        fn send_attention(&self, payload: Value) {
            self.sent.lock().unwrap().push(payload);
        }
    }

    #[derive(Default)]
    struct Routines(Mutex<Vec<Value>>);

    impl RoutineStore for Routines {
        fn list(&self, user_id: &str) -> Vec<Value> {
            self.0
                .lock()
                .unwrap()
                .iter()
                .filter(|job| job["userId"] == json!(user_id))
                .cloned()
                .collect()
        }
        fn update(&self, id: &str, patch: Value, _user_id: &str) -> Value {
            let mut jobs = self.0.lock().unwrap();
            let job = jobs
                .iter_mut()
                .find(|job| job["id"] == json!(id))
                .expect("update targets an existing routine");
            if let (Some(target), Value::Object(patch)) = (job.as_object_mut(), patch) {
                for (key, value) in patch {
                    target.insert(key, value);
                }
            }
            job.clone()
        }
        fn create(&self, job: Value) -> Value {
            let mut jobs = self.0.lock().unwrap();
            let mut job = job;
            job["id"] = json!(format!("job-{}", jobs.len() + 1));
            jobs.push(job.clone());
            job
        }
    }

    struct NoSessions;
    impl SessionList for NoSessions {
        fn list_active(&self, _user_id: &str) -> Vec<Value> {
            Vec::new()
        }
    }

    #[derive(Default)]
    struct Consents(Mutex<Vec<Value>>);

    impl ConsentStore for Consents {
        fn list_pending(&self) -> Vec<Value> {
            self.0.lock().unwrap().clone()
        }
        fn approve(&self, id: &str, _method: &str, _actor: &str) -> bool {
            let mut pending = self.0.lock().unwrap();
            let before = pending.len();
            pending.retain(|entry| entry["id"] != json!(id));
            pending.len() != before
        }
        fn reject(&self, id: &str, _method: &str, _actor: &str) -> bool {
            self.approve(id, "", "")
        }
    }

    struct Access;
    impl ControlAccessView for Access {
        fn session(&self, _session_id: &str, _user_id: &str) -> bool {
            false
        }
        fn consent_request(&self, _id: &str, _user_id: &str) -> bool {
            false
        }
    }

    async fn serve(routes: MobileRoutes, auth: jait_gateway::routes::auth::AuthState) -> Api {
        Api::start(routes.router(), auth).await
    }

    async fn bare() -> Api {
        let auth = auth();
        let routes = MobileRoutes::new(
            auth.clone(),
            Arc::new(Devices::default()),
            Arc::new(Consents::default()),
            Arc::new(Access),
        );
        serve(routes, auth).await
    }

    #[tokio::test]
    async fn discovery_is_public_and_advertises_the_ws_base() {
        let api = bare().await;
        let (status, body) = api.send("GET", "/api/mobile/discovery", None, None).await;
        assert_eq!(status, 200);
        assert_eq!(body["name"], "jait-gateway");
        // The host header is reduced to its hostname (port and brackets removed),
        // exactly like the TypeScript `host.split(':')[0]` derivation.
        let host = api
            .base
            .trim_start_matches("http://")
            .split(':')
            .next()
            .unwrap();
        assert_eq!(body["baseUrl"], json!(format!("http://{host}")));
        assert_eq!(body["wsUrl"], json!(format!("ws://{host}/ws")));
        assert!(body["discoveredAt"].as_str().unwrap().ends_with('Z'));
        api.stop().await;
    }

    #[tokio::test]
    async fn device_registration_validates_then_serves_heartbeats() {
        let api = bare().await;
        let (status, body) = api
            .send(
                "POST",
                "/api/mobile/devices/register",
                None,
                Some(json!({"name": "Phone"})),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body, json!({"error": INVALID_PAYLOAD}));

        let (status, body) = api
            .send(
                "POST",
                "/api/mobile/devices/register",
                None,
                Some(json!({
                    "id": " d1 ",
                    "name": "Phone",
                    "platform": "mobile",
                    "capabilities": ["notify", 3]
                })),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["ok"], true);
        assert_eq!(
            body["device"],
            json!({"id": "d1", "name": "Phone", "platform": "mobile", "capabilities": ["notify", "3"]})
        );

        let (status, body) = api.send("GET", "/api/mobile/devices", None, None).await;
        assert_eq!(status, 200);
        assert_eq!(body["devices"].as_array().unwrap().len(), 1);

        let (status, body) = api
            .send("POST", "/api/mobile/devices/d1/heartbeat", None, None)
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["ok"], true);
        assert_eq!(body["device"]["id"], "d1");

        let (status, body) = api
            .send("POST", "/api/mobile/devices/nope/heartbeat", None, None)
            .await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": DEVICE_NOT_FOUND}));
        api.stop().await;
    }

    #[tokio::test]
    async fn push_token_registration_is_gated_on_auth() {
        let auth = auth();
        let push = Arc::new(Push::default());
        let routes = MobileRoutes::new(
            auth.clone(),
            Arc::new(Devices::default()),
            Arc::new(Consents::default()),
            Arc::new(Access),
        )
        .with_push(push.clone());
        let api = serve(routes, auth).await;

        let payload = json!({"id": "d2", "name": "P", "platform": "mobile", "pushToken": "tok"});
        let (status, body) = api
            .send(
                "POST",
                "/api/mobile/devices/register",
                None,
                Some(payload.clone()),
            )
            .await;
        assert_eq!(status, 401);
        assert_eq!(body, json!({"detail": "login_required"}));

        let (status, _) = api
            .send(
                "POST",
                "/api/mobile/devices/register",
                Some(&token()),
                Some(payload),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(push.list(OWNER), vec!["d2".to_string()]);

        let (status, body) = api.ok("GET", "/api/mobile/push-devices").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"devices": [{"deviceId": "d2"}]}));
        api.stop().await;
    }

    #[tokio::test]
    async fn push_test_messages_and_unregistration() {
        let auth = auth();
        let push = Arc::new(Push::default());
        let routes = MobileRoutes::new(
            auth.clone(),
            Arc::new(Devices::default()),
            Arc::new(Consents::default()),
            Arc::new(Access),
        )
        .with_push(push.clone());
        let api = serve(routes, auth).await;

        let (status, body) = api
            .with("POST", "/api/mobile/push-devices/test", json!({}))
            .await;
        assert_eq!(status, 404);
        assert_eq!(
            body,
            json!({"error": "No push devices registered for this user"})
        );

        let (status, _) = api
            .send(
                "POST",
                "/api/mobile/devices/register",
                Some(&token()),
                Some(json!({"id": "d3", "name": "P", "platform": "browser", "pushToken": "tok"})),
            )
            .await;
        assert_eq!(status, 200);

        let (status, body) = api
            .with(
                "POST",
                "/api/mobile/push-devices/test",
                json!({"message": "  hi  "}),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"ok": true, "devices": 1}));
        let sent = push.sent.lock().unwrap().clone();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0]["title"], "Jait test notification");
        assert_eq!(sent[0]["body"], "hi");
        assert_eq!(sent[0]["urgent"], true);
        assert_eq!(sent[0]["kind"], "question");
        assert_eq!(sent[0]["userId"], OWNER);

        let (status, body) = api.ok("DELETE", "/api/mobile/push-devices/missing").await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": PUSH_DEVICE_NOT_FOUND}));

        let (status, body) = api.ok("DELETE", "/api/mobile/push-devices/d3").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"ok": true}));
        api.stop().await;
    }

    #[tokio::test]
    async fn push_endpoints_fail_closed_without_a_push_service() {
        let api = bare().await;
        let (status, _body) = api
            .send("POST", "/api/mobile/push-devices/test", None, None)
            .await;
        assert_eq!(status, 401);

        let (status, body) = api.ok("POST", "/api/mobile/push-devices/test").await;
        assert_eq!(status, 503);
        assert_eq!(body, json!({"error": PUSH_UNAVAILABLE}));

        let (status, body) = api.ok("GET", "/api/mobile/push-devices").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"devices": []}));

        let (status, body) = api.ok("DELETE", "/api/mobile/push-devices/d1").await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": PUSH_DEVICE_NOT_FOUND}));
        api.stop().await;
    }

    #[tokio::test]
    async fn routines_are_validated_and_patched_by_kind() {
        let auth = auth();
        let routines = Arc::new(Routines::default());
        let routes = MobileRoutes::new(
            auth.clone(),
            Arc::new(Devices::default()),
            Arc::new(Consents::default()),
            Arc::new(Access),
        )
        .with_routines(routines.clone())
        .with_sessions(Arc::new(NoSessions));
        let api = serve(routes, auth).await;

        let (status, _) = api
            .send("PUT", "/api/mobile/routines/morning", None, Some(json!({})))
            .await;
        assert_eq!(status, 401);

        let (status, body) = api
            .with("PUT", "/api/mobile/routines/noon", json!({}))
            .await;
        assert_eq!(status, 400);
        assert_eq!(body, json!({"error": INVALID_ROUTINE_KIND}));

        let (status, body) = api
            .with(
                "PUT",
                "/api/mobile/routines/morning",
                json!({"time": "7:00"}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body, json!({"error": INVALID_TIME}));

        let (status, body) = api
            .with(
                "PUT",
                "/api/mobile/routines/morning",
                json!({"timeZone": "Mars/Base"}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body, json!({"error": "Invalid timeZone"}));

        let (status, body) = api
            .with("PUT", "/api/mobile/routines/morning", json!({}))
            .await;
        assert_eq!(status, 200);
        let routine = &body["routine"];
        assert_eq!(routine["id"], "job-1");
        assert_eq!(routine["name"], "Daily morning routine");
        assert_eq!(routine["cron"], "00 07 * * *");
        assert_eq!(routine["toolName"], "thread.control");
        assert_eq!(routine["enabled"], true);
        assert_eq!(routine["userId"], OWNER);
        assert_eq!(routine["sessionId"], "default");
        assert_eq!(routine["input"]["action"], "create");
        assert_eq!(routine["input"]["__jaitJobMeta"]["routineKind"], "morning");
        assert!(
            routine["input"]["prompt"]
                .as_str()
                .unwrap()
                .starts_with("Prepare my morning briefing")
        );

        let (status, body) = api
            .with(
                "PUT",
                "/api/mobile/routines/morning",
                json!({"time": "09:30", "enabled": false, "prompt": "Custom briefing"}),
            )
            .await;
        assert_eq!(status, 200);
        let routine = &body["routine"];
        assert_eq!(routine["id"], "job-1");
        assert_eq!(routine["cron"], "30 09 * * *");
        assert_eq!(routine["enabled"], false);
        assert_eq!(routine["input"]["prompt"], "Custom briefing");
        assert_eq!(routines.list(OWNER).len(), 1);

        let (status, body) = api.ok("GET", "/api/mobile/routines").await;
        assert_eq!(status, 200);
        assert_eq!(body["routines"].as_array().unwrap().len(), 1);

        let (status, body) = api.ok("GET", "/api/mobile/os-tool/sessions").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"sessions": []}));

        let (status, body) = api.ok("GET", "/api/mobile/consent/pending").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"requests": []}));

        let (status, body) = api.ok("POST", "/api/mobile/consent/grant-1/approve").await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": "Consent request not found"}));
        api.stop().await;
    }
}

mod network {
    use super::*;
    use futures_util::future::BoxFuture;
    use jait_gateway::assessments::service::{AssessmentOptions, AssessmentRegistry};
    use jait_gateway::routes::network::{
        LocalNetworkSnapshot, LocalNetworkView, NetworkInterface, NetworkInventory, NetworkRoutes,
    };
    use jait_gateway::time::Clock;
    use std::sync::Arc;

    struct Inventory(Value);

    impl NetworkInventory for Inventory {
        fn inventory(&self) -> BoxFuture<'_, Result<Value, String>> {
            let value = self.0.clone();
            Box::pin(async move { Ok(value) })
        }
    }

    struct FailingInventory;

    impl NetworkInventory for FailingInventory {
        fn inventory(&self) -> BoxFuture<'_, Result<Value, String>> {
            Box::pin(async move { Err("docker inventory unavailable".to_string()) })
        }
    }

    fn clock() -> Clock {
        Arc::new(|| 1_767_225_600_000)
    }

    fn registrations() -> AssessmentRegistry {
        AssessmentRegistry::new(AssessmentOptions::new("gateway".to_string()).unwrap())
    }

    fn snapshot() -> LocalNetworkSnapshot {
        LocalNetworkSnapshot {
            interfaces: vec![NetworkInterface {
                name: "eth0".into(),
                ip: "127.0.0.1".into(),
                mac: "00:00:00:00:00:00".into(),
                netmask: "255.0.0.0".into(),
                internal: true,
            }],
            local_addresses: vec!["127.0.0.1".into(), "fe80::1".into()],
            gateway: json!({"id": "gateway", "name": "gateway-host"}),
            filesystem_nodes: vec![
                json!({"id": "gateway", "isGateway": true}),
                json!({"id": "laptop", "name": "Laptop", "platform": "linux", "registeredAt": "t0"}),
            ],
            companion_devices: vec![json!({"id": "phone", "name": "Pixel"})],
        }
    }

    fn local(value: LocalNetworkSnapshot) -> LocalNetworkView {
        Arc::new(move |_owner: String| {
            let value = value.clone();
            Box::pin(async move { Ok(value) })
        })
    }

    async fn api_with(inventory: Arc<dyn NetworkInventory>, view: LocalNetworkView) -> Api {
        let auth = auth();
        let routes = NetworkRoutes::new(auth.clone(), registrations(), view, inventory, clock());
        Api::start(routes.router(), auth).await
    }

    async fn api() -> Api {
        api_with(
            Arc::new(Inventory(json!({"status": "ok"}))),
            local(snapshot()),
        )
        .await
    }

    #[tokio::test]
    async fn unauthenticated_network_routes_answer_login_required() {
        let api = api().await;
        for (method, path) in [
            ("GET", "/api/network/interfaces"),
            ("GET", "/api/network/devices"),
            ("GET", "/api/network/topology"),
            ("GET", "/api/network/scan/latest"),
            ("POST", "/api/network/scan"),
            ("GET", "/api/network/nodes"),
            ("POST", "/api/network/nodes/register"),
            ("POST", "/api/network/ssh/enable"),
        ] {
            let (status, body) = api.send(method, path, None, Some(json!({}))).await;
            assert_eq!(status, 401, "{method} {path}");
            assert_eq!(body, json!({"detail": "login_required"}), "{method} {path}");
        }
        api.stop().await;
    }

    #[tokio::test]
    async fn interfaces_and_devices_are_the_trusted_snapshot() {
        let api = api().await;
        let (status, body) = api.ok("GET", "/api/network/interfaces").await;
        assert_eq!(status, 200);
        assert_eq!(
            body,
            json!({"interfaces": [{
                "name": "eth0", "ip": "127.0.0.1", "mac": "00:00:00:00:00:00",
                "netmask": "255.0.0.0", "internal": true,
            }]})
        );
        let (status, body) = api.ok("GET", "/api/network/devices").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"devices": [{"id": "phone", "name": "Pixel"}]}));
        api.stop().await;
    }

    #[tokio::test]
    async fn scan_admission_requires_a_single_explicit_scope_id() {
        let api = api().await;
        for body in [
            json!({}),
            json!({"subnet": "10.0.0.0/24"}),
            json!({"scopeId": "scope-1", "deep": true}),
        ] {
            let (status, payload) = api.with("POST", "/api/network/scan", body).await;
            assert_eq!(status, 400);
            assert_eq!(
                payload["error"],
                "An existing explicitly authorized scopeId is required; subnet discovery is not authorized by this route"
            );
        }
        for body in [json!({"scopeId": ""}), json!({"scopeId": 7})] {
            let (status, payload) = api.with("POST", "/api/network/scan", body).await;
            assert_eq!(status, 400);
            assert_eq!(payload, json!({"error": "scopeId required"}));
        }
        // Wrong method on a known path is a method mismatch, not a route scan.
        let (status, _) = api
            .send("GET", "/api/network/scan", Some(&token()), None)
            .await;
        assert_eq!(status, 405);
        api.stop().await;
    }

    #[tokio::test]
    async fn scan_latest_reports_the_empty_state_verbatim() {
        let api = api().await;
        let (status, body) = api.ok("GET", "/api/network/scan/latest").await;
        assert_eq!(status, 200);
        assert_eq!(
            body,
            json!({"ok": false, "message": "No scan results yet. Trigger a scan or wait for the scheduled job."})
        );
        api.stop().await;
    }

    #[tokio::test]
    async fn topology_marks_inventory_state_and_excludes_the_gateway_node() {
        let api = api_with(
            Arc::new(Inventory(
                json!({"status": "ok", "truncated": true, "resources": []}),
            )),
            local(snapshot()),
        )
        .await;
        let (status, body) = api.ok("GET", "/api/network/topology").await;
        assert_eq!(status, 200);
        assert_eq!(
            body["gateway"],
            json!({"id": "gateway", "name": "gateway-host"})
        );
        assert_eq!(
            body["devices"],
            json!([{"id": "device-laptop", "type": "device", "online": true, "providers": [],
                    "name": "Laptop", "platform": "linux", "registeredAt": "t0"}])
        );
        assert_eq!(body["hosts"], json!([]));
        assert_eq!(body["meshNodes"], json!([]));
        assert_eq!(
            body["inventory"],
            json!({"status": "ok", "truncated": true})
        );
        assert_eq!(body["routerIp"], Value::Null);
        assert_eq!(body["scannedAt"], Value::Null);
        api.stop().await;
    }

    #[tokio::test]
    async fn inventory_failures_and_oversized_snapshots_fail_closed() {
        let api = api_with(Arc::new(FailingInventory), local(snapshot())).await;
        let (status, body) = api.ok("GET", "/api/network/topology").await;
        assert_eq!(status, 503);
        assert_eq!(body, json!({"error": "docker inventory unavailable"}));
        // /interfaces does not consult the inventory at all.
        let (status, body) = api.ok("GET", "/api/network/interfaces").await;
        assert_eq!(status, 200);
        assert_eq!(body["interfaces"][0]["name"], "eth0");
        api.stop().await;

        let mut oversized = snapshot();
        oversized.companion_devices = (0..4097).map(|i| json!({"id": i})).collect();
        let api = api_with(
            Arc::new(Inventory(json!({"status": "ok"}))),
            local(oversized),
        )
        .await;
        let (status, body) = api.ok("GET", "/api/network/devices").await;
        assert_eq!(status, 503);
        assert_eq!(
            body,
            json!({"error": "Local network snapshot exceeds item limit"})
        );
        api.stop().await;
    }

    #[tokio::test]
    async fn node_registration_validates_then_lists_unverified_announcements() {
        let api = api().await;
        let (status, body) = api
            .with("POST", "/api/network/nodes/register", json!({"id": "n1"}))
            .await;
        assert_eq!(status, 400);
        assert_eq!(body, json!({"error": "id and ip are required"}));
        let (status, body) = api
            .with(
                "POST",
                "/api/network/nodes/register",
                json!({"id": "bad\nid", "ip": "192.0.2.9"}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body, json!({"error": "Invalid node id or address"}));
        let too_many: Vec<Value> = (0..257).map(|i| json!(format!("cap-{i}"))).collect();
        let (status, body) = api
            .with(
                "POST",
                "/api/network/nodes/register",
                json!({"id": "n1", "ip": "192.0.2.9", "capabilities": too_many}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(body, json!({"error": "Too many node capabilities"}));

        let (status, body) = api
            .with(
                "POST",
                "/api/network/nodes/register",
                json!({"id": " n1 ", "ip": "192.0.2.9", "capabilities": ["shell"]}),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["ok"], true);
        // `String(body.id)` is never trimmed in the TypeScript reference.
        assert_eq!(body["node"]["id"], " n1 ");
        assert_eq!(body["node"]["ip"], "192.0.2.9");
        assert_eq!(body["node"]["platform"], "unknown");
        assert_eq!(body["node"]["version"], "unknown");
        assert_eq!(body["node"]["status"], "online");
        assert_eq!(body["node"]["hostname"], Value::Null);
        assert_eq!(body["node"]["capabilities"], json!(["shell"]));
        assert!(
            body["node"]["lastSeen"].as_str().unwrap().ends_with('Z'),
            "lastSeen is an RFC3339 UTC stamp: {}",
            body["node"]["lastSeen"]
        );

        let (status, body) = api.ok("GET", "/api/network/nodes").await;
        assert_eq!(status, 200);
        assert_eq!(body["nodes"].as_array().unwrap().len(), 1);
        assert_eq!(body["nodes"][0]["id"], " n1 ");
        // A whitespace-only id is still a truthy string, so it is accepted too.
        let (status, body) = api
            .with(
                "POST",
                "/api/network/nodes/register",
                json!({"id": "  ", "ip": "192.0.2.10"}),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["node"]["id"], "  ");
        assert_eq!(body["node"]["ip"], "192.0.2.10");
        api.stop().await;
    }

    #[tokio::test]
    async fn ssh_enable_returns_instruction_data_for_each_platform() {
        let api = api().await;
        let (status, body) = api
            .with(
                "POST",
                "/api/network/ssh/enable",
                json!({"platform": " WINDOWS "}),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["platform"], "windows");
        assert!(
            body["command"]
                .as_str()
                .unwrap()
                .contains("Add-WindowsCapability")
        );
        let (status, body) = api.with("POST", "/api/network/ssh/enable", json!({})).await;
        assert_eq!(status, 200);
        assert_eq!(body["platform"], "linux");
        assert_eq!(
            body["command"],
            "sudo apt-get install -y openssh-server && sudo systemctl enable --now sshd"
        );
        let (status, _) = api
            .send("GET", "/api/network/ssh/enable", Some(&token()), None)
            .await;
        assert_eq!(status, 405);
        api.stop().await;
    }
}

mod terminals {
    use super::*;
    use jait_gateway::routes::terminals::TerminalRoutes;

    async fn api() -> Api {
        let auth = auth();
        Api::start(TerminalRoutes::new(auth.clone()).router(), auth).await
    }

    #[tokio::test]
    async fn every_terminal_route_requires_a_user() {
        let api = api().await;
        for (method, path) in [
            ("GET", "/api/terminals"),
            ("POST", "/api/terminals"),
            ("GET", "/api/terminals/shells"),
            ("GET", "/api/terminals/term-1"),
            ("DELETE", "/api/terminals/term-1"),
            ("POST", "/api/terminals/term-1/write"),
            ("POST", "/api/terminals/term-1/resize"),
            ("POST", "/api/terminals/term-1/execute"),
        ] {
            let (status, body) = api.send(method, path, None, Some(json!({}))).await;
            assert_eq!(status, 401, "{method} {path}");
            assert_eq!(body, json!({"detail": "login_required"}), "{method} {path}");
        }
        api.stop().await;
    }

    #[tokio::test]
    async fn an_empty_gateway_lists_no_terminals_and_no_shells() {
        let api = api().await;
        let (status, body) = api.ok("GET", "/api/terminals").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"terminals": []}));
        let (status, body) = api.ok("GET", "/api/terminals/shells").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"shells": []}));
        api.stop().await;
    }

    #[tokio::test]
    async fn create_refuses_foreign_sessions_before_nodes_and_never_fakes_a_pty() {
        let api = api().await;
        // The session ACL runs first: a bad session wins over a bad node.
        let (status, body) = api
            .with(
                "POST",
                "/api/terminals",
                json!({"sessionId": "s-1", "nodeId": "node-9"}),
            )
            .await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": "Session not found"}));

        let (status, body) = api
            .with(
                "POST",
                "/api/terminals",
                json!({"sessionId": "default", "nodeId": "node-9"}),
            )
            .await;
        assert_eq!(status, 404);
        assert_eq!(body, json!({"error": "Node not found"}));

        // The default control plane has no PTY backend: it refuses instead of pretending.
        let (status, body) = api
            .with("POST", "/api/terminals", json!({"sessionId": "default"}))
            .await;
        assert_eq!(status, 500);
        assert_eq!(
            body,
            json!({"error": "TERMINAL_ERROR", "details": "Terminal runtime is not available"})
        );
        api.stop().await;
    }

    #[tokio::test]
    async fn unknown_terminals_answer_the_ts_not_found_envelopes() {
        let api = api().await;
        for (method, path) in [
            ("GET", "/api/terminals/term-missing"),
            ("DELETE", "/api/terminals/term-missing"),
        ] {
            let (status, body) = api.send(method, path, Some(&token()), None).await;
            assert_eq!(status, 404, "{method} {path}");
            assert_eq!(
                body,
                json!({"error": "NOT_FOUND", "details": "Terminal not found"}),
                "{method} {path}"
            );
        }
        for path in [
            "/api/terminals/term-missing/write",
            "/api/terminals/term-missing/resize",
        ] {
            let (status, body) = api.with("POST", path, json!({"data": "ls\r"})).await;
            assert_eq!(status, 404, "{path}");
            assert_eq!(
                body,
                json!({"error": "NOT_FOUND", "details": "Terminal not found"}),
                "{path}"
            );
        }
        // `execute` validates the command before it resolves the terminal.
        let (status, body) = api
            .with(
                "POST",
                "/api/terminals/term-missing/execute",
                json!({"command": "echo hi"}),
            )
            .await;
        assert_eq!(status, 404);
        assert_eq!(
            body,
            json!({"error": "NOT_FOUND", "details": "Terminal not found"})
        );
        let (status, body) = api
            .with(
                "POST",
                "/api/terminals/term-missing/execute",
                json!({"command": "   "}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(
            body,
            json!({"error": "VALIDATION_ERROR", "details": "command is required"})
        );
        // Wrong method on a known path is a method mismatch, not a missing terminal.
        let (status, _) = api
            .send("PUT", "/api/terminals/term-missing", Some(&token()), None)
            .await;
        assert_eq!(status, 405);
        api.stop().await;
    }

    #[tokio::test]
    async fn the_literal_shells_route_wins_over_the_id_route() {
        let api = api().await;
        let (status, body) = api.ok("GET", "/api/terminals/shells").await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"shells": []}));
        api.stop().await;
    }
}

mod git {
    use super::*;
    use jait_gateway::execution::process_runner::{ProcessCancellation, ProcessRequest};
    use jait_gateway::routes::git::execution::{
        GitAuthorizationRequest, GitCommandAuthority, GitCommandRequest, GitGrant,
    };
    use jait_gateway::routes::git::{GitAuthority, GitRoutes};
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::time::Duration;

    /// Authority exactly as the runtime wires it: grant the fixture root and run
    /// the requested command through the native process runner.
    fn authority_for(root: PathBuf, owner: Option<&'static str>) -> GitAuthority {
        let root = Arc::new(root);
        Arc::new(move |request: GitAuthorizationRequest, _cancel| {
            let root = root.clone();
            Box::pin(async move {
                let command_authority: GitCommandAuthority =
                    Arc::new(|request: GitCommandRequest, _cancel: ProcessCancellation| {
                        let mut argv = vec![resolve_program(&request.program)];
                        argv.extend(request.arguments);
                        Box::pin(async move {
                            Ok(ProcessRequest {
                                argv,
                                cwd: request.cwd,
                                environment: request.environment,
                                input: request.input,
                                // Must stay inside the middleware's grant bounds.
                                timeout: Duration::from_secs(5),
                                output_limit: 256 * 1024,
                            })
                        })
                    });
                Ok(GitGrant {
                    owner: owner.map(str::to_string).unwrap_or(request.owner),
                    root: root.as_ref().clone(),
                    command_authority,
                    allow_worktree_reads: true,
                })
            })
        })
    }

    /// The runtime hands absolute executables to the process runner.
    fn resolve_program(program: &str) -> String {
        let direct = std::path::Path::new(program);
        if direct.is_absolute() {
            return program.to_string();
        }
        let path = std::env::var("PATH").unwrap_or_default();
        for dir in path.split(':').filter(|d| !d.is_empty()) {
            let candidate = std::path::Path::new(dir).join(program);
            if candidate.is_file() {
                return candidate.to_string_lossy().into_owned();
            }
        }
        program.to_string()
    }

    async fn api_for(root: &PathBuf) -> Api {
        let auth = auth();
        let routes = GitRoutes::new(auth.clone()).with_authority(authority_for(root.clone(), None));
        Api::start(routes.router(), auth).await
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("jait-git-{}-{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[tokio::test]
    async fn git_without_an_authority_refuses_everything_with_503() {
        let auth = auth();
        let api = Api::start(GitRoutes::new(auth.clone()).router(), auth).await;
        for (method, path) in [
            ("POST", "/api/git/status"),
            ("POST", "/api/git/branches"),
            ("GET", "/api/git/status"),
        ] {
            let (status, body) = api
                .send(method, path, Some(&token()), Some(json!({"cwd": "/tmp"})))
                .await;
            assert_eq!(status, 503, "{method} {path}");
            assert_eq!(
                body,
                json!({"error": "Git execution authority is unavailable"}),
                "{method} {path}"
            );
        }
        // Authorization is resolved before the user check fails closed too.
        let (status, _) = api
            .send("POST", "/api/git/status", None, Some(json!({})))
            .await;
        assert_eq!(status, 401);
        api.stop().await;
    }

    #[tokio::test]
    async fn git_routes_require_a_user_before_touching_the_authority() {
        let root = temp_dir("unauth");
        let api = api_for(&root).await;
        for path in [
            "/api/git/status",
            "/api/git/branches",
            "/api/git/stage",
            "/api/git/init",
        ] {
            let (status, body) = api
                .send(
                    "POST",
                    path,
                    None,
                    Some(json!({"cwd": root.to_str().unwrap()})),
                )
                .await;
            assert_eq!(status, 401, "{path}");
            assert_eq!(body, json!({"detail": "login_required"}), "{path}");
        }
        api.stop().await;
    }

    #[tokio::test]
    async fn authorization_gate_validates_cwd_before_the_handler_runs() {
        let root = temp_dir("gate");
        let api = api_for(&root).await;
        for path in [
            "/api/git/status",
            "/api/git/branches",
            "/api/git/fetch",
            "/api/git/pull",
            "/api/git/diff",
            "/api/git/init",
            "/api/git/stage",
        ] {
            let (status, body) = api.with("POST", path, json!({})).await;
            assert_eq!(status, 400, "{path}");
            assert_eq!(body, json!({"error": "Missing cwd"}), "{path}");
        }
        // Relative cwd is refused by the gate, not by the handler.
        let (status, body) = api
            .with("POST", "/api/git/status", json!({"cwd": "relative/dir"}))
            .await;
        assert_eq!(status, 400);
        assert_eq!(
            body,
            json!({"error": "cwd must be an absolute authorized root"})
        );
        // A selected node cannot silently fall back to a local checkout.
        let (status, body) = api
            .with(
                "POST",
                "/api/git/status",
                json!({"cwd": root.to_str().unwrap(), "nodeId": "node-9"}),
            )
            .await;
        assert_eq!(status, 503);
        assert_eq!(
            body,
            json!({"error": "Remote Git execution is unavailable"})
        );
        // Requesting a root other than the authorized one is a 403.
        let other = temp_dir("gate-other");
        let (status, body) = api
            .with(
                "POST",
                "/api/git/status",
                json!({"cwd": other.to_str().unwrap()}),
            )
            .await;
        assert_eq!(status, 403);
        assert_eq!(
            body,
            json!({"error": "Git root is outside the authorized request"})
        );
        // Missing directories cannot be canonicalized.
        let (status, body) = api
            .with(
                "POST",
                "/api/git/status",
                json!({"cwd": "/tmp/jait-git-does-not-exist-xyz"}),
            )
            .await;
        assert_eq!(status, 403);
        assert_eq!(body, json!({"error": "Git root is unavailable"}));
        // Malformed bodies are refused with the shared envelope.
        let (status, body) = api
            .send("POST", "/api/git/status", Some(&token()), Some(json!([1])))
            .await;
        assert_eq!(status, 400);
        assert_eq!(body, json!({"error": "Invalid JSON body"}));
        let (status, body) = api
            .with(
                "POST",
                "/api/git/create-worktree",
                json!({"cwd": root.to_str().unwrap(), "baseBranch": "main"}),
            )
            .await;
        assert_eq!(status, 400);
        assert_eq!(
            body,
            json!({"error": "Missing cwd, baseBranch, or newBranch"})
        );
        api.stop().await;
    }

    #[tokio::test]
    async fn a_plain_directory_reports_the_ts_empty_status_shape() {
        let root = temp_dir("plain");
        let api = api_for(&root).await;
        let (status, body) = api
            .with(
                "POST",
                "/api/git/status",
                json!({"cwd": root.to_str().unwrap()}),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(
            body,
            json!({
                "branch": null,
                "hasWorkingTreeChanges": false,
                "index": {"files": [], "insertions": 0, "deletions": 0},
                "workingTree": {"files": [], "insertions": 0, "deletions": 0},
                "hasUpstream": false,
                "aheadCount": 0,
                "behindCount": 0,
                "pr": null,
                "ghAvailable": false,
                "prProvider": "none",
                "remoteUrl": null,
            })
        );
        // git.ts reports `isRepo: true` even when no branches exist.
        let (status, body) = api
            .with(
                "POST",
                "/api/git/branches",
                json!({"cwd": root.to_str().unwrap()}),
            )
            .await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"branches": [], "isRepo": true}));
        api.stop().await;
    }

    #[tokio::test]
    async fn init_then_status_and_stage_track_an_untracked_file() {
        let root = temp_dir("init");
        let api = api_for(&root).await;
        let cwd = json!(root.to_str().unwrap());
        let (status, body) = api.with("POST", "/api/git/init", json!({"cwd": cwd})).await;
        assert_eq!(status, 200, "{body}");
        assert_eq!(body, json!({"ok": true}));

        let (status, body) = api
            .with("POST", "/api/git/status", json!({"cwd": cwd}))
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["hasWorkingTreeChanges"], json!(false));
        assert_eq!(body["pr"], json!(null));
        assert_eq!(body["prProvider"], json!("none"));
        assert_eq!(body["workingTree"]["files"], json!([]));

        std::fs::write(root.join("a.txt"), "hello\n").unwrap();
        let (status, body) = api
            .with("POST", "/api/git/status", json!({"cwd": cwd}))
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["hasWorkingTreeChanges"], json!(true));
        assert_eq!(body["workingTree"]["files"][0]["path"], json!("a.txt"));
        assert_eq!(body["workingTree"]["files"][0]["status"], json!("?"));
        assert_eq!(body["workingTree"]["files"][0]["insertions"], json!(0));

        // No `paths` means stage everything.
        let (status, body) = api
            .with("POST", "/api/git/stage", json!({"cwd": cwd}))
            .await;
        assert_eq!(status, 200);
        assert_eq!(body, json!({"ok": true}));
        let (status, body) = api
            .with("POST", "/api/git/status", json!({"cwd": cwd}))
            .await;
        assert_eq!(status, 200);
        assert_eq!(body["index"]["files"][0]["path"], json!("a.txt"));
        assert_eq!(body["index"]["files"][0]["status"], json!("A"));
        assert_eq!(body["workingTree"]["files"], json!([]));
        api.stop().await;
    }

    #[tokio::test]
    async fn authority_denial_and_owner_mismatch_are_403() {
        let root = temp_dir("denied");
        let auth = auth();
        let denied: GitAuthority = Arc::new(|_request, _cancel| {
            Box::pin(async move { Err("Fixture authorization denied".to_string()) })
        });
        let api = Api::start(
            GitRoutes::new(auth.clone()).with_authority(denied).router(),
            auth.clone(),
        )
        .await;
        let (status, body) = api
            .with(
                "POST",
                "/api/git/status",
                json!({"cwd": root.to_str().unwrap()}),
            )
            .await;
        assert_eq!(status, 403);
        assert_eq!(body, json!({"error": "Fixture authorization denied"}));
        api.stop().await;

        // A fresh AuthState: `stop()` shuts the previous one down.
        let second = super::auth();
        let api = Api::start(
            GitRoutes::new(second.clone())
                .with_authority(authority_for(root.clone(), Some("someone-else")))
                .router(),
            second,
        )
        .await;
        let (status, body) = api
            .with(
                "POST",
                "/api/git/status",
                json!({"cwd": root.to_str().unwrap()}),
            )
            .await;
        assert_eq!(status, 403, "{body}");
        assert_eq!(body, json!({"error": "Git authority owner/root mismatch"}));
        api.stop().await;
    }

    #[tokio::test]
    async fn git_routes_are_post_only() {
        let root = temp_dir("method");
        let api = api_for(&root).await;
        for path in ["/api/git/status", "/api/git/branches", "/api/git/stage"] {
            let (status, _) = api
                .send(
                    "GET",
                    path,
                    Some(&token()),
                    Some(json!({"cwd": root.to_str().unwrap()})),
                )
                .await;
            assert_eq!(status, 405, "{path}");
        }
        api.stop().await;
    }
}

mod chat {
    use super::*;
    use jait_gateway::routes::chat::{ChatFactory, ChatRoutes, PreparedChat};
    use jait_gateway::runtime::chat_sessions::SessionTurnManager;
    use jait_gateway::security::http_auth::AuthUser;
    use jait_gateway::services::sessions::SessionRecord;
    use std::num::NonZeroU16;
    use std::sync::Arc;

    /// The server owns provider configuration; this double never prepares a turn.
    /// That keeps `/api/chat` on the documented 503 configuration branch.
    struct NoProvider;

    impl ChatFactory for NoProvider {
        fn prepare(
            &self,
            _user: AuthUser,
            _session: SessionRecord,
        ) -> futures_util::future::BoxFuture<'_, Result<PreparedChat, String>> {
            Box::pin(async { Err("no provider is configured for this server".to_owned()) })
        }
    }

    fn seed_session(db: &rusqlite::Connection, id: &str, owner: &str, status: &str) {
        db.execute(
            "INSERT INTO sessions(id,user_id,name,project_path,created_at,last_active_at,status) \
             VALUES(?1,?2,'chat','/tmp/chat','2024-01-01T00:00:00.000Z','2024-01-02T00:00:00.000Z',?3)",
            rusqlite::params![id, owner, status],
        )
        .unwrap();
    }

    async fn api() -> Api {
        let auth = auth_seeded(|db| {
            seed_session(db, "sess-1", OWNER, "active");
            seed_session(db, "sess-other", "u-other", "active");
            seed_session(db, "sess-closed", OWNER, "closed");
        });
        let router = ChatRoutes::new(
            auth.clone(),
            Arc::new(NoProvider),
            SessionTurnManager::new(NonZeroU16::new(4).unwrap()),
            std::path::PathBuf::from("/tmp/chat"),
        )
        .unwrap()
        .router();
        Api::start(router, auth).await
    }

    #[tokio::test]
    async fn every_chat_endpoint_requires_a_user() {
        let server = api().await;
        for (method, path) in [
            ("POST", "/api/chat"),
            ("POST", "/api/chat/cancel"),
            ("POST", "/api/sessions/sess-1/cancel"),
            ("GET", "/api/sessions/sess-1/messages"),
        ] {
            let (status, body) = server.send(method, path, None, None).await;
            assert_eq!(status, 401, "{method} {path}: {body}");
            assert_eq!(body, json!({"detail": "login_required"}));
        }
        server.stop().await;
    }

    #[tokio::test]
    async fn unsupported_options_are_named_even_when_null() {
        let server = api().await;
        // Omission may select a server default; an explicit value would express
        // provider or security intent, so it is refused by name.
        for (option, value) in [
            ("model", json!("gpt-4o")),
            ("provider", json!(null)),
            ("attachments", json!([])),
            ("runtimeMode", json!("")),
        ] {
            let (status, body) = server
                .with(
                    "POST",
                    "/api/chat",
                    json!({"sessionId": "sess-1", "content": "hi", option: value}),
                )
                .await;
            assert_eq!(status, 400, "{option}: {body}");
            assert_eq!(
                body,
                json!({"error": "UNSUPPORTED_CHAT_OPTION", "option": option})
            );
        }
        server.stop().await;
    }

    #[tokio::test]
    async fn malformed_and_empty_requests_are_invalid_chat_requests() {
        let server = api().await;
        for body in [
            json!([]),
            json!({"sessionId": 1, "content": "hi"}),
            json!({"sessionId": "sess-1"}),
            json!({"sessionId": "sess-1", "content": "hi", "unknownField": true}),
            json!({"sessionId": "sess-1", "content": "   \n\t "}),
            json!({"sessionId": "", "content": "hi"}),
        ] {
            let (status, payload) = server.with("POST", "/api/chat", body.clone()).await;
            assert_eq!(status, 400, "{body}: {payload}");
            assert_eq!(payload, json!({"error": "INVALID_CHAT_REQUEST"}));
        }
        server.stop().await;
    }

    #[tokio::test]
    async fn a_body_past_the_size_limit_is_413() {
        let server = api().await;
        // ChatLimits::default().body_bytes is 64 KiB.
        let oversized = "x".repeat(70 * 1024);
        let (status, body) = server
            .with(
                "POST",
                "/api/chat",
                json!({"sessionId": "sess-1", "content": oversized}),
            )
            .await;
        assert_eq!(status, 413, "{body}");
        assert_eq!(body, json!({"error": "BODY_TOO_LARGE"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn a_session_that_is_unknown_foreign_or_closed_is_404() {
        let server = api().await;
        for session in ["sess-missing", "sess-other", "sess-closed"] {
            let (status, body) = server
                .with(
                    "POST",
                    "/api/chat",
                    json!({"sessionId": session, "content": "hi"}),
                )
                .await;
            assert_eq!(status, 404, "{session}: {body}");
            assert_eq!(body, json!({"error": "SESSION_NOT_FOUND"}));
        }
        server.stop().await;
    }

    #[tokio::test]
    async fn an_owned_session_without_a_provider_is_configuration_unavailable() {
        let server = api().await;
        let (status, body) = server
            .with(
                "POST",
                "/api/chat",
                json!({"sessionId": "sess-1", "content": "hi"}),
            )
            .await;
        assert_eq!(status, 503, "{body}");
        assert_eq!(body, json!({"error": "CHAT_CONFIGURATION_UNAVAILABLE"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn cancel_without_an_active_turn_reports_false() {
        let server = api().await;
        let (status, body) = server
            .send("POST", "/api/sessions/sess-1/cancel", Some(&token()), None)
            .await;
        assert_eq!(status, 200, "{body}");
        assert_eq!(body, json!({"ok": true, "cancelled": false}));

        let (status, body) = server
            .with("POST", "/api/chat/cancel", json!({"sessionId": "sess-1"}))
            .await;
        assert_eq!(status, 200, "{body}");
        assert_eq!(body, json!({"ok": true, "cancelled": false}));

        // A path session plus a non-empty body is ambiguous and refused.
        let (status, body) = server
            .with(
                "POST",
                "/api/sessions/sess-1/cancel",
                json!({"sessionId": "sess-1"}),
            )
            .await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(body, json!({"error": "INVALID_CANCEL_REQUEST"}));

        for payload in [json!({"sessionId": ""}), json!({}), json!({"sessionId": 7})] {
            let (status, body) = server
                .with("POST", "/api/chat/cancel", payload.clone())
                .await;
            assert_eq!(status, 400, "{payload}: {body}");
            assert_eq!(body, json!({"error": "INVALID_CANCEL_REQUEST"}));
        }

        // Unknown, foreign and closed sessions are not cancellable.
        for session in ["sess-missing", "sess-other", "sess-closed"] {
            let (status, body) = server
                .with("POST", "/api/chat/cancel", json!({"sessionId": session}))
                .await;
            assert_eq!(status, 404, "{session}: {body}");
            assert_eq!(body, json!({"error": "SESSION_NOT_FOUND"}));
        }
        server.stop().await;
    }

    #[tokio::test]
    async fn messages_of_an_empty_session_report_the_pagination_envelope() {
        let server = api().await;
        let (status, body) = server
            .send("GET", "/api/sessions/sess-1/messages", Some(&token()), None)
            .await;
        assert_eq!(status, 200, "{body}");
        assert_eq!(
            body,
            json!({
                "sessionId": "sess-1",
                "streaming": false,
                "seq": 0,
                "lastActiveAt": "2024-01-02T00:00:00.000Z",
                "total": 0,
                "hasMore": false,
                "limit": 50,
                "messages": [],
            })
        );

        for query in [
            "limit=0",
            "limit=101",
            "limit=abc",
            "before=abc",
            "before=",
            "unknown=1",
        ] {
            let (status, payload) = server
                .send(
                    "GET",
                    &format!("/api/sessions/sess-1/messages?{query}"),
                    Some(&token()),
                    None,
                )
                .await;
            assert_eq!(status, 400, "{query}: {payload}");
            assert_eq!(payload, json!({"error": "INVALID_QUERY"}));
        }

        let (status, payload) = server
            .send(
                "GET",
                "/api/sessions/sess-other/messages",
                Some(&token()),
                None,
            )
            .await;
        assert_eq!(status, 404, "{payload}");
        assert_eq!(payload, json!({"error": "SESSION_NOT_FOUND"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn chat_is_post_only() {
        let server = api().await;
        let (status, body) = server.send("GET", "/api/chat", Some(&token()), None).await;
        assert_eq!(status, 405, "{body}");
        server.stop().await;
    }
}

mod email {
    use super::*;
    use jait_gateway::db::worker::DatabaseWorker;
    use jait_gateway::routes::email::EmailRoutes;
    use jait_gateway::services::calendar::{Request as HttpRequest, Response as HttpResponse};
    use jait_gateway::services::email::EmailService;
    use jait_gateway::services::email::connection::PinnedMailServer;
    use jait_gateway::services::email::imap::{
        ImapSession, MailProtocolHost, ParsedMime, ProtocolLimits, SmtpMessage,
    };
    use jait_gateway::services::email::remote_images::{ImageRequest, ImageResponse};
    use jait_gateway::services::user_secrets::UserSecretService;
    use std::num::NonZeroU16;
    use std::sync::Arc;

    /// The host owns mail transports; this double never opens a socket, so every
    /// assertion below lands on the route layer's own validation and auth gates.
    struct NoMailHost;

    impl MailProtocolHost for NoMailHost {
        fn imap(
            &self,
            _server: PinnedMailServer,
            _limits: ProtocolLimits,
        ) -> futures_util::future::BoxFuture<'_, Result<Box<dyn ImapSession>, String>> {
            Box::pin(async { Err("no imap in contract tests".to_owned()) })
        }
        fn smtp(
            &self,
            _server: PinnedMailServer,
            _limits: ProtocolLimits,
            _message: Option<SmtpMessage>,
        ) -> futures_util::future::BoxFuture<'_, Result<Option<String>, String>> {
            Box::pin(async { Err("no smtp in contract tests".to_owned()) })
        }
        fn parse_mime(
            &self,
            _source: Vec<u8>,
            _max_html_bytes: usize,
        ) -> futures_util::future::BoxFuture<'_, Result<ParsedMime, String>> {
            Box::pin(async { Err("no mime in contract tests".to_owned()) })
        }
    }

    async fn api() -> Api {
        let auth = auth();
        let db = rusqlite::Connection::open_in_memory().unwrap();
        jait_gateway::db::migrate_database(&db).unwrap();
        let worker = DatabaseWorker::new(db, NonZeroU16::new(2).unwrap()).unwrap();
        let email = Arc::new(EmailService::new(
            worker,
            UserSecretService::new(SECRET),
            Arc::new(|_: HttpRequest| {
                Box::pin(async { Err("network is unavailable in contract tests".to_owned()) })
                    as futures_util::future::BoxFuture<'static, Result<HttpResponse, String>>
            }),
            Arc::new(NoMailHost),
            Arc::new(|_: String| {
                Box::pin(async { Err("dns is unavailable in contract tests".to_owned()) })
                    as futures_util::future::BoxFuture<'static, Result<Vec<String>, String>>
            }),
        ));
        let routes = EmailRoutes {
            auth: auth.clone(),
            email,
            public_base: None,
            image_resolver: Arc::new(|_: String| {
                Box::pin(async { Err("dns is unavailable in contract tests".to_owned()) })
            }),
            image_transport: Arc::new(|_: ImageRequest| {
                Box::pin(async { Err("network is unavailable in contract tests".to_owned()) })
            }),
        };
        Api::start(routes.router(), auth).await
    }

    #[tokio::test]
    async fn email_requires_a_user_but_the_oauth_callback_is_public() {
        let server = api().await;
        for (method, path) in [
            ("GET", "/api/email/config"),
            ("GET", "/api/email/accounts"),
            ("POST", "/api/email/accounts"),
            ("GET", "/api/email/messages"),
            ("POST", "/api/email/send"),
            ("GET", "/api/email/folders"),
            ("POST", "/api/email/images"),
        ] {
            let (status, body) = server.send(method, path, None, None).await;
            assert_eq!(status, 401, "{method} {path}: {body}");
            assert_eq!(body, json!({"detail": "login_required"}));
        }
        // The browser callback is reached by the provider, not by a session.
        let (status, body) = server
            .send("GET", "/api/email/oauth/callback", None, None)
            .await;
        assert_eq!(status, 200, "{body}");
        let html = body.as_str().expect("callback renders html");
        assert!(html.contains("Missing authorization code."), "{html}");
        server.stop().await;
    }

    #[tokio::test]
    async fn config_reports_oauth_provider_availability_as_booleans() {
        let server = api().await;
        let (status, body) = server.ok("GET", "/api/email/config").await;
        assert_eq!(status, 200, "{body}");
        assert_eq!(
            body,
            json!({"providers": {"gmail": false, "outlook": false}})
        );
        server.stop().await;
    }

    #[tokio::test]
    async fn oauth_app_credentials_require_both_halves_and_a_known_provider() {
        let server = api().await;
        let (status, body) = server
            .with(
                "POST",
                "/api/email/config/yahoo",
                json!({"clientId": "a", "clientSecret": "b"}),
            )
            .await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(body, json!({"error": "Unknown provider"}));

        let (status, body) = server
            .with(
                "POST",
                "/api/email/config/gmail",
                json!({"clientId": "only-id"}),
            )
            .await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(
            body,
            json!({"error": "clientId and clientSecret are required"})
        );

        // Both halves whitespace-only is the "clear the credentials" request.
        let (status, body) = server
            .with(
                "POST",
                "/api/email/config/gmail",
                json!({"clientId": " ", "clientSecret": " "}),
            )
            .await;
        assert_eq!(status, 200, "{body}");
        assert_eq!(body, json!({"ok": true}));
        server.stop().await;
    }

    #[tokio::test]
    async fn connect_requires_a_configured_provider() {
        let server = api().await;
        let (status, body) = server.ok("GET", "/api/email/connect/yahoo").await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(body, json!({"error": "Unknown provider"}));

        let (status, body) = server.ok("GET", "/api/email/connect/gmail").await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(
            body,
            json!({"error": "gmail is not configured. Add its OAuth client id/secret in Email settings."})
        );
        server.stop().await;
    }

    #[tokio::test]
    async fn account_writes_validate_credentials_before_lookup() {
        let server = api().await;
        let (status, body) = server.with("POST", "/api/email/accounts", json!({})).await;
        assert_eq!(status, 400, "{body}");
        assert_eq!(
            body,
            json!({"error": "Valid email, IMAP and SMTP credentials are required (TLS or STARTTLS)."})
        );

        for method in ["DELETE", "PATCH"] {
            let (status, body) = server
                .with(
                    method,
                    "/api/email/accounts/missing",
                    json!({"imapHost": "imap.example.com"}),
                )
                .await;
            assert_eq!(status, 404, "{method}: {body}");
            assert_eq!(body, json!({"error": "Account not found"}));
        }
        server.stop().await;
    }

    #[tokio::test]
    async fn non_object_bodies_are_read_as_missing_fields() {
        let server = api().await;
        for body in [json!([1, 2, 3]), json!("just a string"), json!(null)] {
            let (status, payload) = server
                .with("POST", "/api/email/config/gmail", body.clone())
                .await;
            assert_eq!(status, 400, "{body}: {payload}");
            assert_eq!(
                payload,
                json!({"error": "clientId and clientSecret are required"})
            );
        }

        let (status, payload) = server.with("POST", "/api/email/send", json!({})).await;
        assert_eq!(status, 400, "{payload}");
        assert_eq!(payload, json!({"error": "A recipient is required"}));
        server.stop().await;
    }

    #[tokio::test]
    async fn the_oauth_callback_escapes_provider_supplied_text() {
        let server = api().await;
        let (status, body) = server
            .send(
                "GET",
                "/api/email/oauth/callback?error=access_denied&error_description=%3Cscript%3Ealert(1)%3C/script%3E",
                None,
                None,
            )
            .await;
        assert_eq!(status, 200, "{body}");
        let html = body.as_str().expect("callback renders html");
        assert!(
            html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"),
            "{html}"
        );
        assert!(html.contains("<h2>Connection failed</h2>"), "{html}");
        assert!(!html.contains("<script>alert(1)"), "{html}");
        assert!(html.contains("ok:false"), "{html}");
        server.stop().await;
    }

    #[tokio::test]
    async fn email_routes_reject_mismatched_methods() {
        let server = api().await;
        for (method, path) in [
            ("DELETE", "/api/email/config"),
            ("GET", "/api/email/send"),
            ("POST", "/api/email/messages"),
            ("GET", "/api/email/config/gmail"),
        ] {
            let (status, body) = server.send(method, path, Some(&token()), None).await;
            assert_eq!(status, 405, "{method} {path}: {body}");
        }
        server.stop().await;
    }
}
