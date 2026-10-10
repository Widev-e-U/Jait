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
    getState: vi.fn().mockReturnValue(state), startShare: vi.fn().mockReturnValue({ id: "share-1" }),
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
    expect(f.service.startShare).toHaveBeenCalledWith({ hostDeviceId: "host", viewerDeviceIds: ["viewer"] });
    expect(f.ws.sendScreenShareStartRequest).toHaveBeenCalledWith("share-1", "host", ["viewer"]);
    expect(f.ws.sendUICommand).toHaveBeenCalledWith({ command: "screen-share.open", data: { sessionId: "share-1", targetDeviceId: "host" } });
  });
  it("requires a target before starting capture", async () => {
    const f = fixture();
    expect((await createScreenShareTool(f.screenShare).execute({ action: "connect" }, context)).ok).toBe(false);
    expect(f.service.startShare).not.toHaveBeenCalled();
  });
  it("disconnects the active share", async () => {
    const f = fixture();
    expect((await createScreenShareTool(f.screenShare).execute({ action: "disconnect" }, context)).ok).toBe(true);
    expect(f.service.stopShare).toHaveBeenCalledOnce();
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
