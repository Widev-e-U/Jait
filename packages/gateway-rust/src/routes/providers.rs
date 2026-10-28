//! Native port of `packages/gateway/src/routes/providers.ts`.
//!
//! The TypeScript file registers three families of Fastify routes on one app;
//! they are reproduced here verbatim, in the same order, with the same auth
//! requirement (`requireAuth` -> [`auth::require_user`]) and the same error
//! envelopes (`{ "error": ... }`). Route table (TS `app.<verb>("path", ...)`)
//! and the handler that serves it:
//!
//! | method | path                                   | handler            |
//! |--------|----------------------------------------|--------------------|
//! | GET    | `/api/provider-accounts`               | [`list_accounts`]  |
//! | POST   | `/api/provider-accounts`               | [`create_account`] |
//! | PATCH  | `/api/provider-accounts/{id}`          | [`rename_account`] |
//! | DELETE | `/api/provider-accounts/{id}`          | [`delete_account`] |
//! | POST   | `/api/provider-accounts/{id}/opencode-go` | [`connect_opencode_go`] |
//! | GET    | `/api/provider-usage`                  | [`list_usage`]     |
//! | GET    | `/api/provider-usage/summary`          | [`usage_summary`]  |
//! | POST   | `/api/provider-usage/ollama/session`   | [`ollama_session`] |
//! | POST   | `/api/provider-usage/ollama/api-key`   | [`ollama_api_key`] |
//! | GET    | `/api/providers`                       | [`list_providers`] |
//! | POST   | `/api/providers/{id}/update`           | [`update_provider`]|
//! | GET    | `/api/providers/{id}/auth/status`      | [`auth_status`]    |
//! | POST   | `/api/providers/{id}/auth/login`       | [`auth_login`]     |
//! | POST   | `/api/providers/{id}/auth/login/input` | [`auth_login_input`]|
//! | POST   | `/api/providers/{id}/auth/logout`      | [`auth_logout`]    |
//! | POST   | `/api/providers/omniroute/test`        | [`omniroute_test`] |
//! | POST   | `/api/providers/backend/test`          | [`backend_test`]   |
//! | POST   | `/api/providers/models/reset`          | [`models_reset`]   |
//! | GET    | `/api/providers/{id}/models`           | [`list_models`]    |
//!
//! Services reach the handlers through the traits below instead of a concrete
//! struct-per-service, so this module never reaches into another worker's
//! files and the coordinator can wire whichever concrete service it has:
//!
//! * [`ProviderDirectory`]  <- TS `deps.providerAccountService`
//! * [`ProviderRuntime`]    <- TS `resolveProvider()` / `providerRegistry`
//! * [`UsageStore`]         <- TS `deps.providerUsageService` + `readUsageSummary`
//! * [`SettingsStore`]      <- TS `deps.userService.getSettings/updateSettings`
//! * [`ProviderProbes`]     <- TS `fetchOllamaUsage` / `fetchOllamaSettingsUsage`
//!   and the `omniroute/test` + `backend/test` probes
//!
//! Every outbound value passes through [`redact_value`]; every log line must go
//! through [`redact_text`]. Tokens, API keys, cookies and OAuth codes never
//! appear in a response or a log record.
use crate::routes::auth::{self, AuthState};
use axum::{
    body::Body,
    extract::{Path, State},
    http::HeaderMap,
    response::Response,
    routing::{get, patch, post},
    Router,
};
use futures_util::future::BoxFuture;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::Arc;

/// TS `GATEWAY_NODE_NAME`; stamped on every locally-owned provider row.
pub const GATEWAY_NODE_NAME: &str = "gateway";

/// Upper bound for any free-form code / key accepted from a client.
pub const MAX_CREDENTIAL_INPUT: usize = 4096;

/// Maximum number of accounts included in a usage listing.
const MAX_USAGE_ACCOUNTS: usize = 256;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct ProviderRoutes {
    pub auth: AuthState,
    /// TS `deps.providerAccountService` (may be absent in minimal builds).
    pub directory: Option<Arc<dyn ProviderDirectory>>,
    /// TS `providerRegistry` + `resolveProvider()`.
    pub providers: Option<Arc<dyn ProviderRuntime>>,
    /// TS `deps.providerUsageService` + `readUsageSummary`.
    pub usage: Option<Arc<dyn UsageStore>>,
    /// TS `deps.userService`.
    pub settings: Option<Arc<dyn SettingsStore>>,
    /// TS direct `fetch` calls used by the Ollama / OmniRoute / backend probes.
    pub probes: Option<Arc<dyn ProviderProbes>>,
}

impl ProviderRoutes {
    fn directory(&self) -> Result<&Arc<dyn ProviderDirectory>, Response> {
        self.directory
            .as_ref()
            .ok_or_else(|| fail(503, "Provider accounts are unavailable"))
    }

    fn runtime(&self) -> Result<&Arc<dyn ProviderRuntime>, Response> {
        self.providers
            .as_ref()
            .ok_or_else(|| fail(503, "Provider registry is unavailable"))
    }

    fn settings(&self) -> Result<&Arc<dyn SettingsStore>, Response> {
        self.settings
            .as_ref()
            .ok_or_else(|| fail(503, "Settings are unavailable"))
    }
}

// ---------------------------------------------------------------------------
// Service traits (each maps 1:1 onto a TS collaborator)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    /// TS `reply.status(400).send({ error })` from the service layer.
    Invalid(String),
    /// TS `reply.status(404).send({ error })`.
    NotFound(String),
    /// TS `reply.status(409).send({ error })`.
    Conflict(String),
    /// TS `reply.status(500).send({ error })`.
    Failed(String),
    /// The deployment has no such capability.
    Unavailable(String),
}

impl StoreError {
    pub fn into_response(self) -> Response {
        match self {
            StoreError::Invalid(message) => fail(400, message),
            StoreError::NotFound(message) => fail(404, message),
            StoreError::Conflict(message) => fail(409, message),
            StoreError::Failed(message) => fail(500, message),
            StoreError::Unavailable(message) => fail(503, message),
        }
    }
}

