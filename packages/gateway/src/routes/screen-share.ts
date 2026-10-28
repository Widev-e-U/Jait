/**
 * Screen-share REST routes
 *
 * Provides HTTP endpoints for screen-share session management.
 * WebRTC signaling happens over WebSocket (see ws.ts); these routes
 * are for session lifecycle, device registration, and state queries.
 */

import type { FastifyInstance } from "fastify";
import type { ScreenShareService } from "@jait/screen-share";
import type { WsControlPlane } from "../ws.js";
import type { AppConfig } from "../config.js";
import type { ControlAccess } from "../security/control-access.js";
import { requireAuth } from "../security/http-auth.js";
import type { ScreenShareControlCoordinator } from "../services/screen-share-control.js";

interface ScreenShareRouteDeps {
  screenShare: ScreenShareService;
  ws: WsControlPlane;
  control?: ScreenShareControlCoordinator;
  config?: AppConfig;
  access?: ControlAccess;
}

export function registerScreenShareRoutes(app: FastifyInstance, deps: ScreenShareRouteDeps) {
  const { screenShare, ws } = deps;

  // ── State ───────────────────────────────────────────────────────────
  app.get("/api/screen-share/state", async () => {
    return screenShare.getState();
  });

  // ── Devices ─────────────────────────────────────────────────────────
  app.get("/api/screen-share/devices", async () => {
    return { devices: screenShare.getState().devices };
  });

  app.post("/api/screen-share/devices/register", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const id = String(body["id"] ?? "").trim();
    const name = String(body["name"] ?? "").trim();
    const platform = body["platform"] as string;
    const capabilities = Array.isArray(body["capabilities"])
      ? body["capabilities"].map(String)
      : [];

    if (!id || !name || !["desktop", "react-native", "web"].includes(platform)) {
      return reply.code(400).send({ error: "Invalid device: id, name, and platform (desktop|react-native|web) required." });
    }

    const device = screenShare.registerDevice({
      id,
      name,
      platform: platform as "desktop" | "react-native" | "web",
      authorized: true,
      capabilities,
    });

    return { ok: true, device };
  });

  // ── Session lifecycle ───────────────────────────────────────────────
  app.post("/api/screen-share/start", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const hostDeviceId = String(body["hostDeviceId"] ?? "").trim();
    const viewerDeviceIds = Array.isArray(body["viewerDeviceIds"])
      ? body["viewerDeviceIds"].map(String)
      : undefined;
    const chatId = body["chatId"] ? String(body["chatId"]).trim() : null;
    const nodeId = body["nodeId"] ? String(body["nodeId"]).trim() : null;
    const initiatedBy = body["initiatedBy"] === "agent" ? "agent" : "user";
    // A conversation may only ever *ask* the machine's user for a capture.
    const requireConsent = initiatedBy === "agent" || body["requireConsent"] === true;
    const reason = body["reason"] ? String(body["reason"]) : null;

    if (!hostDeviceId) {
      return reply.code(400).send({ error: "hostDeviceId is required." });
    }

    try {
      if (chatId && deps.control && deps.config && deps.access) {
        const user = await requireAuth(request, reply, deps.config.jwtSecret);
        if (!user) return;
        if (!deps.access.session(chatId, user.id)) return reply.code(404).send({ error: "Chat not found." });
      }
      const previous = chatId ? screenShare.getSessionForChat(chatId) : null;
      if (previous && deps.control && chatId) {
        await deps.control.stopForShare(previous.id);
        if (previous.nodeId) await deps.control.stopForNode(previous.nodeId, chatId, false);
      }
      const session = screenShare.startShare({
        hostDeviceId,
        viewerDeviceIds,
        chatId,
        nodeId,
        initiatedBy,
        requireConsent,
      });
      const stopped = previous ? screenShare.getSession(previous.id) : null;
      if (stopped?.status === "idle") ws.broadcastScreenShareState(stopped);
      ws.broadcastScreenShareState(session);
      // Tell the host device to begin screen capture. Agent-initiated requests
      // carry requireConsent so the host UI must wait for a human approval.
      ws.sendScreenShareStartRequest(session.id, hostDeviceId, viewerDeviceIds, {
        chatId,
        nodeId,
        initiatedBy,
        requireConsent,
        reason,
      });
      return { ok: true, session };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Failed to start screen share.",
      });
    }
  });

  /** The live share owned by a chat, so the chat panel can attach to it. */
  app.get("/api/screen-share/chat/:chatId", async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    const session = screenShare.getSessionForChat(chatId);
    if (!session) return reply.code(404).send({ error: "No active share for this chat." });
    return { session };
  });

  /** Host user approves or rejects a pending agent capture request. */
  app.post("/api/screen-share/approve", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const sessionId = String(body["sessionId"] ?? "").trim();
    const approved = body["approved"] === true;
    if (!sessionId) return reply.code(400).send({ error: "sessionId is required." });

    try {
      const existing = screenShare.getSession(sessionId);
      if (!existing) return reply.code(404).send({ error: "Unknown share session." });
      if (existing.status !== "sharing" || (!approved && !existing.pendingApproval)) {
        return reply.code(409).send({ error: "Screen share approval is no longer pending." });
      }
      const session = screenShare.resolveApproval(sessionId, approved);
      ws.broadcastScreenShareState(session);
      return { ok: true, session };
    } catch (err) {
      return reply.code(404).send({
        error: err instanceof Error ? err.message : "Unknown share session.",
      });
    }
  });

  /**
   * Handoff: the person at the shared machine takes input back, or hands the
   * session to the agent again. Chat-owned shares keep requiring consent.
   */
  app.post("/api/screen-share/handoff", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const sessionId = String(body["sessionId"] ?? "").trim();
    const controlOwner = body["controlOwner"];
    const chatId = String(body["chatId"] ?? "").trim();
    if (!sessionId) return reply.code(400).send({ error: "sessionId is required." });
    if (controlOwner !== "agent" && controlOwner !== "user") {
      return reply.code(400).send({ error: "controlOwner must be user or agent." });
    }

    try {
      const existing = screenShare.getSession(sessionId);
      if (!existing) {
        return reply.code(404).send({ error: "Unknown share session." });
      }
      // A share owned by a chat may only be driven by that chat. Without this
      // check any chat panel (or the floating viewer) could reassign control of
      // another conversation's screen.
      if (existing.chatId && existing.chatId !== chatId) {
        return reply.code(403).send({ error: "This screen share belongs to another chat." });
      }
      if (existing.status !== "sharing" || existing.pendingApproval) {
        return reply.code(409).send({ error: "Screen share is not active and approved." });
      }
      if (deps.control && existing.controlOwner !== controlOwner && existing.chatId) {
        if (deps.config && deps.access) {
          const user = await requireAuth(request, reply, deps.config.jwtSecret);
          if (!user) return;
          if (!deps.access.session(existing.chatId, user.id)) return reply.code(404).send({ error: "Chat not found." });
        }
        await deps.control.stopForShare(sessionId);
        if (existing.nodeId) await deps.control.stopForNode(existing.nodeId, existing.chatId);
      }
      const session = screenShare.setControlOwner(sessionId, controlOwner);
      ws.broadcastScreenShareState(session);
      ws.broadcastScreenShareControlHandoff(session.id, controlOwner);
      return { ok: true, session };
    } catch (err) {
      return reply.code(404).send({
        error: err instanceof Error ? err.message : "Unknown share session.",
      });
    }
  });

  // Attach to a share that already exists. A chat panel opening against a live
  // node share joins it instead of starting a second capture, so the node is
  // never asked to share twice and the share keeps its owning chat.
  app.post("/api/screen-share/join", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const sessionId = String(body["sessionId"] ?? "").trim();
    const viewerDeviceId = String(body["viewerDeviceId"] ?? "").trim();
    if (!sessionId) return reply.code(400).send({ error: "sessionId is required." });
    if (!viewerDeviceId) return reply.code(400).send({ error: "viewerDeviceId is required." });
    const existing = screenShare.getSession(sessionId);
    if (!existing) {
      return reply.code(404).send({ error: "Unknown share session." });
    }
    if (existing.chatId && deps.control && deps.config && deps.access) {
      const user = await requireAuth(request, reply, deps.config.jwtSecret);
      if (!user) return;
      if (!deps.access.session(existing.chatId, user.id)) return reply.code(404).send({ error: "Chat not found." });
    }

    try {
      const session = screenShare.addViewer(sessionId, viewerDeviceId);
      ws.broadcastScreenShareState(session);

      // Ask the node to renegotiate toward the new viewer. The host reuses its
      // existing capture, so joining never re-prompts for permission; an
      // unapproved share stays silent until its host approves.
      if (!session.pendingApproval && session.status === "sharing") {
        ws.sendScreenShareStartRequest(
          session.id,
          session.hostDeviceId,
          session.viewers.map((viewer) => viewer.deviceId),
          {
            chatId: session.chatId,
            nodeId: session.nodeId,
            initiatedBy: session.initiatedBy,
            requireConsent: false,
            reason: session.reason,
          },
        );
      }

      return { ok: true, session };
    } catch (err) {
      // The session exists (checked above), so this is a rejected viewer:
      // host-as-viewer, unregistered device, or a share that already stopped.
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Cannot join this screen share.",
      });
    }
  });

  app.post("/api/screen-share/stop", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const sessionId = body["sessionId"] ? String(body["sessionId"]).trim() : undefined;
    const existing = sessionId ? screenShare.getSession(sessionId) : screenShare.getState().activeSession;
    if (existing && deps.control && existing.chatId) {
      if (deps.config && deps.access) {
        const user = await requireAuth(request, reply, deps.config.jwtSecret);
        if (!user) return;
        if (!deps.access.session(existing.chatId, user.id)) return reply.code(404).send({ error: "Chat not found." });
      }
      await deps.control.stopForShare(existing.id);
      if (existing.nodeId) await deps.control.stopForNode(existing.nodeId, existing.chatId, false);
    }
    const session = screenShare.stopShare(sessionId);
    if (session) ws.broadcastScreenShareState(session);
    return { ok: true, session };
  });

  app.post("/api/screen-share/transfer-control", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const controllerDeviceId = String(body["controllerDeviceId"] ?? "").trim();
    const sessionId = body["sessionId"] ? String(body["sessionId"]).trim() : undefined;

    if (!controllerDeviceId) {
      return reply.code(400).send({ error: "controllerDeviceId is required." });
    }

    try {
      const session = screenShare.transferControl(controllerDeviceId, sessionId);
      ws.broadcastScreenShareState(session);
      return { ok: true, session };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Failed to transfer control.",
      });
    }
  });

  // Viewer input is available only through a separately approved, chat-owned
  // control lease. The remote node rechecks its input grant for every effect.
  if (deps.control && deps.config && deps.access) {
    const control = deps.control;
    const config = deps.config;
    const access = deps.access;
    app.post("/api/screen-share/control/:operation", async (request, reply) => {
      const user = await requireAuth(request, reply, config.jwtSecret);
      if (!user) return;
      const body = (request.body ?? {}) as Record<string, unknown>;
      const read = (name: string) => typeof body[name] === "string" && body[name].length <= 256 ? body[name] as string : "";
      const shareId = read("sessionId");
      const chatId = read("chatId");
      const viewerId = read("viewerDeviceId");
      const controlId = read("controlId");
      const requestId = read("requestId");
      const operation = (request.params as { operation: string }).operation;
      if (!shareId || !chatId || !viewerId || (["start", "cancel"].includes(operation) && !requestId)
        || (!["start", "cancel"].includes(operation) && !controlId)) {
        return reply.code(400).send({ error: "Share, chat, viewer and control identifiers are required." });
      }
      if (!access.session(chatId, user.id)) return reply.code(404).send({ error: "Chat not found." });
      const share = screenShare.getSession(shareId);
      if (!share || share.chatId !== chatId) return reply.code(404).send({ error: "Share not found." });
      if (operation !== "stop" && operation !== "cancel" && share.nodeId && ws.canAccessNode?.(share.nodeId, user.id) !== true) {
        return reply.code(404).send({ error: "Node not found." });
      }
      try {
        if (operation === "start") return { ok: true, ...(await control.start(shareId, chatId, viewerId, requestId)) };
        if (operation === "cancel") { await control.cancel(shareId, chatId, viewerId, requestId); return { ok: true }; }
        if (operation === "stop") { await control.stop(shareId, chatId, viewerId, controlId); return { ok: true }; }
        if (operation === "act") {
          const input = body["input"];
          if (!input || typeof input !== "object" || Array.isArray(input)) return reply.code(400).send({ error: "Input is required." });
          await control.act(shareId, chatId, viewerId, controlId, input as Record<string, unknown>);
          return { ok: true };
        }
        if (operation === "clipboard-read") return { ok: true, text: await control.readClipboard(shareId, chatId, viewerId, controlId) };
        if (operation === "clipboard-write") {
          if (typeof body["text"] !== "string") return reply.code(400).send({ error: "Clipboard text is required." });
          await control.writeClipboard(shareId, chatId, viewerId, controlId, body["text"]);
          return { ok: true };
        }
        return reply.code(404).send({ error: "Unknown control operation." });
      } catch (error) {
        return reply.code(409).send({ error: error instanceof Error ? error.message : "Screen control failed." });
      }
    });
  }

  // ── Capture / Record ────────────────────────────────────────────────
  app.post("/api/screen-share/capture", async () => {
    return { ok: true, capture: screenShare.captureScreen() };
  });

  app.post("/api/screen-share/record", async () => {
    return { ok: true, recording: screenShare.startRecording() };
  });
}
