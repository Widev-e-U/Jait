//! Native port of `packages/gateway/src/services/jait-models.ts`.
//!
//! The TypeScript service is a pure routing/decoration layer: it never performs
//! HTTP itself. Every network read crosses the `model-fetchers` boundary, so the
//! boundary is modelled here as the injected [`ModelFetchers`] trait. That trait is
//! the *seam for a separate native model-fetchers component*; this module owns no
//! HTTP client, no cache, no timeout and claims no HTTP-engine credit.
//!
//! Ported surface:
//!   * [`list_jait_models`] — legacy (environment-style) vs configured routing.
//!   * [`parse_jait_backend_instances`] — `parseJaitBackendInstances` (shared).
//!   * [`normalize_jait_backend_base_url`] — `normalizeJaitBackendBaseUrl` (shared).
//!   * [`encode_jait_model_id`] / [`decode_jait_model_id`] — `jait://` model ids.
//!   * [`openrouter_static_models`] — the `OPENROUTER_MODELS` catalogue used as the
//!     OpenRouter fallback, copied verbatim from `providers/jait-provider.ts` and
//!     pinned by the differential test against the real module.
//!
//! Behavioural notes that follow the reference exactly:
//!   * Legacy routing issues four fetches per call, all started before the first is
//!     awaited (`Promise.all` of four already-running async IIFEs); results keep the
//!     fixed source order OpenAI, OpenRouter, Ollama, OmniRoute and errors degrade to
//!     `[]` per source.
//!   * Configured routing issues one fetch per instance concurrently and keeps the
//!     configured instance order.
//!   * A source error never propagates; the reference only rejects if the lazily
//!     imported static catalogue fails to load or a model id cannot be percent
//!     encoded. Native has static data and always-encodable `&str`, so this port is
//!     infallible (documented gap, see the lane review).

use crate::text::js_trim;
use futures_util::future::join_all;
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use serde::{Deserialize, Serialize, Serializer};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::future::Future;
use std::pin::Pin;

/// Prefix for ids that carry their owning backend instance.
pub const JAIT_MODEL_ID_PREFIX: &str = "jait://";
/// Historic OpenAI base URL used when neither an override nor config supplies one.
pub const OPENAI_DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

/// The backends the built-in Jait provider can route to.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
pub enum JaitBackend {
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "openrouter")]
    OpenRouter,
    #[serde(rename = "ollama")]
    Ollama,
    #[serde(rename = "omniroute")]
    OmniRoute,
    #[serde(rename = "gemini")]
    Gemini,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "grok")]
    Grok,
    #[serde(rename = "perplexity")]
    Perplexity,
    #[serde(rename = "moonshot")]
    Moonshot,
    #[serde(rename = "kimi")]
    Kimi,
    #[serde(rename = "vllm")]
    Vllm,
    #[serde(rename = "opencode-go")]
    OpenCodeGo,
}

impl JaitBackend {
    /// Declaration order of `JAIT_BACKENDS` in `packages/shared/src/types/thread.ts`.
    pub const ALL: [Self; 12] = [
        Self::OpenAi,
        Self::OpenRouter,
        Self::Ollama,
        Self::OmniRoute,
        Self::Gemini,
        Self::Anthropic,
        Self::Grok,
        Self::Perplexity,
        Self::Moonshot,
        Self::Kimi,
        Self::Vllm,
        Self::OpenCodeGo,
    ];

    /// Wire/config spelling (`isJaitBackend` accepts exactly these).
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::OpenRouter => "openrouter",
            Self::Ollama => "ollama",
            Self::OmniRoute => "omniroute",
            Self::Gemini => "gemini",
            Self::Anthropic => "anthropic",
            Self::Grok => "grok",
            Self::Perplexity => "perplexity",
            Self::Moonshot => "moonshot",
            Self::Kimi => "kimi",
            Self::Vllm => "vllm",
            Self::OpenCodeGo => "opencode-go",
        }
    }

    /// `isJaitBackend`.
    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|backend| backend.as_str() == value)
    }

    /// `BACKEND_LABELS` in `jait-models.ts`.
    pub const fn label(self) -> &'static str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::OpenRouter => "OpenRouter",
            Self::Ollama => "Ollama",
            Self::OmniRoute => "OmniRoute",
            Self::Gemini => "Gemini",
            Self::Anthropic => "Anthropic",
            Self::Grok => "Grok",
            Self::Perplexity => "Perplexity",
            Self::Moonshot => "Moonshot",
            Self::Kimi => "Kimi",
            Self::Vllm => "vLLM",
            Self::OpenCodeGo => "OpenCode Go",
        }
    }

    /// `OPENAI_COMPATIBLE_BACKENDS`: backends probed through the OpenAI `/models` shape.
    pub const fn is_openai_compatible(self) -> bool {
        matches!(
            self,
            Self::OpenAi
                | Self::Gemini
                | Self::Anthropic
                | Self::Grok
                | Self::Perplexity
                | Self::Moonshot
                | Self::Kimi
                | Self::Vllm
                | Self::OpenCodeGo
        )
    }
}

