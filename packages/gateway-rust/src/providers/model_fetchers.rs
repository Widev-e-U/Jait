//! Native provider catalogue HTTP, cache and stale-while-revalidate behavior.
//! A cache owns its bounded-duration collection even when all subscribers disappear.
use super::acp_registry::AcpCollation;
use crate::{
    contracts::bounded_json::Utf16Text,
    services::jait_models::normalize_jait_backend_base_url,
    text::js_trim,
    time::{Clock, default_clock},
};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::watch;

pub const REMOTE_CACHE_TTL_MS: i64 = 300_000;
pub const OLLAMA_CACHE_TTL_MS: i64 = 30_000;
pub const FETCH_TIMEOUT_MS: u64 = 5_000;
pub const OPENROUTER_MAX_MODELS: usize = 100;
/// Hosted catalogue the reference merges in, because `/api/tags` only lists
/// cloud models that were already pulled locally.
pub const OLLAMA_CLOUD_CATALOGUE_URL: &str = "https://ollama.com/api/tags";
pub const OLLAMA_CLOUD_TIMEOUT_MS: u64 = 4_000;
pub const OLLAMA_CLOUD_CACHE_TTL_MS: i64 = 300_000;
pub const OLLAMA_CLOUD_GROUP: &str = "Ollama Cloud";
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CatalogueKind {
    OpenAi,
    OpenRouter,
    Ollama,
    OmniRoute,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueModel {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<Utf16Text>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort_supported: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<Utf16Text>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pricing: Option<ModelPricing>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPricing {
    #[serde(
        skip_serializing_if = "Option::is_none",
        serialize_with = "serialize_pricing_number"
    )]
    pub prompt_per_m_tok: Option<f64>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        serialize_with = "serialize_pricing_number"
    )]
    pub completion_per_m_tok: Option<f64>,
}
/// Preserve JSON.stringify's number spelling, including -0 -> 0. A finite
/// parsed price can overflow during scaling; Some(infinity) stays a present null,
/// whereas an unusable input is None and the field is omitted.
fn serialize_pricing_number<S: serde::Serializer>(
    value: &Option<f64>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    match value {
        Some(value) if value.is_finite() => {
            let mut buffer = ryu_js::Buffer::new();
            let raw: &serde_json::value::RawValue =
                serde_json::from_str(buffer.format(*value)).map_err(serde::ser::Error::custom)?;
            raw.serialize(serializer)
        }
        _ => serializer.serialize_none(),
    }
}
#[derive(Clone, Debug)]
pub struct CatalogueError(pub String);
impl std::fmt::Display for CatalogueError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for CatalogueError {}
pub type ModelsResult = Result<Vec<CatalogueModel>, CatalogueError>;
pub type HttpFuture = Pin<Box<dyn Future<Output = Result<HttpResponse, CatalogueError>> + Send>>;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub url: String,
    pub authorization: Option<String>,
    pub timeout_ms: u64,
}
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}
pub trait CatalogueHttp: Send + Sync {
    fn get(&self, request: HttpRequest) -> HttpFuture;
    /// Needed for the Ollama account probe: `/api/me` rejects GET with 405.
    fn post(&self, request: HttpRequest) -> HttpFuture;
}
#[derive(Clone)]
pub struct SystemCatalogueHttp {
    client: reqwest::Client,
}
impl SystemCatalogueHttp {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::limited(20))
                .build()?,
        })
    }
    pub fn with_client(client: reqwest::Client) -> Self {
        Self { client }
    }
    fn send(&self, method: reqwest::Method, request: HttpRequest) -> HttpFuture {
        let client = self.client.clone();
        Box::pin(async move {
            let mut call = client
                .request(method, &request.url)
                .timeout(Duration::from_millis(request.timeout_ms));
            if let Some(value) = request.authorization {
                call = call.header(reqwest::header::AUTHORIZATION, value);
            }
            let response = call
                .send()
                .await
                .map_err(|e| CatalogueError(e.to_string()))?;
            let status = response.status().as_u16();
            // A rejected status never consumes JSON in the reference.
            let body = if (200..300).contains(&status) {
                response
                    .bytes()
                    .await
                    .map_err(|e| CatalogueError(e.to_string()))?
                    .to_vec()
            } else {
                Vec::new()
            };
            Ok(HttpResponse { status, body })
        })
    }
}
impl CatalogueHttp for SystemCatalogueHttp {
    fn get(&self, request: HttpRequest) -> HttpFuture {
        self.send(reqwest::Method::GET, request)
    }
    fn post(&self, request: HttpRequest) -> HttpFuture {
        self.send(reqwest::Method::POST, request)
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct Key(CatalogueKind, String);
#[derive(Clone)]
struct Entry {
    models: Vec<CatalogueModel>,
    fetched_at: i64,
}
type Inflight = watch::Receiver<Option<ModelsResult>>;
#[derive(Default)]
struct Cache {
    entries: HashMap<Key, Entry>,
    inflight: HashMap<Key, Inflight>,
    /// Hosted Ollama Cloud catalogue, keyed by daemon base URL.
    ollama_cloud: HashMap<String, Entry>,
}
/// Per-request switches mirroring `FetchOllamaModelsOptions` in the reference.
#[derive(Clone, Copy, Debug, Default)]
pub struct FetchOptions {
    /// Skip the cache (the provider selector's "Refresh models" button).
    pub force: bool,
    /// Ollama only: also merge the hosted Ollama Cloud catalogue.
    pub include_cloud: bool,
}
#[derive(Clone)]
pub struct ModelFetchers {
    inner: Arc<Inner>,
}
struct Inner {
    cache: Mutex<Cache>,
    http: Arc<dyn CatalogueHttp>,
    clock: Clock,
    collation: AcpCollation,
    omni_cap: f64,
}
impl ModelFetchers {
    pub fn new(http: Arc<dyn CatalogueHttp>, omni_max_models: Option<&str>) -> Self {
        Self::with_clock(http, omni_max_models, default_clock())
    }
    pub fn with_clock(
        http: Arc<dyn CatalogueHttp>,
        omni_max_models: Option<&str>,
        clock: Clock,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                cache: Mutex::new(Cache::default()),
                http,
                clock,
                collation: AcpCollation::default(),
                omni_cap: omniroute_max_models(omni_max_models),
            }),
        }
    }
    pub fn reset(&self) {
        *self.inner.cache.lock().unwrap() = Cache::default();
    }
    pub fn inflight_count(&self) -> usize {
        self.inner.cache.lock().unwrap().inflight.len()
    }
    pub async fn fetch(&self, kind: CatalogueKind, api_key: &str, base_url: &str) -> ModelsResult {
        self.fetch_with(kind, api_key, base_url, FetchOptions::default())
            .await
    }
    pub async fn fetch_with(
        &self,
        kind: CatalogueKind,
        api_key: &str,
        base_url: &str,
        options: FetchOptions,
    ) -> ModelsResult {
        let local = self
            .fetch_local(kind, api_key, base_url, options.force)
            .await?;
        if kind != CatalogueKind::Ollama || !options.include_cloud {
            return Ok(local);
        }
        // Cloud results are merged per call, never stored in the local TTL cache.
        // Like a JS promise, an admitted cloud collection outlives its subscriber.
        let owner = self.inner.clone();
        let url = normalize_jait_backend_base_url(base_url, None);
        let cloud =
            tokio::spawn(async move { owner.ollama_cloud_models(&url, options.force).await })
                .await
                .map_err(|_| CatalogueError("cloud collection stopped".into()))?;
        Ok(merge_ollama_models(local, cloud))
    }
    async fn fetch_local(
        &self,
        kind: CatalogueKind,
        api_key: &str,
        base_url: &str,
        force: bool,
    ) -> ModelsResult {
        let url = normalize_jait_backend_base_url(base_url, None);
        let key = Key(
            kind,
            match kind {
                CatalogueKind::OpenRouter => String::new(),
                CatalogueKind::Ollama => url.clone(),
                _ => format!("{url}\n{api_key}"),
            },
        );
        let mut request = {
            let mut cache = self.inner.cache.lock().unwrap();
            let cached = cache.entries.get(&key).cloned();
            let ttl = if kind == CatalogueKind::Ollama {
                OLLAMA_CACHE_TTL_MS
            } else {
                REMOTE_CACHE_TTL_MS
            };
            let expired = force && kind == CatalogueKind::Ollama
                || cached.as_ref().is_none_or(|entry| {
                    (self.inner.clock)().saturating_sub(entry.fetched_at) >= ttl
                });
            if expired && !cache.inflight.contains_key(&key) {
                let (send, receive) = watch::channel(None);
                cache.inflight.insert(key.clone(), receive);
                let owner = self.inner.clone();
                let task_key = key.clone();
                let api_key = api_key.to_string();
                tokio::spawn(async move {
                    let result = owner.collect(kind, &api_key, &url).await;
                    let mut state = owner.cache.lock().unwrap();
                    let result = match result {
                        Ok(Some(models)) => {
                            state.entries.insert(
                                task_key.clone(),
                                Entry {
                                    models: models.clone(),
                                    fetched_at: (owner.clock)(),
                                },
                            );
                            Ok(models)
                        }
                        Ok(None) => Ok(state
                            .entries
                            .get(&task_key)
                            .map(|e| e.models.clone())
                            .unwrap_or_default()),
                        Err(error) => match state.entries.get(&task_key) {
                            Some(entry) => Ok(entry.models.clone()),
                            None if kind == CatalogueKind::OmniRoute => Ok(Vec::new()),
                            None => Err(error),
                        },
                    };
                    // Reset mirrors the reference: old collections can repopulate the cache,
                    // and their finally handler removes this key even after a newer reset.
                    state.inflight.remove(&task_key);
                    let _ = send.send(Some(result));
                });
            }
            if let Some(entry) = cached.filter(|_| !(force && kind == CatalogueKind::Ollama)) {
                return Ok(entry.models);
            }
            cache.inflight.get(&key).expect("request admitted").clone()
        };
        loop {
            if let Some(result) = request.borrow().clone() {
                return result;
            }
            request
                .changed()
                .await
                .map_err(|_| CatalogueError("catalogue collection stopped".into()))?;
        }
    }
}
impl Inner {
    async fn collect(
        &self,
        kind: CatalogueKind,
        api_key: &str,
        url: &str,
    ) -> Result<Option<Vec<CatalogueModel>>, CatalogueError> {
        let endpoint = match kind {
            CatalogueKind::OpenRouter => "https://openrouter.ai/api/v1/models".into(),
            CatalogueKind::Ollama => format!("{url}/api/tags"),
            _ => format!("{url}/models"),
        };
        let authorization = match kind {
            CatalogueKind::Ollama => None,
            CatalogueKind::OmniRoute if api_key.is_empty() => None,
            _ => Some(format!("Bearer {api_key}")),
        };
        let response = self
            .http
            .get(HttpRequest {
                url: endpoint,
                authorization,
                timeout_ms: FETCH_TIMEOUT_MS,
            })
            .await?;
        if !(200..300).contains(&response.status) {
            return Ok(None);
        }
        let text = String::from_utf8_lossy(&response.body);
        let data: Value = serde_json::from_str(text.strip_prefix('\u{feff}').unwrap_or(&text))
            .map_err(|e| CatalogueError(e.to_string()))?;
        let models = map_catalogue(
            kind,
            &data,
            self.omni_cap,
            &self.collation,
            url.to_lowercase().contains("api.openai.com"),
        )?;
        Ok(Some(models))
    }

