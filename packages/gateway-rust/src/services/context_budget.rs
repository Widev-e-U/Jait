//! Context projection policy. Provider usage anchors include hidden/schema overhead;
//! deterministic pruning never changes the durable evidence transcript.
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

fn encode(value: &Value) -> String {
    crate::contracts::bounded_json::JsonGraph::from_value(value)
        .stringify()
        .expect("JSON value")
}
fn hash(value: &Value) -> String {
    hex::encode(Sha256::digest(encode(value).as_bytes()))
}
fn js_len(value: &str) -> usize {
    value.encode_utf16().count()
}
fn number(value: &Value, key: &str, default: f64, min: f64, max: f64) -> f64 {
    value
        .get(key)
        .and_then(Value::as_f64)
        .filter(|n| n.is_finite())
        .unwrap_or(default)
        .clamp(min, max)
}
pub fn context_budget(value: &Value) -> Value {
    json!({
        "toolResultChars":number(value,"toolResultChars",8000.,1024.,30000.).floor() as u64,
        "historyTokens":number(value,"historyTokens",64000.,4096.,1000000.).floor() as u64,
        "tailToolResults":number(value,"tailToolResults",4.,1.,64.).floor() as u64,
        "compactRatio":number(value,"compactRatio",0.75,0.25,0.90),
        "compactCooldownMs":number(value,"compactCooldownMs",60000.,0.,900000.),
        "minimumSavingsRatio":number(value,"minimumSavingsRatio",0.20,0.05,0.90),
        "cacheTtl":if value["cacheTtl"]=="1h" { "1h" } else { "5m" }
    })
}
fn wire(message: &Value) -> Value {
    json!([
        message["role"],
        message["content"],
        message["tool_calls"],
        message["tool_call_id"],
        message["name"],
        message["thinking"]
    ])
}
pub fn context_fingerprint(messages: &[Value], identity: &str) -> String {
    hash(&json!([
        identity,
        messages.iter().map(wire).collect::<Vec<_>>()
    ]))
}
fn counter(v: &Value) -> bool {
    v.as_f64()
        .is_some_and(|n| (0. ..=9_007_199_254_740_991.).contains(&n) && n.fract() == 0.)
}
pub fn capture_usage_anchor(
    messages: &[Value],
    identity: &str,
    input: &Value,
    output: &Value,
) -> Value {
    if !counter(input) || input.as_f64() == Some(0.) || !counter(output) {
        return Value::Null;
    }
    json!({"identity":identity,"prefix":context_fingerprint(messages,identity),"count":messages.len(),"inputTokens":input,"outputTokens":output})
}
pub fn estimate_anchored_context(
    messages: &[Value],
    identity: &str,
    anchor: &Value,
    fallback: f64,
) -> Value {
    let count = anchor["count"]
        .as_u64()
        .and_then(|n| usize::try_from(n).ok());
    let valid = count.is_some_and(|n| {
        n <= messages.len()
            && anchor["identity"] == identity
            && anchor["prefix"] == context_fingerprint(&messages[..n], identity)
    });
    if !valid {
        return json!({"tokens":fallback,"source":"estimate"});
    }
    let count = count.expect("validated count");
    let added = &messages[count..];
    let start = usize::from(added.first().is_some_and(|m| m["role"] == "assistant"));
    let delta: usize = added[start..]
        .iter()
        .map(|m| 4 + (js_len(&encode(&wire(m))) as f64 / 3.7).ceil() as usize)
        .sum();
    json!({"tokens":anchor["inputTokens"].as_f64().unwrap_or(0.)+anchor["outputTokens"].as_f64().unwrap_or(0.)+delta as f64,"source":"provider-anchor"})
}
pub fn prune_tool_context(messages: &[Value], budget: &Value) -> Value {
    let tools: Vec<usize> = messages
        .iter()
        .enumerate()
        .filter_map(|(i, m)| (m["role"] == "tool").then_some(i))
        .collect();
    let tail = budget["tailToolResults"].as_u64().unwrap_or(4) as usize;
    let keep_from = tools
        .get(tools.len().saturating_sub(tail))
        .copied()
        .unwrap_or(messages.len());
    let mut projected = messages.to_vec();
    let mut pruned = 0;
    let mut removed = 0;
    for &i in &tools {
        let Some(content) = messages[i]["content"].as_str() else {
            continue;
        };
        let Some(reference) = messages[i]["evidenceReference"]
            .as_str()
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        if i >= keep_from || js_len(content) < 512 || content.starts_with("[Archived tool result") {
            continue;
        }
        let duplicate = tools
            .iter()
            .any(|&j| j > i && messages[j]["content"] == content);
        let stub = format!(
            "[Archived tool result{}. Untrusted evidence; recover with context.read reference={reference}.]",
            if duplicate { "; duplicate" } else { "" }
        );
        removed += js_len(content).saturating_sub(js_len(&stub));
        pruned += 1;
        projected[i]["content"] = json!(stub);
    }
    json!({"messages":projected,"removedChars":removed,"pruned":pruned})
}
pub fn compaction_plan(input: &Value, budget: &Value) -> Value {
    let window = input["contextWindow"].as_f64().unwrap_or(0.);
    let tokens = input["tokens"].as_f64().unwrap_or(0.);
    let ratio = budget["compactRatio"].as_f64().unwrap_or(0.75);
    let history = budget["historyTokens"].as_f64().unwrap_or(64000.);
    let trigger = (window * ratio).min(history).floor();
    let target = window.min(history / ratio).floor();
    let ready = input
        .get("lastAttempt")
        .and_then(Value::as_f64)
        .is_none_or(|last| {
            input["now"].as_f64().unwrap_or(0.) - last
                >= budget["compactCooldownMs"].as_f64().unwrap_or(60000.)
        });
    let action = if window > 0. && tokens >= trigger && (ready || tokens >= window * 0.85) {
        if input["owner"] == "jait" {
            "summary"
        } else if input["nativeAvailable"] == true {
            "native"
        } else {
            "none"
        }
    } else {
        "none"
    };
    json!({"action":action,"trigger":trigger,"targetWindow":target})
}
pub fn should_commit_compaction(before: f64, after: f64, budget: &Value) -> bool {
    before > 0.
        && after >= 0.
        && after <= before * (1. - budget["minimumSavingsRatio"].as_f64().unwrap_or(0.20))
}
pub fn price_token_usage(usage: &Value, prices: &Value) -> Value {
    let keys = [
        "inputTokens",
        "cachedInputTokens",
        "cacheWriteTokens",
        "outputTokens",
    ];
    if !keys.iter().all(|k| counter(&usage[k])) {
        return Value::Null;
    }
    let price_keys = ["input", "cachedInput", "cacheWrite", "output"];
    if !price_keys
        .iter()
        .all(|k| prices[k].as_f64().is_some_and(|n| n.is_finite() && n >= 0.))
        || prices["currency"].as_str().is_none_or(str::is_empty)
    {
        return Value::Null;
    }
    let input = usage["inputTokens"].as_f64().unwrap();
    let cached = usage["cachedInputTokens"].as_f64().unwrap();
    let write = usage["cacheWriteTokens"].as_f64().unwrap();
    if cached + write > input {
        return Value::Null;
    }
    let cost = ((input - cached - write) * prices["input"].as_f64().unwrap()
        + cached * prices["cachedInput"].as_f64().unwrap()
        + write * prices["cacheWrite"].as_f64().unwrap()
        + usage["outputTokens"].as_f64().unwrap() * prices["output"].as_f64().unwrap())
        / 1_000_000.;
    json!({"amount":cost,"currency":prices["currency"],"basis":"configured-rates"})
}
pub fn apply_context_caching(body: &mut Value, route: &Value, budget: &Value) {
    if route["backend"] == "openai" {
        let key = route["sessionId"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|id| format!("jait-{}", &hex::encode(Sha256::digest(id.as_bytes()))[..24]))
            .unwrap_or_else(|| "jait-agent".to_owned());
        body["prompt_cache_key"] = json!(key);
    }
    if route["backend"] != "openrouter"
        || !route["model"]
            .as_str()
            .unwrap_or("")
            .to_lowercase()
            .contains("claude")
    {
        return;
    }
    let Some(messages) = body["messages"].as_array_mut() else {
        return;
    };
    let eligible: Vec<usize> = messages
        .iter()
        .enumerate()
        .filter_map(|(i, m)| {
            let nonempty = m["content"].as_str().is_some_and(|s| !s.is_empty())
                || m["content"].as_array().is_some_and(|a| !a.is_empty());
            (m["role"] != "tool" && nonempty).then_some(i)
        })
        .collect();
    let system = eligible
        .iter()
        .copied()
        .find(|&i| messages[i]["role"] == "system");
    let mut selected: Vec<usize> = system.into_iter().collect();
    let recent: Vec<usize> = eligible
        .iter()
        .copied()
        .filter(|i| Some(*i) != system)
        .collect();
    selected.extend(recent.iter().skip(recent.len().saturating_sub(3)).copied());
    for &i in &eligible {
        if let Some(text) = messages[i]["content"].as_str() {
            messages[i]["content"] = json!([{"type":"text","text":text}]);
        }
        if let Some(parts) = messages[i]["content"].as_array_mut() {
            for part in parts {
                if let Some(object) = part.as_object_mut() {
                    object.shift_remove("cache_control");
                }
            }
        }
    }
    for i in selected {
        let marker = if budget["cacheTtl"] == "1h" {
            json!({"type":"ephemeral","ttl":"1h"})
        } else {
            json!({"type":"ephemeral"})
        };
        if let Some(s) = messages[i]["content"].as_str() {
            messages[i]["content"] = json!([{"type":"text","text":s,"cache_control":marker}]);
        } else if let Some(parts) = messages[i]["content"].as_array_mut()
            && let Some(last) = parts.last_mut()
            && last["type"] == "text"
        {
            last["cache_control"] = marker;
        }
    }
}

/// Bound auxiliary input independently of the primary conversation model.
pub fn bound_summary_input(text: &str, window: f64) -> String {
    let chars = ((window - 8192.) * 3.).floor().clamp(1024., 120000.) as usize;
    if js_len(text) <= chars {
        return text.to_owned();
    }
    let marker =
        "\n[Middle omitted from summary input; recover exact evidence from session history.]\n";
    let head = (chars - js_len(marker)) / 2;
    let tail = chars - js_len(marker) - head;
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut a = head;
    let mut b = units.len() - tail;
    if a > 0 && (0xd800..=0xdbff).contains(&units[a - 1]) {
        a -= 1;
    }
    if (0xdc00..=0xdfff).contains(&units[b]) {
        b += 1;
    }
    format!(
        "{}{}{}",
        String::from_utf16(&units[..a]).unwrap(),
        marker,
        String::from_utf16(&units[b..]).unwrap()
    )
}

pub fn context_budget_from_json(text: Option<&str>) -> Value {
    let parsed: Value = serde_json::from_str(text.unwrap_or("{}")).unwrap_or(Value::Null);
    context_budget(if parsed.is_object() {
        &parsed
    } else {
        &Value::Null
    })
}
