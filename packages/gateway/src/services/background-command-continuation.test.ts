import { describe, expect, it, vi } from "vitest";

import {
  buildBackgroundCommandContinuationPayload,
  LoopSelectionRequiredError,
} from "./background-command-continuation.js";
import type { SessionStateService } from "./session-state.js";
import type { UserService, UserSettingsRecord } from "./users.js";

/**
 * `chatProvider` here is the *account* default for brand-new chats. Autonomous
 * turns must never use it, so these tests deliberately set it to something that
 * conflicts with the chat and assert it is ignored.
 */
function userService(
  chatProvider: UserSettingsRecord["chatProvider"],
  reasoningEffort?: string,
): UserService {
  return {
    getSettings: vi.fn(() => ({ chatProvider, reasoningEffort })),
  } as unknown as UserService;
}

function sessionState(values: Record<string, unknown>): SessionStateService {
  return {
    get: () => values,
  } as unknown as SessionStateService;
}

function chatOn(
  provider: string,
  cliModels?: Record<string, string>,
  extra: Record<string, unknown> = {},
): SessionStateService {
  return sessionState({
    "chat.provider": provider,
    ...(cliModels ? { "chat.cliModels": cliModels } : {}),
    ...extra,
  });
}

describe("buildBackgroundCommandContinuationPayload", () => {
  it("names the provider explicitly, even for jait, so the route cannot fall back", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("codex"),
      sessionState: chatOn("jait", { jait: "jait://ollama/legacy-ollama/llama3" }),
    })).toEqual({
      sessionId: "session-1",
      _systemNotification: "tests passed",
      provider: "jait",
      model: "jait://ollama/legacy-ollama/llama3",
      reasoningEffort: null,
    });
  });

  it("resumes the chat's provider with its runtime mode and chosen model", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("jait"),
      sessionState: chatOn("codex", { codex: "gpt-5.4" }, {
        "chat.providerRuntimeMode": "full-access",
      }),
    })).toEqual({
      sessionId: "session-1",
      _systemNotification: "tests passed",
      provider: "codex",
      runtimeMode: "full-access",
      model: "gpt-5.4",
      reasoningEffort: null,
    });
  });

  it("includes the optional display notice when one is supplied", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      notice: "Background command finished",
      userId: "user-1",
      userService: userService("codex"),
      sessionState: chatOn("codex", { codex: "gpt-5.4" }),
    })).toMatchObject({ _systemNotice: "Background command finished" });
  });

  it("stops and asks instead of using the account default when the chat has no provider", () => {
    const settings = userService("codex", "high");

    expect(() => buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: settings,
      sessionState: sessionState({}),
    })).toThrow(LoopSelectionRequiredError);

    expect(settings.getSettings).not.toHaveBeenCalled();
  });

  it("stops and asks when no session state is available at all", () => {
    expect(() => buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("codex"),
    })).toThrow(LoopSelectionRequiredError);
  });

  it("stops and asks when the chat's provider has no model, naming that provider", () => {
    expect(() => buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("jait"),
      sessionState: chatOn("codex", {}),
    })).toThrow(/no model selected for provider 'codex'/);
  });

  it("does not borrow a model remembered for a different provider", () => {
    expect(() => buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("jait"),
      sessionState: chatOn("claude-code", {
        jait: "jait://ollama/legacy-ollama/deepseek-v4.1-flash%3Acloud",
        codex: "gpt-5.4",
      }),
    })).toThrow(/no model selected for provider 'claude-code'/);
  });

  it("does not read the account's persisted selected model as a fallback", () => {
    const settings = {
      getSettings: vi.fn(() => ({
        chatProvider: "jait",
        selectedModel: "deepseek-v4.1-flash:cloud",
      })),
    } as unknown as UserService;

    expect(() => buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: settings,
      sessionState: chatOn("codex"),
    })).toThrow(LoopSelectionRequiredError);
  });

  it("preserves an explicit per-session null effort over later user settings", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("jait", "low"),
      sessionState: chatOn("jait", { jait: "jait://ollama/legacy-ollama/llama3" }),
      sessionMetadata: JSON.stringify({ chat: { reasoningEffort: null } }),
    })).toMatchObject({ reasoningEffort: null });
  });

  it("preserves a persisted per-session effort", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("jait", "low"),
      sessionState: chatOn("jait", { jait: "jait://ollama/legacy-ollama/llama3" }),
      sessionMetadata: { chat: { reasoningEffort: "high" } },
    })).toMatchObject({ reasoningEffort: "high" });
  });

  it("falls back to the chat's own effort when persisted metadata is unreadable", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("codex", "low"),
      sessionState: chatOn("codex", { codex: "gpt-5.4" }, {
        "chat.reasoningEffort": "medium",
      }),
      sessionMetadata: "{not json",
    })).toMatchObject({ reasoningEffort: "medium" });
  });
});

describe("LoopSelectionRequiredError", () => {
  it("is a named Error so callers can pause the loop instead of retrying", () => {
    const error = new LoopSelectionRequiredError("pick a model");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("LoopSelectionRequiredError");
    expect(error.message).toBe("pick a model");
  });
});
