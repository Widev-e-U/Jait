//! Subscription usage fetchers: OpenCode Go quota JSON and Ollama settings HTML meters.
//!
//! Both adapters take an injected [`UsageTransport`]; the owned native transport is a
//! pooled `reqwest` client. No API key or cookie value is logged, embedded in an error,
//! or persisted: the only places a credential is used are the request headers. The
//! Ollama path reads explicit `data-usage-*` attributes from the returned markup and
//! never executes page script.
use crate::{
    text::{js_trim, js_whitespace},
    time::iso,
};
use futures_util::future::BoxFuture;
use serde_json::{Map, Value};
use std::{collections::VecDeque, sync::Arc, time::Duration};

pub const OPEN_CODE_GO_URL: &str = "https://opencode.ai/zen/go/v1/usage";
pub const OLLAMA_SETTINGS_URL: &str = "https://ollama.com/settings";
/// `AbortSignal.timeout(10_000)` in the reference implementation.
pub const REQUEST_TIMEOUT_MS: u64 = 10_000;
/// The streamed byte counter and the `html.length` guard share this bound.
pub const MAX_RESPONSE_BYTES: usize = 2_000_000;
/// Native-only guard for the JSON path, which the reference reads without a bound.
const MAX_OPEN_CODE_GO_BYTES: usize = 8 * 1024 * 1024;

pub const TOO_LARGE: &str = "Ollama settings response is too large.";
pub const EMPTY_SETTINGS: &str = "Ollama returned an empty settings response.";
pub const EXPIRED_SESSION: &str =
    "Ollama browser session expired or was rejected. Reconnect it in Usage.";
pub const INVALID_METERS: &str = "Ollama returned invalid usage meters.";
pub const MISSING_METERS: &str = "Ollama did not return session and weekly usage. The browser session may have expired; reconnect it in Usage.";
pub const INVALID_COOKIE: &str = "Enter only the Ollama __Secure-session cookie value.";
pub const UNEXPECTED_USAGE: &str = "OpenCode Go returned an unexpected usage response.";
pub const OPEN_CODE_GO_REJECTED: &str =
    "OpenCode Go rejected this API key. Reconnect Go in Settings.";
pub const OPEN_CODE_GO_NO_SUBSCRIPTION: &str = "This key has no OpenCode Go subscription.";
pub const OPEN_CODE_GO_TOO_LARGE: &str = "OpenCode Go usage response is too large.";

/// `redirect` mode requested for one fetch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Redirect {
    /// `redirect: "error"`: a 3xx response rejects the fetch.
    Error,
    /// `redirect: "manual"`: a 3xx response is returned to the caller.
    Manual,
}

impl Redirect {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::Manual => "manual",
        }
    }
}

/// One outbound request. Header order is preserved so tests can pin the exact set.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UsageRequest {
    pub url: String,
    pub method: &'static str,
    pub redirect: Redirect,
    pub headers: Vec<(String, String)>,
    pub timeout_ms: u64,
}

/// A response body. `None` on [`UsageResponse`] models `response.body === null`.
#[derive(Debug)]
pub enum UsageBody {
    /// Scripted chunks: `Ok(Some(bytes))` is one read, `Ok(None)` is EOF, `Err` fails
    /// the read. `cancel` is reported verbatim by the final `cancel()` call.
    Scripted {
        reads: VecDeque<Result<Option<Vec<u8>>, String>>,
        cancel: Result<(), String>,
    },
    /// Live pooled body read with `reqwest::Response::chunk`.
    Http(Box<reqwest::Response>),
}

impl UsageBody {
    /// One chunk per entry, then EOF.
    pub fn chunks(chunks: Vec<Vec<u8>>) -> Self {
        Self::Scripted {
            reads: chunks.into_iter().map(|chunk| Ok(Some(chunk))).collect(),
            cancel: Ok(()),
        }
    }

    pub fn scripted(
        reads: Vec<Result<Option<Vec<u8>>, String>>,
        cancel: Result<(), String>,
    ) -> Self {
        Self::Scripted {
            reads: reads.into(),
            cancel,
        }
    }

    pub async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, String> {
        match self {
            Self::Scripted { reads, .. } => reads.pop_front().unwrap_or(Ok(None)),
            Self::Http(response) => response
                .chunk()
                .await
                .map(|bytes| bytes.map(|bytes| bytes.to_vec()))
                .map_err(|error| error.to_string()),
        }
    }

    /// `reader.cancel()`. A live body is already exhausted or dropped by the caller.
    pub async fn cancel(&mut self) -> Result<(), String> {
        match self {
            Self::Scripted { cancel, .. } => cancel.clone(),
            Self::Http(_) => Ok(()),
        }
    }
}

#[derive(Debug)]
pub struct UsageResponse {
    pub status: u16,
    pub body: Option<UsageBody>,
}

impl UsageResponse {
    pub fn new(status: u16) -> Self {
        Self { status, body: None }
    }

    pub fn with_chunks(status: u16, chunks: Vec<Vec<u8>>) -> Self {
        Self {
            status,
            body: Some(UsageBody::chunks(chunks)),
        }
    }

    pub fn with_body(status: u16, body: UsageBody) -> Self {
        Self {
            status,
            body: Some(body),
        }
    }
}

/// Injected adapter boundary. The reference implementation reaches the global `fetch`;
/// every native caller supplies this transport instead.
pub type UsageTransport =
    Arc<dyn Fn(UsageRequest) -> BoxFuture<'static, Result<UsageResponse, String>> + Send + Sync>;

/// Pooled `reqwest` transport with the redirect policy fixed per mode and the request
/// deadline applied to connect, send, and body reads.
pub struct HttpUsageAdapter {
    strict: reqwest::Client,
    manual: reqwest::Client,
}

impl HttpUsageAdapter {
    pub fn new() -> Result<Self, String> {
        let strict = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                attempt.error("redirect blocked")
            }))
            .build()
            .map_err(|error| error.to_string())?;
        let manual = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| error.to_string())?;
        Ok(Self { strict, manual })
    }

    pub fn transport(self) -> UsageTransport {
        let adapter = Arc::new(self);
        Arc::new(move |request| {
            let adapter = Arc::clone(&adapter);
            Box::pin(async move {
                let (client, strict) = match request.redirect {
                    Redirect::Error => (adapter.strict.clone(), true),
                    Redirect::Manual => (adapter.manual.clone(), false),
                };
                let mut builder = client
                    .request(reqwest_method(request.method), &request.url)
                    .timeout(Duration::from_millis(request.timeout_ms.max(1)));
                for (name, value) in &request.headers {
                    builder = builder.header(name, value);
                }
                let response = builder.send().await.map_err(|error| error.to_string())?;
                let status = response.status().as_u16();
                // `fetch(..., {redirect: \"error\"})` rejects every 3xx, including a response
                // without `Location`; `reqwest` only consults its policy for a redirect it
                // would actually follow, so the strict outcome is decided here as well.
                if strict && (300..400).contains(&status) {
                    return Err(format!("redirect blocked ({status})"));
                }
                Ok(UsageResponse {
                    status,
                    body: Some(UsageBody::Http(Box::new(response))),
                })
            })
        })
    }
}

/// Production transport used outside tests.
pub fn native_transport() -> Result<UsageTransport, String> {
    HttpUsageAdapter::new().map(HttpUsageAdapter::transport)
}

fn reqwest_method(method: &str) -> reqwest::Method {
    reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET)
}

/// `__Secure-session` cookie value, with the exact reference validation.
pub fn normalize_ollama_session(value: &str) -> Result<String, String> {
    let cookie = js_trim(value)
        .strip_prefix("__Secure-session=")
        .unwrap_or_else(|| js_trim(value));
    // Length is measured in UTF-16 code units, matching `String.prototype.length`.
    if cookie.is_empty()
        || cookie.encode_utf16().count() > 4096
        || cookie.chars().any(unsafe_cookie_char)
    {
        return Err(INVALID_COOKIE.to_string());
    }
    Ok(cookie.to_string())
}

/// Rejects separators and controls so the value cannot inject cookies or headers.
fn unsafe_cookie_char(character: char) -> bool {
    js_whitespace(character)
        || matches!(character, ';' | ',' | '\u{0000}'..='\u{001f}' | '\u{007f}')
}

/// `parseOllamaSettingsUsage`: read only explicit usage attributes from the markup.
pub fn parse_ollama_settings_usage(html: &str) -> Result<Value, String> {
    if html.encode_utf16().count() > MAX_RESPONSE_BYTES {
        return Err(TOO_LARGE.to_string());
    }
    let roots = parse_html(html);
    let mut tracks: Vec<Track<'_>> = Vec::new();
    collect_tracks(&roots, &mut tracks);
    let mut limits = Map::new();
    for track in tracks {
        let label = attribute(track.element, "aria-label").unwrap_or("");
        let Some(name) = track_name(label) else {
            continue;
        };
        let Some(percent) = usage_percent(label) else {
            continue;
        };
        let Some(usage) = percent
            .parse::<f64>()
            .ok()
            .filter(|percent| percent.is_finite() && *percent <= 100.0)
        else {
            return Err(INVALID_METERS.to_string());
        };
        if limits.contains_key(name) {
            return Err(INVALID_METERS.to_string());
        }
        let resets_at = track
            .sibling
            .and_then(|sibling| attribute(sibling, "data-time"))
            .filter(|value| !value.is_empty())
            .and_then(js_date_parse)
            .and_then(|millis| iso(millis).ok())
            .map(Value::String)
            .unwrap_or(Value::Null);
        let mut limit = Map::new();
        limit.insert("usage".to_string(), js_number(usage / 100.0));
        limit.insert("models".to_string(), Value::Array(Vec::new()));
        limit.insert("resetsAt".to_string(), resets_at);
        limits.insert(name.to_string(), Value::Object(limit));
    }
    if !limits.contains_key("session") || !limits.contains_key("weekly") {
        return Err(MISSING_METERS.to_string());
    }
    let mut response = Map::new();
    response.insert("limits".to_string(), Value::Object(limits));
    response.insert("source".to_string(), Value::String("settings".to_string()));
    Ok(Value::Object(response))
}

