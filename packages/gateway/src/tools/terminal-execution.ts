import { backgroundCommandMonitor } from "../services/background-command-monitor.js";
import type { ToolDefinition } from "./contracts.js";

export function createTerminalExecutionTool(): ToolDefinition<{
  action: "inspect" | "cancel"; terminalId: string; executionId: string;
}> {
  return {
    name: "terminal.execution",
    description: "Inspect partial output or cancel a tracked terminal command from this session. Use the terminalId and executionId returned by execute or jait.terminal. Inspection does not rerun the command. Completion is reported automatically; inspect when progress is needed, rather than polling in a loop.",
    tier: "standard", category: "terminal", source: "builtin",
    parameters: {
      type: "object", required: ["action", "terminalId", "executionId"],
      properties: {
        action: { type: "string", enum: ["inspect", "cancel"] },
        terminalId: { type: "string" }, executionId: { type: "string" },
      },
    },
    async execute(input, context) {
      const result = input.action === "cancel"
        ? backgroundCommandMonitor.cancelExecution(context.sessionId, input.terminalId, input.executionId)
        : backgroundCommandMonitor.inspectExecution(context.sessionId, input.terminalId, input.executionId);
      return result
        ? { ok: true, message: `Command ${result.status}`, data: result }
        : { ok: false, message: "Tracked execution not found in this session (or expired)." };
    },
  };
}
