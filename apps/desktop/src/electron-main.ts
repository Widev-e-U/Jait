/**
 * Jait Desktop — Electron main process
 *
 * Loads the web app (Vite dev server in dev, built HTML in production)
 * inside an Electron BrowserWindow. Shares the exact same UI as @jait/web.
 */

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, shell, Notification, safeStorage, clipboard, dialog, crashReporter, type WebContents } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, statSync, rmSync } from "node:fs";
import electronUpdater, { type UpdateInfo } from "electron-updater";
import { extractDeviceAuthDetails, hasCompleteDeviceAuthDetails } from "@jait/shared";
import { detectDesktopProviders, isSupportedDesktopProviderId, type DesktopProviderStatus, type DesktopRemoteProviderId } from "./provider-detection.js";
import { resolveRemoteCodexThreadConfig } from "./remote-codex-config.js";
import { normalizeBrowserUrl } from "./browser-navigation.js";
const { autoUpdater } = electronUpdater;

// Remove the default application menu (File, Edit, View, etc.)
Menu.setApplicationMenu(null);

// On Windows, toast notifications identify the source app by its
// AppUserModelID. Without an explicit ID Electron derives a default from the
// package name (e.g. "electron.app.jait"), which is what shows up in the
// notification. Set it to the real app id + name so notifications read "Jait".
const JAIT_APP_ID = "dev.jait.desktop";
if (process.platform === "win32") {
  app.setAppUserModelId(JAIT_APP_ID);
}
app.setName("Jait");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Configuration ─────────────────────────────────────────────────────
const GATEWAY_URL = process.env["JAIT_GATEWAY_URL"] ?? "http://localhost:8000";
const DEV_SERVER_URL = process.env["JAIT_WEB_DEV_URL"] ?? "http://localhost:3000";
const IS_DEV = !app.isPackaged;

// ── "Open with Jait" — extract folder path from CLI args ──────────────
// When launched via context menu or CLI: Jait.exe "C:\path\to\folder"
function getOpenedFolderPath(): string | undefined {
  // In packaged app, argv[0] is the exe, argv[1] may be the path.
  // In dev, Electron adds its own args so we skip known flags.
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  for (const arg of args) {
    if (arg.startsWith("--") || arg.startsWith("-")) continue;
    try {
      const resolved = path.resolve(arg);
      if (existsSync(resolved) && statSync(resolved).isDirectory()) {
        return resolved;
      }
    } catch { /* not a valid path */ }
  }
  return undefined;
}

/**
 * Resolve a stable device ID synchronously and persist it.
 *
 * The renderer previously generated a throwaway random device ID on first render
 * (before the async IPC read from desktop-settings.json completed), which got
 * stamped onto newly-created projects as their `nodeId`. That throwaway ID never
 * matched the node the desktop later registered as, so those projects showed
 * "Node offline" forever. Resolving the ID here in the main process and passing
 * it to the renderer via a CLI arg eliminates that race entirely.
 */
function resolvePersistentDeviceId(): string {
  const existing = getSetting<string | null>("deviceId", null);
  if (existing && typeof existing === "string" && existing.trim()) return existing.trim();
  const id = `electron-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  setSetting("deviceId", id);
  return id;
}

let persistentDeviceId = "";

let openedFolder = getOpenedFolderPath();
const startHidden = process.argv.includes("--hidden");

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let splashShownAt = 0;
let tray: Tray | null = null;
const detachedPreviewWindows = new Set<BrowserWindow>();
const SPLASH_MIN_VISIBLE_MS = 1100;

type BrowserNavigationState = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

function getBrowserNavigationState(contents: WebContents): BrowserNavigationState {
  return {
    url: contents.getURL(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    isLoading: contents.isLoading(),
  };
}

function sendBrowserNavigationState(contents: WebContents): void {
  if (contents.isDestroyed()) return;
  contents.send("browser:navigation-state", getBrowserNavigationState(contents));
}

// ── Persistent settings ───────────────────────────────────────────────
const settingsPath = path.join(app.getPath("userData"), "desktop-settings.json");

function loadSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch { return {}; }
}

function saveSettings(settings: Record<string, unknown>): void {
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

function getSetting<T>(key: string, defaultValue: T): T {
  const s = loadSettings();
  return (s[key] as T) ?? defaultValue;
}

function setSetting(key: string, value: unknown): void {
  const s = loadSettings();
  s[key] = value;
  saveSettings(s);
}

// Resolve the persistent device ID now that the settings helpers are available.
// Must run after settingsPath/loadSettings/saveSettings/getSetting/setSetting are defined.
persistentDeviceId = resolvePersistentDeviceId();

// ── Crash diagnostics ─────────────────────────────────────────────────
// The gray-screen recovery below relaunches the whole app after repeated
// renderer crashes. That in-process crash counter resets to zero on every
// relaunch (it's a fresh process), so if the actual cause isn't the
// GPU/hw-accel fault it assumes, the app can relaunch forever — the whole
// window silently flashing shut and reopening with no visible error and no
// record of what's actually failing. Persist relaunch timestamps across
// restarts so a real crash loop can be detected and broken instead of
// looping indefinitely, and log crash details to disk so the cause (e.g.
// `oom` vs a one-off `crashed`) is inspectable after the fact.
const crashLogPath = path.join(app.getPath("userData"), "crash-log.txt");
const CRASH_LOOP_WINDOW_MS = 10 * 60 * 1000;
const CRASH_LOOP_RELAUNCH_LIMIT = 3;

// `render-process-gone` gives us a reason and an exit code, which is enough to
// tell an OOM apart from a hard fault but not enough to say *what* faulted —
// leaving a reproducible crash with no stack to work from. Starting Crashpad
// makes Electron write a local minidump per crashed process, so the faulting
// module is recoverable after the fact. `uploadToServer: false` keeps every
// dump on this machine: there is no crash-collection endpoint to send them to,
// and dumps can contain fragments of whatever was in memory (prompts, tokens),
// so they must never leave the device implicitly.
crashReporter.start({ productName: "Jait", companyName: "Jait", uploadToServer: false });
const crashDumpDir = app.getPath("crashDumps");

function logCrashEvent(line: string): void {
  try {
    mkdirSync(path.dirname(crashLogPath), { recursive: true });
    appendFileSync(crashLogPath, `${new Date().toISOString()} ${line}\n`, "utf-8");
  } catch { /* best-effort */ }
}

/** Records a relaunch and returns true once relaunches are looping rather than recovering. */
function recordRelaunchAndDetectLoop(): boolean {
  const now = Date.now();
  const recent = getSetting<number[]>("relaunchTimestamps", []).filter((t) => now - t < CRASH_LOOP_WINDOW_MS);
  recent.push(now);
  setSetting("relaunchTimestamps", recent);
  // `>=`, not `>`: each relaunch already costs the user three renderer crashes,
  // so tripping on the 4th means ~12 crashes of silent window-flashing before
  // anything is surfaced. Stopping on the 3rd also makes the behaviour match
  // what the dialog claims ("relaunched 3+ times").
  return recent.length >= CRASH_LOOP_RELAUNCH_LIMIT;
}

// ── Hardware acceleration recovery ─────────────────────────────────────
// A previous renderer/GPU crash loop persists `disableHwAccel` so the next
// launch survives. disableHardwareAcceleration() must be called BEFORE the
// app is ready (before any window is created), so we read the flag here.
if (getSetting<boolean>("disableHwAccel", false)) {
  app.disableHardwareAcceleration();
  console.warn("[electron] hardware acceleration disabled (persisted crash-recovery flag)");
}

/** Whether the app should quit on window close vs minimize to tray. Default: false (minimize to tray). */
function shouldQuitOnClose(): boolean {
  return getSetting("closeOnWindowClose", false);
}

let isQuitting = false;

// ── Native launch splash ─────────────────────────────────────────────
function getSplashHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #09090b;
        color: #fff;
        -webkit-app-region: drag;
      }

      body {
        display: grid;
        place-items: center;
      }

      .splash {
        position: relative;
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
      }

      .glow {
        position: absolute;
        width: 8.75rem;
        height: 8.75rem;
        border-radius: 9999px;
        background: radial-gradient(circle, rgba(96, 165, 250, 0.22), rgba(96, 165, 250, 0));
        animation: glow 2.4s ease-in-out infinite;
      }

      svg {
        position: relative;
        width: 11rem;
        height: 11rem;
        filter: drop-shadow(0 24px 32px rgba(0, 0, 0, 0.36));
      }

      .part {
        transform-box: fill-box;
        transform-origin: center;
        animation-duration: 920ms;
        animation-fill-mode: forwards;
        animation-timing-function: cubic-bezier(0.18, 0.92, 0.26, 1.18);
      }

      .chevron {
        animation-name: fly-chevron;
      }

      .stem {
        animation-name: fly-stem;
      }

      body.closing {
        animation: close 220ms ease forwards;
      }

      @keyframes fly-chevron {
        0% {
          opacity: 0;
          transform: translate(-92vw, 36vh) rotate(-18deg) scale(0.84);
        }
        68% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translate(0, 0) rotate(0) scale(1);
        }
      }

      @keyframes fly-stem {
        0% {
          opacity: 0;
          transform: translate(88vw, -38vh) rotate(14deg) scale(0.84);
        }
        68% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: translate(0, 0) rotate(0) scale(1);
        }
      }

      @keyframes glow {
        0%,
        100% {
          opacity: 0.64;
          transform: scale(0.94);
        }
        50% {
          opacity: 1;
          transform: scale(1.08);
        }
      }

      @keyframes close {
        to {
          opacity: 0;
          transform: scale(0.98);
        }
      }
    </style>
  </head>
  <body>
    <div class="splash" aria-label="Loading Jait">
      <div class="glow"></div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" aria-hidden="true">
        <g class="part chevron">
          <path
            d="M318 372 L430 486 L318 600"
            fill="none"
            stroke="currentColor"
            stroke-width="88"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
        <g class="part stem">
          <path
            d="M610 258 L610 642 C610 734 549 796 455 796 C393 796 338 766 299 715"
            fill="none"
            stroke="currentColor"
            stroke-width="88"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
      </svg>
    </div>
  </body>
</html>`;
}

function createSplashWindow(): BrowserWindow | null {
  if (startHidden) return null;

  splashShownAt = Date.now();
  const win = new BrowserWindow({
    width: 360,
    height: 360,
    resizable: false,
    maximizable: false,
    minimizable: false,
    frame: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#09090b",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on("closed", () => {
    if (splashWindow === win) splashWindow = null;
  });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getSplashHtml())}`);
  return win;
}

async function closeSplashWindowAfterMinimum(): Promise<void> {
  const win = splashWindow;
  if (!win || win.isDestroyed()) return;

  const elapsed = Date.now() - splashShownAt;
  const remaining = Math.max(0, SPLASH_MIN_VISIBLE_MS - elapsed);
  await new Promise((resolve) => setTimeout(resolve, remaining));
  if (win.isDestroyed()) return;

  try {
    await win.webContents.executeJavaScript("document.body.classList.add('closing')", true);
    await new Promise((resolve) => setTimeout(resolve, 220));
  } catch {
    // If the splash document is already gone, just close the window.
  }

  if (!win.isDestroyed()) win.close();
}

async function showMainWindowWhenReady(win: BrowserWindow): Promise<void> {
  if (startHidden || win.isDestroyed()) return;
  win.maximize();
  await closeSplashWindowAfterMinimum();
  if (win.isDestroyed()) return;
  win.show();
  win.focus();
  if (IS_DEV) win.webContents.openDevTools({ mode: "bottom" });
}

// ── Single instance lock ──────────────────────────────────────────────
// Ensures only one Jait window is open. Second launches pass their argv
// to the already-running instance (for "Open with Jait" support).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    // Extract folder path from the second instance's argv
    const args = argv.slice(1);
    for (const arg of args) {
      if (arg.startsWith("--") || arg.startsWith("-")) continue;
      try {
        const resolved = path.resolve(arg);
        if (existsSync(resolved) && statSync(resolved).isDirectory()) {
          openedFolder = resolved;
          // Tell the renderer to open this folder as a project
          mainWindow?.webContents.send("desktop:open-folder", resolved);
          break;
        }
      } catch { /* not a valid path */ }
    }
    // Focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── Window creation ───────────────────────────────────────────────────
function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: "Jait",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // The desktop keeps acting as a reachable node (filesystem/provider)
      // while hidden to the tray. Prevent Chromium from throttling timers /
      // WebSocket keepalives when the window is hidden.
      backgroundThrottling: false,
      additionalArguments: [
        `--gateway-url=${GATEWAY_URL}`,
        `--jait-app-url=${IS_DEV ? DEV_SERVER_URL : "file:"}`,
        ...(persistentDeviceId ? [`--device-id=${persistentDeviceId}`] : []),
        ...(openedFolder ? [`--open-folder=${openedFolder}`] : []),
      ],
    },
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    ...(isMac ? {} : { frame: false }),
    ...(isWindows
      ? {
          titleBarOverlay: {
            height: 39,
            color: "#202020",
            symbolColor: "#f2f2f2",
          },
        }
      : {}),
    backgroundColor: "#202020",
    show: false,
  });

  // Graceful show once ready — start maximized (or hidden for auto-start)
  win.once("ready-to-show", () => {
    void showMainWindowWhenReady(win);
  });

  // Intercept close to minimize to tray (unless setting says quit)
  win.on("close", (e) => {
    if (!isQuitting && !shouldQuitOnClose()) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  // Notify renderer when maximize state changes (for window control icons)
  win.on("maximize", () => win.webContents.send("window:maximized-change", true));
  win.on("unmaximize", () => win.webContents.send("window:maximized-change", false));

  // Open external URLs (http/https) in the system default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Prevent default drag-and-drop navigation.  Without this Electron
  // navigates the window to the dropped file's path instead of letting
  // the renderer's drop handler process it.
  win.webContents.on("will-navigate", (event, url) => {
    // Keep HTTP(S) navigation inside the window. The preload script adds
    // desktop browser controls whenever navigation leaves the Jait app.
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return;
    event.preventDefault();
  });

  win.webContents.on("did-navigate", () => sendBrowserNavigationState(win.webContents));
  win.webContents.on("did-navigate-in-page", () => sendBrowserNavigationState(win.webContents));
  win.webContents.on("did-start-loading", () => sendBrowserNavigationState(win.webContents));
  win.webContents.on("did-stop-loading", () => sendBrowserNavigationState(win.webContents));

  // ── Gray-screen recovery ──────────────────────────────────────────────
  // The most common cause of a "gray screen of death" in Electron is the
  // renderer process crashing (OOM, native module fault) or the GPU process
  // dying — the BrowserWindow keeps its solid backgroundColor (#202020, a
  // dark gray) but paints nothing. We detect those events here and recover
  // by reloading the page; if the renderer keeps crashing we relaunch the
  // whole app with hardware acceleration disabled (a frequent culprit on
  // certain GPU/driver combos).
  let renderCrashCount = 0;
  let renderCrashResetTimer: ReturnType<typeof setTimeout> | undefined;

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[electron] render-process-gone: ${details.reason} (exitCode=${details.exitCode})`);
    logCrashEvent(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
    if (win.isDestroyed()) return;

    renderCrashCount += 1;
    clearTimeout(renderCrashResetTimer);
    renderCrashResetTimer = setTimeout(() => { renderCrashCount = 0; }, 60_000);

    // After repeated crashes, assume a GPU/hardware-acceleration fault and
    // relaunch the app with the GPU disabled so the next session survives.
    if (renderCrashCount >= 3) {
      if (recordRelaunchAndDetectLoop()) {
        // Already relaunched repeatedly in the last 10 minutes and it's still
        // crashing — the hw-accel fix isn't the actual cause here. Relaunching
        // again would just flash the whole window shut and reopen forever
        // with nothing visible to the user. Stop and surface it instead.
        logCrashEvent(`crash loop detected — halting automatic relaunch (dumps: ${crashDumpDir})`);
        dialog.showErrorBox(
          "Jait keeps crashing",
          `Jait's window has crashed and relaunched ${CRASH_LOOP_RELAUNCH_LIMIT}+ times in the last 10 minutes ` +
          `(most recently: ${details.reason}). Automatic recovery has been paused so it stops flashing.\n\n` +
          `Crash details were saved to:\n${crashLogPath}\n\n` +
          `Crash dumps (these identify the faulting code) are in:\n${crashDumpDir}\n\n` +
          `Please share both, then quit and reopen Jait manually.`,
        );
        return;
      }
      console.error("[electron] renderer crashed repeatedly — relaunching with hardware acceleration disabled");
      setSetting("disableHwAccel", true);
      isQuitting = true;
      app.relaunch();
      app.quit();
      return;
    }

    // Single/occasional crash: just reload the app content.
    void loadApp(win);
  });

  // If the renderer hangs (infinite sync loop / deadlock), reload it after
  // a short grace period so the user isn't stuck on a frozen gray window.
  let unresponsiveTimer: ReturnType<typeof setTimeout> | undefined;
  win.on("unresponsive", () => {
    console.error("[electron] window unresponsive — will reload in 8s if still hung");
    clearTimeout(unresponsiveTimer);
    unresponsiveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      if (!win.webContents.isCrashed()) return;
      console.error("[electron] window still unresponsive — reloading");
      void loadApp(win);
    }, 8000);
  });
  win.on("responsive", () => clearTimeout(unresponsiveTimer));

  return win;
}