/// TS `deps.providerAccountService`.
///
/// Records are exchanged as JSON objects because that is exactly what crosses
/// the wire in the TypeScript implementation (`ProviderAccountRecord`).
pub trait ProviderDirectory: Send + Sync {
    /// TS `refreshTypes()`.
    fn refresh_types(&self) -> Vec<Value> {
        Vec::new()
    }
    /// TS `getType(id)` -> display icon.
    fn icon(&self, _provider_type: &str) -> Option<String> {
        None
    }
    /// TS `getType(id)` -> display name.
    fn type_name(&self, _provider_type: &str) -> Option<String> {
        None
    }
    /// TS `list(userId)`; already redacted by the implementation.
    fn list_accounts(&self, _user: &str) -> Result<Vec<Value>, StoreError> {
        Ok(Vec::new())
    }
    /// TS `get(accountId, userId)`.
    fn get_account(&self, _id: &str, _user: &str) -> Option<Value> {
        None
    }
    /// TS `create(userId, body)`.
    fn create_account(&self, _user: &str, _body: &Map<String, Value>) -> Result<Value, StoreError> {
        Err(StoreError::Unavailable("Provider accounts are unavailable".into()))
    }
    /// TS `rename(accountId, userId, label)`.
    fn rename_account(&self, _id: &str, _user: &str, _label: &str) -> Result<Value, StoreError> {
        Err(StoreError::Unavailable("Provider accounts are unavailable".into()))
    }
    /// TS `delete(accountId, userId)`.
    fn delete_account(&self, _id: &str, _user: &str) -> Result<bool, StoreError> {
        Err(StoreError::Unavailable("Provider accounts are unavailable".into()))
    }
    /// TS `connectOpencodeGo(...)`.
    fn connect_opencode_go(
        &self,
        _id: &str,
        _user: &str,
        _body: &Map<String, Value>,
    ) -> BoxFuture<'static, Result<Value, StoreError>> {
        Box::pin(async { Err(StoreError::Unavailable("Provider accounts are unavailable".into())) })
    }
    /// TS `refreshUsage(userId)` -> `{ [accountId]: error }` for failed quota reads.
    fn refresh_usage(&self, _user: &str) -> BoxFuture<'static, Map<String, Value>> {
        Box::pin(async { Map::new() })
    }
}

/// Outcome of a login/logout attempt; mirrors TS `AuthResult`
/// (`{ ok, status, message?, ... }`).
#[derive(Debug, Clone)]
pub struct AuthOutcome {
    pub ok: bool,
    /// TS `result.status`, e.g. `"unsupported"`, `"pending"`, `"success"`.
    pub status: String,
    pub payload: Value,
}

impl AuthOutcome {
    pub fn unsupported(provider: &str, capability: &str, message: &str) -> Self {
        Self {
            ok: false,
            status: "unsupported".into(),
            payload: json!({
                "ok": false,
                "status": "unsupported",
                "provider": provider,
                "capability": capability,
                "message": message,
            }),
        }
    }

    /// Maps TS `if (!result.ok && result.status === "unsupported") 501; if
    /// (!result.ok) 500; return result`.
    fn into_response(self) -> Response {
        let payload = redact_value(&self.payload);
        if self.ok {
            return auth::response(200, payload);
        }
        let status = if self.status == "unsupported" { 501 } else { 500 };
        auth::response(status, payload)
    }
}

/// TS `providerRegistry` + `resolveProvider(id, userId)` and the optional
/// adapter methods (`getAuthStatus`, `startLogin`, `sendLoginInput`, `logout`,
/// `listModels`, `resetModels`).
pub trait ProviderRuntime: Send + Sync {
    /// TS `providerRegistry.list()`.
    fn list(&self) -> Vec<Value> {
        Vec::new()
    }
    /// TS `providerRegistry.isVisibleTo(id, userId)`.
    fn is_visible_to(&self, _id: &str, _user: &str) -> bool {
        false
    }
    /// TS `resolveProvider(id, userId)`; `Some(info)` means the provider exists
    /// and is visible to this user. `info` is the adapter payload
    /// (`ProviderInfoPayload`).
    fn info(&self, _id: &str, _user: &str) -> Option<Value> {
        None
    }
    /// TS `provider.getAuthStatus()`; `None` -> 501.
    fn auth_status(&self, _id: &str, _user: &str) -> Option<Value> {
        None
    }
    /// TS `provider.startLogin()`.
    fn start_login(&self, id: &str, user: &str) -> BoxFuture<'static, AuthOutcome> {
        let (id, _user) = (id.to_string(), user.to_string());
        Box::pin(async move {
            AuthOutcome::unsupported(&id, "login", &format!("Provider {id} does not support login"))
        })
    }
    /// TS `provider.sendLoginInput(code)`.
    fn send_login_input(&self, _id: &str, _user: &str, _code: &str) -> bool {
        false
    }
    /// TS `provider.logout()`.
    fn logout(&self, id: &str, user: &str) -> BoxFuture<'static, AuthOutcome> {
        let (id, _user) = (id.to_string(), user.to_string());
        Box::pin(async move {
            AuthOutcome::unsupported(&id, "logout", &format!("Provider {id} does not support logout"))
        })
    }
    /// TS `provider.update(body)` from `POST /api/providers/:id/update`.
    fn update_config(
        &self,
        _id: &str,
        _user: &str,
        _body: &Map<String, Value>,
    ) -> Result<Value, StoreError> {
        Err(StoreError::Unavailable("Provider update is unavailable".into()))
    }
    /// TS `provider.listModels()`.
    fn list_models(&self, _id: &str, _user: &str) -> BoxFuture<'static, Result<Vec<Value>, String>> {
        Box::pin(async { Ok(Vec::new()) })
    }
    /// TS `provider.resetModels()` / `resetModelFetcherCaches()`.
    fn reset_models(&self, _user: &str) {}
}

/// TS `deps.providerUsageService` and `readUsageSummary(userId, refresh)`.
pub trait UsageStore: Send + Sync {
    /// TS `listForUser(accountIds)`.
    fn list_for_user(&self, _account_ids: &[String]) -> Vec<Value> {
        Vec::new()
    }
    /// TS `readUsageSummary(userId, refresh)`; the payload is redacted here.
    fn summary(&self, _user: &str, _refresh: bool) -> BoxFuture<'static, Result<Value, String>> {
        Box::pin(async { Ok(json!({ "profiles": [] })) })
    }
}

/// TS `deps.userService` settings access.
pub trait SettingsStore: Send + Sync {
    fn get_settings(&self, _user: &str) -> Option<Value> {
        None
    }
    /// TS `settings.apiKeys`.
    fn api_keys(&self, user: &str) -> Map<String, Value> {
        self.get_settings(user)
            .and_then(|settings| settings.get("apiKeys").and_then(Value::as_object).cloned())
            .unwrap_or_default()
    }
    /// TS `updateSettings(userId, { apiKeys })` -- merged, never wholesale replaced.
    fn update_api_keys(&self, _user: &str, _keys: Map<String, Value>) -> Result<(), String> {
        Err("Settings are unavailable".into())
    }
}

/// Network probes the TypeScript routes perform inline.
pub trait ProviderProbes: Send + Sync {
    /// TS `fetchOllamaSettingsUsage(cookie)`; resolves to the caller's account.
    fn verify_ollama_session(&self, _session: &str) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Err("Ollama usage is unavailable".into()) })
    }
    /// TS `fetchOllamaUsage(apiKey)`.
    fn verify_ollama_api_key(&self, _api_key: &str) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Err("Ollama usage is unavailable".into()) })
    }
    /// TS `POST /api/providers/omniroute/test` body.
    fn probe_omniroute(
        &self,
        _base_url: &str,
        _api_key: Option<&str>,
    ) -> BoxFuture<'static, Result<Value, String>> {
        Box::pin(async { Err("Probing is unavailable".into()) })
    }
    /// TS `POST /api/providers/backend/test` body.
    fn probe_backend(
        &self,
        _kind: &str,
        _base_url: &str,
        _api_key: Option<&str>,
    ) -> BoxFuture<'static, Result<Value, String>> {
        Box::pin(async { Err("Probing is unavailable".into()) })
    }
}

