//! Opt-in protected assessment routes. Project scope binding is checked against
//! the caller's owned, live session and local project before service validation.
use super::auth::{self, AuthState, response};
use crate::{assessments::service::AssessmentRegistry, services::calendar::truthy};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, post},
};
use rusqlite::OptionalExtension;
use serde_json::{Value, json};

#[derive(Clone)]
pub struct SecurityAssessmentRoutes {
    pub auth: AuthState,
    pub assessments: AssessmentRegistry,
    /// Explicit optional database supplied for project-session lookup. The auth
    /// worker remains independently required even when this is absent.
    pub project_database: Option<AuthState>,
}
impl SecurityAssessmentRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/security/assessments", get(handle).post(handle))
            .route("/api/security/scopes", post(handle))
            .route("/api/security/assessments/{id}", get(handle))
            .route("/api/security/assessments/{id}/cancel", post(handle))
            .with_state(self)
    }
    async fn project_root(&self, body: &Value, operator: &str) -> Result<Option<String>, String> {
        let Some(paths) = body.get("paths") else {
            return Ok(None);
        };
        let length = match paths {
            Value::Array(values) => json!(values.len()),
            Value::String(value) => json!(value.encode_utf16().count()),
            Value::Object(values) => values.get("length").cloned().unwrap_or(Value::Null),
            _ => Value::Null,
        };
        if !truthy(&length) {
            return Ok(None);
        }
        let missing = "Select an owned project session for filesystem checks";
        let Some(database) = &self.project_database else {
            return Err(missing.into());
        };
        let session_id = body
            .get("sessionId")
            .filter(|value| truthy(value))
            .ok_or(missing)?;
        let session_id = match session_id {
            Value::String(value) => rusqlite::types::Value::Text(value.clone()),
            Value::Number(value) => {
                rusqlite::types::Value::Real(value.as_f64().unwrap_or_default())
            }
            _ => return Err("Owned project session not found".into()),
        };
        let operator = operator.to_string();
        let session = database.with_database(move |db| {
            Ok(db.query_row("SELECT s.project_path, s.metadata, p.node_id FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ? AND s.user_id = ? AND s.status != 'deleted' AND (s.project_id IS NULL OR p.user_id = s.user_id)",rusqlite::params![session_id,operator],|row|Ok((row.get::<_,Option<String>>(0)?,row.get::<_,Option<String>>(1)?,row.get::<_,Option<String>>(2)?))).optional()?)
        }).await.map_err(|error|error.to_string())?;
        let Some((root, metadata, node)) = session else {
            return Err("Owned project session not found".into());
        };
        let root = root
            .filter(|value| !value.is_empty())
            .ok_or("Owned project session not found")?;
        let metadata: Value = match metadata.filter(|value| !value.is_empty()) {
            Some(value) => {
                serde_json::from_str(&value).map_err(|_| "Invalid session metadata".to_string())?
            }
            None => json!({}),
        };
        if metadata.is_null() {
            return Err("null is not an object (evaluating 'metadata.executionNodeId')".into());
        }
        if node
            .as_ref()
            .is_some_and(|value| !value.is_empty() && value != "gateway")
            || ["executionNodeId", "nodeId"].iter().any(|key| {
                metadata
                    .get(*key)
                    .is_some_and(|value| truthy(value) && value != "gateway")
            })
        {
            return Err("Filesystem assessment requires a gateway-local project session".into());
        }
        Ok(Some(root))
    }
}
fn error(status: u16, message: &str) -> Response {
    response(status, json!({"error":message}))
}
async fn handle(State(state): State<SecurityAssessmentRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let service = state.assessments.get().await;
    if path == "/api/security/scopes" && method == Method::POST {
        if body.is_null()
            && !headers
                .get(axum::http::header::CONTENT_TYPE)
                .is_some_and(|value| {
                    value
                        .to_str()
                        .unwrap_or("")
                        .split(';')
                        .next()
                        .unwrap_or("")
                        .trim()
                        .eq_ignore_ascii_case("application/json")
                })
        {
            return error(400, "undefined is not an object (evaluating 'input.paths')");
        }
        let root = match state.project_root(&body, &user.id).await {
            Ok(root) => root,
            Err(message) => return error(400, &message),
        };
        return match service.create_scope(&body, &user.id, root).await {
            Ok(scope) => response(200, scope),
            Err(message) => error(400, &message),
        };
    }
    if path == "/api/security/assessments" {
        if method == Method::GET {
            return match service.history_detailed(&user.id).await {
                Ok(history) => response(200, history),
                Err(failure) => {
                    let code = failure.sqlite_code.and_then(|code| match code {
                        1 => Some("SQLITE_ERROR"),
                        5 => Some("SQLITE_BUSY"),
                        6 => Some("SQLITE_LOCKED"),
                        8 => Some("SQLITE_READONLY"),
                        10 => Some("SQLITE_IOERR"),
                        11 => Some("SQLITE_CORRUPT"),
                        13 => Some("SQLITE_FULL"),
                        14 => Some("SQLITE_CANTOPEN"),
                        17 => Some("SQLITE_SCHEMA"),
                        18 => Some("SQLITE_TOOBIG"),
                        19 => Some("SQLITE_CONSTRAINT"),
                        21 => Some("SQLITE_MISUSE"),
                        23 => Some("SQLITE_AUTH"),
                        26 => Some("SQLITE_NOTADB"),
                        _ => None,
                    });
                    let mut body = json!({"statusCode":500,"error":"Internal Server Error","message":failure.message});
                    if let Some(code) = code {
                        body["code"] = json!(code);
                    }
                    response(500, body)
                }
            };
        }
        let Some(scope_id) = body.get("scopeId").and_then(Value::as_str) else {
            return error(400, "scopeId required");
        };
        return match service.start(scope_id, &user.id, "gateway", None).await {
            Ok(run) => response(202, run),
            Err(message) => error(400, &message),
        };
    }
    let id = path
        .strip_prefix("/api/security/assessments/")
        .unwrap_or("");
    let id = id.strip_suffix("/cancel").unwrap_or(id);
    let id = percent_encoding::percent_decode_str(id).decode_utf8_lossy();
    if method == Method::POST {
        return match service.cancel(&id, &user.id).await {
            Ok(()) => response(200, json!({"ok":true})),
            Err(_) => error(404, "Assessment not found"),
        };
    }
    match service.get_run(&id, &user.id).await {
        Ok(run) => response(200, run),
        Err(_) => error(404, "Assessment not found"),
    }
}
