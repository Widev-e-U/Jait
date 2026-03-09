import type { OsToolNetworkShareState, ScreenShareDevice, ScreenShareSessionState } from "@jait/shared";
interface StartShareInput {
    hostDeviceId: string;
    viewerDeviceIds?: string[];
}
interface UpdateViewerTransportInput {
    deviceId: string;
    latencyMs: number;
    preferP2P: boolean;
}
export declare class ScreenShareService {
    private readonly devices;
    private activeSession;
    registerDevice(device: Omit<ScreenShareDevice, "connectedAt" | "lastSeenAt">): ScreenShareDevice;
    startShare(input: StartShareInput): ScreenShareSessionState;
    stopShare(): ScreenShareSessionState | null;
    transferControl(nextControllerDeviceId: string): ScreenShareSessionState;
    updateViewerTransport(input: UpdateViewerTransportInput): ScreenShareSessionState;
    captureScreen(): {
        mimeType: string;
        data: string;
        capturedAt: string;
    };
    startRecording(): {
        recordingId: string;
        status: "recording";
    };
    getState(): OsToolNetworkShareState;
}
export {};
//# sourceMappingURL=service.d.ts.map