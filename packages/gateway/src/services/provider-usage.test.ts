import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase, openDatabase, type JaitDB } from "../db/connection.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import type { NotificationService } from "./notifications.js";
import { ProviderUsageService } from "./provider-usage.js";

let sqlite: SqliteDatabase;
let db: JaitDB;

beforeEach(async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
});

afterEach(() => {
  sqlite.close();
});

function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}

describe("ProviderUsageService", () => {
  it("inserts a new snapshot and lists it back for the owning account", () => {
    const service = new ProviderUsageService(db);
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.4,
      resetsAt: 1_700_000_000,
    });

    const snapshots = service.listForUser(["account-1"]);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      accountId: "account-1",
      rateLimitType: "five_hour",
      providerType: "claude",
      status: "allowed",
      utilization: 0.4,
      isUsingOverage: false,
    });
    expect(snapshots[0].resetsAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it("upserts an existing row instead of duplicating it", () => {
    const service = new ProviderUsageService(db);
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "seven_day",
      utilization: 0.2,
    });
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed_warning",
      rateLimitType: "seven_day",
      utilization: 0.95,
    });

    const snapshots = service.listForUser(["account-1"]);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].status).toBe("allowed_warning");
    expect(snapshots[0].utilization).toBe(0.95);
  });

  it("filters snapshots by the requested account ids", () => {
    const service = new ProviderUsageService(db);
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
    });
    service.recordClaudeRateLimit("account-2", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
    });

    expect(service.listForUser(["account-1"])).toHaveLength(1);
    expect(service.listForUser(["account-1", "account-2"])).toHaveLength(2);
    expect(service.listForUser([])).toHaveLength(0);
  });

  it("warns once when utilization crosses the threshold and does not re-notify", () => {
    const { service: notifications, warning } = makeNotifications();
    const service = new ProviderUsageService(db);
    service.attachNotifications(notifications);

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.95,
    });
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.97,
    });

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith("Approaching usage limit", "Claude Code's session limit is at 95%.", "/settings?tab=usage");
  });

  it("warns on allowed_warning status even without a utilization number", () => {
    const { service: notifications, warning } = makeNotifications();
    const service = new ProviderUsageService(db);
    service.attachNotifications(notifications);

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed_warning",
      rateLimitType: "seven_day",
    });

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith("Approaching usage limit", "Claude Code's weekly limit is near its limit.", "/settings?tab=usage");
  });

  it("clears the warned state once utilization drops back below the threshold", () => {
    const { service: notifications, warning } = makeNotifications();
    const service = new ProviderUsageService(db);
    service.attachNotifications(notifications);

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.95,
    });
    expect(warning).toHaveBeenCalledTimes(1);

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.3,
    });
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.96,
    });
    expect(warning).toHaveBeenCalledTimes(2);
  });

  it("does not warn while utilization stays below the threshold", () => {
    const { service: notifications, warning } = makeNotifications();
    const service = new ProviderUsageService(db);
    service.attachNotifications(notifications);

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.5,
    });

    expect(warning).not.toHaveBeenCalled();
  });

  it("stores Codex session and weekly subscription windows", () => {
    const service = new ProviderUsageService(db);
    service.recordCodexRateLimits("codex-account", {
      rateLimits: {
        primary: {
          usedPercent: 12,
          windowDurationMins: 300,
          resetsAt: 1_700_000_000,
        },
        secondary: {
          usedPercent: 34,
          windowDurationMins: 10_080,
          resetsAt: 1_700_100_000,
        },
        planType: "plus",
        credits: { hasCredits: true, balance: "7.50" },
      },
    });

    const snapshots = service.listForUser(["codex-account"]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rateLimitType: "five_hour",
          utilization: 0.12,
          planType: "plus",
        }),
        expect.objectContaining({
          rateLimitType: "seven_day",
          utilization: 0.34,
          credits: { hasCredits: true, balance: "7.50" },
        }),
      ]),
    );
  });

  it("stores Ollama session, weekly and monthly usage metadata", () => {
    const service = new ProviderUsageService(db);
    service.recordOllamaUsage(
      "ollama",
      {
        limits: {
          session: {
            usage: 0.25,
            models: [{ name: "gpt-oss", request_count: 4 }],
          },
          monthly: { usage: 0.6, models: [] },
        },
        activity: {
          cost: "3.20",
          period: { ending_at: "2026-10-01T00:00:00.000Z" },
        },
      },
      "pro",
    );

    const snapshots = service.listForUser(["ollama"]);
    expect(snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rateLimitType: "five_hour",
          providerType: "ollama",
          utilization: 0.25,
          planType: "pro",
          models: [{ name: "gpt-oss", requestCount: 4 }],
        }),
        expect.objectContaining({
          rateLimitType: "monthly",
          utilization: 0.6,
          activityCost: "3.20",
        }),
      ]),
    );
  });
});