function createDetachedPreviewWindow(url: string, title?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 640,
    minHeight: 480,
    title: title?.trim() || "Jait Preview",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    backgroundColor: "#202020",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  win.on("closed", () => {
    detachedPreviewWindows.delete(win);
  });

  win.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    if (nextUrl.startsWith("http://") || nextUrl.startsWith("https://")) {
      shell.openExternal(nextUrl);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  detachedPreviewWindows.add(win);
  void win.loadURL(url);
  return win;
}

// ── Load the web app ──────────────────────────────────────────────────
async function loadApp(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return;
  if (IS_DEV) {
    // In development, load from Vite dev server
    try {
      await win.loadURL(DEV_SERVER_URL);
      console.log(`Loaded dev server: ${DEV_SERVER_URL}`);
    } catch {
      if (win.isDestroyed()) return;
      // Fallback: show a helpful message if dev server isn't running
      win.loadURL(
        `data:text/html,<html><body style="background:#09090b;color:#fafafa;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
          `<div style="text-align:center"><h1>Jait</h1><p>Waiting for dev server at ${DEV_SERVER_URL}</p>` +
          `<p style="color:#a1a1aa">Run <code>bun run dev</code> in apps/web first.</p></div></body></html>`,
      );
    }
  } else {
    // In production, load the built web app from extraResources
    const indexPath = path.join(process.resourcesPath, "web", "index.html");
    await win.loadFile(indexPath);
  }
}

// ── Tray icon ─────────────────────────────────────────────────────────
function createTray(): void {
  const iconPath = path.join(__dirname, "..", "assets", "tray-icon.png");
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    // Fallback: empty 16x16 icon
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Jait Desktop");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show Jait", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: "separator" },
    {
      label: "Screen Share",
      submenu: [
        { label: "Start Sharing", click: () => mainWindow?.webContents.send("screen-share:start") },
        { label: "Stop Sharing", click: () => mainWindow?.webContents.send("screen-share:stop") },
      ],
    },
    { type: "separator" },
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
  tray.on("double-click", () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── IPC handlers ──────────────────────────────────────────────────────

// ── Window control IPC (for custom titlebar) ──────────────────────────
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle("window:close", () => mainWindow?.close());

function getMainWindowContents(sender: WebContents): WebContents | null {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed() || contents.id !== sender.id) return null;
  return contents;
}

ipcMain.handle("browser:get-navigation-state", (event) => {
  const contents = getMainWindowContents(event.sender);
  return contents ? getBrowserNavigationState(contents) : null;
});
ipcMain.handle("browser:back", (event) => {
  const contents = getMainWindowContents(event.sender);
  if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
});
ipcMain.handle("browser:forward", (event) => {
  const contents = getMainWindowContents(event.sender);
  if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
});
ipcMain.handle("browser:reload", (event) => {
  const contents = getMainWindowContents(event.sender);
  if (!contents) return;
  if (contents.isLoading()) contents.stop();
  else contents.reload();
});
ipcMain.handle("browser:navigate", async (event, value: string) => {
  const contents = getMainWindowContents(event.sender);
  const url = normalizeBrowserUrl(value);
  if (!contents || !url) return { ok: false };
  await contents.loadURL(url);
  return { ok: true };
});

// ── Clipboard IPC ────────────────────────────────────────────────────
ipcMain.handle("clipboard:read-text", () => clipboard.readText());

// ── Desktop settings IPC ──────────────────────────────────────────────
ipcMain.handle("desktop:get-setting", (_event, key: string, defaultValue?: unknown) => {
  return getSetting(key, defaultValue ?? null);
});
ipcMain.handle("desktop:set-setting", (_event, key: string, value: unknown) => {
  setSetting(key, value);
  return { ok: true };
});

// Allow the renderer (Settings) to clear the persisted hardware-acceleration
// disable flag so the next launch re-enables GPU rendering normally.
ipcMain.handle("desktop:reset-hw-accel", () => {
  setSetting("disableHwAccel", false);
  return { ok: true, disabled: false };
});
ipcMain.handle("desktop:get-hw-accel", () => ({ disabled: getSetting<boolean>("disableHwAccel", false) }));

// ── Auto-launch on PC startup (OS login item) ──────────────────────────
// Toggles whether Jait launches when the user logs into the OS.
//
// The "Start Jait on login" choice is also offered by the NSIS installer, which
// writes the HKCU\...\Run key directly. Electron's getLoginItemSettings() only
// reports openAtLogin=true when the registry value's executable path AND
// command-line args match what's passed in — so we pass { args: ["--hidden"] }
// (the app always launches hidden on autostart). We additionally OR-in
// `executableWillLaunchAtLogin` (true if our exe is set to launch with ANY
// args, which catches the installer-written key) and the persisted
// `launchAtLogin` setting, so the Settings toggle reflects the install-time
// selection even when the native detection is stale.
const AUTO_START_ARGS = ["--hidden"];

ipcMain.handle("desktop:get-login-item", () => {
  try {
    const status = app.getLoginItemSettings({ args: AUTO_START_ARGS });
    const nativeEnabled = Boolean(status.openAtLogin);
    // executableWillLaunchAtLogin ignores args — true if our exe is registered
    // to launch on login with any arguments (e.g. the installer's Run key).
    const willLaunch = Boolean((status as Electron.LoginItemSettings).executableWillLaunchAtLogin);
    const persisted = getSetting<boolean | null>("launchAtLogin", null);
    const enabled = nativeEnabled || willLaunch || persisted === true;
    return { enabled, supported: true };
  } catch {
    return { enabled: false, supported: false };
  }
});
ipcMain.handle("desktop:set-login-item", (_event, enabled: boolean) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // On Windows, start minimized to tray so it doesn't steal focus on boot.
      args: AUTO_START_ARGS,
    });
    // Persist the intent so we can reflect it even if the OS reports stale state.
    setSetting("launchAtLogin", enabled);
    return { ok: true, enabled };
  } catch (err) {
    return { ok: false, enabled: false, error: String(err) };
  }
});

// ── Credential store IPC (OS keychain via safeStorage) ────────────────
const credentialPath = path.join(app.getPath("userData"), "credentials.enc");

ipcMain.handle("credential:store", (_event, key: string, value: string) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: "encryption-unavailable" };
    }
    let creds: Record<string, string> = {};
    try {
      const raw = readFileSync(credentialPath);
      creds = JSON.parse(safeStorage.decryptString(raw));
    } catch { /* no existing file or corrupted — start fresh */ }
    creds[key] = value;
    const encrypted = safeStorage.encryptString(JSON.stringify(creds));
    mkdirSync(path.dirname(credentialPath), { recursive: true });
    writeFileSync(credentialPath, encrypted);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("credential:get", (_event, key: string) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { value: null };
    const raw = readFileSync(credentialPath);
    const creds = JSON.parse(safeStorage.decryptString(raw)) as Record<string, string>;
    return { value: creds[key] ?? null };
  } catch {
    return { value: null };
  }
});

ipcMain.handle("credential:clear", (_event, key: string) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { ok: true };
    let creds: Record<string, string> = {};
    try {
      const raw = readFileSync(credentialPath);
      creds = JSON.parse(safeStorage.decryptString(raw));
    } catch { return { ok: true }; }
    delete creds[key];
    const encrypted = safeStorage.encryptString(JSON.stringify(creds));
    writeFileSync(credentialPath, encrypted);
    return { ok: true };
  } catch {
    return { ok: true };
  }
});
ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
ipcMain.handle("window:set-title-bar-overlay", (_event, opts: { color?: string; symbolColor?: string; height?: number }) => {
  mainWindow?.setTitleBarOverlay(opts);
});
ipcMain.handle("desktop:open-preview-window", (_event, opts: { url?: string; title?: string }) => {
  const url = opts?.url?.trim();
  if (!url) return { ok: false };
  createDetachedPreviewWindow(url, opts.title);
  return { ok: true };
});

// Expose device info to the renderer
ipcMain.handle("desktop:get-info", () => ({
  platform: process.platform as "win32" | "darwin" | "linux",
  arch: process.arch,
  electronVersion: process.versions.electron,
  appVersion: app.getVersion(),
  gatewayUrl: GATEWAY_URL,
  isPackaged: app.isPackaged,
}));

// Screen sharing: get desktop sources for getDisplayMedia
ipcMain.handle("desktop:get-sources", async () => {
  const { desktopCapturer } = await import("electron");
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon?.toDataURL() ?? null,
  }));
});

// Notification passthrough
const notificationIcon = (() => {
  try {
    const iconPath = path.join(__dirname, "..", "assets", "icon-1024.png");
    if (existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  } catch { /* ignore */ }
  return undefined;
})();

ipcMain.handle("desktop:notify", (_event, opts: { title: string; body: string }) => {
  const notification = new Notification({
    title: opts.title,
    body: opts.body,
    ...(notificationIcon && !notificationIcon.isEmpty() ? { icon: notificationIcon } : {}),
  });
  notification.show();
  return { ok: true };
});

// Screen share approval dialog — shows a native message box with Accept/Decline
ipcMain.handle(
  "desktop:confirm-share",
  async (_event, opts: { title: string; message: string }) => {
    const { dialog } = await import("electron");
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
    const msgOpts: Electron.MessageBoxOptions = {
      type: "question",
      title: opts.title,
      message: opts.message,
      buttons: ["Share Screen", "Decline"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const result = win
      ? await dialog.showMessageBox(win, msgOpts)
      : await dialog.showMessageBox(msgOpts);
    // response 0 = "Share Screen" (accepted), 1 = "Decline"
    return { accepted: result.response === 0 };
  },
);

// Directory picker — opens native OS folder dialog and returns the absolute path
ipcMain.handle("desktop:pick-directory", async () => {
  const { dialog } = await import("electron");
  const win = mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
  const opts: Electron.OpenDialogOptions = {
    properties: ["openDirectory"],
    title: "Open Project Directory",
  };
  const result = win
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return null;
  return { path: result.filePaths[0] };
});

// ── Filesystem browse IPC (for remote fs node protocol) ──────────────
import { readdir, readFile, writeFile, stat as fsStat, mkdir, access } from "node:fs/promises";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

// ── Provider detection ───────────────────────────────────────────────
function detectCliProviders(): DesktopProviderStatus[] {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  return detectDesktopProviders(
    (binary) => {
      try {
        execSync(`${lookupCommand} ${binary}`, { stdio: "pipe", timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    },
    (binary, args) => {
      try {
        execSync([binary, ...args].join(" "), { stdio: "pipe", timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    },
  );
}

ipcMain.handle("desktop:detect-providers", () => detectCliProviders());

const remoteProviderLoginProcesses = new Map<string, ChildProcess>();

function remoteProviderAccountEnv(providerId: string, providerType: DesktopRemoteProviderId): Record<string, string> {
  const accountHome = path.join(app.getPath("userData"), "provider-accounts", providerId);
  mkdirSync(accountHome, { recursive: true, mode: 0o700 });
  return {
    ...process.env,
    HOME: accountHome,
    USERPROFILE: accountHome,
    XDG_CONFIG_HOME: path.join(accountHome, ".config"),
    XDG_DATA_HOME: path.join(accountHome, ".local", "share"),
    XDG_CACHE_HOME: path.join(accountHome, ".cache"),
    ...(providerType === "codex" ? { CODEX_HOME: accountHome, OPENAI_API_KEY: "" } : {}),
    ...(providerType === "claude-code" ? { CLAUDE_CONFIG_DIR: path.join(accountHome, ".claude"), ANTHROPIC_API_KEY: "" } : {}),
  } as Record<string, string>;
}

function remoteProviderCommand(providerType: DesktopRemoteProviderId): string {
  return providerType === "claude-code" ? "claude" : "codex";
}

function remoteProviderAuthArgs(providerType: DesktopRemoteProviderId): string[] {
  return providerType === "claude-code" ? ["auth", "status"] : ["login", "status"];
}

function remoteProviderLoginArgs(providerType: DesktopRemoteProviderId): string[] {
  return providerType === "claude-code" ? ["auth", "login"] : ["login", "--device-auth"];
}

function remoteProviderLogoutArgs(providerType: DesktopRemoteProviderId): string[] {
  return providerType === "claude-code" ? ["auth", "logout"] : ["logout"];
}


// ── Remote provider runner ───────────────────────────────────────────
// Manages codex/claude-code child processes on behalf of the gateway.
// Each session spawns a child process and streams JSON-RPC events back.

interface RemoteProviderSession {
  child: ChildProcess | null;
  pendingRpc: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;
  pendingTurn?: { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
  nextRpcId: number;
  sessionId: string;
  providerId: DesktopRemoteProviderId;
  kind: "rpc" | "claude-print";
  workingDirectory: string;
  mode: string;
  model: string | null;
  env: Record<string, string>;
  mcpServers?: DesktopMcpServerRef[];
  mcpConfigPath?: string;
  stopRequested: boolean;
  pendingToolCalls: DesktopClaudePendingToolCall[];
  /** Captured stderr from the child process, for surfacing real errors on EPIPE. */
  stderrBuffer?: string;
}

function appendProviderStderr(error: Error, session: Pick<RemoteProviderSession, "stderrBuffer">): Error {
  const stderrTail = session.stderrBuffer?.trim().slice(-800);
  if (!stderrTail || error.message.includes("provider stderr:")) return error;
  return new Error(`${error.message} — provider stderr:\n${stderrTail}`);
}

interface DesktopClaudePendingToolCall {
  callId: string;
  rawTool: string;
  normalizedTool: string;
  args: Record<string, unknown>;
  providerCallId?: string;
}

const remoteProviderSessions = new Map<string, RemoteProviderSession>();

interface DesktopPty {
  pid: number;
  onData(cb: (data: string) => void): void;
  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

function loadNodePty() {
  return require("node-pty") as {
    spawn: (shell: string, args: string[], options: {
      name: string;
      cols: number;
      rows: number;
      cwd: string;
      env: Record<string, string | undefined>;
      useConpty?: boolean;
    }) => DesktopPty;
  };
}

interface RemoteTerminalSession {
  terminalId: string;
  pty: DesktopPty;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
}

const remoteTerminalSessions = new Map<string, RemoteTerminalSession>();

interface DesktopMcpServerRef {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

function getDesktopJaitMcpServers(servers?: DesktopMcpServerRef[]): DesktopMcpServerRef[] {
  if (servers?.length) return servers;
  return [{
    name: "jait",
    transport: "http",
    url: new URL("/mcp", `${GATEWAY_URL.replace(/\/+$/, "")}/`).toString(),
  }];
}

function buildDesktopCodexMcpArgs(servers?: DesktopMcpServerRef[]): string[] {
  if (!servers?.length) return [];

  const args: string[] = [];
  for (const server of servers) {
    const prefix = `mcp_servers.${server.name}`;
    if ((server.transport === "http" || server.transport === "sse") && server.url) {
      args.push("-c", `${prefix}.url=${JSON.stringify(server.url)}`);
      continue;
    }
    if (server.transport === "stdio" && server.command) {
      args.push("-c", `${prefix}.command=${JSON.stringify(server.command)}`);
      args.push("-c", `${prefix}.args=[${(server.args ?? []).map((arg) => JSON.stringify(arg)).join(", ")}]`);
      for (const [key, value] of Object.entries(server.env ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        args.push("-c", `${prefix}.env.${key}=${JSON.stringify(value)}`);
      }
    }
  }
  return args;
}

function buildDesktopClaudeMcpConfig(sessionId: string, servers?: DesktopMcpServerRef[]): string | undefined {
  if (!servers?.length) return undefined;
  const config = { mcpServers: {} as Record<string, unknown> };

  for (const server of servers) {
    if ((server.transport === "http" || server.transport === "sse") && server.url) {
      config.mcpServers[server.name] = { url: server.url };
      continue;
    }
    if (server.transport === "stdio" && server.command) {
      config.mcpServers[server.name] = {
        command: server.command,
        args: server.args ?? [],
        env: server.env ?? {},
      };
    }
  }

  const configDir = path.join(app.getPath("temp"), "jait-desktop-mcp", sessionId);
  mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, "mcp-config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  return configPath;
}

function rpcSend(session: RemoteProviderSession, method: string, params?: unknown, timeoutMs = 60_000): Promise<unknown> {
  if (!session.child?.stdin?.writable) {
    return Promise.reject(new Error(`Remote provider session ${session.sessionId} is not connected`));
  }
  const child = session.child;
  const id = session.nextRpcId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pendingRpc.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    session.pendingRpc.set(id, { resolve, reject, timer });
    const msg = JSON.stringify({ method, id, params }) + "\n";
    try {
      child.stdin?.write(msg, (err) => {
        if (err) {
          session.pendingRpc.delete(id);
          clearTimeout(timer);
          reject(appendProviderStderr(new Error(`Write error: ${err.message} (${method})`), session));
        }
      });
    } catch (e) {
      session.pendingRpc.delete(id);
      clearTimeout(timer);
      const error = e instanceof Error ? e : new Error(String(e));
      reject(appendProviderStderr(error, session));
    }
  });
}

function rpcNotify(session: RemoteProviderSession, method: string, params?: unknown) {
  if (!session.child?.stdin?.writable) return;
  const msg = JSON.stringify({ method, params }) + "\n";
  try {
    session.child.stdin?.write(msg, () => {/* ignore EPIPE on fire-and-forget */});
  } catch {
    /* child already gone — ignore */
  }
}

function sendProviderEvent(sessionId: string, notification: unknown) {
  mainWindow?.webContents.send("gateway:event", {
    type: "provider.event-from-child",
    sessionId,
    notification,
  });
}

function sendTerminalOutputEvent(terminalId: string, data: string) {
  mainWindow?.webContents.send("gateway:event", {
    type: "terminal.output-from-child",
    terminalId,
    data,
  });
}

function sendTerminalExitEvent(terminalId: string, exitCode: number | null, signal: number | string | null) {
  mainWindow?.webContents.send("gateway:event", {
    type: "terminal.exit-from-child",
    terminalId,
    exitCode,
    signal,
  });
}

/**
 * Kill a provider child process that was spawned with `shell: true`.
 *
 * On POSIX, `sh -c '<single command>'` execs directly into that command,
 * so `child.pid` already is the real process and a normal signal reaches it.
 * On Windows there's no such exec optimization: `child.pid` is cmd.exe's
 * PID, which merely launched the real provider binary as a child console
 * process. Sending it a signal (which Node maps to TerminateProcess) only
 * tears down cmd.exe, leaving the actual claude/codex process running and
 * unstoppable from here. `taskkill /t` kills the whole process tree instead.
 */
function killProcessTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    return;
  }
  child.kill("SIGTERM");
}

function stopRemoteProviderSession(sessionId: string): boolean {
  const session = remoteProviderSessions.get(sessionId);
  if (!session) return false;

  session.stopRequested = true;
  if (session.child) killProcessTree(session.child);
  for (const pending of session.pendingRpc.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Session stopped"));
  }
  session.pendingRpc.clear();
  settleRemoteTurn(session, new Error("Session stopped"));
  remoteProviderSessions.delete(sessionId);
  return true;
}

function defaultRemoteTerminalShell(): string {
  if (process.platform === "win32") {
    try {
      execSync("pwsh.exe -v", { stdio: "ignore", timeout: 3000, windowsHide: true });
      return "pwsh.exe";
    } catch {
      return "powershell.exe";
    }
  }
  return process.env["SHELL"] || "/bin/bash";
}

function shouldUseRequestedShell(shell: string | undefined): shell is string {
  if (!shell?.trim()) return false;
  if (process.platform === "win32") return !shell.startsWith("/");
  return !/^[A-Za-z]:[\\/]/.test(shell) && !/\.exe$/i.test(shell);
}

function remoteTerminalShellArgs(shell: string): string[] {
  const name = path.basename(shell).toLowerCase().replace(/\.exe$/, "");
  if (name === "pwsh" || name === "powershell") return ["-NoLogo", "-NoExit"];
  if (name === "cmd") return [];
  return ["-i"];
}

function remoteTurnError(notification: { method?: unknown; params?: unknown }): string | null {
  const method = typeof notification.method === "string" ? notification.method : "";
  const params = notification.params && typeof notification.params === "object"
    ? notification.params as Record<string, unknown>
    : {};
  if (method === "error") {
    const error = params.error && typeof params.error === "object" ? params.error as Record<string, unknown> : undefined;
    return typeof error?.message === "string" ? error.message : "Remote provider error";
  }
  if (method === "turn/completed") {
    const turn = params.turn && typeof params.turn === "object" ? params.turn as Record<string, unknown> : undefined;
    const status = typeof turn?.status === "string" ? turn.status : "";
    const error = turn?.error && typeof turn.error === "object" ? turn.error as Record<string, unknown> : undefined;
    if (status === "failed") return typeof error?.message === "string" ? error.message : "Remote provider turn failed";
  }
  return null;
}

function settleRemoteTurn(session: RemoteProviderSession, error?: Error): void {
  const pending = session.pendingTurn;
  if (!pending) return;
  session.pendingTurn = undefined;
  clearTimeout(pending.timer);
  if (error) pending.reject(error);
  else pending.resolve();
}

function waitForRemoteTurn(session: RemoteProviderSession, timeoutMs = 30 * 60 * 1000): Promise<void> {
  if (session.pendingTurn) return Promise.reject(new Error("A provider turn is already running"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pendingTurn = undefined;
      reject(new Error("Timed out waiting for remote provider turn completion"));
    }, timeoutMs);
    session.pendingTurn = { resolve, reject, timer };
  });
}

/** Offline fallback only — live discovery via discoverClaudeModelOptions() is preferred. */
function getClaudeModelOptions() {
  return [
    { id: "default", name: "Default", description: "Claude Code default model selection", isDefault: true },
    { id: "fable", name: "Fable", description: "Claude Fable alias for the top-tier Mythos-class model" },
    { id: "sonnet", name: "Sonnet", description: "Claude Sonnet alias for day-to-day coding" },
    { id: "opus", name: "Opus", description: "Claude Opus alias for the most capable model" },
    { id: "haiku", name: "Haiku", description: "Claude Haiku alias for faster lightweight tasks" },
    { id: "opusplan", name: "Opus Plan", description: "Planning-focused Claude alias" },
  ];
}

const CLAUDE_MODEL_DISCOVERY_TIMEOUT_MS = 30_000;
const CLAUDE_MODEL_CACHE_TTL_MS = 5 * 60_000;
let claudeModelCache: { models: Array<Record<string, unknown>>; fetchedAt: number } | null = null;

/**
 * Ask the local Claude Code CLI which models it supports, live. The stream-json
 * control protocol's `initialize` response carries the same model list the CLI
 * shows in its /model picker (including new models like Fable), so the picker
 * never goes stale the way a hardcoded list does. Falls back to the static
 * aliases only when the CLI cannot be spawned or does not answer in time.
 */
async function discoverClaudeModelOptions(env: NodeJS.ProcessEnv): Promise<Array<Record<string, unknown>>> {
  if (claudeModelCache && Date.now() - claudeModelCache.fetchedAt < CLAUDE_MODEL_CACHE_TTL_MS) {
    return claudeModelCache.models;
  }

  const models = await new Promise<Array<Record<string, unknown>>>((resolve) => {
    const child = spawn("claude", [
      "--print",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
    ], { cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"], shell: true });

    let settled = false;
    const settle = (result: Array<Record<string, unknown>>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killProcessTree(child);
      resolve(result);
    };
    const timer = setTimeout(() => settle([]), CLAUDE_MODEL_DISCOVERY_TIMEOUT_MS);

    child.on("error", () => settle([]));
    child.on("exit", () => settle([]));
    child.stdin?.on("error", () => {/* ignore broken pipe */});

    const requestId = `list-models-${Date.now()}`;
    child.stdin?.write(JSON.stringify({
      type: "control_request",
      request_id: requestId,
      request: { subtype: "initialize" },
    }) + "\n");

    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.type !== "control_response") return;
      const response = msg.response as Record<string, unknown> | undefined;
      if (response?.request_id !== requestId) return;
      const payload = response.response as Record<string, unknown> | undefined;
      const rawModels = Array.isArray(payload?.models) ? payload.models as Array<Record<string, unknown>> : [];
      settle(rawModels.flatMap((m) => {
        const id = typeof m.value === "string" && m.value ? m.value : null;
        if (!id) return [];
        return [{
          id,
          name: typeof m.displayName === "string" && m.displayName ? m.displayName : id,
          ...(typeof m.description === "string" && m.description ? { description: m.description } : {}),
          ...(id === "default" ? { isDefault: true } : {}),
          ...(typeof m.supportsEffort === "boolean" ? { reasoningEffortSupported: m.supportsEffort } : {}),
        }];
      }));
    });
  });

  if (models.length === 0) return getClaudeModelOptions();
  claudeModelCache = { models, fetchedAt: Date.now() };
  return models;
}

function mapClaudeStreamEvent(session: RemoteProviderSession, event: Record<string, unknown>) {
  const sessionId = session.sessionId;
  const type = typeof event.type === "string" ? event.type : "";
  switch (type) {
    // `claude --output-format stream-json` never emits top-level "tool_use" /
    // "tool_result" / "content_block_delta" events — those only ever appear
    // nested inside "assistant" message content blocks (tool_use) and "user"
    // message content blocks (tool_result). Unwrap them here instead.
    case "assistant": {
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (typeof content === "string" && content) {
        return [{ type: "token", sessionId, content }];
      }
      if (Array.isArray(content)) {
        const mapped: Record<string, unknown>[] = [];
        for (const rawBlock of content) {
          const block = rawBlock as Record<string, unknown>;
          if (block?.type === "text" && typeof block.text === "string") {
            mapped.push({ type: "token", sessionId, content: block.text });
          } else if (block?.type === "tool_use") {
            const callId = extractDesktopClaudeToolCallId(block)
              ?? `${sessionId}-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            // The same tool_use block is re-sent as later partial-message
            // snapshots fill in; only enqueue/emit tool.start once per callId.
            if (session.pendingToolCalls.some((p) => p.callId === callId)) continue;
            const rawTool = String(block.name ?? block.tool ?? "");
            const normalizedTool = normalizeDesktopClaudeToolName(rawTool);
            const args = normalizeDesktopClaudeToolArgs(rawTool, (block.input as Record<string, unknown> | undefined) ?? {});
            session.pendingToolCalls.push({
              callId,
              rawTool,
              normalizedTool,
              args,
              ...(extractDesktopClaudeProviderToolId(block) ? { providerCallId: extractDesktopClaudeProviderToolId(block) } : {}),
            });
            mapped.push({ type: "tool.start", sessionId, tool: normalizedTool, args, callId });
          }
        }
        return mapped;
      }
      return [];
    }
    case "user": {
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (!Array.isArray(content)) return [];
      const mapped: Record<string, unknown>[] = [];
      for (const rawBlock of content) {
        const block = rawBlock as Record<string, unknown>;
        if (block?.type !== "tool_result") continue;
        const match = resolveDesktopClaudePendingToolCall(session.pendingToolCalls, block);
        const rawTool = String(block.tool ?? match?.rawTool ?? "");
        const blockContent = block.content;
        const resultText = typeof blockContent === "string"
          ? blockContent
          : Array.isArray(blockContent)
            ? blockContent
              .filter((part) => (part as Record<string, unknown>)?.type === "text")
              .map((part) => String((part as Record<string, unknown>).text ?? ""))
              .join("")
            : String(block.output ?? "");
        mapped.push({
          type: "tool.result",
          sessionId,
          tool: normalizeDesktopClaudeToolName(rawTool),
          ok: block.is_error !== true,
          message: resultText,
          ...(match ? { callId: match.callId, data: match.args } : {}),
        });
      }
      return mapped;
    }
    case "result": {
      const resultContent = typeof event.result === "string" ? event.result : "";
      return resultContent
        ? [{ type: "message", sessionId, role: "assistant", content: resultContent }]
        : [];
    }
    default:
      return [{
        type: "activity",
        sessionId,
        kind: type || "unknown",
        summary: `Claude Code: ${type || "unknown"}`,
        payload: event,
      }];
  }
}