/// `fetchOpenCodeGoUsage`. The validated body is returned unmodified, as the reference
/// returns the parsed JSON value rather than a projection.
pub async fn fetch_open_code_go_usage(
    transport: &UsageTransport,
    api_key: &str,
) -> Result<Value, String> {
    let mut response = transport(UsageRequest {
        url: OPEN_CODE_GO_URL.to_string(),
        method: "GET",
        redirect: Redirect::Error,
        headers: vec![
            ("Authorization".to_string(), format!("Bearer {api_key}")),
            ("Accept".to_string(), "application/json".to_string()),
        ],
        timeout_ms: REQUEST_TIMEOUT_MS,
    })
    .await?;
    let status = response.status;
    if !(200..300).contains(&status) {
        return Err(open_code_go_status_error(status));
    }
    let text = read_text(response.body.take()).await?;
    let body: Value = if js_trim(&text).is_empty() {
        return Err("Unexpected end of JSON input".to_string());
    } else {
        serde_json::from_str(&text).map_err(|error| error.to_string())?
    };
    validate_open_code_go_usage(&body)?;
    Ok(normalize_json_numbers(body))
}

/// `fetchOllamaSettingsUsage`. The session cookie is validated before any request is
/// issued, and `cancel()` always runs, exactly like the reference `finally` block.
pub async fn fetch_ollama_settings_usage(
    transport: &UsageTransport,
    session: &str,
) -> Result<Value, String> {
    let cookie = normalize_ollama_session(session)?;
    let mut response = transport(UsageRequest {
        url: OLLAMA_SETTINGS_URL.to_string(),
        method: "GET",
        redirect: Redirect::Manual,
        headers: vec![
            ("Cookie".to_string(), format!("__Secure-session={cookie}")),
            ("Accept".to_string(), "text/html".to_string()),
        ],
        timeout_ms: REQUEST_TIMEOUT_MS,
    })
    .await?;
    let status = response.status;
    if (300..400).contains(&status) || status == 401 || status == 403 {
        return Err(EXPIRED_SESSION.to_string());
    }
    if !(200..300).contains(&status) {
        return Err(format!("Ollama settings request failed ({status})."));
    }
    let Some(mut body) = response.body.take() else {
        return Err(EMPTY_SETTINGS.to_string());
    };
    let mut decoder = Utf8Stream::default();
    let mut html = String::new();
    let mut bytes = 0_usize;
    let outcome = loop {
        match body.next_chunk().await {
            Ok(Some(chunk)) => {
                bytes = bytes.saturating_add(chunk.len());
                if bytes > MAX_RESPONSE_BYTES {
                    break Err(TOO_LARGE.to_string());
                }
                decoder.push(&chunk, true, &mut html);
            }
            Ok(None) => {
                decoder.finish(&mut html);
                // `new TextDecoder()` removes one leading byte-order mark.
                let document = html.strip_prefix('\u{feff}').unwrap_or(&html);
                break parse_ollama_settings_usage(document);
            }
            Err(error) => {
                break Err(error);
            }
        }
    };
    match body.cancel().await {
        Ok(()) => outcome,
        Err(error) => Err(error),
    }
}

fn open_code_go_status_error(status: u16) -> String {
    match status {
        401 => OPEN_CODE_GO_REJECTED.to_string(),
        403 => OPEN_CODE_GO_NO_SUBSCRIPTION.to_string(),
        _ => format!("OpenCode Go usage request failed ({status})."),
    }
}

fn validate_open_code_go_usage(body: &Value) -> Result<(), String> {
    for name in ["rolling", "weekly", "monthly"] {
        let window = body
            .get("usage")
            .and_then(|usage| usage.get(name))
            .and_then(Value::as_object);
        let valid = window.is_some_and(|window| {
            matches!(
                window.get("status").and_then(Value::as_str),
                Some("ok" | "rate-limited")
            ) && window
                .get("percent")
                .and_then(Value::as_f64)
                .is_some_and(|percent| percent.is_finite() && percent >= 0.0)
                && window
                    .get("resetsAt")
                    .and_then(Value::as_str)
                    .is_some_and(|resets_at| js_date_parse(resets_at).is_some())
        });
        if !valid {
            return Err(UNEXPECTED_USAGE.to_string());
        }
    }
    Ok(())
}

async fn read_text(body: Option<UsageBody>) -> Result<String, String> {
    let Some(mut body) = body else {
        return Ok(String::new());
    };
    let mut bytes: Vec<u8> = Vec::new();
    // Response.json() consumes to EOF; it does not explicitly cancel the reader.
    while let Some(chunk) = body.next_chunk().await? {
        if chunk.len() > MAX_OPEN_CODE_GO_BYTES.saturating_sub(bytes.len()) {
            return Err(OPEN_CODE_GO_TOO_LARGE.to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(decode_document(&bytes))
}

/// JSON.parse stores every numeric token as IEEE-754, including integer-looking values.
fn normalize_json_numbers(value: Value) -> Value {
    match value {
        Value::Number(number) => js_number(number.as_f64().expect("finite JSON number")),
        Value::Array(values) => {
            Value::Array(values.into_iter().map(normalize_json_numbers).collect())
        }
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| (key, normalize_json_numbers(value)))
                .collect(),
        ),
        other => other,
    }
}

/// UTF-8 decode with a single leading byte-order mark removed, as `Response.text()` does.
fn decode_document(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    String::from_utf8_lossy(bytes).into_owned()
}

/// Streaming UTF-8 decoder: an incomplete trailing sequence is held for the next chunk
/// and becomes one replacement character when the stream ends.
#[derive(Default)]
struct Utf8Stream {
    pending: Vec<u8>,
}

impl Utf8Stream {
    fn push(&mut self, bytes: &[u8], stream: bool, out: &mut String) {
        self.pending.extend_from_slice(bytes);
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(text) => {
                    out.push_str(text);
                    self.pending.clear();
                    return;
                }
                Err(error) => {
                    let valid = error.valid_up_to();
                    if valid > 0 {
                        out.push_str(
                            std::str::from_utf8(&self.pending[..valid])
                                .expect("validated UTF-8 prefix"),
                        );
                    }
                    match error.error_len() {
                        Some(length) => {
                            out.push('\u{fffd}');
                            self.pending.drain(..valid + length);
                        }
                        None => {
                            self.pending.drain(..valid);
                            if !stream {
                                out.push('\u{fffd}');
                                self.pending.clear();
                            }
                            return;
                        }
                    }
                }
            }
        }
    }

    fn finish(&mut self, out: &mut String) {
        self.push(&[], false, out);
    }
}

/// `Number` formatting that matches `JSON.stringify` for `percent / 100`.
fn js_number(value: f64) -> Value {
    let mut buffer = ryu_js::Buffer::new();
    let text = buffer.format(value).to_string();
    serde_json::from_str(&text).expect("formatted finite number")
}

/// `Date.parse` as the reference reaches it. The accepted shapes are the ones the meters
/// emit plus the legacy numeric and month-name forms JSC accepts, and the outcome matches
/// `Number.isFinite(Date.parse(value))` exactly for every case in the contract battery.
///
/// Local datetimes use the host zone with the reference's gap/fold disambiguation;
/// date-only ISO forms remain UTC. Legacy years and US zone abbreviations are supported.
pub(crate) fn js_date_parse(value: &str) -> Option<i64> {
    // JSC does not trim: `" 2026-01-05T06:00:00Z"` and `"2026-01-05T06:00:00Z "` are NaN.
    parse_iso_date_time(value).or_else(|| parse_legacy_date(value))
}

