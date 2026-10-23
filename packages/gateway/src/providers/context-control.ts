import { compactionPlan, contextBudget } from "../services/context-budget.js";

export interface ProviderContextState {
  usedTokens?: number; contextWindow?: number; commands?: string[]; lastAttempt?: number; compacting?: boolean;
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
  const plan = compactionPlan({ tokens: state.usedTokens!, contextWindow: state.contextWindow!, owner: "provider", nativeAvailable: true,
    now, lastAttempt: state.lastAttempt }, contextBudget());
  if (plan.action !== "native") return false;
  state.lastAttempt = now; state.compacting = true;
  try {
    await invoke(command);
    // Await a new provider usage_update; never invent a reduced occupancy.
    state.usedTokens = undefined;
    return true;
  } finally { state.compacting = false; }
}
