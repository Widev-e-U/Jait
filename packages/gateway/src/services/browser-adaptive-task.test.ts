import { describe, expect, it, vi } from "vitest";
import { BrowserWorkflowService } from "./browser-workflows.js";
import { callJaitLlmCompletion, resolveJaitLlmConfig } from "./jait-llm.js";
import { evaluateDecision } from "./system-one.js";

vi.mock("./system-one.js", () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
vi.mock("./jait-llm.js", () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
describe("adaptive browser task", () => {
  it("passes visual content presence to reasoning without capturing by default", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { interactiveElements: [], visualContent: { canvas: true, iframe: true } } } as never);
    vi.mocked(callJaitLlmCompletion).mockClear();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "stop" } } });
    await service.runTask({ task: "Inspect the page" }, context);
    expect(vi.mocked(callJaitLlmCompletion).mock.calls[0]?.[1][1]?.content).toContain('"visualContent":{"canvas":true,"iframe":true}');
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot"]);
  });
  it("reports the attempted action and underlying failure without recording it as completed", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#menu", name: "Menu" }] } } as never)
      .mockResolvedValueOnce({ ok: false, message: "The verified target could not be clicked.", data: {} } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } });
    expect(await service.runTask({ task: "Open menu" }, context)).toMatchObject({ ok: false, data: { status: "action_failed", history: [], attemptedAction: { action: "click", target: "Menu", selector: "#menu" }, result: { message: "The verified target could not be clicked." } } });
  });
  it("reobserves a rejected stale click and asks for a new decision", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#old", name: "Old" }] } } as never)
      .mockResolvedValueOnce({ ok: false, message: "Target changed", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } } as never)
      .mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#new", name: "New" }] } } as never)
      .mockResolvedValueOnce({ ok: true, message: "clicked", data: {} } as never);
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    const result = await service.runTask({ task: "Open menu", maxActions: 1 }, context);
    expect(result).toMatchObject({ ok: true, data: { history: [{ selector: "#new" }] } });
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot", "browser.click", "browser.snapshot", "browser.click", "browser.snapshot"]);
  });
  it("stops when a resumed typing target is rejected before dispatch", async () => {
    const { service, execute } = fixture();
    const field = { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "input", inputType: "text", selector: "#field", name: "Search" }] };
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: field } as never)
      .mockResolvedValueOnce({ ok: false, message: "Target changed", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } } as never);
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    const pending = await service.runTask({ task: "Search", maxActions: 1 }, context);
    const resumeToken = (pending.data as { resumeToken: string }).resumeToken;
    const result = await service.runTask({ resumeToken, text: "query" }, context);
    expect(result).toMatchObject({ ok: false, data: { status: "action_failed", history: [], result: { data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } } } });
    expect(await service.runTask({ resumeToken, text: "query" }, context)).toMatchObject({ ok: false, data: { status: "invalid_continuation" } });
    expect(execute.mock.calls.filter(call => call[0] === "browser.type")).toHaveLength(1);
  });
  it("bounds stale target retries without recording an action", async () => {
    const { service, execute } = fixture();
    execute.mockImplementation(async (name: string) => name === "browser.snapshot"
      ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#menu", name: "Menu" }] } }
      : { ok: false, message: "Target changed", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } });
    expect(await service.runTask({ task: "Open menu", maxActions: 1 }, context)).toMatchObject({ ok: false, data: { status: "action_failed", history: [] } });
    expect(execute.mock.calls.filter(call => call[0] === "browser.click")).toHaveLength(4);
  });
  it("discovers new controls after each click and reports model completion", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "c0", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "c0", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete", confidence: 1 } } });
    const result = await service.runTask({ task: "Open the menu and save" }, context);
    expect(result).toMatchObject({ ok: true, data: { status: "model_reports_complete", history: [{ selector: "#menu" }, { selector: "#save" }] } });
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot", "browser.click", "browser.snapshot", "browser.click", "browser.snapshot"]);
  });
  it("carries task state and observations forward to guide later decisions", async () => {
    const { service } = fixture();
    vi.mocked(callJaitLlmCompletion).mockClear().mockResolvedValueOnce("Menu opened; save remains").mockResolvedValueOnce("Save is visible");
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    await service.runTask({ task: "Open menu and save" }, context);
    const secondPrompt = vi.mocked(callJaitLlmCompletion).mock.calls[1]?.[1][1]?.content ?? "";
    expect(secondPrompt).toContain("Menu opened; save remains");
    expect(secondPrompt).toContain("Save");
    expect(vi.mocked(evaluateDecision).mock.calls[1]?.[1]).toContain("Save is visible");
  });
  it("resolves a missing target after choosing an action", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "none" } } })
      .mockResolvedValueOnce({ model: "test", answers: { target: { type: "choice", choice: "c0", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete", confidence: 1 } } });
    const result = await service.runTask({ task: "Open the menu" }, context);
    expect(result).toMatchObject({ ok: true, data: { history: [{ selector: "#menu" }] } });
    expect(execute.mock.calls[1]?.[0]).toBe("browser.click");
    expect(execute.mock.calls[1]?.[1]).toMatchObject({ selector: "#menu", expected: expect.any(String) });
  });
  it("stops when the follow-up target remains uncertain", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" } } })
      .mockResolvedValueOnce({ model: "test", answers: { target: { type: "choice", choice: "none" } } });
    expect(await service.runTask({ task: "Open the menu" }, context)).toMatchObject({ ok: false, data: { status: "needs_review" } });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("reuses fresh action feedback and checks suppression before inference", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#menu", name: "Menu" }] } })
      .mockResolvedValueOnce({ ok: true, message: "clicked", data: { interactiveElements: [], captureSuppressed: true } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "c0", confidence: 1 } } });
    expect(await service.runTask({ task: "Open the menu" }, context)).toMatchObject({ ok: false, message: "Browser feedback unavailable; task stopped." });
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot", "browser.click"]);
    expect(evaluateDecision).toHaveBeenCalledTimes(1);
  });
  it("uses controls beyond ten from the action result without taking a second snapshot", async () => {
    const { service, execute } = fixture();
    const elements = Array.from({ length: 30 }, (_, i) => ({ selector: `#c${i}`, tagName: "button", name: `Button ${i}` }));
    const page = { documentUrl: "https://example.test/", documentTimeOrigin: 123 };
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { ...page, interactiveElements: elements.slice(0, 1) } })
      .mockResolvedValueOnce({ ok: true, message: "clicked", data: { ...page, interactiveElements: elements } });
    const click = (choice: string) => ({ model: "test", answers: { next: { type: "choice" as const, choice: "click" }, clickTarget: { type: "choice" as const, choice } } });
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce(click("c0"))
      .mockResolvedValueOnce(click("c29"))
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });

    const result = await service.runTask({ task: "Open the menu and click Button 29" }, context);
    expect(result).toMatchObject({ ok: true, data: { history: [{ selector: "#c0" }, { selector: "#c29" }] } });
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot", "browser.click", "browser.click", "browser.snapshot"]);
  });

  it("offers controls beyond ten and binds clicks to their observed identity", async () => {
    const { service, execute } = fixture();
    const elements = Array.from({ length: 20 }, (_, i) => ({ selector: `#c${i}`, tagName: "button", name: `Button ${i}`, text: "" }));
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: elements } });
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "c15", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete", confidence: 1 } } });
    await service.runTask({ task: "Click Button 15" }, context);
    expect(execute.mock.calls[0]).toEqual(["browser.snapshot", { maxElements: 30 }, expect.anything()]);
    const args = execute.mock.calls[1]?.[1] as unknown as { selector: string; expected: string };
    expect(args.selector).toBe("#c15");
    expect(JSON.parse(args.expected)).toEqual({ documentUrl: "https://example.test/", documentTimeOrigin: 123, tagName: "button", name: "Button 15", text: "" });
  });
  it("refuses to click when page identity is unavailable", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { interactiveElements: [{ selector: "#go", tagName: "button", name: "Go" }] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } });
    expect(await service.runTask({ task: "Go" }, context)).toMatchObject({ ok: false, data: { status: "needs_review" } });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("batches targets and executes only the selected operation", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [
      { selector: "#q", tagName: "input", inputType: "search", name: "Search" },
      { selector: "#choice", tagName: "select", name: "Choice", options: [{ value: "b", label: "B", disabled: false }] },
    ] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" }, selectTarget: { type: "choice", choice: "c0" } } }).mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    const pending = await service.runTask({ task: "Search hello" }, context);
    expect(pending).toMatchObject({ ok: true, data: { status: "needs_text" } });
    await service.runTask({ resumeToken: (pending.data as { resumeToken: string }).resumeToken, text: "hello" }, context);
    expect(execute.mock.calls[1]?.[0]).toBe("browser.type");
    expect(execute.mock.calls.some(call => call[0] === "browser.select")).toBe(false);
    expect(vi.mocked(evaluateDecision).mock.calls[0]?.[2]).toHaveProperty("selectTarget");
  });
  it("binds selected option to the observed value and label", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ selector: "#choice", tagName: "select", name: "Choice", options: [{ value: "b", label: "B", disabled: false }] }] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "select" }, selectTarget: { type: "choice", choice: "c0" } } }).mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    await service.runTask({ task: "Choose B" }, context);
    const args = execute.mock.calls[1]?.[1] as unknown as { value: string; expected: string };
    expect(args.value).toBe("b");
    expect(JSON.parse(args.expected).option).toEqual({ value: "b", label: "B" });
  });
  it.each(["down", "up", "wait"])("executes bounded %s actions", async operation => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { scrollPosition: { x: 0, y: 500, height: 500 }, interactiveElements: [] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: operation } } }).mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    await service.runTask({ task: "Explore the page" }, context);
    expect(execute.mock.calls[1]?.[0]).toBe(operation === "wait" ? "browser.wait" : "browser.scroll");
  });
  it("does not type into password controls", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ selector: "#password", tagName: "input", inputType: "password", name: "Password" }] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    expect(await service.runTask({ task: "Enter password" }, context)).toMatchObject({ ok: false, data: { status: "needs_review" } });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("does not treat uncertainty as completion", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue({ model: "test", answers: { next: { type: "choice", choice: "stop" } } });
    expect(await service.runTask({ task: "Do something" }, context)).toMatchObject({ ok: false, data: { status: "needs_review", reason: "model_stopped", decision: { choice: "stop" } } });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("executes low-confidence action and target choices without confirmation", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 0.36 }, clickTarget: { type: "choice", choice: "c0", confidence: 0.2 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete", confidence: 0.1 } } });
    const result = await service.runTask({ task: "Open the menu", maxActions: 1 }, context);
    expect(result).toMatchObject({ ok: true, data: { status: "model_reports_complete", history: [{ selector: "#menu" }] } });
    expect(execute.mock.calls[1]?.[1]).toMatchObject({ selector: "#menu", expected: expect.any(String) });
    expect(evaluateDecision).toHaveBeenCalledTimes(2);
  });
  it("stops before inference when feedback is suppressed", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "suppressed", data: { interactiveElements: [] } });
    vi.mocked(evaluateDecision).mockReset();
    expect(await service.runTask({ task: "Do something" }, context)).toMatchObject({ ok: false });
    expect(evaluateDecision).not.toHaveBeenCalled();
  });
  it.each(["configuration", "request"])("continues safely when advisory reasoning fails during %s", async (failure) => {
    const { service, execute } = fixture();
    if (failure === "configuration") vi.mocked(resolveJaitLlmConfig).mockImplementationOnce(() => { throw new Error("secret"); });
    else vi.mocked(callJaitLlmCompletion).mockRejectedValueOnce(new Error("secret"));
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue({ model: "test", answers: { next: { type: "choice", choice: "stop" } } });
    const result = await service.runTask({ task: "Do something" }, context);
    expect(result).toMatchObject({ ok: false, data: { reason: "model_stopped" } });
    expect(evaluateDecision).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("hands off text to the calling model for the Jait provider", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector: "#answer", name: "Answer" }] } } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    vi.mocked(callJaitLlmCompletion).mockClear();
    const result = await service.runTask({ task: "Enter an answer" }, { ...context, providerId: "jait" });
    expect(result).toMatchObject({ ok: true, data: { status: "needs_text", resumeToken: expect.any(String), pendingAction: { action: "type", actionDispatched: false, field: "Answer" } } });
    // The single advisory call occurs before the decision; text generation makes no additional call.
    expect(callJaitLlmCompletion).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot"]);
  });
  it("hands off CLI provider text without sending the selected model to an HTTP backend", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector: "#answer", value: "sensitive existing value" }] } } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    vi.mocked(callJaitLlmCompletion).mockClear();
    vi.mocked(resolveJaitLlmConfig).mockClear();
    const result = await service.runTask({ task: "Enter an answer" }, { ...context, providerId: "codex", model: "selected-cli-model" });
    expect(result).toMatchObject({ ok: true, data: { status: "needs_text", resumeToken: expect.any(String), pendingAction: { action: "type", actionDispatched: false, field: "#answer", descriptor: { selector: "#answer", tagName: "textarea" } } } });
    expect(JSON.stringify(result)).not.toContain("sensitive existing value");
    expect(callJaitLlmCompletion).not.toHaveBeenCalled();
    expect(resolveJaitLlmConfig).not.toHaveBeenCalled();
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot"]);
  });
  it("reports cancellation instead of handing off text", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector: "#answer" }] } } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    const controller = new AbortController();
    vi.mocked(evaluateDecision).mockReset().mockImplementationOnce(async () => { controller.abort(); return { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } }; });
    const result = await service.runTask({ task: "Enter an answer" }, { ...context, signal: controller.signal });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("cancelled or timed out") });
    expect((result.data as { status?: string }).status).not.toBe("needs_text");
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot"]);
  });
  it("reports the failed stage and safe decision error code without leaking messages", async () => {
    const { service } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockRejectedValue(Object.assign(new Error("secret"), { code: "timeout" }));
    const result = await service.runTask({ task: "Do something" }, context);
    expect(result).toMatchObject({ ok: false, data: { error: { stage: "System One decision", code: "timeout" } } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
