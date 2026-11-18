import { afterEach, describe, expect, it, vi } from "vitest";
import { UserQuestionService } from "../services/user-questions.js";
import { createUserAskTool } from "./user-question-tools.js";
import type { ToolContext } from "./contracts.js";

function context(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
  };
}

afterEach(() => vi.useRealTimers());

describe("user.ask tool", () => {
  it("is included in the core tool payload", () => {
    const service = new UserQuestionService();
    const tool = createUserAskTool(service);

    expect(tool.tier).toBe("core");
    expect(tool.parameters.properties).not.toHaveProperty("timeoutMs");
    expect(tool.description).toContain("every connected Jait client");
  });

  it("asks structured questions and returns answers keyed by question id", async () => {
    let service: UserQuestionService;
    let observedTitle = "";
    let observedAttention = "";
    service = new UserQuestionService({
      onRequest: (request) => {
        observedTitle = request.title;
        observedAttention = request.attention;
        queueMicrotask(() => {
          service.submit(request.id, {
            answers: {
              deploy_target: { selected: ["staging"], freeText: "green pool", skipped: false },
            },
          }, "user-1");
        });
      },
    });
    const tool = createUserAskTool(service);

    const result = await tool.execute({
      title: "Deployment choice",
      attention: "urgent",
      questions: [{
        id: "deploy_target",
        header: "Target",
        question: "Where should this deploy?",
        options: [{ label: "staging", recommended: true }, { label: "production" }],
      }],
    }, context());

    expect(result.ok).toBe(true);
    expect(observedTitle).toBe("Deployment choice");
    expect(observedAttention).toBe("urgent");
    expect(result.data).toEqual({
      answers: {
        deploy_target: { selected: ["staging"], freeText: "green pool", skipped: false },
      },
    });
  });

  it("rejects duplicate question ids before creating a request", async () => {
    const service = new UserQuestionService({
      onRequest: () => {
        throw new Error("request should not be created");
      },
    });
    const tool = createUserAskTool(service);

    const result = await tool.execute({
      questions: [
        { id: "choice", header: "First", question: "First question?" },
        { id: "choice", header: "Second", question: "Second question?" },
      ],
    }, context());

    expect(result).toMatchObject({
      ok: false,
      message: "Duplicate question id(s): choice",
    });
  });
  it("resumes MCP waits past five minutes without duplicating or losing answers", async () => {
    vi.useFakeTimers();
    const service = new UserQuestionService();
    const tool = createUserAskTool(service);
    const mcpContext = { ...context(), requestedBy: "mcp-client" };
    const first = tool.execute({ questions: [{ id: "choice", header: "Choice", question: "Which one?" }] }, mcpContext);
    const [request] = service.listPending();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await first).toMatchObject({ ok: true, data: { status: "pending", requestId: request!.id } });
    for (let i = 0; i < 6; i++) {
      const waiting = tool.execute({ requestId: request!.id }, mcpContext);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await waiting).toMatchObject({ ok: true, data: { status: "pending", requestId: request!.id } });
      expect(service.listPending()).toHaveLength(1);
    }
    // The answer arrives between MCP calls, well after the client's old deadline.
    const answers = { choice: { selected: ["yes"], freeText: null, skipped: false } };
    expect(service.submit(request!.id, { answers }, "user-1")).toBe(true);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    await expect(tool.execute({ requestId: request!.id }, mcpContext)).resolves.toMatchObject({ ok: true, data: { answers } });
    expect(service.listPending()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    await expect(tool.execute({ requestId: request!.id }, mcpContext)).resolves.toMatchObject({ ok: false });
  });

  it("scopes resumed answers to both owner and session and supports cancellation", async () => {
    vi.useFakeTimers();
    const service = new UserQuestionService();
    const tool = createUserAskTool(service);
    const mcpContext = { ...context(), requestedBy: "mcp-client" };
    const first = tool.execute({ questions: [{ id: "choice", header: "Choice", question: "Which one?" }] }, mcpContext);
    const [request] = service.listPending();
    await vi.advanceTimersByTimeAsync(60_000);
    await first;
    await expect(tool.execute({ requestId: request!.id }, { ...mcpContext, userId: "other" })).resolves.toMatchObject({ ok: false });
    await expect(tool.execute({ requestId: request!.id }, { ...mcpContext, sessionId: "other" })).resolves.toMatchObject({ ok: false });
    const waiting = tool.execute({ requestId: request!.id }, mcpContext);
    expect(service.cancel(request!.id, "user-1")).toBe(true);
    await expect(waiting).resolves.toMatchObject({ ok: false, message: "The user cancelled the question request." });
    expect(vi.getTimerCount()).toBe(0);
  });

});
