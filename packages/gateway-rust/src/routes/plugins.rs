//! Opt-in plugin REST presentation over an explicit manager port.
//! Loading, filesystem access and plugin execution remain manager responsibilities.
use super::auth::{self, AuthState, response};
use crate::services::calendar::{js_text, truthy};
use axum::{
    Router,
    extract::{Request, State},
    http::{Method, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json, value::RawValue};
use std::{collections::BTreeMap, sync::Arc};

/// Raw JSON values retain JavaScript's UTF-16 string-index spread semantics.
pub type PluginConfig = BTreeMap<String, Box<RawValue>>;
#[derive(Clone, Debug)]
pub enum PluginOperation {
    List,
    Get(String),
    Enable(String),
    Disable(String),
    Uninstall(String),
    GetConfig(String),
    SetConfig(String, PluginConfig),
    SyncAndLoad,
}
#[derive(Clone, Debug)]
pub enum PluginError {
    Message(String),
    Thrown(Value),
}
impl PluginError {
    fn message(self) -> String {
        match self {
            Self::Message(s) => s,
            Self::Thrown(v) => js_text(&v),
        }
    }
}
pub type PluginManagerPort =
    Arc<dyn Fn(PluginOperation) -> BoxFuture<'static, Result<Value, PluginError>> + Send + Sync>;
#[derive(Clone)]
pub struct PluginRoutes {
    pub auth: AuthState,
    pub manager: PluginManagerPort,
}
impl PluginRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/plugins", get(handle))
            // Fastify still resolves GET/DELETE scan as an ordinary plugin ID.
            .route("/api/plugins/scan", post(handle).get(handle).delete(handle))
            .route("/api/plugins/{id}", get(handle).delete(handle))
            .route("/api/plugins/{id}/enable", post(handle))
            .route("/api/plugins/{id}/disable", post(handle))
            .route("/api/plugins/{id}/config", get(handle).patch(handle))
            .with_state(self)
    }
}
fn failure(error: PluginError, caught: bool) -> Response {
    let message = error.message();
    if caught {
        response(400, json!({"error":message}))
    } else {
        response(
            500,
            json!({"statusCode":500,"error":"Internal Server Error","message":message}),
        )
    }
}
fn spread(value: &Value, target: &mut PluginConfig) {
    target.extend(crate::contracts::bounded_json::object_spread(value));
}

async fn handle(State(state): State<PluginRoutes>, request: Request) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let encoded = path.strip_prefix("/api/plugins/").unwrap_or("");
    let (encoded_id, action) = encoded.split_once('/').unwrap_or((encoded, ""));
    let malformed_percent = encoded_id.as_bytes().iter().enumerate().any(|(i, b)| {
        *b == b'%'
            && (encoded_id
                .as_bytes()
                .get(i + 1)
                .is_none_or(|b| !b.is_ascii_hexdigit())
                || encoded_id
                    .as_bytes()
                    .get(i + 2)
                    .is_none_or(|b| !b.is_ascii_hexdigit()))
    });
    let id = match percent_encoding::percent_decode_str(encoded_id).decode_utf8() {
        Ok(id) if !malformed_percent => id.into_owned(),
        _ => {
            return response(
                400,
                json!({"error":"Bad Request","code":"FST_ERR_BAD_URL","message":format!("'{path}' is not a valid url component"),"statusCode":400}),
            );
        }
    };
    let headers = request.headers().clone();
    // Fastify parses the body before invoking the route's authentication hook.
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(error) => return *error,
    };
    if let Err(error) = auth::require_user(&state.auth, &headers).await {
        return *error;
    }
    let caught = method == Method::DELETE
        || method == Method::PATCH
        || matches!(action, "enable" | "disable");
    let result: Result<Response, PluginError> = async {
        if path == "/api/plugins" {
            return (state.manager)(PluginOperation::List)
                .await
                .map(|v| response(200, v));
        }
        if path == "/api/plugins/scan" && method == Method::POST {
            (state.manager)(PluginOperation::SyncAndLoad).await?;
            return (state.manager)(PluginOperation::List)
                .await
                .map(|v| response(200, v));
        }
        match (method, action) {
            (Method::GET, "" | "config") => {
                let plugin = (state.manager)(PluginOperation::Get(id)).await?;
                if !truthy(&plugin) {
                    return Ok(response(404, json!({"error":"Plugin not found"})));
                }
                Ok(response(
                    200,
                    if action == "config" {
                        plugin["config"].clone()
                    } else {
                        plugin
                    },
                ))
            }
            (Method::POST, "enable") => (state.manager)(PluginOperation::Enable(id))
                .await
                .map(|v| response(200, v)),
            (Method::POST, "disable") => (state.manager)(PluginOperation::Disable(id))
                .await
                .map(|v| response(200, v)),
            (Method::DELETE, "") => {
                (state.manager)(PluginOperation::Uninstall(id)).await?;
                Ok(response(200, json!({"ok":true})))
            }
            (Method::PATCH, "config") => {
                let current = (state.manager)(PluginOperation::GetConfig(id.clone())).await?;
                let mut merged = PluginConfig::new();
                spread(&current, &mut merged);
                spread(&body, &mut merged);
                let raw = serde_json::to_string(&merged).expect("raw plugin config");
                (state.manager)(PluginOperation::SetConfig(id, merged)).await?;
                Ok((
                    [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
                    raw,
                )
                    .into_response())
            }
            _ => unreachable!("registered plugin method"),
        }
    }
    .await;
    match result {
        Ok(response) => response,
        Err(error) => failure(error, caught),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn string_spread_keeps_each_utf16_unit_and_shallow_overrides() {
        let mut config = PluginConfig::new();
        spread(&json!({"keep":1,"nested":{"old":true}}), &mut config);
        spread(&json!("😀"), &mut config);
        spread(&json!({"nested":{"new":true}}), &mut config);
        assert_eq!(config["0"].get(), r#""\ud83d""#);
        assert_eq!(config["1"].get(), r#""\ude00""#);
        assert_eq!(config["nested"].get(), r#"{"new":true}"#);
        assert_eq!(config["keep"].get(), "1");
    }
}
