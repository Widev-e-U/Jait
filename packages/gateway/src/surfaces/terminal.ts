/**
 * Terminal Surface — uses bun-pty directly.
 *
 * Each TerminalSurface owns a persistent interactive PTY shell process
 * (viewable in the frontend via xterm.js + WebSocket).
 *
 * Shell integration:
 * On start, sources an integration script that hooks into the shell's
 * prompt lifecycle and emits OSC 633 escape sequences (same protocol as
 * VS Code's terminal shell integration).  This lets us detect command
 * boundaries, exit codes, and CWD changes without wrapping commands.
 */

import { platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type {
  Surface,
  SurfaceStartInput,
  SurfaceStopInput,
  SurfaceSnapshot,
  SurfaceState,
} from "./contracts.js";
import { getTerminalOutputSlice } from "./terminal-output.js";

import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);

interface PTYInstance {
  pid: number;
  onData(cb: (data: string) => void): void;
  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

declare const Bun: unknown;

let warnedAboutBunPtyFallback = false;

interface SpawnPtyOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string | undefined>;
  useConpty?: boolean;
}

function loadNodePty() {
  return require("node-pty") as {
    spawn: (shell: string, args: string[], options: SpawnPtyOptions) => {
      pid: number;
      onData(cb: (data: string) => void): void;
      onExit(cb: (event: { exitCode: number; signal: number }) => void): void;
      write(data: string): void;
      resize(cols: number, rows: number): void;
      kill(signal?: string): void;
    };
  };
}

function spawnPty(shell: string, shellArgs: string[], opts: SpawnPtyOptions): PTYInstance {
  // Bun runtime path. Fall back to node-pty when bun-pty is not installed.
  if (typeof Bun !== "undefined") {
    try {
      const bunPty = require("bun-pty") as { spawn: (shell: string, args: string[], options: typeof opts) => PTYInstance };
      return bunPty.spawn(shell, shellArgs, opts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/bun-pty/i.test(message)) {
        throw err;
      }
      if (!warnedAboutBunPtyFallback) {
        warnedAboutBunPtyFallback = true;
        console.warn("bun-pty not installed; falling back to node-pty");
      }
    }
  }

  // Node/Vitest fallback path
  const nodePty = loadNodePty();
  return nodePty.spawn(shell, shellArgs, opts);
}

/** Directory containing shell integration scripts */
const SHELL_INTEGRATION_DIR = join(__dirname, "shell-integration");

/**
 * Resolve a bare executable name to its absolute path on Windows using `where`.
 * The PTY spawner (bun-pty / node-pty) calls CreateProcess directly, which does
 * NOT always resolve bare names like "powershell.exe" against PATH the same way
 * a shell does — especially when the gateway is launched as a service or via
 * autostart with a minimal environment. Returning an absolute path eliminates
 * the `spawn powershell.exe ENOENT` failure that otherwise breaks every command.
 *
 * Falls back to known System32 / PowerShell 7 install locations if `where`
 * itself is unavailable (e.g. PATH missing System32).
 */
