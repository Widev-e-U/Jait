/**
 * Jait Desktop — Electron main process
 *
 * Loads the web app (Vite dev server in dev, built HTML in production)
 * inside an Electron BrowserWindow. Shares the exact same UI as @jait/web.
 */

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Remove the default application menu (File, Edit, View, etc.)
Menu.setApplicationMenu(null);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ─────────────────────────────────────────────────────
const GATEWAY_URL = process.env["JAIT_GATEWAY_URL"] ?? "http://localhost:8000";
const DEV_SERVER_URL = process.env["JAIT_WEB_DEV_URL"] ?? "http://localhost:3000";
const IS_DEV = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// ── Window creation ───────────────────────────────────────────────────
function createMainWindow(): BrowserWindow {
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
      additionalArguments: [`--gateway-url=${GATEWAY_URL}`],
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#09090b",
    show: false,
  });

  // Graceful show once ready
  win.once("ready-to-show", () => {
    win.show();
    if (IS_DEV) win.webContents.openDevTools({ mode: "bottom" });
  });

  win.on("closed", () => {
    mainWindow = null;
  });

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
    // In production, load the built web app
    const indexPath = path.join(__dirname, "..", "..", "web", "dist", "index.html");
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
    { label: "Show Jait", click: () => mainWindow?.show() },
    { type: "separator" },
    {
      label: "Screen Share",
      submenu: [
        { label: "Start Sharing", click: () => mainWindow?.webContents.send("screen-share:start") },
        { label: "Stop Sharing", click: () => mainWindow?.webContents.send("screen-share:stop") },
      ],
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}

// ── IPC handlers ──────────────────────────────────────────────────────

// Expose device info to the renderer
ipcMain.handle("desktop:get-info", () => ({
  platform: process.platform as "win32" | "darwin" | "linux",
  arch: process.arch,
  electronVersion: process.versions.electron,
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
  const { Notification } = require("electron") as typeof import("electron");
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
  for (const bin of ["codex", "claude"]) {
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
  child: ChildProcess;
  pendingRpc: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;
  nextRpcId: number;
  sessionId: string;
}

const remoteProviderSessions = new Map<string, RemoteProviderSession>();

function rpcSend(session: RemoteProviderSession, method: string, params?: unknown, timeoutMs = 60_000): Promise<unknown> {
  const id = session.nextRpcId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pendingRpc.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    session.pendingRpc.set(id, { resolve, reject, timer });
    const msg = JSON.stringify({ method, id, params }) + "\n";
    session.child.stdin?.write(msg);
  });
}

function rpcNotify(session: RemoteProviderSession, method: string, params?: unknown) {
  const msg = JSON.stringify({ method, params }) + "\n";
  session.child.stdin?.write(msg);
}

ipcMain.handle("desktop:provider-op", async (_event, op: string, params: Record<string, unknown>) => {
  switch (op) {
    case "start-session": {
      const { sessionId, providerId, workingDirectory, mode, model, env: extraEnv } = params as {
        sessionId: string; providerId: string; workingDirectory: string;
        mode: string; model?: string; env?: Record<string, string>;
      };

      const cmd = providerId === "claude-code" ? "claude" : "codex";
      const args = providerId === "claude-code" ? ["--json"] : ["app-server"];

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
            mainWindow?.webContents.send("gateway:event", {
              type: "provider.event-from-child",
              sessionId,
              notification: msg,
            });
          }
        } catch { /* non-JSON */ }
      });

      child.on("exit", () => {
        remoteProviderSessions.delete(sessionId);
        mainWindow?.webContents.send("gateway:event", {
          type: "provider.event-from-child",
          sessionId,
          notification: { method: "session/completed" },
        });
      });

      // Initialize handshake
      try {
        const initResult = await rpcSend(sess, "initialize", {
          clientInfo: { name: "jait-remote", title: "Jait Remote Provider", version: "1.0.0" },
          capabilities: { experimentalApi: true },
        }, 45_000);
        rpcNotify(sess, "initialized");

        // Start thread
        const approvalPolicy = mode === "supervised" ? "on-failure" : "unless-allow-listed";
        const sandbox = mode === "supervised" ? "permissive" : "none";
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
        sess.child.kill("SIGTERM");
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
      const cmd = providerId === "claude-code" ? "claude" : "codex";
      const args = providerId === "claude-code" ? ["--json"] : ["app-server"];

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
  const { resolve, dirname, join } = await import("node:path");

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
    default:
      throw new Error(`Unknown filesystem operation: ${op}`);
  }
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

  app.on("activate", () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      loadApp(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
