import type { ModelUsage, UsageSummary } from "@jait/shared";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function counters(value: unknown, scope: ModelUsage["scope"]): ModelUsage | undefined {
  const r = record(value);
  const inputTokens = count(r.inputTokens ?? r.input_tokens);
  const outputTokens = count(r.outputTokens ?? r.output_tokens);
  if (inputTokens === undefined || outputTokens === undefined) return;
  const cachedInputTokens = count(r.cachedInputTokens ?? r.cached_input_tokens ?? r.cachedReadTokens);
  if (cachedInputTokens !== undefined && cachedInputTokens > inputTokens) return;
  return { inputTokens, outputTokens, scope,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(count(r.totalTokens ?? r.total_tokens) === undefined ? {} : { totalTokens: count(r.totalTokens ?? r.total_tokens) }),
    ...(count(r.requestCount) === undefined ? {} : { requestCount: count(r.requestCount) }),
  };
}

export function parseCodexUsage(params: unknown): ModelUsage | undefined {
  const r = record(params);
  const body = record(r.msg ?? params);
  const usage = record(body.tokenUsage ?? body.info);
  const result = counters(usage.total ?? usage.total_token_usage, "session");
  if (!result) return;
  const last = counters(usage.last ?? usage.last_token_usage, "turn");
  return { ...result, ...(last ? { lastRequest: last } : {}) };
}

/** ACP prompt-response usage counts a whole turn; usage_update.used is context occupancy. */
export function parseAcpUsage(value: unknown, id: string): ModelUsage | undefined {
  const result = counters(value, "turn");
  return result ? { ...result, id } : undefined;
}

/** Dedupe cumulative notifications and keep unrelated prior turns out of this turn's cost. */
export class TurnUsageAccumulator {
  private previous?: ModelUsage;
  private accumulated?: ModelUsage;
  private turns = new Map<string, ModelUsage>();
  constructor(baseline?: ModelUsage, private freshSession = false) { this.previous = baseline; }
  get baseline() { return this.previous; }

  add(usage: ModelUsage): void {
    if (usage.scope === "turn") {
      this.turns.set(usage.id ?? "turn", usage);
      return;
    }
    const previous = this.previous;
    if (previous && (usage.inputTokens < previous.inputTokens || usage.outputTokens < previous.outputTokens)) return;
    if (previous && usage.inputTokens === previous.inputTokens && usage.outputTokens === previous.outputTokens) return;
    this.previous = usage;
    const delta = previous ? {
      inputTokens: usage.inputTokens - previous.inputTokens,
      outputTokens: usage.outputTokens - previous.outputTokens,
      ...(usage.cachedInputTokens !== undefined && previous.cachedInputTokens !== undefined
        ? { cachedInputTokens: Math.max(0, usage.cachedInputTokens - previous.cachedInputTokens) } : {}),
      ...(usage.requestCount !== undefined && previous.requestCount !== undefined
        ? { requestCount: Math.max(0, usage.requestCount - previous.requestCount) } : {}),
    } : this.freshSession ? usage : usage.lastRequest;
    if (!delta) return; // Unknown resumed-session baseline: do not charge the lifetime total.
    this.accumulated = this.sum([...(this.accumulated ? [this.accumulated] : []), { ...delta, scope: "turn" }]);
  }
  private sum(values: ModelUsage[]): ModelUsage {
    return {
      scope: "turn",
      inputTokens: values.reduce((n, v) => n + v.inputTokens, 0),
      outputTokens: values.reduce((n, v) => n + v.outputTokens, 0),
      ...(values.every(v => v.cachedInputTokens !== undefined)
        ? { cachedInputTokens: values.reduce((n, v) => n + v.cachedInputTokens!, 0) } : {}),
      ...(values.every(v => v.requestCount !== undefined)
        ? { requestCount: values.reduce((n, v) => n + v.requestCount!, 0) } : {}),
    };
  }
  metrics(durationMs: number): UsageSummary | undefined {
    const values = this.turns.size ? [...this.turns.values()] : this.accumulated ? [this.accumulated] : [];
    if (!values.length) return;
    const total = this.sum(values);
    return { durationMs, promptTokens: total.inputTokens, completionTokens: total.outputTokens,
      totalTokens: total.inputTokens + total.outputTokens, tokenUsageEstimated: false,
      ...(total.cachedInputTokens === undefined ? {} : { cachedPromptTokens: total.cachedInputTokens }),
      ...(total.requestCount === undefined ? {} : { requestCount: total.requestCount }),
    };
  }
}

/** Retain complete accounting when verbose trace rounds are dropped. */
export function summarizeUsage(rounds: Array<{ metrics?: UsageSummary }>): UsageSummary | undefined {
  const values = rounds.flatMap(r => r.metrics ? [r.metrics] : []);
  if (!values.length) return;
  return {
    durationMs: values.reduce((sum, m) => sum + m.durationMs, 0),
    promptTokens: values.reduce((sum, m) => sum + (m.promptTokens ?? 0), 0),
    completionTokens: values.reduce((sum, m) => sum + (m.completionTokens ?? 0), 0),
    totalTokens: values.reduce((sum, m) => sum + (m.totalTokens ?? (m.promptTokens ?? 0) + (m.completionTokens ?? 0)), 0),
    tokenUsageEstimated: values.some(m => m.tokenUsageEstimated),
    ...(values.every(m => m.cachedPromptTokens !== undefined) ? { cachedPromptTokens: values.reduce((sum, m) => sum + m.cachedPromptTokens!, 0) } : {}),
    ...(values.every(m => m.requestCount !== undefined) ? { requestCount: values.reduce((sum, m) => sum + m.requestCount!, 0) } : {}),
  };
}
