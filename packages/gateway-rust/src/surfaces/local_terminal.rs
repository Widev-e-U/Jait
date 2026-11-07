//! PTY-backed terminal control for local surfaces.
//!
//! The desktop host owns real terminals (a persistent shell per surface). This
//! module provides the same shape on Linux/macOS: open a pseudo terminal, start
//! the user's shell as the session leader, and drive it by writing framed
//! commands followed by a synthetic exit marker. Nothing here fakes a shell: if
//! the PTY or the shell cannot be started, `spawn` fails instead of returning a
//! handle.
//!
//! Scope: local node only. Remote nodes stay unsupported (`node_owner` returns
//! `None`), and no effect authority beyond the requested shell is granted.

use super::registry::{
    Surface, SurfaceFuture, SurfaceRef, SurfaceRegistry, SurfaceResult, SurfaceSnapshot,
    SurfaceStartInput, SurfaceState,
};
use crate::routes::terminals::{
    ControlFuture, DEFAULT_COLS, DEFAULT_ROWS, EXIT_MARKER_PREFIX, TERMINAL_KIND, TerminalControl,
    TerminalHandle, TerminalRun, TerminalRunOutcome, TerminalShell, TerminalSpawn,
};
use serde_json::{Map, json};
use std::collections::HashMap;
use std::fs::File;
use std::io::{ErrorKind, Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, RawFd};
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, Weak};
use std::time::{Duration, Instant};

/// How often a running command re-checks the PTY buffer.
const POLL_INTERVAL: Duration = Duration::from_millis(10);
/// Absolute upper bound on a single command, matching the route's 24h cap.
const MAX_TIMEOUT_MS: f64 = 86_400_000.0;
/// Largest chunk pulled from the PTY per read.
const READ_CHUNK: usize = 8 * 1024;

#[derive(Default)]
struct OutputBuffer {
    bytes: Vec<u8>,
    closed: bool,
}

/// One attached shell plus the PTY master used to talk to it.
struct LocalTerminalHandle {
    writer: Mutex<File>,
    master: Arc<File>,
    child: Mutex<Option<Child>>,
    output: Arc<Mutex<OutputBuffer>>,
    size: Arc<Mutex<(u16, u16)>>,
}

impl LocalTerminalHandle {
    /// Frame a command so the shell reports its exit status exactly once.
    ///
    /// The marker is assembled from two adjacent quoted literals so the echoed
    /// command line never contains the complete marker; the route strips output
    /// from the first occurrence, which must be the printed one.
    fn frame(command: &str, marker: &str) -> String {
        let (head, tail) = split_marker(marker);
        let mut script = String::with_capacity(command.len() + marker.len() + 96);
        script.push_str(&format!("__jait_m='{head}''{tail}'\n"));
        script.push_str(command);
        if !command.ends_with('\n') {
            script.push('\n');
        }
        script.push_str("__jait_s=$?\n");
        script.push_str("printf '\\n%s%d\\n' \"$__jait_m\" \"$__jait_s\"\n");
        script
    }

    fn write_all(&self, data: &[u8]) -> Result<(), String> {
        let mut writer = self.writer.lock().map_err(|_| "terminal writer poisoned")?;
        writer
            .write_all(data)
            .and_then(|_| writer.flush())
            .map_err(|err| format!("write to terminal failed: {err}"))
    }

    fn snapshot_bytes(&self, from: usize) -> Vec<u8> {
        let output = self.output.lock().expect("pty output");
        output.bytes.get(from..).unwrap_or_default().to_vec()
    }

    fn output_closed(&self) -> bool {
        self.output.lock().expect("pty output").closed
    }

