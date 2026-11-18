//! Native port of `packages/gateway/src/tools/screenshot-tools.ts`.
//!
//! `screenshot.capture` resolves the target and the output path relative to the
//! chat's project root, then hands the actual headless-browser work to the host
//! through a [`JaitPort`].
//!
//! The TypeScript tool drives Playwright in-process (`import("playwright")`,
//! `chromium.launch`, `context.newContext`, `page.goto`, `page.screenshot`).
//! The Rust gateway has no Chromium/CDP driver, so this port keeps every
//! user-visible behaviour that is portable (target/out-path resolution, viewport
//! and device-scale derivation, `fullPage`/`selector` precedence, cancellation,
//! success text and `data` shape) and delegates the browser steps (navigate,
//! wait-for-selector, click, fill, settle, capture, close) to host port methods
//! `capture` / `publish`. See the module-level notes in the commit report for the
//! exact fidelity delta.

use super::core_io::HostError;
use super::core_jait::JaitPort;
use super::validate::{ToolInput, validate_tool_input};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

/// Fallback for `FRONTEND_URL` when the environment does not set one.
const FRONTEND_URL_FALLBACK: &str = "http://localhost:3100";

/// Tool metadata for `screenshot.capture`.
pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("screenshot-tools-metadata.json"))
            .expect("screenshot-tools-metadata.json")
    });
    &DATA
}

/// The single-tool definition named `name`.
///
/// # Panics
/// Panics when `name` is not one of the tools in the metadata document.
pub fn definition(name: &str) -> &'static Value {
    metadata()
        .as_array()
        .expect("screenshot tool metadata array")
        .iter()
        .find(|entry| entry["name"] == name)
        .unwrap_or_else(|| panic!("unknown screenshot tool {name}"))
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

fn success(message: impl Into<String>, data: Value) -> Value {
    json!({ "ok": true, "message": message.into(), "data": data })
}

fn str_of(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

fn array_of_strings(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items.iter().map(str_of).collect(),
        Value::Null => Vec::new(),
        other => vec![str_of(other)],
    }
}

fn number_of(value: &Value, default: f64) -> f64 {
    value.as_f64().unwrap_or(default)
}

/// Validated copy of `input`, or the failure result to return.
fn validated(input: &Value) -> Result<Value, Value> {
    let mut tool_input = ToolInput::new(input);
    let validation = validate_tool_input(
        &definition("screenshot.capture")["parameters"],
        &mut tool_input,
    )
    .expect("static tool schema");
    if validation.valid {
        Ok(tool_input.value())
    } else {
        Err(fail(format!(
            "Input validation failed: {}",
            validation
                .errors
                .iter()
                .map(|line| String::from_utf16_lossy(&line.0))
                .collect::<Vec<_>>()
                .join("; ")
        )))
    }
}

fn is_absolute(candidate: &str) -> bool {
    Path::new(candidate).is_absolute()
}

fn timestamp() -> String {
    // The TS tool renders `YYYYMMDD-HHmmss` in local time. Without a time-zone
    // aware clock here we fall back to a sortable millisecond stamp.
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|delta| delta.as_millis())
        .unwrap_or_default();
    millis.to_string()
}

/// `.jait/shots` inside the chat's project root.
pub fn shots_dir(project_root: &str) -> PathBuf {
    Path::new(project_root).join(".jait").join("shots")
}

/// Output path for the capture: an explicit `path` (made absolute and `.png`
/// suffixed) or `.jait/shots/screenshot-<timestamp>.png`.
pub fn resolve_out_path(input_path: &str, project_root: &str) -> PathBuf {
    let trimmed = input_path.trim();
    if !trimmed.is_empty() {
        let candidate = if is_absolute(trimmed) {
            PathBuf::from(trimmed)
        } else {
            Path::new(project_root).join(trimmed)
        };
        let text = candidate.to_string_lossy().into_owned();
        return if text.ends_with(".png") {
            candidate
        } else {
            PathBuf::from(format!("{text}.png"))
        };
    }
    // `join` is imported as `node:path.join` in the TS helper; `Path::join` for
    // the same two components yields the same path on every supported platform.
    shots_dir(project_root).join(format!("screenshot-{}.png", timestamp()))
}

