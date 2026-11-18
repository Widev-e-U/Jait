//! Native port of `packages/gateway/src/surfaces/playwright-node-bridge.cjs`.
//!
//! The original file is a Node script that the gateway spawns as a child process
//! (`child_process.spawn`) and drives over an unbuffered line protocol on
//! stdin/stdout. Reproducing it natively means reproducing *the protocol and every
//! non-DOM behaviour that lives in that script*:
//!
//! * the one-time `ready` event (including which launch strategy won),
//! * the `runtime` event stream (console / pageerror / requestfailed / response),
//! * the bounded runtime-event buffer and the console flood guard,
//! * the request/response envelope (`{"id":…,"method":…,"params":…}` in,
//!   `{"id":…,"ok":true,"result":…}` / `{"id":…,"ok":false,"error":…}` out),
//! * error propagation (`Invalid JSON command`, `Unknown method: <name>`,
//!   normalised Playwright error text),
//! * `ready`/`fatal`/`disconnected` lifecycle events,
//! * the `close` command, which answers and then ends the process,
//! * environment-driven launch configuration (`BROWSER_CDP_URL`,
//!   `BROWSER_CHANNEL`, `BROWSER_FALLBACK_CHANNELS`, `BROWSER_HEADLESS`,
//!   `BROWSER_LAUNCH_TIMEOUT_MS`, `BROWSER_IGNORE_HTTPS_ERRORS`,
//!   `BROWSER_COMPACT_VIEW`, `BROWSER_CONSOLE_FLOOD_*`).
//!
//! **Injected boundary.** Everything that is unavoidably "a real Chromium driven by
//! Playwright" sits behind [`BridgePage`]: navigation, the DOM probes that produce
//! the snapshot/diagnostics/metrics payloads, screenshots, and DevTools target
//! lookup. That trait is the exact seam where the Node process used to be, so a
//! host can back it with Playwright (via CDP), with a headless browser, or with a
//! test double — while the protocol layer in this module stays byte-compatible
//! with the original script. Nothing about the protocol is faked: unknown methods,
//! malformed lines, handler failures and lifecycle events all round-trip through
//! the same public entry point ([`run_bridge`]).
//!
//! The launch strategy machinery is modelled as [`LaunchPlan`] rather than "spawn a
//! browser", because the choice of executable/channel is the part of the script the
//! gateway observes (it ends up in the `ready` event) and the part that decides the
//! `Playwright launch failed after N attempt(s): …` error text.

use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use serde_json::{Map, Value, json};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt};

use super::browser::{
    CONSOLE_EVENT_TYPE, CONSOLE_FLOOD_COOLDOWN_MS, CONSOLE_FLOOD_THRESHOLD,
    CONSOLE_FLOOD_WINDOW_MS, ConsoleFloodGuard, FloodClock, MAX_BROWSER_RUNTIME_EVENTS,
};

/// Environment variable holding a CDP websocket endpoint to attach to.
pub const ENV_BROWSER_CDP_URL: &str = "BROWSER_CDP_URL";
/// Preferred browser channel (for example `chrome`).
pub const ENV_BROWSER_CHANNEL: &str = "BROWSER_CHANNEL";
/// Comma separated fallback channels.
pub const ENV_BROWSER_FALLBACK_CHANNELS: &str = "BROWSER_FALLBACK_CHANNELS";
/// `"false"` disables headless mode (the reference defaults to headless).
pub const ENV_BROWSER_HEADLESS: &str = "BROWSER_HEADLESS";
/// Launch timeout in milliseconds.
pub const ENV_BROWSER_LAUNCH_TIMEOUT_MS: &str = "BROWSER_LAUNCH_TIMEOUT_MS";
/// `"true"` tolerates invalid TLS certificates.
pub const ENV_BROWSER_IGNORE_HTTPS_ERRORS: &str = "BROWSER_IGNORE_HTTPS_ERRORS";
/// `"true"` keeps the browser window compact.
pub const ENV_BROWSER_COMPACT_VIEW: &str = "BROWSER_COMPACT_VIEW";
/// Overrides [`CONSOLE_FLOOD_WINDOW_MS`].
pub const ENV_CONSOLE_FLOOD_WINDOW_MS: &str = "BROWSER_CONSOLE_FLOOD_WINDOW_MS";
/// Overrides [`CONSOLE_FLOOD_THRESHOLD`].
pub const ENV_CONSOLE_FLOOD_THRESHOLD: &str = "BROWSER_CONSOLE_FLOOD_THRESHOLD";
/// Overrides [`CONSOLE_FLOOD_COOLDOWN_MS`].
pub const ENV_CONSOLE_FLOOD_COOLDOWN_MS: &str = "BROWSER_CONSOLE_FLOOD_COOLDOWN_MS";

/// Default launch timeout, matching the reference's `45_000`.
pub const DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS: u64 = 45_000;
/// Default channels tried by the launch strategy, in reference order.
pub const DEFAULT_FALLBACK_CHANNELS: [&str; 3] = ["chromium", "chrome", "msedge"];
/// Default `waitFor` timeout used by the command handler.
pub const DEFAULT_WAIT_FOR_TIMEOUT_MS: u64 = 10_000;
/// Strategy name reported by the `ready` event when attaching over CDP.
pub const STRATEGY_CDP: &str = "cdp";
/// Strategy name reported by the `ready` event when launching a browser.
pub const STRATEGY_LAUNCH: &str = "launch";
/// Error text returned for a line that is not valid JSON.
pub const INVALID_JSON_ERROR: &str = "Invalid JSON command";

