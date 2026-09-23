import { afterEach, describe, expect, it, vi } from "vitest";
import { generateChatNotificationDetail, normalizeNotificationDetail } from "./chat-notification.js";
import { callJaitLlmCompletion, resolveJaitLlmConfig } from "./jait-llm.js";
import { loadConfig } from "../config.js";

vi.mock("./jait-llm.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./jait-llm.js")>(),
  callJaitLlmCompletion: vi.fn(),
}));

const llm = resolveJaitLlmConfig({
  config: loadConfig(),
  userSettings: { jaitBackend: "openai" },
  userApiKeys: { OPENAI_API_KEY: "test-key" },
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("chat notification detail", () => {
  it("normalizes a summary into one short plain line", () => {
    expect(normalizeNotificationDetail('\nSummary: "Fixed the login bug."\nMore detail')).toBe("Fixed the login bug");
    expect(normalizeNotificationDetail("   ")).toBeNull();
    expect(normalizeNotificationDetail("Long outcome ".repeat(30))!.length).toBeLessThanOrEqual(160);
  });

  it("summarizes the outcome at the end of long responses", async () => {
    vi.mocked(callJaitLlmCompletion).mockResolvedValue("Fixed login");
    await generateChatNotificationDetail({
      task: "Fix login", response: "Planning ".repeat(1000) + "Final result: fixed login", llm,
    });
    const messages = vi.mocked(callJaitLlmCompletion).mock.calls[0]![1];
    expect(messages[1]!.content).toContain("Final result: fixed login");
    expect(messages[1]!.content.length).toBeLessThan(4100);
  });

  it("skips empty responses", async () => {
    expect(await generateChatNotificationDetail({ task: "hello", response: "", llm })).toBeNull();
    expect(callJaitLlmCompletion).not.toHaveBeenCalled();
  });

  it("returns null on backend failure for the caller's fallback", async () => {
    vi.mocked(callJaitLlmCompletion).mockRejectedValue(new Error("offline"));
    expect(await generateChatNotificationDetail({ task: "hello", response: "done", llm })).toBeNull();
  });

  it("aborts a slow summary request", async () => {
    vi.useFakeTimers();
    vi.mocked(callJaitLlmCompletion).mockImplementation((_llm, _messages, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }));
    const pending = generateChatNotificationDetail({ task: "hello", response: "done", llm });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await pending).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
