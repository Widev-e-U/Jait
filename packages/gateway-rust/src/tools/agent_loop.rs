//! Native port of `packages/gateway/src/tools/agent-loop.ts` (5231 lines TS).
//!
//! The TypeScript module is a reusable, streamable tool-calling loop used by the
//! chat route and by `agent.spawn` sub-agents. This port keeps the same control
//! flow, literals, defaults, limits, retry policy and ordering, and moves every
//! process/network/filesystem/runtime concern behind an injected object-safe
//! host trait (manual `BoxFuture` pattern, same style as
//! `crate::tools::agent_acp_runner` and `crate::network_scan`).
//!
//! HOST BOUNDARIES (all injected; tests supply fakes)
//! ---------------------------------------------------------------------------
//! * [`AgentRuntime`] — `Date.now()`, `randomUUID()`, `setTimeout`, `AbortSignal`,
//!   `process.env`, `console`, token estimation (`estimateMessageTokens`,
//!   `estimateTokens`), context-state persistence (`loadContextState`/
//!   `saveContextState` from `tools/context-evidence.ts`), evidence projection
//!   (`projectToolEvidence`), provider prompt caching (`applyContextCaching` from
//!   `services/context-cache.ts`) and `system-one` (`systemOneEnabled`,
//!   `evaluateDecision`).
//! * [`LlmHost`] — the outbound HTTP boundary: `fetchJaitLlm`
//!   (`services/opencode-go-fetch.ts`), `llmRequestHeaders`
//!   (`services/llm-headers.ts`) and the raw SSE / NDJSON byte transport.
//!   Stream *parsing*, delta accumulation, tool-call assembly and thinking
//!   extraction stay native in this file.
//! * [`ToolExecutor`] — the `ToolExecutor` function type from the TS source:
//!   registry lookup, input validation, subprocess/ACP execution, cancellation.
//! * [`LoopObserver`] — `onEvent` / `onContext` / `onPersist` /
//!   `onAssistantCheckpoint` callbacks.
//! * ContextBudgetHost-style traits are *not* injected: budget clamping and token
//!   estimation semantics live in `crate::services::context_budget` and
//!   `crate::tools::token_estimator`; the runtime trait only wraps the parts that
//!   read environment or disk.
//!
//! Nothing in this file shells out, opens sockets or touches the filesystem.

#![allow(clippy::too_many_arguments)]

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};

/// Boxed future used for every async host boundary (matches the crate style in
/// `tools/agent_acp_runner.rs`): object-safe, no `async_trait` dependency.
pub type BoxFuture<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

// ── Constants (verbatim from agent-loop.ts) ─────────────────────────────

pub(crate) const DEFAULT_MAX_RETRIES: usize = 2;
const MAX_PLAIN_TEXT_RETRIES: usize = 2;
const MAX_EMPTY_RESPONSE_RETRIES: usize = 2;
const MAX_TRANSPORT_RETRIES: usize = 2;
const TRANSPORT_RETRY_BASE_DELAY_MS: u64 = 2_000;
const MAX_RATE_LIMIT_RETRIES: usize = 5;
const RATE_LIMIT_RETRY_BASE_DELAY_MS: u64 = 2_000;
const RATE_LIMIT_RETRY_MAX_DELAY_MS: u64 = 30_000;
const MAX_REPETITION_RECOVERIES: usize = 3;
const MAX_LENGTH_CONTINUATIONS: usize = 3;
const MAX_DUPLICATE_CALL_STREAK: usize = 3;
const MAX_DUPLICATE_CALL_INTERVENTIONS: usize = 2;
const MAX_SAME_TOOL_CALLS_PER_TURN: usize = 6;
const MAX_SAME_TOOL_CALLS_PER_TURN_HARD: usize = 10;
const MAX_IDENTICAL_FAILURES_PER_CALL: usize = 2;
const MAX_TOOL_CALLS_PER_ROUND: usize = 64;
const DEFAULT_TOOL_ROUND_CHECKPOINT: usize = 64;
const ABSOLUTE_TOOL_ROUND_BUDGET: usize = 200;
const MAX_REPLAYED_THINKING_ROUNDS: usize = 3;
const MAX_REPLAY_STEERINGS: usize = 1;
const CONVERGE_NUDGE_ROUND_STREAK: usize = 12;
const FORCE_ANSWER_ROUND_STREAK: usize = 24;
const MAX_LOW_PROGRESS_READ_STREAK: usize = 8;
const MIN_READ_PROGRESS_RATIO: f64 = 0.25;
const SWARM_MAX_UNDELEGATED_READS: usize = 6;
const MAX_PERSISTED_THINKING_CHARS: usize = 4000;
const MIN_REPEAT_THINKING_CHARS: usize = 80;
const PRUNE_TARGET_RATIO: f64 = 0.45;
/// Fraction of the context window at which mid-turn compaction fires.
pub const CONTEXT_COMPACT_TRIGGER_RATIO: f64 = 0.85;
const SUMMARY_ITEM_LIMIT: usize = 5;
const SUMMARY_TEXT_LIMIT: usize = 220;
const SUMMARY_TOOL_RESULT_MAX_CHARS: usize = 2_000;
const CHECKPOINT_OUTPUT_TOKENS: u64 = 8192;
const CHECKPOINT_OUTPUT_TOKENS_FLOOR: u64 = 2048;
const ACTIVE_TURN_TOOL_ROUNDS_TO_KEEP: usize = 8;

const MIN_REPETITION_SCAN_CHARS: usize = 600;
const MIN_REPETITION_COPIES: usize = 8;
/// Minimum repeated span length before degenerate repetition is reported.
pub const MIN_REPETITION_SPAN_CHARS: usize = 600;
const REPETITION_SCAN_WINDOW_CHARS: usize = 16_000;
const REPETITION_PROBE_CHARS: usize = 48;
const REPETITION_CHECK_INTERVAL_CHARS: usize = 256;

const MIN_NEAR_REPETITION_SEED_CHARS: usize = 40;
const MIN_NEAR_REPETITION_STRIDE_CHARS: usize = 4;
const MIN_NEAR_REPETITION_COPIES: usize = 8;
const NEAR_REPETITION_COHESION_CHARS: usize = 240;
const NEAR_REPETITION_TAIL_CHARS: usize = 400;

/// How much of a failure message is scanned for transient-error markers.
const TRANSIENT_SCAN_CHARS: usize = 400;

/// Prompt injected when the System One decision model is available.
pub const SYSTEM_ONE_PROMPT: &str = "<systemOneModel>
System One Model is configured. Use decision.evaluate for bounded choices, relevance scores, yes/no assessments, and batch classification when that avoids lengthy deliberation. Supply the necessary state and explicit alternatives or ordered score levels. Discover the tool with tools.search if needed. It returns structured decisions, not generated explanations. Treat results as advice: verify against the actual state before acting.
</systemOneModel>";

const LLM_SUMMARIZATION_SYSTEM_PROMPT: &str = "You are a context compaction engine. You receive a conversation transcript and return a single structured handoff summary. Preserve facts, decisions, file paths, identifiers, commands and open questions. Never invent details. Output only the summary.";

const LLM_SUMMARIZATION_PROMPT: &str = "You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.";

const CHECKPOINT_TRUNCATION_NOTE: &str = "[summary truncated: output token limit reached]";

// ── Public types ────────────────────────────────────────────────────────

/// Wire format for a single OpenAI tool call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct OpenAiToolCall {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type", default = "function_type")]
    pub type_: String,
    pub function: FunctionCall,
}

fn function_type() -> String {
    "function".to_string()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct FunctionCall {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub arguments: String,
}

impl OpenAiToolCall {
    pub fn new(id: impl Into<String>, name: impl Into<String>, arguments: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            type_: function_type(),
            function: FunctionCall { name: name.into(), arguments: arguments.into() },
        }
    }

    /// Parsed `function.arguments`; `{}` when the model emitted invalid JSON
    /// (the TS source treats that as an empty argument object).
    pub fn parsed_arguments(&self) -> Value {
        serde_json::from_str::<Value>(&self.function.arguments).unwrap_or_else(|_| json!({}))
    }
}

/// A chat message in the conversation history.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AgentMessage {
    /// Recovery handle for model-only pruning; omitted from the wire transcript.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub evidence_reference: Option<String>,
    pub role: String,
    #[serde(default)]
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tool_calls: Option<Vec<OpenAiToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub name: Option<String>,
    /// Hidden reasoning emitted alongside the visible content. Persisted so the
    /// model keeps reasoning continuity across tool rounds; never user-visible.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub thinking: Option<String>,
    /// True for messages injected by the gateway/agent loop rather than sent by
    /// the user. Synthetic messages still reach the model but callers exclude
    /// them from user-facing history, persistence and prompt counts.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub synthetic: Option<bool>,
}

impl AgentMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self { role: "system".into(), content: content.into(), ..Default::default() }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self { role: "user".into(), content: content.into(), ..Default::default() }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self { role: "assistant".into(), content: content.into(), ..Default::default() }
    }

    pub fn tool(tool_call_id: impl Into<String>, name: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: "tool".into(),
            content: content.into(),
            tool_call_id: Some(tool_call_id.into()),
            name: Some(name.into()),
            ..Default::default()
        }
    }

    pub fn is_synthetic(&self) -> bool {
        self.synthetic.unwrap_or(false)
    }
}

/// Segment for interleaved rendering of text, reasoning and tool calls.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MessageSegment {
    Text {
        content: String,
    },
    Thinking {
        content: String,
    },
    ToolGroup {
        #[serde(rename = "callIds")]
        call_ids: Vec<String>,
    },
    Error {
        content: String,
    },
    Steering {
        content: String,
        #[serde(rename = "displayContent", skip_serializing_if = "Option::is_none", default)]
        display_content: Option<String>,
    },
}

impl MessageSegment {
    pub fn content(&self) -> Option<&str> {
        match self {
            MessageSegment::Text { content }
            | MessageSegment::Thinking { content }
            | MessageSegment::Error { content }
            | MessageSegment::Steering { content, .. } => Some(content),
            MessageSegment::ToolGroup { .. } => None,
        }
    }
}

/// OpenAI function-calling tool schema.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct OpenAiToolSchema {
    #[serde(rename = "type", default = "function_type")]
    pub type_: String,
    pub function: ToolSchemaFunction,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ToolSchemaFunction {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub parameters: Value,
}

impl OpenAiToolSchema {
    pub fn new(name: impl Into<String>, description: impl Into<String>, parameters: Value) -> Self {
        Self {
            type_: function_type(),
            function: ToolSchemaFunction { name: name.into(), description: description.into(), parameters },
        }
    }
}

/// Snapshot of an outbound model request, with credentials removed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct LlmContextFlowRound {
    pub round: u64,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub model: String,
    pub messages: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tools: Option<Vec<OpenAiToolSchema>>,
    #[serde(rename = "tool_choice", skip_serializing_if = "Option::is_none", default)]
    pub tool_choice: Option<String>,
    /// Metrics captured after the round completes.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub metrics: Option<RoundMetrics>,
}

/// Per-round accounting emitted on `onContext`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct RoundMetrics {
    #[serde(rename = "promptTokens", skip_serializing_if = "Option::is_none", default)]
    pub prompt_tokens: Option<u64>,
    #[serde(rename = "completionTokens", skip_serializing_if = "Option::is_none", default)]
    pub completion_tokens: Option<u64>,
    #[serde(rename = "cacheReadTokens", skip_serializing_if = "Option::is_none", default)]
    pub cache_read_tokens: Option<u64>,
    #[serde(rename = "cacheWriteTokens", skip_serializing_if = "Option::is_none", default)]
    pub cache_write_tokens: Option<u64>,
    #[serde(rename = "costUsd", skip_serializing_if = "Option::is_none", default)]
    pub cost_usd: Option<f64>,
    #[serde(rename = "durationMs", skip_serializing_if = "Option::is_none", default)]
    pub duration_ms: Option<u64>,
}

/// Model/provider configuration. Unknown keys are preserved so provider-specific
/// bodies (prompt caching extras) survive a round trip.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct LlmConfig {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub backend: Option<String>,
    #[serde(rename = "openaiBaseUrl", default)]
    pub openai_base_url: String,
    #[serde(rename = "openaiModel", default)]
    pub openai_model: String,
    #[serde(rename = "openaiApiKey", skip_serializing_if = "Option::is_none", default)]
    pub openai_api_key: Option<String>,
    #[serde(rename = "ollamaUrl", skip_serializing_if = "Option::is_none", default)]
    pub ollama_url: Option<String>,
    #[serde(rename = "contextWindow", default = "default_context_window")]
    pub context_window: u64,
    #[serde(rename = "tokenPrices", skip_serializing_if = "Option::is_none", default)]
    pub token_prices: Option<Value>,
    #[serde(rename = "compressionLlm", skip_serializing_if = "Option::is_none", default)]
    pub compression_llm: Option<Box<LlmConfig>>,
    #[serde(rename = "contextBudget", skip_serializing_if = "Option::is_none", default)]
    pub context_budget: Option<Value>,
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none", default)]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub temperature: Option<f64>,
    #[serde(rename = "maxOutputTokens", skip_serializing_if = "Option::is_none", default)]
    pub max_output_tokens: Option<u64>,
    #[serde(rename = "requireReasoning", skip_serializing_if = "Option::is_none", default)]
    pub require_reasoning: Option<bool>,
    #[serde(flatten, default)]
    pub extra: Map<String, Value>,
}

fn default_context_window() -> u64 {
    128_000
}

impl LlmConfig {
    pub fn backend_or_default(&self) -> &str {
        self.backend.as_deref().unwrap_or("the model backend")
    }

    pub fn is_ollama(&self) -> bool {
        self.backend.as_deref() == Some("ollama")
    }

    pub fn is_omniroute(&self) -> bool {
        self.backend.as_deref() == Some("omniroute")
    }
}

/// A completed tool call, kept for events, persistence and replay guards.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ExecutedToolCall {
    #[serde(rename = "callId")]
    pub call_id: String,
    pub tool: String,
    #[serde(default)]
    pub args: Value,
    pub ok: bool,
    #[serde(default)]
    pub message: String,
    #[serde(rename = "startedAt")]
    pub started_at: i64,
    #[serde(rename = "completedAt")]
    pub completed_at: i64,
    #[serde(rename = "retryCount", default)]
    pub retry_count: usize,
}

/// Loop event streamed to the caller.
///
/// The TS union is emitted as JSON on the wire; keeping it as [`Value`] keeps
/// unknown/newer event fields forward-compatible, matching how neighbouring
/// native modules (`services/context_budget`, `tools/model_result`) model plain
/// JSON shapes.
pub type AgentLoopEvent = Value;

/// Result of a completed turn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AgentLoopResult {
    #[serde(default)]
    pub content: String,
    #[serde(rename = "toolCalls", default)]
    pub tool_calls: Vec<ExecutedToolCall>,
    #[serde(default)]
    pub segments: Vec<MessageSegment>,
    #[serde(default)]
    pub rounds: u64,
    #[serde(rename = "finishReason", skip_serializing_if = "Option::is_none", default)]
    pub finish_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub usage: Option<Value>,
    #[serde(rename = "contextRounds", skip_serializing_if = "Option::is_none", default)]
    pub context_rounds: Option<Vec<LlmContextFlowRound>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub status: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub aborted: Option<bool>,
}

/// Priority levels for queued tool calls.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ToolCallPriority {
    /// Run before anything else (e.g. abort-checks, validation).
    Critical = 0,
    /// Normal tool calls from the LLM.
    Normal = 1,
    /// Deferred / low-priority background work.
    Low = 2,
}

impl Default for ToolCallPriority {
    fn default() -> Self {
        ToolCallPriority::Normal
    }
}

/// A queued tool call entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QueuedToolCall {
    #[serde(rename = "toolCall")]
    pub tool_call: OpenAiToolCall,
    #[serde(default)]
    pub priority: ToolCallPriority,
    #[serde(rename = "queuedAt", default)]
    pub queued_at: i64,
}

/// Steering message metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct SteeringMessageMeta {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub source: Option<String>,
    #[serde(rename = "displayContent", skip_serializing_if = "Option::is_none", default)]
    pub display_content: Option<String>,
}

/// A mid-turn steering message injected by the user.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct SteeringMessage {
    #[serde(default)]
    pub content: String,
    #[serde(flatten, default)]
    pub meta: SteeringMessageMeta,
}

// ── Error formatting helpers (exported in TS) ───────────────────────────

/// Parse a provider error body into `(serverMsg, code)`.
fn parse_error_body(response_text: &str) -> (Option<String>, Option<String>) {
    let parsed: Value = match serde_json::from_str(response_text) {
        Ok(value) => value,
        Err(_) => return (None, None),
    };
    match parsed.get("error") {
        Some(Value::String(text)) => (Some(text.clone()), None),
        Some(Value::Object(object)) => {
            let message = object.get("message").and_then(|v| v.as_str()).map(str::to_string);
            let code = object
                .get("code")
                .and_then(|v| v.as_str())
                .or_else(|| object.get("type").and_then(|v| v.as_str()))
                .map(str::to_string);
            (message, code)
        }
        _ => (None, None),
    }
}

/// Format an LLM HTTP error into a user-friendly message.
///
/// Mirrors `formatLLMError` exactly, including both provider shapes
/// (`{"error":{"message"}}` and Ollama's bare `{"error":"..."}`).
pub fn format_llm_error(status: u16, response_text: &str) -> String {
    let (server_msg, code) = parse_error_body(response_text);
    match status {
        401 => "Your API key is invalid or expired. Please check your settings.".to_string(),
        403 => "Access denied by the model provider. Please check your API key permissions.".to_string(),
        429 => {
            let quota = code.as_deref() == Some("insufficient_quota")
                || server_msg.as_deref().map(|m| m.contains("quota")).unwrap_or(false);
            if quota {
                "You've exceeded your API quota. Please check your plan and billing details.".to_string()
            } else {
                format!(
                    "Rate limited by the model provider. Please wait a moment and try again.{}",
                    server_msg.as_deref().map(|m| format!("\n{m}")).unwrap_or_default()
                )
            }
        }
        500 | 502 | 503 => {
            format!("The model provider is experiencing issues ({status}). Please try again later.")
        }
        _ => match server_msg {
            Some(message) => format!("Request failed ({status}): {message}"),
            None => format!("Request failed with status {status}. Please try again."),
        },
    }
}

/// Whether a provider HTTP error is a plain rate limit (retryable) rather than a
/// condition the user must fix. Quota exhaustion also arrives as `429` but is
/// excluded so the turn does not stall and then fail identically.
pub fn is_retryable_rate_limit(status: u16, response_text: &str) -> bool {
    if status != 429 {
        return false;
    }
    let (server_msg, code) = parse_error_body(response_text);
    if let Some(code) = code.as_deref() {
        if code == "insufficient_quota" || code == "billing_hard_limit_reached" {
            return false;
        }
    }
    if let Some(message) = server_msg.as_deref() {
        let lower = message.to_lowercase();
        if lower.contains("quota") || lower.contains("billing") || contains_out_of_credits(&lower) {
            return false;
        }
    }
    true
}

fn contains_out_of_credits(lower: &str) -> bool {
    // /quota|billing|out of credits?/i
    lower.contains("out of credit")
}

/// `Retry-After` in milliseconds when the provider sent one. The header is
/// either delay-seconds or an HTTP date; anything unparseable yields `None` so
/// the caller falls back to its own exponential backoff.
pub fn parse_retry_after_ms(header: Option<&str>, now_ms: i64) -> Option<i64> {
    let trimmed = header?.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(seconds) = trimmed.parse::<f64>() {
        if seconds.is_finite() {
            return Some(((seconds * 1000.0) as i64).max(0));
        }
    }
    match parse_http_date_ms(trimmed) {
        Some(as_date) => Some((as_date - now_ms).max(0)),
        None => None,
    }
}