    async fn execute(
        &self,
        command: String,
        marker: String,
        timeout_ms: f64,
    ) -> Result<TerminalRunOutcome, String> {
        let start = self.output.lock().expect("pty output").bytes.len();
        self.write_all(Self::frame(&command, &marker).as_bytes())?;

        let timeout_ms = if timeout_ms.is_finite() {
            timeout_ms.clamp(1.0, MAX_TIMEOUT_MS)
        } else {
            MAX_TIMEOUT_MS
        };
        let deadline = Instant::now() + Duration::from_millis(timeout_ms as u64);

        loop {
            let pending = self.snapshot_bytes(start);
            if let Some(exit_code) = parse_exit_marker(&pending, &marker) {
                return Ok(TerminalRunOutcome {
                    raw_output: String::from_utf8_lossy(&pending).into_owned(),
                    exit_code: Some(exit_code),
                    timed_out: false,
                });
            }
            if self.output_closed() {
                return Ok(TerminalRunOutcome {
                    raw_output: String::from_utf8_lossy(&pending).into_owned(),
                    exit_code: None,
                    timed_out: false,
                });
            }
            if Instant::now() >= deadline {
                return Ok(TerminalRunOutcome {
                    raw_output: String::from_utf8_lossy(&pending).into_owned(),
                    exit_code: None,
                    timed_out: true,
                });
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    fn kill(&self) {
        if let Ok(mut guard) = self.child.lock()
            && let Some(mut child) = guard.take()
        {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for LocalTerminalHandle {
    fn drop(&mut self) {
        self.kill();
    }
}

impl TerminalHandle for LocalTerminalHandle {
    fn write(&self, data: &str) -> Result<(), String> {
        self.write_all(data.as_bytes())
    }

    fn resize(&self, cols: u16, rows: u16) {
        if cols == 0 || rows == 0 {
            return;
        }
        let winsize = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        let fd = self.master.as_raw_fd();
        // A lost race with shell exit only means there is nothing left to size.
        unsafe {
            libc::ioctl(fd, libc::TIOCSWINSZ, &winsize);
        }
        if let Ok(mut size) = self.size.lock() {
            *size = (cols, rows);
        }
    }

    fn run(
        &self,
        request: TerminalRun<'_>,
    ) -> ControlFuture<'_, Result<TerminalRunOutcome, String>> {
        Box::pin(self.execute(
            request.command.to_string(),
            request.marker.to_string(),
            request.timeout_ms,
        ))
    }
}

/// Registry entry describing an attached terminal.
struct LocalTerminalSurface {
    id: String,
    session_id: String,
    project_root: String,
    shell: String,
    state: Mutex<SurfaceState>,
    size: Arc<Mutex<(u16, u16)>>,
    control: Weak<LocalTerminalControl>,
}

impl Surface for LocalTerminalSurface {
    fn id(&self) -> &str {
        &self.id
    }

    fn kind(&self) -> &str {
        TERMINAL_KIND
    }

    fn state(&self) -> SurfaceState {
        *self.state.lock().expect("surface state")
    }

    fn session_id(&self) -> Option<String> {
        Some(self.session_id.clone())
    }

    fn start(&self, _input: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
        Box::pin(async {
            *self.state.lock().expect("surface state") = SurfaceState::Running;
            Ok(())
        })
    }

    fn stop(&self, _reason: Option<String>) -> SurfaceFuture<'_, ()> {
        Box::pin(async {
            *self.state.lock().expect("surface state") = SurfaceState::Stopped;
            if let Some(control) = self.control.upgrade() {
                control.shutdown(&self.id);
            }
            Ok(())
        })
    }

    fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
        let (cols, rows) = *self.size.lock().expect("surface size");
        let mut metadata = Map::new();
        metadata.insert("shell".into(), json!(self.shell));
        metadata.insert("cwd".into(), json!(self.project_root));
        metadata.insert("cols".into(), json!(cols));
        metadata.insert("rows".into(), json!(rows));
        Ok(SurfaceSnapshot {
            id: self.id.clone(),
            kind: TERMINAL_KIND.to_string(),
            state: self.state(),
            session_id: self.session_id.clone(),
            started_at: None,
            metadata,
        })
    }
}

/// Local control plane: one PTY-backed shell per terminal surface.
pub struct LocalTerminalControl {
    handles: Mutex<HashMap<String, HandleEntry>>,
    /// Weak handle handed to surfaces so `stop` can reap the shell.
    self_ref: Weak<LocalTerminalControl>,
}

struct HandleEntry {
    surface: SurfaceRef,
    handle: Arc<LocalTerminalHandle>,
}

impl Default for LocalTerminalControl {
    fn default() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
            self_ref: Weak::new(),
        }
    }
}

impl LocalTerminalControl {
    pub fn new() -> Arc<Self> {
        Arc::new_cyclic(|weak| Self {
            handles: Mutex::new(HashMap::new()),
            self_ref: weak.clone(),
        })
    }

