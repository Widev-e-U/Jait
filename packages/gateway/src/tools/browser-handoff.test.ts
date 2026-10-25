import { afterEach, describe, expect, it, vi } from "vitest";
import { UserQuestionService } from "../services/user-questions.js";
import { createBrowserHandoffTool } from "./browser-handoff.js";
import type { ToolContext } from "./contracts.js";
import type { PreviewService } from "../services/preview.js";

const context: ToolContext = {
  sessionId: "chat", userId: "owner", projectRoot: "/project",
  actionId: "handoff", requestedBy: "agent",
};
function fixture() {
  const browser = { status: "ready", browserId: "browser-chat", url: "/noVNC/vnc_lite.html", sharedWithAgent: true, createdAt: "initial" };
  const preview = {
    get: vi.fn((sessionId: string) => sessionId === "chat" ? browser : null),
    setSharedWithAgent: vi.fn((_id: string, shared: boolean) => { browser.sharedWithAgent = shared; return browser; }),
    getSessionByPreviewSessionId: vi.fn(() => ({ sessionId: "chat", browserId: browser.browserId, controller: browser.sharedWithAgent ? "agent" : "user" })),
  };
  const questions = new UserQuestionService();
  const tool = createBrowserHandoffTool(preview as unknown as PreviewService, questions);
  const submit = (choice: string) => {
    const [request] = questions.listPending("chat", "owner");
    expect(questions.submit(request.id, { answers: { browser: { selected: [choice], freeText: null, skipped: false } } }, "owner")).toBe(true);
  };
  return { browser, preview, questions, tool, submit };
}
afterEach(() => vi.useRealTimers());

describe("browser.handoff", () => {
  it("transfers control before asking and waits until Done explicitly returns it", async () => {
    const { tool, browser, questions, submit } = fixture();
    const execution = tool.execute({ message: "Please enter your password in the browser." }, context);
    expect(browser.sharedWithAgent).toBe(false);
    const [request] = questions.listPending();
    expect(request).toMatchObject({ sessionId: "chat", userId: "owner", requestedBy: "browser.handoff", expiresAt: null });
    expect(request.questions[0]).toMatchObject({ allowFreeformInput: true, options: [{ label: "Done" }, { label: "I'm not able to do it" }] });
    let completed = false;
    void execution.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(questions.submit(request.id, { answers: {} }, "intruder")).toBe(false);
    submit("Done");
    expect(await execution).toMatchObject({ ok: true, data: { status: "done", browserId: "browser-chat" } });
    expect(browser.sharedWithAgent).toBe(true);
  });

  it("reports inability without granting agent control or echoing private text", async () => {
    const { tool, browser, submit } = fixture();
    const execution = tool.execute({ message: "Sign in directly in the browser." }, context);
    submit("I'm not able to do it");
    expect(await execution).toMatchObject({ ok: true, data: { status: "unable" } });
    expect(browser.sharedWithAgent).toBe(false);
  });

  it("cancels a stopped agent's question and leaves user control", async () => {
    const { tool, browser, questions } = fixture();
    const controller = new AbortController();
    const execution = tool.execute({ message: "Complete the browser step." }, { ...context, signal: controller.signal });
    controller.abort();
    expect(await execution).toMatchObject({ ok: false, data: { status: "cancelled" } });
    expect(questions.listPending()).toHaveLength(0);
    expect(browser.sharedWithAgent).toBe(false);
  });

  it("does not return control to a restarted browser with the same ID", async () => {
    const { tool, browser, submit, preview } = fixture();
    const execution = tool.execute({ message: "Sign in." }, context);
    browser.createdAt = "restarted";
    submit("Done");
    expect(await execution).toMatchObject({ ok: false, data: { status: "browser_changed" } });
    expect(preview.setSharedWithAgent).toHaveBeenCalledTimes(1);
  });

  it("rejects missing browsers and invalid instructions before creating a request", async () => {
    const { tool, questions, preview } = fixture();
    expect((await tool.execute({ message: " " }, context)).ok).toBe(false);
    expect((await tool.execute({ message: "Sign in." }, { ...context, sessionId: "other" })).ok).toBe(false);
    expect(questions.listPending()).toHaveLength(0);
    expect(preview.setSharedWithAgent).not.toHaveBeenCalled();
  });

  it("keeps one MCP tool call attached across a long wait, without a detached continuation", async () => {
    vi.useFakeTimers();
    const { tool, questions, browser, submit } = fixture();
    const onOutputChunk = vi.fn();
    const detached = vi.fn();
    questions.onDetachedResolved = detached;
    const mcp = { ...context, requestedBy: "mcp-client", onOutputChunk };
    const first = tool.execute({ message: "Log in." }, mcp);
    const [request] = questions.listPending();
    let completed = false;
    void first.then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(completed).toBe(false);
    expect(onOutputChunk).toHaveBeenCalled();
    expect((await tool.execute({ requestId: request.id }, { ...mcp, sessionId: "other" })).ok).toBe(false);
    expect((await tool.execute({ requestId: request.id }, { ...mcp, userId: "intruder" })).ok).toBe(false);
    expect(questions.listPending()).toHaveLength(1);
    expect(browser.sharedWithAgent).toBe(false);
    submit("Done");
    expect(await first).toMatchObject({ data: { status: "done" } });
    expect(detached).not.toHaveBeenCalled();
    expect(browser.sharedWithAgent).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns an explicit reason while leaving the browser under user control", async () => {
    const { tool, questions, browser } = fixture();
    const execution = tool.execute({ message: "Complete the step." }, context);
    const [request] = questions.listPending();
    questions.submit(request.id, { answers: { browser: { selected: ["Another reason"], freeText: "The login page never loads", skipped: false } } }, "owner");
    expect(await execution).toMatchObject({ data: { status: "unable", reason: "The login page never loads" } });
    expect(browser.sharedWithAgent).toBe(false);
  });
});
