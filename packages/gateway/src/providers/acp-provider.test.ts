import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AcpProvider, loadAcpProviderConfigs } from "./acp-provider.js";

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

const fakeAcpAgentChatGptScript = `
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
          authMethods: [{ id: "chat-gpt", name: "ChatGPT", description: "Use ChatGPT to authenticate" }]
        }
      }) + "\\n");
    } else if (request.method === "authenticate") {
      setInterval(() => {}, 1000);
    } else if (request.method === "logout") {
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
    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAuthRequiredScript],
    });

    await expect(provider.listModels()).rejects.toThrow("Authentication required");
  });

  it("returns device auth details from ACP terminal login output", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-home-"));
    const agentDir = mkdtempSync(join(tmpdir(), "jait-acp-agent-"));
    const agentPath = join(agentDir, "fake-acp-terminal-auth.mjs");
    process.env.CODEX_HOME = codexHome;
    writeFileSync(agentPath, fakeAcpTerminalAuthScript);

    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
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

  it("uses Codex CLI device auth for ACP ChatGPT agent login", async () => {
    const codexHome = mkdtempSync(join(tmpdir(), "jait-codex-home-"));
    const agentDir = mkdtempSync(join(tmpdir(), "jait-acp-agent-"));
    const loginPath = join(agentDir, "fake-codex-device-auth.mjs");
    process.env.CODEX_HOME = codexHome;
    writeFileSync(loginPath, fakeCodexDeviceAuthScript);

    const provider = new AcpProvider({
      id: "codex",
      name: "Codex",
      description: "Codex via ACP",
      command: process.execPath,
      args: ["-e", fakeAcpAgentChatGptScript],
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
