import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AcpProvider, loadAcpProviderConfigs } from "./acp-provider.js";
import type { ProviderEvent } from "./contracts.js";

const originalCodexHome = process.env.CODEX_HOME;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

const fakeAcpAgentScript = `
process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.method === "initialize") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: 1,
          agentCapabilities: { auth: { logout: {} } },
          authMethods: [{ id: "test-login", name: "Test login" }]
        }
      }) + "\\n");
    } else if (request.method === "logout") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }) + "\\n");
    }
  }
});
`;

const fakeAcpAuthRequiredScript = `
process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.method === "initialize") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: 1,
          agentCapabilities: {},
          authMethods: []
        }
      }) + "\\n");
    } else if (request.method === "session/new") {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message: "Authentication required" }
      }) + "\\n");
    }
  }
});
`;

const fakeAcpTerminalAuthScript = `
if (process.argv.includes("--login")) {
  process.stdout.write([
    "Follow these steps to sign in with ChatGPT using device code authorization:",
    "1. Open this link in your browser and sign in to your account",
    "   https://auth.openai.com/codex/device",
    "2. Enter this one-time code (expires in 15 minutes)",
    "   1URT-UU74B",
    ""
  ].join("\\n"));
  setInterval(() => {}, 1000);
} else {
  process.stdin.setEncoding("utf8");
  let buffer = "";
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const request = JSON.parse(line);
      if (request.method === "initialize") {
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: 1,
            agentCapabilities: { auth: { logout: {} } },
            authMethods: [{ id: "chat-gpt", name: "ChatGPT", type: "terminal", args: ["--login"] }]
          }
        }) + "\\n");
      } else if (request.method === "logout") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }) + "\\n");
      }
    }
  });
}
`;

const fakeCodexDeviceAuthScript = `
process.stdout.write([
  "Follow these steps to sign in with ChatGPT using device code authorization:",
  "1. Open this link in your browser and sign in to your account",
  "   https://auth.openai.com/codex/device",
  "2. Enter this one-time code (expires in 15 minutes)",
  "   8K2R-X4D9",
  ""
].join("\\n"));
setInterval(() => {}, 1000);
`;

afterEach(() => {
  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = originalCodexHome;
  }
  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }
});

describe("AcpProvider MCP startup events", () => {
  it("replays early Jait MCP startup failures to later subscribers", () => {
    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAgentScript],
    });

    provider.handleSessionUpdate("provider-session-1", {
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "mcp_startup.jait",
        title: "mcp__jait__startup",
        kind: "other",
        status: "failed",
        content: [{
          type: "content",
          content: {
            type: "text",
            text: "[codex-acp forwarded startup error] MCP server `jait` failed to start: connection refused",
          },
        }],
      },
    } as any);

    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    unsubscribe();

    expect(events).toContainEqual({
      type: "tool.start",
      sessionId: "provider-session-1",
      tool: "mcp__jait__startup",
      args: undefined,
      callId: "mcp_startup.jait",
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool.result",
      sessionId: "provider-session-1",
      tool: "mcp__jait__startup",
      ok: false,
      callId: "mcp_startup.jait",
      message: expect.stringContaining("MCP server `jait` failed to start"),
    }));
    expect(events.find((event) => event.type === "tool.result")).toMatchObject({
      message: "[codex-acp forwarded startup error] MCP server `jait` failed to start: connection refused",
    });
  });
});

describe("AcpProvider Codex ACP tool payloads", () => {
  it("emits read file paths from ACP locations instead of empty rawInput", () => {
    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAgentScript],
    });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));

    provider.handleSessionUpdate("provider-session-1", {
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call-read",
        kind: "read",
        title: "Read file",
        status: "in_progress",
        locations: [{ path: "/tmp/jait-acp-capture/sample.txt" }],
      },
    } as any);
    unsubscribe();

    expect(events).toContainEqual({
      type: "tool.start",
      sessionId: "provider-session-1",
      tool: "read",
      callId: "call-read",
      args: {
        title: "Read file",
        kind: "read",
        locations: [{ path: "/tmp/jait-acp-capture/sample.txt" }],
        path: "/tmp/jait-acp-capture/sample.txt",
      },
    });
  });

  it("emits edit file paths and diff text from ACP diff content", () => {
    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAgentScript],
    });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));

    provider.handleSessionUpdate("provider-session-1", {
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call-edit",
        kind: "edit",
        title: "Editing files",
        status: "in_progress",
        content: [{
          type: "diff",
          path: "/tmp/jait-acp-capture/sample.txt",
          oldText: "Alpha\n",
          newText: "Beta\n",
          _meta: { kind: "update" },
        }],
      },
    } as any);
    unsubscribe();

    expect(events).toContainEqual({
      type: "tool.start",
      sessionId: "provider-session-1",
      tool: "edit",
      callId: "call-edit",
      args: {
        title: "Editing files",
        kind: "edit",
        content: [{
          type: "diff",
          path: "/tmp/jait-acp-capture/sample.txt",
          oldText: "Alpha\n",
          newText: "Beta\n",
          _meta: { kind: "update" },
        }],
        changes: [{
          path: "/tmp/jait-acp-capture/sample.txt",
          oldText: "Alpha\n",
          newText: "Beta\n",
          kind: "update",
        }],
        path: "/tmp/jait-acp-capture/sample.txt",
        search: "Alpha\n",
        replace: "Beta\n",
      },
    });
  });
});

