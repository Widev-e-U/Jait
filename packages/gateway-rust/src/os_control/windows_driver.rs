//! Windows OS-control driver (native port of `src/os-control/windows-driver.ts`).
//!
//! # The original
//!
//! The TypeScript driver drives a dockur/Windows VM running inside Docker. Every
//! operation is a PowerShell snippet shipped to the guest over password
//! authenticated SSH, executed with `powershell -NoProfile -EncodedCommand
//! <base64 utf16le>`. Credentials and the published SSH port come from
//! `docker inspect` on the host. Input primitives are `user32.dll` P/Invokes
//! (`SetCursorPos`, `mouse_event`) and `System.Windows.Forms.SendKeys`.
//!
//! # Platform boundary (read this before using the crate on Windows)
//!
//! The TypeScript implementation spends `node-pty` to get a PTY so it can answer
//! the SSH password prompt. This crate reproduces that with `libc::openpty` and
//! is therefore **only able to drive the VM from a Unix host**:
//!
//! * Unix host: [`PtySshTransport`] is a real PTY runner — it allocates a
//!   pseudo terminal, makes it the child's controlling terminal (`setsid` +
//!   `TIOCSCTTY`), waits for the password prompt, feeds the password and
//!   collects the output until EOF.
//! * Windows host: `ConPTY` is the equivalent API, but it needs a Win32 binding
//!   this crate does not have. [`PtySshTransport`] therefore returns
//!   [`WindowsDriverError::UnsupportedPlatform`] instead of silently trying to
//!   write a password into a pipe (which can never work: `ssh` reads passwords
//!   from the terminal device, not stdin). Adding Windows-host support requires
//!   a `windows`/`winpty` style dependency — reported, not silently invented.
//!
//! The *guest* side is unaffected: the guest is always Windows, and the
//! PowerShell snippets here are byte-identical to the original's.
//!
//! # Async
//!
//! The original returns promises. The port is deliberately synchronous: the
//! trait is object safe (`Box<dyn OsControlDriver>`), so call sites that need
//! concurrency wrap a call in `tokio::task::spawn_blocking`. Behaviour (argv,
//! timeouts, error messages, output handling) is unchanged.
//!
//! # Seams
//!
//! Two host interactions are trait seams so the driver can be tested without
//! Docker or a VM:
//!
//! * [`DockerInspector`] — replaces `execFile("docker", ["inspect", …])`.
//!   [`CommandDockerInspector`] is the real implementation (15 s timeout,
//!   4 MiB output cap, non-zero exit is an error).
//! * [`SshTransport`] — replaces the injected `PtyFactory`.
//!   [`PtySshTransport`] is the real implementation described above.

use std::fmt;
use std::time::Duration;

use base64::Engine as _;
use serde::Serialize;

/// dockur's default published SSH port, used when `docker inspect` yields
/// nothing usable.
pub const DEFAULT_SSH_PORT: u16 = 2222;
/// Default guest account name.
pub const DEFAULT_SSH_USER: &str = "docker";
/// Default per-command timeout for [`WindowsOsControlDriver::run_powershell`].
pub const DEFAULT_TIMEOUT_MS: u64 = 30_000;
/// `docker inspect` timeout (matches the original `execFile` options).
pub const INSPECT_TIMEOUT_MS: u64 = 15_000;
/// `docker inspect` stdout cap (matches the original `maxBuffer`).
pub const INSPECT_MAX_BUFFER: usize = 4 * 1024 * 1024;
/// Terminal geometry handed to the PTY, matching the original.
pub const PTY_TERMINAL_NAME: &str = "xterm-256color";
pub const PTY_COLS: u16 = 160;
pub const PTY_ROWS: u16 = 40;

/// PowerShell snippet declaring the `user32` P/Invoke helpers used by input ops.
pub const USER32_PINVOKE: &str = r#"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OsInput {
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extraInfo);
}
'@;
"#;

// ---------------------------------------------------------------------------
// Option / result types (mirror of `os-control/types.ts`)
// ---------------------------------------------------------------------------

/// Which desktop stack the driver talks to.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OsDriverType {
    LinuxDesktop,
    Windows,
}

impl OsDriverType {
    pub fn as_str(self) -> &'static str {
        match self {
            OsDriverType::LinuxDesktop => "linux-desktop",
            OsDriverType::Windows => "windows",
        }
    }
}

/// A PNG screenshot. `width`/`height` stay `0`, exactly like the original —
/// the TS driver never parses the PNG header.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OsScreenshot {
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Mouse button for [`OsControlDriver::click`].
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum OsClickButton {
    #[default]
    Left,
    Middle,
    Right,
}

