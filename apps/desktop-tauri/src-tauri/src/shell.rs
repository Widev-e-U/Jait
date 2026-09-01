//! Tauri shell layer (feature-gated): commands + sink installation.
//!
//! Security note: custom Tauri commands are callable from any webview frame
//! regardless of `capabilities/*.json` (those gate core/plugin commands), so
//! `desktop_ipc` re-enforces the same channel allow-list the preload shim
//! uses before touching glue.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State, Window, WebviewUrl, WebviewWindowBuilder};

use jait_desktop_glue::{HostSink, HostState};

use crate::translate_glue_event;

/// Glue host shared between the setup hook (sink installation) and commands.
pub struct GlueHost(pub Arc<Mutex<HostState>>);

/// Command channels the webview may reach. Mirrors the preload shim's
/// `invoke` map 1:1 — anything else is rejected before glue dispatch.
const ALLOWED_CHANNELS: &[&str] = &[
    "app-info",
    "desktop:host-info",
    "desktop:fs-op",
    "desktop:browse-path",
    "desktop:get-roots",
    "desktop:pick-directory",
    "desktop:open-external",
    "desktop:open-terminal-app",
    "desktop:search-op",
    "desktop:detect-providers",
    "desktop:provider-op",
    "desktop:tool-op",
    "desktop:terminal-op",
    "desktop:get-setting",
    "desktop:set-setting",
    "desktop:delete-setting",
    "credential:store",
    "credential:get",
    "credential:clear",
    "desktop:notify",
    "clipboard:read-text",
];

fn emit_glue_event(app: &AppHandle, channel: &str, payload: &Value) {
    match translate_glue_event(channel, payload) {
        Some((event, translated)) => {
            let _ = app.emit(&event, translated);
        }
        // translate_glue_event returns None only for native-only channels
        // (currently desktop:notify).
        None => notify_native(payload),
    }
}

fn notify_native(payload: &Value) {
    let title = payload.get("title").and_then(Value::as_str).unwrap_or("Jait");
    let body = payload
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or_default();
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let _ = Command::new("notify-send").args([title, body]).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let script = format!("display notification \"{}\" with title \"{}\"", body, title);
        let _ = Command::new("osascript").arg("-e").arg(script).spawn();
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (title, body);
    }
}

/// Install the glue → webview event pump. Glue worker threads (PTY readers,
/// provider runners, background shells) call this sink from arbitrary
/// threads; translations are pure and `Emitter::emit` is thread-safe.
pub fn install_sink(app: &AppHandle) -> HostSink {
    let handle = app.clone();
    Arc::new(move |channel, payload| emit_glue_event(&handle, channel, payload))
}

/// Single funnel for every Electron-style IPC call from the preload shim.
#[tauri::command]
pub async fn desktop_ipc(
    _app: AppHandle,
    glue: State<'_, GlueHost>,
    channel: String,
    args: Vec<Value>,
) -> Result<Value, String> {
    if !ALLOWED_CHANNELS.contains(&channel.as_str()) {
        return Err(format!("unknown desktop channel: {channel}"));
    }
    let host = glue.0.clone();
    tauri::async_runtime::spawn_blocking(move || host.lock().dispatch(&channel, &args))
        .await
        .map_err(|e| format!("desktop ipc join error: {e}"))?
}

/// Native directory picker for flows where the glue needs the OS shell.
/// Electron parity: `dialog.showOpenDialog({ properties: ['openDirectory'] })`
/// resolved to a single path. Returns `None` when the user cancels; the shim
/// turns that into a canceled error for the renderer.
#[tauri::command]
pub async fn desktop_pick_directory_dialog(
    app: AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, mut rx) = tauri::async_runtime::channel::<Result<Option<String>, String>>(1);
    let mut builder = app.dialog().file().set_title("Open project folder");
    if let Some(dir) = default_path {
        builder = builder.set_directory(dir);
    }
    builder.pick_folder(move |file| {
        let path = file
            .map(|f| f.into_path().map(|p| p.display().to_string()))
            .transpose()
            .map_err(|e| e.to_string());
        let _ = tx.blocking_send(path);
    });
    rx.recv()
        .await
        .unwrap_or_else(|| Err("dialog channel closed".into()))
}

#[tauri::command]
pub fn window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