// ---------------------------------------------------------------------------
// Responses and redaction
// ---------------------------------------------------------------------------

/// TS `reply.status(status).send({ error })`.
pub fn fail(status: u16, message: impl Into<String>) -> Response {
    auth::response(status, json!({ "error": message.into() }))
}

/// TS `return { ok: true }` and other small success envelopes.
pub fn ok_json(payload: Value) -> Response {
    auth::response(200, redact_value(&payload))
}

/// Keys whose values must never leave the process. `deviceCode` / `userCode`
/// are user-facing by design (RFC 8628) and stay readable.
pub fn is_secret_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    if matches!(key.as_str(), "devicecode" | "usercode" | "verificationuri" | "verification_uri") {
        return false;
    }
    const NEEDLES: [&str; 12] = [
        "apikey",
        "api_key",
        "secret",
        "password",
        "passwd",
        "cookie",
        "session",
        "authorization",
        "bearer",
        "token",
        "credential",
        "code",
    ];
    NEEDLES.iter().any(|needle| key.contains(needle))
}

fn is_token_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~' | b'+' | b'/' | b'=')
}

fn token_run_len(input: &str) -> usize {
    input.bytes().take_while(|byte| is_token_byte(*byte)).count()
}

fn secret_prefix_len(input: &str) -> Option<usize> {
    const PREFIXES: [&str; 5] = ["sk-", "sk_", "ghp_", "xoxb-", "AIza"];
    PREFIXES
        .iter()
        .find(|prefix| input.starts_with(**prefix) && token_run_len(input) > prefix.len())
        .map(|prefix| prefix.len())
}

fn bearer_prefix_len(input: &str) -> Option<usize> {
    let lower = input.as_bytes();
    if lower.len() >= 7 && lower[..7].eq_ignore_ascii_case(b"bearer ") {
        Some(7)
    } else {
        None
    }
}

/// `eyJ...` JWT triples: mask the whole token when it has two dots.
fn jwt_len(input: &str) -> Option<usize> {
    if !input.starts_with("ey") {
        return None;
    }
    let len = token_run_len(input);
    if len < 16 {
        return None;
    }
    let token = &input[..len];
    if token.matches('.').count() == 2 {
        Some(len)
    } else {
        None
    }
}

/// Mask credentials inside free text before it reaches a log sink or an
/// `error` field (TS `redactSecrets`).
pub fn redact_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut index = 0usize;
    while index < input.len() {
        let rest = &input[index..];
        if let Some(prefix) = secret_prefix_len(rest) {
            out.push_str(&rest[..prefix]);
            out.push_str("[redacted]");
            index += prefix + token_run_len(&rest[prefix..]).max(1);
            continue;
        }
        if let Some(prefix) = bearer_prefix_len(rest) {
            let end = token_run_len(&rest[prefix..]);
            out.push_str(&rest[..prefix]);
            if end > 0 {
                out.push_str("[redacted]");
                index += prefix + end;
            } else {
                index += prefix;
            }
            continue;
        }
        if let Some(len) = jwt_len(rest) {
            out.push_str("[redacted]");
            index += len;
            continue;
        }
        let ch = rest.chars().next().expect("non-empty slice");
        out.push(ch);
        index += ch.len_utf8();
    }
    out
}

/// Recursively redact a JSON payload (TS `redactDeep`): secret-named keys are
/// replaced, every remaining string is scrubbed by [`redact_text`].
pub fn redact_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut out = Map::with_capacity(map.len());
            for (key, item) in map {
                if is_secret_key(key) && !item.is_null() {
                    out.insert(key.clone(), Value::String("[redacted]".into()));
                } else {
                    out.insert(key.clone(), redact_value(item));
                }
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(redact_value).collect()),
        Value::String(text) => Value::String(redact_text(text)),
        other => other.clone(),
    }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/// TS `code.trim()` with JavaScript `String.prototype.trim` semantics
/// (Unicode whitespace, including U+00A0 and U+FEFF).
/// Query-string parsing. The crate builds axum without the `query` feature, so
/// handlers take `Uri` and decode `uri.query()` here (same approach as
/// `routes::project::params`). Maps to reading `request.query` in the TS route.
fn query_params(uri: &axum::http::Uri) -> HashMap<String, String> {
    uri.query()
        .map(|raw| {
            url::form_urlencoded::parse(raw.as_bytes())
                .map(|(key, value)| (key.into_owned(), value.into_owned()))
                .collect()
        })
        .unwrap_or_default()
}

fn js_trim(input: &str) -> &str {
    input.trim_matches(|ch: char| ch.is_whitespace() || ch == '\u{feff}')
}

/// TS `if (!code || typeof code !== "string" || !code.trim()) 400`.
pub fn valid_code_input(code: Option<&Value>) -> Result<String, Response> {
    let Some(Value::String(code)) = code else {
        return Err(fail(400, "Missing or empty code"));
    };
    let trimmed = js_trim(code);
    if trimmed.is_empty() {
        return Err(fail(400, "Missing or empty code"));
    }
    if trimmed.len() > MAX_CREDENTIAL_INPUT {
        return Err(fail(400, "Code is too long"));
    }
    Ok(trimmed.to_string())
}

/// TS `typeof body.apiKey !== "string" || !body.apiKey.trim() || body.apiKey.length > 4096`.
pub fn valid_ollama_api_key(api_key: Option<&Value>) -> Result<String, Response> {
    let Some(Value::String(key)) = api_key else {
        return Err(fail(400, "Enter an Ollama Cloud API key."));
    };
    if key.len() > MAX_CREDENTIAL_INPUT || js_trim(key).is_empty() {
        return Err(fail(400, "Enter an Ollama Cloud API key."));
    }
    Ok(js_trim(key).to_string())
}

/// TS `session !== null && typeof session !== "string"` -> 400.
/// `Ok(None)` clears the stored cookie, `Ok(Some(_))` stores it.
pub fn valid_ollama_session(session: Option<&Value>) -> Result<Option<String>, Response> {
    match session {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => {
            if text.len() > MAX_CREDENTIAL_INPUT {
                return Err(fail(400, "Enter an Ollama browser session."));
            }
            Ok(Some(js_trim(text).to_string()))
        }
        Some(_) => Err(fail(400, "Enter an Ollama browser session.")),
    }
}

