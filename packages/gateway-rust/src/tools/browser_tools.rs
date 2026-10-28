//! Native port of `packages/gateway/src/tools/browser-tools.ts` (reduced scope).
//!
//! Ported tools:
//!
//! | tool | driver |
//! |------|--------|
//! | `browser.navigate` | `JaitPort` method `browser.navigate` |
//! | `browser.snapshot` | `JaitPort` method `browser.inspect` |
//! | `browser.inspect` | `JaitPort` method `browser.inspect` |
//! | `browser.screenshot` | `JaitPort` method `browser.screenshot` |
//! | `web.fetch` | native HTTP through the injected [`HttpPort`], gated by [`SsrfGuard`] |
//! | `web.search` | native HTTP through the injected [`HttpPort`] |
//! | `browser.sandbox.start` | `JaitPort` method `sandbox.browser.start` |
//!
//! The TypeScript module talks to a `BrowserSurface` object held in the gateway's
//! surface registry. The native crate has no in-process surface registry, so the
//! browser/CDP operations are routed through the crate's existing `JaitPort<C>`
//! abstraction, whose dotted method names match the port names used by
//! `tools/sandbox_tools.rs` and `tools/os_tools.rs`. `web.fetch`/`web.search` are
//! executed natively with `reqwest` (as `tools/homeassistant_tools.rs` does), behind
//! an injectable transport so behaviour is unit-testable without network access.
//!
//! Security notes:
//! * `SsrfGuard` is consulted for *every* outbound URL, including redirect targets.
//! * Response bodies are bounded (`maxBytes`, hard ceiling) and requests time out.
//! * API keys are read from the call context only, never from tool arguments, and are
//!   never echoed into results, messages or error text.
//! * `context.secretSafe` suppresses browser capture payloads, matching the TS
//!   `redactBrowserCapturePayload` behaviour.
//! * Cancellation (`context.aborted`) is checked before any work and before shaping.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LazyLock};

use futures_util::future::BoxFuture;
use serde_json::{json, Map, Value};

use super::core_io::HostError;
use super::core_jait::JaitPort;
use super::validate::{validate_tool_input, ToolInput};
use crate::security::ssrf_guard::SsrfGuard;
use crate::security::tool_permissions::{
    requires_consent, resolve_tool_permission, ToolPermission,
};

/// Default browser surface id when the session has no chat-scoped browser.
pub const DEFAULT_BROWSER_ID: &str = "browser-default";

const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_KIMI_BASE_URL: &str = "https://api.moonshot.ai/v1";
const DEFAULT_OPENAI_WEB_SEARCH_MODEL: &str = "gpt-5";
const DEFAULT_PERPLEXITY_MODEL: &str = "sonar-pro";
const DEFAULT_GROK_MODEL: &str = "grok-4-1212";
const DEFAULT_GEMINI_MODEL: &str = "gemini-2.0-flash";
const DEFAULT_KIMI_MODEL: &str = "moonshot-v1-128k";
const DEFAULT_GROK_BASE_URL: &str = "https://api.x.ai/v1";
const DEFAULT_PERPLEXITY_BASE_URL: &str = "https://api.perplexity.ai";
const DEFAULT_GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_BRAVE_SEARCH_URL: &str = "https://api.search.brave.com/res/v1/web/search";

/// Text preview length used by `buildSnapshotPayload` in the TS source.
const TEXT_PREVIEW_LIMIT: usize = 500;
/// Interactive element limit used by `buildSnapshotPayload` in the TS source.
const INTERACTIVE_ELEMENT_LIMIT: usize = 10;
/// Default request timeout for `web.fetch` (milliseconds).
const DEFAULT_FETCH_TIMEOUT_MS: u64 = 15_000;
/// Default response body bound for `web.fetch` (bytes).
const DEFAULT_FETCH_MAX_BYTES: usize = 200_000;
/// Hard ceiling regardless of the requested `maxBytes`.
const HARD_FETCH_MAX_BYTES: usize = 5_000_000;
/// Default result count for `web.search`.
const DEFAULT_SEARCH_LIMIT: u64 = 5;
const MAX_SEARCH_LIMIT: u64 = 10;
/// Timeout for a single `web.search` provider call (milliseconds).
const SEARCH_TIMEOUT_MS: u64 = 30_000;
/// Upper bound on the raw provider payload we are willing to buffer.
const SEARCH_MAX_BYTES: usize = 1_000_000;

/// The seven tools this module owns.
pub const TOOL_NAMES: [&str; 7] = [
    "browser.navigate",
    "browser.snapshot",
    "browser.inspect",
    "browser.screenshot",
    "web.fetch",
    "web.search",
    "browser.sandbox.start",
];

const NAVIGATE_DESCRIPTION: &str = "Open a URL in the live browser displayed in this chat and return a page summary. When a preview is active, automatically targets the preview browser.";
const SNAPSHOT_DESCRIPTION: &str = "Capture the visible text and interactive elements of the live browser displayed in this chat. When a preview is active, automatically targets the preview browser.";
const INSPECT_DESCRIPTION: &str = "Inspect the live browser in this chat, optionally focusing on a single CSS selector, and return a page summary.";
const SCREENSHOT_DESCRIPTION: &str = "Capture a screenshot of the live browser displayed in this chat and save it to a file.";
const FETCH_DESCRIPTION: &str = "Fetch a URL over HTTP(S) and return its body. Private and non-allowlisted hosts are blocked, response size and time are bounded.";
const SEARCH_DESCRIPTION: &str = "Search the public web and return ranked results. Provider credentials come from the user's settings, never from tool arguments.";
const SANDBOX_START_DESCRIPTION: &str = "Start a sandboxed browser container for this project with noVNC/VNC access.";

fn tool_entry(name: &str, description: &str, parameters: Value) -> Value {
    let category = if name.starts_with("web.") { "web" } else { "browser" };
    json!({
        "name": name,
        "description": description,
        "tier": "standard",
        "category": category,
        "source": "builtin",
        "parameters": parameters,
    })
}

fn browser_id_property() -> Value {
    json!({
        "type": "string",
        "description": "Browser surface id. Defaults to the chat-scoped browser for this session."
    })
}

fn metadata_table() -> &'static Map<String, Value> {
    static TABLE: LazyLock<Map<String, Value>> = LazyLock::new(|| {
        let mut table = Map::new();
        table.insert(
            "browser.navigate".to_string(),
            tool_entry(
                "browser.navigate",
                NAVIGATE_DESCRIPTION,
                json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "Absolute http(s) URL to open." },
                        "browserId": browser_id_property(),
                    },
                    "required": ["url"],
                    "additionalProperties": false,
                }),
            ),
        );
        table.insert(
            "browser.snapshot".to_string(),
            tool_entry(
                "browser.snapshot",
                SNAPSHOT_DESCRIPTION,
                json!({
                    "type": "object",
                    "properties": { "browserId": browser_id_property() },
                    "additionalProperties": false,
                }),
            ),
        );
        table.insert(
            "browser.inspect".to_string(),
            tool_entry(
                "browser.inspect",
                INSPECT_DESCRIPTION,
                json!({
                    "type": "object",
                    "properties": {
                        "selector": { "type": "string", "description": "CSS selector to inspect instead of the whole page." },
                        "browserId": browser_id_property(),
                    },
                    "additionalProperties": false,
                }),
            ),
        );
        table.insert(
            "browser.screenshot".to_string(),
            tool_entry(
                "browser.screenshot",
                SCREENSHOT_DESCRIPTION,
                json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Destination file path for the screenshot." },
                        "browserId": browser_id_property(),
                    },
                    "additionalProperties": false,
                }),
            ),
        );
        table.insert(
            "web.fetch".to_string(),
            tool_entry(
                "web.fetch",
                FETCH_DESCRIPTION,
                json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "Absolute http(s) URL to fetch." },
                        "method": {
                            "type": "string",
                            "enum": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
                            "description": "HTTP method. Defaults to GET."
                        },
                        "body": { "type": "string", "description": "Request body for non-GET requests." },
                        "headers": {
                            "type": "object",
                            "additionalProperties": { "type": "string" },
                            "description": "Extra request headers."
                        },
                        "timeoutMs": { "type": "number", "description": "Request timeout in milliseconds." },
                        "maxBytes": { "type": "number", "description": "Maximum response body size in bytes." },
                        "ignoreTlsErrors": { "type": "boolean", "description": "Retry once without TLS verification." },
                    },
                    "required": ["url"],
                    "additionalProperties": false,
                }),
            ),
        );
        table.insert(
            "web.search".to_string(),
            tool_entry(
                "web.search",
                SEARCH_DESCRIPTION,
                json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search query." },
                        "provider": {
                            "type": "string",
                            "description": "Search provider: auto, openai, brave, perplexity, grok, gemini or kimi. Defaults to auto; unknown or unconfigured providers fall back to openai."
                        },
                        "limit": { "type": "number", "description": "Maximum number of results (1-10)." },
                    },
                    "required": ["query"],
                    "additionalProperties": false,
                }),
            ),
        );
        table.insert(
            "browser.sandbox.start".to_string(),
            tool_entry(
                "browser.sandbox.start",
                SANDBOX_START_DESCRIPTION,
                json!({
                    "type": "object",
                    "properties": {
                        "novncPort": { "type": "number", "description": "Host port for the noVNC web UI." },
                        "vncPort": { "type": "number", "description": "Host port for raw VNC." },
                        "mountMode": {
                            "type": "string",
                            "enum": ["none", "read-only", "read-write"],
                            "description": "How the project is mounted into the sandbox. Defaults to read-only."
                        },
                    },
                    "additionalProperties": false,
                }),
            ),
        );
        table
    });
    &TABLE
}