impl OsClickButton {
    pub fn as_str(self) -> &'static str {
        match self {
            OsClickButton::Left => "left",
            OsClickButton::Middle => "middle",
            OsClickButton::Right => "right",
        }
    }

    /// Down/up `mouse_event` flag pair for this button.
    pub fn mouse_flags(self) -> (&'static str, &'static str) {
        match self {
            OsClickButton::Right => ("0x08", "0x10"),
            OsClickButton::Middle => ("0x20", "0x40"),
            OsClickButton::Left => ("0x02", "0x04"),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct OsClickOptions {
    pub button: OsClickButton,
    pub clicks: u32,
}

impl OsClickOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn button(mut self, button: OsClickButton) -> Self {
        self.button = button;
        self
    }

    pub fn clicks(mut self, clicks: u32) -> Self {
        self.clicks = clicks;
        self
    }

    /// `Math.max(1, opts.clicks ?? 1)`.
    pub fn effective_clicks(&self) -> u32 {
        self.clicks.max(1)
    }
}

/// `delayMs` exists in the original's type but is unused ("delay handled by
/// SendKeys timing naturally"); it is carried for signature fidelity.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct OsTypeOptions {
    pub delay_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct OsKeyOptions {
    pub hold_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum OsScrollDirection {
    Up,
    #[default]
    Down,
    Left,
    Right,
}

impl OsScrollDirection {
    pub fn as_str(self) -> &'static str {
        match self {
            OsScrollDirection::Up => "up",
            OsScrollDirection::Down => "down",
            OsScrollDirection::Left => "left",
            OsScrollDirection::Right => "right",
        }
    }

    /// 120 == one wheel notch; vertical and horizontal wheels differ only in
    /// the flag, not the delta sign convention.
    pub fn delta(self) -> i64 {
        match self {
            OsScrollDirection::Up => 120,
            OsScrollDirection::Down => -120,
            OsScrollDirection::Right => 120,
            OsScrollDirection::Left => -120,
        }
    }

    fn wheel_flag(self) -> &'static str {
        match self {
            OsScrollDirection::Left | OsScrollDirection::Right => "0x1000",
            OsScrollDirection::Up | OsScrollDirection::Down => "0x0800",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct OsScrollOptions {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub direction: OsScrollDirection,
    pub amount: Option<f64>,
}

impl OsScrollOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn direction(mut self, direction: OsScrollDirection) -> Self {
        self.direction = direction;
        self
    }

    pub fn amount(mut self, amount: f64) -> Self {
        self.amount = Some(amount);
        self
    }

    pub fn at(mut self, x: f64, y: f64) -> Self {
        self.x = Some(x);
        self.y = Some(y);
        self
    }

    /// `Math.max(1, Math.round(opts.amount ?? 1))`.
    fn effective_amount(&self) -> u32 {
        js_round(self.amount.unwrap_or(1.0)).max(1.0) as u32
    }
}

/// `cwd`/`env` exist in the original's type and are ignored (`void opts`); they
/// are carried for signature fidelity.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct OsExecOptions {
    pub cwd: Option<String>,
    pub env: Vec<(String, String)>,
    pub timeout_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsExecResult {
    pub ok: bool,
    pub output: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub container_name: String,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WindowsDriverError {
    /// No SSH password could be found for the sandbox.
    MissingPassword,
    /// The SSH command outlived its timeout.
    Timeout { timeout_ms: u64, container: String },
    /// The SSH command exited non-zero (or with no status).
    SshExit {
        exit_code: Option<i32>,
        detail: String,
    },
    /// A key combo produced an empty SendKeys token.
    EmptyCombo { combo: String },
    /// `docker inspect` could not be run / produced unusable output.
    Inspect { detail: String },
    /// Spawning or driving the SSH transport failed.
    Transport { detail: String },
    /// The host platform cannot provide the required primitive (see module docs).
    UnsupportedPlatform { detail: String },
}

impl fmt::Display for WindowsDriverError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WindowsDriverError::MissingPassword => write!(
                f,
                "Windows OS control needs an SSH password for the dockur VM. Start the sandbox \
                 with a password (windows.sandbox.start password=...) or set \
                 WINDOWS_SSH_PASSWORD so the VM is provisioned with SSH_USERNAME/SSH_PASSWORD."
            ),
            WindowsDriverError::Timeout {
                timeout_ms,
                container,
            } => write!(
                f,
                "Windows OS control timed out after {timeout_ms}ms while running a PowerShell \
                 command over SSH to sandbox \"{container}\"."
            ),
            WindowsDriverError::SshExit { exit_code, detail } => {
                let code = match exit_code {
                    Some(code) => code.to_string(),
                    None => "null".to_string(),
                };
                write!(
                    f,
                    "Windows OS control SSH command exited with code {code}: {detail}"
                )
            }
            WindowsDriverError::EmptyCombo { combo } => {
                write!(f, "os.keyboard: empty or invalid combo \"{combo}\"")
            }
            WindowsDriverError::Inspect { detail } => {
                write!(f, "Windows OS control docker inspect failed: {detail}")
            }
            WindowsDriverError::Transport { detail } => {
                write!(f, "Windows OS control SSH transport failed: {detail}")
            }
            WindowsDriverError::UnsupportedPlatform { detail } => f.write_str(detail),
        }
    }
}

impl std::error::Error for WindowsDriverError {}

// ---------------------------------------------------------------------------
// Pure logic core
// ---------------------------------------------------------------------------

/// `Math.round` semantics (`floor(x + 0.5)`), i.e. half-up towards +infinity,
/// which differs from Rust's `f64::round` for negative halves.
pub fn js_round(value: f64) -> f64 {
    if value.is_finite() {
        (value + 0.5).floor()
    } else {
        value
    }
}

