export type DevicePlatform = "desktop" | "react-native" | "web";

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
  /**
   * Chat that owns this share. Set when a share belongs to a conversation
   * rather than to the whole gateway, so only that chat can see and control it.
   */
  chatId?: string | null;
  /** Node whose UI is capturing the screen, when the host is a Jait node. */
  nodeId?: string | null;
  /** Who asked for the share: the person at the machine, or the agent in a chat. */
  initiatedBy?: "user" | "agent";
  /** Who is driving input on the shared screen: the user (handoff) or the agent. */
  controlOwner?: "user" | "agent";
  /** True while an agent-initiated capture is waiting for the node's user to approve. */
  pendingApproval?: boolean;
  /** Why the share was requested — shown in the approval prompt. */
  reason?: string | null;
}

export interface OsToolNetworkShareState {
  devices: ScreenShareDevice[];
  activeSession: ScreenShareSessionState | null;
}

// ── WebRTC Signaling types ──────────────────────────────────────────

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

export type ScreenShareSignalType =
  | "screen-share:offer"
  | "screen-share:answer"
  | "screen-share:ice-candidate"
  | "screen-share:start-request"
  | "screen-share:start-error"
  | "screen-share:stop-request"
  | "screen-share:control-handoff"
  | "screen-share:state-update";

export interface ScreenShareStartRequest {
  hostDeviceId: string;
  /**
   * Session this request belongs to. Chat-scoped shares always set it so the
   * host can tag the capture with the owning chat and nothing else.
   */
  sessionId?: string;
  viewerDeviceIds?: string[];
  chatId?: string | null;
  nodeId?: string | null;
  initiatedBy?: "user" | "agent";
  /**
   * When true the host must show the person at the machine a prompt and only
   * capture after they approve. Agent-initiated requests always set this: a
   * remote conversation may never start a capture on its own.
   */
  requireConsent?: boolean;
  /** Short, human-readable reason shown in the approval prompt. */
  reason?: string | null;
}

/**
 * Broadcast whenever the person at the shared machine takes input back
 * ("handoff") or hands it to the agent again.
 */
export interface ScreenShareControlHandoff {
  sessionId: string;
  controlOwner: "user" | "agent";
}

export interface ScreenShareStopRequest {
  sessionId: string;
}
