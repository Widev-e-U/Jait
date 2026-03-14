/**
 * Jait Desktop — Electron main process
 *
 * Loads the web app (Vite dev server in dev, built HTML in production)
 * inside an Electron BrowserWindow. Shares the exact same UI as @jait/web.
 */

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { autoUpdater, type UpdateInfo } from "electron-updater";

// Remove the default application menu (File, Edit, View, etc.)
Menu.setApplicationMenu(null);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ─────────────────────────────────────────────────────
const GATEWAY_URL = process.env["JAIT_GATEWAY_URL"] ?? "http://localhost:8000";
const DEV_SERVER_URL = process.env["JAIT_WEB_DEV_URL"] ?? "http://localhost:3000";
const IS_DEV = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// ── Persistent settings ───────────────────────────────────────────────
const settingsPath = path.join(app.getPath("userData"), "desktop-settings.json");

function loadSettings(): Record<string, unknown> {
  try {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    return JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch { return {}; }
}

function saveSettings(settings: Record<string, unknown>): void {
  const { writeFileSync, mkdirSync } = require("node:fs") as typeof import("node:fs");
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
      additionalArguments: [`--gateway-url=${GATEWAY_URL}`],
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

  // Graceful show once ready
  win.once("ready-to-show", () => {
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
ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
ipcMain.handle("window:set-title-bar-overlay", (_event, opts: { color?: string; symbolColor?: string; height?: number }) => {
  mainWindow?.setTitleBarOverlay(opts);
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

  /** Build a clean env with GH_TOKEN/GITHUB_TOKEN removed so gh uses stored keyring credentials. */
  const ghCleanEnv = (): NodeJS.ProcessEnv => {
    const { GH_TOKEN, GITHUB_TOKEN, ...rest } = process.env;
    return rest;
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
            await gitExecLocal("push", 60_000);
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
            await gitExecLocal(`push --set-upstream "${remote}" "${currentBranch}"`, 60_000);
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
            prBody += `\n---\n*PR created by [Jait](https://github.com/JakobWl/Jait) automation.*`;

            // Write body to temp file to avoid shell escaping issues
            const bodyFile = join(tmpdir(), `jait-pr-body-${Date.now()}.md`);
            await writeTmpFile(bodyFile, prBody, "utf-8");
            try {
              const baseFlag = baseBranch ? ` --base "${baseBranch}"` : "";
              const pushFlag = (result.push as Record<string, unknown>).status !== "pushed" ? " --push" : "";
              const prUrl = await ghExecLocal(
                `pr create --title "${prTitle.replace(/"/g, '\\"')}" --body-file "${bodyFile}"${baseFlag}${pushFlag}`,
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
              if ((result.push as Record<string, unknown>).status !== "pushed") {
                result.push = { status: "pushed", branch: currentBranch };
              }
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
    default:
      throw new Error(`Unknown filesystem operation: ${op}`);
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
    return { updateAvailable: !!result?.updateInfo, version: result?.updateInfo?.version };
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
