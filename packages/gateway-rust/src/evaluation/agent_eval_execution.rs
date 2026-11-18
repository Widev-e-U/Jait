//! Evaluation reporting helpers. Execution and gateway cancellation remain the
//! responsibility of the isolated gateway orchestration.
use super::agent_eval::{Outcome, Process, Severity, Verdict};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CheckResult {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

pub fn classify(checks: &[CheckResult], verdict: &Verdict) -> &'static str {
    if checks.iter().any(|check| !check.passed) || verdict.outcome == Outcome::Fail {
        return "fail";
    }
    if verdict.outcome == Outcome::Uncertain
        || verdict.process != Process::Pass
        || verdict
            .findings
            .iter()
            .any(|finding| finding.severity != Severity::Info)
    {
        return "issues";
    }
    "pass"
}

fn js_string(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => ryu_js::Buffer::new()
            .format(n.as_f64().expect("JSON number is finite"))
            .to_owned(),
        Some(Value::Array(a)) => a
            .iter()
            .map(|v| js_string(Some(v)))
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}
fn same_js_primitive(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (None, None) | (Some(Value::Null), Some(Value::Null)) => true,
        (Some(Value::Bool(a)), Some(Value::Bool(b))) => a == b,
        (Some(Value::Number(a)), Some(Value::Number(b))) => a.as_f64() == b.as_f64(),
        (Some(Value::String(a)), Some(Value::String(b))) => a == b,
        _ => false,
    }
}
/// Preserve executed calls and coalesce adjacent output while dropping
/// duplicated streaming fragments from the judge's trace.
pub fn judge_evidence(events: &[Value]) -> (Vec<Value>, BTreeMap<String, usize>) {
    let mut retained: Vec<Value> = Vec::new();
    let mut omitted = BTreeMap::new();
    for event in events {
        let kind = event.get("type").and_then(Value::as_str).unwrap_or("");
        if ["thinking", "token", "tool_call_delta", "context_usage"].contains(&kind) {
            *omitted.entry(kind.to_owned()).or_insert(0) += 1;
            continue;
        }
        if kind == "tool_output"
            && retained.last().is_some_and(|previous| {
                previous.get("type").and_then(Value::as_str) == Some(kind)
                    && same_js_primitive(previous.get("call_id"), event.get("call_id"))
            })
        {
            let previous = retained.last_mut().expect("checked above");
            let content = js_string(previous.get("content")) + &js_string(event.get("content"));
            if let Some(object) = previous.as_object_mut() {
                object.insert("content".into(), Value::String(content));
            }
        } else {
            retained.push(event.clone());
        }
    }
    (retained, omitted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn numeric_output_uses_javascript_number_stringification() {
        let events: Vec<Value> = serde_json::from_str(
            r#"[
            {"type":"tool_output","call_id":"a","content":1.0},
            {"type":"tool_output","call_id":"a","content":1e21},
            {"type":"tool_output","call_id":"a","content":9007199254740993}
        ]"#,
        )
        .unwrap();
        let (retained, _) = judge_evidence(&events);
        assert_eq!(retained[0]["content"], "11e+219007199254740992");
    }
    #[test]
    fn judge_trace_preserves_calls_and_coalesces_output() {
        let (events, omitted) = judge_evidence(&[
            json!({"type":"token"}),
            json!({"type":"tool_output","call_id":"a","content":"one"}),
            json!({"type":"tool_output","call_id":"a","content":"two"}),
            json!({"type":"tool_start","call_id":"b"}),
        ]);
        assert_eq!(omitted["token"], 1);
        assert_eq!(events[0]["content"], "onetwo");
        assert_eq!(events.len(), 2);
    }
}
