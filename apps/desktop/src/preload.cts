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

// Expose safe API to the renderer process
contextBridge.exposeInMainWorld("jaitDesktop", {
  /** Get desktop info (platform, arch, gateway URL) */
  getInfo: () => ipcRenderer.invoke("desktop:get-info"),

  /** Get available screen/window sources for screen sharing */
  getDesktopSources: () => ipcRenderer.invoke("desktop:get-sources"),

  /** Show a native notification */
  notify: (opts: { title: string; body: string }) =>
    ipcRenderer.invoke("desktop:notify", opts),

  /** Show a native confirmation dialog for screen-share approval */
  confirmShare: (opts: { title: string; message: string }) =>
    ipcRenderer.invoke("desktop:confirm-share", opts) as Promise<{ accepted: boolean }>,

  /** Listen for screen-share commands from main process (tray, etc.) */
  onScreenShareStart: (callback: () => void) =>
    ipcRenderer.on("screen-share:start", callback),
  onScreenShareStop: (callback: () => void) =>
    ipcRenderer.on("screen-share:stop", callback),

  /** Platform identifier */
  platform: "electron" as const,
});
