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

function defaultShell(): string {
  if (platform() === "win32") {
    // Prefer PowerShell 7 (pwsh) over Windows PowerShell 5.1 (powershell)
    // pwsh supports modern escape sequences and PSReadLine features
    try {
      execSync("pwsh.exe -v", { stdio: "ignore", timeout: 3000, windowsHide: true });
      return "pwsh.exe";
    } catch {
      return "powershell.exe";
    }
  }
  return process.env["SHELL"] ?? "/bin/bash";
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
    this._cwd = input.workspaceRoot;
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

      const pty = spawnPty(this.shell, shellArgs, {
        name: "xterm-256color",
        cols: this._cols,
        rows: this._rows,
        cwd: input.workspaceRoot,
        env: { ...process.env, TERM: "xterm-256color", ...this.extraEnv },
        ...(platform() === "win32" ? { useConpty: true } : {}),
      });

      this._pty = pty;
      this._pid = pty.pid;

      // Wire PTY output → surface listeners + buffer
      // Also watch for OSC 633;B to know when prompt is ready
      pty.onData((data: string) => {
        this._outputBuffer.push(data);
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