/// Minimal `Date.parse` for the RFC 1123 / RFC 850 / asctime forms providers use
/// for `Retry-After`. Returns epoch milliseconds.
fn parse_http_date_ms(text: &str) -> Option<i64> {
    // Only the numeric-looking forms are handled natively; anything else is
    // treated as unparseable, which is what `Date.parse` returning NaN means.
    let mut parts = text.split([' ', ',', '-']).filter(|p| !p.is_empty());
    let first = parts.next()?;
    // "Sun, 06 Nov 1994 08:49:37 GMT" -> day after weekday
    let day: i64 = if first.chars().all(|c| c.is_ascii_digit()) { first.parse().ok()? } else { parts.next()?.parse().ok()? };
    let month = parts.next()?;
    let year: i64 = parts.next()?.parse().ok()?;
    let month_index = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    .iter()
    .position(|m| month.starts_with(m))? as i64
        + 1;
    let time = parts.next()?;
    let mut hms = time.split(':');
    let hour: i64 = hms.next()?.parse().ok()?;
    let minute: i64 = hms.next()?.parse().ok()?;
    let second: i64 = hms.next()?.parse().ok()?;
    Some(civil_to_epoch_ms(year, month_index, day, hour, minute, second))
}

/// Days-to-civil inverse (Howard Hinnant) — avoids pulling in a date crate.
fn civil_to_epoch_ms(year: i64, month: i64, day: i64, hour: i64, minute: i64, second: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    ((days * 86_400 + hour * 3_600 + minute * 60 + second) * 1000) as i64
}

/// Backoff before re-issuing a rate-limited round: the provider's own
/// `Retry-After` when given, else exponential (2s, 4s, 8s, 16s, 30s), clamped.
pub fn rate_limit_backoff_ms(attempt: usize, retry_after_ms: Option<i64>) -> u64 {
    let backoff = match retry_after_ms {
        Some(value) => value as f64,
        None => RATE_LIMIT_RETRY_BASE_DELAY_MS as f64 * 2f64.powi(attempt as i32 - 1),
    };
    (backoff.max(0.0).min(RATE_LIMIT_RETRY_MAX_DELAY_MS as f64)) as u64
}

/// Transport-level error classification, replacing inspection of `undici`'s
/// `error.cause.code` / `error.cause.name` from the Node runtime.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TransportFailure {
    /// `error.name` (`TimeoutError`, `AbortError`, `TypeError`, ...).
    pub name: Option<String>,
    pub message: Option<String>,
    /// `error.cause.name` (`HeadersTimeoutError`, `BodyTimeoutError`, ...).
    pub cause_name: Option<String>,
    /// `error.cause.code` (`ECONNREFUSED`, `UND_ERR_SOCKET`, ...).
    pub cause_code: Option<String>,
}

impl TransportFailure {
    pub fn from_code(code: &str) -> Self {
        Self { cause_code: Some(code.to_string()), ..Default::default() }
    }
}

/// Turn a transport-level failure into something a user can act on, or `None`
/// when it is not a connection-class failure (so genuine bugs keep propagating).
pub fn format_connection_error(failure: &TransportFailure, backend: Option<&str>, openai_base_url: &str) -> Option<String> {
    let code = failure.cause_code.as_deref();
    let name = failure.name.as_deref();
    let message = failure.message.as_deref().unwrap_or("");
    let is_timeout = name == Some("TimeoutError")
        || (name == Some("AbortError") && !message.contains("user"))
        || failure.cause_name.as_deref() == Some("HeadersTimeoutError")
        || failure.cause_name.as_deref() == Some("BodyTimeoutError")
        || code == Some("UND_ERR_HEADERS_TIMEOUT")
        || code == Some("UND_ERR_BODY_TIMEOUT");
    let is_connection_refused = matches!(code, Some("ECONNREFUSED") | Some("ECONNRESET") | Some("EHOSTUNREACH"));
    let is_dns_failure = matches!(code, Some("ENOTFOUND") | Some("EAI_AGAIN"));
    if !is_timeout && !is_connection_refused && !is_dns_failure {
        return None;
    }

    let where_ = format!("{} at {}", backend.unwrap_or("the model backend"), openai_base_url);
    let self_hosted = matches!(backend, Some("omniroute") | Some("ollama"));
    let hint = if self_hosted {
        if backend == Some("omniroute") {
            "Start the OmniRoute router, or correct OMNIROUTE_BASE_URL in Settings → API keys. The \"Test connection\" button there checks it."
        } else {
            "Start Ollama, or correct OLLAMA_URL in Settings → API keys."
        }
    } else {
        "Check your network connection and the configured base URL."
    };

    Some(if is_timeout {
        format!("No response from {where_} in time. {hint}")
    } else if is_dns_failure {
        format!("Could not resolve the host for {where_}. {hint}")
    } else {
        format!("Could not connect to {where_}. {hint}")
    })
}

/// Whether a transport failure is transient and worth retrying the same round.
/// Deliberately excludes ECONNREFUSED/ENOTFOUND — a dead backend stays dead.
pub fn is_transient_transport_error(failure: &TransportFailure) -> bool {
    let code = failure.cause_code.as_deref();
    matches!(failure.cause_name.as_deref(), Some("HeadersTimeoutError") | Some("BodyTimeoutError"))
        || matches!(
            code,
            Some("UND_ERR_HEADERS_TIMEOUT")
                | Some("UND_ERR_BODY_TIMEOUT")
                | Some("UND_ERR_SOCKET")
                | Some("UND_ERR_CONNECT_TIMEOUT")
                | Some("ECONNRESET")
                | Some("EPIPE")
                | Some("ETIMEDOUT")
        )
}

/// Compact reason string for transport-retry logs, e.g. "headers timeout".
pub fn describe_transport_error(failure: &TransportFailure) -> String {
    let code = failure.cause_code.as_deref();
    let cause_name = failure.cause_name.as_deref();
    if cause_name == Some("HeadersTimeoutError") || code == Some("UND_ERR_HEADERS_TIMEOUT") {
        return "headers timeout (backend hung)".to_string();
    }
    if cause_name == Some("BodyTimeoutError") || code == Some("UND_ERR_BODY_TIMEOUT") {
        return "body timeout (stream stalled)".to_string();
    }
    if matches!(code, Some("UND_ERR_SOCKET") | Some("ECONNRESET") | Some("EPIPE")) {
        return format!("connection dropped ({})", code.unwrap_or("undici socket error"));
    }
    if matches!(code, Some("ETIMEDOUT") | Some("UND_ERR_CONNECT_TIMEOUT")) {
        return "timed out".to_string();
    }
    failure.message.clone().unwrap_or_else(|| "unknown transport failure".to_string())
}

/// Whether an LLM error response indicates context-window overflow.
pub fn is_context_overflow_error(status: u16, response_text: &str) -> bool {
    if status != 400 && status != 413 {
        return false;
    }
    let lower = response_text.to_lowercase();
    [
        "context length",
        "context_length",
        "maximum context",
        "max context",
        "too long",
        "too many tokens",
        "prompt is too long",
        "context window",
        "maximum number of tokens",
        "input is too long",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

// ── Tool-name mapping (OpenAI-safe names) ───────────────────────────────

const OPENAI_NAME_MAX_CHARS: usize = 64;

fn name_map() -> &'static Mutex<NameMap> {
    static MAP: std::sync::OnceLock<Mutex<NameMap>> = std::sync::OnceLock::new();
    MAP.get_or_init(|| Mutex::new(NameMap::default()))
}

#[derive(Default)]
struct NameMap {
    /// OpenAI-safe name -> original tool name.
    to_tool: HashMap<String, String>,
    /// Original tool name -> OpenAI-safe name.
    to_openai: HashMap<String, String>,
    /// Sanitised name -> the distinct originals that collapsed onto it.
    collisions: HashMap<String, HashSet<String>>,
}

fn sanitize_openai_name(name: &str) -> String {
    let mut out: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    if out.chars().count() > OPENAI_NAME_MAX_CHARS {
        out = out.chars().take(OPENAI_NAME_MAX_CHARS).collect();
    }
    out
}

/// Deterministic 6-char FNV-1a suffix used to disambiguate truncated/sanitised
/// tool names that collide (e.g. `mcp__foo.bar` and `mcp__foo/bar`).
fn name_suffix(name: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in name.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{:06x}", hash & 0xff_ffff)
}

/// Convert a tool name into an OpenAI-safe function name.
pub fn to_openai_name(name: &str) -> String {
    let sanitized = sanitize_openai_name(name);
    let mut map = name_map().lock().expect("tool name map poisoned");
    if let Some(existing) = map.to_openai.get(name) {
        return existing.clone();
    }
    let owner = map.to_tool.get(&sanitized).cloned();
    let chosen = match owner {
        Some(owner) if owner != name => {
            // Collision: keep the winner and give the newcomer a deterministic
            // hash-suffixed name so both remain addressable.
            let stem_len = OPENAI_NAME_MAX_CHARS.saturating_sub(7);
            let stem: String = sanitized.chars().take(stem_len).collect();
            let suffixed = format!("{stem}_{}", name_suffix(name));
            map.collisions.entry(sanitized.clone()).or_default().insert(owner);
            map.collisions.entry(sanitized).or_default().insert(name.to_string());
            suffixed
        }
        _ => sanitized,
    };
    map.to_tool.insert(chosen.clone(), name.to_string());
    map.to_openai.insert(name.to_string(), chosen.clone());
    chosen
}

/// Register every tool schema's name so round-tripping works before the first
/// model response references it.
pub fn register_openai_name_mappings(names: &[String]) {
    for name in names {
        to_openai_name(name);
    }
}

/// Map an OpenAI-safe name back to the real tool name (identity when unknown).
pub fn from_openai_name(name: &str) -> String {
    let map = name_map().lock().expect("tool name map poisoned");
    map.to_tool.get(name).cloned().unwrap_or_else(|| name.to_string())
}

/// Sanitised names that collapsed more than one distinct tool name. Providers
/// reject ambiguous schemas, so callers use this to report the conflict.
pub fn list_ambiguous_openai_names() -> Vec<String> {
    let map = name_map().lock().expect("tool name map poisoned");
    let mut names: Vec<String> = map
        .collisions
        .iter()
        .filter(|(_, originals)| originals.len() > 1)
        .map(|(sanitized, _)| sanitized.clone())
        .collect();
    names.sort();
    names
}

/// Test-only reset of the process-global name map.
#[cfg(test)]
fn reset_name_map() {
    *name_map().lock().expect("tool name map poisoned") = NameMap::default();
}

/// Convert tool schemas to their OpenAI-safe equivalents.
pub fn to_tool_schemas(schemas: &[OpenAiToolSchema]) -> Vec<OpenAiToolSchema> {
    register_openai_name_mappings(&schemas.iter().map(|s| s.function.name.clone()).collect::<Vec<_>>());
    schemas
        .iter()
        .map(|schema| {
            let mut clone = schema.clone();
            clone.function.name = to_openai_name(&schema.function.name);
            clone
        })
        .collect()
}

// ── History repair ──────────────────────────────────────────────────────

/// Repair a message list so every `tool_calls` entry has exactly one matching
/// `tool` message, in order, and orphan tool messages are dropped. Providers
/// reject a transcript that violates this invariant.
pub fn repair_tool_call_history(messages: &[AgentMessage]) -> Vec<AgentMessage> {
    let mut out: Vec<AgentMessage> = Vec::with_capacity(messages.len());
    let mut index = 0usize;
    while index < messages.len() {
        let message = &messages[index];
        if message.role == "assistant" {
            if let Some(calls) = message.tool_calls.as_ref().filter(|calls| !calls.is_empty()) {
                let mut repaired = message.clone();
                let mut calls = calls.clone();
                calls.retain(|call| !call.id.is_empty());
                if calls.is_empty() {
                    repaired.tool_calls = None;
                    out.push(repaired);
                    index += 1;
                    continue;
                }
                repaired.tool_calls = Some(calls.clone());
                out.push(repaired);

                // Collect the tool messages that follow, keyed by call id.
                let mut responses: HashMap<String, AgentMessage> = HashMap::new();
                let mut extra: Vec<AgentMessage> = Vec::new();
                let mut cursor = index + 1;
                while cursor < messages.len() && messages[cursor].role == "tool" {
                    let tool_message = &messages[cursor];
                    match tool_message.tool_call_id.as_ref() {
                        Some(id) if calls.iter().any(|call| &call.id == id) => {
                            responses.entry(id.clone()).or_insert_with(|| tool_message.clone());
                        }
                        // Orphaned response (its call was repaired away).
                        _ => extra.push(tool_message.clone()),
                    }
                    cursor += 1;
                }
                for call in calls {
                    match responses.remove(&call.id) {
                        Some(mut tool_message) => {
                            if tool_message.name.is_none() {
                                tool_message.name = Some(call.function.name.clone());
                            }
                            out.push(tool_message);
                        }
                        None => out.push(AgentMessage::tool(
                            call.id.clone(),
                            call.function.name.clone(),
                            json!({ "ok": false, "message": "Tool call was not executed." }).to_string(),
                        )),
                    }
                }
                let _ = extra;
                index = cursor;
                continue;
            }
            out.push(message.clone());
            index += 1;
            continue;
        }
        if message.role == "tool" {
            // Orphan tool message with no preceding assistant call: drop it.
            index += 1;
            continue;
        }
        out.push(message.clone());
        index += 1;
    }
    out
}

// ── Serialisation for providers ─────────────────────────────────────────

/// Serialise the history for an OpenAI-compatible `/chat/completions` request.
///
/// `require_reasoning` replays hidden thinking as `reasoning_content`, which
/// reasoning models require for assistant tool-call turns.
pub fn serialize_messages(messages: &[AgentMessage], require_reasoning: bool) -> Vec<Value> {
    let mut out = Vec::with_capacity(messages.len());
    for message in messages {
        let mut object = Map::new();
        object.insert("role".into(), Value::String(message.role.clone()));

        let has_calls = message.tool_calls.as_ref().map(|c| !c.is_empty()).unwrap_or(false);
        if message.role == "assistant" && has_calls && message.content.is_empty() {
            object.insert("content".into(), Value::Null);
        } else {
            object.insert("content".into(), Value::String(message.content.clone()));
        }

        if let Some(calls) = message.tool_calls.as_ref().filter(|c| !c.is_empty()) {
            object.insert("tool_calls".into(), serde_json::to_value(calls).unwrap_or(Value::Null));
        }
        if let Some(id) = message.tool_call_id.as_ref() {
            object.insert("tool_call_id".into(), Value::String(id.clone()));
        }
        if let Some(name) = message.name.as_ref() {
            object.insert("name".into(), Value::String(name.clone()));
        }
        if message.role == "assistant" {
            if let Some(thinking) = message.thinking.as_ref().filter(|t| !t.is_empty()) {
                if require_reasoning {
                    object.insert("reasoning_content".into(), Value::String(thinking.clone()));
                }
            }
        }
        out.push(Value::Object(object));
    }
    out
}

/// Serialise the history for Ollama's native `/api/chat` endpoint, which takes
/// `tool_calls[].function.arguments` as an object and names tool replies via
/// `tool_name`.
pub fn serialize_messages_for_ollama(messages: &[AgentMessage]) -> Vec<Value> {
    let mut out = Vec::with_capacity(messages.len());
    for message in messages {
        let mut object = Map::new();
        object.insert("role".into(), Value::String(message.role.clone()));
        object.insert("content".into(), Value::String(message.content.clone()));
        if let Some(calls) = message.tool_calls.as_ref().filter(|c| !c.is_empty()) {
            let calls: Vec<Value> = calls
                .iter()
                .map(|call| {
                    json!({
                        "function": {
                            "name": call.function.name,
                            "arguments": call.parsed_arguments(),
                        }
                    })
                })
                .collect();
            object.insert("tool_calls".into(), Value::Array(calls));
        }
        if message.role == "tool" {
            if let Some(name) = message.name.as_ref() {
                object.insert("tool_name".into(), Value::String(name.clone()));
            }
        }
        out.push(Value::Object(object));
    }
    out
}

// ── Degenerate-repetition guards ────────────────────────────────────────

/// A detected repetition run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepetitionMatch {
    /// Repeated span (in characters, for reporting).
    pub span: String,
    pub span_chars: usize,
    pub copies: usize,
    /// Byte offset where the first repeated copy starts.
    pub start: usize,
}

fn char_boundary(text: &str, char_index: usize) -> usize {
    text.char_indices().nth(char_index).map(|(offset, _)| offset).unwrap_or(text.len())
}

/// Detect a phrase repeated back-to-back far beyond anything a model produces
/// legitimately. Returns the repeated span, copy count and its start offset.
pub fn find_degenerate_repetition(text: &str) -> Option<RepetitionMatch> {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() < MIN_REPETITION_SCAN_CHARS + REPETITION_PROBE_CHARS {
        return None;
    }
    let window_start = chars.len().saturating_sub(REPETITION_SCAN_WINDOW_CHARS);
    let window = &chars[window_start..];
    if window.len() < MIN_REPETITION_SCAN_CHARS {
        return None;
    }
    let probe_len = REPETITION_PROBE_CHARS.min(window.len());
    let probe = &window[window.len() - probe_len..];
    let probe_start = window.len() - probe_len;

    // Walk candidate span starts from nearest to farthest; the nearest match
    // gives the smallest repeating unit, which is what the TS detector reports.
    let mut candidate = probe_start;
    while candidate > 0 {
        candidate -= 1;
        if candidate + probe_len > probe_start && candidate != 0 {
            continue;
        }
        if candidate + probe_len > window.len() {
            continue;
        }
        if &window[candidate..candidate + probe_len] != probe {
            continue;
        }
        let span = probe_start - candidate;
        if span < MIN_REPETITION_SPAN_CHARS {
            continue;
        }
        // Count consecutive identical copies walking backwards.
        let mut copies = 1usize;
        let mut cursor = candidate;
        while cursor >= span {
            let previous = cursor - span;
            if &window[previous..previous + span] == &window[cursor..cursor + span] {
                copies += 1;
                cursor = previous;
            } else {
                break;
            }
        }
        if copies >= MIN_REPETITION_COPIES {
            let absolute_start = window_start + cursor;
            return Some(RepetitionMatch {
                span: window[cursor..cursor + span].iter().collect(),
                span_chars: span,
                copies,
                start: char_boundary(text, absolute_start),
            });
        }
    }
    None
}

/// Cut a degenerate repetition run out of `text`, returning the text up to the
/// end of the first copy plus a short note. `None` when nothing was found.
pub fn trim_degenerate_repetition(text: &str) -> Option<(String, RepetitionMatch)> {
    let found = find_degenerate_repetition(text)?;
    let head = &text[..found.start];
    let mut trimmed = String::with_capacity(head.len() + 128);
    trimmed.push_str(head);
    trimmed.push_str(&found.span);
    Some((trimmed, found))
}

