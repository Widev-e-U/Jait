import { describe, expect, it } from "vitest";
import { summarizeProviderUsage } from "./usage-summary.js";

describe("summarizeProviderUsage", () => {
  it("groups subscription limits by provider profile and puts Ollama under Jait backend", () => {
    const codexQuota = {
      accountId: "codex-1",
      rateLimitType: "five_hour",
      providerType: "codex",
      status: "allowed",
      utilization: 0.25,
      resetsAt: null,
      isUsingOverage: false,
      updatedAt: "2026-09-09T12:00:00.000Z",
      planType: "plus",
      windowDurationMins: 300,
      credits: null,
      models: [],
      activityCost: null,
    };
    const ollamaQuota = {
      ...codexQuota,
      accountId: "jait-backend:ollama",
      providerType: "ollama",
      rateLimitType: "monthly",
      utilization: 0.4,
    };

    const result = summarizeProviderUsage(
      [
        {
          id: "codex-1",
          providerType: "codex",
          label: "Personal",
          nodeId: "gateway",
        },
        {
          id: "claude-1",
          providerType: "claude-code",
          label: "Work",
          nodeId: "desktop",
        },
      ],
      [codexQuota, ollamaQuota],
      {
        quotaErrors: { "claude-1": "No live snapshot" },
        jaitBackendProfiles: [{
          id: "jait-backend:ollama",
          providerType: "ollama",
          providerLabel: "Ollama",
          profileLabel: "Local Ollama",
          quotaAccountId: "jait-backend:ollama",
        }],
      },
    );

    expect(result.profiles).toEqual([
      expect.objectContaining({
        id: "codex-1",
        providerLabel: "Codex",
        profileLabel: "Personal",
        locationLabel: "Gateway profile",
        quotas: [codexQuota],
      }),
      expect.objectContaining({
        id: "claude-1",
        providerLabel: "Claude Code",
        profileLabel: "Work",
        locationLabel: "Remote profile",
        quotas: [],
        error: "No live snapshot",
      }),
      expect.objectContaining({
        id: "jait-backend:ollama",
        providerLabel: "Ollama",
        profileLabel: "Local Ollama",
        locationLabel: "Jait backend",
        quotas: [ollamaQuota],
      }),
    ]);
  });
});
