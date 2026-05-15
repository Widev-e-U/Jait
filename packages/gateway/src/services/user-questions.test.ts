import { afterEach, describe, expect, it, vi } from "vitest";
import { UserQuestionService } from "./user-questions.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("UserQuestionService", () => {
  it("lists pending requests and resolves submitted answers", async () => {
    const service = new UserQuestionService();
    const resolvedStatuses: string[] = [];
    const observedRequests: string[] = [];
    const trackedService = new UserQuestionService({
      onRequest: (request) => observedRequests.push(request.title),
      onResolved: (request) => resolvedStatuses.push(request.status),
    });

    const resultPromise = trackedService.ask({
      sessionId: "session-1",
      userId: "user-1",
      requestedBy: "user.ask",
      title: "Deployment target",
      questions: [{
        id: "target",
        header: "Target",
        question: "Where should this deploy?",
        options: [{ label: "staging" }, { label: "production" }],
      }],
    });

    const [request] = trackedService.listPending("session-1", "user-1");
    expect(request).toMatchObject({
      sessionId: "session-1",
      userId: "user-1",
      title: "Deployment target",
      status: "pending",
    });
    expect(observedRequests).toEqual(["Deployment target"]);

    expect(trackedService.submit(request!.id, {
      answers: {
        target: { selected: ["staging"], freeText: null, skipped: false },
      },
    }, "user-1")).toBe(true);

    await expect(resultPromise).resolves.toEqual({
      answers: {
        target: { selected: ["staging"], freeText: null, skipped: false },
      },
    });
    expect(trackedService.listPending("session-1", "user-1")).toHaveLength(0);
    expect(resolvedStatuses).toEqual(["submitted"]);
    expect(service.listPending()).toHaveLength(0);
  });

  it("rejects resolution by the wrong user and times out unanswered requests", async () => {
    vi.useFakeTimers();
    const service = new UserQuestionService({ defaultTimeoutMs: 25 });

    const resultPromise = service.ask({
      sessionId: "session-1",
      userId: "user-1",
      title: "Runtime choice",
      questions: [{ id: "runtime", header: "Runtime", question: "Which runtime?" }],
    });
    const [request] = service.listPending("session-1", "user-1");

    expect(service.cancel(request!.id, "user-2")).toBe(false);
    expect(service.submit(request!.id, { answers: {} })).toBe(false);
    expect(service.listPending("session-1", "user-1")).toHaveLength(1);

    vi.advanceTimersByTime(25);

    await expect(resultPromise).resolves.toBeNull();
    expect(service.listPending("session-1", "user-1")).toHaveLength(0);
  });
});
