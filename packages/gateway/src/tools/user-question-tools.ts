import type { UserQuestion, UserQuestionService } from "../services/user-questions.js";
import type { ToolDefinition } from "./contracts.js";
import { ToolName } from "./tool-names.js";

interface UserAskInput {
  title?: string;
  attention?: "normal" | "urgent";
  requestId?: string;
  questions?: Array<{
    id: string;
    header: string;
    question: string;
    multiSelect?: boolean;
    allowFreeformInput?: boolean;
    options?: Array<{
      label: string;
      description?: string;
      recommended?: boolean;
    }>;
  }>;
}

function normalizeQuestions(input: UserAskInput): UserQuestion[] {
  return (input.questions ?? []).map((question) => ({
    id: question.id.trim(),
    header: question.header.trim(),
    question: question.question.trim(),
    multiSelect: question.multiSelect === true,
    allowFreeformInput: question.allowFreeformInput !== false,
    options: Array.isArray(question.options)
      ? question.options
        .map((option) => ({
          label: option.label.trim(),
          description: option.description?.trim() || undefined,
          recommended: option.recommended === true,
        }))
        .filter((option) => option.label)
      : undefined,
  }));
}

export function createUserAskTool(userQuestions: UserQuestionService): ToolDefinition<UserAskInput> {
  return {
    name: ToolName.UserAsk,
    description: "Ask the user one or more structured questions and wait until they answer or cancel, without a timeout. MCP calls may return pending with a requestId: keep calling user.ask with only that requestId until answered or cancelled; do not create another question or proceed without the answer. Questions are surfaced on every connected Jait client; attention only controls notification emphasis.",
    parameters: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "Resume waiting for a pending request. Supply only this field; use the exact returned requestId." },
        title: { type: "string", description: "Short title shown above the questions." },
        attention: {
          type: "string",
          enum: ["normal", "urgent"],
          description: "Use urgent only for time-sensitive notification emphasis; it does not control where the question is displayed.",
        },
        questions: {
          type: "array",
          description: "Questions for a new request. Required unless resuming with requestId. Use stable IDs so answers are easy to map.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Stable answer key, for example 'deploy_target'." },
              header: { type: "string", description: "Short label for this question." },
              question: { type: "string", description: "The question text shown to the user." },
              multiSelect: { type: "boolean", description: "Whether multiple options may be selected." },
              allowFreeformInput: { type: "boolean", description: "Whether the user may type a custom answer." },
              options: {
                type: "array",
                description: "Optional answer choices.",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Choice label." },
                    description: { type: "string", description: "Optional choice description." },
                    recommended: { type: "boolean", description: "Whether this choice is recommended." },
                  },
                  required: ["label"],
                },
              },
            },
            required: ["id", "header", "question"],
          },
        },
      },
    },
    tier: "core",
    category: "gateway",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    async execute(input, context) {
      const waitForAnswer = async (requestId: string) => {
        const outcome = await userQuestions.waitForAnswer(requestId, context.sessionId, context.userId);
        if (outcome.status === "missing") return { ok: false, message: "Question request not found for this user and session." };
        if (outcome.status === "pending") return {
          ok: true,
          message: "Waiting for the user. Call user.ask again with only this requestId until answered or cancelled. The question has no expiry; do not proceed without the answer.",
          data: { status: "pending", requestId },
        };
        return outcome.result
          ? { ok: true, message: "User answered the question request.", data: outcome.result }
          : { ok: false, message: "The user cancelled the question request." };
      };
      if (input.requestId) {
        if (input.questions?.length) return { ok: false, message: "Resume with only requestId; do not supply new questions." };
        return waitForAnswer(input.requestId);
      }
      const questions = normalizeQuestions(input);
      if (questions.length === 0) {
        return { ok: false, message: "At least one question is required." };
      }
      if (questions.some((question) => !question.id || !question.header || !question.question)) {
        return { ok: false, message: "Each question requires id, header, and question." };
      }
      const duplicateIds = new Set<string>();
      const seenIds = new Set<string>();
      for (const question of questions) {
        if (seenIds.has(question.id)) duplicateIds.add(question.id);
        seenIds.add(question.id);
      }
      if (duplicateIds.size > 0) {
        return { ok: false, message: `Duplicate question id(s): ${[...duplicateIds].join(", ")}` };
      }

      const request = {
        sessionId: context.sessionId,
        userId: context.userId ?? null,
        requestedBy: ToolName.UserAsk,
        title: input.title,
        attention: input.attention,
        questions,
      };
      if (context.requestedBy === "mcp-client") {
        return waitForAnswer(userQuestions.startResumable(request));
      }
      const result = await userQuestions.ask(request);
      if (!result) {
        return { ok: false, message: "The user did not answer the question request." };
      }
      return {
        ok: true,
        message: "User answered the question request.",
        data: result,
      };
    },
  };
}
