import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchOllamaModels,
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
    expect(models[0]).toEqual({ id: "gpt-4o", name: "gpt-4o", description: "by openai" });
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