/// Strip ANSI escape sequences from PTY output.
///
/// The OSC branch must come first, otherwise `ESC ]` matches the single
/// character class and the `0;user@host: dir` title payload leaks into the
/// cleaned output.
pub fn strip_ansi(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\x1b'
            && let Some(len) = ansi_escape_len(&chars, i)
        {
            i += len;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Length (in chars) of the ANSI escape starting at `chars[i]`, if any.
fn ansi_escape_len(chars: &[char], i: usize) -> Option<usize> {
    // OSC: ESC ] ... (BEL | ESC \)
    if chars.get(i + 1) == Some(&']') {
        let mut j = i + 2;
        while j < chars.len() {
            if chars[j] == '\x07' {
                return Some(j + 1 - i);
            }
            if chars[j] == '\x1b' && chars.get(j + 1) == Some(&'\\') {
                return Some(j + 2 - i);
            }
            j += 1;
        }
        // Unterminated OSC: fall through so `ESC ]` is handled as a
        // single-character escape (`]` is in `[\\-_]`), matching the regex.
    }
    // CSI: ESC [ parameter-bytes intermediate-bytes final-byte
    if chars.get(i + 1) == Some(&'[') {
        let mut j = i + 2;
        while j < chars.len() && ('0'..='?').contains(&chars[j]) {
            j += 1;
        }
        while j < chars.len() && (' '..='/').contains(&chars[j]) {
            j += 1;
        }
        if j < chars.len() && ('@'..='~').contains(&chars[j]) {
            return Some(j + 1 - i);
        }
    }
    // Single character escape: ESC [@-Z\\-_]
    let next = *chars.get(i + 1)?;
    if ('@'..='Z').contains(&next) || ('\\'..='_').contains(&next) {
        return Some(2);
    }
    None
}

/// Build the argv for the one-shot `ssh` invocation that runs a PowerShell
/// command in the VM. Password auth is forced so the PTY runner can feed the
/// password at the prompt (no `sshpass` / keys required).
pub fn build_windows_ssh_args(port: u16, username: &str, command: &str) -> Vec<String> {
    [
        "-p".to_string(),
        port.to_string(),
        "-o".to_string(),
        "StrictHostKeyChecking=no".to_string(),
        "-o".to_string(),
        "UserKnownHostsFile=/dev/null".to_string(),
        "-o".to_string(),
        "LogLevel=ERROR".to_string(),
        "-o".to_string(),
        "NumberOfPasswordPrompts=1".to_string(),
        "-o".to_string(),
        "PreferredAuthentications=password,keyboard-interactive".to_string(),
        "-o".to_string(),
        "PubkeyAuthentication=no".to_string(),
        "-o".to_string(),
        "ConnectTimeout=10".to_string(),
        format!("{username}@127.0.0.1"),
        command.to_string(),
    ]
    .to_vec()
}

/// Encode a PowerShell snippet for `-EncodedCommand`: base64 of the UTF-16LE
/// representation (UTF-8 base64 is mis-decoded by PowerShell).
pub fn encode_powershell_command(snippet: &str) -> String {
    let mut bytes = Vec::with_capacity(snippet.len() * 2);
    for unit in snippet.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Map a special key name to a SendKeys token. Ordinary printable characters
/// pass through as themselves.
pub fn windows_key_token(part: &str) -> String {
    let p = part.to_lowercase();
    let token = match p.as_str() {
        "enter" | "return" => "{ENTER}",
        "tab" => "{TAB}",
        "esc" | "escape" => "{ESC}",
        "backspace" => "{BACKSPACE}",
        "delete" => "{DELETE}",
        "insert" => "{INSERT}",
        "home" => "{HOME}",
        "end" => "{END}",
        "pgup" | "pageup" => "{PGUP}",
        "pagedown" | "pgdn" => "{PGDN}",
        "up" => "{UP}",
        "down" => "{DOWN}",
        "left" => "{LEFT}",
        "right" => "{RIGHT}",
        "space" => " ",
        "super" | "win" | "meta" => "{LWIN}",
        other => return other.to_string(),
    };
    token.to_string()
}

/// Convert a human combo (e.g. `ctrl+shift+t`) into a SendKeys token string.
pub fn build_windows_send_keys(combo: &str) -> String {
    let mut out = String::new();
    for part in combo
        .split('+')
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty())
    {
        match part.as_str() {
            "ctrl" | "control" => out.push('^'),
            "alt" => out.push('%'),
            "shift" => out.push('+'),
            "super" | "win" | "meta" => out.push_str("{LWIN}"),
            _ => out.push_str(&windows_key_token(&part)),
        }
    }
    out
}

/// Escape text for `System.Windows.Forms.SendKeys` (protect `+ , ^ % ~ ( ) { }
/// [ ]`).
pub fn escape_send_keys_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if "+^%~(){}[]".contains(c) {
            out.push('{');
            out.push(c);
            out.push('}');
        } else {
            out.push(c);
        }
    }
    out
}

/// Extract the host-published SSH port from a `docker inspect -f
/// '{{json .NetworkSettings.Ports}}'` string.
///
/// The VM's OpenSSH lives on container port 22 (dockur forwards guest 22 →
/// container 22). Older setups published `2222/tcp` directly; both are accepted.
pub fn extract_ssh_port(ports_json: &str) -> Option<u16> {
    let mut best: Option<(usize, u16)> = None;
    for key in ["\"22/tcp\"", "\"2222/tcp\""] {
        let mut from = 0;
        while let Some(found) = ports_json[from..].find(key) {
            let start = from + found;
            let key_end = start + key.len();
            if let Some(port) = host_port_after(ports_json, key_end) {
                let earlier = match best {
                    None => true,
                    Some((pos, _)) => start < pos,
                };
                if earlier {
                    best = Some((start, port));
                }
                break;
            }
            from = key_end;
        }
    }
    best.map(|(_, port)| port)
}

/// Find `"HostPort":"<digits>"` after `key_end`, without crossing a newline
/// (the original regex uses `.` which does not match `\n`).
fn host_port_after(json: &str, key_end: usize) -> Option<u16> {
    let rest = json.get(key_end..)?;
    let line_end = rest.find('\n').unwrap_or(rest.len());
    let line = &rest[..line_end];
    let mut chars = line.char_indices();
    // The original requires `:[` immediately after the quoted key.
    if chars.next().map(|(_, c)| c) != Some(':') {
        return None;
    }
    if chars.next().map(|(_, c)| c) != Some('[') {
        return None;
    }
    let needle = "\"HostPort\":\"";
    let idx = line.find(needle)? + needle.len();
    let tail = &line[idx..];
    let digits: String = tail.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    if !tail[digits.len()..].starts_with('"') {
        return None;
    }
    digits.parse::<u16>().ok()
}

/// Whether PTY output ends in an SSH password prompt
/// (`/(?:password|passphrase).*:\s*$/im`).
pub fn looks_like_password_prompt(visible: &str) -> bool {
    visible.lines().any(|line| {
        let lower = line.to_lowercase();
        let mentions = lower.contains("password") || lower.contains("passphrase");
        if !mentions {
            return false;
        }
        match lower.rfind(':') {
            Some(idx) => lower[idx + 1..].trim().is_empty(),
            None => false,
        }
    })
}

// ---------------------------------------------------------------------------
// PowerShell snippet builders
// ---------------------------------------------------------------------------

fn screenshot_body() -> &'static str {
    r#"
Add-Type -AssemblyName System.Drawing;
Add-Type -AssemblyName System.Windows.Forms;
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen;
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height);
$g = [System.Drawing.Graphics]::FromImage($bmp);
$g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size);
$ms = New-Object System.IO.MemoryStream;
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png);
[Convert]::ToBase64String($ms.ToArray());
"#
}

