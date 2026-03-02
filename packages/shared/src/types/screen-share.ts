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
