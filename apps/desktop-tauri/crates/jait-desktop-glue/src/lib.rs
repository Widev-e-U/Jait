//! `jait-desktop-glue` — channel-level host for the Tauri shell.
//!
//! Mirrors the Electron host (`apps/desktop/src/electron-main.ts` + preload shim):
//! every IPC channel becomes a `dispatch(channel, args)` call, and async host
//! events (provider output, terminal output/exit, background completion) are
//! fanned out to registered sinks exactly like `webContents.send` did.
//!
//! The crate is shell-agnostic so tests can drive every channel without a
//! webview; the `apps/desktop-tauri/tauri` shell binds sinks to `AppHandle::emit`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use jait_desktop_core as core;
use parking_lot::Mutex;
use serde_json::{json, Value};

/// Sink receives `(channel, payload)` pairs, mirroring `webContents.send`.
pub type HostSink = Arc<dyn Fn(&str, &Value) + Send + Sync>;

/// `serde_json::to_value` with the error mapped to `String` (dispatch error type).
fn to_json<T: serde::Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|e| e.to_string())
}

pub struct HostState {
    settings: core::settings::SettingsStore,
    terms: core::term::SessionRegistry,
    backgrounds: Arc<core::tools::BackgroundRegistry>,
    runners: core::runner::RunnerRegistry,
    /// Live runner handles keyed by session id (handles come out of
    /// `runner::start`; the registry only tracks bookkeeping state).
    handles: Mutex<HashMap<String, core::runner::RunnerHandle>>,
    resolver: Mutex<Box<dyn core::runner::CommandResolver>>,
    sinks: Mutex<Vec<HostSink>>,
    /// Overrides default keyring-backed credentials for tests / hosts without
    /// an OS credential store.
    credential_backend: Mutex<CredentialBackend>,
}

#[derive(Clone)]
enum CredentialBackend {
    Keyring,
    /// In-memory map (test host).
    Memory(Arc<Mutex<HashMap<String, String>>>),
}

/// One-shot PTY runtime — `SessionRegistry::start` is async and does its own
/// OS-thread spawning, so a throwaway current-thread runtime keeps dispatch sync.
fn block_pty<T>(fut: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("pty runtime")
        .block_on(fut)
}

impl HostState {
    pub fn new() -> Self {
        let dir = default_data_dir();
        Self::new_with_dir(dir)
    }

