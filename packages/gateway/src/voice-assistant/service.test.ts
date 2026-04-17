import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { VoiceAssistantService } from "./service.js";

describe("VoiceAssistantService", () => {
  afterEach(() => {
    delete process.env["OPENAI_REALTIME_TURN_DETECTION"];
    delete process.env["OPENAI_REALTIME_VAD_THRESHOLD"];
    delete process.env["OPENAI_REALTIME_PREFIX_PADDING_MS"];
    delete process.env["OPENAI_REALTIME_SILENCE_DURATION_MS"];
    delete process.env["OPENAI_REALTIME_SEMANTIC_EAGERNESS"];
  });

  it("tells the voice model to default to the normal agent for real questions", () => {
    const service = new VoiceAssistantService({
      config: loadConfig(),
      verifyToken: async () => ({ id: "u1", username: "Jakob" }),
    });

    const instructions = (service as any).buildInstructions("Jakob") as string;

    expect(instructions).toContain("Default to ask_agent_about_request for almost every real question from the user.");
    expect(instructions).toContain("you MUST call ask_agent_about_request before answering.");
  });

  it("configures Realtime voice and low-latency server VAD defaults", () => {
    const service = new VoiceAssistantService({
      config: { ...loadConfig(), realtimeVoice: "shimmer" },
      verifyToken: async () => ({ id: "u1", username: "Jakob" }),
    });

    const update = (service as any).buildSessionUpdate("Jakob");

    expect(update.session.voice).toBe("shimmer");
    expect(update.session.turn_detection).toEqual({
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 450,
      create_response: true,
      interrupt_response: true,
    });
  });

  it("allows semantic VAD through env for slower but smarter turn timing", () => {
    process.env["OPENAI_REALTIME_TURN_DETECTION"] = "semantic_vad";
    process.env["OPENAI_REALTIME_SEMANTIC_EAGERNESS"] = "low";
    const service = new VoiceAssistantService({
      config: loadConfig(),
      verifyToken: async () => ({ id: "u1", username: "Jakob" }),
    });

    const update = (service as any).buildSessionUpdate("Jakob");

    expect(update.session.turn_detection).toEqual({
      type: "semantic_vad",
      eagerness: "low",
      create_response: true,
      interrupt_response: true,
    });
  });

  it("can disable automatic Realtime turn detection", () => {
    process.env["OPENAI_REALTIME_TURN_DETECTION"] = "disabled";
    const service = new VoiceAssistantService({
      config: loadConfig(),
      verifyToken: async () => ({ id: "u1", username: "Jakob" }),
    });

    const update = (service as any).buildSessionUpdate("Jakob");

    expect(update.session.turn_detection).toBeNull();
  });
});
