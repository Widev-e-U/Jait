import { describe, expect, it, vi } from "vitest";
import { AcpProvider } from "./acp-provider.js";
import { compactProviderContext, type ProviderContextState } from "./context-control.js";

function setup(prompt: ReturnType<typeof vi.fn>, cancel = vi.fn().mockResolvedValue(undefined)) {
  const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: "unused" });
  const control: ProviderContextState = { commands: ["compact"], usedTokens: 90_000, contextWindow: 100_000 };
  const state = { contextControl: control, session: { status: "idle" }, connection: { prompt, cancel }, acpSessionId: "acp", approvals: new Map(), client: { terminals: new Map(), trackedTerminalIds: new Set() } };
  (provider as unknown as { sessions: Map<string, unknown> }).sessions.set("test", state);
  return { provider, state, control, cancel };
}

describe("provider compaction recovery", () => {
  it("continues the real prompt after a settled compaction failure and backs off", async () => {
    const prompt = vi.fn().mockRejectedValueOnce(new Error("compaction failed")).mockResolvedValue({ stopReason: "end_turn" });
    const { provider, cancel, control } = setup(prompt);
    await provider.sendTurn("test", "work");
    expect(prompt.mock.calls.map(call => call[0].prompt[0].text)).toEqual(["/compact", "work"]);
    expect(cancel).not.toHaveBeenCalled();
    expect(control.retryAfter).toBeGreaterThan(Date.now());
    await provider.sendTurn("test", "next");
    expect(prompt.mock.calls.map(call => call[0].prompt[0].text)).toEqual(["/compact", "work", "next"]);
  });

  it("does not start the real prompt after user cancellation during compaction", async () => {
    let finish!: (value: { stopReason: string }) => void;
    const prompt = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { provider } = setup(prompt);
    const turn = provider.sendTurn("test", "work");
    await provider.interruptTurn("test");
    finish({ stopReason: "cancelled" });
    await expect(turn).rejects.toThrow("Context compaction cancelled");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("does not overlap a timed-out compaction that fails to settle", async () => {
    vi.useFakeTimers();
    try {
      const prompt = vi.fn().mockImplementation(() => new Promise(() => {}));
      const { provider, cancel } = setup(prompt);
      const turn = provider.sendTurn("test", "work");
      const assertion = expect(turn).rejects.toThrow("provider did not stop");
      await vi.advanceTimersByTimeAsync(185_001);
      await assertion;
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(prompt).toHaveBeenCalledTimes(1);
      await expect(provider.sendTurn("test", "next")).rejects.toThrow("Previous compaction is still stopping");
      expect(prompt).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("increases retry delay even above the emergency threshold and resets after success", async () => {
    vi.useFakeTimers();
    try {
      const state: ProviderContextState = { commands: ["compact"], usedTokens: 90_000, contextWindow: 100_000 };
      const invoke = vi.fn().mockRejectedValueOnce(new Error("failed")).mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
      await expect(compactProviderContext(state, invoke)).rejects.toThrow();
      await compactProviderContext(state, invoke);
      expect(invoke).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(compactProviderContext(state, invoke)).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(119_999);
      await compactProviderContext(state, invoke);
      expect(invoke).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await compactProviderContext(state, invoke);
      expect(state.failures).toBe(0);
      expect(state.usedTokens).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });
});
