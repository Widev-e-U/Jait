import type { ToolDefinition } from "./contracts.js";
import type { VoiceService } from "../voice/service.js";

interface SpeakInput {
  text: string;
}

export function createVoiceSpeakTool(voiceService: VoiceService): ToolDefinition<SpeakInput> {
  return {
    name: "voice.speak",
    description: "Speak text via the configured TTS output",
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
