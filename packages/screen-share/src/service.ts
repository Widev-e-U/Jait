import { randomUUID } from "node:crypto";
import type {
  OsToolNetworkShareState,
  ScreenShareDevice,
  ScreenShareRouteMode,
  ScreenShareSessionState,
} from "@jait/shared";

interface StartShareInput {
  hostDeviceId: string;
  viewerDeviceIds?: string[];
}

interface UpdateViewerTransportInput {
  deviceId: string;
  latencyMs: number;
  preferP2P: boolean;
}

export class ScreenShareService {
  private readonly devices = new Map<string, ScreenShareDevice>();
  private activeSession: ScreenShareSessionState | null = null;

  registerDevice(device: Omit<ScreenShareDevice, "connectedAt" | "lastSeenAt">): ScreenShareDevice {
    const now = new Date().toISOString();
    const normalized: ScreenShareDevice = {
      ...device,
      connectedAt: this.devices.get(device.id)?.connectedAt ?? now,
      lastSeenAt: now,
    };
    this.devices.set(normalized.id, normalized);
    return normalized;
  }

  startShare(input: StartShareInput): ScreenShareSessionState {
    const host = this.devices.get(input.hostDeviceId);
    if (!host || !host.authorized) {
      throw new Error("Host device is not registered or authorized.");
    }

    const viewers = (input.viewerDeviceIds ?? [])
      .map((id) => this.devices.get(id))
      .filter((device): device is ScreenShareDevice => Boolean(device?.authorized))
      .map((device) => ({
        deviceId: device.id,
        connectedAt: new Date().toISOString(),
        canControl: device.platform !== "web",
        transportMode: "p2p" as ScreenShareRouteMode,
        latencyMs: 45,
      }));

    this.activeSession = {
      id: randomUUID(),
      status: "sharing",
      hostDeviceId: host.id,
      controllerDeviceId: viewers.find((viewer) => viewer.canControl)?.deviceId ?? null,
      viewers,
      capabilities: {
        remoteInput: true,
        recording: true,
        turnRelay: true,
        adaptiveStreaming: true,
      },
      transport: {
        iceConnectionState: viewers.length > 0 ? "connected" : "checking",
        routeMode: "p2p",
        avgLatencyMs: viewers.length > 0 ? 45 : 0,
        relayActive: false,
      },
      updatedAt: new Date().toISOString(),
    };

    return this.activeSession;
  }

  stopShare(): ScreenShareSessionState | null {
    if (!this.activeSession) return null;
    this.activeSession = {
      ...this.activeSession,
      status: "idle",
      updatedAt: new Date().toISOString(),
    };
    return this.activeSession;
  }

  transferControl(nextControllerDeviceId: string): ScreenShareSessionState {
    if (!this.activeSession || this.activeSession.status === "idle") {
      throw new Error("No active share session.");
    }

    const next = this.activeSession.viewers.find((viewer) => viewer.deviceId === nextControllerDeviceId && viewer.canControl);
    if (!next) {
      throw new Error("Target device is not an authorized controller for this session.");
    }

    this.activeSession = {
      ...this.activeSession,
      controllerDeviceId: next.deviceId,
      updatedAt: new Date().toISOString(),
    };
    return this.activeSession;
  }

  updateViewerTransport(input: UpdateViewerTransportInput): ScreenShareSessionState {
    if (!this.activeSession) {
      throw new Error("No active share session.");
    }

    const transportMode: ScreenShareRouteMode = input.preferP2P && input.latencyMs < 100 ? "p2p" : "turn";
    const viewers = this.activeSession.viewers.map((viewer) =>
      viewer.deviceId === input.deviceId
        ? { ...viewer, latencyMs: input.latencyMs, transportMode }
        : viewer,
    );
    const avgLatencyMs = viewers.length > 0 ? viewers.reduce((sum, viewer) => sum + viewer.latencyMs, 0) / viewers.length : 0;

    this.activeSession = {
      ...this.activeSession,
      viewers,
      transport: {
        ...this.activeSession.transport,
        avgLatencyMs: Math.round(avgLatencyMs),
        routeMode: viewers.every((viewer) => viewer.transportMode === "p2p") ? "p2p" : "turn",
        relayActive: viewers.some((viewer) => viewer.transportMode === "turn"),
      },
      updatedAt: new Date().toISOString(),
    };
    return this.activeSession;
  }

  captureScreen(): { mimeType: string; data: string; capturedAt: string } {
    return {
      mimeType: "image/png",
      data: "screen-capture-placeholder",
      capturedAt: new Date().toISOString(),
    };
  }

  startRecording(): { recordingId: string; status: "recording" } {
    return { recordingId: randomUUID(), status: "recording" };
  }

  getState(): OsToolNetworkShareState {
    return {
      devices: [...this.devices.values()],
      activeSession: this.activeSession,
    };
  }
}
