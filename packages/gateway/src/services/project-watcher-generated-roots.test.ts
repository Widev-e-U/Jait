import { beforeEach, describe, expect, it, vi } from "vitest";

const subscribe = vi.fn();

vi.mock("@parcel/watcher", () => ({ subscribe }));

const { ProjectWatcher } = await import("./project-watcher.js");

beforeEach(() => {
  subscribe.mockReset();
});

describe("ProjectWatcher generated roots", () => {
  it.each([
    "/project/.jait",
    "/project/.jait/artifacts/driver-123/workspace",
    ".jait/artifacts/driver-123/workspace",
  ])("does not subscribe to generated root %s", async (root) => {
    const watcher = new ProjectWatcher();
    await watcher.watch(root);
    expect(subscribe).not.toHaveBeenCalled();
    expect(watcher.watching).toBe(false);
    expect(watcher.root).toBeNull();
  });

  it("unsubscribes a real project before switching to a generated root", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    subscribe.mockResolvedValue({ unsubscribe });
    const watcher = new ProjectWatcher();
    await watcher.watch("/project");
    subscribe.mockClear();

    await watcher.watch("/project/.jait/artifacts/run-1");

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).not.toHaveBeenCalled();
    expect(watcher.watching).toBe(false);
    expect(watcher.root).toBeNull();
  });

  it("continues watching projects with similar directory names", async () => {
    subscribe.mockResolvedValue({ unsubscribe: vi.fn() });
    const watcher = new ProjectWatcher();
    await watcher.watch("/project/.jait-tools/source");
    expect(subscribe).toHaveBeenCalledOnce();
    expect(watcher.watching).toBe(true);
    await watcher.stop();
  });

});
