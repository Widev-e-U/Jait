import type { ProviderId, RuntimeMode } from "../providers/contracts.js";
import type { SessionStateService } from "./session-state.js";
import type { UserService } from "./users.js";

export interface ThreadSelectionDefaults {
  providerId?: ProviderId;
  model?: string;
  runtimeMode?: RuntimeMode;
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

  const state = options.sessionState.get(sessionId, ["chat.providerRuntimeMode", "chat.cliModels"]);
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
    runtimeMode,
  };
}
