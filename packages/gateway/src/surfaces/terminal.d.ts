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
import type { Surface, SurfaceStartInput, SurfaceStopInput, SurfaceSnapshot, SurfaceState } from "./contracts.js";
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
export declare class TerminalSurface implements Surface {
    readonly id: string;
    readonly type: "terminal";
    private _state;
    private _sessionId;
    private _startedAt;
    private _cwd;
    private _pid;
    private _pty;
    private _outputBuffer;
    private _cols;
    private _rows;
    private readonly shell;
    private readonly extraEnv;
    private _outputListeners;
    /** Whether the OSC 633 shell integration has emitted its first prompt (B marker) */
    private _shellIntegrationReady;
    private _shellIntegrationReadyResolve?;
    private _shellIntegrationReadyPromise;
    /** External callbacks (wired by index.ts / routes) */
    onOutput?: (data: string) => void;
    onStateChange?: (state: SurfaceState) => void;
    onExit?: (exitCode: number, signal?: number) => void;
    constructor(id: string, opts?: TerminalSurfaceOptions);
    get state(): SurfaceState;
    get sessionId(): string | null;
    get pid(): number | undefined;
    /** True once the shell has emitted at least one OSC 633;B prompt-end marker */
    get shellIntegrationReady(): boolean;
    /** Resolves when the shell integration prompt is first ready (or after a timeout fallback) */
    waitForPrompt(timeoutMs?: number): Promise<void>;
    start(input: SurfaceStartInput): Promise<void>;
    stop(_input?: SurfaceStopInput): Promise<void>;
    /** Write raw data to the PTY (user keyboard input from frontend) */
    write(data: string): void;
    /** Resize the PTY */
    resize(cols: number, rows: number): void;
    /** Add an output listener (used by terminal.run to mirror output) */
    addOutputListener(listener: (data: string) => void): void;
    /** Remove an output listener */
    removeOutputListener(listener: (data: string) => void): void;
    snapshot(): SurfaceSnapshot;
    getRecentOutput(lines?: number): string;
    private _setState;
}
export declare class TerminalSurfaceFactory {
    readonly type: "terminal";
    private opts;
    constructor(opts?: TerminalSurfaceOptions);
    create(id: string): TerminalSurface;
}
//# sourceMappingURL=terminal.d.ts.map