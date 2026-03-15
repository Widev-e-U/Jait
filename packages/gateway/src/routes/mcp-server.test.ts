import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import {
  handleMcpRequest,
  listToolsForMcp,
  resolveMcpBaseUrl,
} from "./mcp-server.js";

describe("mcp-server", () => {
  it("exposes only non-core builtin tools over MCP", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "read",
      description: "Core read tool",
      tier: "core",
      category: "filesystem",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    registry.register({
      name: "cron.add",
      description: "Create a cron job",
      tier: "standard",
      category: "scheduler",
      source: "builtin",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    registry.register({
      name: "mcp.github.create_issue",
      description: "External MCP tool",
      tier: "external",
      category: "external",
      source: "mcp",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });

    expect(listToolsForMcp(registry).map((tool) => tool.name)).toEqual(["cron.add"]);

    const response = await handleMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }, registry);

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          {
            name: "cron.add",
            description: "Create a cron job",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
          },
        ],
      },
    });
  });

  it("builds the MCP callback base URL from forwarded headers", () => {
    expect(resolveMcpBaseUrl({
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "gateway.example.com",
        host: "ignored.local:3000",
      },
      protocol: "http",
      hostname: "ignored.local",
    }, { host: "0.0.0.0", port: 3000 })).toBe("https://gateway.example.com");
  });

  it("falls back to the incoming host header before config defaults", () => {
    expect(resolveMcpBaseUrl({
      headers: {
        host: "127.0.0.1:4111",
      },
      protocol: "http",
      hostname: "127.0.0.1",
    }, { host: "0.0.0.0", port: 3000 })).toBe("http://127.0.0.1:4111");
  });
});
