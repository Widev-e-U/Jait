/**
 * Prompt Registry — per-model prompt resolution for Jait.
 *
 * Modelled after VS Code Copilot Chat's PromptRegistry pattern.
 * Each model family registers a resolver with model-specific system
 * prompts, reminder instructions, identity rules, and safety rules.
 *
 * Resolution order:
 *  1. matchesModel() matchers (most specific)
 *  2. familyPrefixes prefix matching
 *  3. Falls back to the default resolver (last registered)
 */

import type { ChatMode } from "../chat-modes.js";
import { getResponseStyleInstructions, type ResponseStyle, JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS } from "./shared-sections.js";

// ── Interfaces ───────────────────────────────────────────────────────

export interface ModelEndpoint {
  model: string;
  baseUrl: string;
  /** Backend provider label (e.g. "openai", "ollama", "openrouter") */
  backend?: string;
}

export interface IAgentPrompt {
  name: string;
  familyPrefixes: string[];
  matchesModel?(endpoint: ModelEndpoint): boolean;
  resolveSystemPrompt(mode: ChatMode, endpoint: ModelEndpoint): string;
  resolveReminderInstructions?(mode: ChatMode, endpoint: ModelEndpoint): string | null;
  resolveIdentityRules?(endpoint: ModelEndpoint): string | null;
  resolveSafetyRules?(endpoint: ModelEndpoint): string | null;
  /**
   * Marks this resolver as backing Jait's *internal* provider — i.e. the model
   * runs natively inside Jait's agent loop with Jait tools registered directly,
   * so there is no provider-native shell-command fallback to steer away from.
   *
   * When true, `buildSystemPrompt` omits the `<jaitExternalProvider>` wrapper
   * block (which is only relevant for external CLI providers like codex /
   * claude-code). The resolver's own system prompt is expected to carry the
   * tool-use / search-discovery instructions the model needs.
   */
  isInternalJaitProvider?: boolean;
}

// ── Default fragments ────────────────────────────────────────────────

export const DEFAULT_IDENTITY = `Your name is Jait — Just Another Intelligent Tool. You are an AI coding assistant.`;

export const DEFAULT_SAFETY = `Follow the user's requirements carefully & to the letter.
If you are asked to generate content that is harmful, hateful, racist, sexist, lewd, or violent, only respond with "Sorry, I can't assist with that."
Avoid content that violates copyrights.`;

export const DEFAULT_REMINDER = `[REMINDER] Send a brief progress update to the user before your next tool calls. If you have a todo list, update it now. Keep going until the task is fully resolved.`;

// ── Registry singleton ───────────────────────────────────────────────

class PromptRegistry {
  private resolvers: IAgentPrompt[] = [];

  register(resolver: IAgentPrompt): void {
    this.resolvers.unshift(resolver);
  }

  resolve(endpoint: ModelEndpoint): IAgentPrompt {
    const modelLower = endpoint.model.toLowerCase();

    for (const r of this.resolvers) {
      if (r.matchesModel?.(endpoint)) return r;
    }

    for (const r of this.resolvers) {
      for (const prefix of r.familyPrefixes) {
        if (modelLower.startsWith(prefix.toLowerCase())) return r;
      }
    }

    return this.resolvers[this.resolvers.length - 1]!;
  }

  listResolvers(): string[] {
    return this.resolvers.map((r) => r.name);
  }
}

export const promptRegistry = new PromptRegistry();

import type { Skill } from "../../skills/index.js";
import { formatSkillsForPrompt } from "../../skills/index.js";

// ── Helpers ──────────────────────────────────────────────────────────

export interface PromptContext {
  /** The resolved project root for the current session (if any) */
  projectRoot?: string;
  /** Enabled skills to inject into the system prompt */
  skills?: Skill[];
  /** Saved project architecture graph (Mermaid) to help the agent understand the codebase */
  architectureGraph?: string;
  /** Optional response style override for this session */
  responseStyle?: ResponseStyle;
  /** Backend provider label — used to select lighter prompts for local models */
  backend?: string;
  /** Runtime environment context (OS, shell, hostname) */
  platform?: string;
  shell?: string;
  hostname?: string;
}