    /// Drop the handle and reap the shell for `id`, if any.
    fn shutdown(&self, id: &str) {
        let entry = self
            .handles
            .lock()
            .ok()
            .and_then(|mut handles| handles.remove(id));
        if let Some(entry) = entry {
            entry.handle.kill();
        }
    }
}

impl TerminalControl for LocalTerminalControl {
    fn spawn(
        &self,
        registry: &SurfaceRegistry,
        request: &TerminalSpawn<'_>,
    ) -> Result<Arc<dyn TerminalHandle>, String> {
        if !request.node_id.is_empty() && request.node_id != "local" {
            return Err("Terminal runtime is only available on the local node".to_string());
        }
        let cols = if request.cols == 0 {
            DEFAULT_COLS
        } else {
            request.cols
        };
        let rows = if request.rows == 0 {
            DEFAULT_ROWS
        } else {
            request.rows
        };
        let shell = request
            .shell
            .filter(|shell| !shell.is_empty())
            .map(str::to_string)
            .unwrap_or_else(default_shell);

        let mut pty = open_pty(cols, rows)?;
        let master = Arc::new(pty.master);
        // The child must not inherit the master, or reads never see EOF.
        set_cloexec(master.as_raw_fd())?;

        let child = spawn_shell(
            &shell,
            request.project_root,
            request.id,
            pty.slave,
            master.as_raw_fd(),
            (cols, rows),
        )?;
        // Parent-side copy of the slave is no longer needed.
        unsafe {
            libc::close(pty.slave);
        }
        pty.slave = -1;

        let writer = master
            .try_clone()
            .map_err(|err| format!("duplicate PTY master failed: {err}"))?;
        let output = Arc::new(Mutex::new(OutputBuffer::default()));
        let size = Arc::new(Mutex::new((cols, rows)));
        let handle = Arc::new(LocalTerminalHandle {
            writer: Mutex::new(writer),
            master: Arc::clone(&master),
            child: Mutex::new(Some(child)),
            output: Arc::clone(&output),
            size: Arc::clone(&size),
        });

        let surface: SurfaceRef = Arc::new(LocalTerminalSurface {
            id: request.id.to_string(),
            session_id: request.session_id.to_string(),
            project_root: request.project_root.to_string(),
            shell: shell.clone(),
            state: Mutex::new(SurfaceState::Running),
            size: Arc::clone(&size),
            control: Weak::clone(&self.self_ref),
        });
        if !registry.register_reserved_instance(request.id, request.reservation, surface.clone()) {
            handle.kill();
            return Err(format!(
                "terminal {} could not be registered (id taken or reservation lost)",
                request.id
            ));
        }

        start_reader(master, output);
        self.handles
            .lock()
            .map_err(|_| "terminal registry poisoned".to_string())?
            .insert(
                request.id.to_string(),
                HandleEntry {
                    surface,
                    handle: Arc::clone(&handle),
                },
            );
        Ok(handle)
    }

    fn handle_for_surface(&self, surface: &SurfaceRef) -> Option<Arc<dyn TerminalHandle>> {
        let handles = self.handles.lock().ok()?;
        handles
            .values()
            .find(|entry| Arc::ptr_eq(&entry.surface, surface))
            .map(|entry| Arc::clone(&entry.handle) as Arc<dyn TerminalHandle>)
    }

    fn shell_list(&self) -> Vec<TerminalShell> {
        available_shells()
    }

