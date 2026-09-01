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

/// Run a git/gh command string like the Electron host's promisified `exec`:
/// through the shell (so `&&` and quotes behave the same), with a 60s
/// poll-timeout because dispatch is synchronous. When `clean_gh_env` is set,
/// `GH_TOKEN`/`GITHUB_TOKEN` are removed so `gh` falls back to keyring-based
/// credentials from `gh auth login`.
fn run_git_like(
    program: &str,
    command: &str,
    cwd: &str,
    clean_gh_env: bool,
) -> Result<core::types::CommandOut, String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    if command.trim().is_empty() {
        return Err("missing command".into());
    }
    let (shell, flag) = if cfg!(windows) {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };
    let mut cmd = Command::new(shell);
    cmd.arg(flag)
        .arg(command)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if clean_gh_env {
        cmd.env_remove("GH_TOKEN").env_remove("GITHUB_TOKEN");
    }
    if !cwd.is_empty() {
        cmd.current_dir(cwd);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("{program} spawn failed: {e}"))?;
    let stdout_t = child.stdout.take().map(|mut s| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = s.read_to_string(&mut buf);
            buf
        })
    });
    let stderr_t = child.stderr.take().map(|mut s| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = s.read_to_string(&mut buf);
            buf
        })
    });
    let deadline = Instant::now() + Duration::from_secs(60);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(format!("{program} wait failed: {e}")),
        }
    };
    let stdout = stdout_t.and_then(|h| h.join().ok()).unwrap_or_default();
    let stderr = stderr_t.and_then(|h| h.join().ok()).unwrap_or_default();
    match status {
        Some(status) if status.success() => Ok(core::types::CommandOut {
            stdout,
            stderr,
            exit_code: 0,
        }),
        Some(status) => Err(format!(
            "{program} exited with {}: {}",
            status.code().unwrap_or(-1),
            stderr.trim()
        )),
        None => Err(format!("{program} timed out after 60s")),
    }
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
            // Two call shapes, both mirroring the Electron fs-op handler:
            //   1. gateway/renderer contract: (op, params-object, requestId)
            //      — used by the ws `proxyFsOp` bridge (node capability).
            //   2. positional: (op, path, content) — direct renderer calls.
            "desktop:fs-op" => {
                let op = arg(0).as_str().unwrap_or_default().to_string();
                let params: Value = match arg(1) {
                    Value::Object(map) => Value::Object(map),
                    _ => json!({ "path": arg(1), "content": arg(2) }),
                };
                let str_param = |key: &str| -> String {
                    params
                        .get(key)
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string()
                };
                let path = str_param("path");
                let p = resolve_fs_path(&path);
                let normalized = op.replace(['-', '_'], "").to_lowercase();
                match normalized.as_str() {
                    // Gateway contract: read → { content, size }.
                    "read" => {
                        let text = core::fsops::read(&p)?;
                        Ok(json!({
                            "content": text,
                            "size": text.len(),
                        }))
                    }
                    // Gateway contract: readBinary → { content } (base64).
                    "readbinary" | "readfilebinary" | "readfile" => {
                        let out = core::fsops::read_binary(&p)?;
                        Ok(json!({
                            "content": out.base64,
                            "size": out.bytes,
                        }))
                    }
                    "write" => {
                        let content = str_param("content");
                        Ok(to_json(core::fsops::write(&p, &content))?)
                    }
                    // Gateway contract: stat → { size, isDirectory, modified }.
                    "stat" => {
                        let out = core::fsops::stat(&p)?;
                        Ok(json!({
                            "size": out.size,
                            "isDirectory": out.is_directory,
                            "isFile": out.is_file,
                            "modified": out.modified,
                        }))
                    }
                    // Gateway contract: list → ["name", "dir/", …] (dirs suffixed).
                    "list" | "listdir" => {
                        let out = core::fsops::read_dir(&p)?;
                        let names: Vec<String> = out
                            .into_iter()
                            .map(|e| {
                                if e.is_directory {
                                    format!("{}/", e.name)
                                } else {
                                    e.name
                                }
                            })
                            .collect();
                        Ok(json!(names))
                    }
                    // Gateway contract: readdir → [{ name, path, type }].
                    "readdir" => {
                        let out = core::fsops::read_dir(&p)?;
                        let entries: Vec<Value> = out
                            .into_iter()
                            .map(|e| {
                                json!({
                                    "name": e.name,
                                    "path": p.join(&e.name).to_string_lossy(),
                                    "type": if e.is_directory { "dir" } else { "file" },
                                })
                            })
                            .collect();
                        Ok(json!(entries))
                    }
                    // Electron `patch`: search/replace write for file.edit.
                    "patch" => {
                        let old = str_param("oldString");
                        let new = str_param("newString");
                        let out = core::fsops::patch(&p, &old, &new)?;
                        Ok(json!({ "ok": out.ok, "matched": out.matched }))
                    }
                    "mkdir" => Ok(to_json(core::fsops::mkdir(&p))?),
                    "exists" => Ok(json!(core::fsops::exists(&p))),
                    "reveal" | "revealinfilemanager" | "revealpath" | "revealinexplorer" => {
                        core::fsops::reveal_in_explorer(&p)?;
                        Ok(json!(true))
                    }
                    // Git identity route: gateway proxies `{ args }` through
                    // the node so commits/branches run on the remote machine.
                    "git" | "gh" => {
                        let cwd = if std::path::PathBuf::from(&path).is_absolute() {
                            path.clone()
                        } else {
                            let home = str_param("cwd");
                            if home.is_empty() {
                                core::info::home_dir()
                                    .map(|h| h.join(&path).to_string_lossy().into_owned())
                                    .unwrap_or_else(|| path.clone())
                            } else {
                                PathBuf::from(&home)
                                    .join(&path)
                                    .to_string_lossy()
                                    .into_owned()
                            }
                        };
                        let out = run_git_like(
                            &normalized,
                            &git_like_args(&params),
                            &cwd,
                            normalized == "gh", // keyring-based auth like Electron
                        )?;
                        Ok(to_json(out)?)
                    }
                    // Electron parity: `gh-check` reports gh install/auth state
                    // (auth check strips GH_TOKEN/GITHUB_TOKEN like ghCleanEnv).
                    "ghcheck" => {
                        if run_git_like("gh", "gh --version", &path, false).is_err() {
                            return Ok(
                                json!({ "installed": false, "authenticated": false, "username": null }),
                            );
                        }
                        let mut authenticated = false;
                        let mut username: Option<String> = None;
                        if let Ok(out) = run_git_like("gh", "gh auth status", &path, true) {
                            let all = format!("{}{}", out.stdout, out.stderr);
                            if all.contains("Logged in") {
                                authenticated = true;
                                if let Some(rest) = all.split("Logged in to ").nth(1) {
                                    if let Some(tail) = rest.split("account ").nth(1) {
                                        let name = tail
                                            .split_whitespace()
                                            .next()
                                            .unwrap_or("")
                                            .trim_end_matches(['.', ',']);
                                        if !name.is_empty() {
                                            username = Some(name.to_string());
                                        }
                                    }
                                }
                            }
                        }
                        Ok(
                            json!({ "installed": true, "authenticated": authenticated, "username": username }),
                        )
                    }
                    // Electron parity: per-file diff rows for branch/PR views.
                    // `{ cwd, baseBranch?, branch? } -> [{ path, original, modified, status }]
                    "gitfilediffs" => {
                        let cwd = if std::path::PathBuf::from(&path).is_absolute() {
                            path.clone()
                        } else {
                            let c = str_param("cwd");
                            if c.is_empty() {
                                ".".to_string()
                            } else {
                                c
                            }
                        };
                        // Electron quotes paths with JSON.stringify — mirror that.
                        let quoted = |s: &str| -> String {
                            format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
                        };
                        // run_git_like shells the full command — `program` is
                        // only used in error messages — so prefix the binary.
                        let git = |command: &str| -> Result<core::types::CommandOut, String> {
                            run_git_like("git", &format!("git {command}"), &cwd, false)
                        };
                        let read_capped = |rel: &str| -> String {
                            if rel.is_empty() {
                                return String::new();
                            }
                            let full = std::path::Path::new(&cwd).join(rel);
                            match core::fsops::stat(&full) {
                                Ok(s) if s.size <= 2_000_000 => {
                                    core::fsops::read(&full).unwrap_or_default()
                                }
                                _ => String::new(),
                            }
                        };
                        let base_branch = str_param("baseBranch");
                        let branch = str_param("branch");
                        let mut entries: Vec<Value> = Vec::new();
                        let mut seen: std::collections::HashSet<String> =
                            std::collections::HashSet::new();
                        let push = |entries: &mut Vec<Value>,
                                    seen: &mut std::collections::HashSet<String>,
                                    file_path: &str,
                                    status: &str,
                                    original: String,
                                    modified: String| {
                            if file_path.is_empty() || !seen.insert(file_path.to_string()) {
                                return;
                            }
                            entries.push(json!({
                                "path": file_path,
                                "original": original,
                                "modified": modified,
                                "status": status,
                            }));
                        };
                        if !base_branch.is_empty() && !branch.is_empty() {
                            // PR-style: merge-base against the branch tip.
                            let diff_base = git(&format!(
                                "merge-base {} {}",
                                quoted(&base_branch),
                                quoted(&branch)
                            ))
                            .map(|o| o.stdout.trim().to_string())
                            .unwrap_or_else(|_| base_branch.clone());
                            let name_status = git(&format!(
                                "diff --name-status {} {}",
                                quoted(&diff_base),
                                quoted(&branch)
                            ))
                            .map(|o| o.stdout)
                            .unwrap_or_default();
                            for line in name_status.lines().filter(|l| !l.is_empty()) {
                                let parts: Vec<&str> = line.split('\t').collect();
                                let code = parts.first().copied().unwrap_or("M").trim();
                                let mut file_path =
                                    parts.last().copied().unwrap_or("").trim().to_string();
                                let status = if code.starts_with('A') {
                                    "A"
                                } else if code.starts_with('D') {
                                    "D"
                                } else if code.starts_with('R') {
                                    if parts.len() >= 3 {
                                        file_path = parts[2].trim().to_string();
                                    }
                                    "R"
                                } else {
                                    "M"
                                };
                                let original = if status != "A" {
                                    git(&format!(
                                        "show {}:{}",
                                        quoted(&diff_base),
                                        quoted(&file_path)
                                    ))
                                    .map(|o| o.stdout)
                                    .unwrap_or_default()
                                } else {
                                    String::new()
                                };
                                let modified = if status != "D" {
                                    git(&format!("show {}:{}", quoted(&branch), quoted(&file_path)))
                                        .map(|o| o.stdout)
                                        .unwrap_or_default()
                                } else {
                                    String::new()
                                };
                                push(
                                    &mut entries,
                                    &mut seen,
                                    &file_path,
                                    status,
                                    original,
                                    modified,
                                );
                            }
                        } else if !base_branch.is_empty() {
                            // Working tree vs base branch (committed + uncommitted).
                            let name_status =
                                git(&format!("diff --name-status {}", quoted(&base_branch)))
                                    .map(|o| o.stdout)
                                    .unwrap_or_default();
                            for line in name_status.lines().filter(|l| !l.is_empty()) {
                                let parts: Vec<&str> = line.split('\t').collect();
                                let code = parts.first().copied().unwrap_or("M").trim();
                                let mut file_path =
                                    parts.last().copied().unwrap_or("").trim().to_string();
                                let status = if code.starts_with('A') {
                                    "A"
                                } else if code.starts_with('D') {
                                    "D"
                                } else if code.starts_with('R') {
                                    if parts.len() >= 3 {
                                        file_path = parts[2].trim().to_string();
                                    }
                                    "R"
                                } else {
                                    "M"
                                };
                                let original = if status != "A" {
                                    git(&format!(
                                        "show {}:{}",
                                        quoted(&base_branch),
                                        quoted(&file_path)
                                    ))
                                    .map(|o| o.stdout)
                                    .unwrap_or_default()
                                } else {
                                    String::new()
                                };
                                let modified = if status != "D" {
                                    read_capped(&file_path)
                                } else {
                                    String::new()
                                };
                                push(
                                    &mut entries,
                                    &mut seen,
                                    &file_path,
                                    status,
                                    original,
                                    modified,
                                );
                            }
                        } else {
                            // Working tree vs HEAD (uncommitted only).
                            let porcelain = git("status --porcelain")
                                .map(|o| o.stdout)
                                .unwrap_or_default();
                            for line in porcelain.lines().filter(|l| !l.is_empty()) {
                                let xy = &line[..line.len().min(2)];
                                let mut file_path = line[3..].trim().to_string();
                                if let Some(rest) = file_path.split(" -> ").last() {
                                    if line.contains(" -> ") {
                                        file_path = rest.trim().to_string();
                                    }
                                }
                                let status = if xy.contains('?') {
                                    "?"
                                } else if xy.contains('A') {
                                    "A"
                                } else if xy.contains('D') {
                                    "D"
                                } else if xy.contains('R') {
                                    "R"
                                } else {
                                    "M"
                                };
                                let original = if status != "A" && status != "?" {
                                    git(&format!("show HEAD:{}", quoted(&file_path)))
                                        .map(|o| o.stdout)
                                        .unwrap_or_default()
                                } else {
                                    String::new()
                                };
                                let modified = if status != "D" {
                                    read_capped(&file_path)
                                } else {
                                    String::new()
                                };
                                push(
                                    &mut entries,
                                    &mut seen,
                                    &file_path,
                                    status,
                                    original,
                                    modified,
                                );
                            }
                        }
                        Ok(json!(entries))
                    }
                    // Capped text read for git file views (size on bytes).
                    "gitfileread" => {
                        let bytes = core::fsops::read_binary(&p)?.bytes;
                        if bytes > 2_000_000 {
                            return Err("file too large to display".into());
                        }
                        let text = core::fsops::read(&p)?;
                        Ok(json!({ "content": text, "size": bytes }))
                    }
                    // Project search routed through the same fs-op switch
                    // (root resolved relative to cwd like Electron's handler).
                    "searchproject" | "search" => {
                        let cwd = str_param("cwd");
                        let root =
                            PathBuf::from(if cwd.is_empty() { "." } else { &cwd }).join(&path);
                        let req = parse_search_request(&params)?;
                        let hits = core::search::search(&root, &req);
                        Ok(to_json(hits)?)
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
                if res.ok {
                    Ok(json!({ "ok": true }))
                } else {
                    Err(res.message)
                }
            }

            // ── OS terminal ─────────────────────────────────────────────────
            // Mirrors the shim's openTerminalApp contract.
            "desktop:open-terminal-app" => {
                let cwd = arg(0).as_str().unwrap_or_default().to_string();
                let res = core::tools::open_terminal_app(&cwd);
                if res.ok {
                    Ok(json!({ "ok": true }))
                } else {
                    Err(res.message)
                }
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

/// Resolves an fs-op path Node-style: empty → cwd, `~` → home, relative →
/// cwd-joined, absolute kept. Windows backslashes are normalized so a path
/// copied from Windows works on either platform's join logic.
pub fn resolve_fs_path(path: &str) -> std::path::PathBuf {
    use std::path::PathBuf;
    let path = path.replace('\\', "/");
    let p = PathBuf::from(path.trim());
    if p.as_os_str().is_empty() {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    } else if p.starts_with("~") {
        match core::info::home_dir() {
            Some(home) => home.join(p.strip_prefix("~").unwrap_or(&p)),
            None => p,
        }
    } else if p.is_absolute() {
        p
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(p)
    }
}

/// Electron parity: git-like ops accept either `{ command: "status -s" }`
/// or `{ args: ["status", "-s"] }`; both map onto one argv list.
fn git_like_args(params: &Value) -> String {
    if let Some(args) = params.get("args").and_then(Value::as_array) {
        return args
            .iter()
            .map(|v| match v {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .collect::<Vec<_>>()
            .join(" ");
    }
    // Gateway also sends `args` as a plain string (`args: "remote"`).
    if let Some(args) = params.get("args").and_then(Value::as_str) {
        return args.to_string();
    }
    params
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn parse_search_request(params: &Value) -> Result<core::types::SearchRequest, String> {
    let req: core::types::SearchRequest = serde_json::from_value(params.clone())
        .map_err(|e| format!("invalid search request: {e}"))?;
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

    /// The ws `proxyFsOp` bridge (node capability) sends `(op, params-object)`
    /// and expects Electron-shaped results: read/readBinary → `{ content }`,
    /// list → bare names (dirs suffixed "/"), stat → `{ size, isDirectory, modified }`.
    #[test]
    fn fs_op_params_object_matches_gateway_contract() {
        let st = state();
        let dir = temp_dir();
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("hello.txt"), "hi glue").unwrap();

        // read → { content, size }
        let read = st
            .dispatch(
                "desktop:fs-op",
                &[json!("read"), json!({ "path": dir.join("hello.txt") })],
            )
            .expect("params read ok");
        assert_eq!(read["content"], json!("hi glue"));
        assert_eq!(read["size"], json!(7));

        // readBinary → { content } base64
        let bin = st
            .dispatch(
                "desktop:fs-op",
                &[
                    json!("readBinary"),
                    json!({ "path": dir.join("hello.txt") }),
                ],
            )
            .expect("params readBinary ok");
        assert_eq!(
            String::from_utf8(base64_decode(bin["content"].as_str().expect("base64 str"))).unwrap(),
            "hi glue"
        );

        // write via params object
        st.dispatch(
            "desktop:fs-op",
            &[
                json!("write"),
                json!({ "path": dir.join("hello.txt"), "content": "bye glue" }),
            ],
        )
        .expect("params write ok");
        assert_eq!(
            std::fs::read_to_string(dir.join("hello.txt")).unwrap(),
            "bye glue"
        );

        // list → bare names, dirs suffixed "/" (Electron `list` shape)
        let list = st
            .dispatch("desktop:fs-op", &[json!("list"), json!({ "path": dir })])
            .expect("params list ok");
        let names: Vec<String> = serde_json::from_value(list).expect("list is string[]");
        assert!(names.iter().any(|n| n == "hello.txt"));
        assert!(names.iter().any(|n| n == "sub/"));

        // stat → { size, isDirectory, modified }
        let stat = st
            .dispatch(
                "desktop:fs-op",
                &[json!("stat"), json!({ "path": dir.join("sub") })],
            )
            .expect("params stat ok");
        assert_eq!(stat["isDirectory"], json!(true));
        assert!(stat["size"].is_u64());
        assert!(stat["modified"].is_string());

        // exists via params object
        let exists = st
            .dispatch(
                "desktop:fs-op",
                &[json!("exists"), json!({ "path": dir.join("hello.txt") })],
            )
            .expect("params exists ok");
        assert_eq!(exists, json!(true));

        // git → { stdout, stderr, exitCode }
        let git = st
            .dispatch(
                "desktop:fs-op",
                &[
                    json!("git"),
                    json!({ "command": "echo git-ok", "cwd": dir }),
                ],
            )
            .expect("params git ok");
        assert_eq!(git["stdout"], json!("git-ok\n"));
        assert_eq!(git["exitCode"], json!(0));

        // errors propagate (unknown path → dispatch error, like Electron rejects)
        assert!(st
            .dispatch(
                "desktop:fs-op",
                &[json!("read"), json!({ "path": dir.join("nope.txt") })],
            )
            .is_err());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Minimal standard-base64 decoder for the readBinary contract test.
    fn base64_decode(input: &str) -> Vec<u8> {
        const TABLE: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = Vec::new();
        let mut buf = 0u32;
        let mut bits = 0u32;
        for c in input.bytes() {
            if c == b'=' {
                break;
            }
            let v = TABLE.iter().position(|&t| t == c).expect("valid base64") as u32;
            buf = (buf << 6) | v;
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                out.push((buf >> bits) as u8);
            }
        }
        out
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
        st.dispatch(
            "desktop:notify",
            &[json!("Urgent"), json!("now"), json!("critical")],
        )
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

    // ── desktop:fs-op contract (Electron parity) ───────────────────────────

    #[test]
    fn resolve_fs_path_matches_node_semantics() {
        // Empty → cwd.
        let cwd = std::env::current_dir().unwrap();
        assert_eq!(resolve_fs_path(""), cwd);
        assert_eq!(resolve_fs_path("  "), cwd);

        // Absolute kept, backslashes normalized.
        let abs = if cfg!(windows) {
            "C:\\repo\\file.ts"
        } else {
            "/repo/file.ts"
        };
        let resolved = resolve_fs_path(abs);
        assert!(resolved.is_absolute());

        // Relative → cwd-joined.
        assert_eq!(resolve_fs_path("sub/dir"), cwd.join("sub/dir"));

        // `~` → home.
        if let Some(home) = core::info::home_dir() {
            assert_eq!(resolve_fs_path("~/notes.txt"), home.join("notes.txt"));
            assert_eq!(resolve_fs_path("~"), home);
        }
    }

    #[test]
    fn fs_op_gateway_shapes() {
        let st = state();
        let dir = temp_dir();
        std::fs::write(dir.join("a.txt"), "hello").unwrap();
        std::fs::create_dir_all(dir.join("sub")).unwrap();

        // Gateway contract shape: (op, params-object, requestId).
        let read = st
            .dispatch(
                "desktop:fs-op",
                &[
                    json!("read"),
                    json!({ "path": dir.join("a.txt") }),
                    json!(1),
                ],
            )
            .unwrap();
        assert_eq!(read, json!({ "content": "hello", "size": 5 }));

        // `list` → dirs suffixed with "/".
        let list = st
            .dispatch("desktop:fs-op", &[json!("list"), json!({ "path": dir })])
            .unwrap();
        let list = list.as_array().unwrap();
        assert!(list.contains(&json!("a.txt")));
        assert!(list.contains(&json!("sub/")));

        // `readdir` → [{ name, path, type }].
        let entries = st
            .dispatch("desktop:fs-op", &[json!("readdir"), json!({ "path": dir })])
            .unwrap();
        let entries = entries.as_array().unwrap();
        let a = entries.iter().find(|e| e["name"] == "a.txt").unwrap();
        assert_eq!(a["type"], "file");
        assert_eq!(
            a["path"],
            json!(dir.join("a.txt").to_string_lossy().into_owned())
        );
        let sub = entries.iter().find(|e| e["name"] == "sub").unwrap();
        assert_eq!(sub["type"], "dir");

        // stat → { size, isDirectory, isFile, modified }.
        let stat = st
            .dispatch(
                "desktop:fs-op",
                &[json!("stat"), json!({ "path": dir.join("a.txt") })],
            )
            .unwrap();
        assert_eq!(stat["size"], json!(5));
        assert_eq!(stat["isDirectory"], json!(false));
        assert_eq!(stat["isFile"], json!(true));
        assert!(stat["modified"].as_str().is_some());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// gh-check → Electron shape `{ installed, authenticated, username }`
    /// regardless of whether `gh` exists on this machine.
    #[test]
    fn gh_check_reports_electron_shape() {
        let st = state();
        let out = st
            .dispatch("desktop:fs-op", &[json!("gh-check"), json!({})])
            .expect("gh-check ok");
        assert!(out.get("installed").is_some());
        assert!(out.get("authenticated").is_some());
        if out["installed"].as_bool() == Some(false) {
            assert_eq!(out["authenticated"], json!(false));
        }
    }

    /// git-file-diffs (uncommitted mode) mirrors Electron: rows carry
    /// path/original/modified/status against a real git repo.
    #[test]
    fn git_file_diffs_lists_working_tree_changes() {
        let st = state();
        let dir = temp_dir();
        let run = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .args(args)
                .current_dir(&dir)
                .env("GIT_AUTHOR_NAME", "t")
                .env("GIT_AUTHOR_EMAIL", "t@t")
                .env("GIT_COMMITTER_NAME", "t")
                .env("GIT_COMMITTER_EMAIL", "t@t")
                .output()
                .expect("git runs");
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        };
        run(&["init", "-q"]);
        std::fs::write(dir.join("kept.txt"), "one\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-q", "-m", "init"]);
        std::fs::write(dir.join("kept.txt"), "one\ntwo\n").unwrap();
        std::fs::write(dir.join("new.txt"), "fresh\n").unwrap();

        let rows = st
            .dispatch(
                "desktop:fs-op",
                &[json!("git-file-diffs"), json!({ "cwd": dir.to_string_lossy() })],
            )
            .expect("git-file-diffs ok");
        let rows = rows.as_array().expect("rows array");

        let kept = rows
            .iter()
            .find(|r| r["path"] == "kept.txt")
            .expect("kept.txt row");
        assert_eq!(kept["status"], "M");
        assert_eq!(kept["original"], "one\n");
        assert!(kept["modified"].as_str().unwrap().contains("two"));

        let fresh = rows
            .iter()
            .find(|r| r["path"] == "new.txt")
            .expect("new.txt row");
        assert_eq!(fresh["status"], "?");
        assert_eq!(fresh["original"], "");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fs_op_patch_roundtrip() {
        let st = state();
        let dir = temp_dir();
        let file = dir.join("f.txt");
        std::fs::write(&file, "const a = 1;").unwrap();

        let out = st
            .dispatch(
                "desktop:fs-op",
                &[
                    json!("patch"),
                    json!({ "path": file, "oldString": "1", "newString": "2" }),
                ],
            )
            .unwrap();
        assert_eq!(out, json!({ "ok": true, "matched": true }));
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "const a = 2;");

        // Missing oldString errors instead of silently writing.
        let err = st
            .dispatch(
                "desktop:fs-op",
                &[
                    json!("patch"),
                    json!({ "path": file, "oldString": "nope", "newString": "x" }),
                ],
            )
            .unwrap_err();
        assert!(err.contains("not found"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fs_op_write_then_read_positional_shape() {
        let st = state();
        let dir = temp_dir();
        let file = dir.join("pos.txt");

        // Positional shape: (op, path, content).
        st.dispatch(
            "desktop:fs-op",
            &[json!("write"), json!(file), json!("body")],
        )
        .unwrap();
        let read = st
            .dispatch("desktop:fs-op", &[json!("read"), json!(file)])
            .unwrap();
        assert_eq!(read, json!({ "content": "body", "size": 4 }));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fs_op_unknown_op_errors() {
        let st = state();
        assert!(st
            .dispatch(
                "desktop:fs-op",
                &[json!("teleport"), json!({ "path": "/x" })]
            )
            .is_err());
    }
}
