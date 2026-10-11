import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
const runAgentLoop = vi.hoisted(() => vi.fn());
vi.mock("../tools/index.js", async importOriginal => ({
  ...await importOriginal<typeof import("../tools/index.js")>(),
  runAgentLoop,
}));
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { JaitProvider } from "../providers/jait-provider.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { ThreadService } from "../services/threads.js";
import { interventionRunResumeRegistry } from "../services/intervention-run-resume.js";
import { registerThreadRoutes } from "./threads.js";

async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 400; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("No completed turn");
}
afterEach(() => { runAgentLoop.mockReset(); interventionRunResumeRegistry.clearForTests(); });

describe("native thread continuation", () => {
  it("continues a completed native thread after provider restart with history and one new message", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const config = { ...loadConfig(), nodeEnv: "test" as const, openaiApiKey: "fixture", agentMaxRounds: 0 };
    const thread = threadService.create({
      userId: "user-1", title: "Captain", providerId: "jait",
      workingDirectory: process.cwd(), model: "gpt-4o", runtimeMode: "supervised",
    });
    const registry = new ProviderRegistry();
    let provider = new JaitProvider({ config, threadService });
    registry.register(provider);
    const app = Fastify();
    registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    const token = await signAuthToken({ id: "user-1", username: "fixture" }, config.jwtSecret);
    const headers = { authorization: "Bearer " + token };
    runAgentLoop.mockResolvedValue({ content: "Previous work preserved", executedToolCalls: [] });
    try {
      const start = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/start`, headers,
        payload: { message: "Prepare the sprint", titleTask: "" } });
      expect(start.statusCode).toBe(200);
      await waitFor(() => threadService.getById(thread.id)?.status === "completed");
      const oldSession = threadService.getById(thread.id)!.providerSessionId!;
      const before = threadService.getActivities(thread.id);
      // Restart only the provider. Persisted thread, messages and workspace remain.
      provider = new JaitProvider({ config, threadService });
      registry.register(provider);
      runAgentLoop.mockClear();
      runAgentLoop.mockResolvedValue({ content: "Remaining work continued", executedToolCalls: [] });
      const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/send`, headers,
        payload: { message: "Continue remaining sprint work", titleTask: "" } });
      expect(response.statusCode).toBe(200);
      await waitFor(() => threadService.getById(thread.id)?.status === "completed");
      const current = threadService.getById(thread.id)!;
      expect(current.providerSessionId).not.toBe(oldSession);
      expect(current.workingDirectory).toBe(thread.workingDirectory);
      expect(current.runtimeMode).toBe("supervised");
      expect(runAgentLoop).toHaveBeenCalledOnce();
      const sentHistory = runAgentLoop.mock.calls[0]![0].history;
      const prompt = sentHistory.filter((entry: any) => entry.role === "user").map((entry: any) => entry.content).join("\n");
      expect(prompt).toContain("Prepare the sprint");
      expect(prompt).toContain("Previous work preserved");
      expect(prompt).toContain("Continue remaining sprint work");
      const activities = threadService.getActivities(thread.id);
      expect(activities.filter(a => (a.payload as any)?.role === "user"
        && (a.payload as any)?.content === "Continue remaining sprint work")).toHaveLength(1);
      for (const activity of before) expect(activities.some(a => a.id === activity.id)).toBe(true);
    } finally { await app.close(); sqlite.close(); }
  });

  it("keeps a surviving native session and does not restart or replay its history", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const config = { ...loadConfig(), nodeEnv: "test" as const, openaiApiKey: "fixture" };
    const thread = threadService.create({ userId: "user-1", title: "Captain", providerId: "jait", workingDirectory: process.cwd() });
    const provider = new JaitProvider({ config, threadService });
    const registry = new ProviderRegistry(); registry.register(provider);
    const app = Fastify();
    registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    runAgentLoop.mockResolvedValue({ content: "Done", executedToolCalls: [] });
    const startSession = vi.spyOn(provider, "startSession");
    try {
      const token = await signAuthToken({ id: "user-1", username: "fixture" }, config.jwtSecret);
      const headers = { authorization: "Bearer " + token };
      await app.inject({ method: "POST", url: `/api/threads/${thread.id}/start`, headers, payload: { message: "First turn", titleTask: "" } });
      await waitFor(() => threadService.getById(thread.id)?.status === "completed");
      const sessionId = threadService.getById(thread.id)!.providerSessionId;
      const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/send`, headers, payload: { message: "Second turn" } });
      expect(response.statusCode).toBe(200);
      expect(threadService.getById(thread.id)?.status).toBe("completed");
      expect(threadService.getById(thread.id)?.providerSessionId).toBe(sessionId);
      expect(startSession).toHaveBeenCalledOnce();
      expect(runAgentLoop).toHaveBeenCalledTimes(2);
      const history = runAgentLoop.mock.calls[1]![0].history;
      expect(history.filter((entry: { role: string }) => entry.role === "user")).toHaveLength(2);
    } finally { await app.close(); sqlite.close(); }
  });

  it.each(["completed", "interrupted", "replaced"] as const)("does not overwrite %s work after a late rejected send", async state => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const config = { ...loadConfig(), nodeEnv: "test" as const, openaiApiKey: "fixture" };
    const thread = threadService.create({ userId: "user-1", title: "Captain", providerId: "jait", workingDirectory: process.cwd() });
    const provider = new JaitProvider({ config, threadService });
    const session = await provider.startSession({ threadId: thread.id, workingDirectory: process.cwd(), mode: "supervised" });
    threadService.markRunning(thread.id, session.id); threadService.markCompleted(thread.id);
    vi.spyOn(provider, "sendTurn").mockImplementation(async () => {
      if (state === "completed") threadService.markCompleted(thread.id);
      else if (state === "interrupted") threadService.markInterrupted(thread.id);
      else threadService.markRunning(thread.id, "replacement-session");
      throw new Error("Late failure from previous send");
    });
    const registry = new ProviderRegistry(); registry.register(provider);
    const app = Fastify(); registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    try {
      const token = await signAuthToken({ id: "user-1", username: "fixture" }, config.jwtSecret);
      const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/send`,
        headers: { authorization: "Bearer " + token }, payload: { message: "Continue" } });
      expect(response.statusCode).toBe(500);
      expect(threadService.getById(thread.id)?.status).toBe(state === "replaced" ? "running" : state);
      if (state === "replaced") expect(threadService.getById(thread.id)?.providerSessionId).toBe("replacement-session");
    } finally { await app.close(); sqlite.close(); }
  });

  it("marks a rejected follow-up as error instead of leaving phantom running work", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const config = { ...loadConfig(), nodeEnv: "test" as const, openaiApiKey: "fixture" };
    const thread = threadService.create({ userId: "user-1", title: "Captain", providerId: "jait", workingDirectory: process.cwd() });
    const provider = new JaitProvider({ config, threadService });
    const session = await provider.startSession({ threadId: thread.id, workingDirectory: process.cwd(), mode: "supervised" });
    threadService.markRunning(thread.id, session.id);
    threadService.markCompleted(thread.id);
    vi.spyOn(provider, "sendTurn").mockRejectedValue(new Error("Provider unavailable before dispatch"));
    const registry = new ProviderRegistry(); registry.register(provider);
    const app = Fastify();
    registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    try {
      const token = await signAuthToken({ id: "user-1", username: "fixture" }, config.jwtSecret);
      const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/send`,
        headers: { authorization: "Bearer " + token }, payload: { message: "Continue sprint" } });
      expect(response.statusCode).toBe(500);
      expect(threadService.getById(thread.id)?.status).toBe("error");
      expect(threadService.getById(thread.id)?.error).toBe("Provider unavailable before dispatch");
      expect(threadService.getActivities(thread.id).some(a => a.kind === "error")).toBe(true);
      expect(threadService.getActivities(thread.id).some(a => (a.payload as any)?.content === "Continue sprint")).toBe(true);
    } finally { await app.close(); sqlite.close(); }
  });
});
