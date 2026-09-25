import { beforeEach, describe, expect, it, vi } from "vitest";

const startBrowserSandbox = vi.fn();
const stopContainer = vi.fn();
const reserveLocalPort = vi.fn();
const spawn = vi.fn();

vi.mock("../security/sandbox-manager.js", () => ({
  SandboxManager: vi.fn().mockImplementation(() => ({
    startBrowserSandbox,
    stopContainer,
  })),
  reserveLocalPort,
}));

vi.mock("node:child_process", () => ({
  spawn,
}));

describe("startLiveView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserveLocalPort.mockResolvedValue(6100);
  });

  it("queues a second browser while the first container is starting", async () => {
    let finishFirst!: (value: unknown) => void;
    startBrowserSandbox.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    startBrowserSandbox.mockResolvedValueOnce({
      containerName: "browser-two", vncPort: 5902, novncPort: 6082, novncUrl: "ws://127.0.0.1:6082", cdpUrl: "http://127.0.0.1:9223",
    });
    const { startLiveView } = await import("./live-view-manager.js");
    const first = startLiveView({ projectRoot: "/project/app" });
    await vi.waitFor(() => expect(startBrowserSandbox).toHaveBeenCalledTimes(1));
    const second = startLiveView({ projectRoot: "/project/app" });
    await Promise.resolve();
    expect(startBrowserSandbox).toHaveBeenCalledTimes(1);
    finishFirst({
      containerName: "browser-one", vncPort: 5901, novncPort: 6081, novncUrl: "ws://127.0.0.1:6081", cdpUrl: "http://127.0.0.1:9222",
    });
    await expect(first).resolves.toMatchObject({ containerName: "browser-one" });
    await expect(second).resolves.toMatchObject({ containerName: "browser-two" });
    expect(startBrowserSandbox).toHaveBeenCalledTimes(2);
  });

  it("surfaces docker sandbox failures without falling back to host Xvfb", async () => {
    startBrowserSandbox.mockRejectedValueOnce(new Error("docker run failed"));

    const { startLiveView } = await import("./live-view-manager.js");

    await expect(startLiveView({ projectRoot: "/project/app" })).rejects.toThrow(
      "Docker sandbox browser failed: docker run failed",
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});
