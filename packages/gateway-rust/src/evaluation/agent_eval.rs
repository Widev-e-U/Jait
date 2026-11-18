//! Pure validation and stream parsing for agent evaluation. Execution authority
//! and lifecycle are deliberately provided by the evaluation gateway, not here.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Suite {
    pub version: u64,
    pub tasks: Vec<Task>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub fixtures: std::collections::BTreeMap<String, String>,
    pub checks: Vec<Check>,
    pub rubric: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum Check {
    File {
        path: String,
        equals: String,
    },
    Json {
        path: String,
        equals: Value,
    },
    Command {
        executable: String,
        args: Vec<String>,
        #[serde(
            rename = "timeoutSeconds",
            default = "default_timeout",
            deserialize_with = "deserialize_timeout"
        )]
        timeout_seconds: u64,
    },
}
fn default_timeout() -> u64 {
    30
}
fn deserialize_timeout<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let value = Value::deserialize(d)?;
    let number = value
        .as_f64()
        .ok_or_else(|| serde::de::Error::custom("timeout must be a number"))?;
    if !number.is_finite() || number.fract() != 0.0 || !(1.0..=120.0).contains(&number) {
        return Err(serde::de::Error::custom(
            "timeout must be an integer from 1 to 120",
        ));
    }
    Ok(number as u64)
}
fn relative_path(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && !(path.len() >= 2
            && path.as_bytes()[0].is_ascii_alphabetic()
            && path.as_bytes()[1] == b':')
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}
pub fn parse_suite(mut value: Value) -> Result<Suite, String> {
    // JavaScript treats 1.0 and 1 as the same number. Also require the
    // unconstrained `equals` property to be present even when it is null.
    if value.get("version").and_then(Value::as_f64) != Some(1.0) {
        return Err("invalid suite version".into());
    }
    if let Some(tasks) = value.get("tasks").and_then(Value::as_array) {
        for task in tasks {
            if let Some(checks) = task.get("checks").and_then(Value::as_array) {
                for check in checks {
                    if check.get("type").and_then(Value::as_str) == Some("json")
                        && check.get("equals").is_none()
                    {
                        return Err("missing json equals".into());
                    }
                }
            }
        }
    }
    value["version"] = Value::from(1);
    let suite: Suite = serde_json::from_value(value).map_err(|e| e.to_string())?;
    if suite.version != 1 || suite.tasks.is_empty() {
        return Err("invalid suite version or empty tasks".into());
    }
    let mut ids = HashSet::new();
    for task in &suite.tasks {
        let id = task.id.as_bytes();
        if id.is_empty()
            || id.len() > 64
            || !id[0].is_ascii_lowercase() && !id[0].is_ascii_digit()
            || !id
                .iter()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
        {
            return Err("invalid task id".into());
        }
        if !ids.insert(&task.id) {
            return Err(format!("Duplicate task id: {}", task.id));
        }
        if task.title.is_empty()
            || task.prompt.is_empty()
            || task.checks.is_empty()
            || task.rubric.is_empty()
            || task.rubric.iter().any(String::is_empty)
            || task.fixtures.keys().any(|path| !relative_path(path))
        {
            return Err("invalid task".into());
        }
        for check in &task.checks {
            match check {
                Check::File { path, .. } | Check::Json { path, .. } if !relative_path(path) => {
                    return Err("invalid check path".into());
                }
                Check::Command { executable, .. } if executable.is_empty() => {
                    return Err("empty executable".into());
                }
                _ => {}
            }
        }
    }
    Ok(suite)
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Verdict {
    pub outcome: Outcome,
    pub process: Process,
    pub summary: String,
    pub findings: Vec<Finding>,
}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Pass,
    Fail,
    Uncertain,
}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Process {
    Pass,
    Issues,
    Uncertain,
}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Finding {
    pub severity: Severity,
    pub category: Category,
    pub message: String,
    #[serde(rename = "callIds")]
    pub call_ids: Vec<String>,
}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
    Error,
}
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    ToolFailure,
    Workaround,
    Instruction,
    Verification,
    Harness,
    Other,
}
fn js_space(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}
pub fn parse_verdict(content: &str) -> Result<Verdict, String> {
    let mut cleaned = content.trim_matches(js_space);
    if let Some(rest) = cleaned.strip_prefix("```") {
        cleaned = rest;
        if cleaned
            .get(..4)
            .is_some_and(|s| s.eq_ignore_ascii_case("json"))
        {
            cleaned = &cleaned[4..];
        }
        cleaned = cleaned.trim_start_matches(js_space);
    }
    if let Some(rest) = cleaned.strip_suffix("```") {
        cleaned = rest.trim_end_matches(js_space);
    }
    let verdict: Verdict = serde_json::from_str(cleaned).map_err(|e| e.to_string())?;
    if verdict.summary.is_empty() || verdict.findings.iter().any(|f| f.message.is_empty()) {
        return Err("empty verdict text".into());
    }
    Ok(verdict)
}

#[derive(Debug, Default)]
pub struct EventParser {
    buffer: String,
}
impl EventParser {
    pub fn push(&mut self, text: &str, final_chunk: bool) -> Result<Vec<Value>, String> {
        self.buffer.push_str(text);
        let mut lines: Vec<String> = self.buffer.split('\n').map(str::to_owned).collect();
        self.buffer = if final_chunk {
            String::new()
        } else {
            lines.pop().unwrap_or_default()
        };
        let mut events = Vec::new();
        for raw in lines {
            let line = raw.trim_end_matches(js_space);
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim_matches(js_space);
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            let event: Value = serde_json::from_str(data).map_err(|e| e.to_string())?;
            if !event
                .as_object()
                .and_then(|o| o.get("type"))
                .is_some_and(Value::is_string)
            {
                return Err("Malformed Jait stream event".into());
            }
            events.push(event);
        }
        Ok(events)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn suite_checks_paths_defaults_and_strictness() {
        let mut suite = json!({"version":1,"tasks":[{"id":"test-1","title":"x","prompt":"x","fixtures":{"a/b":"x"},"checks":[{"type":"command","executable":"x","args":[]}],"rubric":["x"]}]});
        let parsed = parse_suite(suite.clone()).unwrap();
        assert!(matches!(
            parsed.tasks[0].checks[0],
            Check::Command {
                timeout_seconds: 30,
                ..
            }
        ));
        suite["tasks"][0]["fixtures"] = json!({"../x":"x"});
        assert!(parse_suite(suite.clone()).is_err());
        suite["tasks"][0]["fixtures"] = json!({});
        suite["tasks"][0]["checks"][0]["timeoutSeconds"] = json!(1.0);
        assert!(parse_suite(suite.clone()).is_ok());
        suite["tasks"][0]["checks"][0]["extra"] = json!(true);
        assert!(parse_suite(suite).is_err());
    }
    #[test]
    fn stream_chunks_and_verdict_fences() {
        let mut parser = EventParser::default();
        assert!(parser.push("data: {\"ty", false).unwrap().is_empty());
        assert_eq!(
            parser
                .push("pe\":\"delta\"}\r\ndata: [DONE]\n", false)
                .unwrap(),
            vec![json!({"type":"delta"})]
        );
        assert!(parser.push("data: {}", true).is_err());
        assert!(parse_verdict("```JSON\n{\"outcome\":\"pass\",\"process\":\"pass\",\"summary\":\"ok\",\"findings\":[]}\n```").is_ok());
    }
}
