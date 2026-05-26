import { describe, expect, it } from "vitest";
import type { SessionSearchOptions, SessionSearchResult, SessionSearchService } from "../services/session-search.js";
import type { ToolContext } from "./contracts.js";
import { createSessionSearchTool } from "./session-search-tools.js";

const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "test",
  userId: "user-1",
};

describe("session.search tool", () => {
  it("passes caller scope to the session search service", async () => {
    const result: SessionSearchResult = {
      source: "message",
      id: "msg-1",
      sessionId: "session-1",
      role: "user",
      content: "Prior context",
      snippet: "[Prior] context",
      createdAt: "2026-05-25T00:00:00.000Z",
      score: 1,
    };
    let received: SessionSearchOptions | undefined;
    const service = {
      search: (options: SessionSearchOptions) => {
        received = options;
        return [result];
      },
    } as unknown as SessionSearchService;
    const tool = createSessionSearchTool(service);

    const response = await tool.execute({
      query: "prior context",
      limit: 25,
      sessionId: "session-1",
      includeMessages: true,
      includeThreadActivities: false,
    }, context);

    expect(response.ok).toBe(true);
    expect(response.message).toBe("Found 1 prior conversation result(s)");
    expect(response.data).toEqual({ results: [result] });
    expect(received).toEqual({
      query: "prior context",
      limit: 25,
      userId: "user-1",
      sessionId: "session-1",
      threadId: undefined,
      includeMessages: true,
      includeThreadActivities: false,
    });
  });
});
