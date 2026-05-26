import type { SessionSearchService } from "../services/session-search.js";
import type { ToolContext, ToolDefinition } from "./contracts.js";
import { ToolName } from "./tool-names.js";

export interface SessionSearchToolInput {
  query: string;
  limit?: number;
  sessionId?: string;
  threadId?: string;
  includeMessages?: boolean;
  includeThreadActivities?: boolean;
}

export function createSessionSearchTool(searchService: SessionSearchService): ToolDefinition<SessionSearchToolInput> {
  return {
    name: ToolName.SessionSearch,
    description:
      "Search prior chat messages and agent thread activity before asking the user to repeat context.",
    tier: "standard",
    category: "memory",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search terms to find in prior chat messages and thread activity.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 10, capped at 50.",
        },
        sessionId: {
          type: "string",
          description: "Optional chat session ID to restrict message and thread results.",
        },
        threadId: {
          type: "string",
          description: "Optional agent thread ID to restrict thread activity results.",
        },
        includeMessages: {
          type: "boolean",
          description: "Whether to search chat messages. Defaults to true.",
        },
        includeThreadActivities: {
          type: "boolean",
          description: "Whether to search agent thread activity. Defaults to true.",
        },
      },
      required: ["query"],
    },
    async execute(input, context: ToolContext) {
      const results = searchService.search({
        query: input.query,
        limit: input.limit,
        userId: context.userId,
        sessionId: input.sessionId,
        threadId: input.threadId,
        includeMessages: input.includeMessages,
        includeThreadActivities: input.includeThreadActivities,
      });
      return {
        ok: true,
        message: `Found ${results.length} prior conversation result(s)`,
        data: { results },
      };
    },
  };
}
