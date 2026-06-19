import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __testUtils,
  parseOpenAIStream,
  parseOllamaStream,
  serializeMessagesForOllama,
  buildTieredToolSchemas,
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
import { ToolRegistry } from "./registry.js";

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
describe("serializeMessagesForOllama", () => {
  it("converts OpenAI tool history to ollama-native format", () => {
    const history: AgentMessage[] = [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "get_weather", arguments: '{"city":"Vienna"}' } }],
      },
      { role: "tool", content: '{"temp_c":24}', tool_call_id: "c1", name: "get_weather" },
    ];
    const out = serializeMessagesForOllama(history) as any[];
    // assistant tool_calls: no id/type, arguments parsed to object
    expect(out[1].tool_calls).toEqual([{ function: { name: "get_weather", arguments: { city: "Vienna" } } }]);
    expect(out[1].tool_calls[0].id).toBeUndefined();
    // tool result: uses tool_name, no tool_call_id
    expect(out[2]).toMatchObject({ role: "tool", content: '{"temp_c":24}', tool_name: "get_weather" });
    expect(out[2].tool_call_id).toBeUndefined();
  });

  it("defaults unparseable arguments to an empty object", () => {
    const out = serializeMessagesForOllama([
      { role: "assistant", content: "", tool_calls: [{ id: "x", type: "function", function: { name: "f", arguments: "not json" } }] },
    ]) as any[];
    expect(out[0].tool_calls[0].function.arguments).toEqual({});
  });
});

describe("parseOllamaStream", () => {
  it("parses native NDJSON: thinking, content, tool calls, usage", async () => {
    const reader = streamReader([
      JSON.stringify({ message: { role: "assistant", thinking: "let me think" } }) + "\n",
      JSON.stringify({ message: { role: "assistant", content: "Hello " } }) + "\n",
      JSON.stringify({ message: { role: "assistant", content: "world" } }) + "\n",
      JSON.stringify({ message: { role: "assistant", tool_calls: [{ id: "t1", function: { name: "get_weather", arguments: { city: "Vienna" } } }] } }) + "\n",
      JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 100, eval_count: 20 }) + "\n",
    ]);
    const parsed = await parseOllamaStream(reader);
    expect(parsed.thinkingText).toBe("let me think");
    expect(parsed.contentText).toBe("Hello world");
    // tool calls normalized to internal OpenAI shape (arguments stringified)
    expect(parsed.toolCalls).toEqual([
      { id: "t1", type: "function", function: { name: "get_weather", arguments: '{"city":"Vienna"}' } },
    ]);
    // done_reason normalized to tool_calls when calls present
    expect(parsed.finishReason).toBe("tool_calls");
    expect(parsed.usage).toEqual({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 });
  });

  it("preserves a length finish_reason for truncation recovery", async () => {
    const reader = streamReader([
      JSON.stringify({ message: { content: "partial" } }) + "\n",
      JSON.stringify({ done: true, done_reason: "length", prompt_eval_count: 5, eval_count: 5 }) + "\n",
    ]);
    const parsed = await parseOllamaStream(reader);
    expect(parsed.contentText).toBe("partial");
    expect(parsed.finishReason).toBe("length");
  });
});

describe("OpenAI tool name conversion", () => {
  it("maps multi-segment tool names while preserving leaf underscores", () => {
    expect(fromOpenAIName("ssh_session_start")).toBe("ssh.session.start");
    expect(fromOpenAIName("ssh_session_run")).toBe("ssh.session.run");
    expect(fromOpenAIName("ssh_session_close")).toBe("ssh.session.close");
    expect(fromOpenAIName("browser_sandbox_start")).toBe("browser.sandbox.start");
    expect(fromOpenAIName("project_create")).toBe("project.create");
    expect(fromOpenAIName("project_assign_repository")).toBe("project.assign_repository");
  });
});

