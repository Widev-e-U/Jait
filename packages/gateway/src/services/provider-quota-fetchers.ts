import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface CodexRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface CodexRateLimitSnapshot {
  primary?: CodexRateLimitWindow | null;
  secondary?: CodexRateLimitWindow | null;
  credits?: {
    hasCredits?: boolean;
    unlimited?: boolean;
    balance?: string | null;
  } | null;
  planType?: string | null;
  rateLimitReachedType?: string | null;
  spendControlReached?: boolean | null;
}

/**
 * One "reset button": a free rate-limit reset the provider granted (Codex
 * hands these out periodically, e.g. "Full reset (Weekly + 5 hr)").
 */
export interface CodexRateLimitResetCredit {
  id?: string | null;
  resetType?: string | null;
  status?: string | null;
  grantedAt?: number | null;
  expiresAt?: number | null;
  title?: string | null;
  description?: string | null;
}

export interface CodexRateLimitResetCredits {
  availableCount?: number | null;
  credits?: CodexRateLimitResetCredit[] | null;
}

export interface CodexRateLimitsResponse {
  rateLimits: CodexRateLimitSnapshot;
  /** False when the account itself is out of usage (for example exhausted workspace credits). */
  ordinaryUsageAllowed?: boolean | null;
  /** Per-limit snapshots keyed by limit id, for accounts with several limits. */
  rateLimitsByLimitId?: Record<string, CodexRateLimitSnapshot> | null;
  /** Unused "reset usage" credits the account can spend to clear its limits now. */
  rateLimitResetCredits?: CodexRateLimitResetCredits | null;
}

export interface OllamaUsageLimit {
  resetsAt?: string | null;
  usage: number;
  models: Array<{ name: string; request_count: number }>;
}

export interface OllamaQuotaUsageResponse {
  source?: "settings" | "balance";
  purchasedBalance?: number;
  includedBalance?: number;
  includedAllowance?: number;
  limits: {
    session?: OllamaUsageLimit;
    weekly?: OllamaUsageLimit;
    monthly?: OllamaUsageLimit;
  };
  activity?: {
    cost?: string;
    period?: { type?: string; starting_at?: string; ending_at?: string };
  };
}

/** Convert Ollama's balance response without inferring missing values. */
export function parseOllamaBalance(value: unknown): OllamaQuotaUsageResponse {
  if (!value || typeof value !== "object") throw new Error("Ollama returned an unexpected balance response");
  const body = value as any;
  const included = body.included;
  const limits: OllamaQuotaUsageResponse["limits"] = {};
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (included && finite(included.allowance_usd) && included.allowance_usd > 0 && finite(included.balance_usd)) {
    const reset = included.period?.until;
    if (typeof reset !== "string" || !Number.isFinite(Date.parse(reset))) throw new Error("Ollama returned an invalid balance period");
    limits.monthly = { usage: Math.max(0, Math.min(1, 1 - included.balance_usd / included.allowance_usd)), models: [], resetsAt: new Date(reset).toISOString() };
  }
  for (const name of ["session", "weekly"] as const) {
    const bucket = included?.[name];
    if (bucket && finite(bucket.remaining_percent) && bucket.remaining_percent <= 100 && typeof bucket.resets_at === "string" && Number.isFinite(Date.parse(bucket.resets_at))) {
      limits[name] = { usage: 1 - bucket.remaining_percent / 100, models: [], resetsAt: new Date(bucket.resets_at).toISOString() };
    }
  }
  if (!Object.keys(limits).length) throw new Error("Ollama returned an unexpected balance response");
  return { source: "balance", limits,
    ...(finite(included?.balance_usd) ? { includedBalance: included.balance_usd } : {}),
    ...(finite(included?.allowance_usd) ? { includedAllowance: included.allowance_usd } : {}),
    ...(finite(body.purchased?.balance_usd) ? { purchasedBalance: body.purchased.balance_usd } : {}),
  };
}