describe("AcpProvider auth", () => {
  it("exposes ACP-managed login for default ACP providers", () => {
    const providers = loadAcpProviderConfigs().map((config) => new AcpProvider(config));

    expect(providers.find((provider) => provider.id === "codex")?.info.auth).toMatchObject({
      login: true,
      logout: false,
      deviceCode: false,
    });
    expect(providers.find((provider) => provider.id === "claude-code")?.info.auth).toMatchObject({
      login: true,
      logout: false,
      deviceCode: false,
    });
  });

  it("reports Codex ACP auth from CODEX_HOME credentials", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-home-"));
    process.env.CODEX_HOME = codexHome;
    delete process.env.OPENAI_API_KEY;
    writeFileSync(join(codexHome, "auth.json"), JSON.stringify({ tokens: { access_token: "token" } }));

    try {
      const provider = new AcpProvider({
        id: "codex",
        name: "Codex",
        description: "Codex via ACP",
        command: process.execPath,
        args: ["-e", fakeAcpAgentScript],
      });

      await expect(provider.getAuthStatus()).resolves.toMatchObject({
        login: true,
        logout: true,
        deviceCode: false,
        authenticated: true,
      });
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it("does not use OPENAI_API_KEY as Codex auth state", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-home-"));
    process.env.CODEX_HOME = codexHome;
    process.env.OPENAI_API_KEY = "env-key";

    try {
      const provider = new AcpProvider({
        id: "codex",
        name: "Codex",
        description: "Codex via ACP",
        command: process.execPath,
        args: ["-e", fakeAcpAgentScript],
      });

      await expect(provider.getAuthStatus()).resolves.toMatchObject({
        login: true,
        logout: false,
        deviceCode: false,
        authenticated: false,
      });
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it("keeps Codex logout available when env API key and local credentials coexist", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-home-"));
    const authPath = join(codexHome, "auth.json");
    process.env.CODEX_HOME = codexHome;
    process.env.OPENAI_API_KEY = "env-key";
    writeFileSync(authPath, JSON.stringify({ tokens: { access_token: "token" } }));

    try {
      const provider = new AcpProvider({
        id: "codex",
        name: "Codex",
        description: "Codex via ACP",
        command: process.execPath,
        args: ["-e", fakeAcpAgentScript],
      });

      await expect(provider.getAuthStatus()).resolves.toMatchObject({
        login: true,
        logout: true,
        deviceCode: false,
        authenticated: true,
      });

      await expect(provider.logout()).resolves.toMatchObject({
        ok: true,
        status: "completed",
      });
      expect(existsSync(authPath)).toBe(false);
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it("surfaces ACP model discovery failures instead of returning fallback models", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-home-"));
    process.env.CODEX_HOME = codexHome;
    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAuthRequiredScript],
    });

    try {
      await expect(provider.listModels()).rejects.toThrow("Authentication required");
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it("does not describe Codex ACP model discovery auth errors as logged out when credentials exist", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-home-"));
    process.env.CODEX_HOME = codexHome;
    writeFileSync(join(codexHome, "auth.json"), JSON.stringify({ tokens: { access_token: "token" } }));
    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAuthRequiredScript],
    });

    try {
      await expect(provider.listModels()).rejects.toThrow(
        "Codex is logged in, but the provider rejected model discovery: Authentication required. Check provider usage limits or account access.",
      );
    } finally {
      rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it("returns device auth details from ACP terminal login output", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-home-"));
    const agentDir = mkdtempSync(join(tmpdir(), "jait-acp-agent-"));
    const agentPath = join(agentDir, "fake-acp-terminal-auth.mjs");
    process.env.CODEX_HOME = codexHome;
    writeFileSync(agentPath, fakeAcpTerminalAuthScript);

    const provider = new AcpProvider({
      id: "custom-acp",
      name: "Custom ACP",
      description: "Custom provider via ACP",
      command: process.execPath,
      args: [agentPath],
    });

    try {
      await expect(provider.startLogin()).resolves.toMatchObject({
        ok: true,
        status: "started",
        verificationUri: "https://auth.openai.com/codex/device",
        userCode: "1URT-UU74B",
      });
    } finally {
      await provider.logout().catch(() => undefined);
      rmSync(codexHome, { recursive: true, force: true });
      rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it("uses Codex CLI device auth without probing ACP for Codex login", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-home-"));
    const agentDir = mkdtempSync(join(tmpdir(), "jait-acp-agent-"));
    const loginPath = join(agentDir, "fake-codex-device-auth.mjs");
    process.env.CODEX_HOME = codexHome;
    writeFileSync(loginPath, fakeCodexDeviceAuthScript);

    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: "missing-acp-command-for-login-test",
      env: {
        JAIT_CODEX_LOGIN_COMMAND: `"${process.execPath}" "${loginPath}"`,
      },
    });

    try {
      await expect(provider.startLogin()).resolves.toMatchObject({
        ok: true,
        status: "started",
        verificationUri: "https://auth.openai.com/codex/device",
        userCode: "8K2R-X4D9",
      });
    } finally {
      await provider.logout().catch(() => undefined);
      rmSync(codexHome, { recursive: true, force: true });
      rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it("exposes ACP-managed auth for custom ACP providers by default", () => {
    const provider = new AcpProvider({
      id: "custom-acp",
      name: "Custom ACP",
      description: "Custom provider",
      command: "custom",
    });

    expect(provider.info.auth).toMatchObject({
      login: true,
      logout: false,
      deviceCode: false,
    });
  });

  it("allows custom ACP providers to opt out of Jait auth actions", () => {
    const provider = new AcpProvider({
      id: "custom-acp",
      name: "Custom ACP",
      description: "Custom provider",
      command: "custom",
      auth: false,
    });

    expect(provider.info.auth).toMatchObject({
      login: false,
      logout: false,
      deviceCode: false,
    });
  });
});