export function buildSystemPrompt(mode: ChatMode, endpoint: ModelEndpoint, ctx?: PromptContext): string {
  const resolver = promptRegistry.resolve(endpoint);
  const isLocalModel = ctx?.backend === "ollama" || endpoint.backend === "ollama";
  // Internal Jait providers (e.g. GLM via OpenRouter / BigModel OpenAI-compatible
  // API) run natively inside Jait's agent loop with Jait tools registered directly.
  // They have no provider-native shell-command fallback, so the
  // `<jaitExternalProvider>` wrapper block (which steers external CLI providers
  // toward Jait tools) is irrelevant and would just waste tokens / mislead.
  const isInternalJait = resolver.isInternalJaitProvider === true;

  let prompt: string;
  if (isLocalModel) {
    // Minimal prompt for local / slow models — skip identity, safety, and wrapper blocks
    prompt = resolver.resolveSystemPrompt(mode, endpoint);
    if (ctx?.projectRoot) {
      prompt += `\nProject: ${ctx.projectRoot}`;
    }
  } else {
    const identity = resolver.resolveIdentityRules?.(endpoint) ?? DEFAULT_IDENTITY;
    const safety = resolver.resolveSafetyRules?.(endpoint) ?? DEFAULT_SAFETY;
    const systemPrompt = resolver.resolveSystemPrompt(mode, endpoint);

    if (isInternalJait) {
      // Internal provider: identity + safety + the resolver's own (tool-rich)
      // system prompt — no external-provider steering block.
      prompt = `${identity}\n\n${safety}\n\n${systemPrompt}`;
    } else {
      const extProviderBlock = JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS;
      prompt = `${identity}\n\n${safety}\n\n<jaitExternalProvider>\n${extProviderBlock}\n</jaitExternalProvider>\n\n${systemPrompt}`;
    }

    // Inject project context so the agent knows its working directory
    if (ctx?.projectRoot) {
      const envParts = [`You are working in the project: ${ctx.projectRoot}`];
      if (ctx.platform) envParts.push(`OS: ${ctx.platform}`);
      if (ctx.shell) envParts.push(`Shell: ${ctx.shell} — write commands compatible with this shell. On PowerShell, use PowerShell syntax (e.g. $variable not bash-style). On bash/zsh, use POSIX syntax.`);
      if (ctx.hostname) envParts.push(`Host: ${ctx.hostname}`);
      envParts.push(`All relative file paths and searches default to this directory. Use relative paths when possible. Do not search from the drive root — scope operations to this project.`);
      prompt += `\n\n<projectContext>\n${envParts.join("\n")}\n</projectContext>`;
    }

    // Inject available skills
    if (ctx?.skills && ctx.skills.length > 0) {
      prompt += formatSkillsForPrompt(ctx.skills);
    }

    // Inject the saved project architecture graph (token-bounded) so the agent
    // has an up-front map of the project's structure and data flow.
    const graph = ctx?.architectureGraph?.trim();
    if (graph) {
      const MAX_GRAPH_CHARS = 4000;
      const clipped = graph.length > MAX_GRAPH_CHARS
        ? `${graph.slice(0, MAX_GRAPH_CHARS)}\n%% …truncated`
        : graph;
      prompt += `\n\n<projectArchitecture>\nA Mermaid diagram of this project's architecture (modules, dependencies, and data flow). Use it to orient yourself before exploring files.\n\n${clipped}\n</projectArchitecture>`;
    }

    const responseStyleInstructions = getResponseStyleInstructions(ctx?.responseStyle);
    if (responseStyleInstructions) {
      prompt += `\n\n<responseStyle>\n${responseStyleInstructions}\n</responseStyle>`;
    }

  }

  return prompt;
}

export function getReminderInstructions(mode: ChatMode, endpoint: ModelEndpoint): string | null {
  const resolver = promptRegistry.resolve(endpoint);
  return resolver.resolveReminderInstructions?.(mode, endpoint) ?? DEFAULT_REMINDER;
}
