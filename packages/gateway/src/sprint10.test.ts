import { describe, expect, it } from "vitest";
import { ScreenShareService } from "@jait/screen-share";
import { SurfaceRegistry } from "./surfaces/registry.js";
import { createToolRegistry } from "./tools/index.js";

describe("Sprint 10 — Screen Sharing (WebRTC control plane)", () => {
  it("registers Sprint 10 tools and returns full os_tool state", async () => {
    const screenShare = new ScreenShareService();
    const tools = createToolRegistry(new SurfaceRegistry(), { screenShare });

    expect(tools.listNames()).toContain("screen.share");
    expect(tools.listNames()).toContain("screen.capture");
    expect(tools.listNames()).toContain("screen.record");
    expect(tools.listNames()).toContain("os_tool");

    await tools.execute("os_tool", {
      action: "register-device",
      device: { id: "host-1", name: "Primary Desktop", platform: "electron", capabilities: ["capture", "input"] },
    }, {
      actionId: "a1",
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
      requestedBy: "test",
    });

    await tools.execute("os_tool", {
      action: "register-device",
      device: { id: "viewer-1", name: "Phone", platform: "react-native", capabilities: ["view", "control"] },
    }, {
      actionId: "a2",
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
      requestedBy: "test",
    });

    await tools.execute("screen.share", {
      action: "start",
      hostDeviceId: "host-1",
      viewerDeviceIds: ["viewer-1"],
    }, {
      actionId: "a3",
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
      requestedBy: "test",
    });

    const state = await tools.execute("os_tool", { action: "state" }, {
      actionId: "a4",
      sessionId: "s1",
      workspaceRoot: "/workspace/Jait",
      requestedBy: "test",
    });

    expect(state.ok).toBe(true);
    const payload = state.data as {
      devices: Array<{ id: string }>;
      activeSession: {
        hostDeviceId: string;
        viewers: Array<{ deviceId: string }>;
        controllerDeviceId: string | null;
        capabilities: { remoteInput: boolean };
      } | null;
    };
    expect(payload.devices).toHaveLength(2);
    expect(payload.activeSession?.hostDeviceId).toBe("host-1");
    expect(payload.activeSession?.viewers[0]?.deviceId).toBe("viewer-1");
    expect(payload.activeSession?.controllerDeviceId).toBe("viewer-1");
    expect(payload.activeSession?.capabilities.remoteInput).toBe(true);
  });

  it("keeps P2P under 100ms and falls back to TURN when degraded", async () => {
    const screenShare = new ScreenShareService();
    screenShare.registerDevice({ id: "host", name: "Desktop", platform: "electron", authorized: true, capabilities: ["capture"] });
    screenShare.registerDevice({ id: "viewer", name: "Tablet", platform: "react-native", authorized: true, capabilities: ["view", "control"] });

    screenShare.startShare({ hostDeviceId: "host", viewerDeviceIds: ["viewer"] });
    screenShare.updateViewerTransport({ deviceId: "viewer", latencyMs: 82, preferP2P: true });

    let session = screenShare.getState().activeSession;
    expect(session?.transport.routeMode).toBe("p2p");
    expect(session?.transport.avgLatencyMs).toBeLessThan(100);

    screenShare.updateViewerTransport({ deviceId: "viewer", latencyMs: 180, preferP2P: true });
    session = screenShare.getState().activeSession;
    expect(session?.transport.routeMode).toBe("turn");
    expect(session?.transport.relayActive).toBe(true);
  });

  it("transfers control between authorized devices without restarting stream", () => {
    const screenShare = new ScreenShareService();
    screenShare.registerDevice({ id: "host", name: "Desktop", platform: "electron", authorized: true, capabilities: ["capture"] });
    screenShare.registerDevice({ id: "phone", name: "Phone", platform: "react-native", authorized: true, capabilities: ["view", "control"] });
    screenShare.registerDevice({ id: "viewer-web", name: "Browser", platform: "web", authorized: true, capabilities: ["view"] });

    const started = screenShare.startShare({ hostDeviceId: "host", viewerDeviceIds: ["phone", "viewer-web"] });
    const sessionId = started.id;

    const transferred = screenShare.transferControl("phone");
    expect(transferred.id).toBe(sessionId);
    expect(transferred.controllerDeviceId).toBe("phone");
    expect(transferred.status).toBe("sharing");
  });
});
