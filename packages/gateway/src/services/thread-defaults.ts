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
  /** Unused for selection; kept so callers can pass their existing context. */
  userId?: string;
  sessionId?: string;
  /** Unused for selection; kept so callers can pass their existing context. */
  userService?: UserService;
  sessionState?: SessionStateService;
}

/**
 * Resolve the provider/model a chat-spawned thread must run on.
 *
 * Only the selection the user recorded on the *origin chat* is ever returned
 * (`chat.provider` + `chat.cliModels[provider]`). The account-level default
 * provider and any model remembered for another provider are deliberately not
 * consulted: substituting them is exactly how a chat running on one provider
 * silently handed its spawned threads to a different provider and model.
 *
 * A missing value is reported as missing. Callers must stop and let the user
 * choose; they must never guess.
 */
export function resolveThreadSelectionDefaults(
  options: ResolveThreadSelectionDefaultsOptions,
): ThreadSelectionDefaults {
  const sessionId = options.sessionId?.trim();
  if (!sessionId || !options.sessionState) return {};

  const state = options.sessionState.get(sessionId, [
    "chat.provider",
    "chat.providerRuntimeMode",
    "chat.cliModels",
    "chat.reasoningEffort",
  ]);

  const sessionProvider = typeof state["chat.provider"] === "string"
    ? state["chat.provider"].trim()
    : "";
  const providerId: ProviderId | undefined = sessionProvider
    ? sessionProvider as ProviderId
    : undefined;
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
