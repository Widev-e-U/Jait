/** Provider counters. Cached input is included in input, never an additional token charge. */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  totalTokens?: number;
  /** Session counters need a saved baseline; a turn counter is already attributable. */
  scope: "session" | "turn";
  /** Stable ID for updates to one provider turn. */
  id?: string;
  /** Only populated when the provider reports it. */
  requestCount?: number;
  lastRequest?: Omit<ModelUsage, "scope" | "id" | "lastRequest">;
}

export interface UsageSummary {
  durationMs: number;
  promptTokens?: number;
  cachedPromptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  tokenUsageEstimated?: boolean;
  requestCount?: number;
}
