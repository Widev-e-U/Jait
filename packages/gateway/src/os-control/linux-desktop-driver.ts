/**
 * LinuxDesktopOsControlDriver — drives the Linux XFCE desktop sandbox.
 *
 * All operations run inside the container via `execShell` (docker exec).
 * Screen capture uses ImageMagick's `import`; input injection uses `xdotool`.
 * The X server lives on DISPLAY=:99 by default (Xvfb + x11vnc on :5900);
 * the display is configurable via the constructor for other sandbox images.
 */

import type {
  SandboxManager,
  SandboxRunResult,
} from "../security/sandbox-manager.js";
import type {
  OsClickOptions,
  OsControlDriver,
  OsDriverType,
  OsExecOptions,
  OsKeyOptions,
  OsScreenshot,
  OsScrollOptions,
  OsTypeOptions,
} from "./types.js";

/** Map an OS mouse button to its xdotool numeric button id. */
const BUTTONS: Record<NonNullable<OsClickOptions["button"]>, string> = {
  left: "1",
  middle: "2",
  right: "3",
};

/** xdotool keysym for every special key name accepted by `os.keyboard`. */
const KEYMAP: Record<string, string> = {
  enter: "Return",
  return: "Return",
  tab: "Tab",
  esc: "Escape",
  escape: "Escape",
  backspace: "BackSpace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pgup: "Page_Up",
  pageup: "Page_Up",
  pagedown: "Page_Down",
  pgdn: "Page_Down",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  space: "space",
  super: "Super_L",
  menu: "Menu",
  " ": "space",
};

/**
 * Build the xdotool keysym arg list for a human combo such as
 * `ctrl+shift+t`, `alt+tab`, `super+d`. Modifiers map to xdotool modifier
 * names; the final token is the (possibly renamed) key.
 */
export function buildXdotoolKeys(combo: string): string[] {
  const parts = combo
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const modifiers = new Set(["ctrl", "control", "alt", "shift", "super", "meta"]);
  const args: string[] = [];
  for (const part of parts) {
    if (part === "ctrl" || part === "control") args.push("ctrl");
    else if (part === "alt") args.push("alt");
    else if (part === "shift") args.push("shift");
    else if (part === "super" || part === "meta") args.push("super");
    else if (modifiers.has(part)) args.push(part);
    else {
      // Last non-modifier token is the key itself.
      args.push(KEYMAP[part] ?? part);
    }
  }
  return args;
}

/** Compute the PNG dimensions from its IHDR chunk (bytes 16..24). */
function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) {
    return { width: 0, height: 0 };
  }
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

/** Base64-decode text output into a Buffer, stripping any whitespace noise. */
function decodeBase64(s: string): Buffer {
  return Buffer.from(s.trim().replace(/\s+/g, ""), "base64");
}

export class LinuxDesktopOsControlDriver implements OsControlDriver {
  readonly osType: OsDriverType = "linux-desktop";

  constructor(
    private readonly sandboxManager: SandboxManager,
    private readonly containerName: string,
    private readonly display = ":99",
  ) {}

  private async run(command: string, timeoutMs = 30_000): Promise<SandboxRunResult> {
    return this.sandboxManager.execShell({ containerName: this.containerName, command, timeoutMs });
  }