/// TS `PATCH /api/provider-accounts/:id` label validation.
pub fn valid_account_label(label: Option<&Value>) -> Result<String, Response> {
    let Some(Value::String(label)) = label else {
        return Err(fail(400, "Missing or empty label"));
    };
    let trimmed = js_trim(label);
    if trimmed.is_empty() {
        return Err(fail(400, "Missing or empty label"));
    }
    if trimmed.chars().count() > 128 {
        return Err(fail(400, "Label is too long"));
    }
    Ok(trimmed.to_string())
}

/// TS `POST /api/provider-accounts` requires a provider type.
pub fn valid_account_create(body: &Map<String, Value>) -> Result<(String, String), Response> {
    let provider_type = body
        .get("providerType")
        .and_then(Value::as_str)
        .map(js_trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| fail(400, "Missing provider type"))?;
    let label = match body.get("label") {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(label)) => js_trim(label).to_string(),
        Some(_) => return Err(fail(400, "Invalid label")),
    };
    Ok((provider_type.to_string(), label))
}

/// Base URLs must be absolute `http(s)` and must not smuggle credentials.
pub fn validate_base_url(raw: &str) -> Result<String, Response> {
    let trimmed = js_trim(raw);
    if trimmed.is_empty() {
        return Err(fail(400, "Missing base URL"));
    }
    if trimmed.len() > 2048 {
        return Err(fail(400, "Base URL is too long"));
    }
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err(fail(400, "Base URL must be an http(s) URL"));
    }
    let after_scheme = trimmed.split_once("://").map(|x| x.1).unwrap_or_default();
    let authority = after_scheme.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() {
        return Err(fail(400, "Base URL must include a host"));
    }
    if authority.contains('@') {
        return Err(fail(400, "Base URL must not contain credentials"));
    }
    Ok(trimmed.trim_end_matches('/').to_string())
}

/// TS `const mode = query.refresh; if (mode === "0") return readUsageSummary(id, false)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefreshMode {
    Cached,
    Refresh,
    Force,
}

pub fn parse_refresh_mode(raw: Option<&str>) -> RefreshMode {
    match raw {
        Some("0") => RefreshMode::Cached,
        Some("force") => RefreshMode::Force,
        _ => RefreshMode::Refresh,
    }
}

/// TS `const force = fresh === "1" || fresh === "true"`.
pub fn parse_fresh(raw: Option<&str>) -> bool {
    matches!(raw, Some("1") | Some("true"))
}

/// TS `nodeId: account?.nodeId ?? "gateway"`.
pub fn account_node(account: Option<&Value>) -> String {
    account
        .and_then(|record| record.get("nodeId"))
        .and_then(Value::as_str)
        .filter(|node| !node.is_empty())
        .unwrap_or(GATEWAY_NODE_NAME)
        .to_string()
}

/// TS `{ ...provider, ...(update ? { update } : {}), ...(icon ? { icon } : {}),
/// nodeId: "gateway", nodeName: GATEWAY_NODE_NAME }` then redacted.
pub fn provider_entry(info: &Value, icon: Option<&str>) -> Value {
    let mut map = match info {
        Value::Object(map) => map.clone(),
        other => {
            let mut map = Map::new();
            map.insert("id".into(), other.clone());
            map
        }
    };
    if let Some(icon) = icon.filter(|icon| !icon.is_empty()) {
        map.insert("icon".into(), Value::String(icon.to_string()));
    }
    map.insert("nodeId".into(), Value::String(GATEWAY_NODE_NAME.into()));
    map.insert("nodeName".into(), Value::String(GATEWAY_NODE_NAME.into()));
    redact_value(&Value::Object(map))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/// Builds every route in the TS `providers.ts` registration block.
pub fn router(state: ProviderRoutes) -> Router {
    Router::new()
        // account CRUD
        .route("/api/provider-accounts", get(list_accounts).post(create_account))
        .route(
            "/api/provider-accounts/{id}",
            patch(rename_account).delete(delete_account),
        )
        .route(
            "/api/provider-accounts/{id}/opencode-go",
            post(connect_opencode_go),
        )
        // usage
        .route("/api/provider-usage", get(list_usage))
        .route("/api/provider-usage/summary", get(usage_summary))
        .route("/api/provider-usage/ollama/session", post(ollama_session))
        .route("/api/provider-usage/ollama/api-key", post(ollama_api_key))
        // providers
        .route("/api/providers", get(list_providers))
        .route("/api/providers/{id}/update", post(update_provider))
        .route("/api/providers/{id}/auth/status", get(auth_status))
        .route("/api/providers/{id}/auth/login", post(auth_login))
        .route("/api/providers/{id}/auth/login/input", post(auth_login_input))
        .route("/api/providers/{id}/auth/logout", post(auth_logout))
        .route("/api/providers/omniroute/test", post(omniroute_test))
        .route("/api/providers/backend/test", post(backend_test))
        .route("/api/providers/models/reset", post(models_reset))
        .route("/api/providers/{id}/models", get(list_models))
        .with_state(state)
}

/// Every `(method, path)` pair registered above; kept as data so the route
/// table can be asserted in tests without spinning up HTTP.
pub const ROUTE_TABLE: [(&str, &str); 19] = [
    ("GET", "/api/provider-accounts"),
    ("POST", "/api/provider-accounts"),
    ("PATCH", "/api/provider-accounts/{id}"),
    ("DELETE", "/api/provider-accounts/{id}"),
    ("POST", "/api/provider-accounts/{id}/opencode-go"),
    ("GET", "/api/provider-usage"),
    ("GET", "/api/provider-usage/summary"),
    ("POST", "/api/provider-usage/ollama/session"),
    ("POST", "/api/provider-usage/ollama/api-key"),
    ("GET", "/api/providers"),
    ("POST", "/api/providers/{id}/update"),
    ("GET", "/api/providers/{id}/auth/status"),
    ("POST", "/api/providers/{id}/auth/login"),
    ("POST", "/api/providers/{id}/auth/login/input"),
    ("POST", "/api/providers/{id}/auth/logout"),
    ("POST", "/api/providers/omniroute/test"),
    ("POST", "/api/providers/backend/test"),
    ("POST", "/api/providers/models/reset"),
    ("GET", "/api/providers/{id}/models"),
];

// ---------------------------------------------------------------------------
// Account handlers
// ---------------------------------------------------------------------------

async fn list_accounts(State(state): State<ProviderRoutes>, headers: HeaderMap) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let (accounts, provider_types) = match state.directory.as_ref() {
        Some(directory) => (
            directory.list_accounts(&user.id).unwrap_or_default(),
            directory.refresh_types(),
        ),
        None => (Vec::new(), Vec::new()),
    };
    ok_json(json!({
        "accounts": accounts.into_iter().map(|account| redact_value(&account)).collect::<Vec<_>>(),
        "providerTypes": provider_types
            .into_iter()
            .map(|kind| redact_value(&kind))
            .collect::<Vec<_>>(),
    }))
}

