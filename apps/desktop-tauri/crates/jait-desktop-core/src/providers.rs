//! providers — remote agent session runner (mirror of
//! apps/desktop/src/remote-agent.ts + remote-provider-runtime.ts).
//!
//! The Electron layer spawns the provider CLI as a long-lived child process:
//!   - codex:  `codex proto`
//!   - claude: `claude --print --output-format=stream-json --verbose ...`
//! Session input arrives via `desktop:agent-op` with
//! `{ op: "agent-session-input", sessionId, payload }`; each stdout line is
//! forwarded as a `DesktopEvent::ProviderMessage { sessionId, line }`.
//! Exit emits `DesktopEvent::ProviderExit { sessionId, code, stderr }`.
//!
//! Runtime detection (getProviderRuntime): CLI on PATH else `bundled`
//! (Electron ships a managed copy under userData/bin). Rust version checks
//! PATH first, then `~/.jait/bin/<provider>` as the bundled fallback.

use crate::types::*;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;

// The process-spawning engine lives in `runner.rs` (claude-print + codex rpc
// engines); this module keeps the registry bookkeeping + runtime detection the
// Tauri glue uses for `provider-op:*`, and re-exports the runner API.
pub use crate::runner::{ProviderEvent, RunnerHandle, RunnerRegistry, RunnerSpec};
pub use crate::types::ProviderSessionRequest;

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_code_input: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_prompt: Option<String>,
}

impl DeviceAuthDetails {
    pub fn is_complete(&self) -> bool {
        (self.verification_uri.is_some() && self.user_code.is_some())
            || self.requires_code_input == Some(true)
    }
}

/// Parse the browser URL and device code printed by provider login commands.
pub fn extract_device_auth_details(output: &str) -> DeviceAuthDetails {
    let clean = strip_ansi(output);
    let lines: Vec<&str> = clean
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let verification_uri = clean
        .split_whitespace()
        .find(|word| word.starts_with("https://") || word.starts_with("http://"))
        .map(|word| {
            word.trim_end_matches(&['.', ',', ';', ':', ')', '\'', '"'][..])
                .to_string()
        });

    let mut user_code = None;
    for (index, line) in lines.iter().enumerate() {
        let lower = line.to_ascii_lowercase();
        if lower.contains("one-time code")
            || lower.contains("user code")
            || lower.contains("enter the code")
        {
            for candidate in lines.iter().skip(index + 1).take(2) {
                if let Some(code) = normalize_device_code(candidate) {
                    user_code = Some(code);
                    break;
                }
            }
        }
        if user_code.is_some() {
            break;
        }
    }

    let input_prompt = if user_code.is_none() {
        lines.iter().find_map(|line| {
            let lower = line.to_ascii_lowercase();
            (lower.contains("authorization code") || lower.contains("code from your browser"))
                .then(|| line.trim_end_matches(&[':', ' '][..]).to_string())
        })
    } else {
        None
    };

    DeviceAuthDetails {
        verification_uri,
        user_code,
        requires_code_input: input_prompt.as_ref().map(|_| true),
        input_prompt,
    }
}

fn normalize_device_code(line: &str) -> Option<String> {
    let candidate = line
        .split_whitespace()
        .find(|word| {
            let trimmed = word.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-');
            trimmed.contains('-')
                && trimmed.len() >= 8
                && trimmed
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-')
        })?
        .trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-')
        .to_ascii_uppercase();
    Some(candidate)
}

fn strip_ansi(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            result.push(ch);
            continue;
        }
        if chars.next_if_eq(&'[').is_some() {
            for next in chars.by_ref() {
                if ('@'..='~').contains(&next) {
                    break;
                }
            }
        }
    }
    result
}

#[derive(Debug)]
pub struct ProviderSession {
    pub session_id: String,
    pub provider: String,
    pub project_path: String,
    pub cwd: String,
    pub alive: Mutex<bool>,
}

#[derive(Default)]
pub struct ProviderSessionRegistry {
    map: Mutex<HashMap<String, Arc<ProviderSession>>>,
    order: Mutex<Vec<String>>,
}

