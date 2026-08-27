import { encodeJaitModelId, serializeJaitBackendInstances } from "@jait/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JaitConfigError,
  callJaitLlmCompletion,
  normalizeOpenRouterModelId,
  resolveJaitLlmConfig,
} from "./jait-llm.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function ollamaLlm() {
  return resolveJaitLlmConfig({ config, jaitBackend: "ollama" });
}

function completionsResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

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

  it("rejects bare Claude Code CLI aliases instead of sending them to Ollama", () => {
    // Regression: a swarm specialist inheriting the parent session's ACP
    // model name ("opus") while routed through the user's Ollama backend
    // used to reach Ollama's /v1/chat/completions with model="opus", which
    // 404s ("model 'opus' not found") deep inside the LLM call — the
    // specialist (and often the whole swarm turn) then silently produced
    // nothing. This must fail fast and clearly instead.
    expect(() =>
      resolveJaitLlmConfig({
        config,
        requestedModel: "opus",
        jaitBackend: "ollama",
      }),
    ).toThrow(JaitConfigError);
  });

  it("routes the omniroute backend to the local router, not OpenRouter", () => {
    // Regression guard: OmniRoute model ids almost always contain a slash
    // ("openai/gpt-4o", "auto/coding"). The OpenRouter branch keys off
    // `requestedModel.includes("/")`, so without an explicit omniroute
    // early-return every OmniRoute request would silently be sent to
    // openrouter.ai — with the user's OpenRouter key, or none at all.
    const llm = resolveJaitLlmConfig({
      config,
      apiKeys: { OPENROUTER_API_KEY: "or-key" },
      requestedModel: "openai/gpt-4o",
      jaitBackend: "omniroute",
    });

    expect(llm.backend).toBe("omniroute");
    expect(llm.openaiBaseUrl).toBe("http://localhost:20128/v1");
    expect(llm.openaiModel).toBe("openai/gpt-4o");
  });

  it("does not apply OpenRouter model aliases to omniroute models", () => {
    const llm = resolveJaitLlmConfig({
      config,
      requestedModel: "gpt-4o",
      jaitBackend: "omniroute",
    });

    expect(llm.openaiModel).toBe("gpt-4o");
  });

  it("defaults the omniroute model to the router's own auto strategy", () => {
    const llm = resolveJaitLlmConfig({ config, jaitBackend: "omniroute" });

    expect(llm.openaiModel).toBe("auto");
    // Placeholder key: OmniRoute serves keyless free-tier providers, but an
    // empty bearer breaks some upstreams.
    expect(llm.openaiApiKey).toBe("omniroute");
  });

  it("prefers per-user OmniRoute settings over the gateway config", () => {
    const llm = resolveJaitLlmConfig({
      config: { ...config, omnirouteBaseUrl: "http://gateway:20128/v1", omnirouteApiKey: "cfg-key" },
      apiKeys: { OMNIROUTE_BASE_URL: "http://nas:20128/v1/", OMNIROUTE_API_KEY: "user-key" },
      requestedModel: "auto/coding",
      jaitBackend: "omniroute",
    });

    expect(llm.openaiBaseUrl).toBe("http://nas:20128/v1");
    expect(llm.openaiApiKey).toBe("user-key");
  });

  it("rejects bare Claude Code CLI aliases for non-Ollama backends too", () => {
    for (const alias of ["default", "fable", "sonnet", "opus", "haiku", "opusplan"]) {
      expect(() =>
        resolveJaitLlmConfig({ config, requestedModel: alias, jaitBackend: "openai" }),
      ).toThrow(JaitConfigError);
    }
  });

  it("routes an encoded model to its exact Ollama instance", () => {
    const apiKeys = {
      JAIT_BACKEND_INSTANCES: serializeJaitBackendInstances([
        {
          id: "desktop",
          type: "ollama",
          name: "Desktop",
          baseUrl: "http://desktop:11434",
          numCtx: 65536,
        },
        {
          id: "server",
          type: "ollama",
          name: "Server",
          baseUrl: "http://server:11434",
          numCtx: 131072,
        },
      ]),
    };
    const llm = resolveJaitLlmConfig({
      config,
      apiKeys,
      requestedModel: encodeJaitModelId("ollama", "server", "qwen3:32b"),
      jaitBackend: "openai",
    });

    expect(llm.backend).toBe("ollama");
    expect(llm.openaiBaseUrl).toBe("http://server:11434/v1");
    expect(llm.openaiModel).toBe("qwen3:32b");
    expect(llm.numCtx).toBe(131072);
  });

  it("routes an encoded model to a named OpenAI-compatible instance", () => {
    const apiKeys = {
      JAIT_BACKEND_INSTANCES: serializeJaitBackendInstances([
        {
          id: "glm",
          type: "openai",
          name: "GLM",
          baseUrl: "https://api.example.com/v1/",
          apiKey: "instance-key",
        },
      ]),
    };
    const llm = resolveJaitLlmConfig({
      config,
      apiKeys,
      requestedModel: encodeJaitModelId("openai", "glm", "glm-5"),
      jaitBackend: "ollama",
    });

    expect(llm.backend).toBe("openai");
    expect(llm.openaiBaseUrl).toBe("https://api.example.com/v1");
    expect(llm.openaiApiKey).toBe("instance-key");
    expect(llm.openaiModel).toBe("glm-5");
  });

  it("fails clearly when a selected backend instance was removed", () => {
    expect(() => resolveJaitLlmConfig({
      config,
      apiKeys: { JAIT_BACKEND_INSTANCES: "[]" },
      requestedModel: encodeJaitModelId("ollama", "gone", "qwen3"),
      jaitBackend: "ollama",
    })).toThrow(/no longer configured/i);
  });
});

describe("callJaitLlmCompletion", () => {
  it("returns trimmed content for a plain response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({
        choices: [{ finish_reason: "stop", message: { content: "  hello world  " } }],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 512 }),
    ).resolves.toBe("hello world");
  });

  it("flattens array-style content parts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({
        choices: [
          {
            finish_reason: "stop",
            message: { content: [{ type: "text", text: "part one " }, { type: "text", text: "part two" }] },
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 512 }),
    ).resolves.toBe("part one part two");
  });

  it("throws instead of silently returning empty when a reasoning model exhausts max_tokens", async () => {
    // Regression: reasoning models (GLM thinking, DeepSeek-R1, Qwen thinking)
    // put their thought in `message.reasoning` / `reasoning_content` and leave
    // `content` empty with finish_reason "length" when the budget runs out
    // mid-thought. This used to surface as "" and made e.g. chat title
    // generation silently fall back to the user's first message.
    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({
        choices: [
          {
            finish_reason: "length",
            message: { content: "", reasoning: "the user wants me to name this chat..." },
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 24 }),
    ).rejects.toThrow(/spent its whole token budget reasoning|max_tokens/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when only reasoning_content is present with no answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({
        choices: [
          {
            finish_reason: "length",
            message: { content: "", reasoning_content: "thinking..." },
          },
        ],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 24 }),
    ).rejects.toThrow(/reasoning|no answer/i);
  });

  it("throws with the finish reason when there is neither content nor reasoning", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      completionsResponse({ choices: [{ finish_reason: "error", message: { content: "" } }] }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      callJaitLlmCompletion(ollamaLlm(), [{ role: "user", content: "hi" }], { maxTokens: 24 }),
    ).rejects.toThrow(/no content \(finish_reason: error/);
  });
});
