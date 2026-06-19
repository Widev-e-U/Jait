import type { WsControlPlane } from "../ws.js";
import type {
  Surface,
  SurfaceSnapshot,
  SurfaceStartInput,
  SurfaceState,
  SurfaceStopInput,
} from "./contracts.js";

export interface RemoteTerminalSurfaceOptions {
  shell?: string;
  cols?: number;
  rows?: number;
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
  private _outputListeners: ((data: string) => void)[] = [];
  private _cols: number;
  private _rows: number;
  private _shell: string | null;
  private _lastActivityAt = Date.now();

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

  waitForPrompt(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 25)));
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
    this._outputBuffer.push(data);
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
