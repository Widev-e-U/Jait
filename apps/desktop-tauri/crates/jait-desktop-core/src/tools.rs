//! tools — remote tool execution (mirror of apps/desktop/src/remote-tools.ts).
//!
//! Handles `desktop:tool-op` cases: command (foreground with output cap),
//! background (id → exit event), browser-tool (opens URL via webbrowser),
//! and the passthroughs already covered elsewhere (fs-op/git in other modules).
//!
//! Background commands mirror `sendBackgroundCommandCompleteEvent`: the
//! process runs detached, output is accumulated (10 MB cap then truncation),
//! and on completion a DesktopEvent::BackgroundComplete is emitted.

use crate::types::ToolResult;
use parking_lot::Mutex;
use std::collections::HashMap;

pub const MAX_COMMAND_OUTPUT_BYTES: usize = 10 * 1024 * 1024;
const MAX_BACKGROUND_PROCESSES: usize = 128;

#[derive(Debug)]
pub struct BackgroundProcess {
    pub background_id: String,
    pub command: String,
    pub cwd: String,
    #[allow(dead_code)]
    pub started_at: std::time::SystemTime,
}

#[derive(Default)]
pub struct BackgroundRegistry {
    map: Mutex<HashMap<String, BackgroundProcess>>,
    order: Mutex<Vec<String>>,
}

impl BackgroundRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Enforce the remote-tools.ts cap; oldest entries are forgotten.
    pub fn register(
        &self,
        background_id: String,
        command: String,
        cwd: String,
    ) -> Result<(), String> {
        let mut map = self.map.lock();
        let mut order = self.order.lock();
        if map.len() >= MAX_BACKGROUND_PROCESSES {
            if let Some(oldest) = order.first().cloned() {
                map.remove(&oldest);
                order.remove(0);
            }
        }
        map.insert(
            background_id.clone(),
            BackgroundProcess {
                background_id: background_id.clone(),
                command,
                cwd,
                started_at: std::time::SystemTime::now(),
            },
        );
        order.push(background_id);
        Ok(())
    }

    pub fn unregister(&self, background_id: &str) {
        self.map.lock().remove(background_id);
        self.order.lock().retain(|id| id != background_id);
    }

    /// True while a background process is still tracked (pre-completion).
    pub fn is_registered(&self, background_id: &str) -> bool {
        self.map.lock().contains_key(background_id)
    }
}

/// Run a foreground command (command op). Output is capped at 10 MB per
/// stream with the remote-tools truncation marker appended on overflow.
pub async fn run_command(
    command: &str,
    cwd: &str,
    timeout_secs: Option<u64>,
    envs: &HashMap<String, String>,
) -> ToolResult {
    let mut cmd = build_shell_command(command, cwd);
    for (k, v) in envs {
        cmd.env(k, v);
    }
    let fut = cmd.output();
    let result = match timeout_secs {
        Some(t) => match tokio::time::timeout(std::time::Duration::from_secs(t), fut).await {
            Ok(res) => res,
            Err(_) => {
                return ToolResult {
                    ok: false,
                    message: format!("command timed out after {t}s"),
                    data: None,
                }
            }
        },
        None => fut.await,
    };
    match result {
        Ok(output) => {
            let stdout = cap_output(&String::from_utf8_lossy(&output.stdout));
            let stderr = cap_output(&String::from_utf8_lossy(&output.stderr));
            let ok = output.status.success();
            ToolResult {
                ok,
                message: if ok {
                    "command completed".into()
                } else {
                    format!(
                        "command failed with exit code {}",
                        output.status.code().unwrap_or(-1)
                    )
                },
                data: Some(
                    serde_json::json!({ "stdout": stdout, "stderr": stderr, "exitCode": output.status.code() }),
                ),
            }
        }
        Err(e) => ToolResult {
            ok: false,
            message: format!("failed to spawn command: {e}"),
            data: None,
        },
    }
}

fn cap_output(s: &str) -> String {
    if s.len() > MAX_COMMAND_OUTPUT_BYTES {
        let mut cut = MAX_COMMAND_OUTPUT_BYTES;
        while !s.is_char_boundary(cut) {
            cut -= 1;
        }
        let mut out = s[..cut].to_string();
        out.push_str("\n[Output truncated at 10 MB]");
        out
    } else {
        s.to_string()
    }
}

