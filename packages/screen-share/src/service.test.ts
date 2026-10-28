import { describe, expect, it } from "vitest";
import { ScreenShareService } from "./service";

function serviceWithDevices() {
  const service = new ScreenShareService();
  service.registerDevice({
    id: "node-1",
    name: "Node 1",
    platform: "windows",
    authorized: true,
    capabilities: ["screen-capture"],
  });
  service.registerDevice({
    id: "web-1",
    name: "Web 1",
    platform: "web",
    authorized: true,
    capabilities: [],
  });
  service.registerDevice({
    id: "web-2",
    name: "Web 2",
    platform: "web",
    authorized: true,
    capabilities: [],
  });
  return service;
}

describe("ScreenShareService.addViewer", () => {
  it("attaches a viewer to the existing session instead of forking a new one", () => {
    const service = serviceWithDevices();
    const started = service.startShare({
      hostDeviceId: "node-1",
      viewerDeviceIds: ["web-1"],
      chatId: "chat-1",
      nodeId: "node-1",
      initiatedBy: "user",
    });

    const joined = service.addViewer(started.id, "web-2");

    expect(joined.id).toBe(started.id);
    expect(joined.chatId).toBe("chat-1");
    expect(joined.viewers.map((viewer) => viewer.deviceId).sort()).toEqual(["web-1", "web-2"]);
    expect(service.getSessionForChat("chat-1")?.id).toBe(started.id);
  });

  it("is idempotent so a re-opening chat panel does not duplicate the viewer", () => {
    const service = serviceWithDevices();
    const started = service.startShare({
      hostDeviceId: "node-1",
      viewerDeviceIds: ["web-1"],
      chatId: "chat-1",
      nodeId: "node-1",
      initiatedBy: "agent",
    });

    service.addViewer(started.id, "web-1");
    const joined = service.addViewer(started.id, "web-1");

    expect(joined.viewers).toHaveLength(1);
    expect(joined.id).toBe(started.id);
  });

  it("refuses the host as a viewer, unregistered devices, and unknown sessions", () => {
    const service = serviceWithDevices();
    const started = service.startShare({
      hostDeviceId: "node-1",
      viewerDeviceIds: ["web-1"],
      chatId: "chat-1",
      nodeId: "node-1",
      initiatedBy: "user",
    });

    expect(() => service.addViewer(started.id, "node-1")).toThrow();
    expect(() => service.addViewer(started.id, "unknown-device")).toThrow();
    expect(() => service.addViewer("missing-session", "web-2")).toThrow();
  });

  it("refuses to join a share that has already stopped", () => {
    const service = serviceWithDevices();
    const started = service.startShare({
      hostDeviceId: "node-1",
      viewerDeviceIds: ["web-1"],
      chatId: "chat-1",
      nodeId: "node-1",
      initiatedBy: "user",
    });
    service.stopShare(started.id);

    expect(() => service.addViewer(started.id, "web-2")).toThrow();
  });
});


describe("screen-share host capabilities", () => {
  it("reports remote input only when the host advertises it", () => {
    const service = serviceWithDevices();
    expect(service.startShare({ hostDeviceId: "node-1" }).capabilities.remoteInput).toBe(false);
    service.registerDevice({ id: "node-1", name: "Node 1", platform: "desktop", authorized: true, capabilities: ["screen-share", "remote-input"] });
    expect(service.startShare({ hostDeviceId: "node-1" }).capabilities.remoteInput).toBe(true);
  });
});