/** Request activity contains counts, not subscription quota utilization. */
export interface OllamaRequestUsageResponse {
  range: string;
  scope: string;
  granularity: string;
  from: string;
  until: string;
  totals: { request_count: number };
  buckets: Array<{ from: string; until: string; request_count: number; partial?: boolean }>;
}

export type OllamaUsageResponse = OllamaQuotaUsageResponse | OllamaRequestUsageResponse;

/** The signed-in Ollama Cloud account reported by a server's `/api/me`. */
export interface OllamaCloudAccount {
  email: string | null;
  name: string | null;
  plan: string | null;
}

export interface OllamaAccountProbe {
  /** Whether the Ollama server answered the `/api/me` request at all (false = offline/timeout). */
  reachable: boolean;
  /** The signed-in Ollama Cloud account, or null when the server has no usable credentials. */
  account: OllamaCloudAccount | null;
}

/** Usage fetch failure that keeps the HTTP status, so callers can explain the cause. */
export class OllamaUsageError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "OllamaUsageError";
  }
}

function isRateLimitWindow(value: unknown): value is CodexRateLimitWindow {
  if (!value || typeof value !== "object") return false;
  const window = value as Record<string, unknown>;
  return (
    typeof window.usedPercent === "number" &&
    (window.windowDurationMins == null || typeof window.windowDurationMins === "number") &&
    (window.resetsAt == null || typeof window.resetsAt === "number")
  );
}

function isCodexRateLimitSnapshot(value: unknown): value is CodexRateLimitSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (snapshot.primary == null || isRateLimitWindow(snapshot.primary)) && (snapshot.secondary == null || isRateLimitWindow(snapshot.secondary));
}

function isCodexRateLimitResetCredit(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const credit = value as Record<string, unknown>;
  return (
    (credit.grantedAt == null || typeof credit.grantedAt === "number") &&
    (credit.expiresAt == null || typeof credit.expiresAt === "number")
  );
}

function isCodexRateLimitResetCredits(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const resetCredits = value as Record<string, unknown>;
  return (
    (resetCredits.availableCount == null || typeof resetCredits.availableCount === "number") &&
    (resetCredits.credits == null ||
      (Array.isArray(resetCredits.credits) && resetCredits.credits.every(isCodexRateLimitResetCredit)))
  );
}

export function isCodexRateLimitsResponse(value: unknown): value is CodexRateLimitsResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  if (!isCodexRateLimitSnapshot(response.rateLimits)) return false;
  // Newer Codex builds add account-level exhaustion flags and per-limit
  // snapshots. They must not be rejected as an unexpected response.
  if (response.ordinaryUsageAllowed != null && typeof response.ordinaryUsageAllowed !== "boolean") return false;
  if (response.rateLimitResetCredits != null && !isCodexRateLimitResetCredits(response.rateLimitResetCredits)) return false;
  const byLimitId = response.rateLimitsByLimitId;
  if (byLimitId != null) {
    if (typeof byLimitId !== "object") return false;
    if (!Object.values(byLimitId as Record<string, unknown>).every(isCodexRateLimitSnapshot)) return false;
  }
  return true;
}

/** Some Codex builds only populate `rateLimitsByLimitId`; promote the best snapshot. */
export function normalizeCodexRateLimits(response: CodexRateLimitsResponse): CodexRateLimitsResponse {
  const { rateLimits } = response;
  if (rateLimits.primary || rateLimits.secondary) return response;
  const byLimitId = response.rateLimitsByLimitId ?? {};
  const snapshot = [byLimitId.codex, ...Object.values(byLimitId)]
    .find((candidate) => candidate?.primary || candidate?.secondary);
  if (!snapshot) return response;
  return {
    ...response,
    rateLimits: {
      ...rateLimits,
      ...snapshot,
      // Root-level account flags are authoritative when both are present.
      planType: rateLimits.planType ?? snapshot.planType,
      credits: rateLimits.credits ?? snapshot.credits,
      rateLimitReachedType: rateLimits.rateLimitReachedType ?? snapshot.rateLimitReachedType,
      spendControlReached: rateLimits.spendControlReached ?? snapshot.spendControlReached,
    },
  };
}

