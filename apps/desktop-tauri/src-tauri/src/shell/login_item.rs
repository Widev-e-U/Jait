//! First-launch login-item takeover (Tauri build).
//!
//! The Electron build (apps/desktop) has shipped for a long time: its NSIS
//! installer offers "Start Jait on login" and writes
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (plus the same key on
//! macOS via AppleScript / Linux via ~/.config/autostart). The Tauri NSIS
//! bundle writes **no** installer hooks, so a user who migrates from Electron
//! to Tauri loses autostart — this module re-adopts that OS-level choice on
//! the first Tauri start instead of silently dropping it.
//!
//! Merge order for "should Jait autostart?" (mirrors the shim's
//! `getLoginItem` merge of `native.enabled || persisted === true`):
//!
//! 1. `launchAtLogin` persisted setting (glue settings store) — wins when set.
//! 2. Native plugin state (`tauri-plugin-autostart`) when no setting exists.
//! 3. Legacy installer flag `HKCU\...\Explorer\StartupApproved\Run` style
//!    fallback: on Windows the *presence* of our Run value means "on"
//!    (Task Manager disablement is out of scope — we never re-enable behind
//!    the user's back).
//!
//! After adopting (native state was on, no persisted setting), the decision
//! is persisted as `launchAtLogin: true` so an Electron uninstaller deleting
//! the shared Run value cannot silently drop the choice; the next start
//! re-registers it for this binary.
//!
//! Dev builds (`cargo tauri dev`, `debug_assertions`) bail out before writing
//! anything so they never repoint the production registration at
//! `target/debug/…`.

use parking_lot::Mutex;
use std::sync::Arc;

use serde_json::json;
use tauri::{AppHandle, Manager};
// File scope, not fn scope: sync_login_item also calls app.autolaunch().
use tauri_plugin_autostart::ManagerExt;

use jait_desktop_glue::HostState;

/// Persisted settings key shared with electron-main.ts and the shim.
const LAUNCH_AT_LOGIN_KEY: &str = "launchAtLogin";
/// Windows registry path of the per-user login items.
const RUN_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// Resolve the effective "launch at login" intent.
///
/// Returns `Some(true/false)` when a persisted `launchAtLogin` setting
/// exists (it always wins), otherwise the native plugin's current state.
fn resolve_target(app: &AppHandle, persisted: Option<bool>) -> bool {
    if let Some(flag) = persisted {
        return flag;
    }
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Read the Run value for our app name, if any.
#[cfg(windows)]
fn read_run_value(app: &AppHandle) -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey(RUN_KEY_PATH).ok()?;
    // The autostart plugin names the value after the package name — the same
    // name the Electron NSIS installer used, so they share one entry.
    key.get_value::<String, _>(app.package_info().name.as_str())
        .ok()
}

/// True when the Run value exists and points at exactly this binary.
///
/// Compares the full path (case-insensitive): the Electron install's exe is
/// also named `Jait.exe`, just under a different directory, so a file-name
/// comparison would wrongly treat the stale registration as current.
#[cfg(windows)]
fn already_registered(app: &AppHandle) -> bool {
    let ours = match std::env::current_exe() {
        Ok(p) => p.to_string_lossy().to_lowercase(),
        Err(_) => return false,
    };
    read_run_value(app)
        .map(|actual| {
            let unquoted = actual.trim().trim_matches('"');
            unquoted.to_lowercase().starts_with(&ours)
        })
        .unwrap_or(false)
}

/// Adopt the Electron-era login item on first Tauri start. No-op afterwards.
///
/// Called from the Tauri `setup` hook, before the main window builds, so the
/// decision is applied (and persisted) regardless of how the app was
/// launched — by hand, by the old autostart entry, or by the OS at boot.
pub fn sync_login_item(app: &AppHandle, glue: &Arc<Mutex<HostState>>) {
    // Dev builds run from target/debug — never let them rewrite the
    // production registration (or the user's settings file intent).
    if cfg!(debug_assertions) {
        return;
    }

    let persisted = glue
        .lock()
        .dispatch("desktop:get-setting", &[json!(LAUNCH_AT_LOGIN_KEY)])
        .ok()
        .and_then(|v| v.as_bool());

    let target = resolve_target(app, persisted);
    if !target {
        // Off is a user decision — leave whatever is registered alone.
        return;
    }

    // Ensure the OS registration points at *this* binary. `enable()`
    // (re)creates the entry, which also (a) repoints a value still written
    // for the Electron install path and (b) re-creates an entry the Electron
    // uninstaller deleted. When no persisted setting exists and the entry
    // already points at this build (the plugin wrote it itself), skip the
    // rewrite.
    #[cfg(windows)]
    if !(persisted.is_none() && already_registered(app)) && app.autolaunch().enable().is_err() {
        return;
    }
    #[cfg(not(windows))]
    if app.autolaunch().enable().is_err() {
        return;
    }

    // Adopt the intent so it survives an Electron uninstall (whose
    // uninstaller deletes the shared Run value) — the next start
    // re-registers from this setting.
    let _ = glue.lock().dispatch(
        "desktop:set-setting",
        &[json!(LAUNCH_AT_LOGIN_KEY), json!(true)],
    );
}