  /** Fail loudly if the required desktop tooling is missing in the image. */
  private async requireTools(...tools: string[]): Promise<void> {
    const found = await this.run(
      `for t in ${tools.join(" ")}; do command -v "$t" >/dev/null 2>&1 || echo "missing:$t"; done`,
      15_000,
    );
    if (!found.ok && found.exitCode !== 0 && found.exitCode !== 1) {
      throw new Error(`Failed to probe container tools: ${found.output}`);
    }
    const missing = found.output
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("missing:"));
    if (missing.length > 0) {
      throw new Error(
        `Linux desktop sandbox is missing tools required for OS control: ${missing.join(", ")}. ` +
          `Rebuild the sandbox image from docker/Dockerfile.linux-desktop.`,
      );
    }
  }

  async screenshot(): Promise<OsScreenshot> {
    const out = "/tmp/jait-os-screenshot.png";
    const res = await this.run(
      `DISPLAY=${this.display} import -window root ${out} 2>/dev/null; if [ ! -s ${out} ]; then ` +
        `echo "__NO_SCREENSHOT__"; exit 3; fi; base64 -w0 ${out} 2>/dev/null || base64 ${out}`,
      30_000,
    );
    if (res.exitCode !== 0 || res.output.includes("__NO_SCREENSHOT__")) {
      throw new Error(
        `os.screenshot failed inside the sandbox (exit ${res.exitCode}): ${res.output.trim() || "no image produced"}`,
      );
    }
    const png = decodeBase64(res.output);
    return { png, ...pngSize(png) };
  }

  async click(x: number, y: number, opts: OsClickOptions = {}): Promise<void> {
    const button = BUTTONS[opts.button ?? "left"];
    const clicks = Math.max(1, opts.clicks ?? 1);
    await this.run(
      `DISPLAY=${this.display} xdotool mousemove ${Math.round(x)} ${Math.round(y)} click --repeat ${clicks} ${button}`,
      15_000,
    );
  }

  async mouseMove(x: number, y: number): Promise<void> {
    await this.run(
      `DISPLAY=${this.display} xdotool mousemove ${Math.round(x)} ${Math.round(y)}`,
      15_000,
    );
  }

  async type(text: string, opts: OsTypeOptions = {}): Promise<void> {
    const delay = Math.max(0, opts.delayMs ?? 12);
    const escaped = text
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/`/g, "\\`")
      .replace(/\$/g, "\\$")
      .replace(/\n/g, "\\n");
    await this.run(
      `DISPLAY=${this.display} xdotool type --delay ${delay} "${escaped}"`,
      15_000,
    );
  }

  async key(combo: string, opts: OsKeyOptions = {}): Promise<void> {
    const keys = buildXdotoolKeys(combo);
    if (keys.length === 0) {
      throw new Error(`os.keyboard: empty or invalid combo "${combo}"`);
    }
    const hold = Math.max(0, opts.holdMs ?? 0);
    if (hold > 0) {
      await this.run(
        `DISPLAY=${this.display} xdotool keydown ${keys.join(" ")}; sleep ${(hold / 1000).toFixed(3)}; ` +
          `DISPLAY=${this.display} xdotool keyup ${keys.join(" ")}`,
        15_000,
      );
    } else {
      await this.run(`DISPLAY=${this.display} xdotool key ${keys.join(" ")}`, 15_000);
    }
  }

  async scroll(opts: OsScrollOptions = {}): Promise<void> {
    const direction = opts.direction ?? "down";
    const amount = Math.max(1, Math.round(opts.amount ?? 1));
    const click = direction === "up" ? 4 : 5;
    const moveArgs =
      opts.x !== undefined && opts.y !== undefined
        ? `mousemove ${Math.round(opts.x)} ${Math.round(opts.y)} `
        : "";
    await this.run(
      `DISPLAY=${this.display} xdotool ${moveArgs}click --repeat ${amount} ${click}`,
      15_000,
    );
  }

  async exec(command: string, opts: OsExecOptions = {}): Promise<SandboxRunResult> {
    const envPrefix = opts.env
      ? Object.entries(opts.env)
          .map(([k, v]) => `${k}='${String(v).replace(/'/g, "'\\''")}' `)
          .join("")
      : "";
    const cwdPrefix = opts.cwd ? `cd '${opts.cwd.replace(/'/g, "'\\''")}' && ` : "";
    return this.run(`${envPrefix}${cwdPrefix}${command}`, opts.timeoutMs ?? 30_000);
  }

  /** Best-effort preflight so callers can surface a friendly message early. */
  async preflight(): Promise<void> {
    await this.requireTools("import", "xdotool");
  }
}


