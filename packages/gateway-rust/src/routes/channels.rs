//! Authenticated channel presentation; connector/network and credential persistence
//! remain explicit host effects. Mounting never starts a connector.
use super::auth::{self, AuthState, response};
use crate::contracts::bounded_json::object_spread;
use crate::{
    integrations::channel_contracts::{ChannelPairOptions, ChannelStatus},
    services::calendar::js_text,
    text::js_trim,
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use futures_util::future::BoxFuture;
use serde::Serialize;
use serde_json::value::{RawValue, to_raw_value};
use serde_json::{Map, Value, json};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug)]
pub enum ChannelError {
    Message(String),
    Thrown(Value),
}
impl ChannelError {
    fn message(self) -> String {
        match self {
            Self::Message(s) => s,
            Self::Thrown(v) => js_text(&v),
        }
    }
}
/// Shared identity is intentional: pair mutates the record retained before await.
#[derive(Clone, Debug)]
pub struct ManagedChannel {
    pub id: String,
    pub status: ChannelStatus,
    pub detail: Map<String, Value>,
}
/// Raw values retain arbitrary config fields and string-spread UTF-16 units.
pub type ChannelFields = std::collections::BTreeMap<String, Box<RawValue>>;
fn raw(value: impl Serialize) -> Box<RawValue> {
    to_raw_value(&value).expect("serializable channel JSON")
}
pub type ChannelRecord = Arc<Mutex<ManagedChannel>>;
pub type ChannelResult<T> = Result<T, ChannelError>;
pub trait ChannelHost: Send + Sync {
    fn list(&self) -> ChannelResult<Vec<ChannelFields>>;
    fn get(&self, id: &str) -> ChannelResult<Option<ChannelRecord>>;
    fn config(&self, id: &str) -> ChannelResult<ChannelFields>;
    fn set_config(&self, id: &str, patch: ChannelFields) -> ChannelResult<ChannelFields>;
    fn current_qr(&self, id: &str) -> ChannelResult<Value>;
    fn setup(&self, id: String) -> BoxFuture<'_, ChannelResult<Option<Value>>>;
    fn start(&self, id: String, options: ChannelPairOptions) -> BoxFuture<'_, ChannelResult<()>>;
    fn stop(&self, id: String) -> BoxFuture<'_, ChannelResult<()>>;
    fn pair(&self, id: String, options: ChannelPairOptions) -> BoxFuture<'_, ChannelResult<()>>;
}
#[derive(Clone)]
pub struct ChannelRoutes {
    pub auth: AuthState,
    pub host: Arc<dyn ChannelHost>,
}
impl ChannelRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/channels", get(handle))
            .route("/api/channels/{id}/status", get(handle))
            .route("/api/channels/{id}/setup", get(handle))
            .route("/api/channels/{id}/start", post(handle))
            .route("/api/channels/{id}/stop", post(handle))
            .route("/api/channels/{id}/pair", post(handle))
            .route("/api/channels/{id}/config", patch(handle))
            .with_state(self)
    }
}
fn public_config(mut fields: ChannelFields) -> ChannelResult<ChannelFields> {
    let token = fields.remove("token");
    let token = token
        .map(|v| serde_json::from_str::<Option<String>>(v.get()))
        .transpose()
        .map_err(|_| ChannelError::Message("token?.trim is not a function".into()))?
        .flatten();
    fields.insert(
        "tokenSet".into(),
        raw(token.is_some_and(|s| !js_trim(&s).is_empty())),
    );
    Ok(fields)
}
fn sanitize(body: Value) -> ChannelFields {
    let mut fields = object_spread(&body);
    match fields
        .remove("token")
        .and_then(|v| serde_json::from_str::<Value>(v.get()).ok())
    {
        Some(Value::Null) => {
            fields.insert("token".into(), raw(""));
        }
        Some(Value::String(s)) if !js_trim(&s).is_empty() => {
            // Telegram token extraction uses ASCII word boundaries, as in ECMAScript.
            let re = regex::Regex::new(r"(?-u:\b)([0-9]{6,}:[A-Za-z0-9_-]{30,})(?-u:\b)")
                .expect("constant token expression");
            let token = re
                .captures(&s)
                .and_then(|c| c.get(1))
                .map_or_else(|| js_trim(&s), |m| m.as_str());
            fields.insert("token".into(), raw(token));
        }
        _ => {}
    }
    fields
}
fn options(body: &Value) -> ChannelPairOptions {
    ChannelPairOptions {
        return_url: body
            .get("returnUrl")
            .and_then(Value::as_str)
            .map(str::to_owned),
    }
}
fn presentation(
    host: &dyn ChannelHost,
    record: Option<ChannelRecord>,
    include_error: bool,
) -> ChannelResult<Map<String, Value>> {
    let mut out = Map::new();
    if let Some(record) = record {
        let managed = record.lock().expect("channel record poisoned").clone();
        out.insert("status".into(), json!(managed.status));
        out.insert(
            "qr".into(),
            match managed.detail.get("qr").filter(|v| !v.is_null()) {
                Some(v) => v.clone(),
                None => host.current_qr(&managed.id)?,
            },
        );
        for key in ["link", "expiresAt"] {
            out.insert(
                key.into(),
                managed.detail.get(key).cloned().unwrap_or(Value::Null),
            );
        }
        if include_error && let Some(error) = managed.detail.get("error") {
            out.insert("error".into(), error.clone());
        }
    } else {
        for key in ["qr", "link", "expiresAt"] {
            out.insert(key.into(), Value::Null);
        }
    }
    Ok(out)
}
async fn run(
    state: &ChannelRoutes,
    method: &Method,
    action: &str,
    id: &str,
    body: Value,
) -> ChannelResult<(u16, Box<RawValue>)> {
    let host = state.host.as_ref();
    let missing = || (404, raw(json!({"error":"Channel not found"})));
    let value = match (method, action) {
        (&Method::GET, "list") => raw(host
            .list()?
            .into_iter()
            .map(|mut row| {
                let config = row
                    .remove("config")
                    .map(|v| serde_json::from_str::<ChannelFields>(v.get()))
                    .transpose()
                    .map_err(|_| ChannelError::Message("invalid channel config".into()))?
                    .unwrap_or_default();
                row.insert("config".into(), raw(public_config(config)?));
                Ok(row)
            })
            .collect::<ChannelResult<Vec<_>>>()?),
        (&Method::GET, "status") => {
            let Some(record) = host.get(id)? else {
                return Ok(missing());
            };
            let connector_id = record.lock().expect("channel record poisoned").id.clone();
            let out = presentation(host, Some(record), true)?;
            let mut out = object_spread(&Value::Object(out));
            out.insert("id".into(), raw(connector_id));
            out.insert("config".into(), raw(public_config(host.config(id)?)?));
            raw(out)
        }
        (&Method::GET, "setup") => {
            let Some(guide) = host.setup(id.to_owned()).await? else {
                return Ok((404, raw(json!({"error":"Channel needs no setup step"}))));
            };
            raw(guide)
        }
        (&Method::POST, "start") => {
            host.start(id.to_owned(), options(&body)).await?;
            let mut out = presentation(host, host.get(id)?, true)?;
            out.insert("ok".into(), json!(true));
            raw(out)
        }
        (&Method::POST, "stop") => {
            host.stop(id.to_owned()).await?;
            raw(json!({"ok":true}))
        }
        (&Method::POST, "pair") => {
            let record = match host.get(id) {
                Ok(Some(record)) => record,
                Ok(None) => return Ok(missing()),
                Err(e) => {
                    return Ok((
                        500,
                        raw(
                            json!({"statusCode":500,"error":"Internal Server Error","message":e.message()}),
                        ),
                    ));
                }
            };
            host.pair(id.to_owned(), options(&body)).await?;
            let mut out = presentation(host, Some(record), false)?;
            out.insert("ok".into(), json!(true));
            raw(out)
        }
        (&Method::PATCH, "config") => {
            if host.get(id)?.is_none() {
                return Ok(missing());
            }
            raw(public_config(host.set_config(id, sanitize(body))?)?)
        }
        _ => unreachable!("router chooses method/action"),
    };
    Ok((200, value))
}
async fn handle(State(state): State<ChannelRoutes>, request: Request) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let (encoded, action) = path
        .strip_prefix("/api/channels/")
        .and_then(|s| s.rsplit_once('/'))
        .unwrap_or(("", "list"));
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
    let id = match percent_encoding::percent_decode_str(encoded).decode_utf8() {
        Ok(s) if !malformed => s.into_owned(),
        _ => {
            return response(
                400,
                json!({"statusCode":400,"error":"Bad Request","code":"FST_ERR_BAD_URL","message":format!("'{path}' is not a valid url component")}),
            );
        }
    };
    let headers = request.headers().clone();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(e) => return *e,
    };
    if let Err(e) = auth::require_user(&state.auth, &headers).await {
        return *e;
    }
    match run(&state, &method, action, &id, body).await {
        Ok((status, value)) => (
            axum::http::StatusCode::from_u16(status).expect("fixed status"),
            [(
                axum::http::header::CONTENT_TYPE,
                "application/json; charset=utf-8",
            )],
            value.get().to_owned(),
        )
            .into_response(),
        Err(error) => {
            let message = error.message();
            let status = if action == "setup" {
                404
            } else if method == Method::POST {
                400
            } else {
                500
            };
            response(
                status,
                if status == 500 {
                    json!({"statusCode":500,"error":"Internal Server Error","message":message})
                } else {
                    json!({"error":message})
                },
            )
        }
    }
}
