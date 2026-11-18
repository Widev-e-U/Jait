//! Provider token accounting. Only validated nonnegative safe-integer counters enter
//! ModelUsage; aggregate arithmetic follows JavaScript Number and insertion order.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    // Last-request counters may omit scope in the shared ModelUsage contract.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_input_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_request: Option<Box<ModelUsage>>,
}
fn count(value: Option<&Value>) -> Option<u64> {
    let number = value?.as_f64()?;
    (number.is_finite()
        && number.fract() == 0.0
        && (0.0..=9_007_199_254_740_991.0).contains(&number))
    .then_some(number as u64)
}
fn field<'a>(value: &'a Value, names: &[&str]) -> Option<&'a Value> {
    names
        .iter()
        .find_map(|key| value.get(key).filter(|v| !v.is_null()))
}
fn counters(value: &Value, scope: &str) -> Option<ModelUsage> {
    let input_tokens = count(field(value, &["inputTokens", "input_tokens"]))?;
    let output_tokens = count(field(value, &["outputTokens", "output_tokens"]))?;
    let cached_input_tokens = count(field(
        value,
        &[
            "cachedInputTokens",
            "cached_input_tokens",
            "cachedReadTokens",
        ],
    ));
    if cached_input_tokens.is_some_and(|n| n > input_tokens) {
        return None;
    }
    Some(ModelUsage {
        input_tokens,
        output_tokens,
        scope: scope.into(),
        cached_input_tokens,
        total_tokens: count(field(value, &["totalTokens", "total_tokens"])),
        request_count: count(value.get("requestCount")),
        id: None,
        last_request: None,
    })
}
pub fn parse_codex_usage(params: &Value) -> Option<ModelUsage> {
    let body = field(params, &["msg"]).unwrap_or(params);
    let usage = field(body, &["tokenUsage", "info"])?;
    let mut total = counters(field(usage, &["total", "total_token_usage"])?, "session")?;
    total.last_request = field(usage, &["last", "last_token_usage"])
        .and_then(|v| counters(v, "turn"))
        .map(Box::new);
    Some(total)
}
pub fn parse_acp_usage(value: &Value, id: &str) -> Option<ModelUsage> {
    let mut usage = counters(value, "turn")?;
    usage.id = Some(id.into());
    Some(usage)
}
// Reductions use f64 rather than u64: safe individual counters can sum above
// JavaScript's safe-integer range. Preserve Number rounding and JSON spelling.
fn number(value: f64) -> Value {
    if !value.is_finite() {
        return Value::Null;
    }
    serde_json::from_str(ryu_js::Buffer::new().format(value)).expect("finite JSON number")
}
fn sum(values: &[ModelUsage], duration: f64) -> Value {
    let input = values.iter().fold(0.0, |n, v| n + v.input_tokens as f64);
    let output = values.iter().fold(0.0, |n, v| n + v.output_tokens as f64);
    let mut result = json!({"durationMs":number(duration), "promptTokens":number(input),
        "completionTokens":number(output), "totalTokens":number(input + output), "tokenUsageEstimated":false});
    for (key, counters) in [
        (
            "cachedPromptTokens",
            values
                .iter()
                .map(|v| v.cached_input_tokens)
                .collect::<Option<Vec<_>>>(),
        ),
        (
            "requestCount",
            values
                .iter()
                .map(|v| v.request_count)
                .collect::<Option<Vec<_>>>(),
        ),
    ] {
        if let Some(counters) = counters {
            result[key] = number(counters.iter().fold(0.0, |n, v| n + *v as f64));
        }
    }
    result
}
#[derive(Default)]
pub struct TurnUsageAccumulator {
    pub baseline: Option<ModelUsage>,
    fresh: bool,
    accumulated: Vec<ModelUsage>,
    // JS Map retains the first insertion position when replacing a turn.
    turns: Vec<(String, ModelUsage)>,
}
impl TurnUsageAccumulator {
    pub fn new(baseline: Option<ModelUsage>, fresh: bool) -> Self {
        Self {
            baseline,
            fresh,
            ..Self::default()
        }
    }
    pub fn add(&mut self, usage: ModelUsage) {
        if usage.scope == "turn" {
            let id = usage.id.clone().unwrap_or_else(|| "turn".into());
            if let Some((_, previous)) = self.turns.iter_mut().find(|(key, _)| *key == id) {
                *previous = usage;
            } else {
                self.turns.push((id, usage));
            }
            return;
        }
        let previous = self.baseline.as_ref();
        if previous.is_some_and(|p| {
            usage.input_tokens < p.input_tokens
                || usage.output_tokens < p.output_tokens
                || (usage.input_tokens == p.input_tokens && usage.output_tokens == p.output_tokens)
        }) {
            return;
        }
        let delta = if let Some(p) = previous {
            let mut d = usage.clone();
            d.input_tokens -= p.input_tokens;
            d.output_tokens -= p.output_tokens;
            d.cached_input_tokens = usage
                .cached_input_tokens
                .zip(p.cached_input_tokens)
                .map(|(a, b)| a.saturating_sub(b));
            d.request_count = usage
                .request_count
                .zip(p.request_count)
                .map(|(a, b)| a.saturating_sub(b));
            Some(d)
        } else if self.fresh {
            Some(usage.clone())
        } else {
            usage.last_request.as_deref().cloned()
        };
        self.baseline = Some(usage);
        if let Some(delta) = delta {
            self.accumulated.push(delta);
        }
    }
    pub fn metrics(&self, duration: u64) -> Option<Value> {
        self.metrics_with_duration(duration as f64)
    }
    /// Duration is a Number in the reference and can contain fractional milliseconds.
    pub fn metrics_with_duration(&self, duration: f64) -> Option<Value> {
        let values = if self.turns.is_empty() {
            self.accumulated.clone()
        } else {
            self.turns.iter().map(|(_, value)| value.clone()).collect()
        };
        (!values.is_empty()).then(|| sum(&values, duration))
    }
}

