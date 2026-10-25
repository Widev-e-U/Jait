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

  it("rejects resolution by the wrong user and keeps unanswered requests pending", async () => {
    vi.useFakeTimers();
    const service = new UserQuestionService();

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

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(vi.getTimerCount()).toBe(0);
    expect(service.listPending("session-1", "user-1")).toHaveLength(1);
    expect(request!.expiresAt).toBeNull();
    expect(service.cancel(request!.id, "user-1")).toBe(true);
    await expect(resultPromise).resolves.toBeNull();
    expect(service.listPending("session-1", "user-1")).toHaveLength(0);
  });
  it("accepts an answer after the former five-minute deadline", async () => {
    vi.useFakeTimers();
    const service = new UserQuestionService();
    const promise = service.ask({ sessionId: "session-1", userId: "user-1",
      questions: [{ id: "choice", header: "Choice", question: "Which one?" }] });
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    const [request] = service.listPending("session-1", "user-1");
    expect(request).toBeDefined();
    const answers = { choice: { selected: ["yes"], freeText: null, skipped: false } };
    expect(service.submit(request!.id, { answers }, "user-1")).toBe(true);
    await expect(promise).resolves.toEqual({ answers });
    expect(service.listPending()).toEqual([]);
  });

});


describe("detached question continuation", () => {
  it.each(["user.ask", "browser.handoff"])("wakes an idle %s once and retains its result", async (tool) => {
    vi.useFakeTimers();
    const service = new UserQuestionService();
    const wake = vi.fn();
    service.onDetachedResolved = wake;
    const id = service.startResumable({ sessionId: "chat", userId: "owner", requestedBy: tool,
      questions: [{ id: "browser", header: "Browser", question: "Finish in the browser" }] });
    const wait = service.waitForAnswer(id, "chat", "owner");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await wait).toEqual({ status: "pending" });
    expect(wake).not.toHaveBeenCalled();
    expect(service.submit(id, { answers: {} }, "other")).toBe(false);
    expect(wake).not.toHaveBeenCalled();
    const result = { answers: { browser: { selected: ["Done"], freeText: null, skipped: false } } };
    expect(service.submit(id, result, "owner")).toBe(true);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake.mock.calls[0]![0]).toMatchObject({ id, sessionId: "chat", requestedBy: tool, status: "submitted" });
    expect(service.submit(id, result, "owner")).toBe(false);
    expect(await service.waitForAnswer(id, "other-chat", "owner")).toEqual({ status: "missing" });
    expect(await service.waitForAnswer(id, "chat", "owner")).toEqual({ status: "answered", result });
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it("resumes an attached wait directly without starting another turn", async () => {
    vi.useFakeTimers();
    const service = new UserQuestionService();
    const wake = vi.fn();
    service.onDetachedResolved = wake;
    const id = service.startResumable({ sessionId: "chat", questions: [] });
    const first = service.waitForAnswer(id, "chat");
    await vi.advanceTimersByTimeAsync(60_000);
    await first;
    const attached = service.waitForAnswer(id, "chat");
    service.cancel(id);
    expect(await attached).toEqual({ status: "answered", result: null });
    expect(wake).not.toHaveBeenCalled();
  });
});
