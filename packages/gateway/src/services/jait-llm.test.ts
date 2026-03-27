import { describe, expect, it } from "vitest";
import { normalizeOpenRouterModelId, resolveJaitLlmConfig } from "./jait-llm.js";

const config = {
  port: 0,
  wsPort: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  corsOrigin: "*",
  nodeEnv: "test",
  jwtSecret: "test",
  llmProvider: "ollama" as const,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "dummy",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  openaiBaseUrl: "https://api.openai.com/v1",
  contextWindow: 128000,
  hookSecret: "test",
  heartbeatCron: "* * * * *",
  whisperUrl: "http://localhost:8178",
};

describe("resolveJaitLlmConfig", () => {
  it("normalizes bare OpenAI model ids for OpenRouter", () => {
    const llm = resolveJaitLlmConfig({
      config,
      apiKeys: { OPENROUTER_API_KEY: "or-key" },
      requestedModel: "gpt-4o",
      jaitBackend: "openrouter",
    });

    expect(llm.openaiApiKey).toBe("or-key");
    expect(llm.openaiBaseUrl).toBe("https://openrouter.ai/api/v1");
    expect(llm.openaiModel).toBe("openai/gpt-4o");
  });

  it("keeps already-prefixed OpenRouter model ids unchanged", () => {
    const llm = resolveJaitLlmConfig({
      config,
      apiKeys: { OPENROUTER_API_KEY: "or-key" },
      requestedModel: "anthropic/claude-sonnet-4-20250514",
      jaitBackend: "openrouter",
    });

    expect(llm.openaiModel).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("normalizes Xiaomi MiMo aliases and stale labels", () => {
    expect(normalizeOpenRouterModelId("mimo v2 pro")).toBe("xiaomi/mimo-v2-pro");
    expect(normalizeOpenRouterModelId("MiMo V3 Pro")).toBe("xiaomi/mimo-v2-pro");
    expect(normalizeOpenRouterModelId("hunter-alpha")).toBe("xiaomi/mimo-v2-pro");
    expect(normalizeOpenRouterModelId("xiaomi/mimo-v2-flash")).toBe("xiaomi/mimo-v2-flash");
  });
});
