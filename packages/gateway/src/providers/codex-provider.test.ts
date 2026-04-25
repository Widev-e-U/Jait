import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCodexMcpConfigArgs, CodexProvider } from "./codex-provider.js";

const originalCodexHome = process.env.CODEX_HOME;
const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;
  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiKey;
});

describe("buildCodexMcpConfigArgs", () => {
  it("maps streamable HTTP MCP servers to Codex config overrides", () => {
    expect(buildCodexMcpConfigArgs([
      { name: "jait", transport: "sse", url: "http://gateway.test/mcp" },
    ])).toEqual([
      "-c",
      'mcp_servers.jait.url="http://gateway.test/mcp"',
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

describe("CodexProvider auth status", () => {
  it("tracks Codex CLI credentials separately from OPENAI_API_KEY", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-auth-"));
    process.env.CODEX_HOME = codexHome;
    process.env.OPENAI_API_KEY = "server-openai-key";

    try {
      const provider = new CodexProvider();

      await expect(provider.getAuthStatus()).resolves.toMatchObject({
        authenticated: false,
      });

      mkdirSync(codexHome, { recursive: true });
      writeFileSync(join(codexHome, "auth.json"), JSON.stringify({
        tokens: { access_token: "token" },
      }), "utf-8");

      await expect(provider.getAuthStatus()).resolves.toMatchObject({
        authenticated: true,
      });
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  });
});
