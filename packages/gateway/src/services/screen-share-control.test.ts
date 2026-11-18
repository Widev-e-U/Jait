import { describe, expect, it, vi } from "vitest";
import type { ScreenShareSessionState } from "@jait/shared";
import type { ScreenShareService } from "@jait/screen-share";
import type { WsControlPlane } from "../ws.js";
import { ComputerControlSessionService } from "./computer-control.js";
import { ScreenShareControlCoordinator } from "./screen-share-control.js";

function setup() {
  const share = {
    id: "share", status: "sharing", pendingApproval: false, chatId: "chat", nodeId: "node", hostDeviceId: "node",
    controlOwner: "user", capabilities: { remoteInput: true }, viewers: [{ deviceId: "viewer" }],
  } as ScreenShareSessionState;
  const shares = { getSession: (id: string) => id === share.id ? share : null,
    getSessionsForNode: (node: string) => node === share.nodeId && share.status !== "idle" ? [share] : [] } as ScreenShareService;
  const geometry = { originX: 0, originY: 0, width: 1920, height: 1080, monitorCount: 1 };
  const proxy = vi.fn(async (_node: string, tool: string, _args: Record<string, unknown>) => {
    if (tool === "computer.share.capture") return { ok: true, data: { width: 1920, height: 1080 } };
    if (tool === "computer.geometry") return { ok: true, data: geometry };
    if (tool === "computer.clipboard.read") return { ok: true, data: { text: "copied" } };
    return { ok: true, data: {} };
  });
  const sessions = new ComputerControlSessionService();
  const getNodeRegistry = () => ({ nodes: [{ id: "node", role: "desktop", lifecycle: "ready", platform: "windows", capabilities: {
    tools: ["computer.session", "computer.act", "computer.geometry", "computer.share.capture", "computer.clipboard.read", "computer.clipboard.write"],
  } }] });
  const coordinator = new ScreenShareControlCoordinator(shares, sessions, { proxyToolOp: proxy, getNodeRegistry } as unknown as WsControlPlane);
  return { coordinator, sessions, proxy, share, geometry };
}

describe("screen share control coordinator", () => {
  it("binds a viewer to approved capture and maps input within the desktop", async () => {
    const { coordinator, proxy, geometry } = setup();
    const { controlId } = await coordinator.start("share", "chat", "viewer", "request");
    await coordinator.act("share", "chat", "viewer", controlId, { action: "click", x: 1, y: 0, button: "left" });
    expect(proxy).toHaveBeenCalledWith("node", "computer.act", expect.objectContaining({
      sessionId: controlId, x: 1919, y: 0, button: "left", expectedGeometry: geometry, includeScreenshot: false,
    }), expect.objectContaining({ sessionId: "chat" }));
    expect(await coordinator.readClipboard("share", "chat", "viewer", controlId)).toBe("copied");
    await coordinator.writeClipboard("share", "chat", "viewer", controlId, "paste");
    expect(proxy).toHaveBeenCalledWith("node", "computer.clipboard.write", expect.objectContaining({ text: "paste", expectedGeometry: geometry }), expect.anything());
    await coordinator.stop("share", "chat", "viewer", controlId);
    await expect(coordinator.act("share", "chat", "viewer", controlId, { action: "move", x: 0, y: 0 })).rejects.toThrow();
  });

  it("rejects another chat, viewer, unapproved share, or agent-controlled share", async () => {
    const f = setup();
    await expect(f.coordinator.start("share", "other-chat", "viewer", "request")).rejects.toThrow();
    await expect(f.coordinator.start("share", "chat", "other-viewer", "request")).rejects.toThrow();
    f.share.pendingApproval = true;
    await expect(f.coordinator.start("share", "chat", "viewer", "request")).rejects.toThrow();
    f.share.pendingApproval = false;
    f.share.controlOwner = "agent";
    await expect(f.coordinator.start("share", "chat", "viewer", "request")).rejects.toThrow();
    expect(f.proxy).not.toHaveBeenCalled();
  });

  it("rejects multiple monitors and stops the approved host lease", async () => {
    const f = setup();
    f.geometry.monitorCount = 2;
    await expect(f.coordinator.start("share", "chat", "viewer", "request")).rejects.toThrow("single-monitor");
    expect(f.proxy).toHaveBeenCalledWith("node", "computer.session", expect.objectContaining({ action: "stop" }), expect.anything());
    expect(f.sessions.listForOwner("chat")).toHaveLength(0);
  });

  it("remembers cancellation that arrives before the start request", async () => {
    const f = setup();
    await f.coordinator.cancel("share", "chat", "viewer", "request");
    await expect(f.coordinator.start("share", "chat", "viewer", "request")).rejects.toThrow("cancelled");
    expect(f.proxy).not.toHaveBeenCalled();
  });

  it("cancels a pending approval and cannot revive it when the host replies late", async () => {
    const f = setup();
    let resolveStart!: (result: { ok: boolean; data: object }) => void;
    f.proxy.mockImplementation(async (_node, tool) => {
      if (tool === "computer.session" && f.proxy.mock.calls.at(-1)?.[2].action === "start") {
        return new Promise(resolve => { resolveStart = resolve; });
      }
      if (tool === "computer.share.capture") return { ok: true, data: { width: 1920, height: 1080 } };
      return { ok: true, data: {} };
    });
    const pending = f.coordinator.start("share", "chat", "viewer", "request");
    await vi.waitFor(() => expect(resolveStart).toBeTypeOf("function"));
    await f.coordinator.stopForShare("share");
    resolveStart({ ok: true, data: {} });
    await expect(pending).rejects.toThrow();
    expect(f.sessions.listForOwner("chat")).toHaveLength(0);
    expect(f.proxy.mock.calls.filter(([, tool, args]) => tool === "computer.session" && args.action === "stop").length).toBeGreaterThan(0);
  });

  it("revokes control when the host capture disappears", async () => {
    const f = setup();
    const { controlId } = await f.coordinator.start("share", "chat", "viewer", "request");
    f.proxy.mockImplementation(async (_node, tool) => tool === "computer.share.capture" ? { ok: false, message: "Capture stopped" } : { ok: true, data: {} });
    await expect(f.coordinator.act("share", "chat", "viewer", controlId, { action: "move", x: 0.5, y: 0.5 })).rejects.toThrow("Capture stopped");
    expect(f.proxy.mock.calls.filter(([, tool]) => tool === "computer.act")).toHaveLength(0);
    expect(f.sessions.listForOwner("chat")).toHaveLength(0);
  });
});
