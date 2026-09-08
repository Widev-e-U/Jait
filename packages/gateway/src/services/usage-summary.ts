/**
 * Usage summary — historical request counts per provider.
 *
 * Aggregates how often the user actually *used* each connected provider:
 *
 *   - Chat turns: assistant messages in `messages`, joined to `sessions` to
 *     read `metadata.chat.provider` / `metadata.chat.model`. The provider
 *     value is either a provider type id (`codex`, `claude-code`, `jait`,
 *     `openai`, `pi`) or a provider-account id (`codex-<uuid>`).
 *     Ollama is attributed when the model string references an Ollama model
 *     (`jait://ollama/...` or `ollama/...`), because Ollama models ride the
 *     `jait`/`pi` provider rather than having their own provider id.
 *   - Agent thread runs: `agent_threads.provider_id` rows (same id space).
 *
 * Counts are bucketed into hourly (last 24h), daily (last 30d) and weekly
 * (last 12 weeks) series so the UI can chart weekly/hourly/etc. views.
 */

import type { SqliteDatabase } from "../db/sqlite-shim.js";
import type { ProviderUsageSnapshot } from "./provider-usage.js";

export interface UsageAccountInfo {
  id: string;
  providerType: string;
  label: string;
}

export interface UsageProviderSummary {
  /** Canonical provider type: `codex`, `claude-code`, `ollama`, `jait`, … */
  type: string;
  label: string;
  /** Provider-account id when usage ran through a named account, else null. */
  accountId: string | null;
  accountLabel: string | null;
  /** Assistant chat turns routed through this provider/account. */
  chatRequests: number;
  /** Agent thread runs on this provider/account. */
  threadRuns: number;
  total: number;
  lastUsedAt: string | null;
  /** 24 × 1h request counts, oldest first (last bucket = current hour). */
  hourly: number[];
  /** 30 × 1d request counts, oldest first. */
  daily: number[];
  /** 12 × 7d request counts, oldest first (last bucket = current week). */
  weekly: number[];
}

