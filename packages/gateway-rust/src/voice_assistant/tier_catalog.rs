//! Live model catalogue for voice escalation tiers.
//!
//! Port of `packages/gateway/src/voice-assistant/tier-catalog.ts`. The catalogue
//! answers "what does this install actually have, right now?" from the user's
//! own backends and ranks only the reachable models by published cost and
//! advertised reasoning support. When the catalogue can say nothing (no keys,
//! every probe failed) it is [`EMPTY_CATALOGUE`] and callers fall back to the
//! thread's configured defaults.
//!
//! Fidelity notes where the reference leans on JS runtime semantics:
//!
//! * `pricing` is not a field of the native [`ProviderModelInfo`]; it survives
//!   in the flattened `extra` map and is read from there.
//! * The reference writes `if (prompt !== undefined) candidate.promptPerMTok =
//!   prompt`, so a *present* but non-numeric price is kept verbatim in the
//!   output while cost classification coalesces it. Presence and numeric value
//!   are therefore modelled separately: [`VoiceModelCandidate::prompt_per_m_tok`]
//!   is `Option<Value>` (`None` = absent/`undefined`, `Some(Value::Null)` =
//!   present `null`) and [`js_number`] reproduces `Number(value)`.
//! * `String.prototype.localeCompare` is approximated by UTF-16 code-unit order
//!   ([`locale_compare`]); ICU collation is locale dependent and cannot be
//!   reproduced without a collator. For ASCII model ids both agree.
//! * No hidden authority: the model listing is injected through
//!   [`BuildVoiceCatalogueOptions::list_models`] (tests) or
//!   [`BuildVoiceCatalogueOptions::fetchers`] (production wiring for
//!   [`list_jait_models`]), and every clock read comes from an injected
//!   [`Clock`].

use crate::app_config::js_trim;
use crate::services::jait_models::{
    JaitModelsConfig, ListJaitModelsOptions, ModelFetchers, ProviderModelInfo, list_jait_models,
};
use crate::time::{Clock, default_clock};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Mutex, MutexGuard, OnceLock};

/// Maximum number of candidates kept in each shortlist (`MAX_SHORTLIST`).
pub const MAX_SHORTLIST: usize = 6;

/// Cache lifetime used when the caller does not pass `ttlMs` (`DEFAULT_TTL_MS`).
pub const DEFAULT_TTL_MS: f64 = 60_000.0;

/// Provider id stamped onto candidates (`"jait"`, the multiplexing provider).
const DEFAULT_PROVIDER_ID: &str = "jait";

/// Substring hints that a model is a small/quick variant of its family.
const SMALL_HINTS: [&str; 9] = [
    "mini", "nano", "tiny", "small", "lite", "flash", "haiku", "instant", "sparkle",
];

/// Substring hints that a model is the heavyweight of its family.
const STRONG_HINTS: [&str; 13] = [
    "opus", "max", "ultra", "pro", "large", "heavy", "thinking", "reason", "70b", "72b", "235b",
    "405b", "671b",
];

/// Backends that host models locally, where marginal token cost is zero.
const LOCAL_BACKEND_HINTS: [&str; 4] = ["ollama", "llama.cpp", "local", "lmstudio"];

/// Future returned by an injected model listing.
pub type ModelListFuture<'a> =
    Pin<Box<dyn Future<Output = Result<Vec<ProviderModelInfo>, ModelListError>> + Send + 'a>>;

/// Rejection value of an injected listing.
///
/// The reference awaits `listModels()` inside a bare `try`/`catch` and discards
/// whatever the rejection carried, so this payload only has to exist; it is
/// never surfaced to a caller.
#[derive(Debug)]
pub struct ModelListError {
    /// Debug-only description of the failure.
    pub message: String,
}

impl ModelListError {
    /// Build a rejection from any displayable cause.
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ModelListError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ModelListError {}

/// Injected model listing (`listModels` in the reference).
///
/// The returned future is `'static` rather than borrowing the request, so a
/// closure can own its fake backend list; wiring the real listing only has to
/// clone what it needs out of the request.
pub type ModelListFn =
    dyn for<'a> Fn(ListJaitModelsOptions<'a>) -> ModelListFuture<'static> + Send + Sync;

/// How a candidate is paid for, derived from published pricing only.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceCostClass {
    /// Local backend, or both prices exactly zero.
    Free,
    /// `<= 1.5` per Mtok benchmark.
    Cheap,
    /// `<= 8` per Mtok benchmark.
    Standard,
    /// Anything dearer, and anything with an unparseable price.
    Premium,
    /// No published price at all.
    Unknown,
}

impl VoiceCostClass {
    fn order(self) -> i32 {
        match self {
            Self::Free => 0,
            Self::Cheap => 1,
            Self::Standard => 2,
            Self::Premium => 3,
            Self::Unknown => 4,
        }
    }
}

/// Relative capability, derived from advertised reasoning support + size hints.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceStrengthClass {
    /// Reasoning capable.
    Strong,
    /// Flagship family without advertised reasoning.
    Mid,
    /// Nothing known.
    Unknown,
    /// Small/quick variant.
    Small,
}

impl VoiceStrengthClass {
    fn order(self) -> i32 {
        match self {
            Self::Strong => 0,
            Self::Mid => 1,
            Self::Unknown => 2,
            Self::Small => 3,
        }
    }
}

/// Tier an effort value is chosen for (`"fast" | "deep"`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EffortTier {
    /// Cheap lane: lowest effort.
    Fast,
    /// Strong lane: deepest effort.
    Deep,
}

/// One selectable model. Property order matches the reference object literal so
/// the serialized property order is identical.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceModelCandidate {
    /// Provider that can run this model.
    pub provider_id: String,
    /// Model id exactly as the backend reports it.
    pub model: String,
    /// Effort values this model actually accepts; empty when it accepts none.
    pub reasoning_efforts: Vec<String>,
    /// Cost bucket.
    pub cost_class: VoiceCostClass,
    /// Capability bucket.
    pub strength_class: VoiceStrengthClass,
    /// Backend that reported the model, for human-readable routing reasons.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend: Option<String>,
    /// `pricing.promptPerMTok`, kept verbatim when present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_per_m_tok: Option<Value>,
    /// `pricing.completionPerMTok`, kept verbatim when present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completion_per_m_tok: Option<Value>,
}

