//! GitHub Copilot chat provider: GitHub device-flow credentials, short-lived Copilot
//! bearer tokens, the Copilot model catalogue, and OpenAI-compatible
//! `chat/completions` streaming.
//!
//! Provenance: the TypeScript gateway in this repository has no
//! `packages/gateway/src/providers/copilot.ts` (Copilot is only reached there through
//! the ACP CLI agent). This adapter is therefore written against the GitHub Copilot
//! API contract and reuses the crate's existing transport (`openai_stream`), stream
//! event types (`ParsedStream`/`StreamFailure`/`EventSink`), cancellation primitive
//! (`ProcessCancellation`) and catalogue model type (`CatalogueModel`) instead of
//! defining parallel ones.
//!
//! Safety posture mirrors `OpenAiHttp`: the API base URL is validated (http/https,
//! no userinfo/query/fragment) and redirects are disabled, so a bearer token can
//! never be forwarded to a host the caller did not configure. Tokens are redacted
//! from every surfaced error string.

use crate::{
    execution::process_runner::ProcessCancellation,
    providers::{
        model_fetchers::CatalogueModel,
        openai_stream::{
            EventSink, MAX_FRAME_BYTES, ParsedStream, SseDecoder, StreamFailure, format_llm_error,
        },
        registry::ProviderAdapter,
    },
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

/// Registry/adapter identifier.
pub const PROVIDER_ID: &str = "copilot";
/// Default Copilot API base (overridable per credentials via `endpoints.api`).
pub const COPILOT_API_BASE: &str = "https://api.githubcopilot.com";
/// GitHub OAuth device-flow endpoints.
pub const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
pub const GITHUB_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
/// GitHub token -> short-lived Copilot bearer token exchange.
pub const GITHUB_COPILOT_TOKEN_URL: &str = "https://api.github.com/copilot_internal/v2/token";
/// Public Copilot OAuth client id (device flow) and the requested scope.
pub const COPILOT_CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";
pub const COPILOT_DEVICE_SCOPE: &str = "read:user";
/// Copilot identity headers. The service rejects requests that omit them.
pub const COPILOT_INTEGRATION_ID: &str = "vscode-chat";
pub const EDITOR_VERSION: &str = "vscode/1.99.3";
pub const EDITOR_PLUGIN_VERSION: &str = "copilot-chat/0.26.7";
pub const COPILOT_USER_AGENT: &str = "GitHubCopilotChat/0.26.7";
pub const GITHUB_API_VERSION: &str = "2025-04-01";
/// Refresh skew: treat tokens expiring within this window as stale.
pub const TOKEN_REFRESH_SKEW_SECS: u64 = 120;
/// Transport defaults, matching the crate's other HTTP providers.
pub const CONNECT_TIMEOUT_SECS: u64 = 10;
pub const CHAT_TIMEOUT_SECS: u64 = 600;
pub const EVENT_SINK_TIMEOUT_SECS: u64 = 30;
/// Environment variables consulted for a GitHub token, in priority order.
pub const GITHUB_TOKEN_ENV_VARS: [&str; 3] =
    ["JAIT_COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];
/// Shared endpoint-validation error (same text as `OpenAiHttp`).
pub const INVALID_ENDPOINT: &str = "Invalid configured model endpoint";

/// Who originated the model turn; Copilot requires the hint for premium billing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RequestInitiator {
    User,
    Agent,
}

impl RequestInitiator {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Agent => "agent",
        }
    }
}

/// Request headers for a non-streaming Copilot call.
pub fn build_headers(token: &str, session_id: Option<&str>) -> BTreeMap<String, String> {
    build_headers_for(token, session_id, RequestInitiator::Agent, false)
}

/// Request headers for a streaming Copilot call (`Accept: text/event-stream`).
pub fn build_stream_headers(token: &str, session_id: Option<&str>) -> BTreeMap<String, String> {
    build_headers_for(token, session_id, RequestInitiator::Agent, true)
}

fn build_headers_for(
    token: &str,
    session_id: Option<&str>,
    initiator: RequestInitiator,
    streaming: bool,
) -> BTreeMap<String, String> {
    let accept = if streaming {
        "text/event-stream"
    } else {
        "application/json"
    };
    let mut headers = BTreeMap::from([
        ("Accept".to_string(), accept.to_string()),
        ("Content-Type".to_string(), "application/json".to_string()),
        ("Authorization".to_string(), format!("Bearer {token}")),
        (
            "Copilot-Integration-Id".to_string(),
            COPILOT_INTEGRATION_ID.to_string(),
        ),
        ("Editor-Version".to_string(), EDITOR_VERSION.to_string()),
        (
            "Editor-Plugin-Version".to_string(),
            EDITOR_PLUGIN_VERSION.to_string(),
        ),
        ("User-Agent".to_string(), COPILOT_USER_AGENT.to_string()),
        (
            "X-GitHub-Api-Version".to_string(),
            GITHUB_API_VERSION.to_string(),
        ),
        ("X-Initiator".to_string(), initiator.as_str().to_string()),
    ]);
    if let Some(session) = session_id.filter(|value| !value.is_empty()) {
        headers.insert("X-Client-Session-Id".to_string(), session.to_string());
    }
    headers
}

