export declare const SURFACE_TYPES: readonly ["terminal", "browser", "screen-share", "screen-capture", "voice", "file-system", "os-control", "clipboard", "notification"];
export type SurfaceType = (typeof SURFACE_TYPES)[number];
export interface SurfaceCapabilities {
    supportsStreaming: boolean;
    supportsInput: boolean;
    supportsSnapshot: boolean;
    supportsRecording: boolean;
    requiresConsent: boolean;
    maxConcurrent: number;
}
export interface SurfaceInfo {
    id: string;
    type: SurfaceType;
    status: "connected" | "disconnected" | "error";
    capabilities: SurfaceCapabilities;
    deviceId: string;
    connectedAt: string | null;
}
//# sourceMappingURL=surface.d.ts.map