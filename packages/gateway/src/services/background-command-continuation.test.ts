import { describe, expect, it } from "vitest";

import { buildBackgroundCommandContinuationPayload } from "./background-command-continuation.js";
import type { SessionStateService } from "./session-state.js";
import type { UserService } from "./users.js";

function userService(
  provider: "jait" | "codex" | "claude-code",
  reasoningEffort?: string,
): UserService {
  return {
    getSettings: () => ({ chatProvider: provider, reasoningEffort }),
  } as unknown as UserService;
}

function sessionState(values: Record<string, unknown>): SessionStateService {
  return {
    get: () => values,
  } as unknown as SessionStateService;
}

describe("buildBackgroundCommandContinuationPayload", () => {
  it("keeps native Jait continuations provider-neutral", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("jait"),
    })).toEqual({
      sessionId: "session-1",
      _systemNotification: "tests passed",
      reasoningEffort: null,
    });
  });

  it("resumes external providers with the active runtime and model", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("codex"),
      sessionState: sessionState({
        "chat.providerRuntimeMode": "full-access",
        "chat.cliModels": { codex: "gpt-5.4" },
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

  it("preserves an explicit per-session default over later user settings", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("jait", "low"),
      sessionMetadata: JSON.stringify({ chat: { reasoningEffort: null } }),
    })).toMatchObject({ reasoningEffort: null });
  });

  it("preserves a persisted per-session effort", () => {
    expect(buildBackgroundCommandContinuationPayload({
      sessionId: "session-1",
      notification: "tests passed",
      userId: "user-1",
      userService: userService("jait", "low"),
      sessionMetadata: { chat: { reasoningEffort: "high" } },
    })).toMatchObject({ reasoningEffort: "high" });
  });
});