/// Near-verbatim repetition (same content, drifting punctuation/whitespace).
/// Only the trailing window is compared so long transcripts stay cheap.
pub fn find_near_verbatim_repetition(text: &str) -> Option<RepetitionMatch> {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() < MIN_NEAR_REPETITION_SEED_CHARS * MIN_NEAR_REPETITION_COPIES {
        return None;
    }
    let tail_len = NEAR_REPETITION_TAIL_CHARS.min(chars.len());
    let tail: String = chars[chars.len() - tail_len..].iter().collect();
    let normalise = |s: &str| -> String {
        s.chars()
            .filter(|c| c.is_alphanumeric())
            .flat_map(|c| c.to_lowercase())
            .collect()
    };
    let normalized_tail = normalise(&tail);
    let seed_len = MIN_NEAR_REPETITION_SEED_CHARS.min(normalized_tail.len());
    let seed = &normalized_tail[normalized_tail.len() - seed_len..];

    // Count how many times the seed appears in the last
    // `NEAR_REPETITION_COHESION_CHARS` characters (normalised) and require the
    // repeats to be stride-compatible with each other.
    let coalesce_len = NEAR_REPETITION_COHESION_CHARS.min(chars.len());
    let coalesce: String = chars[chars.len() - coalesce_len..].iter().collect();
    let normalized = normalise(&coalesce);
    let mut positions = Vec::new();
    let mut offset = 0usize;
    while let Some(found) = normalized[offset..].find(seed) {
        positions.push(offset + found);
        offset += found + 1;
        if positions.len() > MIN_NEAR_REPETITION_COPIES * 2 {
            break;
        }
    }
    if positions.len() < MIN_NEAR_REPETITION_COPIES {
        return None;
    }
    let stride = positions[positions.len() - 1] - positions[positions.len() - 2];
    if stride < MIN_NEAR_REPETITION_STRIDE_CHARS {
        return None;
    }
    let copies = positions.len();
    let start_char = chars.len() - coalesce_len + positions[0];
    Some(RepetitionMatch {
        span: seed.to_string(),
        span_chars: seed_len,
        copies,
        start: char_boundary(text, start_char),
    })
}

/// Detect verbatim repetition of the whole assistant turn's tool-call signature
/// (same tool + same arguments issued over and over).
pub fn tool_call_signature(call: &OpenAiToolCall) -> String {
    let args = canonicalize_tool_call_value(&call.parsed_arguments());
    format!("{}({})", from_openai_name(&call.function.name), args)
}

/// Stable JSON canonicalisation: object keys sorted recursively, arrays in
/// order, numbers normalised through `serde_json`.
pub fn canonicalize_tool_call_value(value: &Value) -> String {
    fn canonical(value: &Value, out: &mut String) {
        match value {
            Value::Object(map) => {
                out.push('{');
                let mut keys: Vec<&String> = map.keys().collect();
                keys.sort();
                for (index, key) in keys.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    out.push_str(&Value::String((*key).clone()).to_string());
                    out.push(':');
                    canonical(&map[*key], out);
                }
                out.push('}');
            }
            Value::Array(items) => {
                out.push('[');
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    canonical(item, out);
                }
                out.push(']');
            }
            other => out.push_str(&other.to_string()),
        }
    }
    let mut out = String::new();
    canonical(value, &mut out);
    out
}

// ── Tool failure classification ─────────────────────────────────────────

/// Normalise whatever a tool returned into `{ok, message, ...}`.
pub fn normalize_tool_result(raw: Value) -> Value {
    match raw {
        Value::Object(mut map) => {
            let ok = map.get("ok").map(|v| v.as_bool() == Some(true)).unwrap_or(false);
            let message = map
                .get("message")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .unwrap_or_default();
            map.insert("ok".into(), Value::Bool(ok));
            map.insert("message".into(), Value::String(message));
            Value::Object(map)
        }
        Value::String(message) => json!({ "ok": true, "message": message }),
        _ => json!({ "ok": false, "message": "Tool returned no result" }),
    }
}

fn is_word_boundary(hay: &str, index: usize) -> bool {
    hay[index..]
        .chars()
        .next()
        .map(|c| !(c.is_alphanumeric() || c == '_'))
        .unwrap_or(true)
}

fn contains_word(hay: &str, word: &str) -> bool {
    let mut offset = 0usize;
    while let Some(found) = hay[offset..].find(word) {
        let absolute = offset + found;
        let before_ok = absolute == 0
            || hay[..absolute]
                .chars()
                .next_back()
                .map(|c| !(c.is_alphanumeric() || c == '_'))
                .unwrap_or(true);
        if before_ok && is_word_boundary(hay, absolute + word.len()) {
            return true;
        }
        offset = absolute + word.len().max(1);
    }
    false
}

fn contains_any_word(hay: &str, words: &[&str]) -> bool {
    words.iter().any(|word| contains_word(hay, word))
}

/// Invalid names and arguments require a changed call, not an execution retry.
pub fn is_invalid_tool_failure(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.starts_with("unknown tool:")
        || lower.starts_with("input validation error:")
        || lower.starts_with("input validation failed:")
}

/// Heuristic: is this tool failure transient and worth retrying?
///
/// Mirrors `TRANSIENT_FAILURE_PATTERNS` without a regex dependency. Only the
/// head of the message is scanned because the tail is often captured stdout.
pub fn is_transient_failure(message: Option<&str>) -> bool {
    let message = match message {
        Some(message) if !message.is_empty() => message,
        _ => return false,
    };
    let head: String = message.chars().take(TRANSIENT_SCAN_CHARS).collect::<String>().to_lowercase();

    if contains_word(&head, "timeout") || contains_word(&head, "timedout") || contains_word(&head, "timedout") {
        return true;
    }
    // /\btimed?\s?out\b/
    if head.contains("timed out") || head.contains("time out") || contains_word(&head, "timedout") {
        return true;
    }
    if contains_any_word(
        &head,
        &["econnrefused", "econnreset", "econnaborted", "etimedout", "ehostunreach", "eai_again", "epipe"],
    ) {
        return true;
    }
    if head.contains("socket hang up") {
        return true;
    }
    if head.contains("rate limit")
        || head.contains("ratelimit")
        || head.contains("rate-limit")
        || head.contains("rate_limit")
        || head.contains("rate limiting")
        || head.contains("rate limited")
        || head.contains("ratelimiting")
        || head.contains("ratelimited")
    {
        return true;
    }
    if head.contains("too many requests") {
        return true;
    }
    if contains_any_word(&head, &["429", "502", "503", "504"]) {
        return true;
    }
    if let Some(position) = head.find("network") {
        let rest: String = head[position..].chars().skip(7).take(40).collect();
        if ["error", "failure", "failed", "unreachable", "down", "timeout", "issue"].iter().any(|w| rest.contains(w)) {
            return true;
        }
    }
    if head.contains("unavailable") {
        let subjects = ["service", "server", "host", "endpoint", "model", "resource", "services", "servers", "hosts", "endpoints", "models", "resources"];
        if subjects.iter().any(|s| head.contains(s)) {
            return true;
        }
    }
    if head.contains("temporarily unavailable") || head.contains("currently unavailable") {
        return true;
    }
    if head.contains("bad gateway") || head.contains("gateway timeout") || head.contains("gateway time-out") {
        return true;
    }
    if contains_word(&head, "overloaded") {
        return true;
    }
    false
}

/// Last-resort record for a tool call whose execution rejected outright. Keeps
/// the one-tool-message-per-tool_call invariant intact.
pub fn failed_tool_call_outcome(call: &OpenAiToolCall, reason: &str, now_ms: i64) -> (ExecutedToolCall, AgentMessage) {
    let args = call.parsed_arguments();
    let message = format!("TOOL ERROR: {reason}");
    (
        ExecutedToolCall {
            call_id: call.id.clone(),
            tool: from_openai_name(&call.function.name),
            args,
            ok: false,
            message: message.clone(),
            started_at: now_ms,
            completed_at: now_ms,
            retry_count: 0,
        },
        AgentMessage::tool(call.id.clone(), call.function.name.clone(), json!({ "ok": false, "message": message }).to_string()),
    )
}

// ── Steering ────────────────────────────────────────────────────────────

/// Mid-turn steering queue. Messages pushed while a round is in flight are
/// drained at the next safe boundary (before the next model request).
#[derive(Debug)]
pub struct SteeringController {
    state: Mutex<SteeringState>,
    timeout_ms: u64,
}

#[derive(Debug, Default)]
struct SteeringState {
    pending: VecDeque<SteeringMessage>,
    closed: bool,
    delivered: usize,
}

impl SteeringController {
    pub fn new(timeout_ms: u64) -> Self {
        Self { state: Mutex::new(SteeringState::default()), timeout_ms }
    }

    /// Queue a steering message. Returns `false` once the turn has closed its
    /// steering channel (the message is then dropped, as in the TS controller).
    pub fn push(&self, message: SteeringMessage) -> bool {
        let mut state = self.state.lock().expect("steering state poisoned");
        if state.closed {
            return false;
        }
        state.pending.push_back(message);
        true
    }

    /// Take every pending message, preserving push order.
    pub fn drain(&self) -> Vec<SteeringMessage> {
        let mut state = self.state.lock().expect("steering state poisoned");
        let drained: Vec<SteeringMessage> = state.pending.drain(..).collect();
        state.delivered += drained.len();
        drained
    }

    pub fn pending_count(&self) -> usize {
        self.state.lock().expect("steering state poisoned").pending.len()
    }

    pub fn has_pending(&self) -> bool {
        self.pending_count() > 0
    }

    pub fn delivered_count(&self) -> usize {
        self.state.lock().expect("steering state poisoned").delivered
    }

    pub fn clear(&self) {
        self.state.lock().expect("steering state poisoned").pending.clear();
    }

    /// Close the channel; later pushes are rejected and nothing new is delivered.
    pub fn close(&self) {
        let mut state = self.state.lock().expect("steering state poisoned");
        state.closed = true;
        state.pending.clear();
    }

    pub fn is_closed(&self) -> bool {
        self.state.lock().expect("steering state poisoned").closed
    }

    pub fn timeout_ms(&self) -> u64 {
        self.timeout_ms
    }

    /// Wait (up to `timeout_ms`) for the next steering message.
    pub fn wait_for_next<'a>(&'a self, runtime: &'a dyn AgentRuntime) -> BoxFuture<'a, Option<SteeringMessage>> {
        Box::pin(async move {
            let deadline = runtime.now_ms() + self.timeout_ms as i64;
            loop {
                {
                    let mut state = self.state.lock().expect("steering state poisoned");
                    if let Some(message) = state.pending.pop_front() {
                        state.delivered += 1;
                        return Some(message);
                    }
                    if state.closed {
                        return None;
                    }
                }
                if runtime.now_ms() >= deadline {
                    return None;
                }
                runtime.sleep(25).await;
            }
        })
    }
}

impl Default for SteeringController {
    fn default() -> Self {
        Self::new(30_000)
    }
}

// ── Tool-call queue (priority ordered) ──────────────────────────────────

/// Priority queue for tool calls: `Critical` first, FIFO within a priority.
#[derive(Debug, Default)]
pub struct ToolCallQueue {
    entries: Mutex<Vec<QueuedToolCall>>,
    sequence: Mutex<u64>,
}

impl ToolCallQueue {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&self, call: OpenAiToolCall, priority: ToolCallPriority, now_ms: i64) {
        let mut entries = self.entries.lock().expect("tool queue poisoned");
        entries.push(QueuedToolCall { tool_call: call, priority, queued_at: now_ms });
        let mut sequence = self.sequence.lock().expect("tool sequence poisoned");
        *sequence += 1;
    }

    /// Drain everything in priority order (stable by insertion order).
    pub fn drain_sorted(&self) -> Vec<QueuedToolCall> {
        let mut entries = self.entries.lock().expect("tool queue poisoned");
        let mut drained: Vec<QueuedToolCall> = entries.drain(..).collect();
        drained.sort_by_key(|entry| entry.priority as u8); // stable sort keeps FIFO
        drained
    }

    pub fn len(&self) -> usize {
        self.entries.lock().expect("tool queue poisoned").len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn clear(&self) {
        self.entries.lock().expect("tool queue poisoned").clear();
    }
}

// ── Injected hosts ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

/// Clock, abort signal, environment, token estimation, persistence and
/// System-One access. Everything the TS module obtained from `Date`, `crypto`,
/// `setTimeout`, `AbortSignal`, `process.env`, `console`, `tools/token-estimator`,
/// `tools/context-evidence`, `services/context-cache` and `services/system-one`.
pub trait AgentRuntime: Send + Sync {
    /// `Date.now()`.
    fn now_ms(&self) -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }

    /// ISO-8601 timestamp used for `contextFlow` rounds.
    fn now_iso(&self) -> String {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        epoch_ms_to_iso(now)
    }

    /// `randomUUID()`.
    fn new_uuid(&self) -> String {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        format!("00000000-0000-4000-8000-{:012x}", nanos & 0xffff_ffff_ffff)
    }

    /// `setTimeout`-backed sleep; also the cancellation granularity for aborts.
    fn sleep<'a>(&'a self, ms: u64) -> BoxFuture<'a, ()>;

    /// `signal.aborted`.
    fn is_aborted(&self) -> bool;

    /// `process.env[key]`.
    fn env(&self, _key: &str) -> Option<String> {
        None
    }

    /// `console.log/warn/error` through the caller's logger.
    fn log(&self, _level: LogLevel, _message: &str) {}

    /// `estimateMessageTokens` from `tools/token-estimator`.
    fn estimate_message_tokens(&self, message: &AgentMessage) -> u64;

    /// `estimateTokens` from `tools/token-estimator`.
    fn estimate_tokens(&self, text: &str) -> u64;

    /// `loadContextState(scope)` from `tools/context-evidence`.
    fn load_context_state(&self, _scope: &str) -> Option<Value> {
        None
    }

    /// `saveContextState(scope, state)` from `tools/context-evidence`.
    fn save_context_state(&self, _scope: &str, _state: Value) {}

    /// `projectToolEvidence(result, scope, toolName)`; returns the evidence
    /// reference stored on the assistant message for later recovery.
    fn project_tool_evidence(&self, _call_id: &str, _tool: &str, _result: &Value) -> Option<String> {
        None
    }

    /// `applyContextCaching(...)` from `services/context-cache`: mutates the
    /// outbound request body with provider cache-control markers.
    fn apply_context_caching(&self, _body: &mut Value, _llm: &LlmConfig) {}

    /// `systemOneEnabled(apiKeys)` from `services/system-one`.
    fn system_one_enabled(&self) -> bool {
        false
    }

    /// `evaluateDecision(...)` from `services/system-one`.
    fn evaluate_decision<'a>(&'a self, _request: Value) -> BoxFuture<'a, Result<Value, String>> {
        Box::pin(async move { Err("decision.evaluate is not available".to_string()) })
    }

    /// `serializeToolResultForModel` from `tools/model-result`
    /// (`crate::tools::model_result` in the native crate).
    fn serialize_tool_result_for_model(&self, result: &Value) -> String {
        result.to_string()
    }

    /// Summarisation for mid-turn compaction; the compression LLM request is a
    /// network boundary so it is injected rather than issued here.
    fn summarize<'a>(&'a self, request: SummarizeRequest) -> BoxFuture<'a, Result<String, String>> {
        let _ = request;
        Box::pin(async move { Err("summarisation backend unavailable".to_string()) })
    }
}

/// Convert epoch milliseconds to an ISO-8601 UTC timestamp (`toISOString`).
pub fn epoch_ms_to_iso(ms: i64) -> String {
    let seconds = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000);
    let days = seconds.div_euclid(86_400);
    let secs_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        secs_of_day / 3600,
        (secs_of_day % 3600) / 60,
        secs_of_day % 60
    )
}

/// Days-since-epoch to civil date (Howard Hinnant).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m as u32, d as u32)
}

/// Request handed to the summarisation host.
#[derive(Debug, Clone, PartialEq)]
pub struct SummarizeRequest {
    pub system_prompt: String,
    pub prompt: String,
    pub transcript: String,
    pub model: String,
    pub max_output_tokens: u64,
    pub session_id: Option<String>,
}

/// Outbound HTTP request for one model round. The body is the already-built
/// JSON request document (so prompt caching mutations are visible to the host).
#[derive(Debug, Clone)]
pub struct LlmHttpRequest {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Value,
    pub timeout_ms: u64,
}

/// Raw response: status, headers and the complete SSE/NDJSON body. Streaming
/// *delivery* is a transport detail; event *ordering* is preserved natively.
#[derive(Debug, Clone, Default)]
pub struct LlmHttpResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: String,
    pub transport_failure: Option<TransportFailure>,
}

impl LlmHttpResponse {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(&name.to_lowercase()).map(String::as_str)
    }
}

/// `fetchJaitLlm` + `llmRequestHeaders` boundary.
pub trait LlmHost: Send + Sync {
    /// Headers for a model round (`llmRequestHeaders(llm)`), including auth.
    fn request_headers<'a>(&'a self, llm: &'a LlmConfig) -> BoxFuture<'a, Vec<(String, String)>>;

    /// Issue the request and return the whole body. Errors are transport-level
    /// failures; HTTP error statuses come back in `LlmHttpResponse::status`.
    fn post_stream<'a>(&'a self, request: LlmHttpRequest) -> BoxFuture<'a, Result<LlmHttpResponse, String>>;
}

/// Resolve the chat-completions URL for a backend, mirroring the TS defaulting.
pub fn resolve_chat_url(llm: &LlmConfig) -> String {
    let base = llm.openai_base_url.trim_end_matches('/');
    if llm.is_ollama() {
        let root = llm
            .ollama_url
            .clone()
            .unwrap_or_else(|| base.trim_end_matches("/v1").to_string());
        return format!("{}/api/chat", root.trim_end_matches('/'));
    }
    if base.ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{base}/chat/completions")
    }
}

/// Tool invocation boundary: registry lookup + validation + execution
/// (`ToolExecutor` in the TS source).
pub trait ToolExecutor: Send + Sync {
    fn execute<'a>(&'a self, request: ToolExecutionRequest) -> BoxFuture<'a, Result<Value, String>>;
}

/// Arguments handed to [`ToolExecutor::execute`].
#[derive(Debug, Clone)]
pub struct ToolExecutionRequest {
    /// Real tool name (already mapped back from the OpenAI-safe name).
    pub name: String,
    pub args: Value,
    pub session_id: String,
    pub call_id: String,
    pub auth: Option<ToolAuth>,
}

/// The `auth` bag from the TS `ToolExecutor` signature.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ToolAuth {
    #[serde(rename = "userId", skip_serializing_if = "Option::is_none", default)]
    pub user_id: Option<String>,
    #[serde(rename = "apiKeys", skip_serializing_if = "Option::is_none", default)]
    pub api_keys: Option<BTreeMap<String, String>>,
    #[serde(rename = "providerId", skip_serializing_if = "Option::is_none", default)]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub model: Option<String>,
    #[serde(rename = "jaitBackend", skip_serializing_if = "Option::is_none", default)]
    pub jait_backend: Option<String>,
    #[serde(rename = "runtimeMode", skip_serializing_if = "Option::is_none", default)]
    pub runtime_mode: Option<String>,
}

/// Event/context/persistence callbacks (`onEvent`, `onContext`, `onPersist`,
/// `onAssistantCheckpoint`). Streaming chunks reach the executor *during* the
/// round because the parser invokes `on_chunk` as it walks events.
pub trait LoopObserver: Send + Sync {
    fn on_event(&self, _event: AgentLoopEvent) {}

    fn on_context(&self, _round: LlmContextFlowRound) {}

    fn on_persist(&self, _message: AgentMessage) {}

    fn on_assistant_checkpoint(&self, _content: &str, _thinking: Option<&str>) {}

    /// `onChunk` passed down to tools so subprocess output streams live.
    fn on_tool_chunk(&self, _call_id: &str, _chunk: &str) {}

    /// `onNestedEvent`: nested tool-call events from sub-agent work.
    fn on_nested_event(&self, _event: Value) {}
}

/// No-op observer, useful for headless callers and tests that only inspect the
/// returned [`AgentLoopResult`].
pub struct NullObserver;

impl LoopObserver for NullObserver {}

// ── Stream parsing (native) ─────────────────────────────────────────────

/// One incremental tool-call fragment from an OpenAI SSE stream. OpenAI sends
/// `id`/`name` on the first fragment and `arguments` as string deltas.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ToolCallDelta {
    pub index: usize,
    pub id: Option<String>,
    pub name: Option<String>,
    pub arguments: Option<String>,
}