async fn create_account(
    State(state): State<ProviderRoutes>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let directory = match state.directory() {
        Ok(directory) => directory.clone(),
        Err(response) => return response,
    };
    let payload = match auth::parse_body(body, &headers).await {
        Ok(payload) => payload,
        Err(response) => return *response,
    };
    let map = match payload {
        Value::Object(map) => map,
        _ => return fail(400, "Invalid request body"),
    };
    if let Err(response) = valid_account_create(&map) {
        return response;
    }
    match directory.create_account(&user.id, &map) {
        Ok(account) => auth::response(201, redact_value(&account)),
        Err(error) => error.into_response(),
    }
}

async fn rename_account(
    State(state): State<ProviderRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let directory = match state.directory() {
        Ok(directory) => directory.clone(),
        Err(response) => return response,
    };
    let payload = match auth::parse_body(body, &headers).await {
        Ok(payload) => payload,
        Err(response) => return *response,
    };
    let label = match valid_account_label(payload.get("label")) {
        Ok(label) => label,
        Err(response) => return response,
    };
    match directory.rename_account(&id, &user.id, &label) {
        Ok(account) => ok_json(account),
        Err(error) => error.into_response(),
    }
}

async fn delete_account(
    State(state): State<ProviderRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let directory = match state.directory() {
        Ok(directory) => directory.clone(),
        Err(response) => return response,
    };
    match directory.delete_account(&id, &user.id) {
        Ok(true) => ok_json(json!({ "ok": true })),
        Ok(false) => fail(404, "Provider account not found"),
        Err(error) => error.into_response(),
    }
}

async fn connect_opencode_go(
    State(state): State<ProviderRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let directory = match state.directory() {
        Ok(directory) => directory.clone(),
        Err(response) => return response,
    };
    let payload = match auth::parse_body(body, &headers).await {
        Ok(payload) => payload,
        Err(response) => return *response,
    };
    let map = match payload {
        Value::Object(map) => map,
        _ => return fail(400, "Invalid request body"),
    };
    if directory.get_account(&id, &user.id).is_none() {
        return fail(404, "Provider account not found");
    }
    match directory.connect_opencode_go(&id, &user.id, &map).await {
        Ok(account) => ok_json(account),
        Err(error) => error.into_response(),
    }
}

// ---------------------------------------------------------------------------
// Usage handlers
// ---------------------------------------------------------------------------

async fn list_usage(State(state): State<ProviderRoutes>, headers: HeaderMap) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let account_ids: Vec<String> = state
        .directory
        .as_ref()
        .and_then(|directory| directory.list_accounts(&user.id).ok())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|account| {
            account
                .get("id")
                .and_then(Value::as_str)
                .map(|id| id.to_string())
        })
        .take(MAX_USAGE_ACCOUNTS)
        .collect();
    let usage = state
        .usage
        .as_ref()
        .map(|usage| usage.list_for_user(&account_ids))
        .unwrap_or_default();
    ok_json(json!({
        "usage": usage.into_iter().map(|row| redact_value(&row)).collect::<Vec<_>>(),
    }))
}

async fn usage_summary(
    State(state): State<ProviderRoutes>,
    headers: HeaderMap,
    uri: axum::http::Uri,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let Some(usage) = state.usage.as_ref() else {
        // TS still answers with whatever local observation exists; an absent
        // service therefore yields the empty document rather than an error.
        return summary_response(json!({ "profiles": [] }));
    };
    let query = query_params(&uri);
    let mode = parse_refresh_mode(query.get("refresh").map(String::as_str));
    if mode != RefreshMode::Cached {
        // TS `usageRefreshCache.run(...)`; refreshes feed the local summary.
        let _ = state
            .directory
            .as_ref()
            .map(|directory| directory.refresh_usage(&user.id));
    }
    match usage.summary(&user.id, mode != RefreshMode::Cached).await {
        Ok(summary) => summary_response(redact_value(&summary)),
        Err(error) => fail(500, redact_text(&error)),
    }
}

/// TS `reply.header("Cache-Control", "no-store")` before sending the summary.
fn summary_response(summary: Value) -> Response {
    let mut response = ok_json(summary);
    response.headers_mut().insert(
        "cache-control",
        axum::http::HeaderValue::from_static("no-store"),
    );
    response
}

async fn ollama_session(
    State(state): State<ProviderRoutes>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let settings = match state.settings() {
        Ok(settings) => settings.clone(),
        Err(response) => return response,
    };
    let payload = match auth::parse_body(body, &headers).await {
        Ok(payload) => payload,
        Err(response) => return *response,
    };
    let session = match valid_ollama_session(payload.get("session")) {
        Ok(session) => session,
        Err(response) => return response,
    };
    if let Some(session) = session.as_deref() {
        let verified = match state.probes.as_ref() {
            Some(probes) => probes.verify_ollama_session(session).await,
            None => Err("Could not verify this session. Your saved session has not changed.".into()),
        };
        if let Err(error) = verified {
            // Message is scrubbed: it may quote the upstream body verbatim.
            return fail(400, redact_text(&error));
        }
    }
    let mut keys = settings.api_keys(&user.id);
    match session {
        Some(session) => {
            keys.insert("OLLAMA_SESSION_COOKIE".into(), Value::String(session));
        }
        None => {
            keys.remove("OLLAMA_SESSION_COOKIE");
        }
    }
    match settings.update_api_keys(&user.id, keys) {
        Ok(()) => ok_json(json!({ "ok": true })),
        Err(error) => fail(500, redact_text(&error)),
    }
}

async fn ollama_api_key(
    State(state): State<ProviderRoutes>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let settings = match state.settings() {
        Ok(settings) => settings.clone(),
        Err(response) => return response,
    };
    let payload = match auth::parse_body(body, &headers).await {
        Ok(payload) => payload,
        Err(response) => return *response,
    };
    let key = match valid_ollama_api_key(payload.get("apiKey")) {
        Ok(key) => key,
        Err(response) => return response,
    };
    let verified = match state.probes.as_ref() {
        Some(probes) => probes.verify_ollama_api_key(&key).await,
        None => Err("unavailable".to_string()),
    };
    if verified.is_err() {
        return fail(
            400,
            "Could not retrieve usage with this key. Check the key and connection, then try again. Your saved key has not changed.",
        );
    }
    let mut keys = settings.api_keys(&user.id);
    keys.insert("OLLAMA_API_KEY".into(), Value::String(key));
    match settings.update_api_keys(&user.id, keys) {
        Ok(()) => ok_json(json!({ "ok": true })),
        Err(error) => fail(500, redact_text(&error)),
    }
}

// ---------------------------------------------------------------------------
// Provider handlers
// ---------------------------------------------------------------------------

