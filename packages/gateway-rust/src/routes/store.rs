//! Opt-in ClawHub store presentation. Registry, installer and local skill ownership
//! remain explicit authorized host ports; mounting performs no network or disk I/O.
use super::auth::{self, AuthState, response};
use crate::{
    execution::{command_timeout::number, process_runner::ProcessCancellation},
    security::http_auth::AuthUser,
    services::calendar::{js_text, truthy},
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, post},
};
use futures_util::future::{BoxFuture, join_all};
use serde_json::{Map, Value, json};
use std::{collections::BTreeMap, sync::Arc, time::Duration};

#[derive(Clone, Debug)]
pub enum StoreOperation {
    ListInstalled,
    Search {
        query: Value,
        limit: f64,
    },
    GetSkill(String),
    IsInstalled(String),
    Install {
        slug: String,
        version: Option<Value>,
    },
    Uninstall(String),
    ListPackages {
        limit: f64,
    },
}
#[derive(Clone, Debug)]
pub enum StoreError {
    Message(String),
    Thrown(Value),
}
impl StoreError {
    fn message(self) -> String {
        match self {
            Self::Message(s) => s,
            Self::Thrown(v) => js_text(&v),
        }
    }
}
/// Identity identifies the caller; it does not authorize any host effect.
#[derive(Clone)]
pub struct StoreContext {
    pub user: AuthUser,
    pub cancellation: ProcessCancellation,
}
pub type StorePort = Arc<
    dyn Fn(StoreContext, StoreOperation) -> BoxFuture<'static, Result<Value, StoreError>>
        + Send
        + Sync,
