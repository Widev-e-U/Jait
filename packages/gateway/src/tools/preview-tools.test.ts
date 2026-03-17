import { describe, expect, it, vi } from "vitest";
import { createPreviewOpenTool } from "./preview-tools.js";
import type { ToolContext } from "./contracts.js";

describe("createPreviewOpenTool", () => {
  it("broadcasts and persists dev preview panel state", async () => {
    const sendUICommand = vi.fn();
    const broadcast = vi.fn();
    const set = vi.fn();
    const tool = createPreviewOpenTool(
      { sendUICommand, broadcast } as any,
      { set } as any,
    );

    const context: ToolContext = {
      sessionId: "session-123",
      actionId: "action-123",
      requestedBy: "assistant",
    };

    const result = await tool.execute({ target: "3000" }, context);

    expect(result.ok).toBe(true);
    expect(sendUICommand).toHaveBeenCalledWith(
      {
        command: "dev-preview.open",
        data: { target: "3000" },
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
          value: { open: true, target: "3000" },
        },
      }),
    );
    expect(set).toHaveBeenCalledWith("session-123", {
      "dev-preview.panel": { open: true, target: "3000" },
    });
  });

  it("broadcasts to all clients for MCP calls without persisting fake session state", async () => {
    const sendUICommand = vi.fn();
    const broadcast = vi.fn();
    const set = vi.fn();
    const tool = createPreviewOpenTool(
      { sendUICommand, broadcast } as any,
      { set } as any,
    );

    const context: ToolContext = {
      sessionId: "mcp-session",
      actionId: "action-456",
      requestedBy: "mcp-client",
    };

    const result = await tool.execute({ target: "8765" }, context);

    expect(result.ok).toBe(true);
    expect(sendUICommand).toHaveBeenCalledWith(
      {
        command: "dev-preview.open",
        data: { target: "8765" },
      },
      "",
    );
    expect(broadcast).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});
