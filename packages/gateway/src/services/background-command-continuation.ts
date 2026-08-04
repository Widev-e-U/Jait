import type { ProviderId, RuntimeMode } from "../providers/contracts.js";
import { resolveThreadSelectionDefaults } from "./thread-defaults.js";
import type { SessionStateService } from "./session-state.js";
import type { UserService } from "./users.js";

export interface BackgroundCommandContinuationPayload {
  sessionId: string;
  _systemNotification: string;
  /** Short human display line rendered as a gray system notice in the chat. */
  _systemNotice?: string;
  provider?: Exclude<ProviderId, "jait">;
  runtimeMode?: RuntimeMode;
  model?: string;
}

export function buildBackgroundCommandContinuationPayload(options: {
  sessionId: string;
  notification: string;
  /** Optional short display line for the chat UI. */
  notice?: string;
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
    ...(options.notice ? { _systemNotice: options.notice } : {}),
    ...(provider !== "jait"
      ? {
          provider,
          ...(defaults.runtimeMode ? { runtimeMode: defaults.runtimeMode } : {}),
          ...(defaults.model ? { model: defaults.model } : {}),
        }
      : {}),
  };
}
