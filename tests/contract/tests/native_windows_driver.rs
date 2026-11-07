//! Contract tests for the native Windows OS-control driver
//! (`packages/gateway-rust/src/os_control/windows_driver.rs`).
//!
//! The reference implementation drives a dockur Windows VM through `ssh` and
//! `docker inspect`. No VM exists in CI, so the tests drive the real public
//! API with injected host seams ([`DockerInspector`] / [`SshTransport`]) and
//! assert on the exact argv, PowerShell encoding and error mapping that the
//! reference produces. The PTY transport itself is Unix-only by design (see the
//! module docs); its `UnsupportedPlatform` path is asserted separately.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use jait_gateway::os_control::windows_driver::{
    DockerInspector, OsClickButton, OsClickOptions, OsControlDriver, OsDriverType, OsExecOptions,
    OsScrollDirection, OsScrollOptions, OsTypeOptions, SshInvocation, SshOutcome, SshTransport,
    WindowsDriverError, WindowsOsControlDriver, build_windows_send_keys, build_windows_ssh_args,
    encode_powershell_command, escape_send_keys_text, extract_ssh_port, js_round, key_snippet,
    looks_like_password_prompt, scroll_snippet, strip_ansi,
};

const SSH_USER_ENV: &str = r#"["PATH=C:\\Windows","SSH_USERNAME=sandbox","SSH_PASSWORD=secret"]"#;
const SSH_PORTS_JSON: &str = r#"{"22/tcp":[{"HostIp":"0.0.0.0","HostPort":"2223"}]}"#;

/// Inspector double that records the `--format` strings it is asked for.
#[derive(Default)]
struct FakeInspector {
    ports: String,
    env: String,
    formats: Arc<Mutex<Vec<String>>>,
}

impl DockerInspector for FakeInspector {
    fn inspect(&mut self, format: &str, _container: &str) -> Result<String, WindowsDriverError> {
        self.formats.lock().unwrap().push(format.to_string());
        if format.contains("NetworkSettings.Ports") {
            Ok(self.ports.clone())
        } else {
            Ok(self.env.clone())
        }
    }
}

/// Transport double: records invocations and returns a canned outcome.
struct FakeTransport {
    outcome: SshOutcome,
    seen: Arc<Mutex<Vec<SshInvocation>>>,
}

impl SshTransport for FakeTransport {
    fn run(&mut self, invocation: &SshInvocation) -> Result<SshOutcome, WindowsDriverError> {
        self.seen.lock().unwrap().push(invocation.clone());
        Ok(self.outcome.clone())
    }
}

struct Harness {
    driver: WindowsOsControlDriver,
    seen: Arc<Mutex<Vec<SshInvocation>>>,
    formats: Arc<Mutex<Vec<String>>>,
}

fn make_harness(outcome: SshOutcome, env: &str, ssh_password: Option<&str>) -> Harness {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let formats = Arc::new(Mutex::new(Vec::new()));
    let inspector = FakeInspector {
        ports: SSH_PORTS_JSON.to_string(),
        env: env.to_string(),
        formats: formats.clone(),
    };
    let transport = FakeTransport {
        outcome,
        seen: seen.clone(),
    };
    let driver = WindowsOsControlDriver::with_seams(
        "jait-windows-sandbox",
        "docker",
        ssh_password.map(str::to_string),
        Box::new(inspector),
        Box::new(transport),
    );
    Harness {
        driver,
        seen,
        formats,
    }
}

fn ok_outcome(output: &str) -> SshOutcome {
    SshOutcome {
        output: output.to_string(),
        exit_code: Some(0),
        timed_out: false,
    }
}

#[test]
fn powershell_commands_are_utf16le_base64() {
    // `powershell -EncodedCommand` takes UTF-16LE / base64.
    assert_eq!(
        encode_powershell_command("Get-Date"),
        "RwBlAHQALQBEAGEAdABlAA=="
    );
    assert_eq!(encode_powershell_command(""), "");
    assert_eq!(encode_powershell_command("A"), "QQA=");
}

#[test]
fn ssh_argv_matches_reference() {
    let args = build_windows_ssh_args(2223, "sandbox", "echo hi");
    let expected: Vec<String> = [
        "-p",
        "2223",
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
        "sandbox@127.0.0.1",
        "echo hi",
    ]
    .iter()
    .map(|value| value.to_string())
    .collect();
    assert_eq!(args, expected);
}

