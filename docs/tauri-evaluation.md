# Evaluation: Migrate Jait Desktop from Electron to Tauri v2

**Date:** 2026-09-19 · **Scope:** `apps/desktop` (Electron 42, electron-builder, NSIS/portable targets)
**Question:** Is a Tauri migration worth it *for size*?

---

## TL;DR

| | Electron (today) | Tauri v2 (projected) |
|---|---|---|
| Windows installer | **122 MB** measured | ~**12–20 MB** |
| Installed size (win-unpacked) | **410 MB** measured | ~**35–50 MB** |
| Idle RAM (typical) | 200–400 MB | ~half |
| Port effort | — | **~6–10 weeks** incl. stabilization |

**Verdict: not yet — do the cheap Electron size wins first (≈1 h, −20–25 MB), then run a 1–2 week timeboxed Tauri spike (Phase 1 below) before committing.** The architecture is unusually Tauri-friendly (the renderer is already a plain web app with zero Node access), but ~4.5k lines of process-heavy main-process logic (PTY terminals, provider-CLI orchestration, `koffi` user32 FFI) would need a Rust rewrite — that is where the real cost sits, not the webview swap.

---

## 1. Measured current state

- Installer: `release/Jait-0.1.782-x64-setup.exe` = **122 MB** (portable same size); win-unpacked = **410 MB**:
  - 222 MB → `Jait.exe` (Chromium)
  - 48 MB → Chromium locales (18 languages irrelevant to users)
  - 82 MB → `resources/` (app + node_modules + extraResources)
- **58 MB web renderer ships in the installer; 41 MB of that is `.js.map` sourcemaps** (`apps/web/vite.config.ts:12` sets `sourcemap: true` and dist is copied verbatim via `extraResources`). Only 17 MB is actual app code.
- Renderer is shared with `apps/web` (`window.jaitDesktop` bridge, ~22 IPC channels, no `nodeIntegration`, contextIsolation on) → **no Node dependency in the UI**.
- Auto-update: `electron-updater` + GitHub Releases (`latest.yml` + blockmap).

### Main process inventory (`src/`, ~7k lines TS)

| Area | Implementation | Electron API |
|---|---|---|
| Window/UI | main, splash, detached preview windows, transparent CC-overlay, tray | `BrowserWindow`, `Tray`, `Menu` |
| IPC bridge | ~22 channels via preload contextBridge | `ipcMain`, `contextBridge` |
| Terminals | `node-pty` sessions (ConPTY) for agents | `require("node-pty")` |
| Provider orchestration | spawns `codex`/`claude` CLIs, streams output, MCP arg injection, background-command tails (**~⅔ of `electron-main.ts`**) | node `child_process` |
| Project search | spawns `rg` with JS-scan fallback | node `child_process` |
| Windows computer control | `koffi` FFI → user32 `SendInput`; screenshots; emergency-stop hotkey; overlay cursor | `desktopCapturer`, `screen`, `globalShortcut` |
| Settings/creds | `desktop-settings.json` + OS keychain | `safeStorage` (DPAPI) |
| Updates | GitHub provider | `electron-updater` |
| Misc | notifications, clipboard, dialogs, reveal/open, login item, hw-accel toggle relaunch, crash dumps, screen-share handler | `Notification`, `clipboard`, `dialog`, `shell`, `app.setLoginItemSettings`, `crashReporter`, `setDisplayMediaRequestHandler` |

## 2. What Tauri v2 actually buys

Windows targets use the OS-provided WebView2 (Evergreen, preinstalled on Win 10/11 — Chromium-based, so renderer compatibility for the main target is a non-issue). macOS uses WKWebView (Safari engine — needs compat testing), Linux gets webkit2gtk as a system dependency.

Projected: Rust host binary ~8–15 MB + 17 MB web assets → installer ~12–20 MB, unpacked ~35–50 MB. **~6–10× smaller, and Chromium/locales/ffmpeg/DX tooling vanish entirely.** Start-up also drops from Chromium init to near-instant webview reuse.

## 3. Feature-by-feature Tauri mapping