/// One selectable reasoning effort (`ProviderModelInfo["supportedReasoningEfforts"][number]`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningEffort {
    pub reasoning_effort: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, flatten)]
    pub extra: Map<String, Value>,
}

/// `ProviderModelInfo` from `packages/shared/src/types/thread.ts`.
///
/// Unknown properties are retained in [`ProviderModelInfo::extra`] so the reference
/// property-spread (`{ ...model, id, group, description }`) keeps every field instead
/// of silently dropping the ones this component does not interpret.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelInfo {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort_supported: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supported_reasoning_efforts: Option<Vec<ReasoningEffort>>,
    #[serde(default, flatten)]
    pub extra: Map<String, Value>,
}

impl ProviderModelInfo {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            ..Self::default()
        }
    }

    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    pub fn with_group(mut self, group: impl Into<String>) -> Self {
        self.group = Some(group.into());
        self
    }

    pub fn with_default(mut self, is_default: bool) -> Self {
        self.is_default = Some(is_default);
        self
    }

    pub fn with_reasoning_effort_supported(mut self, supported: bool) -> Self {
        self.reasoning_effort_supported = Some(supported);
        self
    }
}

/// `JaitBackendInstanceConfig` from `packages/shared/src/jait-backends.ts`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JaitBackendInstanceConfig {
    pub id: String,
    #[serde(rename = "type")]
    pub backend: JaitBackend,
    pub name: String,
    pub base_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// A JS `number`: `Number.isInteger(v) && v >= 2048` has no upper bound, so values
    /// above `2^53` and above `u64::MAX` (`1e300`) are all legal.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        serialize_with = "serialize_js_number"
    )]
    pub num_ctx: Option<f64>,
}

/// The slice of `AppConfig` that `jait-models.ts` reads.
///
/// Deliberately a projection rather than the whole configuration type: this component
/// touches exactly these five values, and a projection keeps the seam honest.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct JaitModelsConfig {
    pub openai_api_key: String,
    pub openai_base_url: String,
    pub ollama_url: String,
    pub omniroute_base_url: String,
    pub omniroute_api_key: String,
}

impl Default for JaitModelsConfig {
    /// Mirrors `DEFAULT_CONFIG` in `packages/gateway/src/config.ts`.
    fn default() -> Self {
        Self {
            openai_api_key: String::new(),
            openai_base_url: OPENAI_DEFAULT_BASE_URL.to_string(),
            ollama_url: "http://localhost:11434".to_string(),
            omniroute_base_url: "http://localhost:20128/v1".to_string(),
            omniroute_api_key: String::new(),
        }
    }
}

/// `ListJaitModelsOptions`.
#[derive(Clone, Copy, Debug)]
pub struct ListJaitModelsOptions<'a> {
    pub config: &'a JaitModelsConfig,
    pub api_keys: Option<&'a HashMap<String, String>>,
    pub fallback_models: &'a [ProviderModelInfo],
    pub include_cloud: Option<bool>,
}

impl<'a> ListJaitModelsOptions<'a> {
    fn api_key(&self, name: &str) -> Option<&'a str> {
        self.api_keys
            .and_then(|keys| keys.get(name))
            .map(String::as_str)
    }
}

/// Failure reported by an injected model fetcher. The reference discards fetch errors
/// entirely; the type exists so adapters can report why a catalogue is empty.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ModelFetchError {
    pub message: String,
}

impl ModelFetchError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ModelFetchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ModelFetchError {}

/// Boxed future returned by the fetch seam (kept object-safe for `&dyn` injection).
pub type ModelFetchFuture<'a> =
    Pin<Box<dyn Future<Output = Result<Vec<ProviderModelInfo>, ModelFetchError>> + Send + 'a>>;

