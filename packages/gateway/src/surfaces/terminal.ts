/**
 * Terminal Surface — Sprint 3.2 + 3.3
 *
 * Spawns a PTY process (pwsh on Windows, bash/zsh on Unix),
 * streams stdout/stderr via onOutput callback, supports resize.
 */

import * as pty from "node-pty";
import { platform } from "node:os";
import type {
  Surface,
  SurfaceStartInput,
  SurfaceStopInput,
  SurfaceSnapshot,
  SurfaceState,
} from "./contracts.js";

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

export class TerminalSurface implements Surface {
  readonly type = "terminal" as const;

  private _state: SurfaceState = "idle";
  private _sessionId: string | null = null;
  private _startedAt: string | null = null;
  private _cwd: string | null = null;
  private _process: pty.IPty | null = null;
  private _outputBuffer: string[] = [];
  private _cols: number;
  private _rows: number;
  private readonly shell: string;
  private readonly extraEnv: Record<string, string>;

  /** External callbacks */
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
    return this._process?.pid;
  }

  async start(input: SurfaceStartInput): Promise<void> {
    if (this._state === "running") return;

    this._setState("starting");
    this._sessionId = input.sessionId;
    this._cwd = input.workspaceRoot;
    this._startedAt = new Date().toISOString();

    try {
      this._process = pty.spawn(this.shell, [], {
        name: "xterm-256color",
        cols: this._cols,
        rows: this._rows,
        cwd: input.workspaceRoot,
        env: {
          ...process.env as Record<string, string>,
          TERM: "xterm-256color",
          ...this.extraEnv,
        },
      });

      this._process.onData((data) => {
        this._outputBuffer.push(data);
        // Keep buffer from growing unboundedly
        if (this._outputBuffer.length > 10000) {
          this._outputBuffer = this._outputBuffer.slice(-5000);
        }
        this.onOutput?.(data);
      });

      this._process.onExit(({ exitCode, signal }) => {
        this._setState("stopped");
        this.onExit?.(exitCode, signal);
      });

      this._setState("running");
    } catch (err) {
      this._setState("error");
      throw err;
    }
  }

  async stop(_input?: SurfaceStopInput): Promise<void> {
    if (!this._process) {
      this._setState("stopped");
      return;
    }

    this._setState("stopping");
    try {
      this._process.kill();
    } catch {
      // already dead
    }
    this._process = null;
    this._setState("stopped");
  }

  /** Write raw data to the PTY (user input) */
  write(data: string): void {
    if (this._state !== "running" || !this._process) {
      throw new Error("Terminal is not running");
    }
    this._process.write(data);
  }

  /** Resize the PTY */
  resize(cols: number, rows: number): void {
    if (this._process && this._state === "running") {
      this._cols = cols;
      this._rows = rows;
      this._process.resize(cols, rows);
    }
  }

  /** Execute a command and collect output until the prompt returns */
  async execute(command: string, timeoutMs = 30000): Promise<string> {
    if (this._state !== "running" || !this._process) {
      throw new Error("Terminal is not running");
    }

    return new Promise<string>((resolve, reject) => {
      let output = "";
      const startMark = `__JAIT_START_${Date.now()}__`;
      const endMark = `__JAIT_END_${Date.now()}__`;

      const handler = (data: string) => {
        output += data;
        if (output.includes(endMark)) {
          cleanup();
          // Extract content between markers
          const startIdx = output.indexOf(startMark);
          const endIdx = output.indexOf(endMark);
          if (startIdx !== -1 && endIdx !== -1) {
            const result = output
              .slice(startIdx + startMark.length, endIdx)
              .trim();
            resolve(result);
          } else {
            resolve(output.trim());
          }
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        // Remove this handler — use optional chaining on the listener
        const idx = this._outputListeners.indexOf(handler);
        if (idx !== -1) this._outputListeners.splice(idx, 1);
      };

      this._outputListeners.push(handler);

      // Write the command wrapped in markers
      const wrappedCmd = platform() === "win32"
        ? `echo '${startMark}'; ${command}; echo '${endMark}'\r`
        : `echo '${startMark}'; ${command}; echo '${endMark}'\n`;

      this._process!.write(wrappedCmd);
    });
  }

  private _outputListeners: ((data: string) => void)[] = [];

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
        pid: this._process?.pid ?? null,
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
