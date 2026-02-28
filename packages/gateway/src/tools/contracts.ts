export interface ToolContext {
  sessionId: string;
  actionId: string;
  workspaceRoot: string;
  requestedBy: string;
  /** Optional callback for streaming tool output chunks (e.g. terminal) */
  onOutputChunk?: (chunk: string) => void;
}

export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

/** JSON Schema for OpenAI function-calling format */
export interface ToolParametersSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}