/// Tool metadata (`name`, `description`, `tier`, `category`, `source`, `parameters`).
pub fn metadata(name: &str) -> Option<&'static Value> {
    metadata_table().get(name)
}

/// The JSON schema for a tool's arguments.
pub fn definition(name: &str) -> Option<&'static Value> {
    metadata(name).map(|entry| &entry["parameters"])
}

/// All tool metadata, in declaration order.
pub fn all_metadata() -> Vec<&'static Value> {
    TOOL_NAMES.iter().filter_map(|name| metadata(name)).collect()
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

fn success(message: impl Into<String>, data: Value) -> Value {
    json!({ "ok": true, "message": message.into(), "data": data })
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

/// Flatten a [`HostError`] into display text without leaking arguments.
fn error_text(error: &HostError) -> String {
    match error {
        HostError::Error(message) => message.clone(),
        HostError::Thrown(value) => value
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| value.to_string()),
    }
}

/// True when the caller aborted before or during the call.
fn cancelled(context: &Value) -> bool {
    context.get("aborted").and_then(Value::as_bool).unwrap_or(false)
        || context
            .get("signal")
            .and_then(|signal| signal.get("aborted"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
}

fn present(value: Option<&Value>) -> Option<&Value> {
    match value {
        None | Some(Value::Null) => None,
        Some(value) => Some(value),
    }
}

fn string_field(input: &Value, key: &str) -> Option<String> {
    present(input.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn u64_field(input: &Value, key: &str) -> Option<u64> {
    present(input.get(key)).and_then(|value| match value {
        Value::Number(number) => number.as_u64().or_else(|| {
            number
                .as_f64()
                .filter(|value| value.is_finite() && *value >= 0.0)
                .map(|value| value as u64)
        }),
        _ => None,
    })
}

fn bool_field(input: &Value, key: &str) -> Option<bool> {
    present(input.get(key)).and_then(Value::as_bool)
}

fn validation_failure(name: &str, errors: &[crate::contracts::bounded_json::Utf16Text]) -> Value {
    let detail = errors
        .iter()
        .map(|error| String::from_utf16_lossy(&error.0))
        .collect::<Vec<_>>()
        .join(", ");
    fail(format!("Input validation failed for {name}: {detail}"))
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/// Consent gate.
///
/// The TypeScript tools rely on the executor's permission tier. The native port keeps
/// that behaviour (no policy in the context means "the executor already decided") but
/// additionally refuses when the context carries an explicit policy that denies the
/// tool or still requires consent that has not been granted. This can only ever deny
/// more, never less.
fn permission_denied(name: &str, context: &Value) -> Option<String> {
    let permissions = context.get("permissions")?;

    if let Some(denied) = permissions.get("denied").and_then(Value::as_array)
        && denied.iter().any(|entry| entry.as_str() == Some(name)) {
            return Some(format!("Permission denied for {name}: tool is explicitly denied by policy"));
        }

    let policy = permissions.get("tools")?;
    let parsed: HashMap<String, ToolPermission> = serde_json::from_value(policy.clone()).ok()?;
    let resolved = resolve_tool_permission(name, &parsed);
    let trust_level = permissions
        .get("trustLevel")
        .and_then(Value::as_f64)
        .unwrap_or(1.0);
    let approvals: HashSet<String> = permissions
        .get("sessionApprovals")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    if requires_consent(Some(&resolved.permission), trust_level, &approvals) {
        let granted = permissions
            .get("consentGranted")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !granted {
            return Some(format!(
                "Permission denied for {name}: consent required but not granted"
            ));
        }
    }
    None
}

// ---------------------------------------------------------------------------
// HTTP seam
// ---------------------------------------------------------------------------

/// A single outbound request issued by `web.fetch` / `web.search`.
#[derive(Clone, Debug, PartialEq)]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub timeout_ms: u64,
    pub max_bytes: usize,
    pub ignore_tls_errors: bool,
}

/// A buffered, size-bounded response.
#[derive(Clone, Debug, PartialEq)]
pub struct HttpResponse {
    pub status: u16,
    pub content_type: Option<String>,
    pub body: String,
    pub truncated: bool,
    /// `Location` header, kept so the caller can SSRF-check every redirect hop.
    pub location: Option<String>,
    /// Set when the request only succeeded after disabling TLS verification.
    pub insecure_tls_used: bool,
}

impl HttpResponse {
    /// Convenience constructor used by tests and the reqwest transport.
    pub fn new(status: u16, content_type: Option<String>, body: String) -> Self {
        Self {
            status,
            content_type,
            body,
            truncated: false,
            location: None,
            insecure_tls_used: false,
        }
    }
}

/// Injectable transport. The default implementation is [`reqwest_http`].
pub type HttpPort =
    Arc<dyn Fn(HttpRequest) -> BoxFuture<'static, Result<HttpResponse, String>> + Send + Sync>;

/// Real HTTP transport, bounded and non-redirect-following so the SSRF guard can
/// vet every hop itself.
pub fn reqwest_http() -> HttpPort {
    Arc::new(|request: HttpRequest| {
        Box::pin(async move { execute_reqwest(request).await })
    })
}

async fn execute_reqwest(request: HttpRequest) -> Result<HttpResponse, String> {
    let build = |ignore_tls: bool| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(request.timeout_ms.max(1)))
            // Redirects are followed manually so each hop is SSRF-checked.
            .redirect(reqwest::redirect::Policy::none())
            .danger_accept_invalid_certs(ignore_tls)
            .build()
            .map_err(|error| format!("HTTP client error: {error}"))
    };

    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| format!("Unsupported HTTP method: {}", request.method))?;

    let send = |client: &reqwest::Client| {
        let mut builder = client.request(method.clone(), &request.url);
        for (name, value) in &request.headers {
            builder = builder.header(name.as_str(), value.as_str());
        }
        if let Some(body) = &request.body {
            builder = builder.body(body.clone());
        }
        builder.send()
    };

    let client = build(request.ignore_tls_errors)?;
    let response = match send(&client).await {
        Ok(response) => response,
        Err(error) if !request.ignore_tls_errors && error.is_connect() => {
            // Mirror `ignoreTlsErrors`: retry once without certificate verification.
            let insecure = build(true)?;
            let retried = send(&insecure)
                .await
                .map_err(|error| format!("Request failed: {error}"))?;
            let mut shaped = drain(retried, request.max_bytes).await?;
            shaped.insecure_tls_used = true;
            return Ok(shaped);
        }
        Err(error) => return Err(format!("Request failed: {error}")),
    };

    drain(response, request.max_bytes).await
}

async fn drain(mut response: reqwest::Response, max_bytes: usize) -> Result<HttpResponse, String> {
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);

    let location = response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);

    let cap = max_bytes.clamp(1, HARD_FETCH_MAX_BYTES);
    let mut buffer: Vec<u8> = Vec::new();
    let mut truncated = false;
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if buffer.len() + chunk.len() > cap {
                    let room = cap.saturating_sub(buffer.len());
                    buffer.extend_from_slice(&chunk[..room.min(chunk.len())]);
                    truncated = true;
                    break;
                }
                buffer.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(error) => return Err(format!("Failed reading response body: {error}")),
        }
    }

    Ok(HttpResponse {
        status,
        content_type,
        body: String::from_utf8_lossy(&buffer).into_owned(),
        truncated,
        location,
        insecure_tls_used: false,
    })
}

// ---------------------------------------------------------------------------
// Browser capture shaping
// ---------------------------------------------------------------------------

const SECRET_SAFE_REASON: &str =
    "Browser capture is suppressed while the session is marked secret-safe.";

