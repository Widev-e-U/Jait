import { describe, expect, it } from "vitest";
import {
  __testUtils,
  retryToolCall,
  ToolCallPriority,
  ToolCallQueue,
  type AgentMessage,
  type ExecutedToolCall,
  type OpenAIToolCall,
} from "./agent-loop.js";

function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}

describe("ToolCallQueue.dequeueBatch", () => {
  it("keeps two consecutive parallel-safe calls sequential", () => {
    const queue = new ToolCallQueue();
    queue.enqueue(toolCall("a"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("b"), ToolCallPriority.Normal, true);

    const batch = queue.dequeueBatch(true);

    expect(batch.map((item) => item.toolCall.id)).toEqual(["a"]);
    expect(queue.length).toBe(1);
  });

  it("batches three consecutive parallel-safe calls", () => {
    const queue = new ToolCallQueue();
    queue.enqueue(toolCall("a"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("b"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("c"), ToolCallPriority.Normal, true);

    const batch = queue.dequeueBatch(true);

    expect(batch.map((item) => item.toolCall.id)).toEqual(["a", "b", "c"]);
    expect(queue.isEmpty).toBe(true);
  });

  it("only batches the leading contiguous parallel-safe calls", () => {
    const queue = new ToolCallQueue();
    queue.enqueue(toolCall("a"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("b"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("c"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("d", "terminal_exec"), ToolCallPriority.Normal, false);

    const batch = queue.dequeueBatch(true);

    expect(batch.map((item) => item.toolCall.id)).toEqual(["a", "b", "c"]);
    expect(queue.length).toBe(1);
    expect(queue.dequeueBatch(true).map((item) => item.toolCall.id)).toEqual(["d"]);
  });
});

describe("executeOneToolCall retry accounting", () => {
  it("tracks only actual retries when transient failures exhaust the budget", async () => {
    const events: string[] = [];
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("retry-case", "terminal_exec"),
      sessionId: "session-1",
      maxRetries: 2,
      onEvent: (event) => events.push(event.type),
      executeTool: async () => ({ ok: false, message: "503 service unavailable" }),
    });

    expect(result.result).toEqual({ ok: false, message: "503 service unavailable" });
    expect(result.executed.retryCount).toBe(2);
    expect(events.filter((type) => type === "tool_retry")).toHaveLength(2);
  });

  it("does not retry non-transient failures", async () => {
    let calls = 0;
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("no-retry-case", "terminal_exec"),
      sessionId: "session-1",
      maxRetries: 2,
      executeTool: async () => {
        calls += 1;
        return { ok: false, message: "permission denied" };
      },
    });

    expect(calls).toBe(1);
    expect(result.executed.retryCount).toBe(0);
  });
});

describe("retryToolCall", () => {
  it("re-executes the original tool and replaces its history entry", async () => {
    const history: AgentMessage[] = [
      {
        role: "tool",
        content: JSON.stringify({ ok: false, message: "503 service unavailable" }),
        tool_call_id: "call-1",
        name: "terminal_exec",
      },
    ];
    const executedToolCalls: ExecutedToolCall[] = [
      {
        callId: "call-1",
        tool: "terminal.exec",
        args: { cmd: "echo test" },
        ok: false,
        message: "503 service unavailable",
        startedAt: 1,
        completedAt: 2,
        retryCount: 0,
      },
    ];

    const result = await retryToolCall(
      "call-1",
      history,
      executedToolCalls,
      async () => ({ ok: true, message: "ok", data: { stdout: "test" } }),
      "session-1",
    );

    expect(result).toEqual({ ok: true, message: "ok", data: { stdout: "test" } });
    expect(executedToolCalls[0]).toMatchObject({
      ok: true,
      message: "ok",
      data: { stdout: "test" },
      retryCount: 1,
    });
    expect(history[0]).toEqual({
      role: "tool",
      content: JSON.stringify({ ok: true, message: "ok", data: { stdout: "test" } }),
      tool_call_id: "call-1",
      name: "terminal_exec",
    });
  });

  it("returns a not found error for unknown call ids", async () => {
    const result = await retryToolCall(
      "missing-call",
      [],
      [],
      async () => ({ ok: true, message: "ok" }),
      "session-1",
    );

    expect(result).toEqual({ ok: false, message: "Tool call missing-call not found" });
  });
});