fn build_shell_command(command: &str, cwd: &str) -> tokio::process::Command {
    use crate::TokioCommandConsoleHide;
    if cfg!(target_os = "windows") {
        let mut c = tokio::process::Command::new("cmd");
        c.arg("/C").arg(command);
        if !cwd.is_empty() {
            c.current_dir(cwd);
        }
        // Windowed host: never let cmd.exe pop a console for tool runs.
        c.hide_console();
        c
    } else {
        let mut c = tokio::process::Command::new("bash");
        c.arg("-c").arg(command);
        let dir = if cwd.is_empty() {
            dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."))
        } else {
            std::path::PathBuf::from(cwd)
        };
        c.current_dir(dir);
        c
    }
}

/// browser-tool:open mirrors remote-tools browser tool. Returns ok even when
/// xdg-open fails silently on headless systems (parity with Electron shell
/// `openExternal` behaviour which only rejects on spawn failure).
pub fn open_url(url: &str) -> ToolResult {
    // Basic scheme guard so agents can't open arbitrary handlers.
    let lower = url.to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return ToolResult {
            ok: false,
            message: "only http/https URLs can be opened".into(),
            data: None,
        };
    }
    #[allow(unused_mut)]
    let mut res: std::io::Result<std::process::Child>;
    #[cfg(target_os = "windows")]
    {
        use crate::StdCommandConsoleHide;
        // cmd /C start is the Windows shell.openExternal equivalent; without
        // CREATE_NO_WINDOW its console host flashes on every URL open.
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "start", "", url]);
        cmd.hide_console();
        res = cmd.spawn();
    }
    #[cfg(target_os = "macos")]
    {
        res = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        res = std::process::Command::new("xdg-open").arg(url).spawn();
    }
    match res {
        Ok(_) => ToolResult {
            ok: true,
            message: format!("opened {url}"),
            data: None,
        },
        Err(e) => ToolResult {
            ok: false,
            message: format!("failed to open browser: {e}"),
            data: None,
        },
    }
}

/// Locate a program on PATH. Testable variant takes an explicit PATH value;
/// production callers pass `None` to read the real environment.
#[allow(dead_code)] // unused on macOS, where no PATH probing is needed
pub fn find_on_path(name: &str, path_var: Option<&str>) -> Option<std::path::PathBuf> {
    let path = match path_var {
        Some(p) => p.to_string(),
        None => std::env::var("PATH").ok()?,
    };
    let name = if cfg!(target_os = "windows") && !name.contains('.') {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(&name);
        if !candidate.is_file() {
            continue;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let executable = candidate
                .metadata()
                .map(|m| m.permissions().mode() & 0o111 != 0)
                .unwrap_or(false);
            if executable {
                return Some(candidate);
            }
        }
        #[cfg(not(unix))]
        return Some(candidate);
    }
    None
}

/// Build the (program, args) spec for launching the OS terminal at `cwd`.
/// Pure construction only — PATH is probed here (Windows/Linux) but nothing is
/// spawned, so the argv shape stays unit-testable without side effects.
pub fn terminal_launch_spec(cwd: &str) -> Result<(String, Vec<String>), String> {
    if cwd.trim().is_empty() {
        return Err("open-terminal-app requires a working directory".into());
    }
    #[cfg(target_os = "windows")]
    {
        if find_on_path("wt", None).is_some() {
            Ok(("wt".into(), vec!["-d".into(), cwd.into()]))
        } else {
            Ok((
                "cmd".into(),
                vec![
                    "/C".into(),
                    "start".into(),
                    String::new(),
                    "/D".into(),
                    cwd.into(),
                ],
            ))
        }
    }
    #[cfg(target_os = "macos")]
    Ok((
        "open".into(),
        vec!["-a".into(), "Terminal".into(), cwd.into()],
    ));
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // cwd-inheriting terminals take no dir args; the rest get explicit ones.
        let candidates: &[(&str, &[&str])] = &[
            ("x-terminal-emulator", &[]),
            ("gnome-terminal", &[]),
            ("konsole", &["--workdir", cwd]),
            ("xfce4-terminal", &["--working-directory", cwd]),
            ("xterm", &[]),
        ];
        for (name, args) in candidates {
            if find_on_path(name, None).is_some() {
                return Ok(((*name).into(), args.iter().map(|s| s.to_string()).collect()));
            }
        }
        Err("no supported terminal emulator found on PATH".into())
    }
}

