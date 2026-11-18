//! Deterministic execution budgets and evidence-based recovery accounting.
use crate::{services::storage::json_text, text::js_trim};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock, Mutex},
};
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCheckpoint {
    pub calls: u64,
    pub window_calls: u64,
    pub evidence: Vec<String>,
    pub failures: HashMap<String, u64>,
    #[serde(default)]
    pub window_progress: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub infrastructure_failures: Option<u64>,
    #[serde(default)]
    pub failure_by_tool: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<String>,
}
pub struct ExecutionGuard {
    state: ExecutionCheckpoint,
    seen: Vec<String>,
    max_calls: u64,
    window_size: u64,
}
fn regex(pattern: &'static str, ascii_case: bool) -> Arc<Regex> {
    type Registry = HashMap<(&'static str, bool), Arc<Regex>>;
    static PATTERNS: LazyLock<Mutex<Registry>> = LazyLock::new(|| Mutex::new(HashMap::new()));
    PATTERNS
        .lock()
        .unwrap()
        .entry((pattern, ascii_case))
        .or_insert_with(|| {
            let text = if ascii_case {
                pattern.to_ascii_lowercase()
            } else {
                pattern.into()
            };
            Arc::new(Regex::new(&text).expect("static pattern"))
        })
        .clone()
}
fn matches(pattern: &'static str, value: &str) -> bool {
    regex(pattern, false).is_match(value)
}
fn matches_ci(pattern: &'static str, value: &str) -> bool {
    regex(pattern, true).is_match(&value.to_ascii_lowercase())
}
fn hash(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}
impl Default for ExecutionGuard {
    fn default() -> Self {
        Self::new(None, 120, 20)
    }
}
impl ExecutionGuard {
    /// Quotas and checkpoint counters are explicit nonnegative integer budgets.
    pub fn new(checkpoint: Option<ExecutionCheckpoint>, max_calls: u64, window_size: u64) -> Self {
        let state = checkpoint.unwrap_or_default();
        let mut seen = vec![];
        for item in &state.evidence {
            if !seen.contains(item) {
                seen.push(item.clone());
            }
        }
        Self {
            state,
            seen,
            max_calls,
            window_size,
        }
    }
    pub fn stop_reason(&self) -> Option<&str> {
        self.state.stop_reason.as_deref()
    }
    fn stop(&mut self, reason: String) -> Option<String> {
        self.state.stop_reason = Some(reason.clone());
        Some(reason)
    }
    pub fn before_call(&mut self) -> Option<String> {
        if let Some(reason) = self.stop_reason().filter(|s| !s.is_empty()) {
            return Some(reason.into());
        }
        if self.state.calls >= self.max_calls {
            return self.stop(format!(
                "Execution stopped at {} tool calls. Review the checkpoint before resuming.",
                self.max_calls
            ));
        }
        self.state.calls = self.state.calls.saturating_add(1);
        self.state.window_calls = self.state.window_calls.saturating_add(1);
        None
    }
    pub fn record(
        &mut self,
        tool: &str,
        ok: bool,
        message: &str,
        data: Option<&Value>,
    ) -> Option<String> {
        if let Some(reason) = self.stop_reason().filter(|s| !s.is_empty()) {
            return Some(reason.into());
        }
        let output = format!(
            "{}\n{}",
            message,
            data.and_then(|d| d["output"].as_str()).unwrap_or("")
        );
        let canonical = regex(r"^(?:functions\.)?mcp__[^\n\r\u{2028}\u{2029}]+?__", false)
            .replace(tool, "")
            .replace('_', ".");
        let command = matches(r"^(?:execute|terminal\.run|jait\.terminal)$", &canonical);
        let family = if matches_ci("ENOENT|no such file or directory", &output)
            && !matches_ci("not a git repository|invalid gitfile", &output)
        {
            None
        } else {
            failure_family(&output)
        };
        let recovery_tool = if command { "command" } else { &canonical };
        let hidden = command
            && matches_ci(
                r"(?:^|[\n\r\u{2028}\u{2029}])(?:(?:bash|sh|zsh|fish|bwrap|/[^\x09-\x0d \u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}:]+): [^\n\r\u{2028}\u{2029}]*?(?:command not found|permission denied|operation not permitted)|Command '[^']+' not found|Error(?: \[ERR_MODULE_NOT_FOUND\])?: Cannot find (?:module|package)|fatal: not a git repository|No test files found)",
                &output,
            );
        let failed = !ok
            || data
                .and_then(|d| d["exitCode"].as_f64())
                .is_some_and(|n| n != 0.0)
            || (hidden && family.is_some());
        self.state.last_action = Some(format!(
            "{tool}: {}",
            if failed { "failed" } else { "succeeded" }
        ));
        if failed {
            let key = family.map(str::to_string).unwrap_or_else(|| {
                let prefix =
                    String::from_utf16_lossy(&output.encode_utf16().take(4000).collect::<Vec<_>>());
                hash(
                    &regex(r"call_[A-Za-z0-9_-]+|(?-u:\b[0-9]+\b)", false)
                        .replace_all(&prefix, "#"),
                )
            });
            let count = self.state.failures.entry(key.clone()).or_default();
            *count = count.saturating_add(1);
            let count = *count;
            if let Some(family) = family {
                self.state
                    .failure_by_tool
                    .insert(recovery_tool.into(), family.into());
                let failures = self
                    .state
                    .infrastructure_failures
                    .unwrap_or(0)
                    .saturating_add(1);
                self.state.infrastructure_failures = Some(failures);
                if failures >= 6 {
                    return self.stop("Execution blocked: environment recovery exhausted six failed attempts. Escalate with the checkpoint before resuming.".into());
                }
            }
            if count >= 3 {
                return self.stop(format!("Execution blocked: {} persisted after two retries. Fix the underlying cause before resuming.",family.unwrap_or("the same tool failure")));
            }
        } else if let Some(recovered) = self.state.failure_by_tool.remove(recovery_tool) {
            let recovered_count = self.state.failures.remove(&recovered).unwrap_or(0);
            self.state.infrastructure_failures = Some(
                self.state
                    .infrastructure_failures
                    .unwrap_or(0)
                    .saturating_sub(recovered_count),
            );
        }
        if !failed
            && !matches(
                r"^(?:todo|jait\.todos|memory\.|team\.chat|thread\.control|agent\.|tools\.|jait\.catalog)",
                &canonical,
            )
        {
            let evidence = data
                .and_then(|d| d["content"].as_str())
                .or_else(|| data.and_then(|d| d["output"].as_str()))
                .map(str::to_string)
                .unwrap_or_else(|| {
                    data.filter(|d| !d.is_null())
                        .map(json_text)
                        .unwrap_or_else(|| json_text(&Value::String(message.into())))
                });
            let digest = hash(
                &regex(r"(?m)(^|[\r\u{2028}\u{2029}])[0-9]+\t", false).replace_all(&evidence, "$1"),
            );
            if !js_trim(&evidence).is_empty() && !self.seen.contains(&digest) {
                self.seen.push(digest);
                self.state.window_progress = true;
            }
            if let Some(family) = family {
                self.state.failures.remove(family);
            }
        }
        if self.state.window_calls >= self.window_size {
            if !self.state.window_progress {
                return self.stop(format!("Execution blocked: {} tool calls produced no new evidence, edits, or test results.",self.window_size));
            }
            self.state.window_calls = 0;
            self.state.window_progress = false;
        }
        None
    }
    pub fn snapshot(&self) -> ExecutionCheckpoint {
        let mut state = self.state.clone();
        state.evidence = self
            .seen
            .iter()
            .skip(self.seen.len().saturating_sub(120))
            .cloned()
            .collect();
        state
    }
}
fn failure_family(message: &str) -> Option<&'static str> {
    for (pattern, family) in [
        (
            "preview is not shared with the agent",
            "Browser sharing required — use Share with agent in the chat browser card or preview tab",
        ),
        (
            "Executable doesn't exist|Playwright unavailable|chromium not found in playwright",
            "Browser executable unavailable — configure an installed BROWSER_CHANNEL or install the Playwright browser",
        ),
        (
            r"not a git repository|invalid gitfile|\.git[^\n\r\u{2028}\u{2029}]*(?:not found|no such file)|unable to read[^\n\r\u{2028}\u{2029}]*git",
            "Git metadata unavailable",
        ),
        (
            "source chat not found",
            "Thread sender identity unavailable",
        ),
        (
            "ENOENT|no such file or directory",
            "Project path unavailable",
        ),
        (
            r"command (?:'[^']+'[\x09-\x0d \u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]+)?not found|not recognized as (?:an internal|the name of a cmdlet)",
            "Required executable unavailable",
        ),
        (
            "cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|could not locate[^\n\r\u{2028}\u{2029}]*bindings",
            "Required dependency unavailable",
        ),
        ("no test files found", "Test configuration unavailable"),
        (
            "permission denied|operation not permitted|EACCES",
            "Execution permission denied",
        ),
        (
            "consent[^\n\r\u{2028}\u{2029}]*(?:timed? out|timeout)",
            "Tool consent unavailable",
        ),
    ] {
        if matches_ci(pattern, message) {
            return Some(family);
        }
    }
    None
}