/** Read ChatGPT/Codex subscription windows without starting a model turn. */
export function fetchCodexRateLimits(accountHome: string, options: { command?: string; timeoutMs?: number } = {}): Promise<CodexRateLimitsResponse> {
  const command = options.command ?? "codex";
  const timeoutMs = options.timeoutMs ?? 12_000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, ["app-server", "--stdio"], {
      env: {
        ...process.env,
        HOME: accountHome,
        CODEX_HOME: accountHome,
        OPENAI_API_KEY: "",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = createInterface({ input: child.stdout });
    let stderr = "";
    let settled = false;

    const finish = (error?: Error, result?: CodexRateLimitsResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      if (!child.killed) child.kill();
      if (error) reject(error);
      else resolve(result!);
    };

    const timer = setTimeout(() => finish(new Error("Codex usage request timed out")), timeoutMs);
    timer.unref();
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 2_000) stderr += String(chunk);
    });
    child.on("error", (error) => finish(error));
    child.on("exit", (code) => {
      if (!settled) finish(new Error(stderr.trim() || `Codex app server exited with code ${code ?? "unknown"}`));
    });
    lines.on("line", (line) => {
      let message: {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      try {
        message = JSON.parse(line) as typeof message;
      } catch {
        return;
      }
      if (message.id === 1) {
        child.stdin.write(`${JSON.stringify({ id: 2, method: "account/rateLimits/read", params: {} })}\n`);
      } else if (message.id === 2) {
        if (message.error) finish(new Error(message.error.message || "Codex usage request failed"));
        else if (isCodexRateLimitsResponse(message.result)) finish(undefined, normalizeCodexRateLimits(message.result));
        else finish(new Error("Codex returned an unexpected usage response"));
      }
    });

    child.stdin.write(
      `${JSON.stringify({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "jait", version: "1.0.0" },
          capabilities: { experimentalApi: true },
        },
      })}\n`,
    );
  });
}

function isOllamaUsageLimit(value: unknown): value is OllamaUsageLimit {
  if (!value || typeof value !== "object") return false;
  const limit = value as Record<string, unknown>;
  return typeof limit.usage === "number" && Array.isArray(limit.models);
}

export function isOllamaQuotaUsageResponse(value: unknown): value is OllamaQuotaUsageResponse {
  if (!value || typeof value !== "object") return false;
  const limits = (value as { limits?: unknown }).limits;
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) return false;
  const record = limits as Record<string, unknown>;
  const buckets = [record.session, record.weekly, record.monthly];
  return buckets.some(isOllamaUsageLimit) && buckets.every((bucket) => bucket === undefined || isOllamaUsageLimit(bucket));
}

export function isOllamaUsageResponse(value: unknown): value is OllamaUsageResponse {
  if (!value || typeof value !== "object") return false;
  if (isOllamaQuotaUsageResponse(value)) return true;
  const activity = value as Partial<OllamaRequestUsageResponse>;
  if ("totals" in activity) {
    const validDate = (date: unknown): date is string => typeof date === "string" && Number.isFinite(Date.parse(date));
    const validCount = (count: unknown): count is number => typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
    return typeof activity.range === "string" && typeof activity.scope === "string" &&
      typeof activity.granularity === "string" && validDate(activity.from) && validDate(activity.until) &&
      Date.parse(activity.from) <= Date.parse(activity.until) && validCount(activity.totals?.request_count) &&
      Array.isArray(activity.buckets) && activity.buckets.every((bucket) =>
        !!bucket && validDate(bucket.from) && validDate(bucket.until) &&
        Date.parse(bucket.from) <= Date.parse(bucket.until) && validCount(bucket.request_count) &&
        (bucket.partial === undefined || typeof bucket.partial === "boolean"));
  }
  return false;
}

