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
  /** Chat that owns the share. Chat-scoped sessions are isolated from each other. */
  chatId?: string | null;
  /** Node whose UI captures the screen, when the host is a Jait node. */
  nodeId?: string | null;
  initiatedBy?: "user" | "agent";
  /** Agent-initiated captures stay unapproved until the host user says yes. */
  requireConsent?: boolean;
  /** Short reason shown in the host approval prompt. */
  reason?: string | null;
}

interface UpdateViewerTransportInput {
  deviceId: string;
  latencyMs: number;
  preferP2P: boolean;
}

export class ScreenShareService {
  private readonly devices = new Map<string, ScreenShareDevice>();
  /** Every live share, keyed by session id. Chat-scoped shares live here too. */
  private readonly sessions = new Map<string, ScreenShareSessionState>();
  /** chatId → sessionId. Enforces one owning share per chat. */
  private readonly chatSessions = new Map<string, string>();
  /** The gateway-wide share, when a share was started outside any chat. */
  private activeSession: ScreenShareSessionState | null = null;

  getSession(sessionId: string): ScreenShareSessionState | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /** The live share owned by a chat, if any. */
  getSessionForChat(chatId: string): ScreenShareSessionState | null {
    const sessionId = this.chatSessions.get(chatId);
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session || session.status === "idle") return null;
    return session;
  }

  /** Every live share captured by a node's UI. */
  getSessionsForNode(nodeId: string): ScreenShareSessionState[] {
    return [...this.sessions.values()].filter(session => session.nodeId === nodeId && session.status !== "idle");
  }

  /** The live share captured by a node's UI, if any. */
  getSessionForNode(nodeId: string): ScreenShareSessionState | null {
    for (const session of this.sessions.values()) {
      if (session.nodeId === nodeId && session.status !== "idle") return session;
    }
    return null;
  }

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

    // One owning share per chat: starting again replaces the chat's session
    // instead of leaving two panels behind.
    const chatId = input.chatId ?? null;
    if (chatId) {
      const previousId = this.chatSessions.get(chatId);
      const previous = previousId ? this.sessions.get(previousId) : undefined;
      if (previous) this.sessions.set(previous.id, { ...previous, status: "idle", updatedAt: new Date().toISOString() });
    }

    const initiatedBy = input.initiatedBy ?? "user";
    const session: ScreenShareSessionState = {
      id: randomUUID(),
      status: "sharing",
      hostDeviceId: host.id,
      controllerDeviceId: viewers.find((viewer) => viewer.canControl)?.deviceId ?? null,
      viewers,
      capabilities: {
        remoteInput: host.capabilities.includes("remote-input"),
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
      chatId,
      nodeId: input.nodeId ?? null,
      initiatedBy,
      // A person sharing their own screen keeps control; agent requests start
      // with the agent as controller. Consent applies independently to either.
      controlOwner: initiatedBy === "agent" ? "agent" : "user",
      pendingApproval: Boolean(input.requireConsent),
      reason: input.reason ?? null,
    };

    this.sessions.set(session.id, session);
    if (chatId) this.chatSessions.set(chatId, session.id);
    else this.activeSession = session;

    return session;
  }

  /**
   * Attach a device to a share that already exists instead of starting a new
   * one. Idempotent: a reopened chat panel re-joins its own session without
   * forking it or triggering a second consent prompt on the node.
   */
  addViewer(sessionId: string, deviceId: string): ScreenShareSessionState {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Unknown share session.");
    if (session.status === "idle") throw new Error("This share has already ended.");
    if (deviceId === session.hostDeviceId) {
      throw new Error("The sharing device cannot also join as a viewer.");
    }
    const device = this.devices.get(deviceId);
    if (!device || !device.authorized) {
      throw new Error("Viewer device is not registered or authorized.");
    }
    // Already attached: return the session unchanged so the caller can simply
    // (re)negotiate against the existing peers.
    if (session.viewers.some((viewer) => viewer.deviceId === deviceId)) return session;

    const updated: ScreenShareSessionState = {
      ...session,
      viewers: [
        ...session.viewers,
        {
          deviceId: device.id,
          connectedAt: new Date().toISOString(),
          canControl: device.platform !== "web",
          transportMode: "p2p" as ScreenShareRouteMode,
          latencyMs: session.transport.avgLatencyMs || 45,
        },
      ],
      transport: {
        ...session.transport,
        iceConnectionState: "connected",
      },
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, updated);
    return updated;
  }

  /** Detach one viewer without stopping the host or other viewers. */
  removeViewer(sessionId: string, deviceId: string): ScreenShareSessionState {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === "idle") throw new Error("Unknown active share session.");
    if (deviceId === session.hostDeviceId) throw new Error("The host cannot leave as a viewer.");
    if (!session.viewers.some((viewer) => viewer.deviceId === deviceId)) return session;
    const updated: ScreenShareSessionState = {
      ...session,
      viewers: session.viewers.filter((viewer) => viewer.deviceId !== deviceId),
      controllerDeviceId: session.controllerDeviceId === deviceId ? null : session.controllerDeviceId,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, updated);
    if (this.activeSession?.id === session.id) this.activeSession = updated;
    return updated;
  }

  stopShare(sessionId?: string): ScreenShareSessionState | null {
    const target = sessionId ? this.sessions.get(sessionId) : this.activeSession;
    if (!target) return null;

    const stopped: ScreenShareSessionState = { ...target, status: "idle", updatedAt: new Date().toISOString() };
    this.sessions.set(stopped.id, stopped);
    if (this.activeSession?.id === stopped.id) this.activeSession = stopped;
    if (stopped.chatId && this.chatSessions.get(stopped.chatId) === stopped.id) {
      this.chatSessions.delete(stopped.chatId);
    }
    return stopped;
  }

  /** Mark a pending agent request approved (or rejected) by the host user. */
  resolveApproval(sessionId: string, approved: boolean): ScreenShareSessionState {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Unknown share session.");
    if (session.status !== "sharing" || (!approved && !session.pendingApproval)) {
      throw new Error("Screen share approval is no longer pending.");
    }

    const next: ScreenShareSessionState = approved
      ? { ...session, pendingApproval: false, status: "sharing", updatedAt: new Date().toISOString() }
      : { ...session, pendingApproval: false, status: "idle", updatedAt: new Date().toISOString() };

    this.sessions.set(next.id, next);
    if (this.activeSession?.id === next.id) this.activeSession = next;
    if (!approved && next.chatId && this.chatSessions.get(next.chatId) === next.id) {
      this.chatSessions.delete(next.chatId);
    }
    return next;
  }

  /**
   * Handoff between the person at the machine and the agent. Taking control
   * back also clears any agent-held controller seat.
   */
  setControlOwner(sessionId: string, controlOwner: "user" | "agent"): ScreenShareSessionState {
    const session = this.sessions.get(sessionId) ?? (this.activeSession?.id === sessionId ? this.activeSession : null);
    if (!session) throw new Error("Unknown share session.");
    if (session.status !== "sharing" || session.pendingApproval) {
      throw new Error("Screen share is not active and approved.");
    }

    const next: ScreenShareSessionState = {
      ...session,
      controlOwner,
      controllerDeviceId: controlOwner === "user" ? null : session.controllerDeviceId,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(next.id, next);
    if (this.activeSession?.id === next.id) this.activeSession = next;
    return next;
  }

  transferControl(nextControllerDeviceId: string, sessionId?: string): ScreenShareSessionState {
    const session = sessionId ? this.sessions.get(sessionId) : this.activeSession;
    if (!session || session.status === "idle") {
      throw new Error("No active share session.");
    }

    const next = session.viewers.find((viewer) => viewer.deviceId === nextControllerDeviceId && viewer.canControl);
    if (!next) {
      throw new Error("Target device is not an authorized controller for this session.");
    }

    const updated: ScreenShareSessionState = {
      ...session,
      controllerDeviceId: next.deviceId,
      controlOwner: "agent",
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(updated.id, updated);
    if (this.activeSession?.id === updated.id) this.activeSession = updated;
    return updated;
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