/// ECMAScript Date Time String Format, including the legacy freedoms JSC keeps: 1-2 digit
/// month/day in space-separated legacy forms, `t`/`z` in either case, `+HHMM`, a fraction longer than 3 digits (truncated),
/// `24:00`, and out-of-range days that roll forward.
fn parse_iso_date_time(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    let (year, mut index) = match bytes.first() {
        Some(&b'+') | Some(&b'-') => {
            let negative = bytes[0] == b'-';
            let (magnitude, next) = scan_digits(bytes, 1, 6, 6)?;
            if negative && magnitude == 0 {
                return None;
            }
            (if negative { -magnitude } else { magnitude }, next)
        }
        _ => scan_digits(bytes, 0, 4, 4)?,
    };
    let mut month = 1;
    let mut day = 1;
    if bytes.get(index) == Some(&b'-') {
        let (value, next) = scan_digits(bytes, index + 1, 1, 2)?;
        month = value as u32;
        index = next;
        if bytes.get(index) == Some(&b'-') {
            let (value, next) = scan_digits(bytes, index + 1, 1, 2)?;
            day = value as u32;
            index = next;
        }
    }
    let (mut hour, mut minute, mut second, mut millis) = (0_u32, 0_u32, 0_u32, 0_u32);
    let mut offset = 0_i64;
    let mut local = false;
    let separator = matches!(bytes.get(index), Some(&b'T') | Some(&b't'))
        || (bytes.get(index) == Some(&b' ')
            && bytes
                .get(index + 1)
                .is_some_and(|byte| byte.is_ascii_digit()));
    if separator {
        // The ISO T separator requires padded month/day fields when present; the
        // space-separated legacy form accepts one-digit month/day fields.
        if matches!(bytes.get(index), Some(&b'T') | Some(&b't')) {
            let date = value[..index].trim_start_matches(['+', '-']);
            let parts: Vec<_> = date.split('-').collect();
            if parts[1..].iter().any(|part| part.len() != 2) {
                return None;
            }
        }
        local = true;
        index += 1;
        let (value, next) = scan_digits(bytes, index, 2, 2)?;
        hour = value as u32;
        index = next;
        if bytes.get(index) != Some(&b':') {
            return None;
        }
        let (value, next) = scan_digits(bytes, index + 1, 2, 2)?;
        minute = value as u32;
        index = next;
        if bytes.get(index) == Some(&b':') {
            let (value, next) = scan_digits(bytes, index + 1, 2, 2)?;
            second = value as u32;
            index = next;
            if bytes.get(index) == Some(&b'.') {
                let (value, next) = scan_fraction(bytes, index + 1)?;
                millis = value;
                index = next;
            }
        }
        match bytes.get(index) {
            Some(&b'Z') | Some(&b'z') => {
                local = false;
                index += 1;
            }
            Some(&b'+') | Some(&b'-') => {
                local = false;
                let negative = bytes[index] == b'-';
                let (hours, next) = scan_digits(bytes, index + 1, 2, 2)?;
                index = next;
                let minutes = if bytes.get(index) == Some(&b':') {
                    let (value, next) = scan_digits(bytes, index + 1, 2, 2)?;
                    index = next;
                    value
                } else if bytes.get(index).is_some_and(|byte| byte.is_ascii_digit()) {
                    let (value, next) = scan_digits(bytes, index, 2, 2)?;
                    index = next;
                    value
                } else {
                    // `+02` is not an offset JSC accepts.
                    return None;
                };
                if hours > 23 || minutes > 59 {
                    return None;
                }
                let total = hours * 60 + minutes;
                offset = if negative { -total } else { total };
            }
            Some(_) => return None,
            None => {}
        }
    }
    if index != bytes.len() {
        return None;
    }
    let stamp = timestamp_ms(year, month, day, hour, minute, second, millis, offset)?;
    if local {
        local_timestamp(stamp)
    } else {
        Some(stamp)
    }
}

/// Legacy numeric forms: `YYYY/M/D`, `M/D/YYYY`, and `M-D-YYYY`. JSC reads the two-part
/// numeric forms month first, so `05-01-2026` is 2026-05-01.
fn parse_legacy_date(value: &str) -> Option<i64> {
    if value.is_empty() {
        return None;
    }
    if let Some(millis) = parse_numeric_date(value) {
        return Some(millis);
    }
    parse_month_name(value)
}

fn parse_numeric_date(value: &str) -> Option<i64> {
    let separator = if value.contains('/') {
        '/'
    } else if value.matches('-').count() == 2 && !value.contains(':') {
        '-'
    } else {
        return None;
    };
    let parts: Vec<&str> = value.split(separator).collect();
    if parts.len() != 3 {
        return None;
    }
    let numbers: Vec<u32> = parts
        .iter()
        .map(|part| {
            if part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()) {
                return None;
            }
            part.parse::<u32>().ok()
        })
        .collect::<Option<Vec<u32>>>()?;
    if parts[0].len() == 4 {
        return local_timestamp(timestamp_ms(
            i64::from(numbers[0]),
            numbers[1],
            numbers[2],
            0,
            0,
            0,
            0,
            0,
        )?);
    }
    if parts[2].len() <= 4 {
        return local_timestamp(timestamp_ms(
            legacy_year(i64::from(numbers[2])),
            numbers[0],
            numbers[1],
            0,
            0,
            0,
            0,
            0,
        )?);
    }
    None
}

fn legacy_year(year: i64) -> i64 {
    match year {
        0..=49 => year + 2000,
        50..=99 => year + 1900,
        _ => year,
    }
}

/// ECMAScript chooses the earlier instant for a fold and the prior offset for a gap.
fn local_timestamp(wall_ms: i64) -> Option<i64> {
    use chrono::{Local, LocalResult, Offset, TimeZone};
    let wall = chrono::DateTime::from_timestamp_millis(wall_ms)?.naive_utc();
    match Local.from_local_datetime(&wall) {
        LocalResult::Single(date) => Some(date.timestamp_millis()),
        LocalResult::Ambiguous(a, b) => Some(a.timestamp_millis().min(b.timestamp_millis())),
        LocalResult::None => {
            for minute in 1..=1440 {
                let prior = wall.checked_sub_signed(chrono::Duration::minutes(minute))?;
                if let Some(date) = Local.from_local_datetime(&prior).earliest() {
                    return date
                        .offset()
                        .fix()
                        .from_local_datetime(&wall)
                        .single()
                        .map(|d| d.timestamp_millis());
                }
            }
            None
        }
    }
}

/// `Jan 5 2026`, `January 5, 2026 06:30:00`, and RFC 2822 `Mon, 05 Jan 2026 06:00:00 GMT`.
fn parse_month_name(value: &str) -> Option<i64> {
    let cleaned = value.replace(',', " ");
    let tokens: Vec<&str> = cleaned.split_whitespace().collect();
    let mut index = if tokens.first().is_some_and(|token| is_weekday(token)) {
        1
    } else {
        0
    };
    let (month, day, year) =
        if let Some(month) = tokens.get(index).and_then(|token| month_number(token)) {
            let day = tokens.get(index + 1)?.parse::<u32>().ok()?;
            let year = tokens.get(index + 2)?.parse::<i64>().ok()?;
            index += 3;
            (month, day, year)
        } else {
            let day = tokens.get(index)?.parse::<u32>().ok()?;
            let month = month_number(tokens.get(index + 1)?)?;
            let year = tokens.get(index + 2)?.parse::<i64>().ok()?;
            index += 3;
            (month, day, year)
        };
    let (mut hour, mut minute, mut second) = (0_u32, 0_u32, 0_u32);
    if let Some(token) = tokens.get(index)
        && token.contains(':')
    {
        let (value, minutes, seconds) = parse_clock(token)?;
        hour = value;
        minute = minutes;
        second = seconds;
        index += 1;
    }
    let explicit_zone = tokens.get(index).is_some();
    let mut offset = 0_i64;
    if let Some(token) = tokens.get(index) {
        offset = zone_offset(token)?;
        index += 1;
    }
    if index != tokens.len() {
        return None;
    }
    let stamp = timestamp_ms(
        legacy_year(year),
        month,
        day,
        hour,
        minute,
        second,
        0,
        offset,
    )?;
    if explicit_zone {
        Some(stamp)
    } else {
        local_timestamp(stamp)
    }
}

fn parse_clock(token: &str) -> Option<(u32, u32, u32)> {
    let parts: Vec<&str> = token.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return None;
    }
    let hour = parts[0].parse::<u32>().ok()?;
    let minute = parts[1].parse::<u32>().ok()?;
    let second = match parts.get(2) {
        Some(part) => part.parse::<u32>().ok()?,
        None => 0,
    };
    Some((hour, minute, second))
}

fn zone_offset(token: &str) -> Option<i64> {
    match token.to_ascii_uppercase().as_str() {
        "GMT" | "UTC" | "Z" => return Some(0),
        "EST" => return Some(-300),
        "EDT" => return Some(-240),
        "CST" => return Some(-360),
        "CDT" => return Some(-300),
        "MST" => return Some(-420),
        "MDT" => return Some(-360),
        "PST" => return Some(-480),
        "PDT" => return Some(-420),
        _ => {}
    }
    let sign = match token.as_bytes().first()? {
        b'+' => 1,
        b'-' => -1,
        _ => return None,
    };
    let digits: String = token[1..]
        .chars()
        .filter(|character| *character != ':')
        .collect();
    if digits.len() != 4 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let hours = digits[..2].parse::<i64>().ok()?;
    let minutes = digits[2..].parse::<i64>().ok()?;
    if hours > 23 || minutes > 59 {
        return None;
    }
    Some(sign * (hours * 60 + minutes))
}

fn month_number(token: &str) -> Option<u32> {
    const NAMES: [&str; 25] = [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "sept",
    ];
    let lowered = token.to_ascii_lowercase();
    if lowered == "sept" {
        return Some(9);
    }
    NAMES
        .iter()
        .position(|name| *name == lowered)
        .map(|position| (position % 12) as u32 + 1)
}

fn is_weekday(token: &str) -> bool {
    const NAMES: [&str; 17] = [
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
        "sun",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "tues",
        "thur",
        "thurs",
    ];
    let lowered = token.to_ascii_lowercase();
    NAMES.contains(&lowered.as_str())
}

/// At least one digit, of which the first three become milliseconds.
fn scan_fraction(bytes: &[u8], from: usize) -> Option<(u32, usize)> {
    let mut index = from;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if index == from {
        return None;
    }
    let mut millis = 0_u32;
    for (offset, byte) in bytes[from..(from + 3).min(index)].iter().enumerate() {
        millis += u32::from(byte - b'0') * 10_u32.pow(2 - offset as u32);
    }
    Some((millis, index))
}

