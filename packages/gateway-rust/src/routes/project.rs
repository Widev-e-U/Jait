//! Port of `packages/gateway/src/routes/project.ts`.
//!
//! Project filesystem surface. Every handler resolves the owning project
//! through `ProjectService`, then applies an operation confined to the
//! project root. TS served these from a `FileSystemSurface` instance; the
//! native `SurfaceRegistry` is not yet wired into a router, so operations
//! are executed directly against the filesystem with an equivalent guard.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

use axum::{
    Json,
    extract::{Request, State},
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
};
use serde_json::{Map, Value, json};

use crate::{
    routes::auth::{self, AuthState, response},
    services::{json_state::ProjectStateService, projects::ProjectService},
};

type Res<T> = Result<T, Box<Response>>;

/// `project.ts` error bodies are `{ error: CODE, message: MESSAGE }`.
fn fail(status: u16, code: &str, message: &str) -> Response {
    let code_status = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    (
        code_status,
        Json(json!({ "error": code, "message": message })),
    )
        .into_response()
}

fn db_err(_e: rusqlite::Error) -> Box<Response> {
    Box::new(fail(500, "INTERNAL_ERROR", "Database operation failed"))
}

/// `AuthState::with_database` requires a `std::error::Error` payload, but route
/// closures resolve to responses. Run the closure and map database failures to
/// the same 500 body `db_err` produces.
async fn run<T: Send + 'static>(
    auth: &AuthState,
    operation: impl FnOnce(&rusqlite::Connection) -> Res<T> + Send + 'static,
) -> Res<T> {
    match auth
        .with_database(move |db| {
            Ok::<Res<T>, Box<dyn std::error::Error + Send + Sync>>(operation(db))
        })
        .await
    {
        Ok(inner) => inner,
        Err(_) => Err(Box::new(fail(
            500,
            "INTERNAL_ERROR",
            "Database operation failed",
        ))),
    }
}

fn js_text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn params(uri: &Uri) -> HashMap<String, String> {
    uri.query()
        .map(|raw| {
            url::form_urlencoded::parse(raw.as_bytes())
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect()
        })
        .unwrap_or_default()
}

/// Lexically normalises `relative` under `root`, rejecting any escape.
fn confine(root: &Path, relative: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    let candidate = if Path::new(relative).is_absolute() {
        PathBuf::from(relative)
    } else {
        root.join(relative)
    };
    for component in candidate.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    let root = root.canonicalize().ok()?;
    out.starts_with(&root).then_some(out)
}

#[derive(Clone)]
pub struct ProjectRoutes {
    pub auth: AuthState,
    pub root: std::sync::Arc<PathBuf>,
    filesystem: crate::runtime::blocking::BlockingLane,
}

impl ProjectRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            root: std::sync::Arc::new(PathBuf::new()),
            filesystem: crate::runtime::blocking::BlockingLane::new(
                std::num::NonZeroU16::new(4).expect("fixed filesystem capacity"),
            ),
        }
    }

    pub fn router(self) -> axum::Router {
        axum::Router::new()
            .route("/api/project", axum::routing::any(any_handler))
            .route("/api/project/{*rest}", axum::routing::any(any_handler))
            .with_state(self)
    }
}

async fn any_handler(State(state): State<ProjectRoutes>, request: Request) -> Response {
    dispatch(State(state), request).await
}

struct Ctx {
    root: Option<PathBuf>,
    search_local: bool,
}