    fn node_owner(&self, node_id: &str) -> Option<String> {
        if node_id == "local" {
            Some("local".to_string())
        } else {
            None
        }
    }
}

fn split_marker(marker: &str) -> (&str, &str) {
    if let Some(rest) = marker.strip_prefix(EXIT_MARKER_PREFIX)
        && !rest.is_empty()
    {
        return (EXIT_MARKER_PREFIX, rest);
    }
    let split = marker.len() / 2;
    marker.split_at(split)
}

/// `Some(code)` once the marker and its trailing status digits are complete.
fn parse_exit_marker(raw: &[u8], marker: &str) -> Option<i64> {
    let needle = marker.as_bytes();
    let start = raw
        .windows(needle.len())
        .position(|window| window == needle)?;
    let tail = &raw[start + needle.len()..];
    let digits: Vec<u8> = tail
        .iter()
        .copied()
        .take_while(u8::is_ascii_digit)
        .collect();
    if digits.is_empty() {
        return None;
    }
    std::str::from_utf8(&digits).ok()?.parse().ok()
}

struct Pty {
    master: File,
    slave: RawFd,
}

fn open_pty(cols: u16, rows: u16) -> Result<Pty, String> {
    unsafe {
        let master = libc::posix_openpt(libc::O_RDWR | libc::O_NOCTTY);
        if master < 0 {
            return Err(format!(
                "open PTY master failed: {}",
                std::io::Error::last_os_error()
            ));
        }
        if libc::grantpt(master) != 0 || libc::unlockpt(master) != 0 {
            let err = std::io::Error::last_os_error();
            libc::close(master);
            return Err(format!("prepare PTY failed: {err}"));
        }
        let name = libc::ptsname(master);
        if name.is_null() {
            let err = std::io::Error::last_os_error();
            libc::close(master);
            return Err(format!("resolve PTY slave failed: {err}"));
        }
        let slave = libc::open(name, libc::O_RDWR | libc::O_NOCTTY);
        if slave < 0 {
            let err = std::io::Error::last_os_error();
            libc::close(master);
            return Err(format!("open PTY slave failed: {err}"));
        }
        let winsize = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        libc::ioctl(slave, libc::TIOCSWINSZ, &winsize);
        Ok(Pty {
            master: File::from_raw_fd(master),
            slave,
        })
    }
}

fn set_cloexec(fd: RawFd) -> Result<(), String> {
    unsafe {
        let flags = libc::fcntl(fd, libc::F_GETFD);
        if flags < 0 || libc::fcntl(fd, libc::F_SETFD, flags | libc::FD_CLOEXEC) < 0 {
            return Err(format!(
                "set close-on-exec failed: {}",
                std::io::Error::last_os_error()
            ));
        }
    }
    Ok(())
}

/// A resolved command line for the terminal shell, mirroring the reference
/// `resolveTerminalSpawnSpec`.
#[derive(Debug, Clone, PartialEq, Eq)]
struct SpawnSpec {
    command: String,
    args: Vec<String>,
}

const SYSTEMD_RUN: &str = "/usr/bin/systemd-run";
const DEFAULT_MEMORY_HIGH: &str = "1536M";
const DEFAULT_MEMORY_MAX: &str = "2G";
const DEFAULT_SWAP_MAX: &str = "1G";

/// Terminal ids reach a systemd unit name, so anything outside the unit-name
/// alphabet is folded to `-`.
fn isolation_unit_name(id: &str) -> String {
    let sanitized: String = id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '.' || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let mut name = String::from("jait-terminal-");
    name.extend(sanitized.chars().take(180));
    name.push_str(".scope");
    name
}

/// Only plain systemd memory sizes may reach `--property=`, so a configuration
/// value can never smuggle an extra property in.
fn memory_value(raw: Option<String>, default: &str) -> String {
    let Some(raw) = raw else {
        return default.to_string();
    };
    let value = raw.trim();
    let bytes = value.as_bytes();
    let (body, suffix) = match bytes.split_last() {
        Some((last, rest)) if !last.is_ascii_digit() => (rest, Some(*last)),
        _ => (bytes, None),
    };
    let suffix_ok = match suffix {
        None => true,
        Some(ch) => matches!(
            ch,
            b'K' | b'M' | b'G' | b'T' | b'P' | b'E' | b'k' | b'm' | b'g' | b't' | b'p' | b'e'
        ),
    };
    if suffix_ok && !body.is_empty() && body.iter().all(u8::is_ascii_digit) {
        value.to_string()
    } else {
        default.to_string()
    }
}

/// Terminals owned by the gateway service are placed in a bounded transient
/// systemd scope so a runaway build cannot exhaust the service cgroup and take
/// the gateway down with it.
fn resolve_spawn_spec(
    shell: &str,
    shell_args: &[String],
    id: &str,
    platform: &str,
    systemd_run_available: bool,
    env: &dyn Fn(&str) -> Option<String>,
) -> SpawnSpec {
    let direct = || SpawnSpec {
        command: shell.to_string(),
        args: shell_args.to_vec(),
    };
    if platform != "linux" || !systemd_run_available {
        return direct();
    }
    let isolation = env("JAIT_TERMINAL_ISOLATION");
    if isolation.as_deref() == Some("0") {
        return direct();
    }
    let service_owned = env("JAIT_UNIT").is_some() || isolation.as_deref() == Some("1");
    if !service_owned {
        return direct();
    }
    let mut args = vec![
        "--user".to_string(),
        "--scope".to_string(),
        "--quiet".to_string(),
        "--collect".to_string(),
        format!("--unit={}", isolation_unit_name(id)),
        "--property=OOMPolicy=kill".to_string(),
        format!(
            "--property=MemoryHigh={}",
            memory_value(env("JAIT_TERMINAL_MEMORY_HIGH"), DEFAULT_MEMORY_HIGH)
        ),
        format!(
            "--property=MemoryMax={}",
            memory_value(env("JAIT_TERMINAL_MEMORY_MAX"), DEFAULT_MEMORY_MAX)
        ),
        format!(
            "--property=MemorySwapMax={}",
            memory_value(env("JAIT_TERMINAL_SWAP_MAX"), DEFAULT_SWAP_MAX)
        ),
        "--".to_string(),
        shell.to_string(),
    ];
    args.extend(shell_args.iter().cloned());
    SpawnSpec {
        command: SYSTEMD_RUN.to_string(),
        args,
    }
}

fn systemd_run_available() -> bool {
    std::path::Path::new(SYSTEMD_RUN).exists()
}

fn spawn_shell(
    shell: &str,
    project_root: &str,
    id: &str,
    slave: RawFd,
    master: RawFd,
    (cols, rows): (u16, u16),
) -> Result<Child, String> {
    let shell_args = vec!["-i".to_string()];
    let spec = resolve_spawn_spec(
        shell,
        &shell_args,
        id,
        std::env::consts::OS,
        systemd_run_available(),
        &|key| std::env::var(key).ok(),
    );
    let mut command = Command::new(&spec.command);
    // Login-ish interactive shell without rc-file surprises: the desktop host
    // does the same, and framing must not be rewritten by prompt hooks.
    command
        .args(&spec.args)
        .current_dir(project_root)
        .env("TERM", "xterm-256color")
        .env("COLUMNS", cols.to_string())
        .env("LINES", rows.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    unsafe {
        command.pre_exec(move || {
            if libc::setsid() < 0 {
                return Err(std::io::Error::last_os_error());
            }
            if libc::ioctl(slave, libc::TIOCSCTTY as libc::c_ulong, 0) < 0 {
                return Err(std::io::Error::last_os_error());
            }
            for fd in [0, 1, 2] {
                if libc::dup2(slave, fd) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
            }
            if slave > 2 {
                libc::close(slave);
            }
            let _ = master;
            Ok(())
        });
    }
    command
        .spawn()
        .map_err(|err| format!("start shell {shell} failed: {err}"))
}

fn start_reader(master: Arc<File>, output: Arc<Mutex<OutputBuffer>>) {
    let reader = match master.try_clone() {
        Ok(reader) => reader,
        Err(_) => {
            output.lock().expect("pty output").closed = true;
            return;
        }
    };
    let _ = std::thread::Builder::new()
        .name("jait-pty-reader".to_string())
        .spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; READ_CHUNK];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(read) => {
                        if let Ok(mut output) = output.lock() {
                            output.bytes.extend_from_slice(&buf[..read]);
                        }
                    }
                    Err(err) if err.kind() == ErrorKind::Interrupted => continue,
                    // EIO on a PTY master means the shell closed its slave.
                    Err(_) => break,
                }
            }
            if let Ok(mut output) = output.lock() {
                output.closed = true;
            }
        });
}

