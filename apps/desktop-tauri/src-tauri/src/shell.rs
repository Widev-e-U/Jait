//! Tauri shell layer (feature-gated): commands + sink installation.
//!
//! Security note: custom Tauri commands are callable from any webview frame
//! regardless of `capabilities/*.json` (those gate core/plugin commands), so
//! `desktop_ipc` re-enforces the same channel allow-list the preload shim
//! uses before touching glue.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use serde_json::{json, Value};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, State, Window, WebviewUrl, WebviewWindowBuilder,
};

use jait_desktop_glue::{HostSink, HostState};

use crate::translate_glue_event;

// Updater commands live in `updater.rs`. The fns are imported for
// `generate_handler!`; the generated `__cmd__`/`__tauri_command_name_`
// macros reach this module via `#[macro_use]` on `pub mod updater` in
// lib.rs (declared before `shell`), since rustc forbids importing
// macro-expanded macro_export macros by absolute path.
use crate::updater::{desktop_update_check, desktop_update_download, desktop_update_install};

/// First-launch login-item takeover (adopt the Electron install's autostart).
pub mod login_item;

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

/// Set just before `app.exit(0)` so the window-close handler lets the main
/// window actually close instead of hiding (Electron `isQuitting` parity).
static QUITTING: AtomicBool = AtomicBool::new(false);

/// Show + focus the main window. Electron parity:
/// `mainWindow?.show(); mainWindow?.focus();` (tray click, second instance).
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Tray icon, bundled from the same asset Electron uses. Requires the
/// `image-png` tauri feature to decode at runtime.
fn tray_icon() -> tauri::Result<tauri::image::Image<'static>> {
    const TRAY_PNG: &[u8] = include_bytes!("../../../desktop/assets/tray-icon.png");
    tauri::image::Image::from_bytes(TRAY_PNG)
        .map_err(|e| tauri::Error::AssetNotFound(format!("tray-icon.png: {e}").into()))
}

