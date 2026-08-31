//! runner — remote agent session runner (UI-free port of the provider
//! slices of `apps/desktop/src/electron-main.ts`).
//!
//! Two child-process engines, mirroring the Electron layer:
//!
//! - **claude-print** (mirror of the claude-code `start-session`/`send-turn`
//!   branch): spawns
//!   `claude --print --output-format stream-json --include-partial-messages
//!   --verbose --session-id <id>` per turn, writes the prompt to stdin (the
//!   Electron layer notes the positional-arg form overflows the Windows
//!   8191-char cmd.exe limit for real turns), and relays every stdout line as
//!   `ProviderEvent::Line`. Exit code 0 maps to `ProviderEvent::TurnCompleted`.
//! - **codex rpc** (mirror of the codex branch): spawns `codex app-server`,
//!   performs the `initialize` → `thread/start` handshake once per session,
//!   then per turn sends `turn/start` and waits for the `turn/completed`
//!   notification. The app-server stays alive across turns.
//!
//! Event delivery is channel + closure based (same shape as `term.rs`): the
//! Tauri layer forwards these as `DesktopEvent::ProviderEvent` and
//! `DesktopEvent::ProviderExit`.

use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

const RPC_TIMEOUT: Duration = Duration::from_secs(45);
const TURN_TIMEOUT: Duration = Duration::from_secs(600);
/// Cap for the retained stderr excerpt (mirrors appendProviderStderr sizing).
const STDERR_TAIL_CAP: usize = 8 * 1024;

// ── Spec ────────────────────────────────────────────────────────────────────

/// Spawn spec for one provider session (mirrors the `start-session` params).
#[derive(Debug, Clone)]
pub struct RunnerSpec {
    /// Stable session id — used as the Claude `--session-id` and registry key.
    pub session_id: String,
    /// "claude-code" | "codex"
    pub provider: String,
    pub working_directory: String,
    /// "full-access" → skip-permissions / danger-full-access; anything else is
    /// the default/sandboxed pair (mirrors `resolveRemoteCodexThreadConfig`).
    pub mode: String,
    /// Optional `--model` / thread model override.
    pub model: Option<String>,
    /// Optional Claude `--effort` / codex turn `effort`.
    pub reasoning_effort: Option<String>,
    /// Extra env layered over the inherited parent env.
    pub env: HashMap<String, String>,
}

impl RunnerSpec {
    fn full_access(&self) -> bool { self.mode == "full-access" }
}

/// Resolves the actual argv to spawn. The default impl resolves the provider
/// CLI from PATH then `~/.jait/bin` (mirroring `getProviderRuntime`); tests
/// plug in fake CLI scripts.
pub trait CommandResolver: Send + Sync {
    fn resolve(&self, provider: &str) -> Option<ResolvedCommand>;
}

#[derive(Debug, Clone)]
pub struct ResolvedCommand {
    pub program: String,
    /// Extra fixed args prepended to the engine's own args (e.g. a script
    /// interpreter in tests).
    pub args: Vec<String>,
}

/// Default resolver: PATH first, then the bundled `~/.jait/bin/<cli>` layout.
pub struct PathCommandResolver;

impl CommandResolver for PathCommandResolver {
    fn resolve(&self, provider: &str) -> Option<ResolvedCommand> {
        let names: &[&str] = match provider {
            "claude-code" | "claude" => &["claude"],
            "codex" => &["codex"],
            other => &[other],
        };
        if let Ok(path_env) = std::env::var("PATH") {
            for dir in path_env.split(':') {
                for name in names {
                    let p = std::path::Path::new(dir).join(name);
                    if p.exists() {
                        return Some(ResolvedCommand {
                            program: p.to_string_lossy().into_owned(),
                            args: Vec::new(),
                        });
                    }
                }
            }
        }
        if let Some(home) = dirs::home_dir() {
            for name in names {
                let p = home.join(".jait").join("bin").join(name);
                if p.exists() {
                    return Some(ResolvedCommand {
                        program: p.to_string_lossy().into_owned(),
                        args: Vec::new(),
                    });
                }
            }
        }
        None
    }
}

