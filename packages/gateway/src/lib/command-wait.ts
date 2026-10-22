/** Agent responsiveness is independent of the command's execution deadline. */
export const DEFAULT_COMMAND_YIELD_MS = 10_000;
export const MAX_COMMAND_YIELD_MS = 30_000;

export function resolveCommandYieldMs(value: unknown, timeoutMs: number): number {
  const requested = typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.ceil(value) : DEFAULT_COMMAND_YIELD_MS;
  return Math.max(1, Math.min(requested, MAX_COMMAND_YIELD_MS, timeoutMs));
}
