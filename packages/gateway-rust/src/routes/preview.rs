//! Native HTTP adapter for packages/gateway/src/routes/preview.ts.
//! The host supplies a scoped preview backend; this module grants no process,
//! filesystem, browser or network authority. Ownership is mandatory, including
//! for legacy TS handlers where the session service was optional.
use super::auth::{self, AuthState};
use crate::{execution::process_runner::ProcessCancellation, services::sessions::SessionService};
use axum::{
    Router,
    extract::{Path, Request, State},
    response::Response,
    routing::{get, post},
};
use serde_json::{Value, json};
use std::{future::Future, pin::Pin, sync::Arc, time::Duration};
use tokio::sync::Semaphore;

const OUTPUT_LIMIT: usize = 2 * 1024 * 1024;
#[derive(Clone, Debug, PartialEq)]
pub enum PreviewOperation {
    Session,
    Screenshot,
    Logs {
        since_id: i64,
    },
    /// The backend must test secret-safe collaboration policy before reading
    /// page content, returning Suppressed without inspecting when enabled.
    Inspect {
        selector: Option<String>,
    },
    Start {
        project_root: Option<String>,
        target: Option<String>,
        command: Option<String>,
        port: Option<f64>,
        framework_hint: Option<String>,
    },
    Restart,
    Navigate {
        url: String,
    },
    Reload,
    Share {
        shared_with_agent: bool,
    },
    Stop,
}
#[derive(Clone, Debug)]
pub struct PreviewCall {
    pub owner_id: String,
    pub session_id: String,
    pub operation: PreviewOperation,
}
#[derive(Clone, Debug)]
pub enum PreviewReply {
    Value(Value),
    Suppressed,
}
#[derive(Clone, Copy, Debug)]
pub enum PreviewFailure {
    InvalidDestination,
    Unavailable,
    Failed,
}
pub type PreviewPort = Arc<
    dyn Fn(
            PreviewCall,
            ProcessCancellation,
        ) -> Pin<Box<dyn Future<Output = Result<PreviewReply, PreviewFailure>> + Send>>
        + Send
        + Sync,
>;

