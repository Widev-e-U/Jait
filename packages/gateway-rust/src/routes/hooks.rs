//! Secret-authenticated webhook endpoints with explicit runtime callbacks.
use super::auth::{parse_body, response};
use axum::{
    Router,
    extract::{Request, State},
    response::Response,
    routing::post,
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::Arc;
pub type HookCallback =
    Arc<dyn Fn(Value) -> BoxFuture<'static, Result<Option<Value>, String>> + Send + Sync>;
/// The emitter borrows the request payload so synchronous hook mutations reach
/// the subsequent runtime callback, as they do through shared JS object identity.
pub type HookEmission = Arc<dyn Fn(&str, &mut Value) -> Result<(), String> + Send + Sync>;
#[derive(Clone)]
pub struct HookRoutes {
    pub auth: super::auth::AuthState,
    pub hook_secret: String,
    pub emit: HookEmission,
    pub on_wake: HookCallback,
    pub on_agent: HookCallback,
}
impl HookRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/hooks/wake", post(handle))
            .route("/hooks/agent", post(handle))
            .with_state(self)
    }
}
async fn handle(State(state): State<HookRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if !state.auth.origin_allowed(&headers) {
        return response(403, json!({"error":"ORIGIN_FORBIDDEN"}));
    }
    let wake = request.uri().path() == "/hooks/wake";
    let body = match parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(r) => return *r,
    };
    // Node joins duplicate custom headers with a comma; only an exact token passes.
    let tokens = headers
        .get_all("x-hook-token")
        .iter()
        .map(|v| v.to_str())
        .collect::<Result<Vec<_>, _>>();
    let token = tokens.ok().map(|v| v.join(", "));
    if token.as_deref() != Some(&state.hook_secret) {
        return response(401, json!({"error":"UNAUTHORIZED"}));
    }
    let nullish_body = body.is_null();
    let mut payload = if wake {
        json!({"source":"webhook"})
    } else if body.is_null() {
        json!({})
    } else {
        body
    };
    let event = if wake { "hook.wake" } else { "hook.agent" };
    if let Err(e) = (state.emit)(event, &mut payload) {
        return failure(&e.to_string());
    }
    match if wake {
        (state.on_wake)(Value::Null)
    } else {
        (state.on_agent)(if nullish_body { json!({}) } else { payload })
    }
    .await
    {
        Ok(result) => {
            let mut out = json!({"ok":true});
            if let Some(result) = result {
                out["result"] = result;
            }
            response(200, out)
        }
        Err(e) => failure(&e),
    }
}
fn failure(message: &str) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":message}),
    )
}