/// Normalize and validate a configured API base. Rejects non-HTTP schemes and any
/// URL that embeds credentials, a query or a fragment.
pub fn validate_endpoint(base_url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(base_url).map_err(|_| INVALID_ENDPOINT.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.cannot_be_a_base()
    {
        return Err(INVALID_ENDPOINT.to_string());
    }
    Ok(base_url.trim().trim_end_matches('/').to_string())
}

/// `{base}/chat/completions`, with the base validated first.
pub fn chat_endpoint(base_url: &str) -> Result<String, String> {
    Ok(format!("{}/chat/completions", validate_endpoint(base_url)?))
}

/// `{base}/models`, with the base validated first.
pub fn models_endpoint(base_url: &str) -> Result<String, String> {
    Ok(format!("{}/models", validate_endpoint(base_url)?))
}

/// Resolve a GitHub token from an environment lookup, first non-empty wins.
pub fn github_token_from_env(lookup: impl Fn(&str) -> Option<String>) -> Option<String> {
    GITHUB_TOKEN_ENV_VARS
        .iter()
        .filter_map(|key| lookup(key))
        .map(|value| value.trim().to_string())
        .find(|value| !value.is_empty())
}

/// Short-lived Copilot bearer token plus its API base override.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CopilotToken {
    pub token: String,
    pub expires_at: u64,
    pub refresh_in: u64,
    pub api_base: Option<String>,
}

impl CopilotToken {
    /// Parse `{token, expires_at, refresh_in?, endpoints?:{api}}`.
    pub fn parse(data: &Value) -> Result<Self, String> {
        let token = data
            .get("token")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "Copilot token response did not include a token".to_string())?
            .to_string();
        let expires_at = data
            .get("expires_at")
            .and_then(|value| {
                value
                    .as_u64()
                    .or_else(|| value.as_f64().map(|number| number.max(0.0) as u64))
            })
            .ok_or_else(|| "Copilot token response did not include expires_at".to_string())?;
        let refresh_in = data
            .get("refresh_in")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        let api_base = data
            .get("endpoints")
            .and_then(|endpoints| endpoints.get("api"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        Ok(Self {
            token,
            expires_at,
            refresh_in,
            api_base,
        })
    }

    /// Fresh with the default refresh skew.
    pub fn is_fresh(&self, now: u64) -> bool {
        self.is_fresh_with_skew(now, TOKEN_REFRESH_SKEW_SECS)
    }

    pub fn is_fresh_with_skew(&self, now: u64, skew_secs: u64) -> bool {
        self.expires_at > now.saturating_add(skew_secs)
    }
}

/// GitHub device-flow authorization handle shown to the user.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

impl DeviceCode {
    pub fn parse(data: &Value) -> Result<Self, String> {
        let text = |key: &str| {
            data.get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        };
        let device_code = text("device_code")
            .ok_or_else(|| "GitHub device code response did not include device_code".to_string())?;
        let user_code = text("user_code")
            .ok_or_else(|| "GitHub device code response did not include user_code".to_string())?;
        let verification_uri = text("verification_uri").ok_or_else(|| {
            "GitHub device code response did not include verification_uri".to_string()
        })?;
        Ok(Self {
            device_code,
            user_code,
            verification_uri,
            expires_in: data
                .get("expires_in")
                .and_then(Value::as_u64)
                .unwrap_or(900),
            interval: data.get("interval").and_then(Value::as_u64).unwrap_or(5),
        })
    }
}

/// Device-flow request body (`application/x-www-form-urlencoded` fields).
pub fn device_code_form() -> Vec<(String, String)> {
    vec![
        ("client_id".to_string(), COPILOT_CLIENT_ID.to_string()),
        ("scope".to_string(), COPILOT_DEVICE_SCOPE.to_string()),
    ]
}

/// Device-flow token-poll body.
pub fn access_token_form(device_code: &str) -> Vec<(String, String)> {
    vec![
        ("client_id".to_string(), COPILOT_CLIENT_ID.to_string()),
        ("device_code".to_string(), device_code.to_string()),
        (
            "grant_type".to_string(),
            "urn:ietf:params:oauth:grant-type:device_code".to_string(),
        ),
    ]
}

/// Outcome of one device-flow poll.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DevicePoll {
    /// User has not approved yet: poll again after `interval`.
    Pending,
    /// Server asked us to back off; poll again after `interval + 5s`.
    SlowDown,
    Authorized(String),
    Failed(String),
}