/// Curated shell allowlist, matching the reference surface.
///
/// The list is intentionally small: only shells the terminal surface knows how
/// to drive are offered, and each entry is probed for availability before it is
/// reported. `label` is the short name the UI shows.
#[cfg(unix)]
fn available_shells() -> Vec<TerminalShell> {
    #[cfg(target_os = "macos")]
    const CANDIDATES: [&str; 3] = ["/bin/zsh", "/bin/bash", "/bin/sh"];
    #[cfg(not(target_os = "macos"))]
    const CANDIDATES: [&str; 3] = ["/bin/bash", "/bin/zsh", "/bin/sh"];

    CANDIDATES
        .iter()
        .filter(|shell| shell_is_executable(shell))
        .map(|shell| TerminalShell::new(*shell, shell_basename(shell)))
        .collect()
}

#[cfg(unix)]
fn shell_is_executable(shell: &str) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(shell) {
        Ok(meta) => meta.is_file() && meta.permissions().mode() & 0o111 != 0,
        Err(_) => false,
    }
}

#[cfg(unix)]
fn shell_basename(shell: &str) -> String {
    shell.rsplit('/').next().unwrap_or(shell).to_string()
}

/// Curated shell allowlist on Windows, matching the reference surface:
/// PowerShell 7, Windows PowerShell, cmd, plus a known Git Bash install.
#[cfg(windows)]
fn available_shells() -> Vec<TerminalShell> {
    const CANDIDATES: [&str; 3] = ["pwsh.exe", "powershell.exe", "cmd.exe"];
    const GIT_BASH_CANDIDATES: [&str; 2] = [
        "C:\\\\Program Files\\\\Git\\\\bin\\\\bash.exe",
        "C:\\\\Program Files (x86)\\\\Git\\\\bin\\\\bash.exe",
    ];

    let mut shells: Vec<TerminalShell> = CANDIDATES
        .iter()
        .filter(|shell| {
            Command::new("where")
                .arg(shell)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|status| status.success())
                .unwrap_or(false)
        })
        .map(|shell| {
            let label = shell.strip_suffix(".exe").unwrap_or(shell).to_string();
            TerminalShell::new(*shell, label)
        })
        .collect();
    for git_bash in GIT_BASH_CANDIDATES {
        if std::path::Path::new(git_bash).is_file() {
            shells.push(TerminalShell::new(git_bash, "bash (Git)"));
            break;
        }
    }
    shells
}