/// Complete per-round accounting, independent of retained verbose trace rounds.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub duration_ms: f64,
    pub prompt_tokens: Option<f64>,
    pub cached_prompt_tokens: Option<f64>,
    pub completion_tokens: Option<f64>,
    pub total_tokens: Option<f64>,
    pub token_usage_estimated: Option<bool>,
    pub request_count: Option<f64>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UsageRound {
    pub metrics: Option<UsageSummary>,
}

pub fn summarize_usage(rounds: &[UsageRound]) -> Option<Value> {
    let values: Vec<_> = rounds.iter().filter_map(|r| r.metrics.as_ref()).collect();
    if values.is_empty() {
        return None;
    }
    let mut result = json!({
        "durationMs":number(values.iter().fold(0.0, |n, m| n + m.duration_ms)),
        "promptTokens":number(values.iter().fold(0.0, |n, m| n + m.prompt_tokens.unwrap_or(0.0))),
        "completionTokens":number(values.iter().fold(0.0, |n, m| n + m.completion_tokens.unwrap_or(0.0))),
        "totalTokens":number(values.iter().fold(0.0, |n, m| n + m.total_tokens.unwrap_or_else(|| m.prompt_tokens.unwrap_or(0.0) + m.completion_tokens.unwrap_or(0.0)))),
        "tokenUsageEstimated":values.iter().any(|m| m.token_usage_estimated.unwrap_or(false)),
    });
    for (key, counters) in [
        (
            "cachedPromptTokens",
            values
                .iter()
                .map(|v| v.cached_prompt_tokens)
                .collect::<Option<Vec<_>>>(),
        ),
        (
            "requestCount",
            values
                .iter()
                .map(|v| v.request_count)
                .collect::<Option<Vec<_>>>(),
        ),
    ] {
        if let Some(counters) = counters {
            result[key] = number(counters.iter().fold(0.0, |n, v| n + v));
        }
    }
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usage(input: u64, output: u64, scope: &str, id: Option<&str>) -> ModelUsage {
        let mut usage =
            counters(&json!({"inputTokens":input,"outputTokens":output}), scope).unwrap();
        usage.id = id.map(str::to_owned);
        usage
    }
    #[test]
    fn safe_integer_decimals_and_nullish_envelopes() {
        let parsed = parse_codex_usage(&json!({"msg":null,"tokenUsage":null,"info":{
            "total":null,"total_token_usage":{"inputTokens":1.0,"outputTokens":-0.0},
            "last":null,"last_token_usage":{"input_tokens":1,"output_tokens":0}
        }}))
        .unwrap();
        assert_eq!((parsed.input_tokens, parsed.output_tokens), (1, 0));
        assert_eq!(parsed.last_request.unwrap().scope, "turn");
        assert!(parse_acp_usage(&json!({"inputTokens":1.5,"outputTokens":0}), "").is_none());
    }
    #[test]
    fn resumed_unknown_baseline_only_charges_growth() {
        let mut state = TurnUsageAccumulator::new(None, false);
        state.add(usage(100, 10, "session", None));
        assert_eq!(state.metrics(1), None);
        state.add(usage(105, 12, "session", None));
        assert_eq!(state.metrics(1).unwrap()["totalTokens"], 7);
        state.add(usage(105, 12, "session", None));
        state.add(usage(104, 13, "session", None));
        assert_eq!(state.metrics(1).unwrap()["totalTokens"], 7);
        assert_eq!(state.baseline.unwrap().output_tokens, 12);
    }
    #[test]
    fn turn_replacement_keeps_insertion_order_for_number_rounding() {
        let mut state = TurnUsageAccumulator::default();
        state.add(usage(9_007_199_254_740_991, 0, "turn", Some("z")));
        state.add(usage(1, 0, "turn", Some("a")));
        state.add(usage(1, 0, "turn", Some("m")));
        state.add(usage(1, 0, "turn", Some("b")));
        state.add(usage(9_007_199_254_740_991, 1, "turn", Some("z")));
        assert_eq!(
            state.metrics(1).unwrap()["promptTokens"],
            json!(9_007_199_254_740_992_u64)
        );
        assert_eq!(state.baseline, None);
    }
    #[test]
    fn summary_preserves_zero_totals_and_requires_optional_completeness() {
        let rounds = serde_json::from_value::<Vec<UsageRound>>(json!([
            {"metrics":{"durationMs":1.25,"promptTokens":10,"completionTokens":2,"totalTokens":0,"cachedPromptTokens":0,"requestCount":0}},
            {"metrics":{"durationMs":2.5,"promptTokens":3,"completionTokens":4,"tokenUsageEstimated":true}}
        ])).unwrap();
        assert_eq!(
            summarize_usage(&rounds),
            Some(
                json!({"durationMs":3.75,"promptTokens":13,"completionTokens":6,"totalTokens":7,"tokenUsageEstimated":true})
            )
        );
        assert_eq!(summarize_usage(&[]), None);
    }
    #[test]
    fn summary_overflow_serializes_like_json_stringify() {
        let rounds = serde_json::from_value::<Vec<UsageRound>>(json!([
            {"metrics":{"durationMs":1e308,"promptTokens":1e308}},
            {"metrics":{"durationMs":1e308,"promptTokens":1e308}}
        ]))
        .unwrap();
        let summary = summarize_usage(&rounds).unwrap();
        assert_eq!(summary["durationMs"], Value::Null);
        assert_eq!(summary["promptTokens"], Value::Null);
    }
}
