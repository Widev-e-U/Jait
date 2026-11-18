import { describe, expect, it, vi } from "vitest";
import { BrowserWorkflowService } from "./browser-workflows.js";
import { evaluateDecision } from "./system-one.js";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(async () => Buffer.from("image")) }));
vi.mock("./system-one.js", () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));

const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
const plan = { task: "Open and save", visual: true, actions: [
  { when: "closed", step: { action: "click", label: "Open", target: "Open" } },
  { when: "open", step: { action: "click", label: "Save", target: "Save" } },
] };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.screenshot"
    ? { ok: true, message: "captured", data: { result: { path: "/project/.jait/shots/test.png" } } }
    : { ok: true, message: "captured", data: { textPreview: "page" } });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
describe("visual browser task", () => {
  it("sends fresh screenshots before actions and after the last click", async () => {
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "a0", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "a1", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { complete: { type: "noul", noul: 1 } } });
    expect(await service.runTask(plan, context)).toMatchObject({ ok: true, data: { completed: [0, 1] } });
    expect(execute.mock.calls.map(call => call[0])).toEqual(["browser.snapshot", "browser.screenshot", "browser.click", "browser.screenshot", "browser.click", "browser.screenshot"]);
    expect(vi.mocked(evaluateDecision).mock.calls.every(call => Buffer.isBuffer(call[4]))).toBe(true);
  });
  it("stops without sending an image if capture is suppressed", async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { textPreview: "page" } })
      .mockResolvedValueOnce({ ok: false, message: "suppressed", data: { captureSuppressed: true } } as never);
    vi.mocked(evaluateDecision).mockReset();
    expect(await service.runTask(plan, context)).toMatchObject({ ok: false, data: { completed: [] } });
    expect(evaluateDecision).not.toHaveBeenCalled();
  });
});
