/**
 * chat.traces — retrieve the full execution trace of a chat by its id.
 *
 * Returns persisted messages (with executed tool calls), outbound LLM context
 * flow, chain-of-thought, and any agent threads + activity logs tied to the
 * session. Designed for an agent to inspect how a past chat ran — e.g. to
 * evaluate provider behaviour, diagnose loops, or audit tool usage.
 */

import type { ToolContext, ToolDefinition } from "./contracts.js";
import { ToolName } from "./tool-names.js";
import type { ChatTracesService } from "../services/chat-traces.js";

export interface ChatTracesToolInput {
  /** Chat (session) id to fetch traces for. */
  chatId: string;
  /** Include chat messages. Defaults to true. */
  includeMessages?: boolean;
  /** Include agent threads + their activities. Defaults to true. */
  includeThreads?: boolean;
  /** Include parsed tool-call payloads on assistant messages. Defaults to true. */
  includeToolCalls?: boolean;
  /** Include the full outbound LLM context-flow rounds. Verbose — defaults to false. */
  includeContextFlow?: boolean;
  /** Include chain-of-thought / reasoning content. Defaults to false. */
  includeThinking?: boolean;
  /** Max messages to return (most recent). Defaults to 200, capped at 1000. */
  messageLimit?: number;
  /** Max thread activities per thread. Defaults to 200, capped at 2000. */
  activityLimit?: number;
}

export function createChatTracesTool(tracesService: ChatTracesService): ToolDefinition<ChatTracesToolInput> {
  return {
    name: ToolName.ChatTraces,
    description:
      "Retrieve the full execution trace of a chat by its session/chat id: persisted messages (with executed tool calls, context flow, and reasoning), plus any agent threads and their activity logs. Use this to inspect how a past chat actually ran — evaluate provider behaviour, diagnose loops, or audit tool usage.",
    tier: "standard",
    category: "memory",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        chatId: {
          type: "string",
          description: "Chat (session) id to fetch traces for.",
        },
        includeMessages: {
          type: "boolean",
          description: "Include chat messages. Defaults to true.",
        },
        includeThreads: {
          type: "boolean",
          description: "Include agent threads + their activities. Defaults to true.",
        },
        includeToolCalls: {
          type: "boolean",
          description: "Include parsed tool-call payloads on assistant messages. Defaults to true.",
        },
        includeContextFlow: {
          type: "boolean",
          description: "Include the full outbound LLM context-flow rounds. Verbose — defaults to false.",
        },
        includeThinking: {
          type: "boolean",
          description: "Include chain-of-thought / reasoning content. Defaults to false.",
        },
        messageLimit: {
          type: "number",
          description: "Max messages to return (most recent). Defaults to 200, capped at 1000.",
        },
        activityLimit: {
          type: "number",
          description: "Max thread activities per thread. Defaults to 200, capped at 2000.",
        },
      },
      required: ["chatId"],
    },
    async execute(input, context: ToolContext) {
      const result = tracesService.traces({
        chatId: input.chatId,
        userId: context.userId,
        includeMessages: input.includeMessages,
        includeThreads: input.includeThreads,
        includeToolCalls: input.includeToolCalls,
        includeContextFlow: input.includeContextFlow,
        includeThinking: input.includeThinking,
        messageLimit: input.messageLimit,
        activityLimit: input.activityLimit,
      });

      if (!result.found) {
        return {
          ok: false,
          message: `No chat found for id '${input.chatId}'${context.userId ? " accessible to this user" : ""}.`,
          data: { chatId: input.chatId, found: false },
        };
      }

      return {
        ok: true,
        message: `Chat ${input.chatId}: ${result.counts.messages} message(s), ${result.counts.threads} thread(s), ${result.counts.threadActivities} thread activit(ies).`,
        data: result,
      };
    },
  };
}