/// Fully accumulated result of one model round.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ProviderTurn {
    pub content: String,
    pub thinking: String,
    pub tool_calls: Vec<OpenAiToolCall>,
    pub finish_reason: Option<String>,
    pub usage: Option<Value>,
    pub model: Option<String>,
}

/// A single parsed stream event, in wire order.
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum StreamEvent {
    Content(String),
    Thinking(String),
    ToolCallDelta(ToolCallDelta),
    Finish(Option<String>),
    Usage(Value),
}

/// Callbacks invoked while parsing, so token events stream before the round ends.
pub struct StreamSink<'a> {
    pub on_content: &'a mut dyn FnMut(&str),
    pub on_thinking: &'a mut dyn FnMut(&str),
}

/// Parse an OpenAI-compatible `text/event-stream` body, emitting events in
/// order and accumulating the final [`ProviderTurn`].
pub fn parse_openai_stream(body: &str, sink: &mut StreamSink<'_>) -> ProviderTurn {
    let mut turn = ProviderTurn::default();
    let mut builders: BTreeMap<usize, (String, String, String)> = BTreeMap::new();

    for line in body.lines() {
        let line = line.trim_end_matches('\r');
        if !line.starts_with("data:") {
            continue;
        }
        let payload = line[5..].trim();
        if payload.is_empty() || payload == "[DONE]" {
            continue;
        }
        let value: Value = match serde_json::from_str(payload) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if let Some(model) = value.get("model").and_then(|v| v.as_str()) {
            turn.model = Some(model.to_string());
        }
        if let Some(usage) = value.get("usage").filter(|v| !v.is_null()) {
            turn.usage = Some(usage.clone());
        }
        let Some(choice) = value.get("choices").and_then(|c| c.get(0)) else {
            continue;
        };
        let delta = choice.get("delta").cloned().unwrap_or(Value::Null);
        if let Some(text) = delta.get("content").and_then(|v| v.as_str()) {
            if !text.is_empty() {
                turn.content.push_str(text);
                (sink.on_content)(text);
            }
        }
        // Reasoning models expose hidden thinking under either key.
        let thinking = delta
            .get("reasoning_content")
            .and_then(|v| v.as_str())
            .or_else(|| delta.get("reasoning").and_then(|v| v.as_str()));
        if let Some(text) = thinking {
            if !text.is_empty() {
                turn.thinking.push_str(text);
                (sink.on_thinking)(text);
            }
        }
        if let Some(calls) = delta.get("tool_calls").and_then(|v| v.as_array()) {
            for (position, call) in calls.iter().enumerate() {
                let index = call.get("index").and_then(|v| v.as_u64()).map(|v| v as usize).unwrap_or(position);
                let entry = builders.entry(index).or_default();
                if let Some(id) = call.get("id").and_then(|v| v.as_str()) {
                    if !id.is_empty() {
                        entry.0 = id.to_string();
                    }
                }
                if let Some(name) = call.get("function").and_then(|f| f.get("name")).and_then(|v| v.as_str()) {
                    if !name.is_empty() {
                        entry.1.push_str(name);
                    }
                }
                if let Some(args) = call.get("function").and_then(|f| f.get("arguments")).and_then(|v| v.as_str()) {
                    entry.2.push_str(args);
                }
            }
        }
        if let Some(reason) = choice.get("finish_reason").and_then(|v| v.as_str()) {
            turn.finish_reason = Some(reason.to_string());
        }
    }

    for (index, (id, name, arguments)) in builders {
        if name.is_empty() {
            continue;
        }
        turn.tool_calls.push(OpenAiToolCall {
            id: if id.is_empty() { format!("call_{index}") } else { id },
            type_: function_type(),
            function: FunctionCall { name, arguments: if arguments.is_empty() { "{}".into() } else { arguments } },
        });
    }
    turn
}

/// Parse Ollama's NDJSON `/api/chat` stream. Ollama emits whole tool calls (not
/// deltas) and reports token counts on the final `done` line.
pub fn parse_ollama_stream(body: &str, sink: &mut StreamSink<'_>) -> ProviderTurn {
    let mut turn = ProviderTurn::default();
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let value: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
            // Surfaced by the caller via finish_reason; keep the text visible.
            turn.finish_reason = Some(format!("error:{error}"));
            continue;
        }
        if let Some(model) = value.get("model").and_then(|v| v.as_str()) {
            turn.model = Some(model.to_string());
        }
        if let Some(message) = value.get("message") {
            if let Some(text) = message.get("content").and_then(|v| v.as_str()) {
                if !text.is_empty() {
                    turn.content.push_str(text);
                    (sink.on_content)(text);
                }
            }
            if let Some(text) = message.get("thinking").and_then(|v| v.as_str()) {
                if !text.is_empty() {
                    turn.thinking.push_str(text);
                    (sink.on_thinking)(text);
                }
            }
            if let Some(calls) = message.get("tool_calls").and_then(|v| v.as_array()) {
                for call in calls {
                    let function = call.get("function").cloned().unwrap_or(Value::Null);
                    let name = function.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    if name.is_empty() {
                        continue;
                    }
                    let arguments = match function.get("arguments") {
                        Some(Value::String(text)) => text.clone(),
                        Some(other) => other.to_string(),
                        None => "{}".to_string(),
                    };
                    turn.tool_calls.push(OpenAiToolCall::new(
                        format!("call_{}", turn.tool_calls.len()),
                        name,
                        arguments,
                    ));
                }
            }
        }
        if value.get("done").and_then(|v| v.as_bool()) == Some(true) {
            turn.finish_reason = Some(
                value
                    .get("done_reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("stop")
                    .to_string(),
            );
            let mut usage = Map::new();
            for (from, to) in [
                ("prompt_eval_count", "prompt_tokens"),
                ("eval_count", "completion_tokens"),
            ] {
                if let Some(count) = value.get(from).and_then(|v| v.as_u64()) {
                    usage.insert(to.to_string(), json!(count));
                }
            }
            if !usage.is_empty() {
                turn.usage = Some(Value::Object(usage));
            }
        }
    }
    turn
}

/// Build the JSON request body for one round, matching the TS field defaults.
pub fn build_request_body(
    llm: &LlmConfig,
    messages: Vec<Value>,
    tools: &[OpenAiToolSchema],
    tool_choice: Option<&str>,
    stream: bool,
) -> Value {
    let mut body = Map::new();
    body.insert("model".into(), Value::String(llm.openai_model.clone()));
    body.insert("messages".into(), Value::Array(messages));
    body.insert("stream".into(), Value::Bool(stream));
    if !tools.is_empty() {
        body.insert("tools".into(), serde_json::to_value(tools).unwrap_or(Value::Null));
        if let Some(choice) = tool_choice {
            body.insert("tool_choice".into(), Value::String(choice.to_string()));
        }
    }
    if let Some(temperature) = llm.temperature {
        body.insert("temperature".into(), json!(temperature));
    }
    if let Some(max_tokens) = llm.max_output_tokens {
        body.insert("max_tokens".into(), json!(max_tokens));
    }
    for (key, value) in &llm.extra {
        body.entry(key.clone()).or_insert_with(|| value.clone());
    }
    Value::Object(body)
}

/// Classified round failure, keeping the HTTP status and body so the loop can
/// apply the same retry/backoff/overflow policy as the TS source.
#[derive(Debug, Clone, PartialEq)]
pub enum ProviderFailure {
    /// Non-2xx response.
    Http { status: u16, body: String, retry_after_ms: Option<i64> },
    /// Transport-level failure after exhausting inline transport retries.
    Transport { failure: TransportFailure, message: String },
    /// Caller aborted the turn.
    Aborted,
    /// No response body at all.
    Empty,
}

impl ProviderFailure {
    pub fn message(&self) -> String {
        match self {
            ProviderFailure::Http { status, body, .. } => format_llm_error(*status, body),
            ProviderFailure::Transport { message, .. } => message.clone(),
            ProviderFailure::Aborted => "Request aborted by user".to_string(),
            ProviderFailure::Empty => "The model returned an empty response. Please try again.".to_string(),
        }
    }
}

/// Issue one model round through the host, retrying transient transport
/// failures inline (same policy and delays as the TS `streamChatCompletion`).
pub fn stream_chat<'a>(
    host: &'a dyn LlmHost,
    runtime: &'a dyn AgentRuntime,
    llm: &'a LlmConfig,
    body: Value,
    observer: &'a dyn LoopObserver,
    emit_content: bool,
) -> BoxFuture<'a, Result<ProviderTurn, ProviderFailure>> {
    Box::pin(async move {
        let url = resolve_chat_url(llm);
        let headers = host.request_headers(llm).await;
        let timeout_ms = runtime
            .env("JAIT_LLM_TIMEOUT_MS")
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(600_000);

        let mut transport_attempt = 0usize;
        loop {
            if runtime.is_aborted() {
                return Err(ProviderFailure::Aborted);
            }
            let request = LlmHttpRequest {
                url: url.clone(),
                headers: headers.clone(),
                body: body.clone(),
                timeout_ms,
            };
            let response = match host.post_stream(request).await {
                Ok(response) => response,
                Err(message) => LlmHttpResponse {
                    transport_failure: Some(TransportFailure { message: Some(message.clone()), ..Default::default() }),
                    ..Default::default()
                },
            };

            if let Some(failure) = response.transport_failure.clone() {
                let aborted = failure.name.as_deref() == Some("AbortError")
                    && !failure.message.as_deref().unwrap_or("").to_lowercase().contains("user");
                if aborted && runtime.is_aborted() {
                    return Err(ProviderFailure::Aborted);
                }
                if is_transient_transport_error(&failure) && transport_attempt < MAX_TRANSPORT_RETRIES {
                    transport_attempt += 1;
                    let delay = TRANSPORT_RETRY_BASE_DELAY_MS * (1u64 << (transport_attempt - 1));
                    runtime.log(
                        LogLevel::Warn,
                        &format!(
                            "[agent-loop] transient transport failure ({}), retry {transport_attempt}/{MAX_TRANSPORT_RETRIES} in {delay}ms",
                            describe_transport_error(&failure)
                        ),
                    );
                    runtime.sleep(delay).await;
                    continue;
                }
                let message = format_connection_error(
                    &failure,
                    llm.backend.as_deref(),
                    &llm.openai_base_url,
                )
                .unwrap_or_else(|| describe_transport_error(&failure));
                return Err(ProviderFailure::Transport { failure, message });
            }

            if !(200..300).contains(&response.status) {
                let retry_after = parse_retry_after_ms(response.header("retry-after"), runtime.now_ms());
                return Err(ProviderFailure::Http {
                    status: response.status,
                    body: response.body,
                    retry_after_ms: retry_after,
                });
            }

            if response.body.trim().is_empty() {
                return Err(ProviderFailure::Empty);
            }

            let mut on_content = |chunk: &str| {
                if emit_content {
                    observer.on_event(json!({ "type": "token", "token": chunk }));
                }
            };
            let mut on_thinking = |chunk: &str| {
                observer.on_event(json!({ "type": "thinking", "thinking": chunk }));
            };
            let mut sink = StreamSink { on_content: &mut on_content, on_thinking: &mut on_thinking };
            let turn = if llm.is_ollama() {
                parse_ollama_stream(&response.body, &mut sink)
            } else {
                parse_openai_stream(&response.body, &mut sink)
            };
            return Ok(turn);
        }
    })
}

// ── Thinking hygiene ────────────────────────────────────────────────────

/// Cap persisted thinking so a runaway reasoning block cannot dominate the
/// next round's prompt.
pub fn cap_thinking(thinking: &str) -> String {
    let chars: Vec<char> = thinking.chars().collect();
    if chars.len() <= MAX_PERSISTED_THINKING_CHARS {
        return thinking.to_string();
    }
    let head: String = chars[..MAX_PERSISTED_THINKING_CHARS].iter().collect();
    format!("{head}\n…[thinking truncated]")
}

/// Timing/pacing chatter ("waiting 2 seconds", "let me think about how long
/// this will take") is noise that models replay verbatim; it is dropped from
/// persisted thinking.
pub fn is_timing_noise_reasoning(text: &str) -> bool {
    let lower = text.to_lowercase();
    let needles = [
        "seconds", "wait a moment", "wait for", "sleep(", "sleep (", "one more second",
        "a few seconds", "let me wait", "delay of", "milliseconds", "retry in",
    ];
    needles.iter().any(|needle| lower.contains(needle))
        && (lower.len() < 400 || needles.iter().filter(|needle| lower.contains(*needle)).count() > 1)
}

/// True when the new reasoning block repeats an already-persisted block almost
/// verbatim (models do this across rounds), so it need not be replayed.
pub fn is_verbatim_thinking_repeat(previous: &[String], current: &str) -> bool {
    if current.chars().count() < MIN_REPEAT_THINKING_CHARS {
        return false;
    }
    let normalise = |text: &str| text.chars().filter(|c| !c.is_whitespace()).collect::<String>();
    let current_normalised = normalise(current);
    previous.iter().any(|earlier| {
        let earlier_normalised = normalise(earlier);
        earlier_normalised == current_normalised
            || (earlier_normalised.len() > MIN_REPEAT_THINKING_CHARS
                && current_normalised.contains(&earlier_normalised))
    })
}

// ── Empty-response fallback ─────────────────────────────────────────────

/// Build the synthetic assistant message used when the model produced neither
/// content nor tool calls: it names the work already done so the turn ends with
/// something actionable instead of an empty bubble.
pub fn build_empty_response_fallback(tool_calls: &[ExecutedToolCall], rounds: u64, model: &str) -> String {
    if tool_calls.is_empty() {
        return format!(
            "The model ({model}) returned no content after {rounds} round(s). Please try again, or pick a different model."
        );
    }
    let mut lines = Vec::new();
    lines.push(format!(
        "The model ({model}) finished without a written answer after {} tool call(s):",
        tool_calls.len()
    ));
    for call in tool_calls.iter().take(SUMMARY_ITEM_LIMIT) {
        let status = if call.ok { "ok" } else { "failed" };
        let snippet: String = call.message.chars().take(SUMMARY_TEXT_LIMIT).collect();
        lines.push(format!("- {}({}) → {status}: {snippet}", call.tool, call.args));
    }
    lines.join("\n")
}

// ── Plain-text tool call detection ──────────────────────────────────────

/// Some models emit `<tool_name>{"arg": 1}</tool_name>` or `tool_name({"arg":1})`
/// in plain text instead of using the tool-calling channel. Detect those calls
/// so the loop can execute them instead of showing raw JSON to the user.
pub fn detect_plain_text_tool_calls(text: &str, known_tools: &HashSet<String>) -> Vec<OpenAiToolCall> {
    let mut calls = Vec::new();
    let mut search_from = 0usize;
    while let Some(open) = text[search_from..].find('<') {
        let start = search_from + open;
        let Some(close) = text[start..].find('>') else { break };
        let name = text[start + 1..start + close].trim().to_string();
        if name.is_empty() || name.starts_with('/') || name.contains(' ') {
            search_from = start + 1;
            continue;
        }
        if !known_tools.contains(&name) {
            search_from = start + 1;
            continue;
        }
        let body_start = start + close + 1;
        let terminator = format!("</{name}>");
        let Some(end) = text[body_start..].find(&terminator) else {
            search_from = body_start;
            continue;
        };
        let body = text[body_start..body_start + end].trim();
        if serde_json::from_str::<Value>(body).map(|v| v.is_object()).unwrap_or(false) {
            let id = format!("plain_{}", calls.len());
            calls.push(OpenAiToolCall::new(id, to_openai_name(&name), body.to_string()));
        }
        search_from = body_start + end + terminator.len();
    }

    if calls.is_empty() {
        // `tool_name({...})` form; sorted so detection order is deterministic.
        let mut ordered: Vec<&String> = known_tools.iter().collect();
        ordered.sort();
        for name in ordered {
            let needle = format!("{name}(");
            let mut from = 0usize;
            while let Some(found) = text[from..].find(&needle) {
                let args_start = from + found + needle.len();
                if let Some(args_end) = balanced_object_end(&text[args_start..]) {
                    let body = &text[args_start..args_start + args_end];
                    if serde_json::from_str::<Value>(body).map(|v| v.is_object()).unwrap_or(false) {
                        let call = OpenAiToolCall::new(
                            format!("plain_{}", calls.len()),
                            to_openai_name(name),
                            body.to_string(),
                        );
                        calls.push(call);
                    }
                    from = args_start + args_end;
                } else {
                    from = args_start;
                }
            }
        }
    }
    calls
}

/// End offset (exclusive) of the JSON object starting at the beginning of `text`.
fn balanced_object_end(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    if bytes.first() != Some(&b'{') {
        return None;
    }
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;
    for (index, byte) in bytes.iter().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                in_string = false;
            }
            continue;
        }
        match byte {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(index + 1);
                }
            }
            _ => {}
        }
    }
    None
}

// ── Conversation summarisation / compaction ─────────────────────────────

/// A user message that carries real task content (not an ack, not synthetic).
pub fn is_substantive_user_message(message: &AgentMessage) -> bool {
    if message.role != "user" || message.is_synthetic() {
        return false;
    }
    let trimmed = message.content.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_lowercase();
    let acknowledgements = ["ok", "okay", "thanks", "thank you", "yes", "no", "continue", "go on", "sure", "k"];
    if trimmed.chars().count() < 40 && acknowledgements.contains(&lower.as_str()) {
        return false;
    }
    true
}

/// One-line description of a tool message for the summary.
pub fn summarize_tool_message(message: &AgentMessage) -> String {
    let name = message.name.clone().unwrap_or_else(|| "tool".to_string());
    let parsed: Value = serde_json::from_str(&message.content).unwrap_or(Value::Null);
    let ok = parsed.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
    let body = parsed
        .get("message")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| message.content.clone());
    let compact: String = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let snippet: String = compact.chars().take(SUMMARY_TEXT_LIMIT).collect();
    format!("{name}: {} {snippet}", if ok { "ok" } else { "FAILED" })
}

/// Structured, deterministic handoff summary. Used when the compression model is
/// unavailable and as the skeleton the model summary is validated against.
pub fn build_structured_conversation_summary(messages: &[AgentMessage]) -> String {
    let mut user_tasks: Vec<String> = Vec::new();
    let mut assistant_steps: Vec<String> = Vec::new();
    let mut tool_findings: Vec<String> = Vec::new();
    let mut failures: Vec<String> = Vec::new();
    let mut open_questions: Vec<String> = Vec::new();

    for message in messages {
        match message.role.as_str() {
            "user" => {
                if is_substantive_user_message(message) {
                    let text: String = message.content.split_whitespace().collect::<Vec<_>>().join(" ");
                    user_tasks.push(text.chars().take(SUMMARY_TEXT_LIMIT).collect());
                }
            }
            "assistant" => {
                if let Some(calls) = message.tool_calls.as_ref() {
                    for call in calls {
                        assistant_steps.push(tool_call_signature(call));
                    }
                }
                let trimmed = message.content.trim();
                if !trimmed.is_empty() {
                    let text: String = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
                    let snippet: String = text.chars().take(SUMMARY_TEXT_LIMIT).collect();
                    if !assistant_steps.contains(&snippet) {
                        assistant_steps.push(snippet);
                    }
                }
            }
            "tool" => {
                let summary = summarize_tool_message(message);
                if summary.contains("FAILED") {
                    failures.push(summary);
                } else {
                    tool_findings.push(summary);
                }
            }
            "system" => {
                let lower = message.content.to_lowercase();
                if lower.contains("question") || lower.contains("ask the user") {
                    let snippet: String = message.content.chars().take(SUMMARY_TEXT_LIMIT).collect();
                    open_questions.push(snippet);
                }
            }
            _ => {}
        }
    }

    let section = |title: &str, items: &[String]| -> String {
        if items.is_empty() {
            return String::new();
        }
        let shown: Vec<String> = items.iter().take(SUMMARY_ITEM_LIMIT).cloned().collect();
        let mut out = format!("{title}\n");
        for item in &shown {
            out.push_str(&format!("- {item}\n"));
        }
        if items.len() > shown.len() {
            out.push_str(&format!("- …{} more\n", items.len() - shown.len()));
        }
        out
    };

    let mut out = String::from("## Conversation summary\n");
    out.push_str(&section("User task", &user_tasks));
    out.push_str(&section("Work done", &assistant_steps));
    out.push_str(&section("Tool findings", &tool_findings));
    out.push_str(&section("Failures", &failures));
    out.push_str(&section("Open questions", &open_questions));
    out.trim_end().to_string()
}

