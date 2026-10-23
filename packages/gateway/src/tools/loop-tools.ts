import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import type { ChatLoopService } from "../services/chat-loops.js";

export function createLoopTools(service: ChatLoopService): ToolDefinition[] {
  type LoopInput = { goal: string; criteria: string[]; revision: number; outcome: "continue" | "complete" | "waiting"; summary: string; nextMessage?: string; evidence?: string[] };
  const execute = (run: (input: LoopInput, context: ToolContext) => unknown) => async (input: unknown, context: ToolContext): Promise<ToolResult> => {
    try {
      if (!context.userId || (context.threadId && context.threadId !== context.sessionId)) throw new Error("Loop tools require an authenticated chat; thread workers cannot start chat loops");
      const data = run(input as LoopInput, context);
      return { ok: true, message: "Chat loop updated.", data };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Loop operation failed" }; }
  };
  const base = { page: "chat" as const, risk: "low" as const, defaultConsentLevel: "none" as const, tier: "standard" as const, category: "meta" as const, source: "builtin" as const };
  return [
    {
      ...base, name: "loop.goal", displayName: "Chat loop goal",
      description: "Turn this chat into a persistent goal loop, only when the user requests autonomous continuation. Replaces the previous goal. Continues across chat completions until verified complete, paused, waiting for input, or an error. Preserves existing tool consent and security scope. Routine completion notifications are muted.",
      parameters: { type: "object", properties: {
        goal: { type: "string", minLength: 1, maxLength: 8000 },
        criteria: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 2000 } },
      }, required: ["goal", "criteria"] },
      execute: execute((input, ctx) => service.goal(ctx.sessionId, input.goal, input.criteria, ctx.userId)),
    },
    {
      ...base, name: "loop.status", displayName: "Chat loop status",
      description: "Read this chat's loop goal, acceptance criteria, current revision, progress, next message and verification evidence.",
      parameters: { type: "object", properties: {} },
      execute: execute((_input, ctx) => service.get(ctx.sessionId, ctx.userId)),
    },
    {
      ...base, name: "loop.check", displayName: "Check loop goal",
      description: "Evaluate the active goal before ending each turn. Continue with a concrete next message, wait for user input, or complete with one verified evidence entry per acceptance criterion. Pass the revision from loop.status; stale checks cannot restart a paused or changed goal.",
      parameters: { type: "object", properties: {
        revision: { type: "number" }, outcome: { type: "string", enum: ["continue", "complete", "waiting"] },
        summary: { type: "string", minLength: 1, maxLength: 8000 },
        nextMessage: { type: "string", maxLength: 8000 },
        evidence: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 2000 } },
      }, required: ["revision", "outcome", "summary"] },
      execute: execute((input, ctx) => service.check(ctx.sessionId, input, ctx.userId)),
    },
    ...(["pause", "resume"] as const).map(action => ({
      ...base, name: `loop.${action}`, displayName: `${action === "pause" ? "Pause" : "Resume"} chat loop`,
      description: action === "pause" ? "Pause automatic continuation after the current turn. The goal and progress remain saved." : "Resume this chat's saved goal loop after the user requests continuation. Does not bypass pending questions or approvals.",
      parameters: { type: "object" as const, properties: {} },
      execute: execute((_input, ctx) => service.control(ctx.sessionId, action, ctx.userId)),
    })),
  ];
}
