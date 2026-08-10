import { describe, expect, it, vi } from "vitest";
import { loadAcpRegistryProviderConfigs, parseAcpRegistry } from "./acp-registry.js";

describe("ACP registry provider catalog", () => {
  it("maps every supported registry distribution to an ACP provider", () => {
    const platform = process.platform === "win32" ? "windows" : process.platform;
    const architecture = process.arch === "arm64" ? "aarch64" : "x86_64";
    const target = `${platform}-${architecture}`;
    const providers = parseAcpRegistry({
      version: "1.0.0",
      agents: [
        {
          id: "grok-build",
          name: "Grok Build",
          version: "1.0.0",
          description: "xAI coding agent",
          distribution: {
            npx: {
              package: "@xai-official/grok@1.0.0",
              args: ["agent", "stdio"],
            },
          },
        },
        {
          id: "fast-agent",
          name: "fast-agent",
          version: "0.9.30",
          description: "Python ACP agent",
          distribution: {
            uvx: {
              package: "fast-agent-acp==0.9.30",
              args: ["-x"],
            },
          },
        },
        {
          id: "amp-acp",
          name: "Amp",
          version: "0.9.0",
          description: "Binary ACP agent",
          distribution: {
            binary: {
              [target]: {
                archive: "https://example.com/amp.tar.gz",
                cmd: "./amp-acp",
                sha256: "a".repeat(64),
              },
            },
          },
        },
      ],
    });

    expect(providers.map((provider) => provider.id)).toEqual(["amp-acp", "fast-agent", "grok-build"]);
    expect(providers.find((provider) => provider.id === "grok-build")).toMatchObject({
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["-y", "@xai-official/grok@1.0.0", "agent", "stdio"],
      auth: "acp",
      registry: { distribution: "npx", version: "1.0.0" },
    });
    expect(providers.find((provider) => provider.id === "fast-agent")).toMatchObject({
      command: "uvx",
      args: ["fast-agent-acp==0.9.30", "-x"],
      registry: { distribution: "uvx" },
    });
    expect(providers.find((provider) => provider.id === "amp-acp")).toMatchObject({
      command: process.execPath,
      registry: { distribution: "binary" },
    });
  });

  it("preserves Jait provider IDs for existing Codex and Claude accounts", () => {
    const providers = parseAcpRegistry({
      version: "1.0.0",
      agents: [
        {
          id: "codex-acp",
          name: "Codex",
          version: "1.1.14",
          description: "Codex",
          distribution: { npx: { package: "@agentclientprotocol/codex-acp@1.1.14" } },
        },
        {
          id: "claude-acp",
          name: "Claude Agent",
          version: "0.66.0",
          description: "Claude",
          distribution: { npx: { package: "@agentclientprotocol/claude-agent-acp@0.66.0" } },
        },
      ],
    });

    expect(providers.map((provider) => provider.id)).toEqual(["claude-code", "codex"]);
    expect(providers.map((provider) => provider.registry?.id)).toEqual(["claude-acp", "codex-acp"]);
  });

  it("falls back to bundled login-capable providers when the registry is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const providers = await loadAcpRegistryProviderConfigs({
        force: true,
        cacheFile: null,
        fetchImpl: vi.fn(async () => { throw new Error("offline"); }) as typeof fetch,
        fallbackDefinitions: [
          {
            id: "codex",
            name: "Codex",
            description: "Bundled Codex",
            command: "npx",
          },
          {
            id: "cursor",
            name: "Cursor",
            description: "Shared Cursor",
            command: "npx",
            auth: false,
          },
        ],
      });

      expect(providers.map((provider) => provider.id)).toEqual(["codex"]);
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects malformed agents and insecure download URLs", () => {
    const providers = parseAcpRegistry({
      agents: [
        {
          id: "unsafe",
          name: "Unsafe",
          version: "1.0.0",
          description: "Unsafe",
          distribution: {
            binary: {
              "linux-x86_64": {
                archive: "http://example.com/agent.tar.gz",
                cmd: "./agent",
              },
            },
          },
        },
        {
          id: "../invalid",
          name: "Invalid",
          version: "1.0.0",
          description: "Invalid",
          distribution: { npx: { package: "invalid" } },
        },
      ],
    });

    expect(providers).toEqual([]);
  });
});