/// Split a model-produced summary into its `## `-headed sections.
pub fn previous_checkpoint_sections(summary: &str) -> HashMap<String, String> {
    let mut sections = HashMap::new();
    let mut current: Option<String> = None;
    let mut buffer = String::new();
    for line in summary.lines() {
        if let Some(title) = line.strip_prefix("## ") {
            if let Some(name) = current.take() {
                sections.insert(name, buffer.trim().to_string());
            }
            current = Some(title.trim().to_lowercase());
            buffer.clear();
        } else {
            buffer.push_str(line);
            buffer.push('\n');
        }
    }
    if let Some(name) = current {
        sections.insert(name, buffer.trim().to_string());
    }
    sections
}

/// Re-inject the earliest substantive user task when a model summary dropped it.
/// Losing the task is the failure mode that makes compaction worse than useless.
pub fn reinject_substantive_user_task(summary: &str, messages: &[AgentMessage]) -> String {
    let first_task = messages.iter().find(|m| is_substantive_user_message(m)).map(|m| {
        m.content.split_whitespace().collect::<Vec<_>>().join(" ")
    });
    let Some(task) = first_task else { return summary.to_string() };
    let sections = previous_checkpoint_sections(summary);
    let has_task = sections
        .get("user task")
        .map(|section| !section.trim().is_empty())
        .unwrap_or(false);
    if has_task {
        return summary.to_string();
    }
    let mut out = String::from("## User task\n");
    out.push_str(&format!("- {}\n\n", task.chars().take(SUMMARY_TEXT_LIMIT * 2).collect::<String>()));
    out.push_str(summary);
    out
}

/// Render the whole history for the summarisation prompt, truncating individual
/// tool results so one giant output cannot consume the checkpoint budget.
pub fn serialize_conversation_for_summary(messages: &[AgentMessage]) -> String {
    let mut out = String::new();
    for message in messages {
        match message.role.as_str() {
            "tool" => {
                let truncated: String = message.content.chars().take(SUMMARY_TOOL_RESULT_MAX_CHARS).collect();
                out.push_str(&format!("[tool {}] {truncated}\n", message.name.clone().unwrap_or_default()));
            }
            "assistant" => {
                if !message.content.trim().is_empty() {
                    out.push_str(&format!("[assistant] {}\n", message.content));
                }
                if let Some(calls) = message.tool_calls.as_ref() {
                    for call in calls {
                        out.push_str(&format!("[assistant tool_call] {}\n", tool_call_signature(call)));
                    }
                }
            }
            role => {
                out.push_str(&format!("[{role}] {}\n", message.content));
            }
        }
    }
    out
}

/// Build the compaction prompt from the checkpoint system prompt + transcript.
pub fn build_compaction_prompt(messages: &[AgentMessage], previous_summary: Option<&str>) -> (String, String) {
    let mut prompt = String::from(LLM_SUMMARIZATION_PROMPT);
    prompt.push_str("\n\nSections required:\n## User task\n## Work done\n## Tool findings\n## Failures\n## Open questions\n");
    if let Some(previous) = previous_summary {
        prompt.push_str("\nPrevious summary (fold into the new one, keep facts):\n");
        prompt.push_str(previous);
        prompt.push('\n');
    }
    prompt.push_str("\nTranscript:\n");
    prompt.push_str(&serialize_conversation_for_summary(messages));
    (LLM_SUMMARIZATION_SYSTEM_PROMPT.to_string(), prompt)
}

/// Ensure the summary fits the checkpoint output budget, noting truncation.
pub fn clamp_summary(summary: &str, max_chars: usize) -> String {
    let chars: Vec<char> = summary.chars().collect();
    if chars.len() <= max_chars {
        return summary.to_string();
    }
    let head: String = chars[..max_chars].iter().collect();
    format!("{head}\n{CHECKPOINT_TRUNCATION_NOTE}")
}

/// Compaction output budget: `CHECKPOINT_OUTPUT_TOKENS`, floored for small
/// context windows (a 4k window cannot afford an 8k-token summary).
pub fn checkpoint_output_tokens(context_window: u64) -> u64 {
    let proportional = context_window / 16;
    proportional.clamp(CHECKPOINT_OUTPUT_TOKENS_FLOOR.min(context_window / 2), CHECKPOINT_OUTPUT_TOKENS)
}

// ── History pruning ─────────────────────────────────────────────────────

/// Prune old tool results / replayed thinking so the next round fits the budget.
///
/// Always keeps: the system prompt, the task-initiating user message, the last
/// `ACTIVE_TURN_TOOL_ROUNDS_TO_KEEP` tool rounds, and the most recent user
/// message. Pruned tool results collapse to a stub with their evidence
/// reference intact so they can be recovered on demand.
pub fn prune_history(messages: &[AgentMessage], budget_tokens: u64, runtime: &dyn AgentRuntime) -> Vec<AgentMessage> {
    let total: u64 = messages.iter().map(|m| runtime.estimate_message_tokens(m)).sum();
    if total <= budget_tokens || messages.is_empty() {
        return messages.to_vec();
    }
    let target = (budget_tokens as f64 * PRUNE_TARGET_RATIO) as u64;

    // Load-bearing messages: the system prompt, the task-initiating user
    // message and the most recent user message are never pruned.
    let first_task = messages.iter().position(is_substantive_user_message);
    let last_user = messages.iter().rposition(|m| m.role == "user");

    // Protect the most recent ACTIVE_TURN_TOOL_ROUNDS_TO_KEEP tool rounds.
    let mut protected_rounds = 0usize;
    let mut protected_from = messages.len();
    for index in (0..messages.len()).rev() {
        if messages[index].role == "assistant" && messages[index].tool_calls.is_some() {
            protected_rounds += 1;
            protected_from = index;
            if protected_rounds >= ACTIVE_TURN_TOOL_ROUNDS_TO_KEEP {
                break;
            }
        }
    }

    let mut pruned: Vec<AgentMessage> = messages.to_vec();
    let mut running = total;
    // Oldest first: the earliest material is the least relevant.
    for index in 0..pruned.len() {
        if running <= target {
            break;
        }
        if pruned[index].role == "system" || Some(index) == first_task || Some(index) == last_user || index >= protected_from {
            continue;
        }
        let message = pruned[index].clone();
        let replacement: Option<AgentMessage> = match message.role.as_str() {
            "tool" => {
                let stub = match message.evidence_reference.as_ref() {
                    Some(reference) => format!(
                        "[tool result pruned to save context \u{2014} recoverable via context.evidence reference={reference}]"
                    ),
                    None => "[tool result pruned to save context]".to_string(),
                };
                Some(AgentMessage { content: stub, ..message.clone() })
            }
            "assistant" if message.thinking.is_some() => Some(AgentMessage { thinking: None, ..message.clone() }),
            _ => None,
        };
        if let Some(replacement) = replacement {
            running = running
                .saturating_sub(runtime.estimate_message_tokens(&message))
                .saturating_add(runtime.estimate_message_tokens(&replacement));
            pruned[index] = replacement;
        }
    }
    pruned
}


// ── Loop options ────────────────────────────────────────────────────────

/// Mirrors `AgentLoopOptions` from the TS source.
#[derive(Debug, Clone)]
pub struct AgentLoopOptions {
    /// Conversation so far; the loop appends assistant/tool messages to its own
    /// copy and never mutates the caller's vector.
    pub messages: Vec<AgentMessage>,
    pub tools: Vec<OpenAiToolSchema>,
    pub llm: LlmConfig,
    pub session_id: String,
    /// Retries per model round for transient failures (default [`DEFAULT_MAX_RETRIES`]).
    pub max_retries: usize,
    /// Overrides [`DEFAULT_TOOL_ROUND_CHECKPOINT`] as the tool-round checkpoint.
    pub max_tool_rounds: Option<usize>,
    pub tool_choice: Option<String>,
    pub auth: Option<ToolAuth>,
    /// Extra system message appended after the caller's own system prompt
    /// (System One guidance lands here when the decision tool is live).
    pub system_prompt: Option<String>,
    /// Swarm parents discourage undelegated reads (see `SWARM_MAX_UNDELEGATED_READS`).
    pub swarm_mode: bool,
    /// Sub-agents do not stream tokens to the top-level UI.
    pub is_sub_agent: bool,
    pub runtime_mode: Option<String>,
}

impl Default for AgentLoopOptions {
    fn default() -> Self {
        Self {
            messages: Vec::new(),
            tools: Vec::new(),
            llm: LlmConfig {
                backend: Some("openai".into()),
                openai_base_url: "https://api.openai.com/v1".into(),
                openai_model: "gpt-4o-mini".into(),
                context_window: default_context_window(),
                ..Default::default()
            },
            session_id: String::new(),
            max_retries: DEFAULT_MAX_RETRIES,
            max_tool_rounds: None,
            tool_choice: None,
            auth: None,
            system_prompt: None,
            swarm_mode: false,
            is_sub_agent: false,
            runtime_mode: None,
        }
    }
}

impl AgentLoopOptions {
    /// Effective tool-round checkpoint: caller override, else the default, always
    /// capped by the absolute budget so one turn cannot run forever.
    pub fn tool_round_checkpoint(&self) -> usize {
        self.max_tool_rounds
            .unwrap_or(DEFAULT_TOOL_ROUND_CHECKPOINT)
            .min(ABSOLUTE_TOOL_ROUND_BUDGET)
    }
}

// ── Tool execution ──────────────────────────────────────────────────────

/// Outcome of a single tool call after its retry policy has been applied.
#[derive(Debug, Clone, PartialEq)]
pub struct ToolCallOutcome {
    pub executed: ExecutedToolCall,
    pub message: AgentMessage,
}

/// Decision returned by [`retry_tool_call_decision`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RetryDecision {
    Retry { delay_ms: u64 },
    GiveUp,
}

/// Decide whether a failed tool call may be retried.
///
/// Only *transient* failures are retried. Unknown tools and validation errors
/// require the model to change the call, so retrying the same arguments would
/// just burn the budget.
pub fn retry_tool_call_decision(message: &str, attempt: usize, max_retries: usize) -> RetryDecision {
    if attempt >= max_retries {
        return RetryDecision::GiveUp;
    }
    if is_invalid_tool_failure(message) {
        return RetryDecision::GiveUp;
    }
    if is_transient_failure(Some(message)) {
        return RetryDecision::Retry { delay_ms: TRANSPORT_RETRY_BASE_DELAY_MS * (1u64 << attempt) };
    }
    RetryDecision::GiveUp
}

/// Execute one tool call with the same retry/backoff/cancellation policy as the
/// TS `executeToolCall` (including the `TOOL ERROR:` fallback when execution
/// rejects without a result object).
pub fn execute_tool_call<'a>(
    runtime: &'a dyn AgentRuntime,
    executor: &'a dyn ToolExecutor,
    observer: &'a dyn LoopObserver,
    options: &'a AgentLoopOptions,
    call: &'a OpenAiToolCall,
) -> BoxFuture<'a, ToolCallOutcome> {
    Box::pin(async move {
        let started_at = runtime.now_ms();
        let tool = from_openai_name(&call.function.name);
        let args = call.parsed_arguments();
        let max_retries = options.max_retries;

        observer.on_event(json!({
            "type": "tool_call",
            "callId": call.id,
            "tool": tool,
            "args": args,
        }));

        let mut attempt = 0usize;
        loop {
            if runtime.is_aborted() {
                let (executed, message) = failed_tool_call_outcome(call, "aborted by user", runtime.now_ms());
                return ToolCallOutcome { executed, message };
            }

            let request = ToolExecutionRequest {
                name: tool.clone(),
                args: args.clone(),
                session_id: options.session_id.clone(),
                call_id: call.id.clone(),
                auth: options.auth.clone(),
            };
            match executor.execute(request).await {
                Ok(raw) => {
                    let normalized = normalize_tool_result(raw);
                    let ok = normalized.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                    let message_text = normalized
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    if !ok {
                        if let RetryDecision::Retry { delay_ms } = retry_tool_call_decision(&message_text, attempt, max_retries) {
                            attempt += 1;
                            runtime.log(
                                LogLevel::Warn,
                                &format!(
                                    "[agent-loop] transient tool failure for {tool} ({message_text}), retry {attempt}/{max_retries} in {delay_ms}ms"
                                ),
                            );
                            runtime.sleep(delay_ms).await;
                            continue;
                        }
                    }
                    let evidence = runtime.project_tool_evidence(&call.id, &tool, &normalized);
                    let model_text = if ok {
                        runtime.serialize_tool_result_for_model(&normalized)
                    } else {
                        json!({ "ok": false, "message": message_text }).to_string()
                    };
                    let executed = ExecutedToolCall {
                        call_id: call.id.clone(),
                        tool: tool.clone(),
                        args: args.clone(),
                        ok,
                        message: message_text,
                        started_at,
                        completed_at: runtime.now_ms(),
                        retry_count: attempt,
                    };
                    let message = AgentMessage {
                        evidence_reference: evidence,
                        ..AgentMessage::tool(call.id.clone(), call.function.name.clone(), model_text)
                    };
                    observer.on_event(json!({
                        "type": "tool_result",
                        "callId": call.id,
                        "tool": tool,
                        "ok": ok,
                        "durationMs": executed.completed_at - executed.started_at,
                    }));
                    return ToolCallOutcome { executed, message };
                }
                Err(message) => {
                    if let RetryDecision::Retry { delay_ms } = retry_tool_call_decision(&message, attempt, max_retries) {
                        attempt += 1;
                        runtime.log(
                            LogLevel::Warn,
                            &format!(
                                "[agent-loop] transient tool error for {tool} ({message}), retry {attempt}/{max_retries} in {delay_ms}ms"
                            ),
                        );
                        runtime.sleep(delay_ms).await;
                        continue;
                    }
                    let (mut executed, message) = failed_tool_call_outcome(call, &message, runtime.now_ms());
                    executed.started_at = started_at;
                    executed.completed_at = runtime.now_ms();
                    executed.retry_count = attempt;
                    observer.on_event(json!({
                        "type": "tool_result",
                        "callId": call.id,
                        "tool": tool,
                        "ok": false,
                        "durationMs": executed.completed_at - executed.started_at,
                    }));
                    return ToolCallOutcome { executed, message };
                }
            }
        }
    })
}

// ── Main loop ───────────────────────────────────────────────────────────

