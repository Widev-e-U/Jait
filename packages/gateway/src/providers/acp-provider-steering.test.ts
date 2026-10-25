import { describe, expect, it } from "vitest";
import { AcpProvider } from "./acp-provider.js";

// Exercise negotiation and turn ownership through the real SDK/JSON-RPC boundary.
function agentScript(supported: boolean, outcome: string): string {
  return `
    const readline = require("node:readline");
    const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
    let pending;
    readline.createInterface({ input: process.stdin }).on("line", line => {
      const request = JSON.parse(line);
      if (request.method === "initialize") {
        send(request.id, { protocolVersion: 1, agentCapabilities: {}, authMethods: [], _meta: { steering: { supported: ${supported} } } });
      } else if (request.method === "session/new") {
        send(request.id, { sessionId: "fake-session" });
      } else if (request.method === "session/prompt") {
        pending = request.id;
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ready" } } } }) + "\\n");
      } else if (request.method === "_session/steering") {
        const valid = request.params.sessionId === "fake-session"
          && request.params.prompt[0].text === "steer message"
          && request.params._meta.steering.idleBehavior === "promptRequired";
        send(request.id, { outcome: valid ? ${JSON.stringify(outcome)} : "invalid-payload" });
        send(pending, { stopReason: "end_turn" });
      } else if (request.method === "session/cancel") {
        if (pending !== undefined) send(pending, { stopReason: "cancelled" });
      } else { send(request.id, {}); }
    });
  `;
}

describe("ACP steering negotiation", () => {
  it.each(["injected", "startedNewTurn", "promptRequired", "unknown"])("handles %s while retaining prompt ownership", async outcome => {
    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript(true, outcome)] });
    try {
      const session = await provider.startSession({ threadId: "steering-test", workingDirectory: process.cwd() });
      expect(await provider.steerTurn(session.id, "steer message")).toBe(false);
      let ready!: () => void;
      const started = new Promise<void>(resolve => { ready = resolve; });
      const unsubscribe = provider.onEvent(event => { if (event.type === "token") ready(); });
      const turn = provider.sendTurn(session.id, "original message");
      try {
        await started;
        const steering = provider.steerTurn(session.id, "steer message");
        if (outcome === "unknown") await expect(steering).rejects.toThrow("unknown outcome");
        else expect(await steering).toBe(outcome !== "promptRequired");
        await turn;
        expect(await provider.steerTurn(session.id, "steer message")).toBe(false);
      } finally { unsubscribe(); }
    } finally { await provider.dispose(); }
  });

  it("does not send steering when the provider did not negotiate it", async () => {
    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript(false, "unknown")] });
    try {
      const session = await provider.startSession({ threadId: "unsupported-steering", workingDirectory: process.cwd() });
      expect(await provider.steerTurn(session.id, "steer message")).toBe(false);
    } finally { await provider.dispose(); }
  });
});

describe("ACP MCP transport configuration", () => {
  it("preserves stdio environment and remote headers across the SDK boundary", async () => {
    const expected = [
      { name: "local", command: "fixture-command", args: ["--fixture"], env: [{ name: "FIXTURE", value: "value" }] },
      { type: "http", name: "http", url: "https://http.invalid/mcp", headers: [{ name: "X-Fixture", value: "http" }] },
      { type: "sse", name: "sse", url: "https://sse.invalid/events", headers: [{ name: "X-Fixture", value: "sse" }] },
    ];
    const script = `
      const readline = require("node:readline");
      const expected = ${JSON.stringify(expected)};
      readline.createInterface({ input: process.stdin }).on("line", line => {
        const request = JSON.parse(line);
        let result = {};
        if (request.method === "initialize") result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
        if (request.method === "session/new") {
          if (JSON.stringify(request.params.mcpServers) !== JSON.stringify(expected)) {
            process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32602, message: "MCP configuration was changed" } }) + "\\n");
            return;
          }
          result = { sessionId: "mcp-fixture" };
        }
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
      });
    `;
    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", script] });
    try {
      const session = await provider.startSession({ threadId: "mcp-test", workingDirectory: process.cwd(), mode: "default", mcpServers: [
        { name: "local", transport: "stdio", command: "fixture-command", args: ["--fixture"], env: { FIXTURE: "value" } },
        { name: "http", transport: "http", url: "https://http.invalid/mcp", headers: { "X-Fixture": "http" } },
        { name: "sse", transport: "sse", url: "https://sse.invalid/events", headers: { "X-Fixture": "sse" } },
      ] });
      expect(session.status).toBe("running");
    } finally { await provider.dispose(); }
  });
});
