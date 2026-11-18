import { describe, expect, it } from "vitest";
import { AcpProvider } from "./acp-provider.js";
import type { ProviderEvent } from "./contracts.js";

// The external agent echoes what the real ACP SDK delivered to session/prompt.
const agentScript = `
  const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
  require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
    const request = JSON.parse(line);
    let result = {};
    if (request.method === "initialize") result = { protocolVersion: 1, agentCapabilities: { promptCapabilities: { image: true } }, authMethods: [] };
    if (request.method === "session/new") result = { sessionId: "attachment-test" };
    if (request.method === "session/prompt") {
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "attachment-test", update: {
        sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify(request.params.prompt) },
      } } });
      result = { stopReason: "end_turn" };
    }
    send({ jsonrpc: "2.0", id: request.id, result });
  });
`;

describe("ACP uploaded images", () => {
  it.each(["aGVsbG8=", "data:image/png;base64,aGVsbG8="])("delivers image bytes rather than a file link (%s)", async (data) => {
    const provider = new AcpProvider({ id: "codex", name: "Test", description: "Test", command: process.execPath, args: ["-e", agentScript] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent(event => events.push(event));
    let sessionId: string | undefined;
    try {
      const session = await provider.startSession({ threadId: "images", workingDirectory: process.cwd() });
      sessionId = session.id;
      await provider.sendTurn(session.id, "look at this", [{ name: "colleague.png", mimeType: "image/png", data }]);
      const received = JSON.parse(events.filter(event => event.type === "token").map(event => event.content).join(""));
      expect(received).toEqual([
        { type: "text", text: "look at this" },
        { type: "image", mimeType: "image/png", data: "aGVsbG8=" },
      ]);
    } finally {
      unsubscribe();
      if (sessionId) await provider.stopSession(sessionId);
    }
  });
});
