//! Native port of `packages/gateway/src/tools/terminal-tools.ts` — the
//! `terminal.run` command tool.
//!
//! The TypeScript module owns an in-process PTY/surface layer (`SurfaceRegistry`,
//! node-pty, the OSC-633 completion sentinel, the background command monitor and
//! the managed-execution history). None of that has a native equivalent, so the
//! tool layer keeps what belongs to the tool — schema, validation, timeout/yield
//! resolution, output compaction and result shaping — and delegates execution to
//! two host-port methods:
//!
//! * `terminalRun [spec]` → `{ output, exitCode, timedOut, terminalId,
//!   outputOffset, outputEndOffset, needsInteraction, pagerEscaped,
//!   outputFilter, cancelled, isBackground, watched, startupTimedOut,
//!   executionId }`
//! * `terminalExecutionStop [terminalId]`
//!
//! `exitCode` is JSON `null` when the shell never reported one (killed, timed
//! out, still running).

use std::sync::LazyLock;

use serde_json::{Map, Value, json};

use crate::services::calendar::{js_text, truthy};
use crate::tools::core_io::HostError;
use crate::tools::core_jait::JaitPort;

// ── Constants (mirrors terminal-tools.ts) ─────────────────────────

/// `MAX_TERMINAL_TOOL_OUTPUT_CHARS`.
pub const MAX_TERMINAL_TOOL_OUTPUT_CHARS: usize = 16_000;
/// `MAX_TERMINAL_TOOL_LINE_CHARS`.
pub const MAX_TERMINAL_TOOL_LINE_CHARS: usize = 2_000;
const TERMINAL_LINE_HEAD_CHARS: usize = 700;
const TERMINAL_LINE_TAIL_CHARS: usize = 200;
const TERMINAL_OUTPUT_TRUNCATION_MARKER: &str = "\n…(middle truncated)…\n";
const TERMINAL_OUTPUT_STATS_MIN_CHARS: usize = 8_000;
const TERMINAL_OUTPUT_FLOOD_CHARS: usize = 60_000;
const TERMINAL_OUTPUT_FLOOD_LINE_CHARS: usize = 5_000;

/// `DEFAULT_COMMAND_TIMEOUT_MS` — one hour.
pub const DEFAULT_COMMAND_TIMEOUT_MS: i64 = 3_600_000;
/// `MAX_COMMAND_TIMEOUT_MS` — one day.
pub const MAX_COMMAND_TIMEOUT_MS: i64 = 86_400_000;
/// `DEFAULT_COMMAND_YIELD_MS`.
pub const DEFAULT_COMMAND_YIELD_MS: i64 = 10_000;
/// `MAX_COMMAND_YIELD_MS`.
pub const MAX_COMMAND_YIELD_MS: i64 = 30_000;

// ── Helpers ──────────────────────────────────────────────────────

/// `resolveCommandTimeoutMs(value)`.
pub fn resolve_command_timeout_ms(value: Option<&Value>) -> i64 {
    let requested = match value {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(0.0),
        _ => 0.0,
    };
    if !requested.is_finite() || requested <= 0.0 {
        return DEFAULT_COMMAND_TIMEOUT_MS;
    }
    (requested.ceil() as i64).min(MAX_COMMAND_TIMEOUT_MS)
}

/// `resolveCommandYieldMs(value, timeoutMs)`.
pub fn resolve_command_yield_ms(value: Option<&Value>, timeout_ms: i64) -> i64 {
    let requested = match value {
        Some(Value::Number(number)) if number.as_f64().unwrap_or(0.0).is_finite() => {
            (number.as_f64().unwrap_or(0.0).ceil() as i64).max(0)
        }
        _ => DEFAULT_COMMAND_YIELD_MS,
    };
    requested.clamp(1, MAX_COMMAND_YIELD_MS.min(timeout_ms.max(1)))
}

