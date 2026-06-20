import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceService } from "./service.js";

const originalFetch = globalThis.fetch;

describe("VoiceService transcription providers", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts WAV audio to OpenAI transcription endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect(init!.method).toBe("POST");
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer openai-key");
      const form = init!.body as FormData;
      expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
      expect(form.get("file")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ text: "hello from gpt" }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const service = new VoiceService();
    const text = await service.transcribeViaGpt({
      audioBase64: Buffer.from("wav").toString("base64"),
      apiKey: "openai-key",
      baseUrl: "https://api.openai.com/v1/",
      model: "gpt-4o-mini-transcribe",
    });

    expect(text).toBe("hello from gpt");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("posts WAV audio to ElevenLabs speech-to-text endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toBe("https://api.elevenlabs.io/v1/speech-to-text");
      expect(init!.method).toBe("POST");
      expect((init!.headers as Record<string, string>)["xi-api-key"]).toBe("eleven-key");
      const form = init!.body as FormData;
      expect(form.get("model_id")).toBe("scribe_v2");
      expect(form.get("language_code")).toBe("de");
      expect(form.get("file")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ text: "hallo von elevenlabs" }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const service = new VoiceService();
    const text = await service.transcribeViaElevenLabs({
      audioBase64: Buffer.from("wav").toString("base64"),
      apiKey: "eleven-key",
      model: "scribe_v2",
      languageCode: "de",
    });

    expect(text).toBe("hallo von elevenlabs");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("forwards the STT prompt to the OpenAI transcription endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init!.body as FormData;
      expect(form.get("prompt")).toBe("Jait");
      return new Response(JSON.stringify({ text: "ok" }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const service = new VoiceService();
    const text = await service.transcribeViaGpt({
      audioBase64: Buffer.from("wav").toString("base64"),
      apiKey: "openai-key",
      baseUrl: "https://api.openai.com/v1/",
      model: "gpt-4o-mini-transcribe",
      prompt: "Jait",
    });

    expect(text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("VoiceService.normalizeTranscript", () => {
  it("corrects 'Jade' to 'Jait'", () => {
    expect(VoiceService.normalizeTranscript("hey jade what is the weather")).toBe(
      "hey Jait what is the weather",
    );
  });

  it("corrects all caps and mid-sentence occurrences", () => {
    expect(VoiceService.normalizeTranscript("JADE is great")).toBe("JAIT is great");
    expect(VoiceService.normalizeTranscript("I love Jade and Jade")).toBe("I love Jait and Jait");
  });

  it("does not touch unrelated words containing 'jade'", () => {
    expect(VoiceService.normalizeTranscript("jaded view")).toBe("jaded view");
  });

  it("leaves an already-correct 'Jait' untouched", () => {
    expect(VoiceService.normalizeTranscript("hey Jait")).toBe("hey Jait");
  });
});
