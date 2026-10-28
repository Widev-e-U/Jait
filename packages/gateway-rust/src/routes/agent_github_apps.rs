//! GitHub App HTTP presentation over the shared credential-service port.
//! Keys, signed state, owner lookup and external effects retain host authority.
use super::auth::{self, AuthState, response};
use crate::text::js_trim as trim;
use crate::{
    services::agent_github_apps::GithubSetupCallback,
    services::agent_github_port::{GithubOperation as Op, GithubPort},
    services::calendar::{js_text, truthy},
    tools::core_io::HostError,
};
use axum::{
    Router,
    body::to_bytes,
    extract::{Request, State},
    http::{HeaderMap, Method},
    response::Response,
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use futures_util::future::BoxFuture;
use jsonwebtoken::{Algorithm, EncodingKey, crypto};
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::Arc};
use subtle::ConstantTimeEq;

pub type AgentExists = Arc<dyn Fn(&str, &str) -> bool + Send + Sync>;
pub type WebhookSink =
    Arc<dyn Fn(Value) -> BoxFuture<'static, Result<(), HostError>> + Send + Sync>;
#[derive(Clone)]
pub struct GithubAppRoutes {
    pub auth: AuthState,
    pub port: GithubPort,
    pub agent_exists: Option<AgentExists>,
    pub on_webhook: Option<WebhookSink>,
}
impl GithubAppRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/github-apps", get(handle))
            .route("/api/agents/{agent}/github-app", get(handle).delete(handle))
            .route("/api/agents/{agent}/github-app/setup", post(handle))
            .route("/api/agents/{agent}/github-app/manual", post(handle))
            .route("/api/agents/{agent}/github-app/installation", post(handle))
            .route(
                "/api/agents/{agent}/github-app/installation-url",
                post(handle),
            )
            .route("/api/agents/{agent}/github-app/verify", post(handle))
            .route("/api/agents/{agent}/github-app/test", post(handle))
            .route("/api/github/apps/callback", get(handle))
            .route("/api/github/apps/webhook", post(handle))
            .with_state(self)
    }
}
fn message(error: HostError) -> String {
    match error {
        HostError::Error(s) => s,
        HostError::Thrown(v) => js_text(&v),
    }
}
fn failure(error: HostError) -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":message(error)}),
    )
}
fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}
fn encode(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
        .replace("%21", "!")
        .replace("%27", "'")
        .replace("%28", "(")
        .replace("%29", ")")
        .replace("%7E", "~")
}
fn redirect(location: String) -> Response {
    let mut result = response(302, json!(""));
    result
        .headers_mut()
        .insert("location", location.parse().expect("encoded redirect"));
    result
}
fn redirect_agent(origin: &str, agent: &str, status: &str, reason: Option<&str>) -> Response {
    redirect(format!(
        "{origin}/agents?github={status}&agentId={}{}",
        encode(agent),
        reason
            .filter(|s| !s.is_empty())
            .map(|s| format!("&reason={}", encode(s)))
            .unwrap_or_default()
    ))
}
fn query(raw: &str) -> BTreeMap<String, Value> {
    let mut out = BTreeMap::new();
    for (k, v) in url::form_urlencoded::parse(raw.as_bytes()) {
        out.entry(k.into_owned())
            .and_modify(|old| {
                if let Value::Array(a) = old {
                    a.push(json!(v));
                } else {
                    *old = json!([old.clone(), v]);
                }
            })
            .or_insert(json!(v));
    }
    out
}
async fn callback(state: &GithubAppRoutes, raw: &str) -> Result<Response, HostError> {
    let q = query(raw);
    let value = |k: &str| q.get(k).cloned().unwrap_or(json!(""));
    let origin = js_text(&(state.port)(Op::PublicBaseUrl).await?);
    let signed_state = value("state");
    let Some(signed_state) = signed_state
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 8192)
    else {
        return Ok(redirect(format!(
            "{origin}/agents?github=error&reason=invalid_state"
        )));
    };
    let signed = (state.port)(Op::ReadState(json!(signed_state))).await?;
    if !truthy(&signed) {
        return Ok(redirect(format!(
            "{origin}/agents?github=error&reason=invalid_state"
        )));
    }
    let user = js_text(&signed["userId"]);
    let agent = js_text(&signed["agentId"]);
    let code = value("code");
    let installation = value("installation_id");
    if !truthy(&code) && !truthy(&installation) {
        return Ok(redirect_agent(
            &origin,
            &agent,
            "error",
            Some("missing_code"),
        ));
    }
    let result: Result<&str, HostError> = async {
        let optional_input = |value: &Value| -> Result<Option<String>, HostError> {
            let text = value
                .as_str()
                .ok_or_else(|| HostError::Error("Invalid GitHub setup callback".into()))?;
            Ok((!text.is_empty()).then(|| text.to_owned()))
        };
        let current = (state.port)(Op::CompleteCallback(GithubSetupCallback {
            user,
            agent: agent.clone(),
            state: signed_state.to_owned(),
            code: optional_input(&code)?,
            installation: optional_input(&installation)?,
        }))
        .await?;
        Ok(if truthy(&current["installationId"]) {
            "connected"
        } else {
            "installed"
        })
    }
    .await;
    Ok(match result {
        Ok(status) => redirect_agent(&origin, &agent, status, None),
        Err(error) => {
            let reason = match error {
                HostError::Error(s) => {
                    match String::from_utf16(&s.encode_utf16().take(180).collect::<Vec<_>>()) {
                        Ok(reason) => reason,
                        Err(_) => {
                            return Err(HostError::Error(
                                "String contained an illegal UTF-16 sequence.".into(),
                            ));
                        }
                    }
                }
                HostError::Thrown(_) => "callback_failed".into(),
            };
            redirect_agent(&origin, &agent, "error", Some(&reason))
        }
    })
}
fn signature(secret: &str, raw: &[u8], received: Option<&str>) -> bool {
    let Some(received) = received else {
        return false;
    };
    let Ok(signed) = crypto::sign(
        raw,
        &EncodingKey::from_secret(secret.as_bytes()),
        Algorithm::HS256,
    ) else {
        return false;
    };
    let Ok(bytes) = URL_SAFE_NO_PAD.decode(signed) else {
        return false;
    };
    let expected = format!(
        "sha256={}",
        bytes.iter().map(|v| format!("{v:02x}")).collect::<String>()
    );
    let received = trim(received).as_bytes();
    received.len() == expected.len() && bool::from(received.ct_eq(expected.as_bytes()))
}
async fn webhook(
    state: &GithubAppRoutes,
    headers: &HeaderMap,
    raw: &[u8],
) -> Result<Response, HostError> {
    if header(headers, "x-github-hook-installation-target-type")
        .is_some_and(|v| !v.is_empty() && v != "integration")
    {
        return Ok(response(202, json!({"ignored":"not_an_app_delivery"})));
    }
    let payload: Value = match serde_json::from_str(&String::from_utf8_lossy(raw)) {
        Ok(v) => v,
        Err(_) => return Ok(response(400, json!({"detail":"invalid_json"}))),
    };
    // A delivery is an object. Reject scalar/array JSON before credential lookup.
    if !payload.is_object() {
        return Ok(response(400, json!({"detail":"invalid_payload"})));
    }
    let mut owner = (state.port)(Op::FindByAppId(
        header(headers, "x-github-hook-installation-target-id")
            .unwrap_or("")
            .into(),
    ))
    .await?;
    if owner.is_null() {
        let id = payload
            .get("installation")
            .and_then(|v| v.get("id"))
            .map(js_text)
            .unwrap_or_default();
        owner = (state.port)(Op::FindByInstallationId(id)).await?;
    }
    if !truthy(&owner) {
        return Ok(response(404, json!({"detail":"unknown_github_app"})));
    }
    let user = js_text(&owner["userId"]);
    let agent = js_text(&owner["agentId"]);
    let secret = (state.port)(Op::WebhookSecret(user.clone(), agent.clone())).await?;
    if !truthy(&secret) {
        return Ok(response(
            202,
            json!({"accepted":false,"reason":"no_webhook_secret"}),
        ));
    }
    if !signature(
        &js_text(&secret),
        raw,
        header(headers, "x-hub-signature-256"),
    ) {
        return Ok(response(401, json!({"detail":"invalid_signature"})));
    }
    let event = header(headers, "x-github-event");
    if let Some(sink) = &state.on_webhook {
        let _=sink(json!({"userId":user,"agentId":agent,"event":event,"deliveryId":header(headers,"x-github-delivery"),"payload":payload})).await;
    }
    Ok(response(
        200,
        json!({"accepted":true,"agentId":agent,"event":event}),
    ))
}
async fn handle(State(state): State<GithubAppRoutes>, request: Request) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let q = request.uri().query().unwrap_or("").to_owned();
    // Reject repeated authority/metadata before transport normalization hides
    // multiplicity. Also reject comma-coalesced values from an upstream hop.
    if path == "/api/github/apps/webhook"
        && [
            "x-github-hook-installation-target-type",
            "x-github-hook-installation-target-id",
            "x-hub-signature-256",
            "x-github-event",
            "x-github-delivery",
        ]
        .iter()
        .any(|name| {
            request.headers().get_all(*name).iter().count() > 1
                || request
                    .headers()
                    .get(*name)
                    .is_some_and(|v| v.as_bytes().contains(&b','))
        })
    {
        return response(400, json!({"detail":"ambiguous_headers"}));
    }
    // Node joins repeated custom request headers before Fastify sees them.
    let mut headers = request.headers().clone();
    let custom_names: Vec<_> = headers
        .keys()
        .filter(|name| name.as_str().starts_with("x-"))
        .cloned()
        .collect();
    for name in custom_names {
        let values: Vec<_> = headers
            .get_all(&name)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .collect();
        if values.len() > 1 {
            let joined = values.join(", ");
            if let Ok(value) = joined.parse() {
                headers.insert(name, value);
            }
        }
    }

    if let Some(encoded) = path
        .strip_prefix("/api/agents/")
        .and_then(|s| s.split('/').next())
    {
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
        if malformed
            || percent_encoding::percent_decode_str(encoded)
                .decode_utf8()
                .is_err()
        {
            return response(
                400,
                json!({"error":"Bad Request","code":"FST_ERR_BAD_URL","message":format!("'{path}' is not a valid url component"),"statusCode":400}),
            );
        }
    }

    if path == "/api/github/apps/callback" {
        return callback(&state, &q).await.unwrap_or_else(failure);
    }
    if path == "/api/github/apps/webhook" {
        let raw = match to_bytes(request.into_body(), auth::BODY_LIMIT).await {
            Ok(v) => v,
            Err(_) => {
                return response(
                    413,
                    json!({"statusCode":413,"code":"FST_ERR_CTP_BODY_TOO_LARGE","error":"Payload Too Large","message":"Request body is too large"}),
                );
            }
        };
        let json_type = header(&headers, "content-type")
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .eq_ignore_ascii_case("application/json");
        let raw = if json_type {
            raw.to_vec()
        } else {
            match auth::parse_body(axum::body::Body::from(raw), &headers).await {
                Ok(Value::Null) => b"{}".to_vec(),
                Ok(Value::String(s)) => s.into_bytes(),
                Ok(v) => v.to_string().into_bytes(),
                Err(e) => return *e,
            }
        };
        return webhook(&state, &headers, &raw)
            .await
            .unwrap_or_else(failure);
    }
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(e) => return *e,
    };
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(v) => v.id,
        Err(e) => return *e,
    };
    let call = |op| (state.port)(op);
    if path == "/api/github-apps" {
        return async {let connections=call(Op::List(user)).await?;let base=call(Op::PublicBaseUrl).await?;
            Ok(response(200,json!({"configured":connections.as_array().expect("typed connection list").iter().filter(|v|v["status"]=="connected").count(),"connections":connections,"webhookUrl":format!("{}/api/github/apps/webhook",js_text(&base))})))
        }.await.unwrap_or_else(failure);
    }
    let parts: Vec<_> = path.split('/').collect();
    let agent = match percent_encoding::percent_decode_str(parts[3]).decode_utf8() {
        Ok(v) => v.into_owned(),
        Err(_) => return response(400, json!({"detail":"invalid_agent_id"})),
    };
    let action = parts.get(5).copied().unwrap_or("");
    if method != Method::DELETE
        && state
            .agent_exists
            .as_ref()
            .is_some_and(|f| !f(&user, &agent))
    {
        return response(404, json!({"detail":"agent_not_found"}));
    }
    if method == Method::GET {
        return async {
            let connection = call(Op::Get(user.clone(), agent.clone())).await?;
            let secret = call(Op::WebhookSecret(user, agent)).await?;
            let mut result = response(
                200,
                json!({"connection":connection,"webhookSecretAvailable":truthy(&secret)}),
            );
            // Capability discovery is read-only; issuance requires an authenticated POST.
            result.headers_mut().insert(
                "x-jait-github-installation-flow",
                "stateful".parse().unwrap(),
            );
            result.headers_mut().insert(
                "access-control-expose-headers",
                "x-jait-github-installation-flow".parse().unwrap(),
            );
            result
                .headers_mut()
                .insert("cache-control", "no-store".parse().unwrap());
            Ok(result)
        }
        .await
        .unwrap_or_else(failure);
    }
    if method == Method::DELETE {
        return call(Op::Disconnect(user, agent))
            .await
            .map(|v| response(200, v))
            .unwrap_or_else(failure);
    }
    let string = |k: &str| body[k].as_str().unwrap_or("").to_owned();
    let op = match action {
        "setup" => {
            let name = string("appName");
            if trim(&name).is_empty() {
                return response(400, json!({"detail":"appName is required"}));
            }
            let mut options = json!({"appName":name,"organization":body["organization"].as_str()});
            for key in ["description", "homepage"] {
                if let Some(s) = body[key].as_str() {
                    options[key] = json!(s);
                }
            }
            let proto = header(&headers, "x-forwarded-proto")
                .map(|v| trim(v.split(',').next().unwrap_or("")))
                .unwrap_or("http");
            let host = header(&headers, "x-forwarded-host")
                .map(|v| trim(v.split(',').next().unwrap_or("")))
                .or_else(|| header(&headers, "host"));
            if let Some(host) = host.filter(|h| !h.is_empty() && !proto.is_empty()) {
                options["baseUrl"] = json!(format!("{proto}://{host}"));
            }
            Op::BeginSetup {
                user,
                agent,
                options,
            }
        }
        "manual" => Op::SaveManual {
            user,
            agent,
            options: json!({"appId":string("appId"),"privateKey":string("privateKey"),"appSlug":body["appSlug"].as_str(),"appName":body["appName"].as_str()}),
        },
        "installation-url" => Op::BeginInstallation(user, agent),
        "installation" => {
            let id = if body["installationId"].is_string() || body["installationId"].is_number() {
                trim(&js_text(&body["installationId"])).to_owned()
            } else {
                String::new()
            };
            if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
                return response(400, json!({"detail":"installationId must be numeric"}));
            }
            Op::AttachInstallation(user, agent, json!(id))
        }
        "verify" => Op::Verify(user, agent),
        "test" => Op::Test(user, agent),
        _ => return response(404, json!({"detail":"not_found"})),
    };
    let mut result = match call(op).await {
        Ok(v) => response(
            200,
            if matches!(action, "manual" | "installation") {
                json!({"connection":v})
            } else {
                v
            },
        ),
        Err(e) => response(400, json!({"detail":message(e)})),
    };
    if action == "installation-url" {
        result
            .headers_mut()
            .insert("cache-control", "no-store".parse().unwrap());
    }
    result
}
