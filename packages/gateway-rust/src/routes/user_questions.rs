//! Explicitly mounted authenticated question request API.
use super::auth::{self, AuthState, response};
use crate::{services::input_requests::UserQuestionService, text::js_trim};
use axum::{
    Router,
    extract::{Request, State},
    response::Response,
    routing::{get, post},
};
use serde_json::{Value, json};
#[derive(Clone)]
pub struct UserQuestionRoutes {
    pub auth: AuthState,
    pub questions: UserQuestionService,
}
impl UserQuestionRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/user-questions/requests", get(handle))
            .route("/api/user-questions/requests/{id}/submit", post(handle))
            .route("/api/user-questions/requests/{id}/cancel", post(handle))
            .with_state(self)
    }
}
fn normalize_answers(value: &Value) -> Option<Value> {
    let entries: Vec<(String, &Value)> = match value {
        Value::Object(map) => map.iter().map(|(k, v)| (k.clone(), v)).collect(),
        Value::Array(array) => array
            .iter()
            .enumerate()
            .map(|(i, v)| (i.to_string(), v))
            .collect(),
        _ => return None,
    };
    let mut out = serde_json::Map::new();
    for (key, answer) in entries {
        // The source writes to a plain object; __proto__ changes its prototype
        // and does not become an own serialized answer property.
        if key == "__proto__" || !matches!(answer, Value::Object(_) | Value::Array(_)) {
            continue;
        }
        let selected = answer["selected"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter(|v| v.is_string())
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let free = answer["freeText"]
            .as_str()
            .filter(|s| !js_trim(s).is_empty());
        out.insert(
            key,
            json!({"selected":selected,"freeText":free,"skipped":answer["skipped"]==true}),
        );
    }
    Some(Value::Object(out))
}
async fn handle(State(state): State<UserQuestionRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    let path = request.uri().path().to_string();
    let query = request.uri().query().unwrap_or("").to_string();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(r) => return *r,
    };
    if path == "/api/user-questions/requests" {
        let sessions = url::form_urlencoded::parse(query.as_bytes())
            .filter(|(k, _)| k == "sessionId")
            .map(|(_, v)| v.into_owned())
            .collect::<Vec<_>>();
        let session = if sessions.len() == 1 {
            Some(sessions[0].as_str())
        } else {
            None
        };
        return response(
            200,
            json!({"requests":state.questions.list_pending(session,Some(&user.id))}),
        );
    }
    let remainder = path.trim_start_matches("/api/user-questions/requests/");
    let (id, operation) = remainder.rsplit_once('/').expect("matched route");
    let id = percent_encoding::percent_decode_str(id).decode_utf8_lossy();
    let ok = if operation == "submit" {
        let Some(answers) = normalize_answers(&body["answers"]) else {
            return response(400, json!({"error":"answers object is required"}));
        };
        state
            .questions
            .submit(&id, json!({"answers":answers}), Some(&user.id))
    } else {
        state.questions.cancel(&id, Some(&user.id))
    };
    if ok {
        response(200, json!({"ok":true}))
    } else {
        response(404, json!({"error":"Question request not found"}))
    }
}
