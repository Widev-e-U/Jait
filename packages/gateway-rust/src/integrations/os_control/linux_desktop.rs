//! LinuxDesktopOsControlDriver — drives the Linux XFCE desktop sandbox.
//!
//! Port of `packages/gateway/src/os-control/linux-desktop-driver.ts`.
//! All operations run inside the container via the [`LinuxDesktopShell`] port
//! (docker exec in production); screen capture uses ImageMagick's `import` and
//! input injection uses `xdotool`. The X server lives on `DISPLAY=:99` by
//! default (Xvfb + x11vnc on `:5900`); the display is configurable per image.
use super::contracts::{
    MouseButton, OsClickOptions, OsControlDriver, OsDriverType, OsExecOptions, OsKeyOptions,
    OsScreenshot, OsScrollOptions, OsTypeOptions, PngBuffer, SandboxRunResult, ScrollDirection,
};
use crate::app_config::js_trim;
use base64::Engine;
use futures_util::future::BoxFuture;
use std::collections::BTreeMap;
use std::sync::Arc;

/// The single sandbox capability this driver needs. Production adapters wrap
/// `SandboxManager::exec_shell`; tests inject a recording double.
pub trait LinuxDesktopShell: Send + Sync {
    fn exec_shell<'a>(
        &'a self,
        container_name: &'a str,
        command: &'a str,
        timeout_ms: u64,
    ) -> BoxFuture<'a, Result<SandboxRunResult, String>>;
}

/// JS `Math.round` (half away from zero towards +∞ for `-0.5`).
fn js_round(value: f64) -> f64 {
    if !value.is_finite() {
        return value;
    }
    (value + 0.5).floor()
}

/// Render a number the way JS `String(n)` would for the rounded values here.
fn js_int(value: f64) -> String {
    let rounded = js_round(value);
    if rounded == 0.0 {
        // Avoid "-0".
        return "0".to_string();
    }
    if rounded.fract() == 0.0 && rounded.abs() < 1e21 {
        return format!("{}", rounded as i64);
    }
    format!("{rounded}")
}

/// xdotool keysym for every special key name accepted by `os.keyboard`.
fn keymap(name: &str) -> Option<&'static str> {
    Some(match name {
        "enter" | "return" => "Return",
        "tab" => "Tab",
        "esc" | "escape" => "Escape",
        "backspace" => "BackSpace",
        "delete" => "Delete",
        "insert" => "Insert",
        "home" => "Home",
        "end" => "End",
        "pgup" | "pageup" => "Page_Up",
        "pagedown" | "pgdn" => "Page_Down",
        "up" => "Up",
        "down" => "Down",
        "left" => "Left",
        "right" => "Right",
        "space" | " " => "space",
        "super" => "Super_L",
        "menu" => "Menu",
        _ => return None,
    })
}

/// Build the xdotool keysym arg list for a human combo such as
/// `ctrl+shift+t`, `alt+tab`, `super+d`. Modifiers map to xdotool modifier
/// names; the final token is the (possibly renamed) key.
pub fn build_xdotool_keys(combo: &str) -> Vec<String> {
    let parts: Vec<String> = combo
        .split('+')
        .map(|p| js_trim(p).to_lowercase())
        .filter(|p| !p.is_empty())
        .collect();

    if parts.is_empty() {
        return Vec::new();
    }

    let mut args = Vec::with_capacity(parts.len());
    for part in parts {
        match part.as_str() {
            "ctrl" | "control" => args.push("ctrl".to_string()),
            "alt" => args.push("alt".to_string()),
            "shift" => args.push("shift".to_string()),
            "super" | "meta" => args.push("super".to_string()),
            other => match keymap(other) {
                Some(keysym) => args.push(keysym.to_string()),
                None => args.push(other.to_string()),
            },
        }
    }
    args
}

/// Compute the PNG dimensions from its IHDR chunk (bytes 16..24).
pub fn png_size(png: &[u8]) -> (f64, f64) {
    const PNG_MAGIC: u32 = 0x8950_4e47;
    if png.len() < 24 {
        return (0.0, 0.0);
    }
    let magic = u32::from_be_bytes([png[0], png[1], png[2], png[3]]);
    if magic != PNG_MAGIC {
        return (0.0, 0.0);
    }
    let width = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
    let height = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
    (f64::from(width), f64::from(height))
}

/// Base64-decode text output into bytes, stripping any whitespace noise.
pub fn decode_base64(text: &str) -> Vec<u8> {
    let compact: String = js_trim(text)
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    base64::engine::general_purpose::STANDARD
        .decode(compact.as_bytes())
        .unwrap_or_default()
}