fn secret_safe(context: &Value) -> bool {
    context
        .get("secretSafe")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn take_chars(value: &Value, key: &str, limit: usize) -> Value {
    match present(value.get(key)).and_then(Value::as_str) {
        Some(text) => Value::String(text.chars().take(limit).collect()),
        None => Value::String(String::new()),
    }
}

fn array_prefix(value: &Value, key: &str, limit: usize) -> Value {
    match present(value.get(key)).and_then(Value::as_array) {
        Some(items) => Value::Array(items.iter().take(limit).cloned().collect()),
        None => Value::Array(Vec::new()),
    }
}

fn or_null(value: &Value, key: &str) -> Value {
    present(value.get(key)).cloned().unwrap_or(Value::Null)
}

/// `buildSnapshotPayload` from the TS source, including the secret-safe redaction.
fn build_snapshot_payload(
    browser_id: &str,
    snapshot: &Value,
    context: &Value,
    target: Option<Value>,
) -> Value {
    let secret = secret_safe(context);
    let mut payload = json!({
        "browserId": browser_id,
        "url": present(snapshot.get("url")).cloned().unwrap_or(Value::Null),
        "title": present(snapshot.get("title")).cloned().unwrap_or(Value::Null),
        "textPreview": take_chars(snapshot, "text", TEXT_PREVIEW_LIMIT),
        "interactiveElements": array_prefix(snapshot, "interactiveElements", INTERACTIVE_ELEMENT_LIMIT),
        "activeElement": or_null(snapshot, "activeElement"),
        "dialogs": array_prefix(snapshot, "dialogs", INTERACTIVE_ELEMENT_LIMIT),
        "obstruction": or_null(snapshot, "obstruction"),
        "target": target.unwrap_or(Value::Null),
        "secretSafe": secret,
        "browserSession": or_null(context, "sessionId"),
    });

    if secret {
        let object = payload.as_object_mut().expect("payload is an object");
        object.insert("textPreview".into(), Value::String(String::new()));
        object.insert("interactiveElements".into(), Value::Array(Vec::new()));
        object.insert("activeElement".into(), Value::Null);
        object.insert("dialogs".into(), Value::Array(Vec::new()));
        object.insert("obstruction".into(), Value::Null);
        object.insert("target".into(), Value::Null);
        object.insert("captureSuppressed".into(), Value::Bool(true));
        object.insert("suppressionReason".into(), Value::String(SECRET_SAFE_REASON.into()));
    }

    payload
}

/// The chat-scoped browser id (`ensureBrowserSurface` in the TS source).
fn resolve_browser_id(input: &Value, context: &Value) -> String {
    string_field(input, "browserId").unwrap_or_else(|| {
        match string_field(context, "sessionId") {
            Some(session) => format!("browser-{session}"),
            None => DEFAULT_BROWSER_ID.to_string(),
        }
    })
}

// ---------------------------------------------------------------------------
// Call context
// ---------------------------------------------------------------------------

/// Minimal view of the call context the tools need.
///
/// The browser port (`JaitPort<C>`) is generic over the host context, while the tool
/// arguments and the security-relevant flags (`secretSafe`, `sessionId`, `apiKeys`,
/// `permissions`) travel as JSON. Implementors expose that JSON view.
pub trait CallContext {
    fn json(&self) -> &Value;
}

impl CallContext for Value {
    fn json(&self) -> &Value {
        self
    }
}

// ---------------------------------------------------------------------------
// Browser driver
// ---------------------------------------------------------------------------

/// Browser + sandbox tools bound to the crate's host ports.
pub struct BrowserTools<C> {
    /// Browser surface driver (`browser.navigate`, `browser.inspect`, ...).
    pub browser: JaitPort<C>,
    /// Sandbox manager driver (`sandbox.browser.start`).
    pub sandbox: JaitPort<C>,
    /// Transport used by `web.fetch` / `web.search`.
    pub http: HttpPort,
    /// SSRF policy: allow private/loopback hosts (default: deny).
    pub allow_private_hosts: bool,
    /// SSRF policy: host allow-list (empty means "any public host").
    pub allowed_hosts: Vec<String>,
}

impl<C> BrowserTools<C> {
    /// Browser tools with the default reqwest transport and a strict SSRF policy.
    pub fn new(browser: JaitPort<C>, sandbox: JaitPort<C>) -> Self {
        Self {
            browser,
            sandbox,
            http: reqwest_http(),
            allow_private_hosts: false,
            allowed_hosts: Vec::new(),
        }
    }

    /// Replace the transport (used by tests and by callers with a shared client).
    pub fn with_http(mut self, http: HttpPort) -> Self {
        self.http = http;
        self
    }

    /// Configure the SSRF policy.
    pub fn with_ssrf_policy(mut self, allow_private_hosts: bool, allowed_hosts: Vec<String>) -> Self {
        self.allow_private_hosts = allow_private_hosts;
        self.allowed_hosts = allowed_hosts;
        self
    }

    fn guard(&self) -> SsrfGuard {
        SsrfGuard {
            allow_private_hosts: self.allow_private_hosts,
            allowed_hosts: self.allowed_hosts.clone(),
        }
    }
}

/// Extract a snapshot out of a driver result, tolerating `{data:{snapshot}}` and
/// `{data:{...}}` shapes.
fn unwrap_snapshot(result: &Value) -> Value {
    let data = present(result.get("data")).cloned().unwrap_or(Value::Null);
    match present(data.get("snapshot")) {
        Some(snapshot) => snapshot.clone(),
        None => data,
    }
}

/// Driver results that already report `ok: false` are passed through unchanged.
fn driver_failure(result: &Value) -> Option<Value> {
    if result.get("ok").and_then(Value::as_bool) == Some(false) {
        Some(result.clone())
    } else {
        None
    }
}

impl<C: CallContext + Send + Sync> BrowserTools<C> {
    // -- browser.navigate ---------------------------------------------------

    /// `browser.navigate` — errors are swallowed into structured results.
    pub async fn navigate(&self, input: &Value, context: &C) -> Value {
        match self.navigate_inner(input, context).await {
            Ok(value) => value,
            Err(error) => fail(error_text(&error)),
        }
    }

    async fn navigate_inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let ctx = context.json();
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }
        let mut typed = ToolInput::new(input);
        let validation = match validate_tool_input(
            definition("browser.navigate").expect("navigate schema"),
            &mut typed,
        ) {
            Ok(result) => result,
            Err(err) => return Ok(fail(format!("Invalid input: {}", err.name))),
        };
        if !validation.valid {
            return Ok(validation_failure("browser.navigate", &validation.errors));
        }
        if let Some(denial) = permission_denied("browser.navigate", ctx) {
            return Ok(fail(denial));
        }

        let raw_url = string_field(input, "url").ok_or_else(|| {
            HostError::Error("browser.navigate requires a url".to_string())
        })?;
        // The browser driver performs navigation, but the URL still has to be a
        // well-formed absolute http(s) URL before we hand it to the surface.
        let parsed = self
            .guard()
            .validate(&raw_url)
            .map_err(HostError::Error)?;

        let browser_id = resolve_browser_id(input, ctx);
        let args = json!({ "browserId": browser_id, "url": parsed.as_str() });
        let result = (self.browser)("browser.navigate", vec![args], context).await?;
        let Some(result) = result else {
            return Ok(fail("The browser surface did not return a result."));
        };
        if let Some(failure) = driver_failure(&result) {
            return Ok(failure);
        }
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }

        let snapshot = unwrap_snapshot(&result);
        let final_url = present(snapshot.get("url"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or(parsed.as_str().to_string());
        Ok(success(
            format!("Navigated to {final_url}"),
            build_snapshot_payload(&browser_id, &snapshot, ctx, None),
        ))
    }

    // -- browser.snapshot ---------------------------------------------------

    /// `browser.snapshot` — page text + interactive elements.
    pub async fn snapshot(&self, input: &Value, context: &C) -> Value {
        match self.snapshot_inner(input, context).await {
            Ok(value) => value,
            Err(error) => fail(error_text(&error)),
        }
    }

    async fn snapshot_inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let ctx = context.json();
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }
        let mut typed = ToolInput::new(input);
        let validation = match validate_tool_input(
            definition("browser.snapshot").expect("snapshot schema"),
            &mut typed,
        ) {
            Ok(result) => result,
            Err(err) => return Ok(fail(format!("Invalid input: {}", err.name))),
        };
        if !validation.valid {
            return Ok(validation_failure("browser.snapshot", &validation.errors));
        }
        if let Some(denial) = permission_denied("browser.snapshot", ctx) {
            return Ok(fail(denial));
        }

        let browser_id = resolve_browser_id(input, ctx);
        let args = json!({ "browserId": browser_id, "selector": Value::Null });
        let result = (self.browser)("browser.inspect", vec![args], context).await?;
        let Some(result) = result else {
            return Ok(fail("The browser surface did not return a result."));
        };
        if let Some(failure) = driver_failure(&result) {
            return Ok(failure);
        }
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }

        let snapshot = unwrap_snapshot(&result);
        let description = present(result.get("data"))
            .and_then(|data| present(data.get("description")))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| {
                present(snapshot.get("text"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .chars()
                    .take(TEXT_PREVIEW_LIMIT)
                    .collect()
            });

        let secret = secret_safe(ctx);
        let mut payload = build_snapshot_payload(&browser_id, &snapshot, ctx, None);
        if let Some(object) = payload.as_object_mut() {
            object.insert(
                "snapshot".into(),
                Value::String(if secret {
                    SECRET_SAFE_REASON.to_string()
                } else {
                    description
                }),
            );
        }

        Ok(success(
            if secret {
                "Browser snapshot suppressed because the session is marked secret-safe"
            } else {
                "Browser snapshot captured"
            },
            payload,
        ))
    }

    // -- browser.inspect ----------------------------------------------------

    /// `browser.inspect` — page summary, optionally for one selector.
    pub async fn inspect(&self, input: &Value, context: &C) -> Value {
        match self.inspect_inner(input, context).await {
            Ok(value) => value,
            Err(error) => fail(error_text(&error)),
        }
    }

    async fn inspect_inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let ctx = context.json();
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }
        let mut typed = ToolInput::new(input);
        let validation = match validate_tool_input(
            definition("browser.inspect").expect("inspect schema"),
            &mut typed,
        ) {
            Ok(result) => result,
            Err(err) => return Ok(fail(format!("Invalid input: {}", err.name))),
        };
        if !validation.valid {
            return Ok(validation_failure("browser.inspect", &validation.errors));
        }
        if let Some(denial) = permission_denied("browser.inspect", ctx) {
            return Ok(fail(denial));
        }

        let selector = string_field(input, "selector");
        let browser_id = resolve_browser_id(input, ctx);
        let args = json!({
            "browserId": browser_id,
            "selector": selector.clone().map(Value::String).unwrap_or(Value::Null),
        });
        let result = (self.browser)("browser.inspect", vec![args], context).await?;
        let Some(result) = result else {
            return Ok(fail("The browser surface did not return a result."));
        };
        if let Some(failure) = driver_failure(&result) {
            return Ok(failure);
        }
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }

        let snapshot = unwrap_snapshot(&result);
        let target = present(snapshot.get("target")).cloned();
        let message = if secret_safe(ctx) {
            "Browser inspection suppressed because the session is marked secret-safe".to_string()
        } else {
            match &selector {
                Some(selector) => format!("Browser inspection captured for {selector}"),
                None => "Browser inspection captured".to_string(),
            }
        };

        Ok(success(
            message,
            build_snapshot_payload(&browser_id, &snapshot, ctx, target),
        ))
    }

    // -- browser.screenshot -------------------------------------------------

    /// `browser.screenshot` — save a capture to `path` (driver-chosen when omitted).
    pub async fn screenshot(&self, input: &Value, context: &C) -> Value {
        match self.screenshot_inner(input, context).await {
            Ok(value) => value,
            Err(error) => fail(error_text(&error)),
        }
    }

    async fn screenshot_inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let ctx = context.json();
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }
        let mut typed = ToolInput::new(input);
        let validation = match validate_tool_input(
            definition("browser.screenshot").expect("screenshot schema"),
            &mut typed,
        ) {
            Ok(result) => result,
            Err(err) => return Ok(fail(format!("Invalid input: {}", err.name))),
        };
        if !validation.valid {
            return Ok(validation_failure("browser.screenshot", &validation.errors));
        }
        if let Some(denial) = permission_denied("browser.screenshot", ctx) {
            return Ok(fail(denial));
        }

        let browser_id = resolve_browser_id(input, ctx);
        if secret_safe(ctx) {
            return Ok(success(
                "Browser screenshot suppressed because the session is marked secret-safe",
                json!({
                    "browserId": browser_id,
                    "captured": false,
                    "secretSafe": true,
                    "captureSuppressed": true,
                    "suppressionReason": SECRET_SAFE_REASON,
                }),
            ));
        }

        let path = string_field(input, "path");
        let args = json!({
            "browserId": browser_id,
            "path": path.clone().map(Value::String).unwrap_or(Value::Null),
        });
        let result = (self.sandbox_or_browser_screenshot(&args, context)).await?;
        let Some(result) = result else {
            return Ok(fail("The browser surface did not return a result."));
        };
        if let Some(failure) = driver_failure(&result) {
            return Ok(failure);
        }
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }

        let data = present(result.get("data")).cloned().unwrap_or(Value::Null);
        let saved_path = present(data.get("path"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .or(path);
        let message = match &saved_path {
            Some(path) => format!("Saved browser screenshot to {path}"),
            None => "Browser screenshot captured".to_string(),
        };
        let mut payload = match data {
            Value::Object(map) => Value::Object(map),
            _ => json!({}),
        };
        if let Some(object) = payload.as_object_mut() {
            object.insert("browserId".into(), Value::String(browser_id));
            object.insert("secretSafe".into(), Value::Bool(false));
        }
        Ok(success(message, payload))
    }

    async fn sandbox_or_browser_screenshot(
        &self,
        args: &Value,
        context: &C,
    ) -> Result<Option<Value>, HostError> {
        (self.browser)("browser.screenshot", vec![args.clone()], context).await
    }
}