// ── Events ──────────────────────────────────────────────────────────────────

/// Events relayed to the renderer, mirroring `sendProviderEvent`.
/// Serializes as a flat tagged object: `{ "type": "provider.turn-started",
/// "sessionId": "…" }` — the same shape the Electron layer emitted.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type")]
pub enum ProviderEvent {
    /// The turn was accepted and the child is running.
    #[serde(rename = "provider.turn-started")]
    TurnStarted { session_id: String },
    /// One raw stdout line from the provider CLI (NDJSON already split).
    #[serde(rename = "provider.line")]
    Line { session_id: String, line: String },
    /// Turn finished: exit code 0 (claude) or `turn/completed` (codex).
    #[serde(rename = "provider.turn-completed")]
    TurnCompleted { session_id: String },
    /// The user requested a stop; the session child was torn down.
    #[serde(rename = "provider.stopped")]
    Stopped { session_id: String },
    /// The turn failed; carries the reason (stderr excerpt included).
    #[serde(rename = "provider.error")]
    Error { session_id: String, message: String },
}

/// A registered provider session bookkeeping entry.
#[derive(Debug)]
pub struct RunnerSession {
    pub session_id: String,
    pub spec: RunnerSpec,
    pub child_pid: Mutex<Option<u32>>,
    pub alive: AtomicBool,
}

#[derive(Default)]
pub struct RunnerRegistry {
    map: Mutex<HashMap<String, Arc<RunnerSession>>>,
    order: Mutex<Vec<String>>,
}

const MAX_PROVIDER_SESSIONS: usize = 16; // mirrors remote-agent cap

impl RunnerRegistry {
    pub fn new() -> Self { Self::default() }