async fn dispatch(State(state): State<ProjectRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if !state.auth.origin_allowed(&headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "ORIGIN_FORBIDDEN" })),
        )
            .into_response();
    }
    let method = request.method().clone();
    let uri = request.uri().clone();
    let path = uri.path().to_string();
    let query = params(&uri);

    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let uid = user.id.clone();

    let route = match path.as_str() {
        "/api/project/info" => "info",
        "/api/project/open" => "open",
        "/api/project/list" => "list",
        "/api/project/read" => "read",
        "/api/project/write" => "write",
        "/api/project/stat" => "stat",
        "/api/project/undo" => "undo",
        "/api/project/backup" => "backup",
        "/api/project/apply-diff" => "apply-diff",
        "/api/project/undo-all" => "undo-all",
        "/api/project/delete" => "delete",
        "/api/project/rename" => "rename",
        "/api/project/move" => "move",
        "/api/project/create-file" => "create-file",
        "/api/project/create-directory" => "create-directory",
        "/api/project/reveal" => "reveal",
        "/api/project/search" => "search",
        _ => return fail(404, "NOT_FOUND", "Not found"),
    };

    // Body is only consumed by mutating routes.
    let body = match route {
        "write" | "undo" | "apply-diff" | "undo-all" | "delete" | "rename" | "move"
        | "create-file" | "create-directory" | "reveal" | "open" => {
            match auth::parse_body(request.into_body(), &headers).await {
                Ok(body) => body,
                Err(response) => return *response,
            }
        }
        _ => Value::Null,
    };

    // Resolve the project this request operates on (body or query `projectId`).
    let project_id = js_text(body.get("projectId")).or_else(|| query.get("projectId").cloned());
    let ctx = match resolve(&state, &uid, project_id).await {
        Ok(ctx) => ctx,
        Err(response) => return *response,
    };

    match (route, method.as_str()) {
        ("info", "GET") => match &ctx.root {
            Some(root) => response(
                200,
                json!({
                    "open": true,
                    "root": root.to_string_lossy(),
                    "projectId": js_text(body.get("projectId")),
                }),
            ),
            None => fail(404, "NO_PROJECT", "No project is open"),
        },
        ("open", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            if !root.is_dir() {
                return fail(404, "NO_PROJECT", "Project root does not exist");
            }
            let ui = json!({ "ui": { "panel": { "open": true } } });
            let mut entries = Map::new();
            entries.insert("project.ui".to_string(), ui["ui"].clone());
            let project_id = js_text(body.get("projectId")).unwrap_or_default();
            return run(&state.auth, move |db| {
                ProjectStateService::new(db)
                    .set(&project_id, &entries)
                    .map_err(db_err)?;
                Ok(response(
                    200,
                    json!({ "ok": true, "root": root.to_string_lossy() }),
                ))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        ("list", "GET") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = query.get("path").cloned().unwrap_or_default();
            let Some(target) = confine(&root, &relative) else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            let mut entries = Vec::new();
            let Ok(read_dir) = std::fs::read_dir(&target) else {
                return fail(400, "LIST_FAILED", "Unable to list directory");
            };
            for entry in read_dir.flatten() {
                let metadata = entry.metadata().ok();
                entries.push(json!({
                    "name": entry.file_name().to_string_lossy(),
                    "path": entry
                        .path()
                        .strip_prefix(&root)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    "isDirectory": metadata.as_ref().is_some_and(|m| m.is_dir()),
                    "size": metadata.as_ref().map(|m| m.len()).unwrap_or(0),
                }));
            }
            entries.sort_by(|a, b| {
                a["name"]
                    .as_str()
                    .unwrap_or_default()
                    .cmp(b["name"].as_str().unwrap_or_default())
            });
            response(200, json!({ "entries": entries }))
        }
        ("read", "GET") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = query.get("path").cloned().unwrap_or_default();
            let Some(target) = confine(&root, &relative) else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            match std::fs::read_to_string(&target) {
                Ok(content) => response(200, json!({ "content": content, "path": relative })),
                Err(_) => fail(404, "NOT_FOUND", "File not found"),
            }
        }
        ("write", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = js_text(body.get("path")).unwrap_or_default();
            let Some(target) = confine(&root, &relative) else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            let content = js_text(body.get("content")).unwrap_or_default();
            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match std::fs::write(&target, content.as_bytes()) {
                Ok(()) => response(
                    200,
                    json!({ "ok": true, "path": relative, "bytes": content.len() }),
                ),
                Err(_) => fail(500, "WRITE_FAILED", "Failed to write file"),
            }
        }
        ("stat", "GET") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = query.get("path").cloned().unwrap_or_default();
            let Some(target) = confine(&root, &relative) else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            match std::fs::metadata(&target) {
                Ok(metadata) => response(
                    200,
                    json!({
                        "exists": true,
                        "isDirectory": metadata.is_dir(),
                        "isFile": metadata.is_file(),
                        "size": metadata.len(),
                        "path": relative,
                    }),
                ),
                Err(_) => fail(404, "STAT_FAILED", "Unable to stat path"),
            }
        }
        ("delete", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = js_text(body.get("path")).unwrap_or_default();
            let Some(target) = confine(&root, &relative) else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            let result = if target.is_dir() {
                std::fs::remove_dir_all(&target)
            } else {
                std::fs::remove_file(&target)
            };
            match result {
                Ok(()) => response(200, json!({ "ok": true })),
                Err(_) => fail(500, "DELETE_FAILED", "Failed to delete path"),
            }
        }
        ("rename", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = js_text(body.get("path")).unwrap_or_default();
            let name = js_text(body.get("name")).unwrap_or_default();
            let (Some(source), Some(destination)) = (
                confine(&root, &relative),
                confine(&root, &relative).and_then(|p| p.parent().map(|d| d.join(&name))),
            ) else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            match std::fs::rename(&source, &destination) {
                Ok(()) => response(200, json!({ "ok": true })),
                Err(_) => fail(500, "RENAME_FAILED", "Failed to rename path"),
            }
        }
        ("move", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = js_text(body.get("path")).unwrap_or_default();
            let directory = js_text(body.get("directory")).unwrap_or_default();
            let (Some(source), Some(destination)) =
                (confine(&root, &relative), confine(&root, &directory))
            else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            let Some(file_name) = source.file_name() else {
                return fail(400, "INVALID_PATH", "Invalid source path");
            };
            match std::fs::rename(&source, destination.join(file_name)) {
                Ok(()) => response(200, json!({ "ok": true })),
                Err(_) => fail(500, "MOVE_FAILED", "Failed to move path"),
            }
        }
        ("create-file", "POST") | ("create-directory", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = js_text(body.get("path")).unwrap_or_default();
            let Some(target) = confine(&root, &relative) else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            if target.exists() {
                return fail(400, "CREATE_FAILED", "Path already exists");
            }
            let created = if route == "create-directory" {
                std::fs::create_dir_all(&target)
            } else {
                if let Some(parent) = target.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let content = js_text(body.get("content")).unwrap_or_default();
                std::fs::write(&target, content.as_bytes())
            };
            match created {
                Ok(()) => response(200, json!({ "ok": true, "path": relative })),
                Err(_) => fail(500, "CREATE_FAILED", "Failed to create path"),
            }
        }
        ("search", "GET") => search_response(&state, &ctx, &query).await,
        ("reveal", "POST") => response(200, json!({ "ok": true, "revealed": false })),
        // Surface-state dependent operations (backup/undo stack) require a
        // live `FileSystemSurface`, which no router exposes yet.
        ("backup", _) | ("undo", _) | ("undo-all", _) | ("apply-diff", _) => fail(
            501,
            "SURFACE_UNAVAILABLE",
            "Filesystem surface is not registered in the native router",
        ),
        (_, _) => fail(405, "METHOD_NOT_ALLOWED", "Method not allowed"),
    }
}

