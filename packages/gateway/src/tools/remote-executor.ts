/**
 * Remote Tool Executor — delegates tool execution to remote nodes.
 *
 * When a session's workspace is bound to a remote node (i.e. the
 * workspace path doesn't exist on the gateway), tool calls are proxied
 * to the remote node via the `tool.op-request` / `tool.op-response`
 * WS protocol instead of executing locally on the gateway.
 *
 * This solves the fundamental problem where CLI providers (Codex, Claude)
 * and built-in tools (terminal.run, file.write, etc.) need to operate
 * on the same machine where the workspace lives.
 *
 * Tools that are gateway-local by nature (e.g. surfaces.list, cron.*,
 * gateway.status) are always executed locally regardless of the workspace
 * binding.
 */

import type { ToolResult, ToolContext } from "./contracts.js";
import type { WsControlPlane } from "../ws.js";

/** Tools that always run on the gateway regardless of workspace location */
const GATEWAY_LOCAL_TOOLS = new Set([
  "surfaces.list",
  "surfaces.start",
  "surfaces.stop",
  "cron.add",
  "cron.list",
  "cron.update",
  "cron.remove",
  "gateway.status",
  "tools.search",
  "tools.list",
  "memory.read",
  "memory.write",
  "memory.list",
  "memory.search",
  "voice.say",
  "voice.listen",
  "screen.share",
  "screen.stop",
  "notification.send",
]);

export interface RemoteToolExecutorOptions {
  ws: WsControlPlane;
  /** Local executor — called when the tool should run on the gateway */
  localExecutor: (
    toolName: string,
    input: unknown,
    context: ToolContext,
    options?: { dryRun?: boolean; consentTimeoutMs?: number },
  ) => Promise<ToolResult>;
}

/**
 * Resolve which node ID (if any) should execute tools for a given session.
 *
 * Returns `null` if the workspace is local to the gateway or no matching
 * remote node is connected.
 */
export function resolveRemoteNodeForSession(
  ws: WsControlPlane,
  workspacePath: string | undefined,
): string | null {
  if (!workspacePath) return null;

  // Check if the workspace path exists on the gateway
  // We use a lightweight sync check — existsSync is fine here since this
  // is called once per chat request, not in a hot loop.
  try {
    const { existsSync } = require("node:fs");
    if (existsSync(workspacePath)) return null;
  } catch {
    return null;
  }

  // Path doesn't exist locally — find a matching remote node
  const isWindowsPath = /^[A-Za-z]:[\\\/]/.test(workspacePath);
  const expectedPlatform = isWindowsPath ? "windows" : null;

  for (const node of ws.getFsNodes()) {
    if (node.isGateway) continue;
    if (expectedPlatform && node.platform !== expectedPlatform) continue;
    return node.id;
  }

  return null;
}

/**
 * Create a tool executor that transparently delegates to a remote node
 * when the session's workspace is on that node.
 *
 * If `remoteNodeId` is null, all calls go to the local executor.
 */
export function createRemoteToolExecutor(
  options: RemoteToolExecutorOptions,
  remoteNodeId: string | null,
): (
  toolName: string,
  input: unknown,
  context: ToolContext,
  execOptions?: { dryRun?: boolean; consentTimeoutMs?: number },
) => Promise<ToolResult> {
  const { ws, localExecutor } = options;

  return async (toolName, input, context, execOptions) => {
    // Always execute gateway-local tools locally
    if (!remoteNodeId || GATEWAY_LOCAL_TOOLS.has(toolName)) {
      return localExecutor(toolName, input, context, execOptions);
    }

    // Check that the remote node is still connected
    const node = ws.findNodeByDeviceId(remoteNodeId);
    if (!node) {
      console.warn(`[remote-executor] Node ${remoteNodeId} disconnected, falling back to local execution`);
      return localExecutor(toolName, input, context, execOptions);
    }

    // Delegate to the remote node
    try {
      const result = await ws.proxyToolOp<ToolResult>(
        remoteNodeId,
        toolName,
        input as Record<string, unknown>,
        {
          timeoutMs: 120_000,
          sessionId: context.sessionId,
          workspaceRoot: context.workspaceRoot,
          onOutputChunk: context.onOutputChunk,
        },
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[remote-executor] Remote tool '${toolName}' failed on node ${remoteNodeId}: ${message}`);
      return { ok: false, message: `Remote execution failed: ${message}` };
    }
  };
}
