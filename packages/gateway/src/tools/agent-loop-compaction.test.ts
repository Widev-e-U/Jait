import { afterEach, describe, expect, it, vi } from "vitest";
import { __testUtils, compactActiveTurnHistory, generateLLMConversationSummary, pruneHistory, type AgentMessage, type LLMConfig } from "./agent-loop.js";

const llm: LLMConfig = { backend: "ollama", openaiBaseUrl: "http://fixture.invalid/v1", openaiApiKey: "fixture", openaiModel: "fixture", contextWindow: 8000 };
afterEach(() => vi.unstubAllGlobals());

function model() {
  const requests: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const input = JSON.stringify(body.messages);
    return Response.json({ message: { content: input.includes("scope-expires-at-18:00") ? "Keep scope-expires-at-18:00; tests passed; next verify rollback." : "tests passed; next verify rollback." } });
  }));
  return requests;
}

describe("multimodal context compaction", () => {
  function imageRequest(): AgentMessage {
    // Match the content-part array created by routes/chat.ts for attachments.
    return { role: "user", content: [
      { type: "text", text: "Remove the orange dot and center the Agents button" },
      { type: "image_url", image_url: { url: "data:image/png;base64,PRIVATE_IMAGE_BYTES" } },
      { type: "text", text: "[File: apps/web/src/button.tsx] preserve the label" },
    ] as unknown as string };
  }

  it("preserves attachment text in the structured fallback without exposing image bytes", () => {
    const summary = __testUtils.buildStructuredConversationSummary([imageRequest()]);
    expect(summary).toContain("Remove the orange dot and center the Agents button");
    expect(summary).toContain("preserve the label");
    expect(summary).toContain("[image attached]");
    expect(summary).not.toContain("PRIVATE_IMAGE_BYTES");
    expect(summary).not.toContain("[object Object]");
  });

  it("sends readable attachment text to the model summarizer", async () => {
    const requests = model();
    await generateLLMConversationSummary([imageRequest()], llm);
    const input = JSON.stringify(requests[0].messages);
    expect(input).toContain("Remove the orange dot and center the Agents button");
    expect(input).toContain("[image attached]");
    expect(input).not.toContain("PRIVATE_IMAGE_BYTES");
    expect(input).not.toContain("[object Object]");
  });

  it("uses the same attachment-safe fallback when the model summary fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const summary = await generateLLMConversationSummary([imageRequest()], llm);
    expect(summary).toContain("Degraded checkpoint");
    expect(summary).toContain("Remove the orange dot and center the Agents button");
    expect(summary).toContain("[image attached]");
    expect(summary).not.toContain("PRIVATE_IMAGE_BYTES");
  });

  it("prunes attachment history and restores its task after a bare continuation", async () => {
    const request = imageRequest();
    const original = structuredClone(request);
    const history: AgentMessage[] = [
      { role: "system", content: "base" },
      request,
      { role: "assistant", content: "x".repeat(18000) },
      { role: "user", content: "continue" },
    ];
    expect(await pruneHistory(history, 2000, [])).toBe(true);
    expect(history.some(m => m.role === "user" && m.content.includes("Remove the orange dot"))).toBe(true);
    expect(history.at(-1)?.content).toBe("continue");
    expect(request).toEqual(original);
  });
});

describe("context checkpoint handoff", () => {
  it("carries prior summaries through repeated real pruning", async () => {
    const requests = model();
    const history: AgentMessage[] = [
      { role: "system", content: "base instructions" },
      { role: "system", content: "[conversation-summary]scope-expires-at-18:00[/conversation-summary]" },
      { role: "user", content: "Prepare rollback " + "x".repeat(10000) },
      { role: "assistant", content: "Tests passed " + "x".repeat(10000) },
      { role: "user", content: "Verify changes" },
    ];
    for (let pass = 0; pass < 2; pass++) {
      expect(await pruneHistory(history, 2000, [], { summaryGenerator: removed => generateLLMConversationSummary(removed, llm) })).toBe(true);
      expect(history.filter(m => m.content.includes("[conversation-summary]")).length).toBe(1);
      expect(history.find(m => m.content.includes("[conversation-summary]"))?.content).toContain("scope-expires-at-18:00");
      history.push({ role: "assistant", content: "More evidence " + "y".repeat(15000) }, { role: "user", content: "Continue verification" });
    }
    expect(requests).toHaveLength(2);
  });

  it("summarizes outcomes without replaying private thinking and preserves tool-result tails", async () => {
    const requests = model();
    await generateLLMConversationSummary([
      { role: "assistant", content: "Run verification", thinking: "unnecessary-internal-narrative" },
      { role: "tool", content: "header " + "x".repeat(4000) + " FINAL: 7 passed", tool_call_id: "c1" },
    ], llm);
    const input = JSON.stringify(requests[0].messages);
    expect(input).not.toContain("unnecessary-internal-narrative");
    expect(input).toContain("FINAL: 7 passed");
    // A generous cap costs nothing when unused and leaves reasoning headroom.
    expect(requests[0].options.num_predict).toBe(8192);
    expect(input).not.toContain("Use this EXACT format");
  });

  it("does not modify history when summarization is cancelled", async () => {
    const abort = new AbortController();
    const history: AgentMessage[] = [{ role: "system", content: "base" }, { role: "user", content: "old task" }, { role: "assistant", content: "x".repeat(18000) }, { role: "user", content: "current task" }];
    const before = structuredClone(history);
    vi.stubGlobal("fetch", vi.fn(async () => { abort.abort(); throw new DOMException("Aborted", "AbortError"); }));
    await expect(pruneHistory(history, 2000, [], { summaryGenerator: removed => generateLLMConversationSummary(removed, llm, abort.signal) })).rejects.toThrow();
    expect(history).toEqual(before);
  });
});

