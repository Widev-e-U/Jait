import { describe, expect, it } from "vitest";
import {
  decodeJaitModelId,
  encodeJaitModelId,
  parseJaitBackendInstances,
  serializeJaitBackendInstances,
} from "./jait-backends.js";

describe("Jait backend instances", () => {
  it("round-trips named instances and normalizes URLs", () => {
    const serialized = serializeJaitBackendInstances([
      {
        id: "gpu-lab",
        type: "ollama",
        name: "GPU Lab",
        baseUrl: "http://gpu:11434///",
        model: "qwen3:32b",
        numCtx: 65536,
      },
      {
        id: "work",
        type: "openrouter",
        name: "Work OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1/",
        apiKey: "secret",
      },
    ]);

    expect(parseJaitBackendInstances(serialized)).toEqual([
      {
        id: "gpu-lab",
        type: "ollama",
        name: "GPU Lab",
        baseUrl: "http://gpu:11434",
        model: "qwen3:32b",
        numCtx: 65536,
      },
      {
        id: "work",
        type: "openrouter",
        name: "Work OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "secret",
      },
    ]);
  });

  it("drops malformed and duplicate instances", () => {
    const raw = JSON.stringify([
      { id: "same", type: "ollama", name: "One", baseUrl: "http://one:11434" },
      { id: "same", type: "ollama", name: "Two", baseUrl: "http://two:11434" },
      { id: "bad", type: "unknown", name: "Bad", baseUrl: "http://bad" },
    ]);

    expect(parseJaitBackendInstances(raw)).toHaveLength(1);
  });

  it("encodes the backend and instance into a reversible model id", () => {
    const encoded = encodeJaitModelId("ollama", "gpu/lab", "qwen3:32b/latest");
    expect(decodeJaitModelId(encoded)).toEqual({
      backend: "ollama",
      instanceId: "gpu/lab",
      model: "qwen3:32b/latest",
    });
  });
});
