import { describe, expect, it, vi } from "vitest";
import { SteeringController } from "../tools/agent-loop.js";
import { ProviderSteeringDispatcher } from "./steering-dispatcher.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

describe("provider steering delivery", () => {
  it("keeps messages pending until acknowledgement and serializes arrivals", async () => {
    const queue = new SteeringController();
    const first = deferred<boolean>();
    const deliver = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(true);
    const consumed = vi.fn();
    const dispatcher = new ProviderSteeringDispatcher(queue, deliver, consumed, vi.fn());
    queue.steer("first", { queuedMessageId: "q1" });
    await flush();
    expect(deliver).not.toHaveBeenCalled();
    dispatcher.start();
    await flush();
    queue.steer("second", { queuedMessageId: "q2" });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(consumed).not.toHaveBeenCalled();
    expect(queue.hasPending).toBe(true);
    first.resolve(true);
    await flush();
    expect(deliver.mock.calls.map(call => call[0])).toEqual(["[STEERING] first", "[STEERING] second"]);
    expect(consumed.mock.calls.map(call => call[0].queuedMessageId)).toEqual(["q1", "q2"]);
    expect(queue.hasPending).toBe(false);
    dispatcher.dispose();
  });

  it.each([false, new Error("unsupported")])("retains rejected messages for FIFO fallback (%s)", async result => {
    const queue = new SteeringController();
    const failed = vi.fn();
    const deliver = vi.fn(async () => { if (result instanceof Error) throw result; return result; });
    const consumed = vi.fn();
    const dispatcher = new ProviderSteeringDispatcher(queue, deliver, consumed, failed);
    dispatcher.start();
    queue.steer("first");
    queue.steer("second");
    await flush();
    await dispatcher.pause();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(consumed).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledTimes(result instanceof Error ? 1 : 0);
    expect(queue.drain().map(message => message.message)).toEqual(["first", "second"]);
    dispatcher.dispose();
  });

  it("settles the current ack at the turn boundary and leaves later arrivals queued", async () => {
    const queue = new SteeringController();
    const first = deferred<boolean>();
    const deliver = vi.fn(() => first.promise);
    const consumed = vi.fn();
    const dispatcher = new ProviderSteeringDispatcher(queue, deliver, consumed, vi.fn());
    dispatcher.start();
    queue.steer("first");
    await flush();
    const paused = dispatcher.pause();
    queue.steer("after turn end");
    first.resolve(true);
    await paused;
    expect(consumed).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(queue.drain().map(message => message.message)).toEqual(["after turn end"]);
    dispatcher.dispose();
  });

  it("detaches on cancellation without emitting a late transcript marker", async () => {
    const queue = new SteeringController();
    const ack = deferred<boolean>();
    const deliver = vi.fn(() => ack.promise);
    const consumed = vi.fn();
    const dispatcher = new ProviderSteeringDispatcher(queue, deliver, consumed, vi.fn());
    dispatcher.start();
    queue.steer("in flight");
    await flush();
    dispatcher.dispose();
    queue.steer("after cancellation");
    ack.resolve(true);
    await dispatcher.pause();
    expect(consumed).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(queue.drain().map(message => message.message)).toEqual(["after cancellation"]);
  });
});
