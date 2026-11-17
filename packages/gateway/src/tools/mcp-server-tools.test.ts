import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "./contracts.js";
import { McpManager } from "./mcp-bridge.js";
import { createMcpAddServerTool, loadMcpServerConfigs } from "./mcp-server-tools.js";
import { ToolRegistry } from "./registry.js";

const ctx = {} as ToolContext;
const TOKEN = "test-token-abc123";

let http: Server;
let url: string;
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jait-mcp-"));
  http = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    const server = new McpServer({ name: "fake", version: "1.0.0" });
    server.tool("ping", "Ping the fake server", async () => ({ content: [{ type: "text", text: "pong" }] }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
});

afterEach(async () => {
  http.closeAllConnections();
  await new Promise((r) => http.close(r));
  await rm(dir, { recursive: true, force: true });
});

describe("mcp.add_server", () => {
  it("registers an http server with headers, persists it privately and exposes its tools", async () => {
    const registry = new ToolRegistry();
    const manager = new McpManager(registry);
    const configPath = join(dir, "mcp-servers.json");
    const tool = createMcpAddServerTool({ manager, configPath });

    const res = await tool.execute(
      { name: "FakeGym", transport: "http", url, headers: { Authorization: `Bearer ${TOKEN}` } },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(registry.listNames()).toContain("mcp.fakegym.ping");
    expect(JSON.stringify(res)).not.toContain(TOKEN);

    const saved = await loadMcpServerConfigs(configPath);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);

    // Re-adding replaces rather than duplicates.
    await tool.execute({ name: "fakegym", transport: "http", url, headers: ["Authorization: Bearer " + TOKEN] }, ctx);
    expect(await loadMcpServerConfigs(configPath)).toHaveLength(1);
    manager.removeServer("fakegym");
  });

  it("saves but reports failure without leaking the token when the server rejects it", async () => {
    const manager = new McpManager(new ToolRegistry());
    const configPath = join(dir, "mcp-servers.json");
    const tool = createMcpAddServerTool({ manager, configPath });
    const res = await tool.execute(
      { name: "bad", transport: "http", url, headers: { Authorization: "Bearer wrong-token-999" } },
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain("wrong-token-999");
    expect(await readFile(configPath, "utf8")).toContain("wrong-token-999");
  });

  it("validates input", async () => {
    const tool = createMcpAddServerTool({ manager: new McpManager(new ToolRegistry()), configPath: join(dir, "c.json") });
    expect((await tool.execute({ name: "x", transport: "http" }, ctx)).ok).toBe(false);
    expect((await tool.execute({ name: "x", transport: "http", url: "ftp://a" }, ctx)).ok).toBe(false);
    expect((await tool.execute({ name: "x", transport: "stdio" }, ctx)).ok).toBe(false);
    expect((await tool.execute({ name: "!!!", transport: "stdio", command: "x" }, ctx)).ok).toBe(false);
    expect(
      (await tool.execute({ name: "x", transport: "http", url, headers: { "Bad Name": "v" } }, ctx)).ok,
    ).toBe(false);
  });
});
