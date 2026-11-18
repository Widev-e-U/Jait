//! Intent tags on delegated results; preserves render-segment whitespace.
use crate::text::{js_trim, js_whitespace};
use serde::Serialize;
pub const PERFORMATIVES: &[&str] = &["inform", "propose", "refuse", "failure", "query", "agree"];
#[derive(Debug, Serialize)]
pub struct ParsedPerformative {
    pub performative: &'static str,
    pub content: String,
}
fn tagged(raw: &str) -> Option<(&'static str, &str)> {
    let trimmed = raw.trim_start_matches(js_whitespace);
    let rest = trimmed.strip_prefix('[')?;
    let end = rest.find(']')?;
    let kind = PERFORMATIVES
        .iter()
        .copied()
        .find(|k| rest[..end].eq_ignore_ascii_case(k))?;
    Some((kind, rest[end + 1..].trim_start_matches(js_whitespace)))
}
pub fn parse_performative(raw: &str) -> ParsedPerformative {
    let (performative, content) = tagged(raw).unwrap_or(("inform", raw));
    ParsedPerformative {
        performative,
        content: js_trim(content).into(),
    }
}
pub fn strip_performative_tag(raw: &str) -> &str {
    tagged(raw).map(|(_, s)| s).unwrap_or(raw)
}
pub fn is_successful_performative(kind: &str) -> bool {
    !matches!(kind, "refuse" | "failure" | "query")
}
pub fn describe_performative(kind: &str) -> &'static str {
    match kind {
        "propose" => "Proposed options for a decision",
        "refuse" => "Declined the task",
        "failure" => "Attempted but failed",
        "query" => "Needs clarification",
        "agree" => "Accepted the task",
        _ => "Reported results",
    }
}
