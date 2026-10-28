//! Native port of `packages/gateway/src/tools/os-control-tools.ts`.
//!
//! Sandbox desktop control: `os.screenshot`, `os.click`, `os.mouse`, `os.type`,
//! `os.keyboard`, `os.scroll`, `os.exec` and `os.sandbox.list`.
//!
//! Every pointer/keyboard tool follows the TS `makeActionTool` policy: resolve a binding,
//! run the action, then auto-capture a screenshot so the caller sees the effect. A failing
//! screenshot never turns a successful action into a failure — it degrades the message
//! exactly like the TS implementation (`"… (screenshot unavailable)"`).
//!
//! Desktop-driver reuse: bindings hand out [`BoxedDriver`], i.e. the crate's real
//! [`OsControlDriver`] contract from `src/integrations/os_control/contracts.rs`
//! (Linux desktop / Windows VM drivers, `OsScreenshot`, `OsClickOptions`, …). The resolver is
//! abstracted behind [`OsResolvePort`] so the wiring layer can plug the
//! `SandboxManager`-backed `OsControlResolver` and tests can inject fakes.
//!
//! No secrets flow through these tools; inputs and outputs are container names, geometry and
//! command output only.

use std::collections::BTreeMap;
use std::future::Future;
use std::sync::{Arc, LazyLock};

use base64::Engine as _;
use futures_util::future::BoxFuture;
use serde_json::{json, Map, Value};

use crate::integrations::os_control::contracts::{
    MouseButton, OsClickOptions, OsControlDriver, OsExecOptions, OsKeyOptions, OsScrollOptions,
    OsTypeOptions,
};
use crate::tools::core_io::HostError;
use crate::tools::validate::{validate_tool_input, ToolInput};

pub const OS_SCREENSHOT: &str = "os.screenshot";
pub const OS_CLICK: &str = "os.click";
pub const OS_MOUSE: &str = "os.mouse";
pub const OS_TYPE: &str = "os.type";
pub const OS_KEYBOARD: &str = "os.keyboard";
pub const OS_SCROLL: &str = "os.scroll";
pub const OS_EXEC: &str = "os.exec";
pub const OS_SANDBOX_LIST: &str = "os.sandbox.list";

/// Default exec timeout mirrored from the TS schema description.
pub const DEFAULT_EXEC_TIMEOUT_MS: f64 = 30_000.0;
/// Bounds added on top of the TS schema (see module docs / handoff notes).
const MAX_CLICKS: f64 = 3.0;
const MAX_SCROLL_AMOUNT: f64 = 50.0;