/// Run one streamable tool-calling turn. Faithful port of `runAgentLoop`.
///
/// Guarantees preserved from the TS implementation:
/// * assistant/tool messages are appended in the order the model emitted them;
/// * one `tool` message per `tool_calls` entry, in call order;
/// * per-round events (`token`, `thinking`, `tool_call`, `tool_result`,
///   `context`, `error`, `done`) fire in the same sequence;
/// * rate-limit, transient-transport, empty-response, plain-text, repetition
///   and length-continuation recoveries keep their original budgets;
/// * abort is checked before every round, retry and tool call.
pub fn run_agent_loop<'a>(
    options: AgentLoopOptions,
    runtime: &'a dyn AgentRuntime,
    host: &'a dyn LlmHost,
    tools: &'a dyn ToolExecutor,
    observer: &'a dyn LoopObserver,
    steering: &'a SteeringController,
) -> BoxFuture<'a, AgentLoopResult> {
    Box::pin(async move {
        let mut messages = repair_tool_call_history(&options.messages);
        // Append the System One guidance *after* the caller's system prompt, so
        // the caller always wins a conflict.
        let mut system_prompt = options.system_prompt.clone().unwrap_or_default();
        if runtime.system_one_enabled() {
            if !system_prompt.is_empty() {
                system_prompt.push_str("\n\n");
            }
            system_prompt.push_str(SYSTEM_ONE_PROMPT);
        }
        if !system_prompt.is_empty() {
            messages.push(AgentMessage::system(system_prompt));
        }

        let schemas = to_tool_schemas(&options.tools);
        let known_tools: HashSet<String> = options.tools.iter().map(|s| s.function.name.clone()).collect();
        let require_reasoning = options.llm.require_reasoning.unwrap_or(false);
        let llm = options.llm.clone();
        let checkpoint = options.tool_round_checkpoint();

        let mut content = String::new();
        let mut segments: Vec<MessageSegment> = Vec::new();
        let mut executed: Vec<ExecutedToolCall> = Vec::new();
        let mut context_rounds: Vec<LlmContextFlowRound> = Vec::new();
        let mut rounds: u64 = 0;
        let mut finish_reason: Option<String> = None;
        let mut usage: Option<Value> = None;

        let mut rate_limit_retries = 0usize;
        let mut plain_text_retries = 0usize;
        let mut empty_retries = 0usize;
        let mut repetition_recoveries = 0usize;
        let mut length_continuations = 0usize;
        let mut duplicate_streak = 0usize;
        let mut duplicate_interventions = 0usize;
        let mut same_call_counts: HashMap<String, usize> = HashMap::new();
        let mut failure_counts: HashMap<String, usize> = HashMap::new();
        let mut replayed_thinking: Vec<String> = Vec::new();
        let mut low_progress_read_streak = 0usize;
        let mut undelegated_reads = 0usize;

        observer.on_event(json!({
            "type": "start",
            "model": llm.openai_model,
            "round": 0,
        }));

        let aborted_result = |content: &str, executed: &[ExecutedToolCall], segments: &[MessageSegment], rounds: u64| {
            let mut result = AgentLoopResult {
                content: content.to_string(),
                tool_calls: executed.to_vec(),
                segments: segments.to_vec(),
                rounds,
                finish_reason: Some("aborted".into()),
                usage: None,
                context_rounds: None,
                error: Some("Request aborted by user".into()),
                status: None,
                aborted: Some(true),
            };
            if result.content.is_empty() {
                result.content = "Request aborted by user".to_string();
            }
            result
        };

        'rounds: loop {
            if runtime.is_aborted() {
                observer.on_event(json!({ "type": "done", "aborted": true }));
                return aborted_result(&content, &executed, &segments, rounds);
            }

            // ── Steering: deliver user messages at the safe boundary ──
            let pending = steering.drain();
            for (index, message) in pending.iter().enumerate() {
                if index >= MAX_REPLAY_STEERINGS {
                    break;
                }
                let display = message.meta.display_content.clone().unwrap_or_else(|| message.content.clone());
                segments.push(MessageSegment::Steering {
                    content: message.content.clone(),
                    display_content: message.meta.display_content.clone(),
                });
                messages.push(AgentMessage {
                    synthetic: Some(true),
                    ..AgentMessage::user(message.content.clone())
                });
                observer.on_event(json!({ "type": "steering", "content": display }));
            }

            // ── Tool-round checkpoint ──
            if rounds as usize >= checkpoint {
                if rounds as usize >= ABSOLUTE_TOOL_ROUND_BUDGET {
                    let fallback = build_empty_response_fallback(&executed, rounds, &llm.openai_model);
                    if content.is_empty() {
                        content = fallback.clone();
                        segments.push(MessageSegment::Text { content: fallback });
                    }
                    finish_reason = Some("tool_round_limit".into());
                    break 'rounds;
                }
                let remaining = ABSOLUTE_TOOL_ROUND_BUDGET.saturating_sub(rounds as usize);
                if remaining <= FORCE_ANSWER_ROUND_STREAK {
                    messages.push(AgentMessage {
                        synthetic: Some(true),
                        ..AgentMessage::user(
                            "Stop calling tools now. Answer the user with what you already know, and state clearly what remains unknown.",
                        )
                    });
                } else {
                    messages.push(AgentMessage {
                        synthetic: Some(true),
                        ..AgentMessage::user(
                            "You have the information you need. Converge now: finish the task with a direct answer instead of more tool calls.",
                        )
                    });
                }
                observer.on_event(json!({ "type": "nudge", "reason": "tool_round_checkpoint", "round": rounds }));
            }

            // ── Build the request ──
            let wire = serialize_messages(&messages, require_reasoning);
            let mut body = build_request_body(&llm, wire.clone(), &schemas, options.tool_choice.as_deref(), true);
            runtime.apply_context_caching(&mut body, &llm);

            let mut flow_round = LlmContextFlowRound {
                round: rounds + 1,
                created_at: runtime.now_iso(),
                model: llm.openai_model.clone(),
                messages: wire,
                tools: if schemas.is_empty() { None } else { Some(schemas.clone()) },
                tool_choice: options.tool_choice.clone(),
                metrics: None,
            };
            observer.on_context(flow_round.clone());

            // ── Model round with rate-limit + overflow recovery ──
            let started = runtime.now_ms();
            let turn = loop {
                if runtime.is_aborted() {
                    observer.on_event(json!({ "type": "done", "aborted": true }));
                    return aborted_result(&content, &executed, &segments, rounds);
                }
                match stream_chat(host, runtime, &llm, body.clone(), observer, !options.is_sub_agent).await {
                    Ok(turn) => break turn,
                    Err(ProviderFailure::Aborted) => {
                        observer.on_event(json!({ "type": "done", "aborted": true }));
                        return aborted_result(&content, &executed, &segments, rounds);
                    }
                    Err(ProviderFailure::Http { status, body: error_body, retry_after_ms }) => {
                        if is_retryable_rate_limit(status, &error_body) && rate_limit_retries < MAX_RATE_LIMIT_RETRIES {
                            rate_limit_retries += 1;
                            let delay = rate_limit_backoff_ms(rate_limit_retries, retry_after_ms);
                            observer.on_event(json!({
                                "type": "retry",
                                "reason": "rate_limit",
                                "attempt": rate_limit_retries,
                                "delayMs": delay,
                            }));
                            runtime.sleep(delay).await;
                            continue;
                        }
                        if is_context_overflow_error(status, &error_body) {
                            observer.on_event(json!({ "type": "compaction", "reason": "context_overflow" }));
                            let budget = (llm.context_window as f64 * CONTEXT_COMPACT_TRIGGER_RATIO) as u64;
                            messages = prune_history(&messages, budget, runtime);
                            messages = repair_tool_call_history(&messages);
                            continue 'rounds;
                        }
                        let message = format_llm_error(status, &error_body);
                        observer.on_event(json!({ "type": "error", "message": message, "status": status }));
                        return AgentLoopResult {
                            content: if content.is_empty() { message.clone() } else { content },
                            tool_calls: executed,
                            segments,
                            rounds,
                            finish_reason: Some("error".into()),
                            usage,
                            context_rounds: Some(context_rounds),
                            error: Some(message),
                            status: Some(status as u64),
                            aborted: None,
                        };
                    }
                    Err(failure) => {
                        let message = failure.message();
                        observer.on_event(json!({ "type": "error", "message": message }));
                        return AgentLoopResult {
                            content: if content.is_empty() { message.clone() } else { content },
                            tool_calls: executed,
                            segments,
                            rounds,
                            finish_reason: Some("error".into()),
                            usage,
                            context_rounds: Some(context_rounds),
                            error: Some(message),
                            status: None,
                            aborted: None,
                        };
                    }
                }
            };
            rate_limit_retries = 0;
            rounds += 1;

            flow_round.metrics = Some(RoundMetrics {
                prompt_tokens: turn
                    .usage
                    .as_ref()
                    .and_then(|u| u.get("prompt_tokens").or_else(|| u.get("input_tokens")))
                    .and_then(|v| v.as_u64()),
                completion_tokens: turn
                    .usage
                    .as_ref()
                    .and_then(|u| u.get("completion_tokens").or_else(|| u.get("output_tokens")))
                    .and_then(|v| v.as_u64()),
                cache_read_tokens: turn
                    .usage
                    .as_ref()
                    .and_then(|u| u.get("cache_read_input_tokens"))
                    .and_then(|v| v.as_u64()),
                cache_write_tokens: turn
                    .usage
                    .as_ref()
                    .and_then(|u| u.get("cache_creation_input_tokens"))
                    .and_then(|v| v.as_u64()),
                cost_usd: None,
                duration_ms: Some((runtime.now_ms() - started) as u64),
            });
            context_rounds.push(flow_round);
            if let Some(round_usage) = turn.usage.clone() {
                usage = Some(round_usage);
            }
            if let Some(reason) = turn.finish_reason.clone() {
                finish_reason = Some(reason);
            }

            // ── Degenerate-repetition recovery on streamed content ──
            let mut round_content = turn.content.clone();
            if let Some((trimmed, matched)) = trim_degenerate_repetition(&round_content) {
                if repetition_recoveries < MAX_REPETITION_RECOVERIES {
                    repetition_recoveries += 1;
                    observer.on_event(json!({
                        "type": "repetition",
                        "spanChars": matched.span_chars,
                        "copies": matched.copies,
                        "action": "truncate",
                    }));
                    round_content = trimmed;
                    messages.push(AgentMessage {
                        synthetic: Some(true),
                        ..AgentMessage::user(
                            "Your last reply started repeating itself. Do not repeat that text. Continue from where you stopped, or answer directly if you are done.",
                        )
                    });
                    if !round_content.is_empty() {
                        content = round_content.clone();
                        segments.push(MessageSegment::Text { content: round_content.clone() });
                    }
                    continue 'rounds;
                }
            }

            let mut round_thinking = turn.thinking.clone();
            if is_verbatim_thinking_repeat(&replayed_thinking, &round_thinking) {
                round_thinking.clear();
            }

            if !turn.tool_calls.is_empty() {
                // ── Tool round ──
                if !round_content.is_empty() {
                    content.push_str(&round_content);
                    segments.push(MessageSegment::Text { content: round_content.clone() });
                }
                if !round_thinking.is_empty() {
                    segments.push(MessageSegment::Thinking { content: cap_thinking(&round_thinking) });
                }

                let mut calls = turn.tool_calls.clone();
                if calls.len() > MAX_TOOL_CALLS_PER_ROUND {
                    observer.on_event(json!({
                        "type": "error",
                        "message": format!(
                            "The model requested {} tool calls in one round (limit {MAX_TOOL_CALLS_PER_ROUND}); the extra calls were dropped.",
                            calls.len()
                        ),
                    }));
                    calls.truncate(MAX_TOOL_CALLS_PER_ROUND);
                }

                messages.push(AgentMessage {
                    thinking: if round_thinking.is_empty() { None } else { Some(cap_thinking(&round_thinking)) },
                    tool_calls: Some(calls.clone()),
                    ..AgentMessage::assistant(round_content.clone())
                });
                if !round_thinking.is_empty() {
                    replayed_thinking.push(round_thinking.clone());
                }

                segments.push(MessageSegment::ToolGroup {
                    call_ids: calls.iter().map(|c| c.id.clone()).collect(),
                });

                let mut duplicate_in_round = 0usize;
                for call in &calls {
                    let signature = tool_call_signature(call);
                    let seen = {
                        let count = same_call_counts.entry(signature.clone()).or_insert(0);
                        *count += 1;
                        *count
                    };

                    if seen > MAX_SAME_TOOL_CALLS_PER_TURN_HARD {
                        let reason = format!(
                            "Refusing to run `{}` again: identical call repeated {seen} times this turn.",
                            call.function.name
                        );
                        let (executed_call, message) = failed_tool_call_outcome(call, &reason, runtime.now_ms());
                        executed.push(executed_call);
                        messages.push(message);
                        observer.on_event(json!({
                            "type": "tool_result",
                            "callId": call.id,
                            "tool": call.function.name,
                            "ok": false,
                            "blocked": true,
                        }));
                        continue;
                    }
                    if seen > MAX_SAME_TOOL_CALLS_PER_TURN {
                        duplicate_in_round += 1;
                    }

                    if let Some(failures) = failure_counts.get(&signature) {
                        if *failures >= MAX_IDENTICAL_FAILURES_PER_CALL {
                            let reason = format!(
                                "Refusing to run `{}` again: the same call already failed {} times.",
                                call.function.name, failures
                            );
                            let (executed_call, message) = failed_tool_call_outcome(call, &reason, runtime.now_ms());
                            executed.push(executed_call);
                            messages.push(message);
                            continue;
                        }
                    }

                    if options.swarm_mode && is_read_like_tool(&call.function.name) {
                        undelegated_reads += 1;
                        if undelegated_reads > SWARM_MAX_UNDELEGATED_READS {
                            observer.on_event(json!({ "type": "nudge", "reason": "swarm_delegate_reads" }));
                        }
                    }
                    if is_read_like_tool(&call.function.name) {
                        low_progress_read_streak += 1;
                        if low_progress_read_streak > MAX_LOW_PROGRESS_READ_STREAK {
                            observer.on_event(json!({ "type": "nudge", "reason": "low_progress_reads" }));
                            low_progress_read_streak = 0;
                        }
                    } else {
                        low_progress_read_streak = 0;
                    }

                    let outcome = execute_tool_call(runtime, tools, observer, &options, call).await;
                    if !outcome.executed.ok {
                        *failure_counts.entry(signature.clone()).or_insert(0) += 1;
                    }
                    executed.push(outcome.executed.clone());
                    observer.on_persist(outcome.message.clone());
                    messages.push(outcome.message);
                }

                if duplicate_in_round > 0 {
                    duplicate_streak += 1;
                    if duplicate_streak >= MAX_DUPLICATE_CALL_STREAK && duplicate_interventions < MAX_DUPLICATE_CALL_INTERVENTIONS {
                        duplicate_interventions += 1;
                        duplicate_streak = 0;
                        messages.push(AgentMessage {
                            synthetic: Some(true),
                            ..AgentMessage::user(
                                "You are repeating tool calls you already ran. Do not call them again with the same arguments: use the results you already have, change the approach, or answer the user.",
                            )
                        });
                        observer.on_event(json!({
                            "type": "nudge",
                            "reason": "duplicate_tool_calls",
                            "intervention": duplicate_interventions,
                        }));
                    }
                } else {
                    duplicate_streak = 0;
                }

                // Mid-turn compaction if the transcript outgrew the window.
                let estimated: u64 = messages.iter().map(|m| runtime.estimate_message_tokens(m)).sum();
                let trigger = (llm.context_window as f64 * CONTEXT_COMPACT_TRIGGER_RATIO) as u64;
                if estimated > trigger {
                    observer.on_event(json!({
                        "type": "compaction",
                        "reason": "context_budget",
                        "estimatedTokens": estimated,
                    }));
                    messages = prune_history(&messages, trigger, runtime);
                    let (system, prompt) = build_compaction_prompt(&messages, None);
                    let request = SummarizeRequest {
                        system_prompt: system,
                        prompt,
                        transcript: serialize_conversation_for_summary(&messages),
                        model: llm.openai_model.clone(),
                        max_output_tokens: checkpoint_output_tokens(llm.context_window),
                        session_id: Some(options.session_id.clone()),
                    };
                    if let Ok(summary) = runtime.summarize(request).await {
                        if !summary.trim().is_empty() {
                            let summary = reinject_substantive_user_task(&summary, &messages);
                            let max_chars = (checkpoint_output_tokens(llm.context_window) * 4) as usize;
                            let summary = clamp_summary(&summary, max_chars);
                            observer.on_assistant_checkpoint(&summary, None);
                            // Replace the transcript with the summary and keep the
                            // trailing user turn for continuity.
                            let tail_start = messages
                                .iter()
                                .rposition(|m| m.role == "user")
                                .unwrap_or(messages.len().saturating_sub(1));
                            let tail: Vec<AgentMessage> = messages[tail_start..].to_vec();
                            messages = vec![AgentMessage::system(summary)];
                            messages.extend(tail);
                        }
                    }
                }

                continue 'rounds;
            }

            // ── No tool calls: decide whether the turn is finished ──
            if !round_content.is_empty() {
                content = round_content.clone();
                segments.push(MessageSegment::Text { content: round_content.clone() });
            }
            if !round_thinking.is_empty() {
                segments.push(MessageSegment::Thinking { content: cap_thinking(&round_thinking) });
            }

            if round_content.trim().is_empty() {
                // Plain-text tool calls are a model bug; nudge a bounded number of
                // times before giving up.
                let plain = detect_plain_text_tool_calls(&turn.content, &known_tools);
                if !plain.is_empty() && plain_text_retries < MAX_PLAIN_TEXT_RETRIES {
                    plain_text_retries += 1;
                    messages.push(AgentMessage {
                        synthetic: Some(true),
                        ..AgentMessage::assistant(turn.content.clone())
                    });
                    messages.push(AgentMessage {
                        synthetic: Some(true),
                        ..AgentMessage::user(
                            "Do not write tool calls as text. Use the tool-calling channel: call the tool with JSON arguments and wait for the result.",
                        )
                    });
                    observer.on_event(json!({
                        "type": "nudge",
                        "reason": "plain_text_tool_calls",
                        "attempt": plain_text_retries,
                    }));
                    continue 'rounds;
                }
                if empty_retries < MAX_EMPTY_RESPONSE_RETRIES {
                    empty_retries += 1;
                    messages.push(AgentMessage {
                        synthetic: Some(true),
                        ..AgentMessage::user("Your last response was empty. Continue the task and answer the user.")
                    });
                    observer.on_event(json!({
                        "type": "nudge",
                        "reason": "empty_response",
                        "attempt": empty_retries,
                    }));
                    continue 'rounds;
                }
                let fallback = build_empty_response_fallback(&executed, rounds, &llm.openai_model);
                content = fallback.clone();
                segments.push(MessageSegment::Text { content: fallback });
                finish_reason = Some(finish_reason.unwrap_or_else(|| "empty".into()));
                break 'rounds;
            }

            // Length-limited answers are continued rather than truncated.
            if finish_reason.as_deref() == Some("length") && length_continuations < MAX_LENGTH_CONTINUATIONS {
                length_continuations += 1;
                messages.push(AgentMessage::assistant(round_content.clone()));
                messages.push(AgentMessage {
                    synthetic: Some(true),
                    ..AgentMessage::user("Your response was cut off by the output limit. Continue exactly where you stopped.")
                });
                observer.on_event(json!({
                    "type": "nudge",
                    "reason": "length_continuation",
                    "attempt": length_continuations,
                }));
                continue 'rounds;
            }

            // Near-verbatim repetition in a finished answer: report and stop.
            if let Some(matched) = find_near_verbatim_repetition(&round_content) {
                observer.on_event(json!({
                    "type": "repetition",
                    "spanChars": matched.span_chars,
                    "copies": matched.copies,
                    "action": "reported",
                }));
            }

            break 'rounds;
        }

        let mut result = AgentLoopResult {
            content,
            tool_calls: executed,
            segments,
            rounds,
            finish_reason,
            usage,
            context_rounds: Some(context_rounds),
            error: None,
            status: None,
            aborted: None,
        };
        if result.content.trim().is_empty() {
            result.content = build_empty_response_fallback(&result.tool_calls, rounds, &llm.openai_model);
        }
        observer.on_event(json!({
            "type": "done",
            "rounds": result.rounds,
            "finishReason": result.finish_reason,
        }));
        result
    })
}

