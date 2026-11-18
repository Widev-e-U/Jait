import { describe, it, expect, vi } from "vitest";
import { MessengerBridge } from "./messenger-bridge.js";
import type { MessengerRequest } from "@jait/shared";

describe("owner-scoped Messenger bridge", () => {
  it("fails closed without opt-in, identity, or a unique active browser", async () => {
    const bridge = new MessengerBridge();
    expect((await bridge.request(undefined, { action: "status" })).ok).toBe(false);
    expect((await bridge.request("alice", { action: "status" })).ok).toBe(false);
    const send = vi.fn();
    bridge.register("bob-tab", { userId: "bob", send, active: () => true });
    expect((await bridge.request("alice", { action: "status" })).ok).toBe(false);
    bridge.register("a", { userId: "alice", send, active: () => true });
    bridge.register("b", { userId: "alice", send, active: () => true });
    expect((await bridge.request("alice", { action: "status" })).message).toContain("Multiple");
    expect(send).not.toHaveBeenCalled();
    bridge.stop();
  });

  it("binds results to the exact requesting user's selected browser", async () => {
    const bridge = new MessengerBridge();
    let request!: MessengerRequest;
    bridge.register("a", { userId: "alice", active: () => true, send: value => { request = value; } });
    bridge.register("b", { userId: "bob", active: () => true, send: vi.fn() });
    const pending = bridge.request("alice", { action: "status" });
    const done = vi.fn(); void pending.then(done);
    bridge.complete("b", "bob", request.requestId, { ok: true, message: "spoof" });
    bridge.complete("a", "bob", request.requestId, { ok: true, message: "spoof" });
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    bridge.complete("a", "alice", request.requestId, { ok: true, message: "connected" });
    expect(await pending).toEqual({ ok: true, message: "connected", data: undefined });
    bridge.stop();
  });

  it("clears pending work on revocation, abort, timeout and oversized output, without retrying", async () => {
    const bridge = new MessengerBridge();
    let request!: MessengerRequest;
    const send = vi.fn((value: MessengerRequest) => { request = value; });
    const register = () => bridge.register("a", { userId: "alice", active: () => true, send });
    register();
    const revoked = bridge.request("alice", { action: "status" });
    bridge.unregister("a");
    expect((await revoked).ok).toBe(false);
    register();
    const controller = new AbortController();
    const aborted = bridge.request("alice", { action: "status" }, controller.signal);
    controller.abort();
    expect((await aborted).message).toContain("Cancelled");
    const timeout = bridge.request("alice", { action: "send", roomId: "!room:test", text: "hello" }, undefined, 1);
    expect((await timeout).message).toContain("uncertain");
    const oversized = bridge.request("alice", { action: "status" });
    bridge.complete("a", "alice", request.requestId, { ok: true, message: "history", data: "x".repeat(150001) });
    expect((await oversized).ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(4);
    bridge.stop();
  });
});