/// Boundary owned by the separate model-fetchers component.
///
/// The four methods are exactly the four `model-fetchers.ts` exports that
/// `jait-models.ts` calls, with the same argument order and the same error channel.
pub trait ModelFetchers: Send + Sync {
    fn fetch_openai<'a>(&'a self, api_key: &'a str, base_url: &'a str) -> ModelFetchFuture<'a>;
    fn fetch_openrouter<'a>(&'a self, api_key: &'a str) -> ModelFetchFuture<'a>;
    fn fetch_ollama<'a>(&'a self, base_url: &'a str) -> ModelFetchFuture<'a>;
    /// Ollama catalogue with an explicit hosted-cloud toggle.
    ///
    /// Mirrors `fetchOllamaModels(url, { includeCloud })` in the reference
    /// implementation. The default body keeps existing implementors source
    /// compatible and simply delegates to [`ModelFetchers::fetch_ollama`].
    fn fetch_ollama_with<'a>(
        &'a self,
        base_url: &'a str,
        _include_cloud: bool,
    ) -> ModelFetchFuture<'a> {
        self.fetch_ollama(base_url)
    }
    fn fetch_omniroute<'a>(&'a self, api_key: &'a str, base_url: &'a str) -> ModelFetchFuture<'a>;
}

// ---------------------------------------------------------------------------
// Shared helpers (`packages/shared/src/jait-backends.ts`)
// ---------------------------------------------------------------------------

/// `encodeURIComponent` unescaped set: `A-Za-z0-9 - _ . ! ~ * ' ( )`.
const COMPONENT_SET: AsciiSet = NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

fn encode_uri_component(value: &str) -> String {
    utf8_percent_encode(value, &COMPONENT_SET).to_string()
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// `decodeURIComponent`: malformed escapes and non-UTF-8 sequences are errors (`None`).
fn decode_uri_component(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return None;
            }
            let high = hex_digit(bytes[index + 1])?;
            let low = hex_digit(bytes[index + 2])?;
            decoded.push(high * 16 + low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

/// `encodeJaitModelId`.
pub fn encode_jait_model_id(backend: JaitBackend, instance_id: &str, model: &str) -> String {
    format!(
        "{JAIT_MODEL_ID_PREFIX}{}/{}/{}",
        backend.as_str(),
        encode_uri_component(instance_id),
        encode_uri_component(model)
    )
}

/// Result of [`decode_jait_model_id`].
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedJaitModelId {
    pub backend: JaitBackend,
    pub instance_id: String,
    pub model: String,
}

/// `decodeJaitModelId`. Ported alongside [`encode_jait_model_id`] so the id scheme is
/// covered in both directions even though `jait-models.ts` only encodes.
pub fn decode_jait_model_id(value: &str) -> Option<DecodedJaitModelId> {
    let encoded = value.strip_prefix(JAIT_MODEL_ID_PREFIX)?;
    let (backend, instance_and_model) = encoded.split_once('/')?;
    if backend.is_empty() {
        return None;
    }
    let backend = JaitBackend::parse(backend)?;
    let (instance, model) = instance_and_model.split_once('/')?;
    if instance.is_empty() || model.is_empty() {
        return None;
    }
    let instance_id = decode_uri_component(instance)?;
    let model = decode_uri_component(model)?;
    if instance_id.is_empty() || model.is_empty() {
        return None;
    }
    Some(DecodedJaitModelId {
        backend,
        instance_id,
        model,
    })
}

/// `^[a-zA-Z][a-zA-Z0-9+.-]*://`
fn has_scheme(url: &str) -> bool {
    let bytes = url.as_bytes();
    if bytes.first().is_none_or(|byte| !byte.is_ascii_alphabetic()) {
        return false;
    }
    let Some(colon) = bytes.iter().position(|byte| *byte == b':') else {
        return false;
    };
    if colon == 0
        || !bytes[1..colon]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'-' | b'.'))
    {
        return false;
    }
    url[colon + 1..].starts_with("//")
}

/// `normalizeJaitBackendBaseUrl`: trim, drop trailing slashes, default a bare host to
/// `http://`, and append `/v1` for a vLLM URL that has no path beyond the root.
pub fn normalize_jait_backend_base_url(raw: &str, backend: Option<JaitBackend>) -> String {
    let trimmed = js_trim(raw).trim_end_matches('/');
    if trimmed.is_empty() {
        return String::new();
    }
    let mut url = trimmed.to_string();
    if !has_scheme(&url) {
        url = format!("http://{url}");
    }
    if backend == Some(JaitBackend::Vllm)
        && let Ok(parsed) = url::Url::parse(&url)
        && (parsed.path().is_empty() || parsed.path() == "/")
    {
        return format!("{}/v1", url.trim_end_matches('/'));
    }
    url
}

