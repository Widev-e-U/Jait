import { randomUUID } from "node:crypto";
import { ChatLoopSchema, readChatLoop, type ChatLoop } from "@jait/shared";
import type { SessionService } from "./sessions.js";
import type { WsControlPlane } from "../ws.js";

export class ChatLoopService {
  onWake?: (sessionId: string) => void;

  constructor(private sessions: SessionService, private ws?: WsControlPlane) {}

  get(sessionId: string, userId?: string): ChatLoop | null {
    return readChatLoop(this.sessions.getById(sessionId, userId)?.metadata);
  }

  private save(sessionId: string, loop: ChatLoop, userId?: string): ChatLoop {
    const session = this.sessions.getById(sessionId, userId);
    if (!session || session.status !== "active") throw new Error("Active chat not found");
    let metadata: Record<string, unknown> = {};
    try { metadata = JSON.parse(session.metadata ?? "{}"); } catch { /* old metadata */ }
    const saved = ChatLoopSchema.parse({ ...loop, revision: loop.revision + 1, updatedAt: new Date().toISOString() });
    this.sessions.update(sessionId, { metadata: { ...metadata, loop: saved } }, userId);
    const updated = this.sessions.getById(sessionId)!;
    if (updated.userId) this.ws?.broadcastToUser(updated.userId, {
      type: "chat.updated", sessionId, timestamp: saved.updatedAt, payload: { session: updated },
    });
    if (saved.status === "running") this.onWake?.(sessionId);
    return saved;
  }

  goal(sessionId: string, goal: string, criteria: string[], userId?: string): ChatLoop {
    // Validate before writing anything; tools and HTTP use the same contract.
    const loop = ChatLoopSchema.parse({
      id: randomUUID(), goal, criteria, status: "running", iteration: 0, revision: this.get(sessionId, userId)?.revision ?? 0,
      checkedIteration: -1, summary: "", nextMessage: "", evidence: [], updatedAt: new Date().toISOString(),
    });
    return this.save(sessionId, loop, userId);
  }

  control(sessionId: string, action: "pause" | "resume", userId?: string): ChatLoop {
    const loop = this.get(sessionId, userId);
    if (!loop) throw new Error("This chat has no loop goal");
    if (loop.status === "completed") throw new Error("Set a new goal to start another loop");
    return this.save(sessionId, { ...loop, status: action === "resume" ? "running" : "paused", checkedIteration: -1 }, userId);
  }

  resumeAfterAnswer(sessionId: string, requestId: string, userId?: string): ChatLoop | null {
    const loop = this.get(sessionId, userId);
    if (loop?.status !== "waiting") return loop;
    return this.save(sessionId, {
      ...loop, status: "running", checkedIteration: -1,
      nextMessage: `The user submitted an answer. Retrieve it with user.ask using requestId=${JSON.stringify(requestId)} before taking dependent actions, then continue the goal.`,
    }, userId);
  }

  check(sessionId: string, input: {
    revision: number; outcome: "continue" | "complete" | "waiting";
    summary: string; nextMessage?: string; evidence?: string[];
  }, userId?: string): ChatLoop {
    const loop = this.get(sessionId, userId);
    if (!loop || loop.status !== "running" || loop.revision !== input.revision) {
      throw new Error("Loop changed or is stopped. Read loop.status before checking again.");
    }
    if (!["continue", "complete", "waiting"].includes(input.outcome)) throw new Error("Invalid loop outcome");
    if (typeof input.summary !== "string" || !input.summary.trim()) throw new Error("A progress summary is required");
    if (input.outcome === "continue" && !input.nextMessage?.trim()) throw new Error("Define the next message before continuing");
    const evidence = input.evidence ?? [];
    if (input.outcome === "complete" && (evidence.length !== loop.criteria.length || evidence.some(item => typeof item !== "string" || !item.trim()))) {
      throw new Error("Completion needs one nonblank piece of verification evidence per acceptance criterion, in order");
    }
    return this.save(sessionId, {
      ...loop, status: input.outcome === "complete" ? "completed" : input.outcome === "waiting" ? "waiting" : "running",
      checkedIteration: loop.iteration, summary: input.summary.trim(), nextMessage: input.nextMessage?.trim() ?? "", evidence,
    }, userId);
  }

  finishTurn(sessionId: string, error?: string, cancelled = false): ChatLoop | null {
    const loop = this.get(sessionId);
    if (!loop) return loop;
    return this.save(sessionId, {
      ...loop, iteration: loop.iteration + 1,
      ...(error ? { status: "error" as const, summary: error.slice(0, 8000) }
        : cancelled ? { status: "paused" as const } : {}),
      // A turn that skipped its check must review the goal rather than replay
      // an old action. Completed side effects must always be inspected first.
      nextMessage: loop.checkedIteration === loop.iteration ? loop.nextMessage : "Review progress against every acceptance criterion. Verify completed work before repeating actions. Decide the next concrete step and continue the goal.",
    });
  }

  running(): Array<{ sessionId: string; loop: ChatLoop }> {
    return this.sessions.list("active").flatMap(session => {
      const loop = readChatLoop(session.metadata);
      return loop?.status === "running" ? [{ sessionId: session.id, loop }] : [];
    });
  }
}

export function chatLoopInstructions(loop: ChatLoop | null): string | undefined {
  if (!loop || loop.status !== "running") return undefined;
  return [
    "An explicit user-authorized chat goal loop is active. Work towards this goal across turns.",
    `Goal: ${JSON.stringify(loop.goal)}`,
    `Acceptance criteria: ${JSON.stringify(loop.criteria)}`,
    `Loop revision: ${loop.revision}; completed turns: ${loop.iteration}.`,
    `Progress: ${JSON.stringify(loop.summary)}`,
    "Before ending this turn, discover and call loop.check. Read loop.status for the current revision first. Check every criterion against actual evidence; use outcome=complete only after all criteria have passed, supplying one verification evidence entry per criterion. Otherwise use outcome=continue and write the next concrete message to yourself. If a user answer is required, use user.ask; if the turn must end awaiting input, use outcome=waiting and describe the question. Never treat missing approval as permission. Existing consent, assessment scopes, exclusions and tool limits still apply. Do not start additional agents unless the user authorized them.",
  ].join("\n");
}
