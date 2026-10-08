/** Full gateway → native loop → tools → SQLite → room/status path; no model calls. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ThreadService } from "../services/threads.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";
import { ToolRegistry } from "../tools/registry.js";
import { createThreadControlTool } from "../tools/thread-tools.js";
import { JaitProvider } from "../providers/jait-provider.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { personaAgentProfileSchema } from "@jait/shared";
import type { ToolResult } from "../tools/contracts.js";

const FIXTURE_URL = "http://scripted-provider.invalid/v1";
const toolReply = (name: string, args: unknown, id = "fixture-call") => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }],
});
const finalReply = { choices: [{ delta: { content: "Fixture task finished." }, finish_reason: "stop" }] };
const stream = (reply: unknown) => new Response(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });

async function eventually(check: () => Promise<boolean> | boolean, label: string) {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe("deterministic team execution end to end", () => {
  let opened: Awaited<ReturnType<typeof openDatabase>>;
  let app: Awaited<ReturnType<typeof createServer>>;
  let threads: ThreadService;
  let sessions: SessionService;
  let providers: ProviderRegistry;
  let native: JaitProvider;
  let registry: ToolRegistry;
  let headers: { authorization: string };
  let roomId: string;
  let root: string;
  let userId: string;
  let scripted: Response[];
  let requests: Array<Record<string, unknown>>;
  let executed: string[];
  let originalFetch: typeof fetch;
  const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: "test", logLevel: "silent",
    openaiBaseUrl: FIXTURE_URL, openaiApiKey: "fixture-only", openaiModel: "fixture-model" };

  const snapshot = async () => (await app.inject({ method: "GET", url: `/api/team-rooms/${roomId}`, headers })).json();
  const post = (key: string) => app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
    payload: { content: "Developer, implement the fixture and post the result using team.chat.", kind: "assignment", recipientIds: ["Developer"], clientKey: key } });

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "jait-execution-e2e-"));
    scripted = []; requests = []; executed = [];
    originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, options: RequestInit) => {
      // Fail closed: this suite cannot contact a real model or any other host.
      if (String(url) !== `${FIXTURE_URL}/chat/completions`) throw new Error(`Unexpected network request: ${String(url)}`);
      requests.push(JSON.parse(String(options.body)));
      const response = scripted.shift();
      if (!response) throw new Error("Script exhausted: unexpected additional provider round");
      return response;
    }));
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    threads = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    const users = new UserService(opened.db); const user = users.createUser("Fixture Owner", "test-password"); userId = user.id;
    users.updateSettings(user.id, { jaitBackend: "openai", apiKeys: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: FIXTURE_URL, OPENAI_MODEL: "fixture-model" } });
    headers = { authorization: `Bearer ${await signAuthToken(user, config.jwtSecret)}` };
    for (const id of ["Coordinator", "Developer", "QA"]) threads.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, role: id, reportsToId: id === "Coordinator" ? null : "Coordinator", persona: "Fixture role", avatar: "Nova", paused: false, providerId: "jait", model: "fixture-model", requiresApproval: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
    }));
    registry = new ToolRegistry(); providers = new ProviderRegistry();
    native = new JaitProvider({ config, threadService: threads, userService: users, toolRegistry: registry });
    providers.register(native);
    app = await createServer(config, { db: opened.db, threadService: threads, sessionService: sessions, userService: users,
      providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    registry.register({ ...registry.get("team.chat")!, tier: "core" });
    const source = sessions.create({ userId, name: "User chat", projectPath: root });
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: source.id } });
    expect(created.statusCode).toBe(200); roomId = created.json().room.id;
  });

  afterEach(async () => {
    await app?.close(); opened?.sqlite.close();
    globalThis.fetch = originalFetch; vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function fixtureTool(name: string, result: ToolResult) {
    registry.register({ name, description: "Deterministic fixture adapter", tier: "core", risk: "low", defaultConsentLevel: "none",
      parameters: { type: "object", properties: { attempt: { type: "number" } } },
      execute: async () => { executed.push(name); return result; } });
  }

  it("assigns once, posts an attributed passive result from the native thread and completes honestly", async () => {
    scripted.push(stream(toolReply("team_chat", { action: "send", roomId, kind: "result", recipientIds: ["Coordinator"],
      content: "Fixture verified: regression passed.", clientKey: "fixture-result" })), stream(finalReply));
    const first = await post("one-assignment"); expect(first.statusCode).toBe(201);
    const duplicate = await post("one-assignment"); expect(duplicate.json().message.id).toBe(first.json().message.id);
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "completed", "delivery completion");
    const state = await snapshot(); const delivery = state.deliveries[0]; const thread = threads.getById(delivery.sessionId)!;
    expect(thread.personaAgentId).toBe("Developer"); expect(thread.status).toBe("completed");
    expect(state.deliveries).toHaveLength(1); expect(threads.list(userId)).toHaveLength(1);
    expect(sessions.getById(thread.id, userId)).toBeUndefined();
    const results = state.messages.filter((message: any) => message.kind === "result");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ sender: { kind: "agent", id: "Developer", sourceSessionId: thread.id }, workThreadId: thread.id });
    expect(requests).toHaveLength(2); expect(scripted).toHaveLength(0);
  });

  it("keeps quota failure as an error with no false result and no automatic retry", async () => {
    scripted.push(new Response(JSON.stringify({ error: { message: "Fixture quota exhausted" } }), { status: 429 }));
    await post("quota");
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "failed", "quota blocker");
    const state = await snapshot(); const thread = threads.getById(state.deliveries[0].sessionId)!;
    expect(thread.status).toBe("error"); expect(thread.error).toContain("API quota");
    expect(state.messages.filter((message: any) => message.kind === "result")).toHaveLength(0);
    const blocked = state.messages.filter((message: any) => message.kind === "blocked");
    expect(blocked).toHaveLength(1); expect(blocked[0].recipientIds).toEqual([]);
    expect(blocked[0].workThreadId).toBe(thread.id);
    expect(requests).toHaveLength(1);
    await (app as any).recoverInterruptedThreadTurns(); expect(requests).toHaveLength(1);
  });

  it("stops semantic environment failures across different tools after the initial call and two retries", async () => {
    for (const [i, name] of ["lookup", "repair", "verify"].entries()) {
      fixtureTool(`fixture.${name}`, { ok: false, message: "fatal: not a git repository: /host/.git" });
      scripted.push(stream(toolReply(`fixture_${name}`, { attempt: i }, `failure-${i}`)));
    }
    scripted.push(stream(finalReply)); // One manager review, not another worker retry.
    await post("bounded-failure");
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "failed", "execution guard");
    const state = await snapshot(); const thread = threads.getById(state.deliveries[0].sessionId)!;
    await eventually(async () => (await snapshot()).deliveries[1]?.status === "completed", "manager recovery review");
    expect(executed).toHaveLength(3); expect(requests).toHaveLength(4);
    expect(JSON.stringify(requests[3])).toContain("Review this failed handoff");
    expect(thread.status).toBe("error"); expect(thread.error).toContain("two retries");
    expect(threads.getExecutionCheckpoint(thread.id)?.calls).toBe(3);
  });

  it("halts repetitive successful reads when a full window produces no new evidence", async () => {
    fixtureTool("fixture.read", { ok: true, message: "Read complete", data: { content: "Unchanged fixture content" } });
    for (let i = 0; i < 40; i++) scripted.push(stream(toolReply("fixture_read", { attempt: i }, `read-${i}`)));
    scripted.push(stream(finalReply)); // The coordinator decides what to do next.
    await post("no-progress");
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "failed", "no-progress cutoff");
    const state = await snapshot(); const thread = threads.getById(state.deliveries[0].sessionId)!;
    await eventually(async () => (await snapshot()).deliveries[1]?.status === "completed", "manager no-progress review");
    expect(executed).toHaveLength(40); expect(requests).toHaveLength(41);
    expect(JSON.stringify(requests[40])).toContain("Review this failed handoff");
    expect(thread.error).toContain("no new evidence");
    expect(state.messages.filter((message: any) => message.kind === "blocked")).toHaveLength(1);
  });

  it("rejects relay/helper thread creation by a saved-team agent", async () => {
    registry.register({ ...createThreadControlTool({ threadService: threads, providerRegistry: providers }), tier: "core" });
    scripted.push(stream(toolReply("thread_control", { action: "create", title: "Relay helper", message: "Post my result to the team" })), stream(finalReply));
    await post("no-relay-helper");
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "completed", "relay restriction");
    const state = await snapshot(); const thread = threads.getById(state.deliveries[0].sessionId)!;
    const result = threads.getActivities(thread.id).find(activity => activity.kind === "tool.error");
    expect(result?.summary).toContain("addressed team.chat assignments");
    expect(threads.list(userId)).toHaveLength(1); expect(requests).toHaveLength(2);
  });

  it("recovers the original task and latest instruction without duplicating delivery or resetting failure limits", async () => {
    const thread = threads.create({ userId, personaAgentId: "Developer", title: "Recovery fixture", providerId: "jait", model: "fixture-model", kind: "delivery", workingDirectory: root });
    threads.addActivity(thread.id, "message", "original", { role: "user", content: "Implement parser recovery." });
    threads.addActivity(thread.id, "message", "steering", { role: "user", content: "Only change parser.ts; preserve its API." });
    threads.addActivity(thread.id, "execution.checkpoint", "saved limits", { calls: 2, windowCalls: 2, evidence: [], failures: { "Git metadata unavailable": 2 } });
    threads.markRunning(thread.id, "lost-provider-session"); threads.queueRestartRecovery();
    fixtureTool("fixture.verify", { ok: false, message: "fatal: not a git repository: /host/.git" });
    scripted.push(stream(toolReply("fixture_verify", { attempt: 3 }, "recovery-failure")));
    await (app as any).recoverInterruptedThreadTurns();
    await eventually(() => threads.getById(thread.id)?.status === "error", "recovered failure limit");
    expect(threads.list(userId)).toHaveLength(1); expect(executed).toHaveLength(1); expect(requests).toHaveLength(1);
    const outbound = JSON.stringify(requests[0]);
    expect(outbound).toContain("Original task: Implement parser recovery.");
    expect(outbound).toContain("Latest instruction: Only change parser.ts; preserve its API.");
    expect(threads.getById(thread.id)?.routingPlan?.intent).not.toBe("review");
    expect(threads.getExecutionCheckpoint(thread.id)?.calls).toBe(3);
    await (app as any).recoverInterruptedThreadTurns(); expect(requests).toHaveLength(1);
  });
});