/// Escape a single-quoted shell word the way the TS driver does.
fn shell_single_quote(value: &str) -> String {
    value.replace('\'', "'\\''")
}

/// Escape text for `xdotool type "..."`.
fn xdotool_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '`' => out.push_str("\\`"),
            '$' => out.push_str("\\$"),
            '\n' => out.push_str("\\n"),
            other => out.push(other),
        }
    }
    out
}

pub struct LinuxDesktopOsControlDriver {
    shell: Arc<dyn LinuxDesktopShell>,
    container_name: String,
    display: String,
}

impl LinuxDesktopOsControlDriver {
    pub fn new(shell: Arc<dyn LinuxDesktopShell>, container_name: impl Into<String>) -> Self {
        Self {
            shell,
            container_name: container_name.into(),
            display: ":99".to_string(),
        }
    }

    pub fn with_display(mut self, display: impl Into<String>) -> Self {
        self.display = display.into();
        self
    }

    pub fn container_name(&self) -> &str {
        &self.container_name
    }

    pub fn display(&self) -> &str {
        &self.display
    }

    async fn run(&self, command: String, timeout_ms: u64) -> Result<SandboxRunResult, String> {
        self.shell
            .exec_shell(&self.container_name, &command, timeout_ms)
            .await
    }

    /// Fail loudly if the required desktop tooling is missing in the image.
    async fn require_tools(&self, tools: &[&str]) -> Result<(), String> {
        let found = self
            .run(
                format!(
                    "for t in {}; do command -v \"$t\" >/dev/null 2>&1 || echo \"missing:$t\"; done",
                    tools.join(" ")
                ),
                15_000,
            )
            .await?;
        if !found.ok && found.exit_code != Some(0.0) && found.exit_code != Some(1.0) {
            return Err(format!("Failed to probe container tools: {}", found.output));
        }
        let missing: Vec<String> = found
            .output
            .split('\n')
            .map(|line| js_trim(line.trim_end_matches('\r')).to_string())
            .filter(|line| line.starts_with("missing:"))
            .collect();
        if !missing.is_empty() {
            return Err(format!(
                "Linux desktop sandbox is missing tools required for OS control: {}. \
                 Rebuild the sandbox image from docker/Dockerfile.linux-desktop.",
                missing.join(", ")
            ));
        }
        Ok(())
    }

    /// Best-effort preflight so callers can surface a friendly message early.
    pub async fn preflight(&self) -> Result<(), String> {
        self.require_tools(&["import", "xdotool"]).await
    }
}

impl OsControlDriver for LinuxDesktopOsControlDriver {
    type Error = String;

    fn os_type(&self) -> OsDriverType {
        OsDriverType::LinuxDesktop
    }

