//! Bounded native gitignore/glob compiler. Deliberately separate from the permission
//! helper: permission globs use JS RegExp and do not implement gitignore negations.
use super::{Error, Result};
use regex::{Regex, RegexBuilder};

#[derive(Clone, Debug)]
pub(crate) struct Rule {
    pub negated: bool,
    directory: bool,
    regex: Regex,
}
#[derive(Clone, Debug)]
pub(crate) struct IgnoreScope {
    pub base: String,
    pub higher_priority: bool,
    pub rules: Vec<Rule>,
}

pub(crate) fn glob(pattern: &str, unanchored: bool, descendants: bool) -> Result<Regex> {
    compile_glob(pattern, unanchored, descendants, false)
}

// In non-Unicode JavaScript RegExp classes, a shorthand adjacent to a
// hyphen makes that hyphen literal rather than a range operator.
fn escape_legacy_shorthand_hyphens(class: &str) -> String {
    let mut escaped = false;
    let chars: Vec<_> = class
        .chars()
        .map(|ch| {
            let was_escaped = escaped;
            escaped = !was_escaped && ch == '\\';
            (ch, was_escaped)
        })
        .collect();
    let is_shorthand = |ch| matches!(ch, 'd' | 'D' | 'w' | 'W' | 's' | 'S');
    let mut result = String::new();
    for (index, &(ch, was_escaped)) in chars.iter().enumerate() {
        let previous = index >= 2
            && chars[index - 2] == ('\\', false)
            && chars[index - 1].1
            && is_shorthand(chars[index - 1].0);
        let next = index + 2 < chars.len()
            && chars[index + 1] == ('\\', false)
            && chars[index + 2].1
            && is_shorthand(chars[index + 2].0);
        if ch == '-' && !was_escaped && (previous || next) {
            result.push('\\');
        }
        result.push(ch);
    }
    result
}