/// `Number(value)` — ECMAScript `ToNumber`, including the throwing `ToPrimitive` path.
///
/// The reference reads `numCtx` from unvalidated JSON, so every coercion path is live:
/// `typeof record.numCtx === "number" ? record.numCtx : Number(record.numCtx)`. Arrays go
/// through `Array.prototype.toString`, which joins elements with `,` and recurses into
/// nested arrays (`Number([]) === 0`, `Number(["2048"]) === 2048`, `Number([[2048]]) ===
/// 2048`, `Number([1,2]) === NaN`, `Number([null]) === 0`, `Number([[]]) === 0`).
///
/// A JSON object has no callable `valueOf`, so `OrdinaryToPrimitive` skips it; when the
/// object also carries an own `toString` — which in JSON can only be a non-callable
/// value — both candidates are exhausted and `ToPrimitive` raises a `TypeError`. That
/// throw is observable: `parseJaitBackendInstances` wraps the whole loop in `try`, and the
/// coercion runs *before* the record-validity `continue`, so one such record discards the
/// entire parse, earlier valid records included. `None` models that throw; a plain JSON
/// object without an own `toString` falls back to `Object.prototype.toString`, yielding
/// `"[object Object]"` and therefore `NaN`.
fn js_number_checked(value: Option<&Value>) -> Option<f64> {
    match value {
        None => Some(f64::NAN),
        Some(Value::Null) => Some(0.0),
        Some(Value::Bool(flag)) => Some(if *flag { 1.0 } else { 0.0 }),
        Some(Value::Number(number)) => Some(number.as_f64().unwrap_or(f64::NAN)),
        Some(Value::String(text)) => Some(parse_js_number_string(text)),
        Some(Value::Array(items)) => Some(parse_js_number_string(&js_array_to_string(items)?)),
        Some(Value::Object(map)) => {
            if map.contains_key("toString") {
                None
            } else {
                Some(f64::NAN)
            }
        }
    }
}

/// ECMAScript `Number.prototype.toString()`, used for array elements. The joined text is
/// re-parsed as a number, so this only has to be a faithful `StringNumericLiteral`
/// spelling; `ryu-js` supplies the shortest round-trip form JS prints.
fn js_number_text(number: f64) -> String {
    if number.is_finite() {
        ryu_js::Buffer::new().format(number).to_owned()
    } else if number.is_nan() {
        "NaN".to_string()
    } else if number > 0.0 {
        "Infinity".to_string()
    } else {
        "-Infinity".to_string()
    }
}

/// `Array.prototype.toString`: `null` renders empty, nested arrays recurse, and every
/// other element uses its string form. `None` propagates a nested `ToPrimitive` throw.
fn js_array_to_string(items: &[Value]) -> Option<String> {
    let mut parts = Vec::with_capacity(items.len());
    for item in items {
        parts.push(match item {
            Value::Null => String::new(),
            Value::Array(nested) => js_array_to_string(nested)?,
            Value::String(text) => text.clone(),
            Value::Bool(flag) => flag.to_string(),
            Value::Number(number) => js_number_text(number.as_f64().unwrap_or(f64::NAN)),
            Value::Object(map) if map.contains_key("toString") => return None,
            Value::Object(_) => "[object Object]".to_string(),
        });
    }
    Some(parts.join(","))
}

/// ECMAScript-shortest-round-trip serialization for `numCtx`.
///
/// `numCtx` is a JS `number`, so `JSON.stringify` prints it with ECMAScript rules:
/// `1e+300`, `18446744073709552000`, `0` for `-0`. `serde_json`'s writer would print
/// `1e300` and `18446744073709551616`, which round-trips to the same `f64` but is not the
/// reference text. `ryu-js` implements the ECMAScript shortest form.
fn serialize_js_number<S: Serializer>(
    value: &Option<f64>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    let Some(number) = value else {
        return serializer.serialize_none();
    };
    let text = if number.is_finite() {
        ryu_js::Buffer::new().format(*number).to_owned()
    } else {
        "null".to_string()
    };
    serde_json::value::RawValue::from_string(text)
        .expect("finite JS number is valid JSON")
        .serialize(serializer)
}

