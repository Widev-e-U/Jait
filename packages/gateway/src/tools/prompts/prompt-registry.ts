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

// ── Interfaces ───────────────────────────────────────────────────────

export interface ModelEndpoint {
  model: string;
  baseUrl: string;
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

// ── Helpers ──────────────────────────────────────────────────────────

export function buildSystemPrompt(mode: ChatMode, endpoint: ModelEndpoint): string {
  const resolver = promptRegistry.resolve(endpoint);
  const identity = resolver.resolveIdentityRules?.(endpoint) ?? DEFAULT_IDENTITY;
  const safety = resolver.resolveSafetyRules?.(endpoint) ?? DEFAULT_SAFETY;
  const systemPrompt = resolver.resolveSystemPrompt(mode, endpoint);
  return `${identity}\n\n${safety}\n\n${systemPrompt}`;
}

export function getReminderInstructions(mode: ChatMode, endpoint: ModelEndpoint): string | null {
  const resolver = promptRegistry.resolve(endpoint);
  return resolver.resolveReminderInstructions?.(mode, endpoint) ?? DEFAULT_REMINDER;
}
