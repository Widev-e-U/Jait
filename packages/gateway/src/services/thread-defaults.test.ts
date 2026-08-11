import { describe, expect, it } from "vitest";

import { normalizeReasoningEffort, resolveThreadSelectionDefaults } from "./thread-defaults.js";
import type { SessionStateService } from "./session-state.js";
import type { UserService, UserSettingsRecord } from "./users.js";

function makeUserService(chatProvider: UserSettingsRecord["chatProvider"]): UserService {
  return {
    getSettings: (_userId: string): UserSettingsRecord => ({
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
    }),
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
  it("returns empty defaults when no userId or sessionId provided", () => {
    expect(resolveThreadSelectionDefaults({})).toEqual({ providerId: undefined });
  });

  it("returns undefined providerId when userId is whitespace", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "   ",
      userService: makeUserService("codex"),
    });
    expect(result).toEqual({ providerId: undefined });
  });

  it("returns providerId from user settings when no sessionId is given", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      userService: makeUserService("claude-code"),
    });
    expect(result).toEqual({ providerId: "claude-code" });
  });

  it("does not consult session state when sessionState service is missing", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService: makeUserService("codex"),
    });
    expect(result).toEqual({ providerId: "codex" });
  });

  it("resolves runtimeMode when set to a supported value", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService: makeUserService("codex"),
      sessionState: makeSessionState({
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
      userService: makeUserService("codex"),
      sessionState: makeSessionState({
        "chat.providerRuntimeMode": "yolo",
      }),
    });
    expect(result.runtimeMode).toBeUndefined();
  });

  it("picks the cliModels entry matching the resolved provider", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService: makeUserService("claude-code"),
      sessionState: makeSessionState({
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

  it("returns no model when cliModels entry is empty or wrong type", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService: makeUserService("codex"),
      sessionState: makeSessionState({
        "chat.cliModels": { codex: "   " },
      }),
    });
    expect(result.model).toBeUndefined();

    const nonObject = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService: makeUserService("codex"),
      sessionState: makeSessionState({
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
      userService: makeUserService("claude-code"),
      sessionState: makeSessionState({
        "chat.reasoningEffort": "xhigh",
      }),
    });

    expect(result.reasoningEffort).toBe("xhigh");
  });

  it("drops a malformed reasoning effort instead of passing it to the CLI", () => {
    const result = resolveThreadSelectionDefaults({
      userId: "user-1",
      sessionId: "session-1",
      userService: makeUserService("claude-code"),
      sessionState: makeSessionState({
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
