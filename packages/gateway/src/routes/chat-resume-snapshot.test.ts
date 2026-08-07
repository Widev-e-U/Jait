import { afterEach, describe, expect, it } from "vitest";
import { __chatTestUtils } from "./chat.js";

const {
  sessionHistory,
  sessionStreamingState,
  buildVisibleHistoryMessages,
  accumulateToolStart,
  accumulateToolResult,
  getOrCreateAccumulator,
} = __chatTestUtils;

const SESSION = "resume-snapshot-session";

afterEach(() => {
  sessionHistory.delete(SESSION);
  sessionStreamingState.delete(SESSION);
});

/**
 * Mid-turn state for a session whose current round is a running `agent` call
 * (a swarm specialist), with the specialist's own nested tool call underneath.
 *
 * The LLM history array is the *same* array the agent loop mutates, so the
 * assistant message carrying this round's tool_calls is already in it while
 * the sub-agent is still running. Tool state goes through the real
 * accumulators, which is what a reconnect snapshot is rebuilt from.
 */
function seedRunningSubAgent(): void {
  sessionHistory.set(SESSION, [
    { role: "system", content: "system" },
    { role: "user", content: "fix the thing" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call-agent-1", type: "function", function: { name: "agent", arguments: '{"description":"Developer"}' } },
      ],
    },
  ] as never);

  getOrCreateAccumulator(SESSION);
  accumulateToolStart(SESSION, "call-agent-1", "agent", { description: "Developer" });
  // The specialist's own tool call, hanging under the agent card.
  accumulateToolStart(SESSION, "child-read-1", "file.read", { path: "a.ts" }, "call-agent-1");
}

function snapshot() {
  return buildVisibleHistoryMessages(
    SESSION,
    sessionHistory.get(SESSION)!,
    { includePendingAssistantToolCalls: true },
  );
}

describe("reconnect snapshot while a sub-agent is running", () => {
  it("returns a single assistant turn carrying the nested specialist calls", () => {
    seedRunningSubAgent();

    const assistants = snapshot().filter((m) => m.role === "assistant");
    // Two assistant bubbles for one in-flight turn means the client renders a
    // phantom `agent` card (from LLM history, no children, never completes)
    // above the real accumulator-backed one — the card that appears stuck
    // after navigating away and back mid-sub-agent.
    expect(assistants).toHaveLength(1);

    const toolCalls = (assistants[0]!.toolCalls ?? []) as Array<Record<string, unknown>>;
    expect(toolCalls.map((tc) => tc["callId"])).toEqual(["call-agent-1", "child-read-1"]);
    expect(toolCalls[1]!["parentCallId"]).toBe("call-agent-1");
  });

  it("reports still-running calls as running, not as already-succeeded", () => {
    seedRunningSubAgent();

    const toolCalls = (snapshot().at(-1)!.toolCalls ?? []) as Array<Record<string, unknown>>;
    // ok defaults to true on the accumulator entry, so without an explicit
    // status the snapshot claimed success-with-no-message and the card came
    // back looking finished and frozen.
    expect(toolCalls[0]!["status"]).toBe("running");
    expect(toolCalls[1]!["status"]).toBe("running");
  });

  it("flips a call to its real outcome once the result lands", () => {
    seedRunningSubAgent();
    accumulateToolResult(SESSION, "child-read-1", true, "read 40 lines");
    accumulateToolResult(SESSION, "call-agent-1", false, "Sub-agent hit its maxRounds cap");

    const toolCalls = (snapshot().at(-1)!.toolCalls ?? []) as Array<Record<string, unknown>>;
    expect(toolCalls[0]!["status"]).toBe("error");
    expect(toolCalls[1]!["status"]).toBe("success");
    expect(toolCalls[1]!["message"]).toBe("read 40 lines");
  });
});