    /// Hosted Ollama Cloud catalogue for a signed-in daemon.
    ///
    /// Never fails: the hosted list is an optional extra, so any problem degrades
    /// to the last good cloud catalogue (or to no cloud models at all).
    async fn ollama_cloud_models(&self, url: &str, force: bool) -> Vec<CatalogueModel> {
        let cached = {
            let cache = self.cache.lock().unwrap();
            cache.ollama_cloud.get(url).cloned()
        };
        if !force
            && let Some(entry) = &cached
            && (self.clock)().saturating_sub(entry.fetched_at) < OLLAMA_CLOUD_CACHE_TTL_MS
        {
            return entry.models.clone();
        }
        let fallback = cached.map(|entry| entry.models).unwrap_or_default();
        // Both HTTP operations share the single reference AbortController deadline.
        let deadline = tokio::time::Instant::now() + Duration::from_millis(OLLAMA_CLOUD_TIMEOUT_MS);
        let signed_in = tokio::time::timeout_at(deadline, self.ollama_cloud_signed_in(url))
            .await
            .unwrap_or(false);
        let models = if signed_in {
            match tokio::time::timeout_at(deadline, self.fetch_ollama_cloud_catalogue()).await {
                Ok(Ok(Some(models))) => models,
                // Rejected or unparseable: keep serving the last good list.
                _ => return fallback,
            }
        } else {
            // Signed out: cache the empty list so we do not re-probe every call.
            Vec::new()
        };
        self.cache.lock().unwrap().ollama_cloud.insert(
            url.to_string(),
            Entry {
                models: models.clone(),
                fetched_at: (self.clock)(),
            },
        );
        models
    }

