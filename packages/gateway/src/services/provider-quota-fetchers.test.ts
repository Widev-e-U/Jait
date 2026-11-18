import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOllamaUsageFrom,
  isOllamaUsageResponse,
  probeOllamaAccount,
  describeOllamaUsageGap,
  isCodexRateLimitsResponse,
  normalizeCodexRateLimits,
} from "./provider-quota-fetchers.js";
import type { CodexRateLimitsResponse, CodexRateLimitSnapshot } from "./provider-quota-fetchers.js";

describe("provider quota fetchers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("accepts a quota response with ancillary totals", () => {
    expect(isOllamaUsageResponse({ limits: { session: { usage: 0.42, models: [] } }, totals: { request_count: 50 } })).toBe(true);
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

  it("accepts Ollama request activity without quota limits", async () => {
    const activity = {
      range: "7d", scope: "self", granularity: "day",
      from: "2026-09-30T00:00:00Z", until: "2026-10-07T11:29:42Z",
      totals: { request_count: 10388 },
      buckets: [{ from: "2026-09-30T00:00:00Z", until: "2026-10-01T00:00:00Z", request_count: 81 }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(activity)));
    await expect(fetchOllamaUsageFrom("https://ollama.com", "test-key")).resolves.toEqual(activity);
    expect(isOllamaUsageResponse(activity)).toBe(true);
    for (const count of [-1, "10388", null, Infinity]) {
      expect(isOllamaUsageResponse({ ...activity, totals: { request_count: count } })).toBe(false);
    }
    expect(isOllamaUsageResponse({ ...activity, from: "invalid" })).toBe(false);
    expect(isOllamaUsageResponse({ ...activity, buckets: [{}] })).toBe(false);
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

describe("Codex rate-limit response validation", () => {
  const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

  it("accepts a minimal response with root-level windows", () => {
    expect(isCodexRateLimitsResponse({ rateLimits: { primary: window, secondary: null } })).toBe(true);
    expect(isCodexRateLimitsResponse({ rateLimits: { primary: null, secondary: window } })).toBe(true);
  });

  it("rejects malformed windows and non-object responses", () => {
    expect(isCodexRateLimitsResponse(null)).toBe(false);
    expect(isCodexRateLimitsResponse("rateLimits")).toBe(false);
    expect(isCodexRateLimitsResponse({})).toBe(false);
    expect(isCodexRateLimitsResponse({ rateLimits: { primary: { usedPercent: "50" } } })).toBe(false);
    expect(isCodexRateLimitsResponse({ rateLimits: { primary: { usedPercent: 50, resetsAt: "soon" } } })).toBe(false);
    expect(isCodexRateLimitsResponse({ rateLimits: { primary: { usedPercent: 50, windowDurationMins: "300" } } })).toBe(false);
    expect(isCodexRateLimitsResponse({ rateLimits: { secondary: {} } })).toBe(false);
    expect(isCodexRateLimitsResponse({ rateLimits: "none" })).toBe(false);
  });

  it("accepts responses carrying rate-limit reset credits", () => {
    const response = {
      rateLimits: { primary: window, secondary: null },
      rateLimitResetCredits: {
        availableCount: 2,
        credits: [
          { id: "c1", resetType: "codexRateLimits", status: "available", grantedAt: 1_770_000_000, expiresAt: 1_772_000_000, title: "Full reset (Weekly + 5 hr)", description: "…" },
          { id: "c2", grantedAt: null, expiresAt: null },
        ],
      },
    };
    expect(isCodexRateLimitsResponse(response)).toBe(true);
    expect(isCodexRateLimitsResponse({ rateLimits: { primary: window }, rateLimitResetCredits: {} })).toBe(true);
    expect(isCodexRateLimitsResponse({ rateLimits: { primary: window }, rateLimitResetCredits: { availableCount: 0, credits: [] } })).toBe(true);
    expect(isCodexRateLimitsResponse({ rateLimits: { primary: window }, rateLimitResetCredits: null })).toBe(true);
  });

  it("rejects malformed reset credits without rejecting newer fields wholesale", () => {
    const base = { rateLimits: { primary: window, secondary: null } };
    expect(isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: { availableCount: "2" } })).toBe(false);
    expect(isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: { credits: "many" } })).toBe(false);
    expect(isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: { credits: [{ grantedAt: "yesterday" }] } })).toBe(false);
    expect(isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: { credits: [null] } })).toBe(false);
    expect(isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: 7 })).toBe(false);
  });

  it("accepts account flags and per-limit snapshots, and rejects their malformed forms", () => {
    const base = { rateLimits: { primary: window, secondary: null } };
    expect(isCodexRateLimitsResponse({ ...base, ordinaryUsageAllowed: false })).toBe(true);
    expect(isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: { codex: { primary: window }, extra: { secondary: window } } })).toBe(true);
    expect(isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: {} })).toBe(true);
    expect(isCodexRateLimitsResponse({ ...base, ordinaryUsageAllowed: "false" })).toBe(false);
    expect(isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: { codex: { primary: { usedPercent: "?" } } } })).toBe(false);
    expect(isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: 3 })).toBe(false);
    expect(isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: { codex: null } })).toBe(false);
  });
});

describe("normalizeCodexRateLimits", () => {
  const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

  it("leaves responses with root-level windows untouched", () => {
    const response: CodexRateLimitsResponse = {
      rateLimits: { primary: window, secondary: null, planType: "plus" },
      rateLimitsByLimitId: { codex: { primary: { usedPercent: 1, windowDurationMins: null, resetsAt: null } } },
    };
    expect(normalizeCodexRateLimits(response)).toBe(response);
  });

  it("promotes the codex snapshot when only rateLimitsByLimitId carries windows", () => {
    const response: CodexRateLimitsResponse = {
      rateLimits: { primary: null, secondary: null, planType: "team" },
      rateLimitsByLimitId: {
        other: { primary: null, secondary: { usedPercent: 1, windowDurationMins: null, resetsAt: null }, planType: "other" },
        codex: { primary: window, secondary: null, planType: "codex-plan", credits: { balance: "5" }, rateLimitReachedType: "primary", spendControlReached: true },
      },
    };
    const normalized = normalizeCodexRateLimits(response);
    expect(normalized).not.toBe(response);
    expect(normalized.rateLimits.primary).toEqual(window);
    // Root-level account flags win over the promoted snapshot's.
    expect(normalized.rateLimits.planType).toBe("team");
    expect(normalized.rateLimits.credits).toEqual({ balance: "5" });
    expect(normalized.rateLimits.rateLimitReachedType).toBe("primary");
    expect(normalized.rateLimits.spendControlReached).toBe(true);
  });

  it("falls back to any snapshot with windows and keeps responses without one", () => {
    const only: CodexRateLimitSnapshot = { secondary: window };
    const normalized = normalizeCodexRateLimits({
      rateLimits: { primary: null, secondary: null },
      rateLimitsByLimitId: { first: only },
    });
    expect(normalized.rateLimits.secondary).toEqual(window);

    const empty: CodexRateLimitsResponse = {
      rateLimits: { primary: null, secondary: null },
      rateLimitsByLimitId: { first: { primary: null, secondary: null } },
    };
    expect(normalizeCodexRateLimits(empty)).toBe(empty);
    const bare: CodexRateLimitsResponse = { rateLimits: { primary: null, secondary: null } };
    expect(normalizeCodexRateLimits(bare)).toBe(bare);
  });
});
