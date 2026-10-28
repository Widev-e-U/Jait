//! Opt-in authenticated lifecycle routes. Media and WebSocket effects remain explicit
//! trusted host ports; state commits precede signaling just as in the TS routes.

#[cfg(test)]
mod approval_error_tests {
    use super::*;

    #[tokio::test]
    async fn host_errors_preserve_message_and_non_error_uses_fallback() {
        for (error, expected) in [
            (ScreenShareError::Message("signal failed".into()), "signal failed"),
            (ScreenShareError::Thrown(json!("failure")), "Unknown share session."),
        ] {
            let response = approval_error(error);
            assert_eq!(response.status(), 404);
            let body = axum::body::to_bytes(response.into_body(), 1024).await.unwrap();
            let value: Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(value["error"], expected);
        }
    }
}
use super::auth::{self, AuthState, response};
use crate::{
    services::{
        calendar::js_text,
        screen_share::{ScreenShareService, StartOptions},
    },
    text::js_trim,
};
use axum::{
    Router,
    extract::{Path, Request, State},
    response::Response,
    routing::{get, post},
};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug)]
pub enum ScreenShareError {
    Message(String),
    Thrown(Value),
}
#[derive(Clone, Debug)]
pub enum ScreenShareEffect {
    Broadcast(Value),
    StartRequest {
        session_id: String,
        host_device_id: String,
        viewer_device_ids: Option<Vec<String>>,
        options: Value,
    },
    Handoff {
        session_id: String,
        control_owner: String,
    },
    Capture,
    Record,
}
pub type ScreenSharePort =
    Arc<dyn Fn(ScreenShareEffect) -> Result<Value, ScreenShareError> + Send + Sync>;
#[derive(Clone)]
pub struct ScreenShareRoutes {
    pub auth: AuthState,
    pub service: Arc<Mutex<ScreenShareService>>,
    pub port: ScreenSharePort,
}
impl ScreenShareRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/screen-share/state", get(handle))
            .route("/api/screen-share/devices", get(handle))
            .route("/api/screen-share/devices/register", post(handle))
            .route("/api/screen-share/start", post(handle))
            .route("/api/screen-share/chat/{chat_id}", get(chat))
            .route("/api/screen-share/approve", post(handle))
            .route("/api/screen-share/handoff", post(handle))
            .route("/api/screen-share/join", post(handle))
            .route("/api/screen-share/stop", post(handle))
            .route("/api/screen-share/transfer-control", post(handle))
            .route("/api/screen-share/capture", post(handle))
            .route("/api/screen-share/record", post(handle))
            .with_state(self)
    }
}
// JSON objects cannot carry callable own toString/valueOf methods. String's
// string-hint conversion therefore fails when the inherited toString is shadowed.
fn string(value: &Value) -> Result<String, String> {
    match value {
        Value::Object(fields) if fields.contains_key("toString") => Err("No default value".into()),
        Value::Array(values) => values
            .iter()
            .map(|v| {
                if v.is_null() {
                    Ok(String::new())
                } else {
                    string(v)
                }
            })
            .collect::<Result<Vec<_>, _>>()
            .map(|items| items.join(",")),
        _ => Ok(js_text(value)),
    }
}
fn field(body: &Value, key: &str) -> Result<String, String> {
    let value = body
        .get(key)
        .filter(|v| !v.is_null())
        .map(string)
        .transpose()?
        .unwrap_or_default();
    Ok(js_trim(&value).into())
}
fn array(body: &Value, key: &str) -> Result<Option<Vec<String>>, String> {
    body.get(key)
        .and_then(Value::as_array)
        .map(|values| values.iter().map(string).collect())
        .transpose()
}
fn caught(error: ScreenShareError, fallback: &str) -> Response {
    response(
        400,
        json!({"error":match error{ScreenShareError::Message(message)=>message,ScreenShareError::Thrown(_)=>fallback.into()}}),
    )
}
fn approval_error(error: ScreenShareError) -> Response {
    let message = match error {
        ScreenShareError::Message(message) => message,
        ScreenShareError::Thrown(_) => "Unknown share session.".into(),
    };
    response(404, json!({"error":message}))
}

fn uncaught(error: ScreenShareError) -> Response {
    // Fastify serializes Error instances and non-Error throws differently.
    match error {
        ScreenShareError::Message(message) => response(
            500,
            json!({"statusCode":500,"error":"Internal Server Error","message":message}),
        ),
        ScreenShareError::Thrown(value) => {
            let code = value
                .get("statusCode")
                .filter(|v| crate::services::calendar::truthy(v))
                .or_else(|| value.get("status"));
            let status = code
                .map(|v| crate::execution::command_timeout::number(Some(v)))
                .filter(|v| v.is_finite() && v.fract() == 0.0 && (400.0..=599.0).contains(v))
                .map(|v| v as u16)
                .unwrap_or(500);
            response(status, value)
        }
    }
}
async fn chat(
    State(state): State<ScreenShareRoutes>,
    Path(chat_id): Path<String>,
    request: Request,
) -> Response {
    if let Err(error) = auth::require_user(&state.auth, request.headers()).await {
        return *error;
    }
    let service = match state.service.lock() {
        Ok(service) => service,
        Err(_) => return auth::internal_error(),
    };
    match service.chat_session(&chat_id) {
        Some(session) => response(200, json!({"session":session})),
        None => response(404, json!({"error":"No active share for this chat."})),
    }
}

