import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THREAD_TITLE_PROMPT,
  generateTitleViaApi,
  normalizeGeneratedThreadTitle,
} from "./thread-title.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("thread-title helpers", () => {
  it("keeps the requested title prompt stable", () => {
    expect(THREAD_TITLE_PROMPT).toContain("short task title");
  });

  it("normalizes provider output into a clean single-line title", () => {
    expect(normalizeGeneratedThreadTitle('Title: "Fix manager thread selection"\n\nExtra text', "Fallback")).toBe(
      "Fix manager thread selection",
    );
  });

  it("falls back when the provider returns no usable title", () => {
    expect(normalizeGeneratedThreadTitle(" \n ", "Fallback title")).toBe("Fallback title");
  });

  it("uses the selected Jait backend for title generation", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer openrouter-test-key");
      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
      expect(body.model).toBe("xiaomi/mimo-v2-pro");
      expect(body.messages[0]?.content).toContain("short task title");
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Fix mimo backend selection" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const title = await generateTitleViaApi({
      task: "Make sure Jait threads respect the configured backend",
      config: {
        port: 0,
        wsPort: 0,
        host: "127.0.0.1",
        logLevel: "silent",
        corsOrigin: "*",
        nodeEnv: "test",
        jwtSecret: "test",
        llmProvider: "ollama",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "dummy",
        openaiApiKey: "",
        openaiModel: "gpt-4o",
        openaiBaseUrl: "https://api.openai.com/v1",
        contextWindow: 128000,
        hookSecret: "test",
        heartbeatCron: "* * * * *",
        whisperUrl: "http://localhost:8178",
      },
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
      model: "xiaomi/mimo-v2-pro",
      jaitBackend: "openrouter",
    });

    expect(title).toBe("Fix mimo backend selection");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
