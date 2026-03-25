const allowedIpcChannels = require("./preload-allow-list.cjs");
/**
 * Jait Desktop — Preload script
 *
 * Exposes a safe IPC bridge to the renderer (web app) via contextBridge.
 * The renderer can call window.jaitDesktop.* to access Electron-only features.
 *
 * This file uses .cts (CommonJS TypeScript) because Electron loads preload
 * scripts via require() internally, even in ESM projects.
 */

import electron = require("electron");
const { contextBridge, ipcRenderer, webUtils } = electron;

// Read gateway URL and opened folder synchronously from the main process command-line args.
// electron-main.ts passes them as --gateway-url=<url> and --open-folder=<path> for synchronous access.
const gatewayUrlArg = process.argv.find((a: string) => a.startsWith("--gateway-url="));
const syncGatewayUrl = gatewayUrlArg ? gatewayUrlArg.split("=").slice(1).join("=") : undefined;
const openFolderArg = process.argv.find((a: string) => a.startsWith("--open-folder="));
const syncOpenFolder = openFolderArg ? openFolderArg.split("=").slice(1).join("=") : undefined;

// Stored IPC listener ref — contextBridge wraps callbacks so we must track the
// real reference ourselves to make removeListener work.
let _gatewayEventCb: ((...args: unknown[]) => void) | null = null;

// Expose safe API to the renderer process
contextBridge.exposeInMainWorld("jaitDesktop", {
  /** Synchronous gateway URL — available immediately at page load */
  gatewayUrl: syncGatewayUrl,

  /** Folder path passed via CLI / "Open with Jait" context menu — available immediately */
  openFolder: syncOpenFolder,

  /** Listen for folder open events from second instances */
  onOpenFolder: (callback: (_event: unknown, folderPath: string) => void) => {
    ipcRenderer.on("desktop:open-folder", callback);
    return () => { ipcRenderer.removeListener("desktop:open-folder", callback); };
  },

  /** Get desktop info (platform, arch, gateway URL) — async */
  getInfo: () => ipcRenderer.invoke(allowedIpcChannels.invoke[0]),

  /** Get available screen/window sources for screen sharing */
  getDesktopSources: () => ipcRenderer.invoke(allowedIpcChannels.invoke[1]),

  /** Show a native notification */
  notify: (opts: { title: string; body: string }) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[2], opts),

  /** Show a native confirmation dialog for screen-share approval */
  confirmShare: (opts: { title: string; message: string }) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[3], opts) as Promise<{ accepted: boolean }>,

  /** Open a native directory picker and return the absolute path */
  pickDirectory: () =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[4]) as Promise<{ path: string } | null>,

  /** Browse a local directory (for remote fs node protocol) */
  browsePath: (dirPath: string) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[6], dirPath) as Promise<{
      path: string;
      parent: string | null;
      entries: { name: string; path: string; type: 'dir' | 'file' }[];
    }>,

  /** Get root drives / home directory */
  getRoots: () =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[7]) as Promise<{
      roots: { name: string; path: string; type: 'dir' | 'file' }[];
    }>,

  /** Execute a filesystem operation (stat, read, write, list, exists, mkdir, readdir) */
  fsOp: (op: string, params: Record<string, unknown>) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[8], op, params) as Promise<unknown>,

  /** Detect locally installed CLI providers (codex, claude-code) */
  detectProviders: () =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[9]) as Promise<string[]>,

  /** Execute a provider operation (start-session, send-turn, stop-session, etc.) */
  providerOp: (op: string, params: Record<string, unknown>) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[10], op, params) as Promise<unknown>,

  /** Execute a Jait tool on this node (terminal.run, file.read, etc.) */
  toolOp: (tool: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[11], tool, args, meta) as Promise<unknown>,

  /** Listen for screen-share commands from main process (tray, etc.) */
  onScreenShareStart: (callback: () => void) =>
    ipcRenderer.on(allowedIpcChannels.on[0], callback),
  onScreenShareStop: (callback: () => void) =>
    ipcRenderer.on(allowedIpcChannels.on[1], callback),

  /** Listen for gateway events from main process (provider child events, etc.) */
  // contextBridge wraps each callback independently, so the reference passed to
  // removeListener never matches the one passed to on(). We store the real ref
  // in the preload scope and always remove the previous listener first.
  onGatewayEvent: (callback: (_event: unknown, data: unknown) => void) => {
    if (_gatewayEventCb) ipcRenderer.removeListener(allowedIpcChannels.on[2], _gatewayEventCb);
    _gatewayEventCb = callback as (...args: unknown[]) => void;
    ipcRenderer.on(allowedIpcChannels.on[2], _gatewayEventCb);
  },
  removeGatewayEventListener: () => {
    if (_gatewayEventCb) {
      ipcRenderer.removeListener(allowedIpcChannels.on[2], _gatewayEventCb);
      _gatewayEventCb = null;
    }
  },

  /** Get the absolute filesystem path for a File object from a native drop/input */
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  /** Platform identifier */
  platform: "electron" as const,

  /** Window control functions (for custom titlebar) */
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("window:maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("window:is-maximized") as Promise<boolean>,
  onMaximizedChange: (callback: (_event: unknown, maximized: boolean) => void) => {
    ipcRenderer.on("window:maximized-change", callback);
    return () => { ipcRenderer.removeListener("window:maximized-change", callback); };
  },
  setTitleBarOverlay: (opts: { color?: string; symbolColor?: string; height?: number }) =>
    ipcRenderer.invoke("window:set-title-bar-overlay", opts),

  /** Get a persistent desktop setting */
  getSetting: (key: string, defaultValue?: unknown) =>
    ipcRenderer.invoke("desktop:get-setting", key, defaultValue) as Promise<unknown>,

  /** Set a persistent desktop setting */
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke("desktop:set-setting", key, value) as Promise<{ ok: boolean }>,

  /** Store a credential in the OS keychain (encrypted via safeStorage) */
  credentialStore: (key: string, value: string) =>
    ipcRenderer.invoke("credential:store", key, value) as Promise<{ ok: boolean; error?: string }>,

  /** Retrieve a credential from the OS keychain */
  credentialGet: (key: string) =>
    ipcRenderer.invoke("credential:get", key) as Promise<{ value: string | null }>,

  /** Clear a credential from the OS keychain */
  credentialClear: (key: string) =>
    ipcRenderer.invoke("credential:clear", key) as Promise<{ ok: boolean }>,

  // ── Auto-update API ────────────────────────────────────────────────
  /** Check for application updates */
  checkForUpdate: () =>
    ipcRenderer.invoke("update:check") as Promise<{ updateAvailable: boolean; version?: string; error?: string }>,

  /** Download the available update */
  downloadUpdate: () =>
    ipcRenderer.invoke("update:download") as Promise<{ ok: boolean }>,

  /** Quit and install the downloaded update */
  installUpdate: () =>
    ipcRenderer.invoke("update:install") as Promise<void>,

  /** Listen for update events from the main process */
  onUpdateEvent: (
    event: string,
    callback: (_event: unknown, data: unknown) => void,
  ) => {
    const channel = `update:${event}`;
    ipcRenderer.on(channel, callback);
    return () => { ipcRenderer.removeListener(channel, callback); };
  },
});