/// Resolves the project for this request and its effective root.
async fn resolve(state: &ProjectRoutes, uid: &str, project_id: Option<String>) -> Res<Ctx> {
    let uid = uid.to_string();
    run(&state.auth, move |db| {
        let service = ProjectService::new(db);
        let record = match project_id.as_deref() {
            Some(id) => service.get(id, Some(&uid)).map_err(db_err)?,
            None => service
                .list(Some("active"), Some(&uid), None)
                .map_err(db_err)?
                .into_iter()
                .next(),
        };
        let Some(record) = record else {
            return Ok(Ctx {
                root: None,
                search_local: false,
            });
        };
        let effective = service
            .effective_root_for_record(Some(&record), Some(&uid))
            .map_err(db_err)?;
        // An inherited root belongs to the ancestor's execution node. Never
        // reinterpret a remote path as a gateway-local path.
        let mut current = record.clone();
        let mut seen = std::collections::HashSet::new();
        let mut search_local = false;
        for _ in 0..64 {
            if !seen.insert(current.id.clone())
                || current.node_id.as_deref().is_some_and(|id| id != "gateway")
            {
                break;
            }
            if current
                .root_path
                .as_deref()
                .is_some_and(|p| !crate::text::js_trim(p).is_empty())
            {
                search_local = true;
                break;
            }
            let Some(parent) = current.parent_id.as_deref() else {
                break;
            };
            let Some(next) = service.get(parent, Some(&uid)).map_err(db_err)? else {
                break;
            };
            current = next;
        }
        Ok(Ctx {
            root: effective.map(PathBuf::from),
            search_local,
        })
    })
    .await
}