// ---------------------------------------------------------------------------
// web.fetch
// ---------------------------------------------------------------------------

/// Methods accepted by `web.fetch`.
const FETCH_METHODS: [&str; 6] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
const MAX_REDIRECTS: usize = 5;
const MAX_FETCH_TIMEOUT_MS: u64 = 120_000;

// ---------------------------------------------------------------------------
// web.search
// ---------------------------------------------------------------------------

const SEARCH_PROVIDERS: [&str; 6] = ["brave", "openai", "perplexity", "grok", "gemini", "kimi"];

#[derive(Default)]
struct SearchOutcome {
    results: Vec<Value>,
    answer: Option<String>,
}

fn search_result(title: &str, url: &str, description: &str) -> Value {
    json!({ "title": title, "url": url, "description": description })
}

/// Look up a provider credential in the call context. Credentials never come from
/// tool arguments and are never copied into results.
fn provider_key(context: &Value, provider: &str) -> Option<String> {
    let keys = present(context.get("apiKeys"))?;
    let entry = present(keys.get(provider))?;
    match entry {
        Value::String(value) if !value.trim().is_empty() => Some(value.trim().to_string()),
        Value::Object(map) => ["apiKey", "api_key", "key", "token"]
            .iter()
            .find_map(|field| {
                map.get(*field)
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
            }),
        _ => None,
    }
}

fn resolve_auto_provider(context: &Value) -> Option<&'static str> {
    SEARCH_PROVIDERS
        .iter()
        .find(|provider| provider_key(context, provider).is_some())
        .copied()
}

/// Matches the TS implementation: an explicitly requested provider that this
/// build does not know is not an error, it silently falls back to OpenAI.
fn resolve_requested_provider(requested: &str) -> &'static str {
    SEARCH_PROVIDERS
        .iter()
        .find(|provider| **provider == requested)
        .copied()
        .unwrap_or("openai")
}

fn parse_brave(payload: &Value, limit: usize) -> SearchOutcome {
    let results = payload
        .get("web")
        .and_then(|web| web.get("results"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let url = item.get("url").and_then(Value::as_str)?;
                    let title = item
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or(url);
                    let description = item
                        .get("description")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    Some(search_result(title, url, description))
                })
                .take(limit)
                .collect()
        })
        .unwrap_or_default();
    SearchOutcome {
        results,
        answer: None,
    }
}

/// Chat-completions style providers (perplexity, grok, kimi) report their sources as
/// a `citations` array; the model answer is the first message.
fn parse_chat_citations(payload: &Value, limit: usize) -> SearchOutcome {
    let mut results: Vec<Value> = Vec::new();
    if let Some(citations) = payload.get("citations").and_then(Value::as_array) {
        for citation in citations {
            let url = match citation {
                Value::String(url) => Some(url.as_str()),
                Value::Object(map) => map.get("url").and_then(Value::as_str),
                _ => None,
            };
            if let Some(url) = url {
                results.push(search_result(url, url, ""));
            }
        }
    }
    if let Some(sources) = payload
        .get("search_results")
        .and_then(Value::as_array)
    {
        for source in sources {
            if let Some(url) = source.get("url").and_then(Value::as_str) {
                let title = source.get("title").and_then(Value::as_str).unwrap_or(url);
                results.push(search_result(title, url, ""));
            }
        }
    }
    results.truncate(limit);
    SearchOutcome {
        results,
        answer: chat_answer(payload),
    }
}

