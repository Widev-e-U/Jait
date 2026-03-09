/**
 * ScreenSharePanel — Remote desktop viewing panel
 *
 * Designed for the primary use case: connecting to a remote device
 * (Electron desktop or mobile) and viewing its screen in real-time.
 *
 * Layout:
 * - When not connected: device list with "Connect" buttons
 * - When connected: full remote screen viewer + small control bar
 */
import type { ScreenShareState } from '@/hooks/useScreenShare';
interface ScreenSharePanelProps {
    screenShare: ScreenShareState & {
        requestRemoteShare: (targetDeviceId: string) => Promise<void>;
        disconnect: () => Promise<void>;
        acceptPendingShare: () => void;
        rejectPendingShare: () => void;
        refreshState: () => Promise<void>;
        localStream: MediaStream | null;
        remoteStream: MediaStream | null;
    };
}
export declare function ScreenSharePanel({ screenShare }: ScreenSharePanelProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=screen-share-panel.d.ts.map