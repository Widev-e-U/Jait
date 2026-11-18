import { describe, expect, it } from "vitest";
import { ConsentManager } from "./consent-manager.js";

type RequestParams = Parameters<ConsentManager["requestConsent"]>[0];

function request(signal?: AbortSignal): RequestParams {
  return {
    actionId: "attempt-1",
    toolName: "terminal.run",
    summary: "npm test",
    preview: {},
    risk: "medium",
    policy: { consentLevel: "once", description: "Run a non-interactive shell command.", knownTool: true, source: "profile" },
    sessionId: "workflow:run-1",
    signal,
  } as unknown as RequestParams;
}

describe("consent for stopped workflow actions", () => {
  it("denies a pending approval when its action is stopped, and removes the prompt", async () => {
    const manager = new ConsentManager();
    const controller = new AbortController();
    const decision = manager.requestConsent(request(controller.signal));
    expect(manager.listPending("workflow:run-1")).toHaveLength(1);

    controller.abort();

    await expect(decision).resolves.toMatchObject({
      approved: false,
      decidedVia: "auto",
      reason: expect.stringContaining("cancelled"),
    });
    expect(manager.listPending()).toHaveLength(0);
  });

  it("denies at once when the action was already stopped before it asked", async () => {
    const manager = new ConsentManager();
    const controller = new AbortController();
    controller.abort();
    await expect(manager.requestConsent(request(controller.signal))).resolves.toMatchObject({ approved: false });
    expect(manager.listPending()).toHaveLength(0);
  });

  it("keeps waiting for the owner when no stop signal is given", async () => {
    const manager = new ConsentManager();
    const decision = manager.requestConsent(request());
    const [pending] = manager.listPending();
    expect(pending).toBeDefined();
    manager.approve(pending!.id, "click");
    await expect(decision).resolves.toMatchObject({ approved: true, decidedVia: "click" });
  });

  it("does not change an approval that was answered before the stop", async () => {
    const manager = new ConsentManager();
    const controller = new AbortController();
    const decision = manager.requestConsent(request(controller.signal));
    const [pending] = manager.listPending();
    manager.approve(pending!.id, "click");
    controller.abort();
    await expect(decision).resolves.toMatchObject({ approved: true, decidedVia: "click" });
  });
});
