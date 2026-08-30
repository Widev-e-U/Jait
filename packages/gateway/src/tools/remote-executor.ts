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
import { isGatewayLocalPathOutsideProject } from "./core/get-fs.js";
import { resolveCommandTimeoutMs } from "../lib/command-timeout.js";

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

/** Subset of the allow-list that runs shell commands and honours `isBackground`. */
const REMOTE_TERMINAL_TOOLS = new Set<string>(["execute", "terminal.run", "jait.terminal"]);

function isBackgroundInput(input: unknown): boolean {
  return Boolean(input && typeof input === "object" && (input as { isBackground?: unknown }).isBackground === true);
}

/** Extra transport wait on top of the node-side command timeout (RPC overhead). */
const PROXY_TERMINAL_GRACE_MS = 30_000;

/** Transport wait for proxied non-terminal tools and background commands. */
const PROXY_DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Transport-level wait for a proxied tool call.
 *
 * Foreground terminal commands may legitimately run up to the command
 * timeout cap; the node enforces `resolveCommandTimeoutMs` on its side, so
 * the gateway waits for that resolved budget plus a small round-trip grace.
 * The result is always finite — there is no "wait forever" mode here either.
 */
export function proxyTimeoutMs(toolName: string, input: unknown): number {
  if (REMOTE_TERMINAL_TOOLS.has(toolName) && !isBackgroundInput(input)) {
    const requested = input && typeof input === "object"
      ? (input as { timeout?: unknown }).timeout
      : undefined;
    return resolveCommandTimeoutMs(requested) + PROXY_TERMINAL_GRACE_MS;
  }
  return PROXY_DEFAULT_TIMEOUT_MS;
}

/**
 * Whether the node confirmed it will report this command's completion.
 * Nodes that predate the completion channel simply omit the flag.
 */
function nodeAcceptedBackgroundCommand(result: ToolResult): boolean {
  const data = result.data;
  if (!data || typeof data !== "object") return false;
  return (data as { watched?: unknown }).watched === true;
}

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
  /** Explicit node binding from the project record — takes priority over path heuristics */
  projectNodeId?: string | null,
): string | null {
  // If the project is explicitly bound to a non-gateway node, use that directly.
  // This avoids the existsSync ambiguity when both the gateway and a remote node
  // share the same path prefix (e.g. both have /home/alice).
  if (projectNodeId && projectNodeId !== "gateway") {
    // Verify the node is still connected
    const node = ws.findNodeByDeviceId(projectNodeId);
    if (node) return projectNodeId;
    // Node disconnected — fall through to heuristic
  }

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

    // Terminal tools are still executed by the gateway tool implementation,
    // but with the owning node attached to the context. That implementation
    // creates a RemoteTerminalSurface, so the command runs on the node while
    // remaining a persistent, user-visible Jait terminal. Proxying these via
    // tool.op-request would use the node's hidden one-shot child process.
    if (REMOTE_TERMINAL_TOOLS.has(toolName)) {
      const node = ws.findNodeByDeviceId(remoteNodeId);
      if (!node) {
        return {
          ok: false,
          message: `Project node ${remoteNodeId} is disconnected; terminal command was not run`,
        };
      }
      return localExecutor(
        toolName,
        input,
        { ...context, executionNodeId: remoteNodeId },
        execOptions,
      );
    }

    // Installed skills and other gateway-owned absolute files are outside a
    // remote project filesystem. Sending a POSIX path to a Windows node
    // otherwise produces a bogus C:\\home\\... path.
    if ((toolName === "read" || toolName === "file.read") && input && typeof input === "object") {
      const targetPath = (input as { path?: unknown }).path;
      if (typeof targetPath === "string" && isGatewayLocalPathOutsideProject(targetPath, context.projectRoot)) {
        return localExecutor(toolName, input, context, execOptions);
      }
    }

    // Check that the remote node is still connected
    const node = ws.findNodeByDeviceId(remoteNodeId);
    if (!node) {
      console.warn(`[remote-executor] Node ${remoteNodeId} disconnected, falling back to local execution`);
      return localExecutor(toolName, input, context, execOptions);
    }

    // Background commands return as soon as the node spawns them, so the node
    // pushes the result back later against this id. Reserve it before dispatch
    // — a command that exits immediately would otherwise report completion
    // before the gateway knew to expect it.
    const backgroundCommand = REMOTE_TERMINAL_TOOLS.has(toolName) && isBackgroundInput(input)
      ? String((input as { command?: unknown }).command ?? "")
      : null;
    const backgroundId = backgroundCommand === null
      ? undefined
      : ws.registerRemoteBackgroundCommand({
          nodeId: remoteNodeId,
          sessionId: context.sessionId,
          command: backgroundCommand,
        });

    // Delegate to the remote node
    try {
      const result = await ws.proxyToolOp<ToolResult>(
        remoteNodeId,
        toolName,
        input as Record<string, unknown>,
        {
          timeoutMs: proxyTimeoutMs(toolName, input),
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          onOutputChunk: context.onOutputChunk,
          ...(backgroundId ? { backgroundId } : {}),
        },
      );
      // An older node that ignores `backgroundId` never reports back, so don't
      // hold the slot (and don't let the agent think it will be notified).
      if (backgroundId && !nodeAcceptedBackgroundCommand(result)) {
        ws.unregisterRemoteBackgroundCommand(backgroundId);
        return {
          ...result,
          message:
            `${result.message} (This node does not report background command completion — `
            + "you will NOT be notified when it finishes, so check on it yourself.)",
        };
      }
      return result;
    } catch (err) {
      if (backgroundId) ws.unregisterRemoteBackgroundCommand(backgroundId);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[remote-executor] Remote tool '${toolName}' failed on node ${remoteNodeId}: ${message}`);
      return { ok: false, message: `Remote execution failed: ${message}` };
    }
  };
}