fn scan_digits(bytes: &[u8], from: usize, min: usize, max: usize) -> Option<(i64, usize)> {
    let mut index = from;
    while index < bytes.len() && index - from < max && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if index - from < min {
        return None;
    }
    let text = std::str::from_utf8(&bytes[from..index]).ok()?;
    Some((text.parse::<i64>().ok()?, index))
}

/// Milliseconds since the epoch for a possibly out-of-range day, with JSC's rollover:
/// `2026-02-30` is `2026-03-02`.
#[allow(clippy::too_many_arguments)] // Explicit calendar fields, matching Date construction.
fn timestamp_ms(
    year: i64,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
    millis: u32,
    offset_minutes: i64,
) -> Option<i64> {
    // TimeClip bounds the calendar before arithmetic on untrusted legacy years.
    if !(-271821..=275760).contains(&year) {
        return None;
    }
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 24
        || minute > 59
        || second > 59
        || offset_minutes.abs() >= 24 * 60
    {
        return None;
    }
    if hour == 24 && (minute != 0 || second != 0 || millis != 0) {
        return None;
    }
    let days = days_from_civil(year, month, 1).checked_add(i64::from(day) - 1)?;
    let seconds = days
        .checked_mul(86_400)?
        .checked_add(i64::from(hour) * 3_600 + i64::from(minute) * 60 + i64::from(second))?;
    let result = seconds
        .checked_sub(offset_minutes.checked_mul(60)?)?
        .checked_mul(1_000)?
        .checked_add(i64::from(millis))?;
    (result.abs() <= 8_640_000_000_000_000).then_some(result)
}

/// Days since 1970-01-01 for the first day of `month` (Howard Hinnant's civil calendar
/// algorithm), which keeps the month/day arithmetic overflow-safe.
fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_index = (i64::from(month) + 9) % 12;
    let day_of_year = (153 * month_index + 2) / 5 + i64::from(day) - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// `/session/i` then `/weekly/i`, in that order.
fn track_name(label: &str) -> Option<&'static str> {
    let lowered = label.to_ascii_lowercase();
    if lowered.contains("session") {
        Some("session")
    } else if lowered.contains("weekly") {
        Some("weekly")
    } else {
        None
    }
}

/// First `(?:^|\s)(\d+(?:\.\d+)?)%` capture in the label.
fn usage_percent(label: &str) -> Option<String> {
    let characters: Vec<char> = label.chars().collect();
    for start in 0..characters.len() {
        if start > 0 && !js_whitespace(characters[start - 1]) {
            continue;
        }
        if !characters[start].is_ascii_digit() {
            continue;
        }
        let mut cursor = start;
        while cursor < characters.len() && characters[cursor].is_ascii_digit() {
            cursor += 1;
        }
        if cursor + 1 < characters.len()
            && characters[cursor] == '.'
            && characters[cursor + 1].is_ascii_digit()
        {
            cursor += 1;
            while cursor < characters.len() && characters[cursor].is_ascii_digit() {
                cursor += 1;
            }
        }
        if cursor < characters.len() && characters[cursor] == '%' {
            return Some(characters[start..cursor].iter().collect());
        }
    }
    None
}

/// One usage-track element with the reset-time element resolved from its meter.
struct Track<'a> {
    element: &'a Element,
    sibling: Option<&'a Element>,
}

/// Iterative preorder traversal avoids recursion on provider-controlled nesting.
fn collect_tracks<'a>(children: &'a [Element], out: &mut Vec<Track<'a>>) {
    let mut pending = Vec::new();
    for (index, element) in children.iter().enumerate().rev() {
        pending.push((element, children.get(index + 1), None));
    }
    while let Some((element, following, meter_sibling)) = pending.pop() {
        if has_attribute(element, "data-usage-track") {
            out.push(Track {
                element,
                sibling: meter_sibling,
            });
        }
        let child_meter_sibling = if has_attribute(element, "data-usage-meter") {
            following
        } else {
            meter_sibling
        };
        for (index, child) in element.children.iter().enumerate().rev() {
            pending.push((child, element.children.get(index + 1), child_meter_sibling));
        }
    }
}

fn has_attribute(element: &Element, name: &str) -> bool {
    element.attribs.iter().any(|(key, _)| key == name)
}

fn attribute<'a>(element: &'a Element, name: &str) -> Option<&'a str> {
    element
        .attribs
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.as_str())
}

#[derive(Default)]
struct Element {
    attribs: Vec<(String, String)>,
    children: Vec<Element>,
}

// Drain children before each element drops so deeply nested remote markup cannot
// overflow the Rust thread stack during cleanup, including early parser errors.
impl Drop for Element {
    fn drop(&mut self) {
        let mut pending = std::mem::take(&mut self.children);
        while let Some(mut child) = pending.pop() {
            pending.append(&mut child.children);
        }
    }
}

struct Frame {
    name: String,
    foreign: bool,
    attribs: Vec<(String, String)>,
    children: Vec<Element>,
}

const VOID_ELEMENTS: [&str; 19] = [
    "basefont", "command", "frame", "isindex", "keygen", "area", "base", "br", "col", "embed",
    "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
];

/// Elements whose content htmlparser2 reads as text, so markup inside them is not parsed.
/// `noscript` and `iframe` are deliberately absent: htmlparser2 parses their content as
/// markup in its default scripting-disabled mode, so keeping them out is the faithful
/// choice. `xmp`, `noembed` and `plaintext` are unsupported (documented gap).
const RAW_TEXT_ELEMENTS: [&str; 4] = ["script", "style", "title", "textarea"];

/// Depth-first element tree. Text, comments, and directives are dropped because neither
/// the track search nor the sibling walk observes them.
fn parse_html(html: &str) -> Vec<Element> {
    let bytes = html.as_bytes();
    let mut frames: Vec<Frame> = Vec::new();
    let mut roots: Vec<Element> = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        let Some(offset) = bytes[index..].iter().position(|byte| *byte == b'<') else {
            break;
        };
        index += offset;
        if bytes[index..].starts_with(b"<!--") {
            // `-->`, `--!>`, and the abrupt `<!-->` / `<!--->` forms all terminate the
            // comment; htmlparser2 resumes the document afterwards instead of swallowing
            // the remainder, which the Bun probe confirmed for all three.
            let mut cursor = index + 4;
            loop {
                if bytes[cursor..].starts_with(b">") {
                    index = cursor + 1;
                    break;
                }
                if bytes[cursor..].starts_with(b"->") {
                    index = cursor + 2;
                    break;
                }
                match find_bytes(bytes, cursor, b"--") {
                    Some(offset) => {
                        let after = offset + 2;
                        if bytes[after..].starts_with(b"!>") {
                            index = after + 2;
                            break;
                        }
                        if bytes[after..].starts_with(b">") {
                            index = after + 1;
                            break;
                        }
                        cursor = after;
                    }
                    // Unterminated: the comment runs to the end of the document.
                    None => {
                        index = bytes.len();
                        break;
                    }
                }
            }
            continue;
        }
        // `<!` outside a comment starts a bogus comment that runs to the next `>`; the
        // CDATA form is only real in foreign content, so it takes the same path here.
        if bytes[index..].starts_with(b"<![CDATA[") {
            index = find_bytes(bytes, index + 9, b"]]>").map_or(bytes.len(), |at| at + 3);
            continue;
        }
        if bytes[index..].starts_with(b"</") {
            let Some(end) = find_bytes(bytes, index + 2, b">") else {
                break;
            };
            let name = html[index + 2..end].trim().to_ascii_lowercase();
            index = end + 1;
            close_frame(&mut frames, &mut roots, &name);
            continue;
        }
        if bytes[index..].starts_with(b"<!") || bytes[index..].starts_with(b"<?") {
            let Some(end) = find_bytes(bytes, index + 2, b">") else {
                break;
            };
            index = end + 1;
            continue;
        }
        let Some(tag) = parse_start_tag(html, index) else {
            index += 1;
            continue;
        };
        index = tag.end;
        while frames
            .last()
            .is_some_and(|frame| implies_close(&tag.name, &frame.name))
        {
            let name = frames.last().expect("frame").name.clone();
            close_frame(&mut frames, &mut roots, &name);
        }
        let foreign = frames.last().is_some_and(|frame| frame.foreign);
        if VOID_ELEMENTS.contains(&tag.name.as_str())
            || (tag.self_closing && (foreign || matches!(tag.name.as_str(), "svg" | "math")))
        {
            push_child(
                &mut frames,
                &mut roots,
                Element {
                    attribs: tag.attribs,
                    children: Vec::new(),
                },
            );
            continue;
        }
        let raw = RAW_TEXT_ELEMENTS.contains(&tag.name.as_str());
        frames.push(Frame {
            foreign: match tag.name.as_str() {
                "svg" | "math" => true,
                "mi" | "mo" | "mn" | "ms" | "mtext" | "annotation-xml" | "foreignobject"
                | "desc" | "title" => false,
                _ => foreign,
            },
            name: tag.name.clone(),
            attribs: tag.attribs,
            children: Vec::new(),
        });
        if raw {
            index = find_close_tag(bytes, index, &tag.name).unwrap_or(bytes.len());
        }
    }
    while let Some(frame) = frames.pop() {
        let element = Element {
            attribs: frame.attribs,
            children: frame.children,
        };
        match frames.last_mut() {
            Some(parent) => parent.children.push(element),
            None => roots.push(element),
        }
    }
    roots
}

struct StartTag {
    name: String,
    attribs: Vec<(String, String)>,
    end: usize,
    self_closing: bool,
}