/// Capture the virtual screen to a base64 PNG.
pub fn screenshot_snippet() -> String {
    let mut snippet = String::from(USER32_PINVOKE);
    snippet.push_str(screenshot_body());
    snippet
}

/// Click at screen coordinates `clicks` times.
pub fn click_snippet(x: f64, y: f64, button: OsClickButton, clicks: u32) -> String {
    let clicks = clicks.max(1);
    let (down, up) = button.mouse_flags();
    let line = format!(
        "[OsInput]::mouse_event({down},0,0,0,[UIntPtr]::Zero); \
         [OsInput]::mouse_event({up},0,0,0,[UIntPtr]::Zero);"
    );
    let mut snippet = String::from(USER32_PINVOKE);
    snippet.push_str(&format!(
        "\n[OsInput]::SetCursorPos({x}, {y});\n",
        x = js_round(x),
        y = js_round(y)
    ));
    for index in 0..clicks {
        if index > 0 {
            snippet.push('\n');
        }
        snippet.push_str(&line);
    }
    snippet.push('\n');
    snippet
}

/// Move the cursor to screen coordinates.
pub fn mouse_move_snippet(x: f64, y: f64) -> String {
    let mut snippet = String::from(USER32_PINVOKE);
    snippet.push_str(&format!(
        "\n[OsInput]::SetCursorPos({x}, {y});\n",
        x = js_round(x),
        y = js_round(y)
    ));
    snippet
}

/// Type text through `SendKeys`.
pub fn type_snippet(text: &str) -> String {
    let escaped = escape_send_keys_text(text).replace('\'', "''");
    format!(
        "\nAdd-Type -AssemblyName System.Windows.Forms;\n[System.Windows.Forms.SendKeys]::SendWait('{escaped}');\n"
    )
}

/// Press a key combo. An empty token is rejected exactly like the original.
pub fn key_snippet(combo: &str, hold_ms: Option<u64>) -> Result<String, WindowsDriverError> {
    let token = build_windows_send_keys(combo);
    if token.is_empty() {
        return Err(WindowsDriverError::EmptyCombo {
            combo: combo.to_string(),
        });
    }
    let hold = hold_ms.unwrap_or(0);
    let mut snippet = String::from("Add-Type -AssemblyName System.Windows.Forms;\n");
    if hold > 0 {
        snippet.push_str(
            "[System.Windows.Forms.SendKeys]::SendWait('{CTRL down}'); Start-Sleep -Milliseconds ",
        );
        snippet.push_str(&hold.to_string());
        snippet.push_str("; [System.Windows.Forms.SendKeys]::SendWait('{CTRL up}');");
    } else {
        snippet.push_str("[System.Windows.Forms.SendKeys]::SendWait('");
        snippet.push_str(&token.replace('\'', "''"));
        snippet.push_str("');");
    }
    snippet.push('\n');
    Ok(snippet)
}

/// Scroll the wheel, optionally moving the cursor first.
pub fn scroll_snippet(opts: &OsScrollOptions) -> String {
    let direction = opts.direction;
    let amount = opts.effective_amount();
    let delta = direction.delta() * i64::from(amount);
    let move_line = match (opts.x, opts.y) {
        (Some(x), Some(y)) => format!(
            "[OsInput]::SetCursorPos({x}, {y});",
            x = js_round(x),
            y = js_round(y)
        ),
        _ => String::new(),
    };
    let mut snippet = String::from(USER32_PINVOKE);
    snippet.push('\n');
    snippet.push_str(&move_line);
    snippet.push_str(&format!(
        "\n[OsInput]::mouse_event({flag}, 0, 0, {delta}, [UIntPtr]::Zero);\n",
        flag = direction.wheel_flag()
    ));
    snippet
}

/// Strip whitespace from a base64 screenshot payload, as the original does
/// before decoding.
pub fn decode_screenshot(output: &str) -> Vec<u8> {
    let cleaned: String = output
        .trim()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    base64::engine::general_purpose::STANDARD
        .decode(cleaned)
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Host seams
// ---------------------------------------------------------------------------

/// Outcome of one `ssh` invocation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SshOutcome {
    pub output: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
}

/// One-shot `ssh` invocation: argv, the password to answer the prompt with and
/// the wall-clock budget.
#[derive(Clone, PartialEq, Eq)]
pub struct SshInvocation {
    pub program: String,
    pub args: Vec<String>,
    pub password: String,
    pub timeout: Duration,
}

/// Replaces the injected `PtyFactory` of the original.
pub trait SshTransport {
    fn run(&mut self, invocation: &SshInvocation) -> Result<SshOutcome, WindowsDriverError>;
}

/// Replaces `execFileAsync("docker", ["inspect", "-f", …])` on the host.
pub trait DockerInspector {
    fn inspect(&mut self, format: &str, container: &str) -> Result<String, WindowsDriverError>;
}

/// The real `docker inspect` runner: 15 s timeout, 4 MiB stdout cap, non-zero
/// exit and spawn failures are errors (the caller decides whether to fall back).
#[derive(Clone, Debug)]
pub struct CommandDockerInspector {
    pub program: String,
    pub timeout: Duration,
    pub max_buffer: usize,
}

impl Default for CommandDockerInspector {
    fn default() -> Self {
        Self {
            program: "docker".to_string(),
            timeout: Duration::from_millis(INSPECT_TIMEOUT_MS),
            max_buffer: INSPECT_MAX_BUFFER,
        }
    }
}

impl CommandDockerInspector {
    pub fn new() -> Self {
        Self::default()
    }
}

impl DockerInspector for CommandDockerInspector {
    fn inspect(&mut self, format: &str, container: &str) -> Result<String, WindowsDriverError> {
        use std::io::Read as _;
        use std::process::{Command, Stdio};

        let mut child = Command::new(&self.program)
            .arg("inspect")
            .arg("-f")
            .arg(format)
            .arg("--")
            .arg(container)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| WindowsDriverError::Inspect {
                detail: format!("spawn {}: {error}", self.program),
            })?;

