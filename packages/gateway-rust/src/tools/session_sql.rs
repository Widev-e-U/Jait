//! Session SQL presentation adapter. The host must supply the bounded read-only
//! service; this module never opens a database or executes caller-provided SQL.
use crate::{db::worker::DatabaseError, services::session_sql::SessionSqlWorker};
use crate::{
    services::calendar::{js_text, truthy},
    text::js_trim,
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};
#[derive(Clone, Debug, PartialEq)]
pub enum SessionSqlRequest {
    Schema,
    Query {
        sql: String,
        max_rows: Option<Value>,
    },
}
/// Required result shape is the SessionSqlService union. Errors from the service
/// propagate, just as they do from the reference tool's async execute callback.
pub type Backend =
    Arc<dyn Fn(SessionSqlRequest) -> BoxFuture<'static, Result<Value, String>> + Send + Sync>;
pub struct SessionSqlTool {
    backend: Backend,
}
impl SessionSqlTool {
    pub fn new(backend: Backend) -> Self {
        Self { backend }
    }
    /// Uses the real native SQL policy/engine on an explicitly supplied DB worker.
    pub fn with_service(service: SessionSqlWorker) -> Self {
        Self::new(Arc::new(move |request| {
            let service = service.clone();
            Box::pin(async move {
                let result = match request {
                    SessionSqlRequest::Schema => service.schema().await,
                    SessionSqlRequest::Query { sql, max_rows } => {
                        let mut input = json!({"sql":sql});
                        if let Some(max_rows) = max_rows {
                            input["maxRows"] = max_rows;
                        }
                        service.query(input).await
                    }
                };
                result.map_err(|error| match error {
                    DatabaseError::Operation(cause) => cause.to_string(),
                    other => other.to_string(),
                })
            })
        }))
    }
    pub fn metadata(&self) -> &'static Value {
        metadata()
    }
    pub async fn execute(&self, input: &Value) -> Result<Value, String> {
        if input["mode"] == "schema" {
            let result = (self.backend)(SessionSqlRequest::Schema).await?;
            return Ok(if !truthy(&result["ok"]) {
                failure(&result)
            } else {
                summary(result["data"].clone())
            });
        }
        let Some(sql) = input
            .get("sql")
            .and_then(Value::as_str)
            .filter(|s| !js_trim(s).is_empty())
        else {
            return Ok(
                json!({"ok":false,"message":"Provide a sql SELECT statement, or mode:\"schema\" to discover the database schema.","data":{"error":"invalid_input"}}),
            );
        };
        let result = (self.backend)(SessionSqlRequest::Query {
            sql: sql.into(),
            max_rows: input.get("max_rows").cloned(),
        })
        .await?;
        if !truthy(&result["ok"]) {
            return Ok(failure(&result));
        }
        let data = &result["data"];
        if !data.as_object().is_some_and(|o| o.contains_key("rowCount")) {
            return Ok(summary(data.clone()));
        }
        Ok(
            json!({"ok":true,"message":format!("Returned {} row(s){} from the session database.",js_text(&data["rowCount"]),if truthy(&data["truncated"]) {" (truncated to max_rows)"} else {""}),"data":data}),
        )
    }
}
fn failure(result: &Value) -> Value {
    json!({"ok":false,"message":result["message"],"data":{"error":result["error"]}})
}
fn summary(data: Value) -> Value {
    json!({"ok":true,"message":"Session database schema summary.","data":data})
}
pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("session-sql-metadata.json"))
            .expect("session SQL metadata")
    });
    &DATA
}
