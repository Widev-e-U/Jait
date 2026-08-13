import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FsNode } from "@jait/shared";
import type { WsControlPlane } from "../ws.js";
import type { ToolContext, ToolResult } from "./contracts.js";
import { createRemoteToolExecutor, resolveRemoteNodeForSession } from "./remote-executor.js";

const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};

const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};

const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};

function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}

function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}

describe("resolveRemoteNodeForSession", () => {
  let cleanupPath: string | null = null;

  afterEach(() => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  });

  it("keeps existing gateway-local project paths on the gateway", () => {
    cleanupPath = mkdtempSync(join(tmpdir(), "jait-remote-executor-"));
    const ws = createMockWs();

    expect(resolveRemoteNodeForSession(ws, cleanupPath)).toBeNull();
    expect(ws.getFsNodes).not.toHaveBeenCalled();
  });

  it("selects a connected non-gateway node for missing POSIX paths", () => {
    const ws = createMockWs();

    expect(resolveRemoteNodeForSession(ws, "/definitely/missing/jait/project")).toBe(remoteNode.id);
  });

  it("routes Windows paths only to Windows remote nodes", () => {
    const ws = createMockWs();

    expect(resolveRemoteNodeForSession(ws, "C:\\Users\\test\\repo")).toBe(windowsNode.id);
  });

  it("uses explicit projectNodeId even when the path exists locally", () => {
    cleanupPath = mkdtempSync(join(tmpdir(), "jait-remote-executor-"));
    const ws = createMockWs();

    // Without projectNodeId, existsSync returns true → stays local
    expect(resolveRemoteNodeForSession(ws, cleanupPath)).toBeNull();
    // With explicit projectNodeId, uses the remote node even though path exists locally
    expect(resolveRemoteNodeForSession(ws, cleanupPath, remoteNode.id)).toBe(remoteNode.id);
  });

  it("falls back to heuristic when projectNodeId node is disconnected", () => {
    const ws = createMockWs({ findNodeByDeviceId: vi.fn(() => undefined) });

    // Node not found → falls through to existsSync heuristic
    expect(resolveRemoteNodeForSession(ws, "/definitely/missing/jait/project", "dead-node-id")).toBe(remoteNode.id);
  });

  it("uses gateway for projectNodeId='gateway'", () => {
    cleanupPath = mkdtempSync(join(tmpdir(), "jait-remote-executor-"));
    const ws = createMockWs();

    expect(resolveRemoteNodeForSession(ws, cleanupPath, "gateway")).toBeNull();
  });
});

describe("createRemoteToolExecutor", () => {
  let cleanupPath: string | null = null;

  afterEach(() => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  });
  it("executes locally when there is no remote node", async () => {
    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local result" }));
    const context = createToolContext();
    const execOptions = { dryRun: true, consentTimeoutMs: 1000 };
    const execute = createRemoteToolExecutor({ ws, localExecutor }, null);

    await expect(execute("terminal.run", { command: "pwd" }, context, execOptions)).resolves.toEqual({
      ok: true,
      message: "local result",
    });
    expect(localExecutor).toHaveBeenCalledWith("terminal.run", { command: "pwd" }, context, execOptions);
    expect(ws.proxyToolOp).not.toHaveBeenCalled();
  });

  it("keeps gateway-local tools on the gateway even with a remote node", async () => {
    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local memory" }));
    const context = createToolContext();
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await expect(execute("memory.search", { query: "release notes" }, context)).resolves.toEqual({
      ok: true,
      message: "local memory",
    });
    expect(localExecutor).toHaveBeenCalledOnce();
    expect(ws.proxyToolOp).not.toHaveBeenCalled();
  });

  it("runs new/gateway-intrinsic tools locally by default (allow-list semantics)", async () => {
    // Every tool NOT in REMOTE_EXECUTABLE_TOOLS — including newly added ones
    // like the `jait` meta-tool, `web`, `agent`, `todo` — must run on the
    // gateway even when a remote node is bound. This is the core guarantee:
    // a new tool never accidentally gets proxied (and fail) on a node.
    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local" }));
    const context = createToolContext();
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    for (const toolName of ["jait", "web", "agent", "todo", "voice.speak", "some.brand.new.tool"]) {
      await execute(toolName, {}, context);
    }
    expect(localExecutor).toHaveBeenCalledTimes(6);
    expect(ws.proxyToolOp).not.toHaveBeenCalled();
  });

  it("proxies file.read (canonical name) to the remote node", async () => {
    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local result" }));
    const context = createToolContext();
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await execute("file.read", { path: "/remote/project/src/main.ts" }, context);
    expect(ws.proxyToolOp).toHaveBeenCalledWith(
      remoteNode.id,
      "file.read",
      { path: "/remote/project/src/main.ts" },
      expect.objectContaining({ sessionId: context.sessionId, projectRoot: context.projectRoot }),
    );
    expect(localExecutor).not.toHaveBeenCalled();
  });

  it("reads an existing gateway-local skill path locally for a remote project", async () => {
    cleanupPath = mkdtempSync(join(tmpdir(), "jait-gateway-skill-"));
    const skillPath = join(cleanupPath, "SKILL.md");
    writeFileSync(skillPath, "# Debugging\n");
    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local skill" }));
    const context = { ...createToolContext(), projectRoot: "C:\\Users\\test\\repo" };
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await expect(execute("file.read", { path: skillPath }, context)).resolves.toEqual({
      ok: true,
      message: "local skill",
    });
    expect(localExecutor).toHaveBeenCalledWith("file.read", { path: skillPath }, context, undefined);
    expect(ws.proxyToolOp).not.toHaveBeenCalled();
  });

  it("proxies non-local tools to the selected remote node", async () => {
    const onOutputChunk = vi.fn();
    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local result" }));
    const context = { ...createToolContext(), onOutputChunk };
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await expect(execute("terminal.run", { command: "pwd" }, context)).resolves.toEqual({
      ok: true,
      message: "remote result",
    });
    expect(localExecutor).not.toHaveBeenCalled();
    expect(ws.proxyToolOp).toHaveBeenCalledWith(
      remoteNode.id,
      "terminal.run",
      { command: "pwd" },
      {
        timeoutMs: 120_000,
        sessionId: context.sessionId,
        projectRoot: context.projectRoot,
        onOutputChunk,
      },
    );
  });

  it("falls back to local execution if the selected remote node disconnected", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ws = createMockWs({ findNodeByDeviceId: vi.fn(() => undefined) });
    const localExecutor = vi.fn(async () => ({ ok: true, message: "fallback result" }));
    const context = createToolContext();
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await expect(execute("terminal.run", { command: "pwd" }, context)).resolves.toEqual({
      ok: true,
      message: "fallback result",
    });
    expect(localExecutor).toHaveBeenCalledOnce();
    expect(ws.proxyToolOp).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("disconnected"));

    warnSpy.mockRestore();
  });

  it("returns a failed tool result when remote execution rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ws = createMockWs({
      proxyToolOp: vi.fn(async () => {
        throw new Error("network timeout");
      }),
    });
    const localExecutor = vi.fn(async (): Promise<ToolResult> => ({ ok: true, message: "local result" }));
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await expect(execute("terminal.run", { command: "pwd" }, createToolContext())).resolves.toEqual({
      ok: false,
      message: "Remote execution failed: network timeout",
    });
    expect(localExecutor).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("network timeout"));

    errorSpy.mockRestore();
  });
});