fn compile_glob(
    pattern: &str,
    unanchored: bool,
    descendants: bool,
    ignore_rule: bool,
) -> Result<Regex> {
    if pattern.len() > 4096 {
        return Err(Error::Input("glob exceeds 4096 bytes".into()));
    }
    let mut source = String::from("^");
    // JavaScript RegExp dot excludes line terminators, including Unicode
    // separators that can occur in otherwise valid Unix filenames.
    let dot = if ignore_rule {
        "[^\\n\\r\\x{2028}\\x{2029}]"
    } else {
        "."
    };
    if unanchored {
        source.push_str(&format!("(?:{dot}*/)?"));
    }
    let mut chars = pattern.chars().peekable();
    let mut no_remaining_closing_bracket = false;
    while let Some(c) = chars.next() {
        match c {
            '*' if chars.peek() == Some(&'*') => {
                chars.next();
                if chars.peek() == Some(&'/') {
                    chars.next();
                    source.push_str(&format!("(?:{dot}*/)?"));
                } else {
                    source.push_str(&format!("{dot}*"));
                }
            }
            '*' => source.push_str("[^/]*"),
            '?' => source.push_str("[^/]"),
            '\\' => {
                if let Some(c) = chars.next() {
                    source.push_str(&regex::escape(&c.to_string()));
                } else if ignore_rule {
                    // The reference fallback treats an unmatched final backslash
                    // as a literal, rather than removing it from the pattern.
                    source.push_str(&regex::escape("\\"));
                }
            }
            '[' => {
                if ignore_rule {
                    if !no_remaining_closing_bracket {
                        no_remaining_closing_bracket = !chars.clone().any(|next| next == ']');
                    }
                    if no_remaining_closing_bracket {
                        // The fallback escapes only the opening bracket; subsequent
                        // characters still participate in glob compilation. Cache the
                        // absent closing bracket to avoid rescanning the suffix.
                        source.push_str("\\[");
                        continue;
                    }
                }
                let mut class = String::new();
                let mut closed = false;
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next == ']' {
                        closed = true;
                        break;
                    }
                    class.push(next);
                }
                if !closed {
                    source.push_str(&regex::escape(&format!("[{class}")));
                } else if ignore_rule && (class == "!" || class == "^") {
                    // JavaScript's [^] matches any character, including newlines.
                    source.push_str("[\\s\\S]");
                } else if class.is_empty() {
                    if ignore_rule {
                        // JavaScript's empty character class never matches.
                        source.push_str("\\b\\B");
                    } else {
                        source.push_str("\\[\\]");
                    }
                } else {
                    source.push('[');
                    if class.starts_with('!') {
                        source.push('^');
                        class.remove(0);
                    }
                    if ignore_rule {
                        // JavaScript treats & and ~ as literals in a character
                        // class; Rust regex otherwise interprets && and ~~ as
                        // intersection and symmetric difference operators.
                        let class = escape_legacy_shorthand_hyphens(&class);
                        let mut escaped = false;
                        for ch in class.chars() {
                            if escaped {
                                // These are identity escapes in non-Unicode JS
                                // RegExp classes; Rust gives some different meanings
                                // or rejects them. Other
                                // JS-specific escapes (such as control, octal and
                                // legacy identity escapes) still need translation.
                                if matches!(ch, 'a' | 'e' | 'q' | 'Q' | 'z' | 'Z') {
                                    source.pop(); // remove the escape backslash
                                    source.push(ch);
                                } else if matches!(ch, 'b' | 'f' | 'v') {
                                    // In a JS class these are backspace, form feed,
                                    // and vertical tab, respectively. Use scalar
                                    // escapes so they also work as range endpoints.
                                    source.pop();
                                    source.push_str(match ch {
                                        'b' => r"\x{8}",
                                        'f' => r"\x{c}",
                                        'v' => r"\x{b}",
                                        _ => unreachable!(),
                                    });
                                } else if matches!(ch, 'd' | 'D' | 'w' | 'W' | 's' | 'S') {
                                    // JS uses ASCII digit/word classes and its own
                                    // whitespace set, unlike Rust's Unicode defaults.
                                    source.pop();
                                    source.push_str(match ch {
                                        'd' => "[0-9]",
                                        'D' => "[^0-9]",
                                        'w' => "[A-Za-z0-9_]",
                                        'W' => "[^A-Za-z0-9_]",
                                        's' => r"[\x{9}-\x{d}\x{20}\x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]",
                                        'S' => r"[^\x{9}-\x{d}\x{20}\x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]",
                                        _ => unreachable!(),
                                    });
                                } else {
                                    source.push(ch);
                                }
                                escaped = false;
                            } else if ch == '\\' {
                                source.push(ch);
                                escaped = true;
                            } else if ch == '&' || ch == '~' {
                                source.push('\\');
                                source.push(ch);
                            } else {
                                source.push(ch);
                            }
                        }
                    } else {
                        source.push_str(&class);
                    }
                    source.push(']');
                }
            }
            c => source.push_str(&regex::escape(&c.to_string())),
        }
    }
    if descendants {
        source.push_str(&format!("(?:/{dot}*)?"));
    }
    source.push('$');
    RegexBuilder::new(&source)
        .size_limit(32 * 1024)
        .dfa_size_limit(32 * 1024)
        .build()
        .map_err(|_| Error::Input("invalid or excessive glob".into()))
}
// ECMAScript's `\s` differs from Rust's Unicode whitespace classification:
// it includes BOM (U+FEFF) and excludes NEXT LINE (U+0085).
fn js_whitespace(ch: char) -> bool {
    matches!(ch, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}'
        | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
        | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

pub(crate) fn parse(content: &str) -> (Vec<Rule>, bool) {
    let mut rules = Vec::new();
    let mut limited = false;
    // JavaScript splits on /\r?\n/: a final bare CR remains part of the
    // line, which matters when it is escaped. `str::lines` removes that CR.
    let mut lines = content.split('\n').peekable();
    while let Some(raw_line) = lines.next() {
        let line = if lines.peek().is_some() {
            raw_line.strip_suffix('\r').unwrap_or(raw_line)
        } else {
            raw_line
        };
        // Preserve escaped trailing whitespace, as the fallback ignore parser and
        // gitignore do. Removing it changes which path the rule excludes.
        let mut end = line.len();
        while let Some((offset, ch)) = line[..end].char_indices().next_back() {
            if !js_whitespace(ch) || line[..offset].ends_with('\\') {
                break;
            }
            end = offset;
        }
        let mut pattern = &line[..end];
        if pattern.is_empty() || pattern.starts_with('#') {
            continue;
        }
        let negated = pattern.starts_with('!');
        if negated {
            pattern = &pattern[1..];
        }
        let directory = pattern.ends_with('/');
        if directory {
            pattern = &pattern[..pattern.len() - 1];
        }
        if pattern.is_empty() {
            continue;
        }
        if rules.len() >= 128 {
            limited = true;
            break;
        }
        let anchored = pattern.contains('/');
        pattern = pattern.strip_prefix('/').unwrap_or(pattern);
        match compile_glob(pattern, !anchored, true, true) {
            Ok(regex) => rules.push(Rule {
                negated,
                directory,
                regex,
            }),
            Err(_) => {
                limited = true;
            }
        }
    }
    (rules, limited)
}
pub(crate) fn ignored(scopes: &[IgnoreScope], path: &str, directory: bool) -> bool {
    let mut ignored = false;
    for scope in scopes
        .iter()
        .filter(|s| !s.higher_priority)
        .chain(scopes.iter().filter(|s| s.higher_priority))
    {
        let local = if scope.base.is_empty() {
            path
        } else {
            let Some(local) = path
                .strip_prefix(&scope.base)
                .and_then(|p| p.strip_prefix('/'))
            else {
                continue;
            };
            local
        };
        for rule in &scope.rules {
            if (!rule.directory || directory) && rule.regex.is_match(local) {
                ignored = !rule.negated;
            }
        }
    }
    ignored
}
/// Shared hard exclusions for search and watching, regardless of ignore overrides.
pub(crate) fn hard_excluded(path: &str) -> bool {
    path.split('/')
        .any(|p| matches!(p, ".git" | ".jait" | ".ssh" | ".gnupg" | ".aws" | ".azure"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignore_trailing_whitespace_matches_javascript() {
        let (rules, limited) = parse("secret.txt\u{feff}\nname\u{85}\n");
        assert!(!limited);
        let scopes = [IgnoreScope {
            base: String::new(),
            higher_priority: false,
            rules,
        }];
        assert!(ignored(&scopes, "secret.txt", false));
        assert!(!ignored(&scopes, "name", false));
        assert!(ignored(&scopes, "name\u{85}", false));
    }
}

#[cfg(test)]
mod character_class_tests {
    use super::*;

    #[test]
    fn ignore_character_classes_treat_javascript_literals_as_literals() {
        let (rules, limited) = parse("secret[ab&&bc].txt\nsecret[ab~~bc].log\n");
        assert!(!limited);
        let scopes = [IgnoreScope {
            base: String::new(),
            higher_priority: false,
            rules,
        }];
        for ch in ['a', 'b', 'c', '&'] {
            assert!(ignored(&scopes, &format!("secret{ch}.txt"), false));
        }
        for ch in ['a', 'b', 'c', '~'] {
            assert!(ignored(&scopes, &format!("secret{ch}.log"), false));
        }
        assert!(!ignored(&scopes, "secretz.txt", false));
    }
}

#[cfg(test)]
mod line_splitting_tests {
    use super::*;

    #[test]
    fn bare_escaped_carriage_return_at_eof_remains_in_pattern() {
        let (rules, limited) = parse("first\r\nname\\\r");
        assert!(!limited);
        let scopes = [IgnoreScope {
            base: String::new(),
            higher_priority: false,
            rules,
        }];
        assert!(ignored(&scopes, "first", false));
        assert!(ignored(&scopes, "name\r", false));
        assert!(!ignored(&scopes, "name", false));
    }
}

#[cfg(test)]
mod identity_escape_tests {
    use super::*;

    #[test]
    fn javascript_identity_escapes_in_ignore_classes() {
        let (rules, limited) = parse("secret[\\q\\Q\\z\\Z].txt\n");
        assert!(!limited);
        let scopes = [IgnoreScope {
            base: String::new(),
            higher_priority: false,
            rules,
        }];
        for ch in ['q', 'Q', 'z', 'Z'] {
            assert!(ignored(&scopes, &format!("secret{ch}.txt"), false));
        }
        assert!(!ignored(&scopes, "secretx.txt", false));
        let (rules, limited) = parse("secret[\\q-a].txt\n");
        assert!(limited);
        assert!(rules.is_empty());
    }
}

#[cfg(test)]
mod shorthand_class_tests {
    use super::*;

    #[test]
    fn javascript_class_digit_and_word_shorthands_are_ascii() {
        for (escape, yes, no) in [
            ("d", "5", "٥"),
            ("D", "٥", "5"),
            ("w", "a", "é"),
            ("W", "é", "a"),
        ] {
            let (rules, limited) = parse(&format!("file[\\{escape}].txt\n"));
            assert!(!limited, "{escape}");
            let scopes = [IgnoreScope {
                base: String::new(),
                higher_priority: false,
                rules,
            }];
            assert!(
                ignored(&scopes, &format!("file{yes}.txt"), false),
                "{escape}"
            );
            assert!(
                !ignored(&scopes, &format!("file{no}.txt"), false),
                "{escape}"
            );
        }
        let (rules, limited) = parse("file[a-z\\d].txt\n");
        assert!(!limited);
        let scopes = [IgnoreScope {
            base: String::new(),
            higher_priority: false,
            rules,
        }];
        assert!(ignored(&scopes, "filea.txt", false));
        assert!(ignored(&scopes, "file5.txt", false));
        for pattern in [
            "file[a-\\d].txt",
            "file[\\d-a].txt",
            "file[a-\\d-z].txt",
            "file[\\d-\\w].txt",
        ] {
            let (rules, limited) = parse(pattern);
            assert!(!limited, "{pattern}");
            let scopes = [IgnoreScope {
                base: String::new(),
                higher_priority: false,
                rules,
            }];
            for ch in ['a', '5', '-'] {
                assert!(
                    ignored(&scopes, &format!("file{ch}.txt"), false),
                    "{pattern} {ch}"
                );
            }
            assert!(!ignored(&scopes, "fileé.txt", false), "{pattern}");
        }
    }
}

#[cfg(test)]
mod whitespace_shorthand_tests {
    use super::*;

    #[test]
    fn javascript_whitespace_classes_include_bom_and_exclude_nel() {
        for (pattern, yes, no) in [
            ("file[\\s].txt", "\u{feff}", "\u{85}"),
            ("file[\\S].txt", "\u{85}", "\u{feff}"),
            ("file[a-\\s].txt", "-", "\u{85}"),
            ("file[\\S-a].txt", "\u{85}", "\u{feff}"),
        ] {
            let (rules, limited) = parse(pattern);
            assert!(!limited, "{pattern}");
            let scopes = [IgnoreScope {
                base: String::new(),
                higher_priority: false,
                rules,
            }];
            assert!(
                ignored(&scopes, &format!("file{yes}.txt"), false),
                "{pattern}"
            );
            assert!(
                !ignored(&scopes, &format!("file{no}.txt"), false),
                "{pattern}"
            );
        }
    }
}

#[cfg(test)]
mod control_escape_tests {
    use super::*;

    #[test]
    fn javascript_control_escapes_in_classes_are_range_endpoints() {
        let (rules, limited) = parse("file[\\b\\f\\v].txt\nrange[\\b-\\v].txt\n");
        assert!(!limited);
        let scopes = [IgnoreScope {
            base: String::new(),
            higher_priority: false,
            rules,
        }];
        for ch in ['\u{8}', '\u{c}', '\u{b}'] {
            assert!(ignored(&scopes, &format!("file{ch}.txt"), false));
        }
        assert!(!ignored(&scopes, "fileb.txt", false));
        assert!(ignored(&scopes, "range\t.txt", false));
        assert!(!ignored(&scopes, "range\u{c}.txt", false));
    }
}

#[cfg(test)]
mod more_identity_escape_tests {
    use super::*;

    #[test]
    fn javascript_a_and_e_class_escapes_are_literals() {
        for (pattern, yes, no) in [
            ("file[\\a].txt", 'a', '\u{7}'),
            ("file[\\e].txt", 'e', '\u{1b}'),
            ("file[\\a-z].txt", 'z', '\u{7}'),
        ] {
            let (rules, limited) = parse(pattern);
            assert!(!limited, "{pattern}");
            let scopes = [IgnoreScope {
                base: String::new(),
                higher_priority: false,
                rules,
            }];
            assert!(
                ignored(&scopes, &format!("file{yes}.txt"), false),
                "{pattern}"
            );
            assert!(
                !ignored(&scopes, &format!("file{no}.txt"), false),
                "{pattern}"
            );
        }
    }
}

#[cfg(test)]
mod line_separator_tests {
    use super::*;

    #[test]
    fn ignore_dot_wildcards_exclude_javascript_line_separators() {
        for pattern in ["**/target", "dir/**", "dir"] {
            let (rules, limited) = parse(pattern);
            assert!(!limited);
            let scopes = [IgnoreScope {
                base: String::new(),
                higher_priority: false,
                rules,
            }];
            let path = match pattern {
                "**/target" => "a\u{2028}b/target",
                _ => "dir/a\u{2028}b",
            };
            assert!(!ignored(&scopes, path, false), "{pattern}");
        }
        let (rules, _) = parse("dir/?");
        let scopes = [IgnoreScope {
            base: String::new(),
            higher_priority: false,
            rules,
        }];
        assert!(ignored(&scopes, "dir/\u{2028}", false));
    }
}
