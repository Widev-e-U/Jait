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
  it("batches two consecutive independent calls together (parallel by default)", () => {
    const queue = new ToolCallQueue();
    queue.enqueue(toolCall("a"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("b"), ToolCallPriority.Normal, true);

    const batch = queue.dequeueBatch(true);

    expect(batch.map((item) => item.toolCall.id)).toEqual(["a", "b"]);
    expect(queue.isEmpty).toBe(true);
  });

  it("runs a sequential (non-parallel-safe) call on its own", () => {
    const queue = new ToolCallQueue();
    queue.enqueue(toolCall("a", "terminal_exec"), ToolCallPriority.Normal, false);
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

// The repeating unit used across the repetition tests: long enough to be
// unambiguous, short enough that a handful of copies stays readable.
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";

describe("findDegenerateRepetition", () => {
  it("ignores text that merely reuses a phrase", () => {
    const text = "Checked the selector.\n".repeat(4)
      + "Here is what actually changed in the provider panel and why it matters. ".repeat(6);
    expect(__testUtils.findDegenerateRepetition(text)).toBeNull();
  });

  it("ignores a short answer even when it is entirely repetitive", () => {
    expect(__testUtils.findDegenerateRepetition("no. ".repeat(20))).toBeNull();
  });

  it("reports the unit and full copy count of a runaway loop", () => {
    const repetition = __testUtils.findDegenerateRepetition("Let me re-read it.\n" + LOOP_UNIT.repeat(40));

    expect(repetition).not.toBeNull();
    expect(repetition!.unit).toBe(LOOP_UNIT);
    expect(repetition!.copies).toBe(40);
    expect(repetition!.startIndex).toBe("Let me re-read it.\n".length);
  });

  it("counts copies beyond the trailing scan window", () => {
    // 20k characters of loop — more than the 16k window the scan inspects.
    const copies = Math.ceil(20_000 / LOOP_UNIT.length);
    const repetition = __testUtils.findDegenerateRepetition(LOOP_UNIT.repeat(copies));

    expect(repetition!.copies).toBe(copies);
    expect(repetition!.startIndex).toBe(0);
  });

  it("collapses the repeated run when trimming", () => {
    const trimmed = __testUtils.trimDegenerateRepetition("Preamble.\n" + LOOP_UNIT.repeat(40));

    expect(trimmed.startsWith("Preamble.\n" + LOOP_UNIT.repeat(2))).toBe(true);
    expect(trimmed).toContain("38 further identical repetitions removed");
    expect(trimmed.length).toBeLessThan(LOOP_UNIT.length * 5);
  });
});

describe("stream repetition guard", () => {
  it("cuts an OpenAI stream short once the model loops", async () => {
    const chunks = [
      ...Array.from(
        { length: 60 },
        () => `data: {"choices":[{"delta":{"content":${JSON.stringify(LOOP_UNIT)}}}]}\n`,
      ),
      'data: {"choices":[{"delta":{"content":"NEVER-REACHED"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
    ];
    const parsed = await parseOpenAIStream(streamReader(chunks));

    expect(parsed.repetition?.source).toBe("content");
    expect(parsed.finishReason).toBe("repetition");
    expect(parsed.contentText).not.toContain("NEVER-REACHED");
    // Cut off well before the 60 copies the provider was still sending.
    expect(parsed.contentText.length).toBeLessThan(LOOP_UNIT.length * 40);
  });

  it("cuts an ollama stream short on a reasoning loop", async () => {
    const chunks = [
      ...Array.from(
        { length: 60 },
        () => `${JSON.stringify({ message: { thinking: LOOP_UNIT } })}\n`,
      ),
      `${JSON.stringify({ message: { thinking: "NEVER-REACHED" }, done: true, done_reason: "stop" })}\n`,
    ];
    const parsed = await parseOllamaStream(streamReader(chunks));

    expect(parsed.repetition?.source).toBe("thinking");
    expect(parsed.finishReason).toBe("repetition");
    expect(parsed.thinkingText).not.toContain("NEVER-REACHED");
  });

  it("leaves a normal ollama stream alone", async () => {
    const parsed = await parseOllamaStream(streamReader([
      `${JSON.stringify({ message: { content: "All done." } })}\n`,
      `${JSON.stringify({ done: true, done_reason: "stop" })}\n`,
    ]));

    expect(parsed.repetition).toBeUndefined();
    expect(parsed.finishReason).toBe("stop");
  });
});

describe("runAgentLoop repetition containment", () => {
  function loopingResponse(): string[] {
    return [
      ...Array.from(
        { length: 60 },
        () => `data: {"choices":[{"delta":{"content":${JSON.stringify(LOOP_UNIT)}}}]}\n`,
      ),
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
      "data: [DONE]\n\n",
    ];
  }

  it("ends the turn instead of auto-continuing a looping response", async () => {
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of loopingResponse()) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Fix the provider selector." },
    ];
    const events: AgentLoopEvent[] = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-repetition",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
        onEvent: (event) => events.push(event),
      },
      async () => ({ ok: true, message: "unused" }),
    );

    // The old behaviour was three more `finish_reason: "length"` continuations,
    // each resuming the loop for another few thousand tokens.
    expect(fetchCalls).toBe(1);
    expect(result.aborted).toBe(false);
    expect(result.hitMaxRounds).toBe(false);
    expect(result.content).toContain("[Stopped: the model repeated the same text");
    expect(events.some((event) =>
      event.type === "steering" && event.message.includes("repeating its text")
    )).toBe(true);

    // History keeps a collapsed copy so a follow-up round can't read the wall
    // of duplicated text and fall straight back into the loop.
    const assistantTurn = history.at(-1)!;
    expect(assistantTurn.role).toBe("assistant");
    expect(assistantTurn.content).toContain("further identical repetitions removed");
    expect(assistantTurn.content.length).toBeLessThan(LOOP_UNIT.length * 5);
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
  it("replaces pruned turns with a structured summary", async () => {
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

    const pruned = await __testUtils.pruneHistory(history, 40, []);
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

  it("re-injects the latest substantive user task when the tail is a bare continuation", async () => {
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

    const pruned = await __testUtils.pruneHistory(history, 40, []);

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

  it("compacts older tool output while leaving recent results untouched", async () => {
    // One old, oversized tool result plus 12 small "recent" ones (the protected window).
    // Crushing the old one alone should be enough to hit budget, so the 12 recent results —
    // content the model just fetched — must come out byte-for-byte unchanged.
    const history: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "Inspect the repository and finish the task." },
      { role: "assistant", content: "", tool_calls: [toolCall("call-old", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "a".repeat(50_000) }),
        tool_call_id: "call-old",
        name: "file_read",
      },
    ];
    for (let i = 0; i < 12; i++) {
      history.push({ role: "assistant", content: "", tool_calls: [toolCall(`call-${i}`, "file_read")] });
      history.push({
        role: "tool",
        content: JSON.stringify({ ok: true, message: "b".repeat(1_000) }),
        tool_call_id: `call-${i}`,
        name: "file_read",
      });
    }
    const recentContentsBefore = history.filter((m) => m.role === "tool").slice(1).map((m) => m.content);
    const contextWindow = 30_000;

    expect(await __testUtils.pruneHistory(history, contextWindow, [])).toBe(false);
    expect(__testUtils.compactToolResultsToBudget(history, [], contextWindow)).toBe(true);
    __testUtils.repairToolCallHistory(history);

    const toolMessages = history.filter((message) => message.role === "tool");
    expect(toolMessages).toHaveLength(13);
    expect(toolMessages[0]!.content).toContain("older tool result compacted");
    const recentContentsAfter = toolMessages.slice(1).map((m) => m.content);
    expect(recentContentsAfter).toEqual(recentContentsBefore);
    expect(history[1]).toMatchObject({
      role: "user",
      content: "Inspect the repository and finish the task.",
    });
    expect(history.filter((message) => message.role === "assistant" && message.tool_calls)).toHaveLength(13);
  });

  it("only reaches into recent tool results as a last resort, and keeps a higher floor", () => {
    // Every tool result here is within the protected "recent" window (no older tier exists),
    // and the budget is small enough that compacting all of them still can't hit target.
    // They should still shrink — but only down to the higher recent-tier floor, never to the
    // near-nothing floor used for genuinely old results.
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

    expect(__testUtils.compactToolResultsToBudget(history, [], contextWindow)).toBe(true);
    __testUtils.repairToolCallHistory(history);

    const toolMessages = history.filter((message) => message.role === "tool");
    expect(toolMessages).toHaveLength(2);
    for (const message of toolMessages) {
      expect(message.content).toContain("older tool result compacted");
      // Shrunk from the original ~6000 chars, but not below the recent-tier floor.
      expect(message.content.length).toBeLessThan(6_000);
      expect(message.content.length).toBeGreaterThanOrEqual(3_900);
    }
  });

  it("does not re-inject when the tail user message is already substantive", async () => {
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

    await __testUtils.pruneHistory(history, 40, []);

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

describe("executeOneToolCall failure containment", () => {
  it("turns a thrown tool error into a failed result instead of rejecting", async () => {
    const events: AgentLoopEvent[] = [];
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("throwing-case", "file_read"),
      sessionId: "session-1",
      maxRetries: 0,
      onEvent: (event) => events.push(event),
      executeTool: async () => {
        throw new Error("ENOENT: no such file or directory");
      },
    });

    expect(result.result.ok).toBe(false);
    expect(result.result.message).toContain("ENOENT: no such file or directory");
    // The model still receives a tool message for this call id.
    expect(result.historyEntry).toMatchObject({ role: "tool", tool_call_id: "throwing-case" });
    expect(JSON.parse(result.historyEntry.content)).toMatchObject({ ok: false });
    expect(events.some((event) => event.type === "tool_result")).toBe(true);
  });

  it("retries a thrown transient error and succeeds on a later attempt", async () => {
    let calls = 0;
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("throwing-transient", "file_read"),
      sessionId: "session-1",
      maxRetries: 2,
      executeTool: async () => {
        calls += 1;
        if (calls < 2) throw new Error("socket hang up");
        return { ok: true, message: "recovered" };
      },
    });

    expect(calls).toBe(2);
    expect(result.result).toMatchObject({ ok: true, message: "recovered" });
    expect(result.executed.retryCount).toBe(1);
  });

  it("normalizes a malformed tool result rather than throwing on it", async () => {
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("malformed-case", "file_read"),
      sessionId: "session-1",
      maxRetries: 0,
      // A plugin/MCP tool that resolves without a message field.
      executeTool: async () => ({ ok: true } as never),
    });

    expect(result.result).toMatchObject({ ok: true, message: "" });
    expect(() => JSON.parse(result.historyEntry.content)).not.toThrow();
  });

  it("stops retrying promptly once the signal aborts", async () => {
    const controller = new AbortController();
    let calls = 0;
    const started = Date.now();
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("abort-case", "file_read"),
      sessionId: "session-1",
      maxRetries: 3,
      signal: controller.signal,
      executeTool: async () => {
        calls += 1;
        controller.abort();
        return { ok: false, message: "request timeout" };
      },
    });

    expect(calls).toBe(1);
    expect(result.result).toMatchObject({ ok: false, message: "Cancelled" });
    // Would have been ~500ms of un-abortable backoff before the fix.
    expect(Date.now() - started).toBeLessThan(400);
  });
});

