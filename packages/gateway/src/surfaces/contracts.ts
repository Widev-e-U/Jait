export type SurfaceState = "idle" | "starting" | "running" | "stopping" | "error";

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

  start(input: SurfaceStartInput): Promise<void>;
  stop(input?: SurfaceStopInput): Promise<void>;
  snapshot(): SurfaceSnapshot;
}

export interface SurfaceFactory {
  type: string;
  create(id: string): Surface;
}
