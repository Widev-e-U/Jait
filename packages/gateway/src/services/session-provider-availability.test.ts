import { describe, expect, it } from "vitest";
import { projectSupportsProvider } from "./session-provider-availability.js";

describe("projectSupportsProvider", () => {
  it("always allows Jait", () => {
    expect(projectSupportsProvider({
      providerId: "jait",
      projectNodeId: "offline-node",
      userId: "user-1",
    })).toBe(true);
  });

  it("allows an available gateway provider", () => {
    expect(projectSupportsProvider({
      providerId: "codex-account",
      projectNodeId: "gateway",
      userId: "user-1",
      providerRegistry: {
        getForUser: () => ({
          info: { available: true },
          providerType: "codex",
        }),
      },
    })).toBe(true);
  });

  it("rejects a remote account for a gateway-hosted project", () => {
    expect(projectSupportsProvider({
      providerId: "codex-account",
      projectNodeId: "gateway",
      userId: "user-1",
      providerRegistry: {
        getForUser: () => ({
          executionNodeId: "desktop-1",
          info: { available: true },
          providerType: "codex",
        }),
      },
    })).toBe(false);
  });

  it("rejects a provider that is not registered on the gateway", () => {
    expect(projectSupportsProvider({
      providerId: "claude-code",
      projectNodeId: "gateway",
      userId: "user-1",
    })).toBe(false);
  });

  it("matches remote provider accounts by provider type and execution node", () => {
    expect(projectSupportsProvider({
      providerId: "codex-account",
      projectNodeId: "desktop-1",
      userId: "user-1",
      providerRegistry: {
        getForUser: () => ({
          executionNodeId: "desktop-1",
          info: { available: true },
          providerType: "codex",
        }),
      },
      ws: {
        getFsNodes: () => [{ id: "desktop-1", providers: ["codex"] }],
      },
    })).toBe(true);
  });

  it("rejects a provider missing from the target project node", () => {
    expect(projectSupportsProvider({
      providerId: "codex",
      projectNodeId: "desktop-1",
      userId: "user-1",
      ws: {
        getFsNodes: () => [{ id: "desktop-1", providers: ["claude-code"] }],
      },
    })).toBe(false);
  });
});
