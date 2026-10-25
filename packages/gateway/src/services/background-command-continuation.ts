import type { ProviderId, RuntimeMode } from "../providers/contracts.js";
import { normalizeReasoningEffort, resolveThreadSelectionDefaults } from "./thread-defaults.js";
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
  reasoningEffort?: string | null;
}

function readPersistedReasoningEffort(metadataValue: unknown): string | null | undefined {
  let metadata = metadataValue;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const chat = (metadata as Record<string, unknown>)["chat"];
  if (!chat || typeof chat !== "object" || Array.isArray(chat)) return undefined;
  const chatRecord = chat as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(chatRecord, "reasoningEffort")) return undefined;
  if (chatRecord["reasoningEffort"] === null) return null;
  return normalizeReasoningEffort(chatRecord["reasoningEffort"]);
}

export function buildBackgroundCommandContinuationPayload(options: {
  sessionId: string;
  notification: string;
  /** Optional short display line for the chat UI. */
  notice?: string;
  userId: string;
  userService: UserService;
  sessionState?: SessionStateService;
  sessionMetadata?: unknown;
}): BackgroundCommandContinuationPayload {
  const defaults = resolveThreadSelectionDefaults({
    userId: options.userId,
    sessionId: options.sessionId,
    userService: options.userService,
    sessionState: options.sessionState,
  });
  const settings = options.userService.getSettings(options.userId);
  const provider = defaults.providerId ?? "jait";
  const persistedReasoningEffort = readPersistedReasoningEffort(options.sessionMetadata);
  const reasoningEffort = persistedReasoningEffort !== undefined
    ? persistedReasoningEffort
    : defaults.reasoningEffort
      ?? normalizeReasoningEffort(settings.reasoningEffort)
      ?? null;
  // A continuation turn has no model picker, so it must name the model explicitly.
  // Leaving it out lets resolveJaitLlmConfig fall through to the backend default
  // (OLLAMA_MODEL / OPENAI_MODEL), which can be a different — and more expensive —
  // model than the one the user actually selected.
  const inheritedModel = defaults.model
    ?? (provider === "jait" && typeof settings.selectedModel === "string"
      ? settings.selectedModel.trim()
      : "");

  return {
    sessionId: options.sessionId,
    _systemNotification: options.notification,
    ...(options.notice ? { _systemNotice: options.notice } : {}),
    reasoningEffort,
    ...(provider !== "jait"
      ? {
          provider,
          ...(defaults.runtimeMode ? { runtimeMode: defaults.runtimeMode } : {}),
        }
      : {}),
    ...(inheritedModel ? { model: inheritedModel } : {}),
  };
}
