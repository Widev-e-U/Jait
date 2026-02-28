/**
 * Tool Registry — Sprint 3.5
 *
 * Central registry for all tool definitions. Tools are registered
 * by name and executed through a unified interface.
 */

import type { ToolDefinition, ToolContext, ToolResult } from "./contracts.js";
import type { AuditWriter } from "../services/audit.js";
import { uuidv7 } from "../lib/uuidv7.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  listNames(): string[] {
    return [...this.tools.keys()];
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool by name with audit logging.
   */
  async execute(
    name: string,
    input: unknown,
    context: ToolContext,
    audit?: AuditWriter,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, message: `Unknown tool: ${name}` };
    }

    const actionId = context.actionId || uuidv7();

    // Log start
    audit?.write({
      sessionId: context.sessionId,
      actionId,
      actionType: "tool.execute",
      toolName: name,
      inputs: input,
      status: "executing",
    });

    try {
      const result = await tool.execute(input, { ...context, actionId });

      // Log result
      audit?.write({
        sessionId: context.sessionId,
        actionId: uuidv7(), // separate audit entry for completion
        actionType: "tool.result",
        toolName: name,
        inputs: input,
        outputs: result.data,
        status: result.ok ? "completed" : "failed",
        parentActionId: actionId,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      audit?.write({
        sessionId: context.sessionId,
        actionId: uuidv7(),
        actionType: "tool.error",
        toolName: name,
        inputs: input,
        outputs: { error: message },
        status: "failed",
        parentActionId: actionId,
      });

      return { ok: false, message };
    }
  }
}
