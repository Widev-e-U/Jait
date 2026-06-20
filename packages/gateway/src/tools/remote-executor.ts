/**
 * Remote Tool Executor — delegates tool execution to remote nodes.
 *
 * When a session's project is bound to a remote node (i.e. the
 * project path doesn't exist on the gateway), tool calls are proxied
 * to the remote node via the `tool.op-request` / `tool.op-response`
 * WS protocol instead of executing locally on the gateway.
 *
 * This solves the fundamental problem where CLI providers (Codex, Claude)
 * and built-in tools (terminal.run, file.write, etc.) need to operate
 * on the same machine where the project lives.
 *
 * ── Which tools run remotely? ─────────────────────────────────────────
 * Only tools that genuinely operate on the project's filesystem are
 * proxied to the remote node — i.e. terminal execution, file I/O, and
 * project search. These tools *must* run on the same machine as the
 * project, otherwise they'd touch the gateway's disk instead.
 *
 * Everything else (memory, cron, surfaces, web, agent, todo, jait
 * meta-tool, gateway.status, etc.) is gateway-local by nature and is
 * always executed on the gateway regardless of where the project lives.
 *
 * This is an *allow-list* (not a deny-list) so that every new tool that
 * gets added to the registry defaults to running on the gateway — the only
 * way a tool becomes remotely executable is to be explicitly listed here
 * AND implemented by every remote node handler (primary-link.ts and the
 * Electron desktop main process).
 */

import type { ToolResult, ToolContext } from "./contracts.js";
import type { WsControlPlane } from "../ws.js";
import { existsSync } from "node:fs";

/**
 * Tools that operate on the project's filesystem and therefore must be
 * proxied to the remote node where the project lives.
 *
 * Each entry here MUST be implemented by both remote node handlers:
 *  - `packages/gateway/src/services/primary-link.ts`  (headless node)
 *  - `apps/desktop/src/electron-main.ts`               (desktop app)
 *
 * Adding a tool here without implementing it on the nodes will cause a
 * "Tool 'X' is not supported for remote execution" error at runtime.
 *
 * Aliases: both the simplified core names (read/edit/execute/search) and
 * the canonical dotted names (file.read/terminal.run/…) are listed so the
 * same tool works regardless of which name the LLM emits.
 */
const REMOTE_EXECUTABLE_TOOLS = new Set<string>([
  // ── Terminal ──
  "execute",
  "terminal.run",
  "jait.terminal",
  // ── Filesystem ──
  "read",
  "file.read",
  "edit",
  "file.write",
  "file.patch",
  "file.list",
  "file.stat",
  "image.view",
  // ── Search ──
  "search",
  "file.search",
  // ── OS (runs on the project's machine) ──
  "os.query",
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
 * Returns `null` if the project is local to the gateway or no matching
 * remote node is connected.
 */
export function resolveRemoteNodeForSession(
  ws: WsControlPlane,
  projectPath: string | undefined,
): string | null {
  if (!projectPath) return null;

  // Check if the project path exists on the gateway
  // We use a lightweight sync check — existsSync is fine here since this
  // is called once per chat request, not in a hot loop.
  if (existsSync(projectPath)) return null;

  // Path doesn't exist locally — find a matching remote node
  const isWindowsPath = /^[A-Za-z]:[\\\/]/.test(projectPath);
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
 * when the session's project is on that node.
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
    // Only proxy tools that genuinely operate on the project's filesystem.
    // Everything else (memory, cron, web, agent, todo, jait meta-tool, …)
    // is gateway-local and runs on the gateway regardless of project location.
    // This allow-list also means every newly added tool defaults to local
    // execution — a tool only becomes remotely executable when explicitly
    // listed AND implemented by every remote node handler.
    if (!remoteNodeId || !REMOTE_EXECUTABLE_TOOLS.has(toolName)) {
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
          projectRoot: context.projectRoot,
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
