//! Opt-in workbench HTTP adapters. Authentication precedes every service or
//! scheduler call. Scanner authorization stays with the workbench and lease.
use super::auth::{self, AuthState, response};
use crate::{
    assessments::workbench::{WorkbenchAbort, WorkbenchRegistry},
    services::calendar::truthy,
    tools::{memory_tools::MemoryToolResult, security_dispatch::SecurityContext},
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, post},
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::Arc;
#[derive(Clone, Debug)]
pub enum WorkbenchOperation {
    History,
    Engines,
    Compare { before: Value, after: Value },
    Start(Value),
    Get(String),
    Cancel(String),
    Report(String),
    Delete(String),
    Plan(String),
    Verify(String),
    Decide { id: String, disposition: Value },
}
impl WorkbenchOperation {
    pub fn name(&self) -> &'static str {
        match self {
            Self::History => "history",
            Self::Engines => "engines",
            Self::Compare { .. } => "compare",
            Self::Start(_) => "start",
            Self::Get(_) => "get",
            Self::Cancel(_) => "cancel",
            Self::Report(_) => "report",
            Self::Delete(_) => "deleteRun",
            Self::Plan(_) => "plan",
            Self::Verify(_) => "verify",
            Self::Decide { .. } => "decide",
        }
    }
    pub fn arguments(&self, owner: &str) -> Vec<Value> {
        match self {
            Self::History => vec![json!(owner)],
            Self::Engines => vec![],
            Self::Compare { before, after } => vec![before.clone(), after.clone(), json!(owner)],
            Self::Start(input) => vec![input.clone(), json!(owner)],
            Self::Get(id)
            | Self::Cancel(id)
            | Self::Report(id)
            | Self::Delete(id)
            | Self::Plan(id)
            | Self::Verify(id) => vec![json!(id), json!(owner)],
            Self::Decide { id, disposition } => vec![json!(id), json!(owner), disposition.clone()],
        }
    }
}
pub type WorkbenchRoutePort = Arc<
    dyn Fn(WorkbenchOperation, String) -> BoxFuture<'static, Result<Value, String>> + Send + Sync,
>;
pub type MonitorRoutePort = Arc<
    dyn Fn(Value, SecurityContext<()>) -> BoxFuture<'static, Result<MemoryToolResult, String>>
        + Send
        + Sync,