describe("isTransientFailure", () => {
  it("matches genuine transient errors", () => {
    for (const message of [
      "503 service unavailable",
      "Error: socket hang up",
      "request timed out after 30s",
      "connect ECONNREFUSED 127.0.0.1:11434",
      "429 Too Many Requests",
      "upstream model is temporarily unavailable",
      "rate-limited by provider",
      "502 Bad Gateway",
    ]) {
      expect(__testUtils.isTransientFailure(message), message).toBe(true);
    }
  });

  it("ignores digits and prose that merely look transient", () => {
    for (const message of [
      "permission denied",
      "wrote 1429 bytes to disk",
      "assertion failed at line 5030",
      "the network topology diagram is missing a node",
      "exit code 1: 2 tests failed",
    ]) {
      expect(__testUtils.isTransientFailure(message), message).toBe(false);
    }
  });

  it("does not retry on transient-looking text buried deep in captured output", () => {
    const noise = `${"stdout line\n".repeat(400)}connection timeout`;
    expect(__testUtils.isTransientFailure(noise)).toBe(false);
  });

  it("treats a missing message as non-transient", () => {
    expect(__testUtils.isTransientFailure(undefined)).toBe(false);
    expect(__testUtils.isTransientFailure("")).toBe(false);
  });
});

describe("runAgentLoop parallel batch containment", () => {
  it("keeps sibling tool results when one parallel call throws", async () => {
    const responses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-a","type":"function","function":{"name":"file_read","arguments":"{}"}},{"index":1,"id":"call-b","type":"function","function":{"name":"web_search","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Done."}}]}\n\n',
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
      { role: "user", content: "Look things up." },
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
        toolSchemas: [
          { type: "function", function: { name: "file_read", description: "Read a file", parameters: { type: "object", properties: {} } } },
          { type: "function", function: { name: "web_search", description: "Search", parameters: { type: "object", properties: {} } } },
        ],
        hasTools: true,
        sessionId: "session-parallel-throw",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
        parallel: true,
        maxRetries: 0,
      },
      async (name) => {
        if (name === "web.search") throw new Error("provider exploded");
        return { ok: true, message: "file contents" };
      },
    );

    expect(result.content).toBe("Done.");
    // Every tool_call gets exactly one tool message — the throw must not eat the sibling.
    const toolMessages = history.filter((message) => message.role === "tool");
    expect(toolMessages.map((message) => message.tool_call_id).sort()).toEqual(["call-a", "call-b"]);
    const byId = Object.fromEntries(
      result.executedToolCalls.map((executed) => [executed.callId, executed]),
    );
    expect(byId["call-a"]).toMatchObject({ ok: true });
    expect(byId["call-b"]!.ok).toBe(false);
    expect(byId["call-b"]!.message).toContain("provider exploded");
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
    expect(result.segments).toEqual([
      { type: "text", content: "Initial answer." },
      { type: "steering", content: "Adjust the answer now" },
      { type: "text", content: " Steered follow-up." },
    ]);
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
  it("emits a swarm mode notice without forcing any tool call", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"No specialists needed for this."}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
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
          { role: "user", content: "Just say hi." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 1,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async () => ({ ok: true, message: "unused" }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(events[0]).toMatchObject({ type: "mode_notice", mode: "swarm" });
    expect(result.content).toBe("No specialists needed for this.");
    expect(result.executedToolCalls).toHaveLength(0);
  });

  it("runs specialist agent.spawn calls the model recommends concurrently", async () => {
    const responses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Implement the fix\\",\\"description\\":\\"Implementation Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call-2","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Verify the fix\\",\\"description\\":\\"Verification Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Swarm complete."}}]}\n\n',
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
        toolSchemas: [{
          type: "function",
          function: {
            name: "agent_spawn",
            description: "Spawn a sub-agent",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async (name, args) => {
        toolCalls.push({ name, args });
        return { ok: true, message: "Sub-agent completed", data: { content: "done" } };
      },
    );

    expect(events[0]).toMatchObject({ type: "mode_notice", mode: "swarm" });
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls.every((call) => call.name === "agent.spawn")).toBe(true);
    expect(result.content).toBe("Swarm complete.");
    expect(result.executedToolCalls).toHaveLength(2);
    for (const executed of result.executedToolCalls) {
      expect(executed).toMatchObject({ tool: "agent.spawn", ok: true });
    }
  });

  it("blocks implementation tools the coordinator tries to use directly, forcing delegation", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"edit","arguments":"{\\"path\\":\\"src/a.ts\\",\\"content\\":\\"x\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
      'data: {"choices":[{"delta":{"content":"Delegating to Implementation Specialist."}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const batch = chunks.slice(fetchCalls * 3, fetchCalls * 3 + 3);
      fetchCalls++;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of batch) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

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
          { role: "user", content: "Fix the bug." },
        ],
        toolSchemas: [{
          type: "function",
          function: {
            name: "edit",
            description: "Edit a file",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async (name, args) => {
        toolCalls.push({ name, args });
        return { ok: true, message: "unused" };
      },
    );

    // The edit tool must NOT have been executed by the coordinator.
    expect(toolCalls).toHaveLength(0);
    expect(result.executedToolCalls).toHaveLength(1);
    expect(result.executedToolCalls[0]).toMatchObject({ tool: "edit", ok: false });
    expect(result.executedToolCalls[0]!.message).toContain("not available to the Swarm coordinator");
    expect(result.executedToolCalls[0]!.message).toContain("agent tool");
  });

  it("gives concurrent agent.spawn calls a shared swarm round id, but not a solo call", async () => {
    const concurrentResponses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Implement the fix\\",\\"description\\":\\"Implementation Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call-2","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Verify the fix\\",\\"description\\":\\"Verification Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Swarm complete."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = concurrentResponses[fetchCalls++] ?? concurrentResponses[concurrentResponses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const receivedArgs: Array<Record<string, unknown>> = [];

    await runAgentLoop(
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
        toolSchemas: [{
          type: "function",
          function: {
            name: "agent_spawn",
            description: "Spawn a sub-agent",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "swarm",
      },
      async (name, args) => {
        receivedArgs.push(args as Record<string, unknown>);
        return { ok: true, message: "Sub-agent completed", data: { content: "done" } };
      },
    );

    expect(receivedArgs).toHaveLength(2);
    const roundIds = receivedArgs.map((a) => a.__swarmRoundId);
    expect(roundIds[0]).toBeTruthy();
    expect(roundIds[0]).toBe(roundIds[1]);

    // A solo agent.spawn call (no sibling in the same batch) must not get a round id.
    let fetchCalls2 = 0;
    const soloResponses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Do it\\",\\"description\\":\\"Solo Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Done."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = soloResponses[fetchCalls2++] ?? soloResponses[soloResponses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const soloArgs: Array<Record<string, unknown>> = [];
    await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Do one thing." },
        ],
        toolSchemas: [{
          type: "function",
          function: {
            name: "agent_spawn",
            description: "Spawn a sub-agent",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-2",
        abort: new AbortController(),
        maxRounds: 2,
      },
      async (name, args) => {
        soloArgs.push(args as Record<string, unknown>);
        return { ok: true, message: "Sub-agent completed", data: { content: "done" } };
      },
    );

    expect(soloArgs).toHaveLength(1);
    expect(soloArgs[0]!.__swarmRoundId).toBeUndefined();
  });

  it("forces delegation once the coordinator has made several direct reads without ever calling agent", async () => {
    // The orchestration allowlist lets the coordinator call "read" directly —
    // only mutating tools are blocked — so a coordinator that only reads and
    // never delegates stays technically "compliant" while doing none of the
    // team work Swarm mode promises. Reproduces the real incident where a
    // coordinator read files repeatedly and never once called agent.spawn.
    function readChunk(id: string, path: string): string {
      return `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name: "read", arguments: JSON.stringify({ path }) } }] } }],
      })}\n\n`;
    }
    const finishToolCalls = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n';
    const done = "data: [DONE]\n\n";

    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      if (fetchCalls <= 7) {
        const chunks = [readChunk(`call-${fetchCalls}`, `file-${fetchCalls}.ts`), finishToolCalls, done];
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
          },
        }), { status: 200 });
      }
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Investigation done."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        done,
      ];
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
      { role: "user", content: "Investigate playback errors across the codebase." },
    ];
    const events: AgentLoopEvent[] = [];

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [
          {
            type: "function",
            function: { name: "read", description: "Read", parameters: { type: "object", properties: { path: { type: "string" } } } },
          },
          {
            type: "function",
            function: { name: "agent_spawn", description: "Spawn a sub-agent", parameters: { type: "object", properties: {} } },
          },
        ],
        hasTools: true,
        sessionId: "session-undelegated-reads",
        abort: new AbortController(),
        maxRounds: 10,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async () => ({ ok: true, message: "read ok" }),
    );

    expect(result.content).toBe("Investigation done.");
    // A forced-delegation nudge landed in history once the coordinator crossed
    // the undelegated-read threshold, and was surfaced as a steering event.
    expect(
      history.some((m) => m.role === "system" && /without delegating any work/.test(String(m.content))),
    ).toBe(true);
    expect(
      events.some((e) => e.type === "steering" && /hasn't delegated/.test(e.message ?? "")),
    ).toBe(true);
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

describe("runAgentLoop tool-loop detection", () => {
  // Build a valid SSE tool-call response via JSON.stringify so embedded JSON
  // (tool-call arguments) is escaped correctly.
  function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }

  function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

  function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }

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

  function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

  it("quarantines a ping-pong loop and lets the provider recover", async () => {
    let fetchCalls = 0;
    let sawQuarantinedRound = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const toolNames = new Set((body.tools ?? []).map((tool) => tool.function?.name));
      const round = fetchCalls++;
      if (!toolNames.has("file_read") || !toolNames.has("file_write")) {
        sawQuarantinedRound = true;
        return textResponse("Recovered from the ping-pong loop.");
      }
      const name = round % 2 === 0 ? "file_read" : "file_write";
      return toolCallSSE(`call-${round}`, name, {});
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Iterate until done." },
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
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "file_read",
              description: "Read",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "file_write",
              description: "Write",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-ping-pong",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
        onEvent: () => {},
      },
      async () => ({ ok: true, message: "ok" }),
    );

    expect(result.hitMaxRounds).toBe(false);
    expect(fetchCalls).toBeLessThan(40);
    expect(result.content).toBe("Recovered from the ping-pong loop.");
    expect(result.content).not.toMatch(/Stopped: repeated the same tool call/);
    expect(sawQuarantinedRound).toBe(true);
  });

  it("without maxRounds, ends normally when the model answers before the safety backstop", async () => {
    const calls = ["file_read", "file_write"];
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (callIdx < calls.length) {
        const name = calls[callIdx]!;
        const response = toolCallSSE(`call-${callIdx + 1}`, name, {});
        callIdx++;
        return response;
      }
      return textResponse("All done.");
    });

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
          { role: "user", content: "Go." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "file_read",
              description: "Read",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "file_write",
              description: "Write",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-no-cap-data-driven",
        abort: new AbortController(),
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    expect(result.hitMaxRounds).toBe(false);
    // Ran both scripted tool rounds, then the model's final answer ended it.
    expect(callIdx).toBe(2);
    expect(result.content).toBe("All done.");
  });

  it("does not flag a legitimate multi-file read sequence", async () => {
    // Model reads four different files in a row (different args) then answers.
    const reads = ["file-a", "file-b", "file-c", "file-d"];
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (callIdx < reads.length) {
        const file = reads[callIdx];
        const response = toolCallSSE(`call-${callIdx + 1}`, "file_read", { path: file });
        callIdx++;
        return response;
      }
      return textResponse("Read all files.");
    });

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
          { role: "user", content: "Read all four files." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "file_read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-multi-read",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    expect(result.hitMaxRounds).toBe(false);
    expect(result.content).toBe("Read all files.");
    expect(result.content).not.toMatch(/Stopped/);
  });

  it("redirects a range-jitter read loop before it can consume the turn", async () => {
    const ranges: Array<[number, number]> = [
      [1, 200],
      [50, 60], [55, 62], [52, 58], [51, 61], [53, 59], [50, 60], [54, 60],
      [56, 61], [50, 59], [52, 60], [55, 60], [51, 58], [53, 61], [50, 62],
    ];
    let callIdx = 0;
    let sawQuarantinedRound = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const readAvailable = (body.tools ?? []).some((tool) => tool.function?.name === "read");
      if (!readAvailable) {
        sawQuarantinedRound = true;
        return textResponse("Recovered after the redundant reads were blocked.");
      }
      if (callIdx < ranges.length) {
        const [startLine, endLine] = ranges[callIdx]!;
        const response = toolCallSSE(`call-${callIdx + 1}`, "read", { path: "big.ts", startLine, endLine });
        callIdx++;
        return response;
      }
      return textResponse("Guard failed to detect the loop.");
    });

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
          { role: "user", content: "Find the thing in big.ts." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-narrow-read",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async (name, args) => {
        if (name === "read") {
          const { startLine, endLine } = args as { startLine: number; endLine: number };
          return { ok: true, message: "read ok", data: { startLine, endLine } };
        }
        return { ok: true, message: "ok" };
      },
    );

    expect(result.hitMaxRounds).toBe(false);
    expect(sawQuarantinedRound).toBe(true);
    expect(callIdx).toBeLessThan(ranges.length);
    expect(result.content).toBe("Recovered after the redundant reads were blocked.");
  });

  it("tolerates a handful of defensive re-reads without stopping (regression: two near-identical code blocks)", async () => {
    // Mirrors a real incident: an agent verifying which of two byte-identical
    // code blocks an edit landed in re-read the same file 7 times (1 broad +
    // 6 narrow) and was cut off before it could finish. With the behavioral
    // guardrails removed (pi-style), this runs to completion untouched.
    const ranges: Array<[number, number]> = [
      [1, 613], // broad first read
      [300, 360], [335, 349], [140, 160], [154, 163], [335, 350], [336, 351],
    ];
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (callIdx < ranges.length) {
        const [startLine, endLine] = ranges[callIdx]!;
        const response = toolCallSSE(`call-${callIdx + 1}`, "read", { path: "app-header.tsx", startLine, endLine });
        callIdx++;
        return response;
      }
      return textResponse("Verified both handlers are patched.");
    });

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
          { role: "user", content: "Fix the manager-mode switch and verify both handlers." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-defensive-reread",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async (name, args) => {
        if (name === "read") {
          const { startLine, endLine } = args as { startLine: number; endLine: number };
          return { ok: true, message: "read ok", data: { startLine, endLine } };
        }
        return { ok: true, message: "ok" };
      },
    );

    expect(result.hitMaxRounds).toBe(false);
    expect(callIdx).toBe(ranges.length);
    expect(result.content).not.toMatch(/Stopped/);
    expect(result.content).toBe("Verified both handlers are patched.");
  });

  it("does not flag sequential non-overlapping reads that grow through a file", async () => {
    // Each read covers a fresh, non-overlapping chunk of the same file —
    // genuine progress, must not be mistaken for narrow-read thrash.
    const ranges: Array<[number, number]> = [[1, 100], [101, 200], [201, 300], [301, 400]];
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (callIdx < ranges.length) {
        const [startLine, endLine] = ranges[callIdx]!;
        const response = toolCallSSE(`call-${callIdx + 1}`, "read", { path: "big.ts", startLine, endLine });
        callIdx++;
        return response;
      }
      return textResponse("Read the whole file.");
    });

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
          { role: "user", content: "Read all of big.ts." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-growing-read",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async (name, args) => {
        if (name === "read") {
          const { startLine, endLine } = args as { startLine: number; endLine: number };
          return { ok: true, message: "read ok", data: { startLine, endLine } };
        }
        return { ok: true, message: "ok" };
      },
    );

    expect(result.hitMaxRounds).toBe(false);
    expect(callIdx).toBe(ranges.length);
    expect(result.content).toBe("Read the whole file.");
    expect(result.content).not.toMatch(/Stopped/);
  });

  it("quarantines an ignored duplicate call, continues with another tool, then restores it", async () => {
    // Reproduces the stuck chat: the provider keeps requesting the exact same
    // read even after the loop guard redirects it. Recovery must not execute
    // that read again or end the turn.
    let fetchCalls = 0;
    let sawQuarantinedRound = false;
    let sawRestoredRound = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const readAvailable = (body.tools ?? []).some((tool) => tool.function?.name === "read");
      const round = fetchCalls++;

      if (round < 5) {
        return toolCallSSE(`call-stuck-${round}`, "read", {
          path: "server.js",
          startLine: 1600,
          endLine: 1944,
        });
      }
      if (round === 5) {
        sawQuarantinedRound = !readAvailable;
        return toolCallSSE("call-search", "search", { pattern: "approval_required" });
      }
      sawRestoredRound = readAvailable;
      return textResponse("Recovered with a different approach.");
    });

    const executedTools: string[] = [];
    let repeatedReadExecutedAfterRedirect = false;
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
          { role: "user", content: "Investigate server.js." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: { pattern: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-stuck-loop",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
        onEvent: (event) => events.push(event),
      },
      async (name) => {
        if (
          name === "read" &&
          events.some((event) => event.type === "steering" && /repeated tool call/.test(event.message ?? ""))
        ) {
          repeatedReadExecutedAfterRedirect = true;
        }
        executedTools.push(name);
        return { ok: true, message: `${name} ok` };
      },
    );

    expect(result.hitMaxRounds).toBe(false);
    expect(result.content).toBe("Recovered with a different approach.");
    expect(result.content).not.toMatch(/Stopped: repeated the same tool call/);
    expect(repeatedReadExecutedAfterRedirect).toBe(false);
    expect(executedTools).toEqual(["read", "read", "read", "search"]);
    expect(sawQuarantinedRound).toBe(true);
    expect(sawRestoredRound).toBe(true);
  });

  it("keeps quarantining and recovers when a provider calls an unavailable tool", async () => {
    let fetchCalls = 0;
    let quarantinedRounds = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const readAvailable = (body.tools ?? []).some((tool) => tool.function?.name === "read");
      const round = fetchCalls++;
      const args = { path: "tool-call-card.tsx", startLine: 3490, endLine: 3560 };
      if (readAvailable) return toolCallSSE(`call-read-${round}`, "read", args);

      quarantinedRounds++;
      if (quarantinedRounds > 1) {
        return textResponse("Recovered after the unavailable call was rejected.");
      }
      return toolCallWithContentSSE(
        `call-forbidden-read-${round}`,
        "read",
        args,
        "rth</｜DSML｜tool_calls>",
      );
    });

    let executedReads = 0;
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "deepseek-v4-flash:0731-cloud",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the tool card stacking issue." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-provider-ignores-quarantine",
        abort: new AbortController(),
        maxRounds: 20,
        mode: "agent",
      },
      async () => {
        executedReads++;
        return { ok: true, message: "read ok" };
      },
    );

    expect(quarantinedRounds).toBe(2);
    expect(fetchCalls).toBe(7);
    expect(executedReads).toBe(3);
    expect(result.hitMaxRounds).toBe(false);
    expect(result.content).toBe("Recovered after the unavailable call was rejected.");
    expect(result.content).not.toContain("Stopped:");
    expect(result.content).not.toContain("DSML");
  });

  it("executes an identical tool call only once when the provider repeats it within one round", async () => {
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      if (fetchCalls === 1) {
        return toolCallsSSE(
          Array.from({ length: 20 }, (_, index) => ({
            id: `call-batch-${index}`,
            name: "read",
            args: { path: "chat-queue.test.ts", startLine: 100, endLine: 260 },
          })),
        );
      }
      return textResponse("Done.");
    });

    let executedCount = 0;
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
          { role: "user", content: "Inspect the queue test." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-duplicate-batch",
        abort: new AbortController(),
        maxRounds: 10,
        mode: "agent",
        onEvent: (event) => events.push(event),
      },
      async () => {
        executedCount++;
        return { ok: true, message: "read ok" };
      },
    );

    expect(result.content).toBe("Done.");
    expect(executedCount).toBe(1);
    expect(result.executedToolCalls).toHaveLength(1);
    expect(events.some((event) => event.type === "steering" && /duplicate tool calls/i.test(event.message ?? ""))).toBe(true);
  });

  it("quarantines a repeated call hidden inside otherwise changing tool batches", async () => {
    let fetchCalls = 0;
    let sawQuarantinedRound = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const readAvailable = (body.tools ?? []).some((tool) => tool.function?.name === "read");
      const round = fetchCalls++;
      if (!readAvailable) {
        sawQuarantinedRound = true;
        return textResponse("Recovered from the changing batch loop.");
      }
      return toolCallsSSE([
        {
          id: `call-repeated-${round}`,
          name: "read",
          args: { path: "message-queue.tsx", startLine: 139, endLine: 499 },
        },
        {
          id: `call-changing-${round}`,
          name: "search",
          args: { pattern: `queue-${round}` },
        },
      ]);
    });

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
          { role: "user", content: "Inspect the queue implementation." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-changing-batch-loop",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    expect(fetchCalls).toBeLessThan(40);
    expect(result.hitMaxRounds).toBe(false);
    expect(result.content).toBe("Recovered from the changing batch loop.");
    expect(result.content).not.toMatch(/Stopped: repeated the same tool call/);
    expect(sawQuarantinedRound).toBe(true);
  });

  it("continues through an invisible checkpoint when the caller omits maxRounds", async () => {
    let fetchCalls = 0;
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Keep searching." },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const round = fetchCalls++;
      if (round < 80) {
        return toolCallSSE(`call-${round}`, "search", { pattern: `unique-${round}` });
      }
      return textResponse("Finished too late.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-default-round-backstop",
        abort: new AbortController(),
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    expect(result.hitMaxRounds).toBe(false);
    expect(result.content).toBe("Finished too late.");
    expect(result.content).not.toMatch(/Paused after/);
    expect(fetchCalls).toBe(81);
    expect(history.some((message) =>
      message.role === "system" &&
      typeof message.content === "string" &&
      message.content.includes("[AUTONOMOUS CHECKPOINT]")
    )).toBe(true);
  });

  it("compacts completed work inside the active turn before context pressure causes a duplicate-call loop", async () => {
    let fetchCalls = 0;
    let preservedRecentEvidence = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: AgentMessage[] };
      preservedRecentEvidence ||= (body.messages ?? []).some(
        (message) => message.role === "system" &&
          message.content.includes("[active-turn-summary]") &&
          message.content.includes("evidence:unique-"),
      );
      const completedToolRounds = (body.messages ?? []).filter(
        (message) => message.role === "assistant" && message.tool_calls?.length,
      ).length;
      const round = fetchCalls++;

      if (round < 10) {
        return toolCallSSE(`call-${round}`, "search", { pattern: `unique-${round}` });
      }
      if (completedToolRounds > 4) {
        return toolCallSSE(`call-stuck-${round}`, "execute", { command: "check the same logs" });
      }
      return textResponse("Recovered from the long investigation.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 4_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Investigate until you can explain the failure." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "execute",
              description: "Execute",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-active-turn-compaction",
        abort: new AbortController(),
        maxRounds: 40,
        continuous: true,
        mode: "agent",
      },
      async (name, args) => ({
        ok: true,
        message: name === "execute" ? "no matching logs" : "search complete",
        data: name === "search"
          ? { output: `evidence:${(args as { pattern: string }).pattern} ${"x".repeat(2_000)}` }
          : { output: "" },
      }),
    );

    expect(result.content).toBe("Recovered from the long investigation.");
    expect(result.content).not.toMatch(/Stopped: repeated the same tool call/);
    expect(preservedRecentEvidence).toBe(true);
  });

  it("keeps explicit round budgets bounded for specialist runs", async () => {
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const round = fetchCalls++;
      return toolCallSSE(`call-${round}`, "search", { pattern: `unique-${round}` });
    });

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
          { role: "user", content: "Search within this bounded specialist run." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-explicit-round-budget",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    expect(result.hitMaxRounds).toBe(true);
    expect(result.content).toMatch(/Paused after 2 tool rounds/);
    expect(fetchCalls).toBe(2);
  });

  it("caps the thinking persisted to history so long reasoning blocks don't grow context unboundedly", async () => {
    // Filler that is long but not a verbatim loop — `"x".repeat(5000)` would
    // (correctly) trip the runaway-repetition guard instead of exercising the cap.
    const longThinking = Array.from(
      { length: 250 },
      (_, step) => `Step ${step}: inspect branch ${step % 7} of the call graph.`,
    ).join(" ");
    const responses = [
      [
        `data: {"choices":[{"delta":{"content":"<thinking>${longThinking}</thinking>"}}]}\n\n`,
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Done."}}]}\n\n',
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
      { role: "user", content: "Do the task." },
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
        sessionId: "session-thinking-cap",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
      },
      async () => ({ ok: true, message: "Tool completed" }),
    );

    expect(result.content).toBe("Done.");
    const assistantWithTools = history.find((m) => m.role === "assistant" && m.tool_calls);
    expect(assistantWithTools?.thinking).toBeDefined();
    // 1 ellipsis + 4000 tail chars — capped, not the full reasoning block.
    expect(longThinking.length).toBeGreaterThan(4_000);
    expect(assistantWithTools!.thinking!.length).toBe(4001);
    // The tail is preserved (reasoning continuity), not the head.
    expect(assistantWithTools!.thinking!.endsWith(longThinking.slice(-4_000))).toBe(true);
  });

  it("recovers instead of stopping when a thinking-only round repeats the same reasoning verbatim", async () => {
    // A thinking-only response has no visible text and no tool call, so it hits
    // empty-response recovery. Before the fix that recovery re-issued a
    // byte-identical request, the provider reproduced the same reasoning, and
    // each copy was concatenated onto the same thinking segment — the user saw
    // the model repeat itself two or three times inside one block.
    const thinking =
      "The user says the spiral happened in the thinking block. Let me look at the thinking content of the big spiral message and work out what produced it.";
    const thinkingOnly = [
      `data: {"choices":[{"delta":{"content":"<thinking>${thinking}</thinking>"}}]}\n\n`,
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      if (fetchCalls === 3) {
        return textResponse("Recovered after the repeated reasoning was rejected.");
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of thinkingOnly) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const events: AgentLoopEvent[] = [];
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Why did it spiral?" },
    ];
    const result = await runAgentLoop({
      llm: {
        openaiApiKey: "test-key",
        openaiBaseUrl: "https://llm.test",
        openaiModel: "test-model",
        contextWindow: 100_000,
      },
      history,
      toolSchemas: [],
      hasTools: false,
      sessionId: "session-thinking-replay",
      abort: new AbortController(),
      maxRounds: 6,
      mode: "agent",
      onEvent: (e) => events.push(e),
    });

    expect(fetchCalls).toBe(3);
    expect(result.content).toBe("Recovered after the repeated reasoning was rejected.");
    expect(result.content).not.toContain("Stopped:");
    expect(events.some((e) => e.type === "steering" && /repeated the same reasoning/i.test(e.message ?? ""))).toBe(true);

    // The reasoning is recorded once, not glued to itself.
    const thinkingSegments = result.segments.filter((s) => s.type === "thinking");
    expect(thinkingSegments).toHaveLength(1);
    expect(thinkingSegments[0]!.content.split(thinking).length - 1).toBe(1);
  });

  it("feeds answer-less reasoning back as an assistant turn so the retry request differs", async () => {
    const firstThinking =
      "I need to decide how to answer this. Let me weigh the options carefully before writing anything down for the user.";
    const responses = [
      [
        `data: {"choices":[{"delta":{"content":"<thinking>${firstThinking}</thinking>"}}]}\n\n`,
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Here is the answer."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    const bodies: string[] = [];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(String((init as RequestInit).body));
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
      { role: "user", content: "Answer me." },
    ];
    const result = await runAgentLoop({
      llm: {
        openaiApiKey: "test-key",
        openaiBaseUrl: "https://llm.test",
        openaiModel: "test-model",
        contextWindow: 100_000,
      },
      history,
      toolSchemas: [],
      hasTools: false,
      sessionId: "session-thinking-recovery",
      abort: new AbortController(),
      maxRounds: 6,
      mode: "agent",
    });

    expect(result.content).toBe("Here is the answer.");
    // The retry payload carries the reasoning that produced no answer, so it is
    // not a byte-identical replay of the attempt that just failed.
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toContain(firstThinking);
    expect(bodies[1]).not.toBe(bodies[0]);
    expect(bodies[1]).toContain("produced reasoning but no answer");
    // Recorded as a real assistant turn, so it survives recovery-prompt cleanup.
    expect(history.some((m) => m.role === "assistant" && m.content === "" && m.thinking === firstThinking)).toBe(true);
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