    fn screenshot(&self) -> BoxFuture<'_, Result<OsScreenshot, Self::Error>> {
        Box::pin(async move {
            let out = "/tmp/jait-os-screenshot.png";
            let res = self
                .run(
                    format!(
                        "DISPLAY={} import -window root {out} 2>/dev/null; if [ ! -s {out} ]; then \
                         echo \"__NO_SCREENSHOT__\"; exit 3; fi; base64 -w0 {out} 2>/dev/null || base64 {out}",
                        self.display
                    ),
                    30_000,
                )
                .await?;
            let exit_code = res.exit_code;
            if exit_code != Some(0.0) || res.output.contains("__NO_SCREENSHOT__") {
                let exit_text = match exit_code {
                    Some(value) => js_int(value),
                    None => "undefined".to_string(),
                };
                let detail = js_trim(&res.output);
                let detail = if detail.is_empty() {
                    "no image produced"
                } else {
                    detail
                };
                return Err(format!(
                    "os.screenshot failed inside the sandbox (exit {exit_text}): {detail}"
                ));
            }
            let png = decode_base64(&res.output);
            let (width, height) = png_size(&png);
            Ok(OsScreenshot {
                png: PngBuffer(png),
                width,
                height,
            })
        })
    }

    fn click<'a>(
        &'a self,
        x: f64,
        y: f64,
        options: Option<OsClickOptions>,
    ) -> BoxFuture<'a, Result<(), Self::Error>> {
        Box::pin(async move {
            let options = options.unwrap_or_default();
            let button = match options.button.unwrap_or(MouseButton::Left) {
                MouseButton::Left => "1",
                MouseButton::Middle => "2",
                MouseButton::Right => "3",
            };
            let clicks = options.clicks.unwrap_or(1.0).max(1.0);
            self.run(
                format!(
                    "DISPLAY={} xdotool mousemove {} {} click --repeat {} {button}",
                    self.display,
                    js_int(x),
                    js_int(y),
                    js_int(clicks)
                ),
                15_000,
            )
            .await?;
            Ok(())
        })
    }

    fn mouse_move<'a>(&'a self, x: f64, y: f64) -> BoxFuture<'a, Result<(), Self::Error>> {
        Box::pin(async move {
            self.run(
                format!(
                    "DISPLAY={} xdotool mousemove {} {}",
                    self.display,
                    js_int(x),
                    js_int(y)
                ),
                15_000,
            )
            .await?;
            Ok(())
        })
    }

    fn r#type<'a>(
        &'a self,
        text: &'a str,
        options: Option<OsTypeOptions>,
    ) -> BoxFuture<'a, Result<(), Self::Error>> {
        Box::pin(async move {
            let options = options.unwrap_or_default();
            let delay = options.delay_ms.unwrap_or(12.0).max(0.0);
            let escaped = xdotool_text(text);
            self.run(
                format!(
                    "DISPLAY={} xdotool type --delay {} \"{escaped}\"",
                    self.display,
                    js_int(delay)
                ),
                15_000,
            )
            .await?;
            Ok(())
        })
    }

    fn key<'a>(
        &'a self,
        combo: &'a str,
        options: Option<OsKeyOptions>,
    ) -> BoxFuture<'a, Result<(), Self::Error>> {
        Box::pin(async move {
            let keys = build_xdotool_keys(combo);
            if keys.is_empty() {
                return Err(format!("os.keyboard: empty or invalid combo \"{combo}\""));
            }
            let joined = keys.join(" ");
            let hold = options.unwrap_or_default().hold_ms.unwrap_or(0.0).max(0.0);
            if hold > 0.0 {
                self.run(
                    format!(
                        "DISPLAY={d} xdotool keydown {joined}; sleep {secs:.3}; \
                         DISPLAY={d} xdotool keyup {joined}",
                        d = self.display,
                        secs = hold / 1000.0
                    ),
                    15_000,
                )
                .await?;
            } else {
                self.run(
                    format!("DISPLAY={} xdotool key {joined}", self.display),
                    15_000,
                )
                .await?;
            }
            Ok(())
        })
    }

    fn scroll<'a>(
        &'a self,
        options: Option<OsScrollOptions>,
    ) -> BoxFuture<'a, Result<(), Self::Error>> {
        Box::pin(async move {
            let options = options.unwrap_or_default();
            let direction = options.direction.unwrap_or(ScrollDirection::Down);
            let amount = js_round(options.amount.unwrap_or(1.0)).max(1.0);
            // Up/down map to wheel buttons 4/5; the TS driver uses 5 otherwise.
            let click = if direction == ScrollDirection::Up { 4 } else { 5 };
            let move_args = match (options.x, options.y) {
                (Some(x), Some(y)) => {
                    format!("mousemove {} {} ", js_int(x), js_int(y))
                }
                _ => String::new(),
            };
            self.run(
                format!(
                    "DISPLAY={} xdotool {move_args}click --repeat {} {click}",
                    self.display,
                    js_int(amount)
                ),
                15_000,
            )
            .await?;
            Ok(())
        })
    }

    fn exec<'a>(
        &'a self,
        command: &'a str,
        options: Option<OsExecOptions>,
    ) -> BoxFuture<'a, Result<SandboxRunResult, Self::Error>> {
        Box::pin(async move {
            let options = options.unwrap_or_default();
            let env_prefix = match options.env.as_ref() {
                Some(env) if !env.is_empty() => render_env_prefix(env),
                _ => String::new(),
            };
            let cwd_prefix = match options.cwd.as_deref() {
                Some(cwd) => format!("cd '{}' && ", shell_single_quote(cwd)),
                None => String::new(),
            };
            let timeout = options.timeout_ms.unwrap_or(30_000.0);
            self.run(
                format!("{env_prefix}{cwd_prefix}{command}"),
                timeout.max(0.0) as u64,
            )
            .await
        })
    }
}

