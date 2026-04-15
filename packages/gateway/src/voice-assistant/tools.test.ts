import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../providers/contracts.js";
import { ProviderRegistry } from "../providers/registry.js";
import { SessionStateService } from "../services/session-state.js";
import { ThreadService } from "../services/threads.js";
import { UserService } from "../services/users.js";
import { executeVoiceTool, getVoiceToolSchemas } from "./tools.js";

class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}

describe("voice assistant tools", () => {
  it("exposes the agent handoff tool schema", () => {
    expect(getVoiceToolSchemas().some((tool) => tool.name === "ask_agent_about_request")).toBe(true);
  });

  it("asks a regular agent and cleans up the temporary thread", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockVoiceThreadProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const sessionState = new SessionStateService(db);
      sessionState.set("voice-assistant", {
        "chat.providerRuntimeMode": "full-access",
        "chat.cliModels": { codex: "gpt-5.4" },
      });

      const threadService = new ThreadService(db);
      const result = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?" },
        {
          config: { ...loadConfig(), host: "127.0.0.1", port: 8000 },
          userId: user.id,
          userService,
          sessionState,
          threadService,
          providerRegistry,
        },
      );

      expect(result).toBe("That is the deployed gateway node.");
      expect(threadService.list(user.id)).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });
});