#[test]
fn ansi_sequences_are_stripped() {
    // CSI colour codes disappear; carriage returns and text survive.
    assert_eq!(strip_ansi("\u{1b}[1;32mOK\u{1b}[0m\r\n"), "OK\r\n");
    // OSC titles are consumed whole, including the `0;` payload.
    assert_eq!(strip_ansi("\u{1b}]0;user@host\u{7}done"), "done");
    // TS strips ESC + one char only inside the class [@-Z\\-_]: `M` (0x4D) is
    // dropped, `7` (0x37) is outside it and must survive verbatim.
    assert_eq!(strip_ansi("a\u{1b}Mb"), "ab");
    assert_eq!(strip_ansi("a\u{1b}7b"), "a\u{1b}7b");
}

#[test]
fn send_keys_translation_and_escaping() {
    assert_eq!(build_windows_send_keys("ctrl+shift+t"), "^+t");
    // TS maps each `+`-separated token: ctrl -> ^, alt -> %, delete -> {DELETE}.
    assert_eq!(build_windows_send_keys("Ctrl + Alt + Delete"), "^%{DELETE}");
    assert_eq!(build_windows_send_keys("pagedown"), "{PGDN}");
    assert_eq!(build_windows_send_keys("super+tab"), "{LWIN}{TAB}");
    // SendKeys metacharacters are wrapped in braces.
    assert_eq!(escape_send_keys_text("a+b"), "a{+}b");
    assert_eq!(escape_send_keys_text("(x)%"), "{(}x{)}{%}");
}

#[test]
fn empty_key_combo_is_refused() {
    let error = key_snippet("+", None).expect_err("empty combo must fail");
    assert_eq!(
        error,
        WindowsDriverError::EmptyCombo {
            combo: "+".to_string()
        }
    );
    assert!(error.to_string().contains("os.keyboard"));
}

#[test]
fn scroll_and_click_encodings() {
    assert_eq!(OsScrollDirection::Up.delta(), 120);
    assert_eq!(OsScrollDirection::Down.delta(), -120);
    assert_eq!(OsScrollDirection::Right.delta(), 120);
    assert_eq!(OsScrollDirection::Left.delta(), -120);

    let opts = OsScrollOptions::new()
        .direction(OsScrollDirection::Down)
        .amount(2.0)
        .at(5.4, 6.6);
    let snippet = scroll_snippet(&opts);
    // Cursor is rounded like `Math.round`, then the wheel fires at -120 * 2.
    assert!(snippet.contains("SetCursorPos(5, 7)"), "snippet: {snippet}");
    assert!(
        snippet.contains("mouse_event(0x0800, 0, 0, -240, [UIntPtr]::Zero);"),
        "snippet: {snippet}"
    );

    // Without coordinates no cursor move call is emitted. The reference builds
    // `${USER32_PINVOKE}\n${move}\n[OsInput]::mouse_event(...)`, so an empty
    // `move` leaves *two* consecutive newlines before the wheel call; that gap
    // is the reference behaviour, not a bug.
    let bare = scroll_snippet(&OsScrollOptions::new().amount(1.0));
    // The Add-Type preamble *declares* SetCursorPos, so only the call counts.
    assert!(!bare.contains("[OsInput]::SetCursorPos"));
    assert_eq!(bare.matches("[OsInput]::mouse_event(").count(), 1);
    assert!(bare.contains("\n\n[OsInput]::mouse_event(0x0800, 0, 0, -120, [UIntPtr]::Zero);\n"));
    assert!(bare.ends_with(";\n"));

    // With both coordinates the move line is filled in and precedes the wheel
    // call, so the blank-line gap disappears.
    let moved = scroll_snippet(&OsScrollOptions::new().amount(2.0).at(-8.5, 300.0));
    assert_eq!(moved.matches("[OsInput]::SetCursorPos(").count(), 1);
    assert!(moved.contains("[OsInput]::SetCursorPos(-8, 300);"));
    assert!(moved.contains("\n[OsInput]::mouse_event(0x0800, 0, 0, -240, [UIntPtr]::Zero);\n"));
    assert!(!moved.contains("\n\n[OsInput]::mouse_event("));
    assert!(moved.find("[OsInput]::SetCursorPos(") < moved.find("[OsInput]::mouse_event("));
    assert_eq!(js_round(2.5), 3.0);
    assert_eq!(js_round(-2.5), -2.0);

    let click = jait_gateway::os_control::windows_driver::click_snippet(
        10.0,
        20.0,
        OsClickButton::Right,
        2,
    );
    assert!(click.contains("SetCursorPos(10, 20)"));
    assert_eq!(
        click
            .matches("mouse_event(0x08,0,0,0,[UIntPtr]::Zero)")
            .count(),
        2
    );
    assert_eq!(
        click
            .matches("mouse_event(0x10,0,0,0,[UIntPtr]::Zero)")
            .count(),
        2
    );
    assert_eq!(
        OsClickOptions::new()
            .button(OsClickButton::Left)
            .effective_clicks(),
        1
    );
}

