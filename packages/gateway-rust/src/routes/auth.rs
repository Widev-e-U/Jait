//! Account HTTP adapter. Database work and password derivation run off async workers.
use crate::{
    db::worker::{DatabaseError, DatabaseWorker},
    runtime::blocking::BlockingLane,
    security::{
        http_auth::{self, AuthUser},
        request_origin,
    },
    services::users::{Patch, UserService, UserSettings, UserSettingsPatch},
};
use axum::{
    Json, Router,
    body::to_bytes,
    extract::{Request, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashSet},
    num::NonZeroU16,
    sync::Arc,
};
pub(crate) type Error = Box<dyn std::error::Error + Send + Sync>;
pub const BODY_LIMIT: usize = 25 * 1024 * 1024;

pub const ENV_KEYS: &[&str] = &[
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "OPENAI_TRANSCRIBE_MODEL",
    "OPENAI_WEB_SEARCH_MODEL",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_STT_MODEL",
    "ELEVENLABS_STT_URL",
    "ELEVENLABS_LANGUAGE_CODE",
    "BRAVE_API_KEY",
    "PERPLEXITY_API_KEY",
    "OPENROUTER_API_KEY",
    "OMNIROUTE_BASE_URL",
    "OMNIROUTE_API_KEY",
    "XAI_API_KEY",
    "GEMINI_API_KEY",
    "MOONSHOT_API_KEY",
    "KIMI_BASE_URL",
    "KIMI_MODEL",
    "PERPLEXITY_MODEL",
    "PERPLEXITY_OPENROUTER_MODEL",
    "GROK_MODEL",
    "GEMINI_MODEL",
    "SYSTEM_ONE_BASE_URL",
    "SYSTEM_ONE_API_KEY",
    "SYSTEM_ONE_MODEL",
    "SYSTEM_ONE_TIMEOUT_MS",
    "JEV_API_KEY",
    "JEV_MODEL",
];
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSettingsInfo {
    pub name: String,
    #[serde(default)]
    pub display_name: Option<String>,
    pub description: String,
    pub tier: String,
    pub category: String,
    pub source: String,
}
#[derive(Clone)]
pub struct AuthState {
    db: DatabaseWorker,
    passwords: BlockingLane,
    secret: Arc<String>,
    pub cors_origin: String,
    pub env_set: BTreeMap<String, bool>,
    pub tools: Option<Vec<ToolSettingsInfo>>,
}
impl AuthState {
    /// Takes explicit storage and secret. No default paths or credential discovery.
    pub fn new(db: Connection, secret: String) -> Result<Self, Error> {
        http_auth::sign_auth_token(
            &AuthUser {
                id: "configuration-check".into(),
                username: "configuration-check".into(),
            },
            &secret,
        )
        .map_err(|_| http_auth::SecretError)?;
        Ok(Self {
            db: DatabaseWorker::new(db, NonZeroU16::new(64).expect("fixed queue capacity"))?,
            passwords: BlockingLane::new(NonZeroU16::new(2).expect("fixed CPU capacity")),
            secret: Arc::new(secret),
            cors_origin: String::new(),
            env_set: BTreeMap::new(),
            tools: None,
        })
    }
    pub(crate) fn resolve_user(&self, headers: &HeaderMap) -> Option<AuthUser> {
        auth_user(headers, &self.secret)
    }
    pub(crate) fn origin_allowed(&self, headers: &HeaderMap) -> bool {
        request_origin::is_allowed_request_origin(
            headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()),
            headers.get(header::HOST).and_then(|v| v.to_str().ok()),
            &self.cors_origin,
        ) || http_auth::extract_bearer_token(
            headers
                .get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok()),
        )
        .is_some()
    }
    pub async fn with_database<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T, Error> + Send + 'static,
    ) -> Result<T, Error> {
        self.db
            .run(operation)
            .await
            .map_err(|error| Box::new(error) as Error)
    }
    pub async fn shutdown(&self) -> Result<(), DatabaseError> {
        self.passwords.close();
        self.db.shutdown().await
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/auth/register", post(handle))
            .route("/api/auth/login", post(handle))
            .route("/api/auth/logout", post(handle))
            .route("/api/auth/refresh", post(handle))
            .route("/api/auth/invitations", post(handle))
            .route("/api/auth/me", get(handle))
            .route("/api/auth/settings", get(handle).patch(handle))
            .route("/api/auth/settings/archive", delete(handle))
            .route("/api/auth/settings/env-status", get(handle))
            .route("/api/auth/settings/tools", get(handle).patch(handle))
            .route("/api/auth/session/bind", post(handle))
            .with_state(self)
    }
}
pub(crate) fn response(status: u16, body: Value) -> Response {
    (
        StatusCode::from_u16(status).expect("fixed status"),
        Json(body),
    )
        .into_response()
}
/// Shared server boundary for explicitly mounted protected routes.
pub(crate) async fn require_user(
    state: &AuthState,
    headers: &HeaderMap,
) -> Result<AuthUser, Box<Response>> {
    if !state.origin_allowed(headers) {
        return Err(Box::new(response(403, json!({"error":"ORIGIN_FORBIDDEN"}))));
    }
    let user = state
        .resolve_user(headers)
        .ok_or_else(|| Box::new(denied()))?;
    let owner = user.id.clone();
    match state
        .with_database(move |db| Ok(UserService::new(db).find_by_id(&owner)?.is_some()))
        .await
    {
        Ok(true) => Ok(user),
        Ok(false) => Err(Box::new(denied())),
        Err(e) => Err(Box::new(database_failure(&e))),
    }
}
pub(crate) fn denied() -> Response {
    response(401, json!({"detail":"login_required"}))
}
pub(crate) fn internal_error() -> Response {
    response(
        500,
        json!({"statusCode":500,"error":"Internal Server Error","message":"Internal Server Error"}),
    )
}
fn cookie_value(headers: &HeaderMap) -> Option<String> {
    // fastify-cookie keeps the first occurrence and decodes percent encoding.
    for header in headers.get_all(header::COOKIE) {
        let Ok(header) = header.to_str() else {
            continue;
        };
        for pair in header.split(';') {
            if let Some((name, value)) = pair.trim().split_once('=')
                && name.trim() == http_auth::AUTH_COOKIE_NAME
            {
                let value = value.trim().trim_matches('"');
                return Some(
                    percent_encoding::percent_decode_str(value)
                        .decode_utf8()
                        .map(|v| v.into_owned())
                        .unwrap_or_else(|_| value.into()),
                );
            }
        }
    }
    None
}
fn auth_user(headers: &HeaderMap, secret: &str) -> Option<AuthUser> {
    let cookie = cookie_value(headers);
    http_auth::resolve_auth(
        headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok()),
        cookie.as_deref(),
        secret,
    )
}
fn token_response(user: AuthUser, secret: &str) -> Result<Response, Error> {
    let token = http_auth::sign_auth_token(&user, secret)?;
    let cookie = format!("jait_token={token}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax");
    let mut result = response(200, json!({"access_token":token,"user":user}));
    result
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse()?);
    Ok(result)
}
fn settings_response(s: UserSettings) -> Value {
    json!({"theme":s.theme,"api_keys":s.api_keys,"disabled_tools":s.disabled_tools,"stt_provider":s.stt_provider,
        "chat_streaming_action":s.chat_streaming_action,"chat_provider":s.chat_provider,"jait_backend":s.jait_backend,
        "recent_models":s.recent_models,"selected_model":s.selected_model,"reasoning_effort":s.reasoning_effort,
        "project_picker_path":s.project_picker_path,"project_picker_node_id":s.project_picker_node_id,"updated_at":s.updated_at})
}
fn trimmed(body: &Value, key: &str) -> String {
    crate::text::js_trim(body[key].as_str().unwrap_or("")).into()
}
fn enum_patch(body: &Value, key: &str, values: &[&str]) -> Option<String> {
    body[key]
        .as_str()
        .filter(|v| values.contains(v))
        .map(String::from)
}
fn nullable_patch(body: &Value, key: &str) -> Patch<Option<String>> {
    match body.get(key) {
        Some(Value::Null) => Patch::Set(None),
        Some(Value::String(s)) => {
            Patch::Set(Some(crate::text::js_trim(s).to_string()).filter(|v| !v.is_empty()))
        }
        _ => Patch::Missing,
    }
}
fn strings(body: &Value, key: &str) -> Option<Vec<String>> {
    body[key].as_array().map(|items| {
        items
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect()
    })
}
fn settings_patch(body: &Value) -> UserSettingsPatch {
    let api_keys = match body.get("api_keys") {
        Some(Value::Object(values)) => Some(
            values
                .iter()
                .filter_map(|(k, v)| {
                    v.as_str()
                        .map(|v| (k.clone(), crate::text::js_trim(v).into()))
                })
                .collect(),
        ),
        Some(Value::Array(values)) => Some(
            values
                .iter()
                .enumerate()
                .filter_map(|(k, v)| {
                    v.as_str()
                        .map(|v| (k.to_string(), crate::text::js_trim(v).into()))
                })
                .collect(),
        ),
        _ => None,
    };
    let reasoning_effort = match body.get("reasoning_effort") {
        Some(Value::Null) => Patch::Set(None),
        Some(Value::String(s)) => Patch::Set(
            ["minimal", "low", "medium", "high"]
                .contains(&s.as_str())
                .then(|| s.clone()),
        ),
        _ => Patch::Missing,
    };
    UserSettingsPatch {
        theme: enum_patch(body, "theme", &["light", "dark", "system"]),
        api_keys,
        disabled_tools: strings(body, "disabled_tools"),
        stt_provider: enum_patch(
            body,
            "stt_provider",
            &["wyoming", "whisper", "gpt", "elevenlabs"],
        ),
        chat_streaming_action: enum_patch(
            body,
            "chat_streaming_action",
            &["steer", "queue", "thread"],
        ),
        chat_provider: Some(trimmed(body, "chat_provider")).filter(|v| !v.is_empty()),
        jait_backend: enum_patch(
            body,
            "jait_backend",
            &[
                "openai",
                "openrouter",
                "ollama",
                "omniroute",
                "gemini",
                "anthropic",
                "grok",
                "perplexity",
                "moonshot",
                "kimi",
                "vllm",
                "opencode-go",
            ],
        ),
        recent_models: strings(body, "recent_models").map(|v| v.into_iter().take(20).collect()),
        selected_model: nullable_patch(body, "selected_model"),
        reasoning_effort,
        project_picker_path: nullable_patch(body, "project_picker_path"),
        project_picker_node_id: nullable_patch(body, "project_picker_node_id"),
    }
}
enum PasswordWork {
    None,
    Registration(String),
    Login {
        id: String,
        hash: String,
        verified: bool,
    },
}
fn unavailable() -> Response {
    response(
        503,
        json!({"statusCode":503,"error":"Service Unavailable","message":"Service Unavailable"}),
    )
}
pub(crate) fn database_failure(error: &Error) -> Response {
    if matches!(
        error.downcast_ref::<DatabaseError>(),
        Some(DatabaseError::Busy | DatabaseError::Closed)
    ) {
        unavailable()
    } else {
        internal_error()
    }
}
async fn password_work(
    state: &AuthState,
    path: &str,
    body: &Value,
) -> Result<PasswordWork, Box<Response>> {
    let username = trimmed(body, "username");
    let password = body["password"].as_str().unwrap_or("").to_string();
    if username.is_empty() || password.is_empty() {
        return Ok(PasswordWork::None);
    }
    if path == "/api/auth/register" && password.encode_utf16().count() >= 8 {
        let hash = state
            .passwords
            .run(move || crate::services::users::hash_password(&password))
            .await
            .map_err(|_| Box::new(unavailable()))?
            .map_err(|_| Box::new(internal_error()))?;
        return Ok(PasswordWork::Registration(hash));
    }
    if path == "/api/auth/login" {
        let stored = state
            .with_database(move |db| {
                let users = UserService::new(db);
                let Some(user) = users.find_by_username(&username)? else {
                    return Ok(None);
                };
                let hash: String = db.query_row(
                    "SELECT password_hash FROM users WHERE id=?",
                    [&user.id],
                    |r| r.get(0),
                )?;
                Ok(Some((user.id, hash)))
            })
            .await
            .map_err(|error| Box::new(database_failure(&error)))?;
        if let Some((id, hash)) = stored {
            let encoded = hash.clone();
            let verified = state
                .passwords
                .run(move || crate::services::users::verify_password_hash(&password, &encoded))
                .await
                .map_err(|_| Box::new(unavailable()))?;
            return Ok(PasswordWork::Login { id, hash, verified });
        }
    }
    Ok(PasswordWork::None)
}
async fn handle(State(state): State<AuthState>, request: Request) -> Response {
    let path = request.uri().path().to_string();
    let method = request.method().clone();
    let headers = request.headers().clone();
    if !request_origin::is_allowed_request_origin(
        headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()),
        headers.get(header::HOST).and_then(|v| v.to_str().ok()),
        &state.cors_origin,
    ) && http_auth::extract_bearer_token(
        headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok()),
    )
    .is_none()
    {
        return response(403, json!({"error":"ORIGIN_FORBIDDEN"}));
    }
    if !http_auth::is_public_api_path(&path) {
        let Some(user) = auth_user(&headers, &state.secret) else {
            return denied();
        };
        match state
            .with_database(move |db| Ok(UserService::new(db).find_by_id(&user.id)?.is_some()))
            .await
        {
            Ok(true) => {}
            Ok(false) => return denied(),
            Err(error) => return database_failure(&error),
        }
    }
    let body = match parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(result) => return *result,
    };
    let password = match password_work(&state, &path, &body).await {
        Ok(password) => password,
        Err(response) => return *response,
    };
    let worker_state = state.clone();
    match state
        .with_database(move |db| {
            dispatch(
                &worker_state,
                db,
                method.as_str(),
                &path,
                body,
                &headers,
                password,
            )
        })
        .await
    {
        Ok(result) => result,
        Err(error) => database_failure(&error),
    }
}
fn dispatch(
    state: &AuthState,
    db: &Connection,
    method: &str,
    path: &str,
    body: Value,
    headers: &HeaderMap,
    password_work: PasswordWork,
) -> Result<Response, Error> {
    let users = UserService::new(db);
    if path == "/api/auth/register" || path == "/api/auth/login" {
        let username = trimmed(&body, "username");
        let password = body["password"].as_str().unwrap_or("");
        if username.is_empty() || password.is_empty() {
            return Ok(response(
                400,
                json!({"detail":"username and password are required"}),
            ));
        }
        if path.ends_with("/register") {
            if password.encode_utf16().count() < 8 {
                return Ok(response(
                    400,
                    json!({"detail":"password must be at least 8 characters"}),
                ));
            }
            if users.find_by_username(&username)?.is_some() {
                return Ok(response(409, json!({"detail":"username already exists"})));
            }
            if users.count_users()? > 0 {
                let invitation = trimmed(&body, "invitation");
                if invitation.is_empty() || !users.consume_invitation(&invitation)? {
                    return Ok(response(
                        403,
                        json!({"detail":"An invitation from the gateway owner is required"}),
                    ));
                }
            }
            let PasswordWork::Registration(hash) = password_work else {
                return Ok(internal_error());
            };
            let user = users.create_user_with_hash(&username, &hash)?;
            return token_response(
                AuthUser {
                    id: user.id,
                    username: user.username,
                },
                &state.secret,
            );
        }
        let PasswordWork::Login {
            id,
            hash,
            verified: true,
        } = password_work
        else {
            return Ok(response(401, json!({"detail":"invalid_credentials"})));
        };
        // Revalidate the credential snapshot after CPU work: deleted or changed
        // credentials must never receive a token from an older verification.
        let current: Option<String> = {
            use rusqlite::OptionalExtension;
            db.query_row("SELECT password_hash FROM users WHERE id=?", [&id], |r| {
                r.get(0)
            })
            .optional()?
        };
        if current.as_deref() != Some(&hash) {
            return Ok(response(401, json!({"detail":"invalid_credentials"})));
        }
        let Some(user) = users.find_by_id(&id)? else {
            return Ok(denied());
        };
        return token_response(
            AuthUser {
                id: user.id,
                username: user.username,
            },
            &state.secret,
        );
    }
    let user = auth_user(headers, &state.secret);
    if path == "/api/auth/refresh" {
        let Some(user) = user else {
            return Ok(StatusCode::NO_CONTENT.into_response());
        };
        let Some(user) = users.find_by_id(&user.id)? else {
            return Ok(StatusCode::NO_CONTENT.into_response());
        };
        return token_response(
            AuthUser {
                id: user.id,
                username: user.username,
            },
            &state.secret,
        );
    }
    let Some(user) = user else {
        return Ok(denied());
    };
    if users.find_by_id(&user.id)?.is_none() {
        return Ok(denied());
    }
    Ok(match (method, path) {
        ("POST", "/api/auth/logout") => {
            let mut result = response(200, json!({"ok":true}));
            result.headers_mut().insert(header::SET_COOKIE,"jait_token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax".parse()?);
            result
        }
        ("GET", "/api/auth/me") => {
            let stored = users.find_by_id(&user.id)?.expect("validated user");
            response(200, json!({"id":stored.id,"username":stored.username}))
        }
        ("POST", "/api/auth/invitations") => match users.create_invitation(&user.id)? {
            Some(invitation) => response(200, json!({"invitation":invitation,"expiresInHours":24})),
            None => response(
                403,
                json!({"detail":"Only the gateway owner can invite accounts"}),
            ),
        },
        ("GET", "/api/auth/settings") => {
            response(200, settings_response(users.get_settings(&user.id)?))
        }
        ("PATCH", "/api/auth/settings") => response(
            200,
            settings_response(users.update_settings(&user.id, settings_patch(&body))?),
        ),
        ("DELETE", "/api/auth/settings/archive") => response(
            200,
            json!({"ok":true,"removed":users.clear_archived_sessions(&user.id)?}),
        ),
        ("GET", "/api/auth/settings/env-status") => response(
            200,
            json!({"env_set":ENV_KEYS.iter().map(|k|(k.to_string(),*state.env_set.get(*k).unwrap_or(&false))).collect::<BTreeMap<_,_>>()}),
        ),
        ("GET", "/api/auth/settings/tools") => {
            let Some(tools) = &state.tools else {
                return Ok(response(
                    503,
                    json!({"detail":"tool registry not available"}),
                ));
            };
            let disabled: HashSet<_> = users
                .get_settings(&user.id)?
                .disabled_tools
                .into_iter()
                .collect();
            let tools:Vec<_>=tools.iter().map(|t|json!({"name":t.name,"displayName":t.display_name.as_ref().unwrap_or(&t.name),"description":t.description,"tier":t.tier,"category":t.category,"source":t.source,"enabled":!disabled.contains(&t.name),"locked":t.tier=="core"})).collect();
            response(
                200,
                json!({"total":tools.len(),"tools":tools,"disabled_count":disabled.len()}),
            )
        }
        ("PATCH", "/api/auth/settings/tools") => {
            let Some(tools) = &state.tools else {
                return Ok(response(
                    503,
                    json!({"detail":"tool registry not available"}),
                ));
            };
            let Some(input) = body["disabled_tools"].as_array() else {
                return Ok(response(
                    400,
                    json!({"detail":"disabled_tools must be an array of tool name strings"}),
                ));
            };
            let disabled = input
                .iter()
                .filter_map(Value::as_str)
                .filter(|name| tools.iter().any(|t| t.name == *name && t.tier != "core"))
                .map(String::from)
                .collect();
            let updated = users.update_settings(
                &user.id,
                UserSettingsPatch {
                    disabled_tools: Some(disabled),
                    ..Default::default()
                },
            )?;
            response(
                200,
                json!({"disabled_tools":updated.disabled_tools,"updated_at":updated.updated_at}),
            )
        }
        ("POST", "/api/auth/session/bind") => {
            let session = body["session_id"].as_str().unwrap_or("");
            if session.is_empty() {
                response(400, json!({"detail":"session_id is required"}))
            } else if users.bind_session_to_user(&user.id, session)? {
                response(200, json!({"ok":true}))
            } else {
                response(404, json!({"detail":"session not found"}))
            }
        }
        _ => response(404, json!({"error":"Not Found"})),
    })
}

