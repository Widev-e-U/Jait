import { describe, expect, it, vi } from "vitest";
import type { WsControlPlane } from "../ws.js";
import { RemoteCliProvider } from "./remote-cli-provider.js";
import type { ProviderEvent } from "./contracts.js";

function createMockWs(options: { sendTurnResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

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
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}

describe("RemoteCliProvider", () => {
  it("installs one shared remote event dispatcher per websocket", async () => {
    const { ws, getRemoteHandlerSetCount } = createMockWs();
    const first = new RemoteCliProvider(ws, "node-1", "claude-code");
    const second = new RemoteCliProvider(ws, "node-1", "claude-code");

    expect(getRemoteHandlerSetCount()).toBe(0);

    await first.startSession({
      threadId: "thread-1",
      workingDirectory: process.cwd(),
      mode: "full-access",
    });
    await second.startSession({
      threadId: "thread-2",
      workingDirectory: process.cwd(),
      mode: "full-access",
    });

    expect(getRemoteHandlerSetCount()).toBe(1);
  });

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
      mcpServers: [{ name: "jait", transport: "http", url: "http://gateway.test/mcp" }],
    });

    expect(ws.proxyProviderOp).toHaveBeenCalledWith(
      "node-1",
      "start-session",
      expect.objectContaining({
        mcpServers: [{ name: "jait", transport: "http", url: "http://gateway.test/mcp" }],
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

  it("waits for remote turn completion before resolving sendTurn", async () => {
    const { ws, fireRemoteEvent } = createMockWs();
    const provider = new RemoteCliProvider(ws, "node-1", "claude-code");
    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: process.cwd(),
      mode: "full-access",
    });

    let resolved = false;
    const sendTurn = provider.sendTurn(session.id, "hello").then(() => { resolved = true; });
    await Promise.resolve();
    await Promise.resolve();

    expect(ws.proxyProviderOp).toHaveBeenCalledWith(
      "node-1",
      "send-turn",
      expect.objectContaining({
        sessionId: session.id,
        message: "hello",
        providerThreadId: "remote-thread-1",
      }),
      30 * 60 * 1000 + 30_000,
    );
    expect(resolved).toBe(false);

    fireRemoteEvent(session.id, { type: "turn.completed", sessionId: session.id });
    await sendTurn;

    expect(resolved).toBe(true);
  });

  it("uses remote provider-op completion as a fallback", async () => {
    const { ws } = createMockWs({ sendTurnResult: { ok: true, completed: true } });
    const provider = new RemoteCliProvider(ws, "node-1", "claude-code");
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => { events.push(event); });
    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: process.cwd(),
      mode: "full-access",
    });

    await provider.sendTurn(session.id, "hello");

    expect(events).toContainEqual({ type: "turn.completed", sessionId: session.id });
    unsubscribe();
  });
});
