import { describe, expect, it } from "vitest";
import { forwardThreadEventAsNested } from "./thread-tools.js";
import type { NestedAgentEvent } from "./contracts.js";
import type { ProviderEvent } from "../providers/contracts.js";

function collect(threadId: string, events: ProviderEvent[]): NestedAgentEvent[] {
  const out: NestedAgentEvent[] = [];
  for (const event of events) forwardThreadEventAsNested((e) => out.push(e), threadId, event);
  return out;
}

const SID = "provider-session-1";

describe("thread work rendered as nested chat events", () => {
  it("routes a thread's prose and reasoning to that thread's own card", () => {
    const out = collect("thread-a", [
      { type: "token", sessionId: SID, content: "working on it" },
      { type: "thinking", sessionId: SID, content: "let me check" },
    ]);

    expect(out).toEqual([
      { type: "tool_output", call_id: "thread-a", content: "working on it", channel: "text" },
      { type: "tool_output", call_id: "thread-a", content: "let me check", channel: "thinking" },
    ]);
  });

  it("hangs a thread's own tool calls under that thread", () => {
    const out = collect("thread-a", [
      { type: "tool.start", sessionId: SID, tool: "file.read", args: { path: "a.ts" }, callId: "c1" },
      { type: "tool.output", sessionId: SID, callId: "c1", content: "chunk" },
      { type: "tool.result", sessionId: SID, tool: "file.read", ok: true, message: "read", callId: "c1" },
    ]);

    expect(out[0]).toMatchObject({ type: "tool_start", tool: "file.read", call_id: "c1", parent_call_id: "thread-a" });
    expect(out[1]).toMatchObject({ type: "tool_output", call_id: "c1", content: "chunk" });
    expect(out[2]).toMatchObject({ type: "tool_result", call_id: "c1", ok: true, parent_call_id: "thread-a" });
  });

  it("keeps concurrent threads on separate cards", () => {
    // create_many runs N threads under ONE thread.control tool call. Without
    // per-thread keying their output interleaves into a single card.
    const a = collect("thread-a", [{ type: "token", sessionId: SID, content: "from A" }]);
    const b = collect("thread-b", [{ type: "token", sessionId: SID, content: "from B" }]);

    expect(a[0]).toMatchObject({ call_id: "thread-a", content: "from A" });
    expect(b[0]).toMatchObject({ call_id: "thread-b", content: "from B" });
  });

  it("ignores lifecycle events, which the synthetic card already represents", () => {
    const out = collect("thread-a", [
      { type: "session.started", sessionId: SID },
      { type: "turn.started", sessionId: SID },
      { type: "turn.completed", sessionId: SID },
      { type: "message", sessionId: SID, role: "assistant", content: "duplicate of streamed tokens" },
      { type: "session.completed", sessionId: SID },
    ]);

    expect(out).toEqual([]);
  });
});