impl ProviderSessionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn put(&self, session: Arc<ProviderSession>) {
        let id = session.session_id.clone();
        self.map.lock().insert(id.clone(), session);
        self.order.lock().push(id);
        // Mirror remote-agent MAX_PROVIDER_SESSIONS = 16, dropping oldest.
        const MAX_PROVIDER_SESSIONS: usize = 16;
        let mut map = self.map.lock();
        let mut order = self.order.lock();
        while map.len() > MAX_PROVIDER_SESSIONS {
            if let Some(oldest) = order.first().cloned() {
                map.remove(&oldest);
                order.remove(0);
            } else {
                break;
            }
        }
    }

    pub fn get(&self, session_id: &str) -> Option<Arc<ProviderSession>> {
        self.map.lock().get(session_id).cloned()
    }

    pub fn mark_dead(&self, session_id: &str) {
        if let Some(s) = self.map.lock().get(session_id) {
            *s.alive.lock() = false;
        }
    }

    pub fn alive_ids(&self) -> Vec<String> {
        self.map
            .lock()
            .iter()
            .filter(|(_, s)| *s.alive.lock())
            .map(|(k, _)| k.clone())
            .collect()
    }
}

/// Mirrors remote-provider-runtime getProviderRuntime: PATH first, then the
/// bundled fallback layout under ~/.jait/bin (userData/bin in Electron).
pub fn detect_runtime(provider: &str) -> ProviderRuntime {
    let path = std::env::var_os("PATH").unwrap_or_default();
    detect_runtime_in(
        provider,
        std::env::split_paths(&path),
        dirs::home_dir().as_deref(),
        cfg!(windows),
    )
}

fn detect_runtime_in(
    provider: &str,
    paths: impl IntoIterator<Item = std::path::PathBuf>,
    home: Option<&std::path::Path>,
    windows: bool,
) -> ProviderRuntime {
    let name = match provider {
        "claude-code" | "claude" => "claude",
        other => other,
    };
    // npm installs both a Unix shell script and a .cmd shim on Windows.
    // Prefer native executables, and never choose the extensionless shell script there.
    let names = if windows && std::path::Path::new(name).extension().is_none() {
        vec![
            format!("{name}.exe"),
            format!("{name}.com"),
            format!("{name}.cmd"),
            format!("{name}.bat"),
        ]
    } else {
        vec![name.to_string()]
    };
    let directories = paths
        .into_iter()
        .map(|dir| (dir, "cli"))
        .chain(home.map(|dir| (dir.join(".jait").join("bin"), "bundled")));
    for (dir, mode) in directories {
        for name in &names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return ProviderRuntime {
                    mode: mode.into(),
                    command: candidate.to_string_lossy().into_owned(),
                };
            }
        }
    }
    ProviderRuntime {
        mode: "missing".into(),
        command: String::new(),
    }
}

/// Build the argv for a session spawn, mirroring spawnProviderProcess:
///   codex  → ["proto"]
///   claude → ["--print", "--output-format=stream-json", "--verbose",
///             "--max-turns", n, + model]
pub fn provider_argv(provider: &str, req: &ProviderSessionRequest) -> Vec<String> {
    match provider {
        "codex" => vec!["proto".into()],
        "claude-code" | "claude" => {
            let mut argv = vec![
                "--print".into(),
                "--output-format=stream-json".into(),
                "--verbose".into(),
                "--max-turns".into(),
                req.max_turns.unwrap_or(200).to_string(),
            ];
            if let Some(model) = &req.model {
                argv.push("--model".into());
                argv.push(model.clone());
            }
            argv
        }
        _ => Vec::new(),
    }
}

// ── Runner bridging ─────────────────────────────────────────────────────────

