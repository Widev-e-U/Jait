import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import type { ProviderUsageSnapshot } from "../services/provider-usage.js";
import { registerProviderRoutes } from "./providers.js";

const account = { id: "codex-1", providerType: "codex", label: "Work", nodeId: "gateway" };

function quota(overrides: Partial<ProviderUsageSnapshot>): ProviderUsageSnapshot {
  return {
    accountId: account.id,
    rateLimitType: "five_hour",
    providerType: "codex",
    status: "allowed",
    utilization: 0.4,
    resetsAt: null,
    isUsingOverage: false,
    updatedAt: "2026-10-18T19:00:00.000Z",
    planType: "team",
    windowDurationMins: 300,
    resetSource: null,
    credits: null,
    resetCredits: null,
    models: [],
    activityCost: null,
    accountLabel: null,
    ...overrides,
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

async function setup(reads: ProviderUsageSnapshot[][]) {
  const config = loadConfig();
  const token = await signAuthToken({ id: "user-1", username: "test" }, config.jwtSecret);
  let readIndex = 0;
  // Every readUsageSummary() call performs exactly one DB read; a forced read
  // happens first, then the local read used to rebuild the response.
  const listForUser = vi.fn(() => reads[Math.min(readIndex++, reads.length - 1)] ?? []);
  const refreshUsage = vi.fn(async () => ({}));
  const app = Fastify({ logger: false });
  registerProviderRoutes(app, config, {
    providerRegistry: new ProviderRegistry(),
    providerAccountService: { list: () => [account], refreshUsage } as never,
    providerUsageService: { listForUser, recordUsage: vi.fn() } as never,
    userService: { getSettings: () => ({ apiKeys: {} }) } as never,
  });
  const request = (refresh: string) => app.inject({
    method: "GET",
    url: `/api/provider-usage/summary?refresh=${refresh}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { app, request, refreshUsage, listForUser };
}

describe("subscription usage summary refresh", () => {
  it("keeps the live quota read when a background row was not persisted", async () => {
    const live = quota({ status: "rejected", utilization: 1 });
    const { app, request } = await setup([[live], []]);
    try {
      const response = await request("force");
      expect(response.statusCode).toBe(200);
      const body = response.json() as { profiles: Array<{ quotas: ProviderUsageSnapshot[] }> };
      expect(body.profiles[0].quotas).toHaveLength(1);
      expect(body.profiles[0].quotas[0]).toMatchObject({ status: "rejected", utilization: 1 });
    } finally { await app.close(); }
  });

  it("prefers a newer local observation over an older refresh result", async () => {
    const refreshed = quota({ status: "allowed", utilization: 0.63, updatedAt: "2026-10-18T19:00:00.000Z" });
    const newerLocal = quota({ status: "rejected", utilization: 1, updatedAt: "2026-10-18T19:05:00.000Z" });
    const { app, request } = await setup([[refreshed], [newerLocal]]);
    try {
      const response = await request("force");
      const body = response.json() as { profiles: Array<{ quotas: ProviderUsageSnapshot[] }> };
      expect(body.profiles[0].quotas).toHaveLength(1);
      expect(body.profiles[0].quotas[0]).toMatchObject({ status: "rejected", utilization: 1 });
    } finally { await app.close(); }
  });

  it("runs the provider read for every manual refresh instead of serving the cache", async () => {
    const { app, request, refreshUsage } = await setup([[quota({})]]);
    try {
      await request("force");
      await request("force");
      expect(refreshUsage).toHaveBeenCalledTimes(2);
    } finally { await app.close(); }
  });
});
