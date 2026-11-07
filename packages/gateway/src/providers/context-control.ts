import { compactionPlan, contextBudget } from "../services/context-budget.js";

export interface ProviderContextState {
  usedTokens?: number; contextWindow?: number; commands?: string[]; lastAttempt?: number; compacting?: boolean; failures?: number; retryAfter?: number;
}
/** Never synthesize a /compact user prompt unless the provider advertises it. */
export function nativeCompactionCommand(commands: string[] = []): string | undefined {
  const name = ["compact", "compress"].find(candidate => commands.includes(candidate));
  return name ? `/${name}` : undefined;
}
export async function compactProviderContext(
  state: ProviderContextState,
  invoke: (command: string) => Promise<void>,
  now = Date.now(),
): Promise<boolean> {
  const command = nativeCompactionCommand(state.commands);
  if (!command || state.compacting || !Number.isSafeInteger(state.usedTokens) || !Number.isSafeInteger(state.contextWindow)) return false;
  if (state.retryAfter !== undefined && now < state.retryAfter) return false;
  const plan = compactionPlan({ tokens: state.usedTokens!, contextWindow: state.contextWindow!, owner: "provider", nativeAvailable: true,
    now, lastAttempt: state.lastAttempt }, contextBudget());
  if (plan.action !== "native") return false;
  state.lastAttempt = now; state.compacting = true;
  try {
    await invoke(command);
    // Await a new provider usage_update; never invent a reduced occupancy.
    state.usedTokens = undefined;
    state.failures = 0; state.retryAfter = undefined;
    return true;
  } catch (error) {
    state.failures = Math.min((state.failures ?? 0) + 1, 6);
    state.retryAfter = Date.now() + Math.min(60_000 * 2 ** (state.failures - 1), 1_800_000);
    throw error;
  } finally { state.compacting = false; }
}
