//! Explicitly mounted, authenticated assistant profile routes.
use super::auth::{self, AuthState, response};
use crate::{services::assistant_profiles::AssistantProfileService, text::js_trim};
use axum::{
    Router,
    extract::{Request, State},
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::{Value, json};
#[derive(Clone)]
pub struct AssistantProfileRoutes {
    pub auth: AuthState,
}
impl AssistantProfileRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/assistants/profiles", get(handle).post(handle))
            .route(
                "/api/assistants/profiles/{id}",
                get(handle).patch(handle).delete(handle),
            )
            .with_state(self)
    }
}
fn filtered(body: &Value, create: bool) -> Value {
    let mut result = json!({});
    if let Some(s) = body["name"].as_str() {
        result["name"] = json!(s);
    }
    for key in ["description", "systemPrompt", "toolProfile", "runtimeMode"] {
        let v = &body[key];
        let valid =
            v.is_string() && (key != "runtimeMode" || v == "full-access" || v == "supervised");
        if valid {
            result[key] = v.clone();
        } else if create || body.get(key) == Some(&Value::Null) {
            result[key] = Value::Null;
        }
    }
    for key in ["enabledSkills", "enabledPlugins"] {
        if let Some(a) = body[key].as_array() {
            result[key] = json!(a.iter().filter(|v| v.is_string()).collect::<Vec<_>>());
        } else if create {
            result[key] = json!([]);
        }
    }
    if let Some(v) = body["isDefault"].as_bool() {
        result["isDefault"] = json!(v);
    } else if create {
        result["isDefault"] = json!(false);
    }
    result
}
async fn handle(State(state): State<AssistantProfileRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(v) => v,
        Err(e) => return *e,
    };
    let method = request.method().clone();
    let id = request
        .uri()
        .path()
        .strip_prefix("/api/assistants/profiles/")
        .map(|id| {
            percent_encoding::percent_decode_str(id)
                .decode_utf8_lossy()
                .into_owned()
        });
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(e) => return *e,
    };
    let result = state
        .auth
        .with_database(move |db| {
            let service = AssistantProfileService::new(db);
            let missing = || {
                response(
                    404,
                    json!({"error":"NOT_FOUND","details":"Assistant profile not found"}),
                )
            };
            Ok(match (method, id) {
                (Method::GET, None) => {
                    response(200, json!({"profiles":service.list(Some(&user.id))?}))
                }
                (Method::POST, None) => {
                    if js_trim(body["name"].as_str().unwrap_or("")).is_empty() {
                        response(
                            400,
                            json!({"error":"VALIDATION_ERROR","details":"name is required"}),
                        )
                    } else {
                        response(
                            201,
                            json!({"profile":service.create(&user.id,&filtered(&body,true))?}),
                        )
                    }
                }
                (Method::GET, Some(id)) => service
                    .get(&id, Some(&user.id))?
                    .map(|p| response(200, json!({"profile":p})))
                    .unwrap_or_else(missing),
                (Method::PATCH, Some(id)) => service
                    .update(&id, &user.id, &filtered(&body, false))?
                    .map(|p| response(200, json!({"profile":p})))
                    .unwrap_or_else(missing),
                (Method::DELETE, Some(id)) => {
                    if service.delete(&id, &user.id)? {
                        StatusCode::NO_CONTENT.into_response()
                    } else {
                        missing()
                    }
                }
                _ => missing(),
            })
        })
        .await;
    match result {
        Ok(v) => v,
        Err(e) => auth::database_failure(&e),
    }
}
