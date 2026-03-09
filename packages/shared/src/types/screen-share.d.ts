export type DevicePlatform = "electron" | "react-native" | "web";
export interface ScreenShareDevice {
    id: string;
    name: string;
    platform: DevicePlatform;
    authorized: boolean;
    capabilities: string[];
    connectedAt: string;
    lastSeenAt: string;
}
export type ScreenShareRouteMode = "p2p" | "turn";
export interface ScreenShareViewer {
    deviceId: string;
    connectedAt: string;
    canControl: boolean;
    transportMode: ScreenShareRouteMode;
    latencyMs: number;
}
export interface ScreenShareSessionState {
    id: string;
    status: "idle" | "sharing" | "paused";
    hostDeviceId: string;
    controllerDeviceId: string | null;
    viewers: ScreenShareViewer[];
    capabilities: {
        remoteInput: boolean;
        recording: boolean;
        turnRelay: boolean;
        adaptiveStreaming: boolean;
    };
    transport: {
        iceConnectionState: "new" | "checking" | "connected" | "disconnected" | "failed";
        routeMode: ScreenShareRouteMode;
        avgLatencyMs: number;
        relayActive: boolean;
    };
    updatedAt: string;
}
export interface OsToolNetworkShareState {
    devices: ScreenShareDevice[];
    activeSession: ScreenShareSessionState | null;
}
export interface ScreenShareOffer {
    sessionId: string;
    hostDeviceId: string;
    sdp: string;
}
export interface ScreenShareAnswer {
    sessionId: string;
    viewerDeviceId: string;
    sdp: string;
}
export interface ScreenShareIceCandidate {
    sessionId: string;
    fromDeviceId: string;
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
}
export type ScreenShareSignalType = "screen-share:offer" | "screen-share:answer" | "screen-share:ice-candidate" | "screen-share:start-request" | "screen-share:stop-request" | "screen-share:state-update";
export interface ScreenShareStartRequest {
    hostDeviceId: string;
    viewerDeviceIds?: string[];
}
export interface ScreenShareStopRequest {
    sessionId: string;
}
//# sourceMappingURL=screen-share.d.ts.map