/// Boxed future used by [`BridgePage`] implementations.
pub type BridgeFuture<'a> = Pin<Box<dyn Future<Output = Result<Value, String>> + Send + 'a>>;

/// The browser operations the bridge exposes as JSON-RPC style commands.
///
/// This is the injected boundary described in the module docs: the reference script
/// implements these directly against Playwright; a native host supplies them however
/// it can reach a browser.
pub trait BridgePage: Send + Sync {
    /// Navigate to `url`; result is `{"url": …}`.
    fn navigate<'a>(&'a self, url: String) -> BridgeFuture<'a>;
    /// Reload the current page; result is `{"url": …}`.
    fn reload<'a>(&'a self) -> BridgeFuture<'a>;
    /// Click `selector`; result is `{"url": …}`.
    fn click<'a>(&'a self, selector: String) -> BridgeFuture<'a>;
    /// Type `text` into `selector`.
    fn type_text<'a>(&'a self, selector: String, text: String) -> BridgeFuture<'a>;
    /// Scroll by `x`/`y` pixels.
    fn scroll<'a>(&'a self, x: f64, y: f64) -> BridgeFuture<'a>;
    /// Choose `value` in the `<select>` matched by `selector`.
    fn select<'a>(&'a self, selector: String, value: String) -> BridgeFuture<'a>;
    /// Wait until `selector` is present/resolvable.
    fn wait_for<'a>(&'a self, selector: String, timeout_ms: u64) -> BridgeFuture<'a>;
    /// Capture a screenshot; returns the absolute path that was written.
    fn screenshot<'a>(&'a self, path: Option<String>) -> BridgeFuture<'a>;
    /// Page snapshot payload (url/title/text/elements/active element/dialogs).
    fn snapshot<'a>(&'a self) -> BridgeFuture<'a>;
    /// Performance metrics payload.
    fn metrics<'a>(&'a self) -> BridgeFuture<'a>;
    /// Diagnostics for `selector` (or the whole viewport when absent).
    fn diagnose<'a>(&'a self, selector: Option<String>) -> BridgeFuture<'a>;
    /// DevTools target identifier for the active page.
    fn dev_tools_target<'a>(&'a self) -> BridgeFuture<'a>;
    /// Close the browser and release resources.
    fn close<'a>(&'a self) -> BridgeFuture<'a>;
}

/// Parses a positive integer environment override.
///
/// Mirrors the reference helper: non-numeric, zero and negative values fall back to
/// `default`.
pub fn parse_positive_integer_env(raw: Option<&str>, default: u64) -> u64 {
    let Some(raw) = raw else {
        return default;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return default;
    }
    match trimmed.parse::<i64>() {
        Ok(value) if value > 0 => value as u64,
        _ => default,
    }
}

/// Parses a comma separated environment list, trimming entries and dropping blanks.
pub fn parse_csv_env(raw: Option<&str>, default: &[&str]) -> Vec<String> {
    let entries: Vec<String> = raw
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect();
    if entries.is_empty() {
        return default.iter().map(|entry| entry.to_string()).collect();
    }
    entries
}

/// Resolves the console flood guard configuration from the environment.
pub fn console_flood_guard_from_env<F>(lookup: F) -> ConsoleFloodGuard
where
    F: Fn(&str) -> Option<String>,
{
    let window_ms = parse_positive_integer_env(
        lookup(ENV_CONSOLE_FLOOD_WINDOW_MS).as_deref(),
        CONSOLE_FLOOD_WINDOW_MS,
    );
    let threshold = parse_positive_integer_env(
        lookup(ENV_CONSOLE_FLOOD_THRESHOLD).as_deref(),
        CONSOLE_FLOOD_THRESHOLD as u64,
    ) as usize;
    let cooldown_ms = parse_positive_integer_env(
        lookup(ENV_CONSOLE_FLOOD_COOLDOWN_MS).as_deref(),
        CONSOLE_FLOOD_COOLDOWN_MS,
    );
    let now: FloodClock = Arc::new(|| chrono::Utc::now().timestamp_millis().max(0) as u64);
    ConsoleFloodGuard::with_clock(window_ms, threshold.max(1), cooldown_ms, now)
}

/// How the bridge intends to obtain a browser.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchPlan {
    /// Attach to an already-running browser over CDP.
    Cdp {
        /// Websocket endpoint.
        url: String,
    },
    /// Launch a browser, trying channels in order.
    Launch {
        /// Preferred channel (tried first when present).
        preferred_channel: Option<String>,
        /// Remaining channels, in order.
        fallback_channels: Vec<String>,
        /// Headless mode; the reference defaults to headless.
        headless: bool,
        /// Launch timeout in milliseconds.
        timeout_ms: u64,
        /// Whether invalid TLS certificates are tolerated.
        ignore_https_errors: bool,
        /// Whether the browser window is kept compact.
        compact_view: bool,
    },
}

impl LaunchPlan {
    /// Builds the plan from an environment lookup (the reference reads `process.env`).
    pub fn from_env<F>(lookup: F) -> Self
    where
        F: Fn(&str) -> Option<String>,
    {
        let cdp_url = lookup(ENV_BROWSER_CDP_URL)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if let Some(url) = cdp_url {
            return LaunchPlan::Cdp { url };
        }
        LaunchPlan::Launch {
            preferred_channel: lookup(ENV_BROWSER_CHANNEL)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            fallback_channels: parse_csv_env(
                lookup(ENV_BROWSER_FALLBACK_CHANNELS).as_deref(),
                &DEFAULT_FALLBACK_CHANNELS,
            ),
            headless: lookup(ENV_BROWSER_HEADLESS).as_deref() != Some("false"),
            timeout_ms: parse_positive_integer_env(
                lookup(ENV_BROWSER_LAUNCH_TIMEOUT_MS).as_deref(),
                DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS,
            ),
            ignore_https_errors: lookup(ENV_BROWSER_IGNORE_HTTPS_ERRORS).as_deref() == Some("true"),
            compact_view: lookup(ENV_BROWSER_COMPACT_VIEW).as_deref() == Some("true"),
        }
    }