pub(crate) async fn parse_body(
    body: axum::body::Body,
    headers: &HeaderMap,
) -> Result<Value, Box<Response>> {
    let error = |status, body| Box::new(response(status, body));
    let bytes = to_bytes(body, BODY_LIMIT).await.map_err(|_| error(413, json!({"statusCode":413,"code":"FST_ERR_CTP_BODY_TOO_LARGE","error":"Payload Too Large","message":"Request body is too large"})))?;
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let json_type = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .eq_ignore_ascii_case("application/json");
    if bytes.is_empty() {
        return if json_type {
            Err(error(
                400,
                json!({"statusCode":400,"code":"FST_ERR_CTP_EMPTY_JSON_BODY","error":"Bad Request","message":"Body cannot be empty when content-type is set to 'application/json'"}),
            ))
        } else {
            Ok(Value::Null)
        };
    }
    if json_type {
        let invalid = || {
            error(
                400,
                json!({"statusCode":400,"code":"FST_ERR_CTP_INVALID_JSON_BODY","error":"Bad Request","message":"Body is not valid JSON but content-type is set to 'application/json'"}),
            )
        };
        // Fastify decodes request bytes as UTF-8 with replacement, strips one
        // leading BOM and rejects prototype/constructor poisoning recursively.
        let text = String::from_utf8_lossy(&bytes);
        let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
        let value: Value = serde_json::from_str(text).map_err(|_| invalid())?;
        if forbidden_json_property(&value) {
            return Err(invalid());
        }
        return Ok(value);
    }
    if content_type.starts_with("text/plain") {
        return Ok(Value::String(String::from_utf8_lossy(&bytes).into_owned()));
    }
    Err(error(
        415,
        json!({"statusCode":415,"code":"FST_ERR_CTP_INVALID_MEDIA_TYPE","error":"Unsupported Media Type","message":"Unsupported Media Type"}),
    ))
}

fn forbidden_json_property(value: &Value) -> bool {
    match value {
        Value::Object(map) => {
            map.contains_key("__proto__")
                || map
                    .get("constructor")
                    .is_some_and(|c| c.is_object() && c.get("prototype").is_some())
                || map.values().any(forbidden_json_property)
        }
        Value::Array(array) => array.iter().any(forbidden_json_property),
        _ => false,
    }
}
