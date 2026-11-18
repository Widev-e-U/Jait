//! Trust inspection/reset routes retain the server's authenticated origin boundary.
use super::auth::{self, AuthState, response};
use crate::{db::worker::DatabaseError, security::trust_worker::TrustWorker};
use axum::{
    Router,
    extract::{Request, State},
    response::Response,
    routing::{get, post},
};
use serde_json::json;
#[derive(Clone)]
pub struct TrustRoutes {
    pub auth: AuthState,
    pub trust: TrustWorker,
}
impl TrustRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/trust/levels", get(handle))
            .route("/api/trust/levels/{action}", get(handle))
            .route("/api/trust/levels/{action}/reset", post(handle))
            .with_state(self)
    }
}
async fn handle(State(state): State<TrustRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(error) = auth::require_user(&state.auth, &headers).await {
        return *error;
    }
    let path = request.uri().path().to_string();
    if let Err(error) = auth::parse_body(request.into_body(), &headers).await {
        return *error;
    }
    if path == "/api/trust/levels" {
        return match state.trust.list().await {
            Ok(levels) => response(200, json!({"levels":levels})),
            Err(error) => failure(error),
        };
    }
    let action = path.trim_start_matches("/api/trust/levels/");
    let reset = action.ends_with("/reset");
    let action = if reset {
        action.strip_suffix("/reset").unwrap()
    } else {
        action
    };
    let action = percent_encoding::percent_decode_str(action)
        .decode_utf8_lossy()
        .into_owned();
    match if reset {
        state.trust.reset(action).await
    } else {
        state.trust.get(action).await
    } {
        Ok(level) => response(200, json!(level)),
        Err(error) => failure(error),
    }
}
fn failure(error: DatabaseError) -> Response {
    auth::database_failure(&(Box::new(error) as auth::Error))
}