/// Classify a GitHub access-token poll response.
pub fn classify_access_token(data: &Value) -> DevicePoll {
    if let Some(token) = data
        .get("access_token")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return DevicePoll::Authorized(token.to_string());
    }
    let error = data
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or("unknown_error");
    match error {
        "authorization_pending" => DevicePoll::Pending,
        "slow_down" => DevicePoll::SlowDown,
        other => {
            let detail = data
                .get("error_description")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if detail.is_empty() {
                DevicePoll::Failed(format!("GitHub device login failed: {other}"))
            } else {
                DevicePoll::Failed(format!("GitHub device login failed: {other} ({detail})"))
            }
        }
    }
}

/// One entry of the Copilot `/models` catalogue.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CopilotModel {
    pub id: String,
    pub name: String,
    pub family: Option<String>,
    pub vendor: Option<String>,
    pub max_prompt_tokens: Option<u64>,
    pub max_output_tokens: Option<u64>,
    pub streaming: bool,
    pub tool_calls: bool,
    pub picker_enabled: bool,
    pub is_default: bool,
}

impl CopilotModel {
    /// Project into the shared catalogue shape used by model selectors.
    pub fn to_catalogue_model(&self) -> CatalogueModel {
        CatalogueModel {
            id: Some(Value::String(self.id.clone())),
            name: Some(Value::String(self.name.clone())),
            description: None,
            is_default: Some(self.is_default),
            reasoning_effort_supported: None,
            group: None,
            pricing: None,
        }
    }
}

/// Parse `{data:[{id,name?,capabilities?,limits?,vendor?,...}]}` (also accepts `models`).
pub fn parse_models(data: &Value) -> Result<Vec<CopilotModel>, String> {
    let rows = match data.get("data").or_else(|| data.get("models")) {
        Some(Value::Array(rows)) => rows.as_slice(),
        None | Some(Value::Null) => &[],
        _ => return Err("Copilot model list is malformed".to_string()),
    };
    let mut models = Vec::with_capacity(rows.len());
    for row in rows {
        let id = row
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let Some(id) = id else {
            return Err("Copilot model entry is missing an id".to_string());
        };
        let name = row
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(id);
        let capabilities = row.get("capabilities");
        let limits = capabilities.and_then(|value| value.get("limits"));
        let supports = capabilities.and_then(|value| value.get("supports"));
        let text = |value: Option<&Value>| {
            value
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_string)
        };
        let number = |value: Option<&Value>| value.and_then(Value::as_u64);
        models.push(CopilotModel {
            id: id.to_string(),
            name: name.to_string(),
            family: text(capabilities.and_then(|value| value.get("family"))),
            vendor: text(row.get("vendor")),
            max_prompt_tokens: number(limits.and_then(|value| value.get("max_prompt_tokens"))),
            max_output_tokens: number(limits.and_then(|value| value.get("max_output_tokens"))),
            streaming: supports
                .and_then(|value| value.get("streaming"))
                .and_then(Value::as_bool)
                .unwrap_or(true),
            tool_calls: supports
                .and_then(|value| value.get("tool_calls"))
                .and_then(Value::as_bool)
                .unwrap_or(true),
            picker_enabled: row
                .get("model_picker_enabled")
                .and_then(Value::as_bool)
                .unwrap_or(true),
            is_default: row
                .get("is_default")
                .or_else(|| row.get("isDefault"))
                .and_then(Value::as_bool)
                .unwrap_or(false),
        });
    }
    Ok(models)
}

/// Pick the requested model (exact, then case-insensitive) or the catalogue default.
pub fn select_model<'a>(
    models: &'a [CopilotModel],
    requested: Option<&str>,
) -> Result<&'a CopilotModel, String> {
    if let Some(requested) = requested.map(str::trim).filter(|value| !value.is_empty()) {
        if let Some(model) = models.iter().find(|model| model.id == requested) {
            return Ok(model);
        }
        if let Some(model) = models
            .iter()
            .find(|model| model.id.eq_ignore_ascii_case(requested))
        {
            return Ok(model);
        }
        return Err(format!("Unknown Copilot model: {requested}"));
    }
    models
        .iter()
        .find(|model| model.is_default)
        .or_else(|| models.iter().find(|model| model.picker_enabled))
        .or_else(|| models.first())
        .ok_or_else(|| "No Copilot models are available for this account".to_string())
}

/// Optional knobs for a chat request; omitted when `None`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ChatParams {
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub max_output_tokens: Option<u64>,
    pub tools: Option<Value>,
    pub tool_choice: Option<Value>,
}

/// Build the OpenAI-compatible Copilot request body.
pub fn build_chat_body(
    model: &str,
    messages: &[Value],
    params: &ChatParams,
    stream: bool,
) -> Value {
    let mut body = json!({
        "model": model,
        "messages": messages,
        "stream": stream,
    });
    let object = body.as_object_mut().expect("chat body is an object");
    if let Some(temperature) = params.temperature {
        object.insert("temperature".to_string(), json!(temperature));
    }
    if let Some(top_p) = params.top_p {
        object.insert("top_p".to_string(), json!(top_p));
    }
    if let Some(max_output_tokens) = params.max_output_tokens {
        object.insert("max_tokens".to_string(), json!(max_output_tokens));
    }
    if let Some(tools) = &params.tools {
        object.insert("tools".to_string(), tools.clone());
    }
    if let Some(tool_choice) = &params.tool_choice {
        object.insert("tool_choice".to_string(), tool_choice.clone());
    }
    body
}

