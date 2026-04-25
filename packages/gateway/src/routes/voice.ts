import type { FastifyInstance } from "fastify";
import type { VoiceService } from "../voice/service.js";
import type { ConsentManager } from "../security/consent-manager.js";
import type { AppConfig } from "../config.js";
import type { UserService } from "../services/users.js";
import { requireAuth } from "../security/http-auth.js";

export function registerVoiceRoutes(
  app: FastifyInstance,
  voice: VoiceService,
  consentManager: ConsentManager,
  config?: AppConfig,
  users?: UserService,
) {
  app.post("/api/voice/transcribe", async (request, reply) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "default";
    const transcript = typeof body["transcript"] === "string" ? body["transcript"] : undefined;
    const audioBase64 = typeof body["audioBase64"] === "string" ? body["audioBase64"] : undefined;

    const result = voice.transcribe({ sessionId, transcript, audioBase64 });
    if (!result.text) return reply.status(400).send({ error: "VALIDATION_ERROR", details: "No transcript or audio provided" });

    const consent = voice.resolveConsentFromUtterance(consentManager, { text: result.text, sessionId });
    return { ...result, consent };
  });

  app.post("/api/voice/speak", async (request, reply) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "default";
    const text = typeof body["text"] === "string" ? body["text"].trim() : "";
    if (!text) return reply.status(400).send({ error: "VALIDATION_ERROR", details: "text is required" });
    return voice.speak({ sessionId, text });
  });

  app.get("/api/voice/state/:sessionId", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    return { state: voice.getState(sessionId) };
  });

  app.patch("/api/voice/state/:sessionId", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    return {
      state: voice.updateState(sessionId, {
        wakeWordEnabled: typeof body["wakeWordEnabled"] === "boolean" ? body["wakeWordEnabled"] : undefined,
        talkModeEnabled: typeof body["talkModeEnabled"] === "boolean" ? body["talkModeEnabled"] : undefined,
        listening: typeof body["listening"] === "boolean" ? body["listening"] : undefined,
      }),
    };
  });

  // ── Audio transcription providers ───────────────────────────────
  app.post("/api/voice/transcribe-audio", async (request, reply) => {
    if (!config || !users) {
      return reply.status(501).send({ error: "NOT_CONFIGURED", details: "Voice audio transcription not available" });
    }

    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const body = (request.body as Record<string, unknown>) ?? {};
    const audioBase64 = typeof body["audioBase64"] === "string" ? body["audioBase64"] : "";
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "default";

    if (!audioBase64) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "audioBase64 is required" });
    }

    const settings = users.getSettings(authUser.id);
    const sttProvider = typeof body["provider"] === "string" ? body["provider"] : settings.sttProvider;

    if (sttProvider === "whisper") {
      // ── Local Faster Whisper server transcription ─────────────
      const whisperUrl = settings.apiKeys["WHISPER_URL"] || config.whisperUrl;

      if (!whisperUrl) {
        return reply.status(400).send({
          error: "NOT_CONFIGURED",
          details: "WHISPER_URL must be set in Settings → API keys or environment (default: http://localhost:8178)",
        });
      }

      try {
        const text = await voice.transcribeViaWhisper({ audioBase64, whisperUrl });
        if (!text) {
          return reply.status(502).send({ error: "TRANSCRIPTION_FAILED", details: "No text returned from Faster Whisper" });
        }

        voice.transcribe({ sessionId, transcript: text });
        return { text };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply.status(502).send({ error: "TRANSCRIPTION_FAILED", details: msg });
      }
    }

    if (sttProvider === "gpt") {
      const apiKey = settings.apiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey;
      const baseUrl = settings.apiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl;
      const model = settings.apiKeys["OPENAI_TRANSCRIBE_MODEL"]?.trim() || "gpt-4o-mini-transcribe";

      if (!apiKey) {
        return reply.status(400).send({
          error: "NOT_CONFIGURED",
          details: "OPENAI_API_KEY must be set in Settings → API keys or environment",
        });
      }

      try {
        const text = await voice.transcribeViaGpt({ audioBase64, apiKey, baseUrl, model });
        if (!text) {
          return reply.status(502).send({ error: "TRANSCRIPTION_FAILED", details: "No text returned from GPT transcription" });
        }

        voice.transcribe({ sessionId, transcript: text });
        return { text };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply.status(502).send({ error: "TRANSCRIPTION_FAILED", details: msg });
      }
    }

    if (sttProvider === "elevenlabs") {
      const apiKey = settings.apiKeys["ELEVENLABS_API_KEY"]?.trim() || process.env["ELEVENLABS_API_KEY"] || "";
      const model = settings.apiKeys["ELEVENLABS_STT_MODEL"]?.trim() || process.env["ELEVENLABS_STT_MODEL"] || "scribe_v2";
      const languageCode = settings.apiKeys["ELEVENLABS_LANGUAGE_CODE"]?.trim() || process.env["ELEVENLABS_LANGUAGE_CODE"] || undefined;
      const endpoint = settings.apiKeys["ELEVENLABS_STT_URL"]?.trim() || process.env["ELEVENLABS_STT_URL"] || undefined;

      if (!apiKey) {
        return reply.status(400).send({
          error: "NOT_CONFIGURED",
          details: "ELEVENLABS_API_KEY must be set in Settings → API keys or environment",
        });
      }

      try {
        const text = await voice.transcribeViaElevenLabs({ audioBase64, apiKey, model, languageCode, endpoint });
        if (!text) {
          return reply.status(502).send({ error: "TRANSCRIPTION_FAILED", details: "No text returned from ElevenLabs STT" });
        }

        voice.transcribe({ sessionId, transcript: text });
        return { text };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply.status(502).send({ error: "TRANSCRIPTION_FAILED", details: msg });
      }
    }

    if (sttProvider !== "wyoming") {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "Unsupported STT provider" });
    }

    // ── Wyoming / Home Assistant STT (default) ──────────────────
    const haUrl = settings.apiKeys["HA_URL"];
    const haToken = settings.apiKeys["HA_TOKEN"];
    const sttEntity = settings.apiKeys["HA_STT_ENTITY"] || undefined;

    if (!haUrl || !haToken) {
      return reply.status(400).send({
        error: "NOT_CONFIGURED",
        details: "HA_URL and HA_TOKEN must be set in Settings → API keys",
      });
    }

    try {
      const text = await voice.transcribeViaWyoming({ audioBase64, haUrl, haToken, sttEntity });
      if (!text) {
        return reply.status(502).send({ error: "TRANSCRIPTION_FAILED", details: "No text returned from Wyoming STT" });
      }

      voice.transcribe({ sessionId, transcript: text });
      return { text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return reply.status(502).send({ error: "TRANSCRIPTION_FAILED", details: msg });
    }
  });
}