static METADATA: LazyLock<Value> = LazyLock::new(|| {
    json!([
        {
            "name": OS_SCREENSHOT,
            "displayName": "OS Screenshot",
            "description": "Capture the full desktop of a running OS sandbox (Linux desktop or Windows VM) as a PNG image.",
            "parameters": {
                "type": "object",
                "properties": {
                    "containerName": {
                        "type": "string",
                        "description": "Container name of the OS sandbox. Omit to use the most recently started running sandbox."
                    }
                }
            },
            "tier": "core",
            "category": "os",
            "source": "builtin"
        },
        {
            "name": OS_CLICK,
            "displayName": "OS Click",
            "description": "Move the cursor to (x, y) on the OS sandbox desktop and click a mouse button. Captures a screenshot after the action.",
            "parameters": {
                "type": "object",
                "properties": {
                    "containerName": { "type": "string", "description": "Target OS sandbox container name." },
                    "x": { "type": "number", "description": "Cursor x coordinate." },
                    "y": { "type": "number", "description": "Cursor y coordinate." },
                    "button": { "type": "string", "enum": ["left", "middle", "right"], "description": "Mouse button. Default left." },
                    "clicks": { "type": "number", "description": "Number of clicks. Default 1." }
                },
                "required": ["x", "y"]
            },
            "tier": "core",
            "category": "os",
            "source": "builtin"
        },
        {
            "name": OS_MOUSE,
            "displayName": "OS Mouse Move",
            "description": "Move the cursor to (x, y) on the OS sandbox desktop without clicking.",
            "parameters": {
                "type": "object",
                "properties": {
                    "containerName": { "type": "string", "description": "Target OS sandbox container name." },
                    "x": { "type": "number", "description": "Cursor x coordinate." },
                    "y": { "type": "number", "description": "Cursor y coordinate." }
                },
                "required": ["x", "y"]
            },
            "tier": "core",
            "category": "os",
            "source": "builtin"
        },
        {
            "name": OS_TYPE,
            "displayName": "OS Type",
            "description": "Type literal text at the currently focused control on the OS sandbox desktop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "containerName": { "type": "string", "description": "Target OS sandbox container name." },
                    "text": { "type": "string", "description": "Text to type." },
                    "delayMs": { "type": "number", "description": "Delay between keystrokes in ms." }
                },
                "required": ["text"]
            },
            "tier": "core",
            "category": "os",
            "source": "builtin"
        },
        {
            "name": OS_KEYBOARD,
            "displayName": "OS Keyboard Shortcut",
            "description": "Send a keyboard shortcut on the OS sandbox desktop, e.g. \"ctrl+c\", \"alt+tab\", \"super+d\", \"ctrl+shift+t\".",
            "parameters": {
                "type": "object",
                "properties": {
                    "containerName": { "type": "string", "description": "Target OS sandbox container name." },
                    "combo": { "type": "string", "description": "Shortcut combination, e.g. 'ctrl+c'." },
                    "holdMs": { "type": "number", "description": "Optional hold duration in ms (keydown + keyup)." }
                },
                "required": ["combo"]
            },
            "tier": "core",
            "category": "os",
            "source": "builtin"
        },
        {
            "name": OS_SCROLL,
            "displayName": "OS Scroll",
            "description": "Scroll the OS sandbox desktop viewport up, down, left, or right.",
            "parameters": {
                "type": "object",
                "properties": {
                    "containerName": { "type": "string", "description": "Target OS sandbox container name." },
                    "x": { "type": "number", "description": "Optional cursor x before scrolling." },
                    "y": { "type": "number", "description": "Optional cursor y before scrolling." },
                    "direction": { "type": "string", "enum": ["up", "down", "left", "right"], "description": "Scroll direction. Default down." },
                    "amount": { "type": "number", "description": "Number of wheel steps. Default 1." }
                }
            },
            "tier": "core",
            "category": "os",
            "source": "builtin"
        },
        {
            "name": OS_EXEC,
            "displayName": "OS Exec",
            "description": "Run a command inside the OS sandbox and return its combined output.",
            "parameters": {
                "type": "object",
                "properties": {
                    "containerName": { "type": "string", "description": "Target OS sandbox container name." },
                    "command": { "type": "string", "description": "The command to run." },
                    "cwd": { "type": "string", "description": "Optional working directory inside the OS." },
                    "env": { "type": "object", "description": "Optional extra environment variables (string values)." },
                    "timeoutMs": { "type": "number", "description": "Optional timeout in ms. Default 30000." }
                },
                "required": ["command"]
            },
            "tier": "core",
            "category": "os",
            "source": "builtin"
        },
        {
            "name": OS_SANDBOX_LIST,
            "displayName": "OS Sandbox List",
            "description": "List running OS sandboxes (Linux desktop / Windows VM) with their type and connection details.",
            "parameters": { "type": "object", "properties": {} },
            "tier": "standard",
            "category": "os",
            "source": "builtin"
        }
    ])
});

/// A driver handed out by the resolver, erased to the crate error type.
pub type BoxedDriver = Arc<dyn OsControlDriver<Error = HostError>>;

/// Resolved sandbox binding (TS `binding = { driver, containerName, type }`).
#[derive(Clone)]
pub struct OsBinding {
    pub container_name: String,
    pub driver: BoxedDriver,
}

/// Port over `OsControlResolver` — `resolve(containerName?)` / `listSandboxes()`.
pub trait OsResolvePort: Send + Sync {
    /// Resolve the requested container, or the most recently started running sandbox.
    fn resolve<'a>(
        &'a self,
        container_name: Option<&'a str>,
    ) -> BoxFuture<'a, Result<OsBinding, HostError>>;
    /// List running OS sandboxes, already serialised for the tool result.
    fn list_sandboxes<'a>(&'a self) -> BoxFuture<'a, Result<Vec<Value>, HostError>>;
}

/// Tool metadata for registration (mirrors `createOsControlToolset`).
pub fn metadata() -> &'static Value {
    &METADATA
}

/// A single tool definition by name.
pub fn definition(name: &str) -> &'static Value {
    METADATA
        .as_array()
        .and_then(|tools| tools.iter().find(|tool| tool["name"] == name))
        .unwrap_or_else(|| panic!("unknown os control tool: {name}"))
}

/// All tool names in registration order.
pub fn tool_names() -> Vec<&'static str> {
    vec![
        OS_SCREENSHOT,
        OS_CLICK,
        OS_MOUSE,
        OS_TYPE,
        OS_KEYBOARD,
        OS_SCROLL,
        OS_EXEC,
        OS_SANDBOX_LIST,
    ]
}

fn host_error_message(error: &HostError) -> String {
    match error {
        HostError::Error(message) => message.clone(),
        HostError::Thrown(value) => value
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| value.to_string()),
    }
}

