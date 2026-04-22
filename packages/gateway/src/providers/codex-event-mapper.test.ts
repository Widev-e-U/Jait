import { describe, expect, it } from "vitest";
import { mapCodexNotification } from "./codex-event-mapper.js";

describe("mapCodexNotification", () => {
  it("preserves structured tool result payloads for completed codex items", () => {
    const events = mapCodexNotification("codex/event/item_completed", {
      msg: {
        id: "item-1",
        type: "mcp_tool_call",
        status: "completed",
        output: {
          path: "/home/user/project/.tmp/jait-preview-live.png",
        },
      },
    }, "session-1");

    expect(events).toContainEqual({
      type: "tool.result",
      sessionId: "session-1",
      tool: "mcp-tool",
      ok: true,
      message: "",
      callId: "item-1",
      data: {
        path: "/home/user/project/.tmp/jait-preview-live.png",
      },
    });
  });

  it("maps direct MCP completion events using the original tool name", () => {
    const events = mapCodexNotification("item/mcpToolCall/completed", {
      id: "call-1",
      name: "todo",
      arguments: {
        todoList: [
          { id: 1, title: "Trace bug", status: "in-progress" },
        ],
      },
      result: {
        items: [
          { id: 1, title: "Trace bug", status: "in-progress" },
        ],
      },
    }, "session-1");

    expect(events).toContainEqual({
      type: "tool.result",
      sessionId: "session-1",
      tool: "todo",
      ok: true,
      message: "",
      callId: "call-1",
      data: {
        items: [
          { id: 1, title: "Trace bug", status: "in-progress" },
        ],
      },
    });
  });
});
