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

/** Race a promise against an AbortSignal — rejects with "Cancelled" if aborted first */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("Cancelled"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("Cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

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
    description: "Execute a shell command in a terminal and return the output. Use this to run any CLI command (git, npm, powershell, etc).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
        terminalId: { type: "string", description: "Optional terminal ID to reuse; omit to auto-select" },
        timeout: { type: "number", description: "Execution timeout in ms (default 30000)" },
      },
      required: ["command"],
    },
    async execute(input: TerminalRunInput, context: ToolContext): Promise<ToolResult> {
      const { command, timeout = 30000 } = input;
      const termId = input.terminalId ?? `term-${context.sessionId}-default`;

      // Early cancellation check
      if (context.signal?.aborted) {
        return { ok: false, message: "Cancelled" };
      }

      // Find or create a terminal for this session
      let surface = registry.getSurface(termId) as TerminalSurface | undefined;
      if (!surface || surface.state !== "running") {
        surface = (await registry.startSurface("terminal", termId, {
          sessionId: context.sessionId,
          workspaceRoot: context.workspaceRoot,
        })) as TerminalSurface;
      }

      try {
        // Race the tool execution against the abort signal
        const result = await (context.signal
          ? raceAbort(surface.execute(command, timeout, context.onOutputChunk), context.signal)
          : surface.execute(command, timeout, context.onOutputChunk));
        console.log(`[terminal.run] output (${result.length} chars): ${JSON.stringify(result.slice(0, 500))}`);
        return {
          ok: true,
          message: `Command executed successfully`,
          data: { output: result || "(no output)", terminalId: termId },
        };
      } catch (err) {
        if (context.signal?.aborted) return { ok: false, message: "Cancelled", data: { terminalId: termId } };
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
    description: "Start a new streaming terminal session (output sent via WebSocket). Use when you need an interactive terminal.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session to attach the terminal to" },
        workspaceRoot: { type: "string", description: "Working directory for the terminal" },
        cols: { type: "number", description: "Terminal width in columns" },
        rows: { type: "number", description: "Terminal height in rows" },
      },
      required: ["sessionId"],
    },
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