fn search_options(
    query: &HashMap<String, String>,
) -> Result<crate::services::project_search::SearchOptions, &'static str> {
    use crate::services::project_search::{SearchMode, SearchOptions};
    let text = query
        .get("query")
        .filter(|s| !crate::text::js_trim(s).is_empty())
        .ok_or("query is required")?;
    if text.len() > 4096 {
        return Err("query exceeds byte budget");
    }
    let mode = match query.get("mode").map(String::as_str).unwrap_or("files") {
        "files" => SearchMode::Files,
        "content" => SearchMode::Content,
        _ => return Err("mode must be files or content"),
    };
    let limit = match query
        .get("limit")
        .map(|v| crate::text::js_trim(v))
        .filter(|v| !v.is_empty())
    {
        None => 50,
        Some(value) => {
            let n = value
                .parse::<f64>()
                .map_err(|_| "limit must be a positive integer")?;
            if !n.is_finite() || n < 1.0 || n.fract() != 0.0 {
                return Err("limit must be a positive integer");
            }
            n.min(200.0) as usize
        }
    };
    Ok(SearchOptions {
        query: text.clone(),
        mode,
        limit: Some(limit),
        include: None,
        is_regexp: false,
        include_ignored_files: query
            .get("includeIgnoredFiles")
            .is_some_and(|v| v == "true"),
    })
}

async fn search_response(
    state: &ProjectRoutes,
    ctx: &Ctx,
    query: &HashMap<String, String>,
) -> Response {
    use crate::services::project_search::{
        self, Budgets, Cancellation, Error, ProjectRoot, SearchResult,
    };
    let options = match search_options(query) {
        Ok(options) => options,
        Err(message) => return fail(400, "VALIDATION_ERROR", message),
    };
    // Surface identifiers cannot select a different root until native surface
    // ownership is wired; projectId is resolved through the authenticated DB.
    if query.get("surfaceId").is_some_and(|id| !id.is_empty()) {
        return fail(501, "NOT_SUPPORTED", "Native surface search is unavailable");
    }
    let Some(root) = ctx.root.clone() else {
        return fail(404, "NO_PROJECT", "No project is open");
    };
    if !ctx.search_local {
        return fail(
            501,
            "NOT_SUPPORTED",
            "Project search is unavailable for this execution node",
        );
    }
    struct CancelOnDrop(Cancellation);
    impl Drop for CancelOnDrop {
        fn drop(&mut self) {
            self.0.cancel();
        }
    }
    let cancel = Cancellation::default();
    let _cancel_on_drop = CancelOnDrop(cancel.clone());
    let work = state
        .filesystem
        .run(move || {
            let root = ProjectRoot::open(&root)?;
            project_search::search_project(&root, &options, &Budgets::default(), &cancel)
        })
        .await;
    match work {
        Ok(Ok(SearchResult::Files {
            query,
            files,
            limited,
        })) => response(
            200,
            json!({
                "query": query, "mode": "files", "limited": limited,
                "files": files.into_iter().map(|f| json!({"path": f.relative_path, "name": f.name})).collect::<Vec<_>>()
            }),
        ),
        Ok(Ok(SearchResult::Content {
            query,
            matches,
            limited,
        })) => response(
            200,
            json!({
                "query": query, "mode": "content", "limited": limited,
                "matches": matches.into_iter().map(|m| json!({"file": m.relative_path, "line": m.line, "content": m.content})).collect::<Vec<_>>()
            }),
        ),
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
            fail(503, "SEARCH_BUSY", "Project search capacity is full")
        }
        Ok(Err(Error::Input(_))) => fail(
            400,
            "VALIDATION_ERROR",
            "Invalid project search input or root",
        ),
        Ok(Err(Error::TimedOut)) => fail(504, "SEARCH_TIMEOUT", "Project search deadline exceeded"),
        Ok(Err(Error::Cancelled)) => fail(409, "SEARCH_CANCELLED", "Project search cancelled"),
        Ok(Err(Error::Unsupported)) => fail(
            501,
            "NOT_SUPPORTED",
            "Project search is unavailable on this platform",
        ),
        _ => fail(500, "SEARCH_FAILED", "Project search failed"),
    }
}

