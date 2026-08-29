import { describe, expect, it, vi } from "vitest";
import type { NodeState } from "@jait/shared";
import { ComputerControlSessionService } from "../services/computer-control.js";
import type { WsControlPlane } from "../ws.js";
import { createComputerTools } from "./computer-tools.js";
import type { ToolContext, ToolDefinition } from "./contracts.js";

const context: ToolContext = {
  sessionId: "chat-a",
  actionId: "action-a",
  projectRoot: "/workspace",
  requestedBy: "assistant",
};

function windowsNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: "windows-a",
    name: "Windows PC",
    platform: "windows",
    role: "desktop",
    lifecycle: "ready",
    protocolVersion: 1,
    capabilities: {
      providers: [],
      surfaces: ["computer"],
      tools: ["computer.session", "computer.observe", "computer.act"],
      screenShare: true,
      voice: false,
      preview: false,
    },
    connectedAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function setup(nodes: NodeState[] = [windowsNode()]) {
  const proxyToolOp = vi.fn(async (_nodeId: string, tool: string) => ({
    ok: true,
    message: `${tool} completed`,
    data: { accepted: true },
  }));
  const ws = {
    getNodeRegistry: () => ({
      version: 1,
      serverTime: new Date().toISOString(),
      nodes,
    }),
    proxyToolOp,
  } as unknown as WsControlPlane;
  const sessions = new ComputerControlSessionService();
  const tools = new Map(
    createComputerTools(ws, sessions).map((tool) => [tool.name, tool] as const),
  );
  return { tools, proxyToolOp, sessions };
}

function tool<T>(tools: Map<string, ToolDefinition>, name: string): ToolDefinition<T> {
  const found = tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found as ToolDefinition<T>;
}

describe("computer tools", () => {
  it("lists Windows targets and explains why old desktop builds are unavailable", async () => {
    const oldNode = windowsNode({
      id: "old-windows",
      capabilities: {
        ...windowsNode().capabilities,
        tools: ["terminal.run"],
      },
    });
    const { tools } = setup([windowsNode(), oldNode, windowsNode({ id: "linux-a", platform: "linux" })]);

    const result = await tool<Record<string, never>>(tools, "computer.targets").execute({}, context);
    const targets = (result.data as { targets: Array<{ nodeId: string; available: boolean; reason?: string }> }).targets;

    expect(targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "windows-a", available: true }),
      expect.objectContaining({ nodeId: "old-windows", available: false, reason: expect.stringContaining("Desktop update required") }),
      expect.objectContaining({ nodeId: "linux-a", available: false }),
    ]));
  });

  it("starts a target-side session and routes actions through its node", async () => {
    const { tools, proxyToolOp } = setup();
    const started = await tool<{ action: "start"; nodeId: string }>(tools, "computer.session")
      .execute({ action: "start", nodeId: "windows-a" }, context);

    expect(started.ok).toBe(true);
    const sessionId = (started.data as { session: { id: string } }).session.id;
    expect(proxyToolOp).toHaveBeenCalledWith(
      "windows-a",
      "computer.session",
      expect.objectContaining({ action: "start", sessionId }),
      expect.objectContaining({ sessionId: "chat-a" }),
    );

    const acted = await tool<Record<string, unknown>>(tools, "computer.act").execute({
      sessionId,
      action: "type",
      text: "hello im jait",
      includeScreenshot: false,
    }, context);
    expect(acted.ok).toBe(true);
    expect(proxyToolOp).toHaveBeenLastCalledWith(
      "windows-a",
      "computer.act",
      expect.objectContaining({ sessionId, action: "type", text: "hello im jait" }),
      expect.objectContaining({ sessionId: "chat-a" }),
    );
  });

  it("rejects malformed actions before dispatch", async () => {
    const { tools, proxyToolOp } = setup();
    const result = await tool<Record<string, unknown>>(tools, "computer.act").execute({
      sessionId: "missing",
      action: "click",
      x: 10,
    }, context);

    expect(result).toEqual({ ok: false, message: "click requires finite x and y coordinates" });
    expect(proxyToolOp).not.toHaveBeenCalled();
  });

  it("prevents another chat from reusing a control session", async () => {
    const { tools, proxyToolOp } = setup();
    const started = await tool<{ action: "start" }>(tools, "computer.session")
      .execute({ action: "start" }, context);
    const sessionId = (started.data as { session: { id: string } }).session.id;
    proxyToolOp.mockClear();

    const result = await tool<Record<string, unknown>>(tools, "computer.observe").execute(
      { sessionId },
      { ...context, sessionId: "chat-b" },
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("belongs to another chat");
    expect(proxyToolOp).not.toHaveBeenCalled();
  });

  it("clears the gateway lease even when remote stop fails", async () => {
    const { tools, proxyToolOp } = setup();
    const sessionTool = tool<Record<string, unknown>>(tools, "computer.session");
    const started = await sessionTool.execute({ action: "start" }, context);
    const sessionId = (started.data as { session: { id: string } }).session.id;
    proxyToolOp.mockRejectedValueOnce(new Error("node disconnected"));

    const stopped = await sessionTool.execute({ action: "stop", sessionId }, context);
    const status = await sessionTool.execute({ action: "status" }, context);

    expect(stopped).toEqual({ ok: false, message: "node disconnected" });
    expect(status).toMatchObject({ ok: true, data: { sessions: [] } });
  });
});
