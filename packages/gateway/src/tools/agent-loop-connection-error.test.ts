import { describe, expect, it } from "vitest";
import { formatConnectionError, isTransientTransportError } from "./agent-loop.js";

/** Node surfaces transport failures as a TypeError with the real code on `cause`. */
function fetchFailure(code: string): Error {
  const err = new TypeError("fetch failed");
  (err as { cause?: unknown }).cause = { code };
  return err;
}

/** undici dispatcher deadline: TypeError whose cause is a HeadersTimeoutError. */
function undiciHeadersTimeout(): Error {
  const err = new TypeError(
    "fetch failed: Headers Timeout Error (test performed on a server that did not respond in time)",
  );
  (err as { cause?: unknown }).cause = {
    name: "HeadersTimeoutError",
    code: "UND_ERR_HEADERS_TIMEOUT",
    message: "Headers Timeout Error (test performed on a server that did not respond in time)",
  };
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

  it("recognizes an undici HeadersTimeoutError as a timeout, not a bare fetch failure", () => {
    // Regression: hung backends surface as `TypeError: fetch failed` with a
    // HeadersTimeoutError cause, which used to fall through every check and
    // end the agent loop as a bare error the user had to manually continue.
    expect(formatConnectionError(undiciHeadersTimeout(), { backend: "omniroute", openaiBaseUrl: "http://x/v1" }))
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

describe("isTransientTransportError", () => {
  it("classifies undici dispatcher deadlines and dropped sockets as transient", () => {
    // These are worth retrying the same round: a healthy turn should not die
    // to a one-off blip after tens of productive rounds.
    expect(isTransientTransportError(undiciHeadersTimeout())).toBe(true);

    const bodyTimeout = fetchFailure("UND_ERR_BODY_TIMEOUT");
    (bodyTimeout as { cause: { name?: string } }).cause.name = "BodyTimeoutError";
    expect(isTransientTransportError(bodyTimeout)).toBe(true);

    expect(isTransientTransportError(fetchFailure("UND_ERR_SOCKET"))).toBe(true);
    expect(isTransientTransportError(fetchFailure("UND_ERR_CONNECT_TIMEOUT"))).toBe(true);
    expect(isTransientTransportError(fetchFailure("ECONNRESET"))).toBe(true);
    expect(isTransientTransportError(fetchFailure("EPIPE"))).toBe(true);
    expect(isTransientTransportError(fetchFailure("ETIMEDOUT"))).toBe(true);
  });

  it("does not treat dead-backend failures as transient", () => {
    // Nothing to retry: the backend is not listening and DNS will not heal by
    // re-issuing the request, so these must surface immediately.
    expect(isTransientTransportError(fetchFailure("ECONNREFUSED"))).toBe(false);
    expect(isTransientTransportError(fetchFailure("ENOTFOUND"))).toBe(false);
    expect(isTransientTransportError(fetchFailure("EAI_AGAIN"))).toBe(false);
  });

  it("does not classify ordinary errors or non-errors as transient", () => {
    expect(isTransientTransportError(new TypeError("fetch failed"))).toBe(false);
    expect(isTransientTransportError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isTransientTransportError(null)).toBe(false);
    expect(isTransientTransportError(undefined)).toBe(false);
    expect(isTransientTransportError("boom")).toBe(false);
  });
});
