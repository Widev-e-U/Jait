import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOllamaUsageFrom,
  isOllamaUsageResponse,
  probeOllamaAccount,
  describeOllamaUsageGap,
} from "./provider-quota-fetchers.js";

describe("provider quota fetchers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("accepts current Ollama session/weekly and monthly response variants", () => {
    expect(
      isOllamaUsageResponse({
        limits: {
          session: { usage: 0.2, models: [] },
          weekly: { usage: 0.4, models: [] },
        },
      }),
    ).toBe(true);
    expect(
      isOllamaUsageResponse({
        limits: { monthly: { usage: 0.6, models: [] } },
      }),
    ).toBe(true);
  });

  it("rejects malformed Ollama usage responses", () => {
    expect(isOllamaUsageResponse({ limits: {} })).toBe(false);
    expect(
      isOllamaUsageResponse({
        limits: { monthly: { usage: "60%", models: [] } },
      }),
    ).toBe(false);
  });

  it("probes the Ollama cloud account and drops the trailing slash", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://ollama.com/api/me");
      expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe("Bearer key-1");
      return new Response(
        JSON.stringify({ email: "me@example.com", name: "Me", plan: "pro" }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const probe = await probeOllamaAccount({ baseUrl: "https://ollama.com/", apiKey: "key-1" });
    expect(probe).toEqual({
      reachable: true,
      account: { email: "me@example.com", name: "Me", plan: "pro" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes capitalized Ollama account fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ Email: "me@example.com", Name: "Me", Plan: "pro" }),
    )));
    await expect(probeOllamaAccount({ baseUrl: "http://localhost:11434" })).resolves.toEqual({
      reachable: true,
      account: { email: "me@example.com", name: "Me", plan: "pro" },
    });
  });

  it("treats a rejected credential as reachable but unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));

    const probe = await probeOllamaAccount({ apiKey: "bad" });
    expect(probe).toEqual({ reachable: true, account: null });
  });

  it("reports unreachable servers without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const probe = await probeOllamaAccount({ baseUrl: "http://127.0.0.1:11434" });
    expect(probe).toEqual({ reachable: false, account: null });
  });

  it("fetches usage from an explicit Ollama base URL", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://127.0.0.1:11434/api/usage");
      return new Response(
        JSON.stringify({ limits: { weekly: { usage: 0.3, models: [{ name: "llama3", requestCount: 2 }] } } }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const usage = await fetchOllamaUsageFrom("http://127.0.0.1:11434/");
    expect(usage.limits.weekly?.usage).toBe(0.3);
  });

  it("surfaces the HTTP status when a usage request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));

    await expect(fetchOllamaUsageFrom("https://ollama.com", "bad")).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("describeOllamaUsageGap", () => {
  it("reports an offline server", () => {
    const hint = describeOllamaUsageGap({
      baseUrl: "http://127.0.0.1:11434",
      cloud: false,
      probe: { reachable: false, account: null },
    });
    expect(hint).toBe(
      "Ollama at http://127.0.0.1:11434 did not respond. Subscription usage needs a running server.",
    );
  });

  it("asks for a Cloud key on a Cloud backend", () => {
    const hint = describeOllamaUsageGap({
      baseUrl: "https://ollama.com",
      cloud: true,
      probe: { reachable: true, account: null },
    });
    expect(hint).toBe("Add an Ollama Cloud API key to this Jait backend to load subscription usage.");
  });

  it("says a self-hosted daemon is not signed in when it has no account", () => {
    const hint = describeOllamaUsageGap({
      baseUrl: "http://127.0.0.1:11434",
      cloud: false,
      probe: { reachable: true, account: null },
    });
    expect(hint).toBe(
      "This Ollama instance is not signed in to Ollama Cloud, so there is no subscription usage to report.",
    );
  });

  it("reports the signed-in account and plan when a self-hosted server exposes no usage", () => {
    const hint = describeOllamaUsageGap({
      baseUrl: "http://127.0.0.1:11434",
      cloud: false,
      probe: {
        reachable: true,
        account: { email: "jakob@example.com", name: "Jakob", plan: "pro" },
      },
    });
    expect(hint).toBe(
      "Signed in to Ollama Cloud as jakob@example.com (pro), but this Ollama server does not report subscription usage. Add an Ollama Cloud API key to see quota.",
    );
    expect(hint).not.toMatch(/not signed in/);
  });

  it("falls back to the account name when no email is present", () => {
    const hint = describeOllamaUsageGap({
      baseUrl: "http://127.0.0.1:11434",
      cloud: false,
      probe: { reachable: true, account: { email: null, name: "Jakob", plan: null } },
    });
    expect(hint).toContain("Signed in to Ollama Cloud as Jakob,");
    expect(hint).not.toContain("(null)");
  });
});