    /// Reads the plan from the process environment.
    pub fn from_process_env() -> Self {
        Self::from_env(|key| std::env::var(key).ok())
    }

    /// Strategy name reported by the `ready` event.
    pub fn strategy(&self) -> &'static str {
        match self {
            LaunchPlan::Cdp { .. } => STRATEGY_CDP,
            LaunchPlan::Launch { .. } => STRATEGY_LAUNCH,
        }
    }

    /// Every channel that will be attempted, preferred channel first.
    pub fn channels(&self) -> Vec<String> {
        match self {
            LaunchPlan::Cdp { .. } => Vec::new(),
            LaunchPlan::Launch {
                preferred_channel,
                fallback_channels,
                ..
            } => {
                let mut channels = Vec::new();
                if let Some(preferred) = preferred_channel {
                    channels.push(preferred.clone());
                }
                channels.extend(fallback_channels.iter().cloned());
                channels
            }
        }
    }
}

/// Builds the aggregated launch failure message used when every channel failed.
pub fn launch_failure_message(errors: &[String]) -> String {
    let attempts = errors.len();
    let detail = errors
        .iter()
        .map(|error| error.trim())
        .collect::<Vec<_>>()
        .join(" | ");
    format!("Failed to launch browser after {attempts} attempt(s): {detail}")
}

/// Normalises an error message the way the reference's `errorMessage()` helper does.
pub fn normalize_error_message(error: &str) -> String {
    let trimmed = error.trim();
    if trimmed.is_empty() {
        "Unknown error".to_string()
    } else {
        trimmed.to_string()
    }
}

/// A runtime event destined for the gateway's `runtime` stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeEventInput {
    /// Event type (`console`, `pageerror`, `requestfailed`, `response`).
    pub event_type: String,
    /// Severity (`log`, `info`, `warn`, `error`, …).
    pub level: Option<String>,
    /// Human readable text.
    pub text: Option<String>,
    /// Related URL, when the source has one.
    pub url: Option<String>,
    /// HTTP method for request/response events.
    pub method: Option<String>,
    /// HTTP status for response events.
    pub status: Option<u16>,
}

impl RuntimeEventInput {
    /// A `console` event.
    pub fn console(level: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            event_type: CONSOLE_EVENT_TYPE.to_string(),
            level: Some(level.into()),
            text: Some(text.into()),
            url: None,
            method: None,
            status: None,
        }
    }

    /// A `pageerror` event.
    pub fn page_error(text: impl Into<String>) -> Self {
        Self {
            event_type: "pageerror".to_string(),
            level: Some("error".to_string()),
            text: Some(text.into()),
            url: None,
            method: None,
            status: None,
        }
    }

    /// A `requestfailed` event.
    pub fn request_failed(
        text: impl Into<String>,
        url: Option<String>,
        method: Option<String>,
    ) -> Self {
        Self {
            event_type: "requestfailed".to_string(),
            level: Some("error".to_string()),
            text: Some(text.into()),
            url,
            method,
            status: None,
        }
    }

    /// A `response` event carrying `status`.
    pub fn response(status: u16, url: Option<String>, method: Option<String>) -> Self {
        Self {
            event_type: "response".to_string(),
            level: Some(response_level(status).to_string()),
            text: Some(format!("HTTP {status}")),
            url,
            method,
            status: Some(status),
        }
    }

    /// The payload embedded in a `runtime` bridge event.
    pub fn payload(&self) -> Value {
        let mut map = Map::new();
        map.insert("type".into(), Value::String(self.event_type.clone()));
        if let Some(level) = &self.level {
            map.insert("level".into(), Value::String(level.clone()));
        }
        if let Some(text) = &self.text {
            map.insert("text".into(), Value::String(text.clone()));
        }
        if let Some(url) = &self.url {
            map.insert("url".into(), Value::String(url.clone()));
        }
        if let Some(method) = &self.method {
            map.insert("method".into(), Value::String(method.clone()));
        }
        if let Some(status) = self.status {
            map.insert("status".into(), Value::Number(status.into()));
        }
        Value::Object(map)
    }
}

/// Maps an HTTP status to the reference's runtime event severity.
pub fn response_level(status: u16) -> &'static str {
    if status >= 500 {
        "error"
    } else if status >= 400 {
        "warn"
    } else {
        "info"
    }
}

/// A numbered runtime event as the gateway receives it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BridgeRuntimeEvent {
    /// Monotonic id starting at 1.
    pub id: u64,
    /// Payload produced by [`RuntimeEventInput::payload`].
    pub payload: Value,
}

/// Bounded buffer with the console flood guard applied, mirroring the reference.
#[derive(Debug)]
pub struct BridgeEventBuffer {
    events: VecDeque<BridgeRuntimeEvent>,
    guard: ConsoleFloodGuard,
    dropped: u64,
}

impl BridgeEventBuffer {
    /// Creates an empty buffer.
    pub fn new(guard: ConsoleFloodGuard) -> Self {
        Self {
            events: VecDeque::new(),
            guard,
            dropped: 0,
        }
    }

