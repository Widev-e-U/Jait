import { describe, expect, it, vi } from "vitest";
import { createBrowserInspectTool, createBrowserNavigateTool } from "./browser-tools.js";

describe("browser tools with collaboration", () => {
  it("blocks navigation before mutating a browser session controlled by the user", async () => {
    const collaboration = {
      assertAgentControl: vi.fn(() => {
        throw new Error("Browser session is currently controlled by the user. Request control or wait for resume.");
      }),
    };
    const registry = {
      getSurface: vi.fn(),
      startSurface: vi.fn(),
    };
    const tool = createBrowserNavigateTool(registry as any, collaboration as any);

    await expect(tool.execute({ url: "https://example.com", browserId: "browser-live-1" }, {
      sessionId: "session-1",
      actionId: "action-1",
      workspaceRoot: "/workspace/app",
      requestedBy: "assistant",
    })).rejects.toThrow(/controlled by the user/i);

    expect(collaboration.assertAgentControl).toHaveBeenCalledWith("browser-live-1");
    expect(registry.startSurface).not.toHaveBeenCalled();
  });

  it("includes collaboration session metadata and redacts secret-safe inspection payloads", async () => {
    const browser = {
      id: "browser-live-2",
      type: "browser",
      state: "running",
      inspect: vi.fn().mockResolvedValue({
        snapshot: {
          url: "https://example.com",
          title: "Example",
          text: "Ready",
          elements: [{ role: "button", name: "Continue", selector: "button" }],
          activeElement: null,
          dialogs: [],
          obstruction: null,
        },
        target: { selector: "#continue", visible: true },
      }),
    };
    const collaboration = {
      assertAgentControl: vi.fn(),
      getSessionByBrowserId: vi.fn().mockReturnValue({
        id: "bs_live_2",
        browserId: "browser-live-2",
        controller: "agent",
        status: "ready",
        secretSafe: true,
      }),
    };
    const registry = {
      getSurface: vi.fn().mockReturnValue(browser),
      startSurface: vi.fn(),
    };
    const tool = createBrowserInspectTool(registry as any, collaboration as any);

    const result = await tool.execute({ selector: "#continue", browserId: "browser-live-2" }, {
      sessionId: "session-2",
      actionId: "action-2",
      workspaceRoot: "/workspace/app",
      requestedBy: "assistant",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("suppressed");
    expect(result.data).toMatchObject({
      browserId: "browser-live-2",
      controller: "agent",
      secretSafe: true,
      captureSuppressed: true,
      suppressionReason: "Browser capture is suppressed while the session is marked secret-safe.",
      browserSession: {
        id: "bs_live_2",
        browserId: "browser-live-2",
      },
      target: null,
    });
  });

  it("locks browser actions to the linked preview browser when one exists", async () => {
    const collaboration = {
      getSessionByPreviewSessionId: vi.fn().mockReturnValue({
        id: "bs_preview_1",
        browserId: "preview-browser-session-1",
      }),
      assertAgentControl: vi.fn(),
    };
    const registry = {
      getSurface: vi.fn(),
      startSurface: vi.fn(),
    };
    const tool = createBrowserNavigateTool(registry as any, collaboration as any);

    await expect(tool.execute({ url: "https://example.com", browserId: "browser-sidecar-1" }, {
      sessionId: "session-1",
      actionId: "action-1",
      workspaceRoot: "/workspace/app",
      requestedBy: "assistant",
    })).rejects.toThrow(/visible preview browser/i);

    expect(collaboration.assertAgentControl).not.toHaveBeenCalled();
    expect(registry.startSurface).not.toHaveBeenCalled();
  });
});