>;
struct CancelOnDrop(ProcessCancellation);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
#[derive(Clone)]
pub struct StoreRoutes {
    pub auth: AuthState,
    pub port: StorePort,
}
impl StoreRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/store/skills", get(handle))
            .route("/api/store/skills/{slug}", get(handle).delete(handle))
            .route("/api/store/skills/{slug}/install", post(handle))
            .route("/api/store/packages", get(handle))
            .with_state(self)
    }
}
fn spread(v: &Value) -> Map<String, Value> {
    match v {
        Value::Object(fields) => fields.clone(),
        Value::Array(items) => items
            .iter()
            .enumerate()
            .map(|(i, v)| (i.to_string(), v.clone()))
            .collect(),
        Value::String(s) => s
            .chars()
            .enumerate()
            .map(|(i, c)| (i.to_string(), json!(c.to_string())))
            .collect(),
        _ => Map::new(),
    }
}
fn query(raw: &str) -> BTreeMap<String, Value> {
    let mut fields = BTreeMap::new();
    for (key, value) in url::form_urlencoded::parse(raw.as_bytes()) {
        fields
            .entry(key.into_owned())
            .and_modify(|old| {
                if let Value::Array(items) = old {
                    items.push(json!(value));
                } else {
                    *old = json!([old.clone(), value]);
                }
            })
            .or_insert_with(|| json!(value));
    }
    fields
}
fn limit(fields: &BTreeMap<String, Value>) -> f64 {
    let parsed = fields
        .get("limit")
        .filter(|v| truthy(v))
        .map(|v| number(Some(v)))
        .unwrap_or(25.0);
    (if parsed.is_nan() || parsed == 0.0 {
        25.0
    } else {
        parsed
    })
    .min(100.0)
}
async fn run(
    state: &StoreRoutes,
    context: &StoreContext,
    method: &Method,
    path: &str,
    slug: String,
    params: BTreeMap<String, Value>,
    body: Value,
) -> Result<Value, StoreError> {
    let call = &state.port;
    if path == "/api/store/packages" {
        return Ok(
            json!({"items":call(context.clone(), StoreOperation::ListPackages { limit: limit(&params) }).await?}),
        );
    }
    if path == "/api/store/skills" {
        let installed = call(context.clone(), StoreOperation::ListInstalled).await?;
        let search = params
            .get("q")
            .filter(|v| truthy(v))
            .or_else(|| params.get("sort").filter(|v| truthy(v)))
            .cloned()
            .unwrap_or(json!("tool workflow agent"));
        let results = call(
            context.clone(),
            StoreOperation::Search {
                query: search,
                limit: limit(&params),
            },
        )
        .await?;
        let rows = results
            .as_array()
            .ok_or_else(|| StoreError::Message("results.map is not a function".into()))?;
        let enriched = join_all(rows.iter().map(|r| async {
            let slug = r
                .get("slug")
                .filter(|v| !v.is_null())
                .cloned()
                .unwrap_or(json!(""));
            let mut result = spread(r);
            let has = installed
                .as_array()
                .is_some_and(|items| items.iter().any(|s| s.get("id") == Some(&slug)));
            result.insert("installed".into(), json!(has));
            // Dropping a timed-out wait does not grant authority to repeat a host effect.
            if let Ok(Ok(detail)) = tokio::time::timeout(
                Duration::from_secs(3),
                call(context.clone(), StoreOperation::GetSkill(js_text(&slug))),
            )
            .await
            {
                if let Some(stats) = detail
                    .get("skill")
                    .and_then(|v| v.get("stats"))
                    .filter(|v| truthy(v))
                {
                    let mut values = Map::new();
                    for key in ["downloads", "stars"] {
                        if let Some(v) = stats.get(key) {
                            values.insert(key.into(), v.clone());
                        }
                    }
                    result.insert("stats".into(), Value::Object(values));
                }
                if let Some(version) = detail
                    .get("latestVersion")
                    .and_then(|v| v.get("version"))
                    .filter(|v| truthy(v))
                {
                    result.insert("latestVersion".into(), json!({"version":version}));
                }
            }
            Value::Object(result)
        }))
        .await;
        return Ok(json!({"results":enriched}));
    }
    match *method {
        Method::GET => {
            let detail = call(context.clone(), StoreOperation::GetSkill(slug.clone())).await?;
            let installed = call(context.clone(), StoreOperation::IsInstalled(slug)).await?;
            let mut result = spread(&detail);
            result.insert("installed".into(), installed);
            Ok(Value::Object(result))
        }
        Method::POST => Ok(
            json!({"ok":true,"skill":call(context.clone(), StoreOperation::Install {slug,version:body.get("version").cloned()}).await?}),
        ),
        Method::DELETE => {
            call(context.clone(), StoreOperation::Uninstall(slug)).await?;
            Ok(json!({"ok":true}))
        }
        _ => unreachable!(),
    }
}
async fn handle(State(state): State<StoreRoutes>, request: Request) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let params = query(request.uri().query().unwrap_or(""));
    let encoded = path.strip_prefix("/api/store/skills/").unwrap_or("");
    let encoded = if method == Method::POST {
        encoded.strip_suffix("/install").unwrap_or(encoded)
    } else {
        encoded
    };
    let malformed = encoded.as_bytes().iter().enumerate().any(|(i, b)| {
        *b == b'%'
            && (encoded
                .as_bytes()
                .get(i + 1)
                .is_none_or(|b| !b.is_ascii_hexdigit())
                || encoded
                    .as_bytes()
                    .get(i + 2)
                    .is_none_or(|b| !b.is_ascii_hexdigit()))
    });
    let slug = match percent_encoding::percent_decode_str(encoded).decode_utf8() {
        Ok(s) if !malformed => s.into_owned(),
        _ => {
            return response(
                400,
                json!({"error":"Bad Request","code":"FST_ERR_BAD_URL","message":format!("'{path}' is not a valid url component"),"statusCode":400}),
            );
        }
    };
    let headers = request.headers().clone();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(e) => return *e,
    };
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(e) => return *e,
    };
    let cancellation = ProcessCancellation::default();
    // This tracks the handler future's lifetime, not transport disconnect detection.
    let _guard = CancelOnDrop(cancellation.clone());
    let context = StoreContext { user, cancellation };
    match run(&state, &context, &method, &path, slug, params, body).await {
        Ok(v) => response(200, v),
        Err(error) => {
            let message = error.message();
            if method == Method::DELETE || method == Method::POST {
                let status = if method == Method::DELETE
                    && message.contains("not a ClawHub-installed skill")
                {
                    400
                } else {
                    500
                };
                response(status, json!({"error":message}))
            } else {
                response(
                    500,
                    json!({"statusCode":500,"error":"Internal Server Error","message":message}),
                )
            }
        }
    }
}

#[cfg(test)]
mod request_context_tests {
    use super::*;
    use crate::{db, security::http_auth};
    use axum::body::Body;
    use tokio::sync::mpsc;

    fn request(user: &AuthUser) -> Request {
        let token = http_auth::sign_auth_token(user, "store-context-test").unwrap();
        Request::builder()
            .uri("/api/store/packages")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap()
    }

