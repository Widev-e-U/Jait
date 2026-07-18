import type { ProviderId, RuntimeMode } from "../providers/contracts.js";
import { resolveThreadSelectionDefaults } from "./thread-defaults.js";
import type { SessionStateService } from "./session-state.js";
import type { UserService } from "./users.js";

export interface BackgroundCommandContinuationPayload {
  sessionId: string;
  _systemNotification: string;
  provider?: Exclude<ProviderId, "jait">;
  runtimeMode?: RuntimeMode;
  model?: string;
}

export function buildBackgroundCommandContinuationPayload(options: {
  sessionId: string;
  notification: string;
  userId: string;
  userService: UserService;
  sessionState?: SessionStateService;
}): BackgroundCommandContinuationPayload {
  const defaults = resolveThreadSelectionDefaults({
    userId: options.userId,
    sessionId: options.sessionId,
    userService: options.userService,
    sessionState: options.sessionState,
  });
  const provider = defaults.providerId ?? "jait";

  return {
    sessionId: options.sessionId,
    _systemNotification: options.notification,
    ...(provider !== "jait"
      ? {
          provider,
          ...(defaults.runtimeMode ? { runtimeMode: defaults.runtimeMode } : {}),
          ...(defaults.model ? { model: defaults.model } : {}),
        }
      : {}),
  };
}
