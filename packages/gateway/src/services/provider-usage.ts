/**
 * Provider usage — subscription rate-limit tracking.
 *
 * Claude Code's ACP wrapper (@agentclientprotocol/claude-agent-acp) forwards
 * real subscription quota data (five-hour session limit, seven-day weekly
 * limit, etc.) inside `usage_update` events at
 * `update._meta["_claude/rateLimit"]`, typed as the Claude Agent SDK's
 * `SDKRateLimitInfo`. This service persists the latest snapshot per
 * (account, rate-limit type) and fires a one-time warning notification when
 * utilization crosses a threshold, so it doesn't re-notify on every event.
 *
 * Codex snapshots are read on demand through its app server, and Ollama Cloud
 * snapshots are read from its authenticated usage endpoint.
 */

import { and, eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { providerUsage } from "../db/schema.js";
import type { NotificationService } from "./notifications.js";
import type { CodexRateLimitsResponse, OllamaUsageResponse } from "./provider-quota-fetchers.js";

/** Mirrors the Claude Agent SDK's `SDKRateLimitInfo` (see @anthropic-ai/claude-agent-sdk). */
export interface ClaudeRateLimitInfo {
  status: "allowed" | "allowed_warning" | "rejected";
  resetsAt?: number;
  rateLimitType?: "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet" | "seven_day_overage_included" | "overage";
  utilization?: number;
  isUsingOverage?: boolean;
  [key: string]: unknown;
}

export interface ProviderUsageSnapshot {
  accountId: string;
  rateLimitType: string;
  providerType: string;
  status: string | null;
  utilization: number | null;
  resetsAt: string | null;
  isUsingOverage: boolean;
  updatedAt: string;
  planType: string | null;
  windowDurationMins: number | null;
  credits: {
    hasCredits?: boolean;
    unlimited?: boolean;
    balance?: string | null;
  } | null;
  models: Array<{ name: string; requestCount: number }>;
  activityCost: string | null;
}

const WARNING_THRESHOLD = 0.9;

function labelForRateLimitType(type: string): string {
  switch (type) {
    case "five_hour":
      return "session limit";
    case "seven_day":
      return "weekly limit";
    case "seven_day_opus":
      return "Opus weekly limit";
    case "seven_day_sonnet":
      return "Sonnet weekly limit";
    case "overage":
      return "extra usage";
    default:
      return type;
  }
}

export class ProviderUsageService {
  private notifications: NotificationService | undefined;
  /** Tracks which (accountId, rateLimitType) pairs already crossed the warning threshold, to avoid re-notifying on every event until it resets. */
  private readonly warned = new Set<string>();

  constructor(private readonly db: JaitDB) {}

  attachNotifications(notifications: NotificationService): void {
    this.notifications = notifications;
  }

  recordClaudeRateLimit(accountId: string, providerType: string, info: ClaudeRateLimitInfo): void {
    const rateLimitType = info.rateLimitType ?? "unknown";
    const updatedAt = new Date().toISOString();
    const resetsAt = typeof info.resetsAt === "number" ? new Date(info.resetsAt * 1000).toISOString() : null;
    const utilization = typeof info.utilization === "number" ? info.utilization : null;
    const warnKey = `${accountId}:${rateLimitType}`;

    const existing = this.db
      .select()
      .from(providerUsage)
      .where(and(eq(providerUsage.accountId, accountId), eq(providerUsage.rateLimitType, rateLimitType)))
      .get();

    const row = {
      accountId,
      rateLimitType,
      providerType,
      status: info.status,
      utilization,
      resetsAt,
      isUsingOverage: info.isUsingOverage ? 1 : 0,
      rawJson: JSON.stringify(info),
      updatedAt,
    };
    if (existing) {
      this.db
        .update(providerUsage)
        .set(row)
        .where(and(eq(providerUsage.accountId, accountId), eq(providerUsage.rateLimitType, rateLimitType)))
        .run();
    } else {
      this.db.insert(providerUsage).values(row).run();
    }

    const isNearLimit = info.status === "allowed_warning" || info.status === "rejected" || (utilization !== null && utilization >= WARNING_THRESHOLD);
    if (isNearLimit && !this.warned.has(warnKey)) {
      this.warned.add(warnKey);
      const label = labelForRateLimitType(rateLimitType);
      const detail = utilization !== null ? `at ${Math.round(utilization * 100)}%` : "near its limit";
      this.notifications?.warning("Approaching usage limit", `Claude Code's ${label} is ${detail}.`, "/settings?tab=usage");
    } else if (!isNearLimit && this.warned.has(warnKey)) {
      this.warned.delete(warnKey);
    }
  }

  recordCodexRateLimits(accountId: string, response: CodexRateLimitsResponse): void {
    const { rateLimits } = response;
    const windows = [
      ["primary", rateLimits.primary],
      ["secondary", rateLimits.secondary],
    ] as const;
    for (const [fallbackType, window] of windows) {
      if (!window) continue;
      const rateLimitType = window.windowDurationMins === 300 ? "five_hour" : window.windowDurationMins === 10_080 ? "seven_day" : fallbackType;
      const utilization = Math.min(1, Math.max(0, window.usedPercent / 100));
      this.recordSnapshot({
        accountId,
        rateLimitType,
        providerType: "codex",
        status: utilization >= 1 ? "rejected" : utilization >= WARNING_THRESHOLD ? "allowed_warning" : "allowed",
        utilization,
        resetsAt: typeof window.resetsAt === "number" ? new Date(window.resetsAt * 1000).toISOString() : null,
        isUsingOverage: false,
        raw: {
          planType: rateLimits.planType ?? null,
          windowDurationMins: window.windowDurationMins,
          credits: rateLimits.credits ?? null,
          rateLimitReachedType: rateLimits.rateLimitReachedType ?? null,
          spendControlReached: rateLimits.spendControlReached ?? null,
        },
      });
    }
  }

  recordOllamaUsage(accountId: string, response: OllamaUsageResponse, planType?: string | null): void {
    const buckets = [
      ["five_hour", response.limits.session, 300],
      ["seven_day", response.limits.weekly, 10_080],
      ["monthly", response.limits.monthly, 43_200],
    ] as const;
    for (const [rateLimitType, limit, windowDurationMins] of buckets) {
      if (!limit) continue;
      const utilization = Math.min(1, Math.max(0, limit.usage));
      this.recordSnapshot({
        accountId,
        rateLimitType,
        providerType: "ollama",
        status: utilization >= 1 ? "rejected" : utilization >= WARNING_THRESHOLD ? "allowed_warning" : "allowed",
        utilization,
        resetsAt: response.activity?.period?.ending_at ?? null,
        isUsingOverage: false,
        raw: {
          planType: planType ?? null,
          windowDurationMins,
          models: limit.models.map((model) => ({
            name: model.name,
            requestCount: model.request_count,
          })),
          activityCost: response.activity?.cost ?? null,
        },
      });
    }
  }

  private recordSnapshot(input: {
    accountId: string;
    rateLimitType: string;
    providerType: string;
    status: string | null;
    utilization: number | null;
    resetsAt: string | null;
    isUsingOverage: boolean;
    raw: Record<string, unknown>;
  }): void {
    const updatedAt = new Date().toISOString();
    const existing = this.db
      .select()
      .from(providerUsage)
      .where(and(eq(providerUsage.accountId, input.accountId), eq(providerUsage.rateLimitType, input.rateLimitType)))
      .get();
    const row = {
      accountId: input.accountId,
      rateLimitType: input.rateLimitType,
      providerType: input.providerType,
      status: input.status,
      utilization: input.utilization,
      resetsAt: input.resetsAt,
      isUsingOverage: input.isUsingOverage ? 1 : 0,
      rawJson: JSON.stringify(input.raw),
      updatedAt,
    };
    if (existing) {
      this.db
        .update(providerUsage)
        .set(row)
        .where(and(eq(providerUsage.accountId, input.accountId), eq(providerUsage.rateLimitType, input.rateLimitType)))
        .run();
    } else {
      this.db.insert(providerUsage).values(row).run();
    }
  }

  listForUser(accountIds: string[]): ProviderUsageSnapshot[] {
    if (accountIds.length === 0) return [];
    return this.db
      .select()
      .from(providerUsage)
      .all()
      .filter((row) => accountIds.includes(row.accountId))
      .map((row) => {
        let raw: Record<string, unknown> = {};
        try {
          raw = JSON.parse(row.rawJson) as Record<string, unknown>;
        } catch {
          /* old snapshot */
        }
        const credits = raw.credits && typeof raw.credits === "object" ? (raw.credits as ProviderUsageSnapshot["credits"]) : null;
        const models = Array.isArray(raw.models)
          ? raw.models.filter(
              (model): model is { name: string; requestCount: number } =>
                !!model &&
                typeof model === "object" &&
                typeof (model as { name?: unknown }).name === "string" &&
                typeof (model as { requestCount?: unknown }).requestCount === "number",
            )
          : [];
        return {
          accountId: row.accountId,
          rateLimitType: row.rateLimitType,
          providerType: row.providerType,
          status: row.status,
          utilization: row.utilization,
          resetsAt: row.resetsAt,
          isUsingOverage: !!row.isUsingOverage,
          updatedAt: row.updatedAt,
          planType: typeof raw.planType === "string" ? raw.planType : null,
          windowDurationMins: typeof raw.windowDurationMins === "number" ? raw.windowDurationMins : null,
          credits,
          models,
          activityCost: typeof raw.activityCost === "string" ? raw.activityCost : null,
        };
      });
  }
}
