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
