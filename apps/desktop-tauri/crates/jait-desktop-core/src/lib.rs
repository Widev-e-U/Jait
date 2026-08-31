//! jait-desktop-core — UI-free port of the Jait Electron desktop main logic.
//!
//! Every module mirrors a slice of `apps/desktop/src/electron-main.ts`:
//! - `settings`    → desktop-settings.json store (get/set/delete, deviceId)
//! - `credentials` → safeStorage-style credential map (keyring-backed)
//! - `info`        → device id, open-folder state, platform facts
//! - `search`      → project search (files/content modes)
//! - `fsops`       → desktop:fs-op simple filesystem ops
//! - `gitops`      → desktop:fs-op git/gh compound operations
//! - `term`        → remote interactive PTY sessions
//! - `tools`       → desktop:tool-op remote tool execution
//! - `providers`   → desktop:provider-op codex/claude-code remote sessions
//!
//! The crate never touches Tauri; `apps/desktop-tauri/src-tauri` adapts it.

pub mod credentials;
pub mod fsops;
pub mod gitops;
pub mod info;
pub mod providers;
pub mod runner;
pub mod search;
pub mod settings;
pub mod term;
pub mod tools;
pub mod types;

pub use runner::{ProviderEvent, RunnerHandle, RunnerRegistry, RunnerSpec};
pub use types::ToolResult;

/// Events the desktop host emits to the web UI (mirrors `webContents.send`).
/// The JS shim turns these into `window.jaitDesktop` event listeners.
/// Field names use camelCase on purpose — they must match the Electron
/// `webContents.send` payload keys exactly (wire-format parity).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type")]
#[allow(non_snake_case)]
pub enum DesktopEvent {
    /// Replaces `sendProviderEvent` → arrives on renderer channel `gateway:event`.
    #[serde(rename = "provider.event-from-child")]
    ProviderEvent { sessionId: String, notification: serde_json::Value },
    /// Replaces `sendTerminalOutputEvent` → arrives on renderer channel `gateway:event`.
    #[serde(rename = "terminal.output-from-child")]
    TerminalOutput { terminalId: String, data: String },
    /// Replaces `sendTerminalExitEvent` → arrives on renderer channel `gateway:event`.
    #[serde(rename = "terminal.exit-from-child")]
    TerminalExit { terminalId: String, exitCode: Option<i32>, signal: Option<String> },
    /// Replaces `sendBackgroundCommandCompleteEvent` → arrives on `gateway:event`.
    #[serde(rename = "tool.background-complete-from-child")]
    BackgroundComplete { backgroundId: String, exitCode: Option<i32>, output: String },
    /// Replaces direct channels (`desktop:open-folder`, `window:maximized-change`, …).
    #[serde(rename = "desktop.event")]
    Direct { channel: String, payload: serde_json::Value },
}

impl DesktopEvent {
    /// Bridge a runner event onto the `gateway:event` wire channel. The
    /// renderer sees the exact same shape the Electron `sendProviderEvent`
    /// produced: `{ type, sessionId, ...fields }` (camelCase keys).
    pub fn from_provider_event(event: ProviderEvent) -> DesktopEvent {
        let json = match serde_json::to_value(&event) {
            Ok(json) => json,
            Err(_) => return DesktopEvent::Direct { channel: "gateway:event".into(), payload: serde_json::Value::Null },
        };
        let session_id = json
            .get("sessionId")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string();
        DesktopEvent::ProviderEvent { sessionId: session_id, notification: json }
    }
}

