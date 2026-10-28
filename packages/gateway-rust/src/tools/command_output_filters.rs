//! Command-aware projections of model-facing output. This module has no effects:
//! callers retain the original terminal replay and fall back when it returns None.
use crate::{
    contracts::bounded_json::Utf16Text,
    text::{js_trim, js_whitespace},
};
use regex::Regex;
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};

// ECMAScript regex whitespace, digit, word-boundary and dot semantics differ
// from regex's Unicode defaults. Patterns are static; cache their compilation.
fn re(pattern: &str) -> Regex {
    static CACHE: LazyLock<Mutex<HashMap<String, Regex>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    cache.entry(pattern.to_owned()).or_insert_with(|| {
        let ws = r"\x09-\x0d\x20\u{00a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}";
        let mut converted = String::new();
        let insensitive = pattern.starts_with("(?i)");
        let mut chars = pattern.strip_prefix("(?i)").unwrap_or(pattern).chars();
        let mut class = false;
        while let Some(c) = chars.next() {
            if c == '\\' {
                match chars.next().expect("static regex escape") {
                    's' => converted.push_str(&format!("[{ws}]")),
                    'S' => converted.push_str(&format!("[^{ws}]")),
                    'd' => converted.push_str("[0-9]"),
                    'b' => converted.push_str(r"(?-u:\b)"),
                    x => { converted.push('\\'); converted.push(x); }
                }
            } else {
                if c == '[' { class = true; }
                if c == ']' { class = false; }
                if c == '.' && !class { converted.push_str(r"[^\r\n\u{2028}\u{2029}]"); }
                else if c == '$' && !class { converted.push_str(r"\z"); }
                else if insensitive && c.is_ascii_alphabetic() && !class { converted.push_str(&format!("[{}{}]",c.to_ascii_lowercase(),c.to_ascii_uppercase())); }
                else { converted.push(c); }
            }
        }
        Regex::new(&converted).expect("reviewed static output-filter regex")
    }).clone()
}
fn replace_first(value: &str, pattern: &str) -> String {
    re(pattern).replace(value, "").into_owned()
}
fn js_len(value: &str) -> usize {
    value.encode_utf16().count()
}
fn text(value: impl Into<String>) -> Utf16Text {
    Utf16Text::from(value.into())
}
fn trim_text(value: &Utf16Text) -> Utf16Text {
    let ws = |u: &u16| char::from_u32(*u as u32).is_some_and(js_whitespace);
    let start = value.0.iter().take_while(|u| ws(u)).count();
    let end = value.0.len() - value.0[start..].iter().rev().take_while(|u| ws(u)).count();
    Utf16Text(value.0[start..end].to_vec())
}
pub fn command_output_filtering_enabled(value: Option<&str>) -> bool {
    !value.is_some_and(|v| {
        matches!(
            js_trim(v).to_lowercase().as_str(),
            "0" | "false" | "off" | "no"
        )
    })
}
pub fn normalize_command_for_filtering(command: &str) -> String {
    let mut cmd = js_trim(command).to_owned();
    for pattern in [
        r"^export\s+[^;\n]*;\s*",
        r"^(?:\$env:[A-Za-z_][A-Za-z0-9_]*\s*=\s*'[^']*'\s*;\s*)+",
        r"^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+",
        r#"^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*"#,
        r"^\(\s*",
        r"^sudo\s+",
    ] {
        cmd = replace_first(&cmd, pattern);
    }
    js_trim(&cmd).to_owned()
}
#[derive(Debug, Serialize)]
pub struct PrimaryCommand {
    pub tokens: Vec<String>,
    pub raw: String,
}
pub fn resolve_primary_command(command: &str) -> PrimaryCommand {
    let normalized = normalize_command_for_filtering(command);
    let mut quote = None;
    let mut end = normalized.len();
    let mut chars = normalized.char_indices().peekable();
    while let Some((i, ch)) = chars.next() {
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            }
            continue;
        }
        if ch == '\'' || ch == '"' {
            quote = Some(ch);
            continue;
        }
        if ch == '|' {
            if chars.peek().is_some_and(|(_, c)| *c == '|') {
                chars.next();
            } else {
                end = i;
                break;
            }
        }
    }
    let first = &normalized[..end];
    let tokens = re(r#"(?:"[^"]*"|'[^']*'|\S+)"#)
        .find_iter(first)
        .map(|m| {
            let v = m.as_str();
            // JS anchored alternation strips one quote at either end, independently.
            let v = v.strip_prefix(['\'', '"']).unwrap_or(v);
            v.strip_suffix(['\'', '"']).unwrap_or(v).to_owned()
        })
        .collect();
    PrimaryCommand {
        tokens,
        raw: js_trim(first).to_owned(),
    }
}
fn basename(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}
fn git_subcommand(tokens: &[String]) -> Option<&str> {
    if !matches!(tokens.first().map(|v| basename(v)), Some("git" | "git.exe")) {
        return None;
    }
    let mut i = 1;
    while let Some(token) = tokens.get(i) {
        if matches!(token.as_str(), "-c" | "-C" | "--git-dir" | "--work-tree") {
            i += 2;
        } else if token.starts_with('-') {
            i += 1;
        } else {
            return Some(token);
        }
    }
    None
}
fn is_test_command(tokens: &[String]) -> bool {
    let bin = tokens.first().map(|v| basename(v)).unwrap_or("");
    let rest = tokens.get(1..).unwrap_or_default();
    match bin {
        "vitest" | "jest" | "mocha" | "ava" | "tap" | "phpunit" | "rspec" | "pytest" => true,
        "python" | "python3" | "py" => {
            rest.iter().any(|v| v == "-m") && rest.iter().any(|v| v == "pytest")
        }
        "cargo" | "go" | "dotnet" => rest.first().is_some_and(|v| v == "test"),
        "npm" | "pnpm" | "yarn" | "bun" => rest
            .get(usize::from(rest.first().is_some_and(|v| v == "run")))
            .is_some_and(|v| v.starts_with("test")),
        _ => false,
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Category {
    Staged,
    Modified,
    Deleted,
    Untracked,
    Other,
}
impl Category {
    fn name(self) -> &'static str {
        match self {
            Self::Staged => "staged",
            Self::Modified => "modified",
            Self::Deleted => "deleted",
            Self::Untracked => "untracked",
            Self::Other => "other",
        }
    }
}
fn human_status(output: &str) -> (Option<String>, Vec<(Category, String)>) {
    let mut branch = None;
    let mut category = None;
    let mut entries = Vec::new();
    for line in output.split('\n').map(js_trim).filter(|v| !v.is_empty()) {
        if let Some(m) = re(r"(?i)^on branch (.+)$").captures(line) {
            branch = Some(js_trim(&m[1]).to_owned());
            category = None;
            continue;
        }
        let mut moved = false;
        for direction in ["ahead", "behind"] {
            if let Some(m) = re(&format!(
                r"(?i){direction}{} .*? by (\d+) commits?",
                if direction == "ahead" { " of" } else { "" }
            ))
            .captures(line)
            {
                branch = Some(format!(
                    "{} ({direction} {})",
                    branch.as_deref().unwrap_or("?"),
                    &m[1]
                ));
                moved = true;
                break;
            }
        }
        if moved {
            continue;
        }
        let section = [
            (r"(?i)^changes to be committed:", Category::Staged),
            (r"(?i)^changes not staged for commit:", Category::Modified),
            (r"(?i)^untracked files:", Category::Untracked),
            (r"(?i)^unmerged paths:", Category::Other),
        ]
        .into_iter()
        .find(|(p, _)| re(p).is_match(line));
        if let Some((_, c)) = section {
            category = Some(c);
            continue;
        }
        if let (Some(m), Some(c)) = (re(r"(?i)^(new file|modified|deleted|renamed|typechange|copied|both modified):\s+(.+)$").captures(line), category) {
            let c = match m[1].to_lowercase().as_str() { "new file"=>Category::Staged,"deleted"=>Category::Deleted,_=>c };
            entries.push((c, js_trim(&m[2]).to_owned())); continue;
        }
        if category == Some(Category::Untracked) && !line.starts_with('(') {
            entries.push((Category::Untracked, line.to_owned()));
        }
    }
    (branch, entries)
}
fn porcelain_status(output: &str) -> (Option<String>, Vec<(Category, String)>) {
    let mut branch = None;
    let mut entries = Vec::new();
    for line in output.split('\n').filter(|v| !v.is_empty()) {
        if let Some(rest) = line.strip_prefix("## ") {
            branch = Some(
                js_trim(rest)
                    .strip_prefix("...")
                    .unwrap_or(js_trim(rest))
                    .to_owned(),
            );
            continue;
        }
        let Some(m) = re(r"^(..) (.+)$").captures(line) else {
            continue;
        };
        let xy: Vec<char> = m[1].chars().collect();
        if xy.len() != 2 || !xy.iter().all(|c| " MADRCUT?!".contains(*c)) {
            continue;
        }
        let (x, y) = (xy[0], xy[1]);
        let path = m[2].to_owned();
        if x == '?' && y == '?' {
            entries.push((Category::Untracked, path));
            continue;
        }
        if x == '!' && y == '!' {
            continue;
        }
        if x != ' ' && x != '?' {
            entries.push((
                if x == 'D' {
                    Category::Deleted
                } else {
                    Category::Staged
                },
                path.clone(),
            ));
        }
        if y != ' ' && y != '?' {
            entries.push((
                if y == 'D' {
                    Category::Deleted
                } else {
                    Category::Modified
                },
                path,
            ));
        }
    }
    (branch, entries)
}
pub fn compress_git_status(output: &str) -> Option<Utf16Text> {
    let (mut branch, mut entries) = human_status(output);
    if entries.is_empty() {
        let (b, e) = porcelain_status(output);
        branch = branch.or(b);
        entries = e;
    }
    if entries.is_empty() && branch.as_deref().is_none_or(str::is_empty) {
        return None;
    }
    let mut parts = Vec::new();
    if let Some(b) = branch.filter(|b| !b.is_empty()) {
        parts.push(format!("branch: {b}"));
    }
    if entries.is_empty() {
        parts.push("clean".to_owned());
    }
    for category in [
        Category::Staged,
        Category::Modified,
        Category::Deleted,
        Category::Untracked,
        Category::Other,
    ] {
        let paths: Vec<_> = entries
            .iter()
            .filter(|(c, _)| *c == category)
            .map(|(_, p)| p.as_str())
            .collect();
        if paths.is_empty() {
            continue;
        }
        let more = if paths.len() > 20 {
            format!(", +{} more", paths.len() - 20)
        } else {
            String::new()
        };
        parts.push(format!(
            "{}({}): {}{more}",
            category.name(),
            paths.len(),
            paths
                .iter()
                .take(20)
                .copied()
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    Some(text(parts.join("\n")))
}
pub fn compress_git_log(output: &str) -> Option<Utf16Text> {
    if !output
        .split('\n')
        .any(|l| re(r"^commit [0-9a-f]{7,40}\b").is_match(l))
    {
        return None;
    }
    let mut commits = Vec::new();
    let mut hash: Option<String> = None;
    let mut author: Option<String> = None;
    let mut subject: Option<String> = None;
    fn flush(
        commits: &mut Vec<String>,
        hash: &Option<String>,
        author: &Option<String>,
        subject: &Option<String>,
    ) {
        if let Some(hash) = hash {
            commits.push(format!(
                "{} {}{}",
                &hash[..7],
                author
                    .as_ref()
                    .map(|v| format!("{v} — "))
                    .unwrap_or_default(),
                subject.as_deref().unwrap_or("(no subject)")
            ));
        }
    }
    for line in output.split('\n') {
        if let Some(m) = re(r"^commit ([0-9a-f]{7,40})").captures(line) {
            flush(&mut commits, &hash, &author, &subject);
            hash = Some(m[1].to_owned());
            author = None;
            subject = None;
            continue;
        }
        if hash.is_none() {
            continue;
        }
        if let Some(m) = re(r"^Author:\s*(.+?)\s*<.*>$").captures(line) {
            author = Some(js_trim(&m[1]).to_owned());
            continue;
        }
        if re(r"^(?:Author|Date|Merge|CommitDate):").is_match(line) {
            continue;
        }
        if subject.is_none() && re(r"^ {4}\S").is_match(line) {
            subject = Some(js_trim(line).to_owned());
        }
    }
    flush(&mut commits, &hash, &author, &subject);
    if commits.is_empty() {
        return None;
    }
    let count = commits.len();
    commits.truncate(50);
    if count > 50 {
        commits.push(format!("…and {} more commits", count - 50));
    }
    Some(text(commits.join("\n")))
}
pub fn compress_git_diff(output: &str) -> Option<Utf16Text> {
    let lines: Vec<_> = output.split('\n').collect();
    if !lines.iter().any(|l| l.starts_with("@@")) {
        return None;
    }
    let kept: Vec<_> = lines
        .iter()
        .filter(|l| {
            !re(r"^index [0-9a-f]+\.\.[0-9a-f]+").is_match(l)
                && !l.starts_with("\\ No newline at end of file")
        })
        .copied()
        .collect();
    (kept.len() != lines.len()).then(|| text(kept.join("\n")))
}
pub fn compress_grep_output(output: &str) -> Option<Utf16Text> {
    let lines: Vec<_> = output.split('\n').filter(|l| !l.is_empty()).collect();
    if lines.len() < 25 {
        return None;
    }
    let mut files: Vec<(String, Vec<(String, String)>)> = Vec::new();
    let mut indices = HashMap::new();
    for line in lines {
        let m = re(r"^(.+?):(\d+):(.*)$").captures(line)?;
        let index = *indices.entry(m[1].to_owned()).or_insert_with(|| {
            files.push((m[1].to_owned(), Vec::new()));
            files.len() - 1
        });
        files[index].1.push((m[2].to_owned(), m[3].to_owned()));
    }
    if files.len() < 2 {
        return None;
    }
    let mut out = Vec::<u16>::new();
    for (i, (file, matches)) in files.iter().take(20).enumerate() {
        if i > 0 {
            out.push(10);
        }
        out.extend(format!("{file} ({}): ", matches.len()).encode_utf16());
        for (j, (line, body)) in matches.iter().take(8).enumerate() {
            if j > 0 {
                out.extend(", ".encode_utf16());
            }
            out.extend(format!("{line}:").encode_utf16());
            let units: Vec<_> = body.encode_utf16().collect();
            if units.len() > 120 {
                out.extend_from_slice(&units[..119]);
                out.push(0x2026);
            } else {
                out.extend(units);
            }
        }
        if matches.len() > 8 {
            out.extend(format!(", +{} more", matches.len() - 8).encode_utf16());
        }
    }
    if files.len() > 20 {
        out.extend(format!("\n…and {} more files", files.len() - 20).encode_utf16());
    }
    Some(Utf16Text(out))
}
const SUMMARIES: &[&str] = &[
    r"(?i)^(?:Tests?|Test Suites?|Test Files|Suites?|Snapshots?|Time|Duration|Ran)\b.*\d",
    r"(?i)\b\d+\s+(?:passed|failed|skipped|pending|todo|flaky|errors?|failures?)\b",
    r"(?i)^test result:",
    r"^(?:PASS|FAIL|PASSED|FAILED)\b",
    r"^ok\s+\S+",
    r"(?i)^\s*\d+\s+passing\b",
    r"(?i)^\s*\d+\s+failing\b",
    r"\bin \d+(?:\.\d+)?s\b",
    r"(?i)^=+ .*(?:passed|failed|error).* =+$",
];
const FAILURES: &[&str] = &[
    r"^\s*FAIL(?:ED)?\b",
    r"^\s*(?:✗|✕|✘|×|✖|●)",
    r"^\s*--- FAIL:",
    r"^\s*not ok\b",
    r"^\s*E\s+\S",
    r"\bAssertionError\b",
    r"^\s*(?:error|Error|expected|Expected)\b",
];
pub fn compress_test_output(output: &str) -> Option<Utf16Text> {
    let lines: Vec<_> = output.split('\n').collect();
    if lines.len() < 40 {
        return None;
    }
    let mut kept = Vec::new();
    let mut dropped = 0;
    let mut context = 0;
    let mut signal = false;
    for line in &lines {
        if SUMMARIES.iter().any(|p| re(p).is_match(line)) {
            kept.push(*line);
            context = 0;
            signal = true;
            continue;
        }
        if FAILURES.iter().any(|p| re(p).is_match(line)) {
            kept.push(*line);
            context = 8;
            signal = true;
            continue;
        }
        if context > 0 {
            kept.push(*line);
            context -= 1;
            if js_trim(line).is_empty() {
                context = 0;
            }
            continue;
        }
        dropped += 1;
    }
    if !signal || dropped * 4 < lines.len() {
        return None;
    }
    Some(text(
        js_trim(&re(r"\n{3,}").replace_all(&kept.join("\n"), "\n\n")).to_owned(),
    ))
}
pub fn compress_path_list(output: &str) -> Option<Utf16Text> {
    let mut names = Vec::<String>::new();
    for line in output.split('\n').map(js_trim).filter(|l| !l.is_empty()) {
        if re(r"^total\s+\d+$").is_match(line) {
            continue;
        }
        if re(r"^[-dlbcps][-rwxsStT]{9}").is_match(line) {
            let m=re(r"^[-dlbcps][-rwxsStT]{9}[.+@]?\s+\d+\s+\S+\s+\S+\s+\d+\s+(?:[A-Za-z]{3}\s+\d+\s+(?:\d{4}|\d{2}:\d{2})|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$").captures(line)?;
            names.push(js_trim(&m[1]).to_owned());
            continue;
        }
        names.extend(
            line.split(js_whitespace)
                .filter(|n| !n.is_empty())
                .map(str::to_owned),
        );
    }
    if names.len() < 40 {
        return None;
    }
    let mut counts = Vec::<(String, usize)>::new();
    let mut other = 0;
    for name in &names {
        let dot = name.rfind('.');
        let slash = name.rfind(['/', '\\']);
        if let Some(dot) = dot
            .filter(|d| slash.is_none_or(|s| *d > s))
            .filter(|d| d + 1 < name.len())
        {
            let ext = &name[dot..];
            if js_len(ext) <= 8 {
                if let Some((_, n)) = counts.iter_mut().find(|(e, _)| e == ext) {
                    *n += 1;
                } else {
                    counts.push((ext.to_owned(), 1));
                }
                continue;
            }
        }
        other += 1;
    }
    counts.sort_by_key(|entry| std::cmp::Reverse(entry.1));
    let hist = counts
        .iter()
        .take(10)
        .map(|(e, n)| format!("{e}: {n}"))
        .collect::<Vec<_>>()
        .join(", ");
    let mut parts = vec![format!("{} entries", names.len())];
    if !hist.is_empty() {
        parts.push(format!("extensions: {hist}"));
    }
    if other > 0 {
        parts.push(format!("no/other extension: {other}"));
    }
    parts.push(format!(
        "sample: {}",
        names
            .iter()
            .take(30)
            .map(|n| basename(n))
            .collect::<Vec<_>>()
            .join(", ")
    ));
    if names.len() > 30 {
        parts.push(format!("…and {} more", names.len() - 30));
    }
    Some(text(parts.join("\n")))
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressedCommandOutput {
    pub output: Utf16Text,
    pub filter_id: &'static str,
    pub note: String,
    pub original_chars: usize,
    pub compressed_chars: usize,
}
fn grouped(value: usize) -> String {
    let digits = value.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}
pub fn compress_command_output(
    command: &str,
    output: &str,
    enabled: bool,
) -> Option<CompressedCommandOutput> {
    if !enabled || js_len(output) < 200 {
        return None;
    }
    let tokens = resolve_primary_command(command).tokens;
    let bin = tokens.first().map(|v| basename(v)).unwrap_or("");
    let (id, compressed) = match git_subcommand(&tokens) {
        Some("status") => ("git-status", compress_git_status(output)),
        Some("log") => ("git-log", compress_git_log(output)),
        Some("diff") => ("git-diff", compress_git_diff(output)),
        Some("grep") => ("git-grep", compress_grep_output(output)),
        _ => {
            if matches!(bin, "grep" | "egrep" | "fgrep" | "rg" | "ag") {
                ("grep", compress_grep_output(output))
            } else if is_test_command(&tokens) {
                ("tests", compress_test_output(output))
            } else if matches!(bin, "ls" | "find" | "tree") {
                ("path-list", compress_path_list(output))
            } else {
                return None;
            }
        }
    };
    let compressed = trim_text(&compressed?);
    let original_chars = js_len(output);
    let compressed_chars = compressed.0.len();
    if compressed_chars == 0 || compressed_chars >= js_len(js_trim(output)) {
        return None;
    }
    Some(CompressedCommandOutput {
        output: compressed,
        filter_id: id,
        note: format!(
            "output compressed ({id}: {}→{} chars)",
            grouped(original_chars),
            grouped(compressed_chars)
        ),
        original_chars,
        compressed_chars,
    })
}
