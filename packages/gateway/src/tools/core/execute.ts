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
import { createTerminalRunTool } from "../terminal-tools.js";

interface ExecuteInput {
  /** The shell command to execute */
  command: string;
  /** A one-sentence description of what the command does (shown to the user before running) */
  explanation: string;
  /** A short description of the goal or purpose (e.g. "Install dependencies", "Start dev server") */
  goal?: string;
  /** Whether this starts a background process (server, watcher, build --watch).
   *  If true, the command runs asynchronously and you won't see the output immediately.
   *  If false (default), the command blocks until complete and returns output. */
  isBackground?: boolean;
  /** Working directory for the command (defaults to workspace root) */
  cwd?: string;
  /** Reuse a specific terminal (omit to auto-select or create) */
  terminalId?: string;
  /** Execution timeout in ms (default 30000). Use 0 for no timeout.
   *  Be conservative — give enough time for the command to complete on a slow machine. */
  timeout?: number;
}

export function createExecuteTool(registry: SurfaceRegistry): ToolDefinition<ExecuteInput> {
  // Delegate to the existing terminal.run implementation
  const inner = createTerminalRunTool(registry);

  return {
    name: "execute",
    description:
      "Run a shell command in a persistent terminal and return the output.\n\n" +
      "The terminal is visible to the user and stays alive between calls. " +
      "Use PowerShell syntax on Windows. Multi-line scripts, pipes, and complex syntax all work.\n\n" +
      "Set `isBackground: true` for long-running processes (servers, watchers, build in watch mode). " +
      "Background commands run asynchronously — you won't see output immediately but the process keeps running.\n\n" +
      "Use this for: running builds, installing packages, git operations, starting servers, " +
      "checking processes, running tests, or any shell task.\n\n" +
      "When executing non-trivial commands, explain their purpose so the user understands what's happening. " +
      "Prefer using `;` to chain commands on one line. Use `timeout: 0` for commands that may take a long time.",
    tier: "core",
    category: "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        explanation: {
          type: "string",
          description: "A one-sentence description of what the command does. Shown to the user before the command runs.",
        },
        goal: {
          type: "string",
          description: 'A short description of the goal (e.g., "Install dependencies", "Start development server").',
        },
        isBackground: {
          type: "boolean",
          description:
            "Whether this starts a background process. " +
            "If true, runs asynchronously (e.g. servers, watchers). " +
            "If false (default), blocks until complete and returns output.",
        },
        cwd: {
          type: "string",
          description: "Working directory for the command. Defaults to workspace root.",
        },
        terminalId: {
          type: "string",
          description: "Reuse a specific terminal by ID (omit to auto-select or create).",
        },
        timeout: {
          type: "number",
          description:
            "Execution timeout in milliseconds (default 30000). " +
            "Use 0 for no timeout. Be conservative — give enough time for slow machines.",
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
          cwd: input.cwd,
          // Pass background flag if the inner tool supports it
          ...(input.isBackground != null ? { isBackground: input.isBackground } : {}),
        } as any,
        context,
      );
    },
  };
}
