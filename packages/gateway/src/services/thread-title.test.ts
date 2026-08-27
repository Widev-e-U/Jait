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

  it("preserves meaningful leading digits while stripping list prefixes", () => {
    expect(normalizeGeneratedThreadTitle("3D viewer crash fix", "Fallback")).toBe("3D viewer crash fix");
    expect(normalizeGeneratedThreadTitle("1. Fix project reload loop", "Fallback")).toBe("Fix project reload loop");
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

  it("sends enough max_tokens for reasoning models via the Jait backend", async () => {
    // Regression: GLM thinking models via Ollama spend part of the completion
    // budget on internal reasoning before writing the title. With the old
    // budget of 24 tokens the visible answer never arrived — `content` came
    // back empty (finish_reason "length") and every new chat silently kept
    // its truncated first-message name.
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("http://localhost:11434/v1/chat/completions");
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        max_tokens: number;
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.model).toBe("glm-5.3-flash:cloud");
      expect(body.max_tokens).toBeGreaterThanOrEqual(512);
      expect(body.messages[0]?.content).toContain("short task title");
      // Response shape produced by reasoning models: the answer is present
      // once the budget allows the model to finish thinking.
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: "Fix chat naming bug", reasoning: "the user wants... ok" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const title = await generateTitleViaApi({
      task: "some longer opening message that should become a chat title",
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
      model: "glm-5.3-flash:cloud",
      jaitBackend: "ollama",
    });

    expect(title).toBe("Fix chat naming bug");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws instead of returning empty when the reasoning budget is exhausted", async () => {
    // If a reasoning model still burns the whole budget, the helper must fail
    // loudly (so the route logs it) rather than return "" which the route
    // silently turns into a first-message-derived title.
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { content: "", reasoning: "let me think about a good title for..." },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    await expect(
      generateTitleViaApi({
        task: "some longer opening message",
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
        model: "glm-5.3-flash:cloud",
        jaitBackend: "ollama",
      }),
    ).rejects.toThrow(/spent its whole token budget reasoning|max_tokens/);
  });
});