| Electron feature | Tauri v2 equivalent | Effort / risk |
|---|---|---|
| ~22 IPC channels (`jaitDesktop.*`) | `#[tauri::command]` + custom protocol events | Low · mechanical |
| Renderer bridge (`web/src` ≈ 10 consumer files) | Keep `window.jaitDesktop` as a JS shim over `invoke()`/`listen()` → `global.d.ts` unchanged | **Low — key enabler** |
| Terminal engine | `portable-pty`/`wezterm-pty` (Rust) | Medium |
| Provider-CLI orchestration | Rust `tokio::process` + serde; port of ~2.5k lines incl. `remote-codex-config`, `provider-detection`, output parsers | **High — biggest work item** |
| Project search | `std::process` spawn `rg` + Rust fallback walker | Medium |
| `koffi` user32 input | native `windows-rs` `SendInput` (no FFI layer at all) | Medium; **only needed on Windows** (`#[cfg(windows)]`) |
| Screen capture / get-sources / screen share | GDI/DXGI or Windows.Graphics.Capture in Rust; `getDisplayMedia` behaves differently than Electron's auto-approve handler | Medium-High · **real gap** |
| Overlay cursor window | transparent `WebviewWindow` (`transparent: true, always_on_top`) | Low |
| Tray / notifications / global shortcut / clipboard / dialog / opener | `tray-icon`, `tauri-plugin-{notification,global-shortcut,clipboard-manager,dialog,opener}` | Low |
| `safeStorage` (DPAPI) | `keyring` crate or `CryptProtectData` via windows-rs | Low |
| electron-updater (GitHub) | `tauri-plugin-updater` — **new signing keys + reworked `release.yml`** | Low-Medium · release pipeline |
| Login item, `--hidden`, "Open with Jait" file association, single-instance | `tauri-plugin-autostart`, `tauri-plugin-single-instance`, NSIS/MSI association config | Low |
| HW-accel disable + relaunch | `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--disable-gpu` before spawn | Low-Medium |
| `crashReporter` | Sentry/breakpad via plugin; no built-in | Low |
| 6 vitest suites for main-process logic | port to Rust `#[test]` | Medium |

## 4. Cost estimate

- **Full port:** ~4.5k lines of process-centric TS → Rust. Solo: **3–6 weeks** for feature parity + **2–4 weeks** stabilization (provider orchestration regressions are the highest-stakes area — that's the product's core loop).
- **CI:** `release.yml` gains a Rust toolchain, per-OS builds, updater signing keys.
- **Hidden costs:** WKWebView (macOS) QA; WebView2 edge cases; losing the Node ecosystem for host scripting (bun) in the host process.

## 5. Cheaper size wins without migrating (do these regardless)

1. **Stop shipping sourcemaps in the desktop bundle** (41 MB raw; NSIS stores them ~compressed): gate `vite.config.ts` `sourcemap` behind `process.env.JAIT_UPLOAD_MAPS` / build profile, keep maps for dev/gateway. Est. **−15–20 MB** installer.
2. `electron-builder`: pack `dist` + resources into asar, keep only needed Chromium `electronLanguages` (`en-US`) → **−10–15 MB** installer / −40 MB disk.
3. Verify nothing in `release/` artifacts duplicates web dist.

Electron floor after all wins: **~95–105 MB** installer — Chromium itself is irreducible (222 MB unpacked). Max Tauri upside therefore ≈ **10× installed size, ~6× installer**, not 40×.

## 6. Recommended path

1. **Now (hours):** quick wins above; re-measure installer.
2. **Spike (1–2 weeks, timeboxed):** Tauri shell + IPC shim + one PTY session + one provider-CLI spawn + `SendInput` port; package and measure real installer size and latency. Keep Electron branch intact.
3. **Decision gate:** proceed with full port only if the spike confirms ≥5× size reduction and you consider 6–10 weeks of parity work acceptable; otherwise ship Electron quick wins and revisit when desktop distribution scale justifies it.

Keep both shells green during migration by locking the `window.jaitDesktop` contract (`apps/desktop/src/preload.cts` + `apps/web/src/global.d.ts`) as the single seam — it was designed for exactly this.