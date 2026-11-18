//! Escalation router for the real-time voice assistant.
//!
//! Native port of `packages/gateway/src/voice-assistant/router.ts`.
//!
//! The live realtime model is cheap and instant but shallow; the delegated Jait
//! agent is strong but slow. This module decides *which* delegated model a
//! spoken question deserves:
//!
//!   - [`VoiceEscalationTier::Fast`] — a quick lookup, a single tool call, a
//!     short summary. Cheap model, low reasoning effort, answer is expected in a
//!     couple of seconds.
//!   - [`VoiceEscalationTier::Deep`] — multi-step research, code understanding,
//!     project state, "why" questions, comparisons and plans. The user's
//!     strongest configured model.
//!
//! The live model still decides *whether* to escalate at all (it is the only one
//! that hears the conversation and the prosody), the router only decides *where
//! to send it*. When a System One model is configured the lane choice is made by
//! that model — it is a bounded two-way classification, which is exactly what
//! System One is for. Without System One we fall back to deterministic
//! heuristics so routing still behaves sanely offline.
//!
//! ## JS-fidelity notes
//!
//! The reference is TypeScript, so a handful of observable behaviours are
//! JavaScript-specific. They are mirrored here and called out where they occur:
//! word counting uses the ECMAScript `\s` set ([`crate::text::js_whitespace`]),
//! word boundaries in the signal regexes are the ASCII `\b` of ECMAScript
//! (`(?-u:\b)`) rather than the Unicode `\b` of the `regex` crate, and number
//! rendering in [`describe_candidate`] follows `String(number)`.

use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{Map, json};

use crate::services::system_one::{Cancellation, SystemOne, system_one_enabled};
use crate::text::{js_trim, js_whitespace};
use crate::voice_assistant::tier_catalog::{
    EffortTier, VoiceCostClass, VoiceModelCandidate, VoiceModelCatalogue, effort_for,
};

/// Which delegated lane a question is routed to.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceEscalationTier {
    /// Cheap model, low reasoning effort, answer expected in seconds.
    Fast,
    /// Strongest configured model, deep reasoning effort.
    Deep,
}

impl VoiceEscalationTier {
    /// The wire/storage spelling (`"fast"` / `"deep"`).
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fast => "fast",
            Self::Deep => "deep",
        }
    }

    fn effort_tier(self) -> EffortTier {
        match self {
            Self::Fast => EffortTier::Fast,
            Self::Deep => EffortTier::Deep,
        }
    }
}

/// Who picked the lane.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VoiceRouteSource {
    /// The live model asked for a lane explicitly.
    Explicit,
    /// A System One model classified the question.
    SystemOne,
    /// Offline difficulty estimate.
    Heuristic,
}

impl VoiceRouteSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Explicit => "explicit",
            Self::SystemOne => "system-one",
            Self::Heuristic => "heuristic",
        }
    }
}

/// A concrete model target, always resolved from what the install really has.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTierTarget {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
}

impl VoiceTierTarget {
    /// JS truthiness of `target.model`: undefined and `""` are both falsy.
    fn has_model(&self) -> bool {
        self.model.as_deref().is_some_and(|model| !model.is_empty())
    }
}

/// The router's verdict for one question.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceRoutePlan {
    pub tier: VoiceEscalationTier,
    pub source: VoiceRouteSource,
    /// Short human/model readable justification, surfaced in the tool result.
    pub reason: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    /// Concrete model chosen from the live catalogue. Absent when the catalogue
    /// knows nothing, in which case the caller keeps the thread's own defaults.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<VoiceTierTarget>,
}

impl VoiceRoutePlan {
    /// `{ tier, source: "explicit", reason: "requested by the live model" }` —
    /// no `confidence`, no `target` until [`Self::with_target`] runs.
    pub fn explicit(tier: VoiceEscalationTier) -> Self {
        Self {
            tier,
            source: VoiceRouteSource::Explicit,
            reason: "requested by the live model".to_string(),
            confidence: None,
            target: None,
        }
    }

    /// Attach the concrete target, but only when it names a model.
    fn with_target(mut self, catalogue: Option<&VoiceModelCatalogue>) -> Self {
        // `if (plan.target?.model) return plan;` — an already-resolved lane
        // (System One may have matched a concrete model) is never overwritten.
        if self.target.as_ref().is_some_and(VoiceTierTarget::has_model) {
            return self;
        }
        let target = resolve_tier_target(self.tier, catalogue);
        if target.has_model() {
            self.target = Some(target);
        }
        self
    }
}

/// Turn a catalogue candidate into a concrete delegation target.
pub fn candidate_to_target(
    candidate: &VoiceModelCandidate,
    tier: VoiceEscalationTier,
) -> VoiceTierTarget {
    let mut target = VoiceTierTarget {
        provider_id: Some(candidate.provider_id.clone()),
        model: Some(candidate.model.clone()),
        reasoning_effort: None,
    };
    if let Some(effort) = effort_for(candidate, tier.effort_tier()) {
        target.reasoning_effort = Some(effort);
    }
    target
}

/// Resolve the model for a tier from the live catalogue — never from a pinned
/// model name. Returns an empty target when the catalogue is empty so the
/// delegation falls back to whatever the thread is configured with.
pub fn resolve_tier_target(
    tier: VoiceEscalationTier,
    catalogue: Option<&VoiceModelCatalogue>,
) -> VoiceTierTarget {
    let shortlist = catalogue.map(|catalogue| match tier {
        VoiceEscalationTier::Deep => &catalogue.deep,
        VoiceEscalationTier::Fast => &catalogue.fast,
    });
    // `.find`-style first match: index 0 or nothing. There is no fallback to the
    // other lane — an empty shortlist means "keep the thread defaults".
    match shortlist.and_then(|shortlist| shortlist.first()) {
        Some(best) => candidate_to_target(best, tier),
        None => VoiceTierTarget::default(),
    }
}

/// The `costClass` spelling the reference compares against and interpolates.
fn cost_class_label(cost_class: VoiceCostClass) -> &'static str {
    match cost_class {
        VoiceCostClass::Free => "free",
        VoiceCostClass::Cheap => "cheap",
        VoiceCostClass::Standard => "standard",
        VoiceCostClass::Premium => "premium",
        VoiceCostClass::Unknown => "unknown",
    }
}