    fn put(&self, session: Arc<RunnerSession>) {
        let id = session.session_id.clone();
        self.map.lock().insert(id.clone(), session);
        self.order.lock().push(id);
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

    pub fn get(&self, session_id: &str) -> Option<Arc<RunnerSession>> {
        self.map.lock().get(session_id).cloned()
    }

    pub fn alive_ids(&self) -> Vec<String> {
        self.map
            .lock()
            .iter()
            .filter(|(_, s)| s.alive.load(Ordering::SeqCst))
            .map(|(k, _)| k.clone())
            .collect()
    }

    /// Mark not-alive (mirrors `mark_dead`). Callers also invoke
    /// `RunnerHandle::stop` to tear the child process down.
    pub fn mark_dead(&self, session_id: &str) -> bool {
        match self.map.lock().get(session_id).cloned() {
            Some(s) => {
                s.alive.store(false, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }
}

// ── Handle ──────────────────────────────────────────────────────────────────

/// Handle used to drive a session after `start`. The codex app-server child is
/// kept here (spawned lazily on the first turn) so `stop` can kill it.
#[derive(Clone)]
pub struct RunnerHandle {
    pub session_id: String,
    spec: RunnerSpec,
    event_tx: mpsc::Sender<ProviderEvent>,
    stop_flag: Arc<AtomicBool>,
    turn_running: Arc<AtomicBool>,
    session_pid: Arc<Mutex<Option<u32>>>,
    codex_child: Arc<Mutex<Option<Child>>>,
    codex_state: Arc<Mutex<CodexTurnState>>,
}

struct CodexTurnState {
    thread_id: Option<String>,
    next_rpc_id: u64,
    pending: HashMap<u64, mpsc::Sender<Result<Value, String>>>,
    turn_notify: Option<mpsc::Sender<Result<(), String>>>,
}

// ── Start ───────────────────────────────────────────────────────────────────

/// Register a provider session. No process is spawned until the first turn
/// (claude is one-shot per turn; codex app-server is kept alive across turns).
pub fn start(
    registry: &RunnerRegistry,
    _resolver: &dyn CommandResolver,
    spec: RunnerSpec,
    on_event: impl Fn(ProviderEvent) + Send + 'static,
) -> Result<RunnerHandle, String> {
    let session = Arc::new(RunnerSession {
        session_id: spec.session_id.clone(),
        spec: spec.clone(),
        child_pid: Mutex::new(None),
        alive: AtomicBool::new(true),
    });
    registry.put(session);

    let (event_tx, event_rx) = mpsc::channel::<ProviderEvent>();
    std::thread::spawn(move || {
        while let Ok(event) = event_rx.recv() {
            on_event(event);
        }
    });

    Ok(RunnerHandle {
        session_id: spec.session_id.clone(),
        event_tx,
        stop_flag: Arc::new(AtomicBool::new(false)),
        turn_running: Arc::new(AtomicBool::new(false)),
        session_pid: Arc::new(Mutex::new(None)),
        codex_child: Arc::new(Mutex::new(None)),
        codex_state: Arc::new(Mutex::new(CodexTurnState {
            thread_id: None,
            next_rpc_id: 1,
            pending: HashMap::new(),
            turn_notify: None,
        })),
        spec,
    })
}

// ── Spawn helpers ───────────────────────────────────────────────────────────

fn spawn_cli(
    resolved: &ResolvedCommand,
    engine_args: &[String],
    spec: &RunnerSpec,
) -> Result<Child, String> {
    let mut cmd = Command::new(&resolved.program);
    cmd.args(resolved.args.iter().chain(engine_args.iter()));
    cmd.current_dir(&spec.working_directory);
    for (k, v) in &spec.env {
        cmd.env(k, v);
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).stdin(Stdio::piped());
    cmd.spawn().map_err(|e| format!("failed to spawn {}: {e}", resolved.program))
}

/// Shared stderr tail used to decorate error messages (mirrors
/// `appendProviderStderr`).
type StderrTail = Arc<Mutex<String>>;

fn drain_stderr(stderr: ChildStderr, tail: StderrTail) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            let mut t = tail.lock();
            t.push_str(line.trim_end());
            t.push('\n');
            if t.len() > STDERR_TAIL_CAP {
                let cut = t.len() - STDERR_TAIL_CAP;
                t.drain(..cut);
            }
        }
    });
}

/// Relay stdout lines as events; blocks until EOF so callers can join.
fn drain_stdout(stdout: ChildStdout, session_id: String, event_tx: &mpsc::Sender<ProviderEvent>) {
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }
        let _ = event_tx.send(ProviderEvent::Line {
            session_id: session_id.clone(),
            line,
        });
    }
}

// ── Argv + JSON-RPC bodies (Electron parity) ───────────────────────────────

fn claude_argv(spec: &RunnerSpec) -> Vec<String> {
    let mut argv = vec![
        "--print".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--include-partial-messages".into(),
        "--verbose".into(),
        // A dedicated per-process session id; Jait owns continuity via stdin.
        "--session-id".into(),
        spec.session_id.clone(),
    ];
    if spec.full_access() {
        argv.push("--dangerously-skip-permissions".into());
    } else {
        argv.push("--permission-mode".into());
        argv.push("default".into());
    }
    if let Some(model) = &spec.model {
        argv.push("--model".into());
        argv.push(model.clone());
    }
    if let Some(effort) = &spec.reasoning_effort {
        argv.push("--effort".into());
        argv.push(effort.clone());
    }
    argv
}

fn codex_app_server_argv() -> Vec<String> {
    vec!["app-server".into()]
}

fn codex_handshake_body() -> Value {
    json!({
        "clientInfo": { "name": "jait-remote", "title": "Jait Remote Provider", "version": "1.0.0" },
        "capabilities": { "experimentalApi": true },
    })
}