        let stdout = child.stdout.take().expect("piped stdout");
        let limit = self.max_buffer;
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let mut buffer = Vec::new();
            let result = stdout
                .take(limit.saturating_add(1) as u64)
                .read_to_end(&mut buffer);
            let _ = sender.send(result.map(|_| buffer));
        });
        let deadline = std::time::Instant::now() + self.timeout;
        let mut output = None;
        let mut status = None;
        while status.is_none() || output.is_none() {
            if output.is_none() {
                match receiver.try_recv() {
                    Ok(Ok(bytes)) if bytes.len() > limit => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(WindowsDriverError::Inspect {
                            detail: "stdout maxBuffer length exceeded".into(),
                        });
                    }
                    Ok(Ok(bytes)) => output = Some(bytes),
                    Ok(Err(error)) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(WindowsDriverError::Inspect {
                            detail: format!("read stdout: {error}"),
                        });
                    }
                    Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(WindowsDriverError::Inspect {
                            detail: "stdout reader failed".into(),
                        });
                    }
                    Err(std::sync::mpsc::TryRecvError::Empty) => {}
                }
            }
            if status.is_none() {
                match child.try_wait() {
                    Ok(value) => status = value,
                    Err(error) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(WindowsDriverError::Inspect {
                            detail: format!("wait: {error}"),
                        });
                    }
                }
            }
            if std::time::Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Err(WindowsDriverError::Inspect {
                    detail: format!("timed out after {}ms", self.timeout.as_millis()),
                });
            }
            if status.is_none() || output.is_none() {
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        let status = status.expect("completed child");
        let output = output.expect("completed stdout");
        if !status.success() {
            let code = status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "null".to_string());
            return Err(WindowsDriverError::Inspect {
                detail: format!("exited with code {code}"),
            });
        }
        Ok(String::from_utf8_lossy(&output).into_owned())
    }
}

/// The real PTY-backed `ssh` runner.
///
/// Unix hosts use `libc::openpty`; on Windows hosts the equivalent primitive is
/// ConPTY, which this crate cannot reach without a Win32 binding, so `run`
/// refuses with [`WindowsDriverError::UnsupportedPlatform`].
#[derive(Clone, Debug)]
pub struct PtySshTransport {
    pub program: String,
}

impl Default for PtySshTransport {
    fn default() -> Self {
        Self {
            program: "ssh".to_string(),
        }
    }
}

impl PtySshTransport {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_program(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
        }
    }
}