/// Build a `RunnerSpec` from a renderer session request (mirrors the
/// `start-session` param assembly in electron-main.ts / remote-agent.ts).
pub fn to_runner_spec(
    session_id: &str,
    req: &ProviderSessionRequest,
    working_directory: &str,
    mode: &str,
    env: HashMap<String, String>,
) -> RunnerSpec {
    RunnerSpec {
        session_id: session_id.to_string(),
        provider: req.provider.clone(),
        working_directory: working_directory.to_string(),
        mode: mode.to_string(),
        model: req.model.clone(),
        reasoning_effort: None,
        env,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_windows_cli_and_npm_shims() {
        let root = std::env::temp_dir().join(format!("jait-provider-{}", uuid::Uuid::new_v4()));
        let bin = root.join("Program Files").join("nodejs");
        std::fs::create_dir_all(&bin).unwrap();
        // The extensionless npm file is a shell script, not a Windows executable.
        std::fs::write(bin.join("codex"), "#!/bin/sh").unwrap();
        assert_eq!(
            detect_runtime_in("codex", [bin.clone()], None, true).mode,
            "missing"
        );
        std::fs::write(bin.join("codex.cmd"), "@echo off").unwrap();
        let runtime = detect_runtime_in("codex", [bin.clone()], None, true);
        assert_eq!(runtime.mode, "cli");
        assert_eq!(runtime.command, bin.join("codex.cmd").to_string_lossy());
        std::fs::write(bin.join("codex.exe"), "native").unwrap();
        assert_eq!(
            detect_runtime_in("codex", [bin.clone()], None, true).command,
            bin.join("codex.exe").to_string_lossy()
        );
        std::fs::create_dir(bin.join("claude.exe")).unwrap();
        assert_eq!(
            detect_runtime_in("claude-code", [bin.clone()], None, true).mode,
            "missing"
        );
        let bundled = root.join(".jait").join("bin");
        std::fs::create_dir_all(&bundled).unwrap();
        std::fs::write(bundled.join("claude.exe"), "native").unwrap();
        let runtime = detect_runtime_in("claude-code", [bin], Some(&root), true);
        assert_eq!(runtime.mode, "bundled");
        assert_eq!(
            runtime.command,
            bundled.join("claude.exe").to_string_lossy()
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn detects_cli_in_later_native_path_entry() {
        let root = std::env::temp_dir().join(format!("jait-provider-{}", uuid::Uuid::new_v4()));
        let bin = root.join("CLI Tools");
        std::fs::create_dir_all(&bin).unwrap();
        let filename = if cfg!(windows) { "codex.cmd" } else { "codex" };
        std::fs::write(bin.join(filename), "test").unwrap();
        let path = std::env::join_paths([root.join("missing"), bin.clone()]).unwrap();
        let runtime = detect_runtime_in("codex", std::env::split_paths(&path), None, cfg!(windows));
        assert_eq!(runtime.mode, "cli");
        assert_eq!(runtime.command, bin.join(filename).to_string_lossy());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn registry_evicts_oldest_beyond_cap() {
        let reg = ProviderSessionRegistry::new();
        for i in 0..20 {
            reg.put(Arc::new(ProviderSession {
                session_id: format!("s-{i}"),
                provider: "codex".into(),
                project_path: ".".into(),
                cwd: ".".into(),
                alive: Mutex::new(true),
            }));
        }
        assert!(reg.get("s-0").is_none(), "oldest evicted");
        assert!(reg.get("s-19").is_some(), "newest kept");
    }

    #[test]
    fn codex_argv_is_proto() {
        let req = ProviderSessionRequest {
            provider: "codex".into(),
            model: None,
            max_turns: None,
        };
        assert_eq!(provider_argv("codex", &req), vec!["proto"]);
    }

    #[test]
    fn claude_argv_has_stream_json_flags() {
        let req = ProviderSessionRequest {
            provider: "claude-code".into(),
            model: Some("sonnet".into()),
            max_turns: Some(42),
        };
        let argv = provider_argv("claude-code", &req);
        assert!(argv.contains(&"--print".to_string()));
        assert!(argv.contains(&"--output-format=stream-json".to_string()));
        assert!(argv.contains(&"42".to_string()));
        assert!(argv.contains(&"sonnet".to_string()));
    }

    #[test]
    fn extracts_codex_device_login_details() {
        let details = extract_device_auth_details(
            "Welcome to Codex\nOpen https://auth.openai.com/codex/device\nEnter this one-time code:\nAB12-CD34E\n",
        );
        assert_eq!(
            details,
            DeviceAuthDetails {
                verification_uri: Some("https://auth.openai.com/codex/device".into()),
                user_code: Some("AB12-CD34E".into()),
                requires_code_input: None,
                input_prompt: None,
            }
        );
        assert!(details.is_complete());
    }

    #[test]
    fn runtime_detection_reports_missing() {
        let rt = detect_runtime("definitely-not-a-real-provider-cli-xyz");
        assert_eq!(rt.mode, "missing");
    }
}
