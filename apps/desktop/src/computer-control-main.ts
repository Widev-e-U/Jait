import {
  BrowserWindow,
  dialog,
  globalShortcut,
  screen,
  type MessageBoxOptions,
} from "electron";
import type {
  ComputerMouseButton,
  ComputerScrollDirection,
} from "@jait/shared";
import { WindowsComputerDriver } from "./windows-computer-control.js";

interface DesktopToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

interface ActiveComputerSession {
  sessionId: string;
  expiresAt: string;
  expiryTimer: ReturnType<typeof setTimeout>;
}

/**
 * Optional remembered-approval store. When the user ticks "don't ask again"
 * on the approval dialog, the desktop persists a trust deadline and future
 * `computer.session start` requests skip the on-screen dialog entirely.
 * Kept as an injected interface so this module stays decoupled from the
 * settings file plumbing in electron-main.ts.
 */
export interface ComputerControlTrust {
  isTrusted: () => boolean;
  trustFor: (ms: number) => void;
}

/** How long a ticked "don't ask again" checkbox stays valid. */
export const COMPUTER_CONTROL_TRUST_MS = 8 * 60 * 60 * 1000;

interface ComputerActArgs {
  sessionId: string;
  action: "move" | "click" | "type" | "key" | "scroll";
  x?: number;
  y?: number;
  button?: ComputerMouseButton;
  clicks?: number;
  text?: string;
  combo?: string;
  direction?: ComputerScrollDirection;
  amount?: number;
  includeScreenshot?: boolean;
  waitAfterMs?: number;
}

const EMERGENCY_STOP_ACCELERATOR = "CommandOrControl+Alt+Esc";
const MAX_SESSION_MS = 30 * 60_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a finite number`);
  return value;
}

function overlayHtml(originX: number, originY: number): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
  #cursor {
    position: fixed;
    left: -200px;
    top: -200px;
    display: flex;
    align-items: flex-start;
    gap: 3px;
    opacity: .95;
    filter: drop-shadow(0 2px 5px rgba(15,23,42,.35));
    transition: left 48ms linear, top 48ms linear;
  }
  #pointer { width: 19px; height: 24px; flex: none; }
  #badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 12px;
    margin-left: -2px;
    padding: 3px 8px 3px 6px;
    border: 1px solid rgba(255,255,255,.28);
    border-radius: 999px;
    background: hsla(220, 14%, 12%, .55);
    -webkit-backdrop-filter: blur(10px) saturate(1.5);
    backdrop-filter: blur(10px) saturate(1.5);
    color: rgba(255,255,255,.96);
    font: 600 10px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
    letter-spacing: .02em;
    white-space: nowrap;
  }
  #badgeDot {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 999px;
    background: #3b82f6;
    box-shadow: 0 0 0 2px hsla(217, 91%, 60%, .18);
  }
  #pulse {
    position: absolute;
    left: 2px;
    top: 3px;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(59,130,246,.6);
    border-radius: 50%;
    opacity: 0;
    transform: scale(.4);
  }
  #cursor.pulse #pulse { animation: pulse 420ms ease-out; }
  @keyframes pulse {
    0% { opacity: .9; transform: scale(.4); }
    100% { opacity: 0; transform: scale(2.4); }
  }
</style>
</head>
<body>
  <div id="cursor" aria-hidden="true">
    <div id="pulse"></div>
    <svg id="pointer" viewBox="0 0 28 36">
      <path d="M2 2 L24 22 L14 23 L19 33 L13 35 L8 25 L2 31 Z" fill="#3b82f6" fill-opacity=".85" stroke="rgba(255,255,255,.92)" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
    <div id="badge"><span id="badgeDot"></span><span id="badgeLabel">Jait</span></div>
  </div>
<script>
  const originX = ${originX};
  const originY = ${originY};
  const cursor = document.getElementById("cursor");
  const badgeLabel = document.getElementById("badgeLabel");
  window.jaitMove = (x, y) => {
    cursor.style.left = (x - originX + 9) + "px";
    cursor.style.top = (y - originY + 9) + "px";
  };
  window.jaitPulse = () => {
    cursor.classList.remove("pulse");
    void cursor.offsetWidth;
    cursor.classList.add("pulse");
  };
  window.jaitState = (state) => {
    badgeLabel.textContent = state ? "Jait · " + state : "Jait";
  };
</script>
</body>
</html>`;
}

export class ComputerControlController {
  private active: ActiveComputerSession | null = null;
  private overlay: BrowserWindow | null = null;

  constructor(
    private readonly getParentWindow: () => BrowserWindow | null,
    private readonly trust?: ComputerControlTrust,
    private readonly driver = new WindowsComputerDriver({
      onGlideFrame: (x, y) => this.trackOverlay(x, y),
    }),
  ) {}

