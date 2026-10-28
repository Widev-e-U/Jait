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

/// JavaScript `String(value)` coercion used throughout the TS routes.
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

fn query_limit(map: &HashMap<String, String>) -> Option<f64> {
    map.get("limit")
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|v| v.is_finite() && *v >= 1.0)
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
}

impl ProjectCollectionRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self { auth }
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
            // TS: `exclusiveRoot` (falling back to `rootPath`) names a folder at
            // most one project may own; two rows on one path collide in the
            // path-keyed code-graph tables.
            let exclusive_root = js_text(body.get("exclusiveRoot"))
                .or_else(|| js_text(body.get("rootPath")))
                .filter(|value| !value.trim().is_empty());
            let parent_id = js_text(body.get("parentId")).filter(|value| !value.trim().is_empty());
            let create = create_from(&body, &uid);
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let service = ProjectService::new(db);
                if let Some(root) = exclusive_root.as_deref() {
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
                let record = match service.create(create) {
                    Ok(record) => record,
                    Err(error) => return Err(db_err(error)),
                };
                if let Some(parent) = parent_id.as_deref()
                    && record.parent_id.as_deref() != Some(parent)
                {
                    match service.move_project(&record.id, Some(parent), Some(&user_id)) {
                        Ok(Some(moved)) => return Res::Ok(response(201, json!(moved))),
                        Ok(None) => {}
                        Err(ProjectError::Move(rejection)) => {
                            return Res::Ok(move_rejection(rejection));
                        }
                        Err(ProjectError::Database(error)) => return Err(db_err(error)),
                    }
                }
                Res::Ok(response(201, json!(record)))
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
            let limit = query_limit(&query);
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let service = ProjectService::new(db);
                let body = service
                    .list_with_sessions(Some(&user_id), &status, limit)
                    .map_err(db_err)?;
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
            let body = service
                .search_with_sessions(&user_id, &needle)
                .map_err(db_err)?;
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
            return run(&state.auth, move |db| {
                let projects = ProjectService::new(db);
                let sessions = crate::services::sessions::SessionService::new(db);
                let archived = projects
                    .list(Some("archived"), Some(&user_id), None)
                    .map_err(db_err)?;
                for project in &archived {
                    sessions
                        .project_status(&project.id, "delete", Some(&user_id))
                        .map_err(db_err)?;
                }
                let removed = projects.delete_archived(&user_id).map_err(db_err)?;
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
        return run(&state.auth, move |db| {
            let projects = ProjectService::new(db);
            let sessions = crate::services::sessions::SessionService::new(db);
            match projects.get(&id, Some(&user_id)) {
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
            match restored {
                Some(project) => Res::Ok(response(200, json!(project))),
                None => Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
            }
        })
        .await
        .unwrap_or_else(|response| *response);
    }

    if let Some(id) = mid(&path, "/api/projects/", "/sessions") {
        if method == axum::http::Method::GET {
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let sessions = crate::services::sessions::SessionService::new(db);
                let rows = sessions
                    .list(crate::services::sessions::SessionFilter {
                        status: Some("active"),
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
            let project_path = js_text(body.get("projectPath"));
            let metadata = match body.get("metadata") {
                Some(Value::Object(map)) => Some(map.clone()),
                _ => None,
            };
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let sessions = crate::services::sessions::SessionService::new(db);
                let record = sessions
                    .create(crate::services::sessions::CreateSession {
                        user_id: Some(user_id.clone()),
                        project_id: Some(id.clone()),
                        name,
                        project_path,
                        metadata,
                    })
                    .map_err(db_err)?;
                Res::Ok(response(201, json!(record)))
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
        let parent_id = js_text(body.get("parentId")).filter(|value| !value.is_empty());
        let user_id = uid.clone();
        return run(&state.auth, move |db| {
            let service = ProjectService::new(db);
            match service.get(&id, Some(&user_id)) {
                Ok(Some(_)) => {}
                Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                Err(error) => return Err(db_err(error)),
            }
            match service.move_project(&id, parent_id.as_deref(), Some(&user_id)) {
                Ok(Some(project)) => Res::Ok(response(200, json!(project))),
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
        // TS drives real git cloning/validation through repoService and
        // gitService, neither of which has a native implementation yet.
        let _ = id;
        return fail(
            503,
            "SURFACE_UNAVAILABLE",
            "Repository management is not available in the native gateway",
        );
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
            return run(&state.auth, move |db| {
                let service = ProjectService::new(db);
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
                if fields.is_empty() {
                    return Res::Ok(response(200, json!(current)));
                }
                service
                    .update(&id, &fields, Some(&user_id))
                    .map_err(db_err)?;
                if cleared_root {
                    service
                        .clear_repository(&id, Some(&user_id))
                        .map_err(db_err)?;
                }
                match service.get(&id, Some(&user_id)) {
                    Ok(Some(updated)) => Res::Ok(response(200, json!(updated))),
                    Ok(None) => Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => Err(db_err(error)),
                }
            })
            .await
            .unwrap_or_else(|response| *response);
        }
        if method == axum::http::Method::DELETE {
            let user_id = uid.clone();
            return run(&state.auth, move |db| {
                let projects = ProjectService::new(db);
                let sessions = crate::services::sessions::SessionService::new(db);
                match projects.get(&id, Some(&user_id)) {
                    Ok(Some(_)) => {}
                    Ok(None) => return Res::Ok(fail(404, "NOT_FOUND", "Project not found")),
                    Err(error) => return Err(db_err(error)),
                }
                let archived = projects.archive(&id, Some(&user_id)).map_err(db_err)?;
                for archived_id in &archived {
                    sessions
                        .project_status(archived_id, "archive", Some(&user_id))
                        .map_err(db_err)?;
                }
                Res::Ok(response(200, json!({"ok": true, "archived": archived})))
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
