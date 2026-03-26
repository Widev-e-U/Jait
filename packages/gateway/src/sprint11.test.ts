import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { ConsentManager } from "./security/consent-manager.js";
import { registerVoiceRoutes } from "./routes/voice.js";
import { VoiceService } from "./voice/service.js";
import { createVoiceSpeakTool, createToolRegistry } from "./tools/index.js";
import { SurfaceRegistry } from "./surfaces/registry.js";

describe("Sprint 11 — Voice (STT/TTS)", () => {
  it("transcribes voice input and detects wake word", async () => {
    const app = Fastify();
    const consent = new ConsentManager({ defaultTimeoutMs: 500 });
    const voice = new VoiceService();
    registerVoiceRoutes(app, voice, consent);

    const res = await app.inject({
      method: "POST",
      url: "/api/voice/transcribe",
      payload: { sessionId: "s1", transcript: "Hey Jait run tests" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { text: string; wakeWordDetected: boolean; sentToAgent: boolean };
    expect(body.text).toBe("Hey Jait run tests");
    expect(body.wakeWordDetected).toBe(true);
    expect(body.sentToAgent).toBe(true);

    const state = await app.inject({ method: "GET", url: "/api/voice/state/s1" });
    expect((state.json() as { state: { listening: boolean } }).state.listening).toBe(true);
    await app.close();
  });

  it("approves pending consent via voice utterance", async () => {
    const app = Fastify();
    const consent = new ConsentManager({ defaultTimeoutMs: 1_000 });
    const voice = new VoiceService();
    registerVoiceRoutes(app, voice, consent);

    const pendingPromise = consent.requestConsent({
      actionId: "a1",
      toolName: "terminal.run",
      summary: "run",
      preview: { cmd: "npm test" },
      risk: "high",
      policy: {
        consentLevel: "always",
        description: "Run a shell command.",
        knownTool: true,
        source: "profile",
      },
      sessionId: "s-voice",
      timeoutMs: 10_000,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/voice/transcribe",
      payload: { sessionId: "s-voice", transcript: "Yes, run it" },
    });

    expect(res.statusCode).toBe(200);
    const decision = await pendingPromise;
    expect(decision.approved).toBe(true);
    expect(decision.decidedVia).toBe("voice");
    await app.close();
  });

  it("registers and executes voice.speak tool", async () => {
    const voice = new VoiceService();
    const tool = createVoiceSpeakTool(voice);
    const result = await tool.execute({ text: "Build succeeded" }, {
      actionId: "a2",
      sessionId: "s2",
      workspaceRoot: "/workspace/Jait",
      requestedBy: "test",
    });
    expect(result.ok).toBe(true);

    const registry = createToolRegistry(new SurfaceRegistry(), { voiceService: voice });
    expect(registry.listNames()).toContain("voice.speak");
  });
});
