import type { UserQuestion, UserQuestionService } from "../services/user-questions.js";
import type { ToolDefinition } from "./contracts.js";
import { ToolName } from "./tool-names.js";

interface UserAskInput {
  title?: string;
  timeoutMs?: number;
  questions: Array<{
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
  return input.questions.map((question) => ({
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
    description: "Ask the user one or more structured questions and wait for their answers.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title shown above the questions." },
        timeoutMs: { type: "number", description: "Optional timeout in milliseconds." },
        questions: {
          type: "array",
          description: "Questions to ask. Use stable IDs so answers are easy to map.",
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
      required: ["questions"],
    },
    tier: "standard",
    category: "gateway",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    async execute(input, context) {
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

      const result = await userQuestions.ask({
        sessionId: context.sessionId,
        userId: context.userId ?? null,
        requestedBy: ToolName.UserAsk,
        title: input.title,
        questions,
        timeoutMs: input.timeoutMs,
      });
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