    pub fn new_with_dir(data_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&data_dir).ok();
        Self {
            settings: core::settings::SettingsStore::new(data_dir.join("settings.json")),
            terms: core::term::SessionRegistry::new(),
            backgrounds: Arc::new(core::tools::BackgroundRegistry::new()),
            runners: core::runner::RunnerRegistry::new(),
            handles: Mutex::new(HashMap::new()),
            resolver: Mutex::new(Box::new(core::runner::PathCommandResolver)),
            sinks: Mutex::new(Vec::new()),
            credential_backend: Mutex::new(CredentialBackend::Keyring),
        }
    }

    /// Test/alt-host hook: use an in-memory credential store.
    pub fn use_memory_credentials(&self) {
        *self.credential_backend.lock() =
            CredentialBackend::Memory(Arc::new(Mutex::new(HashMap::new())));
    }

    pub fn set_resolver(&self, resolver: Box<dyn core::runner::CommandResolver>) {
        *self.resolver.lock() = resolver;
    }

    pub fn add_sink(&self, sink: HostSink) {
        self.sinks.lock().push(sink);
    }

    fn emit(&self, channel: &str, payload: Value) {
        for sink in self.sinks.lock().iter() {
            sink(channel, &payload);
        }
    }

    fn credentials_write(&self, key: &str, value: &str) -> Result<(), String> {
        match &*self.credential_backend.lock() {
            CredentialBackend::Keyring => core::credentials::store(key, value),
            CredentialBackend::Memory(map) => {
                map.lock().insert(key.to_string(), value.to_string());
                Ok(())
            }
        }
    }

    fn credentials_read(&self, key: &str) -> Option<String> {
        match &*self.credential_backend.lock() {
            CredentialBackend::Keyring => core::credentials::get(key),
            CredentialBackend::Memory(map) => map.lock().get(key).cloned(),
        }
    }

    fn credentials_delete(&self, key: &str) -> Result<(), String> {
        match &*self.credential_backend.lock() {
            CredentialBackend::Keyring => core::credentials::clear(key),
            CredentialBackend::Memory(map) => {
                map.lock().remove(key);
                Ok(())
            }
        }
    }

    /// Single entry point mirroring electron-main.ts's ipcMain switch.
    pub fn dispatch(&self, channel: &str, args: &[Value]) -> Result<Value, String> {
        let arg = |i: usize| args.get(i).cloned().unwrap_or(Value::Null);
        match channel {
            // ── Host info ───────────────────────────────────────────────────
            "app-info" => Ok(json!({
                "platform": core::info::platform_name(),
                "version": core::info::host_version(),
                "deviceID": self.settings.device_id(),
            })),
            "desktop:host-info" => {
                let op = arg(0).as_str().unwrap_or_default().to_string();
                match op.as_str() {
                    "version" => Ok(json!(core::info::host_version())),
                    "platform" => Ok(json!(core::info::platform_name())),
                    "device-id" => Ok(json!(self.settings.device_id())),
                    "os-info" => Ok(core::info::os_query()),
                    "home-dir" => Ok(json!(
                        core::info::home_dir().map(|p| p.to_string_lossy().into_owned())
                    )),
                    other => Err(format!("unsupported host-info op: {other}")),
                }
            }

            // ── File system ops ─────────────────────────────────────────────
            "desktop:fs-op" => {
                let op = arg(0).as_str().unwrap_or_default().to_string();
                let path = arg(1).as_str().unwrap_or_default().to_string();
                let p = std::path::PathBuf::from(&path);
                let normalized = op.replace(['-', '_'], "");
                match normalized.as_str() {
                    "read" => Ok(to_json(core::fsops::read(&p))?),
                    "readbinary" | "readfilebinary" | "readfile" => {
                        Ok(to_json(core::fsops::read_binary(&p))?)
                    }
                    "write" => {
                        let content = arg(2).as_str().unwrap_or_default().to_string();
                        Ok(to_json(core::fsops::write(&p, &content))?)
                    }
                    "stat" => Ok(to_json(core::fsops::stat(&p))?),
                    "listdir" | "readdir" | "list" => Ok(to_json(core::fsops::read_dir(&p))?),
                    "mkdir" => Ok(to_json(core::fsops::mkdir(&p))?),
                    "exists" => Ok(json!(core::fsops::exists(&p))),
                    "reveal" | "revealinfilemanager" | "revealpath" => {
                        core::fsops::reveal_in_explorer(&p)?;
                        Ok(json!(true))
                    }
                    other => Err(format!("unsupported fs-op: {other}")),
                }
            }
            "desktop:browse-path" => Ok(to_json(core::fsops::browse_path(
                arg(0).as_str().unwrap_or_default(),
            ))?),
            "desktop:get-roots" => Ok(to_json(core::fsops::get_roots())?),
            "desktop:pick-directory" => Err("pick-directory requires a native dialog shell".into()),

            // ── External URLs ───────────────────────────────────────────────
            // Mirrors Electron shell.openExternal; core::tools guards schemes.
            "desktop:open-external" => {
                let url = arg(0).as_str().unwrap_or_default().to_string();
                let res = core::tools::open_url(&url);
                if res.ok { Ok(json!({ "ok": true })) } else { Err(res.message) }
            }

            // ── OS terminal ─────────────────────────────────────────────────
            // Mirrors the shim's openTerminalApp contract.
            "desktop:open-terminal-app" => {
                let cwd = arg(0).as_str().unwrap_or_default().to_string();
                let res = core::tools::open_terminal_app(&cwd);
                if res.ok { Ok(json!({ "ok": true })) } else { Err(res.message) }
            }

            // ── Search ──────────────────────────────────────────────────────
            "desktop:search-op" => {
                let op = arg(0).as_str().unwrap_or_default().to_string();
                if op != "run" {
                    return Err(format!("unsupported search-op: {op}"));
                }
                let params = arg(1);
                let root = params
                    .get("root")
                    .or_else(|| params.get("rootPath"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let req = parse_search_request(&params)?;
                Ok(to_json(core::search::search(
                    std::path::Path::new(&root),
                    &req,
                ))?)
            }

            // ── Providers ───────────────────────────────────────────────────
            "desktop:detect-providers" => {
                let list: Vec<Value> = ["codex", "claude-code"]
                    .iter()
                    .map(|p| {
                        let rt = core::providers::detect_runtime(p);
                        json!({
                            "id": p,
                            "installed": !rt.command.is_empty(),
                            "detail": rt.command,
                            "authenticated": Option::<String>::None,
                        })
                    })
                    .collect();
                Ok(Value::Array(list))
            }
            "desktop:provider-op" => {
                let op = arg(0).as_str().unwrap_or_default().to_string();
                let params = arg(1);
                match op.as_str() {
                    "auth-status" => {
                        let provider = params
                            .get("provider")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let account = self
                            .credentials_read(&format!("provider:{provider}:account"))
                            .unwrap_or_default();
                        Ok(to_json(core::types::AuthStatus {
                            auth_status: if account.is_empty() {
                                "signed-out"
                            } else {
                                "signed-in"
                            }
                            .into(),
                            account_user: if account.is_empty() {
                                None
                            } else {
                                Some(account)
                            },
                        })?)
                    }
                    "start-login" => {
                        let url = params
                            .get("url")
                            .and_then(Value::as_str)
                            .unwrap_or("https://claude.ai/oauth/authorize");
                        let res = core::tools::open_url(url);
                        Ok(json!({ "url": url, "ok": res.ok }))
                    }
                    "start" | "start-session" => self.provider_start(&params),
                    "send" | "send-turn" => {
                        let session_id = params
                            .get("providerThreadId")
                            .or_else(|| params.get("sessionId"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        let message = params
                            .get("message")
                            .or_else(|| params.get("prompt"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        let handle = self.runner_handle(&session_id)?;
                        let resolver = self.resolver.lock();
                        handle.send_turn(&**resolver, &message)?;
                        Ok(json!({ "ok": true }))
                    }
                    "stop" => {
                        let session_id = params
                            .get("providerThreadId")
                            .or_else(|| params.get("sessionId"))
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        if let Some(handle) = self.handles.lock().get(session_id).cloned() {
                            handle.stop();
                        }
                        self.runners.mark_dead(session_id);
                        Ok(json!({ "ok": true }))
                    }
                    "alive-sessions" | "list" => Ok(json!(self.runners.alive_ids())),
                    other => Err(format!("unsupported provider-op: {other}")),
                }
            }

            // ── Tool ops ────────────────────────────────────────────────────
            "desktop:tool-op" => {
                let op = arg(0).as_str().unwrap_or_default().to_string();
                let params = arg(1);
                match op.as_str() {
                    "execute" | "exec" => {
                        let command = params
                            .get("command")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let cwd = params
                            .get("cwd")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        run_shell_command(command, cwd, None)
                    }
                    "background" | "execute-background" => {
                        let command = params
                            .get("command")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let cwd = params
                            .get("cwd")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let background_id = params
                            .get("backgroundId")
                            .and_then(Value::as_str)
                            .map(str::to_string)
                            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                        self.backgrounds.register(
                            background_id.clone(),
                            command.to_string(),
                            cwd.to_string(),
                        )?;
                        spawn_background(
                            self.backgrounds.clone(),
                            self.sinks.lock().clone(),
                            background_id.clone(),
                            command.to_string(),
                            cwd.to_string(),
                        );
                        Ok(json!({ "ok": true, "backgroundId": background_id }))
                    }
                    "background-complete" => {
                        let background_id = params
                            .get("backgroundId")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        self.backgrounds.unregister(background_id);
                        Ok(json!({ "ok": true }))
                    }
                    "open-url" | "openExternal" => {
                        let url = params
                            .get("url")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let res = core::tools::open_url(url);
                        Ok(to_json(res)?)
                    }
                    other => Err(format!("unsupported tool-op: {other}")),
                }
            }

            // ── Terminal ops ────────────────────────────────────────────────
            "desktop:terminal-op" => {
                let op = arg(0).as_str().unwrap_or_default().to_string();
                let params = arg(1);
                match op.as_str() {
                    "start" | "spawn" => {
                        let cwd = params
                            .get("cwd")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let cols = params.get("cols").and_then(Value::as_u64).unwrap_or(80) as u16;
                        let rows = params.get("rows").and_then(Value::as_u64).unwrap_or(24) as u16;
                        // The terminal id is minted inside start(); share it with the
                        // PTY reader callbacks via this cell after start() returns.
                        let terminal_cell: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
                        let sinks: Vec<HostSink> = self.sinks.lock().clone();
                        let out_cell = terminal_cell.clone();
                        let out_sinks = sinks.clone();
                        let on_output = move |data: String| {
                            let id = out_cell.lock().clone().unwrap_or_default();
                            for sink in &out_sinks {
                                sink(
                                    "terminal:output",
                                    &json!({ "terminalId": id, "data": data }),
                                );
                            }
                        };
                        let exit_cell = terminal_cell.clone();
                        let exit_sinks = sinks;
                        let on_exit = move |code: Option<i32>, error: Option<String>| {
                            let id = exit_cell.lock().clone().unwrap_or_default();
                            for sink in &exit_sinks {
                                sink(
                                    "terminal:exit",
                                    &json!({ "terminalId": id, "exitCode": code, "error": error }),
                                );
                            }
                        };
                        let start =
                            block_pty(self.terms.start(cwd, cols, rows, on_output, on_exit))?;
                        *terminal_cell.lock() = Some(start.terminal_id.clone());
                        Ok(to_json(start)?)
                    }
                    "input" | "write" => {
                        let terminal_id = params
                            .get("terminalId")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let data = params
                            .get("data")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        Ok(to_json(self.terms.input(terminal_id, data))?)
                    }
                    "resize" => {
                        let terminal_id = params
                            .get("terminalId")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let cols = params.get("cols").and_then(Value::as_u64).unwrap_or(80) as u16;
                        let rows = params.get("rows").and_then(Value::as_u64).unwrap_or(24) as u16;
                        Ok(to_json(self.terms.resize(terminal_id, cols, rows))?)
                    }
                    "stop" | "kill" => {
                        let terminal_id = params
                            .get("terminalId")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        Ok(to_json(self.terms.stop(terminal_id))?)
                    }
                    "is-alive" | "alive" => {
                        let terminal_id = params
                            .get("terminalId")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        Ok(json!(self.terms.is_alive(terminal_id)))
                    }
                    other => Err(format!("unsupported terminal-op: {other}")),
                }
            }

            // ── Settings ────────────────────────────────────────────────────
            "desktop:get-setting" => {
                let arg0 = arg(0);

                let key = arg0.as_str().unwrap_or_default();
                Ok(self.settings.get(key))
            }
            "desktop:set-setting" => {
                let key = arg(0).as_str().unwrap_or_default().to_string();
                self.settings.set(&key, arg(1))?;
                Ok(json!({ "ok": true }))
            }
            "desktop:delete-setting" => {
                let key = arg(0).as_str().unwrap_or_default().to_string();
                if key.is_empty() {
                    return Err("delete-setting: key is required".into());
                }
                self.settings.delete(&key)?;
                Ok(json!({ "ok": true }))
            }

            // ── Credentials ─────────────────────────────────────────────────
            "credential:store" => {
                let arg0 = arg(0);

                let key = arg0.as_str().unwrap_or_default();
                let arg1 = arg(1);

                let value = arg1.as_str().unwrap_or_default();
                self.credentials_write(key, value)?;
                Ok(json!({ "ok": true }))
            }
            "credential:get" => {
                let arg0 = arg(0);

                let key = arg0.as_str().unwrap_or_default();
                Ok(json!({ "value": self.credentials_read(key) }))
            }
            "credential:clear" => {
                let arg0 = arg(0);

                let key = arg0.as_str().unwrap_or_default();
                self.credentials_delete(key)?;
                Ok(json!({ "ok": true }))
            }

            // ── Misc desktop channels ───────────────────────────────────────
            // Electron parity: (title, body, urgency). `urgency` is optional
            // and defaults to "normal"; other NotificationOptions (id, icon,
            // silent, …) are not modelled by the glue surface yet.
            "desktop:notify" => {
                let payload = json!({
                    "title": arg(0).as_str().unwrap_or_default(),
                    "body": arg(1).as_str().unwrap_or_default(),
                    "urgency": arg(2).as_str().unwrap_or("normal"),
                });
                self.emit("desktop:notify", payload);
                Ok(json!({ "ok": true }))
            }
            "clipboard:read-text" => read_clipboard_text(),
            other => Err(format!("unsupported desktop channel: {other}")),
        }
    }

    fn runner_handle(&self, session_id: &str) -> Result<core::runner::RunnerHandle, String> {
        self.handles
            .lock()
            .get(session_id)
            .cloned()
            .ok_or_else(|| format!("no such provider session: {session_id}"))
    }

    fn provider_start(&self, params: &Value) -> Result<Value, String> {
        let provider = params
            .get("provider")
            .and_then(Value::as_str)
            .unwrap_or("codex")
            .to_string();
        let session_id = params
            .get("sessionId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let cwd = params
            .get("cwd")
            .or_else(|| params.get("workingDirectory"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let mode = params
            .get("mode")
            .and_then(Value::as_str)
            .unwrap_or("default")
            .to_string();
        let req = core::types::ProviderSessionRequest {
            provider: provider.clone(),
            model: params
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string),
            max_turns: params
                .get("maxTurns")
                .and_then(Value::as_u64)
                .map(|v| v as u32),
        };
        let env: std::collections::HashMap<String, String> = params
            .get("env")
            .and_then(Value::as_object)
            .map(|m| {
                m.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();
        let spec = core::providers::to_runner_spec(&session_id, &req, &cwd, &mode, env);
        let id_sink: HostSink = {
            let sinks = self.sinks.lock().clone();
            Arc::new(move |_channel, payload| {
                for sink in sinks.iter() {
                    sink("gateway:event", payload);
                }
            })
        };
        let resolver = self.resolver.lock();
        let handle = core::runner::start(&self.runners, &**resolver, spec, move |event| {
            let mut v = serde_json::to_value(&event).unwrap_or(Value::Null);
            // Electron parity: the renderer consumes flat
            // { "type": "provider.*", "sessionId": "..." } events, while the
            // core event structs serialize the field as `session_id`.
            if let Some(obj) = v.as_object_mut() {
                if let Some(sid) = obj.remove("session_id") {
                    obj.insert("sessionId".into(), sid);
                }
            }
            id_sink("gateway:event", &v);
        })?;
        self.handles
            .lock()
            .insert(handle.session_id.clone(), handle.clone());
        Ok(json!({
            "providerThreadId": handle.session_id,
            "provider": provider,
        }))
    }
}

impl Default for HostState {
    fn default() -> Self {
        Self::new()
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn default_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("jait-desktop")
}

fn parse_search_request(params: &Value) -> Result<core::types::SearchRequest, String> {
    let req: core::types::SearchRequest =
        serde_json::from_value(params.clone()).map_err(|e| format!("invalid search request: {e}"))?;
    // Electron rejects anything but these two modes outright.
    if req.mode != "files" && req.mode != "content" {
        return Err("Search mode must be \"files\" or \"content\".".into());
    }
    Ok(req)
}

struct ShellOut {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

fn shell_program(command: &str) -> std::process::Command {
    if cfg!(target_os = "windows") {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", command]);
        c
    } else {
        let mut c = std::process::Command::new("sh");
        c.args(["-c", command]);
        c
    }
}

fn run_shell_command_inner(command: &str, cwd: &str) -> ShellOut {
    let mut c = shell_program(command);
    if !cwd.is_empty() {
        c.current_dir(cwd);
    }
    match c.output() {
        Ok(out) => ShellOut {
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
            exit_code: out.status.code().unwrap_or(-1),
        },
        Err(e) => ShellOut {
            stdout: String::new(),
            stderr: e.to_string(),
            exit_code: -1,
        },
    }
}

/// Runs the shell command on a worker thread: streams nothing, but fans the
/// final result to every attached host sink as `background:complete` and
/// unregisters it from the shared registry.
pub fn spawn_background(
    registry: Arc<core::tools::BackgroundRegistry>,
    sinks: Vec<HostSink>,
    background_id: String,
    command: String,
    cwd: String,
) {
    std::thread::spawn(move || {
        let out = run_shell_command_inner(&command, &cwd);
        registry.unregister(&background_id);
        let payload = json!({
            "backgroundId": background_id,
            "exitCode": out.exit_code,
            "stdout": out.stdout,
            "stderr": out.stderr,
        });
        for sink in &sinks {
            sink("background:complete", &payload);
        }
    });
}

fn run_shell_command(command: &str, cwd: &str, _timeout_ms: Option<u64>) -> Result<Value, String> {
    if command.is_empty() {
        return Err("tool-op execute: command is required".into());
    }
    let out = run_shell_command_inner(command, cwd);
    Ok(json!({
        "stdout": out.stdout,
        "stderr": out.stderr,
        "exitCode": out.exit_code,
    }))
}

#[cfg(feature = "clipboard")]
fn read_clipboard_text() -> Result<Value, String> {
    use arboard::Clipboard;
    let text = Clipboard::new()
        .and_then(|mut c| c.get_text())
        .map_err(|e| format!("clipboard read failed: {e}"))?;
    Ok(json!(text))
}

#[cfg(not(feature = "clipboard"))]
fn read_clipboard_text() -> Result<Value, String> {
    Err("clipboard support not compiled into this host".into())
}
// ── Tests ───────────────────────────────────────────────────────────────────
//
// Deterministic tests of the dispatch surface using **fake host sinks** — no
// windowing system required. The provider path spawns real child processes
// against fake provider CLIs (same stdio contracts as `runner::tests`) and the
// terminal path drives a real PTY, so args normalization → core call → sink
// fan-out is exercised end to end.

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    type SinkEvents = Arc<Mutex<Vec<(String, Value)>>>;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("jait-glue-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn bash_available() -> bool {
        !cfg!(target_os = "windows") && std::path::Path::new("/bin/bash").exists()
    }

    /// Sink that records every (channel, payload) pair it receives.
    fn recording_sink() -> (HostSink, SinkEvents) {
        let events: SinkEvents = Arc::new(Mutex::new(Vec::new()));
        let clone = events.clone();
        let sink: HostSink = Arc::new(move |channel, payload| {
            clone.lock().push((channel.to_string(), payload.clone()));
        });
        (sink, events)
    }

    fn wait_for(
        events: &SinkEvents,
        pred: impl Fn(&(String, Value)) -> bool,
        timeout: Duration,
    ) -> Vec<(String, Value)> {
        let deadline = Instant::now() + timeout;
        loop {
            let snapshot = events.lock().clone();
            if snapshot.iter().any(&pred) {
                return snapshot;
            }
            if Instant::now() > deadline {
                return snapshot;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn state() -> HostState {
        HostState::new_with_dir(temp_dir())
    }

    /// Fake provider CLI: same shape as `runner::tests::write_fake_codex`.
    fn write_fake_codex(dir: &std::path::Path) -> std::path::PathBuf {
        let script = dir.join("fake-codex.sh");
        std::fs::write(
            &script,
            r#"#!/usr/bin/env bash
while IFS= read -r line; do
  [ -n "$line" ] || continue
  id=$(printf '%s' "$line" | sed -n 's/^{"id":\([0-9]*\).*/\1/p')
  method=$(printf '%s' "$line" | sed -n 's/.*"method":"\([^"]*\)".*/\1/p')
  case "$method" in
    initialize)
      printf '{"id":%s,"result":{"userAgent":{"name":"fake-codex","version":"0.0.0"}}}\n' "$id" ;;
    thread/start)
      printf '{"id":%s,"result":{"thread":{"id":"thr-glue-1"}}}\n' "$id" ;;
    turn/start)
      printf '{"id":%s,"result":{"turnStatus":"inProgress"}}\n' "$id"
      printf '{"method":"turn/started","params":{"threadId":"thr-glue-1"}}\n'
      echo "FAKE-CODEX-NOTICE"
      printf '{"method":"turn/completed","params":{"threadId":"thr-glue-1"}}\n' ;;
    *)
      printf '{"id":%s,"error":{"message":"rpc unknown method"}}\n' "$id" ;;
  esac
done
"#,
        )
        .unwrap();
        script
    }

    /// Resolves every provider to the given fixed argv.
    #[derive(Clone)]
    struct StaticResolver {
        command: Option<core::runner::ResolvedCommand>,
    }

    impl core::runner::CommandResolver for StaticResolver {
        fn resolve(&self, _provider: &str) -> Option<core::runner::ResolvedCommand> {
            self.command.clone()
        }
    }

    fn fake_codex_resolver(script: &std::path::Path) -> StaticResolver {
        StaticResolver {
            command: Some(core::runner::ResolvedCommand {
                program: "/bin/bash".into(),
                args: vec![script.to_string_lossy().into_owned()],
            }),
        }
    }

    // ── dispatch plumbing ───────────────────────────────────────────────────

    #[test]
    fn app_info_reports_platform_version_and_device_id() {
        let st = state();
        let info = st.dispatch("app-info", &[]).expect("app-info ok");
        assert_eq!(info["platform"], std::env::consts::OS);
        assert!(!info["version"].as_str().unwrap_or_default().is_empty());
        assert!(!info["deviceID"].as_str().unwrap_or_default().is_empty());
    }

    #[test]
    fn host_info_maps_ops_and_errors_on_unknown() {
        let st = state();
        // The version op surfaces the composite hostApp string, e.g. "jait-desktop-tauri 0.1.782".
        assert!(st
            .dispatch("desktop:host-info", &[json!("version")])
            .unwrap()
            .as_str()
            .unwrap_or_default()
            .contains(env!("CARGO_PKG_VERSION")));
        assert_eq!(
            st.dispatch("desktop:host-info", &[json!("platform")])
                .unwrap(),
            json!(std::env::consts::OS)
        );
        let dev = st
            .dispatch("desktop:host-info", &[json!("device-id")])
            .unwrap();
        assert!(!dev.as_str().unwrap_or_default().is_empty());
        assert!(st.dispatch("desktop:host-info", &[json!("bogus")]).is_err());
        assert!(
            st.dispatch("desktop:host-info", &[]).is_err(),
            "missing op errors"
        );
    }

    #[test]
    fn settings_roundtrip_through_dispatch() {
        let st = state();
        st.dispatch("desktop:set-setting", &[json!("glue.theme"), json!("dark")])
            .expect("set ok");
        assert_eq!(
            st.dispatch("desktop:get-setting", &[json!("glue.theme")])
                .unwrap(),
            json!("dark")
        );
        assert_eq!(
            st.dispatch("desktop:get-setting", &[json!("glue.missing")])
                .unwrap(),
            Value::Null,
            "unknown setting is null"
        );
    }

    #[test]
    fn memory_credentials_store_get_clear() {
        let st = state();
        st.use_memory_credentials();
        st.dispatch("credential:store", &[json!("tok"), json!("s3cret")])
            .expect("store");
        assert_eq!(
            st.dispatch("credential:get", &[json!("tok")]).unwrap()["value"],
            json!("s3cret")
        );
        st.dispatch("credential:clear", &[json!("tok")])
            .expect("clear");
        assert_eq!(
            st.dispatch("credential:get", &[json!("tok")]).unwrap()["value"],
            Value::Null
        );
    }

    #[test]
    fn fs_and_search_ops_cover_supported_ops() {
        let st = state();
        let dir = temp_dir();
        std::fs::write(dir.join("hello.txt"), "hi glue").unwrap();
        // read → FileText
        let text = st
            .dispatch(
                "desktop:fs-op",
                &[json!("read"), json!(dir.join("hello.txt"))],
            )
            .expect("fs read ok");
        assert!(
            text.to_string().contains("hi glue"),
            "file content returned: {text}"
        );
        // exists → bool
        assert_eq!(
            st.dispatch(
                "desktop:fs-op",
                &[json!("exists"), json!(dir.join("hello.txt"))]
            )
            .unwrap(),
            json!(true)
        );
        assert_eq!(
            st.dispatch(
                "desktop:fs-op",
                &[json!("exists"), json!(dir.join("nope.txt"))]
            )
            .unwrap(),
            json!(false)
        );
        // stat → object
        let stat = st
            .dispatch(
                "desktop:fs-op",
                &[json!("stat"), json!(dir.join("hello.txt"))],
            )
            .expect("stat ok");
        assert!(stat.is_object(), "stat returns a JSON object: {stat}");
        // search op — modes are strictly "files" | "content" (Electron parity)
        let hits = st
            .dispatch(
                "desktop:search-op",
                &[
                    json!("run"),
                    json!({"root": dir, "query": "hi glue", "mode": "content", "limit": 10}),
                ],
            )
            .expect("search ok");
        assert!(hits.is_object(), "search returns a JSON object: {hits}");
        // unknown mode is rejected like the Electron handler does
        assert!(st
            .dispatch(
                "desktop:search-op",
                &[
                    json!("run"),
                    json!({"root": dir, "query": "hi glue", "mode": "text", "limit": 10}),
                ],
            )
            .is_err());
        // unsupported op errors
        assert!(st
            .dispatch("desktop:fs-op", &[json!("frobnicate")])
            .is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn tool_op_execute_runs_command_and_collects_output() {
        let st = state();
        let out = st
            .dispatch(
                "desktop:tool-op",
                &[json!("execute"), json!({"command": "echo glue-exec-ok"})],
            )
            .expect("execute ok");
        assert_eq!(out["exitCode"], json!(0));
        assert_eq!(out["stdout"], json!("glue-exec-ok\n"));
        assert!(st
            .dispatch(
                "desktop:tool-op",
                &[json!("execute"), json!({"command": ""})]
            )
            .is_err());
        assert!(
            st.dispatch("desktop:tool-op", &[json!("warp")]).is_err(),
            "unsupported op"
        );
    }

    #[test]
    fn tool_op_background_emits_background_complete() {
        let st = state();
        let (sink, events) = recording_sink();
        st.add_sink(sink);
        let started = st
            .dispatch(
                "desktop:tool-op",
                &[json!("background"), json!({"command": "echo glue-bg-ok"})],
            )
            .expect("spawn ok");
        let bg_id = started["backgroundId"]
            .as_str()
            .expect("backgroundId")
            .to_string();
        wait_for(
            &events,
            |(ch, p)| ch == "background:complete" && p["backgroundId"] == bg_id,
            Duration::from_secs(10),
        );
        let done = events
            .lock()
            .iter()
            .find(|(ch, p)| ch == "background:complete" && p["backgroundId"] == bg_id)
            .expect("background:complete arrived")
            .1
            .clone();
        assert_eq!(done["exitCode"], json!(0));
        assert_eq!(done["stdout"], json!("glue-bg-ok\n"));
        assert_eq!(done["backgroundId"], bg_id);
    }

    #[test]
    fn notify_fans_out_to_sinks() {
        let st = state();
        let (sink_a, events_a) = recording_sink();
        let (sink_b, events_b) = recording_sink();
        st.add_sink(sink_a);
        st.add_sink(sink_b);
        let out = st
            .dispatch("desktop:notify", &[json!("Hello"), json!("Body text")])
            .expect("notify ok");
        assert_eq!(out, json!({"ok": true}));
        for events in [&events_a, &events_b] {
            let hit = wait_for(
                events,
                |(ch, _p)| ch == "desktop:notify",
                Duration::from_secs(2),
            );
            let (_, payload) = hit
                .iter()
                .find(|(ch, _)| ch == "desktop:notify")
                .expect("notify event");
            assert_eq!(payload["title"], json!("Hello"));
            assert_eq!(payload["body"], json!("Body text"));
            assert_eq!(payload["urgency"], json!("normal"));
        }
        // Urgency arrives as the third positional arg (shim parity).
        let (sink_u, events_u) = recording_sink();
        st.add_sink(sink_u);
        st.dispatch("desktop:notify", &[json!("Urgent"), json!("now"), json!("critical")])
            .expect("urgent notify ok");
        let hits_u = wait_for(
            &events_u,
            |(ch, p)| ch == "desktop:notify" && p["urgency"] == json!("critical"),
            Duration::from_secs(2),
        );
        let (_, payload_u) = hits_u
            .iter()
            .find(|(ch, _)| ch == "desktop:notify")
            .expect("urgent notify event");
        assert_eq!(payload_u["title"], json!("Urgent"));
        assert_eq!(payload_u["urgency"], json!("critical"));
        let (_c, sink_dead) = recording_sink();
        drop(sink_dead); // a dead sink must not panic other fan-outs
        st.dispatch("desktop:notify", &[json!("Second"), json!("")])
            .expect("second notify ok");
    }

    #[test]
    fn unknown_channel_errors() {
        let st = state();
        assert!(st.dispatch("no:such-channel", &[]).is_err());
    }

    #[test]
    fn open_terminal_app_requires_a_cwd() {
        let st = state();
        let err = st.dispatch("desktop:open-terminal-app", &[]).unwrap_err();
        assert!(err.contains("working directory"), "{err}");
    }

    // ── provider bridge over the real runner + fake CLI ─────────────────────

    #[test]
    fn provider_start_send_and_events_over_fake_codex_cli() {
        if !bash_available() {
            return;
        }
        let dir = temp_dir();
        let script = write_fake_codex(&dir);
        let st = state();
        let (sink, events) = recording_sink();
        st.add_sink(sink);

        let resolver = fake_codex_resolver(&script);
        st.set_resolver(Box::new(resolver));

        let started = st
            .dispatch(
                "desktop:provider-op",
                &[
                    json!("start"),
                    json!({"provider": "codex", "sessionId": "sess-glue-1", "cwd": dir.to_string_lossy(), "mode": "default"}),
                ],
            )
            .expect("provider start ok");
        assert_eq!(started["providerThreadId"], json!("sess-glue-1"));

        // The runner should surface as alive.
        let alive = st
            .dispatch("desktop:provider-op", &[json!("alive-sessions")])
            .unwrap();
        let ids = alive.as_array().expect("alive ids array");
        assert!(
            ids.iter().any(|v| v == "sess-glue-1"),
            "session alive: {alive}"
        );

        st.dispatch(
            "desktop:provider-op",
            &[
                json!("send"),
                json!({"providerThreadId": "sess-glue-1", "message": "hello glue"}),
            ],
        )
        .expect("send ok");

        // Events reach the registered sink with the Electron-compatible shape:
        // flat { "type": "provider.turn-started" | ..., "sessionId": "..." }.
        let snapshot = wait_for(
            &events,
            |(ch, p)| {
                ch == "gateway:event"
                    && p["type"] == "provider.turn-completed"
                    && p["sessionId"] == "sess-glue-1"
            },
            Duration::from_secs(10),
        );
        let gateway: Vec<&Value> = snapshot
            .iter()
            .filter(|(ch, _)| ch == "gateway:event")
            .map(|(_, p)| p)
            .collect();
        assert!(
            gateway.iter().any(|p| p["type"] == "provider.turn-started"),
            "turn-started relayed: {gateway:?}"
        );
        assert!(
            gateway.iter().any(|p| p["type"] == "provider.line"
                && p["sessionId"] == "sess-glue-1"
                && p["line"]
                    .as_str()
                    .unwrap_or_default()
                    .contains("FAKE-CODEX-NOTICE")),
            "raw stdout lines relayed: {gateway:?}"
        );
        assert!(
            !gateway.iter().any(|p| p["line"]
                .as_str()
                .unwrap_or_default()
                .contains("\"result\"")),
            "rpc responses are never echoed as provider lines: {gateway:?}"
        );

        st.dispatch(
            "desktop:provider-op",
            &[json!("stop"), json!({"providerThreadId": "sess-glue-1"})],
        )
        .expect("stop ok");
        let after = wait_for(
            &events,
            |(ch, p)| ch == "gateway:event" && p["type"] == "provider.stopped",
            Duration::from_secs(5),
        );
        assert!(
            after
                .iter()
                .any(|(ch, p)| ch == "gateway:event" && p["type"] == "provider.stopped"),
            "provider.stopped relayed after stop"
        );
        let alive = st
            .dispatch("desktop:provider-op", &[json!("alive-sessions")])
            .unwrap();
        let ids = alive.as_array().expect("alive array");
        assert!(
            !ids.iter().any(|v| v == "sess-glue-1"),
            "session gone after stop: {alive}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn provider_start_accepts_working_directory_alias() {
        if !bash_available() {
            return;
        }
        let dir = temp_dir();
        let script = dir.join("fake-codex-alias.sh");
        std::fs::copy(write_fake_codex(&dir), &script).unwrap();
        let st = state();
        st.set_resolver(Box::new(fake_codex_resolver(&script)));
        // `workingDirectory` instead of `cwd` must normalize to the same start.
        let started = st
            .dispatch(
                "desktop:provider-op",
                &[
                    json!("start"),
                    json!({"provider": "codex", "sessionId": "sess-alias", "workingDirectory": dir.to_string_lossy()}),
                ],
            )
            .expect("start with workingDirectory ok");
        assert_eq!(started["providerThreadId"], json!("sess-alias"));
        st.dispatch(
            "desktop:provider-op",
            &[json!("stop"), json!({"providerThreadId": "sess-alias"})],
        )
        .ok();
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn provider_start_without_resolvable_cli_fails_on_send() {
        let st = state();
        st.set_resolver(Box::new(StaticResolver { command: None }));
        // Starting does not spawn anything (resolution happens per-turn), so it succeeds.
        let started = st
            .dispatch(
                "desktop:provider-op",
                &[
                    json!("start"),
                    json!({"provider": "codex", "sessionId": "sess-none", "cwd": "."}),
                ],
            )
            .expect("start is lazy about CLI resolution");
        assert_eq!(started["providerThreadId"], json!("sess-none"));
        // The turn send is where the missing CLI surfaces.
        let err = st
            .dispatch(
                "desktop:provider-op",
                &[
                    json!("send"),
                    json!({"providerThreadId": "sess-none", "message": "hi"}),
                ],
            )
            .expect_err("unresolvable CLI must error on send");
        assert!(
            err.contains("provider CLI not found"),
            "resolver error surfaced: {err}"
        );
    }

    // ── terminal bridge over a real PTY ─────────────────────────────────────

    #[test]
    #[cfg(unix)]
    fn terminal_lifecycle_echoes_input_and_stops() {
        let st = state();
        let dir = temp_dir();

        // The sink must exist before start: start snapshots the sink list for
        // PTY output fan-out, so a sink added afterwards never sees events.
        let (sink, events) = recording_sink();
        st.add_sink(sink);

        let started = st
            .dispatch(
                "desktop:terminal-op",
                &[
                    json!("start"),
                    json!({"cwd": dir.to_string_lossy(), "cols": 100}),
                ],
            )
            .expect("terminal start ok");
        let term_id = started["terminalId"]
            .as_str()
            .expect("terminal_id str")
            .to_string();

        st.dispatch(
            "desktop:terminal-op",
            &[
                json!("input"),
                json!({"terminalId": term_id, "data": "echo glue-pty-ok\r\n"}),
            ],
        )
        .expect("terminal input ok");

        let snapshot = wait_for(
            &events,
            |(ch, p)| ch == "terminal:output" && p.to_string().contains("glue-pty-ok"),
            Duration::from_secs(10),
        );
        assert!(
            snapshot.iter().any(|(ch, _p)| ch == "terminal:output"),
            "terminal output events fanned out: {snapshot:?}"
        );

        let alive = st
            .dispatch(
                "desktop:terminal-op",
                &[json!("is-alive"), json!({"terminalId": term_id})],
            )
            .unwrap();
        assert_eq!(alive, json!(true));

        st.dispatch(
            "desktop:terminal-op",
            &[
                json!("resize"),
                json!({"terminalId": term_id, "cols": 120, "rows": 40}),
            ],
        )
        .expect("resize ok");

        st.dispatch(
            "desktop:terminal-op",
            &[json!("stop"), json!({"terminalId": term_id})],
        )
        .expect("terminal stop ok");
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let alive = st
                .dispatch(
                    "desktop:terminal-op",
                    &[json!("is-alive"), json!({"terminalId": term_id})],
                )
                .unwrap();
            if alive == json!(false) || Instant::now() > deadline {
                assert_eq!(alive, json!(false), "terminal dead after stop");
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        std::fs::remove_dir_all(&dir).ok();
    }
}
