import { describe, expect, it } from "vitest";
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

describe("user.ask tool", () => {
  it("is included in the core tool payload", () => {
    const service = new UserQuestionService();
    const tool = createUserAskTool(service);

    expect(tool.tier).toBe("core");
    expect(tool.description).toContain("over other apps");
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
});
