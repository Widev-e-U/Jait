import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ComputerMouseButton,
  ComputerScreenshot,
  ComputerScrollDirection,
} from "@jait/shared";
import { createWindowsInput, type WindowsInput } from "./windows-native-input.js";
import { glidePath, planGlide } from "./cursor-glide.js";

const execFileAsync = promisify(execFile);

export type PowerShellRunner = (script: string, timeoutMs?: number) => Promise<string>;

const VIRTUAL_KEYS: Record<string, number> = {
  ctrl: 0x11,
  control: 0x11,
  shift: 0x10,
  alt: 0x12,
  win: 0x5b,
  meta: 0x5b,
  super: 0x5b,
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  esc: 0x1b,
  escape: 0x1b,
  backspace: 0x08,
  delete: 0x2e,
  insert: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pgup: 0x21,
  pagedown: 0x22,
  pgdn: 0x22,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  space: 0x20,
};

function keyCode(token: string): number | undefined {
  const normalized = token.trim().toLowerCase();
  const known = VIRTUAL_KEYS[normalized];
  if (known !== undefined) return known;
  if (/^[a-z]$/.test(normalized)) return normalized.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(normalized)) return normalized.charCodeAt(0);
  const functionKey = /^f([1-9]|1[0-9]|2[0-4])$/.exec(normalized);
  if (functionKey) return 0x70 + Number(functionKey[1]) - 1;
  return undefined;
}

export function virtualKeysForCombo(combo: string): number[] {
  const parts = combo.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("Key combo cannot be empty");
  return parts.map((part) => {
    const code = keyCode(part);
    if (code === undefined) throw new Error(`Unsupported key in combo: ${part}`);
    return code;
  });
}

export function escapeWindowsSendKeysText(text: string): string {
  return text
    .replace(/[+^%~(){}[\]]/g, (character) => `{${character}}`)
    .replace(/\r\n|\r|\n/g, "{ENTER}")
    .replace(/\t/g, "{TAB}");
}

export async function runWindowsPowerShell(
  script: string,
  timeoutMs = 30_000,
): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("Windows computer control is only available on win32");
  }
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    {
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    },
  );
  return String(stdout).trim();
}

function roundedCoordinate(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Pointer coordinates must be finite numbers");
  return Math.round(value);
}

export interface WindowsDriverOptions {
  runPowerShell?: PowerShellRunner;
  inputFactory?: () => Promise<WindowsInput> | WindowsInput;
  /**
   * Called for every intermediate pointer position while the cursor glides.
   * The desktop overlay uses this so its rendered cursor tracks the real
   * office-cursor motion frame by frame instead of teleporting.
   */
  onGlideFrame?: (x: number, y: number) => void;
}

export class WindowsComputerDriver {
  private readonly runPowerShell: PowerShellRunner;
  private readonly inputFactoryRef: () => Promise<WindowsInput> | WindowsInput;
  private inputPromise?: Promise<WindowsInput>;

  constructor(options: WindowsDriverOptions = {}) {
    this.runPowerShell = options.runPowerShell ?? runWindowsPowerShell;
    this.inputFactoryRef = options.inputFactory ?? createWindowsInput;
    this.onGlideFrame = options.onGlideFrame;
  }

  private readonly onGlideFrame?: (x: number, y: number) => void;

  private input(): Promise<WindowsInput> {
    this.inputPromise ??= Promise.resolve().then(() => this.inputFactoryRef()).catch(
      (error: unknown) => {
        // Don't cache transient init failures; the next command retries.
        this.inputPromise = undefined;
        throw error;
      },
    );
    return this.inputPromise;
  }

  async screenshot(): Promise<ComputerScreenshot> {
    const output = await this.runPowerShell(`
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$stream = New-Object System.IO.MemoryStream
try {
  $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  [PSCustomObject]@{
    pngBase64 = [Convert]::ToBase64String($stream.ToArray())
    width = $bounds.Width
    height = $bounds.Height
    originX = $bounds.X
    originY = $bounds.Y
  } | ConvertTo-Json -Compress
} finally {
  $stream.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
`, 60_000);
    const json = output.split(/\r?\n/).filter(Boolean).at(-1);
    if (!json) throw new Error("Windows screenshot returned no data");
    const parsed = JSON.parse(json) as Partial<ComputerScreenshot>;
    if (
      typeof parsed.pngBase64 !== "string"
      || typeof parsed.width !== "number"
      || typeof parsed.height !== "number"
      || typeof parsed.originX !== "number"
      || typeof parsed.originY !== "number"
    ) {
      throw new Error("Windows screenshot returned an invalid payload");
    }
    return parsed as ComputerScreenshot;
  }

  /**
   * macOS-style pointer glide: tweens from the current cursor position to the
   * target with eased motion instead of teleporting, so the visible cursor
   * travels the full path like a real mouse. Every intermediate position is
   * reported through onGlideFrame so the overlay cursor can mirror the motion.
   */
  async move(x: number, y: number): Promise<void> {
    return this.glideTo(x, y);
  }

  private async glideTo(x: number, y: number): Promise<void> {
    const input = await this.input();
    const targetX = roundedCoordinate(x);
    const targetY = roundedCoordinate(y);
    const start = input.getCursorPos();
    const plan = planGlide(start, { x: targetX, y: targetY });
    if (plan.steps === 0) {
      input.setCursorPos(targetX, targetY);
      this.onGlideFrame?.(targetX, targetY);
      return;
    }
    const frame = (point: { x: number; y: number }) => {
      this.onGlideFrame?.(point.x, point.y);
    };
    for (const point of glidePath(plan, start)) {
      input.setCursorPos(point.x, point.y);
      frame(point);
      await input.sleep(plan.stepMs);
    }
    input.setCursorPos(targetX, targetY);
    frame({ x: targetX, y: targetY });
  }

  async click(
    x: number,
    y: number,
    button: ComputerMouseButton = "left",
    clicks = 1,
  ): Promise<void> {
    if (!Number.isInteger(clicks) || clicks < 1 || clicks > 3) {
      throw new Error("Click count must be an integer from 1 to 3");
    }
    await this.glideTo(x, y);
    const input = await this.input();
    for (let i = 0; i < clicks; i += 1) {
      input.mouseButton(button, true);
      await input.sleep(40);
      input.mouseButton(button, false);
      if (i < clicks - 1) await input.sleep(60);
    }
  }

  async type(text: string): Promise<void> {
    if (!text) throw new Error("Text cannot be empty");
    const input = await this.input();
    input.typeUnicode(text);
  }

  async key(combo: string): Promise<void> {
    const keys = virtualKeysForCombo(combo);
    const input = await this.input();
    for (const code of keys) {
      input.keyVirtual(code, true);
    }
    await input.sleep(50);
    for (const code of [...keys].reverse()) {
      input.keyVirtual(code, false);
    }
  }

  async scroll(direction: ComputerScrollDirection, amount = 3): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Scroll amount must be positive");
    const input = await this.input();
    input.scroll(direction, amount);
  }
}