    #[tokio::test]
    async fn request_identity_and_cancellation_are_isolated() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db::migrate_database(&db).unwrap();
        db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('first','alice','fixture','old','old'),('second','bob','fixture','old','old')").unwrap();
        let auth = AuthState::new(db, "store-context-test".into()).unwrap();
        let (tx, mut rx) = mpsc::unbounded_channel();
        let port: StorePort = Arc::new(move |context, _| {
            tx.send(context.clone()).unwrap();
            Box::pin(async move {
                if context.user.id == "first" {
                    std::future::pending::<()>().await;
                }
                Ok(json!([]))
            })
        });
        let state = StoreRoutes {
            auth: auth.clone(),
            port,
        };
        let first = AuthUser {
            id: "first".into(),
            username: "alice".into(),
        };
        let second = AuthUser {
            id: "second".into(),
            username: "bob".into(),
        };
        let first_task = tokio::spawn(handle(State(state.clone()), request(&first)));
        let first_context = rx.recv().await.unwrap();
        assert_eq!(first_context.user, first);
        assert!(!first_context.cancellation.is_cancelled());
        let response = handle(State(state), request(&second)).await;
        assert_eq!(response.status(), 200);
        let second_context = rx.recv().await.unwrap();
        assert_eq!(second_context.user, second);
        assert!(second_context.cancellation.is_cancelled());
        assert!(!first_context.cancellation.is_cancelled());
        first_task.abort();
        assert!(first_task.await.unwrap_err().is_cancelled());
        assert!(first_context.cancellation.is_cancelled());
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn non_array_search_result_fails_before_detail_lookups() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db::migrate_database(&db).unwrap();
        db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old')").unwrap();
        let auth = AuthState::new(db, "store-context-test".into()).unwrap();
        let (tx, mut rx) = mpsc::unbounded_channel();
        let port: StorePort = Arc::new(move |context, op| {
            tx.send((context.cancellation, op.clone())).unwrap();
            Box::pin(async move {
                match op {
                    StoreOperation::ListInstalled => Ok(json!([])),
                    StoreOperation::Search { .. } => Ok(json!({"unexpected": true})),
                    _ => panic!("search error must not start detail lookups"),
                }
            })
        });
        let user = AuthUser {
            id: "owner".into(),
            username: "alice".into(),
        };
        let mut req = request(&user);
        *req.uri_mut() = "/api/store/skills".parse().unwrap();
        let response = handle(
            State(StoreRoutes {
                auth: auth.clone(),
                port,
            }),
            req,
        )
        .await;
        assert_eq!(response.status(), 500);
        let body = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({"statusCode":500,"error":"Internal Server Error","message":"results.map is not a function"})
        );
        let first = rx.recv().await.unwrap();
        let second = rx.recv().await.unwrap();
        assert!(matches!(first.1, StoreOperation::ListInstalled));
        assert!(matches!(second.1, StoreOperation::Search { .. }));
        assert!(first.0.is_cancelled());
        assert!(second.0.is_cancelled());
        assert!(rx.try_recv().is_err());
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn aborting_search_cancels_all_pending_detail_lookups() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db::migrate_database(&db).unwrap();
        db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old')").unwrap();
        let auth = AuthState::new(db, "store-context-test".into()).unwrap();
        let (tx, mut rx) = mpsc::unbounded_channel();
        let port: StorePort = Arc::new(move |context, op| {
            let tx = tx.clone();
            Box::pin(async move {
                match op {
                    StoreOperation::ListInstalled => Ok(json!([])),
                    StoreOperation::Search { .. } => {
                        Ok(json!([{ "slug": "one" }, { "slug": "two" }]))
                    }
                    StoreOperation::GetSkill(slug) => {
                        tx.send((slug, context.cancellation)).unwrap();
                        std::future::pending().await
                    }
                    _ => panic!("unexpected operation"),
                }
            })
        });
        let user = AuthUser {
            id: "owner".into(),
            username: "alice".into(),
        };
        let mut req = request(&user);
        *req.uri_mut() = "/api/store/skills".parse().unwrap();
        let task = tokio::spawn(handle(
            State(StoreRoutes {
                auth: auth.clone(),
                port,
            }),
            req,
        ));
        let first = tokio::time::timeout(Duration::from_secs(1), rx.recv())
            .await
            .unwrap()
            .unwrap();
        let second = tokio::time::timeout(Duration::from_secs(1), rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert_ne!(first.0, second.0);
        assert!(!first.1.is_cancelled());
        assert!(!second.1.is_cancelled());
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(first.1.is_cancelled());
        assert!(second.1.is_cancelled());
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn every_detail_operation_receives_the_request_context() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db::migrate_database(&db).unwrap();
        db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','fixture','old','old')").unwrap();
        let auth = AuthState::new(db, "store-context-test".into()).unwrap();
        let (tx, mut rx) = mpsc::unbounded_channel();
        let port: StorePort = Arc::new(move |context, op| {
            tx.send(context).unwrap();
            Box::pin(async move {
                Ok(match op {
                    StoreOperation::GetSkill(_) => json!({"name":"skill"}),
                    StoreOperation::IsInstalled(_) => json!(true),
                    _ => panic!("unexpected operation"),
                })
            })
        });
        let user = AuthUser {
            id: "owner".into(),
            username: "alice".into(),
        };
        let mut req = request(&user);
        *req.uri_mut() = "/api/store/skills/example".parse().unwrap();
        let response = handle(
            State(StoreRoutes {
                auth: auth.clone(),
                port,
            }),
            req,
        )
        .await;
        assert_eq!(response.status(), 200);
        let first = rx.recv().await.unwrap();
        let second = rx.recv().await.unwrap();
        assert_eq!(first.user, user);
        assert_eq!(second.user, user);
        assert!(first.cancellation.is_cancelled());
        assert!(second.cancellation.is_cancelled());
        auth.shutdown().await.unwrap();
    }
}
