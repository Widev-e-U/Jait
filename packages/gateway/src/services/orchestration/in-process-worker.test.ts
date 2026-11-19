import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { ToolRegistry } from "../../tools/registry.js";
import type { UserService } from "../users.js";
import type { SubAgentRunRequest } from "./executor.js";
import { createInProcessWorkflowWorker } from "./in-process-worker.js";

const request: SubAgentRunRequest = {
  userId: "workflow-owner", runId: "run", taskId: "task", attemptId: "attempt",
  prompt: "Summarize the supplied dependency result.", timeoutMs: 1000,
  claims: { reads: [], writes: [] }, signal: new AbortController().signal,
};

function setup(overrides: Partial<ReturnType<UserService["getSettings"]>> = {}) {
  const execute = vi.fn();
  const registry = new ToolRegistry();
  registry.register({ name: "fixture.write", description: "Write a fixture", parameters: {}, execute });
  const settings = {
    chatProvider: "jait", jaitBackend: "openai", selectedModel: "fixture-model",
    apiKeys: { OPENAI_API_KEY: "owner-key", OPENAI_BASE_URL: "https://fixture.example.test/v1" },
    ...overrides,
  } as ReturnType<UserService["getSettings"]>;
  const getSettings = vi.fn().mockReturnValue(settings);
  const worker = createInProcessWorkflowWorker(loadConfig(), { getSettings }, registry);
  return { worker, getSettings, execute };
}

afterEach(() => vi.unstubAllGlobals());

describe("in-process workflow worker", () => {
  it("reuses agent.spawn with the owner's model and sends no tools", async () => {
    const report = '{"taskId":"task","attemptId":"attempt"}';
    const fetch = vi.fn().mockResolvedValue(new Response([
      `data: ${JSON.stringify({ choices: [{ delta: { content: `[INFORM] ${report}` } }] })}\n\n`,
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetch);
    const { worker, getSettings, execute } = setup();
    const recordAgentRef = vi.fn();
    await expect(worker.run({ ...request, recordAgentRef })).resolves.toEqual({ text: report });
    expect(recordAgentRef).toHaveBeenCalledWith(expect.any(String));
    expect(recordAgentRef.mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[0]!);
    expect(getSettings).toHaveBeenCalledWith(request.userId);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain("https://fixture.example.test/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer owner-key");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("fixture-model");
    expect(body.messages).toContainEqual({ role: "user", content: request.prompt });
    expect(body.tools).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails the attempt when the provider rejects the request, instead of reading an empty reply as a report", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: "Incorrect API key provided", code: "invalid_api_key" } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));
    const { worker } = setup();
    await expect(worker.run(request)).rejects.toThrow("produced an empty answer");
  });

  it("refuses workspace claims and ACP before contacting a provider", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { worker } = setup();
    const acp = setup({ chatProvider: "codex" });
    await expect(worker.run({ ...request, claims: { reads: [], writes: ["."] } })).rejects.toThrow("scoped workspace");
    await expect(acp.worker.run(request)).rejects.toThrow("in-process Jait provider");
    await expect(setup({ selectedModel: null }).worker.run(request)).rejects.toThrow("No model is selected");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts the active model request when the attempt stops", async () => {
    const controller = new AbortController();
    let onRequest!: (signal: AbortSignal) => void;
    const requested = new Promise<AbortSignal>((resolve) => { onRequest = resolve; });
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal!;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      onRequest(signal);
    })));
    const { worker } = setup();
    const result = worker.run({ ...request, signal: controller.signal });
    const modelSignal = await requested;
    const cancelled = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await cancelled;
    expect(modelSignal.aborted).toBe(true);
  });
});