#[test]
fn exec_runs_powershell_over_ssh() {
    let mut harness = make_harness(ok_outcome("NT AUTHORITY\\SYSTEM"), SSH_USER_ENV, None);
    let result = harness
        .driver
        .exec("whoami", &OsExecOptions::default())
        .expect("exec");

    assert!(result.ok);
    assert_eq!(result.exit_code, Some(0));
    assert!(!result.timed_out);
    assert_eq!(result.output, "NT AUTHORITY\\SYSTEM");
    assert_eq!(result.container_name, "jait-windows-sandbox");

    let seen = harness.seen.lock().unwrap().clone();
    assert_eq!(seen.len(), 1);
    let invocation = &seen[0];
    assert_eq!(invocation.program, "ssh");
    assert_eq!(invocation.password, "secret");
    // Published port + container-provided user win over the constructor args.
    assert_eq!(invocation.args[1], "2223");
    assert!(invocation.args.iter().any(|arg| arg == "sandbox@127.0.0.1"));
    let command = invocation.args.last().unwrap();
    assert!(
        command.starts_with("powershell -NoProfile -EncodedCommand "),
        "command: {command}"
    );
    assert_eq!(invocation.timeout, Duration::from_millis(30_000));

    let formats = harness.formats.lock().unwrap().clone();
    assert_eq!(
        formats,
        vec![
            "{{json .NetworkSettings.Ports}}".to_string(),
            "{{json .Config.Env}}".to_string(),
        ]
    );

    // An explicit timeout is forwarded to the transport.
    let mut harness = make_harness(ok_outcome(""), SSH_USER_ENV, None);
    harness
        .driver
        .exec(
            "ping -n 1 127.0.0.1",
            &OsExecOptions {
                timeout_ms: Some(1_500),
                ..OsExecOptions::default()
            },
        )
        .expect("exec with timeout");
    assert_eq!(
        harness.seen.lock().unwrap()[0].timeout,
        Duration::from_millis(1_500)
    );
}

