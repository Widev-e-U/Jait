import { decodeJaitModelId, serializeJaitBackendInstances } from "@jait/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config.js";
import { resetModelFetcherCaches } from "../providers/model-fetchers.js";
import { listJaitModels } from "./jait-models.js";

const config = {
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-4o",
  ollamaUrl: "http://localhost:11434",
  omnirouteBaseUrl: "http://localhost:20128/v1",
} as AppConfig;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetModelFetcherCaches();
  vi.restoreAllMocks();
});

describe("listJaitModels", () => {
  it("combines models from multiple Ollama instances with routable ids", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const model = url.includes("desktop") ? "qwen3:8b" : "qwen3:32b";
      return new Response(JSON.stringify({ models: [{ name: model }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const models = await listJaitModels({
      config,
      fallbackModels: [],
      apiKeys: {
        JAIT_BACKEND_INSTANCES: serializeJaitBackendInstances([
          {
            id: "desktop",
            type: "ollama",
            name: "Desktop",
            baseUrl: "http://desktop:11434",
          },
          {
            id: "server",
            type: "ollama",
            name: "Server",
            baseUrl: "http://server:11434",
          },
        ]),
      },
    });

    expect(models).toHaveLength(2);
    expect(models.map((model) => decodeJaitModelId(model.id))).toEqual([
      { backend: "ollama", instanceId: "desktop", model: "qwen3:8b" },
      { backend: "ollama", instanceId: "server", model: "qwen3:32b" },
    ]);
    expect(models.map((model) => model.group)).toEqual([
      "Desktop · Ollama",
      "Server · Ollama",
    ]);
  });
});