  async handle(tool: string, args: Record<string, unknown>): Promise<DesktopToolResult> {
    if (tool === "computer.session") return this.handleSession(args);
    if (tool === "computer.observe") return this.observe(args);
    if (tool === "computer.act") return this.act(args as unknown as ComputerActArgs);
    return { ok: false, message: `Unsupported computer tool: ${tool}` };
  }

  stop(sessionId?: string): void {
    if (sessionId && this.active && this.active.sessionId !== sessionId) return;
    if (this.active) clearTimeout(this.active.expiryTimer);
    this.active = null;
    globalShortcut.unregister(EMERGENCY_STOP_ACCELERATOR);
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.destroy();
    this.overlay = null;
  }

  private async handleSession(args: Record<string, unknown>): Promise<DesktopToolResult> {
    const action = requiredString(args.action, "action");
    if (action === "start") return this.start(args);
    if (action === "stop") {
      const sessionId = requiredString(args.sessionId, "sessionId");
      if (this.active && this.active.sessionId !== sessionId) {
        return { ok: false, message: "That computer session is not active on this desktop" };
      }
      this.stop(sessionId);
      return { ok: true, message: "Computer control stopped on this desktop." };
    }
    if (action === "status") {
      return {
        ok: true,
        message: this.active ? "Computer control is active." : "Computer control is not active.",
        data: this.active ? { sessionId: this.active.sessionId, expiresAt: this.active.expiresAt } : null,
      };
    }
    return { ok: false, message: `Unsupported computer session action: ${action}` };
  }