function runClaudeRemoteTurn(session: RemoteProviderSession, message: string): Promise<void> {
  if (session.child) {
    return Promise.reject(new Error("Claude Code turn already running"));
  }

  const args = [
    "--print",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--session-id", session.sessionId,
  ];

  if (session.mode === "full-access") {
    args.push("--dangerously-skip-permissions");
  } else {
    args.push("--permission-mode", "default");
  }

  if (session.model) {
    args.push("--model", session.model);
  }

  if (session.mcpConfigPath) {
    args.push("--mcp-config", session.mcpConfigPath);
  }

  // The message is sent over stdin rather than as a CLI argument: on Windows
  // this spawn goes through `shell: true` (cmd.exe), whose command-line is
  // capped at ~8191 chars, and long turns (system prompt + memory + recent
  // history) routinely exceed that, causing `spawn ENAMETOOLONG`. `claude
  // --print` reads the prompt from stdin when no positional argument is given.
  const child = spawn("claude", args, {
    cwd: session.workingDirectory,
    env: session.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });

  session.child = child;
  session.stopRequested = false;
  session.stderrBuffer = "";

  // Suppress EPIPE errors when child exits before we finish writing
  child.stdin?.on("error", () => {/* ignore broken pipe */});
  child.stdin?.write(message);
  child.stdin?.end();
  sendProviderEvent(session.sessionId, { type: "turn.started", sessionId: session.sessionId });

  let buffer = "";
  child.stdout?.on("data", (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        for (const mapped of mapClaudeStreamEvent(session, event)) {
          sendProviderEvent(session.sessionId, mapped);
        }
      } catch {
        // Ignore non-JSON output.
      }
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    session.stderrBuffer = (session.stderrBuffer ?? "") + text;
    const trimmed = text.trim();
    if (trimmed) console.error(`[claude-remote:${session.sessionId}] stderr: ${trimmed}`);
  });

  return new Promise((resolve, reject) => {
    child.on("exit", (code, signal) => {
      session.child = null;
      if (session.stopRequested) {
        session.stopRequested = false;
        sendProviderEvent(session.sessionId, { type: "session.completed", sessionId: session.sessionId });
        resolve();
        return;
      }
      if (code === 0) {
        sendProviderEvent(session.sessionId, { type: "turn.completed", sessionId: session.sessionId });
        resolve();
        return;
      }
      const baseError = new Error(`Claude Code exited with code ${code}${signal ? ` (signal=${signal})` : ""}`);
      const error = appendProviderStderr(baseError, session);
      sendProviderEvent(session.sessionId, { type: "session.error", sessionId: session.sessionId, error: error.message });
      reject(error);
    });

    child.on("error", (err) => {
      session.child = null;
      const error = appendProviderStderr(err, session);
      sendProviderEvent(session.sessionId, { type: "session.error", sessionId: session.sessionId, error: error.message });
      reject(error);
    });
  });
}

