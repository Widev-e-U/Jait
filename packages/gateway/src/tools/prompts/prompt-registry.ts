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
  /** The resolved workspace root for the current session (if any) */
  workspaceRoot?: string;
  /** Enabled skills to inject into the system prompt */
  skills?: Skill[];
  /** Optional response style override for this session */
  responseStyle?: ResponseStyle;
  /** Backend provider label — used to select lighter prompts for local models */
  backend?: string;
}

export function buildSystemPrompt(mode: ChatMode, endpoint: ModelEndpoint, ctx?: PromptContext): string {
  const resolver = promptRegistry.resolve(endpoint);
  const isLocalModel = ctx?.backend === "ollama" || endpoint.backend === "ollama";

  let prompt: string;
  if (isLocalModel) {
    // Minimal prompt for local / slow models — skip identity, safety, and wrapper blocks
    prompt = resolver.resolveSystemPrompt(mode, endpoint);
    if (ctx?.workspaceRoot) {
      prompt += `\nWorkspace: ${ctx.workspaceRoot}`;
    }
  } else {
    const identity = resolver.resolveIdentityRules?.(endpoint) ?? DEFAULT_IDENTITY;
    const safety = resolver.resolveSafetyRules?.(endpoint) ?? DEFAULT_SAFETY;
    const systemPrompt = resolver.resolveSystemPrompt(mode, endpoint);

    const extProviderBlock = JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS;
    prompt = `${identity}\n\n${safety}\n\n<jaitExternalProvider>\n${extProviderBlock}\n</jaitExternalProvider>\n\n${systemPrompt}`;

    // Inject workspace context so the agent knows its working directory
    if (ctx?.workspaceRoot) {
      prompt += `\n\n<workspaceContext>\nYou are working in the workspace: ${ctx.workspaceRoot}\nAll relative file paths and searches default to this directory. Use relative paths when possible. Do not search from the drive root — scope operations to this workspace.\n</workspaceContext>`;
    }

    // Inject available skills
    if (ctx?.skills && ctx.skills.length > 0) {
      prompt += formatSkillsForPrompt(ctx.skills);
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
