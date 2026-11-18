import { afterEach, describe, expect, it, vi } from "vitest";
import { CLI_USER_IDLE_TIMEOUT_MS as timeout, CliSessionIdleTracker } from "./session-idle.js";

afterEach(() => vi.useRealTimers());

describe("CLI user-message idle expiry", () => {
  it("expires at ten minutes from the user message, not from the end of the turn", () => {
    vi.useFakeTimers();
    const tracker = new CliSessionIdleTracker();
    let busy = true;
    const expire = vi.fn(async () => {});
    tracker.recordUserMessage("chat");
    tracker.watch("process", "chat", () => busy, expire);
    vi.advanceTimersByTime(timeout - 5_000);
    busy = false;
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_000);
    expect(expire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(timeout);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("resets only the matching chat when a new user message arrives", () => {
    vi.useFakeTimers();
    const tracker = new CliSessionIdleTracker();
    const a = vi.fn(async () => {}), b = vi.fn(async () => {});
    tracker.watch("a", "chat-a", () => false, a);
    tracker.watch("b", "chat-b", () => false, b);
    vi.advanceTimersByTime(timeout - 60_000);
    tracker.recordUserMessage("chat-a");
    vi.advanceTimersByTime(60_000);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(timeout - 60_000);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("protects long turns and approvals, then expires without granting another ten minutes", () => {
    vi.useFakeTimers();
    const tracker = new CliSessionIdleTracker();
    let busy = true;
    const expire = vi.fn(async () => {});
    tracker.watch("process", "chat", () => busy, expire);
    vi.advanceTimersByTime(timeout * 3);
    expect(expire).not.toHaveBeenCalled();
    busy = false;
    vi.advanceTimersByTime(5_000);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("expires unused prewarms and permits a fresh session after expiry", () => {
    vi.useFakeTimers();
    const tracker = new CliSessionIdleTracker();
    const old = vi.fn(async () => {}), fresh = vi.fn(async () => {});
    tracker.watch("old", "chat", () => false, old);
    vi.advanceTimersByTime(timeout);
    tracker.recordUserMessage("chat");
    tracker.watch("fresh", "chat", () => false, fresh);
    vi.advanceTimersByTime(timeout - 5_000);
    expect(old).toHaveBeenCalledTimes(1);
    expect(fresh).not.toHaveBeenCalled();
    tracker.forget("fresh");
    vi.advanceTimersByTime(timeout);
    expect(fresh).not.toHaveBeenCalled();
  });
});