fn success(message: impl Into<String>, data: Option<Value>) -> Value {
    let mut object = Map::new();
    object.insert("ok".to_string(), Value::Bool(true));
    object.insert("message".to_string(), Value::String(message.into()));
    if let Some(data) = data {
        object.insert("data".to_string(), data);
    }
    Value::Object(object)
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

fn base64_utf8(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn number(input: &Value, key: &str) -> Option<f64> {
    input.get(key).and_then(Value::as_f64).filter(|value| value.is_finite())
}

fn text(input: &Value, key: &str) -> Option<String> {
    input.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn parse_button(input: &Value) -> Result<MouseButton, HostError> {
    match text(input, "button").as_deref() {
        None | Some("left") => Ok(MouseButton::Left),
        Some("middle") => Ok(MouseButton::Middle),
        Some("right") => Ok(MouseButton::Right),
        Some(other) => Err(HostError::Error(format!(
            "Invalid button \"{other}\": expected one of left, middle, right."
        ))),
    }
}

fn parse_direction(input: &Value) -> Result<crate::integrations::os_control::contracts::ScrollDirection, HostError> {
    use crate::integrations::os_control::contracts::ScrollDirection;
    match text(input, "direction").as_deref() {
        None | Some("down") => Ok(ScrollDirection::Down),
        Some("up") => Ok(ScrollDirection::Up),
        Some("left") => Ok(ScrollDirection::Left),
        Some("right") => Ok(ScrollDirection::Right),
        Some(other) => Err(HostError::Error(format!(
            "Invalid direction \"{other}\": expected one of up, down, left, right."
        ))),
    }
}

/// Sandbox desktop tools sharing one resolver.
pub struct OsControlTools {
    resolver: Arc<dyn OsResolvePort>,
}

impl OsControlTools {
    pub fn new(resolver: Arc<dyn OsResolvePort>) -> Self {
        Self { resolver }
    }

    /// Dispatch by tool name; unknown names fail structurally.
    pub async fn call(&self, name: &str, input: &Value) -> Value {
        let result = match name {
            OS_SCREENSHOT => self.os_screenshot_inner(input).await,
            OS_CLICK => self.os_click_inner(input).await,
            OS_MOUSE => self.os_mouse_inner(input).await,
            OS_TYPE => self.os_type_inner(input).await,
            OS_KEYBOARD => self.os_keyboard_inner(input).await,
            OS_SCROLL => self.os_scroll_inner(input).await,
            OS_EXEC => self.os_exec_inner(input).await,
            OS_SANDBOX_LIST => self.os_sandbox_list_inner(input).await,
            other => Err(HostError::Error(format!("Unknown OS control tool: {other}"))),
        };
        match result {
            Ok(value) => value,
            Err(error) => fail(host_error_message(&error)),
        }
    }

    fn validated(&self, name: &str, input: &Value) -> Result<Value, HostError> {
        let mut tool_input = ToolInput::new(input);
        let validation = validate_tool_input(&definition(name)["parameters"], &mut tool_input)
            .expect("static os control tool schema");
        if validation.valid {
            Ok(tool_input.value())
        } else {
            Err(HostError::Error(
                validation
                    .errors
                    .first()
                    .map(|error| String::from_utf16_lossy(&error.0))
                    .unwrap_or_else(|| format!("Invalid input for {name}.")),
            ))
        }
    }

    async fn resolve_binding(&self, input: &Value) -> Result<OsBinding, HostError> {
        let container_name = text(input, "containerName");
        self.resolver.resolve(container_name.as_deref()).await
    }

    /// TS `makeActionTool`: resolve → act → auto screenshot.
    async fn act_on<F, Fut>(&self, verb: &str, input: &Value, action: F) -> Result<Value, HostError>
    where
        F: FnOnce(BoxedDriver) -> Fut,
        Fut: Future<Output = Result<(), HostError>>,
    {
        let binding = self.resolve_binding(input).await?;
        if let Err(error) = action(Arc::clone(&binding.driver)).await {
            return Err(HostError::Error(format!(
                "{verb} failed on sandbox \"{}\": {}",
                binding.container_name,
                host_error_message(&error)
            )));
        }
        match binding.driver.screenshot().await {
            Ok(shot) => Ok(success(
                format!("{verb} applied on sandbox \"{}\".", binding.container_name),
                Some(json!({
                    "screenshot": {
                        "pngBase64": base64_utf8(&shot.png.0),
                        "width": shot.width,
                        "height": shot.height,
                    }
                })),
            )),
            Err(_) => Ok(success(
                format!(
                    "{verb} applied on sandbox \"{}\" (screenshot unavailable).",
                    binding.container_name
                ),
                None,
            )),
        }
    }

    pub async fn os_screenshot(&self, input: &Value) -> Value {
        match self.os_screenshot_inner(input).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(&error)),
        }
    }

    async fn os_screenshot_inner(&self, input: &Value) -> Result<Value, HostError> {
        let input = self.validated(OS_SCREENSHOT, input)?;
        let binding = self.resolve_binding(&input).await?;
        let shot = binding.driver.screenshot().await.map_err(|error| {
            HostError::Error(format!(
                "Screenshot failed on sandbox \"{}\": {}",
                binding.container_name,
                host_error_message(&error)
            ))
        })?;
        Ok(success(
            format!("Captured desktop of sandbox \"{}\".", binding.container_name),
            Some(json!({
                "screenshot": {
                    "pngBase64": base64_utf8(&shot.png.0),
                    "width": shot.width,
                    "height": shot.height,
                }
            })),
        ))
    }

    pub async fn os_click(&self, input: &Value) -> Value {
        match self.os_click_inner(input).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(&error)),
        }
    }

    async fn os_click_inner(&self, input: &Value) -> Result<Value, HostError> {
        let input = self.validated(OS_CLICK, input)?;
        let x = number(&input, "x").ok_or_else(|| HostError::Error("x must be a finite number.".to_string()))?;
        let y = number(&input, "y").ok_or_else(|| HostError::Error("y must be a finite number.".to_string()))?;
        let button = parse_button(&input)?;
        let clicks = match input.get("clicks") {
            None | Some(Value::Null) => None,
            Some(_) => {
                let clicks = number(&input, "clicks")
                    .ok_or_else(|| HostError::Error("clicks must be a finite number.".to_string()))?;
                if clicks.fract() != 0.0 || clicks < 1.0 || clicks > MAX_CLICKS {
                    return Err(HostError::Error(format!(
                        "clicks must be an integer between 1 and {MAX_CLICKS}."
                    )));
                }
                Some(clicks)
            }
        };
        self.act_on("Click", &input, move |driver| async move {
            driver
                .click(
                    x,
                    y,
                    Some(OsClickOptions {
                        button: Some(button),
                        clicks,
                    }),
                )
                .await
        })
        .await
    }

    pub async fn os_mouse(&self, input: &Value) -> Value {
        match self.os_mouse_inner(input).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(&error)),
        }
    }

    async fn os_mouse_inner(&self, input: &Value) -> Result<Value, HostError> {
        let input = self.validated(OS_MOUSE, input)?;
        let x = number(&input, "x").ok_or_else(|| HostError::Error("x must be a finite number.".to_string()))?;
        let y = number(&input, "y").ok_or_else(|| HostError::Error("y must be a finite number.".to_string()))?;
        self.act_on("Mouse move", &input, move |driver| async move {
            driver.mouse_move(x, y).await
        })
        .await
    }

    pub async fn os_type(&self, input: &Value) -> Value {
        match self.os_type_inner(input).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(&error)),
        }
    }

    async fn os_type_inner(&self, input: &Value) -> Result<Value, HostError> {
        let input = self.validated(OS_TYPE, input)?;
        let value = text(&input, "text").ok_or_else(|| HostError::Error("text is required.".to_string()))?;
        if value.is_empty() {
            return Err(HostError::Error("text must not be empty.".to_string()));
        }
        let delay_ms = number(&input, "delayMs");
        self.act_on("Type", &input, move |driver| async move {
            driver
                .r#type(&value, Some(OsTypeOptions { delay_ms }))
                .await
        })
        .await
    }

    pub async fn os_keyboard(&self, input: &Value) -> Value {
        match self.os_keyboard_inner(input).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(&error)),
        }
    }

    async fn os_keyboard_inner(&self, input: &Value) -> Result<Value, HostError> {
        let input = self.validated(OS_KEYBOARD, input)?;
        let combo = text(&input, "combo").ok_or_else(|| HostError::Error("combo is required.".to_string()))?;
        if combo.trim().is_empty() {
            return Err(HostError::Error("combo must not be empty.".to_string()));
        }
        let hold_ms = number(&input, "holdMs");
        self.act_on("Keyboard", &input, move |driver| async move {
            driver.key(&combo, Some(OsKeyOptions { hold_ms })).await
        })
        .await
    }

    pub async fn os_scroll(&self, input: &Value) -> Value {
        match self.os_scroll_inner(input).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(&error)),
        }
    }

    async fn os_scroll_inner(&self, input: &Value) -> Result<Value, HostError> {
        let input = self.validated(OS_SCROLL, input)?;
        let x = number(&input, "x");
        let y = number(&input, "y");
        let direction = parse_direction(&input)?;
        let amount = match input.get("amount") {
            None | Some(Value::Null) => None,
            Some(_) => {
                let amount = number(&input, "amount")
                    .ok_or_else(|| HostError::Error("amount must be a finite number.".to_string()))?;
                if amount < 1.0 || amount > MAX_SCROLL_AMOUNT {
                    return Err(HostError::Error(format!(
                        "amount must be between 1 and {MAX_SCROLL_AMOUNT}."
                    )));
                }
                Some(amount)
            }
        };
        self.act_on("Scroll", &input, move |driver| async move {
            driver
                .scroll(Some(OsScrollOptions {
                    x,
                    y,
                    direction: Some(direction),
                    amount,
                }))
                .await
        })
        .await
    }

    pub async fn os_exec(&self, input: &Value) -> Value {
        match self.os_exec_inner(input).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(&error)),
        }
    }

    async fn os_exec_inner(&self, input: &Value) -> Result<Value, HostError> {
        let input = self.validated(OS_EXEC, input)?;
        let command = text(&input, "command").ok_or_else(|| HostError::Error("command is required.".to_string()))?;
        if command.trim().is_empty() {
            return Err(HostError::Error("command must not be empty.".to_string()));
        }
        let cwd = text(&input, "cwd");
        let timeout_ms = match input.get("timeoutMs") {
            None | Some(Value::Null) => None,
            Some(_) => {
                let timeout = number(&input, "timeoutMs")
                    .ok_or_else(|| HostError::Error("timeoutMs must be a finite number.".to_string()))?;
                if timeout <= 0.0 {
                    return Err(HostError::Error("timeoutMs must be greater than zero.".to_string()));
                }
                Some(timeout)
            }
        };
        let env: Option<BTreeMap<String, String>> = match input.get("env") {
            None | Some(Value::Null) => None,
            Some(Value::Object(entries)) => {
                let mut map = BTreeMap::new();
                for (key, value) in entries {
                    let value = value.as_str().ok_or_else(|| {
                        HostError::Error(format!("env[{key}] must be a string."))
                    })?;
                    map.insert(key.clone(), value.to_string());
                }
                Some(map)
            }
            Some(_) => return Err(HostError::Error("env must be an object of strings.".to_string())),
        };

        let binding = self.resolve_binding(&input).await?;
        let outcome = binding
            .driver
            .exec(
                &command,
                Some(OsExecOptions {
                    cwd,
                    env,
                    timeout_ms,
                }),
            )
            .await
            .map_err(|error| {
                HostError::Error(format!(
                    "Exec failed on sandbox \"{}\": {}",
                    binding.container_name,
                    host_error_message(&error)
                ))
            })?;

        let data = json!({
            "output": outcome.output,
            "exitCode": outcome.exit_code,
            "containerName": binding.container_name,
        });
        if !outcome.ok {
            let mut result = fail(format!(
                "Command exited with code {}{}",
                outcome
                    .exit_code
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "undefined".to_string()),
                if outcome.timed_out { " (timed out)" } else { "" }
            ));
            if let Value::Object(object) = &mut result {
                object.insert("data".to_string(), data);
            }
            return Ok(result);
        }
        Ok(success(
            format!("Command completed on sandbox \"{}\".", binding.container_name),
            Some(data),
        ))
    }

    pub async fn os_sandbox_list(&self, input: &Value) -> Value {
        match self.os_sandbox_list_inner(input).await {
            Ok(value) => value,
            Err(error) => fail(host_error_message(&error)),
        }
    }

    async fn os_sandbox_list_inner(&self, input: &Value) -> Result<Value, HostError> {
        self.validated(OS_SANDBOX_LIST, input)?;
        let sandboxes = self.resolver.list_sandboxes().await?;
        Ok(success(
            format!("Found {} running OS sandbox(s).", sandboxes.len()),
            Some(json!({ "sandboxes": sandboxes })),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integrations::os_control::contracts::{OsScreenshot, PngBuffer};
    use std::sync::Mutex;

    struct FakeDriver {
        calls: Arc<Mutex<Vec<String>>>,
        screenshot_error: bool,
        exec_result: SandboxExec,
    }

    struct SandboxExec {
        ok: bool,
        output: String,
        exit_code: Option<f64>,
        timed_out: bool,
    }

    impl FakeDriver {
        fn new() -> Self {
            Self {
                calls: Arc::new(Mutex::new(Vec::new())),
                screenshot_error: false,
                exec_result: SandboxExec {
                    ok: true,
                    output: "hello".to_string(),
                    exit_code: Some(0.0),
                    timed_out: false,
                },
            }
        }

        fn log(&self, entry: String) {
            self.calls.lock().unwrap().push(entry);
        }
    }

    impl OsControlDriver for FakeDriver {
        type Error = HostError;

        fn os_type(&self) -> crate::integrations::os_control::contracts::OsDriverType {
            crate::integrations::os_control::contracts::OsDriverType::LinuxDesktop
        }

        fn screenshot(&self) -> BoxFuture<'_, Result<OsScreenshot, Self::Error>> {
            let failed = self.screenshot_error;
            self.log("screenshot".to_string());
            Box::pin(async move {
                if failed {
                    Err(HostError::Error("display unavailable".to_string()))
                } else {
                    Ok(OsScreenshot {
                        png: PngBuffer(vec![1, 2, 3, 4]),
                        width: 1280.0,
                        height: 720.0,
                    })
                }
            })
        }

        fn click(
            &self,
            x: f64,
            y: f64,
            options: Option<OsClickOptions>,
        ) -> BoxFuture<'_, Result<(), Self::Error>> {
            let options = options.unwrap_or_default();
            self.log(format!(
                "click x={x} y={y} button={:?} clicks={:?}",
                options.button, options.clicks
            ));
            Box::pin(async { Ok(()) })
        }

        fn mouse_move(&self, x: f64, y: f64) -> BoxFuture<'_, Result<(), Self::Error>> {
            self.log(format!("mouse x={x} y={y}"));
            Box::pin(async { Ok(()) })
        }

        fn r#type<'a>(
            &'a self,
            text: &'a str,
            options: Option<OsTypeOptions>,
        ) -> BoxFuture<'a, Result<(), Self::Error>> {
            let options = options.unwrap_or_default();
            self.log(format!("type {text} delay={:?}", options.delay_ms));
            Box::pin(async { Ok(()) })
        }

        fn key<'a>(
            &'a self,
            combo: &'a str,
            options: Option<OsKeyOptions>,
        ) -> BoxFuture<'a, Result<(), Self::Error>> {
            let options = options.unwrap_or_default();
            self.log(format!("key {combo} hold={:?}", options.hold_ms));
            Box::pin(async { Ok(()) })
        }

        fn scroll(&self, options: Option<OsScrollOptions>) -> BoxFuture<'_, Result<(), Self::Error>> {
            let options = options.unwrap_or_default();
            self.log(format!("scroll direction={:?} amount={:?}", options.direction, options.amount));
            Box::pin(async { Ok(()) })
        }

        fn exec<'a>(
            &'a self,
            command: &'a str,
            options: Option<OsExecOptions>,
        ) -> BoxFuture<'a, Result<crate::integrations::os_control::contracts::SandboxRunResult, Self::Error>> {
            let options = options.unwrap_or_default();
            self.log(format!("exec {command} cwd={:?}", options.cwd));
            let ok = self.exec_result.ok;
            let output = self.exec_result.output.clone();
            let exit_code = self.exec_result.exit_code;
            let timed_out = self.exec_result.timed_out;
            Box::pin(async move {
                Ok(crate::integrations::os_control::contracts::SandboxRunResult {
                    ok,
                    output,
                    exit_code,
                    timed_out,
                    container_name: "desk-1".to_string(),
                })
            })
        }
    }

    struct FakePort {
        driver: Option<BoxedDriver>,
        resolve_error: Option<String>,
        list_error: Option<String>,
        sandboxes: Vec<Value>,
    }

    impl FakePort {
        fn with(driver: Arc<FakeDriver>) -> Self {
            Self {
                driver: Some(driver as BoxedDriver),
                resolve_error: None,
                list_error: None,
                sandboxes: vec![json!({ "containerName": "desk-1", "type": "linux-desktop" })],
            }
        }

        fn failing(message: &str) -> Self {
            Self {
                driver: Some(Arc::new(FakeDriver::new()) as BoxedDriver),
                resolve_error: Some(message.to_string()),
                list_error: None,
                sandboxes: Vec::new(),
            }
        }
    }

    impl OsResolvePort for FakePort {
        fn resolve<'a>(
            &'a self,
            container_name: Option<&'a str>,
        ) -> BoxFuture<'a, Result<OsBinding, HostError>> {
            let result = match &self.resolve_error {
                Some(message) => Err(HostError::Error(message.clone())),
                None => Ok(OsBinding {
                    container_name: container_name.unwrap_or("desk-1").to_string(),
                    driver: Arc::clone(self.driver.as_ref().expect("fake driver")),
                }),
            };
            Box::pin(async move { result })
        }

        fn list_sandboxes<'a>(&'a self) -> BoxFuture<'a, Result<Vec<Value>, HostError>> {
            let result = match &self.list_error {
                Some(message) => Err(HostError::Error(message.clone())),
                None => Ok(self.sandboxes.clone()),
            };
            Box::pin(async move { result })
        }
    }

        #[test]
    fn metadata_lists_all_eight_tools() {
        let names: Vec<&str> = metadata()
            .as_array()
            .unwrap()
            .iter()
            .map(|tool| tool["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, tool_names());
        assert_eq!(names.len(), 8);
    }

    #[tokio::test]
    async fn unknown_tool_fails() {
        let port = FakePort::with(Arc::new(FakeDriver::new()));
        let tools = OsControlTools::new(Arc::new(port));
        let result = tools.call("os.nope", &json!({})).await;
        assert_eq!(result["ok"], false);
        assert!(result["message"].as_str().unwrap().contains("os.nope"));
    }

    #[tokio::test]
    async fn click_requires_real_coordinates() {
        let port = FakePort::with(Arc::new(FakeDriver::new()));
        let tools = OsControlTools::new(Arc::new(port));
        let missing = tools.call(OS_CLICK, &json!({ "y": 10 })).await;
        assert_eq!(missing["ok"], false);
        // The shared validation layer coerces numeric strings, so an unparseable
        // string is the case that must be rejected outright.
        let wrong_type = tools.call(OS_CLICK, &json!({ "x": "abc", "y": 10 })).await;
        assert_eq!(wrong_type["ok"], false);
        let not_finite = tools.call(OS_CLICK, &json!({ "x": "NaN", "y": 10 })).await;
        assert_eq!(not_finite["ok"], false);
    }

    #[tokio::test]
    async fn click_rejects_out_of_range_clicks_and_button() {
        let port = FakePort::with(Arc::new(FakeDriver::new()));
        let tools = OsControlTools::new(Arc::new(port));
        let too_many = tools.call(OS_CLICK, &json!({ "x": 1, "y": 2, "clicks": 9 })).await;
        assert_eq!(too_many["ok"], false);
        assert!(too_many["message"].as_str().unwrap().contains("clicks"));
        let bad_button = tools
            .call(OS_CLICK, &json!({ "x": 1, "y": 2, "button": "sideways" }))
            .await;
        assert_eq!(bad_button["ok"], false);
        assert!(bad_button["message"].as_str().unwrap().contains("button"));
    }

    #[tokio::test]
    async fn screenshot_happy_path_returns_base64_png() {
        let port = FakePort::with(Arc::new(FakeDriver::new()));
        let tools = OsControlTools::new(Arc::new(port));
        let result = tools.call(OS_SCREENSHOT, &json!({ "containerName": "desk-7" })).await;
        assert_eq!(result["ok"], true);
        assert_eq!(result["message"], "Captured desktop of sandbox \"desk-7\".");
        assert_eq!(result["data"]["screenshot"]["pngBase64"], "AQIDBA==");
        assert_eq!(result["data"]["screenshot"]["width"], 1280.0);
        assert_eq!(result["data"]["screenshot"]["height"], 720.0);
    }

    #[tokio::test]
    async fn resolve_error_is_returned_verbatim() {
        let tools = OsControlTools::new(Arc::new(FakePort::failing("no running sandbox")));
        let result = tools.call(OS_SCREENSHOT, &json!({})).await;
        assert_eq!(result["ok"], false);
        assert_eq!(result["message"], "no running sandbox");
        assert!(result.get("data").is_none());
    }

    #[tokio::test]
    async fn click_runs_action_then_screenshots() {
        let driver = Arc::new(FakeDriver::new());
        let port = FakePort::with(Arc::clone(&driver));
        let tools = OsControlTools::new(Arc::new(port));
        let result = tools
            .call(OS_CLICK, &json!({ "x": 4.5, "y": 6, "clicks": 2 }))
            .await;
        assert_eq!(result["ok"], true);
        assert_eq!(result["message"], "Click applied on sandbox \"desk-1\".");
        let log = driver.calls.lock().unwrap().clone();
        assert!(log[0].contains("click x=4.5 y=6"), "{:?}", log);
        assert!(log[0].contains("clicks=Some(2.0)"), "{:?}", log);
        assert_eq!(log.last().unwrap(), "screenshot");
        assert!(result["data"]["screenshot"]["pngBase64"].as_str().is_some());
    }

    #[tokio::test]
    async fn action_failure_reports_verb_and_container() {
        struct FailingDriver;
        impl OsControlDriver for FailingDriver {
            type Error = HostError;
            fn os_type(&self) -> crate::integrations::os_control::contracts::OsDriverType {
                crate::integrations::os_control::contracts::OsDriverType::Windows
            }
            fn screenshot(&self) -> BoxFuture<'_, Result<OsScreenshot, Self::Error>> {
                Box::pin(async { Err(HostError::Error("no display".to_string())) })
            }
            fn click(&self, _x: f64, _y: f64, _o: Option<OsClickOptions>) -> BoxFuture<'_, Result<(), Self::Error>> {
                Box::pin(async { Err(HostError::Error("driver offline".to_string())) })
            }
            fn mouse_move(&self, _x: f64, _y: f64) -> BoxFuture<'_, Result<(), Self::Error>> {
                Box::pin(async { Ok(()) })
            }
            fn r#type<'a>(&'a self, _t: &'a str, _o: Option<OsTypeOptions>) -> BoxFuture<'a, Result<(), Self::Error>> {
                Box::pin(async { Ok(()) })
            }
            fn key<'a>(&'a self, _c: &'a str, _o: Option<OsKeyOptions>) -> BoxFuture<'a, Result<(), Self::Error>> {
                Box::pin(async { Ok(()) })
            }
            fn scroll(&self, _o: Option<OsScrollOptions>) -> BoxFuture<'_, Result<(), Self::Error>> {
                Box::pin(async { Ok(()) })
            }
            fn exec<'a>(
                &'a self,
                _c: &'a str,
                _o: Option<OsExecOptions>,
            ) -> BoxFuture<'a, Result<crate::integrations::os_control::contracts::SandboxRunResult, Self::Error>> {
                Box::pin(async { Err(HostError::Error("nope".to_string())) })
            }
        }

        let port = FakePort {
            driver: Some(Arc::new(FailingDriver) as BoxedDriver),
            resolve_error: None,
            list_error: None,
            sandboxes: Vec::new(),
        };
        let tools = OsControlTools::new(Arc::new(port));
        let result = tools.call(OS_CLICK, &json!({ "x": 1, "y": 2 })).await;
        assert_eq!(result["ok"], false);
        assert_eq!(
            result["message"],
            "Click failed on sandbox \"desk-1\": driver offline"
        );
    }

    #[tokio::test]
    async fn missing_screenshot_still_reports_success() {
        let mut driver = FakeDriver::new();
        driver.screenshot_error = true;
        let driver = Arc::new(driver);
        let port = FakePort::with(Arc::clone(&driver));
        let tools = OsControlTools::new(Arc::new(port));
        let result = tools
            .call(OS_MOUSE, &json!({ "x": 3, "y": 4 }))
            .await;
        assert_eq!(result["ok"], true);
        assert_eq!(
            result["message"],
            "Mouse move applied on sandbox \"desk-1\" (screenshot unavailable)."
        );
        assert!(result.get("data").is_none());
    }

    #[tokio::test]
    async fn type_and_keyboard_require_non_empty_payloads() {
        let port = FakePort::with(Arc::new(FakeDriver::new()));
        let tools = OsControlTools::new(Arc::new(port));
        assert_eq!(tools.call(OS_TYPE, &json!({ "text": "" })).await["ok"], false);
        assert_eq!(
            tools.call(OS_KEYBOARD, &json!({ "combo": "   " })).await["ok"],
            false
        );
        let typed = tools
            .call(OS_TYPE, &json!({ "text": "hi", "delayMs": 12 }))
            .await;
        assert_eq!(typed["ok"], true);
    }

    #[tokio::test]
    async fn scroll_defaults_to_down_and_validates_amount() {
        let driver = Arc::new(FakeDriver::new());
        let port = FakePort::with(Arc::clone(&driver));
        let tools = OsControlTools::new(Arc::new(port));
        let result = tools.call(OS_SCROLL, &json!({})).await;
        assert_eq!(result["ok"], true);
        let log = driver.calls.lock().unwrap().clone();
        assert_eq!(log[0], "scroll direction=Some(Down) amount=None");
        let bad = tools.call(OS_SCROLL, &json!({ "amount": 0 })).await;
        assert_eq!(bad["ok"], false);
        let bad_direction = tools.call(OS_SCROLL, &json!({ "direction": "sideways" })).await;
        assert_eq!(bad_direction["ok"], false);
    }

    #[tokio::test]
    async fn exec_reports_nonzero_exit_and_timeout() {
        let mut driver = FakeDriver::new();
        driver.exec_result = SandboxExec {
            ok: false,
            output: "boom".to_string(),
            exit_code: Some(2.0),
            timed_out: true,
        };
        let port = FakePort::with(Arc::new(driver));
        let tools = OsControlTools::new(Arc::new(port));
        let result = tools.call(OS_EXEC, &json!({ "command": "false" })).await;
        assert_eq!(result["ok"], false);
        assert_eq!(result["message"], "Command exited with code 2 (timed out)");
        assert_eq!(result["data"]["output"], "boom");
        assert_eq!(result["data"]["exitCode"], 2.0);
        assert_eq!(result["data"]["containerName"], "desk-1");
    }

    #[tokio::test]
    async fn exec_validates_command_env_and_timeout() {
        let port = FakePort::with(Arc::new(FakeDriver::new()));
        let tools = OsControlTools::new(Arc::new(port));
        assert_eq!(tools.call(OS_EXEC, &json!({})).await["ok"], false);
        assert_eq!(
            tools.call(OS_EXEC, &json!({ "command": "ls", "timeoutMs": 0 })).await["ok"],
            false
        );
        let bad_env = tools
            .call(OS_EXEC, &json!({ "command": "ls", "env": { "A": 1 } }))
            .await;
        assert_eq!(bad_env["ok"], false);
        assert!(bad_env["message"].as_str().unwrap().contains("env[A]"));
        let good = tools
            .call(OS_EXEC, &json!({ "command": "ls", "cwd": "/tmp", "env": { "A": "1" } }))
            .await;
        assert_eq!(good["ok"], true);
        assert_eq!(good["message"], "Command completed on sandbox \"desk-1\".");
    }

    #[tokio::test]
    async fn sandbox_list_reports_count_and_errors() {
        let port = FakePort::with(Arc::new(FakeDriver::new()));
        let tools = OsControlTools::new(Arc::new(port));
        let result = tools.call(OS_SANDBOX_LIST, &json!({})).await;
        assert_eq!(result["ok"], true);
        assert_eq!(result["message"], "Found 1 running OS sandbox(s).");
        assert_eq!(result["data"]["sandboxes"][0]["containerName"], "desk-1");

        let broken = FakePort {
            driver: Some(Arc::new(FakeDriver::new()) as BoxedDriver),
            resolve_error: None,
            list_error: Some("docker unavailable".to_string()),
            sandboxes: Vec::new(),
        };
        let tools = OsControlTools::new(Arc::new(broken));
        let result = tools.call(OS_SANDBOX_LIST, &json!({})).await;
        assert_eq!(result["ok"], false);
        assert_eq!(result["message"], "docker unavailable");
    }
}
