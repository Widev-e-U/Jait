import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { ScreenShareService } from "@jait/screen-share";
import { registerScreenShareRoutes } from "./screen-share.js";
import type { WsControlPlane } from "../ws.js";
import type { AppConfig } from "../config.js";
import type { ControlAccess } from "../security/control-access.js";
import { signAuthToken } from "../security/http-auth.js";

function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}

async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}

describe("chat-owned share access", () => {
  it("requires host consent even when a chat caller claims to be the user", async () => {
    const { app, screenShare } = await setup();
    const response = await app.inject({ method: "POST", url: "/api/screen-share/start", payload: {
      hostDeviceId: "node-1", viewerDeviceIds: ["web-1"], chatId: "chat-1",
      initiatedBy: "user", requireConsent: false,
    } });
    expect(response.statusCode).toBe(200);
    expect(response.json().session.pendingApproval).toBe(true);
    expect(screenShare.getSessionForChat("chat-1")?.pendingApproval).toBe(true);
    await app.close();
  });
  it("rejects a different user before returning or mutating the share", async () => {
    const screenShare = new ScreenShareService();
    for (const id of ["host", "viewer"]) {
      screenShare.registerDevice({ id, name: id, platform: "web", authorized: true, capabilities: [] });
    }
    const share = screenShare.startShare({ hostDeviceId: "host", viewerDeviceIds: ["viewer"],
      chatId: "private", initiatedBy: "agent", requireConsent: true });
    const { ws, calls } = stubWs();
    const config = { jwtSecret: "screen-share-test-secret" } as AppConfig;
    const access = { session: (id: string, user: string) => id === "private" && user === "alice" } as ControlAccess;
    const app = Fastify();
    registerScreenShareRoutes(app, { screenShare, ws, config, access });
    await app.ready();
    const headers = { authorization: `Bearer ${await signAuthToken({ id: "bob", username: "bob" }, config.jwtSecret)}` };
    const attempts = [
      { method: "GET" as const, url: "/api/screen-share/chat/private" },
      { method: "POST" as const, url: "/api/screen-share/join", payload: { sessionId: share.id, viewerDeviceId: "viewer" } },
      { method: "POST" as const, url: "/api/screen-share/leave", payload: { sessionId: share.id, viewerDeviceId: "viewer" } },
      { method: "POST" as const, url: "/api/screen-share/approve", payload: { sessionId: share.id, approved: true } },
      { method: "POST" as const, url: "/api/screen-share/handoff", payload: { sessionId: share.id, chatId: "private", controlOwner: "user" } },
      { method: "POST" as const, url: "/api/screen-share/transfer-control", payload: { sessionId: share.id, controllerDeviceId: "viewer" } },
      { method: "POST" as const, url: "/api/screen-share/stop", payload: { sessionId: share.id } },
    ];
    for (const attempt of attempts) expect((await app.inject({ ...attempt, headers })).statusCode).toBe(404);
    expect(screenShare.getSession(share.id)).toMatchObject({ status: "sharing", pendingApproval: true, viewers: [{ deviceId: "viewer" }] });
    expect(calls.state).toBe(0);
    const alice = { authorization: `Bearer ${await signAuthToken({ id: "alice", username: "alice" }, config.jwtSecret)}` };
    expect((await app.inject({ method: "GET", url: "/api/screen-share/chat/private", headers: alice })).statusCode).toBe(200);
    await app.close();
  });
});