/// `collapseLongTerminalLines(output, maxLineChars, elisionSuffix)`.
pub fn collapse_long_terminal_lines(
    output: &str,
    max_line_chars: usize,
    elision_suffix: &str,
) -> String {
    if max_line_chars == 0 || output.len() <= max_line_chars {
        return output.to_string();
    }
    let mut changed = false;
    let lines: Vec<String> = output
        .split('\n')
        .map(|line| {
            let line_len = line.chars().count();
            if line_len <= max_line_chars {
                return line.to_string();
            }
            changed = true;
            let head_chars = TERMINAL_LINE_HEAD_CHARS.min(max_line_chars.saturating_sub(40));
            let mut budget = max_line_chars - head_chars;
            let tail_chars = if budget > 0 {
                TERMINAL_LINE_TAIL_CHARS.min(budget - 1)
            } else {
                0
            };
            budget -= tail_chars;
            let _ = budget;
            let elided = line_len - head_chars - tail_chars;
            let marker = format!("…(line truncated: {elided} chars elided)…");
            let head: String = line.chars().take(head_chars).collect();
            let tail: String = line.chars().skip(line_len - tail_chars).collect::<String>();
            format!("{head}{marker}{elision_suffix}{tail}")
        })
        .collect();
    if changed {
        lines.join("\n")
    } else {
        output.to_string()
    }
}

/// `truncateMiddleChars(output, maxChars)`.
pub fn truncate_middle_chars(output: &str, max_chars: usize) -> String {
    let chars: Vec<char> = output.chars().collect();
    if chars.len() <= max_chars {
        return output.to_string();
    }
    if max_chars == 0 {
        return String::new();
    }
    let marker_len = TERMINAL_OUTPUT_TRUNCATION_MARKER.chars().count();
    if max_chars <= marker_len {
        return chars.into_iter().take(max_chars).collect();
    }
    let retained = max_chars - marker_len;
    let head_chars = retained.div_ceil(2);
    let tail_chars = retained - head_chars;
    let head: String = chars.iter().take(head_chars).collect();
    let tail: String = chars
        .iter()
        .skip(chars.len() - tail_chars)
        .collect::<String>();
    format!("{head}{TERMINAL_OUTPUT_TRUNCATION_MARKER}{tail}")
}

/// `truncateTerminalToolOutput(output, maxChars)`.
pub fn truncate_terminal_tool_output(output: &str, max_chars: usize) -> String {
    truncate_middle_chars(
        &collapse_long_terminal_lines(output, MAX_TERMINAL_TOOL_LINE_CHARS, ""),
        max_chars,
    )
}

/// `measureTerminalOutput(output)`.
pub fn measure_terminal_output(output: &str) -> (usize, usize, usize) {
    let mut line_count = 1usize;
    let mut longest = 0usize;
    let mut current = 0usize;
    for ch in output.chars() {
        if ch == '\n' {
            longest = longest.max(current);
            line_count += 1;
            current = 0;
        } else {
            current += 1;
        }
    }
    longest = longest.max(current);
    (output.chars().count(), line_count, longest)
}

/// `describeTerminalOutputFlood(stats)` — `None` when the output is modest.
pub fn describe_terminal_output_flood(
    total_chars: usize,
    line_count: usize,
    longest_line: usize,
) -> Option<String> {
    let too_long = longest_line > TERMINAL_OUTPUT_FLOOD_LINE_CHARS;
    if !too_long && total_chars <= TERMINAL_OUTPUT_FLOOD_CHARS {
        return None;
    }
    let mut parts = vec![
        format!("{} chars", thousands(total_chars)),
        format!("{} lines", thousands(line_count)),
    ];
    if too_long {
        parts.push(format!("longest line {} chars", thousands(longest_line)));
    }
    let hint = if too_long {
        " — that is a generated/minified or single-line file; narrow the command (paths, --include/--exclude, per-file head) or use the search/read tools instead of dumping it"
    } else {
        " — scope the command with paths, --include/--exclude, or head/tail"
    };
    Some(format!("output flood ({}){hint}", parts.join(", ")))
}

/// `n.toLocaleString("en-US")`.
fn thousands(value: usize) -> String {
    let digits = value.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, ch) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    out
}

