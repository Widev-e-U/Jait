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

/** Read the Ollama Cloud quota. The endpoint currently requires an Ollama API key. */
export async function fetchOllamaUsage(apiKey: string, timeoutMs = 10_000): Promise<OllamaUsageResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();
  try {
    const response = await fetch("https://ollama.com/api/usage", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Ollama usage request failed (${response.status})`);
    const body = (await response.json()) as unknown;
    if (!isOllamaUsageResponse(body)) throw new Error("Ollama returned an unexpected usage response");
    return body;
  } finally {
    clearTimeout(timer);
  }
}