/// desktop:open-terminal-app — spawn the OS terminal app rooted at `cwd`.
pub fn open_terminal_app(cwd: &str) -> ToolResult {
    let (program, args) = match terminal_launch_spec(cwd) {
        Ok(spec) => spec,
        Err(message) => {
            return ToolResult {
                ok: false,
                message,
                data: None,
            }
        }
    };
    if !std::path::Path::new(cwd).is_dir() {
        return ToolResult {
            ok: false,
            message: format!("directory not found: {cwd}"),
            data: None,
        };
    }
    let mut cmd = std::process::Command::new(&program);
    cmd.args(&args).current_dir(cwd);
    match cmd.spawn() {
        Ok(_) => ToolResult {
            ok: true,
            message: format!("opened terminal at {cwd}"),
            data: None,
        },
        Err(e) => ToolResult {
            ok: false,
            message: format!("failed to launch terminal ({program}): {e}"),
            data: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn run_command_captures_stdout() {
        if cfg!(target_os = "windows") {
            return;
        }
        let res = run_command("echo hello-tools", "", Some(10), &HashMap::new()).await;
        assert!(res.ok, "{:?}", res.message);
        let data = res.data.unwrap();
        assert_eq!(
            data["stdout"].as_str().map(|s| s.trim()),
            Some("hello-tools")
        );
    }

    #[tokio::test]
    async fn run_command_reports_failure() {
        if cfg!(target_os = "windows") {
            return;
        }
        let res = run_command("exit 3", "", Some(10), &HashMap::new()).await;
        assert!(!res.ok);
        assert!(res.message.contains("3"));
    }

    #[tokio::test]
    async fn run_command_timeout() {
        if cfg!(target_os = "windows") {
            return;
        }
        let res = run_command("sleep 5", "", Some(1), &HashMap::new()).await;
        assert!(!res.ok);
        assert!(res.message.contains("timed out"));
    }

    #[test]
    fn cap_output_truncates() {
        let big = "x".repeat(MAX_COMMAND_OUTPUT_BYTES + 500);
        let out = cap_output(&big);
        assert!(out.contains("[Output truncated at 10 MB]"));
    }

    #[test]
    fn open_url_rejects_non_http() {
        let res = open_url("file:///etc/passwd");
        assert!(!res.ok);
    }

    #[test]
    fn find_on_path_probes_explicit_path_var() {
        if cfg!(target_os = "windows") {
            return;
        }
        assert!(find_on_path("sh", Some("/usr/bin:/bin")).is_some());
        assert!(find_on_path("definitely-not-a-real-binary-xyz", Some("/usr/bin:/bin")).is_none());
        assert!(find_on_path("sh", Some("")).is_none());
    }

    #[test]
    fn terminal_launch_spec_rejects_empty_cwd() {
        assert!(terminal_launch_spec("").is_err());
        assert!(terminal_launch_spec("   ").is_err());
    }

    #[test]
    fn terminal_launch_spec_builds_platform_argv() {
        let cwd = "/tmp/jait-terminal-spec";
        let (program, args) = terminal_launch_spec(cwd).expect("spec should build");
        if cfg!(target_os = "windows") {
            let expected = if find_on_path("wt", None).is_some() {
                "wt"
            } else {
                "cmd"
            };
            assert_eq!(program, expected);
        } else if cfg!(target_os = "macos") {
            assert_eq!(program, "open");
            assert_eq!(
                args,
                vec!["-a".to_string(), "Terminal".to_string(), cwd.to_string()]
            );
        } else {
            const KNOWN: &[&str] = &[
                "x-terminal-emulator",
                "gnome-terminal",
                "konsole",
                "xfce4-terminal",
                "xterm",
            ];
            assert!(
                KNOWN.contains(&program.as_str()),
                "unexpected terminal: {program}"
            );
            assert!(args.is_empty() || args.contains(&cwd.to_string()));
        }
    }

    #[test]
    fn open_terminal_app_rejects_missing_directory_without_spawning() {
        let res = open_terminal_app("/tmp/definitely-missing-jait-terminal-dir");
        assert!(!res.ok);
    }

    #[test]
    fn background_registry_cap() {
        let reg = BackgroundRegistry::new();
        for i in 0..(MAX_BACKGROUND_PROCESSES + 5) {
            reg.register(format!("bg-{i}"), "cmd".into(), ".".into())
                .unwrap();
        }
        // No panic, oldest dropped.
        reg.unregister("bg-5");
    }
}
