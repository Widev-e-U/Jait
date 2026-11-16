//! Authenticated emergency stop API. Explicitly mounted; production remains separate.
use super::auth::{self, AuthState, response};
use crate::{
    services::{
        agent_control::{
            AgentControlError, AgentControlHooks, AgentControlService, AgentControlState,
            AgentStopResult,
        },
        audit::AuditEntry,
    },
    text::js_trim,
    time::{Clock, default_clock, iso},
};
use axum::{
    Router,
    extract::{Request, State},
    response::Response,
    routing::{get, post},
};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{future::Future, pin::Pin, sync::Arc};

pub type StopFuture = Pin<Box<dyn Future<Output = Result<AgentStopResult, String>> + Send>>;
pub type StopAgents = Arc<dyn Fn(String) -> StopFuture + Send + Sync>;
pub type StateChanged = Arc<dyn Fn(&str, &AgentControlState) -> Result<(), String> + Send + Sync>;
/// Called on the bounded database worker. Errors are best effort after state commits.
pub type ControlAudit = Arc<dyn Fn(&Connection, AuditEntry) -> Result<(), String> + Send + Sync>;

struct ChangeHook(StateChanged);
impl AgentControlHooks for ChangeHook {
    fn on_change(&mut self, user: &str, state: &AgentControlState) -> Result<(), String> {
        (self.0)(user, state)
    }
}
#[derive(Clone)]
pub struct AgentControlRoutes {
    pub auth: AuthState,
    pub clock: Clock,
    pub stop_running: StopAgents,
    /// Invoked immediately after persisting halt on the database worker.
    pub on_halt_persisted: Arc<dyn Fn(&str) + Send + Sync>,
    pub on_change: StateChanged,
    pub audit: Option<ControlAudit>,
}
impl AgentControlRoutes {
    pub fn new(auth: AuthState) -> Self {
        Self {
            auth,
            clock: default_clock(),
            stop_running: Arc::new(|_| Box::pin(async { Ok(AgentStopResult::Count(0.0)) })),
            on_halt_persisted: Arc::new(|_| {}),
            on_change: Arc::new(|_, _| Ok(())),
            audit: None,
        }
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/agent-control", get(handle))
            .route("/api/agent-control/halt", post(handle))
            .route("/api/agent-control/resume", post(handle))
            .with_state(self)
    }
    async fn write_audit(&self, entry: AuditEntry) {
        if let Some(audit) = self.audit.clone() {
            let _ = self
                .auth
                .with_database(move |db| {
                    audit(db, entry)
                        .map_err(|message| Box::new(std::io::Error::other(message)) as auth::Error)
                })
                .await;
        }
    }
}
/// Installed Zod v4 counts Unicode code points; storage still slices UTF-16.
/// Nullish request body defaults to {}.
fn halt_reason(body: &Value) -> Result<Option<String>, ()> {
    if body.is_null() {
        return Ok(None);
    }
    let fields = body.as_object().ok_or(())?;
    match fields.get("reason") {
        None => Ok(None),
        Some(Value::String(reason)) => {
            let reason = js_trim(reason);
            if reason.chars().count() > 500 {
                Err(())
            } else {
                Ok(Some(reason.into()))
            }
        }
        _ => Err(()),
    }
}
async fn handle(State(state): State<AgentControlRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    let path = request.uri().path().to_string();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(value) => value,
        Err(error) if error.status().as_u16() == 415 => {
            return response(
                415,
                json!({"statusCode":415,"code":"FST_ERR_CTP_INVALID_MEDIA_TYPE","error":"Unsupported Media Type","message":"Unsupported Media Type"}),
            );
        }
        Err(error) => return *error,
    };
    if path == "/api/agent-control" {
        return match state
            .auth
            .with_database(move |db| {
                Ok(AgentControlService::new(db, &|| String::new()).get_state(&user.id)?)
            })
            .await
        {
            Ok(current) => response(200, json!({"state":current})),
            Err(error) => service_failure(&error),
        };
    }
    if path.ends_with("/halt") {
        let reason = match halt_reason(&body) {
            Ok(reason) => reason,
            Err(()) => return response(400, json!({"error":"Invalid halt request"})),
        };
        let owner = user.id.clone();
        let clock = state.clock.clone();
        let on_halt_persisted = state.on_halt_persisted.clone();
        if let Err(error) = state
            .auth
            .with_database(move |db| {
                let now = iso(clock()).map_err(std::io::Error::other)?;
                AgentControlService::new(db, &|| now.clone())
                    .persist_halt(&owner, reason.as_deref())?;
                on_halt_persisted(&owner);
                Ok(())
            })
            .await
        {
            return service_failure(&error);
        }
        // Never hold SQLite across teardown. Resume/read remain reachable here.
        let outcome = (state.stop_running)(user.id.clone()).await;
        let owner = user.id.clone();
        let change = state.on_change.clone();
        let result = match state
            .auth
            .with_database(move |db| {
                Ok(AgentControlService::new(db, &|| String::new()).finish_halt(
                    &owner,
                    outcome,
                    &mut ChangeHook(change),
                )?)
            })
            .await
        {
            Ok(result) => result,
            Err(error) => return service_failure(&error),
        };
        let timestamp = result
            .state
            .updated_at
            .clone()
            .unwrap_or_else(|| (state.clock)().to_string());
        state.write_audit(AuditEntry {
            action_id: format!("agent-halt:{}:{timestamp}", user.id),
            action_type: "agent.control.halt".into(),
            tool_name: Some("agent_control".into()),
            inputs: Some(json!({"reason":result.state.reason,"stopped":result.stopped})),
            outputs: Some(json!({"halted":result.state.halted,"haltedAt":result.state.halted_at,"stopError":result.stop_error})),
            status: if result.stop_error.as_ref().is_some_and(|s| !s.is_empty()) { "partial" } else { "success" }.into(),
            ..Default::default()
        }).await;
        response(200, json!(result))
    } else {
        let owner = user.id.clone();
        let clock = state.clock.clone();
        let change = state.on_change.clone();
        let current = match state
            .auth
            .with_database(move |db| {
                let now = iso(clock()).map_err(std::io::Error::other)?;
                Ok(AgentControlService::new(db, &|| now.clone())
                    .resume(&owner, &mut ChangeHook(change))?)
            })
            .await
        {
            Ok(current) => current,
            Err(error) => return service_failure(&error),
        };
        let timestamp = current
            .updated_at
            .clone()
            .unwrap_or_else(|| (state.clock)().to_string());
        state
            .write_audit(AuditEntry {
                action_id: format!("agent-resume:{}:{timestamp}", user.id),
                action_type: "agent.control.resume".into(),
                tool_name: Some("agent_control".into()),
                outputs: Some(json!({"halted":current.halted})),
                status: "success".into(),
                ..Default::default()
            })
            .await;
        response(200, json!({"state":current}))
    }
}

