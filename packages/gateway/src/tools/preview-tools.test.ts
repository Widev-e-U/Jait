import { describe, expect, it, vi } from "vitest";
import { createPreviewOpenTool } from "./preview-tools.js";
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
      requestedBy: "assistant",
    };

    const result = await tool.execute({ target: "3000" }, context);

    expect(result.ok).toBe(true);
    expect(previewService.start).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-123", target: "3000" }),
    );
    expect(sendUICommand).toHaveBeenCalledWith(
      { command: "dev-preview.open", data: { target: "http://127.0.0.1:5173/" } },
      "session-123",
    );
    expect(broadcast).toHaveBeenCalledWith(
      "session-123",
      expect.objectContaining({
        type: "ui.state-sync",
        sessionId: "session-123",
        payload: {
          key: "dev-preview.panel",
          value: { open: true, target: "http://127.0.0.1:5173/" },
        },
      }),
    );
    expect(set).toHaveBeenCalledWith("session-123", {
      "dev-preview.panel": { open: true, target: "http://127.0.0.1:5173/" },
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
      requestedBy: "mcp-client",
    };

    const result = await tool.execute({ target: "8765" }, context);

    expect(result.ok).toBe(true);
    expect(previewService.start).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "mcp-session", target: "8765" }),
    );
    expect(sendUICommand).toHaveBeenCalledWith(
      { command: "dev-preview.open", data: { target: "http://127.0.0.1:8765/" } },
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
      "dev-preview.panel": { open: true, target: "http://127.0.0.1:8765/" },
    });
  });
});
