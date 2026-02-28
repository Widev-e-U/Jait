/**
 * Terminal Tools — Sprint 3.5
 *
 * terminal.run  — execute a command and return output
 * terminal.stream — start streaming terminal to WS
 */

import type { ToolDefinition, ToolContext, ToolResult } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { TerminalSurface } from "../surfaces/terminal.js";
import { uuidv7 } from "../lib/uuidv7.js";

interface TerminalRunInput {
  command: string;
  sessionId?: string;
  terminalId?: string;
  timeout?: number;
}

interface TerminalStreamInput {
  sessionId: string;
  workspaceRoot?: string;
  cols?: number;
  rows?: number;
}

export function createTerminalRunTool(registry: SurfaceRegistry): ToolDefinition<TerminalRunInput> {
  return {
    name: "terminal.run",
    description: "Execute a shell command in a terminal and return the output",
    async execute(input: TerminalRunInput, context: ToolContext): Promise<ToolResult> {
      const { command, timeout = 30000 } = input;
      const termId = input.terminalId ?? `term-${context.sessionId}-default`;

      // Find or create a terminal for this session
      let surface = registry.getSurface(termId) as TerminalSurface | undefined;
      if (!surface || surface.state !== "running") {
        surface = (await registry.startSurface("terminal", termId, {
          sessionId: context.sessionId,
          workspaceRoot: context.workspaceRoot,
        })) as TerminalSurface;
      }

      try {
        const output = await surface.execute(command, timeout);
        return {
          ok: true,
          message: `Command executed successfully`,
          data: { output, terminalId: termId },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Command failed",
          data: { terminalId: termId },
        };
      }
    },
  };
}

export function createTerminalStreamTool(registry: SurfaceRegistry): ToolDefinition<TerminalStreamInput> {
  return {
    name: "terminal.stream",
    description: "Start a new streaming terminal session (output sent via WebSocket)",
    async execute(input: TerminalStreamInput, context: ToolContext): Promise<ToolResult> {
      const termId = `term-${uuidv7()}`;
      const workspaceRoot = input.workspaceRoot ?? context.workspaceRoot;

      const surface = await registry.startSurface("terminal", termId, {
        sessionId: input.sessionId || context.sessionId,
        workspaceRoot,
      });

      return {
        ok: true,
        message: `Terminal started: ${termId}`,
        data: {
          terminalId: termId,
          ...surface.snapshot(),
        },
      };
    },
  };
}
