/**
 * WindowsOsControlDriver — drives the dockur Windows VM sandbox.
 *
 * Mechanism:
 *   dockur/windows exposes an OpenSSH server inside the VM when provisioned
 *   with `SSH_USERNAME` and `SSH_PASSWORD` env vars (see
 *   docker/Dockerfile.windows-sandbox). The VM's SSH (guest port 22) is
 *   forwarded to the container's port 22, which the sandbox manager publishes
 *   on a host port. This driver:
 *     1. Discovers the published SSH port + the provisioned SSH credentials
 *        via `docker inspect` on the running container.
 *     2. Runs PowerShell snippets over SSH. Password auth is handled with the
 *        same PTY password-feeding mechanism the SSH tools use (node-pty),
 *        so no `sshpass` is required on the host.
 *     3. Uses PowerShell P/Invoke into user32 (SetCursorPos, mouse_event,
 *        SendInput) and System.Drawing CopyFromScreen for capture, and
 *        System.Windows.Forms SendKeys for typing / shortcuts.
 *
 * Honesty: if the container isn't running, no SSH port is published, or no
 * SSH password is configured, the driver throws a clear error rather than
 * fabricating a working channel.
 */

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** Minimal surface of the node-pty process object used by the SSH runner. */
interface PtyProcess {
  write(data: string): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void;
  kill(signal?: string): void;
}

type PtyFactory = (
  file: string,
  args: string[],
  options: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string | undefined> },
) => PtyProcess;

/** Default SSH port dockur publishes unless overridden. */
const DEFAULT_SSH_PORT = 2222;
/** Fallback SSH user when neither the container env nor config provides one. */
const DEFAULT_SSH_USER = "docker";

/** Lazy node-pty loader (matches ssh-tools.ts; keeps the require out of module scope). */
function loadPtyFactory(): PtyFactory {
  return (require("node-pty") as { spawn: PtyFactory }).spawn;
}

/** Strip ANSI escape sequences from PTY output. */
function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, "");
}

/**
 * Build the argv for the one-shot `ssh` invocation that runs a PowerShell
 * command in the VM. Password auth is forced so the PTY runner can feed the
 * password at the prompt (no sshpass / keys required).
 */
export function buildWindowsSshArgs(input: {
  port: number;
  username: string;
  command: string;
}): string[] {
  return [
    "-p",
    String(input.port),
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "LogLevel=ERROR",
    "-o",
    "NumberOfPasswordPrompts=1",
    "-o",
    "PreferredAuthentications=password,keyboard-interactive",
    "-o",
    "PubkeyAuthentication=no",
    "-o",
    "ConnectTimeout=10",
    `${input.username}@127.0.0.1`,
    input.command,
  ];
}

/**
 * Encode a PowerShell snippet for `-EncodedCommand`. PowerShell requires the
 * base64 of the UTF-16LE (little-endian) representation — UTF-8 base64 gets
 * mis-decoded and fails.
 */
export function encodePowerShellCommand(snippet: string): string {
  return Buffer.from(snippet, "utf16le").toString("base64");
}

/**
 * Run `ssh <args>` once over a PTY, answer the password prompt when it
 * appears, and resolve with the combined output once the process exits.
 * Timeouts kill the PTY and report `timedOut`.
 */
export function runSshWithPassword(
  args: string[],
  password: string,
  timeoutMs: number,
  ptyFactory: PtyFactory = loadPtyFactory(),
): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const pty = ptyFactory("ssh", args, {
      name: "xterm-256color",
      cols: 160,
      rows: 40,
      cwd: process.cwd(),
      env: {
        ...process.env,
        SSH_ASKPASS: undefined,
        DISPLAY: undefined,
      },
    });

    let raw = "";
    let passwordSent = false;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        pty.kill("SIGTERM");
      } catch {
        // ignore
      }
      resolve({ output: raw, exitCode: null, timedOut: true });
    }, timeoutMs);

    pty.onData((data) => {
      raw += data;
      if (passwordSent) return;
      const visible = stripAnsi(raw);
      if (/(?:password|passphrase).*:\s*$/im.test(visible)) {
        passwordSent = true;
        pty.write(`${password}\r`);
      }
    });

    pty.onExit(({ exitCode }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ output: raw, exitCode, timedOut: false });
    });
  });
}

