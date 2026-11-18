import { describe, expect, it, vi } from "vitest";
import { BrowserWorkflowService } from "./browser-workflows.js";
import { evaluateDecision } from "./system-one.js";

vi.mock("./system-one.js", () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
const plan = { task: "Open settings then save", actions: [
  { when: "settings is closed", step: { action: "click", label: "Open settings", target: "Settings" } },
  { when: "settings is open", step: { action: "click", label: "Save", target: "Save" } },
] };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { textPreview: `page ${execute.mock.calls.length}` } }
    : { ok: true, message: "clicked", data: { textPreview: `page ${execute.mock.calls.length}` } });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
describe("browser task", () => {
  it("selects multiple permitted actions against fresh feedback and verifies final state", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "a0", confidence: 0.2 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "a1", confidence: 1 } } });
    const result = await service.runTask(plan, context);
    expect(result).toMatchObject({ ok: true, data: { completed: [0, 1] } });
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot", "browser.click", "browser.click"]);
    expect(vi.mocked(evaluateDecision).mock.calls[1]?.[1]).toContain("page 2");
  });
  it("stops on uncertainty and never executes unlisted actions", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue({ model: "test", answers: { next: { type: "choice", choice: "stop" } } });
    expect(await service.runTask(plan, context)).toMatchObject({ ok: true, data: { completed: [] } });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("does not send suppressed browser feedback to the model", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "suppressed", data: { textPreview: "" } });
    vi.mocked(evaluateDecision).mockClear();
    expect(await service.runTask(plan, context)).toMatchObject({ ok: false });
    expect(evaluateDecision).not.toHaveBeenCalled();
  });
});
