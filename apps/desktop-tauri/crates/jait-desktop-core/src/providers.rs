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
use std::collections::HashMap;
use std::sync::Arc;

// The process-spawning engine lives in `runner.rs` (claude-print + codex rpc
// engines); this module keeps the registry bookkeeping + runtime detection the
// Tauri glue uses for `provider-op:*`, and re-exports the runner API.
pub use crate::runner::{ProviderEvent, RunnerHandle, RunnerRegistry, RunnerSpec};
pub use crate::types::ProviderSessionRequest;

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
    pub fn new() -> Self { Self::default() }

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
    let names = match provider {
        "codex" => vec!["codex"],
        "claude-code" | "claude" => vec!["claude"],
        other => vec![other],
    };
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in path_env.split(':') {
            for name in &names {
                let p = std::path::Path::new(dir).join(name);
                if p.exists() {
                    return ProviderRuntime {
                        mode: "cli".into(),
                        command: p.to_string_lossy().into_owned(),
                    };
                }
            }
        }
    }
    if let Some(home) = dirs::home_dir() {
        for name in &names {
            let p = home.join(".jait").join("bin").join(name);
            if p.exists() {
                return ProviderRuntime {
                    mode: "bundled".into(),
                    command: p.to_string_lossy().into_owned(),
                };
            }
        }
    }
    ProviderRuntime { mode: "missing".into(), command: String::new() }
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
        let req = ProviderSessionRequest { provider: "codex".into(), model: None, max_turns: None };
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
    fn runtime_detection_reports_missing() {
        let rt = detect_runtime("definitely-not-a-real-provider-cli-xyz");
        assert_eq!(rt.mode, "missing");
    }
}