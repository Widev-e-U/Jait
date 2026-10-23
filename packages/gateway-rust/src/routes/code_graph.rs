//! Code-graph HTTP adapter. Project ownership is checked before graph access;
//! remote-node projects are refused until an authorized node adapter exists.
use super::auth::{self, AuthState, response};
use crate::{
    execution::process_runner::ProcessCancellation,
    services::{
        calendar::{js_text, truthy},
        code_graph::{
            engine::{ErrorKind, GraphError, path_join},
            service::CodeGraphService,
        },
    },
    text::js_trim,
};
use axum::{
    Router,
    extract::{Request, State},
    response::Response,
    routing::{get, post},
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{path::Path, sync::Arc};
pub trait CodeGraphBackend: Send + Sync {
    fn list_active_projects(&self, user: String) -> BoxFuture<'_, Result<Vec<Value>, GraphError>>;
    fn call(
        &self,
        method: &str,
        params: Value,
        signal: Option<ProcessCancellation>,
    ) -> BoxFuture<'_, Result<Value, GraphError>>;
}
pub type OwnedProjects =
    Arc<dyn Fn(String) -> BoxFuture<'static, Result<Vec<Value>, GraphError>> + Send + Sync>;
pub struct NativeCodeGraphBackend {
    pub service: Arc<CodeGraphService>,
    pub projects: OwnedProjects,
}
impl CodeGraphBackend for NativeCodeGraphBackend {
    fn list_active_projects(&self, user: String) -> BoxFuture<'_, Result<Vec<Value>, GraphError>> {
        (self.projects)(user)
    }
    fn call(
        &self,
        method: &str,
        params: Value,
        signal: Option<ProcessCancellation>,
    ) -> BoxFuture<'_, Result<Value, GraphError>> {
        let method = method.to_owned();
        Box::pin(async move {
            let root = params["projectRoot"].as_str().expect("owned root");
            let user = params["userId"].as_str();
            match method.as_str() {
                "getIndex" => self.service.get_index(root, user),
                "index" => {
                    self.service
                        .index(
                            root,
                            user.map(str::to_owned),
                            params["repositoryId"].as_str().map(str::to_owned),
                            signal,
                        )
                        .await
                }
                "snapshot" => {
                    self.service
                        .snapshot(root, user, params["maxNodes"].as_f64())
                        .await
                }
                "query" => self.service.query(root, user, &params).await,
                "shortestPath" => {
                    self.service
                        .shortest_path(
                            root,
                            user,
                            params["source"].as_str().unwrap_or(""),
                            params["target"].as_str().unwrap_or(""),
                            params["maxDepth"].as_f64(),
                        )
                        .await
                }
                _ => self.service.prepare_graph_rag(root, user).await,
            }
        })
    }
}
#[derive(Clone)]
pub struct CodeGraphRoutes {
    pub auth: AuthState,
    pub backend: Arc<dyn CodeGraphBackend>,
    /// Explicit host cwd for the reference's lexical path.resolve behavior.
    pub cwd: String,
}
impl CodeGraphRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/code-graph", get(handle))
            .route("/api/code-graph/index", post(handle))
            .route("/api/code-graph/snapshot", get(handle))
            .route("/api/code-graph/query", post(handle))
            .route("/api/code-graph/graphrag/prepare", post(handle))
            .route("/api/code-graph/path", post(handle))
            .with_state(self)
    }
}
fn normalize_root(text: &str) -> String {
    let root = js_trim(text)
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_owned();
    let bytes = root.as_bytes();
    if bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1..3] == *b":/" {
        root.to_lowercase()
    } else {
        root
    }
}
fn generic(error: GraphError) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":error.message}),
    )
}
fn graph_error(error: GraphError) -> Response {
    if error.kind == ErrorKind::Unavailable {
        return response(
            503,
            json!({"error":error.message,"code":"GRAPHIFY_UNAVAILABLE","installCommand":"jait doctor"}),
        );
    }
    if error.message.to_lowercase().contains("not been indexed") {
        return response(409, json!({"error":error.message,"code":"GRAPH_NOT_READY"}));
    }
    response(500, json!({"error":error.message}))
}
fn query_params(query: &str) -> Value {
    let mut out = json!({});
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        if let Some(existing) = out.get_mut(key.as_ref()) {
            if let Some(values) = existing.as_array_mut() {
                values.push(json!(value));
            } else {
                *existing = json!([existing.clone(), value]);
            }
        } else {
            out[key.as_ref()] = json!(value);
        }
    }
    out
}
fn integer_prefix(value: &Value) -> Option<Value> {
    if value.is_number() {
        return Some(value.clone());
    }
    let text = js_text(value);
    let value = js_trim(&text);
    let bytes = value.as_bytes();
    let sign = usize::from(bytes.first().is_some_and(|c| matches!(c, b'+' | b'-')));
    let count = bytes[sign..]
        .iter()
        .take_while(|b| b.is_ascii_digit())
        .count();
    if count == 0 {
        return None;
    }
    let n = value[..sign + count].parse::<f64>().ok()?;
    n.is_finite().then(|| json!(n))
}
fn repository_id(project: &Value) -> Value {
    let metadata = project["metadata"]
        .as_str()
        .and_then(|s| serde_json::from_str::<Value>(s).ok())
        .unwrap_or(Value::Null);
    let id = metadata
        .get("repositoryId")
        .filter(|v| !v.is_null())
        .or_else(|| metadata.get("repoId"));
    id.and_then(Value::as_str)
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .map(|s| json!(s))
        .unwrap_or(Value::Null)
}
struct CancelOnDrop(Option<ProcessCancellation>);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        if let Some(signal) = &self.0 {
            signal.cancel();
        }
    }
}
async fn handle(State(state): State<CodeGraphRoutes>, mut request: Request) -> Response {
    let signal = request
        .extensions()
        .get::<ProcessCancellation>()
        .cloned()
        .unwrap_or_default();
    let mut cancellation = CancelOnDrop(Some(signal.clone()));
    request.extensions_mut().insert(signal);
    let mut out = dispatch(state, request).await;
    cancellation.0 = None;
    if out
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .is_some_and(|v| v == "application/json")
    {
        out.headers_mut().insert(
            axum::http::header::CONTENT_TYPE,
            "application/json; charset=utf-8".parse().unwrap(),
        );
    }
    out
}

