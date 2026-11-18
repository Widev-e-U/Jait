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
    services::{
        json_state::{ProjectStateService, SessionStateService},
        projects::ProjectService,
        sessions::SessionService,
    },
    surfaces::registry::{SurfaceRegistry, SurfaceStartInput, SurfaceState},
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
/// True when `path` is the project root itself (after resolving it), which no mutation may target.
fn is_root(root: &Path, path: &Path) -> bool {
    root.canonicalize().is_ok_and(|r| path == r)
}

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
    if !out.starts_with(&root) {
        return None;
    }
    // The lexical check does not see symlinks: resolve the deepest existing ancestor and require
    // it to stay inside the real root, so a link inside the project cannot lead out of it.
    let mut existing = out.as_path();
    while existing.symlink_metadata().is_err() {
        existing = existing.parent()?;
    }
    // A dangling link has no canonical form; treat it as an escape rather than write through it.
    existing
        .canonicalize()
        .ok()?
        .starts_with(&root)
        .then_some(out)
}

#[derive(Clone)]
pub struct ProjectRoutes {
    pub auth: AuthState,
    pub root: std::sync::Arc<PathBuf>,
    filesystem: crate::runtime::blocking::BlockingLane,
    scoped: crate::services::project_search::scoped::ScopedProjectSearch,
    surfaces: crate::surfaces::registry::SurfaceRegistry,
    /// Original content (None = file did not exist) captured before the first write.
    backups: Backups,
    open_locks: OpenLocks,
}

// Weak entries avoid retaining a mutex for every historical session. The map
// lock is never held across an await; each request holds its session lock for
// the entire open operation, including validation and later lifecycle effects.
type OpenLocks =
    std::sync::Arc<std::sync::Mutex<HashMap<String, std::sync::Weak<tokio::sync::Mutex<()>>>>>;

fn session_open_lock(
    locks: &OpenLocks,
    session_id: &str,
) -> std::sync::Arc<tokio::sync::Mutex<()>> {
    let mut entries = locks.lock().expect("project open locks");
    entries.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = entries.get(session_id).and_then(std::sync::Weak::upgrade) {
        return lock;
    }
    let lock = std::sync::Arc::new(tokio::sync::Mutex::new(()));
    entries.insert(session_id.to_owned(), std::sync::Arc::downgrade(&lock));
    lock
}

type Backups = std::sync::Arc<std::sync::Mutex<std::collections::HashMap<PathBuf, Option<String>>>>;

/// Makes the gateway-local filesystem surface kind available on `surfaces`.
/// Registration is atomic, so a factory the caller already supplied wins.
fn register_filesystem_factory(
    surfaces: &SurfaceRegistry,
    lane: crate::runtime::blocking::BlockingLane,
) {
    surfaces.register_if_absent(std::sync::Arc::new(
        crate::surfaces::filesystem::FileSystemSurfaceFactory::new(
            crate::surfaces::filesystem::GuardOptions::default(),
            lane,
        ),
    ));
}

impl ProjectRoutes {
    pub fn new(auth: AuthState) -> Self {
        let filesystem = crate::runtime::blocking::BlockingLane::new(
            std::num::NonZeroU16::new(4).expect("fixed filesystem capacity"),
        );
        let surfaces = SurfaceRegistry::default();
        register_filesystem_factory(&surfaces, filesystem.clone());
        Self {
            scoped: crate::services::project_search::scoped::ScopedProjectSearch::new(
                auth.worker(),
                surfaces.clone(),
                filesystem.clone(),
            ),
            auth,
            surfaces,
            root: std::sync::Arc::new(PathBuf::new()),
            filesystem,
            backups: Backups::default(),
            open_locks: OpenLocks::default(),
        }
    }