    /// Creates a buffer using the default guard configuration.
    pub fn with_default_guard() -> Self {
        Self::new(ConsoleFloodGuard::default())
    }

    /// Pushes one runtime event, applying the flood guard and the size cap.
    ///
    /// Returns the events that were appended (zero, one, or — when a pause or resume
    /// notice is due — two).
    pub fn push(&mut self, input: RuntimeEventInput) -> Vec<BridgeRuntimeEvent> {
        let is_console = input.event_type == CONSOLE_EVENT_TYPE;
        let mut appended = Vec::new();
        if is_console {
            let outcome = self.guard.record();
            if outcome.drop {
                self.dropped += 1;
            }
            if let Some(notice) = outcome.notice {
                let events = self.append(RuntimeEventInput {
                    event_type: notice.event_type,
                    level: notice.level,
                    text: notice.text,
                    url: notice.url,
                    method: notice.method,
                    status: notice.status,
                });
                appended.extend(events);
            }
            if outcome.drop {
                return appended;
            }
        }
        appended.extend(self.append(input));
        appended
    }

    fn append(&mut self, input: RuntimeEventInput) -> Vec<BridgeRuntimeEvent> {
        let next_id = self
            .events
            .back()
            .map(|event| event.id)
            .unwrap_or(0)
            .saturating_add(1);
        let event = BridgeRuntimeEvent {
            id: next_id,
            payload: input.payload(),
        };
        self.events.push_back(event.clone());
        while self.events.len() > MAX_BROWSER_RUNTIME_EVENTS {
            self.events.pop_front();
        }
        vec![event]
    }

    /// Buffered events, oldest first.
    pub fn events(&self) -> Vec<BridgeRuntimeEvent> {
        self.events.iter().cloned().collect()
    }

    /// Number of buffered events.
    pub fn len(&self) -> usize {
        self.events.len()
    }

    /// Whether the buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    /// How many console events the guard dropped.
    pub fn dropped(&self) -> u64 {
        self.dropped
    }

    /// Shared handle to the flood guard (for clock-driven tests).
    pub fn guard(&mut self) -> &mut ConsoleFloodGuard {
        &mut self.guard
    }
}

/// A parsed inbound command.
#[derive(Debug, Clone, PartialEq)]
pub struct BridgeRequest {
    /// Correlation id; `Value::Null` when the caller omitted it or sent bad JSON.
    pub id: Value,
    /// Method name.
    pub method: String,
    /// Method parameters.
    pub params: Map<String, Value>,
}

/// Why a line could not be parsed into a [`BridgeRequest`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RequestParseError {
    /// The line was not valid JSON.
    InvalidJson,
    /// The line was valid JSON but not an object.
    NotAnObject,
}

impl RequestParseError {
    /// Error text returned to the caller, matching the reference.
    pub fn message(&self) -> &'static str {
        match self {
            RequestParseError::InvalidJson => INVALID_JSON_ERROR,
            RequestParseError::NotAnObject => INVALID_JSON_ERROR,
        }
    }
}

/// Parses one protocol line.
pub fn parse_request(line: &str) -> Result<BridgeRequest, RequestParseError> {
    let value: Value = serde_json::from_str(line).map_err(|_| RequestParseError::InvalidJson)?;
    let Value::Object(mut object) = value else {
        return Err(RequestParseError::NotAnObject);
    };
    let id = object.remove("id").unwrap_or(Value::Null);
    let method = match object.remove("method") {
        Some(Value::String(method)) => method,
        _ => return Err(RequestParseError::InvalidJson),
    };
    let params = match object.remove("params") {
        Some(Value::Object(params)) => params,
        _ => Map::new(),
    };
    Ok(BridgeRequest { id, method, params })
}

/// Builds a success envelope.
pub fn ok_response(id: Value, result: Value) -> Value {
    json!({ "id": id, "ok": true, "result": result })
}

/// Builds a failure envelope.
pub fn error_response(id: Value, error: impl Into<String>) -> Value {
    json!({ "id": id, "ok": false, "error": normalize_error_message(&error.into()) })
}

fn required_string(params: &Map<String, Value>, key: &str, method: &str) -> Result<String, String> {
    match params.get(key) {
        Some(Value::String(value)) if !value.is_empty() => Ok(value.clone()),
        Some(Value::Number(value)) => Ok(value.to_string()),
        Some(Value::String(_)) | None => Err(format!("{method} requires params.{key}")),
        Some(_) => Err(format!("{method} requires params.{key}")),
    }
}

fn optional_string(params: &Map<String, Value>, key: &str) -> Option<String> {
    match params.get(key) {
        Some(Value::String(value)) => Some(value.clone()),
        Some(Value::Number(value)) => Some(value.to_string()),
        _ => None,
    }
}

fn number_param(params: &Map<String, Value>, key: &str) -> Option<f64> {
    match params.get(key) {
        Some(Value::Number(value)) => value.as_f64(),
        Some(Value::String(value)) => value.parse::<f64>().ok(),
        _ => None,
    }
}