async fn dispatch(state: CodeGraphRoutes, request: Request) -> Response {
    let headers = request.headers().clone();
    let path = request.uri().path().to_owned();
    let query = query_params(request.uri().query().unwrap_or(""));
    let signal = request.extensions().get::<ProcessCancellation>().cloned();
    // Fastify rejects malformed/oversized bodies before invoking route auth.
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(out) => return *out,
    };
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(out) => return *out,
    };
    let mut input = query.clone();
    if let Some(body) = body.as_object() {
        for (key, value) in body {
            input[key] = value.clone();
        }
    }
    let project = input["projectRoot"]
        .as_str()
        .map(js_trim)
        .filter(|s| !s.is_empty());
    let Some(project) = project else {
        return response(400, json!({"error":"projectRoot is required"}));
    };
    let projects = match state.backend.list_active_projects(user.id.clone()).await {
        Ok(projects) => projects,
        Err(e) => return generic(e),
    };
    let project_key = normalize_root(project);
    let owned = projects.iter().find(|p| {
        p["rootPath"]
            .as_str()
            .is_some_and(|root| normalize_root(root) == project_key)
    });
    let Some(owned) = owned else {
        return response(404, json!({"error":"Project not found"}));
    };
    if truthy(&owned["nodeId"]) && owned["nodeId"] != "gateway" {
        return response(
            409,
            json!({"error":"Code graph indexing for remote projects must run on the project node","code":"REMOTE_GRAPH_UNSUPPORTED","nodeId":owned["nodeId"]}),
        );
    }
    let root = if Path::new(project).is_absolute() {
        path_join(&[project])
    } else {
        path_join(&[&state.cwd, project])
    };
    let mut params = json!({"projectRoot":root,"userId":user.id});
    let (method, wrapper) = match path.as_str() {
        "/api/code-graph" => ("getIndex", Some("index")),
        "/api/code-graph/index" => {
            params["repositoryId"] = repository_id(owned);
            ("index", Some("index"))
        }
        "/api/code-graph/snapshot" => {
            if let Some(limit) = integer_prefix(&query["maxNodes"]) {
                params["maxNodes"] = limit;
            }
            ("snapshot", Some("snapshot"))
        }
        "/api/code-graph/query" => {
            if body["query"].as_str().is_none_or(|s| js_trim(s).is_empty()) {
                return response(400, json!({"error":"query is required"}));
            }
            for key in ["query", "mode", "maxNodes", "maxDepth"] {
                if let Some(value) = body.get(key) {
                    params[key] = value.clone();
                }
            }
            ("query", Some("result"))
        }
        "/api/code-graph/path" => {
            if ["source", "target"]
                .iter()
                .any(|k| body[*k].as_str().is_none_or(|s| js_trim(s).is_empty()))
            {
                return response(400, json!({"error":"source and target are required"}));
            }
            for key in ["source", "target", "maxDepth"] {
                if let Some(value) = body.get(key) {
                    params[key] = value.clone();
                }
            }
            ("shortestPath", Some("result"))
        }
        _ => ("prepareGraphRag", None),
    };
    match state
        .backend
        .call(
            method,
            params,
            if method == "index" { signal } else { None },
        )
        .await
    {
        Ok(result) if method == "shortestPath" && result.is_null() => {
            response(404, json!({"error":"No graph path found"}))
        }
        Ok(result) => response(
            200,
            if let Some(key) = wrapper {
                json!({key:result})
            } else {
                result
            },
        ),
        Err(error) if method == "getIndex" => generic(error),
        Err(error) => graph_error(error),
    }
}