/// Retry/backoff policy for transport-level failures (auth failures are handled by a
/// single token refresh instead).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay_ms: 500,
            max_delay_ms: 8_000,
        }
    }
}

impl RetryPolicy {
    /// Retryable statuses: throttling plus transient upstream failures.
    pub fn is_retryable(status: u16) -> bool {
        matches!(status, 408 | 429 | 500 | 502 | 503 | 504)
    }

    /// Deterministic exponential backoff (no jitter, so it is testable).
    pub fn delay_ms(&self, attempt: u32) -> u64 {
        let base = self.base_delay_ms.max(1);
        base.saturating_mul(1 << attempt.min(16))
            .min(self.max_delay_ms)
    }
}

/// Statuses that mean "the Copilot token is no longer usable".
pub fn is_auth_failure(status: u16) -> bool {
    matches!(status, 401 | 403)
}

/// Token cache shared between requests; one refresh per expiry window.
pub struct CopilotAuth {
    github_token: String,
    token: Mutex<Option<CopilotToken>>,
}

impl CopilotAuth {
    pub fn new(github_token: impl Into<String>) -> Self {
        Self {
            github_token: github_token.into(),
            token: Mutex::new(None),
        }
    }

    pub fn github_token(&self) -> &str {
        &self.github_token
    }

    /// Cached token if it is still fresh (expiry minus refresh skew).
    pub fn cached(&self, now: u64) -> Option<CopilotToken> {
        let guard = self
            .token
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.as_ref().filter(|token| token.is_fresh(now)).cloned()
    }

    pub fn store(&self, token: CopilotToken) {
        let mut guard = self
            .token
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *guard = Some(token);
    }

    pub fn invalidate(&self) {
        let mut guard = self
            .token
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *guard = None;
    }
}

impl std::fmt::Debug for CopilotAuth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Never print either token.
        f.debug_struct("CopilotAuth")
            .field("github_token", &"<redacted>")
            .field("has_cached_token", &self.cached(unix_now()).is_some())
            .finish()
    }
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default()
}

/// Remove a secret from any text that may reach logs or the UI.
pub fn redact(text: &str, secret: &str) -> String {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return text.to_string();
    }
    text.replace(trimmed, "[redacted]")
}

/// Human-readable form of a stream failure (no secret material).
pub fn failure_message(failure: &StreamFailure) -> String {
    match failure {
        StreamFailure::Cancelled => "Model request was cancelled.".to_string(),
        StreamFailure::Http { status, message } => {
            format!("Request failed ({status}): {message}")
        }
        StreamFailure::Other(message) => message.clone(),
    }
}

/// HTTP transport for the Copilot API.
pub struct CopilotHttp {
    client: reqwest::Client,
    api_base: String,
    chat_url: String,
    models_url: String,
    auth: Arc<CopilotAuth>,
    session_id: Option<String>,
    retry: RetryPolicy,
}

impl CopilotHttp {
    /// Build from a GitHub token (device-flow or personal access token).
    pub fn configured(
        github_token: &str,
        api_base: &str,
        session_id: Option<&str>,
    ) -> Result<Self, String> {
        Self::with_auth(
            Arc::new(CopilotAuth::new(github_token.trim())),
            api_base,
            session_id,
        )
    }

    /// Build around a shared token cache.
    pub fn with_auth(
        auth: Arc<CopilotAuth>,
        api_base: &str,
        session_id: Option<&str>,
    ) -> Result<Self, String> {
        if auth.github_token().is_empty() {
            return Err("Copilot credentials are missing a GitHub token".to_string());
        }
        let api_base = validate_endpoint(api_base)?;
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
            .timeout(Duration::from_secs(CHAT_TIMEOUT_SECS))
            .build()
            .map_err(|_| "Model HTTP client could not be initialized".to_string())?;
        Ok(Self {
            client,
            chat_url: format!("{api_base}/chat/completions"),
            models_url: format!("{api_base}/models"),
            api_base,
            auth,
            session_id: session_id.map(str::to_string),
            retry: RetryPolicy::default(),
        })
    }

    pub fn api_base(&self) -> &str {
        &self.api_base
    }