/// `Number(string)` (`StringNumericLiteral`): empty/whitespace is `0`, `Infinity` and
/// base prefixes are accepted, and a base prefix may not carry a sign — `Number("+0x800")`
/// and `Number("-0b1")` are `NaN` because the sign is consumed by the decimal grammar
/// only. Anything else must be a plain decimal literal.
fn parse_js_number_string(raw: &str) -> f64 {
    let text = js_trim(raw);
    if text.is_empty() {
        return 0.0;
    }
    match text {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    // Radix literals are recognised before the sign is stripped, so a signed literal falls
    // through to the decimal grammar and is rejected there.
    if let Some(value) = parse_js_radix_literal(text) {
        return value;
    }
    let unsigned = match text.as_bytes().first() {
        Some(b'+' | b'-') => &text[1..],
        _ => text,
    };
    let mut digits = 0_usize;
    let mut saw_dot = false;
    let mut saw_exponent = false;
    let mut chars = unsigned.chars().peekable();
    while let Some(character) = chars.peek().copied() {
        match character {
            '0'..='9' => {
                digits += 1;
                chars.next();
            }
            '.' if !saw_dot && !saw_exponent => {
                saw_dot = true;
                chars.next();
            }
            'e' | 'E' if !saw_exponent && digits > 0 => {
                saw_exponent = true;
                chars.next();
                if matches!(chars.peek(), Some('+' | '-')) {
                    chars.next();
                }
                let mut exponent_digits = 0_usize;
                while let Some(digit) = chars.peek().copied() {
                    if digit.is_ascii_digit() {
                        exponent_digits += 1;
                        chars.next();
                    } else {
                        break;
                    }
                }
                if exponent_digits == 0 {
                    return f64::NAN;
                }
            }
            _ => return f64::NAN,
        }
    }
    if digits == 0 {
        return f64::NAN;
    }
    text.parse::<f64>().unwrap_or(f64::NAN)
}

/// The `0x` / `0o` / `0b` `StringIntegerLiteral` forms, converted exactly.
///
/// ECMAScript reads the digits as an arbitrary-precision integer and rounds once to the
/// nearest `f64`, so a fixed-width accumulator is wrong in two ways: it overflows for
/// literals above `u128` (`Number("0x" + "f".repeat(300))` is finite, ~2^1200), and it
/// double-rounds. The digits are therefore collected as bits and rounded once at the
/// 53-bit mantissa boundary, half-to-even. `None` means "not a radix literal", which lets
/// the decimal grammar have the text.
fn parse_js_radix_literal(text: &str) -> Option<f64> {
    let bytes = text.as_bytes();
    if bytes.len() < 2 || bytes[0] != b'0' {
        return None;
    }
    // Both prefix cases are legal: probed `Number("0X10") === 16`, `Number("0O10") === 8`
    // and `Number("0B1") === 1`. A trailing sign or an interior non-digit still yields
    // NaN (`Number("0xg")`, `Number("+0x800")`), and a bare prefix is NaN (`Number("0x")`).
    let (radix, width) = match bytes[1] {
        b'x' | b'X' => (16_u32, 4_u32),
        b'o' | b'O' => (8, 3),
        b'b' | b'B' => (2, 1),
        _ => return None,
    };
    if bytes.len() == 2 {
        // A prefix with no digits is a malformed literal: `Number("0x")` is NaN.
        return Some(f64::NAN);
    }
    let mut bits: Vec<bool> = Vec::with_capacity(text.len() * 4);
    for character in text[2..].chars() {
        let Some(digit) = character.to_digit(radix) else {
            return Some(f64::NAN);
        };
        for shift in (0..width).rev() {
            bits.push((digit >> shift) & 1 == 1);
        }
    }
    let first_set = bits.iter().position(|bit| *bit).unwrap_or(bits.len());
    let significant = &bits[first_set..];
    if significant.is_empty() {
        return Some(0.0);
    }
    if significant.len() <= 53 {
        let mut value = 0_u64;
        for bit in significant {
            value = (value << 1) | u64::from(*bit);
        }
        return Some(value as f64);
    }
    let mut mantissa = 0_u64;
    for bit in &significant[..53] {
        mantissa = (mantissa << 1) | u64::from(*bit);
    }
    let rest_set = significant[54..].iter().any(|bit| *bit);
    if significant[53] && (rest_set || (mantissa & 1) == 1) {
        mantissa += 1;
    }
    let mut exponent = (significant.len() - 53) as i32;
    if mantissa == 1_u64 << 53 {
        mantissa >>= 1;
        exponent += 1;
    }
    Some((mantissa as f64) * 2_f64.powi(exponent))
}

/// `parseJaitBackendInstances`.
///
/// Invalid JSON, non-array payloads, blank/malformed entries and duplicate ids are
/// dropped; `apiKey`/`model` are trimmed and omitted when empty; `numCtx` is kept only
/// for `ollama` when it is an integer `>= 2048`.
pub fn parse_jait_backend_instances(raw: Option<&str>) -> Vec<JaitBackendInstanceConfig> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    if js_trim(raw).is_empty() {
        return Vec::new();
    }
    let Ok(Value::Array(values)) = serde_json::from_str::<Value>(raw) else {
        return Vec::new();
    };
    let mut seen: HashSet<String> = HashSet::new();
    let mut instances = Vec::new();
    for value in &values {
        let Value::Object(record) = value else {
            continue;
        };
        let id = record
            .get("id")
            .and_then(Value::as_str)
            .map(js_trim)
            .unwrap_or_default()
            .to_string();
        let backend = record
            .get("type")
            .and_then(Value::as_str)
            .and_then(JaitBackend::parse);
        let name = record
            .get("name")
            .and_then(Value::as_str)
            .map(js_trim)
            .unwrap_or_default()
            .to_string();
        let base_url = record
            .get("baseUrl")
            .and_then(Value::as_str)
            .map(|raw| normalize_jait_backend_base_url(raw, backend))
            .unwrap_or_default();
        let api_key = record
            .get("apiKey")
            .and_then(Value::as_str)
            .map(js_trim)
            .unwrap_or_default()
            .to_string();
        let model = record
            .get("model")
            .and_then(Value::as_str)
            .map(js_trim)
            .unwrap_or_default()
            .to_string();
        // The reference coerces `numCtx` before the validity `continue`, so a record that
        // is about to be dropped can still throw and discard the whole parse.
        let Some(raw_num_ctx) = js_number_checked(record.get("numCtx")) else {
            return Vec::new();
        };
        let Some(backend) = backend else {
            continue;
        };
        if id.is_empty() || name.is_empty() || base_url.is_empty() || seen.contains(&id) {
            continue;
        }
        seen.insert(id.clone());
        // `Number.isInteger(rawNumCtx) && rawNumCtx >= 2048`: no upper bound in the
        // reference. JavaScript integers are exact up to 2^53, which is the widest
        // bound this integer representation can carry truthfully.
        // `Number.isInteger(v) && v >= 2048`: no upper bound, and `-0` fails the range test.
        let num_ctx = (backend == JaitBackend::Ollama
            && raw_num_ctx.is_finite()
            && raw_num_ctx.fract() == 0.0
            && raw_num_ctx >= 2048.0)
            .then_some(raw_num_ctx);
        instances.push(JaitBackendInstanceConfig {
            id,
            backend,
            name,
            base_url,
            api_key: (!api_key.is_empty()).then_some(api_key),
            model: (!model.is_empty()).then_some(model),
            num_ctx,
        });
    }
    instances
}