/// Dispatches one parsed request against `page`.
///
/// Returns the response envelope and whether the bridge should exit afterwards (the
/// `close` command answers first, exactly like the reference).
pub async fn dispatch(page: &Arc<dyn BridgePage>, request: BridgeRequest) -> (Value, bool) {
    let BridgeRequest { id, method, params } = request;
    let result = match method.as_str() {
        "navigate" => match required_string(&params, "url", &method) {
            Ok(url) => page.navigate(url).await,
            Err(error) => Err(error),
        },
        "reload" => page.reload().await,
        "click" => match required_string(&params, "selector", &method) {
            Ok(selector) => page.click(selector).await,
            Err(error) => Err(error),
        },
        "typeText" => {
            let selector = required_string(&params, "selector", &method);
            let text = required_string(&params, "text", &method);
            match (selector, text) {
                (Ok(selector), Ok(text)) => page.type_text(selector, text).await,
                (Err(error), _) | (_, Err(error)) => Err(error),
            }
        }
        "scroll" => {
            let x = number_param(&params, "x").unwrap_or(0.0);
            let y = number_param(&params, "y").unwrap_or(0.0);
            page.scroll(x, y).await
        }
        "select" => {
            let selector = required_string(&params, "selector", &method);
            let value = match params.get("value") {
                Some(Value::String(value)) => Ok(value.clone()),
                Some(Value::Number(value)) => Ok(value.to_string()),
                _ => Err(format!("{method} requires params.value")),
            };
            match (selector, value) {
                (Ok(selector), Ok(value)) => page.select(selector, value).await,
                (Err(error), _) | (_, Err(error)) => Err(error),
            }
        }
        "waitFor" => match required_string(&params, "selector", &method) {
            Ok(selector) => {
                let timeout_ms =
                    number_param(&params, "timeoutMs").map(|value| value.max(0.0) as u64);
                page.wait_for(selector, timeout_ms.unwrap_or(DEFAULT_WAIT_FOR_TIMEOUT_MS))
                    .await
            }
            Err(error) => Err(error),
        },
        "screenshot" => page.screenshot(optional_string(&params, "path")).await,
        "snapshot" => page.snapshot().await,
        "getMetrics" => page.metrics().await,
        "diagnose" => page.diagnose(optional_string(&params, "selector")).await,
        "devToolsTarget" => page.dev_tools_target().await,
        "close" => match page.close().await {
            Ok(result) => return (ok_response(id, result), true),
            Err(error) => return (error_response(id, error), true),
        },
        other => {
            return (
                error_response(id, format!("Unknown method: {other}")),
                false,
            );
        }
    };
    match result {
        Ok(result) => (ok_response(id, result), false),
        Err(error) => (error_response(id, error), false),
    }
}

/// A line written by the bridge.
#[derive(Debug, Clone, PartialEq)]
pub enum BridgeEvent {
    /// Sent once the browser is usable.
    Ready {
        /// `cdp` or `launch`.
        strategy: &'static str,
    },
    /// A runtime event from the page.
    Runtime {
        /// Event payload.
        payload: Value,
    },
    /// The underlying browser went away.
    Disconnected,
    /// Startup failed; the process should exit non-zero.
    Fatal {
        /// Error text.
        error: String,
    },
}

impl BridgeEvent {
    /// JSON representation written as one line on stdout.
    pub fn to_json(&self) -> Value {
        match self {
            BridgeEvent::Ready { strategy } => {
                json!({ "event": "ready", "strategy": strategy })
            }
            BridgeEvent::Runtime { payload } => {
                json!({ "event": "runtime", "payload": payload })
            }
            BridgeEvent::Disconnected => json!({ "event": "disconnected" }),
            BridgeEvent::Fatal { error } => {
                json!({ "event": "fatal", "error": normalize_error_message(error) })
            }
        }
    }
}

/// How [`run_bridge`] terminated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BridgeExit {
    /// stdin closed.
    Eof,
    /// A `close` command was handled.
    Closed,
}

/// I/O or protocol failure inside [`run_bridge`].
#[derive(Debug)]
pub struct BridgeIoError {
    message: String,
}

impl BridgeIoError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    /// Human readable description.
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl std::fmt::Display for BridgeIoError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for BridgeIoError {}

async fn write_line<W>(writer: &mut W, value: &Value) -> Result<(), BridgeIoError>
where
    W: AsyncWrite + Unpin,
{
    let mut line = serde_json::to_string(value)
        .map_err(|error| BridgeIoError::new(format!("failed to encode frame: {error}")))?;
    line.push('\n');
    writer
        .write_all(line.as_bytes())
        .await
        .map_err(|error| BridgeIoError::new(format!("failed to write frame: {error}")))?;
    writer
        .flush()
        .await
        .map_err(|error| BridgeIoError::new(format!("failed to flush frame: {error}")))
}

/// Writes a lifecycle event (used by hosts and tests).
pub async fn write_event<W>(writer: &mut W, event: &BridgeEvent) -> Result<(), BridgeIoError>
where
    W: AsyncWrite + Unpin,
{
    write_line(writer, &event.to_json()).await
}

