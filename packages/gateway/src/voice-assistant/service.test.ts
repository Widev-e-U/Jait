import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { VoiceAssistantService } from "./service.js";

describe("VoiceAssistantService", () => {
  it("tells the voice model to default to the normal agent for real questions", () => {
    const service = new VoiceAssistantService({
      config: loadConfig(),
      verifyToken: async () => ({ id: "u1", username: "Jakob" }),
    });

    const instructions = (service as any).buildInstructions("Jakob") as string;

    expect(instructions).toContain("Default to ask_agent_about_request for almost every real question from the user.");
    expect(instructions).toContain("you MUST call ask_agent_about_request before answering.");
  });
});
