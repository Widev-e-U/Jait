//! Opt-in skills HTTP adapter. Registry, tool checking and installer are explicit ports;
//! mounting never discovers files or runs a package manager by itself.
use super::auth::{self, AuthState, response};
use axum::{
    Router,
    extract::{Path, Request, State},
    response::Response,
    routing::{get, patch, post},
};
use futures_util::future::BoxFuture;
use serde_json::{Map, Value, json};
use std::sync::{Arc, Mutex};

pub type SkillRecord = Arc<Mutex<Value>>;
pub type ListSkills = Arc<dyn Fn() -> Result<Vec<SkillRecord>, String> + Send + Sync>;
pub type GetSkill = Arc<dyn Fn(&str) -> Result<Option<SkillRecord>, String> + Send + Sync>;
pub type SetEnabled = Arc<dyn Fn(&str, bool) -> Result<(), String> + Send + Sync>;
pub type CheckTools = Arc<dyn Fn(&Value) -> Result<ToolStatus, String> + Send + Sync>;
pub type InstallTool = Arc<
    dyn Fn(SkillRecord, Option<Value>) -> BoxFuture<'static, Result<Value, String>> + Send + Sync,
>;
#[derive(Clone, Debug)]
pub struct ToolStatus {
    pub satisfied: bool,
    pub missing: Vec<String>,
}

#[derive(Clone)]
pub struct SkillRoutes {
    pub auth: AuthState,
    pub list: ListSkills,
    pub get: GetSkill,
    pub set_enabled: SetEnabled,
    pub check_tools: CheckTools,
    pub install_tool: InstallTool,
}
impl SkillRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/skills", get(list))
            .route("/api/skills/{id}", patch(update))
            .route("/api/skills/{id}/install-tool", post(install))
            .with_state(self)
    }
    fn serialize(&self, record: &SkillRecord) -> Result<Value, String> {
        let skill = record
            .lock()
            .map_err(|_| "Skill record lock poisoned")?
            .clone();
        let status = (self.check_tools)(&skill)?;
        let mut result = Map::new();
        for field in ["id", "name", "description", "filePath", "source", "enabled"] {
            if let Some(value) = skill.get(field) {
                result.insert(field.into(), value.clone());
            }
        }
        for field in ["requires", "install"] {
            if let Some(value) = skill.get(field).filter(|v| truthy(v)) {
                result.insert(field.into(), value.clone());
            }
        }
        result.insert("toolsSatisfied".into(), json!(status.satisfied));
        result.insert("missingTools".into(), json!(status.missing));
        Ok(Value::Object(result))
    }
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64().is_some_and(|n| n != 0.),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}
fn failure(message: String) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":message}),
    )
}
async fn authorize_and_parse(
    state: &SkillRoutes,
    request: Request,
) -> Result<Value, Box<Response>> {
    let headers = request.headers().clone();
    auth::require_user(&state.auth, &headers).await?;
    auth::parse_body(request.into_body(), &headers).await.map_err(|error| {
        if error.status() == 415 { Box::new(response(415, json!({"statusCode":415,"code":"FST_ERR_CTP_INVALID_MEDIA_TYPE","error":"Unsupported Media Type","message":"Unsupported Media Type"}))) } else {error}
    })
}
async fn list(State(state): State<SkillRoutes>, request: Request) -> Response {
    if let Err(error) = authorize_and_parse(&state, request).await {
        return *error;
    }
    match (state.list)().and_then(|records| {
        records
            .iter()
            .map(|r| state.serialize(r))
            .collect::<Result<Vec<_>, _>>()
    }) {
        Ok(skills) => response(200, json!(skills)),
        Err(error) => failure(error),
    }
}
async fn update(
    State(state): State<SkillRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    let body = match authorize_and_parse(&state, request).await {
        Ok(body) => body,
        Err(error) => return *error,
    };
    let skill = match (state.get)(&id) {
        Ok(Some(skill)) => skill,
        Ok(None) => return response(404, json!({"error":"Skill not found"})),
        Err(error) => return failure(error),
    };
    if let Some(enabled) = body.get("enabled").and_then(Value::as_bool)
        && let Err(error) = (state.set_enabled)(&id, enabled)
    {
        return failure(error);
    }
    match state.serialize(&skill) {
        Ok(skill) => response(200, skill),
        Err(error) => failure(error),
    }
}
async fn install(
    State(state): State<SkillRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    let body = match authorize_and_parse(&state, request).await {
        Ok(body) => body,
        Err(error) => return *error,
    };
    let skill = match (state.get)(&id) {
        Ok(Some(skill)) => skill,
        Ok(None) => return response(404, json!({"error":"Skill not found"})),
        Err(error) => return failure(error),
    };
    // Keep the shared record alive across await: the installer may update its tools.
    let result = (state.install_tool)(skill.clone(), body.get("installId").cloned()).await;
    match result.and_then(|result| {
        let mut result = result
            .as_object()
            .cloned()
            .ok_or("Invalid native install result")?;
        result.insert("skill".into(), state.serialize(&skill)?);
        Ok(Value::Object(result))
    }) {
        Ok(result) => response(200, result),
        Err(message) => {
            let status = if message.contains("Unsupported install kind")
                || message.contains("No matching install option")
            {
                400
            } else {
                500
            };
            response(status, json!({"error":message}))
        }
    }
}
