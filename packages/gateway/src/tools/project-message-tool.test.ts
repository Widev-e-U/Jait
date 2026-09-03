import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
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
import type { WsControlPlane } from "../ws.js";
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
      const broadcastToUser = vi.fn();
      const ws = { broadcastAll: vi.fn(), broadcastToUser } as unknown as WsControlPlane;

      const tool = createProjectMessageTool({
        projectService,
        sessionService,
        threadService,
        providerRegistry,
        userService,
        ws,
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
      expect(broadcastToUser.mock.calls.map(([, event]) => event.type)).toEqual([
        "project.created",
        "chat.created",
      ]);
      expect(broadcastToUser).toHaveBeenNthCalledWith(1, user.id, expect.objectContaining({
        payload: { project: expect.objectContaining({ id: data.project.id }) },
      }));
      expect(broadcastToUser).toHaveBeenNthCalledWith(2, user.id, expect.objectContaining({
        payload: { projectId: data.project.id, session: expect.objectContaining({ id: data.session.id }) },
      }));

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

  it("reuses the caller's live chat — assigns it to the project instead of creating a new one", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user-live", "password");
      const projectService = new ProjectService(db);
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      const providerRegistry = new ProviderRegistry();
      // thread.control falls back to the user's last-selected provider ("jait").
      const provider = new MockThreadProvider("jait");
      providerRegistry.register(provider);
      const broadcastToUser = vi.fn();
      const ws = { broadcastAll: vi.fn(), broadcastToUser } as unknown as WsControlPlane;

      // The chat the caller is currently in — NOT part of any project yet.
      const currentChat = sessionService.create({ userId: user.id, name: "My Chat" });

      const existingProject = projectService.create({
        userId: user.id,
        title: "Target Project",
        rootPath: "/tmp/target-project",
        nodeId: "gateway",
      });

      const tool = createProjectMessageTool({
        projectService,
        sessionService,
        threadService,
        providerRegistry,
        userService,
        ws,
      });

      const result = await tool.execute(
        { projectId: existingProject.id, message: "Look into the failing deploy." },
        makeContext(user.id, { sessionId: currentChat.id }),
      );

      expect(result.ok, result.message).toBe(true);
      const data = result.data as {
        project: { id: string };
        session: { id: string; projectId: string | null };
        assigned: boolean;
      };

      // The SAME chat is used — no new chat was created.
      expect(data.session.id).toBe(currentChat.id);
      const projectChats = sessionService.listByProject(data.project.id);
      expect(projectChats).toHaveLength(1);
      expect(projectChats[0]?.id).toBe(currentChat.id);

      // ...and it was actually assigned to the project.
      expect(data.assigned).toBe(true);
      expect(data.session.projectId).toBe(data.project.id);
      const refetched = sessionService.getById(currentChat.id, user.id);
      expect(refetched?.projectId).toBe(data.project.id);
      expect(refetched?.projectPath).toBe("/tmp/target-project");

      // The turn runs inside the reused chat, in the project's directory.
      const threads = threadService.listBySession(currentChat.id);
      expect(threads).toHaveLength(1);
      expect(threads[0]?.workingDirectory).toBe("/tmp/target-project");
      expect(threads[0]?.status).toBe("running");
      expect(provider.sendTurnCalls).toHaveLength(1);

      // Clients are told the chat moved into the project.
      expect(broadcastToUser.mock.calls.map(([, event]) => event.type)).toContain("chat.moved");
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
