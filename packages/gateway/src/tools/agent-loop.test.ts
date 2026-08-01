import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __testUtils,
  parseOpenAIStream,
  parseOllamaStream,
  serializeMessagesForOllama,
  buildTieredToolSchemas,
  fromOpenAIName,
  runAgentLoop,
  SteeringController,
  retryToolCall,
  ToolCallPriority,
  ToolCallQueue,
  type AgentLoopEvent,
  type AgentMessage,
  type ExecutedToolCall,
  type OpenAIToolCall,
} from "./agent-loop.js";
import { ToolRegistry } from "./registry.js";
import { computeContextUsage } from "./token-estimator.js";

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

  it("extracts leading <thinking> blocks from message.content", async () => {
    const events: AgentLoopEvent[] = [];
    const reader = streamReader([
      JSON.stringify({ message: { role: "assistant", content: "<thinking>pondering</thinking>Hi" } }) + "\n",
      JSON.stringify({ done: true, done_reason: "stop" }) + "\n",
    ]);
    const parsed = await parseOllamaStream(reader, (event) => events.push(event));
    expect(parsed.contentText).toBe("Hi");
    expect(parsed.thinkingText).toBe("pondering");
    expect(events.filter((event) => event.type === "thinking").map((event) => (event as { content: string }).content)).toEqual(["pondering"]);
    expect(events.filter((event) => event.type === "token").map((event) => (event as { content: string }).content)).toEqual(["Hi"]);
  });

  it("keeps <thinking> tags as visible content once text has started", async () => {
    const reader = streamReader([
      JSON.stringify({ message: { role: "assistant", content: "Use <thinking>this</thinking> tags" } }) + "\n",
      JSON.stringify({ done: true, done_reason: "stop" }) + "\n",
    ]);
    const parsed = await parseOllamaStream(reader);
    expect(parsed.contentText).toBe("Use <thinking>this</thinking> tags");
    expect(parsed.thinkingText).toBe("");
  });

  it("rejects provider error chunks instead of treating them as empty success", async () => {
    const reader = streamReader([
      JSON.stringify({ error: "model runner disconnected" }) + "\n",
    ]);

    await expect(parseOllamaStream(reader)).rejects.toThrow("model runner disconnected");
  });

  it("rejects a stream that closes before Ollama's terminal done chunk", async () => {
    const reader = streamReader([
      JSON.stringify({ message: { role: "assistant", content: "partial" } }) + "\n",
    ]);

    await expect(parseOllamaStream(reader)).rejects.toThrow(/before.*done/i);
  });

  it("propagates reader failures instead of returning a partial response", async () => {
    const failure = new Error("socket reset");
    const reader = {
      read: vi.fn().mockRejectedValue(failure),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    await expect(parseOllamaStream(reader)).rejects.toThrow("socket reset");
  });

  it("returns streamed partials when the user aborts before the done chunk", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    let reads = 0;
    const reader = {
      read: vi.fn(async () => {
        if (reads++ === 0) {
          return {
            done: false,
            value: encoder.encode(
              JSON.stringify({ message: { role: "assistant", content: "partial" }, done: false }) + "\n",
            ),
          };
        }
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      }),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const parsed = await parseOllamaStream(reader, undefined, controller.signal);

    expect(parsed.contentText).toBe("partial");
    expect(parsed.interrupted).toBe(true);
    expect(parsed.finishReason).toBeNull();
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
    register("todo", "core");
    register("user.ask", "core");
    register("tools.list", "core");
    register("tools.search", "core");
    register("file.read", "standard");

    const names = buildTieredToolSchemas(registry, undefined, { ollamaEssentials: true })
      .map((schema) => fromOpenAIName(schema.function.name));

    expect(names).toContain("read");
    expect(names).toContain("edit");
    expect(names).toContain("todo");
    expect(names).toContain("user.ask");
    expect(names).toContain("tools.list");
    expect(names).toContain("tools.search");
    expect(names).not.toContain("file.read");
  });

  it("preloads request-relevant deferred tools and preserves activated tools", () => {
    const registry = new ToolRegistry();
    const register = (name: string, description: string, tier: "core" | "standard") => registry.register({
      name,
      description,
      tier,
      category: tier === "core" ? "meta" : "browser",
      source: "builtin",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => ({ ok: true, message: "completed" }),
    });
    register("todo", "Track multi-step work", "core");
    register("user.ask", "Ask the user for a real decision", "core");
    register("tools.search", "Search deferred tools", "core");
    register("preview.open", "Open a live preview of the web application", "standard");
    register("browser.click", "Click an element in an existing browser session", "standard");

    const firstTurnNames = buildTieredToolSchemas(registry, undefined, { query: "show me the app", selectionLimit: 1 })
      .map((schema) => fromOpenAIName(schema.function.name));
    expect(firstTurnNames).toEqual(["todo", "user.ask", "tools.search", "preview.open"]);

    const nextTurnNames = buildTieredToolSchemas(registry, undefined, {
      activatedToolNames: new Set(["preview.open"]),
      query: "continue with the work",
      selectionLimit: 1,
    }).map((schema) => fromOpenAIName(schema.function.name));
    expect(nextTurnNames).toContain("preview.open");

    const disabledNames = buildTieredToolSchemas(registry, new Set(["preview.open"]), {
      activatedToolNames: new Set(["preview.open"]),
    }).map((schema) => fromOpenAIName(schema.function.name));
    expect(disabledNames).not.toContain("preview.open");
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

  it("extracts leading <thinking> blocks into thinking events and strips them from content", async () => {
    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"<thinking>step one reasoning</thinking>Hello "}}]}\n',
      'data: {"choices":[{"delta":{"content":"world"}}]}\n',
    ]), (event) => events.push(event));

    expect(parsed.contentText).toBe("Hello world");
    expect(parsed.thinkingText).toBe("step one reasoning");
    expect(events.filter((event) => event.type === "token").map((event) => (event as { content: string }).content).join("")).toBe("Hello world");
    expect(events.filter((event) => event.type === "thinking").map((event) => (event as { content: string }).content).join("")).toBe("step one reasoning");
  });

  it("handles fragmented leading <thinking> tags across chunks", async () => {
    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"<th"}}]}\n',
      'data: {"choices":[{"delta":{"content":"inking>reasoning</thinking>answer"}}]}\n',
    ]), (event) => events.push(event));

    expect(parsed.contentText).toBe("answer");
    expect(parsed.thinkingText).toBe("reasoning");
    expect(events.filter((event) => event.type === "token").map((event) => (event as { content: string }).content).join("")).toBe("answer");
    expect(events.filter((event) => event.type === "thinking").map((event) => (event as { content: string }).content).join("")).toBe("reasoning");
  });

  it("does not strip <thinking> tags that appear after visible content has started", async () => {
    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"Use `<thinking>` tags like "}}]}\n',
      'data: {"choices":[{"delta":{"content":"<thinking>this</thinking>` in HTML."}}]}\n',
    ]), (event) => events.push(event));

    expect(parsed.contentText).toBe("Use `<thinking>` tags like <thinking>this</thinking>` in HTML.");
    expect(parsed.thinkingText).toBe("");
    expect(events.filter((event) => event.type === "thinking")).toHaveLength(0);
  });

  it("extracts leading  utes. utes.` blocks too", async () => {
    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"<think>quick check</think>Done."}}]}\n',
    ]), (event) => events.push(event));

    expect(parsed.contentText).toBe("Done.");
    expect(parsed.thinkingText).toBe("quick check");
  });

  it("extracts leading `<reasoning>` blocks into thinking events", async () => {
    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"<reasoning>step one reasoning</reasoning>Hello "}}]}\n',
      'data: {"choices":[{"delta":{"content":"world"}}]}\n',
    ]), (event) => events.push(event));

    expect(parsed.contentText).toBe("Hello world");
    expect(parsed.thinkingText).toBe("step one reasoning");
    expect(events.filter((event) => event.type === "token").map((event) => (event as { content: string }).content).join("")).toBe("Hello world");
    expect(events.filter((event) => event.type === "thinking").map((event) => (event as { content: string }).content).join("")).toBe("step one reasoning");
  });

  it("does not strip `<reasoning>` tags that appear after visible content has started", async () => {
    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"Use `<reasoning>` tags like "}}]}\n',
      'data: {"choices":[{"delta":{"content":"<reasoning>this</reasoning>` in HTML."}}]}\n',
    ]), (event) => events.push(event));

    expect(parsed.contentText).toBe("Use `<reasoning>` tags like <reasoning>this</reasoning>` in HTML.");
    expect(parsed.thinkingText).toBe("");
    expect(events.filter((event) => event.type === "thinking")).toHaveLength(0);
  });

  it("rejects OpenAI-compatible error chunks", async () => {
    await expect(parseOpenAIStream(streamReader([
      'data: {"error":{"message":"upstream overloaded"}}\n\n',
    ]))).rejects.toThrow("upstream overloaded");
  });

  it("propagates OpenAI-compatible reader failures", async () => {
    const reader = {
      read: vi.fn().mockRejectedValue(new Error("connection closed")),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    await expect(parseOpenAIStream(reader)).rejects.toThrow("connection closed");
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

  it("preserves a completed tool call and result at the history tail", () => {
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "assistant", content: "", tool_calls: [toolCall("call-1", "execute")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "deployed" }),
        tool_call_id: "call-1",
        name: "execute",
      },
    ];
    const original = structuredClone(history);

    __testUtils.repairToolCallHistory(history);

    expect(history).toEqual(original);
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

  it("re-injects the latest substantive user task when the tail is a bare continuation", () => {
    const task =
      "generating commit messages with Jait provider selected gives me LLM returned an empty response please fix that at last then push";
    const history: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: task },
      { role: "assistant", content: "", tool_calls: [toolCall("call-1", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "Read packages/gateway/src/services/thread-title.ts (unrelated tangent)" }),
        tool_call_id: "call-1",
        name: "file_read",
      },
      { role: "assistant", content: "", tool_calls: [toolCall("call-2", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "Read packages/gateway/src/routes/threads.ts (unrelated tangent)" }),
        tool_call_id: "call-2",
        name: "file_read",
      },
      { role: "user", content: "continue?" },
    ];

    const pruned = __testUtils.pruneHistory(history, 40, []);

    expect(pruned).toBe(true);
    // The bulk was collapsed into a summary at the top.
    expect(history[1]?.content ?? "").toContain("[conversation-summary]");
    // The bare continuation is still preserved verbatim as the final turn.
    expect(history.at(-1)).toMatchObject({ role: "user", content: "continue?" });
    // The real task survives as a live (non-tail) user turn — not only in the summary.
    const reinjected = history
      .slice(0, -1)
      .find((m) => m.role === "user" && m.content.includes(task));
    expect(reinjected).toBeDefined();
  });

  it("compacts tool output from the current turn without dropping protocol pairs", () => {
    const history: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "Inspect the repository and finish the task." },
      { role: "assistant", content: "", tool_calls: [toolCall("call-1", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "a".repeat(6_000) }),
        tool_call_id: "call-1",
        name: "file_read",
      },
      { role: "assistant", content: "", tool_calls: [toolCall("call-2", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "b".repeat(6_000) }),
        tool_call_id: "call-2",
        name: "file_read",
      },
    ];
    const contextWindow = 2_000;

    expect(__testUtils.pruneHistory(history, contextWindow, [])).toBe(false);
    expect(__testUtils.compactToolResultsToBudget(history, [], contextWindow)).toBe(true);
    __testUtils.repairToolCallHistory(history);

    expect(computeContextUsage(history, [], contextWindow).total).toBeLessThanOrEqual(
      Math.floor(contextWindow * 0.45),
    );
    expect(history[1]).toMatchObject({
      role: "user",
      content: "Inspect the repository and finish the task.",
    });
    expect(history.filter((message) => message.role === "assistant" && message.tool_calls)).toHaveLength(2);
    expect(history.filter((message) => message.role === "tool")).toHaveLength(2);
    expect(history.some((message) => message.content.includes("older tool result compacted"))).toBe(true);
  });

  it("does not re-inject when the tail user message is already substantive", () => {
    const history: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "First task: refactor the pruning helper and keep it minimal." },
      { role: "assistant", content: "Working on it with a deterministic structured summary approach." },
      { role: "assistant", content: "", tool_calls: [toolCall("call-1", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "Read packages/gateway/src/tools/agent-loop.ts" }),
        tool_call_id: "call-1",
        name: "file_read",
      },
      { role: "user", content: "now run the focused tests and report the results please" },
    ];

    __testUtils.pruneHistory(history, 40, []);

    // Only one user turn should follow the summary: the substantive tail itself.
    const userTurns = history.filter((m) => m.role === "user");
    expect(userTurns).toHaveLength(1);
    expect(history.at(-1)).toMatchObject({
      role: "user",
      content: "now run the focused tests and report the results please",
    });
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
  it("recovers when the provider returns an empty completion after a successful tool", async () => {
    const responses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Deployment finished and verified."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = responses[fetchCalls++] ?? responses[responses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Deploy and verify the change." },
    ];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [{
          type: "function",
          function: {
            name: "file_read",
            description: "Read a file",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-empty-after-tool",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
      },
      async () => ({ ok: true, message: "Tool completed" }),
    );

    expect(fetchCalls).toBe(3);
    expect(result.content).toBe("Deployment finished and verified.");
    expect(history.some((message) => message.role === "tool" && message.tool_call_id === "call-1")).toBe(true);
    expect(history.at(-1)).toMatchObject({
      role: "assistant",
      content: "Deployment finished and verified.",
    });
    expect(history.some((message) =>
      message.role === "system" && message.content.includes("previous response ended without a final answer")
    )).toBe(false);
  });

  it("surfaces an explicit error when empty post-tool completions exhaust recovery", async () => {
    const toolResponse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const emptyResponse = [
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of toolResponse) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 }))
      .mockImplementation(async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of emptyResponse) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 }));
    const persist = vi.fn();
    let toolExecutions = 0;
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Finish the task." },
    ];

    await expect(runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [{
          type: "function",
          function: {
            name: "file_read",
            description: "Read a file",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-empty-exhausted",
        abort: new AbortController(),
        maxRounds: 5,
        mode: "agent",
        onPersist: persist,
      },
      async () => {
        toolExecutions++;
        return { ok: true, message: "Tool completed" };
      },
    )).rejects.toThrow(/empty response after tool execution.*3 attempt/i);

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(toolExecutions).toBe(1);
    expect(persist).not.toHaveBeenCalled();
    expect(history.some((message) => message.role === "tool" && message.tool_call_id === "call-1")).toBe(true);
  });

  it("continues with a follow-up round when steering arrives during a final text response", async () => {
    const responses = [
      [
        'data: {"choices":[{"delta":{"content":"Initial answer."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":" Steered follow-up."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    const steering = new SteeringController();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = responses[fetchCalls++] ?? responses[responses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

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
          { role: "user", content: "Say hello." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-steer-final",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "agent",
        onEvent: (event) => {
          events.push(event);
          if (event.type === "token" && event.content === "Initial answer.") {
            steering.steer("Adjust the answer now");
          }
        },
      },
      async () => ({ ok: true, message: "" }),
      steering,
    );

    expect(fetchCalls).toBe(2);
    expect(result.content).toBe("Initial answer. Steered follow-up.");
    expect(events).toContainEqual({ type: "steering", message: "Adjust the answer now" });
  });

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