fn default_shell() -> String {
    std::env::var("SHELL")
        .ok()
        .filter(|shell| !shell.is_empty())
        .unwrap_or_else(|| "/bin/sh".to_string())
}

#[cfg(all(test, unix))]
mod shell_tests {
    use super::*;

    #[test]
    fn available_shells_are_allowlisted_and_labeled() {
        let shells = available_shells();
        let allowed = ["/bin/bash", "/bin/zsh", "/bin/sh"];
        for entry in &shells {
            assert!(
                allowed.contains(&entry.shell.as_str()),
                "unexpected shell {}",
                entry.shell
            );
            assert_eq!(entry.label, shell_basename(&entry.shell));
            assert!(shell_is_executable(&entry.shell));
        }
        assert!(shells.iter().all(|entry| entry.label != "/bin/sh"));
    }

    #[test]
    fn missing_shell_is_not_reported() {
        assert!(!shell_is_executable("/definitely/not/a/shell"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_hides_complete_marker_from_echo() {
        let marker = "__JAIT_EXIT__test-token__";
        let script = LocalTerminalHandle::frame("echo hi", marker);
        assert!(
            !script.contains(marker),
            "echoed frame leaks marker: {script}"
        );
        assert!(script.contains("__JAIT_EXIT__''test-token__"));
        assert!(script.contains("echo hi\n"));
    }

    #[test]
    fn exit_marker_is_parsed_only_when_complete() {
        let marker = "__JAIT_EXIT__abc__";
        assert_eq!(
            parse_exit_marker(b"out\r\n__JAIT_EXIT__abc__0\n", marker),
            Some(0)
        );
        assert_eq!(
            parse_exit_marker(b"out\r\n__JAIT_EXIT__abc__2\n", marker),
            Some(2)
        );
        assert_eq!(
            parse_exit_marker(b"out\r\n__JAIT_EXIT__abc__", marker),
            None
        );
        assert_eq!(parse_exit_marker(b"out only", marker), None);
    }

    #[tokio::test]
    async fn pty_runs_command_and_reports_exit_code() {
        let registry = SurfaceRegistry::default();
        let control = LocalTerminalControl::new();
        let token = registry
            .reserve_owner("term-1", "user-1")
            .expect("reserve terminal id");
        let shell = default_shell();
        let request = TerminalSpawn {
            id: "term-1",
            reservation: &token,
            session_id: "default",
            project_root: env!("CARGO_MANIFEST_DIR"),
            cols: 80,
            rows: 24,
            shell: Some(&shell),
            node_id: "local",
        };
        let handle = control.spawn(&registry, &request).expect("spawn shell");

        let marker = "__JAIT_EXIT__unit-test__";
        let ok = handle
            .run(TerminalRun {
                command: "printf 'hello-pty'",
                marker,
                timeout_ms: 10_000.0,
            })
            .await
            .expect("run command");
        assert!(!ok.timed_out, "command timed out");
        assert_eq!(ok.exit_code, Some(0));
        assert!(
            ok.raw_output.contains("hello-pty"),
            "output: {:?}",
            ok.raw_output
        );

        let failed = handle
            .run(TerminalRun {
                command: "false",
                marker,
                timeout_ms: 10_000.0,
            })
            .await
            .expect("run failing command");
        assert_eq!(failed.exit_code, Some(1));
    }

    #[test]
    fn isolation_unit_name_is_sanitized_and_bounded() {
        assert_eq!(isolation_unit_name("a/b c"), "jait-terminal-a-b-c.scope");
        assert_eq!(
            isolation_unit_name("a_b.c-d"),
            "jait-terminal-a_b.c-d.scope"
        );
        let long = "x".repeat(500);
        let name = isolation_unit_name(&long);
        assert_eq!(name.len(), "jait-terminal-".len() + 180 + ".scope".len());
        assert!(name.ends_with(".scope"));
    }

    fn spec_for(id: &str, platform: &str, vars: &[(&str, &str)]) -> SpawnSpec {
        let owned: Vec<(String, String)> = vars
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect();
        resolve_spawn_spec(
            "/bin/bash",
            &["-i".to_string()],
            id,
            platform,
            true,
            &|key| {
                owned
                    .iter()
                    .find(|(name, _)| name == key)
                    .map(|(_, value)| value.clone())
            },
        )
    }

    #[test]
    fn service_owned_terminal_runs_in_a_bounded_scope() {
        let spec = spec_for(
            "term/one",
            "linux",
            &[("JAIT_UNIT", "jait-gateway.service")],
        );
        assert_eq!(spec.command, "/usr/bin/systemd-run");
        for expected in [
            "--user",
            "--scope",
            "--quiet",
            "--collect",
            "--unit=jait-terminal-term-one.scope",
            "--property=OOMPolicy=kill",
            "--property=MemoryHigh=1536M",
            "--property=MemoryMax=2G",
            "--property=MemorySwapMax=1G",
        ] {
            assert!(
                spec.args.iter().any(|arg| arg == expected),
                "missing {expected} in {:?}",
                spec.args
            );
        }
        let separator = spec
            .args
            .iter()
            .position(|arg| arg == "--")
            .expect("command separator");
        assert_eq!(&spec.args[separator + 1..], ["/bin/bash", "-i"]);
    }

    #[test]
    fn isolation_stays_on_when_requested_without_a_service_unit() {
        let spec = spec_for("term-1", "linux", &[("JAIT_TERMINAL_ISOLATION", "1")]);
        assert_eq!(spec.command, "/usr/bin/systemd-run");
    }

    #[test]
    fn isolation_can_be_turned_off_or_is_unavailable() {
        let opted_out = spec_for("term-1", "linux", &[("JAIT_TERMINAL_ISOLATION", "0")]);
        assert_eq!(opted_out.command, "/bin/bash");
        assert_eq!(opted_out.args, ["-i"]);
        let unsupported = spec_for("term-1", "macos", &[("JAIT_UNIT", "jait.service")]);
        assert_eq!(unsupported.command, "/bin/bash");
        let standalone = spec_for("term-1", "linux", &[]);
        assert_eq!(standalone.command, "/bin/bash");
    }

    #[test]
    fn memory_value_accepts_only_systemd_limits() {
        assert_eq!(memory_value(Some(" 1P ".into()), "2G"), "1P");
        assert_eq!(memory_value(Some("512m".into()), "2G"), "512m");
        assert_eq!(memory_value(Some("768".into()), "2G"), "768");
        assert_eq!(memory_value(Some("abc".into()), "2G"), "2G");
        assert_eq!(memory_value(Some("1G --property=X".into()), "2G"), "2G");
        assert_eq!(memory_value(Some("G".into()), "2G"), "2G");
        assert_eq!(memory_value(Some("  ".into()), "2G"), "2G");
        assert_eq!(memory_value(None, "2G"), "2G");
    }

    #[test]
    fn memory_limits_fall_back_to_defaults_for_injected_values() {
        let spec = spec_for(
            "term-1",
            "linux",
            &[
                ("JAIT_UNIT", "jait-gateway.service"),
                ("JAIT_TERMINAL_MEMORY_MAX", "2G --property=Delegate=yes"),
                ("JAIT_TERMINAL_MEMORY_HIGH", "512M"),
            ],
        );
        assert!(spec.args.iter().any(|arg| arg == "--property=MemoryMax=2G"));
        assert!(!spec.args.iter().any(|arg| arg.contains("Delegate")));
        assert!(
            spec.args
                .iter()
                .any(|arg| arg == "--property=MemoryHigh=512M")
        );
    }
}
