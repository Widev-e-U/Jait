import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../providers/contracts.js";
import { ProviderRegistry } from "../providers/registry.js";
import { ProjectService } from "../services/projects.js";
import { SessionService } from "../services/sessions.js";
import { ThreadService } from "../services/threads.js";
import { UserService } from "../services/users.js";
import { createProjectMessageTool } from "./project-message-tool.js";
import type { ToolContext } from "./contracts.js";

class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  private emitter = new EventEmitter();
  lastStartOptions: StartSessionOptions | null = null;
  sendTurnCalls: Array<{ sessionId: string; message: string }> = [];

  constructor(readonly id: "jait" | "codex" | "claude-code" = "codex") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sendTurnCalls.push({ sessionId, message });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}

function makeContext(userId: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "originating-session",
    actionId: "action-1",
    projectRoot: "/tmp/originating-project",
    requestedBy: "test",
    userId,
    ...overrides,
  };
}

describe("project.message tool", () => {
  it("creates a new project + chat and starts an agent turn there", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user", "password");
      const projectService = new ProjectService(db);
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const tool = createProjectMessageTool({
        projectService,
        sessionService,
        threadService,
        providerRegistry,
        userService,
      });

      const result = await tool.execute(
        {
          projectRoot: "/tmp/other-project",
          message: "The nightly build failed — please investigate.",
          providerId: "codex",
        },
        makeContext(user.id),
      );

      expect(result.ok).toBe(true);
      const data = result.data as {
        project: { id: string; rootPath: string | null };
        session: { id: string; projectId: string | null };
      };
      expect(data.project.rootPath).toBe("/tmp/other-project");
      expect(data.session.projectId).toBe(data.project.id);

      // The message actually reached the provider as a turn.
      expect(provider.sendTurnCalls).toHaveLength(1);
      expect(provider.sendTurnCalls[0]?.message).toContain("The nightly build failed");

      // A real thread was created in the target project's working directory.
      const threads = threadService.listBySession(data.session.id);
      expect(threads).toHaveLength(1);
      expect(threads[0]?.workingDirectory).toBe("/tmp/other-project");
      expect(threads[0]?.status).toBe("running");

      // Re-using the same project root resolves the same project (no duplicate).
      const projects = projectService.list(undefined, user.id);
      expect(projects.filter((p) => p.rootPath === "/tmp/other-project")).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  it("reuses an existing project by projectId", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user-2", "password");
      const projectService = new ProjectService(db);
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const existingProject = projectService.create({
        userId: user.id,
        title: "Existing Project",
        rootPath: "/tmp/existing-project",
        nodeId: "gateway",
      });

      const tool = createProjectMessageTool({
        projectService,
        sessionService,
        threadService,
        providerRegistry,
        userService,
      });

      const result = await tool.execute(
        {
          projectId: existingProject.id,
          message: "Please check the flaky test.",
          providerId: "codex",
        },
        makeContext(user.id),
      );

      expect(result.ok).toBe(true);
      const data = result.data as { project: { id: string } };
      expect(data.project.id).toBe(existingProject.id);
    } finally {
      sqlite.close();
    }
  });

  it("requires a message", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user-3", "password");
      const tool = createProjectMessageTool({
        projectService: new ProjectService(db),
        sessionService: new SessionService(db),
        threadService: new ThreadService(db),
        providerRegistry: new ProviderRegistry(),
        userService,
      });

      const result = await tool.execute({ projectRoot: "/tmp/whatever" }, makeContext(user.id));
      expect(result.ok).toBe(false);
      expect(result.message).toContain("message is required");
    } finally {
      sqlite.close();
    }
  });

  it("requires either projectId or projectRoot", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user-4", "password");
      const tool = createProjectMessageTool({
        projectService: new ProjectService(db),
        sessionService: new SessionService(db),
        threadService: new ThreadService(db),
        providerRegistry: new ProviderRegistry(),
        userService,
      });

      const result = await tool.execute({ message: "hello" }, makeContext(user.id));
      expect(result.ok).toBe(false);
      expect(result.message).toContain("projectId or projectRoot is required");
    } finally {
      sqlite.close();
    }
  });
});
