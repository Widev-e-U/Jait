use super::{ContentMatch, FileMatch};
use regex::Regex;
use std::sync::LazyLock;

pub fn cleaned_file_query(query: &str) -> String {
    query
        .chars()
        .filter(|c| !matches!(c, '*' | '?' | '[' | ']'))
        .collect::<String>()
        .trim()
        .to_lowercase()
}
fn normalized(path: &str) -> String {
    path.replace('\\', "/").trim_start_matches("./").to_owned()
}
pub fn score_path(path: &str, query: &str) -> i32 {
    let path = path.to_lowercase();
    let segments: Vec<_> = path.split('/').filter(|s| !s.is_empty()).collect();
    let name = segments.last().copied().unwrap_or("");
    let stem = name
        .rsplit_once('.')
        .filter(|(stem, _)| !stem.is_empty())
        .map(|(stem, _)| stem)
        .unwrap_or(name);
    let mut score = if name == query {
        1000
    } else if stem == query {
        950
    } else if name.starts_with(query) {
        800
    } else if stem.starts_with(query) {
        750
    } else if name.contains(query) {
        650
    } else if segments.contains(&query) {
        500
    } else if path.contains(query) {
        300
    } else {
        0
    };
    if segments
        .iter()
        .any(|s| matches!(*s, "src" | "app" | "apps" | "lib" | "packages"))
    {
        score += 120;
    }
    if segments
        .iter()
        .any(|s| matches!(*s, "__tests__" | "test" | "tests" | "spec"))
        || name
            .rsplit_once('.')
            .is_some_and(|(stem, _)| stem.ends_with(".test") || stem.ends_with(".spec"))
    {
        score -= 100;
    }
    if segments.iter().any(|s| {
        matches!(
            *s,
            "node_modules"
                | "dist"
                | "build"
                | "release"
                | "out"
                | "coverage"
                | "web-dist"
                | "generated"
                | "vendor"
        )
    }) {
        score -= 300;
    }
    score - segments.len().saturating_sub(1).min(20) as i32
}
pub fn rank_file_paths(
    paths: &[String],
    query: &str,
    limit: usize,
    already_matched: bool,
) -> Vec<FileMatch> {
    let needle = cleaned_file_query(query);
    if needle.is_empty() {
        return vec![];
    }
    let mut files: Vec<_> = paths
        .iter()
        .map(|path| normalized(path))
        .filter(|path| already_matched || path.to_lowercase().contains(&needle))
        .map(|relative_path| FileMatch {
            name: relative_path.rsplit('/').next().unwrap_or("").into(),
            score: score_path(&relative_path, &needle),
            path: String::new(),
            relative_path,
        })
        .collect();
    files.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });
    files.truncate(limit);
    files
}
pub fn rank_content_matches(matches: &mut Vec<ContentMatch>, query: &str, limit: usize) {
    static DEFINITION: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var|def|fn|struct|trait)\b").unwrap()
    });
    let needle = query.trim().to_lowercase();
    let path_query = cleaned_file_query(query);
    let escaped = regex::escape(&needle);
    let named = if needle.is_empty() || needle.len() > 4096 {
        None
    } else {
        Regex::new(&format!(r"(?i)\b(?:function|class|interface|type|enum|const|let|var|def|fn|struct|trait)\s+{escaped}\b")).ok()
    };
    for matched in matches.iter_mut() {
        matched.relative_path = normalized(&matched.relative_path);
        let content = matched.content.to_lowercase();
        matched.score = score_path(
            &matched.relative_path,
            if path_query.is_empty() {
                &needle
            } else {
                &path_query
            },
        );
        if content.trim() == needle {
            matched.score += 700;
        }
        if named
            .as_ref()
            .is_some_and(|re| re.is_match(&matched.content))
        {
            matched.score += 1200;
        } else if DEFINITION.is_match(&matched.content) {
            matched.score += 500;
        }
        if content.contains(&needle) {
            matched.score += 100;
        }
    }
    matches.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.relative_path.cmp(&b.relative_path))
            .then(a.line.cmp(&b.line))
    });
    matches.truncate(limit);
}
pub(crate) fn truncate_content(value: &str) -> String {
    // Returned evidence is plain text. Remove terminal control sequences' introducers;
    // consumers must still render this as text, never HTML/instructions.
    let cleaned: String = value
        .trim()
        .chars()
        .filter(|c| !c.is_control() || *c == '\t')
        .collect();
    let count = cleaned.chars().count();
    if count <= 500 {
        cleaned
    } else {
        format!(
            "{}… (truncated, {} more chars)",
            cleaned.chars().take(500).collect::<String>(),
            count - 500
        )
    }
}