/**
 * Read the Ollama quota from any Ollama server's `/api/usage`.
 *
 * Some proxies expose usage without an API key. Standard local Ollama daemons
 * return 404; device authentication is handled by ollama-device-auth.ts.
 */
export async function fetchOllamaUsageFrom(
  baseUrl: string,
  apiKey?: string,
  timeoutMs = 10_000,
): Promise<OllamaUsageResponse> {
  const base = (baseUrl.trim() || "https://ollama.com").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();
  try {
    const response = await fetch(`${base}/api/usage`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new OllamaUsageError(`Ollama usage request failed (${response.status})`, response.status);
    }
    const body = (await response.json()) as unknown;
    if (!isOllamaUsageResponse(body)) throw new Error("Ollama returned an unexpected usage response");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Read the Ollama Cloud quota. The endpoint requires an Ollama Cloud API key. */
export async function fetchOllamaUsage(apiKey: string, timeoutMs = 10_000): Promise<OllamaUsageResponse> {
  return fetchOllamaUsageFrom("https://ollama.com", apiKey, timeoutMs);
}

/**
 * Ask an Ollama server who it is signed in as (`/api/me`).
 *
 * Used for diagnostics: a self-hosted daemon that ran `ollama signin` can report
 * the Ollama Cloud account even though it cannot serve cloud quota buckets, and
 * a valid Cloud API key confirms the account behind a quota request. The probe
 * never throws — unreachable servers and rejected credentials are answers, not
 * errors.
 */
export async function probeOllamaAccount(
  options: { baseUrl?: string; apiKey?: string; timeoutMs?: number } = {},
): Promise<OllamaAccountProbe> {
  const baseUrl = (options.baseUrl?.trim() || "https://ollama.com").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4_000);
  timer.unref();
  try {
    const response = await fetch(`${baseUrl}/api/me`, {
      method: "POST",
      headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : undefined,
      signal: controller.signal,
    });
    if (!response.ok) return { reachable: true, account: null };
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== "object") return { reachable: true, account: null };
    const record = body as Record<string, unknown>;
    return {
      reachable: true,
      account: {
        email: typeof (record.email ?? record.Email) === "string" ? (record.email ?? record.Email) as string : null,
        name: typeof (record.name ?? record.Name) === "string" ? (record.name ?? record.Name) as string : null,
        plan: typeof (record.plan ?? record.Plan) === "string" ? (record.plan ?? record.Plan) as string : null,
      },
    };
  } catch {
    return { reachable: false, account: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Explain why an Ollama backend has no subscription-usage buckets.
 *
 * Kept separate from the route so each distinct cause — offline server, missing
 * Cloud key, or a signed-in daemon that simply does not expose `/api/usage` —
 * is unit-tested rather than inferred from a shared failure string.
 */
export function describeOllamaUsageGap(options: {
  baseUrl: string;
  cloud: boolean;
  probe: OllamaAccountProbe;
}): string {
  const { baseUrl, cloud, probe } = options;
  if (!probe.reachable) {
    return `Ollama at ${baseUrl} did not respond. Subscription usage needs a running server.`;
  }
  if (cloud) {
    return "Add an Ollama Cloud API key to this Jait backend to load subscription usage.";
  }
  const signedInAs = probe.account?.email ?? probe.account?.name ?? null;
  if (signedInAs) {
    const planSuffix = probe.account?.plan ? ` (${probe.account.plan})` : "";
    return `Signed in to Ollama Cloud as ${signedInAs}${planSuffix}, but this Ollama server does not report subscription usage. Add an Ollama Cloud API key to see quota.`;
  }
  return "This Ollama instance is not signed in to Ollama Cloud, so there is no subscription usage to report.";
}
