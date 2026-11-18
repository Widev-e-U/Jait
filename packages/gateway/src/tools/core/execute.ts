/**
 * execute — Run shell commands in a persistent terminal.
 *
 * Inspired by VS Code Copilot's run_in_terminal:
 * - `isBackground` for long-running processes (servers, watchers)
 * - `explanation` for human-readable display of what the command does
 * - `goal` for short description shown in UI before the command runs
 * - `cwd` for setting working directory
 * - `timeout` with sensible defaults
 *
 * The terminal is visible to the user and persists between calls.
 */

import type { ToolDefinition, ToolResult, ToolContext } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import { createTerminalRunTool, type AgentEnvResolver } from "../terminal-tools.js";
import type { SecretInputService } from "../../services/secret-input.js";
import type { WsControlPlane } from "../../ws.js";

interface ExecuteInput {
  /** The shell command to execute */
  command: string;
  /** A one-sentence description of what the command does (shown to the user before running) */
  explanation: string;
  /** A short description of the goal or purpose (e.g. "Install dependencies", "Start dev server") */
  goal?: string;
  /** Whether this starts a background process (server, watcher, build --watch).
   *  If true, the command runs asynchronously and you won't see the output immediately.
   *  Otherwise it returns completed output or yields with a tracked execution. */
  isBackground?: boolean;
  /** Working directory for the command (defaults to project root) */
  cwd?: string;
  /** Reuse a specific terminal (omit to auto-select or create) */
  terminalId?: string;
  /** Execution timeout in ms. Always finite: 0 / negative falls back to the
   *  1-hour default; values above the 24-hour cap are clamped. There is no
   *  run-without-timeout mode. */
  timeout?: number;
  yieldTimeMs?: number;
  /** Run inside Docker sandbox container */
  sandbox?: boolean;
  /** Sandbox mount mode when sandbox is enabled */
  sandboxMountMode?: "none" | "read-only" | "read-write";
  /** Run on another connected device instead of this chat's machine */
  nodeId?: string;
}

export function createExecuteTool(
  registry: SurfaceRegistry,
  secretInput?: SecretInputService,
  ws?: WsControlPlane,
  resolveAgentEnv?: AgentEnvResolver,
): ToolDefinition<ExecuteInput> {
  // Delegate to the existing terminal.run implementation
  const inner = createTerminalRunTool(registry, undefined, ws, secretInput, resolveAgentEnv);

  return {
    name: "execute",
    description:
      "Run a shell command in a persistent terminal visible to the user. " +
      "Commands yield after a short initial wait with partial output, terminalId and executionId; completion resumes you automatically. Inspect progress or cancel with terminal.execution; do not rerun a running command. " +
      "Every command is bounded by a finite timeout — 1 hour by default; you may raise `timeout` (up to 24 hours), but the guard can never be disabled. " +
      "Set isBackground: true for an earlier startup snapshot, useful for servers and watchers. " +
      "By default commands run on the machine that owns this chat's project. Pass nodeId to run on another connected device (for example a Windows PC); use computer.targets to list node ids, and nodeId \"gateway\" to force execution on the gateway host.",
    tier: "core",
    category: "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to run.",
        },
        explanation: {
          type: "string",
          description: "What the command does (shown to user).",
        },
        goal: {
          type: "string",
          description: "Short goal label for UI.",
        },
        isBackground: {
          type: "boolean",
          description: "Return after startup output settles. Useful for servers and watchers; finite jobs also yield automatically after yieldTimeMs.",
        },
        cwd: {
          type: "string",
          description: "Working directory (defaults to project root).",
        },
        terminalId: {
          type: "string",
          description: "Reuse a specific terminal by ID.",
        },
        yieldTimeMs: { type: "number", description: "Initial wait in ms: default 10000, maximum 30000. Zero yields immediately. Returns a running execution if not finished." },
        timeout: {
          type: "number",
          description: "Execution deadline in ms, separate from yieldTimeMs. Default 1 hour, maximum 24 hours. Expiry stops the execution; 0/negative uses the default.",
        },
        sandbox: {
          type: "boolean",
          description: "Run inside Docker sandbox container.",
        },
        sandboxMountMode: {
          type: "string",
          description: "Sandbox mount mode: none, read-only, read-write.",
          enum: ["none", "read-only", "read-write"],
        },
        nodeId: {
          type: "string",
          description: "Run on another connected device by node id (see computer.targets). \"gateway\" forces the gateway host, which is the default here.",
        },
      },
      required: ["command", "explanation"],
    },
    async execute(input: ExecuteInput, context: ToolContext): Promise<ToolResult> {
      // Forward all params to the inner terminal.run tool
      return inner.execute(
        {
          command: input.command,
          terminalId: input.terminalId,
          timeout: input.timeout,
          yieldTimeMs: input.yieldTimeMs,
          cwd: input.cwd,
          sandbox: input.sandbox,
          sandboxMountMode: input.sandboxMountMode,
          // Pass background flag if the inner tool supports it
          ...(input.isBackground != null ? { isBackground: input.isBackground } : {}),
        } as any,
        context,
      );
    },
  };
}