fn parse_start_tag(html: &str, start: usize) -> Option<StartTag> {
    let bytes = html.as_bytes();
    let mut index = start + 1;
    if !bytes.get(index)?.is_ascii_alphabetic() {
        return None;
    }
    let mut self_closing = false;
    while index < bytes.len()
        && !is_html_space(bytes[index])
        && !matches!(bytes[index], b'>' | b'/')
    {
        index += 1;
    }
    let name = html[start + 1..index].to_ascii_lowercase();
    if name.is_empty() {
        return None;
    }
    let mut attribs: Vec<(String, String)> = Vec::new();
    loop {
        while index < bytes.len() && is_html_space(bytes[index]) {
            index += 1;
        }
        if index >= bytes.len() {
            return None;
        }
        match bytes[index] {
            b'>' => {
                index += 1;
                break;
            }
            b'/' => {
                // Only foreign elements honor self-closing in the reference default mode.
                self_closing = true;
                index += 1;
                continue;
            }
            _ => {}
        }
        let name_start = index;
        while index < bytes.len()
            && !is_html_space(bytes[index])
            && !matches!(bytes[index], b'=' | b'>' | b'/')
        {
            index += 1;
        }
        let attribute_name = html[name_start..index].to_ascii_lowercase();
        while index < bytes.len() && is_html_space(bytes[index]) {
            index += 1;
        }
        let mut value = String::new();
        if index < bytes.len() && bytes[index] == b'=' {
            index += 1;
            while index < bytes.len() && is_html_space(bytes[index]) {
                index += 1;
            }
            if index < bytes.len() && matches!(bytes[index], b'"' | b'\'') {
                let quote = bytes[index];
                let value_start = index + 1;
                let mut cursor = value_start;
                while cursor < bytes.len() && bytes[cursor] != quote {
                    cursor += 1;
                }
                value = decode_entities(&html[value_start..cursor.min(bytes.len())]);
                index = (cursor + 1).min(bytes.len());
            } else {
                let value_start = index;
                while index < bytes.len() && !is_html_space(bytes[index]) && bytes[index] != b'>' {
                    index += 1;
                }
                value = decode_entities(&html[value_start..index]);
            }
        }
        // htmlparser2 keeps the first occurrence of a duplicate attribute.
        if !attribute_name.is_empty()
            && !attribs
                .iter()
                .any(|(existing, _)| *existing == attribute_name)
        {
            attribs.push((attribute_name, value));
        }
    }
    Some(StartTag {
        name,
        attribs,
        end: index,
        self_closing,
    })
}

fn close_frame(frames: &mut Vec<Frame>, roots: &mut Vec<Element>, name: &str) {
    let Some(position) = frames.iter().rposition(|frame| frame.name == name) else {
        return;
    };
    while frames.len() > position {
        let frame = frames.pop().expect("frame present");
        let element = Element {
            attribs: frame.attribs,
            children: frame.children,
        };
        match frames.last_mut() {
            Some(parent) => parent.children.push(element),
            None => roots.push(element),
        }
    }
}

fn push_child(frames: &mut [Frame], roots: &mut Vec<Element>, element: Element) {
    match frames.last_mut() {
        Some(parent) => parent.children.push(element),
        None => roots.push(element),
    }
}

fn is_html_space(byte: u8) -> bool {
    matches!(byte, b'\t' | b'\n' | b'\x0c' | b'\r' | b' ')
}

fn find_bytes(bytes: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
    if from >= bytes.len() {
        return None;
    }
    bytes[from..]
        .windows(needle.len())
        .position(|window| window == needle)
        .map(|offset| from + offset)
}

/// Position of `</name` so the raw-text element closes through the normal path.
fn find_close_tag(bytes: &[u8], from: usize, name: &str) -> Option<usize> {
    let mut index = from;
    while let Some(offset) = find_bytes(bytes, index, b"</") {
        let after = offset + 2;
        let end = after + name.len();
        if end < bytes.len()
            && bytes[after..end].eq_ignore_ascii_case(name.as_bytes())
            && (is_html_space(bytes[end]) || matches!(bytes[end], b'>' | b'/'))
        {
            return Some(offset);
        }
        index = after;
    }
    None
}

/// Decode HTML attribute references, including optional semicolons and C1 replacements.
/// The static WHATWG table is extracted from Python's standard-library html.entities.html5.
fn decode_entities(value: &str) -> String {
    static ENTITIES: std::sync::OnceLock<std::collections::BTreeMap<String, String>> =
        std::sync::OnceLock::new();
    let entities = ENTITIES.get_or_init(|| {
        serde_json::from_str(include_str!("html-named-entities.json")).expect("HTML named entities")
    });
    let bytes = value.as_bytes();
    let mut out = String::with_capacity(value.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'&' {
            let character = value[index..].chars().next().expect("character");
            out.push(character);
            index += character.len_utf8();
            continue;
        }
        let start = index + 1;
        if bytes.get(start) == Some(&b'#') {
            let mut end = start + 1;
            let hex = matches!(bytes.get(end), Some(b'x' | b'X'));
            if hex {
                end += 1;
            }
            let digits = end;
            let mut code = 0u32;
            while let Some(digit) = bytes
                .get(end)
                .and_then(|b| (*b as char).to_digit(if hex { 16 } else { 10 }))
            {
                code = code
                    .saturating_mul(if hex { 16 } else { 10 })
                    .saturating_add(digit);
                end += 1;
            }
            if end > digits {
                const C1: [u32; 32] = [
                    0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030,
                    0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d,
                    0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e,
                    0x178,
                ];
                if (0x80..=0x9f).contains(&code) {
                    code = C1[(code - 0x80) as usize];
                }
                out.push(if code == 0 {
                    '\u{fffd}'
                } else {
                    char::from_u32(code).unwrap_or('\u{fffd}')
                });
                index = end + usize::from(bytes.get(end) == Some(&b';'));
                continue;
            }
        } else {
            let mut end = start;
            while bytes.get(end).is_some_and(u8::is_ascii_alphanumeric) && end - start < 32 {
                end += 1;
            }
            if bytes.get(end) == Some(&b';') {
                end += 1;
            }
            let mut found = None;
            for candidate in (start + 1..=end).rev() {
                if let Some(replacement) = entities.get(&value[start..candidate]) {
                    let terminated = bytes[candidate - 1] == b';';
                    let ambiguous = bytes
                        .get(candidate)
                        .is_some_and(|b| b.is_ascii_alphanumeric() || *b == b'=');
                    if terminated || !ambiguous {
                        found = Some((candidate, replacement));
                    }
                    break;
                }
            }
            if let Some((end, replacement)) = found {
                out.push_str(replacement);
                index = end;
                continue;
            }
        }
        out.push('&');
        index += 1;
    }
    out
}

