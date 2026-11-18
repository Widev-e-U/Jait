//! Rust evaluates the source suite's regular-expression assertion plans.
//! The authoring step parses patterns; the gateway fixture supplies text only.
use serde_json::Value;
use std::collections::HashMap;
fn newline(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}
fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn scalar(value: &Value) -> char {
    let mut chars = value.as_str().expect("pattern character").chars();
    let result = chars.next().expect("nonempty pattern character");
    assert!(
        chars.next().is_none(),
        "pattern character must be one scalar"
    );
    result
}
struct Matcher<'a> {
    text: &'a [char],
    insensitive: bool,
    multiline: bool,
    dot_all: bool,
    memo: HashMap<(u64, usize), Vec<usize>>,
    steps: usize,
}
impl Matcher<'_> {
    fn equal(&self, a: char, b: char) -> bool {
        if self.insensitive {
            a.to_lowercase().to_string() == b.to_lowercase().to_string()
        } else {
            a == b
        }
    }
    fn category(&self, c: char, category: &str) -> bool {
        let matched = match category.to_ascii_lowercase().as_str() {
            "d" => c.is_ascii_digit(),
            "s" => c.is_whitespace() || c == '\u{feff}',
            "w" => word(c),
            other => panic!("unsupported pattern category {other}"),
        };
        if category.as_bytes()[0].is_ascii_uppercase() {
            !matched
        } else {
            matched
        }
    }
    fn positions(&mut self, node: &Value, position: usize) -> Vec<usize> {
        let id = node["id"].as_u64().expect("pattern node id");
        if let Some(value) = self.memo.get(&(id, position)) {
            return value.clone();
        }
        self.steps += 1;
        assert!(self.steps <= 4_000_000, "regex assertion complexity limit");
        let mut result = match node["kind"].as_str().expect("pattern node kind") {
            "char" => {
                if position < self.text.len()
                    && self.equal(self.text[position], scalar(&node["value"]))
                {
                    vec![position + 1]
                } else {
                    vec![]
                }
            }
            "any" => {
                if position < self.text.len() && (self.dot_all || !newline(self.text[position])) {
                    vec![position + 1]
                } else {
                    vec![]
                }
            }
            "start" => {
                if position == 0
                    || (self.multiline && position > 0 && newline(self.text[position - 1]))
                {
                    vec![position]
                } else {
                    vec![]
                }
            }
            "end" => {
                // ECMAScript end anchor: without the multiline flag it matches
                // only at the very end of input (it does NOT match before a
                // trailing newline). With multiline it also matches immediately
                // before any LineTerminator.
                let len = self.text.len();
                let at_end = position == len;
                let before_line_terminator =
                    self.multiline && position < len && newline(self.text[position]);
                if at_end || before_line_terminator {
                    vec![position]
                } else {
                    vec![]
                }
            }
            kind @ ("boundary" | "nonboundary") => {
                let before = position > 0 && word(self.text[position - 1]);
                let after = position < self.text.len() && word(self.text[position]);
                if (before != after) == (kind == "boundary") {
                    vec![position]
                } else {
                    vec![]
                }
            }
            "class" => {
                if position == self.text.len() {
                    vec![]
                } else {
                    let actual = self.text[position];
                    let contains =
                        node["items"]
                            .as_array()
                            .expect("class items")
                            .iter()
                            .any(|item| {
                                if let Some(category) = item["category"].as_str() {
                                    return self.category(actual, category);
                                }
                                let low = scalar(&item["low"]);
                                let high = scalar(&item["high"]);
                                if self.insensitive && low.is_ascii() && high.is_ascii() {
                                    let actual = actual.to_ascii_lowercase();
                                    let low = low.to_ascii_lowercase();
                                    let high = high.to_ascii_lowercase();
                                    actual >= low && actual <= high
                                } else {
                                    actual >= low && actual <= high
                                }
                            });
                    if contains != (node["negate"] == true) {
                        vec![position + 1]
                    } else {
                        vec![]
                    }
                }
            }
            "seq" => {
                let mut positions = vec![position];
                for child in node["nodes"].as_array().expect("sequence nodes") {
                    let mut next = Vec::new();
                    for &start in &positions {
                        next.extend(self.positions(child, start));
                    }
                    next.sort_unstable();
                    next.dedup();
                    positions = next;
                    if positions.is_empty() {
                        break;
                    }
                }
                positions
            }
            "alt" => {
                let mut positions = Vec::new();
                for child in node["nodes"].as_array().expect("alternative nodes") {
                    positions.extend(self.positions(child, position));
                }
                positions
            }
            "repeat" => {
                let min = node["min"].as_u64().expect("repeat minimum") as usize;
                let max = node["max"]
                    .as_u64()
                    .map(|n| n as usize)
                    .unwrap_or(self.text.len() + min + 1);
                let mut accepted = if min == 0 { vec![position] } else { vec![] };
                let mut frontier = vec![position];
                for count in 1..=max {
                    let mut next = Vec::new();
                    for &start in &frontier {
                        next.extend(self.positions(&node["node"], start));
                    }
                    next.sort_unstable();
                    next.dedup();
                    if next.is_empty() {
                        break;
                    }
                    if count >= min {
                        accepted.extend_from_slice(&next);
                    }
                    if next == frontier && count >= min {
                        break;
                    }
                    frontier = next;
                }
                accepted
            }
            kind => panic!("unsupported regex assertion node: {kind}"),
        };
        result.sort_unstable();
        result.dedup();
        self.memo.insert((id, position), result.clone());
        result
    }
}
pub fn is_match(text: &str, plan: &Value) -> bool {
    let text: Vec<char> = text.chars().collect();
    let flags = plan["flags"].as_str().expect("pattern flags");
    let mut matcher = Matcher {
        text: &text,
        insensitive: flags.contains('i'),
        multiline: flags.contains('m'),
        dot_all: flags.contains('s'),
        memo: HashMap::new(),
        steps: 0,
    };
    if flags.contains('y') {
        return !matcher.positions(&plan["expr"], 0).is_empty();
    }
    (0..=text.len()).any(|position| !matcher.positions(&plan["expr"], position).is_empty())
}