fn chat_answer(payload: &Value) -> Option<String> {
    payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn parse_gemini(payload: &Value, limit: usize) -> SearchOutcome {
    let candidate = payload
        .get("candidates")
        .and_then(Value::as_array)
        .and_then(|candidates| candidates.first());
    let results = candidate
        .and_then(|candidate| candidate.get("groundingMetadata"))
        .and_then(|metadata| metadata.get("groundingChunks"))
        .and_then(Value::as_array)
        .map(|chunks| {
            chunks
                .iter()
                .filter_map(|chunk| {
                    let web = chunk.get("web")?;
                    let url = web.get("uri").and_then(Value::as_str)?;
                    let title = web.get("title").and_then(Value::as_str).unwrap_or(url);
                    Some(search_result(title, url, ""))
                })
                .take(limit)
                .collect()
        })
        .unwrap_or_default();
    let answer = candidate
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(Value::as_array)
        .and_then(|parts| parts.first())
        .and_then(|part| part.get("text"))
        .and_then(Value::as_str)
        .map(str::to_string);
    SearchOutcome { results, answer }
}

fn parse_openai(payload: &Value, limit: usize) -> SearchOutcome {
    let mut results: Vec<Value> = Vec::new();
    if let Some(output) = payload.get("output").and_then(Value::as_array) {
        for item in output {
            let Some(content) = item.get("content").and_then(Value::as_array) else {
                continue;
            };
            for part in content {
                let Some(annotations) = part.get("annotations").and_then(Value::as_array) else {
                    continue;
                };
                for annotation in annotations {
                    let url = annotation
                        .get("url")
                        .and_then(Value::as_str)
                        .or_else(|| {
                            annotation
                                .get("url_citation")
                                .and_then(|citation| citation.get("url"))
                                .and_then(Value::as_str)
                        });
                    if let Some(url) = url {
                        let title = annotation
                            .get("title")
                            .and_then(Value::as_str)
                            .unwrap_or(url);
                        results.push(search_result(title, url, ""));
                    }
                }
            }
        }
    }
    results.truncate(limit);
    SearchOutcome {
        results,
        answer: payload
            .get("output_text")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

/// Truncate arbitrary text so a hostile provider cannot blow up the transcript.
fn bound_text(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let mut bounded: String = text.chars().take(limit).collect();
    bounded.push_str("…[truncated]");
    bounded
}

impl<C: CallContext + Send + Sync> BrowserTools<C> {
    /// `web.fetch` — SSRF-guarded, size- and time-bounded HTTP fetch.
    ///
    /// Redirects are followed manually (at most [`MAX_REDIRECTS`] hops) so that every
    /// hop is re-validated by the SSRF guard; the transport never follows them itself.
    pub async fn web_fetch(&self, input: &Value, context: &C) -> Value {
        match self.web_fetch_inner(input, context).await {
            Ok(value) => value,
            Err(error) => fail(error_text(&error)),
        }
    }

    async fn web_fetch_inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
    
        let ctx = context.json();
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }
        let mut typed = ToolInput::new(input);
        let validation = match
            validate_tool_input(definition("web.fetch").expect("fetch schema"), &mut typed)
            {
                Ok(result) => result,
                Err(err) => return Ok(fail(format!("Invalid input: {}", err.name))),
            };
        if !validation.valid {
            return Ok(validation_failure("web.fetch", &validation.errors));
        }
        if let Some(denial) = permission_denied("web.fetch", ctx) {
            return Ok(fail(denial));
        }

        let raw_url = string_field(input, "url")
            .ok_or_else(|| HostError::Error("web.fetch requires a url".to_string()))?;
        let guard = self.guard();
        let mut url = guard.validate(&raw_url).map_err(HostError::Error)?;

        let mut method = string_field(input, "method")
            .map(|value| value.to_uppercase())
            .unwrap_or_else(|| "GET".to_string());
        if !FETCH_METHODS.contains(&method.as_str()) {
            return Ok(fail(format!("Unsupported HTTP method: {method}")));
        }

        let headers = present(input.get("headers"))
            .and_then(Value::as_object)
            .map(|map| {
                map.iter()
                    .filter_map(|(name, value)| {
                        value.as_str().map(|value| (name.clone(), value.to_string()))
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let timeout_ms = u64_field(input, "timeoutMs")
            .unwrap_or(DEFAULT_FETCH_TIMEOUT_MS)
            .clamp(1, MAX_FETCH_TIMEOUT_MS);
        let max_bytes = u64_field(input, "maxBytes")
            .map(|value| value as usize)
            .unwrap_or(DEFAULT_FETCH_MAX_BYTES)
            .clamp(1, HARD_FETCH_MAX_BYTES);
        let ignore_tls = bool_field(input, "ignoreTlsErrors").unwrap_or(false);
        let mut body = string_field(input, "body");

        let mut visited: Vec<String> = Vec::new();
        let mut insecure_tls_used = false;

        for _hop in 0..=MAX_REDIRECTS {
            if cancelled(ctx) {
                return Ok(fail("Cancelled"));
            }

            let request = HttpRequest {
                method: method.clone(),
                url: url.as_str().to_string(),
                headers: headers.clone(),
                body: body.clone(),
                timeout_ms,
                max_bytes,
                ignore_tls_errors: ignore_tls,
            };
            let response = match (self.http)(request).await {
                Ok(response) => response,
                Err(error) => {
                    // Transport errors may echo the URL; credentials are never included.
                    return Ok(fail(format!("Fetch failed for {}: {error}", url.as_str())));
                }
            };
            insecure_tls_used |= response.insecure_tls_used;

            let is_redirect = matches!(response.status, 301 | 302 | 303 | 307 | 308);
            if is_redirect {
                let Some(location) = response.location.clone() else {
                    return Ok(fail(format!(
                        "Fetch failed for {}: HTTP {} redirect without a Location header",
                        url.as_str(),
                        response.status
                    )));
                };
                visited.push(location.clone());
                let next = match url.join(&location) {
                    Ok(next) => next,
                    Err(_) => {
                        return Ok(fail(format!(
                            "Fetch failed for {}: invalid redirect target",
                            url.as_str()
                        )));
                    }
                };
                // Re-validate every hop: a redirect must not smuggle us past SSRF.
                url = match guard.validate(next.as_str()) {
                    Ok(validated) => validated,
                    Err(error) => {
                        return Ok(fail(format!("Redirect blocked: {error}")));
                    }
                };
                // 303 (and the historical 301/302 behaviour for POST) downgrade to GET.
                if response.status == 303
                    || ((response.status == 301 || response.status == 302) && method == "POST")
                {
                    method = "GET".to_string();
                    body = None;
                }
                continue;
            }

            if cancelled(ctx) {
                return Ok(fail("Cancelled"));
            }

            let bytes = response.body.len();
            let mut message = format!("Fetched {} ({bytes} bytes)", url.as_str());
            if response.truncated {
                message.push_str(" [truncated]");
            }
            if response.status >= 400 {
                message = format!(
                    "Fetched {} with status {} ({bytes} bytes)",
                    url.as_str(),
                    response.status
                );
            }
            return Ok(success(
                message,
                json!({
                    "url": raw_url,
                    "finalUrl": url.as_str(),
                    "status": response.status,
                    "contentType": response.content_type,
                    "body": response.body,
                    "bytes": bytes,
                    "truncated": response.truncated,
                    "insecureTlsUsed": insecure_tls_used,
                    "redirects": visited,
                }),
            ));
        }

        Ok(fail(format!(
            "Too many redirects while fetching {raw_url}"
        )))
    }

    // -- web.search ---------------------------------------------------------

    /// `web.search` — provider-dispatched web search with bounded results.
    pub async fn web_search(&self, input: &Value, context: &C) -> Value {
        match self.web_search_inner(input, context).await {
            Ok(value) => value,
            Err(error) => fail(error_text(&error)),
        }
    }

    async fn web_search_inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let ctx = context.json();
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }
        let mut typed = ToolInput::new(input);
        let validation = match
            validate_tool_input(definition("web.search").expect("search schema"), &mut typed)
            {
                Ok(result) => result,
                Err(err) => return Ok(fail(format!("Invalid input: {}", err.name))),
            };
        if !validation.valid {
            return Ok(validation_failure("web.search", &validation.errors));
        }
        if let Some(denial) = permission_denied("web.search", ctx) {
            return Ok(fail(denial));
        }

        let query = string_field(input, "query")
            .ok_or_else(|| HostError::Error("Search query is required".to_string()))?;
        let limit = u64_field(input, "limit")
            .unwrap_or(DEFAULT_SEARCH_LIMIT)
            .clamp(1, MAX_SEARCH_LIMIT) as usize;

        let requested = string_field(input, "provider").unwrap_or_else(|| "auto".to_string());
        let requested = requested.to_lowercase();

        let provider = if requested == "auto" {
            match resolve_auto_provider(ctx) {
                Some(provider) => provider,
                None => {
                    return Ok(fail(
                        "No web search provider is configured. Add an API key for Brave, OpenAI, Perplexity, Grok, Gemini or Kimi.",
                    ))
                }
            }
        } else {
            resolve_requested_provider(&requested)
        };

        let key = match provider_key(ctx, provider) {
            Some(key) => key,
            None => {
                return Ok(fail(format!(
                    "Missing API key for web search provider '{provider}'"
                )))
            }
        };

        let (request, parse): (HttpRequest, fn(&Value, usize) -> SearchOutcome) = match provider {
            "brave" => {
                let url = format!(
                    "{DEFAULT_BRAVE_SEARCH_URL}?q={}&count={}",
                    urlencode(&query),
                    limit
                );
                (
                    HttpRequest {
                        method: "GET".to_string(),
                        url,
                        headers: vec![
                            ("accept".to_string(), "application/json".to_string()),
                            ("x-subscription-token".to_string(), key),
                        ],
                        body: None,
                        timeout_ms: SEARCH_TIMEOUT_MS,
                        max_bytes: SEARCH_MAX_BYTES,
                        ignore_tls_errors: false,
                    },
                    parse_brave,
                )
            }
            "openai" => {
                let base = context_string(ctx, "openaiBaseUrl", DEFAULT_OPENAI_BASE_URL);
                let model = context_string(
                    ctx,
                    "openaiWebSearchModel",
                    DEFAULT_OPENAI_WEB_SEARCH_MODEL,
                );
                (
                    chat_request(
                        &format!("{base}/responses"),
                        &key,
                        json!({
                            "model": model,
                            "input": query,
                            "tools": [{ "type": "web_search" }],
                        }),
                    ),
                    parse_openai,
                )
            }
            "perplexity" => {
                let base = context_string(ctx, "perplexityBaseUrl", DEFAULT_PERPLEXITY_BASE_URL);
                let model = context_string(ctx, "perplexityModel", DEFAULT_PERPLEXITY_MODEL);
                (
                    chat_request(
                        &format!("{base}/chat/completions"),
                        &key,
                        json!({ "model": model, "messages": [{ "role": "user", "content": query }] }),
                    ),
                    parse_chat_citations,
                )
            }
            "grok" => {
                let base = context_string(ctx, "grokBaseUrl", DEFAULT_GROK_BASE_URL);
                let model = context_string(ctx, "grokModel", DEFAULT_GROK_MODEL);
                (
                    chat_request(
                        &format!("{base}/chat/completions"),
                        &key,
                        json!({ "model": model, "messages": [{ "role": "user", "content": query }] }),
                    ),
                    parse_chat_citations,
                )
            }
            "kimi" => {
                let base = context_string(ctx, "kimiBaseUrl", DEFAULT_KIMI_BASE_URL);
                let model = context_string(ctx, "kimiModel", DEFAULT_KIMI_MODEL);
                (
                    chat_request(
                        &format!("{base}/chat/completions"),
                        &key,
                        json!({ "model": model, "messages": [{ "role": "user", "content": query }] }),
                    ),
                    parse_chat_citations,
                )
            }
            _ => {
                let base = context_string(ctx, "geminiBaseUrl", DEFAULT_GEMINI_BASE_URL);
                let model = context_string(ctx, "geminiModel", DEFAULT_GEMINI_MODEL);
                (
                    HttpRequest {
                        method: "POST".to_string(),
                        url: format!("{base}/models/{model}:generateContent"),
                        headers: vec![
                            ("content-type".to_string(), "application/json".to_string()),
                            ("x-goog-api-key".to_string(), key),
                        ],
                        body: Some(
                            json!({
                                "contents": [{ "parts": [{ "text": query }] }],
                                "tools": [{ "google_search": {} }],
                            })
                            .to_string(),
                        ),
                        timeout_ms: SEARCH_TIMEOUT_MS,
                        max_bytes: SEARCH_MAX_BYTES,
                        ignore_tls_errors: false,
                    },
                    parse_gemini,
                )
            }
        };

        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }

        let response = match (self.http)(request).await {
            Ok(response) => response,
            Err(error) => return Ok(fail(format!("{provider} search failed: {error}"))),
        };
        if response.status >= 400 {
            return Ok(fail(format!(
                "{provider} search failed with status {}: {}",
                response.status,
                bound_text(&response.body, 200)
            )));
        }

        let payload: Value = match serde_json::from_str(&response.body) {
            Ok(payload) => payload,
            Err(error) => {
                return Ok(fail(format!(
                    "{provider} search returned invalid JSON: {error}"
                )))
            }
        };

        let outcome = parse(&payload, limit);
        if outcome.results.is_empty() {
            return Ok(fail(format!(
                "{provider} search returned no results for {query}"
            )));
        }

        let count = outcome.results.len();
        let mut data = json!({
            "provider": provider,
            "query": query,
            "limit": limit,
            "results": outcome.results,
        });
        if let Some(answer) = outcome.answer
            && let Some(object) = data.as_object_mut() {
                object.insert("answer".into(), Value::String(bound_text(&answer, 4000)));
            }

        Ok(success(
            format!("Found {count} results for {query}"),
            data,
        ))
    }

    // -- browser.sandbox.start ---------------------------------------------

    /// `browser.sandbox.start` — start the sandboxed browser through the sandbox driver.
    pub async fn sandbox_start(&self, input: &Value, context: &C) -> Value {
        match self.sandbox_start_inner(input, context).await {
            Ok(value) => value,
            Err(error) => fail(error_text(&error)),
        }
    }

    async fn sandbox_start_inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let ctx = context.json();
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }
        let mut typed = ToolInput::new(input);
        let validation = match validate_tool_input(
            definition("browser.sandbox.start").expect("sandbox.start schema"),
            &mut typed,
        ) {
            Ok(result) => result,
            Err(err) => return Ok(fail(format!("Invalid input: {}", err.name))),
        };
        if !validation.valid {
            return Ok(validation_failure("browser.sandbox.start", &validation.errors));
        }
        if let Some(denial) = permission_denied("browser.sandbox.start", ctx) {
            return Ok(fail(denial));
        }

        let mount_mode = string_field(input, "mountMode").unwrap_or_else(|| "read-only".to_string());
        if !["none", "read-only", "read-write"].contains(&mount_mode.as_str()) {
            return Ok(fail(format!("Unsupported sandbox mount mode: {mount_mode}")));
        }

        let mut ports: Map<String, Value> = Map::new();
        for field in ["novncPort", "vncPort"] {
            if let Some(port) = u64_field(input, field) {
                if port == 0 || port > 65_535 {
                    return Ok(fail(format!(
                        "{field} must be between 1 and 65535 (got {port})"
                    )));
                }
                ports.insert(field.to_string(), Value::from(port));
            }
        }

        let project_root = string_field(ctx, "projectRoot").ok_or_else(|| {
            HostError::Error(
                "A project root is required to start the sandbox browser.".to_string(),
            )
        })?;

        let mut args = Map::new();
        args.insert("projectRoot".into(), Value::String(project_root.clone()));
        args.insert("mountMode".into(), Value::String(mount_mode.clone()));
        for (key, value) in ports {
            args.insert(key, value);
        }
        if let Some(session_id) = string_field(ctx, "sessionId") {
            args.insert("sessionId".into(), Value::String(session_id));
        }
        if let Some(user_id) = string_field(ctx, "userId") {
            args.insert("userId".into(), Value::String(user_id));
        }
        let args = Value::Object(args);

        let result = (self.sandbox)("sandbox.browser.start", vec![args.clone()], context).await?;
        let Some(result) = result else {
            return Ok(fail("The sandbox manager did not return a result."));
        };
        if let Some(failure) = driver_failure(&result) {
            return Ok(failure);
        }
        if cancelled(ctx) {
            return Ok(fail("Cancelled"));
        }

        let mut data = match present(result.get("data")).cloned().unwrap_or(Value::Null) {
            Value::Object(map) => map,
            _ => Map::new(),
        };
        data.entry("projectRoot".to_string())
            .or_insert(Value::String(project_root));
        data.entry("mountMode".to_string())
            .or_insert(Value::String(mount_mode));

        Ok(success("Sandbox browser started", Value::Object(data)))
    }

    // -- dispatch ----------------------------------------------------------

    /// True when this module owns `name`.
    pub fn handles(name: &str) -> bool {
        TOOL_NAMES.contains(&name)
    }

    /// Dispatch a tool call by name. Unknown names are an explicit error.
    pub async fn call(&self, name: &str, input: &Value, context: &C) -> Value {
        match name {
            "browser.navigate" => self.navigate(input, context).await,
            "browser.snapshot" => self.snapshot(input, context).await,
            "browser.inspect" => self.inspect(input, context).await,
            "browser.screenshot" => self.screenshot(input, context).await,
            "web.fetch" => self.web_fetch(input, context).await,
            "web.search" => self.web_search(input, context).await,
            "browser.sandbox.start" => self.sandbox_start(input, context).await,
            other => fail(format!("Unknown browser tool: {other}")),
        }
    }
}

