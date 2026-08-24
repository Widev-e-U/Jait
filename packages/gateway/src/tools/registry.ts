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
  ToolDiscoveryMetadata,
} from "./contracts.js";
import { buildPluginToolSourceMetadata, toPluginToolDefinition } from "../plugins/contracts.js";
import type { PluginDescriptor, PluginToolDeclaration } from "../plugins/contracts.js";
import type { AuditWriter } from "../services/audit.js";
import { uuidv7 } from "../db/uuidv7.js";
import { validateToolInput } from "./validate.js";

/** Summary of a tool for the settings UI and discovery endpoints */
export interface ToolInfo {
  name: string;
  /** Human-friendly display name advertised by the tool (falls back to `name`). */
  displayName?: string;
  description: string;
  tier: ToolTier;
  category: ToolCategory;
  source: ToolSource;
  sourceMetadata: ToolSourceMetadata;
  risk: ToolRisk;
  defaultConsentLevel: ToolConsentLevel;
  parameterCount: number;
  discovery?: ToolDiscoveryMetadata;
}

export interface RankedToolMatch {
  tool: ToolDefinition;
  score: number;
  matchedTerms: string[];
}

export interface ToolSearchOptions {
  candidates?: ToolDefinition[];
  disabledTools?: Set<string>;
  limit?: number;
}

export const MCP_EXPOSED_CORE_TOOL_NAMES = new Set([
  "todo",
  "jait.todos",
  "jait.terminal",
  "user.ask",
  "tools.list",
  "tools.search",
]);

const SEARCH_STOP_WORDS = new Set([
  "a", "an", "and", "can", "could", "do", "for", "from", "i", "in", "me", "my",
  "of", "on", "please", "the", "to", "use", "want", "with", "you",
]);

const SEARCH_SYNONYMS: Record<string, string[]> = {
  app: ["application", "web", "preview"],
  ask: ["question", "clarify", "choice", "decision"],
  conversation: ["chat", "session", "history", "message"],
  deploy: ["release", "publish", "redeploy"],
  machine: ["host", "server", "remote", "ssh"],
  open: ["show", "view", "preview", "display"],
  previous: ["prior", "history", "session", "chat"],
  remember: ["memory", "preference", "recall"],
  show: ["open", "view", "preview", "display"],
  site: ["web", "browser", "preview", "application"],
};

