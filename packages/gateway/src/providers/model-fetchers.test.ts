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

beforeEach(() => {
  resetModelFetcherCaches();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
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

    expect(models.slice(0, 5).map((m) => m.id)).toEqual([
      "auto",
      "auto/coding",
      "auto/fast",
      "auto/cheap",
      "auto/smart",
    ]);
    expect(models[0].isDefault).toBe(true);
    expect(models.slice(5).map((m) => m.id)).toEqual([
      "deepseek/deepseek-r1",
      "google/gemini-2.5-flash",
      "openai/gpt-4o",
    ]);
    expect(models.find((m) => m.id === "deepseek/deepseek-r1")?.reasoningEffortSupported).toBe(true);
  });

  it("does not duplicate aliases already present in the catalogue", async () => {
    mockFetchOnce({ data: [{ id: "auto" }, { id: "auto/coding" }, { id: "openai/gpt-4o" }] });
    const models = await fetchOmniRouteModels("", "http://localhost:20128/v1");
    expect(models.filter((m) => m.id === "auto")).toHaveLength(1);
    expect(models.filter((m) => m.id === "auto/coding")).toHaveLength(1);
  });

  it("caps a very large catalogue", async () => {
    mockFetchOnce({ data: Array.from({ length: 400 }, (_, i) => ({ id: `vendor/model-${i}` })) });
    const models = await fetchOmniRouteModels("k", "http://localhost:20128/v1");
    expect(models).toHaveLength(155); // 5 aliases + 150 catalogue entries
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
});
