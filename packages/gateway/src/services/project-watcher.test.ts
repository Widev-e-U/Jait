import { beforeEach, describe, expect, it, vi } from "vitest";

const subscribe = vi.fn();

vi.mock("@parcel/watcher", () => ({ subscribe }));

const { DEFAULT_IGNORE, ProjectWatcher } = await import("./project-watcher.js");

beforeEach(() => {
  subscribe.mockReset();
});

describe("ProjectWatcher", () => {
  it("ignores the generated trees that can exhaust the watch table", () => {
    // `.jait` is written by the gateway itself inside the watched project, and
    // `target` is Rust/Cargo output; both routinely hold 10^5-10^6 directories.
    expect(DEFAULT_IGNORE).toContain("**/.jait/**");
    expect(DEFAULT_IGNORE).toContain("**/target/**");
    expect(DEFAULT_IGNORE).toContain("**/node_modules/**");
  });

  it("passes the ignore list to the native subscriber", async () => {
    subscribe.mockResolvedValue({ unsubscribe: vi.fn() });
    const watcher = new ProjectWatcher();

    await watcher.watch("/project");

    expect(subscribe).toHaveBeenCalledWith("/project", expect.any(Function), { ignore: DEFAULT_IGNORE });
  });

  it("honours an explicit ignore override", async () => {
    subscribe.mockResolvedValue({ unsubscribe: vi.fn() });
    const watcher = new ProjectWatcher({ ignore: ["**/vendor/**"] });

    await watcher.watch("/project");

    expect(subscribe).toHaveBeenCalledWith("/project", expect.any(Function), { ignore: ["**/vendor/**"] });
  });

  it("explains a full watch table instead of reporting a full disk", async () => {
    subscribe.mockRejectedValue(Object.assign(new Error("inotify_add_watch on '/project/.jait' failed: No space left on device"), { code: "ENOSPC" }));
    const watcher = new ProjectWatcher();

    await expect(watcher.watch("/project")).rejects.toThrow(/ran out of file-watch descriptors/);
  });

  it("rethrows unrelated subscription failures unchanged", async () => {
    subscribe.mockRejectedValue(new Error("ENOENT: project gone"));
    const watcher = new ProjectWatcher();

    await expect(watcher.watch("/project")).rejects.toThrow("ENOENT: project gone");
  });
});
