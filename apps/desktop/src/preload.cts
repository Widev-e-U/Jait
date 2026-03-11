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
const { contextBridge, ipcRenderer } = electron;

// Read gateway URL synchronously from the main process command-line args.
// electron-main.ts passes it as --gateway-url=<url> for synchronous access.
const gatewayUrlArg = process.argv.find((a: string) => a.startsWith("--gateway-url="));
const syncGatewayUrl = gatewayUrlArg ? gatewayUrlArg.split("=").slice(1).join("=") : undefined;

// Stored IPC listener ref — contextBridge wraps callbacks so we must track the
// real reference ourselves to make removeListener work.
let _gatewayEventCb: ((...args: unknown[]) => void) | null = null;

// Expose safe API to the renderer process
contextBridge.exposeInMainWorld("jaitDesktop", {
  /** Synchronous gateway URL — available immediately at page load */
  gatewayUrl: syncGatewayUrl,

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

  /** Platform identifier */
  platform: "electron" as const,
});
