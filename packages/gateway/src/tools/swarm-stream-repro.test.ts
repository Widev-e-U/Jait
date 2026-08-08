import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { runAgentLoop, type AgentLoopEvent } from "./agent-loop.js";
import { runAcpSpecialistTurn } from "./agent-acp-runner.js";
import { ProviderRegistry } from "../providers/registry.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderSession,
  StartSessionOptions,
} from "../providers/contracts.js";

/**
 * Repro for: "In swarm chat mode the streamed assistant response does not
 * render live — the user sees a swarm indication but no streaming content
 * until they reload."
 *
 * We drive the real swarm coordinator (`runAgentLoop`, mode: "swarm") and let
 * it delegate to a specialist through the real ACP sub-agent runner
 * (`runAcpSpecialistTurn`). The fake ACP provider streams its prose token by
 * token. We then assert that the coordinator's event stream carries that
 * prose as LIVE `tool_output` events (stamped with the agent call id) that
 * arrive BEFORE the specialist's final `tool_result` — i.e. that live
 * streaming happens, and nothing requires a second request/reload to surface
 * the content.
 */

class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = {
    id: "claude-code",
    name: "Claude Code",
    description: "",
    available: true,
    modes: ["full-access", "supervised"] as const,
    auth: { login: false, logout: false, deviceCode: false },
  };
  readonly emitter = new EventEmitter();
  startedSessions: StartSessionOptions[] = [];
  sentTurns: Array<{ sessionId: string; message: string }> = [];

  async checkAvailability(): Promise<boolean> {
    return true;
  }
  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.startedSessions.push(options);
    return { id: `sess-${this.startedSessions.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }
  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sentTurns.push({ sessionId, message });
    // Stream the specialist's prose live, token by token.
    this.emitter.emit("event", { type: "token", sessionId, content: "specialist live prose" } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "token", sessionId, content: " more content" } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "message", sessionId, role: "assistant", content: "specialist live prose more content" } satisfies ProviderEvent);
  }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}

const coordinatorDelegateStream = [
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-agent-1","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"investigate the bug\\",\\"description\\":\\"Specialist Investigator\\"}"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  "data: [DONE]\n\n",
];

const coordinatorFinalStream = [
  'data: {"choices":[{"delta":{"content":"Swarm complete."},"finish_reason":null}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
  "data: [DONE]\n\n",
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("swarm mode live streaming repro", () => {
  it("emits a specialist's prose as live tool_output events before the specialist's tool_result", async () => {
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = fetchCalls++ === 0 ? coordinatorDelegateStream : coordinatorFinalStream;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    });

    const events: AgentLoopEvent[] = [];
    const registry = new ProviderRegistry();
    registry.register(new FakeAcpProvider());

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
          { role: "user", content: "investigate the bug" },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "agent_spawn",
              description: "Spawn a specialist sub-agent",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async (name, args, sessionId, auth, _onChunk, _signal, onNestedEvent) => {
        return runAcpSpecialistTurn({
          providerRegistry: registry,
          config: { host: "127.0.0.1", port: 8000 },
          providerId: "claude-code",
          userId: auth?.userId ?? "user-1",
          sessionId,
          subAgentId: "sub-1",
          projectRoot: "/repo",
          prompt: String((args as { prompt?: string }).prompt ?? ""),
          onNestedEvent,
        });
      },
    );

    expect(result.executedToolCalls).toHaveLength(1);
    expect(result.executedToolCalls[0]!.tool).toBe("agent.spawn");

    const types = events.map((e) => e.type);

    // The coordinator announces swarm mode (the visible "swarm indication").
    expect(types).toContain("mode_notice");

    // ── REGRESSION ────────────────────────────────────────────────────
    // The specialist's prose must be streamed LIVE as `tool_output` events
    // (channel=text) with the agent call id stamped on them — NOT withheld
    // until the specialist's `tool_result`. If these events are absent (or
    // keyed with an id no frontend tool card matches), the UI would show only
    // the swarm indication and the content would only surface on reload.
    const liveProseEvents = events.filter(
      (e): e is Extract<AgentLoopEvent, { type: "tool_output" }> =>
        e.type === "tool_output" && typeof e.content === "string" && e.content.includes("specialist live prose"),
    );
    expect(
      liveProseEvents,
      `expected live tool_output events for specialist prose; got: ${types.join(",")}`,
    ).not.toHaveLength(0);

    // Each live prose event must carry the agent call id (so the frontend can
    // attach it to the specialist's card) and must arrive before the
    // specialist's final tool_result.
    for (const ev of liveProseEvents) {
      expect(ev.call_id).toBe("call-agent-1");
    }
    const agentResultIdx = events.findIndex(
      (e) => e.type === "tool_result" && e.callId === "call-agent-1",
    );
    for (const ev of liveProseEvents) {
      const proseIdx = events.indexOf(ev);
      expect(proseIdx).toBeGreaterThan(-1);
      expect(proseIdx, "live prose must be emitted before the specialist's tool_result").toBeLessThan(
        agentResultIdx === -1 ? events.length : agentResultIdx,
      );
    }
  });
});