function normalizeDesktopClaudeToolName(tool: string): string {
  if (tool.startsWith("mcp__")) return "mcp-tool";
  const normalized = tool.trim().toLowerCase();
  if (normalized === "edit" || normalized === "multiedit") return "edit";
  if (normalized === "write") return "file.write";
  if (normalized === "read") return "read";
  if (normalized === "notebookedit" || normalized === "notebookread") return "edit";
  if (normalized === "websearch" || normalized === "webfetch") return "web";
  if (normalized === "bash") return "execute";
  if (normalized === "glob" || normalized === "grep" || normalized === "lsp" || normalized === "toolsearch") return "search";
  if (normalized === "todowrite") return "todo";
  if (normalized === "agent" || normalized === "task" || normalized === "taskcreate"
    || normalized === "taskget" || normalized === "tasklist" || normalized === "taskoutput"
    || normalized === "taskstop" || normalized === "taskupdate") return "agent";
  return tool;
}

function normalizeDesktopClaudeToolArgs(tool: string, input: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeDesktopClaudeToolName(tool);
  if (normalized === "edit" || normalized === "file.write" || normalized === "read") {
    return {
      path: String(input.path ?? input.file_path ?? input.filePath ?? input.file ?? ""),
      ...(input.old_string != null ? { search: input.old_string } : {}),
      ...(input.new_string != null ? { replace: input.new_string } : {}),
      ...(input.content != null ? { content: input.content } : {}),
      ...(input.new_file_contents != null ? { content: input.new_file_contents } : {}),
      ...input,
    };
  }

  if (normalized === "web") {
    return {
      query: String(input.query ?? input.search_query ?? input.q ?? ""),
      ...(input.url != null ? { url: input.url } : {}),
      ...input,
    };
  }

  if (normalized === "execute") {
    return {
      command: String(input.command ?? ""),
      ...input,
    };
  }

  if (normalized === "search") {
    return {
      pattern: String(input.pattern ?? input.query ?? input.command ?? ""),
      ...input,
    };
  }

  if (normalized === "mcp-tool") {
    const parts = tool.split("__");
    return {
      recipient_name: tool,
      ...(parts.length >= 3 ? { server: parts[1], tool: parts.slice(2).join("__") } : {}),
      ...input,
    };
  }

  return input;
}

function extractDesktopClaudeToolCallId(event: Record<string, unknown>): string | undefined {
  return (
    asDesktopNonEmptyString(event.callId) ??
    asDesktopNonEmptyString(event.call_id) ??
    asDesktopNonEmptyString(event.toolCallId) ??
    asDesktopNonEmptyString(event.tool_call_id) ??
    extractDesktopClaudeProviderToolId(event)
  );
}

function extractDesktopClaudeProviderToolId(event: Record<string, unknown>): string | undefined {
  return (
    asDesktopNonEmptyString(event.id) ??
    asDesktopNonEmptyString(event.toolUseId) ??
    asDesktopNonEmptyString(event.tool_use_id) ??
    asDesktopNonEmptyString(event.toolId) ??
    asDesktopNonEmptyString(event.tool_id)
  );
}

function resolveDesktopClaudePendingToolCall(
  pending: DesktopClaudePendingToolCall[],
  event: Record<string, unknown>,
): DesktopClaudePendingToolCall | undefined {
  if (pending.length === 0) return undefined;

  const directId = extractDesktopClaudeToolCallId(event);
  if (directId) {
    const directIdx = pending.findIndex((entry) => entry.callId === directId || entry.providerCallId === directId);
    if (directIdx !== -1) return pending.splice(directIdx, 1)[0];
  }

  const rawTool = asDesktopNonEmptyString(event.tool);
  if (rawTool) {
    const normalizedTool = normalizeDesktopClaudeToolName(rawTool);
    const toolIdx = pending.findIndex((entry) => entry.rawTool === rawTool || entry.normalizedTool === normalizedTool);
    if (toolIdx !== -1) return pending.splice(toolIdx, 1)[0];
  }

  return pending.shift();
}

function asDesktopNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

ipcMain.handle("desktop:provider-op", async (_event, op: string, params: Record<string, unknown>) => {
  switch (op) {
    case "auth-status": {
      const { providerId, providerType } = params as { providerId: string; providerType: string };
      if (!isSupportedDesktopProviderId(providerType)) throw new Error(`Provider ${providerType} is not implemented by the desktop remote runner`);
      try {
        execSync([remoteProviderCommand(providerType), ...remoteProviderAuthArgs(providerType)].join(" "), {
          stdio: "pipe", timeout: 10_000, env: remoteProviderAccountEnv(providerId, providerType),
        });
        return { login: true, logout: true, deviceCode: true, authenticated: true, detail: "Authenticated for this Jait account on this device" };
      } catch {
        return { login: true, logout: false, deviceCode: true, authenticated: false, detail: "Login required for this Jait account on this device" };
      }
    }
    case "start-login": {
      const { providerId, providerType } = params as { providerId: string; providerType: string };
      if (!isSupportedDesktopProviderId(providerType)) throw new Error(`Provider ${providerType} is not implemented by the desktop remote runner`);
      remoteProviderLoginProcesses.get(providerId)?.kill();
      const child = spawn(remoteProviderCommand(providerType), remoteProviderLoginArgs(providerType), {
        env: remoteProviderAccountEnv(providerId, providerType), stdio: ["pipe", "pipe", "pipe"], shell: true,
      });
      remoteProviderLoginProcesses.set(providerId, child);
      let output = "";
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };
        const capture = (data: Buffer) => {
          output += data.toString();
          const details = extractDeviceAuthDetails(output);
          if (hasCompleteDeviceAuthDetails(details)) finish();
        };
        const timeout = setTimeout(finish, 15_000);
        child.stdout?.on("data", capture);
        child.stderr?.on("data", capture);
        child.once("exit", () => {
          remoteProviderLoginProcesses.delete(providerId);
          finish();
        });
        child.once("error", finish);
      });
      const details = extractDeviceAuthDetails(output);
      return { ok: true, status: "started", providerId, message: `Complete ${providerType} login on this device.`, rawOutput: output, ...details };
    }
    case "login-input": {
      const { providerId, input } = params as { providerId: string; input: string };
      const child = remoteProviderLoginProcesses.get(providerId);
      if (!child?.stdin) throw new Error("No login is waiting for input");
      child.stdin.write(`${input}\n`);
      return { ok: true };
    }
    case "logout": {
      const { providerId, providerType } = params as { providerId: string; providerType: string };
      if (!isSupportedDesktopProviderId(providerType)) throw new Error(`Provider ${providerType} is not implemented by the desktop remote runner`);
      try {
        execSync([remoteProviderCommand(providerType), ...remoteProviderLogoutArgs(providerType)].join(" "), {
          stdio: "pipe", timeout: 20_000, env: remoteProviderAccountEnv(providerId, providerType),
        });
        return { ok: true, status: "completed", providerId, message: `${providerType} logged out on this device.` };
      } catch (error) {
        return { ok: false, status: "error", providerId, message: error instanceof Error ? error.message : "Logout failed" };
      }
    }
    case "delete-account": {
      const { providerId } = params as { providerId: string };
      remoteProviderLoginProcesses.get(providerId)?.kill();
      remoteProviderLoginProcesses.delete(providerId);
      rmSync(path.join(app.getPath("userData"), "provider-accounts", providerId), { recursive: true, force: true });
      return { ok: true };
    }
    case "start-session": {
      const { sessionId, providerId, providerType, workingDirectory, mode, model, env: extraEnv, mcpServers } = params as {
        sessionId: string; providerId: string; providerType: string; workingDirectory: string;
        mode: string; model?: string; env?: Record<string, string>; mcpServers?: DesktopMcpServerRef[];
      };
      if (!isSupportedDesktopProviderId(providerType)) {
        throw new Error(`Provider ${providerType} is not implemented by the desktop remote runner`);
      }
      const providerEnv = { ...remoteProviderAccountEnv(providerId, providerType), ...extraEnv } as Record<string, string>;
      const resolvedMcpServers = getDesktopJaitMcpServers(mcpServers);

      if (providerType === "claude-code") {
        remoteProviderSessions.set(sessionId, {
          child: null,
          pendingRpc: new Map(),
          nextRpcId: 1,
          sessionId,
          providerId: "claude-code",
          kind: "claude-print",
          workingDirectory,
          mode,
          model: model ?? null,
          env: providerEnv,
          mcpServers: resolvedMcpServers,
          mcpConfigPath: buildDesktopClaudeMcpConfig(sessionId, resolvedMcpServers),
          stopRequested: false,
          pendingToolCalls: [],
        });
        return { ok: true, providerThreadId: sessionId };
      }

      const cmd = "codex";
      const args = ["app-server", ...buildDesktopCodexMcpArgs(resolvedMcpServers)];

      const child = spawn(cmd, args, {
        cwd: workingDirectory,
        env: providerEnv,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
      });

      const sess: RemoteProviderSession = {
        child,
        pendingRpc: new Map(),
        nextRpcId: 1,
        sessionId,
        providerId: "codex",
        kind: "rpc",
        workingDirectory,
        mode,
        model: model ?? null,
        env: providerEnv,
        mcpServers: resolvedMcpServers,
        stopRequested: false,
        pendingToolCalls: [],
      };
      remoteProviderSessions.set(sessionId, sess);

      // Suppress EPIPE errors when child exits before we finish writing
      child.stdin?.on("error", () => {/* ignore broken pipe */});

      // Capture stderr so a child that exits early (auth failure, missing binary,
      // bad config) surfaces a real message instead of a bare "write EPIPE".
      sess.stderrBuffer = "";
      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        sess.stderrBuffer = (sess.stderrBuffer ?? "") + text;
        const trimmed = text.trim();
        if (trimmed) console.error(`[codex-remote:${sessionId}] stderr: ${trimmed}`);
      });

      // Parse NDJSON from stdout
      const rl = createInterface({ input: child.stdout! });
      rl.on("line", (line) => {
        try {
          const msg = JSON.parse(line);
          // RPC response
          if (msg.id != null) {
            const pending = sess.pendingRpc.get(msg.id);
            if (pending) {
              sess.pendingRpc.delete(msg.id);
              clearTimeout(pending.timer);
              if (msg.error) pending.reject(new Error(msg.error.message ?? "RPC error"));
              else pending.resolve(msg.result);
            }
          }
          // Notification (provider event) — relay to renderer for WS forwarding
          if (msg.method && !msg.id) {
            sendProviderEvent(sessionId, msg);
            const error = remoteTurnError(msg);
            if (error) {
              settleRemoteTurn(sess, new Error(error));
            } else if (msg.method === "turn/completed" || msg.method === "session/completed") {
              settleRemoteTurn(sess);
            }
          }
        } catch { /* non-JSON */ }
      });

      child.on("exit", (code, signal) => {
        const exitError = !sess.stopRequested
          ? appendProviderStderr(
              new Error(`Codex exited before session startup completed${code != null ? ` (code ${code})` : ""}${signal ? ` signal ${signal}` : ""}`),
              sess,
            )
          : null;
        for (const pending of sess.pendingRpc.values()) {
          clearTimeout(pending.timer);
          pending.reject(exitError ?? new Error("Session stopped"));
        }
        sess.pendingRpc.clear();
        settleRemoteTurn(sess);
        remoteProviderSessions.delete(sessionId);
        sendProviderEvent(sessionId, { method: "session/completed" });
      });

      child.on("error", (err) => {
        const startupError = appendProviderStderr(err, sess);
        for (const pending of sess.pendingRpc.values()) {
          clearTimeout(pending.timer);
          pending.reject(startupError);
        }
        sess.pendingRpc.clear();
        settleRemoteTurn(sess, startupError);
        remoteProviderSessions.delete(sessionId);
      });

      // Initialize handshake
      try {
        const initResult = await rpcSend(sess, "initialize", {
          clientInfo: { name: "jait-remote", title: "Jait Remote Provider", version: "1.0.0" },
          capabilities: { experimentalApi: true },
        }, 45_000);
        rpcNotify(sess, "initialized");

        // Start thread
        const { approvalPolicy, sandbox } = resolveRemoteCodexThreadConfig(mode);
        const threadResult = await rpcSend(sess, "thread/start", {
          model: model ?? null,
          cwd: workingDirectory,
          approvalPolicy,
          sandbox,
          experimentalRawEvents: false,
        }) as { thread?: { id?: string }; threadId?: string };

        const providerThreadId = threadResult?.thread?.id ?? threadResult?.threadId;
        return { ok: true, initResult, providerThreadId };
      } catch (err) {
        killProcessTree(child);
        remoteProviderSessions.delete(sessionId);
        throw appendProviderStderr(err instanceof Error ? err : new Error(String(err)), sess);
      }
    }
    case "send-turn": {
      const { sessionId, message, providerThreadId } = params as {
        sessionId: string; message: string; providerThreadId: string;
      };
      const sess = remoteProviderSessions.get(sessionId);
      if (!sess) throw new Error("Session not found");
      if (sess.kind === "claude-print") {
        await runClaudeRemoteTurn(sess, message);
        return { ok: true, completed: true };
      }
      const turnDone = waitForRemoteTurn(sess);
      try {
        await rpcSend(sess, "turn/start", {
          threadId: providerThreadId,
          input: [{ type: "text", text: message, text_elements: [] }],
        });
        await turnDone;
        return { ok: true, completed: true };
      } catch (err) {
        settleRemoteTurn(sess);
        throw err;
      }
    }
    case "stop-session": {
      const { sessionId } = params as { sessionId: string };
      return { ok: true, stopped: stopRemoteProviderSession(sessionId) };
    }
    case "list-models": {
      const { providerId, providerType } = params as { providerId: string; providerType: string };
      if (!isSupportedDesktopProviderId(providerType)) {
        throw new Error(`Provider ${providerType} is not implemented by the desktop remote runner`);
      }
      const providerEnv = remoteProviderAccountEnv(providerId, providerType);
      if (providerType === "claude-code") {
        return discoverClaudeModelOptions(providerEnv);
      }

      const cmd = "codex";
      const args = ["app-server", ...buildDesktopCodexMcpArgs(getDesktopJaitMcpServers())];

      const child = spawn(cmd, args, {
        cwd: process.cwd(),
        env: providerEnv,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
      });

      const tmpSess: RemoteProviderSession = {
        child,
        pendingRpc: new Map(),
        nextRpcId: 1,
        sessionId: "tmp-model-list",
        providerId: "codex",
        kind: "rpc",
        workingDirectory: process.cwd(),
        mode: "full-access",
        model: null,
        env: providerEnv,
        stopRequested: false,
        pendingToolCalls: [],
      };

      // Suppress EPIPE errors on temp process
      child.stdin?.on("error", () => {/* ignore broken pipe */});

      tmpSess.stderrBuffer = "";
      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        tmpSess.stderrBuffer = (tmpSess.stderrBuffer ?? "") + text;
        const trimmed = text.trim();
        if (trimmed) console.error(`[codex-remote:list-models] stderr: ${trimmed}`);
      });

      const rl = createInterface({ input: child.stdout! });
      rl.on("line", (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id != null) {
            const pending = tmpSess.pendingRpc.get(msg.id);
            if (pending) {
              tmpSess.pendingRpc.delete(msg.id);
              clearTimeout(pending.timer);
              if (msg.error) pending.reject(new Error(msg.error.message ?? "RPC error"));
              else pending.resolve(msg.result);
            }
          }
        } catch { /* non-JSON */ }
      });

      try {
        await rpcSend(tmpSess, "initialize", {
          clientInfo: { name: "jait-remote", title: "Jait Remote Provider", version: "1.0.0" },
          capabilities: { experimentalApi: true },
        }, 45_000);
        rpcNotify(tmpSess, "initialized");
        const result = await rpcSend(tmpSess, "model/list", {}, 45_000);
        return result;
      } finally {
        killProcessTree(child);
      }
    }
    default:
      throw new Error(`Unknown provider operation: ${op}`);
  }
});

