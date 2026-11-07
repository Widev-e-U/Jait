import type { ToolDefinition } from "./contracts.js";
import { DecisionError, evaluateDecision, type DecisionErrorCode, type DecisionQuestion } from "../services/system-one.js";
interface DecisionInput {
  state: string;
  questions: Array<{ id: string; type: "choice" | "score" | "noul"; instructions: string; options?: Array<{ id: string; description: string }>; levels?: string[] }>;
}
export function createDecisionEvaluateTool(): ToolDefinition<DecisionInput> {
  return {
    name: "decision.evaluate", tier: "standard", category: "meta", source: "builtin",
    description: "Use the configured System One Model for cheap bounded decisions: batch choices, ordered scores, or yes/no probabilities. Supply evidence and criteria; results are advice, never permission or proof of completion.",
    parameters: { type: "object", properties: {
      state: { type: "string", description: "Relevant evidence/context, up to 24000 characters." },
      questions: { type: "array", description: "1–48 independent questions evaluated in one call.", items: { type: "object", properties: {
        id: { type: "string", description: "Unique question identifier." },
        type: { type: "string", enum: ["choice", "score", "noul"] },
        instructions: { type: "string", description: "The bounded question to assess." },
        options: { type: "array", description: "For choice: 2–32 alternatives.", items: { type: "object", properties: { id: { type: "string" }, description: { type: "string" } }, required: ["id", "description"] } },
        levels: { type: "array", description: "For score: 2–10 descriptions ordered from lowest to highest.", items: { type: "string" } },
      }, required: ["id", "type", "instructions"] } },
    }, required: ["state", "questions"] },
    async execute(input, context) {
      try {
        if (!Array.isArray(input.questions) || new Set(input.questions.map(q => q.id)).size !== input.questions.length || input.questions.some(q => !q.id?.trim())) throw new DecisionError("invalid_input", "Question IDs must be nonempty and unique.");
        const questions: Record<string, DecisionQuestion> = Object.fromEntries(input.questions.map(q => [q.id,
          q.type === "choice" ? { type: q.type, instructions: q.instructions, criteria: Object.fromEntries((q.options ?? []).map(o => [o.id, o.description])) }
            : q.type === "score" ? { type: q.type, instructions: q.instructions, criteria: q.levels ?? [] }
              : { type: q.type, instructions: q.instructions },
        ]));
        const data = await evaluateDecision(context.apiKeys, input.state, questions, context.signal);
        return { ok: true, message: JSON.stringify(data.answers), data };
      } catch (error) {
        const code: DecisionErrorCode = context.signal?.aborted ? "cancelled" : error instanceof DecisionError ? error.code : "unavailable";
        const messages: Record<DecisionErrorCode, string> = {
          not_configured: "System One is not configured. Configure its model and endpoint in Settings.",
          invalid_input: "Invalid decision input. Check the state, question IDs, and choice or score criteria.",
          cooldown: "System One is temporarily unavailable after a recent failure. Wait 15 seconds before retrying.",
          upstream_http: "System One endpoint rejected the request. Check its model, credentials, and endpoint in Settings.",
          invalid_response: "System One returned an invalid decision response. Check model compatibility and configuration.",
          timeout: "System One request timed out. Check the endpoint or adjust its timeout in Settings.",
          cancelled: "System One request was cancelled.",
          unavailable: "System One is unavailable. Check its endpoint and connection in Settings.",
        };
        const status = error instanceof DecisionError && error.code === "upstream_http" ? error.status : undefined;
        return { ok: false, message: `${messages[code]}${status ? ` (HTTP ${status})` : ""}`, data: { code, ...(status ? { status } : {}) } };
      }
    },
  };
}
