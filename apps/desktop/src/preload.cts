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
const deviceIdArg = process.argv.find((a: string) => a.startsWith("--device-id="));
const syncDeviceId = deviceIdArg ? deviceIdArg.split("=").slice(1).join("=") : undefined;
const jaitAppUrlArg = process.argv.find((a: string) => a.startsWith("--jait-app-url="));
const jaitAppUrl = jaitAppUrlArg ? jaitAppUrlArg.split("=").slice(1).join("=") : undefined;

type BrowserNavigationState = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

function isJaitRenderer(): boolean {
  if (location.protocol === "data:") return true;
  if (!jaitAppUrl) return true;
  if (jaitAppUrl === "file:") return location.protocol === "file:";

  try {
    return new URL(jaitAppUrl).origin === location.origin;
  } catch {
    return true;
  }
}

function installBrowserToolbar(): void {
  const mount = () => {
    if (!document.documentElement || document.getElementById("jait-browser-toolbar")) return;

    const host = document.createElement("div");
    host.id = "jait-browser-toolbar";
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "inset: 0 0 auto 0",
      "height: 44px",
      "z-index: 2147483647",
      "display: block",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "-webkit-app-region: drag",
    ].join(";");

    const shadow = host.attachShadow({ mode: "closed" });
    const leftInset = process.platform === "darwin" ? "78px" : "8px";
    const rightInset = process.platform === "win32" ? "148px" : "8px";
    const linuxWindowControls = process.platform === "linux"
      ? `
        <div class="window-controls">
          <button id="minimize" title="Minimize" aria-label="Minimize">−</button>
          <button id="maximize" title="Maximize" aria-label="Maximize">□</button>
          <button id="close" class="close" title="Close" aria-label="Close">×</button>
        </div>`
      : "";

    shadow.innerHTML = `
      <style>
        :host { color-scheme: dark; }
        * { box-sizing: border-box; }
        .toolbar {
          height: 44px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 ${rightInset} 0 ${leftInset};
          color: #f4f4f5;
          background: #202020;
          border-bottom: 1px solid #3f3f46;
          box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
        }
        button, input {
          -webkit-app-region: no-drag;
          font: inherit;
        }
        button {
          width: 32px;
          height: 30px;
          border: 0;
          border-radius: 6px;
          color: #f4f4f5;
          background: transparent;
          cursor: pointer;
          font-size: 19px;
          line-height: 1;
        }
        button:hover:not(:disabled) { background: #3f3f46; }
        button:disabled { color: #71717a; cursor: default; }
        form {
          min-width: 120px;
          flex: 1;
          margin: 0;
          -webkit-app-region: no-drag;
        }
        input {
          width: 100%;
          height: 30px;
          padding: 0 11px;
          border: 1px solid #52525b;
          border-radius: 7px;
          outline: 0;
          color: #fafafa;
          background: #18181b;
          font-size: 13px;
        }
        input:focus { border-color: #60a5fa; box-shadow: 0 0 0 1px #60a5fa; }
        input.invalid { border-color: #ef4444; box-shadow: 0 0 0 1px #ef4444; }
        .window-controls { display: flex; margin-left: 2px; }
        .window-controls button { border-radius: 0; }
        .window-controls .close:hover { background: #c42b1c; }
      </style>
      <div class="toolbar">
        <button id="home" title="Back to Jait" aria-label="Back to Jait">J</button>
        <button id="back" title="Back" aria-label="Back">←</button>
        <button id="forward" title="Forward" aria-label="Forward">→</button>
        <button id="reload" title="Reload" aria-label="Reload">↻</button>
        <form id="address-form">
          <input id="address" type="text" inputmode="url" autocomplete="off" spellcheck="false" aria-label="Address" />
        </form>
        ${linuxWindowControls}
      </div>
    `;

    const home = shadow.querySelector<HTMLButtonElement>("#home")!;
    const back = shadow.querySelector<HTMLButtonElement>("#back")!;
    const forward = shadow.querySelector<HTMLButtonElement>("#forward")!;
    const reload = shadow.querySelector<HTMLButtonElement>("#reload")!;
    const form = shadow.querySelector<HTMLFormElement>("#address-form")!;
    const address = shadow.querySelector<HTMLInputElement>("#address")!;

    const update = (state: BrowserNavigationState | null) => {
      if (!state) return;
      back.disabled = !state.canGoBack;
      forward.disabled = !state.canGoForward;
      reload.textContent = state.isLoading ? "×" : "↻";
      reload.title = state.isLoading ? "Stop loading" : "Reload";
      if (shadow.activeElement !== address) address.value = state.url;
    };

    home.addEventListener("click", () => { void ipcRenderer.invoke("browser:home"); });
    back.addEventListener("click", () => { void ipcRenderer.invoke("browser:back"); });
    forward.addEventListener("click", () => { void ipcRenderer.invoke("browser:forward"); });
    reload.addEventListener("click", () => { void ipcRenderer.invoke("browser:reload"); });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      address.classList.remove("invalid");
      void ipcRenderer.invoke("browser:navigate", address.value).then((result: { ok?: boolean } | null) => {
        if (!result?.ok) address.classList.add("invalid");
      });
    });
    shadow.querySelector<HTMLButtonElement>("#minimize")?.addEventListener("click", () => {
      void ipcRenderer.invoke("window:minimize");
    });
    shadow.querySelector<HTMLButtonElement>("#maximize")?.addEventListener("click", () => {
      void ipcRenderer.invoke("window:maximize");
    });
    shadow.querySelector<HTMLButtonElement>("#close")?.addEventListener("click", () => {
      void ipcRenderer.invoke("window:close");
    });

    ipcRenderer.on("browser:navigation-state", (_event, state: BrowserNavigationState) => update(state));
    document.documentElement.appendChild(host);
    void ipcRenderer.invoke("browser:get-navigation-state").then((state: BrowserNavigationState | null) => update(state));
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
}

