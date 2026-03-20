export interface ToolOutputStreamMetadata {
  streamId: string;
  seq: number;
}

export interface ToolContext {
  sessionId: string;
  actionId: string;
  workspaceRoot: string;
  requestedBy: string;
  userId?: string;
  apiKeys?: Record<string, string>;
  /** Optional callback for streaming tool output chunks (e.g. terminal) */
  onOutputChunk?: (chunk: string, metadata?: ToolOutputStreamMetadata) => void;
  /** Optional abort signal — when fired, the tool should stop as soon as possible */
  signal?: AbortSignal;
}

export interface ToolResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

/** JSON Schema for OpenAI function-calling format */
export interface ToolParametersSchema {
  type: "object";
  properties: Record<string, ToolPropertySchema>;
  required?: string[];
}

/** JSON Schema for a single tool parameter property */
export interface ToolPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  /** For type: "array" — describes the shape of each array element */
  items?: ToolPropertySchema & { properties?: Record<string, ToolPropertySchema>; required?: string[] };
  /** For type: "object" — nested properties */
  properties?: Record<string, ToolPropertySchema>;
  /** For nested objects — which properties are required */
  required?: string[];
}

// ── Tool tiers ───────────────────────────────────────────────────────

/**
 * Tool tier determines when a tool's schema is sent to the LLM.
 *
 * - `core`     — Always included in every LLM request (~8 tools).
 *                These are the bread-and-butter tools the agent uses
 *                on nearly every interaction.
 * - `standard` — Included only when discovered via `tools.search` or
 *                `tools.list`, or when the user has not disabled them
 *                (for backward compat, standard tools are sent unless
 *                the user explicitly disables them).
 * - `external` — MCP / user-provided tools. Never auto-included;
 *                must be explicitly discovered or enabled.
 */
export type ToolTier = "core" | "standard" | "external";

/**
 * Categories group tools for the settings UI and search.
 */
export type ToolCategory =
  | "terminal"
  | "filesystem"
  | "os"
  | "surfaces"
  | "scheduler"
  | "gateway"
  | "screen"
  | "browser"
  | "web"
  | "memory"
  | "voice"
  | "agent"
  | "network"
  | "meta"
  | "external";

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  /** Tool tier — defaults to 'standard' if not set */
  tier?: ToolTier;
  /** Tool category for grouping in settings UI */
  category?: ToolCategory;
  /** Source of the tool: 'builtin' for gateway tools, 'mcp' for MCP servers */
  source?: "builtin" | "mcp";
  execute(input: TInput, context: ToolContext): Promise<ToolResult>;
}
