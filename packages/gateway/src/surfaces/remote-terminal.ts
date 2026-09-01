import type { WsControlPlane } from "../ws.js";
import type {
  Surface,
  SurfaceSnapshot,
  SurfaceStartInput,
  SurfaceState,
  SurfaceStopInput,
} from "./contracts.js";
import { getTerminalOutputSlice } from "./terminal-output.js";

export interface RemoteTerminalSurfaceOptions {
  shell?: string;
  cols?: number;
  rows?: number;
  reuseOnly?: boolean;
}

interface RemoteTerminalStartResult {
  pid?: number | null;
  shell?: string | null;
}

export class RemoteTerminalSurface implements Surface {
  readonly type = "terminal" as const;

  private _state: SurfaceState = "idle";
  private _sessionId: string | null = null;
  private _startedAt: string | null = null;
  private _cwd: string | null = null;
  private _pid: number | null = null;
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
  private _outputListeners: ((data: string) => void)[] = [];
  private _cols: number;
  private _rows: number;
  private _shell: string | null;
  private readonly _reuseOnly: boolean;
  private _lastActivityAt = Date.now();
  /** Whether the remote shell has emitted its first OSC 633;B prompt-end marker */
  private _shellIntegrationReady = false;
  private _shellIntegrationReadyResolve?: () => void;
  private readonly _shellIntegrationReadyPromise: Promise<void>;
  /**
   * Whether the remote shell's line editor has enabled bracketed paste
   * (CSI ?2004h at the prompt — PSReadLine and readline both emit this).
   */
  private _bracketedPasteSeen = false;

  onOutput?: (data: string) => void;
  onStateChange?: (state: SurfaceState) => void;

  constructor(
    public readonly id: string,
    private readonly ws: WsControlPlane,
    private readonly nodeId: string,
    opts: RemoteTerminalSurfaceOptions = {},
  ) {
    this._cols = opts.cols ?? 120;
    this._rows = opts.rows ?? 30;
    this._shell = opts.shell ?? null;
    this._reuseOnly = opts.reuseOnly ?? false;
    this._shellIntegrationReadyPromise = new Promise<void>((resolve) => {
      this._shellIntegrationReadyResolve = resolve;
    });
    // A reattached terminal is already sitting at a prompt from an earlier
    // command, so it will not emit a fresh B marker until we write to it.
    // Waiting for one would stall every reuse for the full timeout.
    if (this._reuseOnly) this._markShellIntegrationReady();
  }

  private _markShellIntegrationReady(): void {
    if (this._shellIntegrationReady) return;
    this._shellIntegrationReady = true;
    this._shellIntegrationReadyResolve?.();
  }