    /// The daemon only exposes cloud models to a signed-in account.
    async fn ollama_cloud_signed_in(&self, url: &str) -> bool {
        let response = self
            .http
            .post(HttpRequest {
                url: format!("{url}/api/me"),
                authorization: None,
                timeout_ms: OLLAMA_CLOUD_TIMEOUT_MS,
            })
            .await;
        let Ok(response) = response else {
            return false;
        };
        if !(200..300).contains(&response.status) {
            return false;
        }
        let text = String::from_utf8_lossy(&response.body);
        let Ok(data) =
            serde_json::from_str::<Value>(text.strip_prefix('\u{feff}').unwrap_or(&text))
        else {
            return false;
        };
        data.get("plan")
            .and_then(Value::as_str)
            .is_some_and(|plan| !plan.is_empty())
    }

    async fn fetch_ollama_cloud_catalogue(
        &self,
    ) -> Result<Option<Vec<CatalogueModel>>, CatalogueError> {
        let response = self
            .http
            .get(HttpRequest {
                url: OLLAMA_CLOUD_CATALOGUE_URL.to_string(),
                authorization: None,
                timeout_ms: OLLAMA_CLOUD_TIMEOUT_MS,
            })
            .await?;
        if !(200..300).contains(&response.status) {
            return Ok(None);
        }
        let text = String::from_utf8_lossy(&response.body);
        let data: Value = serde_json::from_str(text.strip_prefix('\u{feff}').unwrap_or(&text))
            .map_err(|e| CatalogueError(e.to_string()))?;
        map_ollama_cloud_catalogue(&data).map(Some)
    }
}

/// `:cloud` / `-cloud` suffix that marks a hosted variant of a local model.
fn strip_cloud_suffix(id: &str) -> &str {
    id.strip_suffix(":cloud")
        .or_else(|| id.strip_suffix("-cloud"))
        .unwrap_or(id)
}