describe("buildTieredToolSchemas", () => {
  it("keeps core discovery tools for Ollama-backed models", () => {
    const registry = new ToolRegistry();
    const register = (name: string, tier: "core" | "standard") => registry.register({
      name,
      description: `${name} description`,
      tier,
      category: tier === "core" ? "meta" : "filesystem",
      source: "builtin",
      parameters: { type: "object", properties: {}, required: [] },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    register("read", "core");
    register("edit", "core");
    register("tools.list", "core");
    register("tools.search", "core");
    register("file.read", "standard");

    const names = buildTieredToolSchemas(registry, undefined, { ollamaEssentials: true })
      .map((schema) => fromOpenAIName(schema.function.name));

    expect(names).toContain("read");
    expect(names).toContain("edit");
    expect(names).toContain("tools.list");
    expect(names).toContain("tools.search");
    expect(names).not.toContain("file.read");
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

describe("context pruning summary", () => {
  it("replaces pruned turns with a structured summary", () => {
    const history: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      {
        role: "user",
        content: "Goal: replace placeholder pruning. Keep implementation minimal and avoid changing unrelated files.",
      },
      {
        role: "assistant",
        content: "Decision: use deterministic structured summaries that preserve goal, constraints, decisions, files, progress, and next steps.",
      },
      {
        role: "assistant",
        content: "",
        tool_calls: [toolCall("call-1", "file_read")],
      },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "Read packages/gateway/src/tools/agent-loop.ts" }),
        tool_call_id: "call-1",
        name: "file_read",
      },
      {
        role: "assistant",
        content: "Progress: the pruning helper is ready. Run the focused agent-loop tests next.",
      },
      { role: "user", content: "Please continue with the current implementation." },
    ];

    const pruned = __testUtils.pruneHistory(history, 40, []);
    const summary = history[1]?.content ?? "";

    expect(pruned).toBe(true);
    expect(summary).toContain("[conversation-summary]");
    expect(summary).toContain("Goal:");
    expect(summary).toContain("Constraints:");
    expect(summary).toContain("Decisions:");
    expect(summary).toContain("Files:");
    expect(summary).toContain("Progress:");
    expect(summary).toContain("Next steps:");
    expect(summary).toContain("Keep implementation minimal");
    expect(summary).toContain("deterministic structured summaries");
    expect(summary).toContain("packages/gateway/src/tools/agent-loop.ts");
    expect(summary).toContain("Tool file.read");
    expect(summary).toContain("Run the focused agent-loop tests next");
    expect(history.at(-1)).toMatchObject({ role: "user", content: "Please continue with the current implementation." });
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

describe("runAgentLoop persistence", () => {
  it("calls onPersist exactly once and reports persisted=true on normal completion", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello world"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 }),
    );

    const persistCalls: Array<{ role: string; content: string }> = [];
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
          { role: "user", content: "Say hello." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-persist-1",
        abort: new AbortController(),
        maxRounds: 1,
        mode: "agent",
        onPersist: (_sid, role, content) => persistCalls.push({ role, content }),
      },
      async () => ({ ok: true, message: "" }),
    );

    expect(result.content).toBe("Hello world");
    expect(result.persisted).toBe(true);
    expect(persistCalls).toHaveLength(1);
    expect(persistCalls[0]).toMatchObject({ role: "assistant", content: "Hello world" });
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

describe("runAgentLoop truncation recovery", () => {
  function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }

  it("auto-continues when a text response is cut off by finish_reason=length", async () => {
    const truncated = [
      'data: {"choices":[{"delta":{"content":"Part one"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      "data: [DONE]\n\n",
    ];
    const completed = [
      'data: {"choices":[{"delta":{"content":" and part two."}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      "data: [DONE]\n\n",
    ];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(sseResponse(truncated))
      .mockResolvedValueOnce(sseResponse(completed));

    const events: AgentLoopEvent[] = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "gpt-5",
          contextWindow: 400_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Write something long." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 5,
        onEvent: (event) => events.push(event),
      },
      async () => ({ ok: true, message: "ok" }),
    );

    // Two calls: the truncated one, then the continuation.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Final content is the seamless concatenation of both rounds.
    expect(result.content).toBe("Part one and part two.");
    // A steering event signals the continuation to the user/UI.
    expect(
      events.some(
        (e) => e.type === "steering" && /output token limit/i.test(e.message),
      ),
    ).toBe(true);
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