/// `dev` → frontend URL, any `http(s)://`/`file://` URL verbatim, otherwise a
/// project-relative absolute path turned into a `file://` URL.
///
/// # Errors
/// Fails when a local path does not exist, mirroring the TS
/// `target not found: …` throw.
pub fn resolve_target(target: &str, project_root: &str) -> Result<String, String> {
    let trimmed = target.trim();
    if trimmed == "dev" {
        return Ok(
            std::env::var("FRONTEND_URL").unwrap_or_else(|_| FRONTEND_URL_FALLBACK.to_string())
        );
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Ok(trimmed.to_string());
    }
    if trimmed.starts_with("file://") {
        return Ok(trimmed.to_string());
    }
    let abs = if is_absolute(trimmed) {
        PathBuf::from(trimmed)
    } else {
        Path::new(project_root).join(trimmed)
    };
    if !abs.exists() {
        return Err(format!(
            "target not found: {trimmed} (resolved {})",
            abs.to_string_lossy()
        ));
    }
    Ok(format!("file://{}", abs.to_string_lossy()))
}

/// Host-owned headless browser plus the chat display publisher.
pub struct ScreenshotTools<C> {
    /// Headless browser automation (`playwright` equivalent).
    pub browser: JaitPort<C>,
}

impl<C: Send + Sync> ScreenshotTools<C> {
    /// `screenshot.capture`.
    pub async fn screenshot_capture(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validated(input) {
            Ok(input) => input,
            Err(failure) => return failure,
        };
        match self.capture_inner(&input, context, host).await {
            Ok(value) => value,
            Err(HostError::Error(message)) => fail(format!("Screenshot failed: {message}")),
            Err(HostError::Thrown(_)) => fail("Screenshot failed: browser automation failed."),
        }
    }

    async fn capture_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let target = str_of(&input["target"]);
        if cancelled(context) {
            return Ok(fail("Cancelled"));
        }

        let project_root = str_of(&context["projectRoot"]);
        let url = match resolve_target(&target, &project_root) {
            Ok(url) => url,
            Err(message) => return Ok(fail(format!("Screenshot failed: {message}"))),
        };

        let out_path = resolve_out_path(&str_of(&input["path"]), &project_root)
            .to_string_lossy()
            .into_owned();
        let mobile = input["mobile"].as_bool().unwrap_or(false);
        let width = if mobile {
            393.0
        } else {
            number_of(&input["width"], 1280.0)
        };
        let height = if mobile {
            851.0
        } else {
            number_of(&input["height"], 800.0)
        };
        let device_scale_factor = if mobile { 3.0 } else { 2.0 };
        let has_selector = !str_of(&input["selector"]).trim().is_empty();
        let full_page = input["fullPage"].as_bool().unwrap_or(true) && !has_selector;
        let dark = input["dark"].as_bool().unwrap_or(false);

        // `page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })`,
        // then the optional `waitForSelector`, best-effort clicks, best-effort
        // fills, `waitForTimeout(waitMs)`, and finally `el.screenshot({ path })`
        // or `page.screenshot({ path, fullPage })` all happen host-side.
        let request = json!({
            "url": url,
            "outPath": out_path,
            "viewport": { "width": width, "height": height },
            "deviceScaleFactor": device_scale_factor,
            "colorScheme": if dark { "dark" } else { "light" },
            "dark": dark,
            "fullPage": full_page,
            "selector": str_of(&input["selector"]),
            "waitForSelector": str_of(&input["waitForSelector"]),
            "waitMs": number_of(&input["waitMs"], 500.0),
            "click": array_of_strings(&input["click"]),
            "fill": array_of_strings(&input["fill"]),
            "navigationTimeoutMs": 60000.0,
            "selectorTimeoutMs": 30000.0,
            "actionTimeoutMs": 10000.0,
        });
        let captured = (*self.browser)("capture", vec![request], host)
            .await?
            .unwrap_or(Value::Null);
        let capture_path = match captured["path"].as_str() {
            Some(path) if !path.is_empty() => path.to_string(),
            _ => out_path.clone(),
        };

        // The image route only serves files inside the chat's project root, so
        // the display copy is published under `.jait/shots` by the host.
        let published = (*self.browser)("publish", vec![json!(capture_path)], host)
            .await
            .ok()
            .flatten()
            .unwrap_or(Value::Null);
        let display_path = match published["path"].as_str() {
            Some(path) if !path.is_empty() => path.to_string(),
            _ => capture_path.clone(),
        };

        Ok(success(
            format!(
                "Screenshot saved to {capture_path} and displayed in chat. \
                 Do not call image.view or display this screenshot again."
            ),
            json!({
                "path": display_path,
                "capturePath": capture_path,
                "target": target,
                "url": url,
                "width": width,
                "height": height,
                "mobile": mobile,
            }),
        ))
    }
}

/// `context.signal?.aborted`.
fn cancelled(context: &Value) -> bool {
    context["aborted"].as_bool().unwrap_or(false)
        || context["signal"]["aborted"].as_bool().unwrap_or(false)
}