describe("active turn handoff", () => {
  function history(): AgentMessage[] {
    return [
      { role: "system", content: "base instructions" },
      { role: "user", content: "Verify authorized targets; preserve evidence" },
      { role: "system", content: "[active-turn-summary]scope-expires-at-18:00[/active-turn-summary]" },
      ...Array.from({ length: 38 }, (_, i): AgentMessage[] => [
        { role: "assistant", content: `Evidence ${i}`, tool_calls: [{ id: `c${i}`, type: "function", function: { name: "file_read", arguments: "{}" } }] },
        { role: "tool", tool_call_id: `c${i}`, content: `result-${i} ` + "x".repeat(400) },
      ]).flat(),
    ];
  }
  it("summarizes the entire removed prefix and previous checkpoint, retaining recent pairs", async () => {
    const messages = history();
    const original = structuredClone(messages);
    let source: AgentMessage[] = [];
    expect(await compactActiveTurnHistory(messages, [], 1000, { summaryGenerator: async removed => {
      source = removed;
      expect(messages).toEqual(original);
      return "[conversation-summary]Scope and progress preserved; next verify rollback.[/conversation-summary]";
    } })).toBe(true);
    expect(source.some(m => m.content.includes("scope-expires-at-18:00"))).toBe(true);
    expect(source.some(m => m.content.startsWith("result-0 "))).toBe(true);
    expect(source.filter(m => m.role === "tool")).toHaveLength(30);
    expect(messages[1]).toEqual(original[1]);
    expect(messages[2].content).toContain("[active-turn-summary]");
    expect(messages.slice(3)).toEqual(original.slice(-16));
  });
  it("leaves the active turn intact when generation fails", async () => {
    const messages = history();
    const original = structuredClone(messages);
    await expect(compactActiveTurnHistory(messages, [], 1000, { summaryGenerator: async () => { throw new Error("cancelled"); } })).rejects.toThrow("cancelled");
    expect(messages).toEqual(original);
  });
  it("preserves the old checkpoint when the model is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    const result = await generateLLMConversationSummary(history(), llm);
    expect(result).toContain("scope-expires-at-18:00");
    expect(result).toContain("Degraded checkpoint");
  });

  it("salvages a checkpoint that hit the output cap instead of discarding it", async () => {
    // Reasoning models can consume the whole budget before emitting content, so
    // a capped-but-non-empty handoff must survive in both wire formats.
    for (const body of [
      { message: { content: "Objective: verify rollback. Next: re-run probe." }, done_reason: "length" },
      { choices: [{ message: { content: "Objective: verify rollback. Next: re-run probe." }, finish_reason: "length" }] },
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
      const result = await generateLLMConversationSummary(history(), llm);
      expect(result).toContain("[conversation-summary]");
      expect(result).toContain("Objective: verify rollback");
      expect(result).toContain("stopped at the output token budget");
      expect(result).not.toContain("Degraded checkpoint");
    }
  });

  it("falls back when the cap was hit before any content was emitted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: { content: "   " }, done_reason: "length" })));
    const result = await generateLLMConversationSummary(history(), llm);
    expect(result).toContain("scope-expires-at-18:00");
    expect(result).toContain("Degraded checkpoint");
  });

  it("retries at the conservative budget when the provider rejects the raised cap", async () => {
    // A budget above a model's output limit is refused, not clamped, so the
    // raised cap must not cost the model-written handoff outright.
    const budgets: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      budgets.push(body.max_tokens);
      if (body.max_tokens === 8192) return new Response("max_tokens too large", { status: 400 });
      return Response.json({ choices: [{ message: { content: "Objective: verify rollback." }, finish_reason: "stop" }] });
    }));
    const result = await generateLLMConversationSummary(history(), { ...llm, backend: "openai" });
    expect(budgets).toEqual([8192, 2048]);
    expect(result).toContain("Objective: verify rollback.");
    expect(result).not.toContain("Degraded checkpoint");
  });
});
