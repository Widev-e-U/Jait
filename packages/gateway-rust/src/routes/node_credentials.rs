//! Port of the `/api/nodes/:id/credential` routes in `packages/gateway/src/server.ts`.
//!
//! POST issues a revocable node credential for a node the caller owns; DELETE
//! revokes every credential for that node. Unowned or unknown nodes are 404.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
};
use serde_json::json;

use crate::{
    routes::auth::{self, AuthState},
    services::node_credentials::NodeCredentialsService,
};

#[derive(Clone)]
pub struct NodeCredentialRoutes {
    pub auth: AuthState,
}

impl NodeCredentialRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/nodes/{id}/credential", post(issue).delete(revoke))
            .with_state(self)
    }
}

fn not_found() -> Response {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": "Node not found" })),
    )
        .into_response()
}

fn internal() -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": "INTERNAL_ERROR" })),
    )
        .into_response()
}

async fn issue(
    State(state): State<NodeCredentialRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    if !state.auth.origin_allowed(&headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "ORIGIN_FORBIDDEN" })),
        )
            .into_response();
    }
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let result = state
        .auth
        .with_database(move |db| NodeCredentialsService::new(Some(db)).issue(&id, &user.id))
        .await;
    match result {
        Ok(Some(credential)) => Json(json!({ "credential": credential })).into_response(),
        Ok(None) => not_found(),
        Err(_) => internal(),
    }
}

async fn revoke(
    State(state): State<NodeCredentialRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    if !state.auth.origin_allowed(&headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "ORIGIN_FORBIDDEN" })),
        )
            .into_response();
    }
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let result = state
        .auth
        .with_database(move |db| {
            NodeCredentialsService::new(Some(db))
                .revoke(&id, &user.id)
                .map_err(Into::into)
        })
        .await;
    match result {
        Ok(true) => Json(json!({ "ok": true })).into_response(),
        Ok(false) => not_found(),
        Err(_) => internal(),
    }
}