ipcMain.handle("desktop:browse-path", async (_event, dirPath: string) => {
  const { resolve, dirname, join } = await import("node:path");
  const resolved = resolve(dirPath);
  const raw = await readdir(resolved, { withFileTypes: true });
  const entries: { name: string; path: string; type: "dir" | "file" }[] = [];
  for (const d of raw) {
    if (d.name.startsWith(".")) continue;
    if (d.isDirectory()) {
      entries.push({ name: d.name, path: join(resolved, d.name), type: "dir" });
    } else if (d.isFile()) {
      entries.push({ name: d.name, path: join(resolved, d.name), type: "file" });
    }
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return {
    path: resolved,
    parent: dirname(resolved) !== resolved ? dirname(resolved) : null,
    entries,
  };
});

ipcMain.handle("desktop:get-roots", async () => {
  const { homedir } = await import("node:os");
  const roots: { name: string; path: string; type: "dir" | "file" }[] = [];
  if (process.platform === "win32") {
    const { execSync } = await import("node:child_process");
    try {
      const raw = execSync("wmic logicaldisk get name", { encoding: "utf-8" });
      const drives = raw.split("\n").map(l => l.trim()).filter(l => /^[A-Z]:$/i.test(l));
      for (const d of drives) {
        roots.push({ name: d, path: d + "\\", type: "dir" });
      }
    } catch {
      roots.push({ name: "C:", path: "C:\\", type: "dir" });
    }
  } else {
    roots.push({ name: "/", path: "/", type: "dir" });
  }
  roots.push({ name: "Home", path: homedir(), type: "dir" });
  return { roots };
});

// ── Generic filesystem operation handler (for remote project ops) ──────────
// fs-op results don't just cross this IPC boundary — the renderer JSON-wraps
// them into a single WebSocket frame to the gateway, so a file's content is
// held in memory several times over (Buffer here, base64/utf-8 string in the
// renderer, stringified frame copy). An uncapped read of a large file (a build
// artifact, an archive, a video) inflates the renderer past V8's ~2 GB heap
// ceiling and hard-crashes it with an OOM — and since the requesting client
// retries when the connection drops, it becomes a deterministic crash loop.
// Cap read sizes and fail with a clear error naming the file instead.
const MAX_FS_OP_READ_BYTES = 20 * 1024 * 1024;
const MAX_FS_OP_READ_BINARY_BYTES = 30 * 1024 * 1024;

// Diff content reads get a tighter cap: the `git show` side of a diff already
// fails safely past gitExecLocal's 10 MB maxBuffer, but the working-tree side
// was read with no limit — one rebuilt 400+ MB artifact sitting modified in a
// project made every diff request inflate main and the renderer to ~2 GB and
// OOM-crash the window (deterministically, on every client reconnect).
const MAX_DIFF_FILE_BYTES = 10 * 1024 * 1024;

/** Read a working-tree file for diff display; oversized files get a short placeholder instead. */
async function readDiffFileCapped(absPath: string): Promise<string> {
  const info = await fsStat(absPath);
  if (info.size > MAX_DIFF_FILE_BYTES) {
    return `(file too large to diff: ${(info.size / 1048576).toFixed(1)} MB, limit ${(MAX_DIFF_FILE_BYTES / 1048576).toFixed(0)} MB)`;
  }
  return readFile(absPath, "utf-8");
}

async function assertReadableSize(filePath: string, maxBytes: number): Promise<void> {
  const info = await fsStat(filePath);
  if (info.size > maxBytes) {
    throw new Error(
      `File too large to open remotely: ${filePath} is ${(info.size / 1048576).toFixed(1)} MB ` +
      `(limit ${(maxBytes / 1048576).toFixed(0)} MB)`,
    );
  }
}

ipcMain.handle("desktop:fs-op", async (_event, op: string, params: Record<string, unknown>) => {
  const { resolve, dirname, join, relative } = await import("node:path");

  /** Build a clean env with GH_TOKEN/GITHUB_TOKEN removed so gh uses stored keyring credentials. */
  const ghCleanEnv = (): NodeJS.ProcessEnv => {
    const { GH_TOKEN, GITHUB_TOKEN, ...rest } = process.env;
    return rest;
  };

  const runProjectSearch = async (
    projectRoot: string,
    query: string,
    mode: "files" | "content",
    maxResults: number,
  ) => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const safeDir = projectRoot.replace(/"/g, '\\"');
    const safeQuery = query.replace(/"/g, '\\"');
    const isWin = process.platform === "win32";

    try {
      if (mode === "content") {
        let cmd = `rg --no-heading --line-number --max-count ${maxResults} --ignore-case --fixed-strings -- "${safeQuery}" "${safeDir}" 2>${isWin ? "nul" : "/dev/null"}`;
        if (isWin) {
          cmd += ` || findstr /s /n /i /l /c:"${safeQuery}" "${safeDir}\\*" 2>nul`;
        } else {
          cmd += ` || grep -rn -i -F --max-count=${maxResults} -- "${safeQuery}" "${safeDir}" 2>/dev/null`;
        }

        const { stdout } = await execAsync(cmd, { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
        const matches = stdout.trim().split("\n").filter(Boolean).slice(0, maxResults).map((line) => {
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (!match) return null;
          return {
            file: relative(projectRoot, match[1]!).replace(/\\/g, "/"),
            line: parseInt(match[2]!, 10),
            content: match[3]!.trim(),
          };
        }).filter(Boolean);
        return { query, mode, matches };
      }

      const cleanedQuery = query.replace(/[*?[\]]/g, "").trim();
      if (!cleanedQuery) return { query, mode, files: [] };
      const safeFileQuery = cleanedQuery.replace(/"/g, '\\"');
      const cmd = isWin
        ? `(rg --files "${safeDir}" 2>nul | findstr /i /l "${safeFileQuery}") || (dir /s /b "${safeDir}" 2>nul | findstr /i /l "${safeFileQuery}")`
        : `rg --files "${safeDir}" 2>/dev/null | grep -iF -- "${safeFileQuery}" | head -n ${maxResults}`;
      const { stdout } = await execAsync(cmd, { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
      const files = stdout.trim().split("\n").filter(Boolean).slice(0, maxResults).map((absPath) => {
        const relPath = relative(projectRoot, absPath.trim()).replace(/\\/g, "/");
        return { path: relPath, name: relPath.split("/").pop() || relPath };
      });
      return { query, mode, files };
    } catch (err: unknown) {
      const stderr = (err as { stderr?: string })?.stderr || "";
      if (stderr && !stderr.includes("No such file")) {
        throw new Error(stderr.slice(0, 200));
      }
      return mode === "content"
        ? { query, mode, matches: [] }
        : { query, mode, files: [] };
    }
  };

  switch (op) {
    case "stat": {
      const filePath = resolve(params.path as string);
      const info = await fsStat(filePath);
      return {
        size: info.size,
        isDirectory: info.isDirectory(),
        modified: info.mtime.toISOString(),
      };
    }
    case "read": {
      const filePath = resolve(params.path as string);
      await assertReadableSize(filePath, MAX_FS_OP_READ_BYTES);
      const content = await readFile(filePath, "utf-8");
      return { content, size: content.length };
    }
    case "readBinary": {
      const filePath = resolve(params.path as string);
      await assertReadableSize(filePath, MAX_FS_OP_READ_BINARY_BYTES);
      const buffer = await readFile(filePath);
      return { content: buffer.toString("base64"), size: buffer.length };
    }
    case "write": {
      const filePath = resolve(params.path as string);
      const content = params.content as string;
      // Ensure parent directory exists
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      return { ok: true, size: content.length };
    }
    case "list": {
      const dirPath = resolve(params.path as string);
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
    }
    case "exists": {
      const filePath = resolve(params.path as string);
      try {
        await access(filePath);
        return true;
      } catch {
        return false;
      }
    }
    case "mkdir": {
      const dirPath = resolve(params.path as string);
      await mkdir(dirPath, { recursive: true });
      return { ok: true };
    }
    case "readdir": {
      const dirPath = resolve(params.path as string);
      const raw = await readdir(dirPath, { withFileTypes: true });
      return raw.map((d) => ({
        name: d.name,
        path: join(dirPath, d.name),
        type: d.isDirectory() ? "dir" : "file",
      }));
    }
    case "reveal-in-explorer": {
      // Open the OS file manager with the given file/folder selected.
      // For directories the folder itself is opened; for files the parent
      // folder is opened with the file highlighted (showItemInFolder).
      const { revealInExplorer } = await import("./reveal-in-explorer.js");
      return revealInExplorer(params.path as string, shell);
    }
    case "search-project": {
      const projectRoot = resolve(params.path as string);
      const query = String(params.query ?? "");
      const mode = params.mode === "content" ? "content" : "files";
      const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
      return runProjectSearch(projectRoot, query, mode, limit);
    }
    case "git": {
      // Run a git command in a given cwd — used by the gateway to proxy git ops
      const cwd = resolve(params.cwd as string);
      const args = params.args as string;
      if (!args || typeof args !== "string") throw new Error("Missing git args");
      const { exec: execAsync } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execP = promisify(execAsync);
      const { stdout, stderr } = await execP(`git ${args}`, {
        cwd,
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      return { stdout, stderr };
    }
    case "gh": {
      // Run a gh CLI command in a given cwd — used by the gateway to proxy gh operations
      const cwd = resolve(params.cwd as string);
      const args = params.args as string;
      if (!args || typeof args !== "string") throw new Error("Missing gh args");
      const { exec: execAsync } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execP = promisify(execAsync);
      const { stdout, stderr } = await execP(`gh ${args}`, {
        cwd,
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        env: ghCleanEnv(),
      });
      return { stdout, stderr };
    }
    case "git-file-read": {
      // Read a file from disk (for diff original/modified content)
      const filePath = resolve(params.path as string);
      const content = await readDiffFileCapped(filePath);
      return { content };
    }
    case "git-file-diffs": {
      // Compound operation: return per-file original/modified content for Monaco diff
      const cwd = resolve(params.cwd as string);
      const baseBranch = params.baseBranch as string | undefined;
      const branch = params.branch as string | undefined;
      const { exec: execAsync } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execP = promisify(execAsync);

      const gitExecLocal = async (args: string) => {
        const { stdout } = await execP(`git ${args}`, {
          cwd, timeout: 30_000, maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        return stdout.trimEnd();
      };

      // Check if repo
      try { await gitExecLocal("rev-parse --is-inside-work-tree"); } catch { return []; }

      const entries: Array<{ path: string; original: string; modified: string; status: string }> = [];
      const seen = new Set<string>();

      if (baseBranch && branch) {
        // Compute merge-base to get the PR-style diff (not tip-to-tip)
        const diffBase = await gitExecLocal(`merge-base ${JSON.stringify(baseBranch)} ${JSON.stringify(branch)}`).catch(() => baseBranch);
        const nameStatus = await gitExecLocal(`diff --name-status ${diffBase} ${branch}`).catch(() => "");
        for (const line of nameStatus.split("\n").filter(Boolean)) {
          const parts = line.split("\t");
          const statusCode = parts[0]?.trim() ?? "M";
          let filePath = parts[parts.length - 1]?.trim() ?? "";
          let status = "M";
          if (statusCode.startsWith("A")) status = "A";
          else if (statusCode.startsWith("D")) status = "D";
          else if (statusCode.startsWith("R")) {
            status = "R";
            filePath = parts[2]?.trim() ?? filePath;
          }
          if (!filePath || seen.has(filePath)) continue;
          seen.add(filePath);

          let original = "";
          if (status !== "A") {
            try { original = await gitExecLocal(`show ${diffBase}:${JSON.stringify(filePath)}`); } catch { /* new file */ }
          }
          let modified = "";
          if (status !== "D") {
            try { modified = await gitExecLocal(`show ${branch}:${JSON.stringify(filePath)}`); } catch { /* deleted */ }
          }
          entries.push({ path: filePath, original, modified, status });
        }
      } else if (baseBranch) {
        // Diff working tree against base branch (committed + uncommitted changes)
        const nameStatus = await gitExecLocal(`diff --name-status ${baseBranch}`).catch(() => "");
        for (const line of nameStatus.split("\n").filter(Boolean)) {
          const parts = line.split("\t");
          const statusCode = parts[0]?.trim() ?? "M";
          let filePath = parts[parts.length - 1]?.trim() ?? "";
          let status = "M";
          if (statusCode.startsWith("A")) status = "A";
          else if (statusCode.startsWith("D")) status = "D";
          else if (statusCode.startsWith("R")) {
            status = "R";
            filePath = parts[2]?.trim() ?? filePath;
          }
          if (!filePath || seen.has(filePath)) continue;
          seen.add(filePath);

          let original = "";
          if (status !== "A") {
            try { original = await gitExecLocal(`show ${baseBranch}:${JSON.stringify(filePath)}`); } catch { /* new file */ }
          }
          let modified = "";
          if (status !== "D") {
            try { modified = await readDiffFileCapped(join(cwd, filePath)); } catch { /* deleted */ }
          }
          entries.push({ path: filePath, original, modified, status });
        }
      } else {
        // Diff working tree against HEAD (uncommitted changes only)
        const porcelain = await gitExecLocal("status --porcelain").catch(() => "");
        for (const line of porcelain.split("\n").filter(Boolean)) {
          const xy = line.slice(0, 2);
          let filePath = line.slice(3).trim();
          if (filePath.includes(" -> ")) filePath = filePath.split(" -> ").pop()!.trim();

          let status = "M";
          if (xy.includes("?")) status = "?";
          else if (xy.includes("A")) status = "A";
          else if (xy.includes("D")) status = "D";
          else if (xy.includes("R")) status = "R";
          if (seen.has(filePath)) continue;
          seen.add(filePath);

          let original = "";
          if (status !== "A" && status !== "?") {
            try { original = await gitExecLocal(`show HEAD:${JSON.stringify(filePath)}`); } catch { /* */ }
          }
          let modified = "";
          if (status !== "D") {
            try { modified = await readDiffFileCapped(join(cwd, filePath)); } catch { /* */ }
          }
          entries.push({ path: filePath, original, modified, status });
        }
      }

      if (!(baseBranch && branch)) {
        // Include untracked files only when diffing against the working tree.
        const porcelainAll = await gitExecLocal("status --porcelain").catch(() => "");
        for (const pl of porcelainAll.split("\n").filter(Boolean)) {
          if (!pl.startsWith("??")) continue;
          const fp = pl.slice(3).trim();
          if (!fp || seen.has(fp)) continue;
          seen.add(fp);
          let modified = "";
          try { modified = await readDiffFileCapped(join(cwd, fp)); } catch { /* */ }
          entries.push({ path: fp, original: "", modified, status: "?" });
        }
      }

      return entries;
    }
    case "git-diff-stats": {
      // Compound operation: merge-base-aware diff stats for branch comparisons
      const cwd = resolve(params.cwd as string);
      const baseBranch = params.baseBranch as string | undefined;
      const branch = params.branch as string | undefined;
      const { exec: execAsync } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execP = promisify(execAsync);

      const gitExecLocal = async (args: string) => {
        const { stdout } = await execP(`git ${args}`, {
          cwd, timeout: 30_000, maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        return stdout.trimEnd();
      };

      try { await gitExecLocal("rev-parse --is-inside-work-tree"); } catch {
        return { files: 0, insertions: 0, deletions: 0, hasChanges: false };
      }

      const filePaths = new Set<string>();
      let insertions = 0;
      let deletions = 0;

      const collectNumstat = async (args: string) => {
        const numstat = await gitExecLocal(args).catch(() => "");
        for (const line of numstat.split("\n").filter(Boolean)) {
          const [ins, del, filePath] = line.split("\t");
          if (!filePath) continue;
          filePaths.add(filePath);
          insertions += ins === "-" ? 0 : parseInt(ins ?? "0", 10);
          deletions += del === "-" ? 0 : parseInt(del ?? "0", 10);
        }
      };

      if (baseBranch && branch) {
        // Compute merge-base for PR-style diff
        const mergeBase = await gitExecLocal(
          `merge-base ${JSON.stringify(baseBranch)} ${JSON.stringify(branch)}`,
        ).catch(() => baseBranch);
        await collectNumstat(`diff --numstat ${mergeBase.trim()} ${JSON.stringify(branch)}`);
      } else if (baseBranch) {
        await collectNumstat(`diff --numstat ${JSON.stringify(baseBranch)}`);
      } else {
        await collectNumstat("diff --cached --numstat");
        await collectNumstat("diff --numstat");
      }

      if (!branch) {
        const porcelain = await gitExecLocal("status --porcelain").catch(() => "");
        for (const line of porcelain.split("\n").filter(Boolean)) {
          if (!line.startsWith("??")) continue;
          const fp = line.slice(3).trim();
          if (fp) filePaths.add(fp);
        }
      }

      return { files: filePaths.size, insertions, deletions, hasChanges: filePaths.size > 0 };
    }
    case "git-run-commit-flow": {
      // Compound operation: bump package versions, commit everything, and push.
      const cwd = resolve(params.cwd as string);
      const { exec: execAsync } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { readdir: readDir, readFile: readTextFile, writeFile: writeTextFile } = await import("node:fs/promises");
      const execP = promisify(execAsync);

      const gitExecLocal = async (args: string, timeout = 30_000) => {
        const { stdout } = await execP(`git ${args}`, {
          cwd, timeout, maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        return stdout.trim();
      };

      const listChildPackageJsonFiles = async (dir: string) => {
        try {
          const entries = await readDir(dir, { withFileTypes: true });
          return entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => join(dir, entry.name, "package.json"));
        } catch {
          return [];
        }
      };

      const bumpPatchVersion = (version: string) => {
        const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)([-+].+)?$/);
        if (!match) return null;
        return `${match[1]}.${match[2]}.${Number(match[3]) + 1}${match[4] ?? ""}`;
      };

      const bumpProjectPackageVersions = async () => {
        const candidateFiles = [
          join(cwd, "package.json"),
          ...await listChildPackageJsonFiles(join(cwd, "packages")),
          ...await listChildPackageJsonFiles(join(cwd, "apps")),
        ];
        const files = candidateFiles.filter((file, index) => candidateFiles.indexOf(file) === index);
        const updatedFiles: string[] = [];
        let previousVersion: string | null = null;
        let nextVersion: string | null = null;

        for (const file of files) {
          if (!existsSync(file)) continue;
          const raw = await readTextFile(file, "utf-8");
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const currentVersion = typeof parsed["version"] === "string" ? parsed["version"].trim() : "";
          if (!currentVersion) continue;
          const bumped = bumpPatchVersion(currentVersion);
          if (!bumped) continue;
          parsed["version"] = bumped;
          await writeTextFile(file, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
          updatedFiles.push(file);
          if (!previousVersion) previousVersion = currentVersion;
          if (!nextVersion) nextVersion = bumped;
        }

        if (!previousVersion || !nextVersion || updatedFiles.length === 0) {
          throw new Error("No bumpable package.json version fields found in this project.");
        }

        return { previousVersion, nextVersion, files: updatedFiles };
      };

      const isNonFastForwardPushError = (message: string) => {
        const lower = message.toLowerCase();
        return lower.includes("non-fast-forward")
          || lower.includes("fetch first")
          || lower.includes("rejected")
          || lower.includes("failed to push some refs");
      };

      let currentBranch = await gitExecLocal("rev-parse --abbrev-ref HEAD").catch(() => null);
      let upstreamBranch: string | null = null;
      if (currentBranch) {
        upstreamBranch = await gitExecLocal(`rev-parse --abbrev-ref ${currentBranch}@{upstream}`).catch(() => null);
      }

      const sync: { status: string; branch: string | null; upstreamBranch: string | null } = {
        status: "skipped_no_upstream",
        branch: currentBranch,
        upstreamBranch,
      };

      if (currentBranch && upstreamBranch) {
        const behindCount = Number.parseInt(await gitExecLocal("rev-list --count HEAD..@{upstream}").catch(() => "0"), 10);
        if (Number.isFinite(behindCount) && behindCount > 0) {
          try {
            await gitExecLocal("pull --rebase --autostash", 120_000);
            sync.status = "pulled";
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Pull before push failed. Resolve the rebase conflict and retry. ${message}`);
          }
        } else {
          sync.status = "skipped_up_to_date";
        }
      }

      const version = await bumpProjectPackageVersions();
      const commitMessage = `chore: bump version to v${version.nextVersion}`;
      const git: Record<string, unknown> = {
        commit: { status: "skipped_no_changes" },
        push: { status: "skipped_not_requested" },
        branch: { status: "skipped_not_requested" },
        pr: { status: "skipped_not_requested" },
      };

      const porcelain = await gitExecLocal("status --porcelain -- .").catch(() => "");
      if (porcelain.length > 0) {
        await gitExecLocal("add -A -- .");
        await gitExecLocal(`commit -m "${commitMessage.replace(/"/g, '\\"')}" -- .`);
        const sha = await gitExecLocal("rev-parse HEAD");
        git.commit = { status: "created", commitSha: sha, subject: commitMessage };
      }

      currentBranch = await gitExecLocal("rev-parse --abbrev-ref HEAD").catch(() => currentBranch);
      const pushResult: { status: string; branch?: string | null; upstreamBranch?: string | null; setUpstream?: boolean; error?: string } = {
        status: "skipped_not_requested",
      };

      if (currentBranch) {
        if (!upstreamBranch) {
          upstreamBranch = await gitExecLocal(`rev-parse --abbrev-ref ${currentBranch}@{upstream}`).catch(() => null);
        }

        if (upstreamBranch) {
          try {
            await gitExecLocal("push --no-verify", 120_000);
            pushResult.status = "pushed";
            pushResult.branch = currentBranch;
            pushResult.upstreamBranch = upstreamBranch;
          } catch (err) {
            pushResult.status = "failed";
            pushResult.branch = currentBranch;
            pushResult.upstreamBranch = upstreamBranch;
            pushResult.error = err instanceof Error ? err.message : String(err);
          }
        } else {
          const remotes = (await gitExecLocal("remote").catch(() => "")).split("\n").map(r => r.trim()).filter(Boolean);
          const remote = remotes.includes("origin") ? "origin" : remotes[0];
          if (remote) {
            await gitExecLocal(`push --no-verify --set-upstream "${remote}" "${currentBranch}"`, 120_000);
            pushResult.status = "pushed";
            pushResult.branch = currentBranch;
            pushResult.upstreamBranch = `${remote}/${currentBranch}`;
            pushResult.setUpstream = true;
          } else {
            pushResult.status = "skipped_no_remote";
            pushResult.branch = currentBranch;
          }
        }
      }

      if (pushResult.status === "failed" && isNonFastForwardPushError(pushResult.error ?? "")) {
        try {
          await gitExecLocal("pull --rebase --autostash", 120_000);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Push was rejected and pull --rebase failed. Resolve the conflict and retry. ${message}`);
        }
        const branch = await gitExecLocal("rev-parse --abbrev-ref HEAD").catch(() => null);
        if (!branch) throw new Error("Push retry failed because the current branch could not be determined.");
        try {
          await gitExecLocal("push --no-verify", 120_000);
          pushResult.status = "pushed";
          pushResult.branch = branch;
          pushResult.upstreamBranch = pushResult.upstreamBranch ?? upstreamBranch ?? undefined;
          delete pushResult.error;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Push retry failed after pulling latest changes. ${message}`);
        }
      } else if (pushResult.status === "failed") {
        throw new Error(pushResult.error ?? "Push failed");
      }

      git.push = pushResult;
      return { version, sync, git };
    }
    case "git-stacked-action": {
      // Compound operation: commit → push → create PR, matching GitStepResult format
      const cwd = resolve(params.cwd as string);
      const action = params.action as string; // "commit" | "commit_push" | "commit_push_pr"
      const commitMessage = params.commitMessage as string | undefined;
      const featureBranch = params.featureBranch as boolean | undefined;
      const baseBranch = params.baseBranch as string | undefined;
      const expectedBranch = params.expectedBranch as string | undefined;
      const { exec: execAsync } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { tmpdir } = await import("node:os");
      const { writeFile: writeTmpFile, unlink: unlinkTmp } = await import("node:fs/promises");
      const execP = promisify(execAsync);

      const gitExecLocal = async (args: string, timeout = 30_000) => {
        const { stdout } = await execP(`git ${args}`, {
          cwd, timeout, maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        return stdout.trim();
      };

      const ghExecLocal = async (args: string, timeout = 60_000) => {
        const { stdout } = await execP(`gh ${args}`, {
          cwd, timeout, maxBuffer: 10 * 1024 * 1024,
          env: ghCleanEnv(),
        });
        return stdout.trim();
      };
      const parseGithubRemote = (raw: string | null): { owner: string; repo: string } | null => {
        if (!raw) return null;
        const normalized = raw
          .trim()
          .replace(/\.git$/, "")
          .replace(/^git@([^:]+):(.+)$/, "https://$1/$2")
          .replace(/^ssh:\/\/git@([^/]+)\/(.+)$/, "https://$1/$2");
        try {
          const url = new URL(normalized);
          if (!url.hostname.toLowerCase().includes("github")) return null;
          const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
          if (parts.length < 2) return null;
          return { owner: parts[0]!, repo: parts[1]! };
        } catch {
          return null;
        }
      };
      const buildGhRepoFlag = (remote: { owner: string; repo: string } | null) => remote
        ? ` --repo "${remote.owner}/${remote.repo}"`
        : "";

      const ghIsAvailable = async () => {
        try { await execP("gh --version", { cwd, timeout: 5_000, env: ghCleanEnv() }); return true; } catch { return false; }
      };

      const result: Record<string, unknown> = {
        commit: { status: "skipped_no_changes" },
        push: { status: "skipped_not_requested" },
        branch: { status: "skipped_not_requested" },
        pr: { status: "skipped_not_requested" },
      };
      let resolvedBaseBranch: string | undefined;
      const resolveBaseBranchLocal = async () => {
        if (resolvedBaseBranch) return resolvedBaseBranch;
        const explicitBase = baseBranch?.trim();
        if (explicitBase) {
          resolvedBaseBranch = explicitBase;
          return resolvedBaseBranch;
        }
        resolvedBaseBranch = await gitExecLocal("symbolic-ref refs/remotes/origin/HEAD --short")
          .then(r => r.replace(/^origin\//, "").trim())
          .catch(async () => {
            try { await gitExecLocal("rev-parse --verify refs/heads/main"); return "main"; } catch { /* */ }
            try { await gitExecLocal("rev-parse --verify refs/heads/master"); return "master"; } catch { /* */ }
            return "main";
          });
        return resolvedBaseBranch;
      };

      // Optionally create a feature branch
      if (featureBranch) {
        const timestamp = Date.now().toString(36);
        const branchName = `feature/auto-${timestamp}`;
        await gitExecLocal(`checkout -b "${branchName}"`);
        result.branch = { status: "created", name: branchName };
      }

      let currentBranch = await gitExecLocal("rev-parse --abbrev-ref HEAD").catch(() => null);

      // If we expect a specific branch (e.g. thread branch) but are on a different one
      // (e.g. main because worktree creation failed), switch to it before committing.
      if (expectedBranch && currentBranch && currentBranch !== expectedBranch) {
        try {
          await gitExecLocal(`checkout "${expectedBranch}"`);
          currentBranch = expectedBranch;
        } catch {
          try {
            await gitExecLocal(`checkout -b "${expectedBranch}"`);
            currentBranch = expectedBranch;
          } catch { /* stay on current branch */ }
        }
      }

      // Commit step
      const porcelain = await gitExecLocal("status --porcelain -- .").catch(() => "");
      if (porcelain.length > 0) {
        await gitExecLocal("add -A -- .");
        let msg = commitMessage?.trim();
        if (!msg) {
          try {
            const diffSummary = await gitExecLocal("diff --cached --stat -- .");
            msg = `chore: auto-commit ${diffSummary.split("\n").length} file(s) changed`;
          } catch { msg = "chore: auto-commit changes"; }
        }
        await gitExecLocal(`commit -m "${msg.replace(/"/g, '\\"')}" -- .`);
        const sha = await gitExecLocal("rev-parse HEAD");
        result.commit = { status: "created", commitSha: sha, subject: msg };
      }

      // Push step
      if ((action === "commit_push" || action === "commit_push_pr") && currentBranch) {
        let hasUpstream = false;
        let upstreamBranch: string | undefined;
        try {
          upstreamBranch = await gitExecLocal(`rev-parse --abbrev-ref ${currentBranch}@{upstream}`);
          hasUpstream = true;
        } catch { /* no upstream */ }

        // Rebase onto latest remote base so PRs show a clean diff
        try {
          const rebaseTarget = await resolveBaseBranchLocal();
          const remotes = (await gitExecLocal("remote").catch(() => "")).split("\n").map(r => r.trim()).filter(Boolean);
          const rebaseRemote = remotes.includes("origin") ? "origin" : remotes[0];
          if (rebaseRemote) {
            await gitExecLocal(`fetch ${rebaseRemote} ${rebaseTarget}`, 60_000);
            await gitExecLocal(`rebase ${rebaseRemote}/${rebaseTarget}`);
          }
        } catch {
          await gitExecLocal("rebase --abort").catch(() => {});
        }

        if (hasUpstream) {
          try {
            await gitExecLocal("push --no-verify --force-with-lease", 60_000);
            result.push = { status: "pushed", branch: currentBranch, upstreamBranch };
          } catch (pushErr) {
            const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
            result.push = { status: "failed", branch: currentBranch, upstreamBranch, error: msg };
          }
        } else {
          // Try to find a remote to set upstream
          const remotes = (await gitExecLocal("remote").catch(() => "")).split("\n").map(r => r.trim()).filter(Boolean);
          const remote = remotes.includes("origin") ? "origin" : remotes[0];
          if (remote) {
            await gitExecLocal(`push --no-verify --set-upstream "${remote}" "${currentBranch}"`, 60_000);
            result.push = { status: "pushed", branch: currentBranch, upstreamBranch: `${remote}/${currentBranch}`, setUpstream: true };
          } else {
            result.push = { status: "skipped_no_remote", branch: currentBranch };
          }
        }
      }

      // PR creation step
      if (action === "commit_push_pr" && currentBranch) {
        try {
          const hasGh = await ghIsAvailable();
          if (hasGh) {
            const remotes = (await gitExecLocal("remote").catch(() => "")).split("\n").map(r => r.trim()).filter(Boolean);
            const remoteName = remotes.includes("origin") ? "origin" : remotes[0];
            const remoteUrl = remoteName ? await gitExecLocal(`remote get-url "${remoteName}"`).catch(() => "") : "";
            const githubRemote = parseGithubRemote(remoteUrl || null);
            // Check if PR already exists
            try {
              const existing = await ghExecLocal(`pr view --head "${currentBranch}"${buildGhRepoFlag(githubRemote)} --json number,url,title,state,baseRefName,headRefName`);
              const parsed = JSON.parse(existing);
              if (parsed.number && String(parsed.state ?? "OPEN").toUpperCase() === "OPEN") {
                result.pr = {
                  status: "opened_existing",
                  url: String(parsed.url ?? ""),
                  number: Number(parsed.number),
                  baseBranch: String(parsed.baseRefName ?? ""),
                  headBranch: String(parsed.headRefName ?? ""),
                  title: String(parsed.title ?? ""),
                };
                return result;
              }
            } catch { /* no existing PR */ }

            // Generate PR body
            const resolvedBase = await resolveBaseBranchLocal();
            const prTitle = (result.commit as Record<string, unknown>).subject as string ?? commitMessage?.trim() ?? `Changes from ${currentBranch}`;
            let prBody = `## Summary\n\n${prTitle}\n`;
            try {
              const commits = await gitExecLocal(`log --oneline ${resolvedBase}..${currentBranch}`, 15_000);
              if (commits) prBody += `\n## Commits\n\n\`\`\`\n${commits.slice(0, 12000)}\n\`\`\`\n`;
            } catch { /* */ }
            try {
              const diffStat = await gitExecLocal(`diff --stat ${resolvedBase}..${currentBranch}`, 15_000);
              if (diffStat) prBody += `\n## Changes\n\n\`\`\`\n${diffStat.slice(0, 12000)}\n\`\`\`\n`;
            } catch { /* */ }
            prBody += `\n---\n*PR created by [Jait](https://github.com/Widev-e-U/Jait) automation.*`;

            // Write body to temp file to avoid shell escaping issues
            const bodyFile = join(tmpdir(), `jait-pr-body-${Date.now()}.md`);
            await writeTmpFile(bodyFile, prBody, "utf-8");
            try {
              const baseFlag = ` --base "${resolvedBase}"`;
              // If the branch wasn't pushed yet, push it now before creating the PR
              if ((result.push as Record<string, unknown>).status !== "pushed") {
                try {
                  if (remoteName) {
                    await gitExecLocal(`push --no-verify --set-upstream "${remoteName}" "${currentBranch}"`, 60_000);
                    result.push = { status: "pushed", branch: currentBranch, upstreamBranch: `${remoteName}/${currentBranch}`, setUpstream: true };
                  }
                } catch { /* push failed — gh pr create may still work */ }
              }
              const prUrl = await ghExecLocal(
                `pr create --head "${currentBranch}"${buildGhRepoFlag(githubRemote)} --title "${prTitle.replace(/"/g, '\\"')}" --body-file "${bodyFile}"${baseFlag}`,
                60_000,
              );

              // Fetch PR details
              let prNumber = 0;
              let prBaseBranch = resolvedBase;
              let prHeadBranch = currentBranch;
              let prFinalTitle = prTitle;
              try {
                const details = await ghExecLocal(`pr view "${prUrl.trim()}" --json number,title,baseRefName,headRefName`);
                const parsed = JSON.parse(details);
                prNumber = Number(parsed.number ?? 0);
                prBaseBranch = String(parsed.baseRefName ?? prBaseBranch);
                prHeadBranch = String(parsed.headRefName ?? prHeadBranch);
                prFinalTitle = String(parsed.title ?? prTitle);
              } catch { /* */ }

              result.pr = { status: "created", url: prUrl.trim(), number: prNumber, baseBranch: prBaseBranch, headBranch: prHeadBranch, title: prFinalTitle };
            } finally {
              await unlinkTmp(bodyFile).catch(() => {});
            }
          } else {
            result.pr = { status: "skipped_no_remote" };
          }
        } catch (err) {
          result.pr = { status: "skipped_no_remote" };
          throw new Error(`PR creation failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return result;
    }
    case "git-create-worktree": {
      // Compound operation: create a git worktree for branch isolation
      const cwd = resolve(params.cwd as string);
      const baseBranchW = params.baseBranch as string;
      const newBranchW = params.newBranch as string;
      const { exec: execAsyncW } = await import("node:child_process");
      const { promisify: promisifyW } = await import("node:util");
      const { homedir: homedirW } = await import("node:os");
      const { basename: basenameW, join: joinW } = await import("node:path");
      const { mkdir: mkdirW } = await import("node:fs/promises");
      const execW = promisifyW(execAsyncW);

      const sanitized = newBranchW.replace(/\//g, "-");
      const repoName = basenameW(cwd);
      const worktreePath = joinW(homedirW(), ".jait", "worktrees", repoName, sanitized);

      // Ensure parent directory exists
      await mkdirW(joinW(worktreePath, ".."), { recursive: true });

      await execW(`git worktree add -b "${newBranchW}" "${worktreePath}" "${baseBranchW}"`, {
        cwd,
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      return { path: worktreePath, branch: newBranchW };
    }
    case "git-remove-worktree": {
      // Remove a git worktree (cleanup for completed/deleted threads)
      const worktreePath = resolve(params.path as string);
      const { exec: execRmW } = await import("node:child_process");
      const { promisify: promisifyRmW } = await import("node:util");
      const execRW = promisifyRmW(execRmW);

      // Find the main repo root from the worktree
      let mainRoot: string;
      try {
        const { stdout: commonDir } = await execRW("git rev-parse --git-common-dir", {
          cwd: worktreePath, timeout: 10_000,
        });
        const trimmed = commonDir.trim();
        if (trimmed.endsWith("/.git") || trimmed.endsWith("\\.git")) {
          mainRoot = trimmed.slice(0, -5);
        } else {
          const { stdout: toplevel } = await execRW("git rev-parse --show-toplevel", {
            cwd: worktreePath, timeout: 10_000,
          });
          mainRoot = toplevel.trim();
        }
      } catch {
        // If we can't find the root, try removing the directory directly
        const { rm } = await import("node:fs/promises");
        await rm(worktreePath, { recursive: true, force: true });
        return { ok: true };
      }

      try {
        await execRW(`git worktree remove "${worktreePath}" --force`, {
          cwd: mainRoot, timeout: 30_000,
        });
      } catch {
        // Fallback: remove directory directly
        const { rm } = await import("node:fs/promises");
        await rm(worktreePath, { recursive: true, force: true });
      }
      return { ok: true };
    }
    case "gh-check": {
      // Check whether GitHub CLI is installed and authenticated
      const { exec: execGhCheck } = await import("node:child_process");
      const { promisify: promisifyGhCheck } = await import("node:util");
      const execGhC = promisifyGhCheck(execGhCheck);
      const ghCheckEnv = ghCleanEnv();

      let installed = false;
      let authenticated = false;
      let username: string | null = null;

      try {
        await execGhC("gh --version", { timeout: 5_000 });
        installed = true;
      } catch { /* not installed */ }

      if (installed) {
        try {
          const { stdout, stderr } = await execGhC("gh auth status", { timeout: 10_000, env: ghCheckEnv });
          const out = (stdout ?? "") + (stderr ?? "");
          if (out.includes("Logged in")) {
            authenticated = true;
            const match = out.match(/Logged in to .+ account (\S+)/);
            if (match?.[1]) username = match[1];
          }
        } catch (err) {
          // gh auth status exits non-zero when not authenticated — check stderr
          const msg = err instanceof Error ? (err as { stderr?: string }).stderr ?? err.message : "";
          if (msg.includes("Logged in")) {
            authenticated = true;
            const match = msg.match(/Logged in to .+ account (\S+)/);
            if (match?.[1]) username = match[1];
          }
        }
      }

      return { installed, authenticated, username };
    }
    case "gh-pr-view": {
      // Check PR status for a given branch via gh cli
      const prBranch = params.branch as string;
      if (!prBranch) throw new Error("Missing branch parameter");

      const { exec: execGhPr } = await import("node:child_process");
      const { promisify: promisifyGhPr } = await import("node:util");
      const execGhP = promisifyGhPr(execGhPr);
      const prCwd = (params.cwd as string) || process.cwd();
      const parseGithubRemote = (raw: string | null): { owner: string; repo: string } | null => {
        if (!raw) return null;
        const normalized = raw
          .trim()
          .replace(/\.git$/, "")
          .replace(/^git@([^:]+):(.+)$/, "https://$1/$2")
          .replace(/^ssh:\/\/git@([^/]+)\/(.+)$/, "https://$1/$2");
        try {
          const url = new URL(normalized);
          if (!url.hostname.toLowerCase().includes("github")) return null;
          const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
          if (parts.length < 2) return null;
          return { owner: parts[0]!, repo: parts[1]! };
        } catch {
          return null;
        }
      };
      const remotes: string[] = await execGhP("git remote", { cwd: prCwd, timeout: 5_000 }).then(({ stdout }) => stdout.split("\n").map(line => line.trim()).filter(Boolean)).catch(() => []);
      const remoteName = remotes.includes("origin") ? "origin" : remotes[0];
      const remoteUrl = remoteName
        ? await execGhP(`git remote get-url "${remoteName}"`, { cwd: prCwd, timeout: 5_000 }).then(({ stdout }) => stdout.trim()).catch(() => "")
        : "";
      const githubRemote = parseGithubRemote(remoteUrl || null);
      const repoFlag = githubRemote ? ` --repo "${githubRemote.owner}/${githubRemote.repo}"` : "";

      try {
        const { stdout } = await execGhP(
          `gh pr view --head "${prBranch}"${repoFlag} --json number,title,url,state,baseRefName,headRefName`,
          { cwd: prCwd, timeout: 15_000 },
        );
        const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
        if (parsed.number) {
          const state = String(parsed.state ?? "OPEN").toUpperCase();
          return {
            number: Number(parsed.number),
            title: String(parsed.title ?? ""),
            url: String(parsed.url ?? ""),
            baseBranch: String(parsed.baseRefName ?? ""),
            headBranch: String(parsed.headRefName ?? ""),
            state: state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open",
          };
        }
      } catch { /* no PR found or gh error */ }
      return null;
    }
    case "gh-auth-token": {
      // Authenticate gh CLI using a personal access token
      const token = params.token as string;
      if (!token || typeof token !== "string") throw new Error("Missing token parameter");

      const { execSync: execGhSync } = await import("node:child_process");
      const cleanEnv = ghCleanEnv();

      execGhSync("gh auth login --with-token", {
        input: token,
        timeout: 30_000,
        env: cleanEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Verify authentication
      let username: string | null = null;
      try {
        const out = execGhSync("gh api user --jq .login", { timeout: 10_000, env: cleanEnv });
        username = out.toString().trim() || null;
      } catch { /* verification failed but auth might still be ok */ }

      return { ok: true, username };
    }
    case "gh-pr-checks": {
      // Fetch CI check statuses for a PR branch
      const checkBranch = params.branch as string;
      if (!checkBranch) throw new Error("Missing branch parameter");

      const { exec: execGhChk } = await import("node:child_process");
      const { promisify: promisifyGhChk } = await import("node:util");
      const execChk = promisifyGhChk(execGhChk);
      const checkCwd = (params.cwd as string) || process.cwd();
      const parseGithubRemote = (raw: string | null): { owner: string; repo: string } | null => {
        if (!raw) return null;
        const normalized = raw
          .trim()
          .replace(/\.git$/, "")
          .replace(/^git@([^:]+):(.+)$/, "https://$1/$2")
          .replace(/^ssh:\/\/git@([^/]+)\/(.+)$/, "https://$1/$2");
        try {
          const url = new URL(normalized);
          if (!url.hostname.toLowerCase().includes("github")) return null;
          const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
          if (parts.length < 2) return null;
          return { owner: parts[0]!, repo: parts[1]! };
        } catch {
          return null;
        }
      };
      const remotes: string[] = await execChk("git remote", { cwd: checkCwd, timeout: 5_000 }).then(({ stdout }) => stdout.split("\n").map(line => line.trim()).filter(Boolean)).catch(() => []);
      const remoteName = remotes.includes("origin") ? "origin" : remotes[0];
      const remoteUrl = remoteName
        ? await execChk(`git remote get-url "${remoteName}"`, { cwd: checkCwd, timeout: 5_000 }).then(({ stdout }) => stdout.trim()).catch(() => "")
        : "";
      const githubRemote = parseGithubRemote(remoteUrl || null);
      const repoFlag = githubRemote ? ` --repo "${githubRemote.owner}/${githubRemote.repo}"` : "";

      try {
        const { stdout } = await execChk(
          `gh pr checks "${checkBranch}"${repoFlag} --json name,state,conclusion,startedAt,completedAt,detailsUrl`,
          { cwd: checkCwd, timeout: 15_000 },
        );
        return JSON.parse(stdout.trim());
      } catch {
        return [];
      }
    }
    default:
      throw new Error(`Unknown filesystem operation: ${op}`);
  }
});

// ── Remote interactive terminal handler ───────────────────────────────
// Starts an interactive shell on this desktop node for gateway-owned terminal
// surfaces. Output is forwarded to the renderer, which forwards it over WS.
ipcMain.handle("desktop:terminal-op", async (_event, op: string, params: Record<string, unknown>) => {
  const terminalId = String(params.terminalId ?? "");
  if (!terminalId) throw new Error("Missing terminalId");

  switch (op) {
    case "start": {
      if (remoteTerminalSessions.has(terminalId)) {
        const existing = remoteTerminalSessions.get(terminalId)!;
        return { ok: true, pid: existing.pty.pid ?? null, shell: existing.shell };
      }
      const cwd = path.resolve(String(params.projectRoot ?? process.cwd()));
      if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
        throw new Error(`Project path does not exist on this node: ${cwd}`);
      }
      const shellName = shouldUseRequestedShell(params.shell as string | undefined)
        ? String(params.shell)
        : defaultRemoteTerminalShell();
      const cols = typeof params.cols === "number" ? params.cols : 120;
      const rows = typeof params.rows === "number" ? params.rows : 30;
      const isGitBash = /Git[/\\].*bash\.exe$/i.test(shellName);
      const pty = loadNodePty().spawn(shellName, remoteTerminalShellArgs(shellName), {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env: { ...process.env, TERM: "xterm-256color" },
        ...(process.platform === "win32" ? { useConpty: !isGitBash } : {}),
      });
      pty.onData((data) => sendTerminalOutputEvent(terminalId, data));
      pty.onExit((event) => {
        remoteTerminalSessions.delete(terminalId);
        sendTerminalExitEvent(terminalId, event.exitCode, event.signal ?? null);
      });
      remoteTerminalSessions.set(terminalId, { terminalId, pty, cwd, shell: shellName, cols, rows });
      return { ok: true, pid: pty.pid ?? null, shell: shellName };
    }
    case "input": {
      const session = remoteTerminalSessions.get(terminalId);
      if (!session) return { ok: false, message: "Terminal is not running" };
      session.pty.write(String(params.data ?? ""));
      return { ok: true };
    }
    case "resize": {
      const session = remoteTerminalSessions.get(terminalId);
      if (!session) return { ok: false, message: "Terminal is not running" };
      session.cols = typeof params.cols === "number" ? params.cols : session.cols;
      session.rows = typeof params.rows === "number" ? params.rows : session.rows;
      session.pty.resize(session.cols, session.rows);
      return { ok: true };
    }
    case "stop": {
      const session = remoteTerminalSessions.get(terminalId);
      if (session) {
        remoteTerminalSessions.delete(terminalId);
        session.pty.kill();
      }
      return { ok: true };
    }
    default:
      throw new Error(`Unknown terminal operation: ${op}`);
  }
});

// ── Remote tool execution handler ─────────────────────────────────────
// Executes Jait tool calls on behalf of the gateway when the project
// lives on this desktop node. Supports terminal.run (via child_process),
// file.read/write/patch/list/stat, os.query, and search tools.
ipcMain.handle("desktop:tool-op", async (
  _event,
  tool: string,
  args: Record<string, unknown>,
  meta: { sessionId?: string; projectRoot?: string },
) => {
  const { resolve, dirname, basename } = await import("node:path");
  const { promisify } = await import("node:util");
  const { exec: execAsync } = await import("node:child_process");
  const execP = promisify(execAsync);
  const cwd = meta.projectRoot ? resolve(meta.projectRoot) : process.cwd();

  switch (tool) {
    // ── Terminal execution ──────────────────────────────────────────
    // Aliases: the core "execute" tool, canonical "terminal.run", and the
    // "jait.terminal" standard tool all run a one-shot command on the node.
    // (See REMOTE_EXECUTABLE_TOOLS in packages/gateway/src/tools/remote-executor.ts.)
    case "execute":
    case "terminal.run":
    case "jait.terminal": {
      const command = String(args.command ?? "");
      if (!command) return { ok: false, message: "No command provided" };
      const timeout = typeof args.timeout === "number" ? args.timeout : 30_000;
      const cmdCwd = args.cwd ? resolve(String(args.cwd)) : cwd;
      try {
        const { stdout, stderr } = await execP(command, {
          cwd: cmdCwd,
          timeout: timeout || 120_000,
          maxBuffer: 10 * 1024 * 1024,
          env: process.env as Record<string, string>,
          shell: process.platform === "win32" ? "powershell.exe" : "/bin/bash",
        });
        const output = (stdout + (stderr ? `\n${stderr}` : "")).trim();
        return { ok: true, message: output || "Command completed with no output" };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
        const output = ((e.stdout ?? "") + (e.stderr ? `\n${e.stderr}` : "")).trim();
        return { ok: false, message: output || e.message || "Command failed" };
      }
    }

    // ── File read ──────────────────────────────────────────────────
    case "read":
    case "file.read": {
      const filePath = resolve(String(args.path ?? ""));
      try {
        const content = await readFile(filePath, "utf-8");
        return { ok: true, message: content };
      } catch (err) {
        return { ok: false, message: `Failed to read: ${(err as Error).message}` };
      }
    }

    // ── File edit/write ────────────────────────────────────────────
    case "edit": {
      const filePath = resolve(String(args.path ?? ""));
      try {
        if (args.search != null) {
          if (args.replace == null) {
            return { ok: false, message: "Patch mode requires both search and replace" };
          }
          const search = String(args.search);
          if (!search) return { ok: false, message: "No search string provided" };
          const replace = String(args.replace);
          const original = await readFile(filePath, "utf-8");
          if (!original.includes(search)) {
            return { ok: false, message: "Search string not found in file" };
          }
          const updated = original.replace(search, replace);
          await writeFile(filePath, updated, "utf-8");
          return { ok: true, message: `Patched ${basename(filePath)}` };
        }
        if (typeof args.content !== "string") {
          return { ok: false, message: "Provide content to write, or search + replace to patch" };
        }
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, args.content, "utf-8");
        return { ok: true, message: `Wrote ${args.content.length} bytes to ${basename(filePath)}` };
      } catch (err) {
        return { ok: false, message: `Failed to edit: ${(err as Error).message}` };
      }
    }

    case "file.write": {
      const filePath = resolve(String(args.path ?? ""));
      if (typeof args.content !== "string") {
        return { ok: false, message: "File content is required" };
      }
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, args.content, "utf-8");
        return { ok: true, message: `Wrote ${args.content.length} bytes to ${basename(filePath)}` };
      } catch (err) {
        return { ok: false, message: `Failed to write: ${(err as Error).message}` };
      }
    }

    // ── File patch ─────────────────────────────────────────────────
    case "file.patch": {
      const filePath = resolve(String(args.path ?? ""));
      const find = String(args.find ?? args.search ?? "");
      const replace = String(args.replace ?? "");
      if (!find) return { ok: false, message: "No search string provided" };
      try {
        const original = await readFile(filePath, "utf-8");
        if (!original.includes(find)) {
          return { ok: false, message: "Search string not found in file" };
        }
        const updated = original.replace(find, replace);
        await writeFile(filePath, updated, "utf-8");
        return { ok: true, message: `Patched ${basename(filePath)}` };
      } catch (err) {
        return { ok: false, message: `Failed to patch: ${(err as Error).message}` };
      }
    }

    // ── File list ──────────────────────────────────────────────────
    case "file.list": {
      const dirPath = resolve(String(args.path ?? cwd));
      try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        const list = entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
        return { ok: true, message: list.join("\n"), data: list };
      } catch (err) {
        return { ok: false, message: `Failed to list: ${(err as Error).message}` };
      }
    }

    // ── File stat ──────────────────────────────────────────────────
    case "file.stat": {
      const filePath = resolve(String(args.path ?? ""));
      try {
        const info = await fsStat(filePath);
        const data = {
          size: info.size,
          isDirectory: info.isDirectory(),
          modified: info.mtime.toISOString(),
        };
        return { ok: true, message: `${info.isDirectory() ? "directory" : "file"}, ${info.size} bytes`, data };
      } catch (err) {
        return { ok: false, message: `Failed to stat: ${(err as Error).message}` };
      }
    }

    // ── Content search (grep-like) ─────────────────────────────────
    case "search":
    case "file.search": {
      const pattern = String(args.pattern ?? args.query ?? "");
      const searchPath = resolve(String(args.path ?? cwd));
      if (!pattern) return { ok: false, message: "No search pattern provided" };
      try {
        // Use git grep if inside a repo, otherwise use findstr/grep
        const isGitRepo = await execP("git rev-parse --is-inside-work-tree", {
          cwd: searchPath, timeout: 5000,
        }).then(() => true).catch(() => false);

        let output: string;
        if (isGitRepo) {
          const { stdout } = await execP(
            `git grep -n -I --max-count=50 ${JSON.stringify(pattern)}`,
            { cwd: searchPath, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 },
          );
          output = stdout.trim();
        } else if (process.platform === "win32") {
          const { stdout } = await execP(
            `findstr /s /n /i ${JSON.stringify(pattern)} *`,
            { cwd: searchPath, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 },
          );
          output = stdout.trim();
        } else {
          const { stdout } = await execP(
            `grep -rn --max-count=50 ${JSON.stringify(pattern)} .`,
            { cwd: searchPath, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 },
          );
          output = stdout.trim();
        }
        return { ok: true, message: output || "No matches found" };
      } catch {
        return { ok: true, message: "No matches found" };
      }
    }

    // ── OS query ───────────────────────────────────────────────────
    case "os.query": {
      try {
        const os = await import("node:os");
        const data: Record<string, unknown> = {
          platform: os.platform(),
          arch: os.arch(),
          hostname: os.hostname(),
          cpus: os.cpus().length,
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          uptime: os.uptime(),
          homedir: os.homedir(),
          tmpdir: os.tmpdir(),
        };
        return { ok: true, message: JSON.stringify(data, null, 2), data };
      } catch (err) {
        return { ok: false, message: `OS query failed: ${(err as Error).message}` };
      }
    }

    // ── Image view (read a binary file as base64) ────────────────
    case "image.view": {
      const filePath = resolve(String(args.path ?? ""));
      try {
        const buffer = await readFile(filePath);
        return {
          ok: true,
          message: `Read ${buffer.length} bytes from ${basename(filePath)}`,
          data: { path: filePath, base64: buffer.toString("base64"), size: buffer.length },
        };
      } catch (err) {
        return { ok: false, message: `Failed to read image: ${(err as Error).message}` };
      }
    }

    default:
      return { ok: false, message: `Tool '${tool}' is not supported for remote execution on this node` };
  }
});

// ── Auto-updater ──────────────────────────────────────────────────────
function initAutoUpdater(): void {
  if (IS_DEV) return; // Skip in development

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    mainWindow?.webContents.send("update:checking");
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    mainWindow?.webContents.send("update:available", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
    });
  });

  autoUpdater.on("update-not-available", () => {
    mainWindow?.webContents.send("update:not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update:download-progress", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    mainWindow?.webContents.send("update:downloaded", {
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update:error", err.message);
  });

  // Check for updates after a short delay, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

// ── Auto-updater IPC ──────────────────────────────────────────────────
ipcMain.handle("update:check", async () => {
  if (IS_DEV) return { updateAvailable: false };
  try {
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version;
    const currentVersion = app.getVersion();
    const hasUpdate = !!latestVersion && latestVersion !== currentVersion;
    return { updateAvailable: hasUpdate, version: latestVersion };
  } catch (err) {
    return { updateAvailable: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("update:download", async () => {
  await autoUpdater.downloadUpdate();
  return { ok: true };
});

ipcMain.handle("update:install", () => {
  autoUpdater.quitAndInstall();
});

// ── App lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Set up CSP for screen sharing
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' ws: wss: http: https: data: blob:;",
        ],
      },
    });
  });

  // Handle getDisplayMedia() requests from the renderer.
  // This auto-selects the primary screen so screen sharing works
  // programmatically without requiring a user gesture / picker dialog.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const { desktopCapturer } = await import("electron");
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    // Pick the first screen source (primary display)
    const primaryScreen = sources[0];
    if (primaryScreen) {
      callback({ video: primaryScreen, audio: "loopback" });
    } else {
      callback({});
    }
  });

  splashWindow = createSplashWindow();
  mainWindow = createMainWindow();
  await loadApp(mainWindow);
  createTray();
  initAutoUpdater();

  app.on("activate", () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      splashWindow = createSplashWindow();
      mainWindow = createMainWindow();
      void loadApp(mainWindow);
    }
  });
});

// ── GPU-process crash recovery ──────────────────────────────────────────
// A dead GPU process leaves the window blank/gray with content never painted.
// Reload the main window once so the user isn't stuck on a dead surface.
app.on("child-process-gone", (_event, details) => {
  if (details.type !== "GPU") return;
  console.error(`[electron] gpu child process gone: ${details.reason} (exitCode=${details.exitCode})`);
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  void loadApp(win);
});

app.on("before-quit", () => {
  isQuitting = true;
  for (const sessionId of [...remoteProviderSessions.keys()]) {
    stopRemoteProviderSession(sessionId);
  }
  for (const session of remoteTerminalSessions.values()) {
    try { session.pty.kill(); } catch { /* already exited */ }
  }
  remoteTerminalSessions.clear();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