    /// Exchange the GitHub token for a Copilot bearer token and cache it.
    pub async fn refresh_token(
        &self,
        cancel: &ProcessCancellation,
    ) -> Result<CopilotToken, StreamFailure> {
        let request = self
            .client
            .get(GITHUB_COPILOT_TOKEN_URL)
            .header("Accept", "application/json")
            .header("User-Agent", COPILOT_USER_AGENT)
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .header(
                "Authorization",
                format!("token {}", self.auth.github_token()),
            );
        let response = tokio::select! {
            _ = cancel.wait_cancelled() => return Err(StreamFailure::Cancelled),
            result = request.send() => result.map_err(|_| StreamFailure::Other("Model connection failed".into()))?,
        };
        let status = response.status();
        let text = read_body(response, cancel).await?;
        if !status.is_success() {
            return Err(StreamFailure::Http {
                status: status.as_u16(),
                message: redact(
                    &format_llm_error(status.as_u16(), &text),
                    self.auth.github_token(),
                ),
            });
        }
        let data: Value = serde_json::from_str(&text)
            .map_err(|_| StreamFailure::Other("Copilot token response is not valid JSON".into()))?;
        let token = CopilotToken::parse(&data)
            .map_err(|message| StreamFailure::Other(redact(&message, self.auth.github_token())))?;
        self.auth.store(token.clone());
        Ok(token)
    }

    /// Current bearer token, refreshing once when stale.
    pub async fn access_token(
        &self,
        cancel: &ProcessCancellation,
    ) -> Result<String, StreamFailure> {
        if let Some(token) = self.auth.cached(unix_now()) {
            return Ok(token.token);
        }
        self.refresh_token(cancel).await?;
        self.auth
            .cached(unix_now())
            .map(|token| token.token)
            .ok_or_else(|| {
                StreamFailure::Other("Copilot token exchange did not return a token".into())
            })
    }

    /// Fetch the model catalogue for this account.
    pub async fn models(
        &self,
        cancel: &ProcessCancellation,
    ) -> Result<Vec<CopilotModel>, StreamFailure> {
        let mut refreshed = false;
        loop {
            let token = self.access_token(cancel).await?;
            let headers = build_headers(&token, self.session_id.as_deref());
            let request = headers.iter().fold(
                self.client.get(&self.models_url),
                |request, (key, value)| request.header(key, value),
            );
            let response = tokio::select! {
                _ = cancel.wait_cancelled() => return Err(StreamFailure::Cancelled),
                result = request.send() => result.map_err(|_| StreamFailure::Other("Model connection failed".into()))?,
            };
            let status = response.status();
            let text = read_body(response, cancel).await?;
            if is_auth_failure(status.as_u16()) && !refreshed {
                refreshed = true;
                self.auth.invalidate();
                continue;
            }
            if !status.is_success() {
                return Err(StreamFailure::Http {
                    status: status.as_u16(),
                    message: redact(&format_llm_error(status.as_u16(), &text), &token),
                });
            }
            let data: Value = serde_json::from_str(&text)
                .map_err(|_| StreamFailure::Other("Copilot model list is not valid JSON".into()))?;
            return parse_models(&data)
                .map_err(|message| StreamFailure::Other(redact(&message, &token)));
        }
    }

    /// Issue a streaming chat request, mapping SSE events through `sink` in order.
    ///
    /// Cancellation is honoured while connecting, between retries, while awaiting
    /// bytes and while awaiting the event consumer; a mid-stream cancellation stops
    /// delivery and returns the partial result with `interrupted = true`.
    pub async fn complete(
        &self,
        body: &Value,
        cancel: &ProcessCancellation,
        sink: EventSink,
    ) -> Result<ParsedStream, StreamFailure> {
        let mut refreshed = false;
        let mut transport_attempt: u32 = 0;
        loop {
            if cancel.is_cancelled() {
                return Err(StreamFailure::Cancelled);
            }
            let token = self.access_token(cancel).await?;
            let headers = build_stream_headers(&token, self.session_id.as_deref());
            let request = headers
                .iter()
                .fold(self.client.post(&self.chat_url), |request, (key, value)| {
                    request.header(key, value)
                })
                .json(body);
            let response = tokio::select! {
                _ = cancel.wait_cancelled() => return Err(StreamFailure::Cancelled),
                result = request.send() => result.map_err(|_| StreamFailure::Other("Model connection failed".into()))?,
            };
            let status = response.status();
            if is_auth_failure(status.as_u16()) && !refreshed {
                refreshed = true;
                self.auth.invalidate();
                continue;
            }
            if !status.is_success() {
                let text = read_body(response, cancel).await?;
                if RetryPolicy::is_retryable(status.as_u16())
                    && transport_attempt + 1 < self.retry.max_attempts
                {
                    let delay = self.retry.delay_ms(transport_attempt);
                    transport_attempt += 1;
                    sleep_cancellable(cancel, delay).await?;
                    continue;
                }
                return Err(StreamFailure::Http {
                    status: status.as_u16(),
                    message: redact(&format_llm_error(status.as_u16(), &text), &token),
                });
            }
            if !is_event_stream(&response) {
                return Err(StreamFailure::Other(
                    "Model response is not an SSE stream".into(),
                ));
            }
            return read_stream(response, cancel, sink, &token).await;
        }
    }
}

