/**
 * Terminal Surface — uses bun-pty directly.
 *
 * Each TerminalSurface owns a persistent interactive PTY shell process
 * (viewable in the frontend via xterm.js + WebSocket).
 *
 * For command execution, `terminal.run` spawns a separate short-lived PTY
 * and mirrors output into this surface so the user can see it.
 */

import { platform } from "node:os";
import type {
  Surface,
  SurfaceStartInput,
  SurfaceStopInput,
  SurfaceSnapshot,
  SurfaceState,
} from "./contracts.js";

// bun-pty is a Bun native PTY implementation
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bunPty = require("bun-pty") as typeof import("bun-pty");

function defaultShell(): string {
  if (platform() === "win32") return "powershell.exe";
  return process.env["SHELL"] ?? "/bin/bash";
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
  private _pty: ReturnType<typeof bunPty.spawn> | null = null;
  private _outputBuffer: string[] = [];
  private _cols: number;
  private _rows: number;
  private readonly shell: string;
  private readonly extraEnv: Record<string, string>;
  private _outputListeners: ((data: string) => void)[] = [];

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

  async start(input: SurfaceStartInput): Promise<void> {
    if (this._state === "running") return;

    this._setState("starting");
    this._sessionId = input.sessionId;
    this._cwd = input.workspaceRoot;
    this._startedAt = new Date().toISOString();

    try {
      const shellArgs = platform() === "win32" ? ["-NoProfile"] : [];
      const pty = bunPty.spawn(this.shell, shellArgs, {
        name: "xterm-256color",
        cols: this._cols,
        rows: this._rows,
        cwd: input.workspaceRoot,
        env: { ...process.env, TERM: "xterm-256color", ...this.extraEnv },
      });

      this._pty = pty;
      this._pid = pty.pid;

      // Wire PTY output → surface listeners + buffer
      pty.onData((data: string) => {
        this._outputBuffer.push(data);
        if (this._outputBuffer.length > 10000) {
          this._outputBuffer = this._outputBuffer.slice(-5000);
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
