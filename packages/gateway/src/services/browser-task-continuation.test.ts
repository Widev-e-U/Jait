import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserWorkflowService } from "./browser-workflows.js";
import { evaluateDecision } from "./system-one.js";
import { createBrowserWorkflowTools } from "../tools/browser-workflow-tools.js";
import { ContextEvidence } from "../tools/context-evidence.js";

vi.mock("./system-one.js", () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
afterEach(() => vi.restoreAllMocks());

describe("browser task text continuation", () => {
  it("fills several explicitly mapped fields in one call without passing values to decisions or nested events", async () => {
    const { service, execute } = fixture();
    const events: unknown[] = [];
    execute.mockResolvedValueOnce(field("#name")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} })
      .mockResolvedValueOnce(field("#city")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(field("#city"));
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(completeDecision);
    const result = await service.runTask({ task: "Fill the form", fieldValues: [
      { selector: "#name", name: "#name", text: "Ada", documentUrl: "https://example.test/", documentTimeOrigin: 123 }, { selector: "#city", name: "#city", text: "Paris", documentUrl: "https://example.test/", documentTimeOrigin: 123 },
    ] }, { ...context, onNestedEvent: (event: unknown) => events.push(event) });
    expect(result).toMatchObject({ ok: true, data: { status: "model_reports_complete", history: [{ label: "type: #name" }, { label: "type: #city" }] } });
    expect(execute.mock.calls.filter(([name]) => name === "browser.type").map(([, args]) => args)).toEqual([
      expect.objectContaining({ selector: "#name", text: "Ada", expected: expect.any(String) }),
      expect.objectContaining({ selector: "#city", text: "Paris", expected: expect.any(String) }),
    ]);
    expect(JSON.stringify([events, vi.mocked(evaluateDecision).mock.calls, result])).not.toMatch(/Ada|Paris/);
  });

  it("hands off when supplied mappings or observed targets are ambiguous or do not match", async () => {
    for (const mode of ["duplicate mapping", "duplicate observed", "wrong name", "wrong document", "missing"]) {
      const { service, execute } = fixture();
      if (mode === "duplicate observed") execute.mockResolvedValueOnce({ ...field("#name"), data: { ...field("#name").data, interactiveElements: [field("#name").data.interactiveElements[0], field("#name").data.interactiveElements[0]] } });
      vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
      const mapping = { selector: "#name", name: mode === "wrong name" ? "Other" : "#name", text: "Ada", documentUrl: "https://example.test/", documentTimeOrigin: mode === "wrong document" ? 124 : 123 };
      const result = await service.runTask({ task: "Fill the form", fieldValues: mode === "missing" ? [] : mode === "duplicate mapping" ? [mapping, mapping] : [mapping] }, context);
      expect(result).toMatchObject({ ok: true, data: { status: "needs_text", pendingAction: { actionDispatched: false } } });
      expect(execute.mock.calls.filter(([name]) => name === "browser.type")).toHaveLength(0);
    }
  });

  it("accepts an unnamed textarea when its observed document and selector match", async () => {
    const { service, execute } = fixture();
    const unnamed = field("#permanentAddress");
    unnamed.data.interactiveElements[0].name = "";
    execute.mockResolvedValueOnce(unnamed).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(unnamed);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(completeDecision);
    const result = await service.runTask({ task: "Fill the address", fieldValues: [{ selector: "#permanentAddress", name: "", text: "Example address", documentUrl: "https://example.test/", documentTimeOrigin: 123 }] }, context);
    expect(result).toMatchObject({ ok: true, data: { status: "model_reports_complete" } });
    expect(execute.mock.calls.filter(([name]) => name === "browser.type")).toHaveLength(1);
  });

  it("stops if a mapped field becomes stale before typing", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce(field("#name")).mockResolvedValueOnce({ ok: false, message: "stale", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const result = await service.runTask({ task: "Fill the form", fieldValues: [{ selector: "#name", name: "#name", text: "Ada", documentUrl: "https://example.test/", documentTimeOrigin: 123 }] }, context);
    expect(result).toMatchObject({ ok: false, data: { status: "action_failed", result: { data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } } } });
    expect(execute.mock.calls.filter(([name]) => name === "browser.type")).toHaveLength(1);
  });

  it("hands off twice and resumes the same task with verified identities and history", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce(field("#name")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} })
      .mockResolvedValueOnce(field("#city")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(field("#city"));
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(completeDecision);
    const first = await service.runTask({ task: "Enter Ada and Paris", maxActions: 2 }, context);
    expect(first).toMatchObject({ ok: true, data: { status: "needs_text", pendingAction: { field: "#name", actionDispatched: false } } });
    const second = await service.runTask({ resumeToken: token(first), text: "Ada" }, context);
    expect(second).toMatchObject({ ok: true, data: { status: "needs_text", completedActions: 1, pendingAction: { field: "#city" } } });
    const final = await service.runTask({ resumeToken: token(second), text: "Paris" }, context);
    expect(final).toMatchObject({ ok: true, data: { status: "model_reports_complete", history: [{ label: "type: #name" }, { label: "type: #city" }] } });
    const actions = execute.mock.calls.filter(([name]) => name === "browser.type");
    expect(actions.map(([, args]) => args)).toEqual([
      expect.objectContaining({ selector: "#name", text: "Ada", expected: expect.any(String) }),
      expect.objectContaining({ selector: "#city", text: "Paris", expected: expect.any(String) }),
    ]);
  });
  it("offers the next unfilled field after a successful continuation", async () => {
    const { service, execute } = fixture();
    const form = { ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [
      { tagName: "input", inputType: "text", selector: "#name", name: "Full Name" },
      { tagName: "input", inputType: "email", selector: "#email", name: "Email" },
    ] } };
    execute.mockResolvedValueOnce(form).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(form);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const first = await service.runTask({ task: "Fill the form" }, context);
    const second = await service.runTask({ resumeToken: token(first), text: "Alex Example" }, context);
    expect(second).toMatchObject({ ok: true, data: { status: "needs_text", completedActions: 1, pendingAction: { field: "Email", descriptor: { selector: "#email" } } } });
    const criteria = vi.mocked(evaluateDecision).mock.calls[1]?.[2] as { typeTarget: { criteria: Record<string, string> } };
    expect(JSON.stringify(criteria.typeTarget.criteria)).not.toContain("Full Name");
  });

  it("allows the same selector in a new document and can complete with no remaining field", async () => {
    const { service, execute } = fixture();
    const nextDocument = { ...field("#name"), data: { ...field("#name").data, documentTimeOrigin: 456 } };
    execute.mockResolvedValueOnce(field("#name")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} })
      .mockResolvedValueOnce(nextDocument).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(nextDocument);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(completeDecision);
    const first = await service.runTask({ task: "Fill both pages" }, context);
    const second = await service.runTask({ resumeToken: token(first), text: "Alex" }, context);
    expect(second).toMatchObject({ ok: true, data: { status: "needs_text" } });
    const final = await service.runTask({ resumeToken: token(second), text: "Alex" }, context);
    expect(final).toMatchObject({ ok: true, data: { status: "model_reports_complete" } });
    const criteria = vi.mocked(evaluateDecision).mock.calls[2]?.[2] as { next: { criteria: Record<string, string> } };
    expect(criteria.next.criteria).not.toHaveProperty("type");
  });

  it("rejects another scope, concurrent use and replay without dispatching twice", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValue(completeDecision);
    const first = await service.runTask({ task: "Enter Ada" }, context);
    for (const changed of [{ sessionId: "other" }, { userId: "other" }, { projectRoot: "/else" }, { executionNodeId: "else" }]) {
      expect(await service.runTask({ resumeToken: token(first), text: "Ada" }, { ...context, ...changed })).toMatchObject({ ok: false, data: { status: "invalid_continuation" } });
    }
    const [a, b] = await Promise.all([service.runTask({ resumeToken: token(first), text: "Ada" }, context), service.runTask({ resumeToken: token(first), text: "Ada" }, context)]);
    expect([a, b].filter(r => r.ok)).toHaveLength(1);
    expect([a, b].filter(r => !r.ok)).toHaveLength(1);
    expect(await service.runTask({ resumeToken: token(first), text: "Ada" }, context)).toMatchObject({ ok: false, data: { status: "invalid_continuation" } });
    expect(execute.mock.calls.filter(([name]) => name === "browser.type")).toHaveLength(1);
  });
  it("expires at the original deadline and rejects a stale target without retrying", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const expired = await service.runTask({ task: "Enter Ada" }, context);
    clock.mockReturnValue(121000);
    expect(await service.runTask({ resumeToken: token(expired), text: "Ada" }, context)).toMatchObject({ ok: false, data: { status: "invalid_continuation" } });
    expect(execute.mock.calls.filter(([name]) => name === "browser.type")).toHaveLength(0);
    clock.mockReturnValue(122000);
    const stale = await service.runTask({ task: "Enter Ada" }, context);
    execute.mockResolvedValueOnce({ ok: false, message: "stale", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } } as never);
    expect(await service.runTask({ resumeToken: token(stale), text: "Ada" }, context)).toMatchObject({ ok: false, data: { status: "action_failed", history: [], result: { data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } } } });
    expect(await service.runTask({ resumeToken: token(stale), text: "Ada" }, context)).toMatchObject({ ok: false, data: { status: "invalid_continuation" } });
    expect(execute.mock.calls.filter(([name]) => name === "browser.type")).toHaveLength(1);
  });
  it("preserves the action budget and respects cancellation before dispatch", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const first = await service.runTask({ task: "Enter Ada", maxActions: 1 }, context);
    const result = await service.runTask({ resumeToken: token(first), text: "Ada" }, context);
    expect(result).toMatchObject({ ok: false, data: { status: "limit", history: [{ label: "type: #name" }] } });
    expect(execute.mock.calls.filter(([name]) => name === "browser.type")).toHaveLength(1);
    const second = await service.runTask({ task: "Enter Ada" }, context);
    const controller = new AbortController(); controller.abort();
    expect(await service.runTask({ resumeToken: token(second), text: "Ada" }, { ...context, signal: controller.signal })).toMatchObject({ ok: false, message: expect.stringContaining("cancelled or timed out") });
    expect(execute.mock.calls.filter(([name]) => name === "browser.type")).toHaveLength(1);
  });
  it("invalidates a pending continuation when its originating turn is cancelled", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const controller = new AbortController();
    const pending = await service.runTask({ task: "Enter Ada" }, { ...context, signal: controller.signal });
    controller.abort();
    expect(await service.runTask({ resumeToken: token(pending), text: "Ada" }, context)).toMatchObject({ ok: false, data: { status: "invalid_continuation" } });
    expect(execute.mock.calls.filter(([name]) => name === "browser.type")).toHaveLength(0);
  });
  it("advertises the resume protocol in the browser task tool schema", () => {
    const { service } = fixture();
    const task = createBrowserWorkflowTools(service).find(tool => tool.name === "browser.task")!;
    expect(task.description).toContain("immediately call browser.task again");
    expect(task.parameters.properties).toMatchObject({ resumeToken: { type: "string" }, text: { type: "string" } });
    expect(task.parameters.required ?? []).not.toContain("task");
  });

  it("keeps the resume token visible in projected MCP evidence for oversized page feedback", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ...field("#name"), data: { ...field("#name").data, textPreview: "page".repeat(50000) } } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision);
    const pending = await service.runTask({ task: "Enter Ada" }, context);
    const projection = new ContextEvidence().project(pending, context, 1024, "browser.task");
    expect(projection.content).toContain(token(pending));
    expect(projection.content).toContain("needs_text");
    expect(JSON.stringify(pending)).not.toContain("pagepage");
  });

});