fn render_env_prefix(env: &BTreeMap<String, String>) -> String {
    let mut prefix = String::new();
    for (key, value) in env {
        prefix.push_str(key);
        prefix.push_str("='");
        prefix.push_str(&shell_single_quote(value));
        prefix.push_str("' ");
    }
    prefix
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Minimal executor so the focused tests can drive the boxed futures
    /// without pulling a runtime (all drivers complete on first poll).
    fn block_on<F: std::future::Future>(future: F) -> F::Output {
        use std::task::{Context, Poll, Wake, Waker};
        struct NoopWake;
        impl Wake for NoopWake {
            fn wake(self: std::sync::Arc<Self>) {}
        }
        let waker = Waker::from(std::sync::Arc::new(NoopWake));
        let mut cx = Context::from_waker(&waker);
        let mut future = std::pin::pin!(future);
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut cx) {
                return value;
            }
        }
    }

    #[derive(Default)]
    struct RecordingShell {
        calls: Mutex<Vec<(String, String, u64)>>,
        output: Mutex<String>,
        exit_code: Mutex<Option<f64>>,
    }

    impl RecordingShell {
        fn with_output(output: &str) -> Self {
            let shell = Self::default();
            *shell.output.lock().unwrap() = output.to_string();
            *shell.exit_code.lock().unwrap() = Some(0.0);
            shell
        }

        fn calls(&self) -> Vec<(String, String, u64)> {
            self.calls.lock().unwrap().clone()
        }

        fn last_command(&self) -> String {
            self.calls.lock().unwrap().last().unwrap().1.clone()
        }
    }

    impl LinuxDesktopShell for RecordingShell {
        fn exec_shell<'a>(
            &'a self,
            container_name: &'a str,
            command: &'a str,
            timeout_ms: u64,
        ) -> BoxFuture<'a, Result<SandboxRunResult, String>> {
            self.calls.lock().unwrap().push((
                container_name.to_string(),
                command.to_string(),
                timeout_ms,
            ));
            let output = self.output.lock().unwrap().clone();
            let exit_code = *self.exit_code.lock().unwrap();
            let ok = exit_code == Some(0.0);
            Box::pin(async move {
                Ok(SandboxRunResult {
                    ok,
                    output,
                    exit_code,
                    timed_out: false,
                    container_name: container_name.to_string(),
                })
            })
        }
    }

    fn driver(shell: Arc<RecordingShell>) -> LinuxDesktopOsControlDriver {
        LinuxDesktopOsControlDriver::new(shell, "jait-sandbox")
    }

    #[test]
    fn xdotool_keys_renames_modifiers_and_special_keys() {
        assert_eq!(build_xdotool_keys("ctrl+shift+t"), ["ctrl", "shift", "t"]);
        assert_eq!(build_xdotool_keys(" Super + D "), ["super", "d"]);
        assert_eq!(build_xdotool_keys("alt+Tab"), ["alt", "Tab"]);
        assert_eq!(build_xdotool_keys("meta+pagedown"), ["super", "Page_Down"]);
        assert_eq!(build_xdotool_keys("enter"), ["Return"]);
        assert!(build_xdotool_keys("   ").is_empty());
    }

    #[test]
    fn click_and_mouse_move_round_coordinates() {
        let shell = Arc::new(RecordingShell::default());
        let driver = driver(shell.clone());
        block_on(async {
            driver
                .click(
                    10.4,
                    20.6,
                    Some(OsClickOptions {
                        button: Some(MouseButton::Right),
                        clicks: Some(3.0),
                    }),
                )
                .await
                .unwrap();
            driver.mouse_move(5.5, 6.4).await.unwrap();
        });
        let calls = shell.calls();
        assert_eq!(
            calls[0].1,
            "DISPLAY=:99 xdotool mousemove 10 21 click --repeat 3 3"
        );
        assert_eq!(calls[0].2, 15_000);
        assert_eq!(calls[1].1, "DISPLAY=:99 xdotool mousemove 6 6");
    }

    #[test]
    fn type_escapes_shell_and_keeps_default_delay() {
        let shell = Arc::new(RecordingShell::default());
        let driver = driver(shell.clone());
        block_on(driver.r#type("a\"b$`c\\n", None)).unwrap();
        assert_eq!(
            shell.last_command(),
            "DISPLAY=:99 xdotool type --delay 12 \"a\\\"b\\$\\`c\\\\n\""
        );
    }

    #[test]
    fn key_uses_keydown_sleep_keyup_when_held() {
        let shell = Arc::new(RecordingShell::default());
        let driver = driver(shell.clone());
        block_on(async {
            driver.key("ctrl+c", None).await.unwrap();
            driver
                .key(
                    "ctrl+c",
                    Some(OsKeyOptions {
                        hold_ms: Some(1500.0),
                    }),
                )
                .await
                .unwrap();
        });
        let calls = shell.calls();
        assert_eq!(calls[0].1, "DISPLAY=:99 xdotool key ctrl c");
        assert_eq!(
            calls[1].1,
            "DISPLAY=:99 xdotool keydown ctrl c; sleep 1.500; \
             DISPLAY=:99 xdotool keyup ctrl c"
        );
    }

    #[test]
    fn key_rejects_empty_combo() {
        let shell = Arc::new(RecordingShell::default());
        let driver = driver(shell);
        let error = block_on(driver.key("+", None)).unwrap_err();
        assert!(error.starts_with("os.keyboard: empty or invalid combo"));
    }

    #[test]
    fn scroll_uses_wheel_buttons_and_optional_move() {
        let shell = Arc::new(RecordingShell::default());
        let driver = driver(shell.clone());
        block_on(async {
            driver
                .scroll(Some(OsScrollOptions {
                    x: Some(3.4),
                    y: Some(4.6),
                    direction: Some(ScrollDirection::Up),
                    amount: Some(2.2),
                }))
                .await
                .unwrap();
            driver.scroll(None).await.unwrap();
        });
        let calls = shell.calls();
        assert_eq!(calls[0].1, "DISPLAY=:99 xdotool mousemove 3 5 click --repeat 2 4");
        assert_eq!(calls[1].1, "DISPLAY=:99 xdotool click --repeat 1 5");
    }

    #[test]
    fn exec_prefixes_env_and_cwd() {
        let shell = Arc::new(RecordingShell::default());
        let driver = driver(shell.clone());
        let mut env = BTreeMap::new();
        env.insert("FOO".to_string(), "it's".to_string());
        block_on(driver.exec(
            "ls",
            Some(OsExecOptions {
                cwd: Some("/tmp/it's".to_string()),
                env: Some(env),
                timeout_ms: Some(1234.0),
            }),
        ))
        .unwrap();
        assert_eq!(
            shell.last_command(),
            "FOO='it'\\''s' cd '/tmp/it'\\''s' && ls"
        );
        assert_eq!(shell.calls()[0].2, 1234);
    }

    #[test]
    fn screenshot_decodes_png_and_reports_ihdr_size() {
        let mut png = vec![0u8; 24];
        png[0..4].copy_from_slice(&0x8950_4e47u32.to_be_bytes());
        png[16..20].copy_from_slice(&640u32.to_be_bytes());
        png[20..24].copy_from_slice(&480u32.to_be_bytes());
        let encoded = base64::engine::general_purpose::STANDARD.encode(&png);

        let shell = Arc::new(RecordingShell::with_output(&format!("{encoded}\n")));
        let driver = driver(shell.clone());
        let shot = block_on(driver.screenshot()).unwrap();
        assert_eq!(shot.png.0, png);
        assert_eq!(shot.width, 640.0);
        assert_eq!(shot.height, 480.0);
        assert!(shell.last_command().contains("import -window root"));
    }

    #[test]
    fn screenshot_reports_missing_image() {
        let shell = Arc::new(RecordingShell::default());
        *shell.exit_code.lock().unwrap() = Some(3.0);
        *shell.output.lock().unwrap() = "__NO_SCREENSHOT__".to_string();
        let driver = driver(shell);
        let error = block_on(driver.screenshot()).unwrap_err();
        assert_eq!(
            error,
            "os.screenshot failed inside the sandbox (exit 3): __NO_SCREENSHOT__"
        );
    }

    #[test]
    fn preflight_reports_missing_tools() {
        let shell = Arc::new(RecordingShell::with_output("missing:xdotool\n"));
        *shell.exit_code.lock().unwrap() = Some(1.0);
        let driver = driver(shell.clone());
        let error = block_on(driver.preflight()).unwrap_err();
        assert!(error.contains("missing tools required for OS control: missing:xdotool"));
        assert!(shell.last_command().contains("command -v \"$t\""));
    }

    #[test]
    fn preflight_passes_when_tools_present() {
        let shell = Arc::new(RecordingShell::with_output(""));
        *shell.exit_code.lock().unwrap() = Some(1.0);
        let driver = driver(shell);
        block_on(driver.preflight()).unwrap();
    }

    #[test]
    fn png_size_rejects_short_or_foreign_buffers() {
        assert_eq!(png_size(&[0, 1, 2]), (0.0, 0.0));
        let mut foreign = vec![0u8; 24];
        foreign[0..4].copy_from_slice(&0x1111_1111u32.to_be_bytes());
        assert_eq!(png_size(&foreign), (0.0, 0.0));
    }
}