    /// Search surfaces from the registry that owns the running surfaces, so a
    /// `surfaceId` resolves only to a live surface recorded for the caller.
    pub fn with_surfaces(mut self, surfaces: SurfaceRegistry) -> Self {
        register_filesystem_factory(&surfaces, self.filesystem.clone());
        self.surfaces = surfaces;
        self.scoped = crate::services::project_search::scoped::ScopedProjectSearch::new(
            self.auth.worker(),
            self.surfaces.clone(),
            self.filesystem.clone(),
        );
        self
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
        "/api/project/download" => "download",
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

    // The web client opens a path in a session. Validate its required fields
    // before project resolution; the legacy projectId form remains supported.
    if route == "open"
        && method == axum::http::Method::POST
        && (body.get("projectId").is_none()
            || body.get("path").is_some()
            || body.get("sessionId").is_some())
    {
        if body
            .get("path")
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
        {
            return fail(400, "VALIDATION_ERROR", "path is required");
        }
        if body
            .get("sessionId")
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
        {
            return fail(400, "VALIDATION_ERROR", "sessionId is required");
        }
        let session_id = body["sessionId"].as_str().unwrap().to_owned();
        let project_path = body["path"].as_str().unwrap().to_owned();
        // Do not let a foreign user queue work on an owned session's lock.
        let lookup_id = session_id.clone();
        let owner_id = uid.clone();
        match state
            .auth
            .with_database(move |db| {
                Ok(SessionService::new(db)
                    .get(&lookup_id, Some(&owner_id))?
                    .is_some())
            })
            .await
        {
            Ok(true) => {}
            Ok(false) => return fail(404, "NOT_FOUND", "Session not found"),
            Err(error) => return auth::database_failure(&error),
        }
        let open_lock = session_open_lock(&state.open_locks, &session_id);
        let open_guard = open_lock.lock_owned().await;
        // Ownership may have changed while waiting for the preceding open.
        let lookup_id = session_id.clone();
        let owner_id = uid.clone();
        let owned = state
            .auth
            .with_database(move |db| {
                let owned = SessionService::new(db)
                    .get(&lookup_id, Some(&owner_id))?
                    .is_some();
                Ok((owned, open_guard))
            })
            .await;
        let open_guard = match owned {
            Ok((true, guard)) => guard,
            Ok((false, _)) => return fail(404, "NOT_FOUND", "Session not found"),
            Err(error) => return auth::database_failure(&error),
        };
        // Reject malformed node identifiers before inspecting a local path.
        // An absent or null node selects the gateway; other types must not
        // silently redirect a remote request to the gateway filesystem.
        let node = match body.get("nodeId") {
            None | Some(Value::Null) => "gateway",
            Some(Value::String(node)) => node.as_str(),
            Some(_) => return fail(400, "VALIDATION_ERROR", "nodeId must be a string"),
        };
        // No remote filesystem transport exists in this gateway yet. Refuse before
        // any stat, so a remote path is never checked against gateway-local files.
        if !node.is_empty() && node != "gateway" {
            return fail(
                501,
                "NOT_IMPLEMENTED",
                "Remote filesystem surfaces are unavailable on this gateway",
            );
        }
        let stat_path = PathBuf::from(&project_path);
        let _open_guard = match state
            .filesystem
            .run(move || (std::fs::metadata(stat_path), open_guard))
            .await
        {
            Ok((Ok(metadata), guard)) if metadata.is_dir() => guard,
            Ok((Ok(_), _guard)) => {
                return fail(
                    400,
                    "NOT_A_DIRECTORY",
                    "The specified path is not a directory",
                );
            }
            Ok((Err(_), _guard)) => {
                return fail(400, "PATH_NOT_FOUND", "The specified path does not exist");
            }
            Err(_) => return fail(503, "FILESYSTEM_UNAVAILABLE", "Filesystem is unavailable"),
        };
        let explicit_panel_open = body.get("openPanel").and_then(Value::as_bool);
        // The session lock is held until the surface lifecycle has finished.
        return open_session_path(
            &state,
            &uid,
            &session_id,
            &project_path,
            explicit_panel_open,
        )
        .await;
    }

    // Resolve the project this request operates on (body or query `projectId`).
    let project_id = js_text(body.get("projectId")).or_else(|| query.get("projectId").cloned());
    // An explicit surface names the root for this request, as the web client
    // does after opening a path. Search keeps its own surface check.
    let surface_id = query
        .get("surfaceId")
        .cloned()
        .or_else(|| js_text(body.get("surfaceId")))
        .filter(|id| !id.is_empty());
    let ctx = match surface_id.as_deref() {
        Some(id) if !matches!(route, "info" | "search" | "open") => {
            match owned_surface_root(&state, &uid, id).await {
                Ok(root) => Ctx {
                    root: Some(root),
                    search_local: true,
                },
                Err(response) => return *response,
            }
        }
        _ => match resolve(&state, &uid, project_id).await {
            Ok(ctx) => ctx,
            Err(response) => return *response,
        },
    };

    // A remote root is meaningful only on its owning node. Until remote
    // filesystem dispatch is available, never interpret it on the gateway.
    // Explicit surface searches have their own owner and node checks; they do
    // not operate on the project root selected above.
    let surface_search =
        route == "search" && query.get("surfaceId").is_some_and(|id| !id.is_empty());
    if ctx.root.is_some() && !ctx.search_local && route != "info" && !surface_search {
        return fail(400, "NODE_OFFLINE", "Remote filesystem is unavailable");
    }

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
            None => fail(404, "NO_PROJECT", "No filesystem surface is running"),
        },
        ("open", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            // Filesystem metadata can block on slow mounts; keep it off the
            // async runtime and apply the same bounded lane as path-based opens.
            let check_root = root.clone();
            match state.filesystem.run(move || check_root.is_dir()).await {
                Ok(true) => {}
                Ok(false) => return fail(404, "NO_PROJECT", "Project root does not exist"),
                Err(_) => return fail(503, "FILESYSTEM_UNAVAILABLE", "Filesystem is unavailable"),
            }
            let project_id = js_text(body.get("projectId")).unwrap_or_default();
            return run(&state.auth, move |db| {
                let store = ProjectStateService::new(db);
                let mut ui = store
                    .get(&project_id, Some(&["project.ui".to_owned()]))
                    .map_err(db_err)?
                    .remove("project.ui")
                    .and_then(|value| value.as_object().cloned())
                    .unwrap_or_default();
                let mut panel = ui
                    .remove("panel")
                    .and_then(|value| value.as_object().cloned())
                    .unwrap_or_default();
                panel.insert("open".to_string(), Value::Bool(true));
                ui.insert("panel".to_string(), Value::Object(panel));
                let mut entries = Map::new();
                entries.insert("project.ui".to_string(), Value::Object(ui));
                store.set(&project_id, &entries).map_err(db_err)?;
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
            state
                .filesystem
                .run(move || {
                    let Some(target) = confine(&root, &relative) else {
                        return fail(400, "INVALID_PATH", "Path is outside the project root");
                    };
                    let Ok(read_dir) = std::fs::read_dir(&target) else {
                        return fail(400, "LIST_FAILED", "Unable to list directory");
                    };
                    let mut entries = Vec::new();
                    for entry in read_dir.flatten() {
                        let metadata = entry.metadata().ok();
                        entries.push(json!({
                            "name": entry.file_name().to_string_lossy(),
                            "path": entry.path().strip_prefix(&root)
                                .map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
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
                })
                .await
                .unwrap_or_else(|_| {
                    fail(503, "FILESYSTEM_UNAVAILABLE", "Filesystem is unavailable")
                })
        }
        ("read", "GET") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = query.get("path").cloned().unwrap_or_default();
            state
                .filesystem
                .run(move || {
                    let Some(target) = confine(&root, &relative) else {
                        return fail(400, "INVALID_PATH", "Path is outside the project root");
                    };
                    match std::fs::read_to_string(&target) {
                        Ok(content) => {
                            response(200, json!({ "content": content, "path": relative }))
                        }
                        Err(_) => fail(404, "NOT_FOUND", "File not found"),
                    }
                })
                .await
                .unwrap_or_else(|_| {
                    fail(503, "FILESYSTEM_UNAVAILABLE", "Filesystem is unavailable")
                })
        }
        ("download", "GET") => {
            const LIMIT: u64 = 50 * 1024 * 1024;
            let relative = query.get("path").cloned().unwrap_or_default();
            if relative.trim().is_empty() {
                return fail(400, "VALIDATION_ERROR", "path is required");
            }
            let Some(root) = ctx.root.clone() else {
                return fail(
                    404,
                    "NO_PROJECT",
                    "Open the file's project in this chat, then retry.",
                );
            };
            let Some(target) = confine(&root, &relative) else {
                return fail(403, "PATH_DENIED", "Path is outside the project root");
            };
            let unavailable = || {
                fail(
                    400,
                    "DOWNLOAD_FAILED",
                    "File unavailable or outside the project's allowed paths.",
                )
            };
            let Ok(metadata) = std::fs::metadata(&target) else {
                return unavailable();
            };
            if metadata.is_dir() {
                return fail(400, "NOT_A_FILE", "Path is a directory");
            }
            if metadata.len() > LIMIT {
                return fail(413, "FILE_TOO_LARGE", "Downloads are limited to 50 MiB.");
            }
            let Ok(bytes) = std::fs::read(&target) else {
                return unavailable();
            };
            let name = relative.replace('\\', "/");
            let name = name
                .rsplit('/')
                .next()
                .filter(|n| !n.is_empty())
                .unwrap_or("download");
            let mut encoded = String::new();
            for byte in name.bytes() {
                if byte.is_ascii_alphanumeric() || b"-_.!~".contains(&byte) {
                    encoded.push(byte as char);
                } else {
                    encoded.push_str(&format!("%{byte:02X}"));
                }
            }
            (
                StatusCode::OK,
                [
                    ("content-type", "application/octet-stream".to_string()),
                    (
                        "content-disposition",
                        format!("attachment; filename=\"download\"; filename*=UTF-8''{encoded}"),
                    ),
                    ("cache-control", "no-store".to_string()),
                    ("x-content-type-options", "nosniff".to_string()),
                ],
                bytes,
            )
                .into_response()
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
            record_backup(&state.backups, &target);
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
            if is_root(&root, &target) {
                return fail(400, "INVALID_PATH", "The project root cannot be changed");
            }
            let result = if target.is_dir() && !target.is_symlink() {
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
            // The new name is one path component: no separators, no `..`, nothing that leaves the parent.
            let mut parts = Path::new(&name).components();
            let single = matches!(
                (parts.next(), parts.next()),
                (Some(Component::Normal(_)), None)
            ) && !name.contains(['/', '\\']);
            let Some(source) = confine(&root, &relative).filter(|p| single && !is_root(&root, p))
            else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            let Some(destination) = source.parent().map(|d| d.join(&name)) else {
                return fail(400, "INVALID_PATH", "Invalid source path");
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
            if is_root(&root, &source) {
                return fail(400, "INVALID_PATH", "The project root cannot be changed");
            }
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
        ("search", "GET") => search_response(&state, &ctx, &uid, &query).await,
        ("reveal", "POST") => response(200, json!({ "ok": true, "revealed": false })),
        ("backup", "GET") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = query.get("path").cloned().unwrap_or_default();
            if relative.is_empty() {
                return fail(400, "VALIDATION_ERROR", "path query parameter is required");
            }
            let Some(target) = confine(&root, &relative) else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            let backup = state.backups.lock().unwrap().get(&target).cloned();
            let Some(original) = backup else {
                return fail(404, "NO_BACKUP", "No backup found for this file");
            };
            let current = std::fs::read_to_string(&target).unwrap_or_default();
            response(
                200,
                json!({
                    "path": relative,
                    "originalContent": original,
                    "currentContent": current,
                    "hasBackup": true,
                }),
            )
        }
        ("undo", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = js_text(body.get("path")).unwrap_or_default();
            if relative.is_empty() {
                return fail(400, "VALIDATION_ERROR", "path is required");
            }
            let Some(target) = confine(&root, &relative) else {
                return fail(400, "INVALID_PATH", "Path is outside the project root");
            };
            match restore_backup(&state.backups, &target) {
                Ok(true) => response(200, json!({ "ok": true, "path": relative })),
                Ok(false) => fail(404, "NO_BACKUP", "No backup found for this file"),
                Err(_) => fail(500, "UNDO_FAILED", "Failed to undo file change"),
            }
        }
        ("undo-all", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let paths: Vec<String> = body
                .get("paths")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            if paths.is_empty() {
                return fail(400, "VALIDATION_ERROR", "paths array is required");
            }
            let results: Vec<Value> = paths
                .iter()
                .map(|p| {
                    let restored = confine(&root, p)
                        .and_then(|t| restore_backup(&state.backups, &t).ok())
                        .unwrap_or(false);
                    json!({ "path": p, "restored": restored })
                })
                .collect();
            response(200, json!({ "ok": true, "results": results }))
        }
        ("apply-diff", "POST") => {
            let Some(root) = ctx.root.clone() else {
                return fail(404, "NO_PROJECT", "No project is open");
            };
            let relative = js_text(body.get("path")).unwrap_or_default();
            if relative.is_empty() {
                return fail(400, "VALIDATION_ERROR", "path is required");
            }
            let Some(target) = confine(&root, &relative) else {
                return fail(400, "VALIDATION_ERROR", "Path is outside the project root");
            };
            if let Some(content) = body.get("content").and_then(Value::as_str) {
                record_backup(&state.backups, &target);
                if let Some(parent) = target.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if std::fs::write(&target, content.as_bytes()).is_err() {
                    return fail(500, "APPLY_FAILED", "Failed to apply diff");
                }
            }
            state.backups.lock().unwrap().remove(&target);
            response(200, json!({ "ok": true, "path": relative }))
        }
        (_, _) => fail(405, "METHOD_NOT_ALLOWED", "Method not allowed"),
    }
}

/// Keeps the first pre-modification state of `target` (None when it did not exist).
fn record_backup(backups: &Backups, target: &Path) {
    let mut map = backups.lock().unwrap();
    if !map.contains_key(target) {
        map.insert(target.to_path_buf(), std::fs::read_to_string(target).ok());
    }
}

/// Restores `target` from its backup; Ok(false) when none exists.
fn restore_backup(backups: &Backups, target: &Path) -> std::io::Result<bool> {
    let Some(original) = backups.lock().unwrap().get(target).cloned() else {
        return Ok(false);
    };
    match original {
        Some(content) => std::fs::write(target, content)?,
        None => match std::fs::remove_file(target) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e),
            _ => {}
        },
    }
    backups.lock().unwrap().remove(target);
    Ok(true)
}

/// Starts the session's gateway-local filesystem surface for a path, following
/// the TS `doProjectOpen`: the surface replaces the session's running filesystem
/// surfaces, the panel state is recorded for the session, and the owning
/// project's UI state is refreshed. The caller holds the session's open lock.
async fn open_session_path(
    state: &ProjectRoutes,
    uid: &str,
    session_id: &str,
    project_path: &str,
    explicit_panel_open: Option<bool>,
) -> Response {
    let (lookup_id, owner_id) = (session_id.to_owned(), uid.to_owned());
    let context = state
        .auth
        .with_database(move |db| {
            let project_id = SessionService::new(db)
                .get(&lookup_id, Some(&owner_id))?
                .and_then(|session| session.project_id);
            let saved_open = match project_id.as_deref() {
                Some(project) => ProjectStateService::new(db)
                    .get(project, Some(&["project.ui".to_owned()]))?
                    .get("project.ui")
                    .and_then(|ui| ui.get("panel"))
                    .and_then(|panel| panel.get("open"))
                    .and_then(Value::as_bool),
                None => None,
            };
            Ok((project_id, saved_open))
        })
        .await;
    let (project_id, saved_open) = match context {
        Ok(context) => context,
        Err(error) => return auth::database_failure(&error),
    };
    // An explicit request wins, then the saved preference; the default is closed.
    let panel_open = explicit_panel_open.or(saved_open).unwrap_or(false);

    // The session's previous filesystem surfaces stop before the new one starts.
    for surface in state.surfaces.by_session(session_id) {
        if !matches!(surface.kind(), "filesystem" | "remote-filesystem")
            || surface.state() != SurfaceState::Running
        {
            continue;
        }
        let id = surface.id().to_owned();
        if state
            .surfaces
            .stop_surface_instance(&id, surface, Some("replaced".into()))
            .await
            .is_err()
        {
            return fail(
                500,
                "SURFACE_STOP_FAILED",
                "Failed to stop the previous filesystem surface",
            );
        }
    }

    let surface_id = format!("filesystem-{}", crate::db::identifiers::uuidv7());
    let mut input = SurfaceStartInput {
        session_id: session_id.to_owned(),
        project_root: project_path.to_owned(),
        node_id: None,
        properties: Map::new(),
    };
    input
        .properties
        .insert("panelOpen".into(), Value::Bool(panel_open));
    // The owner scopes every later lookup of this surface to its caller.
    input
        .properties
        .insert("userId".into(), Value::String(uid.to_owned()));
    if state
        .surfaces
        .start_surface("filesystem", &surface_id, input)
        .await
        .is_err()
    {
        return fail(
            500,
            "SURFACE_START_FAILED",
            "Failed to start filesystem surface",
        );
    }

    let panel_state = json!({
        "open": panel_open,
        "remotePath": project_path,
        "surfaceId": surface_id,
        "nodeId": "gateway",
    });
    let (lookup_id, owner_id) = (session_id.to_owned(), uid.to_owned());
    let (update_path, project_for_db) = (project_path.to_owned(), project_id.clone());
    let panel_for_db = panel_state;
    let persisted = state
        .auth
        .with_database(move |db| {
            if let Some(project) = project_for_db.as_deref() {
                // Best effort, as in TS: the surface is already running.
                let patch =
                    Map::from_iter([("projectPath".to_owned(), Value::String(update_path))]);
                let _ = SessionService::new(db).update(&lookup_id, &patch, Some(&owner_id));
                let _ = ProjectService::new(db).touch(project);
            }
            SessionStateService::new(db).set(
                &lookup_id,
                &Map::from_iter([("project.panel".to_owned(), panel_for_db.clone())]),
            )?;
            if let Some(project) = project_for_db.as_deref() {
                let store = ProjectStateService::new(db);
                let existing = store
                    .get(project, Some(&["project.ui".to_owned()]))?
                    .remove("project.ui");
                // Tabs, layout, terminal and preview survive an open; only the panel changes.
                let kept = |key: &str| {
                    existing
                        .as_ref()
                        .and_then(|ui| ui.get(key))
                        .cloned()
                        .unwrap_or(Value::Null)
                };
                let ui = json!({
                    "panel": panel_for_db,
                    "tabs": kept("tabs"),
                    "layout": kept("layout"),
                    "terminal": kept("terminal"),
                    "preview": kept("preview"),
                });
                store.set(project, &Map::from_iter([("project.ui".to_owned(), ui)]))?;
            }
            Ok(())
        })
        .await;
    if let Err(error) = persisted {
        return auth::database_failure(&error);
    }
    response(
        200,
        json!({
            "surfaceId": surface_id,
            "projectRoot": project_path,
            "nodeId": "gateway",
            "projectId": project_id,
            "panelOpen": panel_open,
        }),
    )
}

/// Root of a running, gateway-local filesystem surface that `uid` owns and whose
/// session `uid` still owns. Every other surface reads as missing, so foreign
/// surfaces cannot be probed by ID.
async fn owned_surface_root(state: &ProjectRoutes, uid: &str, surface_id: &str) -> Res<PathBuf> {
    let missing = || Box::new(fail(404, "NO_PROJECT", "No filesystem surface is running"));
    let Some((surface, owner)) = state.surfaces.surface_with_owner(surface_id) else {
        return Err(missing());
    };
    if owner.as_deref() != Some(uid)
        || surface.kind() != "filesystem"
        || surface.state() != SurfaceState::Running
    {
        return Err(missing());
    }
    let Some(session_id) = surface.session_id() else {
        return Err(missing());
    };
    let owner_id = uid.to_owned();
    match state
        .auth
        .with_database(move |db| {
            Ok(SessionService::new(db)
                .get(&session_id, Some(&owner_id))?
                .is_some())
        })
        .await
    {
        Ok(true) => {}
        Ok(false) => return Err(missing()),
        Err(error) => return Err(Box::new(auth::database_failure(&error))),
    }
    surface
        .snapshot()
        .ok()
        .and_then(|snapshot| {
            snapshot
                .metadata
                .get("projectRoot")
                .and_then(Value::as_str)
                .map(PathBuf::from)
        })
        .ok_or_else(missing)
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
    uid: &str,
    query: &HashMap<String, String>,
) -> Response {
    use crate::services::project_search::{self, Budgets, Cancellation, ProjectRoot};
    let options = match search_options(query) {
        Ok(options) => options,
        Err(message) => return fail(400, "VALIDATION_ERROR", message),
    };
    if let Some(surface_id) = query.get("surfaceId").filter(|id| !id.is_empty()) {
        return surface_search(state, uid, surface_id, options).await;
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
            project_search::search_project_auto(&root, &options, &Budgets::default(), &cancel)
        })
        .await;
    search_reply(work)
}

/// Gateway-local surfaces only: the binding re-checks owner, session, running
/// state and root at open and after the walk. Surfaces on other nodes need a
/// node transport host that production does not construct yet.
async fn surface_search(
    state: &ProjectRoutes,
    uid: &str,
    surface_id: &str,
    options: crate::services::project_search::SearchOptions,
) -> Response {
    use crate::services::project_search::{Budgets, Cancellation, Error, scoped::SearchTarget};
    let binding = match state
        .scoped
        .bind(uid, SearchTarget::Surface(surface_id.to_string()))
        .await
    {
        Ok(binding) => binding,
        Err(Error::Unsupported) => {
            return fail(501, "NOT_SUPPORTED", "Surface search is unavailable");
        }
        Err(_) => return fail(404, "SURFACE_NOT_FOUND", "Surface not found"),
    };
    if !binding.is_local() {
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
        .scoped
        .search_local(&binding, options, Budgets::default(), cancel)
        .await;
    search_reply(Ok(work))
}

fn search_reply(
    work: std::io::Result<
        crate::services::project_search::Result<crate::services::project_search::SearchResult>,
    >,
) -> Response {
    use crate::services::project_search::{Error, SearchResult};
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
    async fn authenticated_search_uses_relative_wire_paths() {
        let fixture = Fixture::new();
        std::fs::create_dir(fixture.0.join("src")).unwrap();
        std::fs::write(fixture.0.join("src/needle.rs"), "pub fn needle() {}\n").unwrap();
        std::fs::write(fixture.0.join("src/needle.unknown"), "needle\n").unwrap();
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
        assert!(
            content["matches"]
                .as_array()
                .unwrap()
                .iter()
                .any(|m| m["file"] == "src/needle.rs" && m["line"] == 1)
        );
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
        // An inherited root on another node refuses locally as NODE_OFFLINE, before search runs.
        let (status, body) = request(&state, &remote_child, "query=x").await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(body["error"], "NODE_OFFLINE", "{body}");
        assert_eq!(
            request(&state, &own, "query=x&surfaceId=arbitrary").await.0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            request(&state, &own, "query=x&limit=-1").await.0,
            StatusCode::BAD_REQUEST
        );
        state.auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn project_open_rejects_foreign_session_before_inspecting_path() {
        let fixture = Fixture::new();
        let (state, _, _, _) = setup(&fixture.0);
        let session_id = state
            .auth
            .with_database(|db| {
                Ok(crate::services::sessions::SessionService::new(db)
                    .create(crate::services::sessions::CreateSession {
                        user_id: Some("other".into()),
                        ..Default::default()
                    })?
                    .id)
            })
            .await
            .unwrap();
        let token = http_auth::sign_auth_token(
            &AuthUser {
                id: "owner".into(),
                username: "owner".into(),
            },
            "project-search-fixture-secret",
        )
        .unwrap();
        let request = Request::builder()
            .method("POST")
            .uri("/api/project/open")
            .header("authorization", format!("Bearer {token}"))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({"sessionId": session_id, "path": fixture.0.join("missing")}).to_string(),
            ))
            .unwrap();
        let result = dispatch(State(state.clone()), request).await;
        assert_eq!(result.status(), StatusCode::NOT_FOUND);
        let body = to_bytes(result.into_body(), 1024 * 1024).await.unwrap();
        let body: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(body["message"], "Session not found");
        state.auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn surface_search_serves_only_running_surfaces_owned_by_the_caller() {
        use crate::surfaces::registry::{SurfaceRegistry, SurfaceStartInput};
        let fixture = Fixture::new();
        let (state, own, _, remote_project) = setup(&fixture.0);
        std::fs::write(fixture.0.join("needle.txt"), "needle\n").unwrap();
        let registry = SurfaceRegistry::default();
        let state = state.with_surfaces(registry.clone());
        assert!(
            registry
                .registered_types()
                .iter()
                .any(|kind| kind == "filesystem")
        );
        let (owner_session, other_session) = state
            .auth
            .with_database(|db| {
                let sessions = crate::services::sessions::SessionService::new(db);
                let make = |user: &str| {
                    sessions
                        .create(crate::services::sessions::CreateSession {
                            user_id: Some(user.into()),
                            ..Default::default()
                        })
                        .unwrap()
                        .id
                };
                Ok((make("owner"), make("other")))
            })
            .await
            .unwrap();
        let root = fixture.0.to_string_lossy().into_owned();
        for (id, session, user) in [
            ("fs-own", owner_session, "owner"),
            ("fs-foreign", other_session, "other"),
        ] {
            let mut input = SurfaceStartInput {
                session_id: session,
                project_root: root.clone(),
                node_id: None,
                properties: Default::default(),
            };
            input.properties.insert("userId".into(), user.into());
            registry
                .start_surface("filesystem", id, input)
                .await
                .unwrap();
        }
        let (status, body) = request(&state, &own, "query=needle&surfaceId=fs-own").await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(!body["files"].as_array().unwrap().is_empty(), "{body}");
        let (status, body) =
            request(&state, &remote_project, "query=needle&surfaceId=fs-own").await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(!body["files"].as_array().unwrap().is_empty(), "{body}");
        assert_eq!(
            request(&state, &remote_project, "query=needle&surfaceId=fs-foreign")
                .await
                .0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            request(&state, &own, "query=needle&surfaceId=fs-foreign")
                .await
                .0,
            StatusCode::NOT_FOUND
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

#[cfg(test)]
mod project_open_lock_tests {
    use super::*;

    #[tokio::test]
    async fn cancelling_waiter_does_not_release_active_session_lock() {
        let locks = OpenLocks::default();
        let first = session_open_lock(&locks, "one");
        let guard = first.lock().await;
        let waiting = session_open_lock(&locks, "one");
        let (entered, ready) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            let _ = entered.send(());
            let _guard = waiting.lock().await;
        });
        ready.await.unwrap();
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        let next = session_open_lock(&locks, "one");
        assert!(next.try_lock().is_err());
        drop(guard);
        assert!(next.try_lock().is_ok());
    }

    #[tokio::test]
    async fn cancelling_active_open_releases_lock_for_waiter() {
        let locks = OpenLocks::default();
        let active = session_open_lock(&locks, "one");
        let waiting = session_open_lock(&locks, "one");
        let (entered, ready) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            let _guard = active.lock().await;
            let _ = entered.send(());
            std::future::pending::<()>().await;
        });
        ready.await.unwrap();
        assert!(waiting.try_lock().is_err());
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(waiting.try_lock().is_ok());
    }

    #[tokio::test]
    async fn cancelled_request_keeps_lock_until_blocking_validation_finishes() {
        let locks = OpenLocks::default();
        let active = session_open_lock(&locks, "one");
        let waiting = session_open_lock(&locks, "one");
        let lane =
            crate::runtime::blocking::BlockingLane::new(std::num::NonZeroU16::new(1).unwrap());
        let (entered, ready) = tokio::sync::oneshot::channel();
        let (release, resume) = std::sync::mpsc::channel();
        let task = tokio::spawn(async move {
            let guard = active.lock_owned().await;
            lane.run(move || {
                let _ = entered.send(());
                resume.recv().unwrap();
                guard
            })
            .await
            .unwrap()
        });
        ready.await.unwrap();
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(waiting.try_lock().is_err());
        release.send(()).unwrap();
        let _guard = tokio::time::timeout(std::time::Duration::from_secs(5), waiting.lock())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn session_open_locks_serialize_without_blocking_other_sessions() {
        let locks = OpenLocks::default();
        let first = session_open_lock(&locks, "one");
        let same = session_open_lock(&locks, "one");
        let other = session_open_lock(&locks, "two");
        let guard = first.lock().await;
        assert!(same.try_lock().is_err());
        assert!(other.try_lock().is_ok());
        drop(guard);
        assert!(same.try_lock().is_ok());
        drop(first);
        drop(same);
        drop(other);
        let _new = session_open_lock(&locks, "three");
        assert_eq!(locks.lock().unwrap().len(), 1);
    }
}