  get state(): SurfaceState {
    return this._state;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  async start(input: SurfaceStartInput): Promise<void> {
    if (this._state === "running") return;

    this._setState("starting");
    this._sessionId = input.sessionId;
    this._cwd = input.projectRoot;
    this._startedAt = new Date().toISOString();

    try {
      const result = await this.ws.proxyTerminalOp<RemoteTerminalStartResult>(
        this.nodeId,
        "start",
        {
          terminalId: this.id,
          sessionId: input.sessionId,
          projectRoot: input.projectRoot,
          cols: this._cols,
          rows: this._rows,
          ...(this._shell ? { shell: this._shell } : {}),
          ...(this._reuseOnly ? { reuseOnly: true } : {}),
        },
        15_000,
      );
      this._pid = typeof result?.pid === "number" ? result.pid : null;
      this._shell = typeof result?.shell === "string" && result.shell ? result.shell : this._shell;
      this._setState("running");
    } catch (err) {
      this._setState("error");
      throw err;
    }
  }

  async stop(_input?: SurfaceStopInput): Promise<void> {
    if (this._state === "stopped") return;
    this._setState("stopping");
    try {
      await this.ws.proxyTerminalOp(this.nodeId, "stop", { terminalId: this.id }, 5_000);
    } catch {
      // The owning node may already be gone. The gateway surface should still close.
    }
    this._pid = null;
    this._setState("stopped");
  }

  write(data: string): void {
    if (this._state !== "running") return;
    this._lastActivityAt = Date.now();
    try {
      this.ws.sendTerminalOp(this.nodeId, "input", { terminalId: this.id, data });
    } catch (err) {
      this.ingestOutput(`\r\nRemote terminal input failed: ${err instanceof Error ? err.message : String(err)}\r\n`);
    }
  }

  resize(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
    if (this._state !== "running") return;
    try {
      this.ws.sendTerminalOp(this.nodeId, "resize", { terminalId: this.id, cols, rows });
    } catch {
      // Resize is best-effort; keep local dimensions for subsequent snapshots.
    }
  }

  /** True once the remote shell has emitted at least one OSC 633;B prompt-end marker */
  get shellIntegrationReady(): boolean {
    return this._shellIntegrationReady;
  }

  /**
   * True once the remote shell's line editor enabled bracketed paste
   * (CSI ?2004h). Agent command writes use this to wrap single-line commands
   * so PSReadLine renders the echoed input in exactly one frame.
   */
  get bracketedPasteEnabled(): boolean {
    return this._bracketedPasteSeen;
  }

  /**
   * Resolves once the remote shell is actually at a prompt (or after a timeout
   * fallback for shells without OSC 633 integration).
   *
   * This used to resolve after a flat 25 ms, which meant the first command was
   * written into a PTY whose shell had not finished starting yet — on slower
   * remote shells (notably PowerShell loading its profile) the keystrokes were
   * dropped and the command never ran, so the call sat there until the timeout
   * and came back "(no output)".
   */
  waitForPrompt(timeoutMs = 5000): Promise<void> {
    if (this._shellIntegrationReady) return Promise.resolve();
    return Promise.race([
      this._shellIntegrationReadyPromise,
      new Promise<void>((r) => setTimeout(r, timeoutMs)),
    ]);
  }

  addOutputListener(listener: (data: string) => void): void {
    this._outputListeners.push(listener);
  }

  removeOutputListener(listener: (data: string) => void): void {
    const idx = this._outputListeners.indexOf(listener);
    if (idx !== -1) this._outputListeners.splice(idx, 1);
  }

  ingestOutput(data: string): void {
    if (!data) return;
    this._lastActivityAt = Date.now();
    if (!this._shellIntegrationReady && data.includes("\x1b]633;B")) {
      this._markShellIntegrationReady();
    }
    // Remember that the shell's line editor supports bracketed paste so agent
    // command writes can be wrapped in the paste markers (see
    // buildSingleLineTerminalInput in tools/terminal-tools.ts).
    if (!this._bracketedPasteSeen && data.includes("\x1b[?2004h")) {
      this._bracketedPasteSeen = true;
    }
    this._outputChunkCount += 1;
    this._outputBuffer.push(data);
    // Fix lower toolcard boundary: pin the chunk count at the OSC 633;D
    // ("command finished") marker. Shells bundle this marker into the SAME
    // PTY read as the next prompt redraw, so naively stopping at the eventual
    // settle-time chunk count lets the *next* prompt leak under the
    // command's output. Callers use this boundary as `outputEndOffset`,
    // and getTerminalOutputSlice trims the final chunk at the marker.
    if (data.includes("\x1b]633;D")) {
      this._commandDoneEndOffset = this._outputChunkCount;
    }
    if (this._outputBuffer.length > 10000) {
      this._outputBuffer = this._outputBuffer.slice(-5000);
    }
    this.onOutput?.(data);
    for (const listener of this._outputListeners) {
      listener(data);
    }
  }

  ingestExit(exitCode?: number | null, signal?: number | string | null): void {
    this._pid = null;
    if (this._state !== "stopped") {
      this.ingestOutput(`\r\n[remote terminal exited${typeof exitCode === "number" ? ` with code ${exitCode}` : ""}${signal ? `, signal ${signal}` : ""}]\r\n`);
    }
    this._setState("stopped");
  }

  snapshot(): SurfaceSnapshot {
    return {
      id: this.id,
      type: this.type,
      state: this._state,
      sessionId: this._sessionId ?? "",
      startedAt: this._startedAt ?? undefined,
      metadata: {
        shell: this._shell ?? null,
        cols: this._cols,
        rows: this._rows,
        pid: this._pid ?? null,
        cwd: this._cwd,
        nodeId: this.nodeId,
        remote: true,
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

  touch(): void {
    this._lastActivityAt = Date.now();
  }

  get idleMs(): number {
    return Date.now() - this._lastActivityAt;
  }

  private _setState(state: SurfaceState): void {
    this._state = state;
    this.onStateChange?.(state);
  }
}