/// Local catalogue wins; a cloud entry only adds names that are not covered yet.
pub fn merge_ollama_models(
    local: Vec<CatalogueModel>,
    cloud: Vec<CatalogueModel>,
) -> Vec<CatalogueModel> {
    if cloud.is_empty() {
        return local;
    }
    let mut merged = local;
    let mut known: HashSet<String> = HashSet::new();
    for entry in &merged {
        if let Some(id) = entry.id.as_ref().and_then(Value::as_str) {
            known.insert(strip_cloud_suffix(id).to_string());
            known.insert(id.to_string());
        }
    }
    for entry in cloud {
        let Some(id) = entry.id.as_ref().and_then(Value::as_str) else {
            continue;
        };
        if known.contains(id) || known.contains(strip_cloud_suffix(id)) {
            continue;
        }
        merged.push(entry);
    }
    merged
}

/// Hosted `/api/tags` rows. Cloud metadata is sparse, hence the description chain.
pub fn map_ollama_cloud_catalogue(data: &Value) -> ModelsResult {
    let rows = match field(data, "models")? {
        Some(Value::Array(rows)) => rows,
        Some(Value::Null) | None => return Ok(Vec::new()),
        _ => return Err(malformed()),
    };
    let mut seen: HashSet<String> = HashSet::new();
    let mut models = Vec::new();
    for row in rows {
        let raw = row
            .get("name")
            .filter(|v| !v.is_null())
            .or_else(|| row.get("model").filter(|v| !v.is_null()));
        let raw = match raw {
            None => "",
            Some(Value::String(raw)) => raw,
            _ => return Err(malformed()), // `.trim()` rejects non-strings.
        };
        let id = js_trim(raw);
        if id.is_empty() || !seen.insert(id.to_string()) {
            continue;
        }
        let mut parts = Vec::new();
        if let Some(details) = row.get("details") {
            for key in ["family", "parameter_size"] {
                if let Some(value) = details.get(key).filter(|value| truthy(value)) {
                    parts.push(js_string(value)?);
                }
            }
        }
        let joined = parts.join(" · ");
        let mut description = (!joined.is_empty()).then_some(joined);
        if description.is_none()
            && let Some(capabilities) = row.get("capabilities").filter(|v| !v.is_null())
        {
            let values = capabilities.as_array().ok_or_else(malformed)?;
            let joined = values
                .iter()
                .filter(|v| truthy(v) && v.as_str() != Some("completion"))
                .map(js_string)
                .collect::<Result<Vec<_>, _>>()?
                .join(", ");
            if !joined.is_empty() {
                description = Some(joined);
            }
        }
        let id = id.to_string();
        models.push(CatalogueModel {
            id: Some(Value::String(id.clone())),
            name: Some(Value::String(id)),
            description: description.map(Utf16Text::from),
            is_default: None,
            reasoning_effort_supported: None,
            group: Some(Utf16Text::from(OLLAMA_CLOUD_GROUP)),
            pricing: None,
        });
    }
    Ok(models)
}
fn malformed() -> CatalogueError {
    CatalogueError("malformed provider catalogue".into())
}
fn field<'a>(value: &'a Value, key: &str) -> Result<Option<&'a Value>, CatalogueError> {
    if value.is_null() {
        return Err(malformed());
    }
    Ok(value.as_object().and_then(|o| o.get(key)))
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|v| v != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn js_string(value: &Value) -> Result<String, CatalogueError> {
    Ok(match value {
        Value::String(s) => s.clone(),
        Value::Null => "null".into(),
        Value::Bool(v) => v.to_string(),
        Value::Number(v) => ryu_js::Buffer::new()
            .format(v.as_f64().ok_or_else(malformed)?)
            .into(),
        Value::Array(items) => items
            .iter()
            .map(|v| {
                if v.is_null() {
                    Ok(String::new())
                } else {
                    js_string(v)
                }
            })
            .collect::<Result<Vec<_>, _>>()?
            .join(","),
        Value::Object(map) if map.contains_key("toString") => return Err(malformed()),
        Value::Object(_) => "[object Object]".into(),
    })
}
fn openrouter_per_million(value: Option<&Value>) -> Result<Option<f64>, CatalogueError> {
    let Some(value) = value.filter(|v| truthy(v)) else {
        return Ok(None);
    };
    let text = js_string(value)?;
    let text = js_trim(&text);
    static PREFIX: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let prefix = PREFIX.get_or_init(|| {
        regex::Regex::new(r"^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?").unwrap()
    });
    let Some(matched) = prefix.find(text) else {
        return Ok(None);
    };
    let parsed = matched.as_str().parse::<f64>().unwrap_or(f64::NAN);
    if !parsed.is_finite() || parsed < 0.0 {
        return Ok(None);
    }
    // Keep both binary64 multiplications in reference order. After rejecting
    // negative inputs, Rust's ties-away round matches Math.round (including -0).
    Ok(Some((parsed * 1_000_000.0 * 1e6).round() / 1e6))
}
fn openrouter_pricing(row: &Value) -> Result<Option<ModelPricing>, CatalogueError> {
    let pricing = field(row, "pricing")?.filter(|v| !v.is_null());
    let prompt = openrouter_per_million(pricing.and_then(|v| v.get("prompt")))?;
    let completion = openrouter_per_million(pricing.and_then(|v| v.get("completion")))?;
    Ok(if prompt.is_some() || completion.is_some() {
        Some(ModelPricing {
            prompt_per_m_tok: prompt,
            completion_per_m_tok: completion,
        })
    } else {
        None
    })
}
pub fn omniroute_max_models(raw: Option<&str>) -> f64 {
    let Some(text) = raw.map(js_trim).filter(|s| !s.is_empty()) else {
        return 150.0;
    };
    let text = text.strip_prefix('+').unwrap_or(text);
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    let number = digits.parse::<f64>().unwrap_or(f64::NAN);
    if number.is_finite() && number > 0.0 {
        number
    } else {
        0.0
    }
}
pub fn is_chat_capable_openai_model_id(id: &str) -> bool {
    ["gpt-", "o1", "o3", "o4", "chatgpt-"]
        .iter()
        .any(|p| id.starts_with(p))
        && ![
            ":ft-",
            "realtime",
            "transcribe",
            "tts",
            "dall-e",
            "whisper",
            "audio",
            "image",
            "embedding",
        ]
        .iter()
        .any(|s| id.contains(s))
}
pub fn supports_reasoning_effort(id: &str) -> bool {
    let s = id.to_lowercase();
    (s.starts_with('o') && s.as_bytes().get(1).is_some_and(u8::is_ascii_digit))
        || s.starts_with("gpt-5")
        || ["deepseek-r1", "grok-3-mini", "mimo", "reason"]
            .iter()
            .any(|part| s.contains(part))
        || (s.contains("qwen3") && s.contains("think"))
}
fn reasoning(id: Option<&Value>) -> Result<bool, CatalogueError> {
    match id.filter(|v| truthy(v)) {
        None => Ok(false),
        Some(Value::String(s)) => Ok(supports_reasoning_effort(s)),
        _ => Err(malformed()),
    }
}
fn model(
    id: Option<Value>,
    name: Option<Value>,
    description: Option<Utf16Text>,
    reasoning: Option<bool>,
) -> CatalogueModel {
    CatalogueModel {
        id,
        name,
        description,
        is_default: None,
        reasoning_effort_supported: reasoning,
        group: None,
        pricing: None,
    }
}
pub fn map_catalogue(
    kind: CatalogueKind,
    data: &Value,
    omni_cap: f64,
    collation: &AcpCollation,
    official_openai: bool,
) -> ModelsResult {
    let key = if kind == CatalogueKind::Ollama {
        "models"
    } else {
        "data"
    };
    let empty = Vec::new();
    let rows = match field(data, key)? {
        None | Some(Value::Null) => &empty,
        Some(Value::Array(rows)) => rows,
        _ => return Err(malformed()),
    };
    if kind == CatalogueKind::Ollama {
        return rows
            .iter()
            .map(|row| {
                let id = field(row, "name")?.cloned();
                let details = field(row, "details")?;
                let parts = if let Some(details) = details.filter(|v| !v.is_null()) {
                    [field(details, "family")?, field(details, "parameter_size")?]
                        .into_iter()
                        .flatten()
                        .filter(|v| truthy(v))
                        .map(js_string)
                        .collect::<Result<Vec<_>, _>>()?
                } else {
                    Vec::new()
                };
                let joined = parts.join(" · ");
                Ok(model(
                    id.clone(),
                    id,
                    if joined.is_empty() {
                        None
                    } else {
                        Some(joined.into())
                    },
                    None,
                ))
            })
            .collect();
    }
    let mut rows = rows
        .iter()
        .filter_map(|row| {
            let id = match field(row, "id") {
                Ok(id) => id,
                Err(e) => return Some(Err(e)),
            };
            let include = match kind {
                CatalogueKind::OpenRouter => match id.filter(|v| truthy(v)) {
                    None => false,
                    Some(Value::String(s)) => !s.contains(":free"),
                    _ => return Some(Err(malformed())),
                },
                CatalogueKind::OmniRoute => id.is_some_and(|v| truthy(v) && v != "auto"),
                CatalogueKind::OpenAi if official_openai => match id.filter(|v| truthy(v)) {
                    None => false,
                    Some(Value::String(s)) => is_chat_capable_openai_model_id(s),
                    _ => return Some(Err(malformed())),
                },
                _ => true,
            };
            include.then_some(Ok(row))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if matches!(kind, CatalogueKind::OpenAi | CatalogueKind::OmniRoute) && rows.len() > 1 {
        let mut failed = false;
        rows.sort_by(|a, b| {
            let comparison = (|| {
                let left = field(a, "id")?
                    .and_then(Value::as_str)
                    .ok_or_else(malformed)?;
                let right = field(b, "id")?
                    .map(js_string)
                    .transpose()?
                    .unwrap_or_else(|| "undefined".into());
                Ok::<_, CatalogueError>(collation.compare(left, &right))
            })();
            match comparison {
                Ok(order) => order,
                Err(_) => {
                    failed = true;
                    std::cmp::Ordering::Equal
                }
            }
        });
        if failed {
            return Err(malformed());
        }
    }
    let limit = match kind {
        CatalogueKind::OpenRouter => OPENROUTER_MAX_MODELS,
        CatalogueKind::OmniRoute if omni_cap > 0.0 => omni_cap.min(rows.len() as f64) as usize,
        _ => rows.len(),
    };
    rows.truncate(limit);
    let mut result = Vec::new();
    if kind == CatalogueKind::OmniRoute {
        let mut alias = model(
            Some(Value::String("auto".into())),
            Some(Value::String("auto".into())),
            Some("Smart routing with tier fallback".into()),
            None,
        );
        alias.is_default = Some(true);
        result.push(alias);
    }
    for row in rows {
        let id = field(row, "id")?.cloned();
        let name = if kind == CatalogueKind::OpenRouter {
            match field(row, "name")?.filter(|v| truthy(v)) {
                Some(v) => Some(v.clone()),
                None => id.as_ref().map(|v| {
                    Value::String(
                        v.as_str()
                            .unwrap()
                            .rsplit('/')
                            .next()
                            .filter(|s| !s.is_empty())
                            .unwrap_or(v.as_str().unwrap())
                            .into(),
                    )
                }),
            }
        } else {
            id.clone()
        };
        let description = if kind == CatalogueKind::OpenRouter {
            match field(row, "description")? {
                None | Some(Value::Null) => None,
                Some(Value::String(s)) => Some(Utf16Text(s.encode_utf16().take(80).collect())),
                _ => return Err(malformed()),
            }
        } else {
            field(row, "owned_by")?
                .filter(|v| truthy(v))
                .map(|v| js_string(v).map(|s| Utf16Text::from(format!("by {s}"))))
                .transpose()?
        };
        let effort = reasoning(id.as_ref())?;
        let mut entry = model(id, name, description, Some(effort));
        if kind == CatalogueKind::OpenRouter {
            entry.pricing = openrouter_pricing(row)?;
        }
        result.push(entry);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openrouter_price_prefix_rounding_and_shape() {
        use serde_json::json;
        let mapped = map_catalogue(
            CatalogueKind::OpenRouter,
            &json!({"data":[{"id":"vendor/model","pricing":{"prompt":"0.000002"}}]}),
            150.0,
            &AcpCollation::default(),
            false,
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(&mapped[0]).unwrap()["pricing"],
            json!({"promptPerMTok":2})
        );
        let p = openrouter_pricing(
            &json!({"pricing":{"prompt":"  0.0000012345678extra", "completion":"2e-6more"}}),
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            serde_json::to_value(p).unwrap(),
            json!({"promptPerMTok":1.234568,"completionPerMTok":2})
        );
        let p = openrouter_pricing(&json!({"pricing":{"prompt":"0", "completion":"-1"}}))
            .unwrap()
            .unwrap();
        assert_eq!(serde_json::to_value(p).unwrap(), json!({"promptPerMTok":0}));
        assert!(
            openrouter_pricing(&json!({"pricing":{"prompt":"Infinity", "completion":"bad"}}))
                .unwrap()
                .is_none()
        );
        let p =
            openrouter_pricing(&json!({"pricing":{"prompt":"1e+broken", "completion":".5e-6"}}))
                .unwrap()
                .unwrap();
        assert_eq!(
            serde_json::to_value(p).unwrap(),
            json!({"promptPerMTok":1000000,"completionPerMTok":0.5})
        );
        let p = openrouter_pricing(&json!({"pricing":{"prompt":"1e300"}}))
            .unwrap()
            .unwrap();
        assert_eq!(
            serde_json::to_value(p).unwrap(),
            json!({"promptPerMTok":null})
        );
    }
    #[test]
    fn openrouter_pricing_coercion_and_rejected_inputs() {
        use serde_json::json;
        for value in [json!(0), json!(false), json!(null), json!(""), json!([])] {
            assert!(openrouter_per_million(Some(&value)).unwrap().is_none());
        }
        // Arrays are truthy and parseFloat first coerces them to strings.
        assert_eq!(
            openrouter_per_million(Some(&json!([0]))).unwrap(),
            Some(0.0)
        );
        assert_eq!(
            openrouter_per_million(Some(&json!([["2e-6extra"]]))).unwrap(),
            Some(2.0)
        );
        assert_eq!(
            openrouter_per_million(Some(&json!([1, 2]))).unwrap(),
            Some(1_000_000.0)
        );
        assert!(openrouter_per_million(Some(&json!({"toString": null}))).is_err());
        assert!(
            openrouter_per_million(Some(&json!({"valueOf": null})))
                .unwrap()
                .is_none()
        );
        assert_eq!(
            openrouter_per_million(Some(&json!("\u{feff}\u{00a0}2e-6"))).unwrap(),
            Some(2.0)
        );
        assert!(
            openrouter_per_million(Some(&json!("\u{0085}2e-6")))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn openrouter_pricing_half_steps_and_underflow() {
        use serde_json::json;
        for (input, expected) in [
            ("0.0000000000004999999999999999", 0.0),
            ("0.0000000000005", 0.000001),
            ("0.0000000000005000000000000001", 0.000001),
            ("0.0000000000015", 0.000002),
            ("0.0000000000025", 0.000003),
        ] {
            assert_eq!(
                openrouter_per_million(Some(&json!(input))).unwrap(),
                Some(expected),
                "{input}"
            );
        }
        for input in ["-0", "-1e-999"] {
            assert_eq!(
                openrouter_per_million(Some(&json!(input)))
                    .unwrap()
                    .unwrap()
                    .to_bits(),
                (-0.0_f64).to_bits()
            );
        }
        assert!(
            openrouter_per_million(Some(&json!("-5e-324")))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn openrouter_pricing_json_tokens_and_overflow_presence() {
        use serde_json::json;
        for (input, wire) in [
            ("-0", r#"{"promptPerMTok":0}"#),
            ("0.000002", r#"{"promptPerMTok":2}"#),
            ("0.0000000000005", r#"{"promptPerMTok":0.000001}"#),
            ("1e15", r#"{"promptPerMTok":1e+21}"#),
            ("1e300", r#"{"promptPerMTok":null}"#),
        ] {
            let pricing = openrouter_pricing(&json!({"pricing":{"prompt":input}}))
                .unwrap()
                .unwrap();
            assert_eq!(serde_json::to_string(&pricing).unwrap(), wire, "{input}");
        }
        assert!(
            openrouter_pricing(&json!({"pricing":{"prompt":"1e309"}}))
                .unwrap()
                .is_none()
        );
        let pricing = openrouter_pricing(&json!({"pricing":{"prompt":"1e300","completion":"bad"}}))
            .unwrap()
            .unwrap();
        assert!(pricing.prompt_per_m_tok.unwrap().is_infinite());
        assert!(pricing.completion_per_m_tok.is_none());
    }

    const DAEMON_URL: &str = "http://localhost:11434";
    const LOCAL_TAGS: &str = r#"{"models":[{"name":"llama3.2:latest","details":{"family":"llama","parameter_size":"3B"}}]}"#;
    const CLOUD_TAGS: &str = r#"{"models":[
        {"name":"llama3.2:latest"},
        {"name":"qwen3-coder:480b-cloud","details":{"family":"","parameter_size":""},"capabilities":["completion","tools"]},
        {"name":"deepseek-v3.1:671b-cloud","details":{"family":"deepseek","parameter_size":"671B"}},
        {"name":"deepseek-v3.1:671b-cloud"}
    ]}"#;

    /// Records every request so the tests can assert what was actually fetched.
    struct MockHttp {
        calls: Mutex<Vec<(String, String)>>,
        signed_in: bool,
        cloud_status: u16,
    }
    impl MockHttp {
        fn new(signed_in: bool) -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                signed_in,
                cloud_status: 200,
            }
        }
        fn calls(&self) -> Vec<(String, String)> {
            self.calls.lock().unwrap().clone()
        }
        fn count(&self, url: &str) -> usize {
            self.calls().iter().filter(|(_, seen)| seen == url).count()
        }
        fn respond(&self, method: &str, request: HttpRequest) -> HttpFuture {
            self.calls
                .lock()
                .unwrap()
                .push((method.to_string(), request.url.clone()));
            let (status, body) = if request.url == OLLAMA_CLOUD_CATALOGUE_URL {
                (self.cloud_status, CLOUD_TAGS.to_string())
            } else if request.url.ends_with("/api/me") {
                if self.signed_in {
                    (200, r#"{"plan":"pro"}"#.to_string())
                } else {
                    (401, "unauthorized".to_string())
                }
            } else if request.url.ends_with("/api/tags") {
                (200, LOCAL_TAGS.to_string())
            } else {
                (404, String::new())
            };
            Box::pin(async move {
                Ok(HttpResponse {
                    status,
                    body: body.into_bytes(),
                })
            })
        }
    }
    impl CatalogueHttp for MockHttp {
        fn get(&self, request: HttpRequest) -> HttpFuture {
            self.respond("GET", request)
        }
        fn post(&self, request: HttpRequest) -> HttpFuture {
            self.respond("POST", request)
        }
    }

    fn fetchers(http: Arc<MockHttp>) -> ModelFetchers {
        let clock: Clock = Arc::new(|| 1_000);
        ModelFetchers::with_clock(http, None, clock)
    }

    fn ids(models: &[CatalogueModel]) -> Vec<String> {
        models
            .iter()
            .filter_map(|model| model.id.as_ref().and_then(Value::as_str))
            .map(str::to_string)
            .collect()
    }

    fn text(value: &Utf16Text) -> String {
        String::from_utf16_lossy(&value.0)
    }

    fn group_of(models: &[CatalogueModel], id: &str) -> Option<String> {
        models
            .iter()
            .find(|model| model.id.as_ref().and_then(Value::as_str) == Some(id))
            .and_then(|model| model.group.as_ref())
            .map(text)
    }

    #[tokio::test]
    async fn ollama_merges_the_hosted_catalogue_when_signed_in() {
        let http = Arc::new(MockHttp::new(true));
        let models = fetchers(http.clone())
            .fetch_with(
                CatalogueKind::Ollama,
                "",
                DAEMON_URL,
                FetchOptions {
                    force: false,
                    include_cloud: true,
                },
            )
            .await
            .expect("catalogue");

        let ids = ids(&models);
        assert!(ids.contains(&"llama3.2:latest".to_string()));
        assert!(ids.contains(&"qwen3-coder:480b-cloud".to_string()));
        assert!(ids.contains(&"deepseek-v3.1:671b-cloud".to_string()));
        // The duplicated cloud row is only listed once.
        assert_eq!(
            ids.iter()
                .filter(|id| id.as_str() == "deepseek-v3.1:671b-cloud")
                .count(),
            1
        );
        // Cloud rows keep their own group; local rows stay ungrouped.
        assert_eq!(
            group_of(&models, "qwen3-coder:480b-cloud"),
            Some("Ollama Cloud".to_string())
        );
        assert_eq!(group_of(&models, "llama3.2:latest"), None);
        assert_eq!(http.count(OLLAMA_CLOUD_CATALOGUE_URL), 1);
    }

    #[tokio::test]
    async fn ollama_skips_the_hosted_catalogue_when_signed_out() {
        let http = Arc::new(MockHttp::new(false));
        let models = fetchers(http.clone())
            .fetch_with(
                CatalogueKind::Ollama,
                "",
                DAEMON_URL,
                FetchOptions {
                    force: false,
                    include_cloud: true,
                },
            )
            .await
            .expect("catalogue");

        assert_eq!(ids(&models), vec!["llama3.2:latest".to_string()]);
        assert_eq!(http.count(OLLAMA_CLOUD_CATALOGUE_URL), 0);
        // The account probe still ran, so the daemon answer is trusted.
        assert!(
            http.calls()
                .iter()
                .any(|(method, url)| method == "POST" && url.ends_with("/api/me"))
        );
    }

    #[tokio::test]
    async fn ollama_respects_an_opt_out() {
        let http = Arc::new(MockHttp::new(true));
        let models = fetchers(http.clone())
            .fetch_with(
                CatalogueKind::Ollama,
                "",
                DAEMON_URL,
                FetchOptions {
                    force: true,
                    include_cloud: false,
                },
            )
            .await
            .expect("catalogue");

        assert_eq!(ids(&models), vec!["llama3.2:latest".to_string()]);
        assert_eq!(http.count(OLLAMA_CLOUD_CATALOGUE_URL), 0);
        assert!(!http.calls().iter().any(|(_, url)| url.ends_with("/api/me")));
    }

    #[tokio::test]
    async fn refresh_bypasses_both_caches() {
        let http = Arc::new(MockHttp::new(true));
        let fetchers = fetchers(http.clone());

        fetchers
            .fetch_with(
                CatalogueKind::Ollama,
                "",
                DAEMON_URL,
                FetchOptions {
                    force: false,
                    include_cloud: true,
                },
            )
            .await
            .expect("first catalogue");
        fetchers
            .fetch_with(
                CatalogueKind::Ollama,
                "",
                DAEMON_URL,
                FetchOptions {
                    force: false,
                    include_cloud: true,
                },
            )
            .await
            .expect("cached catalogue");
        assert_eq!(http.count(OLLAMA_CLOUD_CATALOGUE_URL), 1);

        let refreshed = fetchers
            .fetch_with(
                CatalogueKind::Ollama,
                "",
                DAEMON_URL,
                FetchOptions {
                    force: true,
                    include_cloud: true,
                },
            )
            .await
            .expect("forced catalogue");
        assert_eq!(http.count(OLLAMA_CLOUD_CATALOGUE_URL), 2);
        assert!(ids(&refreshed).contains(&"qwen3-coder:480b-cloud".to_string()));
    }

    #[test]
    fn local_models_win_over_cloud_duplicates() {
        let local = vec![CatalogueModel {
            id: Some(Value::String("llama3.2:latest".into())),
            name: Some(Value::String("llama3.2:latest".into())),
            description: Some(Utf16Text::from("3B")),
            is_default: None,
            reasoning_effort_supported: None,
            group: None,
            pricing: None,
        }];
        let cloud = map_ollama_cloud_catalogue(&serde_json::from_str(CLOUD_TAGS).unwrap())
            .expect("cloud catalogue");
        let merged = merge_ollama_models(local, cloud);

        // The local row keeps its description instead of being replaced.
        let row = merged
            .iter()
            .find(|model| model.id.as_ref().and_then(Value::as_str) == Some("llama3.2:latest"))
            .expect("local row");
        assert_eq!(row.group, None);
        assert_eq!(row.description.as_ref().map(|text| text.0.len()), Some(2));
        assert_eq!(merged.len(), 3);
    }

    #[test]
    fn cloud_rows_describe_themselves_without_parameters() {
        let models = map_ollama_cloud_catalogue(&serde_json::from_str(CLOUD_TAGS).unwrap())
            .expect("catalogue");
        let qwen = models
            .iter()
            .find(|model| {
                model.id.as_ref().and_then(Value::as_str) == Some("qwen3-coder:480b-cloud")
            })
            .expect("cloud row");
        let description = text(qwen.description.as_ref().expect("description"));
        assert_eq!(description, "tools");

        let deepseek = models
            .iter()
            .find(|model| {
                model.id.as_ref().and_then(Value::as_str) == Some("deepseek-v3.1:671b-cloud")
            })
            .expect("cloud row");
        assert_eq!(
            deepseek.description.as_ref().map(text),
            Some("deepseek · 671B".to_string())
        );
    }
}
