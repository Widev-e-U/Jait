import { describe, expect, it, vi } from "vitest";

import { normalizeReasoningEffort, resolveThreadSelectionDefaults } from "./thread-defaults.js";
import type { SessionStateService } from "./session-state.js";
import type { UserService, UserSettingsRecord } from "./users.js";

/**
 * The account default provider is a *user* preference for new chats. It must
 * never be treated as a selection for work the user did not ask for in the
 * moment, so several tests below set it to a value that contradicts the chat
 * and then assert it was ignored.
 */
function makeUserService(chatProvider: UserSettingsRecord["chatProvider"]): UserService {
  return {
    getSettings: vi.fn((_userId: string): UserSettingsRecord => ({
      userId: _userId,
      theme: "system",
      apiKeys: {},
      disabledTools: [],
      sttProvider: "whisper",
      chatProvider,
      jaitBackend: "openai",
      recentModels: [],
      workspacePickerPath: null,
      workspacePickerNodeId: null,
      updatedAt: new Date().toISOString(),
    })),
  } as unknown as UserService;
}

function makeSessionState(state: Record<string, unknown>): SessionStateService {
  return {
    get: (_sessionId: string, keys?: string[]) => {
      if (!keys?.length) return { ...state };
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in state) out[key] = state[key];
      }
      return out;
    },
  } as unknown as SessionStateService;
}

describe("resolveThreadSelectionDefaults", () => {
  it("returns empty defaults when given no context at all", () => {
    expect(resolveThreadSelectionDefaults({})).toEqual({ providerId: undefined });
  });

  it("never falls back to the account's default provider", () => {
    const userService = makeUserService("claude-code");
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService,
      sessionState: makeSessionState({}),
    });

    expect(result).toEqual({
      providerId: undefined,
      model: undefined,
      runtimeMode: undefined,
      reasoningEffort: undefined,
    });
    expect(userService.getSettings).not.toHaveBeenCalled();
  });

  it("never falls back to the account's default provider when there is no session", () => {
    const userService = makeUserService("codex");
    const result = resolveThreadSelectionDefaults({ userId: "user-1", userService });

    expect(result.providerId).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(userService.getSettings).not.toHaveBeenCalled();
  });

  it("returns the provider the user recorded on this chat", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService: makeUserService("claude-code"),
      sessionState: makeSessionState({ "chat.provider": "codex" }),
    });

    expect(result.providerId).toBe("codex");
  });

  it("trims the recorded provider and treats whitespace as unselected", () => {
    expect(resolveThreadSelectionDefaults({
      sessionId: "session-1",
      sessionState: makeSessionState({ "chat.provider": "  codex  " }),
    }).providerId).toBe("codex");

    expect(resolveThreadSelectionDefaults({
      sessionId: "session-1",
      sessionState: makeSessionState({ "chat.provider": "   " }),
    }).providerId).toBeUndefined();
  });

  it("does not consult session state when sessionState service is missing", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService: makeUserService("codex"),
    });

    expect(result.providerId).toBeUndefined();
    expect(result.model).toBeUndefined();
  });

  it("resolves runtimeMode when set to a supported value", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      sessionState: makeSessionState({
        "chat.provider": "codex",
        "chat.providerRuntimeMode": "supervised",
      }),
    });
    expect(result).toEqual({
      providerId: "codex",
      model: undefined,
      runtimeMode: "supervised",
    });
  });

  it("ignores unrecognized runtimeMode values", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      sessionState: makeSessionState({
        "chat.provider": "codex",
        "chat.providerRuntimeMode": "yolo",
      }),
    });
    expect(result.runtimeMode).toBeUndefined();
  });

  it("picks the model remembered for this chat's own provider", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      sessionState: makeSessionState({
        "chat.provider": "claude-code",
        "chat.providerRuntimeMode": "full-access",
        "chat.cliModels": {
          "claude-code": "  claude-sonnet-4-6  ",
          codex: "gpt-5-codex",
        },
      }),
    });
    expect(result).toEqual({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      runtimeMode: "full-access",
    });
  });

  it("reports no model when the chat only remembers one for a different provider", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService: makeUserService("jait"),
      sessionState: makeSessionState({
        "chat.provider": "codex",
        "chat.cliModels": {
          jait: "jait://ollama/legacy-ollama/deepseek-v4.1-flash%3Acloud",
          "claude-code": "claude-sonnet-4-6",
        },
      }),
    });

    // The chat is on codex but only remembers jait/claude models. Those must
    // not be borrowed: the caller has to ask the user for a codex model.
    expect(result.providerId).toBe("codex");
    expect(result.model).toBeUndefined();
  });

  it("returns no model when the matching cliModels entry is empty or the wrong type", () => {
    const empty = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      sessionState: makeSessionState({
        "chat.provider": "codex",
        "chat.cliModels": { codex: "   " },
      }),
    });
    expect(empty.model).toBeUndefined();

    const nonObject = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      sessionState: makeSessionState({
        "chat.provider": "codex",
        "chat.cliModels": ["codex", "gpt-5-codex"],
      }),
    });
    expect(nonObject.model).toBeUndefined();
  });

  it("does not return a model when no provider is resolved", () => {
    const result = resolveThreadSelectionDefaults({
      sessionId: "session-1",
      sessionState: makeSessionState({
        "chat.cliModels": { codex: "gpt-5-codex" },
      }),
    });
    expect(result).toEqual({
      providerId: undefined,
      model: undefined,
      runtimeMode: undefined,
    });
  });

  it("trims sessionId before reading state", () => {
    let receivedSessionId: string | undefined;
    const sessionState = {
      get: (sessionId: string) => {
        receivedSessionId = sessionId;
        return {};
      },
    } as unknown as SessionStateService;

    resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "  session-7  ",
      userService: makeUserService("codex"),
      sessionState,
    });

    expect(receivedSessionId).toBe("session-7");
  });

  it("inherits the chat's reasoning effort so a spawned thread runs at the same level", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      sessionState: makeSessionState({
        "chat.provider": "claude-code",
        "chat.reasoningEffort": "xhigh",
      }),
    });

    expect(result.reasoningEffort).toBe("xhigh");
  });

  it("drops a malformed reasoning effort instead of passing it to the CLI", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      sessionState: makeSessionState({
        "chat.provider": "claude-code",
        "chat.reasoningEffort": "high; rm -rf /",
      }),
    });

    expect(result.reasoningEffort).toBeUndefined();
  });
});

describe("normalizeReasoningEffort", () => {
  it("accepts provider-defined values, not just the OpenAI set", () => {
    expect(normalizeReasoningEffort("high")).toBe("high");
    expect(normalizeReasoningEffort("  xhigh  ")).toBe("xhigh");
    expect(normalizeReasoningEffort("max")).toBe("max");
    expect(normalizeReasoningEffort("thought-level.2")).toBe("thought-level.2");
  });

  it("rejects anything that isn't a plain option token", () => {
    expect(normalizeReasoningEffort("")).toBeUndefined();
    expect(normalizeReasoningEffort("   ")).toBeUndefined();
    expect(normalizeReasoningEffort("-leading-dash")).toBeUndefined();
    expect(normalizeReasoningEffort("has space")).toBeUndefined();
    expect(normalizeReasoningEffort("x".repeat(65))).toBeUndefined();
    expect(normalizeReasoningEffort(null)).toBeUndefined();
    expect(normalizeReasoningEffort(7)).toBeUndefined();
  });
});
