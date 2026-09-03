//! Auto-updater (Electron parity for `initAutoUpdater` + the `update:*` IPC
//! handlers in electron-main.ts).
//!
//! Electron (electron-updater): `autoDownload = false`, background poll at
//! launch +10s then every 4h, renderer events `update:checking` /
//! `update:available` / `update:not-available` / `update:download-progress` /
//! `update:downloaded` / `update:error`, and `update:check|download|install`
//! IPC handlers (`install` = quitAndInstall, i.e. quit + relaunch).
//!
//! Tauri parity via tauri-plugin-updater: the shim's `onUpdateEvent(name, cb)`
//! subscribes to a window event named exactly `name`, so the shell emits the
//! phase names bare (`available`, `downloaded`, ...) — the shim comment in
//! guest-js/shim.js documents the contract. Config (endpoint, pubkey,
//! windows.installMode) lives in tauri.conf.json `plugins.updater`; artifact
//! signing happens at bundle time (CI provides TAURI_SIGNING_PRIVATE_KEY).

use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

/// An update whose artifact finished downloading, waiting for `installUpdate`
/// (Electron caches the downloaded installer inside autoUpdater until
/// quitAndInstall; this is the equivalent).
struct PendingUpdate {
    update: Update,
    bytes: Vec<u8>,
}

static PENDING: Mutex<Option<PendingUpdate>> = Mutex::new(None);

fn emit_update_event(app: &AppHandle, name: &str, payload: Value) {
    // Bare phase names (`available`, `downloaded`, ...) are what the shim's
    // onUpdateEvent subscribes to; also emit the full Electron channel name
    // (`update:available` etc.) so tooling/tests can pick either.
    let _ = app.emit(name, payload.clone());
    let _ = app.emit(&format!("update:{name}"), payload);
}

fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

/// One check + event fan-out, shared by the manual command and the background
/// poll. Returns the same shape as the `update:check` IPC handler
/// ({ updateAvailable, version?, error? }).
async fn check_and_emit(app: &AppHandle) -> Value {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(e) => {
            // Unconfigured updater (e.g. dev build) behaves like Electron's
            // IS_DEV branch: silent no-op, no error toast.
            return json!({ "updateAvailable": false, "error": format!("updater unavailable: {e}") });
        }
    };
    emit_update_event(app, "checking", json!({}));
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            emit_update_event(
                app,
                "available",
                json!({ "version": version, "currentVersion": current_version(app) }),
            );
            json!({ "updateAvailable": true, "version": version })
        }
        Ok(None) => {
            emit_update_event(app, "not-available", json!({}));
            json!({ "updateAvailable": false })
        }
        Err(e) => {
            let msg = e.to_string();
            emit_update_event(app, "error", json!(msg));
            json!({ "updateAvailable": false, "error": msg })
        }
    }
}

/// `update:check` parity — manual "Check for updates" from the web UI.
#[tauri::command]
pub async fn desktop_update_check(app: AppHandle) -> Result<Value, String> {
    Ok(check_and_emit(&app).await)
}

/// `update:download` parity — downloads the artifact with a progress callback
/// mirroring electron-updater's `download-progress` events. The downloaded
/// bytes are cached for `installUpdate` (Electron caches its installer).
#[tauri::command]
pub async fn desktop_update_download(app: AppHandle) -> Result<Value, String> {
    let updater = app.updater().map_err(|e| format!("updater unavailable: {e}"))?;
    // Re-check instead of reusing a stale handle: the plugin's check is a
    // cheap JSON fetch and guarantees the artifact matches the live manifest.
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return Ok(json!({ "ok": false, "error": "no update available" })),
        Err(e) => {
            let msg = e.to_string();
            emit_update_event(&app, "error", json!(msg));
            return Ok(json!({ "ok": false, "error": msg }));
        }
    };
    let version = update.version.clone();
    let app_handle = app.clone();
    let started = Instant::now();
    let transferred = Mutex::new(0u64);
    let last_emit = Mutex::new(Instant::now() - Duration::from_secs(1));
    let download = update
        .download(
            move |chunk, total| {
                *transferred.lock() += chunk as u64;
                // Electron emits every progress tick; setup.exe artifacts are
                // big, so throttle to ~5 events/s to keep the webview event
                // bus sane.
                let mut last = last_emit.lock();
                if last.elapsed() >= Duration::from_millis(200) {
                    *last = Instant::now();
                    let sent = *transferred.lock();
                    let percent = total.map(|t| (sent as f64 / t as f64) * 100.0);
                    let elapsed = started.elapsed().as_secs_f64().max(0.001);
                    emit_update_event(
                        &app_handle,
                        "download-progress",
                        json!({
                            "percent": percent.unwrap_or(0.0),
                            "transferred": sent,
                            "total": total,
                            "bytesPerSecond": (sent as f64 / elapsed) as u64,
                        }),
                    );
                }
            },
            || {},
        )
        .await;
    match download {
        Ok(bytes) => {
            *PENDING.lock() = Some(PendingUpdate { update, bytes });
            emit_update_event(&app, "downloaded", json!({ "version": version }));
            Ok(json!({ "ok": true, "version": version }))
        }
        Err(e) => {
            let msg = e.to_string();
            emit_update_event(&app, "error", json!(msg));
            Ok(json!({ "ok": false, "error": msg }))
        }
    }
}

/// `update:install` parity — Electron calls `autoUpdater.quitAndInstall()`
/// (quit + swap binary + relaunch). The plugin's `install()` replaces the
/// binary/app; on Windows (NSIS) it spawns the installer and exits this
/// process, on Linux/macOS we restart explicitly. `install` is blocking and
/// ends the process, so run it off the main runtime threads.
#[tauri::command]
pub async fn desktop_update_install(app: AppHandle) -> Result<Value, String> {
    let pending = PENDING.lock().take();
    match pending {
        Some(pending) => {
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(e) = pending.update.install(&pending.bytes) {
                    // Surface the failure instead of dying silently; the
                    // renderer can retry download+install.
                    let msg = e.to_string();
                    emit_update_event(&app, "error", json!(msg));
                    return Ok(json!({ "ok": false, "error": msg }));
                }
                // install() exits the process on Windows; this relaunch covers
                // Linux (AppImage swap) and macOS. `restart()` is `-> !`: it
                // exits this process, so nothing after it runs.
                app.restart();
            })
            .await
            .map_err(|e| format!("install task panicked: {e}"))?
        }
        None => Ok(json!({ "ok": false, "error": "no downloaded update" })),
    }
}

/// Background poll — Electron: `setTimeout(check, 10_000)` then
/// `setInterval(check, 4h)` with `autoDownload = false`. We check + emit the
/// bare phase events so the web UI's `onUpdateEvent('available'|'downloaded')`
/// toast fires without the renderer asking. Download always stays
/// user-initiated.
pub fn spawn_poll(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(10)).await;
        check_and_emit(&app).await;
        loop {
            tokio::time::sleep(Duration::from_secs(4 * 60 * 60)).await;
            check_and_emit(&app).await;
        }
    });
}