  private async start(args: Record<string, unknown>): Promise<DesktopToolResult> {
    if (process.platform !== "win32") {
      return { ok: false, message: "Computer control is currently supported on Windows only." };
    }
    const sessionId = requiredString(args.sessionId, "sessionId");
    if (this.active?.sessionId === sessionId) {
      return {
        ok: true,
        message: "Computer control is already active.",
        data: { sessionId, expiresAt: this.active.expiresAt },
      };
    }
    if (this.active) {
      return { ok: false, message: "Another computer control session is already active." };
    }

    // Remembered approval: the user opted out of per-session prompts via the
    // dialog checkbox (8h). Sessions are still capped at 30 minutes and
    // Ctrl+Alt+Esc still kills any active session.
    if (this.trust?.isTrusted()) {
      const requestedExpiryAt = Date.parse(String(args.expiresAt ?? ""));
      return this.activate(
        sessionId,
        Math.min(
          Number.isFinite(requestedExpiryAt) ? requestedExpiryAt : Date.now() + MAX_SESSION_MS,
          Date.now() + MAX_SESSION_MS,
        ),
      );
    }

    const options: MessageBoxOptions = {
      type: "warning",
      title: "Allow Jait computer control?",
      message: "An AI agent is asking to control this Windows computer.",
      detail: "Jait will show a small blue virtual cursor while it uses the mouse and keyboard. Control lasts up to 30 minutes. Press Ctrl+Alt+Esc at any time to stop immediately.",
      checkboxLabel: "Don't ask again for 8 hours on this device",
      checkboxChecked: false,
      buttons: ["Allow once", "Deny"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    };
    // The approval prompt must always be visible. A modal parented to a
    // hidden (tray-minimized) or minimized window never renders on Windows,
    // so the request would hang until the gateway times out while the user
    // sees nothing. Surface the parent first; if it cannot be shown, fall
    // back to a parentless dialog which renders top-level and takes focus.
    let parent = this.getParentWindow();
    if (parent && parent.isDestroyed()) parent = null;
    if (parent) {
      try {
        if (parent.isMinimized()) parent.restore();
        if (!parent.isVisible()) parent.show();
        parent.focus();
      } catch {
        parent = null;
      }
      // Belt-and-braces: Electron can silently refuse show() on some
      // platforms (e.g. locked sessions) — verify before parenting to it.
      if (parent && !parent.isVisible()) parent = null;
    }
    const decision = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (decision.response !== 0) {
      return { ok: false, message: "Computer control was denied on the Windows desktop." };
    }
    if (decision.checkboxChecked) {
      try {
        this.trust?.trustFor(COMPUTER_CONTROL_TRUST_MS);
      } catch {
        // Trust persistence is best-effort; approval still applies to this session.
      }
    }

    const requestedExpiry = Date.parse(String(args.expiresAt ?? ""));
    const expiresAtMs = Math.min(
      Number.isFinite(requestedExpiry) ? requestedExpiry : Date.now() + MAX_SESSION_MS,
      Date.now() + MAX_SESSION_MS,
    );
    return this.activate(sessionId, expiresAtMs);
  }

  /** Register the emergency shortcut + overlay and mark the session active. */
  private async activate(sessionId: string, expiresAtMs: number): Promise<DesktopToolResult> {
    const shortcutRegistered = globalShortcut.register(EMERGENCY_STOP_ACCELERATOR, () => this.stop());
    if (!shortcutRegistered) {
      return { ok: false, message: "Could not register Ctrl+Alt+Esc; computer control was not started." };
    }

    try {
      await this.createOverlay();
      const expiryTimer = setTimeout(
        () => this.stop(sessionId),
        Math.max(1, expiresAtMs - Date.now()),
      );
      this.active = {
        sessionId,
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiryTimer,
      };
      return {
        ok: true,
        message: "Computer control approved on this desktop.",
        data: { sessionId, expiresAt: this.active.expiresAt, emergencyStop: "Ctrl+Alt+Esc" },
      };
    } catch (error) {
      globalShortcut.unregister(EMERGENCY_STOP_ACCELERATOR);
      this.stop();
      return {
        ok: false,
        message: `Could not start computer control: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async observe(args: Record<string, unknown>): Promise<DesktopToolResult> {
    this.requireActive(requiredString(args.sessionId, "sessionId"));
    const screenshot = await this.driver.screenshot();
    return { ok: true, message: "Windows desktop captured.", data: { screenshot } };
  }

  private async act(args: ComputerActArgs): Promise<DesktopToolResult> {
    this.requireActive(requiredString(args.sessionId, "sessionId"));
    const action = requiredString(args.action, "action") as ComputerActArgs["action"];
    await this.setOverlayState(action);

    if (action === "move") {
      const x = requiredNumber(args.x, "x");
      const y = requiredNumber(args.y, "y");
      await this.driver.move(x, y);
    } else if (action === "click") {
      const x = requiredNumber(args.x, "x");
      const y = requiredNumber(args.y, "y");
      await this.driver.click(x, y, args.button ?? "left", args.clicks ?? 1);
      await this.pulseOverlay();
    } else if (action === "type") {
      await this.driver.type(requiredString(args.text, "text"));
    } else if (action === "key") {
      await this.driver.key(requiredString(args.combo, "combo"));
    } else if (action === "scroll") {
      await this.driver.scroll(args.direction ?? "down", args.amount ?? 3);
    } else {
      throw new Error(`Unsupported computer action: ${String(action)}`);
    }

    const defaultWait = action === "key" ? 450 : action === "click" ? 200 : 120;
    const waitAfterMs = Math.min(10_000, Math.max(0, args.waitAfterMs ?? defaultWait));
    if (waitAfterMs > 0) await delay(waitAfterMs);
    await this.setOverlayState("");

    const data: Record<string, unknown> = { action };
    if (args.includeScreenshot !== false) {
      try {
        data.screenshot = await this.driver.screenshot();
      } catch (error) {
        data.screenshotError = error instanceof Error ? error.message : String(error);
      }
    }
    return { ok: true, message: `Computer action ${action} completed.`, data };
  }

  private requireActive(sessionId: string): ActiveComputerSession {
    const active = this.active;
    if (!active || active.sessionId !== sessionId) {
      throw new Error("Computer control session is not active on this desktop");
    }
    if (Date.parse(active.expiresAt) <= Date.now()) {
      this.stop(sessionId);
      throw new Error("Computer control session has expired");
    }
    return active;
  }

  private async createOverlay(): Promise<void> {
    const displays = screen.getAllDisplays();
    if (displays.length === 0) throw new Error("No displays are available");
    const left = Math.min(...displays.map((display) => display.bounds.x));
    const top = Math.min(...displays.map((display) => display.bounds.y));
    const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
    const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));

    const overlay = new BrowserWindow({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      focusable: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.on("closed", () => {
      if (this.overlay === overlay) this.overlay = null;
    });
    await overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml(left, top))}`);
    overlay.showInactive();
    this.overlay = overlay;
    const current = screen.getCursorScreenPoint();
    await this.moveOverlay(current.x, current.y);
  }

  private async moveOverlay(x: number, y: number): Promise<void> {
    if (!this.overlay || this.overlay.isDestroyed()) return;
    await this.overlay.webContents.executeJavaScript(
      `window.jaitMove?.(${Math.round(x)}, ${Math.round(y)})`,
      true,
    );
  }

  /**
   * High-frequency overlay move used for glide frames. Fire-and-forget:
   * executeJavaScript awaits are far slower than the frame cadence.
   */
  private trackOverlay(x: number, y: number): void {
    if (!this.overlay || this.overlay.isDestroyed()) return;
    this.overlay.webContents
      .executeJavaScript(`window.jaitMove?.(${Math.round(x)}, ${Math.round(y)})`, true)
      .catch(() => {});
  }

  private async pulseOverlay(): Promise<void> {
    if (!this.overlay || this.overlay.isDestroyed()) return;
    await this.overlay.webContents.executeJavaScript("window.jaitPulse?.()", true);
  }

  private async setOverlayState(state: string): Promise<void> {
    if (!this.overlay || this.overlay.isDestroyed()) return;
    await this.overlay.webContents.executeJavaScript(
      `window.jaitState?.(${JSON.stringify(state)})`,
      true,
    );
  }
}

export function createComputerControlController(
  getParentWindow: () => BrowserWindow | null,
  trust?: ComputerControlTrust,
): ComputerControlController {
  return new ComputerControlController(getParentWindow, trust);
}
