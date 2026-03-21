"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
const electron = require("electron");
const { contextBridge, ipcRenderer } = electron;
// Expose safe API to the renderer process
contextBridge.exposeInMainWorld("jaitDesktop", {
    /** Get desktop info (platform, arch, gateway URL) */
    getInfo: () => ipcRenderer.invoke(allowedIpcChannels.invoke[0]),
    /** Get available screen/window sources for screen sharing */
    getDesktopSources: () => ipcRenderer.invoke(allowedIpcChannels.invoke[1]),
    /** Show a native notification */
    notify: (opts) => ipcRenderer.invoke(allowedIpcChannels.invoke[2], opts),
    /** Show a native confirmation dialog for screen-share approval */
    confirmShare: (opts) => ipcRenderer.invoke(allowedIpcChannels.invoke[3], opts),
    /** Open a native directory picker and return the absolute path */
    pickDirectory: () => ipcRenderer.invoke(allowedIpcChannels.invoke[4]),
    /** Browse a local directory (for remote fs node protocol) */
    browsePath: (dirPath) => ipcRenderer.invoke(allowedIpcChannels.invoke[6], dirPath),
    /** Get root drives / home directory */
    getRoots: () => ipcRenderer.invoke(allowedIpcChannels.invoke[7]),
    /** Open a detached workspace window. */
    openWorkspaceWindow: (opts) => ipcRenderer.invoke(allowedIpcChannels.invoke[8], opts),
    /** Listen for screen-share commands from main process (tray, etc.) */
    onScreenShareStart: (callback) => ipcRenderer.on(allowedIpcChannels.on[0], callback),
    onScreenShareStop: (callback) => ipcRenderer.on(allowedIpcChannels.on[1], callback),
    /** Platform identifier */
    platform: "electron",
});
//# sourceMappingURL=preload.cjs.map