/// Render a catalogue price the way `` `${value}` `` would: numbers through
/// `String(number)` (integers have no trailing `.0`, non-finite values spell as
/// `NaN` / `Infinity` / `-Infinity`), strings verbatim. Any other JSON kind is
/// pathological for a price and is rendered as compact JSON — the reference
/// would render `[object Object]` there, which is not reproduced.
fn js_template_value(value: &Value) -> String {
    match value {
        Value::Number(number) => match number.as_f64() {
            Some(float) if float.is_nan() => "NaN".to_string(),
            Some(float) if float.is_infinite() => {
                if float.is_sign_negative() {
                    "-Infinity".to_string()
                } else {
                    "Infinity".to_string()
                }
            }
            Some(float) => format!("{float}"),
            None => number.to_string(),
        },
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

/// One-line, model-readable summary of why a candidate fits a tier.
fn describe_candidate(candidate: &VoiceModelCandidate) -> String {
    let cost = match candidate.cost_class {
        VoiceCostClass::Free => "no marginal cost (local)".to_string(),
        VoiceCostClass::Unknown => "price unknown".to_string(),
        other => {
            // `completionPerMTok ?? promptPerMTok ?? "?"` — nullish, so an
            // explicit JSON `null` counts as absent (Option covers that).
            let price = candidate
                .completion_per_m_tok
                .as_ref()
                .filter(|value| !value.is_null())
                .or_else(|| {
                    candidate
                        .prompt_per_m_tok
                        .as_ref()
                        .filter(|value| !value.is_null())
                });
            let rendered = match price {
                Some(value) => js_template_value(value),
                None => "?".to_string(),
            };
            format!("{} ({rendered}/1M output tokens)", cost_class_label(other))
        }
    };
    let effort = if candidate.reasoning_efforts.is_empty() {
        "no reasoning effort control".to_string()
    } else {
        format!(
            "accepts reasoning efforts {}",
            candidate.reasoning_efforts.join("/")
        )
    };
    match candidate.backend.as_deref() {
        // JS truthiness: an empty backend string adds no suffix.
        Some(backend) if !backend.is_empty() => format!("{cost}; {effort}; backend {backend}"),
        _ => format!("{cost}; {effort}"),
    }
}

/// ECMAScript word boundary: `\w` is `[A-Za-z0-9_]` only, unlike the Unicode
/// `\b` the `regex` crate uses by default, hence `(?-u:\b)` everywhere.
static ASKS_FOR_REASONING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?-u:\b)(why|causes?|root cause|reason|explain|trace|diagnose|investigate)(?-u:\b)",
    )
    .expect("valid regex")
});
static COMPARISON_OR_DESIGN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?-u:\b)(compare|trade-?offs?|versus|vs\.?|better|should i|pros and cons|design|architect)(?-u:\b)",
    )
    .expect("valid regex")
});
static CODE_WORK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?-u:\b)(refactor|implement|migrate|rewrite|fix|debug|failing|fails|error|exception|stack|regress)(?-u:\b)")
        .expect("valid regex")
});
static MULTI_STEP_PLAN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?-u:\b)(plan|strategy|roadmap|step by step|how (do|can) (we|i) (build|make|set up|configure))(?-u:\b)",
    )
    .expect("valid regex")
});
static PROJECT_STATE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?-u:\b)(threads?|sessions?|pull requests?|pr|repo|repositor(y|ies)|projects?|providers?|agents?|tools?|config|deploy|logs?|tests?|database|schema)(?-u:\b)",
    )
    .expect("valid regex")
});
static SMALL_TALK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?-u:\b)(today|tomorrow|weather|hello|hey|thanks|how are you|what time)(?-u:\b)")
        .expect("valid regex")
});

/// ECMAScript `String.prototype.toLowerCase`. ASCII and the overwhelming
/// majority of Unicode agree with Rust's `to_lowercase`; the handful of
/// locale-independent special cases (final sigma) are not reproduced.
fn js_to_lower_case(text: &str) -> String {
    text.to_lowercase()
}

/// JS `text.split(/\s+/).filter(Boolean).length` — ECMAScript whitespace,
/// empty pieces dropped. `str::split` already drops trailing empties, and the
/// explicit filter drops the leading one and runs of separators.
fn js_word_count(text: &str) -> usize {
    text.split(js_whitespace)
        .filter(|word| !word.is_empty())
        .count()
}

/// Deterministic difficulty estimate, 0 (trivial) .. 6 (hard).
///
/// Biased toward `fast`: a wrongly-deep route costs seconds of latency, whereas
/// a wrongly-fast route costs a bad answer, so only genuinely hard-sounding
/// questions should cross the threshold.
pub fn estimate_difficulty(question: &str) -> (i64, Vec<String>) {
    let text = js_to_lower_case(question);
    let mut signals: Vec<String> = Vec::new();
    let mut score: i64 = 0;

    let add = |score: &mut i64, signals: &mut Vec<String>, points: i64, signal: &str| {
        *score += points;
        signals.push(signal.to_string());
    };

    let words = js_word_count(&text);
    if words >= 28 {
        add(&mut score, &mut signals, 2, "long-request");
    } else if words >= 16 {
        add(&mut score, &mut signals, 1, "multi-clause-request");
    }
    if ASKS_FOR_REASONING.is_match(&text) {
        add(&mut score, &mut signals, 1, "asks-for-reasoning");
    }
    if COMPARISON_OR_DESIGN.is_match(&text) {
        add(&mut score, &mut signals, 2, "comparison-or-design");
    }
    if CODE_WORK.is_match(&text) {
        add(&mut score, &mut signals, 2, "code-work");
    }
    if MULTI_STEP_PLAN.is_match(&text) {
        add(&mut score, &mut signals, 1, "multi-step-plan");
    }
    if PROJECT_STATE.is_match(&text) {
        add(&mut score, &mut signals, 1, "project-state");
    }
    if SMALL_TALK.is_match(&text) && words <= 10 {
        score = 0.max(score - 2);
        signals.push("small-talk".to_string());
    }
    if words <= 7 && !signals.iter().any(|signal| signal == "code-work") {
        score = 0.max(score - 1);
        signals.push("short-utterance".to_string());
    }

    (score.clamp(0, 6), signals)
}

