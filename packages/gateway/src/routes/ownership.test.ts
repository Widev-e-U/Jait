import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ProviderRegistry } from "../providers/registry.js";
import { registerPlanRoutes } from "./plans.js";
import { RepositoryService } from "../services/repositories.js";
import { PlanService } from "../services/plans.js";
import { signAuthToken } from "../security/http-auth.js";
import { registerRepoRoutes } from "./repositories.js";
import { ThreadService } from "../services/threads.js";
import { registerThreadRoutes } from "./threads.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("route ownership guards", () => {
  it("hides other users' threads from detail and session-scoped list routes", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
    });

    const thread = threadService.create({
      userId: "user-1",
      sessionId: "session-secret",
      title: "Private thread",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const otherUserHeaders = await authHeader(config.jwtSecret, "user-2");

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/threads/${thread.id}`,
      headers: otherUserHeaders,
    });

    expect(detailResponse.statusCode).toBe(404);
    expect(detailResponse.json()).toEqual({ error: "Thread not found" });

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/threads?sessionId=${thread.sessionId}`,
      headers: otherUserHeaders,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({ threads: [], hasMore: false });

    await app.close();
    sqlite.close();
  });

  it("rejects cross-user repository strategy reads and writes", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const repoService = new RepositoryService(db);

    registerRepoRoutes(app, config, {
      repoService,
    });

    const repo = repoService.create({
      userId: "user-1",
      name: "private-repo",
      localPath: process.cwd(),
    });

    const otherUserHeaders = await authHeader(config.jwtSecret, "user-2");

    const readResponse = await app.inject({
      method: "GET",
      url: `/api/repos/${repo.id}/strategy`,
      headers: otherUserHeaders,
    });

    expect(readResponse.statusCode).toBe(404);
    expect(readResponse.json()).toEqual({ error: "Repository not found" });

    const writeResponse = await app.inject({
      method: "PUT",
      url: `/api/repos/${repo.id}/strategy`,
      headers: otherUserHeaders,
      payload: { strategy: "Keep this private" },
    });

    expect(writeResponse.statusCode).toBe(404);
    expect(writeResponse.json()).toEqual({ error: "Repository not found" });

    await app.close();
    sqlite.close();
  });

  it("rejects cross-user plan listing and start requests", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const repoService = new RepositoryService(db);
    const planService = new PlanService(db);

    registerPlanRoutes(app, config, {
      planService,
      repoService,
    });

    const repo = repoService.create({
      userId: "user-1",
      name: "private-repo",
      localPath: process.cwd(),
    });
    const plan = planService.create({
      repoId: repo.id,
      userId: "user-1",
      title: "Private plan",
      tasks: [],
    });

    const otherUserHeaders = await authHeader(config.jwtSecret, "user-2");

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/repos/${repo.id}/plans`,
      headers: otherUserHeaders,
    });

    expect(listResponse.statusCode).toBe(404);
    expect(listResponse.json()).toEqual({ error: "Repository not found" });

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/plans/${plan.id}/start`,
      headers: otherUserHeaders,
    });

    expect(startResponse.statusCode).toBe(404);
    expect(startResponse.json()).toEqual({ error: "Plan not found" });

    await app.close();
    sqlite.close();
  });
});