// Stored IPC listener ref — contextBridge wraps callbacks so we must track the
// real reference ourselves to make removeListener work.
let _gatewayEventCb: ((...args: unknown[]) => void) | null = null;

// Expose privileged APIs only to the Jait renderer. External pages loaded in
// the same window receive navigation chrome but no filesystem/provider bridge.
if (isJaitRenderer()) {
  contextBridge.exposeInMainWorld("jaitDesktop", {
  /** Synchronous gateway URL — available immediately at page load */
  gatewayUrl: syncGatewayUrl,

  /** Folder path passed via CLI / "Open with Jait" context menu — available immediately */
  openFolder: syncOpenFolder,

  /**
   * Stable persistent device ID resolved by the main process from
   * desktop-settings.json — available synchronously so that projects created
   * on first render get a nodeId that matches the registered node (no race).
   */
  deviceId: syncDeviceId,

  /** Listen for folder open events from second instances */
  onOpenFolder: (callback: (_event: unknown, folderPath: string) => void) => {
    ipcRenderer.on("desktop:open-folder", callback);
    return () => { ipcRenderer.removeListener("desktop:open-folder", callback); };
  },

  /** Get desktop info (platform, arch, gateway URL) — async */
  getInfo: () => ipcRenderer.invoke(allowedIpcChannels.invoke[0]),

  /** Get available screen/window sources for screen sharing */
  getDesktopSources: () => ipcRenderer.invoke(allowedIpcChannels.invoke[1]),

  /**
   * Show a native notification. `id` is the attention key, so the same request
   * answered on another device can be revoked here by that key.
   */
  notify: (opts: { id?: string; title: string; body: string }) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[2], opts),

  /** Dismiss a notification previously shown with this id. */
  closeNotification: (id: string) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[33], { id }),

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

  /** Open a detached project/chat window. */
  openProjectWindow: (opts: { url: string; title?: string }) =>
    ipcRenderer.invoke('desktop:open-preview-window', opts) as Promise<{ ok: boolean }>,

  /** Execute a filesystem operation (stat, read, write, list, exists, mkdir, readdir) */
  fsOp: (op: string, params: Record<string, unknown>) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[8], op, params) as Promise<unknown>,

  /** Detect locally installed CLI providers (codex, claude-code) */
  detectProviders: () =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[9]) as Promise<Array<{ id: string; installed: boolean; authenticated: boolean | null; detail?: string }>>,

  /** Execute a provider operation (start-session, send-turn, stop-session, etc.) */
  providerOp: (op: string, params: Record<string, unknown>) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[10], op, params) as Promise<unknown>,

  /** Execute a Jait tool on this node (terminal.run, file.read, etc.) */
  toolOp: (tool: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
    ipcRenderer.invoke(allowedIpcChannels.invoke[11], tool, args, meta) as Promise<unknown>,

  /** Execute an interactive terminal operation on this node */
  terminalOp: (op: string, params: Record<string, unknown>) =>
    ipcRenderer.invoke('desktop:terminal-op', op, params) as Promise<unknown>,

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

  /** Get whether Jait is set to launch on PC startup (OS login item) */
  getLoginItem: () =>
    ipcRenderer.invoke("desktop:get-login-item") as Promise<{ enabled: boolean; supported: boolean }>,

  /** Enable/disable launching Jait on PC startup */
  setLoginItem: (enabled: boolean) =>
    ipcRenderer.invoke("desktop:set-login-item", enabled) as Promise<{ ok: boolean; enabled: boolean; error?: string }>,

  /** Store a credential in the OS keychain (encrypted via safeStorage) */
  credentialStore: (key: string, value: string) =>
    ipcRenderer.invoke("credential:store", key, value) as Promise<{ ok: boolean; error?: string }>,

  /** Retrieve a credential from the OS keychain */
  credentialGet: (key: string) =>
    ipcRenderer.invoke("credential:get", key) as Promise<{ value: string | null }>,

  /** Clear a credential from the OS keychain */
  credentialClear: (key: string) =>
    ipcRenderer.invoke("credential:clear", key) as Promise<{ ok: boolean }>,

  /** Read plain text from the native desktop clipboard */
  readClipboardText: () =>
    ipcRenderer.invoke("clipboard:read-text") as Promise<string>,

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
} else {
  installBrowserToolbar();
}
