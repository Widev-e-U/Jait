import { describe, expect, it, vi } from "vitest";
import type { ClientSurface, WsControlPlane } from "../ws.js";
import {
  AttentionService,
  attentionActionsForQuestion,
  shouldNotifyNatively,
  type AttentionCleared,
  type AttentionItem,
  type AttentionRaisedPayload,
} from "./attention.js";

/** Fake control plane backed by one connected client per listed surface. */
function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}

const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};

describe("AttentionService", () => {
  it("keys items by kind and request id so every device shares one identity", () => {
    const { ws } = makeWs();
    const service = new AttentionService(ws);
    expect(service.raise(baseItem).key).toBe("consent:req-1");
    expect(service.raise({ ...baseItem, kind: "question" }).key).toBe("question:req-1");
    expect(service.list()).toHaveLength(2);
  });

  it("replaces rather than stacks when the same request is raised twice", () => {
    const { ws } = makeWs();
    const service = new AttentionService(ws);
    service.raise(baseItem);
    service.raise({ ...baseItem, body: "updated summary" });
    expect(service.list()).toHaveLength(1);
    expect(service.get("consent:req-1")?.body).toBe("updated summary");
  });

  it("resolves the owning user from the session for push targeting", () => {
    const { ws, raised } = makeWs();
    const service = new AttentionService(ws, { resolveUserId: () => "user-a" });
    expect(service.raise(baseItem).userId).toBe("user-a");
    expect(raised.map((entry) => entry.userId)).toEqual(["user-a"]);
  });

  it("falls back to a global broadcast when the request has no owner", () => {
    const { ws, raised } = makeWs();
    new AttentionService(ws).raise(baseItem);
    expect(raised.map((entry) => entry.userId)).toEqual([null]);
  });

  it("silences the browser tab when the Electron app is also connected", () => {
    const { ws, raised } = makeWs(["desktop", "web", "mobile"]);
    new AttentionService(ws).raise(baseItem);
    expect(raised.map((entry) => entry.payload.native)).toEqual([true, false, true]);
  });

  it("lets the browser tab notify when it is the only client on the machine", () => {
    const { ws, raised } = makeWs(["web", "mobile"]);
    new AttentionService(ws).raise(baseItem);
    expect(raised.every((entry) => entry.payload.native)).toBe(true);
  });

  it("fans a clear out to sinks and drops the item", () => {
    const { ws } = makeWs();
    const service = new AttentionService(ws, { resolveUserId: () => "user-a" });
    const cleared: AttentionCleared[] = [];
    service.addSink({ raised: () => {}, cleared: (event) => { cleared.push(event); } });

    service.raise(baseItem);
    const event = service.clear("consent", "req-1", "answered", "android-primary");

    expect(event?.resolvedBy).toBe("android-primary");
    expect(service.list()).toHaveLength(0);
    expect(cleared).toEqual([expect.objectContaining({
      key: "consent:req-1", reason: "answered", userId: "user-a",
    })]);
  });

  it("stays quiet when an unknown or already-cleared item is cleared again", () => {
    const { ws } = makeWs();
    const service = new AttentionService(ws);
    const cleared = vi.fn();
    service.addSink({ raised: () => {}, cleared });

    service.raise(baseItem);
    expect(service.clear("consent", "req-1", "answered")).not.toBeNull();
    // The watch answering just as the request times out must not double-revoke.
    expect(service.clear("consent", "req-1", "timeout")).toBeNull();
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it("keeps fanning out when one sink throws", () => {
    const { ws } = makeWs();
    const service = new AttentionService(ws);
    const raised: AttentionItem[] = [];
    service.addSink({ raised: () => { throw new Error("dead transport"); }, cleared: () => {} });
    service.addSink({ raised: (item) => { raised.push(item); }, cleared: () => {} });

    expect(() => service.raise(baseItem)).not.toThrow();
    expect(raised).toHaveLength(1);
  });

  it("narrows the open list to one user", () => {
    const { ws } = makeWs();
    const service = new AttentionService(ws);
    service.raise({ ...baseItem, userId: "user-a" });
    service.raise({ ...baseItem, requestId: "req-2", userId: "user-b" });
    expect(service.list("user-a").map((item) => item.key)).toEqual(["consent:req-1"]);
  });
});

describe("shouldNotifyNatively", () => {
  it("only ever suppresses the web surface", () => {
    const withDesktop = new Set<ClientSurface>(["desktop", "web", "mobile", "unknown"]);
    expect(shouldNotifyNatively("web", withDesktop)).toBe(false);
    expect(shouldNotifyNatively("desktop", withDesktop)).toBe(true);
    // The phone and watch are separate devices — the PC being awake says
    // nothing about whether the user is looking at it.
    expect(shouldNotifyNatively("mobile", withDesktop)).toBe(true);
    expect(shouldNotifyNatively("unknown", withDesktop)).toBe(true);
  });
});

describe("attentionActionsForQuestion", () => {
  it("turns single-select options into notification buttons, capped at three", () => {
    expect(attentionActionsForQuestion({
      questions: [{
        id: "q1",
        options: [{ label: "Yes" }, { label: "No" }, { label: "Later" }, { label: "Never" }],
      }],
    })).toEqual([
      { id: "q1:Yes", label: "Yes", kind: "select" },
      { id: "q1:No", label: "No", kind: "select" },
      { id: "q1:Later", label: "Later", kind: "select" },
    ]);
  });

  it("offers an inline reply for freeform questions", () => {
    expect(attentionActionsForQuestion({
      questions: [{ id: "q1", allowFreeformInput: true }],
    })).toEqual([{ id: "q1", label: "Reply", kind: "reply" }]);
  });

  it("falls back to opening the app for multi-select and multi-question prompts", () => {
    expect(attentionActionsForQuestion({
      questions: [{ id: "q1", multiSelect: true, options: [{ label: "a" }] }],
    })).toEqual([]);
    expect(attentionActionsForQuestion({
      questions: [{ id: "q1", options: [{ label: "a" }] }, { id: "q2" }],
    })).toEqual([]);
  });
});
