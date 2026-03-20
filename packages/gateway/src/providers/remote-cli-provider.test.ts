import { describe, expect, it, vi } from "vitest";
import type { WsControlPlane } from "../ws.js";
import { RemoteCliProvider } from "./remote-cli-provider.js";
import type { ProviderEvent } from "./contracts.js";

function createMockWs() {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
  };
}

describe("RemoteCliProvider", () => {
  it("forwards direct provider events from remote Claude sessions", async () => {
    const { ws, fireRemoteEvent } = createMockWs();
    const provider = new RemoteCliProvider(ws, "node-1", "claude-code");
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => {
      events.push(event);
    });

    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: process.cwd(),
      mode: "full-access",
      mcpServers: [{ name: "jait", transport: "sse", url: "http://gateway.test/mcp/sse" }],
    });

    expect(ws.proxyProviderOp).toHaveBeenCalledWith(
      "node-1",
      "start-session",
      expect.objectContaining({
        mcpServers: [{ name: "jait", transport: "sse", url: "http://gateway.test/mcp/sse" }],
      }),
      90_000,
    );

    fireRemoteEvent(session.id, { type: "turn.completed", sessionId: session.id });

    expect(events).toEqual([
      { type: "session.started", sessionId: session.id },
      { type: "turn.completed", sessionId: session.id },
    ]);

    unsubscribe();
  });
});
