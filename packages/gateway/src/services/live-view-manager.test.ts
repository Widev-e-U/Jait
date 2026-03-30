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

  it("surfaces docker sandbox failures without falling back to host Xvfb", async () => {
    startBrowserSandbox.mockRejectedValueOnce(new Error("docker run failed"));

    const { startLiveView } = await import("./live-view-manager.js");

    await expect(startLiveView({ workspaceRoot: "/workspace/app" })).rejects.toThrow(
      "Docker sandbox browser failed: docker run failed",
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});
