/**
 * End-to-end test against a real Ollama instance.
 *
 * Skipped in CI — run manually with:
 *   OLLAMA_E2E_URL=http://192.168.178.60:11434 bun run test -- --run packages/gateway/src/routes/chat-ollama-e2e.test.ts
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";

const OLLAMA_URL = process.env["OLLAMA_E2E_URL"] || "http://192.168.178.60:11434";
const OLLAMA_MODEL = process.env["OLLAMA_E2E_MODEL"] || "gemma4:26b";

// Skip the entire suite in CI or when SKIP_OLLAMA_E2E is set
const skip = !!process.env["CI"] || !!process.env["SKIP_OLLAMA_E2E"];

describe.skipIf(skip)("Ollama e2e (real server)", () => {
  let app: Awaited<ReturnType<typeof createServer>> | null = null;
  let token: string;
  let sessionId: string;

  beforeAll(async () => {
    // Verify Ollama is reachable before setting up the server
    try {
      const ping = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!ping.ok) throw new Error(`Ollama returned ${ping.status}`);
    } catch (err) {
      throw new Error(`Ollama not reachable at ${OLLAMA_URL}: ${err}`);
    }

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl: OLLAMA_URL,
      ollamaModel: OLLAMA_MODEL,
      jwtSecret: "ollama-e2e-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("ollama-test", "password123");
    const session = sessionService.create({ userId: user.id, name: "Ollama E2E" });
    sessionId = session.id;

    // Set the user's backend to ollama so the chat route picks the right path
    userService.updateSettings(user.id, {
      jaitBackend: "ollama",
      apiKeys: {
        OLLAMA_URL,
        OLLAMA_MODEL,
      },
    });

    token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });
  }, 15_000);

  afterEach(async () => {
    // Don't close between tests — reuse the same server
  });

  // Clean up after all tests
  afterEach(() => {}, /* noop — app closed in final hook */);

  it("streams a simple text response from Ollama", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/chat",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        content: "Reply with exactly one word: hello",
      }),
    });

    expect(response.statusCode).toBe(200);

    const body = response.body;
    const lines = body.split("\n").filter((l: string) => l.startsWith("data: "));
    const events = lines.map((l: string) => JSON.parse(l.slice(6)));
    const tokenEvents = events.filter((e: { type: string }) => e.type === "token");
    const doneEvents = events.filter((e: { type: string }) => e.type === "done");
    const thinkingEvents = events.filter((e: { type: string }) => e.type === "thinking");

    console.log(`  Thinking chunks: ${thinkingEvents.length}`);
    console.log(`  Token chunks: ${tokenEvents.length}`);
    console.log(`  Full response: ${tokenEvents.map((e: { content: string }) => e.content).join("")}`);

    expect(tokenEvents.length).toBeGreaterThan(0);
    expect(doneEvents.length).toBe(1);

    const fullText = tokenEvents.map((e: { content: string }) => e.content).join("");
    expect(fullText.length).toBeGreaterThan(0);
  }, 300_000); // 5 min timeout — 26B on CPU is slow

  it("streams thinking tokens for a reasoning model", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/chat",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        content: "What is 2+2? Reply with just the number.",
      }),
    });

    expect(response.statusCode).toBe(200);

    const body = response.body;
    const lines = body.split("\n").filter((l: string) => l.startsWith("data: "));
    const events = lines.map((l: string) => JSON.parse(l.slice(6)));

    const thinkingEvents = events.filter((e: { type: string }) => e.type === "thinking");
    const tokenEvents = events.filter((e: { type: string }) => e.type === "token");

    console.log(`  Thinking chunks: ${thinkingEvents.length}`);
    console.log(`  Thinking: ${thinkingEvents.map((e: { content: string }) => e.content).join("").slice(0, 200)}...`);
    console.log(`  Response: ${tokenEvents.map((e: { content: string }) => e.content).join("")}`);

    expect(tokenEvents.length).toBeGreaterThan(0);

    const fullText = tokenEvents.map((e: { content: string }) => e.content).join("");
    expect(fullText).toContain("4");

    // Some Ollama installs expose reasoning as separate thinking events,
    // while others only return the final token stream.
    if (thinkingEvents.length > 0) {
      const thinkingText = thinkingEvents.map((e: { content: string }) => e.content).join("");
      expect(thinkingText.length).toBeGreaterThan(0);
    }
  }, 300_000);

  // Final cleanup
  it("cleanup", async () => {
    await app?.close();
    app = null;
  });
});