/// Tray icon + background-runtime menu, mirroring `createTray` in
/// electron-main.ts: Show Jait / Screen Share submenu (Start/Stop Sharing →
/// `screenshare-start|stop` window events, the names the shim subscribes to) /
/// revoke remembered computer-control approval / Quit. Left-click shows the
/// window, right-click opens the menu (`tray.on("click")` + setContextMenu).
fn create_tray(app: &AppHandle, glue: &Arc<Mutex<HostState>>) -> tauri::Result<()> {
    fn revoke_computer_control(glue: &Arc<Mutex<HostState>>) {
        // Electron: if (getSetting("computerControl.trustedUntil", 0) > now)
        // setSetting("computerControl.trustedUntil", 0); computerControl.stop().
        // The Tauri glue has no computer-control server yet, so only the
        // setting is cleared (gap noted in the parity report).
        let trusted_until = glue
            .lock()
            .dispatch("desktop:get-setting", &[json!("computerControl.trustedUntil")])
            .ok()
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if trusted_until > 0 {
            let _ = glue.lock().dispatch(
                "desktop:set-setting",
                &[json!("computerControl.trustedUntil"), json!(0)],
            );
        }
    }

    let show = MenuItemBuilder::with_id("tray-show", "Show Jait").build(app)?;
    let share_start = MenuItemBuilder::with_id("tray-share-start", "Start Sharing").build(app)?;
    let share_stop = MenuItemBuilder::with_id("tray-share-stop", "Stop Sharing").build(app)?;
    let share_submenu =
        Submenu::with_items(app, "Screen Share", true, &[&share_start, &share_stop])?;
    let revoke = MenuItemBuilder::with_id(
        "tray-revoke-computer-control",
        "Revoke remembered computer-control approval",
    )
    .build(app)?;
    let quit = MenuItemBuilder::with_id("tray-quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&share_submenu)
        .separator()
        .item(&revoke)
        .separator()
        .item(&quit)
        .build()?;

    let glue_for_menu = glue.clone();
    TrayIconBuilder::with_id("jait-tray")
        .icon(tray_icon()?)
        .tooltip("Jait Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "tray-show" => show_main_window(app),
            "tray-share-start" => {
                let _ = app.emit("screenshare-start", json!({}));
            }
            "tray-share-stop" => {
                let _ = app.emit("screenshare-stop", json!({}));
            }
            "tray-revoke-computer-control" => revoke_computer_control(&glue_for_menu),
            "tray-quit" => {
                QUITTING.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Electron: tray.on("click"/"double-click") → show + focus.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
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
///
/// Windows applies maximize/restore a beat after the call, so a rapid second
/// click can re-read the pre-toggle state and wedge the window in the
/// maximized mode (the "click twice and it sticks" bug). When the read says
/// "maximize", re-sample once after a short settle: if the first maximize
/// already landed meanwhile, this click restores instead of maximizing again.
/// A stale "maximized" read is harmless — a second restore is a no-op.
#[tauri::command]
pub fn window_toggle_maximize(window: Window) -> Result<(), String> {
    const SETTLE_MS: u64 = 50;
    let maxed = window.is_maximized().map_err(|e| e.to_string())?;
    if maxed {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        std::thread::sleep(std::time::Duration::from_millis(SETTLE_MS));
        let maxed_now = window.is_maximized().map_err(|e| e.to_string())?;
        if maxed_now {
            window.unmaximize().map_err(|e| e.to_string())
        } else {
            window.maximize().map_err(|e| e.to_string())
        }
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

/// Login-item state — Electron parity for `desktop:get-login-item`
/// (electron-main.ts `app.getLoginItemSettings({ args: AUTO_START_ARGS })`).
/// The shim merges this with the persisted `launchAtLogin` setting.
#[tauri::command]
pub fn desktop_get_login_item(app: AppHandle) -> Result<Value, String> {
    use tauri_plugin_autostart::ManagerExt;
    let enabled = app
        .autolaunch()
        .is_enabled()
        .map_err(|e| format!("login-item: {e}"))?;
    Ok(json!({ "enabled": enabled, "supported": true }))
}

/// Login-item toggle — Electron parity for `desktop:set-login-item`
/// (electron-main.ts `app.setLoginItemSettings({ openAtLogin, args })`).
/// The registered launcher keeps the `--hidden` arg from plugin init, so
/// login-time launches minimize to the tray exactly like Electron.
#[tauri::command]
pub fn desktop_set_login_item(app: AppHandle, enabled: bool) -> Result<Value, String> {
    use tauri_plugin_autostart::ManagerExt;
    // auto-launch 0.5's Linux backend does a single-level `fs::create_dir` of
    // ~/.config/autostart, which fails with ENOENT when ~/.config itself is
    // missing (fresh profiles, containers). Create the full chain first —
    // Electron's app.setLoginItemSettings has no such quirk, so this keeps
    // `desktop:set-login-item` reliable everywhere.
    if enabled {
        let autostart_dir = dirs::config_dir()
            .ok_or_else(|| "login-item: no user config directory".to_string())?
            .join("autostart");
        std::fs::create_dir_all(&autostart_dir)
            .map_err(|e| format!("login-item: {e}"))?;
    }
    let result = if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };
    result.map_err(|e| format!("login-item: {e}"))?;
    Ok(json!({ "ok": true, "enabled": enabled }))
}

/// Gateway URL — Electron parity with electron-main.ts:
/// `process.env["JAIT_GATEWAY_URL"] ?? "http://localhost:8000"`.
fn gateway_url_from(env: Option<String>) -> String {
    env.unwrap_or_else(|| "http://localhost:8000".to_string())
}

fn gateway_url() -> String {
    gateway_url_from(std::env::var("JAIT_GATEWAY_URL").ok())
}

fn gateway_url_is_configured() -> bool {
    std::env::var("JAIT_GATEWAY_URL").is_ok()
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
fn boot_script(
    gateway: &str,
    gateway_configured: bool,
    version: &str,
    glue: &Arc<Mutex<HostState>>,
    open_folder: Option<&std::path::Path>,
) -> String {
    let device_id = glue
        .lock()
        .dispatch("desktop:host-info", &[json!("device-id")])
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default();
    // `openFolder` feeds the shim's initial onOpenFolder callback (Electron:
    // mainWindow.webContents.send("renderer:open-folder", folder) after
    // did-finish-load when launched with --open-folder / a file argument).
    let open_folder_json = match open_folder {
        Some(path) => serde_json::to_string(&path.display().to_string())
            .unwrap_or_else(|_| "null".into()),
        None => "null".to_string(),
    };
    format!(
        "window.__JAIT_DESKTOP_BOOT__ = {{ gatewayUrl: {}, gatewayConfigured: {}, version: {}, deviceID: {}, openFolder: {}, platform: 'tauri' }};",
        serde_json::to_string(gateway).unwrap_or_else(|_| "null".into()),
        gateway_configured,
        serde_json::to_string(version).unwrap_or_else(|_| "null".into()),
        serde_json::to_string(&device_id).unwrap_or_else(|_| "null".into()),
        open_folder_json,
    )
}

/// The preload shim, compiled into the binary at build-time via include_str!.
const SHIM_JS: &str = include_str!("../guest-js/shim.js");

pub fn run() {
    // Launch flags shared with Electron: --hidden (start minimized to the
    // tray) and --open-folder / bare absolute path (pre-load a folder).
    let opts = crate::launch_options_from_argv(&std::env::args().collect::<Vec<String>>());
    let glue = Arc::new(Mutex::new(HostState::new()));
    tauri::Builder::default()
        // Electron `requestSingleInstanceLock` parity. Must be registered
        // first (plugin docs) so a second launch is rejected before any
        // window work happens.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Electron second-instance handler: focus the main window and
            // forward any `--open-folder` / bare path hand-off to the
            // renderer (electron-main.ts sends `renderer:open-folder`).
            show_main_window(app);
            if let Some(folder) = crate::resolve_folder_arg(&argv) {
                let _ = app.emit("open-folder", json!({ "folderPath": folder.display().to_string() }));
            }
        }))
        // Login-item (launch at login) parity for electron-main.ts's
        // `desktop:get/set-login-item`. The `--hidden` args match Electron's
        // AUTO_START_ARGS so a login-time launch minimizes to the tray.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        // Plugins the shim/preload can reach through `plugin:*` invokes. The
        // capability file grants them, but nothing works unless they are
        // actually registered on this builder.
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        // Electron-parity auto-updater (tauri-plugin-updater + custom
        // check/download/install commands in super::updater). Config lives in
        // tauri.conf.json `plugins.updater`.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(GlueHost(glue.clone()))
        .setup(move |app| {
            glue.lock().add_sink(install_sink(app.handle()));

            // First-launch login-item takeover: re-adopt the OS autostart
            // choice made for the Electron install (shared Run key on
            // Windows, ~/.config/autostart on Linux) before the window
            // builds, whatever the launch origin (hand, old autostart
            // entry, or the OS at boot).
            login_item::sync_login_item(app.handle(), &glue);

            let gateway = gateway_url();
            let gateway_configured = gateway_url_is_configured();
            let version = app.package_info().version.to_string();
            let boot = boot_script(
                &gateway,
                gateway_configured,
                &version,
                &glue,
                opts.open_folder.as_deref(),
            );

            let mut builder = WebviewWindowBuilder::new(app, "main", web_url(&gateway))
                .title("Jait")
                .inner_size(1440.0, 900.0)
                .min_inner_size(960.0, 640.0)
                .decorations(false);
            // --hidden launch: build the window hidden; the tray Show item /
            // second-instance callback bring it up later.
            if opts.start_hidden {
                builder = builder.visible(false);
            }
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
            // Electron parity: tray icon + background menu (createTray).
            create_tray(app.handle(), &glue)?;
            Ok(())
        })
        // Closing the main window hides it instead of exiting so tray
        // background behavior keeps webview state alive (Electron
        // `close` → preventDefault + hide unless isQuitting).
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && !QUITTING.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            desktop_get_login_item,
            desktop_set_login_item,
            desktop_update_check,
            desktop_update_download,
            desktop_update_install,
        ])
        .build(tauri::generate_context!())
        .expect("error while building jait desktop shell")
        .run(|_app_handle, event| {
            // Glue children (PTY shells, background commands) rely on process
            // teardown at exit; HostState has no stop_all() yet — tracked in
            // the Electron-parity gap report.
            if let RunEvent::Exit = event {}
        });
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