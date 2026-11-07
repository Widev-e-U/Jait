import type { ProviderId, RuntimeMode } from "../providers/contracts.js";
import { normalizeReasoningEffort, resolveThreadSelectionDefaults } from "./thread-defaults.js";
import type { SessionStateService } from "./session-state.js";
import type { UserService } from "./users.js";

export interface BackgroundCommandContinuationPayload {
  sessionId: string;
  _systemNotification: string;
  /** Short human display line rendered as a gray system notice in the chat. */
  _systemNotice?: string;
  provider?: ProviderId;
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

/**
 * Thrown when an autonomous (loop / background / recovery) continuation has no
 * provider+model recorded by the user for its own chat. Callers must stop and
 * ask the user instead of picking one.
 */
export class LoopSelectionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoopSelectionRequiredError";
  }
}

/**
 * Build the request body for an autonomous turn (chat loop iteration,
 * background wake-up, crash recovery).
 *
 * Such a turn has no person in front of it, so it must run on exactly the
 * provider and model the user chose for this chat. The account-level default
 * provider, a model remembered for a different provider, and the backend's own
 * default model are all rejected: if the chat has not recorded both values this
 * throws `LoopSelectionRequiredError` so the loop stops and asks.
 */
export function buildBackgroundCommandContinuationPayload(options: {
  sessionId: string;
  notification: string;
  /** Optional short display line for the chat UI. */
  notice?: string;
  userId: string;
  userService: UserService;
  sessionState?: SessionStateService;
  sessionMetadata?: unknown;
  /**
   * Provider+model the user configured for the work being resumed, when it is
   * not stored on the chat itself. A persona's saved provider/model counts as
   * an explicit user choice: the user picked it in the agent's settings. This
   * is never a place to fall back to an account default.
   */
  selection?: { providerId?: ProviderId; model?: string };
  /**
   * True only when the recorded provider resolves models itself — an external
   * CLI/ACP adapter (Codex, Claude Code, …) whose model the user picks inside
   * that provider. The interrupted turn was started by the user with exactly
   * that provider and no gateway model, so resuming it repeats the user's
   * choice instead of making a new one. Never set this for the HTTP backend:
   * there an absent model means "use the backend default", which is the
   * autonomy we are removing.
   */
  allowProviderResolvedModel?: boolean;
}): BackgroundCommandContinuationPayload {
  const recorded = resolveThreadSelectionDefaults({
    userId: options.userId,
    sessionId: options.sessionId,
    userService: options.userService,
    sessionState: options.sessionState,
  });
  const defaults = {
    ...recorded,
    providerId: options.selection?.providerId ?? recorded.providerId,
    model: options.selection?.model ?? recorded.model,
  };
  if (!defaults.providerId) {
    throw new LoopSelectionRequiredError(
      "This chat has no provider selected. Choose a provider and model, then resume the loop.",
    );
  }
  // An external CLI/ACP provider (Codex, Claude Code, …) resolves its own model,
  // so a user-recorded provider without a gateway model is still a complete
  // choice. The builtin HTTP backend is the exact opposite: a missing model there
  // means "whatever the backend defaults to", so the flag must never excuse it —
  // not even if a caller sets it by mistake.
  const providerResolvesOwnModel = Boolean(options.allowProviderResolvedModel)
    && defaults.providerId !== "jait";
  if (!defaults.model && !providerResolvesOwnModel) {
    throw new LoopSelectionRequiredError(
      `This chat has no model selected for provider '${defaults.providerId}'. Choose a model, then resume the loop.`,
    );
  }
  const persistedReasoningEffort = readPersistedReasoningEffort(options.sessionMetadata);
  const reasoningEffort = persistedReasoningEffort !== undefined
    ? persistedReasoningEffort
    : defaults.reasoningEffort ?? null;

  return {
    sessionId: options.sessionId,
    _systemNotification: options.notification,
    ...(options.notice ? { _systemNotice: options.notice } : {}),
    reasoningEffort,
    // Always named, including "jait": an omitted provider lets the route fall
    // back to the account default, which is the autonomy we are removing.
    provider: defaults.providerId,
    ...(defaults.runtimeMode ? { runtimeMode: defaults.runtimeMode } : {}),
    ...(defaults.model ? { model: defaults.model } : {}),
  };
}