fn string_field(input: &Value, key: &str) -> String {
    input.get(key).map(js_text).unwrap_or_default()
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

// ── Tool struct ──────────────────────────────────────────────────

pub struct TerminalTools<C> {
    pub service: JaitPort<C>,
}

impl<C: Send + Sync> TerminalTools<C> {
    pub fn new(service: JaitPort<C>) -> Self {
        Self { service }
    }

    /// Bundled `terminal-tools-metadata.json` (one entry: `terminal.run`).
    pub fn metadata() -> &'static Value {
        static DATA: LazyLock<Value> = LazyLock::new(|| {
            serde_json::from_str(include_str!("terminal-tools-metadata.json"))
                .expect("terminal-tools-metadata.json must be valid JSON")
        });
        &DATA
    }

    /// The `terminal.run` definition, if present in the metadata bundle.
    pub fn definition(&self) -> Option<&'static Value> {
        Self::metadata()
            .as_array()?
            .iter()
            .find(|entry| entry.get("name").and_then(Value::as_str) == Some("terminal.run"))
    }

    async fn call(&self, method: &str, args: Vec<Value>, host: &C) -> Result<Value, HostError> {
        Ok((self.service)(method, args, host)
            .await?
            .unwrap_or(Value::Null))
    }

    /// `createTerminalRunTool(...).execute`.
    pub async fn run(&self, input: &Value, context: &Value, host: &C) -> Value {
        match self.run_inner(input, context, host).await {
            Ok(value) => value,
            Err(HostError::Error(message)) => fail(message),
            Err(HostError::Thrown(value)) => fail(match value.as_str() {
                Some(message) => message.to_string(),
                None => "Failed to run command".to_string(),
            }),
        }
    }

    async fn run_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let raw_command = string_field(input, "command");
        let command = raw_command.trim().to_string();
        if command.is_empty() {
            return Ok(fail("Missing required parameter: command"));
        }

        let timeout_ms = resolve_command_timeout_ms(input.get("timeoutMs"));
        let yield_ms = resolve_command_yield_ms(input.get("yieldMs"), timeout_ms);
        let is_background = input.get("background").map(truthy).unwrap_or(false);
        let sudo = input.get("sudo").map(truthy).unwrap_or(false);
        let workdir = match input.get("workdir") {
            Some(value) if !value.is_null() => js_text(value),
            _ => String::new(),
        };
        let terminal_id = match input.get("terminalId") {
            Some(value) if !value.is_null() => js_text(value),
            _ => String::new(),
        };
        let description = match input.get("description") {
            Some(value) if !value.is_null() => js_text(value),
            _ => String::new(),
        };

        if context.get("signal").and_then(Value::as_bool) == Some(true) {
            return Ok(fail("Cancelled"));
        }

        let mut spec = Map::new();
        spec.insert("command".into(), json!(command));
        spec.insert("timeoutMs".into(), json!(timeout_ms));
        spec.insert("yieldMs".into(), json!(yield_ms));
        spec.insert("background".into(), json!(is_background));
        spec.insert("sudo".into(), json!(sudo));
        if !workdir.is_empty() {
            spec.insert("workdir".into(), json!(workdir));
        }
        if !terminal_id.is_empty() {
            spec.insert("terminalId".into(), json!(terminal_id));
        }
        if !description.is_empty() {
            spec.insert("description".into(), json!(description));
        }
        for key in [
            "userId",
            "sessionId",
            "actionId",
            "projectRoot",
            "sandboxed",
            "agentId",
        ] {
            if let Some(value) = context.get(key) {
                spec.insert(key.into(), value.clone());
            }
        }

        let result = self
            .call("terminalRun", vec![Value::Object(spec)], host)
            .await?;

        if result.get("cancelled").map(truthy).unwrap_or(false) {
            return Ok(fail("Cancelled"));
        }
        if let Some(error) = result.get("error").filter(|value| !value.is_null()) {
            return Ok(fail(js_text(error)));
        }

        let raw_output = result.get("output").map(js_text).unwrap_or_default();
        let output = truncate_terminal_tool_output(&raw_output, MAX_TERMINAL_TOOL_OUTPUT_CHARS);
        let exit_code = result.get("exitCode").cloned().unwrap_or(Value::Null);
        let timed_out = result.get("timedOut").map(truthy).unwrap_or(false);
        let result_terminal = result.get("terminalId").cloned().unwrap_or(Value::Null);
        let execution_id = result.get("executionId").cloned().unwrap_or(Value::Null);
        let watched = result.get("watched").map(truthy).unwrap_or(false);
        let startup_timed_out = result.get("startupTimedOut").map(truthy).unwrap_or(false);
        let needs_interaction = result.get("needsInteraction").map(truthy).unwrap_or(false);
        let pager_escaped = result.get("pagerEscaped").map(truthy).unwrap_or(false);

        let stats = if raw_output.chars().count() >= TERMINAL_OUTPUT_STATS_MIN_CHARS {
            let (total, lines, longest) = measure_terminal_output(&raw_output);
            Some((total, lines, longest))
        } else {
            None
        };

        let mut data = Map::new();
        data.insert("output".into(), json!(output));
        data.insert("exitCode".into(), exit_code.clone());
        data.insert("timedOut".into(), json!(timed_out));
        data.insert("terminalId".into(), result_terminal.clone());
        data.insert("executionId".into(), execution_id.clone());
        if let Some(value) = result.get("outputOffset") {
            data.insert("outputOffset".into(), value.clone());
        }
        if let Some(value) = result.get("outputEndOffset") {
            data.insert("outputEndOffset".into(), value.clone());
        }
        if let Some(value) = result.get("outputFilter") {
            data.insert("outputFilter".into(), value.clone());
        }
        if let Some((total, lines, longest)) = stats {
            data.insert(
                "outputStats".into(),
                json!({
                    "totalChars": total,
                    "lineCount": lines,
                    "longestLineChars": longest,
                }),
            );
            if let Some(flood) = describe_terminal_output_flood(total, lines, longest) {
                data.insert("outputFlood".into(), json!(flood));
            }
        }

        if is_background {
            let message = if startup_timed_out {
                "Command timed out (execution stopped)".to_string()
            } else if result.get("exitCode").map(Value::is_null).unwrap_or(true) {
                "Command completed (exit code unavailable)".to_string()
            } else {
                format!("Command completed (exit code {})", js_text(&exit_code))
            };
            let hint = if watched {
                format!(
                    "Command is running in terminal {}. Output below is a startup snapshot, not completion. Continue independent work; if you need its result, end your turn and completion will resume you automatically. Do not poll or rerun the command.",
                    js_text(&result_terminal)
                )
            } else {
                format!(
                    "Command is running in terminal {}, but could not be watched. No automatic completion notification will be sent.",
                    js_text(&result_terminal)
                )
            };
            let final_message = if startup_timed_out
                || !result.get("exitCode").map(Value::is_null).unwrap_or(true)
            {
                message
            } else {
                hint
            };
            return Ok(json!({
                "ok": true,
                "message": final_message,
                "data": Value::Object(data),
            }));
        }

        if timed_out {
            let message = format!(
                "Command is still running after the {yield_ms}ms initial wait. Continue independent work or await automatic completion. Use terminal.execution with terminalId and executionId to inspect progress or cancel; do not rerun it."
            );
            return Ok(json!({
                "ok": true,
                "message": message,
                "data": Value::Object(data),
            }));
        }

        let ok = exit_code.as_i64().map(|code| code == 0).unwrap_or(false);
        let reason = if timed_out {
            format!("timed out after {timeout_ms}ms")
        } else if exit_code.is_null() {
            "exit code unavailable".to_string()
        } else {
            format!("exit code {}", js_text(&exit_code))
        };
        let mut message = if ok {
            "Command completed (exit code 0)".to_string()
        } else {
            format!("Command failed ({reason})")
        };
        if let Some(flood) = data.get("outputFlood").and_then(Value::as_str) {
            message.push_str(&format!("\n\n{flood}"));
        }
        if needs_interaction || pager_escaped {
            message.push_str(" (interactive prompt detected)");
        }

        Ok(json!({
            "ok": ok,
            "message": message,
            "data": Value::Object(data),
        }))
    }

    /// Stop a running managed execution (`terminal.execution` cancel path).
    pub async fn stop_execution(&self, terminal_id: &str, host: &C) -> Result<Value, HostError> {
        self.call("terminalExecutionStop", vec![json!(terminal_id)], host)
            .await
    }
}
