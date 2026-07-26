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
 * Codex has no equivalent live event — its rate limits are only obtainable
 * by triggering a real (API-costing) `/status` turn, so it isn't tracked here.
 */

import { and, eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { providerUsage } from "../db/schema.js";
import type { NotificationService } from "./notifications.js";

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
}

const WARNING_THRESHOLD = 0.9;

function labelForRateLimitType(type: string): string {
  switch (type) {
    case "five_hour": return "session limit";
    case "seven_day": return "weekly limit";
    case "seven_day_opus": return "Opus weekly limit";
    case "seven_day_sonnet": return "Sonnet weekly limit";
    case "overage": return "extra usage";
    default: return type;
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

    const existing = this.db.select().from(providerUsage)
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
      this.db.update(providerUsage).set(row)
        .where(and(eq(providerUsage.accountId, accountId), eq(providerUsage.rateLimitType, rateLimitType)))
        .run();
    } else {
      this.db.insert(providerUsage).values(row).run();
    }

    const isNearLimit = info.status === "allowed_warning" || info.status === "rejected" || (utilization !== null && utilization >= WARNING_THRESHOLD);
    if (isNearLimit && !this.warned.has(warnKey)) {
      this.warned.add(warnKey);
      const label = labelForRateLimitType(rateLimitType);
      const pct = utilization !== null ? `${Math.round(utilization * 100)}%` : "near its limit";
      this.notifications?.warning(
        "Approaching usage limit",
        `Claude Code's ${label} is at ${pct}.`,
        "/settings?tab=usage",
      );
    } else if (!isNearLimit && this.warned.has(warnKey)) {
      this.warned.delete(warnKey);
    }
  }

  listForUser(accountIds: string[]): ProviderUsageSnapshot[] {
    if (accountIds.length === 0) return [];
    return this.db.select().from(providerUsage).all()
      .filter((row) => accountIds.includes(row.accountId))
      .map((row) => ({
        accountId: row.accountId,
        rateLimitType: row.rateLimitType,
        providerType: row.providerType,
        status: row.status,
        utilization: row.utilization,
        resetsAt: row.resetsAt,
        isUsingOverage: !!row.isUsingOverage,
        updatedAt: row.updatedAt,
      }));
  }
}
