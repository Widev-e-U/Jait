import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchOllamaModels,
  fetchOmniRouteModels,
  fetchOpenAIModels,
  fetchOpenRouterModels,
  isChatCapableOpenAIModelId,
  resetModelFetcherCaches,
} from "./model-fetchers.js";

const originalFetch = globalThis.fetch;

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? (init.ok === false ? 500 : 200),
    headers: { "content-type": "application/json" },
  });
  const fetchMock = vi.fn(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Install a fetch mock that answers per URL (and optionally per HTTP method),
 * so a single test can exercise the local daemon and the cloud catalogue.
 */
function mockFetchRoutes(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => handler(String(input), init));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  resetModelFetcherCaches();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("isChatCapableOpenAIModelId", () => {
  it.each([
    ["gpt-4o", true],
    ["gpt-4o-mini", true],
    ["o1-preview", true],
    ["o3-mini", true],
    ["o4-mini", true],
    ["chatgpt-4o-latest", true],
  ])("accepts chat model id %s", (id, expected) => {
    expect(isChatCapableOpenAIModelId(id)).toBe(expected);
  });

  it.each([
    "text-embedding-3-large",
    "dall-e-3",
    "whisper-1",
    "tts-1",
    "gpt-4o-realtime-preview",
    "gpt-4o-audio-preview",
    "gpt-4o-transcribe",
    "gpt-image-1",
    "gpt-3.5-turbo:ft-acme",
    "",
  ])("rejects non-chat model id %s", (id) => {
    expect(isChatCapableOpenAIModelId(id)).toBe(false);
  });
});

describe("fetchOpenAIModels", () => {
  it("filters non-chat models, sorts by id, and maps to ProviderModelInfo", async () => {
    mockFetchOnce({
      data: [
        { id: "gpt-4o", owned_by: "openai" },
        { id: "gpt-4o-mini", owned_by: "openai" },
        { id: "gpt-4o-realtime-preview" },
        { id: "dall-e-3" },
        { id: "whisper-1" },
        { id: "o3-mini" },
        { id: "text-embedding-3-large" },
      ],
    });

    const models = await fetchOpenAIModels("k", "https://api.openai.com/v1");

    expect(models.map((m) => m.id)).toEqual(["gpt-4o", "gpt-4o-mini", "o3-mini"]);
    expect(models[0]).toEqual({ id: "gpt-4o", name: "gpt-4o", description: "by openai", reasoningEffortSupported: false });
    expect(models[1]).toEqual({ id: "gpt-4o-mini", name: "gpt-4o-mini", description: "by openai", reasoningEffortSupported: false });
    expect(models[2]).toEqual({ id: "o3-mini", name: "o3-mini", description: undefined, reasoningEffortSupported: true });
    expect(models[2].description).toBeUndefined();
  });

  it("returns empty array on non-ok response without throwing", async () => {
    mockFetchOnce({ error: "unauthorized" }, { status: 401 });
    await expect(fetchOpenAIModels("bad-key", "https://api.openai.com/v1")).resolves.toEqual([]);
  });

  it("strips trailing slashes from the base URL when issuing the request", async () => {
    const fetchMock = mockFetchOnce({ data: [{ id: "gpt-4o" }] });
    await fetchOpenAIModels("k", "https://api.openai.com/v1///");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer k" }) }),
    );
  });

  it("serves the second call from cache when the base URL matches", async () => {
    const fetchMock = mockFetchOnce({ data: [{ id: "gpt-4o" }] });
    await fetchOpenAIModels("k", "https://api.openai.com/v1");
    await fetchOpenAIModels("k", "https://api.openai.com/v1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when the base URL changes", async () => {
    mockFetchOnce({ data: [{ id: "gpt-4o" }] });
    await fetchOpenAIModels("k", "https://api.openai.com/v1");
    const fetchMock2 = mockFetchOnce({ data: [{ id: "gpt-4o-mini" }] });
    const result = await fetchOpenAIModels("k", "https://proxy.example.com/v1");
    expect(fetchMock2).toHaveBeenCalledTimes(1);
    expect(result.map((m) => m.id)).toEqual(["gpt-4o-mini"]);
  });

  it("keeps provider-specific model ids from compatible endpoints", async () => {
    mockFetchOnce({ data: [{ id: "qwen3-coder" }, { id: "glm-5" }] });
    const models = await fetchOpenAIModels("k", "https://compatible.example.com/v1");
    expect(models.map((model) => model.id)).toEqual(["glm-5", "qwen3-coder"]);
  });

  it("fetches different compatible endpoints concurrently without sharing in-flight work", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const id = url.includes("first") ? "first-model" : "second-model";
      return new Response(JSON.stringify({ data: [{ id }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const [first, second] = await Promise.all([
      fetchOpenAIModels("first-key", "https://first.example.com/v1"),
      fetchOpenAIModels("second-key", "https://second.example.com/v1"),
    ]);

    expect(first.map((model) => model.id)).toEqual(["first-model"]);
    expect(second.map((model) => model.id)).toEqual(["second-model"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchOpenRouterModels", () => {
  it("drops :free variants, caps at 100, and falls back to id-derived names", async () => {
    const longList = Array.from({ length: 150 }, (_, i) => ({
      id: `vendor/model-${i}`,
      ...(i % 7 === 0 ? {} : { name: `Model ${i}` }),
    }));
    longList.push({ id: "vendor/model-free:free", name: "Free Variant" });

    mockFetchOnce({ data: longList });

    const models = await fetchOpenRouterModels("key");

    expect(models).toHaveLength(100);
    expect(models.every((m) => !m.id.includes(":free"))).toBe(true);
    const fallback = models.find((m) => m.id === "vendor/model-0");
    expect(fallback?.name).toBe("model-0");
  });

  it("truncates descriptions to 80 chars", async () => {
    const longDescription = "x".repeat(200);
    mockFetchOnce({
      data: [{ id: "vendor/m1", name: "M1", description: longDescription }],
    });
    const models = await fetchOpenRouterModels("key");
    expect(models[0].description).toHaveLength(80);
  });

  it("returns empty array on non-ok response", async () => {
    mockFetchOnce({}, { status: 502 });
    await expect(fetchOpenRouterModels("k")).resolves.toEqual([]);
  });

  it("serves repeat calls from cache", async () => {
    const fetchMock = mockFetchOnce({ data: [{ id: "vendor/m1" }] });
    await fetchOpenRouterModels("k");
    await fetchOpenRouterModels("k");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fetchOmniRouteModels", () => {
  it("keeps non-OpenAI model ids and prepends the routing aliases", async () => {
    // The OpenAI fetcher filters to gpt-*/o* prefixes; applying that here would
    // discard almost all of OmniRoute's ~290-provider catalogue.
    mockFetchOnce({
      data: [
        { id: "deepseek/deepseek-r1", owned_by: "deepseek" },
        { id: "google/gemini-2.5-flash" },
        { id: "openai/gpt-4o" },
      ],
    });

    const models = await fetchOmniRouteModels("k", "http://localhost:20128/v1");

    // Bare "auto" is usable but absent from /v1/models, so it is added by hand.
    expect(models[0]).toMatchObject({ id: "auto", isDefault: true });
    expect(models.slice(1).map((m) => m.id)).toEqual([
      "deepseek/deepseek-r1",
      "google/gemini-2.5-flash",
      "openai/gpt-4o",
    ]);
    expect(models.find((m) => m.id === "deepseek/deepseek-r1")?.reasoningEffortSupported).toBe(true);
  });

  it("does not duplicate auto if a future catalogue starts listing it", async () => {
    mockFetchOnce({ data: [{ id: "auto" }, { id: "auto/coding" }, { id: "openai/gpt-4o" }] });
    const models = await fetchOmniRouteModels("", "http://localhost:20128/v1");
    expect(models.filter((m) => m.id === "auto")).toHaveLength(1);
    // The narrower strategies come straight from the catalogue.
    expect(models.map((m) => m.id)).toContain("auto/coding");
  });

  it("caps a very large catalogue", async () => {
    mockFetchOnce({ data: Array.from({ length: 400 }, (_, i) => ({ id: `vendor/model-${i}` })) });
    const models = await fetchOmniRouteModels("k", "http://localhost:20128/v1");
    expect(models).toHaveLength(151); // "auto" + 150 catalogue entries
  });

  it("honours a custom OMNIROUTE_MAX_MODELS cap", async () => {
    vi.resetModules();
    vi.stubEnv("OMNIROUTE_MAX_MODELS", "5");
    const { fetchOmniRouteModels: fetchCapped, resetModelFetcherCaches: resetCapped } = await import("./model-fetchers.js");
    resetCapped();
    mockFetchOnce({ data: Array.from({ length: 400 }, (_, i) => ({ id: `vendor/model-${i}` })) });
    const models = await fetchCapped("k", "http://localhost:20128/v1");
    expect(models).toHaveLength(6); // "auto" + 5 catalogue entries
  });

  it("returns the full catalogue when OMNIROUTE_MAX_MODELS=0", async () => {
    vi.resetModules();
    vi.stubEnv("OMNIROUTE_MAX_MODELS", "0");
    const { fetchOmniRouteModels: fetchAll, resetModelFetcherCaches: resetAll } = await import("./model-fetchers.js");
    resetAll();
    mockFetchOnce({ data: Array.from({ length: 400 }, (_, i) => ({ id: `vendor/model-${i}` })) });
    const models = await fetchAll("k", "http://localhost:20128/v1");
    expect(models).toHaveLength(401); // "auto" + all 400 catalogue entries
  });

  it("omits the Authorization header when no key is configured", async () => {
    // OmniRoute works keyless against its free-tier providers.
    const fetchMock = mockFetchOnce({ data: [] });
    await fetchOmniRouteModels("", "http://localhost:20128/v1/");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:20128/v1/models", expect.objectContaining({ headers: {} }));
  });

  it("returns nothing when the router is not running, rather than dead aliases", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await expect(fetchOmniRouteModels("k", "http://localhost:20128/v1")).resolves.toEqual([]);
  });

  it("returns empty array on non-ok response", async () => {
    mockFetchOnce({}, { status: 503 });
    await expect(fetchOmniRouteModels("k", "http://localhost:20128/v1")).resolves.toEqual([]);
  });

  it("isolates cache by base URL", async () => {
    const fetchMock1 = mockFetchOnce({ data: [{ id: "vendor/a" }] });
    await fetchOmniRouteModels("k", "http://localhost:20128/v1");
    await fetchOmniRouteModels("k", "http://localhost:20128/v1");
    expect(fetchMock1).toHaveBeenCalledTimes(1);

    const fetchMock2 = mockFetchOnce({ data: [{ id: "vendor/b" }] });
    const result = await fetchOmniRouteModels("k", "http://nas:20128/v1");
    expect(fetchMock2).toHaveBeenCalledTimes(1);
    expect(result.map((m) => m.id)).toContain("vendor/b");
  });
});

describe("fetchOllamaModels", () => {
  it("maps tag entries and joins detail fields with separator", async () => {
    mockFetchOnce({
      models: [
        { name: "llama3:8b", details: { family: "llama", parameter_size: "8B" } },
        { name: "qwen2", details: { family: "qwen" } },
        { name: "naked" },
      ],
    });

    const models = await fetchOllamaModels("http://localhost:11434");

    expect(models.map((m) => m.id)).toEqual(["llama3:8b", "qwen2", "naked"]);
    expect(models[0].description).toBe("llama · 8B");
    expect(models[1].description).toBe("qwen");
    expect(models[2].description).toBeUndefined();
  });

  it("returns empty array on non-ok response", async () => {
    mockFetchOnce({}, { status: 500 });
    await expect(fetchOllamaModels("http://localhost:11434")).resolves.toEqual([]);
  });

  it("strips trailing slashes from base URL when calling /api/tags", async () => {
    const fetchMock = mockFetchOnce({ models: [] });
    await fetchOllamaModels("http://localhost:11434//");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("isolates cache by base URL", async () => {
    const fetchMock1 = mockFetchOnce({ models: [{ name: "a" }] });
    await fetchOllamaModels("http://a:11434");
    expect(fetchMock1).toHaveBeenCalledTimes(1);

    const fetchMock2 = mockFetchOnce({ models: [{ name: "b" }] });
    const result = await fetchOllamaModels("http://b:11434");
    expect(fetchMock2).toHaveBeenCalledTimes(1);
    expect(result.map((m) => m.id)).toEqual(["b"]);
  });

  it("merges the hosted cloud catalogue for a signed-in daemon", async () => {
    mockFetchRoutes((url) => {
      if (url.endsWith("/api/me")) return jsonResponse({ plan: "pro", email: "a@b.c" });
      if (url === "https://ollama.com/api/tags") {
        return jsonResponse({
          models: [
            { name: "llama3:8b-cloud", capabilities: ["completion", "tools"] },
            { name: "gpt-oss:120b", capabilities: ["completion"] },
            { name: "kimi-k2:1t-cloud", capabilities: ["completion", "thinking"] },
          ],
        });
      }
      return jsonResponse({
        models: [{ name: "llama3:8b", details: { family: "llama", parameter_size: "8B" } }],
      });
    });

    const models = await fetchOllamaModels("http://localhost:11434", { includeCloud: true });
    const ids = models.map((m) => m.id);

    expect(ids[0]).toBe("llama3:8b");
    // The locally pulled cloud tag suppresses the bare hosted duplicate.
    expect(ids).not.toContain("llama3:8b-cloud");
    expect(ids).toEqual(["llama3:8b", "gpt-oss:120b", "kimi-k2:1t-cloud"]);
    expect(models[0].group).toBeUndefined();
    expect(models[1]).toMatchObject({ group: "Ollama Cloud" });
    expect(models[2].description).toBe("thinking");
  });

  it("skips the hosted catalogue when the daemon is signed out", async () => {
    const fetchMock = mockFetchRoutes((url) => {
      if (url.endsWith("/api/me")) return jsonResponse({ error: "unauthorized" }, 401);
      if (url === "https://ollama.com/api/tags") throw new Error("must not be called");
      return jsonResponse({ models: [{ name: "llama3:8b" }] });
    });

    const models = await fetchOllamaModels("http://localhost:11434", { includeCloud: true });

    expect(models.map((m) => m.id)).toEqual(["llama3:8b"]);
    expect(fetchMock).not.toHaveBeenCalledWith("https://ollama.com/api/tags", expect.anything());
  });

  it("does not probe the cloud catalogue unless asked to", async () => {
    const fetchMock = mockFetchRoutes((url) => {
      if (url === "https://ollama.com/api/tags") throw new Error("must not be called");
      if (url.endsWith("/api/me")) throw new Error("must not be called");
      return jsonResponse({ models: [{ name: "llama3:8b" }] });
    });

    await fetchOllamaModels("http://localhost:11434");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/tags", expect.anything());
  });

  it("caches the cloud catalogue until force is set", async () => {
    let cloudCalls = 0;
    const fetchMock = mockFetchRoutes((url) => {
      if (url.endsWith("/api/me")) return jsonResponse({ plan: "pro" });
      if (url === "https://ollama.com/api/tags") {
        cloudCalls += 1;
        return jsonResponse({ models: [{ name: "gpt-oss:120b" }] });
      }
      return jsonResponse({ models: [{ name: "llama3:8b" }] });
    });

    await fetchOllamaModels("http://localhost:11434", { includeCloud: true });
    await fetchOllamaModels("http://localhost:11434", { includeCloud: true });
    expect(cloudCalls).toBe(1);

    const forced = await fetchOllamaModels("http://localhost:11434", { includeCloud: true, force: true });
    expect(cloudCalls).toBe(2);
    expect(forced.map((m) => m.id)).toEqual(["llama3:8b", "gpt-oss:120b"]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("keeps the local catalogue when the cloud catalogue fails", async () => {
    mockFetchRoutes((url) => {
      if (url.endsWith("/api/me")) return jsonResponse({ plan: "pro" });
      if (url === "https://ollama.com/api/tags") return jsonResponse({ error: "boom" }, 503);
      return jsonResponse({ models: [{ name: "llama3:8b" }] });
    });

    const models = await fetchOllamaModels("http://localhost:11434", { includeCloud: true });

    expect(models.map((m) => m.id)).toEqual(["llama3:8b"]);
  });
});
