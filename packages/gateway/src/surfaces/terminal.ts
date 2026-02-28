/**
 * Terminal Surface — Sprint 3.2 + 3.3
 *
 * Uses the PTY broker (Node.js subprocess) to manage ConPTY processes,
 * working around Bun's broken node:net stream writes that prevent
 * node-pty from functioning on Windows.
 */

import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";
import type {
  Surface,
  SurfaceStartInput,
  SurfaceStopInput,
  SurfaceSnapshot,
  SurfaceState,
} from "./contracts.js";
import type { PtyBrokerClient } from "../pty-broker-client.js";

function defaultShell(): string {
  if (platform() === "win32") return "powershell.exe";
  return process.env["SHELL"] ?? "/bin/bash";
}

export interface TerminalSurfaceOptions {
  shell?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  /** Shared PTY broker client — all terminals use the same broker process */
  broker?: PtyBrokerClient;
}

export class TerminalSurface implements Surface {
  readonly type = "terminal" as const;

  private _state: SurfaceState = "idle";
  private _sessionId: string | null = null;
  private _startedAt: string | null = null;
  private _cwd: string | null = null;
  private _ptyId: string | null = null;
  private _pid: number | null = null;
  private _outputBuffer: string[] = [];
  private _cols: number;
  private _rows: number;
  private readonly shell: string;
  private readonly extraEnv: Record<string, string>;
  private readonly broker: PtyBrokerClient | null;

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
    this.broker = opts.broker ?? null;
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

  get ptyId(): string | null {
    return this._ptyId;
  }

  async start(input: SurfaceStartInput): Promise<void> {
    if (this._state === "running") return;
    if (!this.broker) throw new Error("PTY broker not available");

    this._setState("starting");
    this._sessionId = input.sessionId;
    this._cwd = input.workspaceRoot;
    this._startedAt = new Date().toISOString();

    try {
      const { ptyId, pid } = await this.broker.spawn({
        shell: this.shell,
        cols: this._cols,
        rows: this._rows,
        cwd: input.workspaceRoot,
        env: this.extraEnv,
      });

      this._ptyId = ptyId;
      this._pid = pid;
      this._setState("running");
    } catch (err) {
      this._setState("error");
      throw err;
    }
  }

  /**
   * Called by the broker dispatcher when this terminal's PTY emits output.
   * (Wired externally via onOutput on the broker client.)
   */
  handleBrokerOutput(data: string): void {
    this._outputBuffer.push(data);
    if (this._outputBuffer.length > 10000) {
      this._outputBuffer = this._outputBuffer.slice(-5000);
    }
    this.onOutput?.(data);
    for (const listener of this._outputListeners) {
      listener(data);
    }
  }

  /**
   * Called by the broker dispatcher when this terminal's PTY exits.
   */
  handleBrokerExit(exitCode: number, signal?: number): void {
    this._ptyId = null;
    this._pid = null;
    this._setState("stopped");
    this.onExit?.(exitCode, signal);
  }

  async stop(_input?: SurfaceStopInput): Promise<void> {
    if (!this._ptyId || !this.broker) {
      this._setState("stopped");
      return;
    }

    this._setState("stopping");
    try {
      await this.broker.kill(this._ptyId);
    } catch {
      // already dead
    }
    this._ptyId = null;
    this._pid = null;
    this._setState("stopped");
  }

  /** Write raw data to the PTY (user input) */
  write(data: string): void {
    if (this._state !== "running" || !this._ptyId || !this.broker) return;
    // Fire-and-forget — the broker will ack or log errors
    this.broker.write(this._ptyId, data).catch((err) => {
      console.error(`PTY write error (${this.id}):`, err);
    });
  }

  /** Resize the PTY */
  resize(cols: number, rows: number): void {
    if (!this._ptyId || !this.broker || this._state !== "running") return;
    this._cols = cols;
    this._rows = rows;
    this.broker.resize(this._ptyId, cols, rows).catch((err) => {
      console.error(`PTY resize error (${this.id}):`, err);
    });
  }