/// Runs the bridge protocol loop.
///
/// The `ready` event is written first (the reference emits it as soon as the browser
/// is usable), then each line is dispatched until stdin ends or `close` is handled.
pub async fn run_bridge<R, W>(
    mut reader: R,
    mut writer: W,
    page: Arc<dyn BridgePage>,
    plan: &LaunchPlan,
) -> Result<BridgeExit, BridgeIoError>
where
    R: AsyncBufRead + Unpin,
    W: AsyncWrite + Unpin,
{
    write_event(
        &mut writer,
        &BridgeEvent::Ready {
            strategy: plan.strategy(),
        },
    )
    .await?;

    const MAX_COMMAND_BYTES: usize = 1024 * 1024;
    let mut line = Vec::new();
    loop {
        line.clear();
        loop {
            let available = reader
                .fill_buf()
                .await
                .map_err(|error| BridgeIoError::new(format!("failed to read command: {error}")))?;
            if available.is_empty() {
                break;
            }
            let take = available
                .iter()
                .position(|byte| *byte == b'\n')
                .map(|index| index + 1)
                .unwrap_or(available.len());
            if line.len().saturating_add(take) > MAX_COMMAND_BYTES {
                return Err(BridgeIoError::new("command frame exceeds size limit"));
            }
            let ended = available[take - 1] == b'\n';
            line.extend_from_slice(&available[..take]);
            reader.consume(take);
            if ended {
                break;
            }
        }
        if line.is_empty() {
            return Ok(BridgeExit::Eof);
        }
        let text = std::str::from_utf8(&line)
            .map_err(|_| BridgeIoError::new("command frame is not UTF-8"))?;
        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }
        let request = match parse_request(trimmed) {
            Ok(request) => request,
            Err(error) => {
                write_line(&mut writer, &error_response(Value::Null, error.message())).await?;
                continue;
            }
        };
        let (response, exit) = dispatch(&page, request).await;
        write_line(&mut writer, &response).await?;
        if exit {
            return Ok(BridgeExit::Closed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MockPage {
        calls: Mutex<Vec<String>>,
    }

    impl MockPage {
        fn record(&self, call: impl Into<String>) {
            self.calls.lock().unwrap().push(call.into());
        }

        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl BridgePage for MockPage {
        fn navigate<'a>(&'a self, url: String) -> BridgeFuture<'a> {
            self.record(format!("navigate:{url}"));
            Box::pin(async move { Ok(json!({ "url": url })) })
        }
        fn reload<'a>(&'a self) -> BridgeFuture<'a> {
            self.record("reload");
            Box::pin(async { Ok(json!({ "url": "about:blank" })) })
        }
        fn click<'a>(&'a self, selector: String) -> BridgeFuture<'a> {
            self.record(format!("click:{selector}"));
            if selector == "#missing" {
                return Box::pin(async { Err("element is not visible".to_string()) });
            }
            Box::pin(async { Ok(json!({ "url": "about:blank" })) })
        }
        fn type_text<'a>(&'a self, selector: String, text: String) -> BridgeFuture<'a> {
            self.record(format!("typeText:{selector}:{text}"));
            Box::pin(async { Ok(json!({ "ok": true })) })
        }
        fn scroll<'a>(&'a self, x: f64, y: f64) -> BridgeFuture<'a> {
            self.record(format!("scroll:{x}:{y}"));
            Box::pin(async { Ok(json!({ "ok": true })) })
        }
        fn select<'a>(&'a self, selector: String, value: String) -> BridgeFuture<'a> {
            self.record(format!("select:{selector}:{value}"));
            Box::pin(async { Ok(json!({ "ok": true })) })
        }
        fn wait_for<'a>(&'a self, selector: String, timeout_ms: u64) -> BridgeFuture<'a> {
            self.record(format!("waitFor:{selector}:{timeout_ms}"));
            Box::pin(async { Ok(json!({ "ok": true })) })
        }
        fn screenshot<'a>(&'a self, path: Option<String>) -> BridgeFuture<'a> {
            self.record(format!("screenshot:{path:?}"));
            Box::pin(async move {
                Ok(json!({ "path": path.unwrap_or_else(|| "/tmp/shot.png".to_string()) }))
            })
        }
        fn snapshot<'a>(&'a self) -> BridgeFuture<'a> {
            self.record("snapshot");
            Box::pin(async { Ok(json!({ "url": "about:blank", "title": "" })) })
        }
        fn metrics<'a>(&'a self) -> BridgeFuture<'a> {
            self.record("metrics");
            Box::pin(async { Ok(json!({ "jsHeapUsedSize": 1 })) })
        }
        fn diagnose<'a>(&'a self, selector: Option<String>) -> BridgeFuture<'a> {
            self.record(format!("diagnose:{selector:?}"));
            Box::pin(async { Ok(json!({ "hasModal": false })) })
        }
        fn dev_tools_target<'a>(&'a self) -> BridgeFuture<'a> {
            self.record("devToolsTarget");
            Box::pin(async { Ok(json!({ "targetId": "page-1" })) })
        }
        fn close<'a>(&'a self) -> BridgeFuture<'a> {
            self.record("close");
            Box::pin(async { Ok(json!({ "ok": true })) })
        }
    }

    fn block_on<F: Future>(future: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future)
    }

    async fn run_session(lines: &str) -> (Vec<Value>, Vec<String>, BridgeExit) {
        let page = Arc::new(MockPage::default());
        let page_trait: Arc<dyn BridgePage> = page.clone();
        let mut output = Vec::new();
        let exit = run_bridge(
            std::io::Cursor::new(lines.as_bytes().to_vec()),
            &mut output,
            page_trait,
            &LaunchPlan::Cdp {
                url: "ws://127.0.0.1:9222/devtools/browser/1".to_string(),
            },
        )
        .await
        .expect("bridge session");
        let text = String::from_utf8(output).expect("utf8");
        let frames = text
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).expect("json line"))
            .collect();
        (frames, page.calls(), exit)
    }

    #[test]
    fn ready_event_reports_cdp_strategy_when_cdp_url_set() {
        let plan = LaunchPlan::from_env(|key| match key {
            ENV_BROWSER_CDP_URL => Some(" ws://127.0.0.1:9222/devtools/browser/abc ".to_string()),
            _ => None,
        });
        assert_eq!(plan.strategy(), STRATEGY_CDP);
        assert_eq!(
            plan,
            LaunchPlan::Cdp {
                url: "ws://127.0.0.1:9222/devtools/browser/abc".to_string()
            }
        );
        assert_eq!(
            BridgeEvent::Ready {
                strategy: plan.strategy()
            }
            .to_json(),
            json!({ "event": "ready", "strategy": "cdp" })
        );
    }

    #[test]
    fn launch_plan_reads_env_flags() {
        let plan = LaunchPlan::from_env(|key| match key {
            ENV_BROWSER_CHANNEL => Some("chrome".to_string()),
            ENV_BROWSER_FALLBACK_CHANNELS => Some(" chromium , ,msedge ".to_string()),
            ENV_BROWSER_HEADLESS => Some("false".to_string()),
            ENV_BROWSER_LAUNCH_TIMEOUT_MS => Some("12000".to_string()),
            ENV_BROWSER_IGNORE_HTTPS_ERRORS => Some("true".to_string()),
            ENV_BROWSER_COMPACT_VIEW => Some("true".to_string()),
            _ => None,
        });
        assert_eq!(plan.strategy(), STRATEGY_LAUNCH);
        assert_eq!(
            plan.channels(),
            vec![
                "chrome".to_string(),
                "chromium".to_string(),
                "msedge".to_string()
            ]
        );
        match plan {
            LaunchPlan::Launch {
                headless,
                timeout_ms,
                ignore_https_errors,
                compact_view,
                ..
            } => {
                assert!(!headless, "BROWSER_HEADLESS=false must disable headless");
                assert_eq!(timeout_ms, 12_000);
                assert!(ignore_https_errors);
                assert!(compact_view);
            }
            other => panic!("unexpected plan: {other:?}"),
        }
    }

    #[test]
    fn launch_defaults_match_reference() {
        let plan = LaunchPlan::from_env(|_| None);
        assert_eq!(plan.strategy(), STRATEGY_LAUNCH);
        assert_eq!(
            plan.channels(),
            vec![
                "chromium".to_string(),
                "chrome".to_string(),
                "msedge".to_string()
            ]
        );
        match plan {
            LaunchPlan::Launch {
                headless,
                timeout_ms,
                ..
            } => {
                assert!(headless);
                assert_eq!(timeout_ms, DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS);
            }
            other => panic!("unexpected plan: {other:?}"),
        }
    }

    #[test]
    fn positive_integer_env_rejects_zero_and_garbage() {
        assert_eq!(parse_positive_integer_env(None, 7), 7);
        assert_eq!(parse_positive_integer_env(Some(""), 7), 7);
        assert_eq!(parse_positive_integer_env(Some("0"), 7), 7);
        assert_eq!(parse_positive_integer_env(Some("-3"), 7), 7);
        assert_eq!(parse_positive_integer_env(Some("abc"), 7), 7);
        assert_eq!(parse_positive_integer_env(Some(" 42 "), 7), 42);
    }

    #[test]
    fn console_flood_guard_reads_overrides() {
        let guard = console_flood_guard_from_env(|key| match key {
            ENV_CONSOLE_FLOOD_THRESHOLD => Some("2".to_string()),
            ENV_CONSOLE_FLOOD_WINDOW_MS => Some("500".to_string()),
            _ => None,
        });
        let (window_ms, threshold, _) = guard.configuration();
        assert_eq!(window_ms, 500);
        assert_eq!(threshold, 2);
    }

    #[test]
    fn response_events_classify_by_status() {
        assert_eq!(
            RuntimeEventInput::response(200, None, None)
                .level
                .as_deref(),
            Some("info")
        );
        assert_eq!(
            RuntimeEventInput::response(404, None, None)
                .level
                .as_deref(),
            Some("warn")
        );
        assert_eq!(
            RuntimeEventInput::response(503, None, None)
                .level
                .as_deref(),
            Some("error")
        );
        assert_eq!(
            RuntimeEventInput::response(404, Some("http://x/".into()), Some("GET".into()))
                .payload(),
            json!({ "type": "response", "level": "warn", "text": "HTTP 404", "url": "http://x/", "method": "GET", "status": 404 })
        );
    }

    #[test]
    fn event_buffer_caps_and_drops_console_while_paused() {
        use std::sync::atomic::{AtomicU64, Ordering};
        let now = Arc::new(AtomicU64::new(0));
        let clock: FloodClock = {
            let now = now.clone();
            Arc::new(move || now.load(Ordering::SeqCst))
        };
        let guard = ConsoleFloodGuard::with_clock(2_000, 2, 30_000, clock);
        let mut buffer = BridgeEventBuffer::new(guard);
        buffer.push(RuntimeEventInput::console("log", "one"));
        let paused = buffer.push(RuntimeEventInput::console("log", "two"));
        assert!(
            buffer
                .push(RuntimeEventInput::console("log", "three"))
                .is_empty()
        );
        assert_eq!(paused.len(), 1, "pause notice replaces the dropped event");
        assert!(
            paused[0].payload["text"]
                .as_str()
                .unwrap()
                .contains("Console capture paused")
        );
        // Page errors bypass the console guard.
        buffer.push(RuntimeEventInput::page_error("boom"));
        assert_eq!(buffer.events().last().unwrap().payload["type"], "pageerror");
        assert!(buffer.dropped() >= 1);
        assert!(buffer.events().iter().all(|event| event.id >= 1));
        for index in 0..(MAX_BROWSER_RUNTIME_EVENTS + 5) {
            buffer.push(RuntimeEventInput::page_error(format!("err {index}")));
        }
        assert_eq!(buffer.len(), MAX_BROWSER_RUNTIME_EVENTS);
    }

    #[test]
    fn invalid_json_line_returns_null_id_error() {
        let (frames, calls, exit) = block_on(run_session("not json\n"));
        assert_eq!(exit, BridgeExit::Eof);
        assert_eq!(
            frames,
            vec![
                json!({ "event": "ready", "strategy": "cdp" }),
                json!({ "id": null, "ok": false, "error": "Invalid JSON command" }),
            ]
        );
        assert!(calls.is_empty());
    }

    #[test]
    fn unknown_method_is_reported_with_echoed_id() {
        let (frames, _, _) = block_on(run_session(r##"{"id":7,"method":"teleport","params":{}}"##));
        assert_eq!(
            frames[1],
            json!({ "id": 7, "ok": false, "error": "Unknown method: teleport" })
        );
    }

    #[test]
    fn command_round_trip_echoes_id_and_dispatches_params() {
        let (frames, calls, _) = block_on(run_session(concat!(
            r##"{"id":"a","method":"navigate","params":{"url":"https://example.test/"}}"##,
            "\n",
            r##"{"id":"b","method":"typeText","params":{"selector":"#q","text":"hello"}}"##,
            "\n",
            r##"{"id":"c","method":"waitFor","params":{"selector":"#q"}}"##,
            "\n",
            r##"{"id":"d","method":"scroll","params":{}}"##,
            "\n",
            r##"{"id":"e","method":"screenshot","params":{"path":null}}"##,
            "\n",
        )));
        assert_eq!(
            frames[1],
            json!({ "id": "a", "ok": true, "result": { "url": "https://example.test/" } })
        );
        assert_eq!(
            frames[2],
            json!({ "id": "b", "ok": true, "result": { "ok": true } })
        );
        assert_eq!(
            frames[3],
            json!({ "id": "c", "ok": true, "result": { "ok": true } })
        );
        assert_eq!(
            frames[4],
            json!({ "id": "d", "ok": true, "result": { "ok": true } })
        );
        assert_eq!(
            frames[5],
            json!({ "id": "e", "ok": true, "result": { "path": "/tmp/shot.png" } })
        );
        assert_eq!(
            calls,
            vec![
                "navigate:https://example.test/",
                "typeText:#q:hello",
                "waitFor:#q:10000",
                "scroll:0:0",
                "screenshot:None",
            ]
        );
    }

    #[test]
    fn missing_required_param_is_reported_as_method_error() {
        let (frames, calls, _) =
            block_on(run_session(r##"{"id":1,"method":"navigate","params":{}}"##));
        assert_eq!(
            frames[1],
            json!({ "id": 1, "ok": false, "error": "navigate requires params.url" })
        );
        assert!(calls.is_empty());
    }

    #[test]
    fn handler_failure_propagates_normalised_error_text() {
        let (frames, _, _) = block_on(run_session(
            r##"{"id":2,"method":"click","params":{"selector":"#missing"}}"##,
        ));
        assert_eq!(
            frames[1],
            json!({ "id": 2, "ok": false, "error": "element is not visible" })
        );
    }

    #[test]
    fn close_responds_then_ends_the_session() {
        let (frames, calls, exit) = block_on(run_session(concat!(
            r##"{"id":1,"method":"close","params":{}}"##,
            "\n",
            r##"{"id":2,"method":"reload","params":{}}"##,
            "\n",
        )));
        assert_eq!(exit, BridgeExit::Closed);
        assert_eq!(frames.len(), 2, "no frames are written after close");
        assert_eq!(
            frames[1],
            json!({ "id": 1, "ok": true, "result": { "ok": true } })
        );
        assert_eq!(calls, vec!["close"]);
    }

    #[test]
    fn bridge_events_match_reference_shapes() {
        let payload = RuntimeEventInput::console("log", "hi").payload();
        assert_eq!(
            BridgeEvent::Runtime {
                payload: payload.clone()
            }
            .to_json(),
            json!({ "event": "runtime", "payload": payload })
        );
        assert_eq!(
            BridgeEvent::Disconnected.to_json(),
            json!({ "event": "disconnected" })
        );
        assert_eq!(
            BridgeEvent::Fatal {
                error: "  boom  ".to_string()
            }
            .to_json(),
            json!({ "event": "fatal", "error": "boom" })
        );
    }

    #[test]
    fn launch_failure_message_aggregates_attempts() {
        assert_eq!(
            launch_failure_message(&[
                "chrome: missing binary".to_string(),
                "chromium: timeout".to_string(),
            ]),
            "Failed to launch browser after 2 attempt(s): chrome: missing binary | chromium: timeout"
        );
        assert_eq!(normalize_error_message("   "), "Unknown error");
    }
    #[test]
    fn oversized_command_fails_before_dispatch() {
        block_on(async {
            let page = Arc::new(MockPage::default());
            let input = vec![b'x'; 1024 * 1024 + 1];
            let mut output = Vec::new();
            let result = run_bridge(
                std::io::Cursor::new(input),
                &mut output,
                page.clone(),
                &LaunchPlan::Cdp {
                    url: "ws://localhost".into(),
                },
            )
            .await;
            assert_eq!(
                result.unwrap_err().message(),
                "command frame exceeds size limit"
            );
            assert!(page.calls().is_empty());
        });
    }

    #[test]
    fn console_flood_discards_every_event_during_pause() {
        let guard = console_flood_guard_from_env(|key| {
            if key == "BROWSER_CONSOLE_FLOOD_THRESHOLD" {
                Some("1".into())
            } else {
                None
            }
        });
        let mut buffer = BridgeEventBuffer::new(guard);
        buffer.push(RuntimeEventInput::console("log", "first"));
        buffer.push(RuntimeEventInput::console("log", "pause"));
        assert!(
            buffer
                .push(RuntimeEventInput::console("log", "dropped"))
                .is_empty()
        );
    }
}
