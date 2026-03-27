import { describe, expect, it, vi } from "vitest";
import { createPreviewInspectTool, createPreviewOpenTool } from "./preview-tools.js";
import type { ToolContext } from "./contracts.js";

describe("createPreviewOpenTool", () => {
  it("starts a managed preview and broadcasts panel state", async () => {
    const sendUICommand = vi.fn();
    const broadcast = vi.fn();
    const set = vi.fn();
    const mockSession = {
      id: "preview-session-123",
      sessionId: "session-123",
      status: "ready",
      url: "http://127.0.0.1:5173/",
      mode: "local",
      logs: [],
      browserEvents: [],
    };
    const previewService = {
      start: vi.fn().mockResolvedValue(mockSession),
    };
    const tool = createPreviewOpenTool(
      { sendUICommand, broadcast } as any,
      { set } as any,
      previewService as any,
    );

    const context: ToolContext = {
      sessionId: "session-123",
      actionId: "action-123",
      workspaceRoot: "/workspace/app",
      requestedBy: "assistant",
    };

    const result = await tool.execute({ target: "3000" }, context);

    expect(result.ok).toBe(true);
    expect(previewService.start).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-123", target: "3000" }),
    );
    expect(sendUICommand).toHaveBeenCalledWith(
      {
        command: "dev-preview.open",
        data: { target: "http://127.0.0.1:5173/", workspaceRoot: "/workspace/app" },
      },
      "session-123",
    );
    expect(broadcast).toHaveBeenCalledWith(
      "session-123",
      expect.objectContaining({
        type: "ui.state-sync",
        sessionId: "session-123",
        payload: {
          key: "dev-preview.panel",
          value: { open: true, target: "http://127.0.0.1:5173/", workspaceRoot: "/workspace/app" },
        },
      }),
    );
    expect(set).toHaveBeenCalledWith("session-123", {
      "dev-preview.panel": { open: true, target: "http://127.0.0.1:5173/", workspaceRoot: "/workspace/app" },
    });
  });

  it("uses the MCP session when starting previews from MCP calls", async () => {
    const sendUICommand = vi.fn();
    const broadcast = vi.fn();
    const set = vi.fn();
    const previewService = {
      start: vi.fn().mockResolvedValue({
        status: "ready",
        url: "http://127.0.0.1:8765/",
        mode: "url",
      }),
    };
    const tool = createPreviewOpenTool(
      { sendUICommand, broadcast } as any,
      { set } as any,
      previewService as any,
    );

    const context: ToolContext = {
      sessionId: "mcp-session",
      actionId: "action-456",
      workspaceRoot: "/workspace/mcp",
      requestedBy: "mcp-client",
    };

    const result = await tool.execute({ target: "8765" }, context);

    expect(result.ok).toBe(true);
    expect(previewService.start).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "mcp-session", target: "8765" }),
    );
    expect(sendUICommand).toHaveBeenCalledWith(
      {
        command: "dev-preview.open",
        data: { target: "http://127.0.0.1:8765/", workspaceRoot: "/workspace/mcp" },
      },
      "mcp-session",
    );
    expect(broadcast).toHaveBeenCalledWith(
      "mcp-session",
      expect.objectContaining({
        type: "ui.state-sync",
        sessionId: "mcp-session",
      }),
    );
    expect(set).toHaveBeenCalledWith("mcp-session", {
      "dev-preview.panel": { open: true, target: "http://127.0.0.1:8765/", workspaceRoot: "/workspace/mcp" },
    });
  });

  it("syncs the browser collaboration record when opening a preview", async () => {
    const sendUICommand = vi.fn();
    const broadcast = vi.fn();
    const set = vi.fn();
    const syncPreviewSession = vi.fn();
    const previewService = {
      start: vi.fn().mockResolvedValue({
        id: "preview-session-999",
        sessionId: "session-999",
        status: "ready",
        url: "/api/dev-proxy/4173/",
        mode: "local",
      }),
    };
    const tool = createPreviewOpenTool(
      { sendUICommand, broadcast } as any,
      { set } as any,
      previewService as any,
      { syncPreviewSession } as any,
    );

    const context: ToolContext = {
      sessionId: "session-999",
      actionId: "action-999",
      workspaceRoot: "/workspace/live",
      requestedBy: "assistant",
      userId: "user-999",
    };

    const result = await tool.execute({ workspaceRoot: "/workspace/live" }, context);

    expect(result.ok).toBe(true);
    expect(syncPreviewSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-999",
        mode: "local",
        url: "/api/dev-proxy/4173/",
      }),
      {
        userId: "user-999",
        workspaceRoot: "/workspace/live",
        mode: "isolated",
      },
    );
  });
});

describe("createPreviewInspectTool", () => {
  it("omits screenshots by default and reports browser error counts", async () => {
    const previewService = {
      inspect: vi.fn().mockResolvedValue({
        status: "ready",
        url: "/api/dev-proxy/4173/",
        logs: [{ id: 1, stream: "system", text: "ready", timestamp: "2026-03-27T00:00:00.000Z" }],
        browserEvents: [
          { type: "console", text: "ready" },
          { type: "pageerror", text: "boom" },
          { type: "response", status: 500, url: "http://127.0.0.1:4173/api" },
        ],
        screenshot: "base64-image",
        page: { title: "Preview App" },
        snapshot: "Title: Preview App",
      }),
    };
    const tool = createPreviewInspectTool(previewService as any);

    const result = await tool.execute({}, {
      sessionId: "session-1",
      actionId: "action-1",
      workspaceRoot: "/workspace/app",
      requestedBy: "assistant",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("2 errors");
    expect(result.message).not.toContain("screenshot included");
    expect(result.data).toMatchObject({
      status: "ready",
      screenshot: null,
      page: { title: "Preview App" },
      snapshot: "Title: Preview App",
    });
  });

  it("keeps screenshots when explicitly requested", async () => {
    const previewService = {
      inspect: vi.fn().mockResolvedValue({
        status: "ready",
        url: "/api/dev-proxy/4173/",
        logs: [],
        browserEvents: [],
        screenshot: "base64-image",
        page: null,
        snapshot: null,
      }),
    };
    const tool = createPreviewInspectTool(previewService as any);

    const result = await tool.execute({ screenshot: true }, {
      sessionId: "session-1",
      actionId: "action-1",
      workspaceRoot: "/workspace/app",
      requestedBy: "assistant",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("screenshot included");
    expect(result.data).toMatchObject({
      screenshot: "base64-image",
    });
  });

  it("suppresses preview inspection capture when the linked browser session is secret-safe", async () => {
    const previewService = {
      inspect: vi.fn().mockResolvedValue({
        status: "ready",
        url: "/api/dev-proxy/4173/",
        logs: [{ id: 1, stream: "stdout", text: "token=123", timestamp: "2026-03-27T00:00:00.000Z" }],
        browserEvents: [{ type: "console", text: "secret" }],
        screenshot: "base64-image",
        page: { title: "Secret page" },
        snapshot: "Title: Secret page",
      }),
    };
    const tool = createPreviewInspectTool(
      previewService as any,
      {
        getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "bs_secret", secretSafe: true }),
      } as any,
    );

    const result = await tool.execute({ screenshot: true }, {
      sessionId: "session-1",
      actionId: "action-1",
      workspaceRoot: "/workspace/app",
      requestedBy: "assistant",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("capture suppressed");
    expect(result.data).toMatchObject({
      captureSuppressed: true,
      screenshot: null,
      browserEvents: [],
      logs: [],
      page: null,
      snapshot: null,
    });
  });
});