#[cfg(unix)]
impl PtySshTransport {
    fn run_pty(&mut self, invocation: &SshInvocation) -> Result<SshOutcome, WindowsDriverError> {
        use std::io::Write as _;
        use std::os::fd::{FromRawFd, RawFd};
        use std::os::unix::process::CommandExt;

        let (master, slave) = open_pty()?;
        let mut command = std::process::Command::new(&self.program);
        command.args(&invocation.args);
        // Force the PTY password prompt: no askpass helper, no X display.
        command.env_remove("SSH_ASKPASS");
        command.env_remove("DISPLAY");

        let spawn_result = (|| -> std::io::Result<std::process::Child> {
            unsafe {
                let stdin_fd = libc::dup(slave);
                let stdout_fd = libc::dup(slave);
                let stderr_fd = libc::dup(slave);
                if stdin_fd < 0 || stdout_fd < 0 || stderr_fd < 0 {
                    for fd in [stdin_fd, stdout_fd, stderr_fd] {
                        if fd >= 0 {
                            libc::close(fd);
                        }
                    }
                    return Err(std::io::Error::last_os_error());
                }
                command.stdin(std::process::Stdio::from_raw_fd(stdin_fd));
                command.stdout(std::process::Stdio::from_raw_fd(stdout_fd));
                command.stderr(std::process::Stdio::from_raw_fd(stderr_fd));
            }
            let slave_for_child: RawFd = slave;
            unsafe {
                command.pre_exec(move || {
                    if libc::setsid() < 0 {
                        return Err(std::io::Error::last_os_error());
                    }
                    if libc::ioctl(slave_for_child, libc::TIOCSCTTY as libc::c_ulong, 0) < 0 {
                        return Err(std::io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
            command.spawn()
        })();

        let mut child = match spawn_result {
            Ok(child) => child,
            Err(error) => {
                unsafe {
                    libc::close(master);
                    libc::close(slave);
                }
                return Err(WindowsDriverError::Transport {
                    detail: format!("spawn {}: {error}", self.program),
                });
            }
        };
        // Only the child needs the slave side now that it has its own copies.
        unsafe {
            libc::close(slave);
            let flags = libc::fcntl(master, libc::F_GETFL);
            libc::fcntl(master, libc::F_SETFL, flags | libc::O_NONBLOCK);
        }

        let deadline = std::time::Instant::now() + invocation.timeout;
        let mut raw: Vec<u8> = Vec::new();
        let mut password_sent = false;

        let outcome = loop {
            let now = std::time::Instant::now();
            if now >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                break SshOutcome {
                    output: String::from_utf8_lossy(&raw).into_owned(),
                    exit_code: None,
                    timed_out: true,
                };
            }
            let wait_ms = (deadline - now).as_millis().clamp(1, 50) as libc::c_int;
            let mut poll_fd = libc::pollfd {
                fd: master,
                events: libc::POLLIN,
                revents: 0,
            };
            let ready = unsafe { libc::poll(&mut poll_fd, 1, wait_ms) };
            if ready < 0 {
                let error = std::io::Error::last_os_error();
                if error.kind() == std::io::ErrorKind::Interrupted {
                    continue;
                }
                let _ = child.kill();
                let _ = child.wait();
                unsafe { libc::close(master) };
                return Err(WindowsDriverError::Transport {
                    detail: format!("poll: {error}"),
                });
            }
            if ready == 0 {
                continue;
            }
            let mut buffer = [0u8; 8192];
            let read = unsafe {
                libc::read(
                    master,
                    buffer.as_mut_ptr() as *mut libc::c_void,
                    buffer.len(),
                )
            };
            if read < 0 {
                let error = std::io::Error::last_os_error();
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
                ) {
                    continue;
                }
                // EIO is the documented PTY hangup on Linux/BSD.
                if error.raw_os_error() == Some(libc::EIO) {
                    break SshOutcome {
                        output: String::from_utf8_lossy(&raw).into_owned(),
                        exit_code: reap(&mut child),
                        timed_out: false,
                    };
                }
                let _ = child.kill();
                let _ = child.wait();
                unsafe { libc::close(master) };
                return Err(WindowsDriverError::Transport {
                    detail: format!("read: {error}"),
                });
            }
            if read == 0 {
                break SshOutcome {
                    output: String::from_utf8_lossy(&raw).into_owned(),
                    exit_code: reap(&mut child),
                    timed_out: false,
                };
            }
            if raw.len().saturating_add(read as usize) > 32 * 1024 * 1024 {
                let _ = child.kill();
                let _ = child.wait();
                unsafe { libc::close(master) };
                return Err(WindowsDriverError::Transport {
                    detail: "SSH output limit exceeded".into(),
                });
            }
            raw.extend_from_slice(&buffer[..read as usize]);
            if !password_sent {
                let visible = strip_ansi(&String::from_utf8_lossy(&raw));
                if looks_like_password_prompt(&visible) {
                    password_sent = true;
                    let payload = format!("{}\r", invocation.password);
                    let mut stdin = unsafe { std::fs::File::from_raw_fd(libc::dup(master)) };
                    let _ = stdin.write_all(payload.as_bytes());
                    let _ = stdin.flush();
                    // `File` owns the duplicate; dropping it closes only the dup.
                }
            }
        };

        unsafe { libc::close(master) };
        Ok(outcome)
    }
}

/// Allocate a PTY pair with the terminal geometry the original requests.
#[cfg(unix)]
fn open_pty() -> Result<(std::os::fd::RawFd, std::os::fd::RawFd), WindowsDriverError> {
    let mut master: libc::c_int = -1;
    let mut slave: libc::c_int = -1;
    let window = libc::winsize {
        ws_row: PTY_ROWS,
        ws_col: PTY_COLS,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let result = unsafe {
        libc::openpty(
            &mut master,
            &mut slave,
            std::ptr::null_mut(),
            std::ptr::null(),
            &window,
        )
    };
    if result != 0 {
        return Err(WindowsDriverError::Transport {
            detail: format!("openpty: {}", std::io::Error::last_os_error()),
        });
    }
    Ok((master, slave))
}

/// Reap the child after the PTY closed, without hanging forever.
#[cfg(unix)]
fn reap(child: &mut std::process::Child) -> Option<i32> {
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.code(),
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(_) => return None,
        }
    }
}

#[cfg(unix)]
impl SshTransport for PtySshTransport {
    fn run(&mut self, invocation: &SshInvocation) -> Result<SshOutcome, WindowsDriverError> {
        self.run_pty(invocation)
    }
}

#[cfg(not(unix))]
impl SshTransport for PtySshTransport {
    fn run(&mut self, _invocation: &SshInvocation) -> Result<SshOutcome, WindowsDriverError> {
        Err(WindowsDriverError::UnsupportedPlatform {
            detail: "Windows OS control needs a PTY to answer the SSH password prompt; this \
                     build has no ConPTY binding, so the driver can only run from a Unix host. \
                     Use ssh key auth plus a pipe transport, or add a Win32/ConPTY dependency."
                .to_string(),
        })
    }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/// Credentials resolved from the container environment, falling back to the
/// constructor arguments.
#[derive(Clone, PartialEq, Eq)]
pub struct SshCredentials {
    pub username: String,
    pub password: Option<String>,
}

/// The OS-control driver contract (mirror of `OsControlDriver`).
///
/// Synchronous and object safe; wrap calls in `spawn_blocking` for async parity.
pub trait OsControlDriver {
    fn os_type(&self) -> OsDriverType;
    fn screenshot(&mut self) -> Result<OsScreenshot, WindowsDriverError>;
    fn click(&mut self, x: f64, y: f64, opts: &OsClickOptions) -> Result<(), WindowsDriverError>;
    fn mouse_move(&mut self, x: f64, y: f64) -> Result<(), WindowsDriverError>;
    fn type_text(&mut self, text: &str, opts: &OsTypeOptions) -> Result<(), WindowsDriverError>;
    fn key(&mut self, combo: &str, opts: &OsKeyOptions) -> Result<(), WindowsDriverError>;
    fn scroll(&mut self, opts: &OsScrollOptions) -> Result<(), WindowsDriverError>;
    fn exec(
        &mut self,
        command: &str,
        opts: &OsExecOptions,
    ) -> Result<OsExecResult, WindowsDriverError>;
}

/// Drives the dockur Windows VM over SSH.
pub struct WindowsOsControlDriver {
    container_name: String,
    ssh_username: String,
    ssh_password: Option<String>,
    inspector: Box<dyn DockerInspector>,
    transport: Box<dyn SshTransport>,
}

impl WindowsOsControlDriver {
    /// Driver with the real `docker` inspector and the real PTY transport.
    pub fn new(container_name: impl Into<String>) -> Self {
        Self::with_seams(
            container_name,
            DEFAULT_SSH_USER,
            None,
            Box::<CommandDockerInspector>::default(),
            Box::<PtySshTransport>::default(),
        )
    }

    pub fn with_credentials(
        container_name: impl Into<String>,
        ssh_username: impl Into<String>,
        ssh_password: Option<String>,
    ) -> Self {
        Self::with_seams(
            container_name,
            ssh_username,
            ssh_password,
            Box::<CommandDockerInspector>::default(),
            Box::<PtySshTransport>::default(),
        )
    }

    /// Inject test doubles for the host seams.
    pub fn with_seams(
        container_name: impl Into<String>,
        ssh_username: impl Into<String>,
        ssh_password: Option<String>,
        inspector: Box<dyn DockerInspector>,
        transport: Box<dyn SshTransport>,
    ) -> Self {
        Self {
            container_name: container_name.into(),
            ssh_username: ssh_username.into(),
            ssh_password,
            inspector,
            transport,
        }
    }

    pub fn container_name(&self) -> &str {
        &self.container_name
    }

    pub fn ssh_username(&self) -> &str {
        &self.ssh_username
    }

    /// Find the published SSH port of the VM container via `docker inspect`,
    /// falling back to [`DEFAULT_SSH_PORT`].
    pub fn resolve_ssh_port(&mut self) -> u16 {
        match self
            .inspector
            .inspect("{{json .NetworkSettings.Ports}}", &self.container_name)
        {
            Ok(stdout) => extract_ssh_port(&stdout).unwrap_or(DEFAULT_SSH_PORT),
            Err(_) => DEFAULT_SSH_PORT,
        }
    }

    /// Resolve SSH credentials. The container environment is authoritative
    /// (`SSH_USERNAME`/`SSH_PASSWORD` are set by `startWindowsSandbox`); the
    /// constructor arguments are the fallback.
    pub fn resolve_ssh_credentials(&mut self) -> SshCredentials {
        let env: Vec<String> = match self
            .inspector
            .inspect("{{json .Config.Env}}", &self.container_name)
        {
            Ok(stdout) => serde_json::from_str::<serde_json::Value>(stdout.trim())
                .ok()
                .and_then(|value| value.as_array().cloned())
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(|entry| entry.as_str().map(|text| text.to_string()))
                        .collect()
                })
                .unwrap_or_default(),
            Err(_) => Vec::new(),
        };
        let get = |key: &str| -> Option<String> {
            let prefix = format!("{key}=");
            env.iter()
                .find(|entry| entry.starts_with(&prefix))
                .map(|entry| entry[prefix.len()..].to_string())
                .filter(|value| !value.is_empty())
        };
        SshCredentials {
            username: get("SSH_USERNAME").unwrap_or_else(|| self.ssh_username.clone()),
            password: get("SSH_PASSWORD").or_else(|| self.ssh_password.clone()),
        }
    }

    /// Run a PowerShell snippet in the VM over SSH and return its raw stdout.
    pub fn run_powershell(
        &mut self,
        snippet: &str,
        timeout: Duration,
    ) -> Result<String, WindowsDriverError> {
        let port = self.resolve_ssh_port();
        let credentials = self.resolve_ssh_credentials();
        let Some(password) = credentials.password else {
            return Err(WindowsDriverError::MissingPassword);
        };

        let encoded = encode_powershell_command(snippet);
        let args = build_windows_ssh_args(
            port,
            &credentials.username,
            &format!("powershell -NoProfile -EncodedCommand {encoded}"),
        );
        let invocation = SshInvocation {
            program: "ssh".to_string(),
            args,
            password,
            timeout,
        };
        let result = self.transport.run(&invocation)?;
        if result.timed_out {
            return Err(WindowsDriverError::Timeout {
                timeout_ms: timeout.as_millis() as u64,
                container: self.container_name.clone(),
            });
        }
        if result.exit_code != Some(0) {
            let cleaned = strip_ansi(&result.output).replace(&invocation.password, "[redacted]");
            let trimmed = cleaned.trim();
            let detail: String = trimmed.chars().take(500).collect();
            let detail = if detail.is_empty() {
                "no output".to_string()
            } else {
                detail
            };
            return Err(WindowsDriverError::SshExit {
                exit_code: result.exit_code,
                detail,
            });
        }
        Ok(result.output)
    }
}

impl OsControlDriver for WindowsOsControlDriver {
    fn os_type(&self) -> OsDriverType {
        OsDriverType::Windows
    }

