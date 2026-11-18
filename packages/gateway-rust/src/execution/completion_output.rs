//! Command completion text cleanup; watcher scheduling is a separate component.
use crate::{
    contracts::bounded_json::Utf16Text, execution::shell_prompt::is_shell_prompt_line,
    text::js_trim,
};
use regex::Regex;
use std::sync::LazyLock;
pub fn extract_completion_output(raw: &[u16], command: &str, shell: &str) -> Utf16Text {
    // Escape sequences are ASCII; preserve any lone UTF-16 units while matching.
    // Each surrogate unit gets its own private scalar outside the normal text range.
    let text = encode_units(raw);
    static OSC: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\x1b\]633;[A-Z][^\x07]*(?:\x07|\x1b\\)").unwrap());
    static ANSI: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1b\\))").unwrap()
    });
    static SENTINEL: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"__JAIT_BACKGROUND_DONE_[0-9a-f-]+__").unwrap());
    static SOURCED: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^\.[\t\n\x0b\x0c\r \u{00a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]+'[^']*jait-terminal[^']*'$").unwrap()
    });
    let text = OSC.replace_all(&text, "");
    let text = ANSI
        .replace_all(&text, "")
        .replace('\u{7}', "")
        .replace("\r\n", "\n")
        .replace('\r', "");
    let mut lines = text
        .split('\n')
        .filter(|s| !SENTINEL.is_match(s))
        .collect::<Vec<_>>();
    while lines.first().is_some_and(|s| js_trim(s).is_empty()) {
        lines.remove(0);
    }
    let command = encode_units(&command.encode_utf16().collect::<Vec<_>>());
    let head = js_trim(&command)
        .split('\n')
        .next()
        .map(js_trim)
        .unwrap_or("");
    if lines.first().is_some_and(|s| {
        let s = js_trim(s);
        (!head.is_empty() && (s == head || s.ends_with(head))) || SOURCED.is_match(s)
    }) {
        lines.remove(0);
    }
    while lines
        .last()
        .is_some_and(|s| js_trim(s).is_empty() || is_shell_prompt_line(s, shell))
    {
        lines.pop();
    }
    let text = lines.join("\n");
    let mut units = decode_units(js_trim(&text));
    if units.len() > 4000 {
        let tail = units.split_off(units.len() - 4000);
        units = "…(truncated)\n".encode_utf16().chain(tail).collect();
    }
    if units.is_empty() {
        units = "(no output)".encode_utf16().collect();
    }
    Utf16Text(units)
}
fn encode_units(units: &[u16]) -> String {
    // Encoding every UTF-16 unit also escapes the surrogate pairs of literal
    // private-use scalars, so the mapping is reversible for all input.
    units
        .iter()
        .map(|u| {
            char::from_u32(if (0xd800..=0xdfff).contains(u) {
                0xf0000 + u32::from(*u) - 0xd800
            } else {
                u32::from(*u)
            })
            .unwrap()
        })
        .collect()
}
fn decode_units(text: &str) -> Vec<u16> {
    text.chars()
        .map(|c| {
            if (0xf0000..0xf0800).contains(&(c as u32)) {
                (c as u32 - 0xf0000 + 0xd800) as u16
            } else {
                c as u16
            }
        })
        .collect()
}