function resolveWindowsExe(bareName: string): string {
  // 1. Try `where` to resolve against the current PATH.
  try {
    const out = execSync(`where ${bareName}`, {
      timeout: 3000,
      windowsHide: true,
      encoding: "utf8",
    });
    const first = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
    if (first) return first;
  } catch {
    // `where` not found or exe not on PATH — try known locations below.
  }

  // 2. Known absolute locations, checked in priority order.
  const candidates =
    bareName.toLowerCase() === "pwsh.exe"
      ? [
          join(process.env["ProgramFiles"] ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
          join(process.env["ProgramFiles"] ?? "C:\\Program Files", "PowerShell", "6", "pwsh.exe"),
        ]
      : [
          join(
            process.env["SystemRoot"] ?? "C:\\Windows",
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          ),
        ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  // 3. Last resort: return the bare name and let CreateProcess try.
  return bareName;
}

function defaultShell(): string {
  if (platform() === "win32") {
    // Prefer PowerShell 7 (pwsh) over Windows PowerShell 5.1 (powershell).
    // pwsh supports modern escape sequences and PSReadLine features.
    // Resolve to an ABSOLUTE PATH so the PTY spawner's CreateProcess doesn't
    // fail with ENOENT when PATH lacks the shell's directory.
    try {
      execSync("pwsh.exe -v", { stdio: "ignore", timeout: 3000, windowsHide: true });
      return resolveWindowsExe("pwsh.exe");
    } catch {
      return resolveWindowsExe("powershell.exe");
    }
  }
  return process.env["SHELL"] ?? "/bin/bash";
}

const ALLOWED_SHELLS: Record<string, string[]> = {
  win32: ["pwsh.exe", "powershell.exe", "cmd.exe"],
  linux: ["/bin/bash", "/bin/zsh", "/bin/sh"],
  darwin: ["/bin/zsh", "/bin/bash", "/bin/sh"],
};

/** Known Git Bash installation paths on Windows (checked in order). */
const GIT_BASH_CANDIDATES = [
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
];

export function availableShells(): { shell: string; label: string }[] {
  const plat = platform();
  const candidates = ALLOWED_SHELLS[plat] ?? ALLOWED_SHELLS.linux!;
  const shells: { shell: string; label: string }[] = [];
  for (const shell of candidates!) {
    try {
      if (plat === "win32") {
        execSync(`where ${shell}`, { stdio: "ignore", timeout: 3000, windowsHide: true });
      } else {
        execSync(`which ${shell}`, { stdio: "ignore", timeout: 3000 });
      }
      const name = shell.replace(/\.exe$/, "").split("/").pop() ?? shell;
      shells.push({ shell, label: name });
    } catch {
      // not available
    }
  }
  // On Windows, also probe known Git Bash locations (not found via `where`)
  if (plat === "win32") {
    for (const gitBash of GIT_BASH_CANDIDATES) {
      if (existsSync(gitBash) && !shells.some((s) => s.shell === gitBash)) {
        shells.push({ shell: gitBash, label: "bash (Git)" });
        break;
      }
    }
  }
  return shells;
}

/** Detect which integration script to source based on the shell binary */
function shellIntegrationScript(shell: string): { path: string; type: "pwsh" | "bash" | "zsh" } | null {
  const name = shell.toLowerCase().replace(/\.exe$/, "");
  const resolveScript = (filename: string, type: "pwsh" | "bash" | "zsh") => {
    const path = join(SHELL_INTEGRATION_DIR, filename);
    return existsSync(path) ? { path, type } : null;
  };
  if (name.includes("pwsh") || name.includes("powershell")) {
    return resolveScript("pwsh.ps1", "pwsh");
  }
  if (name.includes("zsh")) {
    return resolveScript("zsh.sh", "zsh");
  }
  if (name.includes("bash") || name.includes("sh")) {
    return resolveScript("bash.sh", "bash");
  }
  return null;
}

export interface TerminalSurfaceOptions {
  shell?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

export interface TerminalSpawnSpec {
  command: string;
  args: string[];
}

const DEFAULT_TERMINAL_MEMORY_HIGH = "1536M";
const DEFAULT_TERMINAL_MEMORY_MAX = "2G";
const DEFAULT_TERMINAL_SWAP_MAX = "1G";
const SYSTEMD_MEMORY_VALUE_RE = /^\d+(?:[KMGTPE])?$/i;

function validSystemdMemoryValue(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && SYSTEMD_MEMORY_VALUE_RE.test(normalized) ? normalized : fallback;
}

/**
 * Keep terminal commands out of the gateway service cgroup. A runaway build or
 * script can otherwise make systemd/OOM kill the gateway and every live chat.
 */
export function resolveTerminalSpawnSpec(
  shell: string,
  shellArgs: string[],
  terminalId: string,
  options: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    systemdRunAvailable?: boolean;
  } = {},
): TerminalSpawnSpec {
  const currentPlatform = options.platform ?? platform();
  const env = options.env ?? process.env;
  const isolationEnabled = env["JAIT_TERMINAL_ISOLATION"] !== "0"
    && (env["JAIT_TERMINAL_ISOLATION"] === "1" || Boolean(env["JAIT_UNIT"]));
  const systemdRunAvailable = options.systemdRunAvailable ?? existsSync("/usr/bin/systemd-run");
  if (currentPlatform !== "linux" || !isolationEnabled || !systemdRunAvailable) {
    return { command: shell, args: shellArgs };
  }

  const safeTerminalId = terminalId.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 180);
  const memoryHigh = validSystemdMemoryValue(env["JAIT_TERMINAL_MEMORY_HIGH"], DEFAULT_TERMINAL_MEMORY_HIGH);
  const memoryMax = validSystemdMemoryValue(env["JAIT_TERMINAL_MEMORY_MAX"], DEFAULT_TERMINAL_MEMORY_MAX);
  const swapMax = validSystemdMemoryValue(env["JAIT_TERMINAL_SWAP_MAX"], DEFAULT_TERMINAL_SWAP_MAX);
  return {
    command: "/usr/bin/systemd-run",
    args: [
      "--user",
      "--scope",
      "--quiet",
      "--collect",
      `--unit=jait-terminal-${safeTerminalId}.scope`,
      "--property=OOMPolicy=kill",
      `--property=MemoryHigh=${memoryHigh}`,
      `--property=MemoryMax=${memoryMax}`,
      `--property=MemorySwapMax=${swapMax}`,
      "--",
      shell,
      ...shellArgs,
    ],
  };
}

export interface TerminalExecutionResult {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

export class TerminalSurface implements Surface {
  readonly type = "terminal" as const;

  private _state: SurfaceState = "idle";
  private _sessionId: string | null = null;
  private _startedAt: string | null = null;
  private _cwd: string | null = null;
  private _pid: number | null = null;
  private _pty: PTYInstance | null = null;
  private _outputBuffer: string[] = [];
  private _outputChunkCount = 0;
  /**
   * Chunk boundary (inclusive) of the last seen OSC 633;D "command finished"
   * marker. Serves as the lower boundary for a command's terminal-output
   * slice: everything past it (the next prompt redraw, bundled into the same
   * PTY read by shell integration) must not appear in a toolcard.
   * 0 = no completion marker seen yet.
   */
  private _commandDoneEndOffset = 0;
  private _cols: number;
  private _rows: number;
  private readonly shell: string;
  private readonly extraEnv: Record<string, string>;
  private _outputListeners: ((data: string) => void)[] = [];

  /** Whether the OSC 633 shell integration has emitted its first prompt (B marker) */
  private _shellIntegrationReady = false;
  private _shellIntegrationReadyResolve?: () => void;
  private _shellIntegrationReadyPromise: Promise<void>;

  /** Timestamp of last user input, command execution, or output — used for idle detection */
  private _lastActivityAt: number = Date.now();

  /** External callbacks (wired by index.ts / routes) */
  onOutput?: (data: string) => void;
  onStateChange?: (state: SurfaceState) => void;
  onExit?: (exitCode: number, signal?: number) => void;

  constructor(
    public readonly id: string,
    opts: TerminalSurfaceOptions = {},
  ) {
    this.shell = opts.shell ?? defaultShell();
    this._cols = opts.cols ?? 120;
    this._rows = opts.rows ?? 30;
    this.extraEnv = opts.env ?? {};
    this._shellIntegrationReadyPromise = new Promise<void>((resolve) => {
      this._shellIntegrationReadyResolve = resolve;
    });
  }

  get state(): SurfaceState {
    return this._state;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get pid(): number | undefined {
    return this._pid ?? undefined;
  }

  /** True once the shell has emitted at least one OSC 633;B prompt-end marker */
  get shellIntegrationReady(): boolean {
    return this._shellIntegrationReady;
  }

  /** Resolves when the shell integration prompt is first ready (or after a timeout fallback) */
  waitForPrompt(timeoutMs = 5000): Promise<void> {
    if (this._shellIntegrationReady) return Promise.resolve();
    return Promise.race([
      this._shellIntegrationReadyPromise,
      new Promise<void>((r) => setTimeout(r, timeoutMs)),
    ]);
  }

  async start(input: SurfaceStartInput): Promise<void> {
    if (this._state === "running") return;

    this._setState("starting");
    this._sessionId = input.sessionId;
    this._cwd = input.projectRoot;
    this._startedAt = new Date().toISOString();

    try {
      const integration = shellIntegrationScript(this.shell);

      // Build shell args — inject our integration script
      let shellArgs: string[];
      if (integration?.type === "pwsh") {
        // PowerShell: -NoExit -File <script> runs the script then stays interactive
        shellArgs = ["-NoExit", "-File", integration.path];
      } else if (integration?.type === "bash") {
        shellArgs = ["--rcfile", integration.path];
      } else if (integration?.type === "zsh") {
        // zsh: source our script via ZDOTDIR override is complex —
        // instead we'll source it after spawn via write()
        shellArgs = [];
      } else {
        shellArgs = platform() === "win32" ? ["-NoProfile"] : [];
      }

      // Git Bash (MSYS2/Cygwin-based) does not work well with ConPTY.
      const isGitBash = /Git[/\\].*bash\.exe$/i.test(this.shell);
      const spawnSpec = resolveTerminalSpawnSpec(this.shell, shellArgs, this.id);
      const pty = spawnPty(spawnSpec.command, spawnSpec.args, {
        name: "xterm-256color",
        cols: this._cols,
        rows: this._rows,
        cwd: input.projectRoot,
        env: { ...process.env, TERM: "xterm-256color", ...this.extraEnv },
        ...(platform() === "win32" ? { useConpty: !isGitBash } : {}),
      });

      this._pty = pty;
      this._pid = pty.pid;

      // Wire PTY output → surface listeners + buffer
      // Also watch for OSC 633;B to know when prompt is ready
      pty.onData((data: string) => {
        // A command that is still printing is not idle. Without this, a build
        // or test run longer than the reaper's window had its PTY killed
        // mid-run, taking the running command (and any background-completion
        // watcher) with it.
        this._lastActivityAt = Date.now();
        this._outputChunkCount += 1;
        this._outputBuffer.push(data);
        // Fix lower toolcard boundary: pin the chunk count at the OSC 633;D
        // ("command finished") marker. Shells bundle this marker into the
        // SAME PTY read as the next prompt redraw, so naively stopping at the
        // eventual settle-time chunk count lets the *next* prompt leak under
        // the command's output. Callers use this boundary as
        // `outputEndOffset`, and getTerminalOutputSlice trims the final
        // chunk at the marker.
        if (data.includes("\x1b]633;D")) {
          this._commandDoneEndOffset = this._outputChunkCount;
        }
        if (this._outputBuffer.length > 10000) {
          this._outputBuffer = this._outputBuffer.slice(-5000);
        }

        // Detect shell integration prompt-end marker
        if (!this._shellIntegrationReady && data.includes("\x1b]633;B")) {
          this._shellIntegrationReady = true;
          this._shellIntegrationReadyResolve?.();
        }

        this.onOutput?.(data);
        for (const listener of this._outputListeners) {
          listener(data);
        }
      });

      // Wire PTY exit
      pty.onExit((event: { exitCode: number; signal?: number }) => {
        this._pid = null;
        this._pty = null;
        this._setState("stopped");
        this.onExit?.(event.exitCode, event.signal);
      });

      this._setState("running");

      // For zsh: source integration after the shell starts
      if (integration?.type === "zsh") {
        setTimeout(() => {
          this.write(`source '${integration.path}'\n`);
        }, 300);
      }
    } catch (err) {
      this._setState("error");
      throw err;
    }
  }

  async stop(_input?: SurfaceStopInput): Promise<void> {
    if (!this._pty) {
      this._setState("stopped");
      return;
    }

    this._setState("stopping");
    try {
      this._pty.kill();
    } catch {
      // already dead
    }
    this._pty = null;
    this._pid = null;
    this._setState("stopped");
  }

  /** Write raw data to the PTY (user keyboard input from frontend) */
  write(data: string): void {
    if (this._state !== "running" || !this._pty) return;
    this._lastActivityAt = Date.now();
    try {
      this._pty.write(data);
    } catch (err) {
      console.error(`PTY write error (${this.id}):`, err);
    }
  }

  /** Resize the PTY */
  resize(cols: number, rows: number): void {
    if (!this._pty || this._state !== "running") return;
    this._cols = cols;
    this._rows = rows;
    try {
      this._pty.resize(cols, rows);
    } catch (err) {
      console.error(`PTY resize error (${this.id}):`, err);
    }
  }

  /** Add an output listener (used by terminal.run to mirror output) */
  addOutputListener(listener: (data: string) => void): void {
    this._outputListeners.push(listener);
  }

  /** Remove an output listener */
  removeOutputListener(listener: (data: string) => void): void {
    const idx = this._outputListeners.indexOf(listener);
    if (idx !== -1) this._outputListeners.splice(idx, 1);
  }

  snapshot(): SurfaceSnapshot {
    return {
      id: this.id,
      type: this.type,
      state: this._state,
      sessionId: this._sessionId ?? "",
      startedAt: this._startedAt ?? undefined,
      metadata: {
        shell: this.shell,
        cols: this._cols,
        rows: this._rows,
        pid: this._pid ?? null,
        cwd: this._cwd,
      },
    };
  }

  getOutputOffset(): number {
    return this._outputChunkCount;
  }

  /** Chunk boundary pinned at the last OSC 633;D "command finished" marker (0 = none seen yet). */
  getCommandDoneEndOffset(): number {
    return this._commandDoneEndOffset;
  }

  getRecentOutputSince(outputOffset: number, outputEndOffset?: number, lines = 100): string {
    // An explicit end offset always denotes a bounded *command* slice: trim
    // at the last OSC 633;D marker so the next prompt redraw bundled into
    // the marker's PTY read never reaches the toolcard.
    return getTerminalOutputSlice(
      this._outputBuffer,
      this._outputChunkCount,
      outputOffset,
      outputEndOffset,
      lines,
      outputEndOffset !== undefined,
    );
  }

  getRecentOutput(lines = 100): string {
    return this._outputBuffer.slice(-lines).join("");
  }

  /** Mark activity (called on subscribe, command execution, etc.) */
  touch(): void {
    this._lastActivityAt = Date.now();
  }

  /** Milliseconds since last activity */
  get idleMs(): number {
    return Date.now() - this._lastActivityAt;
  }

  private _setState(s: SurfaceState) {
    this._state = s;
    this.onStateChange?.(s);
  }
}

export class TerminalSurfaceFactory {
  readonly type = "terminal" as const;
  private opts: TerminalSurfaceOptions;

  constructor(opts: TerminalSurfaceOptions = {}) {
    this.opts = opts;
  }

  create(id: string): TerminalSurface {
    return new TerminalSurface(id, this.opts);
  }
}