/// `OPENROUTER_MODELS` from `providers/jait-provider.ts` (`id`, `name`, `description`,
/// `reasoningEffortSupported`). Order and wording are pinned by the differential test
/// against the real module, so any drift in either place fails the suite.
const OPENROUTER_STATIC: [(&str, &str, &str, bool); 16] = [
    (
        "anthropic/claude-sonnet-4-20250514",
        "Claude Sonnet 4",
        "Anthropic's latest Sonnet",
        false,
    ),
    (
        "anthropic/claude-3.5-sonnet",
        "Claude 3.5 Sonnet",
        "Fast and capable",
        false,
    ),
    (
        "anthropic/claude-opus-4",
        "Claude Opus 4",
        "Anthropic's most capable model",
        false,
    ),
    (
        "anthropic/claude-3.5-haiku",
        "Claude 3.5 Haiku",
        "Fast and affordable",
        false,
    ),
    (
        "google/gemini-2.5-pro-preview",
        "Gemini 2.5 Pro",
        "Google's latest",
        false,
    ),
    (
        "google/gemini-2.5-flash-preview",
        "Gemini 2.5 Flash",
        "Fast Google model",
        false,
    ),
    (
        "deepseek/deepseek-chat-v3-0324",
        "DeepSeek V3",
        "DeepSeek's latest via OpenRouter",
        false,
    ),
    (
        "deepseek/deepseek-r1",
        "DeepSeek R1",
        "DeepSeek reasoning via OpenRouter",
        true,
    ),
    (
        "xiaomi/mimo-v2-pro",
        "MiMo-V2-Pro",
        "Xiaomi's flagship agent model",
        false,
    ),
    (
        "xiaomi/mimo-v2-flash",
        "MiMo-V2-Flash",
        "Fast Xiaomi reasoning and coding model",
        false,
    ),
    (
        "xiaomi/mimo-v2-omni",
        "MiMo-V2-Omni",
        "Multimodal Xiaomi agent model",
        false,
    ),
    (
        "meta-llama/llama-4-maverick",
        "Llama 4 Maverick",
        "Meta's latest open model",
        false,
    ),
    (
        "meta-llama/llama-4-scout",
        "Llama 4 Scout",
        "Meta's efficient open model",
        false,
    ),
    (
        "qwen/qwen3-235b-a22b",
        "Qwen3 235B",
        "Alibaba's largest model",
        false,
    ),
    (
        "mistralai/mistral-large-2411",
        "Mistral Large",
        "Mistral's flagship",
        false,
    ),
    (
        "x-ai/grok-3-mini-beta",
        "Grok 3 Mini",
        "xAI's reasoning model",
        true,
    ),
];