fn is_read_like_tool(name: &str) -> bool {
    let real = from_openai_name(name);
    matches!(
        real.as_str(),
        "file.read" | "file.view" | "code.read" | "grep" | "web.search" | "web.fetch"
    ) || real.starts_with("file.read")
        || real.starts_with("code.read")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};

    // ── Minimal executor: all fakes resolve immediately, so polling a boxed
    //    future with a no-op waker is sufficient and dependency free. ──
    fn block_on<F: std::future::Future>(fut: F) -> F::Output {
        use std::task::{Context, Poll, Wake, Waker};
        struct NoopWake;
        impl Wake for NoopWake {
            fn wake(self: std::sync::Arc<Self>) {}
        }
        let waker = Waker::from(std::sync::Arc::new(NoopWake));
        let mut context = Context::from_waker(&waker);
        let mut future = Box::pin(fut);
        loop {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(value) => return value,
                Poll::Pending => continue,
            }
        }
    }

    // ── Fake runtime ───────────────────────────────────────────────────
    struct FakeRuntime {
        clock: AtomicI64,
        aborted: Arc<AtomicBool>,
        sleeps: Mutex<Vec<u64>>,
        logs: Mutex<Vec<(LogLevel, String)>>,
        system_one: AtomicBool,
        summary: Mutex<Option<String>>,
        env: Mutex<HashMap<String, String>>,
        estimate_scale: AtomicUsize,
    }

    impl FakeRuntime {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                clock: AtomicI64::new(1_700_000_000_000),
                aborted: Arc::new(AtomicBool::new(false)),
                sleeps: Mutex::new(Vec::new()),
                logs: Mutex::new(Vec::new()),
                system_one: AtomicBool::new(false),
                summary: Mutex::new(None),
                env: Mutex::new(HashMap::new()),
                estimate_scale: AtomicUsize::new(1),
            })
        }

        fn set_aborted(&self) {
            self.aborted.store(true, Ordering::SeqCst);
        }

        /// Handle a tool implementation can flip to model "user hit stop while
        /// the subprocess was running".
        fn abort_flag(&self) -> Arc<AtomicBool> {
            self.aborted.clone()
        }

        fn total_slept(&self) -> u64 {
            self.sleeps.lock().unwrap().iter().sum()
        }

        fn sleep_count(&self) -> usize {
            self.sleeps.lock().unwrap().len()
        }

        fn events_containing(&self, needle: &str) -> bool {
            self.logs.lock().unwrap().iter().any(|(_, line)| line.contains(needle))
        }
    }

    impl AgentRuntime for FakeRuntime {
        fn now_ms(&self) -> i64 {
            self.clock.load(Ordering::SeqCst)
        }

        fn sleep<'a>(&'a self, ms: u64) -> BoxFuture<'a, ()> {
            self.sleeps.lock().unwrap().push(ms);
            // Advance the clock so timeout/deadline logic progresses.
            self.clock.fetch_add(ms as i64, Ordering::SeqCst);
            Box::pin(async move {})
        }

        fn is_aborted(&self) -> bool {
            self.aborted.load(Ordering::SeqCst)
        }

        fn env(&self, key: &str) -> Option<String> {
            self.env.lock().unwrap().get(key).cloned()
        }

        fn log(&self, level: LogLevel, message: &str) {
            self.logs.lock().unwrap().push((level, message.to_string()));
        }

        fn estimate_message_tokens(&self, message: &AgentMessage) -> u64 {
            let base = (message.content.chars().count() / 4) as u64 + 4;
            let calls = message
                .tool_calls
                .as_ref()
                .map(|calls| calls.iter().map(|c| c.function.arguments.len() / 4 + 8).sum::<usize>() as u64)
                .unwrap_or(0);
            (base + calls) * self.estimate_scale.load(Ordering::SeqCst) as u64
        }

        fn estimate_tokens(&self, text: &str) -> u64 {
            (text.chars().count() / 4) as u64
        }

        fn project_tool_evidence(&self, call_id: &str, tool: &str, _result: &Value) -> Option<String> {
            Some(format!("evidence:{tool}:{call_id}"))
        }

        fn system_one_enabled(&self) -> bool {
            self.system_one.load(Ordering::SeqCst)
        }

        fn serialize_tool_result_for_model(&self, result: &Value) -> String {
            let ok = result.get("ok").and_then(Value::as_bool).unwrap_or(false);
            let message = result.get("message").and_then(Value::as_str).unwrap_or("");
            crate::tools::model_result::serialize_tool_result_for_model(ok, message, result.get("data"))
        }

        fn summarize<'a>(&'a self, _request: SummarizeRequest) -> BoxFuture<'a, Result<String, String>> {
            let summary = self.summary.lock().unwrap().clone();
            Box::pin(async move { summary.ok_or_else(|| "no summariser".to_string()) })
        }
    }

    // ── Fake LLM host ──────────────────────────────────────────────────
    #[derive(Default)]
    struct FakeHost {
        responses: Mutex<VecDeque<LlmHttpResponse>>,
        requests: Mutex<Vec<LlmHttpRequest>>,
    }

    impl FakeHost {
        fn new(responses: Vec<LlmHttpResponse>) -> Arc<Self> {
            Arc::new(Self { responses: Mutex::new(responses.into()), requests: Mutex::new(Vec::new()) })
        }

        fn call_count(&self) -> usize {
            self.requests.lock().unwrap().len()
        }

        fn last_request(&self) -> LlmHttpRequest {
            self.requests.lock().unwrap().last().cloned().expect("no request recorded")
        }
    }

    impl LlmHost for FakeHost {
        fn request_headers<'a>(&'a self, _llm: &'a LlmConfig) -> BoxFuture<'a, Vec<(String, String)>> {
            Box::pin(async move { vec![("authorization".to_string(), "Bearer test".to_string())] })
        }

        fn post_stream<'a>(&'a self, request: LlmHttpRequest) -> BoxFuture<'a, Result<LlmHttpResponse, String>> {
            self.requests.lock().unwrap().push(request);
            let next = self.responses.lock().unwrap().pop_front();
            Box::pin(async move {
                match next {
                    Some(response) => Ok(response),
                    None => Ok(LlmHttpResponse {
                        status: 0,
                        transport_failure: Some(TransportFailure {
                            name: Some("TypeError".into()),
                            message: Some("no scripted response".into()),
                            cause_code: Some("ECONNREFUSED".into()),
                            ..Default::default()
                        }),
                        ..Default::default()
                    }),
                }
            })
        }
    }

    // ── Fake tool executor ─────────────────────────────────────────────
    struct FakeTools {
        results: Mutex<HashMap<String, Result<Value, String>>>,
        calls: Mutex<Vec<ToolExecutionRequest>>,
        abort_flag: Mutex<Option<Arc<AtomicBool>>>,
    }

    impl FakeTools {
        fn new(results: Vec<(&str, Result<Value, String>)>) -> Arc<Self> {
            Arc::new(Self {
                results: Mutex::new(results.into_iter().map(|(k, v)| (k.to_string(), v)).collect()),
                calls: Mutex::new(Vec::new()),
                abort_flag: Mutex::new(None),
            })
        }

        fn call_names(&self) -> Vec<String> {
            self.calls.lock().unwrap().iter().map(|c| c.name.clone()).collect()
        }
    }

    impl ToolExecutor for FakeTools {
        fn execute<'a>(&'a self, request: ToolExecutionRequest) -> BoxFuture<'a, Result<Value, String>> {
            self.calls.lock().unwrap().push(request.clone());
            if let Some(flag) = self.abort_flag.lock().unwrap().clone() {
                // Models a tool that observes process state: an abort that lands
                // while the subprocess is still running.
                flag.store(true, Ordering::SeqCst);
            }
            let result = self.results.lock().unwrap().get(&request.name).cloned();
            Box::pin(async move {
                match result {
                    Some(result) => result,
                    None => Ok(json!({ "ok": false, "message": format!("unknown tool: {}", request.name) })),
                }
            })
        }
    }

    // Test-only pointer so a fake tool can flip the fake runtime's abort flag.

    // ── Recording observer ─────────────────────────────────────────────
    #[derive(Default)]
    struct RecordingObserver {
        events: Mutex<Vec<Value>>,
        contexts: Mutex<Vec<LlmContextFlowRound>>,
        persisted: Mutex<Vec<AgentMessage>>,
        checkpoints: Mutex<Vec<String>>,
    }

    impl RecordingObserver {
        fn new() -> Arc<Self> {
            Arc::new(Self::default())
        }

        fn types(&self) -> Vec<String> {
            self.events
                .lock()
                .unwrap()
                .iter()
                .map(|event| event.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string())
                .collect()
        }

        fn has_flag(&self, type_name: &str, field: &str) -> bool {
            self.events.lock().unwrap().iter().any(|event| {
                event.get("type").and_then(|v| v.as_str()) == Some(type_name)
                    && event.get(field).and_then(Value::as_bool) == Some(true)
            })
        }

        fn has_event(&self, type_name: &str, field: &str, value: &str) -> bool {
            self.events.lock().unwrap().iter().any(|event| {
                event.get("type").and_then(|v| v.as_str()) == Some(type_name)
                    && event.get(field).and_then(|v| v.as_str()) == Some(value)
            })
        }
    }

    impl LoopObserver for RecordingObserver {
        fn on_event(&self, event: AgentLoopEvent) {
            self.events.lock().unwrap().push(event);
        }

        fn on_context(&self, round: LlmContextFlowRound) {
            self.contexts.lock().unwrap().push(round);
        }

        fn on_persist(&self, message: AgentMessage) {
            self.persisted.lock().unwrap().push(message);
        }

        fn on_assistant_checkpoint(&self, content: &str, _thinking: Option<&str>) {
            self.checkpoints.lock().unwrap().push(content.to_string());
        }
    }

    // ── Response builders ──────────────────────────────────────────────
    fn sse_text(chunks: &[&str], finish_reason: &str) -> LlmHttpResponse {
        let mut body = String::new();
        for chunk in chunks {
            body.push_str(&format!(
                "data: {}\n\n",
                json!({
                    "id": "chatcmpl-test",
                    "model": "test-model",
                    "choices": [{ "index": 0, "delta": { "content": chunk } }]
                })
            ));
        }
        body.push_str(&format!(
            "data: {}\n\n",
            json!({
                "choices": [{ "index": 0, "delta": {}, "finish_reason": finish_reason }],
                "usage": { "prompt_tokens": 11, "completion_tokens": 7 }
            })
        ));
        body.push_str("data: [DONE]\n\n");
        LlmHttpResponse { status: 200, headers: BTreeMap::new(), body, transport_failure: None }
    }

    fn sse_tool_calls(calls: &[(&str, &str, &str)]) -> LlmHttpResponse {
        let mut body = String::new();
        for (index, (id, name, args)) in calls.iter().enumerate() {
            // Emit the call in two fragments so delta assembly is exercised.
            body.push_str(&format!(
                "data: {}\n\n",
                json!({
                    "choices": [{ "index": 0, "delta": { "tool_calls": [{
                        "index": index, "id": id, "type": "function",
                        "function": { "name": name, "arguments": "" }
                    }] } }]
                })
            ));
            body.push_str(&format!(
                "data: {}\n\n",
                json!({
                    "choices": [{ "index": 0, "delta": { "tool_calls": [{
                        "index": index, "function": { "arguments": args }
                    }] } }]
                })
            ));
        }
        body.push_str(&format!(
            "data: {}\n\n",
            json!({ "choices": [{ "index": 0, "delta": {}, "finish_reason": "tool_calls" }] })
        ));
        LlmHttpResponse { status: 200, headers: BTreeMap::new(), body, transport_failure: None }
    }

    fn http_error(status: u16, body: &str) -> LlmHttpResponse {
        LlmHttpResponse { status, headers: BTreeMap::new(), body: body.to_string(), transport_failure: None }
    }

    fn base_options() -> AgentLoopOptions {
        AgentLoopOptions {
            messages: vec![AgentMessage::user("Please summarise the repo.")],
            tools: vec![
                OpenAiToolSchema::new("file.read", "read a file", json!({ "type": "object" })),
                OpenAiToolSchema::new("code.grep", "grep code", json!({ "type": "object" })),
            ],
            session_id: "sess-1".into(),
            ..Default::default()
        }
    }

    fn run(
        options: AgentLoopOptions,
        runtime: &Arc<FakeRuntime>,
        host: &Arc<FakeHost>,
        tools: &Arc<FakeTools>,
        observer: &Arc<RecordingObserver>,
        steering: &SteeringController,
    ) -> AgentLoopResult {
        block_on(run_agent_loop(
            options,
            runtime.as_ref(),
            host.as_ref(),
            tools.as_ref(),
            observer.as_ref(),
            steering,
        ))
    }

    // ── Tests: orchestration ───────────────────────────────────────────

    #[test]
    fn single_text_round_returns_content_and_emits_done() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![sse_text(&["Hello ", "world"], "stop")]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(result.content, "Hello world");
        assert_eq!(result.rounds, 1);
        assert_eq!(result.finish_reason.as_deref(), Some("stop"));
        assert!(result.error.is_none());
        assert!(result.tool_calls.is_empty());
        assert_eq!(host.call_count(), 1);
        let types = observer.types();
        assert_eq!(types.first().map(String::as_str), Some("start"));
        assert_eq!(types.last().map(String::as_str), Some("done"));
        assert_eq!(types.iter().filter(|t| *t == "token").count(), 2);
        // Usage is surfaced verbatim from the provider.
        assert_eq!(result.usage.as_ref().unwrap()["prompt_tokens"], json!(11));
        // One context round per model round, with metrics filled in.
        let contexts = observer.contexts.lock().unwrap();
        assert_eq!(contexts.len(), 1);
        assert_eq!(contexts[0].round, 1);
        assert_eq!(contexts[0].metrics.as_ref().unwrap().prompt_tokens, Some(11));
    }

    #[test]
    fn tool_calls_dispatch_in_order_and_results_follow_call_order() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![
            sse_tool_calls(&[
                ("call_a", "file_read", "{\"path\":\"a.txt\"}"),
                ("call_b", "code_grep", "{\"pattern\":\"needle\"}"),
            ]),
            sse_text(&["all done"], "stop"),
        ]);
        let tools = FakeTools::new(vec![
            ("file.read", Ok(json!({ "ok": true, "message": "alpha" }))),
            ("code.grep", Ok(json!({ "ok": true, "message": "beta" }))),
        ]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        // Dispatch order follows the model's call order.
        assert_eq!(tools.call_names(), vec!["file.read".to_string(), "code.grep".to_string()]);
        let calls = tools.calls.lock().unwrap();
        assert_eq!(calls[0].call_id, "call_a");
        assert_eq!(calls[0].args["path"], json!("a.txt"));
        assert_eq!(calls[0].session_id, "sess-1");
        drop(calls);

        // Executed records preserve order too.
        let ids: Vec<&str> = result.tool_calls.iter().map(|c| c.call_id.as_str()).collect();
        assert_eq!(ids, vec!["call_a", "call_b"]);
        assert!(result.tool_calls.iter().all(|c| c.ok));

        // Second request carries assistant(tool_calls) then both tool replies,
        // in call order, before anything else.
        let second = host.requests.lock().unwrap()[1].clone();
        let messages = second.body["messages"].as_array().unwrap();
        let assistant_position = messages
            .iter()
            .position(|m| m["role"] == json!("assistant") && m.get("tool_calls").is_some())
            .expect("assistant tool_calls message missing");
        assert_eq!(messages[assistant_position]["content"], Value::Null);
        assert_eq!(messages[assistant_position + 1]["role"], json!("tool"));
        assert_eq!(messages[assistant_position + 1]["tool_call_id"], json!("call_a"));
        assert_eq!(messages[assistant_position + 2]["tool_call_id"], json!("call_b"));

        assert_eq!(result.rounds, 2);
        assert_eq!(result.content, "all done");
        assert_eq!(observer.persisted.lock().unwrap().len(), 2);
        assert!(observer.has_event("tool_call", "callId", "call_a"));
        assert!(observer.has_event("tool_result", "callId", "call_b"));
        // Tool-call grouping segment keeps the emitted order.
        let last_group = result
            .segments
            .iter()
            .rev()
            .find_map(|segment| match segment {
                MessageSegment::ToolGroup { call_ids } => Some(call_ids.clone()),
                _ => None,
            })
            .unwrap();
        assert_eq!(last_group, vec!["call_a".to_string(), "call_b".to_string()]);
    }

    #[test]
    fn failing_tool_still_produces_a_reply_message_in_order() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![
            sse_tool_calls(&[
                ("c1", "file_read", "{}"),
                ("c2", "code_grep", "{}"),
            ]),
            sse_text(&["done"], "stop"),
        ]);
        let tools = FakeTools::new(vec![
            ("file.read", Ok(json!({ "ok": true, "message": "ok-content" }))),
            // Validation errors are not retried.
            ("code.grep", Err("Input validation error: pattern is required".to_string())),
        ]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(result.tool_calls.len(), 2);
        assert!(result.tool_calls[0].ok);
        assert!(!result.tool_calls[1].ok);
        assert!(result.tool_calls[1].message.contains("Input validation error"));
        // A validation failure is executed exactly once.
        assert_eq!(tools.calls.lock().unwrap().len(), 2);
        let messages = host.requests.lock().unwrap()[1].body["messages"].as_array().unwrap().clone();
        let tool_ids: Vec<Value> = messages
            .iter()
            .filter(|m| m["role"] == json!("tool"))
            .map(|m| m["tool_call_id"].clone())
            .collect();
        assert_eq!(tool_ids, vec![json!("c1"), json!("c2")]);
    }

    // ── Tests: cancellation ────────────────────────────────────────────

    #[test]
    fn abort_before_first_round_short_circuits() {
        let runtime = FakeRuntime::new();
        runtime.set_aborted();
        let host = FakeHost::new(vec![sse_text(&["never"], "stop")]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(host.call_count(), 0);
        assert_eq!(result.aborted, Some(true));
        assert_eq!(result.finish_reason.as_deref(), Some("aborted"));
        assert_eq!(result.content, "Request aborted by user");
        assert_eq!(result.error.as_deref(), Some("Request aborted by user"));
        assert_eq!(result.rounds, 0);
    }

    #[test]
    fn abort_during_tool_execution_ends_the_turn_after_the_call() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![
            sse_tool_calls(&[("c1", "file_read", "{}")]),
            sse_text(&["should not be reached"], "stop"),
        ]);
        let tools = FakeTools::new(vec![("file.read", Ok(json!({ "ok": true, "message": "data" })))]);
        // The user hits stop while the tool subprocess is still running.
        *tools.abort_flag.lock().unwrap() = Some(runtime.abort_flag());
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(result.tool_calls.len(), 1);
        assert_eq!(result.aborted, Some(true));
        // The tool result was still appended before the turn ended.
        assert_eq!(observer.persisted.lock().unwrap().len(), 1);
        assert_eq!(host.call_count(), 1);
    }

    // ── Tests: limits and recoveries ───────────────────────────────────

    #[test]
    fn tool_round_checkpoint_nudges_then_accepts_answer() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![
            sse_tool_calls(&[("c1", "file_read", "{}")]),
            sse_text(&["final answer"], "stop"),
        ]);
        let tools = FakeTools::new(vec![("file.read", Ok(json!({ "ok": true, "message": "x" })))]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);
        let mut options = base_options();
        options.max_tool_rounds = Some(1);

        let result = run(options, &runtime, &host, &tools, &observer, &steering);

        assert_eq!(result.content, "final answer");
        assert_eq!(result.rounds, 2);
        // The nudge lands in the second request as a synthetic user message.
        let second = host.requests.lock().unwrap()[1].clone();
        let messages = second.body["messages"].as_array().unwrap();
        let nudged = messages
            .iter()
            .any(|m| m["role"] == json!("user") && m["content"].as_str().unwrap_or("").contains("Converge now"));
        assert!(nudged, "converge nudge missing from second request");
        assert!(observer.has_event("nudge", "reason", "tool_round_checkpoint"));
    }

    #[test]
    fn identical_tool_calls_are_hard_blocked_after_the_cap() {
        let runtime = FakeRuntime::new();
        // Always the same call, forever.
        let responses: Vec<LlmHttpResponse> = (0..15).map(|_| sse_tool_calls(&[("dup", "file_read", "{}")])).collect();
        let host = FakeHost::new(responses);
        let tools = FakeTools::new(vec![("file.read", Ok(json!({ "ok": true, "message": "same" })))]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);
        let mut options = base_options();
        options.max_tool_rounds = Some(20);

        let result = run(options, &runtime, &host, &tools, &observer, &steering);

        // 6 real executions, then 4 duplicates still run (soft cap), then hard
        // blocks; execution count is capped well below the round count.
        let executed_count = tools.calls.lock().unwrap().len();
        assert!(executed_count <= MAX_SAME_TOOL_CALLS_PER_TURN_HARD, "executed {executed_count} times");
        assert!(result
            .tool_calls
            .iter()
            .any(|call| !call.ok && call.message.contains("Refusing to run")));
        assert!(observer.has_flag("tool_result", "blocked"));
    }

    #[test]
    fn empty_responses_retry_then_fall_back_with_actionable_text() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![
            sse_text(&[], "stop"),
            sse_text(&[], "stop"),
            sse_text(&[], "stop"),
        ]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(host.call_count(), 3);
        assert_eq!(result.rounds, 3);
        assert!(result.content.contains("returned no content"));
        assert!(result.content.contains("gpt-4o-mini"));
        let nudges = observer
            .events
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e["type"] == json!("nudge") && e["reason"] == json!("empty_response"))
            .count();
        assert_eq!(nudges, MAX_EMPTY_RESPONSE_RETRIES);
    }

    #[test]
    fn length_finish_reason_continues_the_answer() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![
            sse_text(&["part one "], "length"),
            sse_text(&["part two"], "stop"),
        ]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(host.call_count(), 2);
        assert_eq!(result.rounds, 2);
        assert_eq!(result.content, "part two");
        assert!(observer.has_event("nudge", "reason", "length_continuation"));
    }

    #[test]
    fn degenerate_repetition_is_truncated_and_the_turn_continues() {
        let runtime = FakeRuntime::new();
        let repeated = "a very long repeated sentence that the model is stuck on. ".repeat(20);
        let host = FakeHost::new(vec![
            sse_text(&[&repeated], "stop"),
            sse_text(&["clean answer"], "stop"),
        ]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert!(observer.has_event("repetition", "action", "truncate"));
        assert_eq!(result.rounds, 2);
        assert_eq!(result.content, "clean answer");
        // The repeated text did not become the answer.
        assert!(!result.content.contains("stuck on"));
    }

    #[test]
    fn plain_text_tool_calls_are_nudged_back_into_the_tool_channel() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![
            sse_text(&["<file.read>{\"path\":\"a.txt\"}</file.read>"], "stop"),
            sse_text(&["the real answer"], "stop"),
        ]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);
        // Note: `known_tools` holds real names, so the schema must use the
        // already-OpenAI-safe name for detection to fire.
        let mut options = base_options();
        options.tools = vec![OpenAiToolSchema::new("file.read", "read", json!({ "type": "object" }))];

        let result = run(options, &runtime, &host, &tools, &observer, &steering);

        assert!(observer.has_event("nudge", "reason", "plain_text_tool_calls"));
        assert_eq!(result.content, "the real answer");
        assert!(tools.calls.lock().unwrap().is_empty(), "plain text must not be executed directly");
    }

    #[test]
    fn rate_limit_is_retried_with_provider_retry_after() {
        let runtime = FakeRuntime::new();
        let mut limited = http_error(429, "{\"error\":{\"message\":\"slow down\"}}");
        limited.headers.insert("retry-after".into(), "3".into());
        let host = FakeHost::new(vec![limited, sse_text(&["recovered"], "stop")]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(host.call_count(), 2);
        assert_eq!(result.content, "recovered");
        assert_eq!(runtime.total_slept(), 3_000);
        assert!(observer.has_event("retry", "reason", "rate_limit"));
    }

    #[test]
    fn quota_exhaustion_is_not_retried() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![http_error(
            429,
            "{\"error\":{\"message\":\"You exceeded your current quota\",\"code\":\"insufficient_quota\"}}",
        )]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(host.call_count(), 1);
        assert_eq!(result.status, Some(429));
        assert!(result.error.unwrap().contains("quota"));
        assert_eq!(runtime.sleep_count(), 0);
    }

    #[test]
    fn server_error_surfaces_as_error_result_with_status() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![http_error(500, "{\"error\":{\"message\":\"boom\"}}")]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(result.status, Some(500));
        assert_eq!(result.finish_reason.as_deref(), Some("error"));
        assert!(result.error.as_deref().unwrap().contains("experiencing issues (500)"));
        let errors: Vec<Value> = observer
            .events
            .lock()
            .unwrap()
            .iter()
            .filter(|event| event.get("type").and_then(|v| v.as_str()) == Some("error"))
            .cloned()
            .collect();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].get("status").and_then(Value::as_u64), Some(500));
        assert!(errors[0]
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap()
            .contains("experiencing issues (500)"));
    }

    #[test]
    fn connection_refused_is_not_retried_and_is_explained() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![LlmHttpResponse {
            status: 0,
            transport_failure: Some(TransportFailure {
                name: Some("TypeError".into()),
                message: Some("fetch failed".into()),
                cause_code: Some("ECONNREFUSED".into()),
                ..Default::default()
            }),
            ..Default::default()
        }]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(host.call_count(), 1, "dead backends must not be retried");
        assert!(result.error.as_deref().unwrap().contains("Could not connect to"));
    }

    // ── Tests: steering ────────────────────────────────────────────────

    #[test]
    fn steering_messages_are_injected_at_the_next_boundary() {
        let runtime = FakeRuntime::new();
        let host = FakeHost::new(vec![sse_text(&["ok"], "stop")]);
        let tools = FakeTools::new(vec![]);
        let observer = RecordingObserver::new();
        let steering = SteeringController::new(1_000);
        assert!(steering.push(SteeringMessage { content: "also mention tests".into(), ..Default::default() }));
        // Only the first steering per round is replayed.
        assert!(steering.push(SteeringMessage { content: "second".into(), ..Default::default() }));

        let result = run(base_options(), &runtime, &host, &tools, &observer, &steering);

        assert_eq!(steering.pending_count(), 0);
        assert!(observer.has_event("steering", "content", "also mention tests"));
        let sent = host.last_request().body["messages"].as_array().unwrap().clone();
        let injected: Vec<&Value> = sent
            .iter()
            .filter(|m| m["content"] == json!("also mention tests"))
            .collect();
        assert_eq!(injected.len(), 1);
        assert!(!sent.iter().any(|m| m["content"] == json!("second")));
        assert_eq!(result.content, "ok");
        assert!(result
            .segments
            .iter()
            .any(|s| matches!(s, MessageSegment::Steering { content, .. } if content == "also mention tests")));
    }

    #[test]
    fn steering_controller_rejects_pushes_after_close() {
        let steering = SteeringController::new(10);
        assert!(steering.push(SteeringMessage { content: "a".into(), ..Default::default() }));
        steering.close();
        assert!(!steering.push(SteeringMessage { content: "b".into(), ..Default::default() }));
        assert_eq!(steering.pending_count(), 0);
        assert!(steering.is_closed());
    }

    // ── Tests: helpers ─────────────────────────────────────────────────

    #[test]
    fn format_llm_error_covers_provider_shapes() {
        assert_eq!(
            format_llm_error(401, "{}"),
            "Your API key is invalid or expired. Please check your settings."
        );
        assert_eq!(
            format_llm_error(403, "{}"),
            "Access denied by the model provider. Please check your API key permissions."
        );
        assert_eq!(
            format_llm_error(429, "{\"error\":{\"message\":\"slow\",\"code\":\"insufficient_quota\"}}"),
            "You've exceeded your API quota. Please check your plan and billing details."
        );
        assert_eq!(
            format_llm_error(429, "{\"error\":{\"message\":\"slow\"}}"),
            "Rate limited by the model provider. Please wait a moment and try again.\nslow"
        );
        // Ollama returns a bare string error.
        assert_eq!(
            format_llm_error(400, "{\"error\":\"model not found\"}"),
            "Request failed (400): model not found"
        );
        assert_eq!(format_llm_error(400, "not json"), "Request failed with status 400. Please try again.");
        assert_eq!(format_llm_error(503, ""), "The model provider is experiencing issues (503). Please try again later.");
    }

    #[test]
    fn retryable_rate_limit_excludes_quota_and_billing() {
        assert!(is_retryable_rate_limit(429, "{\"error\":{\"message\":\"rate limit\"}}"));
        assert!(!is_retryable_rate_limit(429, "{\"error\":{\"code\":\"insufficient_quota\"}}"));
        assert!(!is_retryable_rate_limit(429, "{\"error\":{\"message\":\"billing problem\"}}"));
        assert!(!is_retryable_rate_limit(500, "{}"));
    }

    #[test]
    fn backoff_prefers_retry_after_and_clamps() {
        assert_eq!(rate_limit_backoff_ms(1, None), 2_000);
        assert_eq!(rate_limit_backoff_ms(2, None), 4_000);
        assert_eq!(rate_limit_backoff_ms(5, None), 30_000);
        assert_eq!(rate_limit_backoff_ms(1, Some(7_500)), 7_500);
        assert_eq!(rate_limit_backoff_ms(1, Some(900_000)), 30_000);
        assert_eq!(parse_retry_after_ms(Some("2"), 0), Some(2_000));
        assert_eq!(parse_retry_after_ms(Some(""), 0), None);
        // HTTP-date form.
        let parsed = parse_retry_after_ms(Some("Sun, 06 Nov 1994 08:49:37 GMT"), 784_111_777_000);
        assert_eq!(parsed, Some(0));
    }

    #[test]
    fn context_overflow_detection_matches_provider_phrasings() {
        assert!(is_context_overflow_error(400, "This model's maximum context length is 8192 tokens"));
        assert!(is_context_overflow_error(413, "prompt is too long"));
        assert!(!is_context_overflow_error(400, "invalid api key"));
        assert!(!is_context_overflow_error(500, "maximum context length"));
    }

    #[test]
    fn openai_name_mapping_is_stable_sanitised_and_reversible() {
        reset_name_map();
        assert_eq!(to_openai_name("mcp__server.tool"), "mcp__server_tool");
        assert_eq!(to_openai_name("mcp__server.tool"), "mcp__server_tool");
        assert_eq!(from_openai_name("mcp__server_tool"), "mcp__server.tool");
        // Unknown names round-trip unchanged.
        assert_eq!(from_openai_name("never_registered"), "never_registered");

        let long = "x".repeat(120);
        let mapped = to_openai_name(&long);
        assert_eq!(mapped.chars().count(), OPENAI_NAME_MAX_CHARS);

        // A colliding name gets a deterministic hash suffix instead of clobbering.
        let collided = to_openai_name("mcp__server/tool");
        assert_ne!(collided, "mcp__server_tool");
        assert!(collided.starts_with("mcp__server_tool_"));
        assert_eq!(collided, to_openai_name("mcp__server/tool"));
        assert!(list_ambiguous_openai_names().contains(&"mcp__server_tool".to_string()));
        assert_eq!(from_openai_name(&collided), "mcp__server/tool");
    }

    #[test]
    fn repair_tool_call_history_fills_missing_and_drops_orphans() {
        let messages = vec![
            AgentMessage::user("hi"),
            AgentMessage {
                tool_calls: Some(vec![
                    OpenAiToolCall::new("a", "file_read", "{}"),
                    OpenAiToolCall::new("b", "code_grep", "{}"),
                ]),
                ..AgentMessage::assistant("")
            },
            AgentMessage::tool("b", "code_grep", "{\"ok\":true}"),
            AgentMessage::tool("ghost", "ghost_tool", "{}"),
        ];
        let repaired = repair_tool_call_history(&messages);

        assert_eq!(repaired.len(), 4);
        assert_eq!(repaired[2].tool_call_id.as_deref(), Some("a"));
        assert!(repaired[2].content.contains("Tool call was not executed."));
        assert_eq!(repaired[3].tool_call_id.as_deref(), Some("b"));
    }

    #[test]
    fn serialize_messages_null_content_and_reasoning_replay() {
        let messages = vec![AgentMessage {
            tool_calls: Some(vec![OpenAiToolCall::new("a", "file_read", "{}")]),
            thinking: Some("because reasons".into()),
            ..AgentMessage::assistant("")
        }];
        let plain = serialize_messages(&messages, false);
        assert_eq!(plain[0]["content"], Value::Null);
        assert!(plain[0].get("reasoning_content").is_none());
        // evidence_reference must never reach the wire.
        assert!(plain[0].get("evidence_reference").is_none());

        let replay = serialize_messages(&messages, true);
        assert_eq!(replay[0]["reasoning_content"], json!("because reasons"));
    }

    #[test]
    fn transient_failure_classification_table() {
        for message in [
            "connection timeout",
            "request timed out",
            "ECONNRESET",
            "socket hang up",
            "rate limited, try later",
            "HTTP 503",
            "service unavailable",
            "bad gateway",
        ] {
            assert!(is_transient_failure(Some(message)), "expected transient: {message}");
        }
        for message in [
            "permission denied",
            "unknown tool: nope",
            "file not found: a.txt",
            "",
        ] {
            assert!(!is_transient_failure(Some(message)), "expected permanent: {message}");
        }
        assert!(!is_transient_failure(None));
    }

    #[test]
    fn invalid_tool_failures_are_never_retried() {
        assert_eq!(retry_tool_call_decision("unknown tool: nope", 0, 2), RetryDecision::GiveUp);
        assert_eq!(
            retry_tool_call_decision("Input validation error: bad", 0, 2),
            RetryDecision::GiveUp
        );
        assert_eq!(retry_tool_call_decision("timeout", 2, 2), RetryDecision::GiveUp);
        assert_eq!(
            retry_tool_call_decision("timeout", 0, 2),
            RetryDecision::Retry { delay_ms: 2_000 }
        );
    }

    #[test]
    fn prune_history_keeps_system_first_task_and_recent_tool_output() {
        let runtime = FakeRuntime::new();
        let mut messages = vec![
            AgentMessage::system("system prompt"),
            AgentMessage::user("Please refactor the widget subsystem properly."),
        ];
        for index in 0..6 {
            messages.push(AgentMessage {
                tool_calls: Some(vec![OpenAiToolCall::new(format!("c{index}"), "file_read", "{}")]),
                ..AgentMessage::assistant("")
            });
            messages.push(AgentMessage {
                evidence_reference: Some(format!("ev-{index}")),
                ..AgentMessage::tool(format!("c{index}"), "file_read", "x".repeat(2000))
            });
        }
        let before: u64 = messages.iter().map(|m| runtime.estimate_message_tokens(m)).sum();
        let pruned = prune_history(&messages, before / 4, runtime.as_ref());
        let after: u64 = pruned.iter().map(|m| runtime.estimate_message_tokens(m)).sum();

        assert!(after < before, "pruning did not reduce tokens");
        // Load-bearing messages survive verbatim.
        assert_eq!(pruned[0].content, "system prompt");
        assert_eq!(pruned[1].content, "Please refactor the widget subsystem properly.");
        // The oldest tool result is stubbed but stays recoverable.
        let first_tool = pruned.iter().find(|m| m.role == "tool").unwrap();
        assert!(first_tool.content.contains("pruned to save context"));
        assert_eq!(first_tool.evidence_reference.as_deref(), Some("ev-0"));
    }

    #[test]
    fn repetition_detection_finds_runs_and_ignores_normal_prose() {
        let normal = "This is an ordinary paragraph about the codebase. ".repeat(3);
        assert!(find_degenerate_repetition(&normal).is_none());

        let run = "the model is stuck repeating this exact phrase over and over again. ".repeat(12);
        let matched = find_degenerate_repetition(&run).expect("run not detected");
        assert!(matched.copies >= MIN_REPETITION_COPIES);
        assert!(matched.span_chars >= MIN_REPETITION_SPAN_CHARS);
        let (trimmed, _) = trim_degenerate_repetition(&run).unwrap();
        assert!(trimmed.chars().count() < run.chars().count());
        assert_eq!(trimmed, run[..matched.start + matched.span.chars().count().min(trimmed.chars().count())].to_string());
    }

    #[test]
    fn tool_call_signature_canonicalises_argument_key_order() {
        let a = OpenAiToolCall::new("1", "file_read", "{\"path\":\"x\",\"line\":2}");
        let b = OpenAiToolCall::new("2", "file_read", "{\"line\":2,\"path\":\"x\"}");
        assert_eq!(tool_call_signature(&a), tool_call_signature(&b));
        let c = OpenAiToolCall::new("3", "file_read", "{\"path\":\"y\",\"line\":2}");
        assert_ne!(tool_call_signature(&a), tool_call_signature(&c));
        // Invalid JSON arguments degrade to `{}` rather than panicking.
        let broken = OpenAiToolCall::new("4", "file_read", "not json");
        assert_eq!(broken.parsed_arguments(), json!({}));
    }

    #[test]
    fn stream_parsers_assemble_openai_and_ollama_shapes() {
        let openai = sse_tool_calls(&[("call_1", "file_read", "{\"path\":\"a\"}")]);
        let mut sink = StreamSink { on_content: &mut |_| {}, on_thinking: &mut |_| {} };
        let turn = parse_openai_stream(&openai.body, &mut sink);
        assert_eq!(turn.tool_calls.len(), 1);
        assert_eq!(turn.tool_calls[0].id, "call_1");
        assert_eq!(turn.tool_calls[0].function.arguments, "{\"path\":\"a\"}");
        assert_eq!(turn.finish_reason.as_deref(), Some("tool_calls"));

        let ndjson = format!(
            "{}\n{}\n",
            json!({ "model": "llama", "message": { "content": "hi", "tool_calls": [{ "function": { "name": "file.read", "arguments": { "path": "a" } } }] }, "done": false }),
            json!({ "done": true, "done_reason": "stop", "prompt_eval_count": 9, "eval_count": 4 })
        );
        let mut sink = StreamSink { on_content: &mut |_| {}, on_thinking: &mut |_| {} };
        let turn = parse_ollama_stream(&ndjson, &mut sink);
        assert_eq!(turn.content, "hi");
        assert_eq!(turn.tool_calls.len(), 1);
        assert_eq!(turn.tool_calls[0].function.name, "file.read");
        assert_eq!(turn.tool_calls[0].function.arguments, "{\"path\":\"a\"}");
        assert_eq!(turn.usage.as_ref().unwrap()["prompt_tokens"], json!(9));
        assert_eq!(turn.finish_reason.as_deref(), Some("stop"));
    }

    #[test]
    fn stream_events_reach_the_observer_in_order() {
        let mut seen: Vec<String> = Vec::new();
        {
            let mut on_content = |chunk: &str| seen.push(format!("c:{chunk}"));
            let mut on_thinking = |chunk: &str| seen.push(format!("t:{chunk}"));
            let mut sink = StreamSink { on_content: &mut on_content, on_thinking: &mut on_thinking };
            let body = format!(
                "data: {}\n\ndata: {}\n\ndata: {}\n\n",
                json!({ "choices": [{ "delta": { "reasoning_content": "hmm" } }] }),
                json!({ "choices": [{ "delta": { "content": "Hel" } }] }),
                json!({ "choices": [{ "delta": { "content": "lo" } }] })
            );
            let turn = parse_openai_stream(&body, &mut sink);
            assert_eq!(turn.content, "Hello");
            assert_eq!(turn.thinking, "hmm");
        }
        assert_eq!(seen, vec!["t:hmm", "c:Hel", "c:lo"]);
    }

    #[test]
    fn empty_fallback_names_the_tools_that_ran() {
        let executed = vec![ExecutedToolCall {
            call_id: "c1".into(),
            tool: "file.read".into(),
            args: json!({ "path": "a" }),
            ok: false,
            message: "permission denied".into(),
            started_at: 0,
            completed_at: 0,
            retry_count: 0,
        }];
        let text = build_empty_response_fallback(&executed, 2, "test-model");
        assert!(text.contains("test-model"));
        assert!(text.contains("file.read"));
        assert!(text.contains("failed"));
        assert!(build_empty_response_fallback(&[], 1, "m").contains("returned no content"));
    }

    #[test]
    fn structured_summary_and_reinjection_keep_the_task() {
        let messages = vec![
            AgentMessage::user("Refactor the widget subsystem to remove the legacy shim."),
            AgentMessage {
                tool_calls: Some(vec![OpenAiToolCall::new("c1", "file_read", "{\"path\":\"w.rs\"}")]),
                ..AgentMessage::assistant("")
            },
            AgentMessage::tool("c1", "file_read", "{\"ok\":true,\"message\":\"read 12 lines\"}"),
            AgentMessage::tool("c2", "code_grep", "{\"ok\":false,\"message\":\"timeout\"}"),
        ];
        let summary = build_structured_conversation_summary(&messages);
        assert!(summary.starts_with("## Conversation summary"));
        assert!(summary.contains("User task"));
        assert!(summary.contains("w.rs"));
        assert!(summary.contains("FAILURES") || summary.contains("Failures"));

        // A model summary that lost the task gets it re-injected.
        let lossy = "## Work done\n- read w.rs";
        let repaired = reinject_substantive_user_task(lossy, &messages);
        assert!(repaired.contains("## User task"));
        assert!(repaired.contains("Refactor the widget subsystem"));
        // A summary that already has a task is untouched.
        let complete = "## User task\n- refactor widgets";
        assert_eq!(reinject_substantive_user_task(complete, &messages), complete);

        let sections = previous_checkpoint_sections("## User task\n- a\n## Failures\n- b");
        assert_eq!(sections.get("user task").unwrap(), "- a");
        assert_eq!(sections.get("failures").unwrap(), "- b");
    }

    #[test]
    fn checkpoint_budget_scales_with_the_context_window() {
        assert_eq!(checkpoint_output_tokens(128_000), CHECKPOINT_OUTPUT_TOKENS);
        assert_eq!(checkpoint_output_tokens(8_000), 2_048);
        assert!(checkpoint_output_tokens(4_000) >= 1);
        let clamped = clamp_summary(&"x".repeat(100), 10);
        assert!(clamped.contains(CHECKPOINT_TRUNCATION_NOTE));
    }

    #[test]
    fn queue_and_priority_ordering_is_stable() {
        let queue = ToolCallQueue::new();
        queue.push(OpenAiToolCall::new("low", "a", "{}"), ToolCallPriority::Low, 0);
        queue.push(OpenAiToolCall::new("crit", "b", "{}"), ToolCallPriority::Critical, 0);
        queue.push(OpenAiToolCall::new("normal", "c", "{}"), ToolCallPriority::Normal, 0);
        let drained = queue.drain_sorted();
        let ids: Vec<&str> = drained.iter().map(|entry| entry.tool_call.id.as_str()).collect();
        assert_eq!(ids, vec!["crit", "normal", "low"]);
        assert!(queue.is_empty());
    }

    #[test]
    fn tool_schemas_are_sanitised_for_the_provider() {
        reset_name_map();
        let schemas = to_tool_schemas(&[OpenAiToolSchema::new("mcp__x.y", "d", json!({ "type": "object" }))]);
        assert_eq!(schemas[0].function.name, "mcp__x_y");
        assert_eq!(schemas[0].type_, "function");
        // Round trip: the provider name maps back to the registry name.
        assert_eq!(from_openai_name(&schemas[0].function.name), "mcp__x.y");
    }
}
