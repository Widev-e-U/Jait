export type SurfaceState = "idle" | "starting" | "running" | "stopping" | "stopped" | "error";
export interface SurfaceStartInput {
    sessionId: string;
    workspaceRoot: string;
}
export interface SurfaceStopInput {
    reason?: string;
}
export interface SurfaceSnapshot {
    id: string;
    type: string;
    state: SurfaceState;
    sessionId: string;
    startedAt?: string;
    metadata: Record<string, string | number | boolean | null>;
}
export interface Surface {
    readonly id: string;
    readonly type: string;
    readonly state: SurfaceState;
    readonly sessionId: string | null;
    start(input: SurfaceStartInput): Promise<void>;
    stop(input?: SurfaceStopInput): Promise<void>;
    snapshot(): SurfaceSnapshot;
    /** Event callback — fired when output arrives (terminal stdout, etc.) */
    onOutput?: (data: string) => void;
    /** Event callback — fired on state change */
    onStateChange?: (state: SurfaceState) => void;
}
export interface SurfaceFactory {
    type: string;
    create(id: string): Surface;
}
//# sourceMappingURL=contracts.d.ts.map