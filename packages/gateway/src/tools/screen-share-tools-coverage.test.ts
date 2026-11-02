import { describe, expect, it, vi } from "vitest";
import type { ScreenShareService } from "@jait/screen-share";
import type { WsControlPlane } from "../ws.js";
import {
  createScreenShareTool, createScreenCaptureTool, createScreenRecordTool, createOsTool,
} from "./screen-share-tools.js";
const context = { sessionId: "screen-tests", actionId: "screen-action", projectRoot: "/project", requestedBy: "test" };
function fixture() {
  const state = { devices: [{ id: "viewer", name: "Web viewer", platform: "web", capabilities: [] }, { id: "host", name: "Owned desktop", platform: "desktop", capabilities: [] }], activeSession: null };
  const service = {
    getState: vi.fn().mockReturnValue(state), getSessionForChat: vi.fn().mockReturnValue(null), getSession: vi.fn().mockReturnValue(null),
    startShare: vi.fn().mockReturnValue({
      id: "share-1",
      nodeId: "host",
      reason: "The agent wants to view this screen in the chat.",
    }),
    stopShare: vi.fn().mockReturnValue(state), captureScreen: vi.fn().mockReturnValue({ id: "capture-1" }),
    startRecording: vi.fn().mockReturnValue({ id: "recording-1" }), registerDevice: vi.fn().mockReturnValue({ id: "host" }),
    transferControl: vi.fn().mockReturnValue(state), updateViewerTransport: vi.fn().mockReturnValue(state),
  };
  const ws = {
    getConnectedDeviceIds: () => ["host", "viewer"], sendScreenShareStartRequest: vi.fn(),
    broadcastScreenShareState: vi.fn(), sendUICommand: vi.fn(),
  };
  return { state, service, ws, screenShare: service as unknown as ScreenShareService, control: ws as unknown as WsControlPlane };
}
describe("screen tool edge cases", () => {
  it("reports when no devices are registered and requires a chat to disconnect", async () => {
    const f = fixture();
    f.state.devices = [];
    const tool = createScreenShareTool(f.screenShare);
    expect((await tool.execute({ action: "list-devices" }, context)).message).toContain("No devices registered");
    expect((await tool.execute({ action: "connect" }, context)).message).toContain("No devices registered");
    expect((await tool.execute({ action: "disconnect" }, { ...context, sessionId: "" })).ok).toBe(false);
  });

  it("honors explicit viewers and reports a pending approval", async () => {
    const f = fixture();
    f.service.startShare.mockReturnValue({ id: "share-1", nodeId: "host", pendingApproval: true } as never);
    const result = await createScreenShareTool(f.screenShare, f.control).execute({ action: "start", hostDeviceId: "host", viewerDeviceIds: ["viewer"] }, context);
    expect(result.message).toContain("Waiting for the device to approve");
    expect(f.service.startShare).toHaveBeenCalledWith(expect.objectContaining({ viewerDeviceIds: ["viewer"], requireConsent: true }));
  });

  it("validates OS action inputs and handles service errors", async () => {
    const f = fixture();
    const tool = createOsTool(f.screenShare, "os.tool");
    expect((await tool.execute({ action: "state" }, context)).data).toEqual(f.state);
    expect((await tool.execute({ action: "register-device" }, context)).ok).toBe(false);
    expect((await tool.execute({ action: "transfer-control" }, context)).ok).toBe(false);
    expect((await tool.execute({ action: "transport-update", transport: { deviceId: "viewer", latencyMs: 10 } }, context)).ok).toBe(true);
    expect(f.service.updateViewerTransport).toHaveBeenCalledWith({ deviceId: "viewer", latencyMs: 10, preferP2P: true });
    f.service.transferControl.mockImplementation(() => { throw new Error("denied"); });
    expect(await tool.execute({ action: "transfer-control", controllerDeviceId: "viewer" }, context)).toMatchObject({ ok: false, message: "denied" });
  });
});