fn codex_thread_body(spec: &RunnerSpec) -> Value {
    // Mirrors resolveRemoteCodexThreadConfig(mode).
    json!({
        "model": spec.model,
        "cwd": spec.working_directory,
        "approvalPolicy": if spec.full_access() { "never" } else { "on-request" },
        "sandbox": if spec.full_access() { "danger-full-access" } else { "workspace-write" },
        "experimentalRawEvents": false,
    })
}

fn send_rpc(
    stdin: &mut ChildStdin,
    codex: &Mutex<CodexTurnState>,
    method: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value, String> {
    let (tx, rx) = mpsc::channel();
    // Take the lock only to register the pending sender — the response pump
    // needs the same lock to resolve it, so it must be released before we wait.
    let id = {
        let mut c = codex.lock();
        let id = c.next_rpc_id;
        c.next_rpc_id += 1;
        c.pending.insert(id, tx);
        id
    };
    let wire = json!({ "id": id, "method": method, "params": params });
    stdin
        .write_all(wire.to_string().as_bytes())
        .and_then(|_| stdin.write_all(b"\n"))
        .and_then(|_| stdin.flush())
        .map_err(|e| format!("rpc write failed: {e}"))?;
    match rx.recv_timeout(timeout) {
        // Ok(Ok(v)): rpc response payload; Ok(Err(e)): JSON-RPC error response.
        Ok(Ok(value)) => Ok(value),
        Ok(Err(text)) => Err(text),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            codex.lock().pending.remove(&id);
            Err(format!("rpc {method} timed out"))
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => Err(format!("rpc {method} dropped")),
    }
}

/// Read-loop for the codex app-server: resolves pending rpcs by id, forwards
/// notifications as events, settles the active turn on `turn/completed` /
/// error notifications, and reports EOF via `exit_tx`.
fn pump_codex(
    stdout: ChildStdout,
    stderr: ChildStderr,
    session_id: String,
    event_tx: mpsc::Sender<ProviderEvent>,
    exit_tx: mpsc::Sender<()>,
    codex: Arc<Mutex<CodexTurnState>>,
    stderr_tail: StderrTail,
) {
    drain_stderr(stderr, stderr_tail);
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            let Ok(msg) = serde_json::from_str::<Value>(&line) else {
                // Non-JSON output (upgrade banners etc.) still forwards.
                let _ = event_tx.send(ProviderEvent::Line {
                    session_id: session_id.clone(),
                    line,
                });
                continue;
            };
            // JSON-RPC response: settle the pending sender for this id.
            if msg.get("id").is_some() {
                if let Some(id) = msg["id"].as_u64() {
                    let pending = codex.lock().pending.remove(&id);
                    if let Some(tx) = pending {
                        if let Some(err) = msg.get("error") {
                            let text = err
                                .get("message")
                                .and_then(Value::as_str)
                                .unwrap_or("rpc error")
                                .to_string();
                            let _ = tx.send(Err(text));
                        } else {
                            let _ = tx.send(Ok(msg.get("result").cloned().unwrap_or(Value::Null)));
                        }
                    }
                }
                continue;
            }
            // Notification — relay verbatim like sendProviderEvent does.
            let _ = event_tx.send(ProviderEvent::Line {
                session_id: session_id.clone(),
                line,
            });
            let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
            if method == "turn/completed" {
                let notify = codex.lock().turn_notify.take();
                if let Some(tx) = notify {
                    let _ = tx.send(Ok(()));
                }
            } else if matches!(method, "session/error" | "error" | "turn/failed") {
                let message = msg
                    .get("error")
                    .or_else(|| msg.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("codex turn failed")
                    .to_string();
                let notify = codex.lock().turn_notify.take();
                if let Some(tx) = notify {
                    let _ = tx.send(Err(message));
                }
            }
        }
        let _ = exit_tx.send(());
    });
}

// ── Turn engine ─────────────────────────────────────────────────────────────

