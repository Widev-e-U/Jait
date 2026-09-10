/** Provider-account subscription usage shown by the avatar Usage modal. */

import type { ProviderUsageSnapshot } from "./provider-usage.js";

export interface UsageProfile {
  id: string;
  providerType: string;
  providerLabel: string;
  profileLabel: string;
  locationLabel: string;
  quotas: ProviderUsageSnapshot[];
  error: string | null;
}

export interface UsageSummaryPayload {
  generatedAt: string;
  profiles: UsageProfile[];
}

export function summarizeProviderUsage(
  accounts: Array<{
    id: string;
    providerType: string;
    label: string;
    nodeId: string;
  }>,
  quotas: ProviderUsageSnapshot[],
  options: {
    jaitBackendProfiles?: Array<{
      id: string;
      providerType: string;
      providerLabel: string;
      profileLabel: string;
      quotaAccountId: string;
    }>;
    quotaErrors?: Record<string, string>;
  } = {},
): UsageSummaryPayload {
  const quotaErrors = options.quotaErrors ?? {};
  const profiles: UsageProfile[] = accounts.map((account) => ({
    id: account.id,
    providerType: account.providerType,
    providerLabel:
      account.providerType === "claude-code"
        ? "Claude Code"
        : account.providerType === "codex"
          ? "Codex"
          : account.providerType,
    profileLabel: account.label,
    locationLabel: account.nodeId === "gateway" ? "Gateway profile" : "Remote profile",
    quotas: quotas.filter((quota) => quota.accountId === account.id),
    error: quotaErrors[account.id] ?? null,
  }));

  for (const backend of options.jaitBackendProfiles ?? []) {
    profiles.push({
      id: backend.id,
      providerType: backend.providerType,
      providerLabel: backend.providerLabel,
      profileLabel: backend.profileLabel,
      locationLabel: "Jait backend",
      quotas: quotas.filter((quota) => quota.accountId === backend.quotaAccountId),
      error: quotaErrors[backend.quotaAccountId] ?? null,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    profiles,
  };
}