/// Where a catalogue came from (`source`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceCatalogueSource {
    /// Models were derived from the user's backends.
    Backends,
    /// No usable model list; the shortlists are empty.
    Empty,
}

/// Ranked shortlists handed to the tier resolver.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceModelCatalogue {
    /// Provenance of this catalogue.
    pub source: VoiceCatalogueSource,
    /// Cheapest models that are still usable, best first.
    pub fast: Vec<VoiceModelCandidate>,
    /// Strongest reasoning-capable models available, best first.
    pub deep: Vec<VoiceModelCandidate>,
    /// Epoch milliseconds the catalogue was built at.
    pub built_at: i64,
}

/// Catalogue returned when nothing can be listed.
pub const EMPTY_CATALOGUE: VoiceModelCatalogue = VoiceModelCatalogue {
    source: VoiceCatalogueSource::Empty,
    fast: Vec::new(),
    deep: Vec::new(),
    built_at: 0,
};

/// Options for [`build_catalogue_from_models`]
/// (`{ providerId?: string; now?: () => number }`).
// No `Debug`: `Clock` is an `Arc<dyn Fn>` and is not `Debug`.
#[derive(Clone, Copy, Default)]
pub struct BuildCatalogueOptions<'a> {
    /// Provider id stamped onto every candidate (default `"jait"`).
    pub provider_id: Option<&'a str>,
    /// Clock used for `builtAt` (default [`default_clock`]).
    pub now: Option<&'a Clock>,
}

/// Options for [`build_voice_catalogue`] (`BuildVoiceCatalogueOptions`).
///
/// The reference defaults the listing to `listJaitModels`; here the listing is
/// always injected, so without either seam no catalogue is produced rather than
/// reaching for the network implicitly.
pub struct BuildVoiceCatalogueOptions<'a> {
    /// Backend configuration passed through to the listing.
    pub config: &'a JaitModelsConfig,
    /// Provider API keys; also the cache key.
    pub api_keys: Option<&'a HashMap<String, String>>,
    /// Models to append when no backend advertises any.
    pub fallback_models: &'a [ProviderModelInfo],
    /// Injected listing (tests); caching is disabled when this is set, exactly
    /// like the reference.
    pub list_models: Option<&'a ModelListFn>,
    /// Fetchers for the crate's [`list_jait_models`], used when `list_models` is
    /// `None`. This is the production wiring for the reference's default
    /// `listJaitModels`.
    pub fetchers: Option<&'a dyn ModelFetchers>,
    /// Clock for `builtAt` and cache expiry (default [`default_clock`]).
    pub now: Option<&'a Clock>,
    /// Cache lifetime in milliseconds (default [`DEFAULT_TTL_MS`]).
    pub ttl_ms: Option<f64>,
}

impl<'a> BuildVoiceCatalogueOptions<'a> {
    /// Options for `config` with every optional seam left unset.
    pub fn new(config: &'a JaitModelsConfig) -> Self {
        Self {
            config,
            api_keys: None,
            fallback_models: &[],
            list_models: None,
            fetchers: None,
            now: None,
            ttl_ms: None,
        }
    }
}

struct CatalogueCache {
    key: String,
    value: VoiceModelCatalogue,
    expires_at: f64,
}

static CATALOGUE_CACHE: OnceLock<Mutex<Option<CatalogueCache>>> = OnceLock::new();

fn cache_lock() -> MutexGuard<'static, Option<CatalogueCache>> {
    CATALOGUE_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn cache_lookup(key: &str, now_ms: i64) -> Option<VoiceModelCatalogue> {
    let guard = cache_lock();
    match guard.as_ref() {
        Some(cached) if cached.key == key && (now_ms as f64) < cached.expires_at => {
            Some(cached.value.clone())
        }
        _ => None,
    }
}

fn cache_store(key: String, value: VoiceModelCatalogue, expires_at: f64) {
    *cache_lock() = Some(CatalogueCache {
        key,
        value,
        expires_at,
    });
}

/// Test hook: drop the process-wide cache (`resetVoiceCatalogueCache`).
pub fn reset_voice_catalogue_cache() {
    *cache_lock() = None;
}

fn read_clock(clock: Option<&Clock>) -> i64 {
    match clock {
        Some(clock) => (*clock)(),
        None => default_clock()(),
    }
}

/// Case-insensitive substring test, the equivalent of a `/…/i` regex `.test`.
fn contains_hint(haystack: &str, hints: &[&str]) -> bool {
    let haystack = haystack.to_lowercase();
    hints.iter().any(|hint| haystack.contains(hint))
}

/// `info.pricing?.<key>` — `None` both when `pricing` is missing and when it is
/// not an object (JS optional chaining yields `undefined` in both cases).
fn pricing_field<'a>(info: &'a ProviderModelInfo, key: &str) -> Option<&'a Value> {
    match info.extra.get("pricing") {
        Some(Value::Object(pricing)) => pricing.get(key),
        _ => None,
    }
}

/// `value ?? fallback` — `null` and `undefined` only.
fn coalesce(value: Option<&Value>) -> Option<&Value> {
    value.filter(|value| !value.is_null())
}

fn js_parse_number(raw: &str) -> f64 {
    let text = js_trim(raw);
    if text.is_empty() {
        // `Number("")` and `Number("   ")` are both 0.
        return 0.0;
    }
    match text {
        "Infinity" | "+Infinity" => f64::INFINITY,
        "-Infinity" => f64::NEG_INFINITY,
        _ => text.parse::<f64>().unwrap_or(f64::NAN),
    }
}