impl RunnerHandle {
    /// Run one user turn to completion. Mirrors the Electron `send-turn` op:
    /// reject if a turn is already running, relay every stdout line as an
    /// event, resolve after `turn/completed`, error on non-zero exit / rpc
    /// failure (stderr excerpt appended).
    pub fn send_turn(&self, resolver: &dyn CommandResolver, message: &str) -> Result<(), String> {
        if self.turn_running.swap(true, Ordering::SeqCst) {
            return Err(format!("turn already running for session {}", self.session_id));
        }
        let result = self.send_turn_inner(resolver, message);
        self.turn_running.store(false, Ordering::SeqCst);
        result
    }

    fn send_turn_inner(&self, resolver: &dyn CommandResolver, message: &str) -> Result<(), String> {
        let _ = self.event_tx.send(ProviderEvent::TurnStarted {
            session_id: self.session_id.clone(),
        });
        match self.spec.provider.as_str() {
            "claude-code" | "claude" => self.claude_turn(resolver, message),
            "codex" => self.codex_turn(resolver, message),
            other => Err(format!("provider {other} has no runner engine")),
        }
    }

    fn claude_turn(&self, resolver: &dyn CommandResolver, message: &str) -> Result<(), String> {
        let resolved = resolver
            .resolve("claude-code")
            .ok_or("provider CLI not found for claude-code (checked PATH and ~/.jait/bin)")?;
        let argv = claude_argv(&self.spec);
        let mut child = spawn_cli(&resolved, &argv, &self.spec)?;
        *self.session_pid.lock() = Some(child.id());

        let mut stdin = child.stdin.take().ok_or("claude stdin unavailable")?;
        let stderr = child.stderr.take().ok_or("claude stderr unavailable")?;
        let stdout = child.stdout.take().ok_or("claude stdout unavailable")?;
        let stderr_tail: StderrTail = Arc::new(Mutex::new(String::new()));
        drain_stderr(stderr, stderr_tail.clone());

        // Long prompts go over stdin (Windows 8191-char cmd.exe cap).
        stdin
            .write_all(message.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|e| format!("claude stdin write failed: {e}"))?;
        drop(stdin);

        let event_tx = self.event_tx.clone();
        let session_id = self.session_id.clone();
        let out_thread = std::thread::spawn(move || {
            drain_stdout(stdout, session_id, &event_tx);
        });

        let status = child.wait().map_err(|e| format!("claude wait failed: {e}"))?;
        let _ = out_thread.join();
        *self.session_pid.lock() = None;

        if self.stop_flag.load(Ordering::SeqCst) {
            let _ = self.event_tx.send(ProviderEvent::Stopped {
                session_id: self.session_id.clone(),
            });
            return Ok(());
        }
        if status.success() {
            let _ = self.event_tx.send(ProviderEvent::TurnCompleted {
                session_id: self.session_id.clone(),
            });
            Ok(())
        } else {
            let code = status.code().unwrap_or(-1);
            let tail = stderr_tail.lock().trim().to_string();
            let message = if tail.is_empty() {
                format!("claude-code exited with code {code}")
            } else {
                format!("claude-code exited with code {code}: {tail}")
            };
            let _ = self.event_tx.send(ProviderEvent::Error {
                session_id: self.session_id.clone(),
                message: message.clone(),
            });
            Err(message)
        }
    }