// Fastify's default route handler serializes the service's error message/code.
// Shared auth/overload failures retain their existing boundary response.
fn service_failure(error: &auth::Error) -> Response {
    use crate::db::worker::DatabaseError;
    fn operation(error: &(dyn std::error::Error + 'static)) -> Option<Response> {
        if let Some(DatabaseError::Operation(inner)) = error.downcast_ref::<DatabaseError>() {
            return operation(inner.as_ref());
        }
        if let Some(error) = error.downcast_ref::<AgentControlError>() {
            return match error {
                AgentControlError::Database(error) => operation(error),
                AgentControlError::OnChange(message) => Some(response(
                    500,
                    json!({"statusCode":500,"error":"Internal Server Error","message":message}),
                )),
                _ => None,
            };
        }
        if let Some(rusqlite::Error::SqliteFailure(code, message)) =
            error.downcast_ref::<rusqlite::Error>()
        {
            let name = match code.extended_code {
                275 => "SQLITE_CONSTRAINT_CHECK",
                531 => "SQLITE_CONSTRAINT_COMMITHOOK",
                787 => "SQLITE_CONSTRAINT_FOREIGNKEY",
                1043 => "SQLITE_CONSTRAINT_FUNCTION",
                1299 => "SQLITE_CONSTRAINT_NOTNULL",
                1555 => "SQLITE_CONSTRAINT_PRIMARYKEY",
                1811 => "SQLITE_CONSTRAINT_TRIGGER",
                2067 => "SQLITE_CONSTRAINT_UNIQUE",
                2323 => "SQLITE_CONSTRAINT_VTAB",
                2579 => "SQLITE_CONSTRAINT_ROWID",
                3091 => "SQLITE_CONSTRAINT_DATATYPE",
                value => match value & 255 {
                    5 => "SQLITE_BUSY",
                    6 => "SQLITE_LOCKED",
                    8 => "SQLITE_READONLY",
                    10 => "SQLITE_IOERR",
                    11 => "SQLITE_CORRUPT",
                    13 => "SQLITE_FULL",
                    14 => "SQLITE_CANTOPEN",
                    17 => "SQLITE_SCHEMA",
                    18 => "SQLITE_TOOBIG",
                    19 => "SQLITE_CONSTRAINT",
                    23 => "SQLITE_AUTH",
                    26 => "SQLITE_NOTADB",
                    _ => "SQLITE_ERROR",
                },
            };
            return Some(response(
                500,
                json!({"statusCode":500,"code":name,"error":"Internal Server Error","message":message.as_deref().unwrap_or("database error")}),
            ));
        }
        None
    }
    operation(error.as_ref()).unwrap_or_else(|| auth::database_failure(error))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reason_limits_follow_installed_zod_codepoints_and_reject_null_fields() {
        assert_eq!(halt_reason(&Value::Null), Ok(None));
        assert_eq!(halt_reason(&json!({"ignored":7})), Ok(None));
        assert_eq!(
            halt_reason(&json!({"reason":"\u{feff} fine \u{a0}"})),
            Ok(Some("fine".into()))
        );
        assert!(halt_reason(&json!({"reason":"😀".repeat(500)})).is_ok());
        for value in [
            json!({"reason":"😀".repeat(501)}),
            json!({"reason":null}),
            json!({"reason":1}),
            json!([]),
            json!(""),
        ] {
            assert!(halt_reason(&value).is_err(), "{value}");
        }
    }
}