/// TS `GET /api/providers`: every provider the caller may see, stamped with
/// its owning node, plus the caller's accounts.
///
/// Deviation (documented): the TS handler also merges rows fetched from remote
/// nodes over the control-plane WebSocket and a snapshot cache that keeps
/// provider metadata warm. The native gateway has neither, so this handler
/// reports local providers only and returns an empty `remoteProviders` array.
async fn list_providers(
    State(state): State<ProviderRoutes>,
    headers: HeaderMap,
    uri: axum::http::Uri,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let query = query_params(&uri);
    let _force = parse_fresh(query.get("fresh").map(String::as_str));
    let runtime = match state.runtime() {
        Ok(runtime) => runtime.clone(),
        Err(response) => return response,
    };
    let directory = state.directory.clone();
    let providers: Vec<Value> = runtime
        .list()
        .into_iter()
        .filter(|entry| {
            entry
                .get("id")
                .and_then(Value::as_str)
                .map(|id| runtime.is_visible_to(id, &user.id))
                .unwrap_or(false)
        })
        .map(|entry| {
            let id = entry
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let info = runtime.info(&id, &user.id).unwrap_or(entry);
            let icon = directory
                .as_ref()
                .and_then(|directory| directory.icon(&id));
            provider_entry(&info, icon.as_deref())
        })
        .collect();
    let accounts = directory
        .as_ref()
        .and_then(|directory| directory.list_accounts(&user.id).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|account| {
            let mut value = redact_value(&account);
            if let Value::Object(map) = &mut value {
                let node = account_node(Some(&account));
                map.insert("nodeId".into(), Value::String(node.clone()));
                if !map.contains_key("nodeName") {
                    map.insert("nodeName".into(), Value::String(node));
                }
            }
            value
        })
        .collect::<Vec<_>>();
    ok_json(json!({
        "providers": providers,
        "accounts": accounts,
        "remoteProviders": [],
    }))
}

async fn update_provider(
    State(state): State<ProviderRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let runtime = match state.runtime() {
        Ok(runtime) => runtime.clone(),
        Err(response) => return response,
    };
    if runtime.info(&id, &user.id).is_none() {
        return fail(404, "Unknown provider");
    }
    let payload = match auth::parse_body(body, &headers).await {
        Ok(payload) => payload,
        Err(response) => return *response,
    };
    let map = match payload {
        Value::Object(map) => map,
        _ => return fail(400, "Invalid request body"),
    };
    match runtime.update_config(&id, &user.id, &map) {
        Ok(info) => ok_json(provider_entry(&info, None)),
        Err(error) => error.into_response(),
    }
}

async fn auth_status(
    State(state): State<ProviderRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let runtime = match state.runtime() {
        Ok(runtime) => runtime.clone(),
        Err(response) => return response,
    };
    if runtime.info(&id, &user.id).is_none() {
        return fail(404, "Unknown provider");
    }
    match runtime.auth_status(&id, &user.id) {
        Some(status) => ok_json(status),
        None => fail(501, format!("Provider {id} does not expose auth status")),
    }
}

async fn auth_login(
    State(state): State<ProviderRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let runtime = match state.runtime() {
        Ok(runtime) => runtime.clone(),
        Err(response) => return response,
    };
    if runtime.info(&id, &user.id).is_none() {
        return fail(404, "Unknown provider");
    }
    runtime.start_login(&id, &user.id).await.into_response()
}

async fn auth_login_input(
    State(state): State<ProviderRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let runtime = match state.runtime() {
        Ok(runtime) => runtime.clone(),
        Err(response) => return response,
    };
    if runtime.info(&id, &user.id).is_none() {
        return fail(404, "Unknown provider");
    }
    let payload = match auth::parse_body(body, &headers).await {
        Ok(payload) => payload,
        Err(response) => return *response,
    };
    let code = match valid_code_input(payload.get("code")) {
        Ok(code) => code,
        Err(response) => return response,
    };
    if runtime.send_login_input(&id, &user.id, &code) {
        ok_json(json!({ "ok": true }))
    } else {
        // Never echo the submitted code back, not even in the failure message.
        fail(400, "Provider is not waiting for a code")
    }
}

async fn auth_logout(
    State(state): State<ProviderRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let runtime = match state.runtime() {
        Ok(runtime) => runtime.clone(),
        Err(response) => return response,
    };
    if runtime.info(&id, &user.id).is_none() {
        return fail(404, "Unknown provider");
    }
    let outcome = runtime.logout(&id, &user.id).await;
    if outcome.ok {
        // TS invalidates the catalogue so the next listing re-authenticates.
        runtime.reset_models(&user.id);
    }
    outcome.into_response()
}

#[derive(Debug, serde::Deserialize)]
pub struct ProbeRequest {
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default, alias = "baseUrl")]
    pub base_url_camel: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default, alias = "apiKey")]
    pub api_key_camel: Option<String>,
    #[serde(default, alias = "type")]
    pub kind: Option<String>,
}

impl ProbeRequest {
    fn base_url(&self) -> Option<&str> {
        self.base_url.as_deref().or(self.base_url_camel.as_deref())
    }
    fn api_key(&self) -> Option<&str> {
        self.api_key
            .as_deref()
            .or(self.api_key_camel.as_deref())
            .map(js_trim)
            .filter(|key| !key.is_empty())
    }
}

fn parse_probe_request(body: Body) -> BoxFuture<'static, Result<ProbeRequest, Response>> {
    Box::pin(async move {
        let bytes = axum::body::to_bytes(body, 64 * 1024)
            .await
            .map_err(|_| fail(400, "Invalid request body"))?;
        if bytes.is_empty() {
            return Ok(ProbeRequest {
                base_url: None,
                base_url_camel: None,
                api_key: None,
                api_key_camel: None,
                kind: None,
            });
        }
        serde_json::from_slice::<ProbeRequest>(&bytes).map_err(|_| fail(400, "Invalid request body"))
    })
}

async fn omniroute_test(
    State(state): State<ProviderRoutes>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let _user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let request = match parse_probe_request(body).await {
        Ok(request) => request,
        Err(response) => return response,
    };
    let Some(raw_base) = request.base_url() else {
        return fail(400, "Missing base URL");
    };
    let base_url = match validate_base_url(raw_base) {
        Ok(base_url) => base_url,
        Err(response) => return response,
    };
    let Some(probes) = state.probes.as_ref() else {
        return fail(503, "Probing is unavailable");
    };
    match probes.probe_omniroute(&base_url, request.api_key()).await {
        Ok(payload) => ok_json(payload),
        Err(error) => fail(502, redact_text(&error)),
    }
}

async fn backend_test(
    State(state): State<ProviderRoutes>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let _user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let request = match parse_probe_request(body).await {
        Ok(request) => request,
        Err(response) => return response,
    };
    let kind = request.kind.as_deref().map(js_trim).unwrap_or_default();
    if kind.is_empty() {
        return fail(400, "Missing backend type");
    }
    let Some(raw_base) = request.base_url() else {
        return fail(400, "Missing base URL");
    };
    let base_url = match validate_base_url(raw_base) {
        Ok(base_url) => base_url,
        Err(response) => return response,
    };
    let Some(probes) = state.probes.as_ref() else {
        return fail(503, "Probing is unavailable");
    };
    match probes.probe_backend(kind, &base_url, request.api_key()).await {
        Ok(payload) => ok_json(payload),
        Err(error) => fail(502, redact_text(&error)),
    }
}

