import { describe, expect, it } from "vitest";
import { mapCodexNotification } from "./codex-event-mapper.js";

describe("mapCodexNotification", () => {
  it("maps codex agent message deltas as assistant text tokens", () => {
    const events = mapCodexNotification("codex/event/agent_message_delta", {
      delta: "Implemented the todo runner.",
    }, "session-1");

    expect(events).toEqual([{
      type: "token",
      sessionId: "session-1",
      content: "Implemented the todo runner.",
    }]);
  });

  it("maps codex agent message content fallback as assistant text tokens", () => {
    const events = mapCodexNotification("codex/event/agent_message_delta", {
      content: "Ran the focused tests.",
    }, "session-1");

    expect(events).toEqual([{
      type: "token",
      sessionId: "session-1",
      content: "Ran the focused tests.",
    }]);
  });

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

  it("maps MCP progress messages to streaming tool output", () => {
    const events = mapCodexNotification("item/mcpToolCall/progress", {
      itemId: "call-1",
      message: "RUN v3\n",
    }, "session-1");

    expect(events).toEqual([{
      type: "tool.output",
      sessionId: "session-1",
      callId: "call-1",
      content: "RUN v3\n",
    }]);
  });

  it("maps provider-native spawn_agent function calls as agent tool events", () => {
    const events = mapCodexNotification("codex/event/item_started", {
      msg: {
        id: "agent-call-1",
        type: "function_call",
        name: "spawn_agent",
        arguments: {
          agent_type: "explorer",
          message: "Inspect the repo",
        },
      },
    }, "session-1");

    expect(events).toEqual([{
      type: "tool.start",
      sessionId: "session-1",
      tool: "spawn_agent",
      args: {
        id: "agent-call-1",
        type: "function_call",
        name: "spawn_agent",
        arguments: {
          agent_type: "explorer",
          message: "Inspect the repo",
        },
      },
      callId: "agent-call-1",
    }]);
  });

  it("does not treat assistant agent messages as tool calls", () => {
    const events = mapCodexNotification("codex/event/item_completed", {
      msg: {
        id: "msg-1",
        type: "agent_message",
        content: "Agent finished the task.",
      },
    }, "session-1");

    expect(events).toEqual([{
      type: "message",
      sessionId: "session-1",
      role: "assistant",
      content: "Agent finished the task.",
    }]);
  });

  it("maps codex task completion last_agent_message as assistant text", () => {
    const events = mapCodexNotification("codex/event/task_complete", {
      msg: {
        type: "task_complete",
        last_agent_message: "Updated the tests and ran the focused check.",
      },
    }, "session-1");

    expect(events).toEqual([{
      type: "message",
      sessionId: "session-1",
      role: "assistant",
      content: "Updated the tests and ran the focused check.",
    }]);
  });
});
