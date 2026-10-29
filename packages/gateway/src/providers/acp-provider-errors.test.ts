import { describe, expect, it } from "vitest";
import { AcpProvider } from "./acp-provider.js";
import type { ProviderEvent } from "./contracts.js";

const capacityError = "Selected model is at capacity. Please try a different model.";
const failureMeta = {
  jetbrains: { air: { version: 1, sessionFailure: {
    id: "turn:error", severity: "error", title: capacityError,
  } } },
};

// Exercise the real ACP process/SDK boundary. The external provider alone is fake.
function agentScript(scenario: string): string {
  return `
    const readline = require("node:readline");
    const scenario = ${JSON.stringify(scenario)};
    const errorText = ${JSON.stringify(capacityError)};
    const meta = ${JSON.stringify(failureMeta)};
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      let result = {};
      if (request.method === "initialize") {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
      } else if (request.method === "session/new") {
        result = { sessionId: "fake-session" };
      } else if (request.method === "session/prompt") {
        const update = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session", update } });
        update({ sessionUpdate: "agent_message_chunk", messageId: "progress", content: { type: "text", text: "Checking now. " } });
        if (scenario === "legacy") {
          update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: errorText + "\\n\\n" } });
        } else if (scenario === "notification") {
          update({ sessionUpdate: "session_info_update", _meta: meta });
        } else if (scenario === "quote") {
          update({ sessionUpdate: "agent_message_chunk", messageId: "reply", content: { type: "text", text: errorText } });
        }
        if (scenario === "diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "TypeError", frames: ["resume (index.js:123:4)", "secret /private/path:1:2"] };
        }
        result = { stopReason: "end_turn", ...(["result", "diagnostic"].includes(scenario) ? { _meta: meta } : {}) };
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    });
  `;
}

describe("ACP provider error display", () => {
  it.each(["legacy", "notification", "result"])("routes %s failure to error instead of assistant text/completion", async (scenario) => {
    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript(scenario)] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "error-repro", workingDirectory: process.cwd() });
      await expect(provider.sendTurn(session.id, "test")).rejects.toThrow(capacityError);
      expect(events.filter((event) => event.type === "token").map((event) => event.content).join("")).toBe("Checking now. ");
      expect(events.filter((event) => event.type === "session.error")).toEqual([{ type: "session.error", sessionId: session.id, error: capacityError }]);
      expect(events.some((event) => event.type === "turn.completed")).toBe(false);
      expect(session.status).toBe("error");
    } finally { unsubscribe(); await provider.dispose(); }
  });

  it("retains bounded exception diagnostics without arbitrary paths", async () => {
    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript("diagnostic")] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "diagnostic", workingDirectory: process.cwd() });
      await expect(provider.sendTurn(session.id, "test")).rejects.toThrow("Diagnostic: TypeError; resume (index.js:123:4)");
      expect(events.filter((event) => event.type === "session.error")).toEqual([{
        type: "session.error", sessionId: session.id,
        error: `${capacityError} Diagnostic: TypeError; resume (index.js:123:4)`,
      }]);
    } finally { unsubscribe(); await provider.dispose(); }
  });

  it.each(["success", "quote"])("preserves %s assistant output", async (scenario) => {
    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript(scenario)] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "error-repro", workingDirectory: process.cwd() });
      await provider.sendTurn(session.id, "test");
      expect(events.some((event) => event.type === "session.error")).toBe(false);
      expect(events.some((event) => event.type === "turn.completed")).toBe(true);
      expect(events.filter((event) => event.type === "token").map((event) => event.content).join("")).toBe("Checking now. " + (scenario === "quote" ? capacityError : ""));
    } finally { unsubscribe(); await provider.dispose(); }
  });
});