fn start_options(session: &Value) -> Value {
    json!({"chatId":session["chatId"],"nodeId":session["nodeId"],"initiatedBy":session["initiatedBy"],
        "requireConsent":session["pendingApproval"],"reason":session["reason"]})
}

async fn handle(State(state): State<ScreenShareRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(error) = auth::require_user(&state.auth, &headers).await {
        return *error;
    }
    let path = request.uri().path().to_owned();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(error) => return *error,
    };
    // No await under this domain lock. The host supplies synchronous bounded
    // enqueue ports, preserving per-request state/broadcast/start ordering.
    let mut service = match state.service.lock() {
        Ok(service) => service,
        Err(_) => return auth::internal_error(),
    };
    let invoke = |effect| (state.port)(effect);
    macro_rules! parsed {
        ($result:expr) => {
            match $result {
                Ok(value) => value,
                Err(message) => return uncaught(ScreenShareError::Message(message)),
            }
        };
    }
    match path.as_str() {
        "/api/screen-share/state" => response(200, service.state()),
        "/api/screen-share/devices" => response(200, json!({"devices":service.state()["devices"]})),
        "/api/screen-share/devices/register" => {
            let id = parsed!(field(&body, "id"));
            let name = parsed!(field(&body, "name"));
            let platform = body
                .get("platform")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let capabilities = parsed!(array(&body, "capabilities")).unwrap_or_default();
            if id.is_empty()
                || name.is_empty()
                || !matches!(platform, "desktop" | "react-native" | "web")
            {
                return response(
                    400,
                    json!({"error":"Invalid device: id, name, and platform (desktop|react-native|web) required."}),
                );
            }
            let device=service.register_device(json!({"id":id,"name":name,"platform":platform,"authorized":true,"capabilities":capabilities}));
            response(200, json!({"ok":true,"device":device}))
        }
        "/api/screen-share/start" => {
            let host = parsed!(field(&body, "hostDeviceId"));
            let viewers = parsed!(array(&body, "viewerDeviceIds"));
            if host.is_empty() {
                return response(400, json!({"error":"hostDeviceId is required."}));
            }
            let optional = |key: &str| -> Result<Option<String>, String> {
                match body
                    .get(key)
                    .filter(|v| crate::services::calendar::truthy(v))
                {
                    Some(v) => Ok(Some(js_trim(&string(v)?).to_owned())),
                    None => Ok(None),
                }
            };
            let chat_id = parsed!(optional("chatId"));
            let node_id = parsed!(optional("nodeId"));
            let initiated_by_agent = body["initiatedBy"] == "agent";
            let require_consent = initiated_by_agent || body["requireConsent"] == true;
            // The reference currently forwards reason to the host but does not store it for this route.
            let reason = match body
                .get("reason")
                .filter(|v| crate::services::calendar::truthy(v))
            {
                Some(v) => Some(parsed!(string(v))),
                None => None,
            };
            let result = (|| {
                let previous = chat_id.as_deref().and_then(|chat| service.chat_session(chat));
                let session = service
                    .start_with_options(
                        &host,
                        viewers.as_deref(),
                        StartOptions {
                            chat_id,
                            node_id,
                            initiated_by_agent,
                            require_consent,
                            reason: None,
                        },
                    )
                    .map_err(ScreenShareError::Message)?;
                if let Some(stopped) = previous.as_ref()
                    .and_then(|previous| previous["id"].as_str())
                    .and_then(|id| service.session(id))
                    .filter(|old| old["status"] == "idle")
                {
                    invoke(ScreenShareEffect::Broadcast(stopped))?;
                }
                invoke(ScreenShareEffect::Broadcast(session.clone()))?;
                invoke(ScreenShareEffect::StartRequest {
                    session_id: session["id"].as_str().expect("native id").into(),
                    host_device_id: host,
                    viewer_device_ids: viewers,
                    options: json!({"chatId":session["chatId"],"nodeId":session["nodeId"],"initiatedBy":session["initiatedBy"],"requireConsent":require_consent,"reason":reason}),
                })?;
                Ok(session)
            })();
            match result {
                Ok(session) => response(200, json!({"ok":true,"session":session})),
                Err(error) => caught(error, "Failed to start screen share."),
            }
        }
        "/api/screen-share/approve" => {
            let id = parsed!(field(&body, "sessionId"));
            if id.is_empty() {
                return response(400, json!({"error":"sessionId is required."}));
            }
            let Some(existing) = service.session(&id) else {
                return response(404, json!({"error":"Unknown share session."}));
            };
            if existing["status"] != "sharing" || (body["approved"] != true && existing["pendingApproval"] != true) {
                return response(409, json!({"error":"Screen share approval is no longer pending."}));
            }
            match service.approve(&id, body["approved"] == true) {
                Ok(session) => match invoke(ScreenShareEffect::Broadcast(session.clone())) {
                    Ok(_) => response(200, json!({"ok":true,"session":session})),
                    Err(error) => approval_error(error),
                },
                Err(message) => response(404, json!({"error":message})),
            }
        }
        "/api/screen-share/handoff" => {
            let id = parsed!(field(&body, "sessionId"));
            let chat_id = parsed!(field(&body, "chatId"));
            if id.is_empty() {
                return response(400, json!({"error":"sessionId is required."}));
            }
            if body["controlOwner"] != "agent" && body["controlOwner"] != "user" {
                return response(400, json!({"error":"controlOwner must be user or agent."}));
            }
            let Some(existing) = service.session(&id) else {
                return response(404, json!({"error":"Unknown share session."}));
            };
            if existing["chatId"]
                .as_str()
                .is_some_and(|owner| !owner.is_empty() && owner != chat_id)
            {
                return response(
                    403,
                    json!({"error":"This screen share belongs to another chat."}),
                );
            }
            if existing["status"] != "sharing" || existing["pendingApproval"] == true {
                return response(409, json!({"error":"Screen share is not active and approved."}));
            }
            let owner = if body["controlOwner"] == "agent" {
                "agent"
            } else {
                "user"
            };
            match service.handoff(&id, owner) {
                Ok(session) => {
                    let effect =
                        invoke(ScreenShareEffect::Broadcast(session.clone())).and_then(|_| {
                            invoke(ScreenShareEffect::Handoff {
                                session_id: id,
                                control_owner: owner.into(),
                            })
                        });
                    match effect {
                        Ok(_) => response(200, json!({"ok":true,"session":session})),
                        Err(error) => approval_error(error),
                    }
                }
                Err(message) => response(404, json!({"error":message})),
            }
        }
        "/api/screen-share/join" => {
            let id = parsed!(field(&body, "sessionId"));
            let viewer = parsed!(field(&body, "viewerDeviceId"));
            if id.is_empty() {
                return response(400, json!({"error":"sessionId is required."}));
            }
            if viewer.is_empty() {
                return response(400, json!({"error":"viewerDeviceId is required."}));
            }
            if service.session(&id).is_none() {
                return response(404, json!({"error":"Unknown share session."}));
            }
            let result = (|| {
                let session = service
                    .add_viewer(&id, &viewer)
                    .map_err(ScreenShareError::Message)?;
                invoke(ScreenShareEffect::Broadcast(session.clone()))?;
                if session["pendingApproval"] != true && session["status"] == "sharing" {
                    let viewers = session["viewers"]
                        .as_array()
                        .expect("native viewers")
                        .iter()
                        .filter_map(|v| v["deviceId"].as_str().map(str::to_owned))
                        .collect();
                    let mut options = start_options(&session);
                    options["requireConsent"] = json!(false);
                    invoke(ScreenShareEffect::StartRequest {
                        session_id: id,
                        host_device_id: session["hostDeviceId"].as_str().unwrap_or_default().into(),
                        viewer_device_ids: Some(viewers),
                        options,
                    })?;
                }
                Ok(session)
            })();
            match result {
                Ok(session) => response(200, json!({"ok":true,"session":session})),
                Err(error) => caught(error, "Cannot join this screen share."),
            }
        }
        "/api/screen-share/stop" => {
            let session_id = parsed!(field(&body, "sessionId"));
            let session =
                service.stop_session((!session_id.is_empty()).then_some(session_id.as_str()));
            if !session.is_null()
                && let Err(error) = invoke(ScreenShareEffect::Broadcast(session.clone()))
            {
                return uncaught(error);
            }
            response(200, json!({"ok":true,"session":session}))
        }
        "/api/screen-share/transfer-control" => {
            let controller = parsed!(field(&body, "controllerDeviceId"));
            if controller.is_empty() {
                return response(400, json!({"error":"controllerDeviceId is required."}));
            }
            let session_id = parsed!(field(&body, "sessionId"));
            let result = service
                .transfer_session(
                    &controller,
                    (!session_id.is_empty()).then_some(session_id.as_str()),
                )
                .map_err(ScreenShareError::Message)
                .and_then(|session| {
                    invoke(ScreenShareEffect::Broadcast(session.clone()))?;
                    Ok(session)
                });
            match result {
                Ok(session) => response(200, json!({"ok":true,"session":session})),
                Err(error) => caught(error, "Failed to transfer control."),
            }
        }
        "/api/screen-share/capture" => match invoke(ScreenShareEffect::Capture) {
            Ok(capture) => response(200, json!({"ok":true,"capture":capture})),
            Err(error) => uncaught(error),
        },
        "/api/screen-share/record" => match invoke(ScreenShareEffect::Record) {
            Ok(recording) => response(200, json!({"ok":true,"recording":recording})),
            Err(error) => uncaught(error),
        },
        _ => unreachable!("registered screen-share path"),
    }
}