    fn screenshot(&mut self) -> Result<OsScreenshot, WindowsDriverError> {
        let output = self.run_powershell(
            &screenshot_snippet(),
            Duration::from_millis(DEFAULT_TIMEOUT_MS),
        )?;
        Ok(OsScreenshot {
            png: decode_screenshot(&output),
            width: 0,
            height: 0,
        })
    }

    fn click(&mut self, x: f64, y: f64, opts: &OsClickOptions) -> Result<(), WindowsDriverError> {
        let snippet = click_snippet(x, y, opts.button, opts.effective_clicks());
        self.run_powershell(&snippet, Duration::from_millis(DEFAULT_TIMEOUT_MS))?;
        Ok(())
    }

    fn mouse_move(&mut self, x: f64, y: f64) -> Result<(), WindowsDriverError> {
        let snippet = mouse_move_snippet(x, y);
        self.run_powershell(&snippet, Duration::from_millis(DEFAULT_TIMEOUT_MS))?;
        Ok(())
    }

    fn type_text(&mut self, text: &str, opts: &OsTypeOptions) -> Result<(), WindowsDriverError> {
        // `delayMs` is intentionally unused, exactly like the original.
        let _ = opts;
        let snippet = type_snippet(text);
        self.run_powershell(&snippet, Duration::from_millis(DEFAULT_TIMEOUT_MS))?;
        Ok(())
    }

    fn key(&mut self, combo: &str, opts: &OsKeyOptions) -> Result<(), WindowsDriverError> {
        let snippet = key_snippet(combo, opts.hold_ms)?;
        self.run_powershell(&snippet, Duration::from_millis(DEFAULT_TIMEOUT_MS))?;
        Ok(())
    }

    fn scroll(&mut self, opts: &OsScrollOptions) -> Result<(), WindowsDriverError> {
        let snippet = scroll_snippet(opts);
        self.run_powershell(&snippet, Duration::from_millis(DEFAULT_TIMEOUT_MS))?;
        Ok(())
    }

