/**
 * Screen-share REST routes
 *
 * Provides HTTP endpoints for screen-share session management.
 * WebRTC signaling happens over WebSocket (see ws.ts); these routes
 * are for session lifecycle, device registration, and state queries.
 */
export function registerScreenShareRoutes(app, deps) {
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
        const body = (request.body ?? {});
        const id = String(body["id"] ?? "").trim();
        const name = String(body["name"] ?? "").trim();
        const platform = body["platform"];
        const capabilities = Array.isArray(body["capabilities"])
            ? body["capabilities"].map(String)
            : [];
        if (!id || !name || !["electron", "react-native", "web"].includes(platform)) {
            return reply.code(400).send({ error: "Invalid device: id, name, and platform (electron|react-native|web) required." });
        }
        const device = screenShare.registerDevice({
            id,
            name,
            platform: platform,
            authorized: true,
            capabilities,
        });
        return { ok: true, device };
    });
    // ── Session lifecycle ───────────────────────────────────────────────
    app.post("/api/screen-share/start", async (request, reply) => {
        const body = (request.body ?? {});
        const hostDeviceId = String(body["hostDeviceId"] ?? "").trim();
        const viewerDeviceIds = Array.isArray(body["viewerDeviceIds"])
            ? body["viewerDeviceIds"].map(String)
            : undefined;
        if (!hostDeviceId) {
            return reply.code(400).send({ error: "hostDeviceId is required." });
        }
        try {
            const session = screenShare.startShare({ hostDeviceId, viewerDeviceIds });
            ws.broadcastScreenShareState(session);
            // Tell the host device to begin screen capture
            ws.sendScreenShareStartRequest(session.id, hostDeviceId, viewerDeviceIds);
            return { ok: true, session };
        }
        catch (err) {
            return reply.code(400).send({
                error: err instanceof Error ? err.message : "Failed to start screen share.",
            });
        }
    });
    app.post("/api/screen-share/stop", async () => {
        const session = screenShare.stopShare();
        if (session)
            ws.broadcastScreenShareState(session);
        return { ok: true, session };
    });
    app.post("/api/screen-share/transfer-control", async (request, reply) => {
        const body = (request.body ?? {});
        const controllerDeviceId = String(body["controllerDeviceId"] ?? "").trim();
        if (!controllerDeviceId) {
            return reply.code(400).send({ error: "controllerDeviceId is required." });
        }
        try {
            const session = screenShare.transferControl(controllerDeviceId);
            ws.broadcastScreenShareState(session);
            return { ok: true, session };
        }
        catch (err) {
            return reply.code(400).send({
                error: err instanceof Error ? err.message : "Failed to transfer control.",
            });
        }
    });
    // ── Capture / Record ────────────────────────────────────────────────
    app.post("/api/screen-share/capture", async () => {
        return { ok: true, capture: screenShare.captureScreen() };
    });
    app.post("/api/screen-share/record", async () => {
        return { ok: true, recording: screenShare.startRecording() };
    });
}
//# sourceMappingURL=screen-share.js.map