describe("POST /api/screen-share/join", () => {
  it("attaches a chat panel to the live share instead of starting a new one", async () => {
    const { app, calls, sessionId } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/join",
      payload: { sessionId, viewerDeviceId: "web-2" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      session: { id: string; chatId?: string | null; viewers: { deviceId: string }[] };
    };
    expect(body.ok).toBe(true);
    // Same session, same owning chat: joining never forks a second capture.
    expect(body.session.id).toBe(sessionId);
    expect(body.session.chatId).toBe("chat-1");
    expect(body.session.viewers.map((v) => v.deviceId).sort()).toEqual(["web-1", "web-2"]);
    // The node is asked to renegotiate toward the new viewer with its existing capture.
    expect(calls.startRequest).toBeGreaterThan(0);

    await app.close();
  });

  it("rejects an unknown session", async () => {
    const { app } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/join",
      payload: { sessionId: "does-not-exist", viewerDeviceId: "web-2" },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("refuses to add the host device as its own viewer", async () => {
    const { app, sessionId } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/join",
      payload: { sessionId, viewerDeviceId: "node-1" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /api/screen-share/leave", () => {
  it("detaches one viewer while keeping the other viewer and capture active", async () => {
    const { app, screenShare, sessionId } = await setup();
    try {
      screenShare.addViewer(sessionId, "web-2");
      const response = await app.inject({ method: "POST", url: "/api/screen-share/leave", payload: { sessionId, viewerDeviceId: "web-1" } });
      expect(response.statusCode).toBe(200);
      expect(response.json().session.status).toBe("sharing");
      expect(response.json().session.viewers.map((viewer: { deviceId: string }) => viewer.deviceId)).toEqual(["web-2"]);
      expect(screenShare.getSessionForChat("chat-1")?.id).toBe(sessionId);
      expect((await app.inject({ method: "POST", url: "/api/screen-share/leave", payload: { sessionId, viewerDeviceId: "node-1" } })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
});

describe("chat-owned screen share lifecycle", () => {
  it("validates chat-owned route inputs and rejects unknown sessions", async () => {
    const { app, calls } = await setup();
    try {
      for (const [url, payload, status] of [
        ["/api/screen-share/join", {}, 400],
        ["/api/screen-share/join", { sessionId: "missing", viewerDeviceId: "web-1" }, 404],
        ["/api/screen-share/approve", {}, 400],
        ["/api/screen-share/approve", { sessionId: "missing", approved: true }, 404],
        ["/api/screen-share/handoff", {}, 400],
        ["/api/screen-share/handoff", { sessionId: "missing", chatId: "chat-1", controlOwner: "agent" }, 404],
      ] as const) {
        const response = await app.inject({ method: "POST", url, payload });
        expect(response.statusCode).toBe(status);
      }
      expect((await app.inject({ method: "GET", url: "/api/screen-share/chat/missing-chat" })).statusCode).toBe(404);
      expect(calls).toEqual({ state: 0, startRequest: 0, handoff: 0, relay: 0 });
    } finally {
      await app.close();
    }
  });

  it("returns the owning chat's share and removes it from lookup after stopping", async () => {
    const { app, sessionId } = await setup();
    try {
      const found = await app.inject({ method: "GET", url: "/api/screen-share/chat/chat-1" });
      expect(found.statusCode).toBe(200);
      expect(found.json().session.id).toBe(sessionId);
      const other = await app.inject({ method: "GET", url: "/api/screen-share/chat/chat-2" });
      expect(other.statusCode).toBe(404);

      const stopped = await app.inject({ method: "POST", url: "/api/screen-share/stop", payload: { sessionId } });
      expect(stopped.json().session.status).toBe("idle");
      const afterStop = await app.inject({ method: "GET", url: "/api/screen-share/chat/chat-1" });
      expect(afterStop.statusCode).toBe(404);
      const join = await app.inject({ method: "POST", url: "/api/screen-share/join", payload: { sessionId, viewerDeviceId: "web-2" } });
      expect(join.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("broadcasts the old session as stopped before replacing a chat share", async () => {
    const { app, states, sessionId } = await setup();
    try {
      const response = await app.inject({ method: "POST", url: "/api/screen-share/start", payload: { hostDeviceId: "node-1", chatId: "chat-1" } });
      expect(response.statusCode).toBe(200);
      expect(states.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: sessionId, status: "idle" },
        { id: response.json().session.id, status: "sharing" },
      ]);
    } finally {
      await app.close();
    }
  });

  it("cannot revive a stopped share with a late approval", async () => {
    const { app, screenShare, calls } = await setup();
    try {
      const pending = screenShare.startShare({ hostDeviceId: "node-1", chatId: "pending-chat", initiatedBy: "agent", requireConsent: true });
      screenShare.stopShare(pending.id);
      const response = await app.inject({ method: "POST", url: "/api/screen-share/approve", payload: { sessionId: pending.id, approved: true } });
      expect(response.statusCode).toBe(409);
      expect(screenShare.getSession(pending.id)?.status).toBe("idle");
      expect(screenShare.getSessionForChat("pending-chat")).toBeNull();
      expect(calls.state).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("does not request capture when a viewer joins an unapproved share", async () => {
    const { app, screenShare, calls } = await setup();
    try {
      const pending = screenShare.startShare({
        hostDeviceId: "node-1", viewerDeviceIds: ["web-1"], chatId: "pending-chat",
        initiatedBy: "agent", requireConsent: true,
      });
      expect(pending.pendingApproval).toBe(true);
      const res = await app.inject({
        method: "POST", url: "/api/screen-share/join",
        payload: { sessionId: pending.id, viewerDeviceId: "web-2" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().session.pendingApproval).toBe(true);
      expect(calls.startRequest).toBe(0);
    } finally {
      await app.close();
    }
  });
});

describe("POST /api/screen-share/handoff", () => {
  it("lets the owning chat move control and broadcasts the change", async () => {
    const { app, screenShare, calls, sessionId } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/handoff",
      payload: { sessionId, controlOwner: "agent", chatId: "chat-1" },
    });

    expect(res.statusCode).toBe(200);
    expect(screenShare.getSession(sessionId)?.controlOwner).toBe("agent");
    expect(calls.handoff).toBe(1);

    await app.close();
  });

  it("refuses a different chat's attempt to take control", async () => {
    const { app, screenShare, calls, sessionId } = await setup();
    const before = screenShare.getSession(sessionId)?.controlOwner;

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/handoff",
      payload: { sessionId, controlOwner: "agent", chatId: "chat-2" },
    });

    expect(res.statusCode).toBe(403);
    expect(screenShare.getSession(sessionId)?.controlOwner).toBe(before);
    expect(calls.handoff).toBe(0);

    await app.close();
  });

  it("rejects handoff until approval and after stop, without broadcasting it", async () => {
    const { app, screenShare, calls, sessionId } = await setup();
    try {
      const pending = screenShare.startShare({
        hostDeviceId: "node-1", chatId: "pending-chat", initiatedBy: "agent", requireConsent: true,
      });
      const handoff = (id: string, chatId: string, controlOwner: unknown) => app.inject({
        method: "POST", url: "/api/screen-share/handoff", payload: { sessionId: id, chatId, controlOwner },
      });
      expect((await handoff(pending.id, "pending-chat", "user")).statusCode).toBe(409);
      expect((await handoff(sessionId, "chat-1", "invalid")).statusCode).toBe(400);
      screenShare.stopShare(sessionId);
      expect((await handoff(sessionId, "chat-1", "agent")).statusCode).toBe(409);
      expect(calls.handoff).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("requires a session id", async () => {
    const { app } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/handoff",
      payload: { controlOwner: "agent", chatId: "chat-1" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