fn is_event_stream(response: &reqwest::Response) -> bool {
    response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(|value| value.trim().eq_ignore_ascii_case("text/event-stream"))
        .unwrap_or(false)
}

async fn sleep_cancellable(
    cancel: &ProcessCancellation,
    delay_ms: u64,
) -> Result<(), StreamFailure> {
    tokio::select! {
        _ = cancel.wait_cancelled() => Err(StreamFailure::Cancelled),
        _ = tokio::time::sleep(Duration::from_millis(delay_ms.max(1))) => Ok(()),
    }
}

async fn read_body(
    mut response: reqwest::Response,
    cancel: &ProcessCancellation,
) -> Result<String, StreamFailure> {
    let mut bytes = Vec::new();
    loop {
        let next = tokio::select! {
            _ = cancel.wait_cancelled() => return Err(StreamFailure::Cancelled),
            result = response.chunk() => result.map_err(|_| StreamFailure::Other("Model error response could not be read".into()))?,
        };
        let Some(chunk) = next else { break };
        if bytes.len() + chunk.len() > MAX_FRAME_BYTES {
            return Err(StreamFailure::Other(
                "Model error response exceeds size limit".into(),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

async fn read_stream(
    mut response: reqwest::Response,
    cancel: &ProcessCancellation,
    sink: EventSink,
    secret: &str,
) -> Result<ParsedStream, StreamFailure> {
    let mut decoder = SseDecoder::default();
    loop {
        let next = tokio::select! {
            _ = cancel.wait_cancelled() => {
                let mut parsed = decoder.result();
                parsed.interrupted = true;
                return Ok(parsed);
            }
            result = response.chunk() => result.map_err(|_| StreamFailure::Other("Model stream connection failed".into()))?,
        };
        let events = match &next {
            Some(chunk) => decoder.feed(chunk),
            None => decoder.finish(),
        }
        .map_err(|message| StreamFailure::Other(redact(&message, secret)))?;
        for event in events {
            tokio::select! {
                _ = cancel.wait_cancelled() => {
                    let mut parsed = decoder.result();
                    parsed.interrupted = true;
                    return Ok(parsed);
                }
                result = tokio::time::timeout(Duration::from_secs(EVENT_SINK_TIMEOUT_SECS), sink(event)) => {
                    result
                        .map_err(|_| StreamFailure::Other("Model event consumer timed out".into()))?
                        .map_err(|message| StreamFailure::Other(redact(&message, secret)))?;
                }
            }
        }
        if next.is_none() {
            break;
        }
    }
    let parsed = decoder.result();
    if parsed.finish_reason.is_none() && !cancel.is_cancelled() {
        return Err(StreamFailure::Other(
            "Model stream ended before completion".into(),
        ));
    }
    Ok(parsed)
}

/// Registry adapter exposing the Copilot provider to `ProviderRegistry`.
pub struct CopilotAdapter {
    http: Arc<CopilotHttp>,
}

impl CopilotAdapter {
    pub fn new(http: Arc<CopilotHttp>) -> Self {
        Self { http }
    }
}

impl ProviderAdapter for CopilotAdapter {
    fn id(&self) -> &str {
        PROVIDER_ID
    }

    fn info(&self) -> Value {
        json!({
            "id": PROVIDER_ID,
            "label": "GitHub Copilot",
            "kind": "copilot",
            "apiBase": self.http.api_base(),
        })
    }

    fn check_availability(&self) -> BoxFuture<'static, Result<(), String>> {
        let http = Arc::clone(&self.http);
        Box::pin(async move {
            let cancel = ProcessCancellation::default();
            http.models(&cancel)
                .await
                .map(|_| ())
                .map_err(|failure| failure_message(&failure))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model_json() -> Value {
        json!({
            "data": [
                {
                    "id": "gpt-4o",
                    "name": "GPT-4o",
                    "vendor": "OpenAI",
                    "capabilities": {
                        "family": "gpt-4o",
                        "limits": {"max_prompt_tokens": 64000, "max_output_tokens": 4096},
                        "supports": {"streaming": true, "tool_calls": true}
                    },
                    "model_picker_enabled": true
                },
                {
                    "id": "claude-sonnet-4",
                    "capabilities": {"supports": {"streaming": true, "tool_calls": false}},
                    "model_picker_enabled": false,
                    "is_default": true
                }
            ]
        })
    }

    #[test]
    fn headers_carry_bearer_and_copilot_identity() {
        let headers = build_stream_headers("tid-abc", Some("sess-1"));
        assert_eq!(headers["Authorization"], "Bearer tid-abc");
        assert_eq!(headers["Accept"], "text/event-stream");
        assert_eq!(headers["Content-Type"], "application/json");
        assert_eq!(headers["Copilot-Integration-Id"], COPILOT_INTEGRATION_ID);
        assert_eq!(headers["Editor-Version"], EDITOR_VERSION);
        assert_eq!(headers["Editor-Plugin-Version"], EDITOR_PLUGIN_VERSION);
        assert_eq!(headers["User-Agent"], COPILOT_USER_AGENT);
        assert_eq!(headers["X-GitHub-Api-Version"], GITHUB_API_VERSION);
        assert_eq!(headers["X-Initiator"], "agent");
        assert_eq!(headers["X-Client-Session-Id"], "sess-1");
        let plain = build_headers("tid-abc", Some(""));
        assert_eq!(plain["Accept"], "application/json");
        assert!(!plain.contains_key("X-Client-Session-Id"));
    }

    #[test]
    fn token_parse_and_freshness_window() {
        let token = CopilotToken::parse(&json!({
            "token": "cop-token",
            "expires_at": 1_000,
            "refresh_in": 900,
            "endpoints": {"api": "https://api.githubcopilot.com"}
        }))
        .expect("token parses");
        assert_eq!(token.token, "cop-token");
        assert_eq!(token.expires_at, 1_000);
        assert_eq!(token.refresh_in, 900);
        assert_eq!(
            token.api_base.as_deref(),
            Some("https://api.githubcopilot.com")
        );
        assert!(token.is_fresh(100));
        assert!(!token.is_fresh(1_000 - TOKEN_REFRESH_SKEW_SECS));
        // Fresh while expires_at > now + skew; expires exactly on the boundary.
        assert!(token.is_fresh_with_skew(990, 5));
        assert!(!token.is_fresh_with_skew(995, 5));
        assert!(!token.is_fresh_with_skew(990, 1_000));
        assert!(CopilotToken::parse(&json!({"token": "x"})).is_err());
        assert!(CopilotToken::parse(&json!({"token": "  ", "expires_at": 1})).is_err());
    }

    #[test]
    fn auth_cache_ignores_expired_tokens() {
        let auth = CopilotAuth::new("gh-token");
        assert!(auth.cached(unix_now()).is_none());
        auth.store(CopilotToken {
            token: "cop".into(),
            expires_at: unix_now() + 3_600,
            refresh_in: 3_000,
            api_base: None,
        });
        assert_eq!(
            auth.cached(unix_now()).map(|token| token.token),
            Some("cop".into())
        );
        auth.invalidate();
        assert!(auth.cached(unix_now()).is_none());
        assert!(format!("{auth:?}").contains("<redacted>"));
        assert!(!format!("{auth:?}").contains("gh-token"));
    }

    #[test]
    fn device_flow_forms_and_poll_classification() {
        assert_eq!(
            device_code_form(),
            vec![
                ("client_id".to_string(), COPILOT_CLIENT_ID.to_string()),
                ("scope".to_string(), "read:user".to_string()),
            ]
        );
        let form = access_token_form("dev-code");
        assert!(form.contains(&("device_code".to_string(), "dev-code".to_string())));
        assert!(form.contains(&(
            "grant_type".to_string(),
            "urn:ietf:params:oauth:grant-type:device_code".to_string()
        )));
        let code = DeviceCode::parse(&json!({
            "device_code": "dev-code",
            "user_code": "ABCD-1234",
            "verification_uri": "https://github.com/login/device",
            "expires_in": 900,
            "interval": 5
        }))
        .expect("device code parses");
        assert_eq!(code.user_code, "ABCD-1234");
        assert_eq!(code.interval, 5);
        assert_eq!(
            classify_access_token(&json!({"error": "authorization_pending"})),
            DevicePoll::Pending
        );
        assert_eq!(
            classify_access_token(&json!({"error": "slow_down"})),
            DevicePoll::SlowDown
        );
        assert_eq!(
            classify_access_token(&json!({"access_token": "gho_1"})),
            DevicePoll::Authorized("gho_1".to_string())
        );
        assert_eq!(
            classify_access_token(&json!({"error": "access_denied", "error_description": "nope"})),
            DevicePoll::Failed("GitHub device login failed: access_denied (nope)".to_string())
        );
    }

    #[test]
    fn model_list_parse_and_selection() {
        let models = parse_models(&model_json()).expect("models parse");
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gpt-4o");
        assert_eq!(models[0].family.as_deref(), Some("gpt-4o"));
        assert_eq!(models[0].vendor.as_deref(), Some("OpenAI"));
        assert_eq!(models[0].max_prompt_tokens, Some(64_000));
        assert_eq!(models[0].max_output_tokens, Some(4_096));
        assert!(models[0].streaming && models[0].tool_calls);
        assert_eq!(models[1].name, "claude-sonnet-4");
        assert!(!models[1].tool_calls);
        assert!(models[1].is_default);
        // Requested model wins, exact then case-insensitive.
        assert_eq!(
            select_model(&models, Some("gpt-4o")).map(|model| model.id.as_str()),
            Ok("gpt-4o")
        );
        assert_eq!(
            select_model(&models, Some("GPT-4O")).map(|model| model.id.as_str()),
            Ok("gpt-4o")
        );
        // Otherwise the catalogue default, then the first picker entry.
        assert_eq!(
            select_model(&models, None).map(|model| model.id.as_str()),
            Ok("claude-sonnet-4")
        );
        assert_eq!(
            select_model(&models, Some("nope")).unwrap_err(),
            "Unknown Copilot model: nope"
        );
        assert_eq!(
            select_model(&[], None).unwrap_err(),
            "No Copilot models are available for this account"
        );
        let catalogue = models[0].to_catalogue_model();
        assert_eq!(catalogue.id, Some(json!("gpt-4o")));
        assert_eq!(catalogue.name, Some(json!("GPT-4o")));
        assert!(parse_models(&json!({"data": "nope"})).is_err());
        assert!(parse_models(&json!({"data": [{"name": "no id"}]})).is_err());
        assert!(parse_models(&json!({})).expect("empty list").is_empty());
    }

    #[test]
    fn chat_body_matches_openai_shape() {
        let messages = vec![json!({"role": "user", "content": "hi"})];
        let body = build_chat_body("gpt-4o", &messages, &ChatParams::default(), true);
        assert_eq!(body["model"], "gpt-4o");
        assert_eq!(body["stream"], true);
        assert_eq!(body["messages"][0]["role"], "user");
        assert!(body.get("temperature").is_none());
        let params = ChatParams {
            temperature: Some(0.2),
            top_p: Some(0.9),
            max_output_tokens: Some(512),
            tools: Some(json!([{"type": "function"}])),
            tool_choice: Some(json!("auto")),
        };
        let body = build_chat_body("gpt-4o", &messages, &params, false);
        assert_eq!(body["temperature"], 0.2);
        assert_eq!(body["top_p"], 0.9);
        assert_eq!(body["max_tokens"], 512);
        assert_eq!(body["tools"][0]["type"], "function");
        assert_eq!(body["tool_choice"], "auto");
        assert_eq!(body["stream"], false);
    }

    #[test]
    fn retry_policy_backoff_and_statuses() {
        let policy = RetryPolicy::default();
        assert_eq!(policy.max_attempts, 3);
        assert_eq!(policy.delay_ms(0), 500);
        assert_eq!(policy.delay_ms(1), 1_000);
        assert_eq!(policy.delay_ms(2), 2_000);
        assert_eq!(policy.delay_ms(9), policy.max_delay_ms);
        assert!(RetryPolicy::is_retryable(429));
        assert!(RetryPolicy::is_retryable(503));
        assert!(!RetryPolicy::is_retryable(400));
        assert!(!RetryPolicy::is_retryable(401));
        assert!(is_auth_failure(401) && is_auth_failure(403));
        assert!(!is_auth_failure(500));
    }

    #[test]
    fn endpoint_validation_and_redaction() {
        assert_eq!(
            chat_endpoint("https://api.githubcopilot.com/").unwrap(),
            "https://api.githubcopilot.com/chat/completions"
        );
        assert_eq!(
            models_endpoint("https://api.githubcopilot.com").unwrap(),
            "https://api.githubcopilot.com/models"
        );
        for bad in [
            "ftp://api.githubcopilot.com",
            "https://user:pass@api.githubcopilot.com",
            "https://api.githubcopilot.com/?key=1",
            "https://api.githubcopilot.com/#frag",
            "not a url",
        ] {
            assert_eq!(
                validate_endpoint(bad).unwrap_err(),
                INVALID_ENDPOINT,
                "{bad}"
            );
        }
        assert_eq!(
            redact("token tid-abc rejected", "tid-abc"),
            "token [redacted] rejected"
        );
        assert_eq!(redact("nothing here", "  "), "nothing here");
        assert_eq!(
            failure_message(&StreamFailure::Cancelled),
            "Model request was cancelled."
        );
        assert_eq!(
            failure_message(&StreamFailure::Http {
                status: 429,
                message: "slow down".into()
            }),
            "Request failed (429): slow down"
        );
        assert!(
            CopilotHttp::configured("", COPILOT_API_BASE, None).is_err(),
            "missing github token is rejected"
        );
        assert!(CopilotHttp::configured("gh", "ftp://x", None).is_err());
        let http = CopilotHttp::configured("gh", COPILOT_API_BASE, Some("s")).expect("configured");
        assert_eq!(http.api_base(), COPILOT_API_BASE);
        assert_eq!(
            http.chat_url,
            format!("{COPILOT_API_BASE}/chat/completions")
        );
    }

    #[test]
    fn github_token_env_precedence() {
        let lookup = |key: &str| match key {
            "JAIT_COPILOT_GITHUB_TOKEN" => Some("  ".to_string()),
            "GH_TOKEN" => Some(" gho_from_gh ".to_string()),
            _ => Some("gho_fallback".to_string()),
        };
        assert_eq!(
            github_token_from_env(lookup).as_deref(),
            Some("gho_from_gh")
        );
        assert_eq!(github_token_from_env(|_| None), None);
    }
}