    fn codex_turn(&self, resolver: &dyn CommandResolver, message: &str) -> Result<(), String> {
        // Lazily spawn + handshake the long-lived app-server.
        if self.codex_child.lock().is_none() {
            self.spawn_codex(resolver)?;
        }

        // Register the turn notifier before turn/start to avoid races.
        let (notify_tx, notify_rx) = mpsc::channel::<Result<(), String>>();
        self.codex_state.lock().turn_notify = Some(notify_tx);

        let thread_id = self
            .codex_state
            .lock()
            .thread_id
            .clone()
            .unwrap_or_else(|| self.spec.session_id.clone());
        let started: Result<(), String> = {
            let mut guard = self.codex_child.lock();
            let child = guard.as_mut().ok_or("codex session stopped")?;
            let stdin = child.stdin.as_mut().ok_or("codex stdin closed")?;
            let mut params = json!({
                "threadId": thread_id,
                "input": [{ "type": "text", "text": message, "text_elements": [] }],
            });
            if let Some(effort) = &self.spec.reasoning_effort {
                params["effort"] = json!(effort);
            }
            send_rpc(stdin, &self.codex_state, "turn/start", params, RPC_TIMEOUT).map(|_| ())
        };
        // A failed turn/start (rpc error, closed stdin) must still relay an
        // Error event to the renderer — parity with the claude failure path.
        if let Err(message) = &started {
            let _ = self.event_tx.send(ProviderEvent::Error {
                session_id: self.session_id.clone(),
                message: message.clone(),
            });
            return started;
        }

        let settle = notify_rx
            .recv_timeout(TURN_TIMEOUT)
            .unwrap_or_else(|_| Err("codex turn timed out".into()));
        if settle.is_ok() {
            let _ = self.event_tx.send(ProviderEvent::TurnCompleted {
                session_id: self.session_id.clone(),
            });
        } else {
            let message = settle.as_ref().err().cloned().unwrap_or_default();
            let _ = self.event_tx.send(ProviderEvent::Error {
                session_id: self.session_id.clone(),
                message: message.clone(),
            });
        }
        settle
    }

    fn spawn_codex(&self, resolver: &dyn CommandResolver) -> Result<(), String> {
        let resolved = resolver
            .resolve("codex")
            .ok_or("provider CLI not found for codex (checked PATH and ~/.jait/bin)")?;
        let mut child = spawn_cli(&resolved, &codex_app_server_argv(), &self.spec)?;
        *self.session_pid.lock() = Some(child.id());

        // Start the stdout pump BEFORE the handshake: it resolves pending rpcs,
        // relays notifications, and settles turns. stderr goes to the shared
        // tail. Without this the handshake responses would never be read.
        let (exit_tx, exit_rx) = mpsc::channel::<()>();
        let stderr_tail: StderrTail = Arc::new(Mutex::new(String::new()));
        let stderr = child.stderr.take().ok_or("codex stderr unavailable")?;
        let stdout = child.stdout.take().ok_or("codex stdout unavailable")?;
        pump_codex(
            stdout,
            stderr,
            self.session_id.clone(),
            self.event_tx.clone(),
            exit_tx,
            self.codex_state.clone(),
            stderr_tail.clone(),
        );

        // Handshake: initialize → thread/start (thread id comes back here).
        let stdin = child.stdin.as_mut().ok_or("codex stdin unavailable")?;
        send_rpc(stdin, &self.codex_state, "initialize", codex_handshake_body(), RPC_TIMEOUT)?;
        let thread_result =
            send_rpc(stdin, &self.codex_state, "thread/start", codex_thread_body(&self.spec), RPC_TIMEOUT)?;
        let thread_id = thread_result
            .pointer("/thread/id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| self.spec.session_id.clone());
        self.codex_state.lock().thread_id = Some(thread_id);
        *self.codex_child.lock() = Some(child);

        // Fail fast if the pump already saw EOF (early exit / auth failure).
        if exit_rx.recv_timeout(Duration::from_millis(250)).is_ok() {
            *self.codex_child.lock() = None;
            let tail = stderr_tail.lock().trim().to_string();
            if !tail.is_empty() {
                return Err(format!("codex app-server exited during startup: {tail}"));
            }
            return Err("codex app-server exited during startup".into());
        }
        Ok(())
    }

    /// Stop the session: kill the codex app-server / flag the claude turn,
    /// mirroring the Electron stop-session op.
    pub fn stop(&self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        if let Some(mut child) = self.codex_child.lock().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        {
            let mut codex = self.codex_state.lock();
            codex.turn_notify = None;
            codex.pending.clear();
        }
        let _ = self.event_tx.send(ProviderEvent::Stopped {
            session_id: self.session_id.clone(),
        });
    }
}

#[cfg(test)]
mod tests;