export interface UsageSummaryPayload {
  generatedAt: string;
  providers: UsageProviderSummary[];
  /** Live subscription quota snapshots (Claude Code rate limits). */
  quotas: ProviderUsageSnapshot[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const ACCOUNT_ID_RE = /^(codex|claude-code|jait|openai|pi)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const LABELS: Record<string, string> = {
  "codex": "Codex",
  "claude-code": "Claude Code",
  "ollama": "Ollama",
  "jait": "Jait",
  "openai": "OpenAI",
  "pi": "Pi",
};

function labelFor(type: string): string {
  return LABELS[type] ?? type;
}

interface RawUsageEvent {
  provider: string | null;
  model: string | null;
  ts: string | null;
}

function isOllamaModel(model: string | null): boolean {
  return typeof model === "string" && model.toLowerCase().includes("ollama");
}

/** Fold a raw event into the per-(type,accountId) aggregation state. */
interface BucketState {
  chatRequests: number;
  threadRuns: number;
  total: number;
  lastUsedAt: string | null;
  hourly: number[];
  daily: number[];
  weekly: number[];
}

function emptyBuckets(): BucketState {
  return {
    chatRequests: 0,
    threadRuns: 0,
    total: 0,
    lastUsedAt: null,
    hourly: Array.from({ length: 24 }, () => 0),
    daily: Array.from({ length: 30 }, () => 0),
    weekly: Array.from({ length: 12 }, () => 0),
  };
}

function addEvent(state: BucketState, tsIso: string | null): void {
  const ts = tsIso ? Date.parse(tsIso) : NaN;
  if (Number.isFinite(ts)) {
    if (state.lastUsedAt === null || ts > Date.parse(state.lastUsedAt)) state.lastUsedAt = new Date(ts).toISOString();
    const age = Date.now() - ts;
    if (age >= 0) {
      if (age < 24 * HOUR_MS) {
        const idx = 23 - Math.floor(age / HOUR_MS);
        state.hourly[idx]! += 1;
      }
      if (age < 30 * DAY_MS) {
        const idx = 29 - Math.floor(age / DAY_MS);
        state.daily[idx]! += 1;
      }
      if (age < 12 * WEEK_MS) {
        const idx = 11 - Math.floor(age / WEEK_MS);
        state.weekly[idx]! += 1;
      }
    }
  }
  state.total += 1;
}

export function summarizeProviderUsage(
  sqlite: SqliteDatabase,
  userId: string,
  accounts: UsageAccountInfo[],
  quotas: ProviderUsageSnapshot[],
): UsageSummaryPayload {
  // Map account ids → account metadata for attribution of account-scoped ids.
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  // Pre-seed connected accounts so they always appear in the modal, even with
  // zero usage recorded so far.
  const states = new Map<string, BucketState & { type: string; accountId: string | null; accountLabel: string | null }>();
  const keyFor = (type: string, accountId: string | null): string => `${type}|${accountId ?? ""}`;
  for (const account of accounts) {
    const type = account.providerType || "unknown";
    states.set(keyFor(type, account.id), {
      ...emptyBuckets(),
      type,
      accountId: account.id,
      accountLabel: account.label,
    });
  }

  const stateFor = (type: string, accountId: string | null, accountLabel: string | null) => {
    const key = keyFor(type, accountId);
    let state = states.get(key);
    if (!state) {
      state = { ...emptyBuckets(), type, accountId, accountLabel };
      states.set(key, state);
    }
    return state;
  };

  // ── Chat turns ──────────────────────────────────────────────────
  const chatRows = sqlite
    .prepare(
      `SELECT json_extract(s.metadata, '$.chat.provider') AS provider,
              json_extract(s.metadata, '$.chat.model')   AS model,
              msg.created_at                             AS ts
         FROM messages msg
         JOIN sessions s ON s.id = msg.session_id
        WHERE msg.role = 'assistant' AND s.user_id = ? AND s.metadata IS NOT NULL`,
    )
    .all(userId) as unknown[];
  for (const row of chatRows as RawUsageEvent[]) {
    const rawProvider = typeof row.provider === "string" && row.provider ? row.provider : "unknown";
    const accountMatch = ACCOUNT_ID_RE.exec(rawProvider);
    const account = accountMatch ? accountsById.get(rawProvider) : undefined;
    let type = account?.providerType ?? (accountMatch ? accountMatch[1]! : rawProvider);
    let accountId = account ? rawProvider : null;
    let accountLabel = account?.label ?? null;
    // Ollama models ride the `jait`/`pi` providers — attribute them to Ollama.
    if (!account && type !== "codex" && type !== "claude-code" && isOllamaModel(row.model)) {
      type = "ollama";
      accountId = null;
      accountLabel = null;
    }
    const state = stateFor(type, accountId, accountLabel);
    addEvent(state, row.ts);
    state.chatRequests += 1;
  }

  // ── Agent thread runs ───────────────────────────────────────────
  const threadRows = sqlite
    .prepare(
      `SELECT provider_id AS provider, created_at AS ts
         FROM agent_threads
        WHERE user_id = ?`,
    )
    .all(userId) as unknown[];
  for (const row of threadRows as RawUsageEvent[]) {
    const rawProvider = typeof row.provider === "string" && row.provider ? row.provider : "unknown";
    const accountMatch = ACCOUNT_ID_RE.exec(rawProvider);
    const account = accountMatch ? accountsById.get(rawProvider) : undefined;
    const type = account?.providerType ?? (accountMatch ? accountMatch[1]! : rawProvider);
    const accountId = account ? rawProvider : null;
    const accountLabel = account?.label ?? null;
    const state = stateFor(type, accountId, accountLabel);
    addEvent(state, row.ts);
    state.threadRuns += 1;
  }

  const providers: UsageProviderSummary[] = [...states.values()]
    .map((state) => ({
      type: state.type,
      label: labelFor(state.type),
      accountId: state.accountId,
      accountLabel: state.accountLabel,
      chatRequests: state.chatRequests,
      threadRuns: state.threadRuns,
      total: state.total,
      lastUsedAt: state.lastUsedAt,
      hourly: state.hourly,
      daily: state.daily,
      weekly: state.weekly,
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  return { generatedAt: new Date().toISOString(), providers, quotas };
}