/**
 * Type declarations for the Electron preload bridge.
 * When running in Electron, `window.jaitDesktop` is available.
 * When running in a browser, it's undefined.
 */

export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

export interface DesktopInfo {
  platform: "win32" | "darwin" | "linux";
  arch: string;
  electronVersion: string;
  gatewayUrl: string;
  isPackaged: boolean;
}

export interface JaitDesktopBridge {
  getInfo: () => Promise<DesktopInfo>;
  getDesktopSources: () => Promise<DesktopSource[]>;
  notify: (opts: { title: string; body: string }) => Promise<{ ok: true }>;
  confirmShare: (opts: { title: string; message: string }) => Promise<{ accepted: boolean }>;
  onScreenShareStart: (callback: () => void) => void;
  onScreenShareStop: (callback: () => void) => void;
  platform: "electron";
}

declare global {
  interface Window {
    jaitDesktop?: JaitDesktopBridge;
  }
}
