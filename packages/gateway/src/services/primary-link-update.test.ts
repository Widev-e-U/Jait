import { afterEach, describe, expect, it, vi } from "vitest";

const update = vi.hoisted(() => ({
  prepareUpdate: vi.fn(),
  discardUpdate: vi.fn(),
  launchSystemdUpdate: vi.fn(),
}));
vi.mock("../../bin/safe-update.mjs", () => update);
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, exec: (_command: string, _options: unknown, callback: (error: null, stdout: string, stderr: string) => void) => callback(null, "99.0.0", "") };
});

import { PrimaryLink } from "./primary-link.js";

function createLink(port = 1234) {
  const link = new PrimaryLink({ primaryGateway: "http://localhost:1234", updatePort: port });
  const internals = link as unknown as {
    send: (message: unknown) => void;
    handleMessage: (message: unknown) => Promise<void>;
  };
  const send = vi.fn();
  internals.send = send;
  return { internals, send };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("remote gateway update requests", () => {
  it("denies requests without node-side opt-in", async () => {
    vi.stubEnv("JAIT_ALLOW_REMOTE_UPDATE", "");
    vi.stubEnv("INVOCATION_ID", "test");
    const { internals, send } = createLink();
    await internals.handleMessage({ type: "node.update-request", payload: { requestId: "a", version: "1.2.3" } });
    expect(update.prepareUpdate).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ error: expect.stringContaining("not enabled") }) }));
  });

  it("rejects malformed versions and node-only operation", async () => {
    vi.stubEnv("JAIT_ALLOW_REMOTE_UPDATE", "1");
    vi.stubEnv("INVOCATION_ID", "test");
    const { internals, send } = createLink();
    await internals.handleMessage({ type: "node.update-request", payload: { requestId: "a", version: "1.2.3;id" } });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ error: "Invalid version" }) }));
    const nodeOnly = createLink(0);
    await nodeOnly.internals.handleMessage({ type: "node.update-request", payload: { requestId: "b", version: "1.2.3" } });
    expect(nodeOnly.send).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ error: expect.stringContaining("HTTP health endpoint") }) }));
    expect(update.prepareUpdate).not.toHaveBeenCalled();
  });

  it("discards the prepared update if launching the controller fails", async () => {
    vi.stubEnv("JAIT_ALLOW_REMOTE_UPDATE", "1");
    vi.stubEnv("INVOCATION_ID", "test");
    const plan = { newVersion: "99.0.0" };
    update.prepareUpdate.mockResolvedValue(plan);
    update.launchSystemdUpdate.mockRejectedValueOnce(new Error("launch failed"));
    const { internals, send } = createLink();
    await internals.handleMessage({ type: "node.update-request", payload: { requestId: "a", version: "99.0.0" } });
    expect(update.discardUpdate).toHaveBeenCalledWith(plan);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ requestId: "a", error: expect.stringContaining("launch failed") }) }));
  });

  it("starts the staged update controller and acknowledges initiation", async () => {
    vi.stubEnv("JAIT_ALLOW_REMOTE_UPDATE", "1");
    vi.stubEnv("INVOCATION_ID", "test");
    const plan = { newVersion: "99.0.0" };
    update.prepareUpdate.mockResolvedValue(plan);
    update.launchSystemdUpdate.mockResolvedValue(undefined);
    const { internals, send } = createLink();
    await internals.handleMessage({ type: "node.update-request", payload: { requestId: "a", version: "1.2.3" } });
    expect(update.prepareUpdate).not.toHaveBeenCalled();
    await internals.handleMessage({ type: "node.update-request", payload: { requestId: "b", version: "99.0.0" } });
    expect(update.prepareUpdate).toHaveBeenCalledWith({ version: "99.0.0" });
    expect(update.launchSystemdUpdate).toHaveBeenCalledWith(plan, expect.any(String), 1234);
    expect(send).toHaveBeenCalledWith({ type: "node.update-response", payload: { requestId: "b", result: { ok: true, newVersion: "99.0.0" } } });
  });
});