/// tauri 2.x removed `Window::toggle_maximize`; replicate it manually.
/// Electron parity: `win.isMaximized() ? win.unmaximize() : win.maximize()`.
#[tauri::command]
pub fn window_toggle_maximize(window: Window) -> Result<(), String> {
    let maxed = window.is_maximized().map_err(|e| e.to_string())?;
    if maxed {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_is_maximized(window: Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_start_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

static PROJECT_WINDOW_SEQ: AtomicU64 = AtomicU64::new(0);

/// Detached "project" window — Electron parity for
/// `jaitDesktop.openProjectWindow({ url, title })`.
#[tauri::command]
pub fn open_project_window(
    app: AppHandle,
    url: String,
    title: Option<String>,
) -> Result<Value, String> {
    let parsed: tauri::Url = url
        .parse()
        .map_err(|e| format!("open-project-window: invalid url {url:?}: {e}"))?;
    let n = PROJECT_WINDOW_SEQ.fetch_add(1, Ordering::Relaxed);
    let label = format!("project-{n}");
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed));
    if let Some(t) = title {
        builder = builder.title(t);
    }
    builder
        .build()
        .map_err(|e| format!("open-project-window: {e}"))?;
    Ok(json!({ "label": label }))
}

/// Gateway URL — Electron parity with electron-main.ts:
/// `process.env["JAIT_GATEWAY_URL"] ?? "http://localhost:8000"`.
fn gateway_url_from(env: Option<String>) -> String {
    env.unwrap_or_else(|| "http://localhost:8000".to_string())
}

fn gateway_url() -> String {
    gateway_url_from(std::env::var("JAIT_GATEWAY_URL").ok())
}

/// Renderer URL. Electron dev loads `http://localhost:3000` (vite dev server,
/// overridable via `JAIT_WEB_DEV_URL`); packaged builds load the bundled web
/// app from extraResources. Tauri parity:
/// 1. `JAIT_WEB_DEV_URL` — explicit dev server URL, always wins,
/// 2. `frontend` feature — the built web dist configured by
///    `frontendDist` is compiled into the binary and served from
///    tauri://localhost,
/// 3. fallback — gateway serves the same web bundle (packages/gateway serves
///    apps/web/dist in production), so load it from the gateway URL.
fn web_url(gateway: &str) -> WebviewUrl {
    if let Ok(dev) = std::env::var("JAIT_WEB_DEV_URL") {
        if let Ok(parsed) = dev.parse() {
            return WebviewUrl::External(parsed);
        }
    }
    #[cfg(feature = "frontend")]
    return WebviewUrl::App("index.html".into());
    #[cfg(not(feature = "frontend"))]
    {
        let url = format!("{gateway}/");
        if let Ok(parsed) = url.parse() {
            return WebviewUrl::External(parsed);
        }
        WebviewUrl::App("index.html".into())
    }
}

/// Boot constants injected as an initialization script *before* the shim,
/// mirroring electron-main.ts / preload.cts contract (gatewayUrl, deviceID).
fn boot_script(gateway: &str, glue: &Arc<Mutex<HostState>>) -> String {
    let device_id = glue
        .lock()
        .dispatch("desktop:host-info", &[json!("device-id")])
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default();
    format!(
        "window.__JAIT_DESKTOP_BOOT__ = {{ gatewayUrl: {}, deviceID: {}, platform: 'tauri' }};",
        serde_json::to_string(gateway).unwrap_or_else(|_| "null".into()),
        serde_json::to_string(&device_id).unwrap_or_else(|_| "null".into()),
    )
}

/// The preload shim, compiled into the binary at build-time via include_str!.
const SHIM_JS: &str = include_str!("../guest-js/shim.js");

pub fn run() {
    let glue = Arc::new(Mutex::new(HostState::new()));
    tauri::Builder::default()
        // Plugins the shim/preload can reach through `plugin:*` invokes. The
        // capability file grants them, but nothing works unless they are
        // actually registered on this builder.
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .manage(GlueHost(glue.clone()))
        .setup(move |app| {
            glue.lock().add_sink(install_sink(app.handle()));

            let gateway = gateway_url();
            let boot = boot_script(&gateway, &glue);

            let builder = WebviewWindowBuilder::new(app, "main", web_url(&gateway))
                .title("Jait")
                .inner_size(1440.0, 900.0)
                .min_inner_size(960.0, 640.0)
                .decorations(false);
            // Electron disables HTML file drops on webviews (drag-drop is
            // handled by the app itself); wry exposes that knob on Windows only.
            #[cfg(windows)]
            let builder = builder.drag_and_drop(false);
            builder
                // init scripts run in order before any page script — same
                // guarantee as Electron's preload on every navigation.
                .initialization_script(&boot)
                .initialization_script(SHIM_JS)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_ipc,
            desktop_pick_directory_dialog,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_is_maximized,
            window_start_drag,
            open_project_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running jait desktop shell");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gateway_url_defaults_to_electron_default() {
        // Electron: process.env["JAIT_GATEWAY_URL"] ?? "http://localhost:8000"
        assert_eq!(gateway_url_from(None), "http://localhost:8000");
        assert_eq!(
            gateway_url_from(Some("http://192.168.1.10:8000".into())),
            "http://192.168.1.10:8000"
        );
    }
}