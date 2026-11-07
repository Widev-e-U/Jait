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
#[derive(Debug)]
pub enum GithubIntakeOperation {
    Get {
        user: String,
        agent: String,
    },
    Save {
        user: String,
        agent: String,
        rules: Value,
    },
    Receive {
        event: Value,
    },
}
pub type GithubIntakePort = Arc<
    dyn Fn(GithubIntakeOperation) -> BoxFuture<'static, Result<Value, HostError>> + Send + Sync,
>;
#[derive(Clone)]
pub struct GithubAppRoutes {
    pub auth: AuthState,
    pub port: GithubPort,
    pub agent_exists: Option<AgentExists>,
    pub on_webhook: Option<WebhookSink>,
    pub intake: Option<GithubIntakePort>,
}
impl GithubAppRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/github-apps", get(handle))
            .route("/api/agents/{agent}/github-app", get(handle).delete(handle))
            .route(
                "/api/agents/{agent}/github-app/intake",
                get(handle).put(handle),
            )
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
fn valid_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
}
fn validate_intake_rules(value: Option<&Value>) -> Result<Value, &'static str> {
    let rules = value
        .and_then(Value::as_array)
        .filter(|rules| rules.len() <= 20)
        .ok_or("Expected at most 20 rules")?;
    let mut clean = Vec::with_capacity(rules.len());
    for rule in rules {
        let obj = rule.as_object().ok_or("Invalid rule")?;
        let repo = obj.get("repository").and_then(Value::as_str).unwrap_or("");
        let sender = obj.get("sender").and_then(Value::as_str).unwrap_or("");
        let event = obj.get("event").and_then(Value::as_str).unwrap_or("");
        let action = obj.get("action").and_then(Value::as_str).unwrap_or("");
        let mut parts = repo.split('/');
        let repository_ok = parts.next().is_some_and(valid_name)
            && parts.next().is_some_and(valid_name)
            && parts.next().is_none();
        let sender_base = sender.strip_suffix("[bot]").unwrap_or(sender);
        if !repository_ok
            || !valid_name(sender_base)
            || !matches!(
                event,
                "issues"
                    | "issue_comment"
                    | "pull_request"
                    | "pull_request_review"
                    | "check_run"
                    | "workflow_run"
            )
            || !valid_name(action)
        {
            return Err("Rules require an exact repository, sender, event and action");
        }
        clean.push(json!({"repository":repo,"sender":sender,"event":event,"action":action}));
    }
    Ok(Value::Array(clean))
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
    let delivery = json!({"userId":user,"agentId":agent,"event":event,"deliveryId":header(headers,"x-github-delivery"),"payload":payload});
    if let Some(intake) = &state.intake
        && intake(GithubIntakeOperation::Receive {
            event: delivery.clone(),
        })
        .await
        .is_err()
    {
        return Ok(response(
            503,
            json!({"accepted":false,"reason":"intake_failed"}),
        ));
    }
    if let Some(sink) = &state.on_webhook
        && sink(delivery).await.is_err()
    {
        return Ok(response(
            503,
            json!({"accepted":false,"reason":"intake_failed"}),
        ));
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
    if action == "intake" {
        let Some(intake) = &state.intake else {
            return response(503, json!({"detail":"intake_unavailable"}));
        };
        if method == Method::GET {
            return match intake(GithubIntakeOperation::Get { user, agent }).await {
                Ok(value) => response(
                    200,
                    json!({"mode":"observe","rules":value["rules"],"decisions":value["decisions"]}),
                ),
                Err(e) => failure(e),
            };
        }
        let rules = match validate_intake_rules(body.get("rules")) {
            Ok(rules) => rules,
            Err(detail) => return response(400, json!({"detail":detail})),
        };
        return match intake(GithubIntakeOperation::Save {
            user,
            agent,
            rules: rules.clone(),
        })
        .await
        {
            Ok(_) => response(200, json!({"mode":"observe","rules":rules})),
            Err(e) => response(400, json!({"detail":message(e)})),
        };
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

#[cfg(test)]
mod intake_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn intake_http_requires_owned_agent_and_preserves_authenticated_tenant() {
        use crate::security::http_auth::{self, AuthUser};
        use axum::{body::Body, http::Request};
        use std::sync::Mutex;
        use tower::ServiceExt;

        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','x','old','old'),('other','bob','x','old','old')").unwrap();
        let secret = "github-route-fixture";
        let auth = AuthState::new(db, secret.into()).unwrap();
        let port: GithubPort = Arc::new(|_| Box::pin(async { Ok(Value::Null) }));
        let calls = Arc::new(Mutex::new(Vec::<(String, String)>::new()));
        let captured = calls.clone();
        let intake: GithubIntakePort = Arc::new(move |op| {
            let result = match op {
                GithubIntakeOperation::Get { user, agent } => {
                    captured.lock().unwrap().push((user, agent));
                    json!({"rules":[],"decisions":[]})
                }
                GithubIntakeOperation::Save { user, agent, .. } => {
                    captured.lock().unwrap().push((user, agent));
                    Value::Null
                }
                GithubIntakeOperation::Receive { .. } => panic!("unexpected webhook"),
            };
            Box::pin(async move { Ok(result) })
        });
        let exists: AgentExists = Arc::new(|user, agent| user == "owner" && agent == "owned");
        let state = GithubAppRoutes {
            auth,
            port,
            agent_exists: Some(exists),
            on_webhook: None,
            intake: Some(intake),
        };
        let app = state.clone().router();
        let unavailable = GithubAppRoutes {
            intake: None,
            ..state
        }
        .router();
        let token = |user: &str| {
            http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: user.into(),
                },
                secret,
            )
            .unwrap()
        };
        let req = |method: &str, user: Option<&str>, body: &'static str| {
            let mut builder = Request::builder()
                .method(method)
                .uri("/api/agents/owned/github-app/intake");
            if !body.is_empty() {
                builder = builder.header("content-type", "application/json");
            }
            if let Some(user) = user {
                builder = builder.header("authorization", format!("Bearer {}", token(user)));
            }
            builder.body(Body::from(body)).unwrap()
        };
        assert_eq!(
            unavailable
                .clone()
                .oneshot(req("GET", None, ""))
                .await
                .unwrap()
                .status(),
            401
        );
        assert_eq!(
            unavailable
                .clone()
                .oneshot(req("GET", Some("owner"), ""))
                .await
                .unwrap()
                .status(),
            503
        );
        assert_eq!(
            unavailable
                .oneshot(req("PUT", Some("owner"), r#"{"rules":[]}"#))
                .await
                .unwrap()
                .status(),
            503
        );
        assert_eq!(
            app.clone()
                .oneshot(req("GET", None, ""))
                .await
                .unwrap()
                .status(),
            401
        );
        assert_eq!(
            app.clone()
                .oneshot(req("GET", Some("other"), ""))
                .await
                .unwrap()
                .status(),
            404
        );
        assert_eq!(app.clone().oneshot(req("PUT", Some("owner"), r#"{"rules":[{"repository":"*","sender":"x","event":"issues","action":"opened"}]}"#)).await.unwrap().status(), 400);
        assert!(calls.lock().unwrap().is_empty());
        assert_eq!(
            app.clone()
                .oneshot(req("GET", Some("owner"), ""))
                .await
                .unwrap()
                .status(),
            200
        );
        assert_eq!(app.oneshot(req("PUT", Some("owner"), r#"{"rules":[{"repository":"a/b","sender":"x","event":"issues","action":"opened"}]}"#)).await.unwrap().status(), 200);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![
                ("owner".into(), "owned".into()),
                ("owner".into(), "owned".into())
            ]
        );
    }

    #[tokio::test]
    async fn router_signed_delivery_reaches_durable_intake_only_for_owned_tenant() {
        use crate::{
            db::worker::DatabaseWorker,
            security::http_auth::{self, AuthUser},
            services::github_intake::github_intake_port,
        };
        use axum::{body::Body, http::Request};
        use std::num::NonZeroU16;
        use tower::ServiceExt;

        let auth_db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&auth_db).unwrap();
        auth_db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('owner','alice','x','old','old'),('other','bob','x','old','old')").unwrap();
        let auth_secret = "github-durable-route-fixture";
        let auth = AuthState::new(auth_db, auth_secret.into()).unwrap();
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/github-intake-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!(
            "router-{}.sqlite",
            crate::db::identifiers::uuidv7()
        ));
        let db = rusqlite::Connection::open(&path).unwrap();
        crate::db::migrate_database(&db).unwrap();
        let worker = DatabaseWorker::new(db, NonZeroU16::new(4).unwrap()).unwrap();
        let port: GithubPort = Arc::new(|op| {
            Box::pin(async move {
                Ok(match op {
                    Op::FindByAppId(_) => json!({"userId":"owner","agentId":"owned"}),
                    Op::WebhookSecret(user, agent) if user == "owner" && agent == "owned" => {
                        json!("secret")
                    }
                    _ => Value::Null,
                })
            })
        });
        let exists: AgentExists = Arc::new(|user, agent| user == "owner" && agent == "owned");
        let app = GithubAppRoutes {
            auth,
            port,
            agent_exists: Some(exists),
            on_webhook: None,
            intake: Some(github_intake_port(worker.clone())),
        }
        .router();
        let token = |user: &str| {
            http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: user.into(),
                },
                auth_secret,
            )
            .unwrap()
        };
        let policy = r#"{"rules":[{"repository":"a/b","sender":"alice","event":"issues","action":"opened"}]}"#;
        let policy_request = |user: Option<&str>| {
            let mut request = Request::builder()
                .method("PUT")
                .uri("/api/agents/owned/github-app/intake")
                .header("content-type", "application/json");
            if let Some(user) = user {
                request = request.header("authorization", format!("Bearer {}", token(user)));
            }
            request.body(Body::from(policy)).unwrap()
        };
        assert_eq!(
            app.clone()
                .oneshot(policy_request(None))
                .await
                .unwrap()
                .status(),
            401
        );
        assert_eq!(
            app.clone()
                .oneshot(policy_request(Some("other")))
                .await
                .unwrap()
                .status(),
            404
        );
        assert_eq!(
            app.clone()
                .oneshot(policy_request(Some("owner")))
                .await
                .unwrap()
                .status(),
            200
        );

        let raw = br#"{"installation":{"id":1},"repository":{"full_name":"a/b"},"sender":{"login":"alice"},"action":"opened"}"#;
        let signed =
            crypto::sign(raw, &EncodingKey::from_secret(b"secret"), Algorithm::HS256).unwrap();
        let bytes = URL_SAFE_NO_PAD.decode(signed).unwrap();
        let valid_signature = format!(
            "sha256={}",
            bytes.iter().map(|v| format!("{v:02x}")).collect::<String>()
        );
        let delivery = |signature: &str| {
            Request::builder()
                .method("POST")
                .uri("/api/github/apps/webhook")
                .header("content-type", "application/json")
                .header("x-github-event", "issues")
                .header("x-github-delivery", "delivery-1")
                .header("x-hub-signature-256", signature)
                .body(Body::from(raw.as_slice()))
                .unwrap()
        };
        assert_eq!(
            app.clone()
                .oneshot(delivery("sha256=bad"))
                .await
                .unwrap()
                .status(),
            401
        );
        assert_eq!(
            app.clone()
                .oneshot(delivery(&valid_signature))
                .await
                .unwrap()
                .status(),
            200
        );
        assert_eq!(
            app.clone()
                .oneshot(delivery(&valid_signature))
                .await
                .unwrap()
                .status(),
            200
        );
        let get = Request::builder()
            .uri("/api/agents/owned/github-app/intake")
            .header("authorization", format!("Bearer {}", token("owner")))
            .body(Body::empty())
            .unwrap();
        let response = app.oneshot(get).await.unwrap();
        assert_eq!(response.status(), 200);
        let body: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 65536).await.unwrap()).unwrap();
        assert_eq!(body["decisions"].as_array().unwrap().len(), 1);
        assert_eq!(body["decisions"][0]["result"], "would_accept");
        assert_eq!(body["decisions"][0]["userId"], "owner");
        worker.shutdown().await.unwrap();
        let reopened = rusqlite::Connection::open(&path).unwrap();
        let count: i64 = reopened.query_row("SELECT count(*) FROM github_intake_decisions WHERE user_id='owner' AND agent_id='owned' AND delivery_id='delivery-1'", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn intake_rules_are_exact_bounded_and_drop_extra_fields() {
        let valid = json!([{"repository":"owner/repo","sender":"build[bot]","event":"issues","action":"opened","extra":"ignored"}]);
        let clean = validate_intake_rules(Some(&valid)).unwrap();
        assert!(clean[0].get("extra").is_none());
        for invalid in [
            json!([{"repository":"owner/*","sender":"x","event":"issues","action":"opened"}]),
            json!([{"repository":"a/b","sender":"x","event":"push","action":"opened"}]),
            json!(vec![Value::Null; 21]),
            json!([null]),
        ] {
            assert!(validate_intake_rules(Some(&invalid)).is_err());
        }
    }

    #[tokio::test]
    async fn signed_delivery_failure_is_retryable_and_invalid_signature_never_dispatches() {
        let auth = AuthState::new(
            rusqlite::Connection::open_in_memory().unwrap(),
            "test-secret-that-is-long-enough-for-auth".into(),
        )
        .unwrap();
        let port: GithubPort = Arc::new(|op| {
            Box::pin(async move {
                Ok(match op {
                    Op::FindByAppId(_) => json!({"userId":"u","agentId":"a"}),
                    Op::WebhookSecret(_, _) => json!("secret"),
                    _ => Value::Null,
                })
            })
        });
        let calls = Arc::new(AtomicUsize::new(0));
        let called = calls.clone();
        let intake: GithubIntakePort = Arc::new(move |_| {
            called.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { Err(HostError::Error("failed".into())) })
        });
        let mut state = GithubAppRoutes {
            auth,
            port,
            agent_exists: None,
            on_webhook: None,
            intake: Some(intake),
        };
        let raw = br#"{"installation":{"id":1}}"#;
        let mut headers = HeaderMap::new();
        headers.insert("x-hub-signature-256", "sha256=bad".parse().unwrap());
        assert_eq!(webhook(&state, &headers, raw).await.unwrap().status(), 401);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        let sig =
            crypto::sign(raw, &EncodingKey::from_secret(b"secret"), Algorithm::HS256).unwrap();
        let bytes = URL_SAFE_NO_PAD.decode(sig).unwrap();
        let signed = format!(
            "sha256={}",
            bytes.iter().map(|v| format!("{v:02x}")).collect::<String>()
        );
        headers.insert("x-hub-signature-256", signed.parse().unwrap());
        assert_eq!(webhook(&state, &headers, raw).await.unwrap().status(), 503);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        state.intake = None;
        state.on_webhook = Some(Arc::new(|_| {
            Box::pin(async { Err(HostError::Error("sink failed".into())) })
        }));
        assert_eq!(webhook(&state, &headers, raw).await.unwrap().status(), 503);
    }
}
