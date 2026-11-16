//! Port of `packages/gateway/src/routes/projects.ts`.
//!
//! Project CRUD, hierarchy, repository binding, archiving, project-scoped
//! sessions and project state. All persistence goes through the native
//! `ProjectService` / `SessionService` / `UserService` / `ProjectStateService`.

use std::collections::HashMap;

use axum::{
    Json,
    extract::{Request, State},
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

use crate::{
    routes::auth::{self, AuthState, response},
    services::{
        json_state::ProjectStateService,
        projects::{CreateProject, MoveRejection, ProjectError, ProjectService},
    },
};

type Res<T> = Result<T, Box<Response>>;

/// `projects.ts` error bodies are `{ error: CODE, details: MESSAGE }`.
fn fail(status: u16, code: &str, details: &str) -> Response {
    let code_status = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    (
        code_status,
        Json(json!({ "error": code, "details": details })),
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

// Apply the Node project response fields after the project has been owner-scoped.
// Remote filesystem probes are not yet wired into this router and fail closed.
fn project_status(db: &rusqlite::Connection, project: &mut Value) -> rusqlite::Result<()> {
    let Some(id) = project.get("id").and_then(Value::as_str) else {
        return Ok(());
    };
    let state = ProjectStateService::new(db).get(id, Some(&["project.ui".to_owned()]))?;
    let active = state
        .get("project.ui")
        .and_then(|ui| ui.get("panel"))
        .and_then(|panel| panel.get("open"))
        == Some(&Value::Bool(true));
    let root = project
        .get("rootPath")
        .and_then(Value::as_str)
        .map(crate::text::js_trim)
        .filter(|root| !root.is_empty());
    let node = project
        .get("nodeId")
        .and_then(Value::as_str)
        .map(crate::text::js_trim)
        .filter(|node| !node.is_empty())
        .unwrap_or("gateway");
    let status = root.map(|root| {
        if node != "gateway" {
            "unreachable"
        } else if std::path::Path::new(root).exists() {
            "available"
        } else {
            "missing"
        }
    });
    if let Some(object) = project.as_object_mut() {
        object.insert("editorModeActive".into(), json!(active));
        object.insert("rootPathStatus".into(), json!(status));
    }
    Ok(())
}

fn project_list_status(db: &rusqlite::Connection, body: &mut Value) -> rusqlite::Result<()> {
    if let Some(projects) = body.get_mut("projects").and_then(Value::as_array_mut) {
        for project in projects {
            project_status(db, project)?;
        }
    }
    Ok(())
}

/// JavaScript `String(value)` coercion used throughout the TS routes.
fn js_text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn requested_repository_id(body: &Value) -> Option<String> {
    body.get("repoId")
        .and_then(Value::as_str)
        .map(crate::text::js_trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
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

fn query_limit(uri: &Uri) -> Option<f64> {
    // Fastify represents repeated parameters as an array, which the Node
    // route rejects because parseListLimit accepts only strings.
    let mut limits =
        url::form_urlencoded::parse(uri.query()?.as_bytes()).filter(|(key, _)| key == "limit");
    let value = limits.next()?.1;
    if limits.next().is_some() {
        return None;
    }
    // Number.parseInt(value, 10) consumes a signed decimal prefix after JS
    // whitespace, then the route clamps positive results to 100.
    let value = crate::text::js_trim(&value);
    let value = value.strip_prefix('+').unwrap_or(value);
    if value.starts_with('-') {
        return None;
    }
    let count = value.bytes().take_while(u8::is_ascii_digit).count();
    if count == 0 {
        return None;
    }
    let parsed = value[..count].parse::<f64>().ok()?;
    (parsed.is_finite() && parsed >= 1.0).then_some(parsed.min(100.0))
}

/// Port of `assignRepositoryToProject` (services/project-repositories.ts) and
/// the `sendAssignmentError` status mapping.
fn assign_repository(
    db: &rusqlite::Connection,
    project_id: &str,
    user_id: &str,
    requested: Option<&str>,
    events: &Option<crate::routes::repositories::RepositoryEventSink>,
    project_events: &Option<crate::routes::repositories::RepositoryEventSink>,
) -> Response {
    // Ownership checks, reconciliation and assignment are one decision: do not
    // leave a reconciled repository behind if assignment fails or its owner changes.
    let tx =
        match rusqlite::Transaction::new_unchecked(db, rusqlite::TransactionBehavior::Immediate) {
            Ok(tx) => tx,
            Err(error) => return *db_err(error),
        };
    let pending = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let collector = pending.clone();
    let buffered: Option<crate::routes::repositories::RepositoryEventSink> =
        events.as_ref().map(|_| {
            std::sync::Arc::new(move |owner: &str, kind: &str, value: Value| {
                collector.lock().unwrap_or_else(|e| e.into_inner()).push((
                    owner.to_owned(),
                    kind.to_owned(),
                    value,
                ));
            }) as crate::routes::repositories::RepositoryEventSink
        });
    let project_result = std::cell::RefCell::new(None);
    let result = assign_repository_in_transaction(
        &tx,
        project_id,
        user_id,
        requested,
        &buffered,
        &project_result,
    );
    if !result.status().is_success() {
        return result;
    }
    if let Err(error) = tx.commit() {
        return *db_err(error);
    }
    if let Some(events) = events {
        for (owner, kind, value) in pending.lock().unwrap_or_else(|e| e.into_inner()).drain(..) {
            events(&owner, &kind, value);
        }
    }
    if let (Some(events), Some(project)) = (project_events, project_result.into_inner()) {
        events(user_id, "project.updated", json!({"project": project}));
    }
    result
}

fn assign_repository_in_transaction(
    db: &rusqlite::Connection,
    project_id: &str,
    user_id: &str,
    requested: Option<&str>,
    events: &Option<crate::routes::repositories::RepositoryEventSink>,
    project_result: &std::cell::RefCell<Option<Value>>,
) -> Response {
    use crate::services::repositories::RepositoryService;
    let projects = ProjectService::new(db);
    let repos = RepositoryService::new(db);
    let project = match projects.get(project_id, Some(user_id)) {
        Ok(Some(project)) => project,
        Ok(None) => return fail(404, "PROJECT_NOT_FOUND", "Project not found."),
        Err(error) => return *db_err(error),
    };
    let existing_id = project
        .metadata
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
        .and_then(|metadata| {
            metadata
                .get("repositoryId")
                .and_then(Value::as_str)
                .map(String::from)
        });
    let outcome = |project: &crate::services::projects::ProjectRecord,
                   repo: &crate::services::repositories::RepositoryRecord,
                   assigned: bool,
                   created: bool| {
        let mut project = json!(project);
        if let Err(error) = project_status(db, &mut project) {
            return *db_err(error);
        }
        *project_result.borrow_mut() = Some(project.clone());
        response(
            200,
            json!({
                "project": project, "repo": repo,
                "assigned": assigned, "skipped": !assigned, "created": created,
            }),
        )
    };
    let owned = |repo: &crate::services::repositories::RepositoryRecord| {
        repo.user_id.as_deref() == Some(user_id)
    };
    let reconcile = |repo: crate::services::repositories::RepositoryRecord| -> rusqlite::Result<_> {
        let root = project
            .root_path
            .as_deref()
            .map(crate::text::js_trim)
            .unwrap_or_default();
        let git = std::path::Path::new(root).join(".git");
        if project.node_id.as_deref() == Some("gateway")
            && repo.device_id.is_some()
            && repo.local_path == root
            && !root.is_empty()
            && (git.is_file() || git.is_dir())
        {
            let updated = repos
                .update(
                    &repo.id,
                    crate::services::repositories::RepositoryPatch {
                        device_id: crate::services::users::Patch::Set(None),
                        ..Default::default()
                    },
                )?
                .unwrap_or(repo);
            crate::routes::repositories::publish_repository(
                events,
                user_id,
                "repo.updated",
                json!({"repo": updated}),
            );
            Ok(updated)
        } else {
            Ok(repo)
        }
    };
    if let Some(repo_id) = requested {
        let repo = match repos.get(repo_id) {
            Ok(Some(repo)) if owned(&repo) => repo,
            Ok(_) => return fail(404, "REPOSITORY_NOT_FOUND", "Repository not found."),
            Err(error) => return *db_err(error),
        };
        let repo = match reconcile(repo) {
            Ok(repo) => repo,
            Err(error) => return *db_err(error),
        };
        if existing_id.as_deref() == Some(repo.id.as_str()) {
            return outcome(&project, &repo, false, false);
        }
        return match projects.assign_repository_in_transaction(&project.id, &repo.id, Some(user_id))
        {
            Ok(Some(updated)) => {
                crate::routes::repositories::publish_repository(
                    events,
                    user_id,
                    "repo.updated",
                    json!({"repo": repo}),
                );
                outcome(&updated, &repo, true, false)
            }
            Ok(None) => fail(404, "PROJECT_NOT_FOUND", "Project not found."),
            Err(error) => *db_err(error),
        };
    }
    let root = project
        .root_path
        .as_deref()
        .map(crate::text::js_trim)
        .unwrap_or_default()
        .to_string();
    if root.is_empty() {
        return fail(400, "PROJECT_HAS_NO_ROOT", "Project has no folder path.");
    }
    if let Some(id) = &existing_id {
        match repos.get(id) {
            Ok(Some(repo)) if owned(&repo) => {
                let repo = match reconcile(repo) {
                    Ok(repo) => repo,
                    Err(error) => return *db_err(error),
                };
                return outcome(&project, &repo, false, false);
            }
            Ok(_) => {}
            Err(error) => return *db_err(error),
        }
    }
    // A remote node's path is not authority to inspect the gateway filesystem.
    // Discovery on that node needs an explicit remote execution boundary.
    if project
        .node_id
        .as_deref()
        .is_some_and(|node| node != "gateway")
    {
        return fail(
            503,
            "SURFACE_UNAVAILABLE",
            "Repository discovery on remote nodes is not available in the native gateway",
        );
    }
    let git_metadata = std::path::Path::new(&root).join(".git");
    if !(git_metadata.is_file() || git_metadata.is_dir()) {
        return fail(
            400,
            "PROJECT_NOT_GIT",
            "Project folder does not contain .git.",
        );
    }
    match repos.find_by_path(&root, Some(user_id)) {
        Ok(Some(repo)) if owned(&repo) => {
            let repo = match reconcile(repo) {
                Ok(repo) => repo,
                Err(error) => return *db_err(error),
            };
            return match projects.assign_repository_in_transaction(
                &project.id,
                &repo.id,
                Some(user_id),
            ) {
                Ok(Some(updated)) => {
                    crate::routes::repositories::publish_repository(
                        events,
                        user_id,
                        "repo.updated",
                        json!({"repo": repo}),
                    );
                    outcome(&updated, &repo, true, false)
                }
                Ok(None) => fail(404, "PROJECT_NOT_FOUND", "Project not found."),
                Err(error) => *db_err(error),
            };
        }
        Ok(_) => {}
        Err(error) => return *db_err(error),
    }
    fail(
        503,
        "SURFACE_UNAVAILABLE",
        "Repository discovery is not available in the native gateway",
    )
}

/// Extracts `{id}` from `/api/projects/{id}<suffix>`.
fn mid(path: &str, prefix: &str, suffix: &str) -> Option<String> {
    let rest = path.strip_prefix(prefix)?;
    let rest = rest.strip_suffix(suffix)?;
    let id = rest.trim_matches('/');
    (!id.is_empty() && !id.contains('/')).then(|| id.to_string())
}

#[derive(Clone)]
pub struct ProjectCollectionRoutes {
    pub auth: AuthState,
    pub events: Option<crate::routes::repositories::RepositoryEventSink>,
    pub project_events: Option<crate::routes::repositories::RepositoryEventSink>,
}

impl ProjectCollectionRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            events: None,
            project_events: None,
        }
    }

    pub fn router(self) -> axum::Router {
        axum::Router::new()
            .route("/api/projects", axum::routing::any(any_handler))
            .route("/api/projects/{*rest}", axum::routing::any(any_handler))
            .with_state(self)
    }
}

async fn any_handler(State(state): State<ProjectCollectionRoutes>, request: Request) -> Response {
    let fut = dispatch(State(state), request);
    match tokio::time::timeout(std::time::Duration::from_secs(30), fut).await {
        Ok(response) => response,
        Err(_) => fail(504, "TIMEOUT", "Request timed out"),
    }
}

async fn dispatch(State(state): State<ProjectCollectionRoutes>, request: Request) -> Response {
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

    // ---- static project-collection routes -------------------------------
    // ---- static project-collection routes -------------------------------
    if path == "/api/projects" {
        if method == axum::http::Method::POST {
            let body = match auth::parse_body(request.into_body(), &headers).await {
                Ok(body) => body,
                Err(response) => return *response,
            };
            let root = body
                .get("rootPath")
                .and_then(Value::as_str)
                .filter(|value| !crate::text::js_trim(value).is_empty())
                .map(str::to_owned);
            let exclusive = body.get("exclusiveRoot") == Some(&Value::Bool(true));
            let parent_id = body
                .get("parentId")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .map(str::to_owned);
            let mut create = create_from(&body, &uid);
            create.root_path = root.clone();
            create.node_id = Some(
                body.get("nodeId")
                    .and_then(Value::as_str)
                    .unwrap_or("gateway")
                    .to_owned(),
            );
            create.parent_id = None;
            let user_id = uid.clone();
            let project_events = state.project_events.clone();
            return run(&state.auth, move |db| {
                let transaction = rusqlite::Transaction::new_unchecked(
                    db,
                    rusqlite::TransactionBehavior::Immediate,
                )
                .map_err(db_err)?;
                let service = ProjectService::new(&transaction);
                if let Some(root) = root.as_deref().filter(|_| exclusive) {
                    let node = create
                        .node_id
                        .clone()
                        .unwrap_or_else(|| "gateway".to_string());
                    match service.find_by_root(root, &node, Some(&user_id)) {
                        Ok(Some(existing)) => {
                            let title = existing.title.clone().unwrap_or_else(|| root.to_string());
                            return Res::Ok(fail(
                                409,
                                "ROOT_PATH_IN_USE",
                                &format!("\"{title}\" already uses that folder."),
                            ));
                        }
                        Ok(None) => {}
                        Err(error) => return Err(db_err(error)),
                    }
                }
                if let Some(parent) = parent_id.as_deref()
                    && let Some(rejection) = service
                        .validate_new_parent(parent, Some(&user_id))
                        .map_err(db_err)?
                {
                    let code = match rejection {
                        MoveRejection::ParentNotFound => "PARENT_NOT_FOUND",
                        MoveRejection::Cycle => "CYCLE",
                        MoveRejection::TooDeep => "TOO_DEEP",
                    };
                    return Res::Ok(fail(
                        400,
                        code,
                        &format!("Cannot create under parent: {code}"),
                    ));
                }
                let record = if root.is_some() {
                    service.get_or_create_for_root(create)
                } else {
                    service.create(create)
                }
                .map_err(db_err)?;
                let record = if let Some(parent) = parent_id
                    .as_deref()
                    .filter(|parent| record.parent_id.as_deref() != Some(*parent))
                {
                    match service.move_project(&record.id, Some(parent), Some(&user_id)) {
                        Ok(Some(moved)) => moved,
                        Ok(None) => {
                            return Err(Box::new(fail(
                                500,
                                "INTERNAL_ERROR",
                                "Database operation failed",
                            )));
                        }
                        Err(ProjectError::Move(rejection)) => {
                            return Res::Ok(move_rejection(rejection));
                        }
                        Err(ProjectError::Database(error)) => return Err(db_err(error)),
                    }
                } else {
                    record
                };
                let mut project = json!(record);
                project_status(&transaction, &mut project).map_err(db_err)?;
                transaction.commit().map_err(db_err)?;
                if let Some(events) = project_events {
                    events(&user_id, "project.created", json!({"project": project}));
                }
                Res::Ok(response(201, project))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        if method == axum::http::Method::GET {
            // TS defaults an absent status to "active"; any other value is
            // passed through to the query unchanged.
            let status = query
                .get("status")
                .cloned()
                .unwrap_or_else(|| "active".to_string());
            let limit = query_limit(&uri);
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let service = ProjectService::new(db);
                let mut body = service
                    .list_with_sessions(Some(&user_id), &status, limit)
                    .map_err(db_err)?;
                project_list_status(db, &mut body).map_err(db_err)?;
                Res::Ok(response(200, body))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    if path == "/api/projects/search" && method == axum::http::Method::GET {
        // TS reads `q` (not `search`) and trims it; the service returns the
        // empty `{projects, personalSessions}` shape for a blank needle.
        let needle = query
            .get("q")
            .map(|value| value.trim().to_string())
            .unwrap_or_default();
        let user_id = uid.clone();
        return run(&state.auth, move |db| {
            let service = ProjectService::new(db);
            let mut body = service
                .search_with_sessions(&user_id, &needle)
                .map_err(db_err)?;
            project_list_status(db, &mut body).map_err(db_err)?;
            Res::Ok(response(200, body))
        })
        .await
        .unwrap_or_else(|response| *response);
    }

    if path == "/api/projects/last-active" && method == axum::http::Method::GET {
        let user_id = uid.clone();
        return run(&state.auth, move |db| {
            let projects = ProjectService::new(db);
            let sessions = crate::services::sessions::SessionService::new(db);
            let users = crate::services::users::UserService::new(db);
            let (project_id, session_id) = users.get_last_selection(&user_id).map_err(db_err)?;
            if let Some(session_id) = session_id.as_deref() {
                let session = sessions.get(session_id, Some(&user_id)).map_err(db_err)?;
                if let Some(session) = session {
                    let status = session.status.clone().unwrap_or_default();
                    if status == "active" {
                        let project = match session.project_id.as_deref() {
                            Some(project_id) => {
                                projects.get(project_id, Some(&user_id)).map_err(db_err)?
                            }
                            None => None,
                        };
                        return Res::Ok(response(
                            200,
                            json!({"project": project, "session": session}),
                        ));
                    }
                }
            }
            if let Some(project_id) = project_id.as_deref() {
                let project = projects.get(project_id, Some(&user_id)).map_err(db_err)?;
                if let Some(project) = project {
                    let rows = sessions
                        .list(crate::services::sessions::SessionFilter {
                            status: Some("active"),
                            user_id: Some(&user_id),
                            project_id: Some(project_id),
                            personal_only: false,
                            limit: Some(1.0),
                        })
                        .map_err(db_err)?;
                    let session = rows.into_iter().next();
                    return Res::Ok(response(
                        200,
                        json!({"project": project, "session": session}),
                    ));
                }
            }
            let session = sessions.last_active(Some(&user_id)).map_err(db_err)?;
            let project = match session.as_ref().and_then(|row| row.project_id.as_deref()) {
                Some(project_id) => projects.get(project_id, Some(&user_id)).map_err(db_err)?,
                None => None,
            };
            Res::Ok(response(
                200,
                json!({"project": project, "session": session}),
            ))
        })
        .await
        .unwrap_or_else(|response| *response);
    }

    if path == "/api/projects/select" && method == axum::http::Method::POST {
        let body = match auth::parse_body(request.into_body(), &headers).await {
            Ok(body) => body,
            Err(response) => return *response,
        };
        let project_id = js_text(body.get("projectId")).filter(|value| !value.is_empty());
        let session_id = js_text(body.get("sessionId")).filter(|value| !value.is_empty());
        let user_id = uid.clone();
        return run(&state.auth, move |db| {
            let projects = ProjectService::new(db);
            if let Some(project_id) = project_id.as_deref() {
                match projects.get(project_id, Some(&user_id)) {
                    Ok(Some(_)) => {}
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                }
            }
            let users = crate::services::users::UserService::new(db);
            users
                .set_last_selection(&user_id, project_id.as_deref(), session_id.as_deref())
                .map_err(db_err)?;
            Res::Ok(response(200, json!({"ok": true})))
        })
        .await
        .unwrap_or_else(|response| *response);
    }

    if path == "/api/projects/archived" {
        if method == axum::http::Method::GET {
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let service = ProjectService::new(db);
                let projects = service
                    .list(Some("archived"), Some(&user_id), None)
                    .map_err(db_err)?;
                Res::Ok(response(200, json!({"projects": projects})))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        if method == axum::http::Method::DELETE {
            let user_id = uid.clone();
            let project_events = state.project_events.clone();
            return run(&state.auth, move |db| {
                let tx = rusqlite::Transaction::new_unchecked(
                    db,
                    rusqlite::TransactionBehavior::Immediate,
                )
                .map_err(db_err)?;
                let projects = ProjectService::new(&tx);
                let sessions = crate::services::sessions::SessionService::new(&tx);
                let archived = projects
                    .list(Some("archived"), Some(&user_id), None)
                    .map_err(db_err)?;
                for project in &archived {
                    sessions
                        .project_status(&project.id, "delete", Some(&user_id))
                        .map_err(db_err)?;
                }
                let removed = projects.delete_archived(&user_id).map_err(db_err)?;
                tx.commit().map_err(db_err)?;
                if let Some(events) = project_events {
                    for project in archived {
                        events(
                            &user_id,
                            "project.deleted",
                            json!({"projectId": project.id, "permanent": true}),
                        );
                    }
                }
                Res::Ok(response(200, json!({"ok": true, "removed": removed})))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    // ---- per-project routes ---------------------------------------------
    if let Some(id) = mid(&path, "/api/projects/", "/restore") {
        if method != axum::http::Method::POST {
            return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        let user_id = uid.clone();
        let project_events = state.project_events.clone();
        return run(&state.auth, move |db| {
            let tx =
                rusqlite::Transaction::new_unchecked(db, rusqlite::TransactionBehavior::Immediate)
                    .map_err(db_err)?;
            let projects = ProjectService::new(&tx);
            let sessions = crate::services::sessions::SessionService::new(&tx);
            match projects.get(&id, Some(&user_id)) {
                Ok(Some(project)) if project.status.as_deref() != Some("archived") => {
                    return Res::Ok(fail(400, "BAD_REQUEST", "Project is not archived"));
                }
                Ok(Some(_)) => {}
                Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                Err(error) => return Err(db_err(error)),
            }
            projects
                .set_status(&id, "active", Some(&user_id))
                .map_err(db_err)?;
            sessions
                .project_status(&id, "restore", Some(&user_id))
                .map_err(db_err)?;
            let restored = projects.get(&id, Some(&user_id)).map_err(db_err)?;
            let Some(project) = restored else {
                return Res::Ok(fail(404, "NOT_FOUND", "Project not found"));
            };
            let mut project = json!(project);
            project_status(&tx, &mut project).map_err(db_err)?;
            tx.commit().map_err(db_err)?;
            if let Some(events) = project_events {
                events(&user_id, "project.restored", json!({"project": project}));
            }
            Res::Ok(response(200, project))
        })
        .await
        .unwrap_or_else(|response| *response);
    }

    if let Some(id) = mid(&path, "/api/projects/", "/sessions") {
        if method == axum::http::Method::GET {
            let user_id = uid.clone();
            let status = request
                .uri()
                .query()
                .and_then(|query| {
                    query.split('&').find_map(|pair| {
                        pair.strip_prefix("status=").map(|value| {
                            percent_encoding::percent_decode_str(value)
                                .decode_utf8_lossy()
                                .into_owned()
                        })
                    })
                })
                .unwrap_or_else(|| "active".to_owned());
            return run(&state.auth, move |db| {
                match ProjectService::new(db).get(&id, Some(&user_id)) {
                    Ok(Some(_)) => {}
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                }
                let sessions = crate::services::sessions::SessionService::new(db);
                let rows = sessions
                    .list(crate::services::sessions::SessionFilter {
                        status: Some(&status),
                        user_id: Some(&user_id),
                        project_id: Some(&id),
                        personal_only: false,
                        limit: None,
                    })
                    .map_err(db_err)?;
                Res::Ok(response(200, json!({"sessions": rows})))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        if method == axum::http::Method::POST {
            let body = match auth::parse_body(request.into_body(), &headers).await {
                Ok(body) => body,
                Err(response) => return *response,
            };
            let name = js_text(body.get("name")).filter(|value| !value.is_empty());
            let metadata = match body.get("metadata") {
                Some(Value::Object(map)) => Some(map.clone()),
                _ => None,
            };
            let user_id = uid.clone();
            let project_events = state.project_events.clone();
            return run(&state.auth, move |db| {
                let tx = rusqlite::Transaction::new_unchecked(
                    db,
                    rusqlite::TransactionBehavior::Immediate,
                )
                .map_err(db_err)?;
                // The session inherits the owned project's root, never a client path.
                let projects = ProjectService::new(&tx);
                let project_path = match projects.get(&id, Some(&user_id)) {
                    Ok(Some(project)) => project.root_path,
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                };
                let sessions = crate::services::sessions::SessionService::new(&tx);
                let record = sessions
                    .create(crate::services::sessions::CreateSession {
                        user_id: Some(user_id.clone()),
                        project_id: Some(id.clone()),
                        name,
                        project_path,
                        metadata,
                    })
                    .map_err(db_err)?;
                projects.touch(&id).map_err(db_err)?;
                let session = json!(record);
                tx.commit().map_err(db_err)?;
                if let Some(events) = project_events {
                    events(
                        &user_id,
                        "chat.created",
                        json!({"projectId": id, "session": session}),
                    );
                }
                Res::Ok(response(201, session))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    if let Some(id) = mid(&path, "/api/projects/", "/state") {
        if method == axum::http::Method::GET {
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let projects = ProjectService::new(db);
                match projects.get(&id, Some(&user_id)) {
                    Ok(Some(_)) => {}
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                }
                let state = ProjectStateService::new(db)
                    .get(&id, None)
                    .map_err(db_err)?;
                Res::Ok(response(200, Value::Object(state)))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        if method == axum::http::Method::PATCH {
            let body = match auth::parse_body(request.into_body(), &headers).await {
                Ok(body) => body,
                Err(response) => return *response,
            };
            let entries = match body {
                Value::Object(map) => map,
                _ => return fail(400, "VALIDATION_ERROR", "Body must be a JSON object"),
            };
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let projects = ProjectService::new(db);
                match projects.get(&id, Some(&user_id)) {
                    Ok(Some(_)) => {}
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                }
                ProjectStateService::new(db)
                    .set(&id, &entries)
                    .map_err(db_err)?;
                Res::Ok(response(200, json!({"ok": true})))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    if let Some(id) = mid(&path, "/api/projects/", "/subtree") {
        if method != axum::http::Method::GET {
            return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        let user_id = uid.clone();
        return run(&state.auth, move |db| {
            let service = ProjectService::new(db);
            match service.get(&id, Some(&user_id)) {
                Ok(Some(_)) => {}
                Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                Err(error) => return Err(db_err(error)),
            }
            let descendant_ids = service
                .list_descendant_ids(&id, Some(&user_id))
                .map_err(db_err)?;
            let descendant_count = descendant_ids.len();
            let session_count = service
                .count_sessions_in_subtree(&id, Some(&user_id))
                .map_err(db_err)?;
            Res::Ok(response(
                200,
                json!({
                    "projectId": id,
                    "descendantIds": descendant_ids,
                    "descendantCount": descendant_count,
                    "sessionCount": session_count,
                }),
            ))
        })
        .await
        .unwrap_or_else(|response| *response);
    }

    if let Some(id) = mid(&path, "/api/projects/", "/move") {
        if method != axum::http::Method::POST {
            return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        let body = match auth::parse_body(request.into_body(), &headers).await {
            Ok(body) => body,
            Err(response) => return *response,
        };
        let parent_id = body
            .get("parentId")
            .and_then(Value::as_str)
            .map(crate::text::js_trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
        let user_id = uid.clone();
        let project_events = state.project_events.clone();
        return run(&state.auth, move |db| {
            let tx =
                rusqlite::Transaction::new_unchecked(db, rusqlite::TransactionBehavior::Immediate)
                    .map_err(db_err)?;
            let service = ProjectService::new(&tx);
            match service.get(&id, Some(&user_id)) {
                Ok(Some(_)) => {}
                Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                Err(error) => return Err(db_err(error)),
            }
            match service.move_project(&id, parent_id.as_deref(), Some(&user_id)) {
                Ok(Some(project)) => {
                    let mut project = json!(project);
                    project_status(&tx, &mut project).map_err(db_err)?;
                    tx.commit().map_err(db_err)?;
                    if let Some(events) = project_events {
                        events(&user_id, "project.updated", json!({"project": project}));
                    }
                    Res::Ok(response(200, project))
                }
                Ok(None) => Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                Err(ProjectError::Move(rejection)) => Res::Ok(move_rejection(rejection)),
                Err(ProjectError::Database(error)) => Err(db_err(error)),
            }
        })
        .await
        .unwrap_or_else(|response| *response);
    }

    if let Some(id) = mid(&path, "/api/projects/", "/repository") {
        if method != axum::http::Method::POST {
            return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        let body = match auth::parse_body(request.into_body(), &headers).await {
            Ok(body) => body,
            Err(response) => return *response,
        };
        let requested = requested_repository_id(&body);
        let user_id = uid.clone();
        let events = state.events.clone();
        let project_events = state.project_events.clone();
        return run(&state.auth, move |db| {
            Res::Ok(assign_repository(
                db,
                &id,
                &user_id,
                requested.as_deref(),
                &events,
                &project_events,
            ))
        })
        .await
        .unwrap_or_else(|response| *response);
    }

    if let Some(id) = mid(&path, "/api/projects/", "") {
        if method == axum::http::Method::GET {
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let projects = ProjectService::new(db);
                let sessions = crate::services::sessions::SessionService::new(db);
                let project = match projects.get(&id, Some(&user_id)) {
                    Ok(Some(project)) => project,
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                };
                let rows = sessions
                    .list(crate::services::sessions::SessionFilter {
                        status: Some("active"),
                        user_id: Some(&user_id),
                        project_id: Some(&id),
                        personal_only: false,
                        limit: None,
                    })
                    .map_err(db_err)?;
                let mut value = json!(project);
                if let Value::Object(map) = &mut value {
                    map.insert("sessions".to_string(), json!(rows));
                }
                project_status(db, &mut value).map_err(db_err)?;
                Res::Ok(response(200, value))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        if method == axum::http::Method::PATCH {
            let body = match auth::parse_body(request.into_body(), &headers).await {
                Ok(body) => body,
                Err(response) => return *response,
            };
            let user_id = uid.clone();
            let project_events = state.project_events.clone();
            return run(&state.auth, move |db| {
                // Keep authorization, root changes and repository metadata in one
                // transaction so a failed metadata update cannot leave stale links.
                let tx = rusqlite::Transaction::new_unchecked(
                    db,
                    rusqlite::TransactionBehavior::Immediate,
                )
                .map_err(db_err)?;
                let service = ProjectService::new(&tx);
                let current = match service.get(&id, Some(&user_id)) {
                    Ok(Some(project)) => project,
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                };
                let mut fields = serde_json::Map::new();
                if let Some(title) = body.get("title").and_then(Value::as_str) {
                    fields.insert("title".to_string(), json!(title));
                }
                // A null (or blank) rootPath clears the assignment.
                let mut cleared_root = false;
                match body.get("rootPath") {
                    None => {}
                    Some(Value::Null) => {
                        fields.insert("rootPath".to_string(), Value::Null);
                        cleared_root = true;
                    }
                    Some(value) => {
                        let text = js_text(Some(value)).unwrap_or_default();
                        if text.trim().is_empty() {
                            fields.insert("rootPath".to_string(), Value::Null);
                            cleared_root = true;
                        } else {
                            fields.insert("rootPath".to_string(), json!(text));
                        }
                    }
                }
                if let Some(node) = body.get("nodeId").and_then(Value::as_str) {
                    fields.insert("nodeId".to_string(), json!(node));
                }
                for key in ["instructions", "description", "color"] {
                    if let Some(value) = body.get(key) {
                        if value.is_null() {
                            fields.insert(key.to_string(), Value::Null);
                        } else if let Some(text) = js_text(Some(value)) {
                            fields.insert(key.to_string(), json!(text));
                        }
                    }
                }
                if let Some(Value::Object(metadata)) = body.get("metadata") {
                    fields.insert("metadata".to_string(), Value::Object(metadata.clone()));
                }
                if !cleared_root && let Some(root) = fields.get("rootPath").and_then(Value::as_str)
                {
                    let node = fields
                        .get("nodeId")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .or_else(|| current.node_id.clone())
                        .unwrap_or_else(|| "gateway".to_string());
                    match service.find_by_root(root, &node, Some(&user_id)) {
                        Ok(Some(existing)) if existing.id != id => {
                            let title = existing.title.clone().unwrap_or_else(|| root.to_string());
                            return Res::Ok(fail(
                                409,
                                "ROOT_PATH_IN_USE",
                                &format!("\"{title}\" already uses that folder."),
                            ));
                        }
                        Ok(_) => {}
                        Err(error) => return Err(db_err(error)),
                    }
                }
                if !fields.is_empty() {
                    service
                        .update(&id, &fields, Some(&user_id))
                        .map_err(db_err)?;
                    if cleared_root {
                        service
                            .clear_repository(&id, Some(&user_id))
                            .map_err(db_err)?;
                    }
                }
                let updated = match service.get(&id, Some(&user_id)) {
                    Ok(Some(updated)) => updated,
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                };
                let mut project = json!(updated);
                project_status(&tx, &mut project).map_err(db_err)?;
                tx.commit().map_err(db_err)?;
                if let Some(events) = project_events {
                    events(&user_id, "project.updated", json!({"project": project}));
                }
                Res::Ok(response(200, project))
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        if method == axum::http::Method::DELETE {
            let user_id = uid.clone();
            let project_events = state.project_events.clone();
            return run(&state.auth, move |db| {
                let tx = rusqlite::Transaction::new_unchecked(
                    db,
                    rusqlite::TransactionBehavior::Immediate,
                )
                .map_err(db_err)?;
                let projects = ProjectService::new(&tx);
                let sessions = crate::services::sessions::SessionService::new(&tx);
                match projects.get(&id, Some(&user_id)) {
                    Ok(Some(_)) => {}
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                }
                sessions
                    .project_status(&id, "archive", Some(&user_id))
                    .map_err(db_err)?;
                projects.archive(&id, Some(&user_id)).map_err(db_err)?;
                tx.commit().map_err(db_err)?;
                if let Some(events) = project_events {
                    events(&user_id, "project.deleted", json!({"projectId": id}));
                }
                Res::Ok(StatusCode::NO_CONTENT.into_response())
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }

    fail(404, "NOT_FOUND", "Not found")
}

/// TS `POST /api/projects` body -> `CreateProject`.
fn create_from(body: &Value, user_id: &str) -> CreateProject {
    CreateProject {
        user_id: Some(user_id.to_string()),
        title: js_text(body.get("title")).filter(|value| !value.is_empty()),
        root_path: js_text(body.get("rootPath")).filter(|value| !value.trim().is_empty()),
        node_id: js_text(body.get("nodeId")).filter(|value| !value.is_empty()),
        metadata: match body.get("metadata") {
            Some(Value::Object(map)) => Some(map.clone()),
            _ => None,
        },
        parent_id: js_text(body.get("parentId")).filter(|value| !value.is_empty()),
        instructions: js_text(body.get("instructions")),
        description: js_text(body.get("description")),
        color: js_text(body.get("color")),
    }
}

/// `MoveRejection` -> the TS `ProjectMoveError` response body.
fn move_rejection(rejection: MoveRejection) -> Response {
    let (code, details) = match rejection {
        MoveRejection::ParentNotFound => ("PARENT_NOT_FOUND", "Parent project not found"),
        MoveRejection::Cycle => (
            "CYCLE",
            "Cannot move a project under itself or one of its descendants",
        ),
        MoveRejection::TooDeep => ("TOO_DEEP", "Maximum project nesting depth exceeded"),
    };
    fail(400, code, details)
}

#[cfg(test)]
mod repository_id_tests {
    use super::*;

    #[test]
    fn repository_id_uses_javascript_whitespace_semantics() {
        assert_eq!(
            requested_repository_id(&json!({"repoId": "\u{feff}repo\u{feff}"})),
            Some("repo".into())
        );
        assert_eq!(
            requested_repository_id(&json!({"repoId": "\u{feff}"})),
            None
        );
        // U+0085 is trimmed by Rust but not JavaScript.
        assert_eq!(
            requested_repository_id(&json!({"repoId": "\u{85}repo\u{85}"})),
            Some("\u{85}repo\u{85}".into())
        );
        assert_eq!(requested_repository_id(&json!({"repoId": 42})), None);
    }
}

#[cfg(test)]
mod list_limit_tests {
    use super::*;

    #[test]
    fn list_limit_matches_node_decimal_prefix_and_bounds() {
        for (query, expected) in [
            ("", None),
            ("?limit=2.9", Some(2.0)),
            ("?limit=12abc", Some(12.0)),
            ("?limit=%EF%BB%BF%2B7", Some(7.0)),
            ("?limit=0x10", None),
            ("?limit=-1", None),
            ("?limit=101", Some(100.0)),
            (
                "?limit=999999999999999999999999999999999999999",
                Some(100.0),
            ),
            ("?limit=2&limit=3", None),
        ] {
            let uri: Uri = format!("/api/projects{query}").parse().unwrap();
            assert_eq!(query_limit(&uri), expected, "{query}");
        }
    }
}
