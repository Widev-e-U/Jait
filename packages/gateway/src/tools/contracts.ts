export interface ToolContext {
  sessionId: string;
  actionId: string;
  workspaceRoot: string;
  requestedBy: string;
}

export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}