/// Score at which the heuristic switches to the deep lane.
const DEEP_THRESHOLD: i64 = 3;

fn heuristic_plan(question: &str) -> VoiceRoutePlan {
    let (score, signals) = estimate_difficulty(question);
    let tier = if score >= DEEP_THRESHOLD {
        VoiceEscalationTier::Deep
    } else {
        VoiceEscalationTier::Fast
    };
    let reason = if signals.is_empty() {
        format!("difficulty {score}/6")
    } else {
        // `signals.slice(0, 3).join(", ")`
        let head = signals
            .iter()
            .take(3)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
        format!("difficulty {score}/6 ({head})")
    };
    let confidence = match tier {
        // `Math.min(0.9, 0.45 + score * 0.08)`
        VoiceEscalationTier::Deep => 0.9_f64.min(0.45 + score as f64 * 0.08),
        VoiceEscalationTier::Fast => 0.6,
    };
    VoiceRoutePlan {
        tier,
        source: VoiceRouteSource::Heuristic,
        reason,
        confidence: Some(confidence),
        target: None,
    }
}

/// Default hard ceiling for the routing decision itself (`ROUTER_TIMEOUT_MS`).
/// The live model has already committed to escalating, so the decision must not
/// cost the user a noticeable pause — past this we just use the heuristic.
pub const ROUTER_TIMEOUT_MS: u64 = 4_000;

/// The live model's own lane request: a concrete lane, or `"auto"` (let the
/// router decide).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VoiceExplicitTier {
    Fast,
    Deep,
    Auto,
}

impl VoiceExplicitTier {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fast => "fast",
            Self::Deep => "deep",
            Self::Auto => "auto",
        }
    }

    /// The lane this request pins, if any. `auto` pins nothing, exactly like an
    /// omitted `explicitTier` in the reference.
    fn lane(self) -> Option<VoiceEscalationTier> {
        match self {
            Self::Fast => Some(VoiceEscalationTier::Fast),
            Self::Deep => Some(VoiceEscalationTier::Deep),
            Self::Auto => None,
        }
    }
}

impl From<VoiceEscalationTier> for VoiceExplicitTier {
    fn from(tier: VoiceEscalationTier) -> Self {
        match tier {
            VoiceEscalationTier::Fast => Self::Fast,
            VoiceEscalationTier::Deep => Self::Deep,
        }
    }
}

/// Everything the router needs from the outside world, injected rather than
/// looked up so routing is deterministic and testable.
#[derive(Default)]
pub struct VoiceRouteInput {
    /// The user's spoken question, untrimmed.
    pub question: String,
    /// Optional conversation tail the live model wants the router to see.
    pub context: Option<String>,
    /// Configured API keys; decides whether System One can run at all.
    pub api_keys: Option<HashMap<String, String>>,
    /// Override for [`ROUTER_TIMEOUT_MS`].
    pub timeout_ms: Option<u64>,
    /// Cancellation of the originating request. When it fires the routing
    /// decision is abandoned and the heuristic answer is used — the same
    /// degradation the reference performs (its `catch` swallows the abort).
    pub signal: Option<Cancellation>,
    /// Lane the live model asked for. `None` behaves like `"auto"`.
    pub explicit_tier: Option<VoiceExplicitTier>,
    /// The live model catalogue, used both to build the System One criteria and
    /// to resolve the concrete model. `None` means "catalogue unknown", which
    /// yields a target-less plan.
    pub catalogue: Option<VoiceModelCatalogue>,
    /// System One handle. `None` (or no keys) disables model-based routing.
    pub system_one: Option<Arc<SystemOne>>,
}

impl VoiceRouteInput {
    pub fn new(question: impl Into<String>) -> Self {
        Self {
            question: question.into(),
            ..Self::default()
        }
    }
}

/// JS `slice(-keep)` on UTF-16 code units, i.e. the tail of at most `keep`
/// units. A cut that would split a surrogate pair is rounded forward to the next
/// `char` boundary: an unpaired surrogate is not representable in Rust, so at
/// most one unit fewer than the reference is kept for astral characters.
fn js_slice_from_end(text: &str, keep: usize) -> &str {
    let total: usize = text.chars().map(char::len_utf16).sum();
    let start = total.saturating_sub(keep);
    if start == 0 {
        return text;
    }
    let mut units = 0usize;
    for (index, character) in text.char_indices() {
        if units >= start {
            return &text[index..];
        }
        units += character.len_utf16();
    }
    ""
}

/// JS `slice(0, take)` on UTF-16 code units. Same surrogate caveat as
/// [`js_slice_from_end`]; the result never exceeds `take` units.
fn js_slice_head(text: &str, take: usize) -> &str {
    let mut units = 0usize;
    for (index, character) in text.char_indices() {
        let width = character.len_utf16();
        if units + width > take {
            return &text[..index];
        }
        units += width;
    }
    text
}

/// Fast and deep shortlists interleaved into one menu for the decision model:
/// up to four cheap models, then the single strongest one, deduplicated by model
/// name and capped at six entries (the reference's `mergedShortlist`).
fn merged_shortlist(catalogue: Option<&VoiceModelCatalogue>) -> Vec<&VoiceModelCandidate> {
    let Some(catalogue) = catalogue else {
        return Vec::new();
    };
    let mut merged: Vec<&VoiceModelCandidate> = Vec::new();
    let mut seen: HashSet<&str> = HashSet::new();
    for candidate in catalogue
        .fast
        .iter()
        .take(4)
        .chain(catalogue.deep.iter().take(1))
    {
        if seen.insert(candidate.model.as_str()) {
            merged.push(candidate);
        }
    }
    // `merged.slice(0, 6)` — the cap is unreachable with a 5-item merge, but it
    // is part of the contract and cheap to keep.
    merged.truncate(6);
    merged
}