/// Host effects must recheck consent, project roots, scope, resolved addresses
/// and browser authority immediately before execution. Cancellation includes all
/// spawned descendants. No ambient service/configuration fallback is provided.
#[derive(Clone)]
pub struct PreviewRoutes {
    auth: AuthState,
    port: Option<PreviewPort>,
    permits: Arc<Semaphore>,
}
impl PreviewRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            port: None,
            permits: Arc::new(Semaphore::new(8)),
        }
    }
    pub fn with_port(mut self, port: PreviewPort) -> Self {
        self.port = Some(port);
        self
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/preview/session/{sessionId}", get(read))
            .route("/api/preview/screenshot/{sessionId}", get(read))
            .route("/api/preview/logs/{sessionId}", get(read))
            .route("/api/preview/inspect/{sessionId}", get(read))
            .route("/api/preview/start", post(write))
            .route("/api/preview/restart", post(write))
            .route("/api/preview/navigate", post(write))
            .route("/api/preview/reload", post(write))
            .route("/api/preview/share", post(write))
            .route("/api/preview/stop", post(write))
            .with_state(self)
    }
    async fn owned(&self, owner: String, session: String) -> Result<bool, auth::Error> {
        self.auth
            .with_database(move |db| {
                Ok(SessionService::new(db)
                    .get(&session, Some(&owner))?
                    .is_some())
            })
            .await
    }
    async fn invoke(&self, call: PreviewCall) -> Response {
        let missing = match call.operation {
            PreviewOperation::Navigate { .. } | PreviewOperation::Reload => {
                "Live browser not found"
            }
            _ => "Preview session not found",
        };
        match self
            .owned(call.owner_id.clone(), call.session_id.clone())
            .await
        {
            Ok(true) => {}
            Ok(false) => return error(404, "Session not found"),
            Err(_) => return auth::internal_error(),
        }
        let Some(port) = &self.port else {
            return error(503, "Preview backend unavailable");
        };
        let Ok(_permit) = self.permits.clone().try_acquire_owned() else {
            return error(503, "Preview capacity unavailable");
        };
        let cancellation = ProcessCancellation::default();
        struct Guard(ProcessCancellation);
        impl Drop for Guard {
            fn drop(&mut self) {
                self.0.cancel();
            }
        }
        let _guard = Guard(cancellation.clone());
        let result =
            tokio::time::timeout(Duration::from_secs(120), port(call.clone(), cancellation)).await;
        match result {
            Err(_) => error(504, "Preview operation timed out"),
            Ok(Err(PreviewFailure::Unavailable)) => error(503, "Preview backend unavailable"),
            Ok(Err(PreviewFailure::InvalidDestination)) => error(400, "Could not navigate."),
            Ok(Err(PreviewFailure::Failed)) => error(500, "Preview operation failed"),
            Ok(Ok(PreviewReply::Suppressed))
                if matches!(call.operation, PreviewOperation::Inspect { .. }) =>
            {
                auth::response(200, json!({"inspect":null,"suppressed":true}))
            }
            Ok(Ok(PreviewReply::Suppressed)) => error(500, "Invalid preview response"),
            Ok(Ok(PreviewReply::Value(value))) => {
                if serde_json::to_vec(&value).map_or(true, |bytes| bytes.len() > OUTPUT_LIMIT) {
                    return error(502, "Preview response exceeds byte limit");
                }
                let body = match call.operation {
                    PreviewOperation::Session | PreviewOperation::Start { .. } => {
                        json!({"session":value})
                    }
                    PreviewOperation::Screenshot => json!({"screenshot":value}),
                    PreviewOperation::Logs { .. } => json!({"logs":value}),
                    PreviewOperation::Inspect { .. } => json!({"inspect":value}),
                    PreviewOperation::Stop => json!({"ok":value}),
                    _ if value.is_null() => return error(404, missing),
                    _ => json!({"session":value}),
                };
                auth::response(200, body)
            }
        }
    }
}
fn error(status: u16, message: &str) -> Response {
    auth::response(status, json!({"error":message}))
}
fn text(body: &Value, key: &str) -> Option<String> {
    body.get(key).and_then(Value::as_str).map(str::to_string)
}
fn since_id(raw: Option<&str>) -> Option<i64> {
    let Some(raw) = raw.filter(|s| !s.is_empty()) else {
        return Some(0);
    };
    let raw = raw.trim_start();
    let mut end = 0;
    for (index, c) in raw.char_indices() {
        if c.is_ascii_digit() || index == 0 && matches!(c, '+' | '-') {
            end = index + c.len_utf8();
        } else {
            break;
        }
    }
    raw[..end].parse().ok()
}
async fn read(
    State(state): State<PreviewRoutes>,
    Path(session): Path<String>,
    request: Request,
) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(v) => v,
        Err(e) => return *e,
    };
    let query: std::collections::HashMap<String, String> =
        url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes())
            .into_owned()
            .collect();
    let operation = match request.uri().path().split('/').nth(3).unwrap_or("") {
        "session" => PreviewOperation::Session,
        "screenshot" => PreviewOperation::Screenshot,
        "logs" => match since_id(query.get("sinceId").map(String::as_str)) {
            Some(id) => PreviewOperation::Logs { since_id: id },
            None => {
                return match state.owned(user.id, session).await {
                    Ok(true) => auth::response(200, json!({"logs":[]})),
                    Ok(false) => error(404, "Session not found"),
                    Err(_) => auth::internal_error(),
                };
            }
        },
        "inspect" => PreviewOperation::Inspect {
            selector: query.get("selector").cloned(),
        },
        _ => return error(404, "Not Found"),
    };
    state
        .invoke(PreviewCall {
            owner_id: user.id,
            session_id: session,
            operation,
        })
        .await
}
async fn write(State(state): State<PreviewRoutes>, request: Request) -> Response {
    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(v) => v,
        Err(e) => return *e,
    };
    let action = request
        .uri()
        .path()
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string();
    let headers = request.headers().clone();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(e) => return *e,
    };
    let body = if body.is_null() { json!({}) } else { body };
    let Some(session) = text(&body, "sessionId").filter(|s| !s.is_empty()) else {
        return error(
            400,
            if action == "share" {
                "sessionId and sharedWithAgent are required"
            } else {
                "sessionId is required"
            },
        );
    };
    if session.len() > 4096 {
        return error(400, "Invalid sessionId");
    }
    if matches!(action.as_str(), "navigate" | "reload") {
        let allowed = if action == "navigate" {
            &["sessionId", "url"][..]
        } else {
            &["sessionId"][..]
        };
        if body
            .as_object()
            .is_none_or(|m| m.keys().any(|k| !allowed.contains(&k.as_str())))
        {
            return error(400, "Invalid preview request");
        }
    }
    let operation = match action.as_str() {
        "start" => PreviewOperation::Start {
            project_root: text(&body, "projectRoot"),
            target: text(&body, "target"),
            command: text(&body, "command"),
            port: body.get("port").and_then(Value::as_f64),
            framework_hint: text(&body, "frameworkHint"),
        },
        "restart" => PreviewOperation::Restart,
        "navigate" => match text(&body, "url").filter(|url| !url.is_empty() && url.len() <= 8192) {
            Some(url) => PreviewOperation::Navigate { url },
            None => return error(400, "Invalid preview URL"),
        },
        "reload" => PreviewOperation::Reload,
        "share" => match body.get("sharedWithAgent").and_then(Value::as_bool) {
            Some(value) => PreviewOperation::Share {
                shared_with_agent: value,
            },
            None => return error(400, "sessionId and sharedWithAgent are required"),
        },
        "stop" => PreviewOperation::Stop,
        _ => return error(404, "Not Found"),
    };
    state
        .invoke(PreviewCall {
            owner_id: user.id,
            session_id: session,
            operation,
        })
        .await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn log_cursor_preserves_decimal_prefix_and_invalid_number_behavior() {
        assert_eq!(since_id(None), Some(0));
        assert_eq!(since_id(Some("")), Some(0));
        assert_eq!(since_id(Some("  +12tail")), Some(12));
        assert_eq!(since_id(Some("-3.5")), Some(-3));
        assert_eq!(since_id(Some("oops")), None);
        assert_eq!(since_id(Some("-")), None);
    }
}

#[cfg(test)]
#[path = "preview_tests.rs"]
mod integration_tests;