/// The reference parser closes only matching frames at the top of its stack.
fn implies_close(open: &str, top: &str) -> bool {
    match open {
        "tr" => matches!(top, "tr" | "th" | "td"),
        "th" => top == "th",
        "td" => matches!(top, "thead" | "th" | "td"),
        "body" => matches!(top, "head" | "link" | "script"),
        "li" => top == "li",
        "select" | "input" | "output" | "button" | "datalist" | "textarea" => matches!(
            top,
            "input" | "option" | "optgroup" | "select" | "button" | "datalist" | "textarea"
        ),
        "option" => top == "option",
        "optgroup" => matches!(top, "optgroup" | "option"),
        "dd" | "dt" => matches!(top, "dd" | "dt"),
        "rt" | "rp" => matches!(top, "rt" | "rp"),
        "tbody" | "tfoot" => matches!(top, "thead" | "tbody"),
        "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "address" | "article" | "aside"
        | "blockquote" | "details" | "div" | "dl" | "fieldset" | "figcaption" | "figure"
        | "footer" | "form" | "header" | "hr" | "main" | "nav" | "ol" | "pre" | "section"
        | "table" | "ul" => top == "p",
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::future::BoxFuture;
    use serde_json::json;
    use std::{sync::Mutex, time::Duration};

    const EXPECTED: &str = concat!(
        "{\"limits\":{",
        "\"session\":{\"usage\":0.425,\"models\":[],\"resetsAt\":\"2026-10-09T12:00:00.000Z\"},",
        "\"weekly\":{\"usage\":0.81,\"models\":[],\"resetsAt\":\"2026-10-15T10:00:00.000Z\"}",
        "},\"source\":\"settings\"}"
    );

    fn settings_html() -> String {
        concat!(
            "<!doctype html><html><body>",
            "<div class=\"usage\"><div data-usage-meter>",
            "<div data-usage-track aria-label=\"Session usage: 42.5%\"></div>",
            "</div><span data-time=\"2026-10-09T12:00:00Z\"></span></div>",
            "<div class=\"usage\"><div data-usage-meter>",
            "<div data-usage-track aria-label='Weekly usage: 81%'></div>",
            "</div><span data-time=\"2026-10-15T10:00:00Z\"></span></div>",
            "</body></html>"
        )
        .to_string()
    }

    fn window() -> Value {
        json!({"status": "ok", "percent": 12, "resetsAt": "2026-10-09T12:00:00Z"})
    }

    fn usage_body() -> Value {
        json!({"usage": {
            "rolling": window(),
            "weekly": {"status": "rate-limited", "percent": 60.5, "resetsAt": "2026-10-16T00:00:00Z"},
            "monthly": {"status": "ok", "percent": 0, "resetsAt": "2026-11-09T00:00:00Z"}
        }})
    }

    struct Scripted {
        requests: Mutex<Vec<UsageRequest>>,
        responses: Mutex<VecDeque<Result<UsageResponse, String>>>,
    }

    fn scripted(responses: Vec<Result<UsageResponse, String>>) -> (Arc<Scripted>, UsageTransport) {
        let state = Arc::new(Scripted {
            requests: Mutex::new(Vec::new()),
            responses: Mutex::new(responses.into()),
        });
        let transport: UsageTransport = {
            let state = Arc::clone(&state);
            Arc::new(move |request: UsageRequest| {
                state.requests.lock().expect("requests").push(request);
                let response = state.responses.lock().expect("responses").pop_front();
                let future: BoxFuture<'static, Result<UsageResponse, String>> =
                    Box::pin(async move {
                        response.unwrap_or_else(|| Err("unexpected provider request".to_string()))
                    });
                future
            })
        };
        (state, transport)
    }

    impl Scripted {
        fn requests(&self) -> Vec<UsageRequest> {
            self.requests.lock().expect("requests").clone()
        }
    }

    /// Rewrites the fixed provider URL onto an owned loopback server.
    fn loopback(transport: UsageTransport, base: &str) -> UsageTransport {
        let base = base.to_string();
        Arc::new(move |request: UsageRequest| {
            let inner = Arc::clone(&transport);
            let base = base.clone();
            let url = match request.url.rsplit_once('/') {
                Some((_, last)) => format!("{base}/{last}"),
                None => request.url.clone(),
            };
            let future: BoxFuture<'static, Result<UsageResponse, String>> =
                Box::pin(async move { inner(UsageRequest { url, ..request }).await });
            future
        })
    }

    #[test]
    fn normalizes_the_session_cookie_like_the_reference() {
        assert_eq!(normalize_ollama_session("  abc  "), Ok("abc".to_string()));
        assert_eq!(
            normalize_ollama_session("__Secure-session=token"),
            Ok("token".to_string())
        );
        assert_eq!(
            normalize_ollama_session(" __Secure-session=token\n"),
            Ok("token".to_string())
        );
        assert_eq!(
            normalize_ollama_session("__Secure-session=__Secure-session=abc"),
            Ok("__Secure-session=abc".to_string())
        );
        assert_eq!(
            normalize_ollama_session(&"é".repeat(4096)),
            Ok("é".repeat(4096))
        );
        assert_eq!(
            normalize_ollama_session("\u{200b}"),
            Ok("\u{200b}".to_string())
        );
        for rejected in [
            "",
            "   ",
            "__Secure-session=",
            "a b",
            "a\tb",
            "a;b",
            "a,b",
            "a\u{00a0}b",
            "a\u{2028}b",
            "a\u{0000}b",
            "a\u{007f}",
        ] {
            assert_eq!(
                normalize_ollama_session(rejected),
                Err(INVALID_COOKIE.to_string()),
                "{rejected:?}"
            );
        }
        assert_eq!(
            normalize_ollama_session(&"a".repeat(4097)),
            Err(INVALID_COOKIE.to_string())
        );
    }

    #[test]
    fn parses_the_fixture_document_in_order() {
        let parsed = parse_ollama_settings_usage(&settings_html()).expect("parsed");
        assert_eq!(parsed.to_string(), EXPECTED);
    }

    #[test]
    fn matches_attribute_names_case_insensitively() {
        let html = concat!(
            "<DIV DATA-USAGE-METER><DIV DATA-USAGE-TRACK ARIA-LABEL=\"Session usage: 20%\"></DIV>",
            "</DIV><SPAN DATA-TIME=\"2026-10-09T12:00:00Z\"></SPAN>",
            "<DIV DATA-USAGE-METER><DIV DATA-USAGE-TRACK aria-label=\"Weekly 30%\"></DIV></DIV>",
            "<SPAN data-time=\"2026-10-15T10:00:00Z\"></SPAN>"
        );
        let parsed = parse_ollama_settings_usage(html).expect("parsed");
        assert_eq!(
            parsed.to_string(),
            concat!(
                "{\"limits\":{",
                "\"session\":{\"usage\":0.2,\"models\":[],\"resetsAt\":\"2026-10-09T12:00:00.000Z\"},",
                "\"weekly\":{\"usage\":0.3,\"models\":[],\"resetsAt\":\"2026-10-15T10:00:00.000Z\"}",
                "},\"source\":\"settings\"}"
            )
        );
    }

    #[test]
    fn decodes_entity_references_in_labels() {
        let html = concat!(
            "<div data-usage-meter>",
            "<div data-usage-track aria-label=\"Session usage: 42&#46;5%\"></div></div>",
            "<span data-time=\"2026-10-09T12:00:00Z\"></span>",
            "<div data-usage-meter>",
            "<div data-usage-track aria-label=\"Weekly&nbsp;usage: 100%\"></div></div>",
            "<span data-time=\"2026-10-15T10:00:00Z\"></span>"
        );
        let parsed = parse_ollama_settings_usage(html).expect("parsed");
        assert_eq!(
            parsed.to_string(),
            concat!(
                "{\"limits\":{",
                "\"session\":{\"usage\":0.425,\"models\":[],\"resetsAt\":\"2026-10-09T12:00:00.000Z\"},",
                "\"weekly\":{\"usage\":1,\"models\":[],\"resetsAt\":\"2026-10-15T10:00:00.000Z\"}",
                "},\"source\":\"settings\"}"
            )
        );
    }

    #[test]
    fn skips_tracks_without_a_known_name_or_a_bounded_percent() {
        for label in [
            "Monthly usage: 10%",
            "Session usage:42%",
            "Session usage",
            "Session usage: .5%",
            "Weekly usage: 10.5 %",
            "Session 10% weekly 20%",
            "",
        ] {
            let html = format!(
                "<div data-usage-meter><div data-usage-track aria-label=\"{label}\"></div></div>\
                 <span data-time=\"2026-10-09T12:00:00Z\"></span>"
            );
            assert_eq!(
                parse_ollama_settings_usage(&html),
                Err(MISSING_METERS.to_string()),
                "{label:?}"
            );
        }
    }

    #[test]
    fn rejects_out_of_range_and_duplicate_meters() {
        for percent in ["100.1", "1000", "99999999999999999999999999999999999999999"] {
            let html = format!(
                "<div data-usage-meter><div data-usage-track aria-label=\"Session usage: {percent}%\"></div></div>\
                 <div data-usage-meter><div data-usage-track aria-label=\"Weekly usage: 10%\"></div></div>"
            );
            assert_eq!(
                parse_ollama_settings_usage(&html),
                Err(INVALID_METERS.to_string()),
                "{percent}"
            );
        }
        let duplicate = concat!(
            "<div data-usage-meter><div data-usage-track aria-label=\"Session usage: 10%\"></div></div>",
            "<div data-usage-meter><div data-usage-track aria-label=\"Session usage: 20%\"></div></div>",
            "<div data-usage-meter><div data-usage-track aria-label=\"Weekly usage: 30%\"></div></div>"
        );
        assert_eq!(
            parse_ollama_settings_usage(duplicate),
            Err(INVALID_METERS.to_string())
        );
    }

    #[test]
    fn requires_both_session_and_weekly_meters() {
        let only_session = concat!(
            "<div data-usage-meter>",
            "<div data-usage-track aria-label=\"Session usage: 10%\"></div></div>"
        );
        assert_eq!(
            parse_ollama_settings_usage(only_session),
            Err(MISSING_METERS.to_string())
        );
        assert_eq!(
            parse_ollama_settings_usage("<html><body>signed in</body></html>"),
            Err(MISSING_METERS.to_string())
        );
    }

    #[test]
    fn guards_the_document_length_in_utf16_units() {
        assert_eq!(
            parse_ollama_settings_usage(&"x".repeat(MAX_RESPONSE_BYTES + 1)),
            Err(TOO_LARGE.to_string())
        );
        // One million and one code points: two million bytes, but under the unit cap.
        let wide = "é".repeat(MAX_RESPONSE_BYTES / 2 + 1);
        assert_eq!(
            parse_ollama_settings_usage(&wide),
            Err(MISSING_METERS.to_string())
        );
    }

    #[test]
    fn resolves_the_reset_time_from_the_meter_sibling() {
        let beside_the_track = concat!(
            "<div data-usage-meter>",
            "<div data-usage-track aria-label=\"Session usage: 10%\"></div>",
            "<span data-time=\"2026-02-02T00:00:00Z\"></span></div>",
            "<span data-time=\"2026-01-01T00:00:00Z\"></span>",
            "<div data-usage-meter><div data-usage-track aria-label=\"Weekly usage: 20%\"></div></div>",
            "<span data-time=\"soon\"></span>"
        );
        let parsed = parse_ollama_settings_usage(beside_the_track).expect("parsed");
        assert_eq!(
            parsed["limits"]["session"]["resetsAt"],
            json!("2026-01-01T00:00:00.000Z"),
            "the meter's following sibling wins over a nested timestamp"
        );
        assert_eq!(parsed["limits"]["weekly"]["resetsAt"], Value::Null);

        let unmetered = concat!(
            "<div data-usage-track aria-label=\"Session usage: 10%\"></div>",
            "<span data-time=\"2026-10-09T12:00:00Z\"></span>",
            "<div data-usage-meter><div data-usage-track aria-label=\"Weekly usage: 20%\"></div></div>",
            "<span data-time=\"2026-10-15T10:00:00Z\"></span>"
        );
        let parsed = parse_ollama_settings_usage(unmetered).expect("parsed");
        assert_eq!(
            parsed["limits"]["session"]["resetsAt"],
            Value::Null,
            "a track without a meter has no reset time"
        );
        assert_eq!(
            parsed["limits"]["weekly"]["resetsAt"],
            json!("2026-10-15T10:00:00.000Z")
        );
    }

    #[test]
    fn accepts_date_only_and_offsetless_timestamps_in_utc_host_zone() {
        let html = concat!(
            "<div data-usage-meter><div data-usage-track aria-label=\"Session usage: 10%\"></div></div>",
            "<span data-time=\"2026-10-09\"></span>",
            "<div data-usage-meter><div data-usage-track aria-label=\"Weekly usage: 20%\"></div></div>",
            "<span data-time=\"2026-10-15T10:00:00+02:00\"></span>"
        );
        let parsed = parse_ollama_settings_usage(html).expect("parsed");
        assert_eq!(
            parsed["limits"]["session"]["resetsAt"],
            json!("2026-10-09T00:00:00.000Z")
        );
        assert_eq!(
            parsed["limits"]["weekly"]["resetsAt"],
            json!("2026-10-15T08:00:00.000Z")
        );
    }

    #[test]
    fn keeps_the_first_duplicate_attribute_and_ignores_raw_text_tracks() {
        let html = concat!(
            "<script>var markup = '<div data-usage-track aria-label=\"Session usage: 99%\">';</script>",
            "<div data-usage-meter>",
            "<div data-usage-track aria-label=\"Session usage: 10%\" aria-label=\"Weekly usage: 20%\"></div>",
            "</div><span data-time=\"2026-10-09T12:00:00Z\"></span>",
            "<div data-usage-meter><div data-usage-track aria-label=\"Weekly usage: 20%\"></div></div>",
            "<span data-time=\"2026-10-15T10:00:00Z\"></span>"
        );
        let parsed = parse_ollama_settings_usage(html).expect("parsed");
        assert_eq!(parsed["limits"]["session"]["usage"], json!(0.1));
        assert_eq!(parsed["limits"]["weekly"]["usage"], json!(0.2));
    }

    #[test]
    fn formats_quotients_like_javascript() {
        assert_eq!(js_number(1.0).to_string(), "1");
        assert_eq!(js_number(0.0).to_string(), "0");
        assert_eq!(js_number(0.425).to_string(), "0.425");
        assert_eq!(js_number(0.81).to_string(), "0.81");
        assert_eq!(js_number(0.075).to_string(), "0.075");
    }

    #[test]
    fn replaces_incomplete_utf8_sequences_once_at_the_end() {
        let mut decoder = Utf8Stream::default();
        let mut out = String::new();
        decoder.push(&[0x61, 0xe2, 0x82], true, &mut out);
        assert_eq!(out, "a");
        decoder.push(&[0xac, 0xff], true, &mut out);
        assert_eq!(out, "a€\u{fffd}");
        decoder.push(&[0xf0, 0x9f], true, &mut out);
        decoder.finish(&mut out);
        assert_eq!(out, "a€\u{fffd}\u{fffd}");
    }

    #[tokio::test]
    async fn open_code_go_returns_the_body_and_sends_the_reference_request() {
        let body = usage_body();
        let (state, transport) = scripted(vec![Ok(UsageResponse::with_chunks(
            200,
            vec![body.to_string().into_bytes()],
        ))]);
        assert_eq!(
            fetch_open_code_go_usage(&transport, "go-key").await,
            Ok(body)
        );
        assert_eq!(
            state.requests(),
            vec![UsageRequest {
                url: OPEN_CODE_GO_URL.to_string(),
                method: "GET",
                redirect: Redirect::Error,
                headers: vec![
                    ("Authorization".to_string(), "Bearer go-key".to_string()),
                    ("Accept".to_string(), "application/json".to_string()),
                ],
                timeout_ms: REQUEST_TIMEOUT_MS,
            }]
        );
    }

    #[tokio::test]
    async fn open_code_go_rejects_malformed_usage() {
        let incomplete = json!({"usage": {"rolling": window(), "weekly": window()}});
        let malformed = [
            json!(null),
            json!({}),
            json!({"usage": []}),
            json!({"usage": null}),
            incomplete,
            json!({"usage": {"rolling": window(), "weekly": null, "monthly": window()}}),
            json!({"usage": {"rolling": {"status": "ok", "percent": "20", "resetsAt": "2026-10-09T12:00:00Z"}, "weekly": window(), "monthly": window()}}),
            json!({"usage": {"rolling": {"status": "limited", "percent": 20, "resetsAt": "2026-10-09T12:00:00Z"}, "weekly": window(), "monthly": window()}}),
            json!({"usage": {"rolling": {"status": "ok", "percent": -1, "resetsAt": "2026-10-09T12:00:00Z"}, "weekly": window(), "monthly": window()}}),
            json!({"usage": {"rolling": {"status": "ok", "percent": 20}, "weekly": window(), "monthly": window()}}),
            json!({"usage": {"rolling": {"status": "ok", "percent": 20, "resetsAt": "soon"}, "weekly": window(), "monthly": window()}}),
        ];
        for body in malformed {
            let (_, transport) = scripted(vec![Ok(UsageResponse::with_chunks(
                200,
                vec![body.to_string().into_bytes()],
            ))]);
            assert_eq!(
                fetch_open_code_go_usage(&transport, "go-key").await,
                Err(UNEXPECTED_USAGE.to_string()),
                "{body}"
            );
        }
    }

    #[tokio::test]
    async fn open_code_go_requires_a_json_document() {
        let (_, transport) = scripted(vec![Ok(UsageResponse::new(200))]);
        assert_eq!(
            fetch_open_code_go_usage(&transport, "go-key").await,
            Err("Unexpected end of JSON input".to_string())
        );
        let (_, transport) = scripted(vec![Ok(UsageResponse::with_chunks(
            200,
            vec![b"  ".to_vec()],
        ))]);
        assert_eq!(
            fetch_open_code_go_usage(&transport, "go-key").await,
            Err("Unexpected end of JSON input".to_string())
        );
        let (_, transport) = scripted(vec![Ok(UsageResponse::with_chunks(
            200,
            vec![b"{\"usage\":".to_vec()],
        ))]);
        assert!(
            fetch_open_code_go_usage(&transport, "go-key")
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn open_code_go_maps_statuses_without_echoing_the_body() {
        for (status, message) in [
            (401, OPEN_CODE_GO_REJECTED),
            (403, OPEN_CODE_GO_NO_SUBSCRIPTION),
            (429, "OpenCode Go usage request failed (429)."),
            (500, "OpenCode Go usage request failed (500)."),
        ] {
            let (_, transport) = scripted(vec![Ok(UsageResponse::with_chunks(
                status,
                vec![b"private-provider-details".to_vec()],
            ))]);
            let error = fetch_open_code_go_usage(&transport, "go-key")
                .await
                .expect_err("status rejected");
            assert_eq!(error, message);
            assert!(!error.contains("private-provider-details"));
            assert!(!error.contains("go-key"));
        }
    }

    #[tokio::test]
    async fn open_code_go_bounds_the_json_body() {
        let (_, transport) = scripted(vec![Ok(UsageResponse::with_chunks(
            200,
            vec![vec![b' '; MAX_OPEN_CODE_GO_BYTES + 1]],
        ))]);
        assert_eq!(
            fetch_open_code_go_usage(&transport, "go-key").await,
            Err(OPEN_CODE_GO_TOO_LARGE.to_string())
        );
    }

    #[tokio::test]
    async fn open_code_go_propagates_transport_failures() {
        let (_, transport) = scripted(vec![Err("operation timed out".to_string())]);
        assert_eq!(
            fetch_open_code_go_usage(&transport, "go-key").await,
            Err("operation timed out".to_string())
        );
    }

    #[tokio::test]
    async fn concurrent_fetches_keep_credentials_separate() {
        let body = usage_body();
        let text = body.to_string().into_bytes();
        let (state, transport) = scripted(vec![
            Ok(UsageResponse::with_chunks(200, vec![text.clone()])),
            Ok(UsageResponse::with_chunks(200, vec![text])),
        ]);
        let (first, second) = tokio::join!(
            fetch_open_code_go_usage(&transport, "key-one"),
            fetch_open_code_go_usage(&transport, "key-two"),
        );
        assert_eq!(first, Ok(body.clone()));
        assert_eq!(second, Ok(body));
        let requests = state.requests();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].headers[0].1, "Bearer key-one");
        assert_eq!(requests[1].headers[0].1, "Bearer key-two");
    }

    #[tokio::test]
    async fn settings_fetch_streams_and_parses_the_meters() {
        let html = settings_html();
        let bytes = html.as_bytes();
        let split = bytes.len() / 3;
        let chunks = vec![
            bytes[..split].to_vec(),
            bytes[split..split * 2].to_vec(),
            bytes[split * 2..].to_vec(),
        ];
        let (state, transport) = scripted(vec![Ok(UsageResponse::with_chunks(200, chunks))]);
        let parsed = fetch_ollama_settings_usage(&transport, " private-session ")
            .await
            .expect("parsed");
        assert_eq!(parsed.to_string(), EXPECTED);
        assert_eq!(
            state.requests(),
            vec![UsageRequest {
                url: OLLAMA_SETTINGS_URL.to_string(),
                method: "GET",
                redirect: Redirect::Manual,
                headers: vec![
                    (
                        "Cookie".to_string(),
                        "__Secure-session=private-session".to_string()
                    ),
                    ("Accept".to_string(), "text/html".to_string()),
                ],
                timeout_ms: REQUEST_TIMEOUT_MS,
            }]
        );
    }

    #[tokio::test]
    async fn settings_fetch_validates_the_session_before_requesting() {
        let (state, transport) = scripted(Vec::new());
        assert_eq!(
            fetch_ollama_settings_usage(&transport, "private session").await,
            Err(INVALID_COOKIE.to_string())
        );
        assert!(state.requests().is_empty());
    }

    #[tokio::test]
    async fn settings_fetch_requires_a_body() {
        for status in [200, 204] {
            let (_, transport) = scripted(vec![Ok(UsageResponse::new(status))]);
            assert_eq!(
                fetch_ollama_settings_usage(&transport, "session").await,
                Err(EMPTY_SETTINGS.to_string()),
                "{status}"
            );
        }
    }

    #[tokio::test]
    async fn settings_fetch_maps_statuses() {
        for status in [301, 302, 303, 307, 308, 401, 403] {
            let (_, transport) = scripted(vec![Ok(UsageResponse::with_chunks(
                status,
                vec![b"<html>login</html>".to_vec()],
            ))]);
            let error = fetch_ollama_settings_usage(&transport, "session")
                .await
                .expect_err("rejected");
            assert_eq!(error, EXPIRED_SESSION, "{status}");
        }
        for status in [400, 429, 500, 502] {
            let (_, transport) = scripted(vec![Ok(UsageResponse::with_chunks(
                status,
                vec![b"<html>oops</html>".to_vec()],
            ))]);
            assert_eq!(
                fetch_ollama_settings_usage(&transport, "session").await,
                Err(format!("Ollama settings request failed ({status}).")),
                "{status}"
            );
        }
    }

    #[tokio::test]
    async fn settings_fetch_caps_streamed_bytes() {
        let body = UsageBody::scripted(
            vec![
                Ok(Some(vec![b'x'; MAX_RESPONSE_BYTES])),
                Ok(Some(vec![b'x'])),
            ],
            Ok(()),
        );
        let (_, transport) = scripted(vec![Ok(UsageResponse::with_body(200, body))]);
        assert_eq!(
            fetch_ollama_settings_usage(&transport, "session").await,
            Err(TOO_LARGE.to_string())
        );
    }

    #[tokio::test]
    async fn settings_fetch_cancels_even_when_parsing_fails() {
        let body = UsageBody::scripted(
            vec![Ok(Some(
                b"<div data-usage-meter><div data-usage-track aria-label=\"Session usage: 10%\"></div></div>"
                    .to_vec(),
            ))],
            Err("cancel refused".to_string()),
        );
        let (_, transport) = scripted(vec![Ok(UsageResponse::with_body(200, body))]);
        assert_eq!(
            fetch_ollama_settings_usage(&transport, "session").await,
            Err("cancel refused".to_string())
        );
    }

    #[tokio::test]
    async fn settings_fetch_propagates_body_failures() {
        let body = UsageBody::scripted(
            vec![
                Ok(Some(b"<div".to_vec())),
                Err("connection reset".to_string()),
            ],
            Ok(()),
        );
        let (_, transport) = scripted(vec![Ok(UsageResponse::with_body(200, body))]);
        assert_eq!(
            fetch_ollama_settings_usage(&transport, "session").await,
            Err("connection reset".to_string())
        );
    }

    #[tokio::test]
    async fn settings_fetch_decodes_utf8_split_across_chunks() {
        let html = format!("<p title=\"héllo\">{}</p>", settings_html());
        let bytes = html.as_bytes();
        let split = html.find('é').expect("character present") + 1;
        let chunks = vec![bytes[..split].to_vec(), bytes[split..].to_vec()];
        let (_, transport) = scripted(vec![Ok(UsageResponse::with_chunks(200, chunks))]);
        let parsed = fetch_ollama_settings_usage(&transport, "session")
            .await
            .expect("parsed");
        assert_eq!(parsed.to_string(), EXPECTED);
    }

    #[tokio::test]
    async fn native_transport_refuses_redirects_and_returns_them_in_manual_mode() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let address = listener.local_addr().expect("address");
        let redirected = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let redirect_address = redirected.local_addr().expect("address");
        let server = tokio::spawn(async move {
            for _ in 0..2 {
                let (mut socket, _) = listener.accept().await.expect("accept");
                let mut request = [0_u8; 2048];
                assert!(socket.read(&mut request).await.expect("read") > 0);
                socket
                    .write_all(
                        format!(
                            "HTTP/1.1 302 Found\r\nLocation: http://{redirect_address}/forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        )
                        .as_bytes(),
                    )
                    .await
                    .expect("write");
            }
        });
        let transport = native_transport().expect("transport");
        let strict = transport(UsageRequest {
            url: format!("http://{address}/settings"),
            method: "GET",
            redirect: Redirect::Error,
            headers: Vec::new(),
            timeout_ms: 2_000,
        })
        .await;
        assert!(strict.is_err(), "redirect: error must reject the fetch");
        let manual = transport(UsageRequest {
            url: format!("http://{address}/settings"),
            method: "GET",
            redirect: Redirect::Manual,
            headers: Vec::new(),
            timeout_ms: 2_000,
        })
        .await
        .expect("manual response");
        assert_eq!(manual.status, 302);
        drop(manual);
        assert!(
            tokio::time::timeout(Duration::from_secs(5), server)
                .await
                .expect("both requests reached the loopback server")
                .is_ok()
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(100), redirected.accept())
                .await
                .is_err(),
            "the redirected host must never be contacted"
        );
    }

    #[tokio::test]
    async fn native_transport_applies_the_deadline() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let address = listener.local_addr().expect("address");
        let server = tokio::spawn(async move {
            let (_socket, _) = listener.accept().await.expect("accept");
            tokio::time::sleep(Duration::from_millis(1_500)).await;
        });
        let transport = native_transport().expect("transport");
        let started = std::time::Instant::now();
        let result = transport(UsageRequest {
            url: format!("http://{address}/settings"),
            method: "GET",
            redirect: Redirect::Manual,
            headers: Vec::new(),
            timeout_ms: 150,
        })
        .await;
        assert!(result.is_err(), "a hanging provider must fail the request");
        assert!(started.elapsed() < Duration::from_millis(1_400));
        server.abort();
    }

    #[tokio::test]
    async fn loopback_settings_fetch_sends_the_cookie_and_parses() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let address = listener.local_addr().expect("address");
        let html = settings_html();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept");
            let mut request = vec![0_u8; 4096];
            let received = socket.read(&mut request).await.expect("read");
            let text = String::from_utf8_lossy(&request[..received]).to_lowercase();
            assert!(text.starts_with("get /settings http/1.1\r\n"), "{text}");
            assert!(
                text.contains("cookie: __secure-session=fixture-session\r\n"),
                "{text}"
            );
            assert!(text.contains("accept: text/html\r\n"), "{text}");
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
                html.len()
            );
            socket.write_all(response.as_bytes()).await.expect("write");
        });
        let transport = loopback(
            native_transport().expect("transport"),
            &format!("http://{address}"),
        );
        let parsed = fetch_ollama_settings_usage(&transport, "fixture-session")
            .await
            .expect("parsed");
        assert_eq!(parsed.to_string(), EXPECTED);
        server.await.expect("server");
    }

    #[tokio::test]
    async fn loopback_settings_fetch_reports_an_expired_session() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let address = listener.local_addr().expect("address");
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept");
            let mut request = [0_u8; 4096];
            assert!(socket.read(&mut request).await.expect("read") > 0);
            socket
                .write_all(
                    b"HTTP/1.1 302 Found\r\nLocation: /login\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await
                .expect("write");
        });
        let transport = loopback(
            native_transport().expect("transport"),
            &format!("http://{address}"),
        );
        assert_eq!(
            fetch_ollama_settings_usage(&transport, "fixture-session").await,
            Err(EXPIRED_SESSION.to_string())
        );
        server.await.expect("server");
    }

    #[tokio::test]
    async fn loopback_settings_fetch_stops_an_oversized_response() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let address = listener.local_addr().expect("address");
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept");
            let mut request = [0_u8; 4096];
            assert!(socket.read(&mut request).await.expect("read") > 0);
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 2000100\r\nConnection: close\r\n\r\n",
                )
                .await
                .expect("write");
            let filler = vec![b'x'; 64 * 1024];
            for _ in 0..31 {
                if socket.write_all(&filler).await.is_err() {
                    return;
                }
            }
        });
        let transport = loopback(
            native_transport().expect("transport"),
            &format!("http://{address}"),
        );
        assert_eq!(
            fetch_ollama_settings_usage(&transport, "fixture-session").await,
            Err(TOO_LARGE.to_string())
        );
        server.abort();
    }

    #[tokio::test]
    async fn loopback_open_code_go_fetch_returns_the_json_body() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let address = listener.local_addr().expect("address");
        let body = usage_body().to_string();
        let expected = usage_body();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept");
            let mut request = vec![0_u8; 4096];
            let received = socket.read(&mut request).await.expect("read");
            let text = String::from_utf8_lossy(&request[..received]).to_lowercase();
            assert!(text.starts_with("get /usage http/1.1\r\n"), "{text}");
            assert!(text.contains("authorization: bearer go-key\r\n"), "{text}");
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.expect("write");
        });
        let transport = loopback(
            native_transport().expect("transport"),
            &format!("http://{address}"),
        );
        assert_eq!(
            fetch_open_code_go_usage(&transport, "go-key").await,
            Ok(expected)
        );
        server.await.expect("server");
    }
}