  /** Strip ANSI escape sequences from PTY output */
  private static stripAnsi(s: string): string {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, "");
  }

  /**
   * Execute a command and return its output.
   *
   * Strategy: redirect stdout+stderr to a temp file, echo a short sentinel,
   * then read the file once the sentinel appears in the PTY stream.
   * This avoids all ANSI/line-wrapping corruption issues with in-stream markers.
   */
  /** Read a temp file, detecting UTF-16 LE (PS 5.1 Tee-Object) vs UTF-8 */
  private static readTempFile(path: string): string {
    const buf = readFileSync(path);
    let text: string;
    // UTF-16 LE BOM: FF FE (produced by PowerShell 5.1 Tee-Object)
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
      text = new TextDecoder('utf-16le').decode(buf);
    } else {
      text = new TextDecoder('utf-8').decode(buf);
    }
    return text.replace(/^\uFEFF/, '').trim();
  }

  async execute(
    command: string,
    timeoutMs = 30000,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    if (this._state !== "running" || !this._ptyId || !this.broker) {
      throw new Error("Terminal is not running");
    }

    const ts = Date.now();
    const rnd = Math.random().toString(36).slice(2, 8);
    const sentinel = `JDONE${ts}${rnd}`;
    const tmpPath = join(tmpdir(), `jait_out_${ts}_${rnd}.txt`);

    return new Promise<string>((resolve, reject) => {
      let rawOutput = "";

      const handler = (data: string) => {
        rawOutput += data;

        // Stream cleaned chunks to callback (skip echo line & sentinel)
        if (onChunk) {
          const stripped = TerminalSurface.stripAnsi(data).replace(/\r/g, "");
          if (stripped && !stripped.includes("Tee-Object") && !stripped.includes("tee '") && !stripped.includes(sentinel)) {
            onChunk(stripped);
          }
        }

        // Strip ANSI + carriage returns for clean sentinel detection
        const clean = TerminalSurface.stripAnsi(rawOutput).replace(/\r/g, "");
        // Look for sentinel at start of a line (not in the echoed command)
        if (clean.includes("\n" + sentinel) || clean.endsWith(sentinel)) {
          cleanup();
          // Small delay to ensure file is fully flushed
          setTimeout(() => {
            try {
              const content = TerminalSurface.readTempFile(tmpPath);
              try { unlinkSync(tmpPath); } catch { /* ignore */ }
              resolve(content || "(no output)");
            } catch {
              resolve("(command produced no capturable output)");
            }
          }, 150);
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        try {
          const content = TerminalSurface.readTempFile(tmpPath);
          try { unlinkSync(tmpPath); } catch { /* ignore */ }
          resolve(`[timeout after ${timeoutMs}ms]\n${content}`);
        } catch {
          // Return partial PTY output as last resort
          const partial = TerminalSurface.stripAnsi(rawOutput).replace(/\r/g, "").trim();
          if (partial) {
            resolve(`[timeout after ${timeoutMs}ms — partial]\n${partial}`);
          } else {
            reject(new Error(`Command timed out after ${timeoutMs}ms with no output`));
          }
        }
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        const idx = this._outputListeners.indexOf(handler);
        if (idx !== -1) this._outputListeners.splice(idx, 1);
      };

      this._outputListeners.push(handler);

      // Tee output to both PTY (for streaming) and temp file (for reliable capture)
      const wrappedCmd = platform() === "win32"
        ? `& { ${command} } 2>&1 | Tee-Object -FilePath '${tmpPath}'; Write-Output '${sentinel}'\r`
        : `{ ${command}; } 2>&1 | tee '${tmpPath}'; echo '${sentinel}'\n`;

      this.broker!.write(this._ptyId!, wrappedCmd).catch((err) => {
        cleanup();
        reject(new Error(`Terminal process died before command could be written: ${err}`));
      });
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
        pid: this._pid ?? null,
        cwd: this._cwd,
        ptyId: this._ptyId,
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
