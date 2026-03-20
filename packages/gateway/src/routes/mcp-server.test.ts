import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import {
  handleMcpRequest,
  listToolsForMcp,
  registerMcpRoutes,
  resolveMcpBaseUrl,
} from "./mcp-server.js";

let appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
});

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

  it("serves initialize over streamable HTTP MCP", async () => {
    const registry = new ToolRegistry();
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "2025-03-26",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["mcp-protocol-version"]).toBe("2025-03-26");
    expect(response.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: "jait-gateway",
          version: "1.0.0",
        },
      },
    });
  });

  it("accepts initialized notifications over streamable HTTP MCP", async () => {
    const registry = new ToolRegistry();
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.body).toBe("");
  });

  it("passes session and workspace overrides into MCP tool context", async () => {
    const registry = new ToolRegistry();
    let capturedContext: { sessionId: string; workspaceRoot: string } | null = null;

    registry.register({
      name: "surfaces.list",
      description: "List surfaces",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          workspaceRoot: context.workspaceRoot,
        };
        return { ok: true, message: "ok" };
      },
    });

    const response = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.list",
          arguments: {},
        },
      },
      registry,
      "2025-03-26",
      {
        sessionId: "web-session-123",
        workspaceRoot: "/tmp/project",
      },
    );

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: "ok" }],
        isError: false,
      },
    });
    expect(capturedContext).toEqual({
      sessionId: "web-session-123",
      workspaceRoot: "/tmp/project",
    });
  });
});
