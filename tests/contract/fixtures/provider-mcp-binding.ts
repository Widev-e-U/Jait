import { AcpProvider } from "../../../packages/gateway/src/providers/acp-provider.js";
import { ProviderRegistry } from "../../../packages/gateway/src/providers/registry.js";

// Isolated ACP peer models codex-acp's saved-name filtering. No user config,
// browser, authentication files, or network endpoints are accessed.
export async function providerMcpBinding(providerType = "codex") {
  const script = `
    const readline = require("node:readline");
    let servers;
    const send = (id, result) => process.stdout.write(JSON.stringify({jsonrpc:"2.0",id,result}) + "\\n");
    readline.createInterface({input:process.stdin}).on("line", line => {
      const request = JSON.parse(line);
      if (request.method === "initialize") send(request.id, {protocolVersion:1,agentCapabilities:{},authMethods:[]});
      else if (request.method === "session/new") {
        servers = request.params.mcpServers.map(server => ({
          name:server.name,
          url:process.env.DISABLE_MCP_CONFIG_FILTERING === "true" ? server.url : "http://127.0.0.1:8765/mcp"
        }));
        send(request.id, {sessionId:"fixture-session"});
      } else if (request.method === "session/prompt") {
        process.stdout.write(JSON.stringify({jsonrpc:"2.0",method:"session/update",params:{sessionId:"fixture-session",update:{sessionUpdate:"agent_message_chunk",content:{type:"text",text:JSON.stringify({filtering:process.env.DISABLE_MCP_CONFIG_FILTERING,servers})}}}}) + "\\n");
        send(request.id, {stopReason:"end_turn"});
      } else if (request.id != null) send(request.id, {});
    });
  `;
  const provider = new AcpProvider({
    id: "account-fixture", providerType, name: "Fixture", description: "Isolated ACP peer",
    command: process.execPath, args: ["-e", script],
    env: { DISABLE_MCP_CONFIG_FILTERING: "false" },
  });
  const registry = new ProviderRegistry();
  const results = [];
  try {
    for (const chatId of ["personal-chat-a", "personal-chat-b"]) {
      let content = "";
      const unsubscribe = provider.onEvent(event => { if (event.type === "token") content += event.content; });
      try {
        const session = await provider.startSession({
          threadId: chatId, workingDirectory: process.cwd(),
          mcpServers: registry.buildJaitMcpServerRefs({host:"127.0.0.1",port:8765}, undefined, {sessionId:chatId}),
        });
        await provider.sendTurn(session.id, "report effective MCP bindings");
        results.push(JSON.parse(content));
        await provider.stopSession(session.id);
      } finally { unsubscribe(); }
    }
    return results;
  } finally { await provider.dispose(); }
}
