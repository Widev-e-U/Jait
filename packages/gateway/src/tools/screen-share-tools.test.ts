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
describe("screen.share", () => {
  it("distinguishes the viewer from remote devices", async () => {
    const f = fixture();
    expect(await createScreenShareTool(f.screenShare, f.control).execute({ action: "list-devices" }, context)).toMatchObject({
      ok: true, data: { localDeviceId: "viewer", devices: [{ id: "viewer", isCurrent: true }, { id: "host", isCurrent: false }] },
    });
  });
  it("requests sharing from the selected host and opens the viewer", async () => {
    const f = fixture();
    expect((await createScreenShareTool(f.screenShare, f.control).execute({ action: "connect", targetDeviceId: "host" }, context)).ok).toBe(true);
    // Agent-initiated shares are owned by the requesting chat and always need
    // explicit consent from the node before capture starts.
    expect(f.service.startShare).toHaveBeenCalledWith({
      hostDeviceId: "host",
      viewerDeviceIds: ["viewer"],
      chatId: "screen-tests",
      nodeId: "host",
      initiatedBy: "agent",
      requireConsent: true,
      reason: "The agent wants to view this screen in the chat.",
    });
    expect(f.ws.sendScreenShareStartRequest).toHaveBeenCalledWith("share-1", "host", ["viewer"], {
      chatId: "screen-tests",
      nodeId: "host",
      initiatedBy: "agent",
      requireConsent: true,
      reason: "The agent wants to view this screen in the chat.",
    });
    // The panel is opened inside the owning chat, not gateway-wide.
    expect(f.ws.sendUICommand).toHaveBeenCalledWith(
      { command: "screen-share.open", data: { sessionId: "share-1", targetDeviceId: "host", chatId: "screen-tests" } },
      "screen-tests",
    );
  });
  it("stops and announces an older share before asking the host to replace it", async () => {
    const f = fixture();
    f.service.getSessionForChat.mockReturnValue({ id: "old" });
    f.service.getSession.mockReturnValue({ id: "old", status: "idle" });
    const result = await createScreenShareTool(f.screenShare, f.control).execute({ action: "connect", targetDeviceId: "host" }, context);
    expect(result.ok).toBe(true);
    expect(f.ws.broadcastScreenShareState.mock.calls[0]?.[0]).toMatchObject({ id: "old", status: "idle" });
    expect(f.ws.broadcastScreenShareState.mock.invocationCallOrder[0]).toBeLessThan(f.ws.sendScreenShareStartRequest.mock.invocationCallOrder[0]!);
  });
  it("binds capture to the selected host rather than the agent execution node", async () => {
    const f = fixture();
    await createScreenShareTool(f.screenShare, f.control).execute({ action: "connect", targetDeviceId: "host" }, { ...context, executionNodeId: "other-node" });
    expect(f.service.startShare).toHaveBeenCalledWith(expect.objectContaining({ nodeId: "host" }));
  });
  it("requires an owning chat for agent capture", async () => {
    const f = fixture();
    const result = await createScreenShareTool(f.screenShare, f.control).execute({ action: "connect", targetDeviceId: "host" }, { ...context, sessionId: "" });
    expect(result.ok).toBe(false);
    expect(f.service.startShare).not.toHaveBeenCalled();
  });
  it("requires a target before starting capture", async () => {
    const f = fixture();
    expect((await createScreenShareTool(f.screenShare).execute({ action: "connect" }, context)).ok).toBe(false);
    expect(f.service.startShare).not.toHaveBeenCalled();
  });
  it("disconnects the active share", async () => {
    const f = fixture();
    f.service.getSessionForChat.mockReturnValue({ id: "owned-share" });
    expect((await createScreenShareTool(f.screenShare, f.control).execute({ action: "disconnect" }, context)).ok).toBe(true);
    expect(f.service.stopShare).toHaveBeenCalledWith("owned-share");
    expect(f.ws.broadcastScreenShareState).toHaveBeenCalledOnce();
  });
});
describe.each([
  ["screen.capture", createScreenCaptureTool, "captureScreen"],
  ["screen.record", createScreenRecordTool, "startRecording"],
] as const)("%s", (_name, factory, method) => {
  it("returns the service capture or recording", async () => {
    const f = fixture();
    expect((await factory(f.screenShare).execute({}, context)).ok).toBe(true);
    expect(f.service[method]).toHaveBeenCalledOnce();
  });
});
describe.each(["os.tool", "os_tool"] as const)("%s", (name) => {
  it("advertises payloads required by each supported action", () => {
    const tool = createOsTool(fixture().screenShare, name);
    expect(tool.parameters.properties).toHaveProperty("device");
    expect(tool.parameters.properties).toHaveProperty("controllerDeviceId");
    expect(tool.parameters.properties).toHaveProperty("transport");
  });
  it("passes device and control changes to the service", async () => {
    const f = fixture();
    const tool = createOsTool(f.screenShare, name);
    expect((await tool.execute({ action: "register-device", device: { id: "host", name: "Owned desktop", platform: "desktop", authorized: false } }, context)).ok).toBe(true);
    expect(f.service.registerDevice).toHaveBeenCalledWith({ id: "host", name: "Owned desktop", platform: "desktop", authorized: false, capabilities: [] });
    expect((await tool.execute({ action: "transfer-control", controllerDeviceId: "viewer" }, context)).ok).toBe(true);
    expect(f.service.transferControl).toHaveBeenCalledWith("viewer");
  });
  it("rejects missing transport without changing state", async () => {
    const f = fixture();
    expect((await createOsTool(f.screenShare, name).execute({ action: "transport-update" }, context)).ok).toBe(false);
    expect(f.service.updateViewerTransport).not.toHaveBeenCalled();
  });
});