#[test]
fn password_is_required() {
    // No `SSH_PASSWORD` in the container env and no constructor password.
    let mut harness = make_harness(ok_outcome(""), r#"["SSH_USERNAME=sandbox"]"#, None);
    let error = harness
        .driver
        .exec("whoami", &OsExecOptions::default())
        .expect_err("missing password must refuse");
    assert_eq!(error, WindowsDriverError::MissingPassword);
    let message = error.to_string();
    assert!(
        message.contains("WINDOWS_SSH_PASSWORD"),
        "message: {message}"
    );
    assert!(
        message.contains("windows.sandbox.start"),
        "message: {message}"
    );
    // Nothing was executed.
    assert!(harness.seen.lock().unwrap().is_empty());

    // An empty value counts as unset and falls back to the constructor value.
    let mut harness = make_harness(
        ok_outcome("ok"),
        r#"["SSH_USERNAME=sandbox","SSH_PASSWORD="]"#,
        Some("fallback"),
    );
    harness
        .driver
        .exec("whoami", &OsExecOptions::default())
        .expect("fallback password");
    assert_eq!(harness.seen.lock().unwrap()[0].password, "fallback");
}

#[test]
fn timeout_and_exit_codes_are_mapped() {
    let mut harness = make_harness(
        SshOutcome {
            output: String::new(),
            exit_code: None,
            timed_out: true,
        },
        SSH_USER_ENV,
        None,
    );
    let error = harness
        .driver
        .exec("whoami", &OsExecOptions::default())
        .expect_err("timeout must fail");
    match &error {
        WindowsDriverError::Timeout {
            timeout_ms,
            container,
        } => {
            assert_eq!(*timeout_ms, 30_000);
            assert_eq!(container, "jait-windows-sandbox");
        }
        other => panic!("unexpected error: {other:?}"),
    }
    assert!(error.to_string().contains("30000"));

    // Non-zero exit: the ANSI-stripped, trimmed, 500-char-capped detail is kept.
    let mut harness = make_harness(
        SshOutcome {
            output: "\u{1b}[31mfatal: no session\u{1b}[0m\n".to_string(),
            exit_code: Some(3),
            timed_out: false,
        },
        SSH_USER_ENV,
        None,
    );
    let error = harness
        .driver
        .exec("whoami", &OsExecOptions::default())
        .expect_err("exit 3 must fail");
    match &error {
        WindowsDriverError::SshExit { exit_code, detail } => {
            assert_eq!(*exit_code, Some(3));
            assert_eq!(detail, "fatal: no session");
        }
        other => panic!("unexpected error: {other:?}"),
    }
    let message = error.to_string();
    assert!(message.contains('3'), "message: {message}");

    // Empty failure output becomes the literal `no output`.
    let mut harness = make_harness(
        SshOutcome {
            output: "   \n".to_string(),
            exit_code: None,
            timed_out: false,
        },
        SSH_USER_ENV,
        None,
    );
    let error = harness
        .driver
        .exec("whoami", &OsExecOptions::default())
        .expect_err("missing exit code must fail");
    match &error {
        WindowsDriverError::SshExit { exit_code, detail } => {
            assert_eq!(*exit_code, None);
            assert_eq!(detail, "no output");
        }
        other => panic!("unexpected error: {other:?}"),
    }
    assert!(error.to_string().contains("null"), "message: {error}");
}

#[test]
fn screenshot_returns_decoded_png() {
    // base64 of `\x89PNG\r\n`, wrapped the way PowerShell emits it.
    let mut harness = make_harness(ok_outcome("iVBORw0K\n"), SSH_USER_ENV, Some("secret"));
    let shot = harness.driver.screenshot().expect("screenshot");
    assert_eq!(shot.png, b"\x89PNG\r\n");
    // The reference never measures the bitmap.
    assert_eq!(shot.width, 0);
    assert_eq!(shot.height, 0);
    assert_eq!(harness.driver.os_type(), OsDriverType::Windows);

    let seen = harness.seen.lock().unwrap().clone();
    let decoded = {
        use base64_engine::decode;
        decode(seen[0].args.last().unwrap())
    };
    assert!(decoded.contains("CopyFromScreen"), "script: {decoded}");
    assert!(decoded.contains("System.Drawing.Imaging.ImageFormat]::Png"));
}

/// Minimal local helper: decode the base64 tail of an `-EncodedCommand` argv
/// entry back to a UTF-16LE script so the test can assert on the payload.
mod base64_engine {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    fn value(byte: u8) -> u32 {
        ALPHABET
            .iter()
            .position(|candidate| *candidate == byte)
            .expect("base64 alphabet") as u32
    }

    pub fn decode(command: &str) -> String {
        let encoded = command
            .rsplit(' ')
            .next()
            .expect("encoded command tail")
            .trim_end_matches('=');
        let mut bytes = Vec::new();
        let mut buffer = 0u32;
        let mut bits = 0u32;
        for byte in encoded.bytes() {
            buffer = (buffer << 6) | value(byte);
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                bytes.push(((buffer >> bits) & 0xff) as u8);
            }
        }
        let units: Vec<u16> = bytes
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    }
}

#[test]
fn mouse_move_and_type_text_snippets() {
    let mut harness = make_harness(ok_outcome(""), SSH_USER_ENV, Some("secret"));
    harness.driver.mouse_move(3.5, 4.0).expect("mouse move");
    harness
        .driver
        .type_text("a+b'c", &OsTypeOptions::default())
        .expect("type");

    let seen = harness.seen.lock().unwrap().clone();
    let first = base64_engine::decode(seen[0].args.last().unwrap());
    assert!(first.contains("SetCursorPos(4, 4)"), "script: {first}");
    let second = base64_engine::decode(seen[1].args.last().unwrap());
    // Metacharacters are braced and single quotes doubled for SendKeys.
    assert!(second.contains("SendWait('a{+}b''c');"), "script: {second}");
}

#[test]
fn ssh_port_and_prompt_helpers() {
    assert_eq!(
        extract_ssh_port(r#"{"22/tcp":[{"HostPort":"49153"}]}"#),
        Some(49153)
    );
    assert_eq!(extract_ssh_port("{}"), None);
    assert!(looks_like_password_prompt("docker@127.0.0.1's password: "));
    assert!(!looks_like_password_prompt("Password: supplied"));
}

#[test]
fn click_button_flags_match_windows_constants() {
    assert_eq!(OsClickButton::Left.mouse_flags(), ("0x02", "0x04"));
    assert_eq!(OsClickButton::Right.mouse_flags(), ("0x08", "0x10"));
    assert_eq!(OsClickButton::Middle.mouse_flags(), ("0x20", "0x40"));
}
