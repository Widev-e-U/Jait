import { describe, expect, it } from "vitest";
import { AcpProvider } from "./acp-provider.js";

const fakeAcpBackgroundTerminalScript = `
process.stdin.setEncoding("utf8");
let buffer = "";
let sessionId = null;
let terminalCapability = null;
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.method === "initialize") {
      terminalCapability = request.params.clientCapabilities.terminal;
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
      }) + "\\n");
    } else if (request.method === "session/new") {
      sessionId = "acp-session-1";
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { sessionId } }) + "\\n");
    } else if (request.method === "session/set_mode") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }) + "\\n");
    } else if (request.method === "session/prompt") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId,
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: String(terminalCapability) } },
        },
      }) + "\\n");
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { stopReason: "end_turn" } }) + "\\n");
    }
  }
});
`;

describe("ACP terminal and approval boundaries", () => {
  it("rejects native terminals and resolves approvals only once", async () => {
    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Codex via ACP", command: process.execPath, args: ["-e", fakeAcpBackgroundTerminalScript] });
    try {
      const session = await provider.startSession({ threadId: "thread-1", workingDirectory: process.cwd(), mode: "full-access" });
      const state = (provider as any).sessions.get(session.id);
      const client = state.client;
      await expect(client.createTerminal({})).rejects.toThrow("Provider-native terminals are disabled");
      await expect(client.terminalOutput({ terminalId: "missing" })).rejects.toThrow("Unknown terminal");
      await expect(client.waitForTerminalExit({ terminalId: "missing" })).rejects.toThrow("Unknown terminal");
      await expect(client.killTerminal({ terminalId: "missing" })).rejects.toThrow("Unknown terminal");
      await expect(client.releaseTerminal({ terminalId: "missing" })).resolves.toEqual({});
      let outcome: unknown;
      state.approvals.set("request", { allowOptionId: "yes", rejectOptionId: "no", resolve: (value: unknown) => { outcome = value; } });
      await provider.respondToApproval(session.id, "request", false);
      expect(outcome).toEqual({ outcome: { outcome: "selected", optionId: "no" } });
      expect(state.approvals.has("request")).toBe(false);
      await expect(provider.respondToApproval(session.id, "request", true)).resolves.toBeUndefined();
    } finally {
      await provider.dispose();
    }
  });
});
