export function registerVoiceRoutes(app, voice, consentManager) {
    app.post("/api/voice/transcribe", async (request, reply) => {
        const body = request.body ?? {};
        const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "default";
        const transcript = typeof body["transcript"] === "string" ? body["transcript"] : undefined;
        const audioBase64 = typeof body["audioBase64"] === "string" ? body["audioBase64"] : undefined;
        const result = voice.transcribe({ sessionId, transcript, audioBase64 });
        if (!result.text)
            return reply.status(400).send({ error: "VALIDATION_ERROR", details: "No transcript or audio provided" });
        const consent = voice.resolveConsentFromUtterance(consentManager, { text: result.text, sessionId });
        return { ...result, consent };
    });
    app.post("/api/voice/speak", async (request, reply) => {
        const body = request.body ?? {};
        const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "default";
        const text = typeof body["text"] === "string" ? body["text"].trim() : "";
        if (!text)
            return reply.status(400).send({ error: "VALIDATION_ERROR", details: "text is required" });
        return voice.speak({ sessionId, text });
    });
    app.get("/api/voice/state/:sessionId", async (request) => {
        const { sessionId } = request.params;
        return { state: voice.getState(sessionId) };
    });
    app.patch("/api/voice/state/:sessionId", async (request) => {
        const { sessionId } = request.params;
        const body = request.body ?? {};
        return {
            state: voice.updateState(sessionId, {
                wakeWordEnabled: typeof body["wakeWordEnabled"] === "boolean" ? body["wakeWordEnabled"] : undefined,
                talkModeEnabled: typeof body["talkModeEnabled"] === "boolean" ? body["talkModeEnabled"] : undefined,
                listening: typeof body["listening"] === "boolean" ? body["listening"] : undefined,
            }),
        };
    });
}
//# sourceMappingURL=voice.js.map