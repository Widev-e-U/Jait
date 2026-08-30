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
   *  If false (default), the command blocks until complete and returns output. */
  isBackground?: boolean;
  /** Working directory for the command (defaults to project root) */
  cwd?: string;
  /** Reuse a specific terminal (omit to auto-select or create) */
  terminalId?: string;
  /** Execution timeout in ms. Always finite: 0 / negative falls back to the
   *  1-hour default; values above the 24-hour cap are clamped. There is no
   *  run-without-timeout mode. */
  timeout?: number;
  /** Run inside Docker sandbox container */
  sandbox?: boolean;
  /** Sandbox mount mode when sandbox is enabled */
  sandboxMountMode?: "none" | "read-only" | "read-write";
}

export function createExecuteTool(
  registry: SurfaceRegistry,
  secretInput?: SecretInputService,
  ws?: WsControlPlane,
): ToolDefinition<ExecuteInput> {
  // Delegate to the existing terminal.run implementation
  const inner = createTerminalRunTool(registry, undefined, ws, secretInput);

  return {
    name: "execute",
    description:
      "Run a shell command in a persistent terminal visible to the user. " +
      "Wait for every finite one-shot command — including builds, tests, installs, OCR, downloads, and scripts — to complete. " +
      "Every command is bounded by a finite timeout — 1 hour by default; you may raise `timeout` (up to 24 hours), but the guard can never be disabled. " +
      "Set isBackground: true only for indefinite processes such as servers, watchers, and daemons.",
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
          description: "True to start the command without blocking. Use only for indefinite processes such as servers, watchers, and daemons. Keep false for finite one-shot commands; raising `timeout` (up to 24 hours) is the way to wait longer.",
        },
        cwd: {
          type: "string",
          description: "Working directory (defaults to project root).",
        },
        terminalId: {
          type: "string",
          description: "Reuse a specific terminal by ID.",
        },
        timeout: {
          type: "number",
          description: "Timeout in ms. Always finite — 1 hour by default; 0/negative falls back to the default, and anything above 24 hours is clamped. The timeout guard cannot be disabled.",
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
