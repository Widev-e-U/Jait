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

export interface CodexRateLimitsResponse {
  rateLimits: CodexRateLimitSnapshot;
}

export interface OllamaUsageLimit {
  usage: number;
  models: Array<{ name: string; request_count: number }>;
}

export interface OllamaUsageResponse {
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

function isCodexRateLimitsResponse(value: unknown): value is CodexRateLimitsResponse {
  if (!value || typeof value !== "object") return false;
  const rateLimits = (value as { rateLimits?: unknown }).rateLimits;
  if (!rateLimits || typeof rateLimits !== "object") return false;
  const snapshot = rateLimits as Record<string, unknown>;
  return (snapshot.primary == null || isRateLimitWindow(snapshot.primary)) && (snapshot.secondary == null || isRateLimitWindow(snapshot.secondary));
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
        else if (isCodexRateLimitsResponse(message.result)) finish(undefined, message.result);
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

export function isOllamaUsageResponse(value: unknown): value is OllamaUsageResponse {
  if (!value || typeof value !== "object") return false;
  const limits = (value as { limits?: unknown }).limits;
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) return false;
  const record = limits as Record<string, unknown>;
  const buckets = [record.session, record.weekly, record.monthly];
  return buckets.some(isOllamaUsageLimit) && buckets.every((bucket) => bucket === undefined || isOllamaUsageLimit(bucket));
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