/// The static OpenRouter fallback catalogue (`OPENROUTER_MODELS`).
pub fn openrouter_static_models() -> Vec<ProviderModelInfo> {
    OPENROUTER_STATIC
        .iter()
        .map(|(id, name, description, reasoning)| {
            let model = ProviderModelInfo::new(*id, *name).with_description(*description);
            if *reasoning {
                model.with_reasoning_effort_supported(true)
            } else {
                model
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Catalogue routing
// ---------------------------------------------------------------------------

fn tagged(models: Vec<ProviderModelInfo>, group: &str) -> Vec<ProviderModelInfo> {
    models
        .into_iter()
        .map(|model| model.with_group(group))
        .collect()
}

fn nonempty(value: &str) -> bool {
    !value.is_empty()
}

fn configured_model_fallback(
    instance: &JaitBackendInstanceConfig,
    fallback_models: &[ProviderModelInfo],
) -> Vec<ProviderModelInfo> {
    if let Some(model) = instance.model.as_deref() {
        return vec![ProviderModelInfo::new(model, model).with_default(true)];
    }
    if instance.backend == JaitBackend::OpenAi {
        fallback_models.to_vec()
    } else {
        Vec::new()
    }
}

async fn fetch_configured_instance_models(
    instance: &JaitBackendInstanceConfig,
    fallback_models: &[ProviderModelInfo],
    fetchers: &dyn ModelFetchers,
    include_cloud: bool,
) -> Vec<ProviderModelInfo> {
    let api_key = instance.api_key.clone().unwrap_or_default();
    let outcome = if instance.backend.is_openai_compatible() {
        fetchers.fetch_openai(&api_key, &instance.base_url).await
    } else if instance.backend == JaitBackend::OpenRouter {
        match fetchers.fetch_openrouter(&api_key).await {
            // Empty catalogue (not an error) falls back to the static catalogue.
            Ok(models) if !models.is_empty() => Ok(models),
            Ok(_) => Ok(openrouter_static_models()),
            Err(error) => Err(error),
        }
    } else if instance.backend == JaitBackend::Ollama {
        fetchers
            .fetch_ollama_with(&instance.base_url, include_cloud)
            .await
    } else {
        fetchers.fetch_omniroute(&api_key, &instance.base_url).await
    };

    // Errors degrade to the configured fallback, mirroring the reference `catch`.
    let mut models = outcome.unwrap_or_default();
    if models.is_empty() {
        models = configured_model_fallback(instance, fallback_models);
    }

    let label = instance.backend.label();
    let group = format!("{} · {label}", instance.name);
    models
        .into_iter()
        .map(|model| {
            let description = match model.description.as_deref() {
                Some(existing) if nonempty(existing) => format!("{label} · {existing}"),
                _ => label.to_string(),
            };
            // A fetcher-supplied sub-group (for example `Ollama Cloud`) keeps its
            // own heading instead of collapsing into the backend label group.
            let group = match model.group.as_deref().filter(|value| nonempty(value)) {
                Some(sub_group) => format!("{} · {sub_group}", instance.name),
                None => group.clone(),
            };
            ProviderModelInfo {
                id: encode_jait_model_id(instance.backend, &instance.id, &model.id),
                group: Some(group),
                description: Some(description),
                ..model
            }
        })
        .collect()
}

async fn list_configured_models(
    instances: &[JaitBackendInstanceConfig],
    fallback_models: &[ProviderModelInfo],
    fetchers: &dyn ModelFetchers,
    include_cloud: bool,
) -> Vec<ProviderModelInfo> {
    let catalogues = instances.iter().map(|instance| {
        fetch_configured_instance_models(instance, fallback_models, fetchers, include_cloud)
    });
    join_all(catalogues).await.into_iter().flatten().collect()
}

type CatalogueFuture<'a> = Pin<Box<dyn Future<Output = Vec<ProviderModelInfo>> + Send + 'a>>;

async fn list_legacy_models(
    options: &ListJaitModelsOptions<'_>,
    fetchers: &dyn ModelFetchers,
) -> Vec<ProviderModelInfo> {
    let config = options.config;
    let fallback_models = options.fallback_models.to_vec();

    let openai_key = match options.api_key("OPENAI_API_KEY").map(js_trim) {
        Some(key) if nonempty(key) => key.to_string(),
        _ => config.openai_api_key.clone(),
    };
    let openai_base_url = match options.api_key("OPENAI_BASE_URL").map(js_trim) {
        Some(url) if nonempty(url) => url.to_string(),
        _ if nonempty(&config.openai_base_url) => config.openai_base_url.clone(),
        _ => OPENAI_DEFAULT_BASE_URL.to_string(),
    };
    let openrouter_key = options
        .api_key("OPENROUTER_API_KEY")
        .map(js_trim)
        .filter(|key| nonempty(key))
        .map(str::to_string);
    let ollama_url = match options.api_key("OLLAMA_URL").map(js_trim) {
        Some(url) if nonempty(url) => url.to_string(),
        _ => config.ollama_url.clone(),
    };
    let omniroute_base_url = match options.api_key("OMNIROUTE_BASE_URL").map(js_trim) {
        Some(url) if nonempty(url) => url.to_string(),
        _ => config.omniroute_base_url.clone(),
    };
    let omniroute_key = match options.api_key("OMNIROUTE_API_KEY").map(js_trim) {
        Some(key) if nonempty(key) => key.to_string(),
        _ => config.omniroute_api_key.clone(),
    };

    // All four sources are started before any is awaited, like the reference's four
    // already-running async IIFEs. `join_all([...])` polls every future before any can
    // complete, so a fetcher observes all four calls before results are consumed.
    let openai = {
        let fallback = fallback_models.clone();
        Box::pin(async move {
            if openai_key.is_empty() {
                return tagged(fallback, "OpenAI");
            }
            match fetchers.fetch_openai(&openai_key, &openai_base_url).await {
                Ok(models) if !models.is_empty() => tagged(models, "OpenAI"),
                _ => tagged(fallback, "OpenAI"),
            }
        }) as CatalogueFuture<'_>
    };
    let openrouter = {
        let key = openrouter_key.clone();
        Box::pin(async move {
            let Some(key) = key else {
                return Vec::new();
            };
            match fetchers.fetch_openrouter(&key).await {
                Ok(models) if !models.is_empty() => return tagged(models, "OpenRouter"),
                // Errors and empty catalogues both fall through to the static catalogue.
                _ => {}
            }
            tagged(openrouter_static_models(), "OpenRouter")
        }) as CatalogueFuture<'_>
    };
    let ollama = {
        let url = ollama_url.clone();
        Box::pin(async move {
            if url.is_empty() {
                return Vec::new();
            }
            match fetchers
                .fetch_ollama_with(&url, options.include_cloud.unwrap_or(true))
                .await
            {
                Ok(models) => models
                    .into_iter()
                    .map(|mut model| {
                        if model.group.is_none() {
                            model.group = Some("Ollama".into());
                        }
                        model
                    })
                    .collect(),
                Err(_) => Vec::new(),
            }
        }) as CatalogueFuture<'_>
    };
    let omniroute = {
        let url = omniroute_base_url.clone();
        let key = omniroute_key.clone();
        Box::pin(async move {
            if url.is_empty() {
                return Vec::new();
            }
            match fetchers.fetch_omniroute(&key, &url).await {
                Ok(models) => tagged(models, "OmniRoute"),
                Err(_) => Vec::new(),
            }
        }) as CatalogueFuture<'_>
    };

    let catalogues = join_all([openai, openrouter, ollama, omniroute]).await;
    catalogues.into_iter().flatten().collect()
}

/// `listJaitModels`: configured named instances win, otherwise the legacy
/// environment-style four-backend catalogue is returned.
///
/// Infallible by construction (see the module note on the reference's rejection paths).
pub async fn list_jait_models(
    options: &ListJaitModelsOptions<'_>,
    fetchers: &dyn ModelFetchers,
) -> Vec<ProviderModelInfo> {
    let instances = parse_jait_backend_instances(options.api_key("JAIT_BACKEND_INSTANCES"));
    if !instances.is_empty() {
        return list_configured_models(
            &instances,
            options.fallback_models,
            fetchers,
            options.include_cloud.unwrap_or(true),
        )
        .await;
    }
    list_legacy_models(options, fetchers).await
}
