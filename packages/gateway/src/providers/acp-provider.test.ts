import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AcpProvider, loadAcpProviderConfigs } from "./acp-provider.js";
import type { ProviderAuthStatus, ProviderEvent } from "./contracts.js";
import { backgroundCommandMonitor, type BackgroundCommandResult } from "../services/background-command-monitor.js";

const originalCodexHome = process.env.CODEX_HOME;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;

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

const fakeAcpModelTimeoutScript = `
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
        error: { code: -32000, message: "Operation timed out" }
      }) + "\\n");
    }
  }
});
`;

const fakeAcpNoModelsScript = `
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
        result: {
          sessionId: "session-no-models"
        }
      }) + "\\n");
    } else if (request.method === "session/close") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }) + "\\n");
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
  if (originalAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
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

  it("emits readable messages for completed ACP content wrappers", () => {
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
        sessionUpdate: "tool_call_update",
        toolCallId: "call-1",
        title: "read_file",
        status: "completed",
        rawOutput: [{
          type: "content",
          content: {
            type: "text",
            text: "Read packages/gateway/src/providers/acp-provider.ts",
          },
        }],
      },
    } as any);
    unsubscribe();

    expect(events).toContainEqual(expect.objectContaining({
      type: "tool.result",
      sessionId: "provider-session-1",
      tool: "read_file",
      ok: true,
      callId: "call-1",
      message: "Read packages/gateway/src/providers/acp-provider.ts",
    }));
  });
});

describe("AcpProvider thinking forwarding", () => {
  it("emits a thinking event for agent_thought_chunk text blocks", () => {
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
        sessionUpdate: "agent_thought_chunk",
        messageId: "msg-1",
        content: { type: "text", text: "Let me inspect the request handler" },
      },
    } as any);
    unsubscribe();

    expect(events).toContainEqual({
      type: "thinking",
      sessionId: "provider-session-1",
      content: "Let me inspect the request handler",
    });
  });

  it("unwraps nested content blocks from agent_thought_chunk", () => {
    const provider = new AcpProvider({
      id: "claude-code",
      name: "Claude Code",
      description: "Claude Code via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAgentScript],
    });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));

    provider.handleSessionUpdate("provider-session-1", {
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "content",
          content: { type: "text", text: "Nested reasoning here" },
        },
      },
    } as any);
    unsubscribe();

    expect(events).toContainEqual({
      type: "thinking",
      sessionId: "provider-session-1",
      content: "Nested reasoning here",
    });
  });

  it("drops non-text agent_thought_chunk content without crashing", () => {
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
        sessionUpdate: "agent_thought_chunk",
        content: { type: "image", image: {} },
      },
    } as any);
    unsubscribe();

    expect(events.filter((event) => event.type === "thinking")).toHaveLength(0);
  });
});

describe("AcpProvider Codex ACP tool payloads", () => {
  it("unwraps Codex code-mode Jait MCP calls", () => {
    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAgentScript],
    });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    const todoList = [{ id: 1, title: "Trace metadata", status: "in-progress" }];

    provider.handleSessionUpdate("provider-session-1", {
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "core.todo",
        kind: "other",
        status: "in_progress",
        rawInput: {
          server: "jait_core",
          tool: "todo",
          title: "mcp",
          arguments: { todoList },
        },
      },
    } as any);
    unsubscribe();

    expect(events).toContainEqual({
      type: "tool.start",
      sessionId: "provider-session-1",
      tool: "todo",
      callId: "core.todo",
      args: { todoList },
    });
  });

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

describe("AcpProvider Claude Code progressive tool updates", () => {
  function makeProvider() {
    return new AcpProvider({
      id: "claude-code",
      name: "Claude Code",
      description: "Claude Code via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAgentScript],
    });
  }

  it("re-emits an enriched tool.start when a tool_call_update carries the file path and diff", () => {
    const provider = makeProvider();
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));

    // Claude sends an empty skeleton tool_call first…
    provider.handleSessionUpdate("s1", {
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "toolu_1",
        title: "Edit",
        kind: "edit",
        status: "pending",
        rawInput: {},
        locations: [],
        content: [],
      },
    } as any);

    // …then fills in rawInput / locations / diff via an update.
    provider.handleSessionUpdate("s1", {
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "toolu_1",
        title: "Edit notes.txt",
        kind: "edit",
        rawInput: { file_path: "/x/notes.txt", old_string: "hello world", new_string: "goodbye world" },
        locations: [{ path: "/x/notes.txt" }],
        content: [{ type: "diff", path: "/x/notes.txt", oldText: "hello world", newText: "goodbye world" }],
      },
    } as any);
    unsubscribe();

    const starts = events.filter((e) => e.type === "tool.start") as Array<Extract<ProviderEvent, { type: "tool.start" }>>;
    expect(starts).toHaveLength(2);
    const enriched = starts[1]!;
    expect(enriched.tool).toBe("edit");
    const args = enriched.args as Record<string, unknown>;
    expect(args.path).toBe("/x/notes.txt");
    expect(args.search).toBe("hello world");
    expect(args.replace).toBe("goodbye world");
  });

  it("merges metadata across frames so a later update without kind still resolves the edit", () => {
    const provider = makeProvider();
    // Inject a tracked session so mergeToolCall accumulates across frames.
    (provider as unknown as { sessions: Map<string, { toolCalls: Map<string, Record<string, unknown>> }> })
      .sessions.set("s2", { toolCalls: new Map() });

    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));

    provider.handleSessionUpdate("s2", {
      update: { sessionUpdate: "tool_call", toolCallId: "toolu_2", title: "Edit", kind: "edit", status: "pending", rawInput: {}, locations: [], content: [] },
    } as any);

    // This update omits kind/rawInput/title — only locations + diff content.
    provider.handleSessionUpdate("s2", {
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "toolu_2",
        locations: [{ line: 1, path: "/x/notes.txt" }],
        content: [{ type: "diff", path: "/x/notes.txt", oldText: "hello world", newText: "goodbye world" }],
      },
    } as any);
    unsubscribe();

    const starts = events.filter((e) => e.type === "tool.start") as Array<Extract<ProviderEvent, { type: "tool.start" }>>;
    const enriched = starts.at(-1)!;
    // kind was carried over from the first frame via the merge accumulator.
    expect(enriched.tool).toBe("edit");
    const args = enriched.args as Record<string, unknown>;
    expect(args.path).toBe("/x/notes.txt");
    expect(args.search).toBe("hello world");
    expect(args.replace).toBe("goodbye world");
  });
});

describe("AcpProvider auth", () => {
  it("keeps the Jait core MCP namespace directly callable in Codex code mode", () => {
    const codex = loadAcpProviderConfigs().find((config) => config.id === "codex");
    const config = JSON.parse(codex?.env?.CODEX_CONFIG ?? "{}");

    expect(config.features?.code_mode?.direct_only_tool_namespaces).toContain("mcp__jait_core");
  });

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

  it("rechecks authentication while a login process is active", async () => {
    const provider = new AcpProvider({
      id: "codex-account",
      providerType: "codex",
      name: "Codex — Work",
      description: "Codex via ACP",
      command: process.execPath,
    });
    const internals = provider as unknown as {
      authLoginProcess: object | null;
      cachedAuthStatus: { status: ProviderAuthStatus; expiresAt: number } | null;
      _computeAuthStatus: () => Promise<ProviderAuthStatus>;
    };
    internals.cachedAuthStatus = {
      status: { login: true, logout: false, deviceCode: false, authenticated: false },
      expiresAt: Date.now() + 60_000,
    };
    internals.authLoginProcess = {};
    internals._computeAuthStatus = async () => ({
      login: true,
      logout: true,
      deviceCode: false,
      authenticated: true,
    });

    await expect(provider.getAuthStatus()).resolves.toMatchObject({ authenticated: true });
  });

  it("does not inherit gateway API keys into owned provider accounts", () => {
    process.env.ANTHROPIC_API_KEY = "gateway-key";
    const provider = new AcpProvider({
      id: "claude-code-account",
      providerType: "claude-code",
      ownerUserId: "user-1",
      name: "Claude Code — Work",
      description: "Claude Code via ACP",
      command: process.execPath,
      env: { ANTHROPIC_API_KEY: "" },
    });
    const internals = provider as unknown as {
      hasEnvironmentCredential: (name: string) => boolean;
    };

    expect(internals.hasEnvironmentCredential("ANTHROPIC_API_KEY")).toBe(false);
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

  it("uses account-scoped Codex credentials when the adapter id is an account id", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-account-home-"));
    const previousCodexHome = process.env.CODEX_HOME;
    delete process.env.CODEX_HOME;
    writeFileSync(join(codexHome, "auth.json"), JSON.stringify({ tokens: { access_token: "account-token" } }));

    try {
      const provider = new AcpProvider({
        id: "codex-019f7e48-8294-7646-a594-11cc0ba2f50b",
        providerType: "codex",
        ownerUserId: "user-1",
        name: "Codex — Work",
        description: "Codex via ACP",
        command: process.execPath,
        args: ["-e", fakeAcpAgentScript],
        env: { CODEX_HOME: codexHome },
      });

      expect(provider.providerType).toBe("codex");
      expect(provider.ownerUserId).toBe("user-1");
      await expect(provider.getAuthStatus()).resolves.toMatchObject({
        login: true,
        logout: true,
        authenticated: true,
      });
    } finally {
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
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

  it("returns Codex fallback models when ACP model discovery times out", async () => {
    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpModelTimeoutScript],
    });

    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({ id: "gpt-5-codex", isDefault: true }),
    ]);
  });

  it("returns Claude Code alias models when ACP model metadata is unavailable", async () => {
    const provider = new AcpProvider({
      id: "claude-code",
      name: "Claude Code",
      description: "Claude Code via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpNoModelsScript],
    });

    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({ id: "default", isDefault: true }),
      expect.objectContaining({ id: "fable" }),
      expect.objectContaining({ id: "sonnet" }),
      expect.objectContaining({ id: "opus" }),
      expect.objectContaining({ id: "haiku" }),
      expect.objectContaining({ id: "opusplan" }),
    ]);
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

const fakeAcpBackgroundTerminalScript = `
process.stdin.setEncoding("utf8");
let buffer = "";
let sessionId = null;
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
        result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
      }) + "\\n");
    } else if (request.method === "session/new") {
      sessionId = "acp-session-1";
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { sessionId } }) + "\\n");
    } else if (request.method === "session/set_mode") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }) + "\\n");
    } else if (request.method === "session/prompt") {
      // Delegate to the client's native terminal instead of spawning our own
      // subprocess, then end the turn immediately without waiting for exit —
      // mirroring an agent that runs a command "in the background".
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        id: 9001,
        method: "terminal/create",
        params: {
          sessionId,
          command: process.execPath,
          args: ["-e", "setTimeout(() => process.exit(3), 200)"],
        },
      }) + "\\n");
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { stopReason: "end_turn" } }) + "\\n");
    }
  }
});
`;

describe("AcpProvider native terminal capability", () => {
  afterEach(() => {
    backgroundCommandMonitor.clearForTests();
  });

  it("wakes the agent up when a command run via the ACP terminal finishes after the turn ends", async () => {
    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpBackgroundTerminalScript],
    });

    const completion = new Promise<BackgroundCommandResult>((resolve) => {
      backgroundCommandMonitor.setCompletionHandler((result) => {
        resolve(result);
      });
    });

    try {
      const session = await provider.startSession({
        threadId: "thread-1",
        workingDirectory: process.cwd(),
        mode: "full-access",
      });

      await provider.sendTurn(session.id, "run a background command");

      const result = await Promise.race([
        completion,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out waiting for completion")), 5000)),
      ]);

      expect(result.sessionId).toBe("thread-1");
      expect(result.exitCode).toBe(3);
    } finally {
      await provider.dispose();
    }
  });
});
