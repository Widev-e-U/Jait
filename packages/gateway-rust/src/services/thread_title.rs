//! Title cleanup and generation policy. Callers supply authorized provider, HTTP,
//! and shared LLM ports; this module discovers no credentials or endpoints.
use crate::{
    contracts::bounded_json::Utf16Text,
    text::{js_trim, js_whitespace},
};
pub fn normalize_generated_thread_title(raw: &str, fallback: &str) -> Utf16Text {
    let lines = raw.replace('\r', "\n");
    let mut title = lines
        .split('\n')
        .map(js_trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");
    if title.len() >= 5
        && title
            .get(..5)
            .is_some_and(|v| v.eq_ignore_ascii_case("title"))
    {
        let rest = title[5..].trim_start_matches(js_whitespace);
        if let Some(rest) = rest.strip_prefix(':') {
            title = rest.trim_start_matches(js_whitespace);
        }
    }
    if let Some(rest) = title.strip_prefix(['-', '*', '•']) {
        if rest.chars().next().is_some_and(js_whitespace) {
            title = rest.trim_start_matches(js_whitespace);
        }
    } else {
        let digits = title.bytes().take_while(u8::is_ascii_digit).count();
        if digits > 0
            && title
                .get(digits..)
                .is_some_and(|s| s.starts_with(['.', ')']))
        {
            let rest = &title[digits + 1..];
            if rest.chars().next().is_some_and(js_whitespace) {
                title = rest.trim_start_matches(js_whitespace);
            }
        }
    }
    title = title.trim_matches(['"', '\'', '`']);
    let mut normalized = String::new();
    let mut whitespace = false;
    for ch in title.chars() {
        if js_whitespace(ch) {
            whitespace = true;
        } else {
            if whitespace && !normalized.is_empty() {
                normalized.push(' ');
            }
            normalized.push(ch);
            whitespace = false;
        }
    }
    let title = normalized
        .trim_end_matches(|ch| matches!(ch, '.' | ':' | ';' | '-' | '–') || js_whitespace(ch));
    if title.is_empty() || is_tool_protocol(title) {
        return Utf16Text(fallback.encode_utf16().collect());
    }
    let mut units = title.encode_utf16().collect::<Vec<_>>();
    if units.len() > 80 {
        units.truncate(81);
        let last = units.iter().rposition(|u| *u == 32);
        units.truncate(last.filter(|v| *v >= 24).unwrap_or(80));
        while units.last() == Some(&32) {
            units.pop();
        }
    }
    Utf16Text(units)
}

// Mirrors the reference's non-Unicode /i protocol-prefix guard after cleanup.
fn is_tool_protocol(title: &str) -> bool {
    if let Some(rest) = title.strip_prefix('<') {
        let rest = rest
            .strip_prefix('/')
            .or_else(|| rest.strip_prefix('|'))
            .unwrap_or(rest);
        for name in [
            "tool_call",
            "tool_calls",
            "function_call",
            "function_calls",
            "tool_use",
        ] {
            if rest
                .get(..name.len())
                .is_some_and(|prefix| prefix.eq_ignore_ascii_case(name))
            {
                let suffix = &rest[name.len()..];
                if suffix.is_empty()
                    || suffix
                        .chars()
                        .next()
                        .is_some_and(|ch| js_whitespace(ch) || matches!(ch, '/' | '>' | '|'))
                {
                    return true;
                }
            }
        }
    }
    ["[TOOL_CALL]", "[TOOL_CALLS]"].iter().any(|marker| {
        title
            .get(..marker.len())
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(marker))
    })
}

#[path = "thread_title_generation.rs"]
mod generation;
pub use generation::*;