/// `Number(value)` for the shapes that can reach a catalogue.
///
/// `NaN` for objects and unparseable strings. `f64::from_str` is marginally
/// more permissive than JS (`"inf"`, `"nan"`, `"1_0"`), which cannot occur in a
/// JSON price produced by the gateway.
fn js_number(value: &Value) -> f64 {
    match value {
        Value::Number(number) => number.as_f64().unwrap_or(f64::NAN),
        Value::Bool(true) => 1.0,
        Value::Bool(false) => 0.0,
        Value::Null => 0.0,
        Value::String(text) => js_parse_number(text),
        Value::Array(items) => match items.as_slice() {
            [] => 0.0,
            [only] => js_number(only),
            _ => f64::NAN,
        },
        Value::Object(_) => f64::NAN,
    }
}

/// `(price ?? 0) === 0`: missing and `null` coalesce to zero, a present
/// non-numeric price does not.
fn coalesces_to_zero(price: Option<&Value>) -> bool {
    match coalesce(price) {
        None => true,
        Some(Value::Number(number)) => number.as_f64() == Some(0.0),
        Some(_) => false,
    }
}

fn classify_cost(info: &ProviderModelInfo) -> VoiceCostClass {
    let backend = info.group.as_deref().unwrap_or("");
    if contains_hint(backend, &LOCAL_BACKEND_HINTS) {
        return VoiceCostClass::Free;
    }
    let prompt = pricing_field(info, "promptPerMTok");
    let completion = pricing_field(info, "completionPerMTok");
    if prompt.is_none() && completion.is_none() {
        return VoiceCostClass::Unknown;
    }
    if coalesces_to_zero(prompt) && coalesces_to_zero(completion) {
        return VoiceCostClass::Free;
    }
    // Output tokens dominate a spoken-answer bill, so gate on completion price.
    let benchmark = coalesce(completion)
        .or_else(|| coalesce(prompt))
        .map(js_number)
        .unwrap_or(0.0);
    if benchmark <= 1.5 {
        return VoiceCostClass::Cheap;
    }
    if benchmark <= 8.0 {
        return VoiceCostClass::Standard;
    }
    VoiceCostClass::Premium
}

fn classify_strength(info: &ProviderModelInfo) -> VoiceStrengthClass {
    let reasons = info
        .supported_reasoning_efforts
        .as_ref()
        .map(Vec::len)
        .unwrap_or(0);
    if contains_hint(&info.id, &STRONG_HINTS) && reasons > 0 {
        return VoiceStrengthClass::Strong;
    }
    if reasons > 0 {
        return VoiceStrengthClass::Strong;
    }
    if contains_hint(&info.id, &SMALL_HINTS) {
        return VoiceStrengthClass::Small;
    }
    if contains_hint(&info.id, &STRONG_HINTS) {
        return VoiceStrengthClass::Mid;
    }
    VoiceStrengthClass::Unknown
}

/// Effort values this model will accept. Providers that only advertise a
/// boolean expose a conservative OpenAI-compatible set; models that advertise
/// nothing get no effort at all rather than a value that may be rejected.
fn resolve_reasoning_efforts(info: &ProviderModelInfo) -> Vec<String> {
    let advertised: Vec<String> = info
        .supported_reasoning_efforts
        .as_ref()
        .map(|entries| {
            entries
                .iter()
                .map(|entry| js_trim(&entry.reasoning_effort).to_string())
                // `.filter((entry): entry is string => Boolean(entry))`
                .filter(|entry| !entry.is_empty())
                .collect()
        })
        .unwrap_or_default();
    if !advertised.is_empty() {
        return advertised;
    }
    if info.reasoning_effort_supported.unwrap_or(false) {
        return vec!["low".to_string(), "medium".to_string(), "high".to_string()];
    }
    Vec::new()
}

fn to_candidate(info: &ProviderModelInfo, provider_id: &str) -> VoiceModelCandidate {
    let mut candidate = VoiceModelCandidate {
        provider_id: provider_id.to_string(),
        model: info.id.clone(),
        reasoning_efforts: resolve_reasoning_efforts(info),
        cost_class: classify_cost(info),
        strength_class: classify_strength(info),
        backend: None,
        prompt_per_m_tok: None,
        completion_per_m_tok: None,
    };
    // `if (info.group)` — an empty string is falsy in JS.
    if let Some(group) = info.group.as_deref()
        && !group.is_empty()
    {
        candidate.backend = Some(group.to_string());
    }
    if let Some(price) = pricing_field(info, "promptPerMTok") {
        candidate.prompt_per_m_tok = Some(price.clone());
    }
    if let Some(price) = pricing_field(info, "completionPerMTok") {
        candidate.completion_per_m_tok = Some(price.clone());
    }
    candidate
}

/// Price used for ordering; unknown prices sort last instead of looking free.
/// `completionPerMTok ?? promptPerMTok ?? Number.POSITIVE_INFINITY`.
fn price_for_ranking(candidate: &VoiceModelCandidate) -> f64 {
    if candidate.cost_class == VoiceCostClass::Free {
        return 0.0;
    }
    coalesce(candidate.completion_per_m_tok.as_ref())
        .or_else(|| coalesce(candidate.prompt_per_m_tok.as_ref()))
        .map(js_number)
        .unwrap_or(f64::INFINITY)
}