function normalizeSearchText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:/-]+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeSearchText(value: string): string[] {
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 3 || right.length < 3) return 0;
  const leftPairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index++) {
    const pair = left.slice(index, index + 2);
    leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < right.length - 1; index++) {
    const pair = right.slice(index, index + 2);
    const remaining = leftPairs.get(pair) ?? 0;
    if (remaining > 0) {
      overlap++;
      leftPairs.set(pair, remaining - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length - 2);
}

function bestFuzzyScore(term: string, tokens: Set<string>): number {
  let best = 0;
  for (const token of tokens) best = Math.max(best, diceCoefficient(term, token));
  return best;
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

  /**
   * Remove a tool from the registry by name. Returns true if a tool was
   * actually removed, false if no tool with that name was registered.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
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

  /** Rank tools using weighted lexical, synonym, and fuzzy matching. */
  rankSearch(query: string, options: ToolSearchOptions = {}): RankedToolMatch[] {
    const originalTerms = [...new Set(tokenizeSearchText(query))];
    if (originalTerms.length === 0) return [];

    const candidates = options.candidates ?? this.list();
    const matches: RankedToolMatch[] = [];
    for (const tool of candidates) {
      if (options.disabledTools?.has(tool.name)) continue;

      const nameTokens = new Set(tokenizeSearchText(tool.name));
      const metadataText = [
        tool.displayName,
        tool.category,
        tool.tier,
        tool.sourceMetadata?.kind === "mcp" ? tool.sourceMetadata.serverName : undefined,
        ...(tool.discovery?.aliases ?? []),
        ...(tool.discovery?.capabilities ?? []),
      ].filter((value): value is string => Boolean(value)).join(" ");
      const metadataTokens = new Set(tokenizeSearchText(metadataText));
      const descriptionText = [tool.description, ...(tool.discovery?.examples ?? [])].join(" ");
      const descriptionTokens = new Set(tokenizeSearchText(descriptionText));
      const normalizedCorpus = normalizeSearchText(`${tool.name} ${metadataText} ${descriptionText}`);
      const matchedTerms: string[] = [];
      let score = tool.discovery?.priority ?? 0;

      for (const originalTerm of originalTerms) {
        const expandedTerms = [originalTerm, ...(SEARCH_SYNONYMS[originalTerm] ?? [])];
        let termScore = 0;
        for (let index = 0; index < expandedTerms.length; index++) {
          const term = expandedTerms[index]!;
          const weight = index === 0 ? 1 : 0.55;
          if (nameTokens.has(term)) termScore = Math.max(termScore, 24 * weight);
          else if (metadataTokens.has(term)) termScore = Math.max(termScore, 14 * weight);
          else if (descriptionTokens.has(term)) termScore = Math.max(termScore, 7 * weight);
          else if (normalizedCorpus.includes(term)) termScore = Math.max(termScore, 4 * weight);
          else {
            const fuzzy = Math.max(
              bestFuzzyScore(term, nameTokens),
              bestFuzzyScore(term, metadataTokens),
              bestFuzzyScore(term, descriptionTokens),
            );
            if (fuzzy >= 0.72) termScore = Math.max(termScore, fuzzy * 3 * weight);
          }
        }
        if (termScore > 0) {
          score += termScore;
          matchedTerms.push(originalTerm);
        }
      }

      if (matchedTerms.length === 0) continue;
      score += (matchedTerms.length / originalTerms.length) * 12;
      const normalizedQuery = normalizeSearchText(query);
      if (normalizedQuery.length > 2 && normalizedCorpus.includes(normalizedQuery)) score += 30;
      matches.push({ tool, score, matchedTerms });
    }

    matches.sort((left, right) => right.score - left.score || left.tool.name.localeCompare(right.tool.name));
    return options.limit ? matches.slice(0, options.limit) : matches;
  }

  /** Search tools in ranked relevance order. */
  search(query: string, options: ToolSearchOptions = {}): ToolDefinition[] {
    return this.rankSearch(query, options).map((match) => match.tool);
  }

  /** Select deferred tools that are relevant to the current user request. */
  selectForLLM(query: string, disabledTools?: Set<string>, limit = 10): ToolDefinition[] {
    return this.search(query, {
      disabledTools,
      limit,
      candidates: this.list().filter((tool) => (tool.tier ?? "standard") !== "core"),
    });
  }

  /** Tools intentionally exposed to external MCP clients. */
  listForMcp(disabledTools?: Set<string>): ToolDefinition[] {
    return this.list().filter((tool) => {
      if (disabledTools?.has(tool.name)) return false;
      const source = tool.source ?? "builtin";
      const tier = tool.tier ?? "standard";
      if (source.startsWith("plugin:")) return true;
      if (MCP_EXPOSED_CORE_TOOL_NAMES.has(tool.name)) return true;
      return source === "builtin" && tier !== "core";
    });
  }

  /** Get tool info summaries for all tools (lightweight, no execute fn) */
  listInfo(): ToolInfo[] {
    return this.list().map((t) => ({
      name: t.name,
      displayName: t.displayName,
      description: t.description,
      tier: t.tier ?? "standard",
      category: t.category ?? "external",
      source: t.source ?? "builtin",
      sourceMetadata: t.sourceMetadata ?? inferSourceMetadata(t),
      risk: t.risk ?? "medium",
      defaultConsentLevel: t.defaultConsentLevel ?? "once",
      parameterCount: Object.keys(t.parameters.properties ?? {}).length,
      discovery: t.discovery,
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
