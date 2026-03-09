/**
 * useScreenShare — React hook for remote screen viewing via WebRTC
 *
 * Primary use case: User tells the agent to connect to a remote device's
 * screen (Electron desktop app or mobile app). The remote device captures
 * its screen and streams it back to the viewer via WebRTC.
 *
 * Flow:
 * 1. Both devices register with the gateway on mount
 * 2. User (or agent) calls requestRemoteShare(deviceId) → gateway relays
 *    a "screen-share:start-request" WS message to the remote device
 * 3. Remote device auto-captures its screen (Electron desktopCapturer)
 *    and creates a WebRTC offer
 * 4. Viewer receives the offer, creates an answer, ICE candidates exchanged
 * 5. Remote screen appears in the viewer's video element
 *
 * The same hook also handles the HOST side: if this device receives a
 * start-request, it auto-captures and starts streaming.
 */
import type { ScreenShareDevice, ScreenShareSessionState } from '@jait/shared';
export interface PendingShareRequest {
    sessionId: string;
    hostDeviceId: string;
}
export interface ScreenShareState {
    /** Current session state from the gateway */
    session: ScreenShareSessionState | null;
    /** All registered screen-share devices */
    devices: ScreenShareDevice[];
    /** Local device ID (this client) */
    localDeviceId: string | null;
    /** Whether this client is the host (sharing its screen to a viewer) */
    isHost: boolean;
    /** Whether this client is the viewer (seeing a remote screen) */
    isViewer: boolean;
    /** Whether a session is active */
    isActive: boolean;
    /** Loading state */
    loading: boolean;
    /** Error message */
    error: string | null;
    /** The device we're currently connected to / viewing */
    connectedDeviceId: string | null;
    /** Pending share request (web browser needs user gesture to capture) */
    pendingShareRequest: PendingShareRequest | null;
}
export interface DesktopSource {
    id: string;
    name: string;
    thumbnail: string;
    appIcon: string | null;
}
interface UseScreenShareOptions {
    token?: string | null;
}
export declare function useScreenShare(options?: UseScreenShareOptions): {
    requestRemoteShare: (targetDeviceId: string) => Promise<void>;
    startHosting: (sessionId?: string) => Promise<void>;
    disconnect: () => Promise<void>;
    acceptPendingShare: () => void;
    rejectPendingShare: () => void;
    getDesktopSources: () => Promise<DesktopSource[]>;
    refreshState: () => Promise<void>;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    /** Current session state from the gateway */
    session: ScreenShareSessionState | null;
    /** All registered screen-share devices */
    devices: ScreenShareDevice[];
    /** Local device ID (this client) */
    localDeviceId: string | null;
    /** Whether this client is the host (sharing its screen to a viewer) */
    isHost: boolean;
    /** Whether this client is the viewer (seeing a remote screen) */
    isViewer: boolean;
    /** Whether a session is active */
    isActive: boolean;
    /** Loading state */
    loading: boolean;
    /** Error message */
    error: string | null;
    /** The device we're currently connected to / viewing */
    connectedDeviceId: string | null;
    /** Pending share request (web browser needs user gesture to capture) */
    pendingShareRequest: PendingShareRequest | null;
};
export {};
//# sourceMappingURL=useScreenShare.d.ts.map