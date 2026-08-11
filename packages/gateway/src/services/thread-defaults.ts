import type { ProviderId, RuntimeMode } from "../providers/contracts.js";
import type { SessionStateService } from "./session-state.js";
import type { UserService } from "./users.js";

export interface ThreadSelectionDefaults {
  providerId?: ProviderId;
  model?: string;
  reasoningEffort?: string;
  runtimeMode?: RuntimeMode;
}

/**
 * Reasoning-effort values are provider-defined ("high", "xhigh", "max", …), so
 * they're validated by shape rather than against a fixed list. Anything else
 * is dropped instead of being forwarded to a CLI as a bogus option.
 */
export function normalizeReasoningEffort(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(trimmed) ? trimmed : undefined;
}

interface ResolveThreadSelectionDefaultsOptions {
  userId?: string;
  sessionId?: string;
  userService?: UserService;
  sessionState?: SessionStateService;
}

export function resolveThreadSelectionDefaults(
  options: ResolveThreadSelectionDefaultsOptions,
): ThreadSelectionDefaults {
  const userId = options.userId?.trim();
  const providerId = userId && options.userService
    ? options.userService.getSettings(userId).chatProvider
    : undefined;

  const sessionId = options.sessionId?.trim();
  if (!sessionId || !options.sessionState) {
    return { providerId };
  }

  const state = options.sessionState.get(sessionId, [
    "chat.providerRuntimeMode",
    "chat.cliModels",
    "chat.reasoningEffort",
  ]);
  const runtimeMode = state["chat.providerRuntimeMode"] === "full-access" || state["chat.providerRuntimeMode"] === "supervised"
    ? state["chat.providerRuntimeMode"]
    : undefined;

  let model: string | undefined;
  const cliModels = state["chat.cliModels"];
  if (providerId && cliModels && typeof cliModels === "object" && !Array.isArray(cliModels)) {
    const candidate = (cliModels as Record<string, unknown>)[providerId];
    if (typeof candidate === "string" && candidate.trim()) {
      model = candidate.trim();
    }
  }

  return {
    providerId,
    model,
    // A thread spawned from a chat inherits that chat's effort unless the
    // create request names one explicitly.
    reasoningEffort: normalizeReasoningEffort(state["chat.reasoningEffort"]),
    runtimeMode,
  };
}
