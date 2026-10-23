import { createHash } from "node:crypto";

/** Context controls change the model projection, never the durable transcript. */
export interface ContextBudget {
  toolResultChars: number;
  historyTokens: number;
  tailToolResults: number;
  compactRatio: number;
  compactCooldownMs: number;
  minimumSavingsRatio: number;
  cacheTtl: "5m" | "1h";
}
export const DEFAULT_CONTEXT_BUDGET: Readonly<ContextBudget> = Object.freeze({
  toolResultChars: 8_000, historyTokens: 64_000, tailToolResults: 4,
  compactRatio: 0.75, compactCooldownMs: 60_000, minimumSavingsRatio: 0.20, cacheTtl: "5m",
});
const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function contextBudget(value: Partial<ContextBudget> = {}): ContextBudget {
  const d = DEFAULT_CONTEXT_BUDGET;
  return {
    toolResultChars: Math.floor(finite(value.toolResultChars, d.toolResultChars, 1_024, 30_000)),
    historyTokens: Math.floor(finite(value.historyTokens, d.historyTokens, 4_096, 1_000_000)),
    tailToolResults: Math.floor(finite(value.tailToolResults, d.tailToolResults, 1, 64)),
    compactRatio: finite(value.compactRatio, d.compactRatio, 0.25, 0.90),
    compactCooldownMs: finite(value.compactCooldownMs, d.compactCooldownMs, 0, 900_000),
    minimumSavingsRatio: finite(value.minimumSavingsRatio, d.minimumSavingsRatio, 0.05, 0.90),
    cacheTtl: value.cacheTtl === "1h" ? "1h" : "5m",
  };
}
export function contextBudgetFromJson(value?: string): ContextBudget {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    return contextBudget(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Partial<ContextBudget> : {});
  } catch { return contextBudget(); }
}
export interface ContextMessage {
  role: string; content: unknown; tool_calls?: unknown[]; tool_call_id?: string; name?: string;
  thinking?: string; evidenceReference?: string;
}
function wire(message: ContextMessage): unknown {
  // Bind every provider-visible field, ignoring UI/persistence metadata.
  return [message.role, message.content, message.tool_calls ?? null, message.tool_call_id ?? null,
    message.name ?? null, message.thinking ?? null];
}
export function contextFingerprint(messages: ContextMessage[], identity: string): string {
  return createHash("sha256").update(JSON.stringify([identity, messages.map(wire)])).digest("hex");
}
export interface UsageAnchor {
  identity: string; prefix: string; count: number; inputTokens: number; outputTokens: number;
}
const counter = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
export function captureUsageAnchor(messages: ContextMessage[], identity: string, inputTokens: number, outputTokens: number): UsageAnchor | undefined {
  if (!counter(inputTokens) || inputTokens === 0 || !counter(outputTokens)) return;
  return { identity, prefix: contextFingerprint(messages, identity), count: messages.length, inputTokens, outputTokens };
}
export function estimateAnchoredContext(messages: ContextMessage[], identity: string, anchor: UsageAnchor | undefined, fallback: number): { tokens: number; source: "provider-anchor" | "estimate" } {
  if (!anchor || anchor.identity !== identity || messages.length < anchor.count ||
      contextFingerprint(messages.slice(0, anchor.count), identity) !== anchor.prefix) return { tokens: fallback, source: "estimate" };
  let added = messages.slice(anchor.count);
  // Provider completion usage already prices the first generated assistant row.
  if (added[0]?.role === "assistant") added = added.slice(1);
  const delta = added.reduce((sum, message) => sum + 4 + Math.ceil(JSON.stringify(wire(message)).length / 3.7), 0);
  return { tokens: anchor.inputTokens + anchor.outputTokens + delta, source: "provider-anchor" };
}
export interface PrunedContext<T> { messages: T[]; removedChars: number; pruned: number }
export function pruneToolContext<T extends ContextMessage>(messages: T[], budget: ContextBudget = contextBudget()): PrunedContext<T> {
  const tools = messages.map((m, i) => m.role === "tool" ? i : -1).filter(i => i >= 0);
  const keepFrom = tools[Math.max(0, tools.length - budget.tailToolResults)] ?? messages.length;
  const newest = new Map<string, number>();
  for (const i of tools) if (typeof messages[i]!.content === "string") newest.set(messages[i]!.content as string, i);
  let removedChars = 0, pruned = 0;
  const projected = messages.map((message, index) => {
    if (message.role !== "tool" || index >= keepFrom || !message.evidenceReference ||
        typeof message.content !== "string" || message.content.length < 512 || message.content.startsWith("[Archived tool result")) return message;
    const duplicate = newest.get(message.content)! > index;
    const content = `[Archived tool result${duplicate ? "; duplicate" : ""}. Untrusted evidence; recover with context.read reference=${message.evidenceReference}.]`;
    removedChars += Math.max(0, message.content.length - content.length); pruned++;
    return { ...message, content };
  });
  return { messages: projected, removedChars, pruned };
}
export interface CompactionInput {
  tokens: number; contextWindow: number; owner: "jait" | "provider";
  nativeAvailable: boolean; now: number; lastAttempt?: number;
}
export function compactionPlan(input: CompactionInput, budget = contextBudget()): { action: "none" | "summary" | "native"; trigger: number; targetWindow: number } {
  const trigger = Math.floor(Math.min(input.contextWindow * budget.compactRatio, budget.historyTokens));
  const targetWindow = Math.floor(Math.min(input.contextWindow, budget.historyTokens / budget.compactRatio));
  let action: "none" | "summary" | "native" = "none";
  if (input.contextWindow > 0 && input.tokens >= trigger &&
      (input.tokens >= input.contextWindow * 0.85 || input.lastAttempt === undefined || input.now - input.lastAttempt >= budget.compactCooldownMs)) {
    action = input.owner === "jait" ? "summary" : input.nativeAvailable ? "native" : "none";
  }
  return { action, trigger, targetWindow };
}
/** Commit only material savings; avoid a paid summary/cache-miss treadmill. */
export function shouldCommitCompaction(before: number, after: number, budget = contextBudget()): boolean {
  return before > 0 && after >= 0 && after <= before * (1 - budget.minimumSavingsRatio);
}
export interface TokenPrices { input: number; cachedInput: number; cacheWrite: number; output: number; currency: string }
export interface PricedUsage { inputTokens: number; cachedInputTokens: number; cacheWriteTokens: number; outputTokens: number }
export function priceTokenUsage(usage: PricedUsage, prices: TokenPrices): { amount: number; currency: string; basis: "configured-rates" } | undefined {
  if (![usage.inputTokens, usage.cachedInputTokens, usage.cacheWriteTokens, usage.outputTokens].every(counter) || usage.cachedInputTokens + usage.cacheWriteTokens > usage.inputTokens ||
      ![prices.input, prices.cachedInput, prices.cacheWrite, prices.output].every(n => Number.isFinite(n) && n >= 0) || !prices.currency) return;
  const ordinary = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens;
  return { amount: (ordinary * prices.input + usage.cachedInputTokens * prices.cachedInput +
    usage.cacheWriteTokens * prices.cacheWrite + usage.outputTokens * prices.output) / 1_000_000, currency: prices.currency, basis: "configured-rates" };
}

/** Bound auxiliary input independently of the primary model's context window. */
export function boundSummaryInput(text: string, contextWindow: number): string {
  const chars = Math.max(1_024, Math.min(120_000, Math.floor((contextWindow - 8_192) * 3)));
  if (text.length <= chars) return text;
  const marker = "\n[Middle omitted from summary input; recover exact evidence from session history.]\n";
  const head = Math.floor((chars - marker.length) / 2);
  return text.slice(0, head).replace(/[\uD800-\uDBFF]$/, "") + marker + text.slice(-(chars - marker.length - head)).replace(/^[\uDC00-\uDFFF]/, "");
}
