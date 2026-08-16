import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";
import { createToolRegistry } from "../tools/index.js";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { ProviderRegistry } from "../providers/registry.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
function toolCallStream(name: string, args: string): Response {
  return sseResponse([
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"${name}","arguments":"${args}"}}]},"finish_reason":null}]}\n\n`,
    `data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n`,
    "data: [DONE]\n\n",
  ]);
}
function textStream(text: string): Response {
  return sseResponse([
    `data: {"choices":[{"delta":{"content":"${text}"},"finish_reason":null}]}\n\n`,
    `data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n`,
    "data: [DONE]\n\n",
  ]);
}
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("swarm specialist live prose (native jait provider)", () => {
  it("forwards the specialist's tokens as tool_output events before the agent tool_result", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("swarm-live-prose", "password123");
    const session = sessionService.create({ userId: user.id, name: "Swarm" });
    const surfaceRegistry = new SurfaceRegistry();
    const toolRegistry = createToolRegistry(surfaceRegistry, {
      config: testConfig as any,
      userService,
      providerRegistry: new ProviderRegistry(),
    });

    const agentArgs = JSON.stringify({
      prompt: "Do the work",
      description: "Developer",
      allowedTools: "file.list",
    }).replace(/"/g, '\\"');
    let fetchCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("http://127.0.0.1:")) return originalFetch(input, init);
      const call = fetchCalls++;
      if (call === 0) return toolCallStream("agent", agentArgs);
      if (call === 1) return textStream("specialist live prose");
      return textStream("final answer");
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      toolRegistry,
      surfaceRegistry,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    try {
      const address = app.server.address() as import("node:net").AddressInfo;
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const response = await originalFetch(`http://127.0.0.1:${address.port}/api/chat`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ content: "do it", sessionId: session.id, mode: "swarm", model: "test-model" }),
      });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const events: any[] = [];
      let startedAt = Date.now();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload);
            if (obj && typeof obj.type === "string") events.push({ ...obj, _t: Date.now() - startedAt });
          } catch {}
        }
        if (Date.now() - startedAt > 15000) throw new Error("timeout");
      }
      buffer += decoder.decode();

      const types = events.map((e) => e.type);
      console.log("FETCH CALLS:", fetchCalls);
      console.log("TYPES:", types.join(","));
      const prose = events.find((e) => e.type === "tool_output" && String(e.content).includes("specialist live prose"));
      const agentResultIdx = events.findIndex((e) => e.type === "tool_result");
      // The gateway emits a synthetic `request` turn-boundary event first, then
      // the agent loop emits the `mode_notice`.
      expect(types[0]).toBe("request");
      expect(types).toContain("mode_notice");
      expect(prose, "expected a live tool_output with specialist prose. Types: " + types.join(",")).toBeTruthy();
      const proseIdx = events.indexOf(prose);
      if (agentResultIdx !== -1) expect(proseIdx).toBeLessThan(agentResultIdx);
    } finally {
      await app.close();
    }
  });
});
