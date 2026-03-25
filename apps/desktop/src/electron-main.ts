/**
 * Jait Desktop — Electron main process
 *
 * Loads the web app (Vite dev server in dev, built HTML in production)
 * inside an Electron BrowserWindow. Shares the exact same UI as @jait/web.
 */

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, shell, Notification, safeStorage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import electronUpdater, { type UpdateInfo } from "electron-updater";
const { autoUpdater } = electronUpdater;

// Remove the default application menu (File, Edit, View, etc.)
Menu.setApplicationMenu(null);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

let openedFolder = getOpenedFolderPath();
const startHidden = process.argv.includes("--hidden");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const detachedPreviewWindows = new Set<BrowserWindow>();

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

/** Whether the app should quit on window close vs minimize to tray. Default: false (minimize to tray). */
function shouldQuitOnClose(): boolean {
  return getSetting("closeOnWindowClose", false);
}

let isQuitting = false;

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
          // Tell the renderer to open this folder as a workspace
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
      additionalArguments: [
        `--gateway-url=${GATEWAY_URL}`,
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
    if (startHidden) return; // launched via auto-start — stay in tray
    win.maximize();
    win.show();
    win.focus();
    if (IS_DEV) win.webContents.openDevTools({ mode: "bottom" });
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
    // Allow same-origin navigations (hot-reload, SPA routing)
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return;
    event.preventDefault();
  });

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
  if (IS_DEV) {
    // In development, load from Vite dev server
    try {
      await win.loadURL(DEV_SERVER_URL);
      console.log(`Loaded dev server: ${DEV_SERVER_URL}`);
    } catch {
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

// ── Desktop settings IPC ──────────────────────────────────────────────
ipcMain.handle("desktop:get-setting", (_event, key: string, defaultValue?: unknown) => {
  return getSetting(key, defaultValue ?? null);
});
ipcMain.handle("desktop:set-setting", (_event, key: string, value: unknown) => {
  setSetting(key, value);
  return { ok: true };
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
ipcMain.handle("desktop:notify", (_event, opts: { title: string; body: string }) => {
  new Notification({ title: opts.title, body: opts.body }).show();
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
    title: "Open Workspace Directory",
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
function detectCliProviders(): string[] {
  const providers: string[] = [];
  const cmd = process.platform === "win32" ? "where" : "which";
  for (const bin of ["codex", "claude", "opencode", "gemini", "copilot"]) {
    try {
      execSync(`${cmd} ${bin}`, { stdio: "pipe", timeout: 5000 });
      providers.push(bin === "claude" ? "claude-code" : bin);
    } catch { /* not installed */ }
  }
  return providers;
}

ipcMain.handle("desktop:detect-providers", () => detectCliProviders());

// ── Remote provider runner ───────────────────────────────────────────
// Manages codex/claude-code child processes on behalf of the gateway.
// Each session spawns a child process and streams JSON-RPC events back.

interface RemoteProviderSession {
  child: ChildProcess | null;
  pendingRpc: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;
  nextRpcId: number;
  sessionId: string;
  providerId: "codex" | "claude-code";
  kind: "rpc" | "claude-print";
  workingDirectory: string;
  mode: string;
  model: string | null;
  env: Record<string, string>;
  mcpServers?: DesktopMcpServerRef[];
  mcpConfigPath?: string;
  stopRequested: boolean;
  pendingToolCalls: DesktopClaudePendingToolCall[];
}

interface DesktopClaudePendingToolCall {
  callId: string;
  rawTool: string;
  normalizedTool: string;
  args: Record<string, unknown>;
  providerCallId?: string;
}

const remoteProviderSessions = new Map<string, RemoteProviderSession>();

interface DesktopMcpServerRef {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

function getDesktopJaitMcpServers(servers?: DesktopMcpServerRef[]): DesktopMcpServerRef[] {
  if (servers?.length) return servers;
  return [{
    name: "jait",
    transport: "sse",
    url: new URL("/mcp", `${GATEWAY_URL.replace(/\/+$/, "")}/`).toString(),
  }];
}

function buildDesktopCodexMcpArgs(servers?: DesktopMcpServerRef[]): string[] {
  if (!servers?.length) return [];

  const args: string[] = [];
  for (const server of servers) {
    const prefix = `mcp_servers.${server.name}`;
    if (server.transport === "sse" && server.url) {
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
    if (server.transport === "sse" && server.url) {
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
    child.stdin?.write(msg);
  });
}

function rpcNotify(session: RemoteProviderSession, method: string, params?: unknown) {
  if (!session.child?.stdin?.writable) return;
  const msg = JSON.stringify({ method, params }) + "\n";
  session.child.stdin?.write(msg);
}

function sendProviderEvent(sessionId: string, notification: unknown) {
  mainWindow?.webContents.send("gateway:event", {
    type: "provider.event-from-child",
    sessionId,
    notification,
  });
}

function getClaudeModelOptions() {
  return [
    { id: "default", name: "Default", description: "Claude Code default model selection", isDefault: true },
    { id: "sonnet", name: "Sonnet", description: "Claude Sonnet alias for day-to-day coding" },
    { id: "opus", name: "Opus", description: "Claude Opus alias for the most capable model" },
    { id: "haiku", name: "Haiku", description: "Claude Haiku alias for faster lightweight tasks" },
    { id: "opusplan", name: "Opus Plan", description: "Planning-focused Claude alias" },
  ];
}

function mapClaudeStreamEvent(session: RemoteProviderSession, event: Record<string, unknown>) {
  const sessionId = session.sessionId;
  const type = typeof event.type === "string" ? event.type : "";
  switch (type) {
    case "assistant": {
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (typeof content === "string" && content) {
        return [{ type: "token", sessionId, content }];
      }
      if (Array.isArray(content)) {
        return content
          .filter((block) => (block as Record<string, unknown>)?.type === "text")
          .map((block) => ({
            type: "token",
            sessionId,
            content: String((block as Record<string, unknown>).text ?? ""),
          }));
      }
      return [];
    }
    case "content_block_delta": {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta") {
        return [{ type: "token", sessionId, content: String(delta.text ?? "") }];
      }
      return [];
    }
    case "tool_use": {
      const rawTool = String(event.name ?? event.tool ?? "");
      const normalizedTool = normalizeDesktopClaudeToolName(rawTool);
      const args = normalizeDesktopClaudeToolArgs(rawTool, (event.input as Record<string, unknown> | undefined) ?? {});
      const callId = extractDesktopClaudeToolCallId(event) ?? `${sessionId}-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      session.pendingToolCalls.push({
        callId,
        rawTool,
        normalizedTool,
        args,
        ...(extractDesktopClaudeProviderToolId(event) ? { providerCallId: extractDesktopClaudeProviderToolId(event) } : {}),
      });
      return [{
        type: "tool.start",
        sessionId,
        tool: normalizedTool,
        args,
        callId,
      }];
    }
    case "tool_result": {
      const match = resolveDesktopClaudePendingToolCall(session.pendingToolCalls, event);
      const rawTool = String(event.tool ?? match?.rawTool ?? "");
      return [{
        type: "tool.result",
        sessionId,
        tool: normalizeDesktopClaudeToolName(rawTool),
        ok: event.is_error !== true,
        message: String(event.content ?? event.output ?? ""),
        ...(match ? { callId: match.callId, data: match.args } : {}),
      }];
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

  args.push(message);

  const child = spawn("claude", args, {
    cwd: session.workingDirectory,
    env: session.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });

  session.child = child;
  session.stopRequested = false;
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
    const text = data.toString().trim();
    if (text) {
      console.error(`[claude-remote:${session.sessionId}] stderr: ${text}`);
    }
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
      const error = `Claude Code exited with code ${code}${signal ? ` (signal=${signal})` : ""}`;
      sendProviderEvent(session.sessionId, { type: "session.error", sessionId: session.sessionId, error });
      reject(new Error(error));
    });

    child.on("error", (err) => {
      session.child = null;
      sendProviderEvent(session.sessionId, { type: "session.error", sessionId: session.sessionId, error: err.message });
      reject(err);
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
    case "start-session": {
      const { sessionId, providerId, workingDirectory, mode, model, env: extraEnv, mcpServers } = params as {
        sessionId: string; providerId: string; workingDirectory: string;
        mode: string; model?: string; env?: Record<string, string>; mcpServers?: DesktopMcpServerRef[];
      };
      const resolvedMcpServers = getDesktopJaitMcpServers(mcpServers);

      if (providerId === "claude-code") {
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
          env: { ...process.env, ...extraEnv } as Record<string, string>,
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
        env: { ...process.env, ...extraEnv } as Record<string, string>,
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
        env: { ...process.env, ...extraEnv } as Record<string, string>,
        mcpServers: resolvedMcpServers,
        stopRequested: false,
        pendingToolCalls: [],
      };
      remoteProviderSessions.set(sessionId, sess);

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
          }
        } catch { /* non-JSON */ }
      });

      child.on("exit", () => {
        remoteProviderSessions.delete(sessionId);
        sendProviderEvent(sessionId, { method: "session/completed" });
      });

      // Initialize handshake
      try {
        const initResult = await rpcSend(sess, "initialize", {
          clientInfo: { name: "jait-remote", title: "Jait Remote Provider", version: "1.0.0" },
          capabilities: { experimentalApi: true },
        }, 45_000);
        rpcNotify(sess, "initialized");

        // Start thread
        const approvalPolicy = mode === "supervised" ? "on-failure" : "never";
        const sandbox = mode === "supervised" ? "workspace-write" : "danger-full-access";
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
        child.kill();
        remoteProviderSessions.delete(sessionId);
        throw err;
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
        return { ok: true };
      }
      await rpcSend(sess, "turn/start", {
        threadId: providerThreadId,
        input: [{ type: "text", text: message, text_elements: [] }],
      });
      return { ok: true };
    }
    case "stop-session": {
      const { sessionId } = params as { sessionId: string };
      const sess = remoteProviderSessions.get(sessionId);
      if (sess) {
        sess.stopRequested = true;
        sess.child?.kill("SIGTERM");
        for (const p of sess.pendingRpc.values()) {
          clearTimeout(p.timer);
          p.reject(new Error("Session stopped"));
        }
        remoteProviderSessions.delete(sessionId);
      }
      return { ok: true };
    }
    case "list-models": {
      const { providerId } = params as { providerId: string };
      if (providerId === "claude-code") {
        return getClaudeModelOptions();
      }

      const cmd = "codex";
      const args = ["app-server", ...buildDesktopCodexMcpArgs(getDesktopJaitMcpServers())];

      const child = spawn(cmd, args, {
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
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
        env: process.env as Record<string, string>,
        stopRequested: false,
        pendingToolCalls: [],
      };

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
        }, 15_000);
        rpcNotify(tmpSess, "initialized");
        const result = await rpcSend(tmpSess, "model/list", {}, 15_000);
        return result;
      } finally {
        child.kill("SIGTERM");
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

// ── Generic filesystem operation handler (for remote workspace ops) ──────────
ipcMain.handle("desktop:fs-op", async (_event, op: string, params: Record<string, unknown>) => {
  const { resolve, dirname, join, relative } = await import("node:path");

  /** Build a clean env with GH_TOKEN/GITHUB_TOKEN removed so gh uses stored keyring credentials. */
  const ghCleanEnv = (): NodeJS.ProcessEnv => {
    const { GH_TOKEN, GITHUB_TOKEN, ...rest } = process.env;
    return rest;
  };

  const runWorkspaceSearch = async (
    workspaceRoot: string,
    query: string,
    mode: "files" | "content",
    maxResults: number,
  ) => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const safeDir = workspaceRoot.replace(/"/g, '\\"');
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
            file: relative(workspaceRoot, match[1]!).replace(/\\/g, "/"),
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
        const relPath = relative(workspaceRoot, absPath.trim()).replace(/\\/g, "/");
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
      const content = await readFile(filePath, "utf-8");
      return { content, size: content.length };
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
    case "search-workspace": {
      const workspaceRoot = resolve(params.path as string);
      const query = String(params.query ?? "");
      const mode = params.mode === "content" ? "content" : "files";
      const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
      return runWorkspaceSearch(workspaceRoot, query, mode, limit);
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
      const content = await readFile(filePath, "utf-8");
      return { content };
    }
    case "git-file-diffs": {
      // Compound operation: return per-file original/modified content for Monaco diff
      const cwd = resolve(params.cwd as string);
      const baseBranch = params.baseBranch as string | undefined;
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

      if (baseBranch) {
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
            try { modified = await readFile(join(cwd, filePath), "utf-8"); } catch { /* deleted */ }
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
            try { modified = await readFile(join(cwd, filePath), "utf-8"); } catch { /* */ }
          }
          entries.push({ path: filePath, original, modified, status });
        }
      }

      // Include untracked files not already listed
      const porcelainAll = await gitExecLocal("status --porcelain").catch(() => "");
      for (const pl of porcelainAll.split("\n").filter(Boolean)) {
        if (!pl.startsWith("??")) continue;
        const fp = pl.slice(3).trim();
        if (!fp || seen.has(fp)) continue;
        seen.add(fp);
        let modified = "";
        try { modified = await readFile(join(cwd, fp), "utf-8"); } catch { /* */ }
        entries.push({ path: fp, original: "", modified, status: "?" });
      }

      return entries;
    }
    case "git-stacked-action": {
      // Compound operation: commit → push → create PR, matching GitStepResult format
      const cwd = resolve(params.cwd as string);
      const action = params.action as string; // "commit" | "commit_push" | "commit_push_pr"
      const commitMessage = params.commitMessage as string | undefined;
      const featureBranch = params.featureBranch as boolean | undefined;
      const baseBranch = params.baseBranch as string | undefined;
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

      const ghIsAvailable = async () => {
        try { await execP("gh --version", { cwd, timeout: 5_000, env: ghCleanEnv() }); return true; } catch { return false; }
      };

      const result: Record<string, unknown> = {
        commit: { status: "skipped_no_changes" },
        push: { status: "skipped_not_requested" },
        branch: { status: "skipped_not_requested" },
        pr: { status: "skipped_not_requested" },
      };

      // Optionally create a feature branch
      if (featureBranch) {
        const timestamp = Date.now().toString(36);
        const branchName = `feature/auto-${timestamp}`;
        await gitExecLocal(`checkout -b "${branchName}"`);
        result.branch = { status: "created", name: branchName };
      }

      const currentBranch = await gitExecLocal("rev-parse --abbrev-ref HEAD").catch(() => null);

      // Commit step
      const porcelain = await gitExecLocal("status --porcelain").catch(() => "");
      if (porcelain.length > 0) {
        await gitExecLocal("add -A");
        let msg = commitMessage?.trim();
        if (!msg) {
          try {
            const diffSummary = await gitExecLocal("diff --cached --stat");
            msg = `chore: auto-commit ${diffSummary.split("\n").length} file(s) changed`;
          } catch { msg = "chore: auto-commit changes"; }
        }
        await gitExecLocal(`commit -m "${msg.replace(/"/g, '\\"')}"`);
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

        if (hasUpstream) {
          try {
            await gitExecLocal("push --no-verify", 60_000);
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
            // Check if PR already exists
            try {
              const existing = await ghExecLocal(`pr view "${currentBranch}" --json number,url,title,state,baseRefName,headRefName`);
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
            const resolvedBase = baseBranch || await gitExecLocal("symbolic-ref refs/remotes/origin/HEAD").then(r => r.replace("refs/remotes/origin/", "").trim()).catch(() => "main");
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
              const baseFlag = baseBranch ? ` --base "${baseBranch}"` : "";
              // If the branch wasn't pushed yet, push it now before creating the PR
              if ((result.push as Record<string, unknown>).status !== "pushed") {
                try {
                  const remotes = (await gitExecLocal("remote").catch(() => "")).split("\n").map(r => r.trim()).filter(Boolean);
                  const remote = remotes.includes("origin") ? "origin" : remotes[0];
                  if (remote) {
                    await gitExecLocal(`push --no-verify --set-upstream "${remote}" "${currentBranch}"`, 60_000);
                    result.push = { status: "pushed", branch: currentBranch, upstreamBranch: `${remote}/${currentBranch}`, setUpstream: true };
                  }
                } catch { /* push failed — gh pr create may still work */ }
              }
              const prUrl = await ghExecLocal(
                `pr create --title "${prTitle.replace(/"/g, '\\"')}" --body-file "${bodyFile}"${baseFlag}`,
                60_000,
              );

              // Fetch PR details
              let prNumber = 0;
              let prBaseBranch = baseBranch ?? "";
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

      try {
        const { stdout } = await execGhP(
          `gh pr view "${prBranch}" --json number,title,url,state,baseRefName,headRefName`,
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

      try {
        const { stdout } = await execChk(
          `gh pr checks "${checkBranch}" --json name,state,conclusion,startedAt,completedAt,detailsUrl`,
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

// ── Remote tool execution handler ─────────────────────────────────────
// Executes Jait tool calls on behalf of the gateway when the workspace
// lives on this desktop node. Supports terminal.run (via child_process),
// file.read/write/patch/list/stat, os.query, and search tools.
ipcMain.handle("desktop:tool-op", async (
  _event,
  tool: string,
  args: Record<string, unknown>,
  meta: { sessionId?: string; workspaceRoot?: string },
) => {
  const { resolve, dirname, basename } = await import("node:path");
  const { promisify } = await import("node:util");
  const { exec: execAsync } = await import("node:child_process");
  const execP = promisify(execAsync);
  const cwd = meta.workspaceRoot ? resolve(meta.workspaceRoot) : process.cwd();

  switch (tool) {
    // ── Terminal execution ──────────────────────────────────────────
    case "execute":
    case "terminal.run": {
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

    // ── File write ─────────────────────────────────────────────────
    case "edit":
    case "file.write": {
      const filePath = resolve(String(args.path ?? ""));
      const content = String(args.content ?? "");
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf-8");
        return { ok: true, message: `Wrote ${content.length} bytes to ${basename(filePath)}` };
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

  mainWindow = createMainWindow();
  await loadApp(mainWindow);
  createTray();
  initAutoUpdater();

  app.on("activate", () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      loadApp(mainWindow);
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
