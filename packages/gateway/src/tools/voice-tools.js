export function createVoiceSpeakTool(voiceService) {
    return {
        name: "voice.speak",
        description: "Speak text via the configured TTS output",
        tier: "standard",
        category: "voice",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                text: { type: "string", description: "Message to speak." },
            },
            required: ["text"],
        },
        async execute(input, context) {
            const text = typeof input?.text === "string" ? input.text.trim() : "";
            if (!text) {
                return { ok: false, message: "text is required" };
            }
            const spoken = voiceService.speak({ sessionId: context.sessionId, text });
            return {
                ok: true,
                message: "Spoken",
                data: {
                    mimeType: spoken.mimeType,
                    bytes: spoken.audioBase64.length,
                },
            };
        },
    };
}
//# sourceMappingURL=voice-tools.js.map