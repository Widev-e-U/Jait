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
  /** Browse a directory on the local filesystem (for remote fs node) */
  browsePath: (dirPath: string) => Promise<{ path: string; parent: string | null; entries: { name: string; path: string; type: 'dir' | 'file' }[] }>;
  /** Get root drives / home directory */
  getRoots: () => Promise<{ roots: { name: string; path: string; type: 'dir' | 'file' }[] }>;
  onScreenShareStart: (callback: () => void) => void;
  onScreenShareStop: (callback: () => void) => void;
  platform: "electron";
  pickDirectory: () => Promise<{ path: string } | null>;
}

declare global {
  interface Window {
    jaitDesktop?: JaitDesktopBridge;
  }
}