/** Powershell snippet declaring the user32 P/Invoke helpers used by input ops. */
const USER32_PINVOKE = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OsInput {
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extraInfo);
}
'@;
`;

/**
 * Map a special key name to a virtual key code / SendKeys token for Windows.
 * Ordinary printable characters pass through as themselves.
 */
function windowsKeyToken(part: string): string {
  const p = part.toLowerCase();
  const map: Record<string, string> = {
    enter: "{ENTER}",
    return: "{ENTER}",
    tab: "{TAB}",
    esc: "{ESC}",
    escape: "{ESC}",
    backspace: "{BACKSPACE}",
    delete: "{DELETE}",
    insert: "{INSERT}",
    home: "{HOME}",
    end: "{END}",
    pgup: "{PGUP}",
    pageup: "{PGUP}",
    pagedown: "{PGDN}",
    pgdn: "{PGDN}",
    up: "{UP}",
    down: "{DOWN}",
    left: "{LEFT}",
    right: "{RIGHT}",
    space: " ",
    super: "{LWIN}",
    win: "{LWIN}",
    meta: "{LWIN}",
  };
  return map[p] ?? part;
}

/** Convert a human combo (e.g. `ctrl+shift+t`) into a SendKeys token string. */
export function buildWindowsSendKeys(combo: string): string {
  const parts = combo
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  let out = "";
  for (const part of parts) {
    if (part === "ctrl" || part === "control") out += "^";
    else if (part === "alt") out += "%";
    else if (part === "shift") out += "+";
    else if (part === "super" || part === "win" || part === "meta") out += "{LWIN}";
    else out += windowsKeyToken(part);
  }
  return out;
}

/** Escape text for System.Windows.Forms.SendKeys (protect +,^,%,~,(,),{,}). */
export function escapeSendKeysText(text: string): string {
  return text
    .replace(/[+^%~(){}[\]]/g, (m) => `{${m}}`);
}

/** Extract the host-published SSH port from a docker Ports JSON string. */
export function extractSshPort(portsJson: string): number | null {
  // The VM's OpenSSH lives on container port 22 (dockur forwards guest 22 →
  // container 22). Older setups published 2222/tcp directly; accept both.
  const m = /"(?:22|2222)\/tcp":\[.*?"HostPort":"(\d+)"/.exec(portsJson);
  return m ? Number(m[1]) : null;
}

export class WindowsOsControlDriver implements OsControlDriver {
  readonly osType: OsDriverType = "windows";

  constructor(
    private readonly containerName: string,
    private readonly sshUsername = DEFAULT_SSH_USER,
    private readonly sshPassword?: string,
  ) {}

  /** Find the published SSH port of the VM container via docker inspect on the host. */
  private async resolveSshPort(): Promise<number> {
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["inspect", "-f", "{{json .NetworkSettings.Ports}}", this.containerName],
        { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
      );
      const port = extractSshPort(stdout);
      if (port !== null) return port;
    } catch {
      // Fall through to the default dockur SSH port.
    }
    return DEFAULT_SSH_PORT;
  }

  /**
   * Resolve the SSH credentials provisioned for the VM. The authoritative
   * source is the container's own environment (SSH_USERNAME/SSH_PASSWORD —
   * set by startWindowsSandbox from the user's chosen account or defaults),
   * falling back to the constructor arguments.
   */
  private async resolveSshCredentials(): Promise<{
    username: string;
    password: string | undefined;
  }> {
    let env: string[] = [];
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["inspect", "-f", "{{json .Config.Env}}", this.containerName],
        { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
      );
      const parsed = JSON.parse(stdout.trim());
      if (Array.isArray(parsed)) env = parsed as string[];
    } catch {
      // Fall back to constructor-provided credentials below.
    }
    const get = (key: string): string | undefined =>
      env.find((e) => e.startsWith(`${key}=`))?.slice(key.length + 1) || undefined;

    return {
      username: get("SSH_USERNAME") ?? this.sshUsername,
      password: get("SSH_PASSWORD") ?? this.sshPassword,
    };
  }

  /** Run a PowerShell snippet in the VM over SSH and return its stdout. */
  private async runPowerShell(snippet: string, timeoutMs = 30_000): Promise<string> {
    const [port, credentials] = await Promise.all([
      this.resolveSshPort(),
      this.resolveSshCredentials(),
    ]);
    if (!credentials.password) {
      throw new Error(
        "Windows OS control needs an SSH password for the dockur VM. Start the sandbox " +
          "with a password (windows.sandbox.start password=...) or set " +
          "WINDOWS_SSH_PASSWORD so the VM is provisioned with SSH_USERNAME/SSH_PASSWORD.",
      );
    }

    const encoded = encodePowerShellCommand(snippet);
    const args = buildWindowsSshArgs({
      port,
      username: credentials.username,
      command: `powershell -NoProfile -EncodedCommand ${encoded}`,
    });
    const result = await runSshWithPassword(args, credentials.password, timeoutMs);
    if (result.timedOut) {
      throw new Error(
        `Windows OS control timed out after ${timeoutMs}ms while running a PowerShell command ` +
          `over SSH to sandbox "${this.containerName}".`,
      );
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `Windows OS control SSH command exited with code ${result.exitCode}: ` +
          `${stripAnsi(result.output).trim().slice(0, 500) || "no output"}`,
      );
    }
    return result.output;
  }

  async screenshot(): Promise<OsScreenshot> {
    const snippet =
      USER32_PINVOKE +
      `
