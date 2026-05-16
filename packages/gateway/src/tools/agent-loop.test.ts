import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __testUtils,
  parseOpenAIStream,
  fromOpenAIName,
  runAgentLoop,
  retryToolCall,
  ToolCallPriority,
  ToolCallQueue,
  type AgentLoopEvent,
  type AgentMessage,
  type ExecutedToolCall,
  type OpenAIToolCall,
} from "./agent-loop.js";

afterEach(() => {
  vi.restoreAllMocks();
});

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

function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
describe("OpenAI tool name conversion", () => {
  it("maps multi-segment tool names while preserving leaf underscores", () => {
    expect(fromOpenAIName("ssh_session_start")).toBe("ssh.session.start");
    expect(fromOpenAIName("ssh_session_run")).toBe("ssh.session.run");
    expect(fromOpenAIName("ssh_session_close")).toBe("ssh.session.close");
    expect(fromOpenAIName("browser_sandbox_start")).toBe("browser.sandbox.start");
    expect(fromOpenAIName("workspace_assign_repository")).toBe("workspace.assign_repository");
  });
});

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

describe("parseOpenAIStream", () => {
  it("processes the final buffered SSE event without a trailing newline", async () => {
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"tail"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}',
    ]));

    expect(parsed.contentText).toBe("tail");
    expect(parsed.finishReason).toBe("stop");
    expect(parsed.usage).toEqual({
      prompt_tokens: 2,
      completion_tokens: 1,
      total_tokens: 3,
    });
  });

  it("reassembles streamed tool call fragments in order", async () => {
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"file","arguments":"{\\"path\\":\\""}}]}}]}\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":".read","arguments":"a.ts\\"}"}}]}}]}',
    ]));

    expect(parsed.toolCalls).toEqual([
      {
        id: "call-1",
        type: "function",
        function: {
          name: "file.read",
          arguments: "{\"path\":\"a.ts\"}",
        },
      },
    ]);
  });
});

describe("repairToolCallHistory", () => {
  it("inserts synthetic tool results before a user turn when a tool call was interrupted", () => {
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "assistant", content: "Checking", tool_calls: [toolCall("call-1", "execute")] },
      { role: "user", content: "continue" },
    ];

    __testUtils.repairToolCallHistory(history);

    expect(history.map((message) => message.role)).toEqual(["system", "assistant", "tool", "user"]);
    expect(history[2]).toMatchObject({
      role: "tool",
      tool_call_id: "call-1",
      name: "execute",
    });
  });

  it("drops orphaned tool results left behind by context pruning", () => {
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "tool", content: "{\"ok\":true}", tool_call_id: "orphan", name: "execute" },
      { role: "user", content: "next" },
    ];

    __testUtils.repairToolCallHistory(history);

    expect(history).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "next" },
    ]);
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

describe("runAgentLoop swarm mode", () => {
  it("forces a visible thread.control create_many swarm before model synthesis", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Swarm complete."}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      "data: [DONE]\n\n",
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 }),
    );
    const toolCalls: Array<{ name: string; args: unknown }> = [];
    const events: AgentLoopEvent[] = [];

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the broken mobile notification UI and verify it." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 1,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async (name, args) => {
        toolCalls.push({ name, args });
        return {
          ok: true,
          message: "Created 3 thread(s) and waited for 3 to finish.",
          data: { threads: [{ title: "Implementation" }, { title: "Verification" }, { title: "Review" }] },
        };
      },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(toolCalls[0]?.name).toBe("thread.control");
    expect(toolCalls[0]?.args).toMatchObject({
      action: "create_many",
      start: true,
      kind: "delegation",
      detach: false,
      autoStopAfterTurn: true,
    });
    expect(((toolCalls[0]?.args as Record<string, unknown>).threads as unknown[])).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: "mode_notice", mode: "swarm" });
    expect(events.some((event) => event.type === "tool_start" && event.tool === "thread.control")).toBe(true);
    expect(result.content).toBe("Swarm complete.");
    expect(result.executedToolCalls[0]).toMatchObject({
      tool: "thread.control",
      ok: true,
    });
    expect(result.segments[0]).toMatchObject({
      type: "toolGroup",
      callIds: [result.executedToolCalls[0]!.callId],
    });
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
