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
    if pattern.len() > 4096 {
        return Err(Error::Input("glob exceeds 4096 bytes".into()));
    }
    let mut source = String::from("^");
    if unanchored {
        source.push_str("(?:.*/)?");
    }
    let mut chars = pattern.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' if chars.peek() == Some(&'*') => {
                chars.next();
                if chars.peek() == Some(&'/') {
                    chars.next();
                    source.push_str("(?:.*/)?");
                } else {
                    source.push_str(".*");
                }
            }
            '*' => source.push_str("[^/]*"),
            '?' => source.push_str("[^/]"),
            '\\' => {
                if let Some(c) = chars.next() {
                    source.push_str(&regex::escape(&c.to_string()));
                }
            }
            '[' => {
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
                } else if class.is_empty() {
                    source.push_str("\\[\\]");
                } else {
                    source.push('[');
                    if class.starts_with('!') {
                        source.push('^');
                        class.remove(0);
                    }
                    source.push_str(&class);
                    source.push(']');
                }
            }
            c => source.push_str(&regex::escape(&c.to_string())),
        }
    }
    if descendants {
        source.push_str("(?:/.*)?");
    }
    source.push('$');
    RegexBuilder::new(&source)
        .size_limit(32 * 1024)
        .dfa_size_limit(32 * 1024)
        .build()
        .map_err(|_| Error::Input("invalid or excessive glob".into()))
}
pub(crate) fn parse(content: &str) -> (Vec<Rule>, bool) {
    let mut rules = Vec::new();
    let mut limited = false;
    for line in content.lines() {
        let mut pattern = line.trim_end();
        if pattern.is_empty() || pattern.starts_with('#') {
            continue;
        }
        if rules.len() >= 128 {
            limited = true;
            break;
        }
        let negated = pattern.starts_with('!');
        if negated {
            pattern = &pattern[1..];
        }
        let directory = pattern.ends_with('/');
        if directory {
            pattern = &pattern[..pattern.len() - 1];
        }
        let anchored = pattern.contains('/');
        pattern = pattern.strip_prefix('/').unwrap_or(pattern);
        match glob(pattern, !anchored, true) {
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