fn context_string(context: &Value, key: &str, fallback: &str) -> String {
    string_field(context, key).unwrap_or_else(|| fallback.to_string())
}

fn chat_request(url: &str, key: &str, body: Value) -> HttpRequest {
    HttpRequest {
        method: "POST".to_string(),
        url: url.to_string(),
        headers: vec![
            ("content-type".to_string(), "application/json".to_string()),
            ("authorization".to_string(), format!("Bearer {key}")),
        ],
        body: Some(body.to_string()),
        timeout_ms: SEARCH_TIMEOUT_MS,
        max_bytes: SEARCH_MAX_BYTES,
        ignore_tls_errors: false,
    }
}

/// Percent-encode a query string component (RFC 3986 unreserved characters kept).
fn urlencode(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                output.push(*byte as char)
            }
            other => output.push_str(&format!("%{other:02X}")),
        }
    }
    output
}

/// Module-level dispatcher mirroring the `terminal_tools::call` convention.
///
/// The browser family needs an injected driver pair (`browser` + `sandbox`), so the
/// canonical entry point is [`BrowserTools::call`]; this shim lets the coordinator wire
/// the tools with a free function when the struct is already constructed.
pub async fn call<C>(tools: &BrowserTools<C>, name: &str, input: &Value, context: &C) -> Value
where
    C: CallContext + Send + Sync,
{
    tools.call(name, input, context).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    type Calls = Arc<AtomicUsize>;

    /// Browser driver fake: records the last method + args and replays `reply`.
    fn browser_port(reply: Value, calls: Calls) -> JaitPort<Value> {
        Arc::new(move |method: &str, args: Vec<Value>, _ctx: &Value| {
            calls.fetch_add(1, Ordering::SeqCst);
            let reply = reply.clone();
            let _ = method;
            let _ = args;
            Box::pin(async move { Ok(Some(reply)) })
        })
    }

    /// Transport fake that captures the requests it saw and replays a response.
    fn http_port(replies: Vec<HttpResponse>, seen: Arc<std::sync::Mutex<Vec<HttpRequest>>>) -> HttpPort {
        let port: HttpPort = Arc::new(move |request| {
            let replies = replies.clone();
            let seen = seen.clone();
            Box::pin(async move {
                let index = {
                    let mut guard = seen.lock().unwrap();
                    guard.push(request);
                    guard.len() - 1
                };
                Ok(replies
                    .get(index)
                    .or_else(|| replies.last())
                    .cloned()
                    .expect("at least one canned response"))
            })
        });
        port
    }

    fn tools(reply: Value) -> (BrowserTools<Value>, Calls) {
        let calls: Calls = Arc::new(AtomicUsize::new(0));
        let browser = browser_port(reply, calls.clone());
        let sandbox = browser_port(json!({ "ok": true, "data": {} }), calls.clone());
        (BrowserTools::new(browser, sandbox), calls)
    }

    fn snapshot_reply() -> Value {
        json!({
            "ok": true,
            "data": {
                "snapshot": {
                    "url": "https://example.com/final",
                    "title": "Example",
                    "text": "x".repeat(900),
                    "interactiveElements": (0..25).map(|i| json!({ "index": i })).collect::<Vec<_>>(),
                    "activeElement": "button#go",
                    "dialogs": [],
                    "obstruction": null
                }
            }
        })
    }

    #[test]
    fn metadata_covers_every_tool_with_a_schema() {
        let table = all_metadata();
        assert_eq!(table.len(), 7, "expected all seven ported tools");
        for name in TOOL_NAMES {
            let entry = metadata(name).unwrap_or_else(|| panic!("missing metadata for {name}"));
            assert_eq!(entry.get("name").and_then(Value::as_str), Some(name));
            assert!(!entry
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .is_empty());
            let schema = definition(name).expect("definition");
            assert_eq!(schema.get("type").and_then(Value::as_str), Some("object"));
            assert!(schema.get("properties").and_then(Value::as_object).is_some());
        }
        // `definition` must be the schema embedded in the metadata table.
        let stored = metadata("web.fetch").and_then(|entry| entry.get("parameters").cloned());
        assert_eq!(stored.as_ref(), definition("web.fetch"));
    }

    #[test]
    fn required_fields_match_the_ts_schemas() {
        for (name, _required) in [
            ("browser.navigate", "url"),
            ("web.fetch", "url"),
            ("web.search", "query"),
        ] {
            let schema = definition(name).expect("schema");
            let required = schema.get("required").and_then(Value::as_array).cloned().unwrap_or_default();
            assert!(
                required.iter().any(|field| field.as_str() == Some(required_field(name))),
                "{} must require {} ({:?})",
                name,
                required_field(name),
                required
            );
        }
    }

    fn required_field(name: &str) -> &'static str {
        match name {
            "browser.navigate" | "web.fetch" => "url",
            "web.search" => "query",
            _ => "",
        }
    }

    #[tokio::test]
    async fn unknown_tool_names_are_an_explicit_error() {
        let (tools, _) = tools(snapshot_reply());
        let result = tools.call("browser.teleport", &json!({}), &json!({})).await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(false));
        assert!(result
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("Unknown browser tool"));
    }

    #[tokio::test]
    async fn navigate_rejects_non_http_schemes() {
        let (tools, calls) = tools(snapshot_reply());
        let result = tools
            .navigate(&json!({ "url": "javascript:alert(1)" }), &json!({}))
            .await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(false));
        assert_eq!(calls.load(Ordering::SeqCst), 0, "driver must not be reached");
    }

    #[tokio::test]
    async fn navigate_blocks_private_hosts_by_default() {
        let (tools, calls) = tools(snapshot_reply());
        let result = tools
            .navigate(&json!({ "url": "http://127.0.0.1:8080/admin" }), &json!({}))
            .await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(false));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn navigate_honours_explicit_ssrf_policy() {
        let (tools, calls) = tools(snapshot_reply());
        let tools = tools.with_ssrf_policy(true, Vec::new());
        let result = tools
            .navigate(&json!({ "url": "http://127.0.0.1:8080/admin" }), &json!({}))
            .await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn navigate_shapes_and_bounds_the_snapshot() {
        let (tools, _) = tools(snapshot_reply());
        let result = tools
            .navigate(&json!({ "url": "https://example.com" }), &json!({ "sessionId": "abc" }))
            .await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            result.get("message").and_then(Value::as_str),
            Some("Navigated to https://example.com/final")
        );
        let data = result.get("data").expect("data");
        assert_eq!(data.get("browserId").and_then(Value::as_str), Some("browser-abc"));
        let text = data.get("textPreview").and_then(Value::as_str).unwrap_or_default();
        assert_eq!(text.chars().count(), TEXT_PREVIEW_LIMIT, "text is bounded");
        let elements = data
            .get("interactiveElements")
            .and_then(Value::as_array)
            .expect("elements");
        assert_eq!(elements.len(), INTERACTIVE_ELEMENT_LIMIT);
    }

    #[tokio::test]
    async fn secret_safe_context_suppresses_snapshot_text() {
        let (tools, _) = tools(snapshot_reply());
        let result = tools
            .snapshot(&json!({}), &json!({ "secretSafe": true }))
            .await;
        let message = result.get("message").and_then(Value::as_str).unwrap_or_default();
        assert!(message.contains("secret-safe"), "got: {message}");
        let data = result.get("data").expect("data");
        assert!(data.get("suppressionReason").and_then(Value::as_str).is_some());
        assert_eq!(data.get("textPreview").and_then(Value::as_str), Some(""));
    }

    #[tokio::test]
    async fn explicit_permission_denial_skips_the_driver() {
        let (tools, calls) = tools(snapshot_reply());
        let ctx = json!({ "permissions": { "denied": ["browser.snapshot", "web.fetch"] } });
        let snapshot = tools.snapshot(&json!({}), &ctx).await;
        assert_eq!(snapshot.get("ok").and_then(Value::as_bool), Some(false));
        assert!(snapshot
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("Permission denied"));

        let fetch_tools = tools.with_http(http_port(
            vec![HttpResponse::new(200, None, "hi".to_string())],
            Arc::new(std::sync::Mutex::new(Vec::new())),
        ));
        let fetch = fetch_tools.web_fetch(&json!({ "url": "https://example.com" }), &ctx).await;
        assert_eq!(fetch.get("ok").and_then(Value::as_bool), Some(false));
        assert_eq!(calls.load(Ordering::SeqCst), 0, "driver must not run when denied");
    }

    #[tokio::test]
    async fn driver_failures_pass_through_unchanged() {
        let failure = json!({ "ok": false, "message": "surface not a browser" });
        let (tools, _) = tools(failure.clone());
        let result = tools.inspect(&json!({ "selector": "#main" }), &json!({})).await;
        assert_eq!(result, failure);
    }

    #[tokio::test]
    async fn missing_driver_result_is_reported_not_swallowed() {
        let calls: Calls = Arc::new(AtomicUsize::new(0));
        let browser: JaitPort<Value> = Arc::new(|_m: &str, _a: Vec<Value>, _c: &Value| {
            Box::pin(async move { Ok(None) })
        });
        let sandbox: JaitPort<Value> = Arc::new(|_m: &str, _a: Vec<Value>, _c: &Value| {
            Box::pin(async move { Ok(None) })
        });
        let tools = BrowserTools::new(browser, sandbox);
        let result = tools.snapshot(&json!({}), &json!({})).await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(false));
        assert!(result
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("did not return a result"));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn navigate_stops_when_the_context_is_aborted() {
        let (tools, calls) = tools(snapshot_reply());
        let result = tools
            .navigate(&json!({ "url": "https://example.com" }), &json!({ "aborted": true }))
            .await;
        assert_eq!(result.get("message").and_then(Value::as_str), Some("Cancelled"));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn web_fetch_rejects_unsupported_methods() {
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let (tools, _) = tools(snapshot_reply());
        let tools = tools.with_http(http_port(
            vec![HttpResponse::new(200, None, "hi".to_string())],
            seen.clone(),
        ));
        let result = tools
            .web_fetch(&json!({ "url": "https://example.com", "method": "TRACE" }), &json!({}))
            .await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(false));
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn web_fetch_reports_truncated_bodies() {
        let mut response = HttpResponse::new(200, Some("text/plain".to_string()), "abc".to_string());
        response.truncated = true;
        let (tools, _) = tools(snapshot_reply());
        let tools = tools.with_http(http_port(vec![response], Arc::new(std::sync::Mutex::new(Vec::new()))));
        let result = tools.web_fetch(&json!({ "url": "https://example.com" }), &json!({})).await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(true));
        let data = result.get("data").expect("data");
        assert_eq!(data.get("truncated").and_then(Value::as_bool), Some(true));
        assert!(result
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("[truncated]"));
    }

    #[tokio::test]
    async fn web_fetch_follows_redirect_and_downgrades_post_to_get() {
        let mut redirect = HttpResponse::new(302, None, String::new());
        redirect.location = Some("/moved".to_string());
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let (tools, _) = tools(snapshot_reply());
        let tools = tools.with_http(http_port(
            vec![redirect, HttpResponse::new(200, None, "ok".to_string())],
            seen.clone(),
        ));
        let result = tools
            .web_fetch(&json!({ "url": "https://example.com/start", "method": "POST", "body": "a=1" }), &json!({}))
            .await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(true));
        let requests = seen.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].method, "POST");
        assert_eq!(requests[1].method, "GET", "302 on POST downgrades to GET");
        assert!(requests[1].body.is_none(), "body must be dropped after downgrade");
        assert_eq!(requests[1].url, "https://example.com/moved");
        let redirects = result
            .get("data")
            .and_then(|data| data.get("redirects"))
            .and_then(Value::as_array)
            .expect("redirects");
        assert_eq!(redirects.len(), 1);
    }

    #[tokio::test]
    async fn web_fetch_revalidates_every_redirect_hop() {
        let mut redirect = HttpResponse::new(301, None, String::new());
        redirect.location = Some("http://127.0.0.1:9000/secret".to_string());
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let (tools, _) = tools(snapshot_reply());
        let tools = tools.with_http(http_port(vec![redirect], seen.clone()));
        let result = tools
            .web_fetch(&json!({ "url": "https://example.com" }), &json!({}))
            .await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(false));
        assert!(result
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("Redirect blocked"));
        assert_eq!(seen.lock().unwrap().len(), 1, "second hop must never be requested");
    }

    #[tokio::test]
    async fn web_search_without_provider_credentials_fails_loudly() {
        let (tools, _) = tools(snapshot_reply());
        let result = tools.web_search(&json!({ "query": "rust" }), &json!({})).await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(false));
        assert!(result
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .contains("No web search provider"));
    }

    #[test]
    fn unknown_providers_fall_back_to_openai() {
        assert_eq!(resolve_requested_provider("altavista"), "openai");
        assert_eq!(resolve_requested_provider("openai"), "openai");
        assert_eq!(resolve_requested_provider("brave"), "brave");
        assert_eq!(resolve_requested_provider("KIMI".to_lowercase().as_str()), "kimi");
    }

    #[tokio::test]
    async fn web_search_unknown_provider_uses_openai_path() {
        let (tools, _) = tools(snapshot_reply());
        let result = tools
            .web_search(&json!({ "query": "rust", "provider": "altavista" }), &json!({}))
            .await;
        let message = result
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default();
        assert!(!message.contains("Unsupported web search provider"), "{message}");
        // With no keys configured the fallback surfaces the OpenAI provider.
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(false));
        assert!(message.to_lowercase().contains("openai"), "{message}");
    }

    #[tokio::test]
    async fn web_search_clamps_limit_and_parses_brave_results() {
        let results = (0..12)
            .map(|i| json!({ "title": format!("t{i}"), "url": format!("https://e{i}.example"), "description": "d" }))
            .collect::<Vec<_>>();
        let body = json!({ "web": { "results": results } }).to_string();
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let (tools, _) = tools(snapshot_reply());
        let tools = tools.with_http(http_port(
            vec![HttpResponse::new(200, Some("application/json".to_string()), body)],
            seen.clone(),
        ));
        let ctx = json!({ "apiKeys": { "brave": { "apiKey": "secret-token" } } });
        let result = tools
            .web_search(&json!({ "query": "rust async", "limit": 50 }), &ctx)
            .await;
        assert_eq!(result.get("ok").and_then(Value::as_bool), Some(true));
        let data = result.get("data").expect("data");
        assert_eq!(data.get("provider").and_then(Value::as_str), Some("brave"));
        assert_eq!(data.get("limit").and_then(Value::as_u64), Some(MAX_SEARCH_LIMIT));
        assert_eq!(
            data.get("results").and_then(Value::as_array).map(Vec::len),
            Some(MAX_SEARCH_LIMIT as usize)
        );
        // The credential is sent on the wire but must never leak into the result.
        let requests = seen.lock().unwrap();
        assert!(requests[0].url.contains("q=rust%20async"));
        assert!(!result.to_string().contains("secret-token"));
    }

    #[tokio::test]
    async fn sandbox_start_validates_and_forwards_ports() {
        let calls: Calls = Arc::new(AtomicUsize::new(0));
        let seen: Arc<std::sync::Mutex<Vec<Value>>> = Arc::new(std::sync::Mutex::new(Vec::new()));
        let recorder = seen.clone();
        let browser: JaitPort<Value> = Arc::new(|_m: &str, _a: Vec<Value>, _c: &Value| {
            Box::pin(async move { Ok(None) })
        });
        let sandbox: JaitPort<Value> = {
            let calls = calls.clone();
            Arc::new(move |method: &str, args: Vec<Value>, _c: &Value| {
                calls.fetch_add(1, Ordering::SeqCst);
                let captured = args.first().cloned().unwrap_or(Value::Null);
                recorder.lock().unwrap().push(captured);
                let method = method.to_string();
                Box::pin(async move {
                    Ok(Some(json!({ "ok": true, "data": { "novncUrl": "http://localhost:6080", "method": method } })))
                })
            })
        };
        let tools = BrowserTools::new(browser, sandbox);

        let bad = tools
            .sandbox_start(&json!({ "mountMode": "rw" }), &json!({ "projectRoot": "/tmp/p" }))
            .await;
        assert_eq!(bad.get("ok").and_then(Value::as_bool), Some(false));
        assert_eq!(calls.load(Ordering::SeqCst), 0, "invalid input must not reach the sandbox");

        let bad_port = tools
            .sandbox_start(&json!({ "vncPort": 70000 }), &json!({ "projectRoot": "/tmp/p" }))
            .await;
        assert_eq!(bad_port.get("ok").and_then(Value::as_bool), Some(false));

        let no_root = tools.sandbox_start(&json!({}), &json!({})).await;
        assert_eq!(no_root.get("ok").and_then(Value::as_bool), Some(false));

        let ok = tools
            .sandbox_start(
                &json!({ "novncPort": 6080, "mountMode": "read-write" }),
                &json!({ "projectRoot": "/tmp/p" }),
            )
            .await;
        assert_eq!(ok.get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            ok.get("message").and_then(Value::as_str),
            Some("Sandbox browser started")
        );
        let data = ok.get("data").expect("data");
        assert_eq!(data.get("novncUrl").and_then(Value::as_str), Some("http://localhost:6080"));
        assert_eq!(data.get("mountMode").and_then(Value::as_str), Some("read-write"));
        assert_eq!(data.get("projectRoot").and_then(Value::as_str), Some("/tmp/p"));

        let forwarded = seen.lock().unwrap();
        assert_eq!(forwarded.len(), 1);
        assert_eq!(forwarded[0].get("novncPort").and_then(Value::as_u64), Some(6080));
        assert_eq!(forwarded[0].get("mountMode").and_then(Value::as_str), Some("read-write"));
    }
}