    fn exec(
        &mut self,
        command: &str,
        opts: &OsExecOptions,
    ) -> Result<OsExecResult, WindowsDriverError> {
        let output = self.run_powershell(
            command,
            Duration::from_millis(opts.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS)),
        )?;
        Ok(OsExecResult {
            ok: true,
            output,
            exit_code: Some(0),
            timed_out: false,
            container_name: self.container_name.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(unix)]
    fn repair_inspector_enforces_output_limit_while_reading() {
        let mut inspector = CommandDockerInspector {
            program: "/usr/bin/printf".into(),
            timeout: Duration::from_secs(2),
            max_buffer: 2,
        };
        // printf writes the first argument, exceeding the small limit.
        let error = inspector.inspect("format", "container").unwrap_err();
        assert!(error.to_string().contains("maxBuffer"));
    }

    #[test]
    fn powershell_command_is_utf16le_base64() {
        assert_eq!(encode_powershell_command("A"), "QQA=");
        assert_eq!(encode_powershell_command(""), "");
        // "abc" → 61 00 62 00 63 00
        assert_eq!(encode_powershell_command("abc"), "YQBiAGMA");
    }

    #[test]
    fn ssh_args_match_reference() {
        let args = build_windows_ssh_args(2222, "docker", "powershell -NoProfile");
        assert_eq!(
            args,
            vec![
                "-p",
                "2222",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "UserKnownHostsFile=/dev/null",
                "-o",
                "LogLevel=ERROR",
                "-o",
                "NumberOfPasswordPrompts=1",
                "-o",
                "PreferredAuthentications=password,keyboard-interactive",
                "-o",
                "PubkeyAuthentication=no",
                "-o",
                "ConnectTimeout=10",
                "docker@127.0.0.1",
                "powershell -NoProfile",
            ]
        );
        assert_eq!(args.len(), 18);
    }

    #[test]
    fn strip_ansi_removes_csi_osc_and_single_char_escapes() {
        assert_eq!(strip_ansi("\x1b[31mred\x1b[0m"), "red");
        assert_eq!(strip_ansi("\x1b]0;user@host: ~\x07prompt$ "), "prompt$ ");
        assert_eq!(strip_ansi("\x1b]0;title\x1b\\done"), "done");
        assert_eq!(strip_ansi("\x1b(Bplain"), "\x1b(Bplain");
        assert_eq!(strip_ansi("no escapes"), "no escapes");
        // Unterminated OSC degrades to the single-character escape rule.
        assert_eq!(strip_ansi("\x1b]0;unterminated"), "0;unterminated");
        // A bare ESC that matches nothing is preserved.
        assert_eq!(strip_ansi("a\x1bb"), "a\x1bb");
    }

    #[test]
    fn send_keys_tokens_and_escaping() {
        assert_eq!(build_windows_send_keys("ctrl+shift+t"), "^+t");
        assert_eq!(build_windows_send_keys("Ctrl + Alt + Delete"), "^%{DELETE}");
        assert_eq!(build_windows_send_keys("super+tab"), "{LWIN}{TAB}");
        assert_eq!(build_windows_send_keys("win"), "{LWIN}");
        assert_eq!(build_windows_send_keys("space"), " ");
        assert_eq!(build_windows_send_keys("pagedown"), "{PGDN}");
        assert_eq!(build_windows_send_keys(""), "");
        assert_eq!(
            escape_send_keys_text("a+b(c){d}[e]~%^"),
            "a{+}b{(}c{)}{{}d{}}{[}e{]}{~}{%}{^}"
        );
    }

    #[test]
    fn key_snippet_rejects_empty_combo_and_supports_hold() {
        let error = key_snippet("+", None).unwrap_err();
        assert_eq!(
            error.to_string(),
            "os.keyboard: empty or invalid combo \"+\""
        );
        let plain = key_snippet("ctrl+a", None).unwrap();
        assert_eq!(
            plain,
            "Add-Type -AssemblyName System.Windows.Forms;\n[System.Windows.Forms.SendKeys]::SendWait('^a');\n"
        );
        let held = key_snippet("ctrl+a", Some(250)).unwrap();
        assert!(held.contains("Start-Sleep -Milliseconds 250"));
        assert!(held.contains("{CTRL down}"));
    }

    #[test]
    fn ssh_port_extraction() {
        let modern = r#"{"22/tcp":[{"HostIp":"0.0.0.0","HostPort":"49153"},{"HostIp":"::","HostPort":"49153"}]}"#;
        assert_eq!(extract_ssh_port(modern), Some(49153));
        let legacy = r#"{"2222/tcp":[{"HostIp":"0.0.0.0","HostPort":"2222"}]}"#;
        assert_eq!(extract_ssh_port(legacy), Some(2222));
        assert_eq!(extract_ssh_port("{}"), None);
        assert_eq!(extract_ssh_port(r#"{"22/tcp":[]}"#), None);
        // `.*?` does not cross newlines in the reference regex.
        assert_eq!(
            extract_ssh_port("{\"22/tcp\":[\n{\"HostPort\":\"49153\"}]}"),
            None
        );
        // Key must be followed by `:[` immediately.
        assert_eq!(
            extract_ssh_port(r#"{"22/tcp": [{"HostPort":"49153"}]}"#),
            None
        );
    }

    #[test]
    fn password_prompt_detection() {
        assert!(looks_like_password_prompt("docker@127.0.0.1's password: "));
        assert!(looks_like_password_prompt("Enter passphrase for key: "));
        assert!(!looks_like_password_prompt("password accepted"));
        assert!(!looks_like_password_prompt(""));
    }

    #[test]
    fn click_and_scroll_snippet_shapes() {
        let snippet = click_snippet(10.4, 20.6, OsClickButton::Left, 2);
        assert!(snippet.starts_with(USER32_PINVOKE));
        assert!(snippet.contains("[OsInput]::SetCursorPos(10, 21);"));
        assert_eq!(
            snippet
                .matches("[OsInput]::mouse_event(0x02,0,0,0,[UIntPtr]::Zero)")
                .count(),
            2
        );
        assert!(snippet.ends_with('\n'));

        let scroll = scroll_snippet(&OsScrollOptions::new().amount(2.0).at(5.0, 6.0));
        assert!(scroll.contains("[OsInput]::SetCursorPos(5, 6);"));
        assert!(scroll.contains("[OsInput]::mouse_event(0x0800, 0, 0, -240, [UIntPtr]::Zero);"));

        let horizontal = scroll_snippet(
            &OsScrollOptions::new()
                .direction(OsScrollDirection::Right)
                .amount(1.0),
        );
        assert!(horizontal.contains("[OsInput]::mouse_event(0x1000, 0, 0, 120, [UIntPtr]::Zero);"));
    }
}