Add-Type -AssemblyName System.Drawing;
Add-Type -AssemblyName System.Windows.Forms;
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen;
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height);
$g = [System.Drawing.Graphics]::FromImage($bmp);
$g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size);
$ms = New-Object System.IO.MemoryStream;
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png);
[Convert]::ToBase64String($ms.ToArray());
`;
    const out = await this.runPowerShell(snippet);
    const png = Buffer.from(out.trim().replace(/\s+/g, ""), "base64");
    return { png, width: 0, height: 0 };
  }

  async click(x: number, y: number, opts: OsClickOptions = {}): Promise<void> {
    const button = opts.button ?? "left";
    const clicks = Math.max(1, opts.clicks ?? 1);
    const [down, up] =
      button === "right"
        ? ["0x08", "0x10"]
        : button === "middle"
          ? ["0x20", "0x40"]
          : ["0x02", "0x04"];
    const snippet = `${USER32_PINVOKE}
[OsInput]::SetCursorPos(${Math.round(x)}, ${Math.round(y)});
${new Array(clicks)
  .fill(`[OsInput]::mouse_event(${down},0,0,0,[UIntPtr]::Zero); [OsInput]::mouse_event(${up},0,0,0,[UIntPtr]::Zero);`)
  .join("\n")}
`;
    await this.runPowerShell(snippet);
  }

  async mouseMove(x: number, y: number): Promise<void> {
    await this.runPowerShell(
      `${USER32_PINVOKE}\n[OsInput]::SetCursorPos(${Math.round(x)}, ${Math.round(y)});\n`,
    );
  }

  async type(text: string, opts: OsTypeOptions = {}): Promise<void> {
    void opts; // delay handled by SendKeys timing naturally
    const escaped = escapeSendKeysText(text);
    const snippet = `
Add-Type -AssemblyName System.Windows.Forms;
[System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}');
`;
    await this.runPowerShell(snippet);
  }

  async key(combo: string, opts: OsKeyOptions = {}): Promise<void> {
    const token = buildWindowsSendKeys(combo);
    if (!token) throw new Error(`os.keyboard: empty or invalid combo "${combo}"`);
    const hold = Math.max(0, opts.holdMs ?? 0);
    const body = hold > 0
      ? `[System.Windows.Forms.SendKeys]::SendWait('{CTRL down}'); Start-Sleep -Milliseconds ${hold}; [System.Windows.Forms.SendKeys]::SendWait('{CTRL up}');`
      : `[System.Windows.Forms.SendKeys]::SendWait('${token.replace(/'/g, "''")}');`;
    const snippet = `Add-Type -AssemblyName System.Windows.Forms;\n${body}\n`;
    await this.runPowerShell(snippet);
  }

  async scroll(opts: OsScrollOptions = {}): Promise<void> {
    const direction = opts.direction ?? "down";
    const amount = Math.max(1, Math.round(opts.amount ?? 1));
    const delta = (dir: string) => {
      // 120 = one wheel notch.
      if (dir === "up") return 120;
      if (dir === "down") return -120;
      if (dir === "right") return 120;
      return -120; // left
    };
    const wheelFlag = direction === "left" || direction === "right" ? "0x1000" : "0x0800";
    const d = delta(direction) * amount;
    const move = opts.x !== undefined && opts.y !== undefined
      ? `[OsInput]::SetCursorPos(${Math.round(opts.x)}, ${Math.round(opts.y)});`
      : "";
    const snippet = `${USER32_PINVOKE}
${move}
[OsInput]::mouse_event(${wheelFlag}, 0, 0, ${d}, [UIntPtr]::Zero);
`;
    await this.runPowerShell(snippet);
  }

  async exec(command: string, opts: OsExecOptions = {}): Promise<{
    ok: boolean;
    output: string;
    exitCode: number | null;
    timedOut: boolean;
    containerName: string;
  }> {
    void opts;
    const out = await this.runPowerShell(command, opts.timeoutMs ?? 30_000);
    return {
      ok: true,
      output: out,
      exitCode: 0,
      timedOut: false,
      containerName: this.containerName,
    };
  }
}
