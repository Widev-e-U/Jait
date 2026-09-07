import { describe, expect, it } from "vitest";
import {
  decodeJaitModelId,
  encodeJaitModelId,
  normalizeJaitBackendBaseUrl,
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

  it("normalizes bare host:port IPs to a scheme so they are fetchable", () => {
    expect(normalizeJaitBackendBaseUrl("192.168.1.50:11434")).toBe("http://192.168.1.50:11434");
    expect(normalizeJaitBackendBaseUrl("localhost:11434")).toBe("http://localhost:11434");
    expect(normalizeJaitBackendBaseUrl("gpu:11434")).toBe("http://gpu:11434");
    expect(normalizeJaitBackendBaseUrl("http://gpu:11434")).toBe("http://gpu:11434");
    expect(normalizeJaitBackendBaseUrl("https://gpu:11434/")).toBe("https://gpu:11434");
    expect(normalizeJaitBackendBaseUrl("http://gpu:11434///")).toBe("http://gpu:11434");
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

  it("appends /v1 to root vLLM URLs but leaves existing paths untouched", () => {
    // Bare host:port with the vllm backend should resolve under /v1 (its OpenAI-compatible root).
    expect(normalizeJaitBackendBaseUrl("host:8000", "vllm")).toBe("http://host:8000/v1");
    expect(normalizeJaitBackendBaseUrl("http://host:8000", "vllm")).toBe("http://host:8000/v1");
    // Already under /v1 (or a custom path) must not be double-appended.
    expect(normalizeJaitBackendBaseUrl("http://host:8000/v1", "vllm")).toBe("http://host:8000/v1");
    expect(normalizeJaitBackendBaseUrl("http://host:8000/foo", "vllm")).toBe("http://host:8000/foo");
    // Empty input stays empty even for vllm.
    expect(normalizeJaitBackendBaseUrl("", "vllm")).toBe("");
    // The /v1 rewrite is backend-specific: other backends keep the bare URL.
    expect(normalizeJaitBackendBaseUrl("http://host:8000", "ollama")).toBe("http://host:8000");
  });

  it("round-trips special characters through encode/decodeJaitModelId", () => {
    const encoded = encodeJaitModelId("gemini", "a/b c", "my model 1/x");
    expect(decodeJaitModelId(encoded)).toEqual({
      backend: "gemini",
      instanceId: "a/b c",
      model: "my model 1/x",
    });
  });

  it("rejects malformed or unrecognized model ids", () => {
    expect(decodeJaitModelId("ollama/qwen3")).toBeNull(); // missing jait:// prefix
    expect(decodeJaitModelId("jait://unsupported/inst/model")).toBeNull(); // unknown backend
    expect(decodeJaitModelId("jait://ollama/inst")).toBeNull(); // missing model
    expect(decodeJaitModelId("jait://ollama/inst/")).toBeNull(); // empty model after separator
    expect(decodeJaitModelId("jait://ollama/%E0%A4%A/model")).toBeNull(); // invalid percent-encoding
    expect(decodeJaitModelId("")).toBeNull();
  });
});
