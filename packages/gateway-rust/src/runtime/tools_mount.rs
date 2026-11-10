//! `GET /api/tools` and `POST /api/tools/execute` on the tools the gateway can really run.
//!
//! Execution goes through the same `ConsentAwareExecutor` the chat uses, so consent, path
//! confinement and cancellation are unchanged. Unlike the Node route, the caller cannot pick the
//! project root or run on the shared "default" session: the session must be owned by the caller and
//! its stored project path (or the gateway project root) is the only root. Remote nodes are refused.
use crate::{
    execution::process_runner::ProcessCancellation,
    routes::auth::{self, AuthState},
    runtime::chat_tools,
    security::{
        consent_executor::{ExecuteOptions, ExecutionOrigin, RuntimeMode, ToolExecutionContext},
        consent_manager::ConsentManager,
    },
    services::sessions::SessionService,
};
use axum::{
    Router,
    extract::{Request, State},
    response::Response,
    routing::{get, post},
};
use serde_json::{Value, json};
use std::path::PathBuf;

#[derive(Clone)]
struct ToolsState {
    auth: AuthState,
    consent: ConsentManager,
    project_root: PathBuf,
}

pub fn tools_routes(auth: &AuthState, consent: ConsentManager, project_root: PathBuf) -> Router {
    Router::new()
        .route("/api/tools", get(list_tools))
        .route("/api/tools/execute", post(execute_tool))
        .with_state(ToolsState {
            auth: auth.clone(),
            consent,
            project_root,
        })
}

async fn list_tools(State(state): State<ToolsState>, request: Request) -> Response {
    if let Err(response) = auth::require_user(&state.auth, request.headers()).await {
        return *response;
    }
    let definitions = match chat_tools::project_tool_definitions() {
        Ok(definitions) => definitions,
        Err(_) => return auth::internal_error(),
    };
    let tools: Vec<Value> = definitions
        .iter()
        .map(|d| {
            let mut tool = json!({});
            for key in [
                "name",
                "description",
                "page",
                "category",
                "risk",
                "source",
                "sourceMetadata",
            ] {
                if let Some(value) = d.get(key) {
                    tool[key] = value.clone();
                }
            }
            tool
        })
        .collect();
    auth::response(200, json!({ "tools": tools }))
}

async fn execute_tool(State(state): State<ToolsState>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let user = match auth::require_user(&state.auth, &parts.headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let bytes = match axum::body::to_bytes(body, 256 * 1024).await {
        Ok(bytes) => bytes,
        Err(_) => return auth::response(413, json!({"error": "PAYLOAD_TOO_LARGE"})),
    };
    let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    let tool = body["tool"].as_str().unwrap_or_default().to_owned();
    if tool.is_empty() {
        return auth::response(
            400,
            json!({"error": "VALIDATION_ERROR", "details": "tool name is required"}),
        );
    }
    if body["nodeId"]
        .as_str()
        .is_some_and(|n| !n.trim().is_empty() && n.trim() != "gateway")
    {
        return auth::response(
            503,
            json!({"error": "REMOTE_NODE_UNAVAILABLE", "details": "Remote node execution is not available"}),
        );
    }
    let session_id = body["sessionId"].as_str().unwrap_or_default().to_owned();
    if session_id.is_empty() || session_id.len() > 256 || session_id.chars().any(char::is_control) {
        return auth::response(
            400,
            json!({"error": "VALIDATION_ERROR", "details": "an owned sessionId is required"}),
        );
    }
    let (owner, lookup) = (user.id.clone(), session_id.clone());
    let session = match state
        .auth
        .with_database(move |db| {
            Ok(SessionService::new(db)
                .get(&lookup, Some(&owner))?
                .filter(|s| s.status.as_deref() == Some("active")))
        })
        .await
    {
        Ok(Some(session)) => session,
        Ok(None) => return auth::response(404, json!({"error": "Resource not found"})),
        Err(_) => return auth::internal_error(),
    };
    let project_root = session
        .project_path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| state.project_root.clone());
    if !project_root.is_absolute() {
        return auth::response(409, json!({"error": "SESSION_PROJECT_ROOT_INVALID"}));
    }
    let (_, executor) =
        match chat_tools::project_tools(&user.id, &session_id, state.consent.clone()) {
            Ok(pair) => pair,
            Err(_) => return auth::internal_error(),
        };
    let context = ToolExecutionContext {
        user_id: user.id,
        session_id,
        action_id: uuid::Uuid::new_v4().to_string(),
        project_root,
        origin: ExecutionOrigin::User,
        runtime_mode: RuntimeMode::Guarded,
        cancellation: ProcessCancellation::default(),
        on_output: None,
    };
    let options = ExecuteOptions {
        dry_run: body["dryRun"].as_bool() == Some(true),
        consent_timeout_ms: body["consentTimeoutMs"].as_f64(),
    };
    let input = body.get("input").cloned().unwrap_or_else(|| json!({}));
    match executor.execute(&tool, &input, &context, options).await {
        Ok(result) => auth::response(200, serde_json::to_value(result).unwrap_or(Value::Null)),
        Err(_) => auth::internal_error(),
    }
}
