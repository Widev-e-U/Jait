import { describe, expect, it } from "vitest";
import { formatConnectionError } from "./agent-loop.js";

/** Node surfaces transport failures as a TypeError with the real code on `cause`. */
function fetchFailure(code: string): Error {
  const err = new TypeError("fetch failed");
  (err as { cause?: unknown }).cause = { code };
  return err;
}

describe("formatConnectionError", () => {
  it("names the self-hosted backend and points at the fix", () => {
    // Regression: an unreachable router used to surface as a bare "fetch failed",
    // which says nothing about which backend or what to do next.
    const message = formatConnectionError(fetchFailure("ECONNREFUSED"), {
      backend: "omniroute",
      openaiBaseUrl: "http://localhost:20128/v1",
    });

    expect(message).toContain("http://localhost:20128/v1");
    expect(message).toContain("Start the OmniRoute router");
    expect(message).toContain("Test connection");
  });

  it("gives Ollama its own instruction rather than a generic one", () => {
    const message = formatConnectionError(fetchFailure("ECONNREFUSED"), {
      backend: "ollama",
      openaiBaseUrl: "http://localhost:11434/v1",
    });

    expect(message).toContain("Start Ollama");
    expect(message).toContain("OLLAMA_URL");
  });

  it("distinguishes DNS failures from refused connections", () => {
    const dns = formatConnectionError(fetchFailure("ENOTFOUND"), {
      backend: "omniroute",
      openaiBaseUrl: "http://typo-host:20128/v1",
    });
    expect(dns).toMatch(/Could not resolve the host/);
  });

  it("reports a timeout as a timeout", () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    expect(formatConnectionError(err, { backend: "omniroute", openaiBaseUrl: "http://x/v1" }))
      .toMatch(/No response from .* in time/);
  });

  it("falls back to a generic hint for hosted backends", () => {
    const message = formatConnectionError(fetchFailure("ECONNREFUSED"), {
      backend: "openai",
      openaiBaseUrl: "https://api.openai.com/v1",
    });
    expect(message).toContain("Check your network connection");
    expect(message).not.toContain("Start");
  });

  it("returns null for anything that is not a connection failure", () => {
    // Real bugs must keep propagating instead of being dressed up as network trouble.
    expect(formatConnectionError(new Error("Cannot read properties of undefined"), {
      backend: "omniroute",
      openaiBaseUrl: "http://x/v1",
    })).toBeNull();
    expect(formatConnectionError(fetchFailure("EPIPE"), {
      backend: "omniroute",
      openaiBaseUrl: "http://x/v1",
    })).toBeNull();
  });
});
