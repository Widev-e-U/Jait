# Tauri ↔ Electron parity status

Inventory of the Electron main process (`apps/desktop/src/electron-main.ts`, ~3.75k lines) vs the
Tauri shell (`apps/desktop-tauri/src-tauri/src/shell.rs` + `crates/jait-desktop-glue`), last updated
after the tray / single-instance / hidden-spawn work. Verification: `cargo check` + `cargo test`
(14/14) pass on the glue/core crates; the `shell` feature build additionally needs the system dev
packages listed at the bottom.

## At parity ✅

| Area | Notes |
| --- | --- |
| Gateway proxy + WS bridge | Same channels as Electron, incl. `(op, params, requestId)` contract shapes |
| FS ops | read / readBinary / write / stat / list / readdir / patch / mkdir / exists / reveal |
| Git/gh | `git`, `gh`, `gh-check` (clean env), `gitfilediffs` (A/D/R/M + merge-base PR mode), `gitfileread` |
| Search | `desktop:search-op` |
| Terminal | `desktop:terminal-op` PTY lifecycle (visible-window spawn bug fixed) |
| Providers | detect / auth-status / start-login / start / send / stop / alive-sessions |
| Tool ops | execute + background (`background_complete` events) |
| Settings | get / set / delete |
| Notifications | `desktop:notify` (notify-send / osascript) |
| Clipboard | `clipboard:read-text` (tauri-plugin-clipboard-manager) |
| Credentials | store / get / clear (memory store on Linux; keyring path pending, see gaps) |
| Native dialogs | `desktop:pick-directory` (rfd) |
| Paths | `desktop:browse-path`, `desktop:get-roots` |
| Preview windows | `desktop:open-preview-window` → `open_project_window` |
| Custom titlebar | minimize / maximize / close / is-maximized / start-drag |
| Tray + close-to-tray | hide to tray, restore on click, quit menu item |
| Single instance | second launch focuses existing window; `--hidden` / `--open-folder` argv forwarded |
| Open in file manager / terminal app | `desktop:open-external`, `desktop:open-terminal-app` |
| Host info | app-info, host-info (version / platform / device-id / os-info / home-dir) |

## Missing vs Electron ❌

### 1. Embedded browser pane — `browser:*` (6 channels)
`browser:get-navigation-state`, `browser:home`, `browser:back`, `browser:forward`,
`browser:reload`, `browser:navigate`. Electron hosts a `WebContentsView` with full history
control. Tauri has **no equivalent**; the closest primitive is a second `WebviewWindow` with an
external URL, but there is no per-window back/forward/reload API exposed through commands today
(Tauri v2 does have `webview.navigate()` internally; needs a custom command + a history mirror).
**Effort:** 2–4 days, plus deciding whether the browser pane lives inside the main window
(requires the multi-webview `unstable` feature) or as a child window.

### 2. Screen share — `desktop:get-sources` + approval dialog
Electron enumerates `desktopCapturer` sources and shows a native Accept/Decline box. WebKitGTK's
`getUserMedia({ video: { displaySurface } })` support is incomplete and Tauri exposes no source
picker. **Effort:** 1–2 weeks and likely platform-gated (macOS first via CGWindowList, Linux via
PipeWire portal). Feature-flag it.

### 3. Auto-update — `update:check/download/install`
Electron uses electron-updater. Tauri needs `tauri-plugin-updater` + signed artifacts (minisign)
and a release feed; `.github/workflows/release.yml` already builds Tauri bundles but must also
produce `latest.json` + signatures. **Effort:** 2–3 days (plugin + workflow + signing keys).

### 4. Launch at login — `desktop:get/set-login-item`
Electron `app.setLoginItemSettings`. Tauri: `tauri-plugin-autostart`. **Effort:** ~2 hours.

### 5. OS keychain credentials
Electron uses `safeStorage` (DPAPI / Keychain / libsecret). Tauri glue currently runs
`use_memory_credentials()` on Linux — secrets die with the process. Fix: `keyring` crate
(libsecret on Linux — this is what the vendored-dbus experiment was for) with memory fallback.
**Effort:** half a day.

### 6. Hardware-acceleration toggle — `desktop:get/reset-hw-accel`
Electron-specific (`disableHardwareAcceleration` + relaunch). Tauri equivalent is the
`WEBKIT_DISABLE_COMPOSITING_MODE=1` env var set before window creation — can be persisted +
relaunched, but it's a coarser switch. **Effort:** half a day, low value (WKWebView/WebKitGTK GPU
issues are rarer than Chromium's).

### 7. macOS title-bar overlay — `window:set-title-bar-overlay`
Electron `titleBarStyle: overlay` with dynamic colors. Tauri uses custom decorations +
`start_dragging` everywhere, so macOS loses the native overlay look. Cosmetic; can map to
`macos-private-api` traffic-light positioning if it matters. **Effort:** 1 day.

### 8. Notification click-to-focus — `desktop:notify-close` + live-map
Electron tracks live `Notification` objects, closes on demand, focuses the window on click.
`notify-send`/`osascript` fire-and-forget gives no click/close events. Fix: `tauri-plugin-notification`
(on Linux → same portal, but action callbacks work on macOS/Windows). **Effort:** half a day for
macOS/Windows click-to-focus, Linux stays fire-and-forget.

### 9. Child teardown on exit (minor)
`HostState` has no `stop_all()`; PTY children rely on process teardown. Electron explicitly kills
tracked children. **Effort:** ~1 hour.

## Not applicable to Tauri
- `crashReporter` (Electron-only; Sentry/rust symbols later if needed)
- `session.setPermissionRequestHandler` specifics (WebKitGTK config replaces it)
- Chromium flags (`app.commandLine.appendSwitch`) used by Electron

## Verification of the `shell` feature locally

The build needs Ubuntu dev packages this machine doesn't have yet:

```sh
sudo apt install -y pkg-config build-essential libssl-dev \
  libdbus-1-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

(CI builds already cover this on ubuntu-latest; local install only shortens the feedback loop.)