/// One lane as the decision model sees it: `- model: cost; effort; backend`.
fn describe_lane(tier: VoiceEscalationTier, catalogue: Option<&VoiceModelCatalogue>) -> String {
    let bucket = catalogue.map(|catalogue| match tier {
        VoiceEscalationTier::Fast => &catalogue.fast,
        VoiceEscalationTier::Deep => &catalogue.deep,
    });
    let lines = bucket
        .map(|bucket| {
            bucket
                .iter()
                .map(|candidate| {
                    format!("- {}: {}", candidate.model, describe_candidate(candidate))
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    // `lines || "- none known"` — empty string is falsy.
    if lines.is_empty() {
        "- none known".to_string()
    } else {
        lines
    }
}

/// The `state` blob handed to System One: labelled sections separated by blank
/// lines, empty sections dropped (`filter(Boolean).join("\n\n")`).
fn routing_state(input: &VoiceRouteInput, catalogue: Option<&VoiceModelCatalogue>) -> String {
    let recent = match input.context.as_deref() {
        Some(context) if !context.is_empty() => {
            format!(
                "Recent conversation:\n{}",
                js_slice_from_end(context, 1_200)
            )
        }
        _ => String::new(),
    };
    // Prompt text is byte-identical to the reference so behaviour of the
    // external model is unchanged; `filter(Boolean)` keeps falsy sections out.
    let sections = [
        "You are routing questions asked by a user to a voice assistant.".to_string(),
        "The live voice model answers instantly but cannot reason deeply.".to_string(),
        "Escalated questions go to a delegated coding/research agent.".to_string(),
        "Lane \"fast\": cheap model, low effort — lookups, single-tool fetches, short summaries, status checks, one-fact answers.".to_string(),
        "Lane \"deep\": strong model, high effort — multi-step work, code reading or changes, project/repo state, diagnosis, comparisons, plans, anything where a quick answer would likely be wrong or incomplete.".to_string(),
        "When unsure, prefer fast: latency is the product here.".to_string(),
        format!(
            "Models reachable from this install for the cheap lane:\n{}",
            describe_lane(VoiceEscalationTier::Fast, catalogue)
        ),
        format!(
            "Models reachable from this install for the strong lane:\n{}",
            describe_lane(VoiceEscalationTier::Deep, catalogue)
        ),
        recent,
        format!(
            "Question to route:\n{}",
            js_slice_head(&input.question, 1_500)
        ),
    ];
    sections
        .into_iter()
        .filter(|section| !section.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// The two decision questions. Insertion order is preserved (serde_json is built
/// with `preserve_order`), matching the reference's `Object.fromEntries`, so the
/// criteria appear in catalogue ranking order rather than alphabetically.
fn decision_questions(shortlist: &[&VoiceModelCandidate]) -> Value {
    let mut lane_criteria = Map::new();
    lane_criteria.insert(
        "fast".to_string(),
        json!("a quick lookup, single tool call, or one-sentence factual answer"),
    );
    lane_criteria.insert(
        "deep".to_string(),
        json!("multi-step reasoning, code or project state, diagnosis, comparison or plan"),
    );
    let mut lane = Map::new();
    lane.insert("type".to_string(), json!("choice"));
    lane.insert(
        "instructions".to_string(),
        json!("Choose the escalation lane for the question to route."),
    );
    lane.insert("criteria".to_string(), Value::Object(lane_criteria));

    let mut questions = Map::new();
    questions.insert("lane".to_string(), Value::Object(lane));

    // `...(shortlist.length ? { model: … } : {})` — no model question without a
    // single known candidate.
    if !shortlist.is_empty() {
        let mut model_criteria = Map::new();
        for candidate in shortlist {
            model_criteria.insert(
                candidate.model.clone(),
                json!(describe_candidate(candidate)),
            );
        }
        let mut model = Map::new();
        model.insert("type".to_string(), json!("choice"));
        model.insert(
            "instructions".to_string(),
            json!("Choose which model actually available on this Jait install should answer. Prefer the cheapest model that is good enough; choose a stronger, pricier model only when the lane needs deep reasoning."),
        );
        model.insert("criteria".to_string(), Value::Object(model_criteria));
        questions.insert("model".to_string(), Value::Object(model));
    }

    Value::Object(questions)
}

/// Resolves when the caller's request is cancelled; never resolves when there is
/// nothing to listen to (`input.signal?.addEventListener("abort", onAbort)`).
async fn wait_for_external_abort(signal: Option<Cancellation>) {
    match signal {
        Some(signal) => {
            signal.cancelled().await;
        }
        None => std::future::pending::<()>().await,
    }
}

/// Ask a System One model which lane — and which model — should answer.
///
/// Returns `None` on *any* failure: no System One, no keys, aborted by the
/// caller, timed out, transport error, or an answer that is not `fast`/`deep`.
/// The reference achieves the same with `catch { return null }`, so a broken
/// System One degrades to heuristics rather than failing the escalation.
async fn system_one_plan(input: &VoiceRouteInput) -> Option<VoiceRoutePlan> {
    let api_keys = input.api_keys.as_ref();
    if !system_one_enabled(api_keys) {
        return None;
    }
    let system_one = input.system_one.as_ref()?;
    let catalogue = input.catalogue.as_ref();
    let shortlist = merged_shortlist(catalogue);

    let state = routing_state(input, catalogue);
    let questions = decision_questions(&shortlist);
    let controller = Cancellation::default();
    let timeout = Duration::from_millis(input.timeout_ms.unwrap_or(ROUTER_TIMEOUT_MS));

    // The reference races three things: the decision request, the caller's abort
    // signal, and its own timeout; whichever wins, `finally` clears the timer and
    // the listener. Here losing branches are simply dropped, which cancels the
    // in-flight request exactly like aborting the controller does.
    let response = tokio::select! {
        biased;
        result = system_one.evaluate(api_keys, &state, &questions, Some(&controller)) => {
            match result {
                Ok(response) => response,
                Err(_) => return None,
            }
        }
        _ = wait_for_external_abort(input.signal.clone()) => {
            controller.abort("cancelled");
            return None;
        }
        _ = tokio::time::sleep(timeout) => {
            controller.abort("timeout");
            return None;
        }
    };

    let answers = response.get("answers")?;
    let answer = answers.get("lane");
    // `answer?.choice?.trim().toLowerCase()`. A non-string `choice` would throw in
    // the reference and land in `catch`; treating it as absent is equivalent.
    let choice = answer
        .and_then(|answer| answer.get("choice"))
        .and_then(Value::as_str)
        .map(|choice| js_to_lower_case(js_trim(choice)));
    let tier = match choice.as_deref() {
        Some("fast") => VoiceEscalationTier::Fast,
        Some("deep") => VoiceEscalationTier::Deep,
        _ => return None,
    };

    // `answers["model"]?.choice?.trim()` — trimmed but *not* lowercased; matching
    // against the catalogue stays case-sensitive, as in the reference.
    let chosen_model = answers
        .get("model")
        .and_then(|model| model.get("choice"))
        .and_then(Value::as_str)
        .map(js_trim);
    let matched = chosen_model.and_then(|chosen| {
        shortlist
            .iter()
            .copied()
            .find(|candidate| candidate.model == chosen)
    });

    let target = match matched {
        Some(candidate) => candidate_to_target(candidate, tier),
        None => resolve_tier_target(tier, catalogue),
    };
    // `typeof answer?.confidence === "number"` — JSON has no NaN/Infinity, so
    // "is a number" is exactly "is a JSON number".
    let confidence = answer
        .and_then(|answer| answer.get("confidence"))
        .and_then(Value::as_f64);
    let reason = match matched {
        Some(candidate) => format!(
            "system-one chose {} lane with {}",
            tier.as_str(),
            candidate.model
        ),
        None => format!("system-one chose {} lane", tier.as_str()),
    };

    let mut plan = VoiceRoutePlan {
        tier,
        source: VoiceRouteSource::SystemOne,
        reason,
        confidence,
        target: None,
    };
    // `...(target.model ? { target } : {})`
    if target.has_model() {
        plan.target = Some(target);
    }
    Some(plan)
}

/// Decide the lane for a delegated voice question.
///
/// `explicit` short-circuits everything: when the live model already named a
/// lane we honour it, because it had the audio and the conversation. Otherwise
/// System One decides if it is configured and healthy, and the deterministic
/// heuristic covers everything else (including an empty question and any
/// cancellation/error from System One).
pub async fn plan_voice_escalation(input: &VoiceRouteInput) -> VoiceRoutePlan {
    let question = js_trim(input.question.as_str()).to_string();
    let catalogue = input.catalogue.as_ref();

    if let Some(tier) = input.explicit_tier.and_then(VoiceExplicitTier::lane) {
        return VoiceRoutePlan::explicit(tier).with_target(catalogue);
    }
    if question.is_empty() {
        return VoiceRoutePlan {
            tier: VoiceEscalationTier::Fast,
            source: VoiceRouteSource::Heuristic,
            reason: "no question text".to_string(),
            confidence: None,
            target: None,
        }
        .with_target(catalogue);
    }

    if let Some(plan) = system_one_plan(input).await {
        return plan.with_target(catalogue);
    }
    heuristic_plan(&question).with_target(catalogue)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::system_one::{DecisionHttpResponse, DecisionRequest, DecisionTransport};
    use crate::voice_assistant::tier_catalog::{VoiceCatalogueSource, VoiceStrengthClass};
    use std::future::Future;
    use std::pin::Pin;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn candidate(
        provider: &str,
        model: &str,
        efforts: &[&str],
        strength: VoiceStrengthClass,
        cost: VoiceCostClass,
    ) -> VoiceModelCandidate {
        VoiceModelCandidate {
            provider_id: provider.to_string(),
            model: model.to_string(),
            reasoning_efforts: efforts.iter().map(|effort| effort.to_string()).collect(),
            cost_class: cost,
            strength_class: strength,
            backend: None,
            prompt_per_m_tok: None,
            completion_per_m_tok: None,
        }
    }

    fn catalogue() -> VoiceModelCatalogue {
        VoiceModelCatalogue {
            source: VoiceCatalogueSource::Backends,
            fast: vec![
                candidate(
                    "openrouter",
                    "tiny-live",
                    &[],
                    VoiceStrengthClass::Small,
                    VoiceCostClass::Cheap,
                ),
                candidate(
                    "openrouter",
                    "small-live",
                    &["low"],
                    VoiceStrengthClass::Small,
                    VoiceCostClass::Standard,
                ),
            ],
            deep: vec![
                candidate(
                    "anthropic",
                    "frontier",
                    &["medium", "high"],
                    VoiceStrengthClass::Strong,
                    VoiceCostClass::Premium,
                ),
                candidate(
                    "openrouter",
                    "mid-live",
                    &["low"],
                    VoiceStrengthClass::Mid,
                    VoiceCostClass::Standard,
                ),
            ],
            built_at: 0,
        }
    }

    fn empty_catalogue() -> VoiceModelCatalogue {
        VoiceModelCatalogue {
            source: VoiceCatalogueSource::Empty,
            fast: Vec::new(),
            deep: Vec::new(),
            built_at: 0,
        }
    }

    /// Every test uses the same fake keys: enough for `system_one_enabled`, with
    /// no reachable network because the transport is always stubbed.
    fn keys() -> Option<HashMap<String, String>> {
        let mut keys = HashMap::new();
        keys.insert("SYSTEM_ONE_API_KEY".to_string(), "test-key".to_string());
        Some(keys)
    }

    enum StubAnswer {
        Value(Value),
        Error(String),
        Pending,
    }

    struct StubTransport {
        answer: StubAnswer,
        calls: AtomicUsize,
    }

    impl StubTransport {
        fn new(answer: StubAnswer) -> Arc<Self> {
            Arc::new(Self {
                answer,
                calls: AtomicUsize::new(0),
            })
        }

        fn calls(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }

    impl DecisionTransport for StubTransport {
        fn send<'a>(
            &'a self,
            _request: DecisionRequest,
        ) -> Pin<Box<dyn Future<Output = Result<DecisionHttpResponse, String>> + Send + 'a>>
        {
            self.calls.fetch_add(1, Ordering::SeqCst);
            match &self.answer {
                StubAnswer::Value(body) => {
                    let body = body.clone();
                    Box::pin(async move {
                        Ok(DecisionHttpResponse {
                            status: 200,
                            body: Ok(body),
                        })
                    })
                }
                StubAnswer::Error(message) => {
                    let message = message.clone();
                    Box::pin(async move { Err(message) })
                }
                StubAnswer::Pending => Box::pin(std::future::pending()),
            }
        }
    }

    fn wired(question: &str, transport: Arc<StubTransport>) -> VoiceRouteInput {
        let mut input = VoiceRouteInput::new(question);
        input.api_keys = keys();
        input.catalogue = Some(catalogue());
        input.system_one = Some(Arc::new(SystemOne::new(transport)));
        input
    }

    #[tokio::test]
    async fn wake_word_only_utterance_degrades_to_fast_without_a_model_call() {
        // The wake phrase itself is stripped upstream (`voice::wake_candidate`),
        // so a wake-word-only utterance reaches the router as empty text. The
        // reference returns the fast heuristic immediately and never consults
        // System One.
        let transport = StubTransport::new(StubAnswer::Value(json!({})));
        let input = wired("  \n\t  ", transport.clone());

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.tier, VoiceEscalationTier::Fast);
        assert_eq!(plan.source, VoiceRouteSource::Heuristic);
        assert_eq!(plan.reason, "no question text");
        assert_eq!(plan.confidence, None);
        assert_eq!(transport.calls(), 0, "no decision call for empty text");
        let target = plan
            .target
            .expect("fast target still resolved from catalogue");
        assert_eq!(target.model.as_deref(), Some("tiny-live"));
    }

    #[tokio::test]
    async fn explicit_deep_lane_bypasses_system_one_entirely() {
        let transport = StubTransport::new(StubAnswer::Error("must not be called".to_string()));
        let mut input = wired("what changed in the repo today?", transport.clone());
        input.explicit_tier = Some(VoiceExplicitTier::Deep);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.tier, VoiceEscalationTier::Deep);
        assert_eq!(plan.source, VoiceRouteSource::Explicit);
        assert_eq!(plan.reason, "requested by the live model");
        assert_eq!(plan.confidence, None);
        assert_eq!(transport.calls(), 0);
        let target = plan.target.expect("deep target resolved from catalogue");
        assert_eq!(target.provider_id.as_deref(), Some("anthropic"));
        assert_eq!(target.model.as_deref(), Some("frontier"));
        assert_eq!(target.reasoning_effort.as_deref(), Some("high"));
    }

    #[tokio::test]
    async fn explicit_fast_lane_uses_the_cheap_shortlist_head() {
        let transport = StubTransport::new(StubAnswer::Value(json!({})));
        let mut input = wired("thanks, that's all", transport.clone());
        input.explicit_tier = Some(VoiceExplicitTier::Fast);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.tier, VoiceEscalationTier::Fast);
        assert_eq!(plan.source, VoiceRouteSource::Explicit);
        let target = plan.target.expect("fast target");
        assert_eq!(target.model.as_deref(), Some("tiny-live"));
        assert_eq!(target.reasoning_effort, None, "no effort tiers declared");
        assert_eq!(transport.calls(), 0);
    }

    #[tokio::test]
    async fn explicit_auto_is_not_an_explicit_lane() {
        // `"auto"` fails the `=== "fast" || === "deep"` guard in the reference and
        // therefore falls through to the heuristic path.
        assert_eq!(VoiceExplicitTier::Auto.lane(), None);
        assert_eq!(
            VoiceExplicitTier::Fast.lane(),
            Some(VoiceEscalationTier::Fast)
        );
        assert_eq!(
            VoiceExplicitTier::Deep.lane(),
            Some(VoiceEscalationTier::Deep)
        );

        let transport = StubTransport::new(StubAnswer::Value(json!({})));
        let mut input = wired("summarise this one paragraph please", transport.clone());
        input.explicit_tier = Some(VoiceExplicitTier::Auto);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(
            plan.source,
            VoiceRouteSource::Heuristic,
            "auto falls through to heuristics"
        );
    }

    #[tokio::test]
    async fn multi_signal_code_question_escalates_deep_by_heuristic() {
        let transport = StubTransport::new(StubAnswer::Error("offline".to_string()));
        let question = "Read src/voice_assistant/router.rs and compare it with the reference, \
                        then plan the migration step by step and fix the failing tests.";
        let input = wired(question, transport);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.source, VoiceRouteSource::Heuristic);
        assert_eq!(plan.tier, VoiceEscalationTier::Deep);
        let (score, signals) = estimate_difficulty(js_trim(question));
        assert!(
            score >= DEEP_THRESHOLD,
            "expected a deep score, got {score} from {signals:?}"
        );
        assert!(!signals.is_empty());
        // `signals.slice(0, 3).join(", ")` — the plan reason truncates, the
        // estimate itself keeps every signal.
        let head = signals
            .iter()
            .take(3)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
        assert_eq!(plan.reason, format!("difficulty {score}/6 ({head})"));
        let confidence = plan.confidence.expect("heuristic confidence");
        let expected = (0.45 + score as f64 * 0.08).min(0.9);
        assert!(
            (confidence - expected).abs() < 1e-9,
            "{confidence} vs {expected}"
        );
        let target = plan.target.expect("deep target");
        assert_eq!(target.model.as_deref(), Some("frontier"));
    }

    #[tokio::test]
    async fn short_small_talk_stays_fast_with_flat_confidence() {
        let transport = StubTransport::new(StubAnswer::Error("offline".to_string()));
        let input = wired("thanks!", transport);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.tier, VoiceEscalationTier::Fast);
        assert_eq!(plan.source, VoiceRouteSource::Heuristic);
        assert_eq!(plan.confidence, Some(0.6));
        let (score, signals) = estimate_difficulty(js_trim("thanks!"));
        assert!(
            score < DEEP_THRESHOLD,
            "small talk must stay shallow: {score}"
        );
        let expected_reason = if signals.is_empty() {
            format!("difficulty {score}/6")
        } else {
            let head = signals
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ");
            format!("difficulty {score}/6 ({head})")
        };
        assert_eq!(plan.reason, expected_reason);
        let target = plan.target.expect("fast target");
        assert_eq!(target.model.as_deref(), Some("tiny-live"));
    }

    /// The decision contract echoes every question's `type` back and answers a
    /// `choice` question with one of its criteria keys; `system_one::evaluate`
    /// rejects anything else *before* the router runs, so happy-path stubs have to
    /// be contract shaped. `model` is the non-`baseUrl` envelope field the
    /// validator requires alongside `answers`.
    fn contract_body(lane: &str, model: Option<&str>, confidence: Option<f64>) -> Value {
        let mut lane_answer = serde_json::Map::new();
        lane_answer.insert("type".to_string(), json!("choice"));
        lane_answer.insert("choice".to_string(), json!(lane));
        if let Some(confidence) = confidence {
            lane_answer.insert("confidence".to_string(), json!(confidence));
        }
        let mut answers = serde_json::Map::new();
        answers.insert("lane".to_string(), Value::Object(lane_answer));
        if let Some(model) = model {
            answers.insert(
                "model".to_string(),
                json!({ "type": "choice", "choice": model }),
            );
        }
        json!({ "model": "system-one-test", "answers": Value::Object(answers) })
    }

    #[tokio::test]
    async fn system_one_lane_and_in_shortlist_model_are_honoured() {
        let transport = StubTransport::new(StubAnswer::Value(contract_body(
            "deep",
            Some("frontier"),
            Some(0.87),
        )));
        let input = wired("what broke in CI?", transport.clone());

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(transport.calls(), 1);
        assert_eq!(plan.source, VoiceRouteSource::SystemOne);
        assert_eq!(plan.tier, VoiceEscalationTier::Deep);
        assert_eq!(plan.reason, "system-one chose deep lane with frontier");
        assert_eq!(plan.confidence, Some(0.87));
        let target = plan.target.expect("matched target");
        assert_eq!(target.provider_id.as_deref(), Some("anthropic"));
        assert_eq!(target.model.as_deref(), Some("frontier"));
        assert_eq!(target.reasoning_effort.as_deref(), Some("high"));
    }

    #[tokio::test]
    async fn system_one_fast_lane_resolves_the_named_model() {
        let transport = StubTransport::new(StubAnswer::Value(contract_body(
            "fast",
            Some("small-live"),
            None,
        )));
        let input = wired("what is the gateway port?", transport.clone());

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.source, VoiceRouteSource::SystemOne);
        assert_eq!(plan.tier, VoiceEscalationTier::Fast);
        assert_eq!(plan.reason, "system-one chose fast lane with small-live");
        assert_eq!(
            plan.confidence, None,
            "a vote without confidence stays None"
        );
        let target = plan.target.expect("named fast target");
        assert_eq!(target.model.as_deref(), Some("small-live"));
        assert_eq!(target.reasoning_effort.as_deref(), Some("low"));
    }

    /// The reference falls back to the lane default when `answers.model.choice`
    /// names something outside the shortlist. The decision contract rejects such a
    /// vote before the router sees it, so the reachable version of that branch is
    /// "no shortlist at all": then there is no model question and no model vote.
    #[tokio::test]
    async fn system_one_lane_without_a_catalogue_reports_no_target() {
        let transport = StubTransport::new(StubAnswer::Value(contract_body("deep", None, None)));
        let mut input = wired("trace the failing migration", transport.clone());
        input.catalogue = None;

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(transport.calls(), 1);
        assert_eq!(plan.source, VoiceRouteSource::SystemOne);
        assert_eq!(plan.tier, VoiceEscalationTier::Deep);
        assert_eq!(plan.reason, "system-one chose deep lane");
        assert_eq!(plan.confidence, None);
        assert_eq!(plan.target, None, "no catalogue keeps the thread defaults");
    }

    #[tokio::test]
    async fn out_of_contract_lane_choice_degrades_to_heuristic() {
        let transport = StubTransport::new(StubAnswer::Value(contract_body(
            "medium",
            Some("frontier"),
            None,
        )));
        let input = wired("compare these two designs for me", transport);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(
            plan.source,
            VoiceRouteSource::Heuristic,
            "an unknown lane must fall back, not invent a tier"
        );
    }

    #[tokio::test]
    async fn malformed_answer_shapes_degrade_to_heuristic() {
        for body in [
            json!({}),
            json!({ "answers": {} }),
            json!({ "answers": { "lane": {} } }),
            json!({ "answers": { "lane": { "choice": 42 } } }),
            json!({ "answers": { "lane": "deep" } }),
            json!("not an object"),
        ] {
            let transport = StubTransport::new(StubAnswer::Value(body.clone()));
            let input = wired("give me the release notes summary", transport.clone());

            let plan = plan_voice_escalation(&input).await;

            assert_eq!(transport.calls(), 1, "the call is still attempted: {body}");
            assert_eq!(
                plan.source,
                VoiceRouteSource::Heuristic,
                "malformed answer {body} must degrade"
            );
        }
    }

    #[tokio::test]
    async fn transport_failure_degrades_to_heuristic() {
        let transport = StubTransport::new(StubAnswer::Error("decision service down".to_string()));
        let input = wired("how many open PRs are there?", transport);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.source, VoiceRouteSource::Heuristic);
        assert!(plan.reason.starts_with("difficulty "));
    }

    #[tokio::test(start_paused = true)]
    async fn decision_timeout_degrades_to_heuristic_without_real_waiting() {
        let transport = StubTransport::new(StubAnswer::Pending);
        let mut input = wired("what is the deployment status?", transport.clone());
        input.timeout_ms = Some(ROUTER_TIMEOUT_MS);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(transport.calls(), 1);
        assert_eq!(plan.source, VoiceRouteSource::Heuristic);
    }

    #[tokio::test]
    async fn cancellation_mid_flight_returns_the_heuristic_plan() {
        let transport = StubTransport::new(StubAnswer::Pending);
        let signal = Cancellation::default();
        let mut input = wired(
            "read the whole repository and summarise it",
            transport.clone(),
        );
        input.signal = Some(signal.clone());

        let abort = signal.clone();
        let canceller = tokio::spawn(async move {
            tokio::task::yield_now().await;
            abort.abort("test cancel");
        });

        let plan = tokio::time::timeout(Duration::from_secs(5), plan_voice_escalation(&input))
            .await
            .expect("cancellation must not hang the router");
        canceller.await.expect("canceller task");

        assert!(signal.is_aborted(), "the test really cancelled the call");
        assert_eq!(transport.calls(), 1);
        assert_eq!(plan.source, VoiceRouteSource::Heuristic);
    }

    #[tokio::test]
    async fn already_cancelled_signal_never_reaches_a_system_one_plan() {
        // The decision never answers, so a plan can only exist if the already
        // aborted signal somehow lost the race in the biased select.
        let transport = StubTransport::new(StubAnswer::Pending);
        let signal = Cancellation::default();
        signal.abort("pre-cancelled");
        let mut input = wired("plan the migration", transport.clone());
        input.signal = Some(signal);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.source, VoiceRouteSource::Heuristic);
    }

    #[tokio::test]
    async fn missing_catalogue_keeps_thread_defaults() {
        let transport = StubTransport::new(StubAnswer::Value(json!({})));
        let mut input = VoiceRouteInput::new("what time is it in Berlin?");
        input.catalogue = None;

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.source, VoiceRouteSource::Heuristic);
        assert_eq!(transport.calls(), 0, "no system one handle was provided");
        assert_eq!(plan.target, None, "no catalogue means no explicit target");
    }

    #[tokio::test]
    async fn empty_catalogue_keeps_thread_defaults_for_explicit_lanes() {
        let mut input = VoiceRouteInput::new("dig into the failing integration test");
        input.catalogue = Some(empty_catalogue());
        input.explicit_tier = Some(VoiceExplicitTier::Deep);

        let plan = plan_voice_escalation(&input).await;

        assert_eq!(plan.tier, VoiceEscalationTier::Deep);
        assert_eq!(plan.source, VoiceRouteSource::Explicit);
        assert_eq!(plan.target, None);
    }

    #[tokio::test]
    async fn existing_target_is_not_overwritten_by_the_catalogue() {
        let mut plan = VoiceRoutePlan {
            tier: VoiceEscalationTier::Deep,
            source: VoiceRouteSource::Explicit,
            reason: "requested by the live model".to_string(),
            confidence: None,
            target: Some(VoiceTierTarget {
                provider_id: Some("openrouter".to_string()),
                model: Some("pinned-model".to_string()),
                reasoning_effort: Some("medium".to_string()),
            }),
        };
        let catalogue = catalogue();
        plan = plan.with_target(Some(&catalogue));
        let target = plan.target.expect("pinned target kept");
        assert_eq!(target.model.as_deref(), Some("pinned-model"));

        let mut empty_target = VoiceRoutePlan {
            tier: VoiceEscalationTier::Fast,
            source: VoiceRouteSource::Explicit,
            reason: "requested by the live model".to_string(),
            confidence: None,
            target: None,
        };
        empty_target = empty_target.with_target(Some(&catalogue));
        assert_eq!(
            empty_target
                .target
                .expect("catalogue target")
                .model
                .as_deref(),
            Some("tiny-live")
        );
    }

    #[test]
    fn routing_state_mirrors_reference_sections_and_slices() {
        let mut input = VoiceRouteInput::new(format!("A{}Z", "q".repeat(3_000)));
        input.context = Some(format!("old-context{}", "y".repeat(2_000)));

        let state = routing_state(&input, Some(&catalogue()));

        assert!(state.contains("You are routing questions asked by a user to a voice assistant."));
        assert!(
            state.contains("Models reachable from this install for the cheap lane:\n- tiny-live: ")
        );
        assert!(
            state.contains("Models reachable from this install for the strong lane:\n- frontier: ")
        );
        // Catalogue order is preserved: the ranking head is listed first.
        assert!(state.find("- tiny-live").unwrap() < state.find("- small-live").unwrap());

        // `slice(-1200)` keeps the tail of the context, `slice(0, 1500)` the head.
        assert!(state.contains(&format!("Recent conversation:\n{}", "y".repeat(1_200))));
        assert!(!state.contains("old-context"), "context head is dropped");
        let question_line = state
            .lines()
            .skip_while(|line| *line != "Question to route:")
            .nth(1)
            .expect("question section present");
        // `question.slice(0, 1500)` hard-truncates, so the trailing `Z` is cut off.
        assert_eq!(question_line, format!("A{}", "q".repeat(1_499)));
        assert!(!question_line.ends_with('Z'));
        assert_eq!(js_utf16_len(question_line), 1_500);
        // Empty context contributes nothing, so no blank section is emitted.
        let bare = routing_state(&VoiceRouteInput::new("hi"), None);
        assert!(!bare.contains("Recent conversation:"));
        assert!(bare.contains("cheap lane:\n- none known"));
        assert!(!bare.contains("\n\n\n"), "sections are joined once");
    }

    #[test]
    fn utf16_slicing_stays_on_char_boundaries() {
        // Four-byte characters count as two UTF-16 units in JS; Rust strings are
        // UTF-8, so the helpers must not split inside a scalar value.
        let text = "😀😀😀😀";
        assert_eq!(js_utf16_len(text), 8);
        let head = js_slice_head(text, 3);
        assert_eq!(
            js_utf16_len(head),
            2,
            "partial unit rounds down to the boundary"
        );
        let tail = js_slice_from_end(text, 3);
        assert_eq!(js_utf16_len(tail), 2);
        assert_eq!(js_slice_head("abc", 0), "");
        assert_eq!(js_slice_from_end("abc", 0), "");
        assert_eq!(js_slice_head("abc", 99), "abc");
    }

    fn js_utf16_len(text: &str) -> usize {
        text.encode_utf16().count()
    }

    #[test]
    fn word_count_and_lowercase_follow_javascript() {
        assert_eq!(js_word_count("  a  b\tc\nd  "), 4);
        assert_eq!(js_word_count("   "), 0);
        assert_eq!(js_word_count(""), 0);
        // `\s` in ECMAScript matches NBSP and friends.
        assert_eq!(js_word_count("a\u{00a0}b"), 2);
        assert_eq!(js_to_lower_case("DEEP"), "deep");
        assert_eq!(js_to_lower_case("Straße"), "straße");
    }
}
