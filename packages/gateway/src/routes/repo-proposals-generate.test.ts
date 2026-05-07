import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import type { CliProviderAdapter, ProviderEvent, ProviderId, ProviderInfo, ProviderSession, RuntimeMode, StartSessionOptions } from "../providers/contracts.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { RepositoryService } from "../services/repositories.js";
import { RepoProposalService } from "../services/repo-proposals.js";
import { registerRepoProposalRoutes } from "./repo-proposals.js";

class StubCliProvider implements CliProviderAdapter {
  readonly id: ProviderId = "codex";
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Stub Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private listeners = new Set<(event: ProviderEvent) => void>();
  public lastStartOptions: StartSessionOptions | null = null;
  public lastMessage: string | null = null;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    return {
      id: "stub-session",
      providerId: "codex",
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.lastMessage = message;
    for (const listener of this.listeners) {
      listener({
        type: "message",
        sessionId,
        role: "assistant",
        content: JSON.stringify([{ message: "Use selected provider for todo generation", priority: "normal", tags: ["provider"], dueDate: null }]),
      });
      listener({ type: "turn.completed", sessionId });
    }
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

  onEvent(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("repo todo generation", () => {
  let sqlite: ReturnType<typeof openDatabase>["sqlite"] | null = null;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sqlite?.close();
    sqlite = null;
  });

  it("generates and saves non-duplicate todo suggestions", async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const app = Fastify({ logger: false });
    const config = {
      ...loadConfig(),
      jwtSecret: "test-jwt-secret",
      logLevel: "silent" as const,
      llmProvider: "openai" as const,
      openaiApiKey: "test-key",
    };
    const repoService = new RepositoryService(opened.db);
    const repoProposalService = new RepoProposalService(opened.db);

    registerRepoProposalRoutes(app, config, {
      repoService,
      repoProposalService,
    });

    const repo = repoService.create({
      userId: "test-user",
      name: "repo",
      localPath: process.cwd(),
    });
    repoProposalService.create({
      repoId: repo.id,
      userId: "test-user",
      message: "Add unit tests for todo generation",
    });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify([
            {
              message: "Add unit tests for todo generation",
              priority: "normal",
              tags: ["tests"],
              dueDate: null,
            },
            {
              message: "Review Todo page empty states",
              priority: "high",
              tags: ["ui", "todo"],
              dueDate: null,
            },
            {
              message: "Document the release workflow",
              priority: "low",
              tags: ["docs"],
              dueDate: "2026-05-10",
            },
          ]),
        },
      }],
    }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await app.inject({
      method: "POST",
      url: `/api/repos/${repo.id}/todos/generate`,
      headers: await authHeader(config.jwtSecret),
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { generated: number; todos: Array<{ message: string; priority: string; dueDate: string | null; tags: string }> };
    expect(body.generated).toBe(2);
    expect(body.todos.map((todo) => todo.message)).toEqual([
      "Review Todo page empty states",
      "Document the release workflow",
    ]);
    expect(body.todos[0]).toMatchObject({
      priority: "high",
      dueDate: null,
      tags: JSON.stringify(["ui", "todo"]),
    });

    const saved = repoProposalService.listByRepo(repo.id);
    expect(saved).toHaveLength(3);

    await app.close();
  });

  it("uses the selected CLI provider, model, and runtime mode", async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const app = Fastify({ logger: false });
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" as const };
    const repoService = new RepositoryService(opened.db);
    const repoProposalService = new RepoProposalService(opened.db);
    const providerRegistry = new ProviderRegistry();
    const stubProvider = new StubCliProvider();
    providerRegistry.register(stubProvider);

    registerRepoProposalRoutes(app, config, {
      repoService,
      repoProposalService,
      providerRegistry,
    });

    const repo = repoService.create({
      userId: "test-user",
      name: "repo",
      localPath: process.cwd(),
    });

    const runtimeMode: RuntimeMode = "supervised";
    const res = await app.inject({
      method: "POST",
      url: `/api/repos/${repo.id}/todos/generate`,
      headers: await authHeader(config.jwtSecret),
      payload: {
        provider: "codex",
        model: "gpt-5-codex",
        runtimeMode,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(stubProvider.lastStartOptions?.workingDirectory).toBe(repo.localPath);
    expect(stubProvider.lastStartOptions?.model).toBe("gpt-5-codex");
    expect(stubProvider.lastStartOptions?.mode).toBe("supervised");
    expect(stubProvider.lastMessage).toContain("Output ONLY the JSON array");

    const body = res.json() as { generated: number; todos: Array<{ message: string }> };
    expect(body.generated).toBe(1);
    expect(body.todos[0]?.message).toBe("Use selected provider for todo generation");

    await app.close();
  });
});
