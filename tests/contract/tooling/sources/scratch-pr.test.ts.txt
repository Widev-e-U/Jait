import { it } from "vitest";
import { loadConfig } from "./config.js";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { ProviderRegistry } from "./providers/registry.js";
import { signAuthToken } from "./security/http-auth.js";
import { createServer } from "./server.js";
import { ThreadService } from "./services/threads.js";
import type { CliProviderAdapter, ProviderEvent, ProviderInfo, ProviderSession, StartSessionOptions } from "./providers/contracts.js";
import { EventEmitter } from "node:events";

class StubProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = { id: "codex", name: "Stub", description: "", available: true, modes: ["full-access"] };
  private emitter = new EventEmitter();
  async checkAvailability() { return true; }
  async listModels() { return []; }
  async startSession(o: StartSessionOptions): Promise<ProviderSession> {
    return { id: "stub-1", providerId: this.id, threadId: o.threadId, status: "running", runtimeMode: o.mode, startedAt: new Date().toISOString() };
  }
  async sendTurn() {}
  async interruptTurn() {}
  async respondToApproval() {}
  async stopSession(sid: string) { this.emitter.emit("e", { type: "session.completed", sessionId: sid } satisfies ProviderEvent); }
  onEvent(h: (e: ProviderEvent) => void) { this.emitter.on("e", h); return () => { this.emitter.off("e", h); }; }
}

it("scratch: replicate pr-state flow", async () => {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const provider = new StubProvider();
  const registry = new ProviderRegistry();
  registry.register(provider);
  const threadService = new ThreadService(db);
  const app = await createServer({ ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test" }, {
    db, sqlite, threadService, providerRegistry: registry,
  });
  const token = await signAuthToken({ id: "u", username: "u" }, (loadConfig()).jwtSecret);
  const res = await app.inject({
    method: "POST", url: "/api/threads",
    headers: { authorization: `Bearer ${token}` },
    payload: { title: "PR Test", providerId: "codex", workingDirectory: process.cwd() },
  });
  const thread = JSON.parse(res.body) as { id: string };
  console.error("thread row:", res.body.slice(0, 600));
  const origPrepare = sqlite.prepare.bind(sqlite);
  (sqlite as { prepare(sql: string): unknown }).prepare = (sql: string) => {
    const stmt = origPrepare(sql);
    const origRun = (stmt as { run(...p: unknown[]): unknown }).run.bind(stmt);
    const wrapped: Record<string, unknown> = {
      run(...p: unknown[]) {
        console.error("SQL:", sql);
        console.error("PARAMS:", JSON.stringify(p));
        return origRun(...p);
      },
    };
    for (const k of Object.keys(stmt as unknown as object)) wrapped[k] = (stmt as unknown as Record<string, unknown>)[k];
    for (const k of Object.getOwnPropertyNames(stmt)) wrapped[k] = Object.getOwnPropertyDescriptor(stmt, k)?.value;
    return wrapped as unknown as typeof stmt;
  };
  try {
    threadService.markCompleted(thread.id);
    console.error("markCompleted OK");
  } catch (e) {
    console.error("markCompleted FAILED:", (e as Error).message);
  }
  await app.close();
});