#[cfg(test)]
mod tests {
    use super::is_match;
    use serde_json::{Value, json};

    // Construct assertion plans directly so these regressions exercise Rust,
    // independently of the JavaScript pattern parser and gateway fixtures.
    fn sequence(flags: &str, mut nodes: Vec<Value>) -> Value {
        for (index, node) in nodes.iter_mut().enumerate() {
            node["id"] = json!(index + 1);
        }
        json!({"flags": flags, "expr": {"id": 0, "kind": "seq", "nodes": nodes}})
    }

    fn literal(c: char) -> Value {
        json!({"kind": "char", "value": c.to_string()})
    }

    #[test]
    fn dollar_without_multiline_requires_absolute_end() {
        for flags in ["", "i", "s", "g", "y", "u"] {
            let plan = sequence(flags, vec![literal('x'), json!({"kind": "end"})]);
            assert!(is_match("x", &plan), "flags={flags:?}");
            assert!(!is_match("", &plan), "flags={flags:?}");
            for suffix in ["\n", "\r", "\r\n", "\u{2028}", "\u{2029}", "\n\n", "z"] {
                let text = format!("x{suffix}");
                assert!(!is_match(&text, &plan), "text={text:?}, flags={flags:?}");
            }
        }
        let plan = sequence("", vec![literal('x'), json!({"kind": "end"})]);
        assert!(is_match("prefix x", &plan));
        assert!(is_match("\nx", &plan));
    }

    #[test]
    fn dollar_is_zero_width_at_end_including_empty_input() {
        for flags in ["", "m"] {
            let end = sequence(flags, vec![json!({"kind": "end"})]);
            let empty_line = sequence(
                flags,
                vec![json!({"kind": "start"}), json!({"kind": "end"})],
            );
            for text in ["", "x", "\r\n", "\u{2028}", "\u{2029}"] {
                assert!(is_match(text, &end), "text={text:?}, flags={flags:?}");
            }
            assert!(is_match("", &empty_line));
            assert!(!is_match("x", &empty_line));
            assert_eq!(is_match("\n", &empty_line), flags == "m");
        }
    }

    #[test]
    fn multiline_anchors_recognize_all_ecmascript_line_terminators() {
        let plan = sequence(
            "m",
            vec![
                json!({"kind": "start"}),
                literal('x'),
                json!({"kind": "end"}),
            ],
        );
        assert!(is_match("x", &plan));
        // Check every pairing, including CRLF, and both outer input boundaries.
        for before in ["\r", "\n", "\u{2028}", "\u{2029}", "\r\n"] {
            assert!(is_match(&format!("a{before}x"), &plan));
            assert!(is_match(&format!("x{before}b"), &plan));
            for after in ["\r", "\n", "\u{2028}", "\u{2029}", "\r\n"] {
                let text = format!("a{before}x{after}b");
                assert!(is_match(&text, &plan), "text={text:?}");
            }
        }
        // Whitespace outside the ECMAScript LineTerminator set is no boundary.
        for separator in [' ', '\t', '\u{000b}', '\u{000c}', '\u{0085}'] {
            assert!(!is_match(&format!("a{separator}x"), &plan));
            assert!(!is_match(&format!("x{separator}b"), &plan));
        }
    }

    #[test]
    fn multiline_dollar_precedes_terminator_without_consuming_it() {
        for terminator in ['\r', '\n', '\u{2028}', '\u{2029}'] {
            for flags in ["", "m"] {
                let plan = sequence(
                    flags,
                    vec![literal('x'), json!({"kind": "end"}), literal(terminator)],
                );
                let text = format!("x{terminator}rest");
                assert_eq!(
                    is_match(&text, &plan),
                    flags == "m",
                    "text={text:?}, flags={flags:?}"
                );
            }
        }
    }

    #[test]
    fn multiline_crlf_has_anchor_positions_between_cr_and_lf() {
        // ECMAScript treats CR and LF as separate terminators for assertions.
        // /^\n$/m matches the LF in CRLF; /^\r$/m matches the CR.
        for c in ['\r', '\n'] {
            let plan = sequence(
                "m",
                vec![json!({"kind": "start"}), literal(c), json!({"kind": "end"})],
            );
            assert!(is_match("\r\n", &plan), "character={c:?}");
            assert!(!is_match("a\r\nb", &plan), "character={c:?}");
        }
        let before_lf = sequence("m", vec![literal('\r'), json!({"kind": "end"})]);
        let after_cr = sequence("m", vec![json!({"kind": "start"}), literal('\n')]);
        assert!(is_match("a\r\nb", &before_lf));
        assert!(is_match("a\r\nb", &after_cr));
        let empty_line = sequence("m", vec![json!({"kind": "start"}), json!({"kind": "end"})]);
        assert!(is_match("a\r\nb", &empty_line));
        assert!(!is_match("a\nb", &empty_line));
        assert!(!is_match("a\rb", &empty_line));
    }
}
