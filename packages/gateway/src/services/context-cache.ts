import { createHash } from "node:crypto";
import type { ContextBudget } from "./context-budget.js";

/** Only opt known compatible routes into provider-specific wire extensions. */
export function applyContextCaching(body: Record<string, unknown>, route: { backend?: string; model?: string; sessionId?: string }, budget: Pick<ContextBudget, "cacheTtl">): void {
  if (route.backend === "openai") {
    body.prompt_cache_key = route.sessionId
      ? `jait-${createHash("sha256").update(route.sessionId).digest("hex").slice(0, 24)}` : "jait-agent";
  }
  if (route.backend !== "openrouter" || !/claude/i.test(route.model ?? "") || !Array.isArray(body.messages)) return;
  const messages = structuredClone(body.messages) as Array<Record<string, unknown>>;
  const eligible = messages.map((m, i) => m.role !== "tool" && (typeof m.content === "string" && m.content.length > 0 || Array.isArray(m.content) && m.content.length > 0) ? i : -1).filter(i => i >= 0);
  const system = eligible.find(i => messages[i]!.role === "system");
  const selected = new Set([...(system === undefined ? [] : [system]), ...eligible.filter(i => i !== system).slice(-3)]);
  // Preserve the wire shape after a rolling marker moves past a message.
  for (const index of eligible) {
    const message = messages[index]!;
    if (typeof message.content === "string") message.content = [{ type: "text", text: message.content }];
    for (const part of message.content as Array<Record<string, unknown>>) if (part && typeof part === "object") delete part.cache_control;
  }
  for (const index of selected) {
    const message = messages[index]!;
    const marker = budget.cacheTtl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };
    if (typeof message.content === "string") message.content = [{ type: "text", text: message.content, cache_control: marker }];
    else {
      const parts = message.content as Array<Record<string, unknown>>;
      const last = parts[parts.length - 1];
      if (last && typeof last === "object" && last.type === "text") last.cache_control = marker;
    }
  }
  body.messages = messages;
}