>;
pub fn registry_port(registry: WorkbenchRegistry) -> WorkbenchRoutePort {
    Arc::new(move |op, owner| {
        let registry = registry.clone();
        Box::pin(async move {
            let service = registry.get().await;
            match op {
                WorkbenchOperation::History => service.history(&owner).await,
                WorkbenchOperation::Engines => service.engines(WorkbenchAbort::default()).await,
                WorkbenchOperation::Compare { before, after } => {
                    service
                        .compare(
                            before.as_str().unwrap_or(""),
                            after.as_str().unwrap_or(""),
                            &owner,
                        )
                        .await
                }
                WorkbenchOperation::Start(input) => {
                    service.start(&input, &owner, "gateway", None).await
                }
                WorkbenchOperation::Get(id) => service.get(&id, &owner).await,
                WorkbenchOperation::Cancel(id) => service
                    .cancel(&id, &owner)
                    .await
                    .map(|_| json!({"ok":true})),
                WorkbenchOperation::Report(id) => service.report(&id, &owner).await,
                WorkbenchOperation::Delete(id) => service
                    .delete_run(&id, &owner)
                    .await
                    .map(|_| json!({"ok":true})),
                WorkbenchOperation::Plan(id) => service.plan(&id, &owner).await,
                WorkbenchOperation::Verify(id) => {
                    service.verify(&id, &owner, "gateway", None).await
                }
                WorkbenchOperation::Decide { id, disposition } => {
                    service
                        .decide(&id, &owner, disposition.as_str().unwrap_or(""))
                        .await
                }
            }
        })
    })
}
#[derive(Clone)]
pub struct SecurityWorkbenchRoutes {
    pub auth: AuthState,
    pub service: WorkbenchRoutePort,
    pub monitor: Option<MonitorRoutePort>,
    pub project_root: String,
    pub request_id: Arc<dyn Fn() -> String + Send + Sync>,
}
impl SecurityWorkbenchRoutes {
    pub fn router(self) -> Router {
        let mut router = Router::new()
            .route("/api/security/workbench", get(handle))
            .route("/api/security/comparisons", post(handle))
            .route("/api/security/engines", get(handle))
            .route("/api/security/checks", post(handle))
            .route("/api/security/checks/{id}", get(handle).delete(handle))
            .route("/api/security/checks/{id}/cancel", post(handle))
            .route("/api/security/checks/{id}/report", get(handle))
            .route("/api/security/findings/{id}/plan", get(handle))
            .route("/api/security/findings/{id}/verify", post(handle))
            .route("/api/security/findings/{id}/decision", post(handle));
        if self.monitor.is_some() {
            router = router.route("/api/security/monitors", post(handle));
        }
        router.with_state(self)
    }
}
fn error(status: u16, message: &str) -> Response {
    response(status, json!({"error":message}))
}
fn internal(message: String) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":message}),
    )
}
async fn handle(State(state): State<SecurityWorkbenchRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let path = request.uri().path().to_string();
    let method = request.method().clone();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    if path == "/api/security/monitors" {
        let context = SecurityContext {
            fields: json!({"sessionId":"security-monitor","actionId":(state.request_id)(),"projectRoot":state.project_root,"requestedBy":user.id,"userId":user.id,"executionNodeId":"gateway"}),
            capabilities: (),
        };
        return match state.monitor.as_ref().expect("mounted monitor")(body, context).await {
            Ok(result) => {
                if truthy(&result.ok) {
                    response(200, result.data.unwrap_or(Value::Null))
                } else {
                    let message = String::from_utf16_lossy(&result.message.0);
                    error(400, &message)
                }
            }
            Err(message) => internal(message),
        };
    }
    if body.is_null() {
        if path == "/api/security/comparisons" {
            return error(404, "Comparison runs not found");
        }
        if path.starts_with("/api/security/findings/") && path.ends_with("/decision") {
            return error(400, "Invalid finding or disposition");
        }
    }
    let (operation, status, failure) = match path.as_str() {
        "/api/security/workbench" => (WorkbenchOperation::History, 200, None),
        "/api/security/comparisons" => (
            WorkbenchOperation::Compare {
                before: body["beforeRunId"].clone(),
                after: body["afterRunId"].clone(),
            },
            200,
            Some((404, "Comparison runs not found", false)),
        ),
        "/api/security/engines" => (WorkbenchOperation::Engines, 200, None),
        "/api/security/checks" => (
            WorkbenchOperation::Start(body),
            202,
            Some((400, "Invalid check", true)),
        ),
        _ => {
            let (base, findings) = if let Some(tail) = path.strip_prefix("/api/security/checks/") {
                (tail, false)
            } else if let Some(tail) = path.strip_prefix("/api/security/findings/") {
                (tail, true)
            } else {
                return error(404, "Not found");
            };
            let (raw_id, suffix) = base.rsplit_once('/').unwrap_or((base, ""));
            let id = percent_encoding::percent_decode_str(raw_id)
                .decode_utf8_lossy()
                .into_owned();
            if findings {
                match suffix {
                    "plan" => (
                        WorkbenchOperation::Plan(id),
                        200,
                        Some((404, "Finding not found", false)),
                    ),
                    "verify" => (
                        WorkbenchOperation::Verify(id),
                        200,
                        Some((400, "Verification failed", true)),
                    ),
                    "decision" => (
                        WorkbenchOperation::Decide {
                            id,
                            disposition: body["disposition"].clone(),
                        },
                        200,
                        Some((400, "Invalid finding or disposition", false)),
                    ),
                    _ => return error(404, "Not found"),
                }
            } else {
                match suffix {
                    "cancel" => (
                        WorkbenchOperation::Cancel(id),
                        200,
                        Some((404, "Check not found", false)),
                    ),
                    "report" => (
                        WorkbenchOperation::Report(id),
                        200,
                        Some((404, "Check not found", false)),
                    ),
                    _ => {
                        if method == Method::DELETE {
                            (
                                WorkbenchOperation::Delete(id),
                                200,
                                Some((400, "Deletion failed", true)),
                            )
                        } else {
                            (
                                WorkbenchOperation::Get(id),
                                200,
                                Some((404, "Check not found", false)),
                            )
                        }
                    }
                }
            }
        }
    };
    let effect = matches!(
        &operation,
        WorkbenchOperation::Cancel(_) | WorkbenchOperation::Delete(_)
    );
    match (state.service)(operation, user.id).await {
        Ok(value) => response(status, if effect { json!({"ok":true}) } else { value }),
        Err(message) => {
            if let Some((status, fallback, expose)) = failure {
                error(status, if expose { &message } else { fallback })
            } else {
                internal(message)
            }
        }
    }
}
