/**
 * Tool Registry — Sprint 3.5
 *
 * Central registry for all tool definitions. Tools are registered
 * by name and executed through a unified interface.
 */

import type {
  ToolDefinition,
  ToolContext,
  ToolResult,
  ToolTier,
  ToolCategory,
  ToolConsentLevel,
  ToolRisk,
  ToolSource,
  ToolSourceMetadata,
} from "./contracts.js";
import { buildPluginToolSourceMetadata, toPluginToolDefinition } from "../plugins/contracts.js";
import type { PluginDescriptor, PluginToolDeclaration } from "../plugins/contracts.js";
import type { AuditWriter } from "../services/audit.js";
import { uuidv7 } from "../db/uuidv7.js";
import { validateToolInput } from "./validate.js";

/** Summary of a tool for the settings UI and discovery endpoints */
export interface ToolInfo {
  name: string;
  description: string;
  tier: ToolTier;
  category: ToolCategory;
  source: ToolSource;
  sourceMetadata: ToolSourceMetadata;
  risk: ToolRisk;
  defaultConsentLevel: ToolConsentLevel;
  parameterCount: number;
}

function inferSourceMetadata(tool: Pick<ToolDefinition, "source" | "sourceMetadata">): ToolSourceMetadata {
  if (tool.sourceMetadata) return tool.sourceMetadata;
  if (tool.source?.startsWith("plugin:")) {
    const pluginId = tool.source.slice("plugin:".length);
    return {
      kind: "plugin",
      pluginId,
      pluginDisplayName: pluginId,
    };
  }
  if (tool.source === "mcp") {
    return { kind: "mcp" };
  }
  return { kind: "builtin" };
}

function inferDefaultConsentLevel(tool: Pick<ToolDefinition, "name" | "tier" | "category" | "source" | "risk">): ToolConsentLevel {
  if (tool.source?.startsWith("plugin:") || tool.source === "mcp" || tool.tier === "external") {
    return "dangerous";
  }

  switch (tool.name) {
    case "file.read":
    case "file.list":
    case "file.stat":
    case "surfaces.list":
    case "network.scan":
      return "none";
    case "file.write":
    case "file.patch":
    case "terminal.run":
    case "terminal.stream":
    case "thread.control":
      return "once";
    case "os.install":
    case "gateway.redeploy":
      return "always";
    default:
      break;
  }

  switch (tool.category) {
    case "filesystem":
      return tool.risk === "high" ? "always" : "once";
    case "terminal":
    case "os":
    case "agent":
    case "gateway":
    case "scheduler":
    case "network":
      return tool.risk === "low" ? "once" : "always";
    case "browser":
    case "web":
    case "screen":
    case "surfaces":
      return "once";
    default:
      return tool.risk === "low" ? "none" : "once";
  }
}

function inferRisk(tool: Pick<ToolDefinition, "name" | "category" | "source" | "tier">): ToolRisk {
  if (tool.source?.startsWith("plugin:") || tool.source === "mcp" || tool.tier === "external") {
    return "high";
  }

  switch (tool.name) {
    case "file.read":
    case "file.list":
    case "file.stat":
    case "surfaces.list":
    case "network.scan":
      return "low";
    case "file.write":
    case "file.patch":
    case "terminal.run":
    case "terminal.stream":
    case "thread.control":
      return "medium";
    case "os.install":
    case "gateway.redeploy":
      return "high";
    default:
      break;
  }

  switch (tool.category) {
    case "filesystem":
    case "meta":
    case "memory":
      return "low";
    case "terminal":
    case "browser":
    case "web":
    case "screen":
    case "surfaces":
    case "agent":
      return "medium";
    default:
      return "high";
  }
}

function normalizeToolDefinition(tool: ToolDefinition): ToolDefinition {
  const normalized: ToolDefinition = {
    ...tool,
    tier: tool.tier ?? "standard",
    category: tool.category ?? "external",
    source: tool.source ?? "builtin",
    sourceMetadata: inferSourceMetadata(tool),
  };
  normalized.risk = tool.risk ?? inferRisk(normalized);
  normalized.defaultConsentLevel = tool.defaultConsentLevel ?? inferDefaultConsentLevel(normalized);
  return normalized;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, normalizeToolDefinition(tool));
  }

  registerPluginTools(plugin: PluginDescriptor, tools: PluginToolDeclaration[]): void {
    const sourceMetadata = buildPluginToolSourceMetadata(plugin);
    for (const tool of tools) {
      this.register({
        ...toPluginToolDefinition(plugin, tool),
        sourceMetadata,
      });
    }
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

  /** List tools filtered by tier */
  listByTier(tier: ToolTier): ToolDefinition[] {
    return this.list().filter((t) => (t.tier ?? "standard") === tier);
  }

  /** List tools filtered by category */
  listByCategory(category: ToolCategory): ToolDefinition[] {
    return this.list().filter((t) => (t.category ?? "external") === category);
  }

  /** Search tools by name, description, or category (fuzzy keyword match) */
  search(query: string): ToolDefinition[] {
    const lower = query.toLowerCase();
    const keywords = lower.split(/\s+/).filter(Boolean);
    return this.list().filter((t) => {
      const haystack = `${t.name} ${t.description} ${t.category ?? ""} ${t.tier ?? ""}`.toLowerCase();
      return keywords.every((kw) => haystack.includes(kw));
    });
  }

  /** Get tool info summaries for all tools (lightweight, no execute fn) */
  listInfo(): ToolInfo[] {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      tier: t.tier ?? "standard",
      category: t.category ?? "external",
      source: t.source ?? "builtin",
      sourceMetadata: t.sourceMetadata ?? inferSourceMetadata(t),
      risk: t.risk ?? "medium",
      defaultConsentLevel: t.defaultConsentLevel ?? "once",
      parameterCount: Object.keys(t.parameters.properties ?? {}).length,
    }));
  }

  /** Get tool info filtered to only enabled tools for a user */
  listInfoFiltered(disabledTools?: Set<string>): ToolInfo[] {
    return this.listInfo().filter((t) => !disabledTools?.has(t.name));
  }

  /**
   * Get tools that should be sent in the initial LLM payload.
   * Only core-tier tools (~10) are included. Standard and external tools
   * are discovered dynamically via tools.search / tools.list meta-tools.
   */
  listForLLM(disabledTools?: Set<string>): ToolDefinition[] {
    return this.list().filter((t) => {
      if (disabledTools?.has(t.name)) return false;
      const tier = t.tier ?? "standard";
      // Only core tools in the initial payload (~10 tools)
      // Standard tools are discovered via tools.search / tools.list
      // External (MCP) tools must also be discovered via tools.search
      return tier === "core";
    });
  }

  /**
   * Check if a tool is executable (registered and not disabled).
   * Even discovered external tools can be executed if they're registered.
   * The disabled check only gates what's sent to the LLM, not execution.
   */
  isExecutable(name: string, disabledTools?: Set<string>): boolean {
    if (!this.tools.has(name)) return false;
    if (disabledTools?.has(name)) return false;
    return true;
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

    // ── Input validation (fast-reject bad LLM arguments) ──
    const validation = validateToolInput(tool.parameters, input);
    if (!validation.valid) {
      const errorMsg = `Input validation failed: ${validation.errors.join("; ")}`;
      audit?.write({
        sessionId: context.sessionId,
        actionId,
        actionType: "tool.validation_error",
        toolName: name,
        inputs: input,
        outputs: { errors: validation.errors },
        status: "failed",
      });
      return { ok: false, message: errorMsg };
    }

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