async fn models_reset(State(state): State<ProviderRoutes>, headers: HeaderMap) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    match state.runtime() {
        Ok(runtime) => {
            runtime.reset_models(&user.id);
            ok_json(json!({ "ok": true }))
        }
        Err(response) => response,
    }
}

async fn list_models(
    State(state): State<ProviderRoutes>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let runtime = match state.runtime() {
        Ok(runtime) => runtime.clone(),
        Err(response) => return response,
    };
    if runtime.info(&id, &user.id).is_none() {
        return fail(404, "Unknown provider");
    }
    match runtime.list_models(&id, &user.id).await {
        Ok(models) => ok_json(json!({
            "models": models.into_iter().map(|model| redact_value(&model)).collect::<Vec<_>>(),
        })),
        Err(error) => fail(502, redact_text(&error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use serde_json::json;

    async fn body_json(response: Response) -> Value {
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .expect("response body");
        serde_json::from_slice(&bytes).expect("json body")
    }

    fn status(response: &Response) -> u16 {
        response.status().as_u16()
    }

    #[test]
    fn route_table_matches_typescript() {
        let mut seen: Vec<(&str, &str)> = ROUTE_TABLE.to_vec();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(seen.len(), 19, "duplicate method+path pair");
        assert!(ROUTE_TABLE.contains(&("GET", "/api/provider-accounts")));
        assert!(ROUTE_TABLE.contains(&("POST", "/api/provider-accounts/{id}/opencode-go")));
        assert!(ROUTE_TABLE.contains(&("GET", "/api/provider-usage/summary")));
        assert!(ROUTE_TABLE.contains(&("POST", "/api/provider-usage/ollama/session")));
        assert!(ROUTE_TABLE.contains(&("POST", "/api/providers/{id}/auth/login/input")));
        assert!(ROUTE_TABLE.contains(&("POST", "/api/providers/models/reset")));
        assert!(ROUTE_TABLE.contains(&("GET", "/api/providers/{id}/models")));
    }

    #[test]
    fn redact_text_masks_api_key_prefixes() {
        let text = "failed with sk-live-abc123DEF and AIzaSyD-1234567890 plus ghp_zzz999";
        let redacted = redact_text(text);
        assert!(!redacted.contains("sk-live-abc123DEF"));
        assert!(!redacted.contains("AIzaSyD-1234567890"));
        assert!(!redacted.contains("ghp_zzz999"));
        assert_eq!(redacted.matches("[redacted]").count(), 3);
        assert!(redacted.starts_with("failed with sk-[redacted]"));
    }

    #[test]
    fn redact_text_masks_bearer_and_jwt() {
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlLXZhbHVl";
        let text = format!("Authorization: Bearer abc.def-123 token={jwt}");
        let redacted = redact_text(&text);
        assert!(!redacted.contains("abc.def-123"));
        assert!(!redacted.contains(jwt));
        assert_eq!(redacted.matches("[redacted]").count(), 2);
    }

    #[test]
    fn redact_value_masks_nested_secret_keys() {
        let payload = json!({
            "id": "openai",
            "apiKey": "sk-abc",
            "oauth": { "accessToken": "tok", "code": "0/abc", "expiresAt": 12 },
            "accounts": [{ "label": "work", "session": "cookie", "notes": "call sk-xyz" }],
            "ok": true,
        });
        let redacted = redact_value(&payload);
        assert_eq!(redacted["apiKey"], json!("[redacted]"));
        assert_eq!(redacted["oauth"]["accessToken"], json!("[redacted]"));
        assert_eq!(redacted["oauth"]["code"], json!("[redacted]"));
        assert_eq!(redacted["oauth"]["expiresAt"], json!(12));
        assert_eq!(redacted["accounts"][0]["session"], json!("[redacted]"));
        assert_eq!(redacted["accounts"][0]["label"], json!("work"));
        assert!(redacted["accounts"][0]["notes"]
            .as_str()
            .expect("notes")
            .contains("[redacted]"));
        assert_eq!(redacted["ok"], json!(true));
        assert!(redacted.to_string().find("sk-abc").is_none());
        assert!(redacted.to_string().find("sk-xyz").is_none());
    }

    #[test]
    fn is_secret_key_keeps_user_facing_device_codes() {
        assert!(is_secret_key("apiKey"));
        assert!(is_secret_key("OLLAMA_API_KEY"));
        assert!(is_secret_key("Authorization"));
        assert!(is_secret_key("sessionCookie"));
        assert!(is_secret_key("refresh_token"));
        assert!(!is_secret_key("deviceCode"));
        assert!(!is_secret_key("userCode"));
        assert!(!is_secret_key("verificationUri"));
        assert!(!is_secret_key("label"));
    }

    #[tokio::test]
    async fn valid_code_input_rejects_blank_and_non_string() {
        for value in [json!(""), json!("   "), json!("\u{feff}\u{feff}"), json!(12), json!(null)] {
            let response = valid_code_input(Some(&value)).expect_err("must reject");
            assert_eq!(status(&response), 400);
            let body = body_json(response).await;
            assert_eq!(body["error"], json!("Missing or empty code"));
        }
        let response = valid_code_input(None).expect_err("missing field");
        assert_eq!(status(&response), 400);
    }

    #[test]
    fn valid_code_input_trims_and_bounds_length() {
        assert_eq!(
            valid_code_input(Some(&json!("  abc-123 \n"))).expect("accepted"),
            "abc-123"
        );
        let too_long = "x".repeat(MAX_CREDENTIAL_INPUT + 1);
        let response = valid_code_input(Some(&json!(too_long))).expect_err("too long");
        assert_eq!(status(&response), 400);
    }

    #[tokio::test]
    async fn valid_ollama_api_key_uses_typescript_message() {
        for value in [json!(""), json!("  "), json!(false), json!(4097_usize)] {
            let response = valid_ollama_api_key(Some(&value)).expect_err("must reject");
            assert_eq!(status(&response), 400);
            let body = body_json(response).await;
            assert_eq!(body["error"], json!("Enter an Ollama Cloud API key."));
        }
        assert_eq!(
            valid_ollama_api_key(Some(&json!(" ollama-key "))).expect("accepted"),
            "ollama-key"
        );
        let oversized = json!("k".repeat(MAX_CREDENTIAL_INPUT + 1));
        assert_eq!(status(&valid_ollama_api_key(Some(&oversized)).expect_err("too long")), 400);
    }

    #[test]
    fn valid_ollama_session_clears_on_null() {
        assert_eq!(valid_ollama_session(None).expect("absent clears"), None);
        assert_eq!(valid_ollama_session(Some(&json!(null))).expect("null clears"), None);
        assert_eq!(
            valid_ollama_session(Some(&json!(" cookie-value "))).expect("string"),
            Some("cookie-value".to_string())
        );
        let response = valid_ollama_session(Some(&json!({"cookie": "x"}))).expect_err("object");
        assert_eq!(status(&response), 400);
    }

    #[tokio::test]
    async fn valid_account_label_rejects_blank_and_trims() {
        assert_eq!(
            valid_account_label(Some(&json!("  work account  "))).expect("ok"),
            "work account"
        );
        for value in [json!(""), json!("   "), json!(7)] {
            let response = valid_account_label(Some(&value)).expect_err("reject");
            assert_eq!(status(&response), 400);
        }
        let long = json!("a".repeat(129));
        assert_eq!(status(&valid_account_label(Some(&long)).expect_err("reject")), 400);
    }

    #[tokio::test]
    async fn valid_account_create_requires_provider_type() {
        let mut body = Map::new();
        let response = valid_account_create(&body).expect_err("missing type");
        assert_eq!(status(&response), 400);
        let payload = body_json(response).await;
        assert_eq!(payload["error"], json!("Missing provider type"));

        body.insert("providerType".into(), json!("   "));
        assert_eq!(status(&valid_account_create(&body).expect_err("blank")), 400);

        body.insert("providerType".into(), json!(" opencode-go "));
        body.insert("label".into(), json!(" primary "));
        let (provider_type, label) = valid_account_create(&body).expect("valid");
        assert_eq!(provider_type, "opencode-go");
        assert_eq!(label, "primary");

        body.insert("label".into(), json!(42));
        assert_eq!(status(&valid_account_create(&body).expect_err("bad label")), 400);
    }

    #[tokio::test]
    async fn validate_base_url_rejects_credentials_and_bad_schemes() {
        assert_eq!(
            validate_base_url(" https://api.example.com/v1/ ").expect("ok"),
            "https://api.example.com/v1"
        );
        for bad in [
            "",
            "file:///etc/passwd",
            "ftp://example.com",
            "https://",
            "https://user:pw@example.com",
            "http://token@example.com/v1",
        ] {
            let response = validate_base_url(bad).expect_err("must reject");
            assert_eq!(status(&response), 400, "accepted {bad}");
        }
        let too_long = format!("https://example.com/{}", "a".repeat(2048));
        assert_eq!(status(&validate_base_url(&too_long).expect_err("long")), 400);
    }

    #[test]
    fn refresh_mode_and_fresh_query_parsing() {
        assert_eq!(parse_refresh_mode(Some("0")), RefreshMode::Cached);
        assert_eq!(parse_refresh_mode(Some("force")), RefreshMode::Force);
        assert_eq!(parse_refresh_mode(None), RefreshMode::Refresh);
        assert_eq!(parse_refresh_mode(Some("yes")), RefreshMode::Refresh);
        assert!(parse_fresh(Some("1")));
        assert!(parse_fresh(Some("true")));
        assert!(!parse_fresh(Some("0")));
        assert!(!parse_fresh(None));
    }

    #[test]
    fn account_node_defaults_to_gateway() {
        assert_eq!(account_node(None), GATEWAY_NODE_NAME);
        assert_eq!(account_node(Some(&json!({}))), GATEWAY_NODE_NAME);
        assert_eq!(account_node(Some(&json!({ "nodeId": "" }))), GATEWAY_NODE_NAME);
        assert_eq!(account_node(Some(&json!({ "nodeId": "desk" }))), "desk");
    }

    #[test]
    fn provider_entry_stamps_visibility_metadata_and_redacts() {
        let info = json!({
            "id": "anthropic",
            "name": "Anthropic",
            "auth": { "apiKey": "sk-ant-secret" },
            "icon": "old",
        });
        let entry = provider_entry(&info, Some("data:image/svg+xml,new"));
        assert_eq!(entry["nodeId"], json!(GATEWAY_NODE_NAME));
        assert_eq!(entry["nodeName"], json!(GATEWAY_NODE_NAME));
        assert_eq!(entry["icon"], json!("data:image/svg+xml,new"));
        assert_eq!(entry["auth"]["apiKey"], json!("[redacted]"));

        let kept = provider_entry(&info, Some(""));
        assert_eq!(kept["icon"], json!("old"), "empty icon keeps adapter value");

        let scalar = provider_entry(&json!("plain"), None);
        assert_eq!(scalar["id"], json!("plain"));
        assert_eq!(scalar["nodeId"], json!(GATEWAY_NODE_NAME));
    }

    #[tokio::test]
    async fn probe_request_parses_camel_case_and_bounds_body() {
        let body = Body::from(r#"{"baseUrl":"https://x.test","apiKey":" k "}"#);
        let request = parse_probe_request(body).await.expect("parsed");
        assert_eq!(request.base_url(), Some("https://x.test"));
        assert_eq!(request.api_key(), Some("k"));

        let request = parse_probe_request(Body::empty()).await.expect("empty ok");
        assert!(request.base_url().is_none());

        let response = parse_probe_request(Body::from("not json"))
            .await
            .expect_err("invalid json");
        assert_eq!(status(&response), 400);

        let oversized = format!("{{\"baseUrl\":\"{}\"}}", "a".repeat(70 * 1024));
        let response = parse_probe_request(Body::from(oversized))
            .await
            .expect_err("body cap");
        assert_eq!(status(&response), 400);
    }

    #[tokio::test]
    async fn fail_and_ok_envelopes_match_typescript_shapes() {
        let response = fail(404, "Unknown provider");
        assert_eq!(status(&response), 404);
        assert_eq!(
            response
                .headers()
                .get("content-type")
                .and_then(|value| value.to_str().ok()),
            Some("application/json")
        );
        let payload = body_json(response).await;
        assert_eq!(payload, json!({ "error": "Unknown provider" }));

        let response = ok_json(json!({ "ok": true, "apiKey": "sk-leak" }));
        assert_eq!(status(&response), 200);
        let payload = body_json(response).await;
        assert_eq!(payload["ok"], json!(true));
        assert_eq!(payload["apiKey"], json!("[redacted]"));

        let response = summary_response(json!({ "profiles": [] }));
        assert_eq!(
            response
                .headers()
                .get("cache-control")
                .and_then(|value| value.to_str().ok()),
            Some("no-store")
        );
    }

    #[test]
    fn store_error_status_mapping() {
        let cases = [
            (StoreError::Invalid("x".into()), 400),
            (StoreError::NotFound("x".into()), 404),
            (StoreError::Conflict("x".into()), 409),
            (StoreError::Failed("x".into()), 500),
            (StoreError::Unavailable("x".into()), 503),
        ];
        for (error, expected) in cases {
            assert_eq!(status(&error.into_response()), expected);
        }
    }
}