#[cfg(test)]
mod search_tests {
    use super::*;
    use crate::{
        security::http_auth::{self, AuthUser},
        services::projects::CreateProject,
    };
    use axum::body::{Body, to_bytes};

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../.jait/artifacts/gateway-rust/parallel-implementation/project-route-fixtures")
                .join(crate::db::identifiers::uuidv7().to_string());
            std::fs::create_dir_all(&path).unwrap();
            Self(path.canonicalize().unwrap())
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn setup(root: &Path) -> (ProjectRoutes, String, String, String) {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES ('owner','owner','unused','now','now'),('other','other','unused','now','now');").unwrap();
        let projects = ProjectService::new(&db);
        let own = projects
            .create(CreateProject {
                user_id: Some("owner".into()),
                root_path: Some(root.to_string_lossy().into()),
                ..Default::default()
            })
            .unwrap();
        let foreign = projects
            .create(CreateProject {
                user_id: Some("other".into()),
                root_path: Some(root.to_string_lossy().into()),
                ..Default::default()
            })
            .unwrap();
        let remote = projects
            .create(CreateProject {
                user_id: Some("owner".into()),
                root_path: Some(root.to_string_lossy().into()),
                node_id: Some("remote-node".into()),
                ..Default::default()
            })
            .unwrap();
        let child = projects
            .create(CreateProject {
                user_id: Some("owner".into()),
                parent_id: Some(remote.id),
                ..Default::default()
            })
            .unwrap();
        let state =
            ProjectRoutes::new(AuthState::new(db, "project-search-fixture-secret".into()).unwrap());
        (state, own.id, foreign.id, child.id)
    }
    async fn request(state: &ProjectRoutes, project: &str, query: &str) -> (StatusCode, Value) {
        let token = http_auth::sign_auth_token(
            &AuthUser {
                id: "owner".into(),
                username: "owner".into(),
            },
            "project-search-fixture-secret",
        )
        .unwrap();
        let request = Request::builder()
            .uri(format!("/api/project/search?projectId={project}&{query}"))
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let response = dispatch(State(state.clone()), request).await;
        let status = response.status();
        let body = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        (status, serde_json::from_slice(&body).unwrap())
    }
    #[test]
    fn search_query_validation_and_route_defaults() {
        let parse = |pairs: &[(&str, &str)]| {
            search_options(
                &pairs
                    .iter()
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect(),
            )
        };
        assert!(parse(&[("q", "old")]).is_err());
        assert!(parse(&[("query", "x"), ("mode", "invalid")]).is_err());
        for limit in ["0", "-1", "1.2", "NaN", "inf"] {
            assert!(parse(&[("query", "x"), ("limit", limit)]).is_err());
        }
        assert_eq!(parse(&[("query", "x")]).unwrap().limit, Some(50));
        assert_eq!(
            parse(&[("query", "x"), ("limit", "1e3")]).unwrap().limit,
            Some(200)
        );
    }
    #[tokio::test]
    async fn authenticated_search_uses_relative_wire_paths_and_bounded_native_content() {
        let fixture = Fixture::new();
        std::fs::create_dir(fixture.0.join("src")).unwrap();
        std::fs::write(fixture.0.join("src/needle.rs"), "pub fn needle() {}\n").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("/etc", fixture.0.join("escape")).unwrap();
        let (state, own, _, _) = setup(&fixture.0);
        let (status, files) = request(&state, &own, "query=needle&mode=files").await;
        assert_eq!(status, StatusCode::OK, "{files}");
        assert_eq!(files["mode"], "files");
        assert_eq!(files["files"][0]["path"], "src/needle.rs");
        assert!(files["files"][0].get("score").is_none());
        let (status, content) = request(&state, &own, "query=needle&mode=content").await;
        assert_eq!(status, StatusCode::OK, "{content}");
        assert_eq!(content["matches"][0]["file"], "src/needle.rs");
        assert_eq!(content["matches"][0]["line"], 1);
        assert!(!content.to_string().contains(fixture.0.to_str().unwrap()));
        state.auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn search_rejects_foreign_projects_remote_inherited_roots_and_unbound_surfaces() {
        let fixture = Fixture::new();
        let (state, own, foreign, remote_child) = setup(&fixture.0);
        assert_eq!(
            request(&state, &foreign, "query=x").await.0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            request(&state, &remote_child, "query=x").await.0,
            StatusCode::NOT_IMPLEMENTED
        );
        assert_eq!(
            request(&state, &own, "query=x&surfaceId=arbitrary").await.0,
            StatusCode::NOT_IMPLEMENTED
        );
        assert_eq!(
            request(&state, &own, "query=x&limit=-1").await.0,
            StatusCode::BAD_REQUEST
        );
        state.auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn saturated_filesystem_lane_rejects_search_without_waiting() {
        let fixture = Fixture::new();
        let (mut state, own, _, _) = setup(&fixture.0);
        state.filesystem =
            crate::runtime::blocking::BlockingLane::new(std::num::NonZeroU16::new(1).unwrap());
        let lane = state.filesystem.clone();
        let (entered, ready) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let task = tokio::spawn(async move {
            lane.run(move || {
                let _ = entered.send(());
                let _ = wait.recv();
            })
            .await
        });
        ready.await.unwrap();
        let result = request(&state, &own, "query=x").await;
        release.send(()).unwrap();
        task.await.unwrap().unwrap();
        assert_eq!(result.0, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(result.1["error"], "SEARCH_BUSY");
        state.auth.shutdown().await.unwrap();
    }
}