/// `String.prototype.localeCompare` approximation: UTF-16 code-unit order.
fn locale_compare(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

/// Total order from a difference, mirroring a JS comparator that returns a
/// difference of ranks (`0` means "tie, look at the next key").
fn from_difference(difference: i32) -> Option<Ordering> {
    match difference {
        0 => None,
        difference if difference < 0 => Some(Ordering::Less),
        _ => Some(Ordering::Greater),
    }
}

/// Fast-lane ordering: cheapest class first, then cheapest per-Mtok, then the
/// *weaker* family (heavyweight reasoning models are slow to first token), then
/// the model id.
fn rank_fast(left: &VoiceModelCandidate, right: &VoiceModelCandidate) -> Ordering {
    if let Some(ordering) = from_difference(left.cost_class.order() - right.cost_class.order()) {
        return ordering;
    }
    let price = price_for_ranking(left) - price_for_ranking(right);
    if price.is_finite() && price != 0.0 {
        return if price < 0.0 {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }
    // `STRENGTH_ORDER[b.strengthClass] - STRENGTH_ORDER[a.strengthClass]` with
    // STRENGTH_ORDER = { strong: 0, mid: 1, unknown: 2, small: 3 }, i.e. the
    // weaker family sorts first: the fast lane avoids heavyweight reasoning
    // models because they are slow to first token.
    if let Some(ordering) =
        from_difference(right.strength_class.order() - left.strength_class.order())
    {
        return ordering;
    }
    locale_compare(&left.model, &right.model)
}

/// Deep-lane ordering: reasoning-capable first, then the stronger family, then
/// the dearer per-Mtok (pricier usually means larger within a vendor ladder).
fn rank_deep(left: &VoiceModelCandidate, right: &VoiceModelCandidate) -> Ordering {
    let left_has_efforts = !left.reasoning_efforts.is_empty();
    let right_has_efforts = !right.reasoning_efforts.is_empty();
    if left_has_efforts != right_has_efforts {
        // `Number(b.length > 0) - Number(a.length > 0)`: reasoning-capable first.
        return right_has_efforts.cmp(&left_has_efforts);
    }
    if let Some(ordering) =
        from_difference(left.strength_class.order() - right.strength_class.order())
    {
        return ordering;
    }
    let price = price_for_ranking(right) - price_for_ranking(left);
    if price.is_finite() && price != 0.0 {
        return if price < 0.0 {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }
    locale_compare(&left.model, &right.model)
}

/// Build the tier catalogue from an already-listed model set
/// (`buildCatalogueFromModels`), de-duplicating ids several backends may report
/// and keeping the best-known entry for each.
pub fn build_catalogue_from_models(
    models: &[ProviderModelInfo],
    options: &BuildCatalogueOptions<'_>,
) -> VoiceModelCatalogue {
    let provider_id = options.provider_id.unwrap_or(DEFAULT_PROVIDER_ID);
    // A JS `Map` keeps first-insertion order even when a later `set` replaces
    // the value for an existing key, so a Vec of pairs reproduces it exactly.
    let mut by_id: Vec<(String, VoiceModelCandidate)> = Vec::new();
    for info in models {
        // `if (!info?.id) continue` — an empty id is falsy.
        if info.id.is_empty() {
            continue;
        }
        let candidate = to_candidate(info, provider_id);
        match by_id.iter_mut().find(|(id, _)| *id == candidate.model) {
            None => by_id.push((candidate.model.clone(), candidate)),
            Some((_, existing)) => {
                // Prefer the entry that actually knows its price and reasoning support.
                let with_efforts = |candidate: &VoiceModelCandidate| {
                    if candidate.reasoning_efforts.is_empty() {
                        5
                    } else {
                        0
                    }
                };
                let existing_score = existing.cost_class.order() + with_efforts(existing);
                let candidate_score = candidate.cost_class.order() + with_efforts(&candidate);
                if candidate_score < existing_score {
                    *existing = candidate;
                }
            }
        }
    }

    let source = if by_id.is_empty() {
        VoiceCatalogueSource::Empty
    } else {
        VoiceCatalogueSource::Backends
    };
    let unique: Vec<VoiceModelCandidate> = by_id.into_iter().map(|(_, entry)| entry).collect();
    let mut fast = unique.clone();
    fast.sort_by(rank_fast);
    fast.truncate(MAX_SHORTLIST);
    let mut deep = unique;
    deep.sort_by(rank_deep);
    deep.truncate(MAX_SHORTLIST);
    VoiceModelCatalogue {
        source,
        fast,
        deep,
        built_at: read_clock(options.now),
    }
}

/// Cheap, stable fingerprint so a key change invalidates the cache.
/// `Object.keys(...).sort()` is code-unit order, not locale order.
fn catalogue_cache_key(api_keys: Option<&HashMap<String, String>>) -> String {
    let Some(api_keys) = api_keys else {
        return "none".to_string();
    };
    let mut keys: Vec<&String> = api_keys.keys().collect();
    keys.sort_by(|left, right| locale_compare(left, right));
    keys.iter()
        .map(|key| {
            let length = api_keys
                .get(*key)
                .map(|value| value.encode_utf16().count())
                .unwrap_or(0);
            format!("{key}:{length}")
        })
        .collect::<Vec<String>>()
        .join("|")
}

/// Resolve the catalogue for a user (`buildVoiceCatalogue`), cached briefly
/// because escalation happens mid-conversation and a voice turn cannot afford a
/// fresh multi-backend probe.
///
/// Caching is skipped when `list_models` is injected, matching the reference. A
/// failed listing yields [`EMPTY_CATALOGUE`]: a dead backend must never fail a
/// voice turn.
pub async fn build_voice_catalogue(
    options: &BuildVoiceCatalogueOptions<'_>,
) -> VoiceModelCatalogue {
    let ttl_ms = options.ttl_ms.unwrap_or(DEFAULT_TTL_MS);
    let key = catalogue_cache_key(options.api_keys);
    if options.list_models.is_none()
        && let Some(cached) = cache_lookup(&key, read_clock(options.now))
    {
        return cached;
    }

    // `fallbackModels: options.fallbackModels ?? []`
    let request = ListJaitModelsOptions {
        config: options.config,
        api_keys: options.api_keys,
        fallback_models: options.fallback_models,
        include_cloud: Some(true),
    };

    let models = if let Some(list_models) = options.list_models {
        match list_models(request).await {
            Ok(models) => models,
            Err(_rejection) => return EMPTY_CATALOGUE,
        }
    } else if let Some(fetchers) = options.fetchers {
        list_jait_models(&request, fetchers).await
    } else {
        // No injectable seam: never reach for the network implicitly.
        return EMPTY_CATALOGUE;
    };

    let catalogue = build_catalogue_from_models(
        &models,
        &BuildCatalogueOptions {
            provider_id: None,
            now: options.now,
        },
    );
    if options.list_models.is_none() {
        let expires_at = read_clock(options.now) as f64 + ttl_ms;
        cache_store(key, catalogue.clone(), expires_at);
    }
    catalogue
}

/// Rank of an effort value, lowest first. Unknown values rank like `medium`.
fn effort_rank(effort: &str) -> u8 {
    match effort.to_lowercase().as_str() {
        "minimal" | "none" => 0,
        "low" => 1,
        "medium" | "med" => 2,
        "high" => 3,
        "xhigh" | "extra_high" => 4,
        _ => 2,
    }
}

/// Pick the effort value for a candidate: lowest for [`EffortTier::Fast`],
/// deepest for [`EffortTier::Deep`]. `None` when the model advertises none.
pub fn effort_for(candidate: &VoiceModelCandidate, tier: EffortTier) -> Option<String> {
    if candidate.reasoning_efforts.is_empty() {
        return None;
    }
    // `Array.prototype.sort` is stable, and so is `slice::sort_by`.
    let mut sorted = candidate.reasoning_efforts.clone();
    sorted.sort_by_key(|effort| effort_rank(effort));
    match tier {
        EffortTier::Fast => sorted.first().cloned(),
        EffortTier::Deep => sorted.last().cloned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::jait_models::{JaitModelsConfig, ReasoningEffort};
    use serde_json::json;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicI64, Ordering as AtomicOrdering};

    fn model(id: &str) -> ProviderModelInfo {
        ProviderModelInfo::new(id, id)
    }

    fn with_pricing(
        mut info: ProviderModelInfo,
        prompt: Value,
        completion: Value,
    ) -> ProviderModelInfo {
        info.extra.insert(
            "pricing".to_string(),
            json!({ "promptPerMTok": prompt, "completionPerMTok": completion }),
        );
        info
    }

    fn catalogue(models: &[ProviderModelInfo]) -> VoiceModelCatalogue {
        let clock: Clock = Arc::new(|| 1_700_000_000_000);
        build_catalogue_from_models(
            models,
            &BuildCatalogueOptions {
                provider_id: None,
                now: Some(&clock),
            },
        )
    }

    fn cost_of(info: &ProviderModelInfo) -> VoiceCostClass {
        classify_cost(info)
    }

    fn fake_clock(start: i64) -> (Arc<AtomicI64>, Clock) {
        let handle = Arc::new(AtomicI64::new(start));
        let clock: Clock = {
            let handle = Arc::clone(&handle);
            Arc::new(move || handle.load(AtomicOrdering::SeqCst))
        };
        (handle, clock)
    }

    fn empty_config() -> JaitModelsConfig {
        serde_json::from_value(json!({})).unwrap_or_else(|error| panic!("config fixture: {error}"))
    }

    fn listing(
        models: Vec<ProviderModelInfo>,
    ) -> impl Fn(ListJaitModelsOptions<'_>) -> ModelListFuture<'static> + Send + Sync {
        let models = Arc::new(models);
        move |_options: ListJaitModelsOptions<'_>| {
            let models = Arc::clone(&models);
            let future: ModelListFuture<'static> =
                Box::pin(async move { Ok(models.as_ref().clone()) });
            future
        }
    }

    fn failing_listing()
    -> impl Fn(ListJaitModelsOptions<'_>) -> ModelListFuture<'static> + Send + Sync {
        |_options: ListJaitModelsOptions<'_>| {
            let future: ModelListFuture<'static> =
                Box::pin(async { Err(ModelListError::new("every backend probe failed")) });
            future
        }
    }

    // ---- pricing -------------------------------------------------------

    #[test]
    fn pricing_absent_is_unknown_and_carries_no_price_fields() {
        let info = model("vendor/plain");
        assert_eq!(cost_of(&info), VoiceCostClass::Unknown);
        let built = catalogue(std::slice::from_ref(&info));
        let candidate = &built.fast[0];
        assert_eq!(candidate.prompt_per_m_tok, None);
        assert_eq!(candidate.completion_per_m_tok, None);
        assert_eq!(candidate.cost_class, VoiceCostClass::Unknown);
    }

    #[test]
    fn pricing_present_zero_prices_are_free_and_kept_verbatim() {
        let info = with_pricing(model("vendor/free"), json!(0), json!(0));
        assert_eq!(cost_of(&info), VoiceCostClass::Free);
        let candidate = &catalogue(&[info]).fast[0];
        assert_eq!(candidate.prompt_per_m_tok, Some(json!(0)));
        assert_eq!(candidate.completion_per_m_tok, Some(json!(0)));
    }

    #[test]
    fn pricing_half_known_treats_missing_side_as_zero() {
        // Only prompt published: `(completion ?? 0) === 0` but prompt is 4, so
        // this is not free; the benchmark falls back to the prompt price.
        let info = with_pricing(model("vendor/half"), json!(4), Value::Null);
        assert_eq!(cost_of(&info), VoiceCostClass::Standard);
        // Null is `undefined`-ish for `??`, but it IS assigned to the candidate.
        let candidate = &catalogue(&[info]).fast[0];
        assert_eq!(candidate.completion_per_m_tok, Some(Value::Null));
    }

    #[test]
    fn pricing_null_on_both_sides_coalesces_to_free() {
        let info = with_pricing(model("vendor/nulls"), Value::Null, Value::Null);
        assert_eq!(cost_of(&info), VoiceCostClass::Free);
    }

    #[test]
    fn pricing_completion_gates_the_benchmark() {
        // prompt 40 / completion 1: the completion price decides, so cheap.
        let cheap = with_pricing(model("vendor/asym"), json!(40), json!(1));
        assert_eq!(cost_of(&cheap), VoiceCostClass::Cheap);
        // Reversed: completion 40 now gates and lands in premium.
        let dear = with_pricing(model("vendor/asym2"), json!(1), json!(40));
        assert_eq!(cost_of(&dear), VoiceCostClass::Premium);
    }

    #[test]
    fn pricing_negative_is_not_free_and_falls_in_the_cheapest_band() {
        let info = with_pricing(model("vendor/negative"), json!(-3.0), json!(-1.0));
        assert_eq!(cost_of(&info), VoiceCostClass::Cheap);
    }

    #[test]
    fn pricing_non_finite_numbers_are_premium_never_a_panic() {
        // The benchmark is `completion ?? prompt ?? 0`, so the infinite string
        // must sit on the completion side to gate the band. `"Infinity" <= 1.5`
        // and `<= 8` are both false, so it lands in premium rather than panicking.
        let infinite = with_pricing(model("vendor/inf"), json!(1), json!("Infinity"));
        assert_eq!(cost_of(&infinite), VoiceCostClass::Premium);
        // A finite completion wins over an infinite prompt: the prompt is never
        // consulted once completion is set.
        let inf_prompt = with_pricing(model("vendor/inf-prompt"), json!("Infinity"), json!(1));
        assert_eq!(cost_of(&inf_prompt), VoiceCostClass::Cheap);
        let negative_infinite =
            with_pricing(model("vendor/neginf"), json!(-1e9), json!("-Infinity"));
        assert_eq!(cost_of(&negative_infinite), VoiceCostClass::Cheap);
        let unparseable =
            with_pricing(model("vendor/nan"), json!("not-a-price"), json!("also-not"));
        assert_eq!(cost_of(&unparseable), VoiceCostClass::Premium);
        // A price object where a number is expected must not panic either.
        let mut nested = model("vendor/nested");
        nested.extra.insert(
            "pricing".to_string(),
            json!({ "promptPerMTok": { "usd": 1 } }),
        );
        assert_eq!(cost_of(&nested), VoiceCostClass::Premium);
        // `pricing` itself being a non-object is `undefined` for `?.`.
        let mut broken = model("vendor/broken");
        broken.extra.insert("pricing".to_string(), json!("n/a"));
        assert_eq!(cost_of(&broken), VoiceCostClass::Unknown);
    }

    #[test]
    fn js_number_matches_javascript_coercion() {
        assert_eq!(js_number(&Value::Null), 0.0);
        assert_eq!(js_number(&json!(true)), 1.0);
        assert_eq!(js_number(&json!(false)), 0.0);
        assert_eq!(js_number(&json!("  2.5 ")), 2.5);
        assert_eq!(js_number(&json!("")), 0.0);
        assert_eq!(js_number(&json!("Infinity")), f64::INFINITY);
        assert_eq!(js_number(&json!("-Infinity")), f64::NEG_INFINITY);
        assert_eq!(js_number(&json!([7])), 7.0);
        assert_eq!(js_number(&json!([])), 0.0);
        assert!(js_number(&json!("nope")).is_nan());
        assert!(js_number(&json!([1, 2])).is_nan());
        assert!(js_number(&json!({ "a": 1 })).is_nan());
        assert_eq!(js_number(&json!(12.5)), 12.5);
    }

    #[test]
    fn local_backends_are_free_regardless_of_pricing() {
        let local = with_pricing(model("qwen3:8b"), json!(9), json!(9));
        let local = local.with_group("Ollama");
        assert_eq!(cost_of(&local), VoiceCostClass::Free);
        // `/lmstudio/i` and `/llama\.cpp/i` both count as local backends.
        let lmstudio = model("m").with_group("LMStudio");
        assert_eq!(cost_of(&lmstudio), VoiceCostClass::Free);
        let llama_cpp = model("m").with_group("llama.cpp");
        assert_eq!(cost_of(&llama_cpp), VoiceCostClass::Free);
        let cloud = with_pricing(model("m"), json!(9), json!(9)).with_group("openai");
        assert_eq!(cost_of(&cloud), VoiceCostClass::Premium);
    }

    // ---- strength / efforts -------------------------------------------

    #[test]
    fn strength_class_follows_reasoning_then_family_hints() {
        let mut reasoning = model("vendor/mystery");
        reasoning.supported_reasoning_efforts = Some(vec![ReasoningEffort {
            reasoning_effort: "high".to_string(),
            description: None,
            extra: Default::default(),
        }]);
        assert_eq!(classify_strength(&reasoning), VoiceStrengthClass::Strong);

        assert_eq!(
            classify_strength(&model("gpt-4o-mini")),
            VoiceStrengthClass::Small
        );
        assert_eq!(
            classify_strength(&model("claude-opus-4")),
            VoiceStrengthClass::Mid
        );
        assert_eq!(
            classify_strength(&model("mystery-model")),
            VoiceStrengthClass::Unknown
        );
    }

    #[test]
    fn reasoning_efforts_are_trimmed_dropped_when_blank_and_defaulted_from_boolean() {
        let mut trimmed = model("vendor/efforts");
        trimmed.supported_reasoning_efforts = Some(vec![
            ReasoningEffort {
                reasoning_effort: "  high  ".to_string(),
                description: None,
                extra: Default::default(),
            },
            ReasoningEffort {
                reasoning_effort: "   ".to_string(),
                description: None,
                extra: Default::default(),
            },
            ReasoningEffort {
                reasoning_effort: "low".to_string(),
                description: None,
                extra: Default::default(),
            },
        ]);
        let candidate = &catalogue(&[trimmed]).fast[0];
        assert_eq!(
            candidate.reasoning_efforts,
            vec!["high".to_string(), "low".to_string()]
        );

        let mut boolean_only = model("vendor/boolean");
        boolean_only.reasoning_effort_supported = Some(true);
        let candidate = &catalogue(&[boolean_only]).fast[0];
        assert_eq!(
            candidate.reasoning_efforts,
            vec!["low".to_string(), "medium".to_string(), "high".to_string()]
        );

        let mut none = model("vendor/none");
        none.supported_reasoning_efforts = Some(Vec::new());
        none.reasoning_effort_supported = Some(false);
        assert!(catalogue(&[none]).fast[0].reasoning_efforts.is_empty());
    }

    #[test]
    fn effort_for_picks_the_band_edges() {
        let candidate = VoiceModelCandidate {
            provider_id: DEFAULT_PROVIDER_ID.to_string(),
            model: "m".to_string(),
            reasoning_efforts: vec![
                "high".to_string(),
                "medium".to_string(),
                "off-script".to_string(),
                "minimal".to_string(),
            ],
            cost_class: VoiceCostClass::Cheap,
            strength_class: VoiceStrengthClass::Strong,
            backend: None,
            prompt_per_m_tok: None,
            completion_per_m_tok: None,
        };
        // Unknown effort ranks like `medium`; the sort is stable, so `medium`
        // stays ahead of `off-script`.
        assert_eq!(
            effort_for(&candidate, EffortTier::Fast),
            Some("minimal".to_string())
        );
        assert_eq!(
            effort_for(&candidate, EffortTier::Deep),
            Some("high".to_string())
        );

        let no_efforts = VoiceModelCandidate {
            reasoning_efforts: Vec::new(),
            ..candidate
        };
        assert_eq!(effort_for(&no_efforts, EffortTier::Fast), None);
        assert_eq!(effort_for(&no_efforts, EffortTier::Deep), None);
    }

    // ---- catalogue assembly -------------------------------------------

    #[test]
    fn empty_model_list_produces_the_empty_catalogue() {
        let clock: Clock = Arc::new(|| 42);
        let built = build_catalogue_from_models(
            &[],
            &BuildCatalogueOptions {
                provider_id: None,
                now: Some(&clock),
            },
        );
        assert_eq!(built.source, VoiceCatalogueSource::Empty);
        assert!(built.fast.is_empty());
        assert!(built.deep.is_empty());
        assert_eq!(built.built_at, 42);
        assert_eq!(EMPTY_CATALOGUE.source, VoiceCatalogueSource::Empty);
    }

    #[test]
    fn models_without_ids_are_skipped() {
        let built = catalogue(&[
            model(""),
            with_pricing(model("vendor/real"), json!(1), json!(1)),
        ]);
        assert_eq!(built.source, VoiceCatalogueSource::Backends);
        assert_eq!(built.fast.len(), 1);
        assert_eq!(built.fast[0].model, "vendor/real");
    }

    #[test]
    fn provider_id_and_backend_are_carried_onto_candidates() {
        let info = model("vendor/x").with_group("openai");
        let built = build_catalogue_from_models(
            &[info],
            &BuildCatalogueOptions {
                provider_id: Some("custom"),
                now: None,
            },
        );
        assert_eq!(built.fast[0].provider_id, "custom");
        assert_eq!(built.fast[0].backend, Some("openai".to_string()));

        let grouped = model("vendor/y").with_group("");
        let built = catalogue(&[grouped]);
        assert_eq!(built.fast[0].backend, None);
    }

    #[test]
    fn duplicate_ids_keep_the_better_known_entry_in_first_insertion_order() {
        let unknown_first = model("vendor/dup");
        let priced = with_pricing(model("vendor/dup"), json!(1), json!(1));
        let other = with_pricing(model("vendor/aaa"), json!(2), json!(2));
        let built = catalogue(&[unknown_first, other, priced]);
        // `unique` keeps Map insertion order: dup came first, so it leads.
        let models: Vec<&str> = built
            .fast
            .iter()
            .map(|entry| entry.model.as_str())
            .collect();
        assert!(models.contains(&"vendor/dup"));
        let deduped = built
            .fast
            .iter()
            .find(|entry| entry.model == "vendor/dup")
            .expect("duplicate survived");
        // The cheap known entry (score 1) replaced the unknown one (score 4).
        assert_eq!(deduped.cost_class, VoiceCostClass::Cheap);
        assert_eq!(deduped.prompt_per_m_tok, Some(json!(1)));
    }

    #[test]
    fn unknown_cost_models_rank_last_in_the_fast_lane() {
        let priced = with_pricing(model("vendor/priced"), json!(0.2), json!(0.2));
        let unpriced = model("vendor/unpriced");
        let built = catalogue(&[unpriced, priced]);
        assert_eq!(built.fast[0].model, "vendor/priced");
        assert_eq!(built.fast[1].model, "vendor/unpriced");
        assert_eq!(built.fast[1].cost_class, VoiceCostClass::Unknown);
    }

    #[test]
    fn fast_lane_avoids_the_heavyweight_class_among_price_equals() {
        let mut strong = with_pricing(model("vendor/strong"), json!(1), json!(1));
        strong.supported_reasoning_efforts = Some(vec![ReasoningEffort {
            reasoning_effort: "high".to_string(),
            description: None,
            extra: Default::default(),
        }]);
        let small = with_pricing(model("vendor/mini"), json!(1), json!(1));
        let built = catalogue(&[strong, small]);
        // rankFast returns `STRENGTH_ORDER[b] - STRENGTH_ORDER[a]` over
        // {strong:0 .. small:3}, so the weaker family wins the fast lane while
        // rankDeep (which subtracts the other way) keeps the strong one.
        assert_eq!(built.fast[0].model, "vendor/mini");
        assert_eq!(built.deep[0].model, "vendor/strong");
    }

    #[test]
    fn deep_lane_prefers_the_dearer_model_between_equals() {
        let cheap = with_pricing(model("vendor/cheap"), json!(1), json!(1));
        let dear = with_pricing(model("vendor/dear"), json!(6), json!(6));
        let built = catalogue(&[cheap, dear]);
        assert_eq!(built.deep[0].model, "vendor/dear");
        assert_eq!(built.fast[0].model, "vendor/cheap");
    }

    #[test]
    fn shortlists_are_capped_but_every_model_is_considered() {
        let models: Vec<ProviderModelInfo> = (0..10)
            .map(|index| {
                with_pricing(
                    model(&format!("vendor/model-{index}")),
                    json!(index as f64),
                    json!(index as f64),
                )
            })
            .collect();
        let built = catalogue(&models);
        assert_eq!(built.fast.len(), MAX_SHORTLIST);
        assert_eq!(built.deep.len(), MAX_SHORTLIST);
        assert_eq!(built.source, VoiceCatalogueSource::Backends);
    }

    // ---- cache --------------------------------------------------------

    #[test]
    fn cache_key_is_none_without_keys_and_order_independent_with_them() {
        assert_eq!(catalogue_cache_key(None), "none");
        let mut forward = HashMap::new();
        forward.insert("OPENAI_API_KEY".to_string(), "abc".to_string());
        forward.insert("ANTHROPIC_API_KEY".to_string(), "de".to_string());
        let mut reverse = HashMap::new();
        reverse.insert("ANTHROPIC_API_KEY".to_string(), "xy".to_string());
        reverse.insert("OPENAI_API_KEY".to_string(), "zzz".to_string());
        // Same keys, different values with the same UTF-16 lengths: same key.
        assert_eq!(
            catalogue_cache_key(Some(&forward)),
            catalogue_cache_key(Some(&reverse))
        );
        assert_eq!(
            catalogue_cache_key(Some(&forward)),
            "ANTHROPIC_API_KEY:2|OPENAI_API_KEY:3"
        );
        let mut longer = forward.clone();
        longer.insert("OPENAI_API_KEY".to_string(), "abcd".to_string());
        assert_ne!(
            catalogue_cache_key(Some(&forward)),
            catalogue_cache_key(Some(&longer))
        );
    }

    #[test]
    fn cache_misses_then_hits_then_expires_on_the_injected_clock() {
        reset_voice_catalogue_cache();
        let (handle, clock) = fake_clock(1_000);
        let catalogue = VoiceModelCatalogue {
            source: VoiceCatalogueSource::Backends,
            fast: Vec::new(),
            deep: Vec::new(),
            built_at: 1_000,
        };

        // Miss while the cache is empty.
        assert!(cache_lookup("none", read_clock(Some(&clock))).is_none());

        cache_store(
            "none".to_string(),
            catalogue.clone(),
            read_clock(Some(&clock)) as f64 + DEFAULT_TTL_MS,
        );

        // Hit at the same instant, and one millisecond before expiry.
        assert_eq!(
            cache_lookup("none", read_clock(Some(&clock))),
            Some(catalogue.clone())
        );
        handle.store(1_000 + DEFAULT_TTL_MS as i64 - 1, AtomicOrdering::SeqCst);
        assert_eq!(
            cache_lookup("none", read_clock(Some(&clock))),
            Some(catalogue.clone())
        );

        // Expired exactly at the TTL, because the check is `now() < expiresAt`.
        handle.store(1_000 + DEFAULT_TTL_MS as i64, AtomicOrdering::SeqCst);
        assert!(cache_lookup("none", read_clock(Some(&clock))).is_none());

        // A different key never hits.
        cache_store("other".to_string(), catalogue.clone(), 1e18);
        assert!(cache_lookup("none", read_clock(Some(&clock))).is_none());
        assert_eq!(
            cache_lookup("other", read_clock(Some(&clock))),
            Some(catalogue)
        );

        reset_voice_catalogue_cache();
        assert!(cache_lookup("other", read_clock(Some(&clock))).is_none());
    }

    // ---- buildVoiceCatalogue ------------------------------------------

    #[tokio::test]
    async fn injected_listing_bypasses_the_cache_and_builds_a_catalogue() {
        reset_voice_catalogue_cache();
        let config = empty_config();
        let models = vec![with_pricing(model("vendor/x"), json!(1), json!(1))];
        let list_models = listing(models);
        let (handle, clock) = fake_clock(5_000);
        let options = BuildVoiceCatalogueOptions {
            list_models: Some(&list_models),
            now: Some(&clock),
            ..BuildVoiceCatalogueOptions::new(&config)
        };

        let built = build_voice_catalogue(&options).await;
        assert_eq!(built.source, VoiceCatalogueSource::Backends);
        assert_eq!(built.built_at, 5_000);
        assert_eq!(built.fast.len(), 1);

        // Nothing was cached, so moving the clock cannot change the answer.
        handle.store(99_999, AtomicOrdering::SeqCst);
        assert!(cache_lookup("none", read_clock(Some(&clock))).is_none());
        let again = build_voice_catalogue(&options).await;
        assert_eq!(again.built_at, 99_999);
        assert!(cache_lookup("none", read_clock(Some(&clock))).is_none());
        reset_voice_catalogue_cache();
    }

    #[tokio::test]
    async fn rejected_listing_yields_the_empty_catalogue() {
        reset_voice_catalogue_cache();
        let config = empty_config();
        let list_models = failing_listing();
        let options = BuildVoiceCatalogueOptions {
            list_models: Some(&list_models),
            ..BuildVoiceCatalogueOptions::new(&config)
        };
        let built = build_voice_catalogue(&options).await;
        assert_eq!(built, EMPTY_CATALOGUE);
        reset_voice_catalogue_cache();
    }

    #[tokio::test]
    async fn empty_listing_still_reports_the_empty_source() {
        reset_voice_catalogue_cache();
        let config = empty_config();
        let list_models = listing(Vec::new());
        let (_, clock) = fake_clock(7);
        let options = BuildVoiceCatalogueOptions {
            list_models: Some(&list_models),
            now: Some(&clock),
            ..BuildVoiceCatalogueOptions::new(&config)
        };
        let built = build_voice_catalogue(&options).await;
        assert_eq!(built.source, VoiceCatalogueSource::Empty);
        assert!(built.fast.is_empty() && built.deep.is_empty());
        assert_eq!(built.built_at, 7);
        reset_voice_catalogue_cache();
    }

    #[tokio::test]
    async fn no_listing_seam_means_no_implicit_network_access() {
        reset_voice_catalogue_cache();
        let config = empty_config();
        let options = BuildVoiceCatalogueOptions::new(&config);
        let built = build_voice_catalogue(&options).await;
        assert_eq!(built, EMPTY_CATALOGUE);
        // Nothing was cached either, so a later call retries from scratch.
        assert!(cache_lookup("none", 0).is_none());
        reset_voice_catalogue_cache();
    }
}
