import { describe, expect, it, vi } from "vitest";
import type { WsControlPlane } from "../ws.js";
import { RemoteTerminalSurface } from "./remote-terminal.js";

class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}

describe("RemoteTerminalSurface", () => {
  it("starts on the owning node and keeps terminal metadata scoped to that node", async () => {
    const fakeWs = new FakeWs();
    const surface = new RemoteTerminalSurface(
      "term-remote",
      fakeWs as unknown as WsControlPlane,
      "node-1",
      { cols: 100, rows: 40 },
    );

    await surface.start({ sessionId: "session-1", projectRoot: "/remote/project" });

    expect(fakeWs.proxyCalls[0]).toMatchObject({
      nodeId: "node-1",
      op: "start",
      params: {
        terminalId: "term-remote",
        sessionId: "session-1",
        projectRoot: "/remote/project",
        cols: 100,
        rows: 40,
      },
    });
    expect(surface.snapshot()).toMatchObject({
      id: "term-remote",
      type: "terminal",
      state: "running",
      sessionId: "session-1",
      metadata: {
        cwd: "/remote/project",
        nodeId: "node-1",
        remote: true,
        pid: 1234,
        shell: "/bin/bash",
      },
    });
  });

  it("replays output from a command-local offset", () => {
    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
    );

    surface.ingestOutput("older command output\r\n");
    const outputOffset = surface.getOutputOffset();
    surface.ingestOutput("current command output\r\n");
    const outputEndOffset = surface.getOutputOffset();
    surface.ingestOutput("later command output\r\n");

    expect(surface.getRecentOutputSince(outputOffset, outputEndOffset)).toBe("current command output\r\n");
  });

  it("waits for the remote shell's prompt marker before reporting ready", async () => {
    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
    );
    await surface.start({ sessionId: "session-1", projectRoot: "/remote/project" });

    const settled = vi.fn();
    const prompt = surface.waitForPrompt(5000).then(settled);

    // Well past the flat 25 ms this used to resolve after. A slow remote shell
    // (PowerShell loading its profile) is still starting up here, so writing a
    // command now would drop the keystrokes and the run would come back empty.
    await new Promise((r) => setTimeout(r, 80));
    expect(surface.shellIntegrationReady).toBe(false);
    expect(settled).not.toHaveBeenCalled();

    surface.ingestOutput("\x1b]633;B\x07PS C:\\remote\\project> ");
    await prompt;

    expect(surface.shellIntegrationReady).toBe(true);
    expect(settled).toHaveBeenCalled();
  });

  it("treats a reattached terminal as already prompt-ready", async () => {
    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
      { reuseOnly: true },
    );

    expect(surface.shellIntegrationReady).toBe(true);
    const raced = await Promise.race([
      surface.waitForPrompt(5000).then(() => "ready"),
      new Promise((r) => setTimeout(() => r("stalled"), 50)),
    ]);
    expect(raced).toBe("ready");
  });

  it("falls back to the timeout for shells without OSC 633 integration", async () => {
    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
    );
    await surface.start({ sessionId: "session-1", projectRoot: "/remote/project" });

    surface.ingestOutput("$ ");
    await expect(surface.waitForPrompt(30)).resolves.toBeUndefined();
    expect(surface.shellIntegrationReady).toBe(false);
  });

  it("forwards input, resize, output replay, and stop through the remote node", async () => {
    const fakeWs = new FakeWs();
    const surface = new RemoteTerminalSurface(
      "term-remote",
      fakeWs as unknown as WsControlPlane,
      "node-1",
    );
    const onOutput = vi.fn();
    surface.onOutput = onOutput;

    await surface.start({ sessionId: "session-1", projectRoot: "/remote/project" });
    surface.write("pwd\r");
    surface.resize(80, 24);
    surface.ingestOutput("/remote/project\r\n");
    await surface.stop();

    expect(fakeWs.fireAndForgetCalls).toEqual([
      { nodeId: "node-1", op: "input", params: { terminalId: "term-remote", data: "pwd\r" } },
      { nodeId: "node-1", op: "resize", params: { terminalId: "term-remote", cols: 80, rows: 24 } },
    ]);
    expect(surface.getRecentOutput()).toBe("/remote/project\r\n");
    expect(onOutput).toHaveBeenCalledWith("/remote/project\r\n");
    expect(fakeWs.proxyCalls.at(-1)).toMatchObject({
      nodeId: "node-1",
      op: "stop",
      params: { terminalId: "term-remote" },
    });
  });
});
