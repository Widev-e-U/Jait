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
export declare const DEFAULT_IDENTITY = "Your name is Jait \u2014 Just Another Intelligent Tool. You are an AI coding assistant.";
export declare const DEFAULT_SAFETY = "Follow the user's requirements carefully & to the letter.\nIf you are asked to generate content that is harmful, hateful, racist, sexist, lewd, or violent, only respond with \"Sorry, I can't assist with that.\"\nAvoid content that violates copyrights.";
export declare const DEFAULT_REMINDER = "[REMINDER] Send a brief progress update to the user before your next tool calls. If you have a todo list, update it now. Keep going until the task is fully resolved.";
declare class PromptRegistry {
    private resolvers;
    register(resolver: IAgentPrompt): void;
    resolve(endpoint: ModelEndpoint): IAgentPrompt;
    listResolvers(): string[];
}
export declare const promptRegistry: PromptRegistry;
export interface PromptContext {
    /** The resolved workspace root for the current session (if any) */
    workspaceRoot?: string;
}
export declare function buildSystemPrompt(mode: ChatMode, endpoint: ModelEndpoint, ctx?: PromptContext): string;
export declare function getReminderInstructions(mode: ChatMode, endpoint: ModelEndpoint): string | null;
export {};
//# sourceMappingURL=prompt-registry.d.ts.map