import { describe, expect, it } from "vitest";
import { buildCodexMcpConfigArgs } from "./codex-provider.js";

describe("buildCodexMcpConfigArgs", () => {
  it("maps streamable HTTP MCP servers to Codex config overrides", () => {
    expect(buildCodexMcpConfigArgs([
      { name: "jait", transport: "sse", url: "http://gateway.test/mcp/sse" },
    ])).toEqual([
      "-c",
      'mcp_servers.jait.url="http://gateway.test/mcp/sse"',
    ]);
  });

  it("maps stdio MCP servers including args and env", () => {
    expect(buildCodexMcpConfigArgs([
      {
        name: "local",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        env: { FOO: "bar" },
      },
    ])).toEqual([
      "-c",
      'mcp_servers.local.command="node"',
      "-c",
      'mcp_servers.local.args=["server.js"]',
      "-c",
      'mcp_servers.local.env.FOO="bar"',
    ]);
  });
});
