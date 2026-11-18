//! Opt-in authenticated project architecture HTTP routes.
use super::auth::{self, AuthState, response};
use crate::{services::architecture_diagrams::ArchitectureDiagramService, text::js_trim};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::get,
};
use serde_json::{Value, json};
#[derive(Clone)]
pub struct ArchitectureRoutes {
    pub auth: AuthState,
}
impl ArchitectureRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/architecture", get(handle).put(handle))
            .with_state(self)
    }
}
fn trimmed(value: Option<&Value>, field: &str) -> Result<Option<String>, Box<Response>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(js_trim(s).into())),
        _ => Err(Box::new(response(
            500,
            json!({"statusCode":500,"error":"Internal Server Error",
            "message":format!("{field}?.trim is not a function. (In '{field}?.trim()', '{field}?.trim' is undefined)")}),
        ))),
    }
}
fn failure(error: &auth::Error) -> Response {
    use crate::db::worker::DatabaseError;
    let source = match error.downcast_ref::<DatabaseError>() {
        Some(DatabaseError::Operation(source)) => source.as_ref(),
        _ => return auth::database_failure(error),
    };
    if let Some(error) = source.downcast_ref::<crate::security::path_guard::PathTraversalError>() {
        return response(
            500,
            json!({"statusCode":500,"code":"PATH_TRAVERSAL","error":"Internal Server Error","message":error.message}),
        );
    }
    if let Some(rusqlite::Error::SqliteFailure(code, Some(message))) =
        source.downcast_ref::<rusqlite::Error>()
    {
        let code = match code.extended_code {
            1811 => "SQLITE_CONSTRAINT_TRIGGER",
            1555 => "SQLITE_CONSTRAINT_PRIMARYKEY",
            2067 => "SQLITE_CONSTRAINT_UNIQUE",
            1299 => "SQLITE_CONSTRAINT_NOTNULL",
            787 => "SQLITE_CONSTRAINT_FOREIGNKEY",
            275 => "SQLITE_CONSTRAINT_CHECK",
            19 => "SQLITE_CONSTRAINT",
            1 => "SQLITE_ERROR",
            8 => "SQLITE_READONLY",
            5 => "SQLITE_BUSY",
            6 => "SQLITE_LOCKED",
            10 => "SQLITE_IOERR",
            11 => "SQLITE_CORRUPT",
            13 => "SQLITE_FULL",
            14 => "SQLITE_CANTOPEN",
            _ => return auth::database_failure(error),
        };
        return response(
            500,
            json!({"statusCode":500,"code":code,"error":"Internal Server Error","message":message}),
        );
    }
    auth::database_failure(error)
}
fn projected(record: Option<Value>) -> Value {
    record.map(|r|json!({"projectRoot":r["projectRoot"],"diagram":r["diagram"],"filePath":r["filePath"],"updatedAt":r["updatedAt"]})).unwrap_or(Value::Null)
}
async fn handle(State(state): State<ArchitectureRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    let method = request.method().clone();
    let is_get = method == Method::GET || method == Method::HEAD;
    let mut query = serde_json::Map::new();
    for (key, value) in url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes())
    {
        let key = key.into_owned();
        if let Some(prior) = query.get_mut(&key) {
            match prior {
                Value::Array(values) => values.push(json!(value)),
                prior => {
                    let first = prior.clone();
                    *prior = json!([first, value]);
                }
            }
        } else {
            query.insert(key, json!(value));
        }
    }
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(error) => {
            return if error.status() == 415 {
                response(
                    415,
                    json!({"statusCode":415,"code":"FST_ERR_CTP_INVALID_MEDIA_TYPE","error":"Unsupported Media Type","message":"Unsupported Media Type"}),
                )
            } else {
                *error
            };
        }
    };
    let root = if is_get {
        trimmed(query.get("projectRoot"), "request.query.projectRoot")
    } else {
        trimmed(body.get("projectRoot"), "body.projectRoot")
    };
    let diagram = if method == Method::PUT {
        trimmed(body.get("diagram"), "body.diagram")
    } else {
        Ok(None)
    };
    let root = match root {
        Ok(value) => value,
        Err(error) => return *error,
    };
    let diagram = match diagram {
        Ok(value) => value,
        Err(error) => return *error,
    };
    let Some(root) = root.filter(|s| !s.is_empty()) else {
        return response(400, json!({"error":"projectRoot is required"}));
    };
    if method == Method::PUT && diagram.as_deref().is_none_or(str::is_empty) {
        return response(400, json!({"error":"diagram is required"}));
    }
    let result = state
        .auth
        .with_database(move |db| {
            let service = ArchitectureDiagramService::new(db);
            let record = if is_get {
                service.get_by_project(&root, Some(&user.id))?
            } else {
                Some(service.save(&root, diagram.as_deref().unwrap(), Some(&user.id))?)
            };
            Ok(response(200, json!({"diagram":projected(record)})))
        })
        .await;
    match result {
        Ok(response) => response,
        Err(error) => failure(&error),
    }
}
