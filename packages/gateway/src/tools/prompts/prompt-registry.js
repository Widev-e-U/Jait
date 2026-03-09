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
// ── Default fragments ────────────────────────────────────────────────
export const DEFAULT_IDENTITY = `Your name is Jait — Just Another Intelligent Tool. You are an AI coding assistant.`;
export const DEFAULT_SAFETY = `Follow the user's requirements carefully & to the letter.
If you are asked to generate content that is harmful, hateful, racist, sexist, lewd, or violent, only respond with "Sorry, I can't assist with that."
Avoid content that violates copyrights.`;
export const DEFAULT_REMINDER = `[REMINDER] Send a brief progress update to the user before your next tool calls. If you have a todo list, update it now. Keep going until the task is fully resolved.`;
// ── Registry singleton ───────────────────────────────────────────────
class PromptRegistry {
    resolvers = [];
    register(resolver) {
        this.resolvers.unshift(resolver);
    }
    resolve(endpoint) {
        const modelLower = endpoint.model.toLowerCase();
        for (const r of this.resolvers) {
            if (r.matchesModel?.(endpoint))
                return r;
        }
        for (const r of this.resolvers) {
            for (const prefix of r.familyPrefixes) {
                if (modelLower.startsWith(prefix.toLowerCase()))
                    return r;
            }
        }
        return this.resolvers[this.resolvers.length - 1];
    }
    listResolvers() {
        return this.resolvers.map((r) => r.name);
    }
}
export const promptRegistry = new PromptRegistry();
export function buildSystemPrompt(mode, endpoint, ctx) {
    const resolver = promptRegistry.resolve(endpoint);
    const identity = resolver.resolveIdentityRules?.(endpoint) ?? DEFAULT_IDENTITY;
    const safety = resolver.resolveSafetyRules?.(endpoint) ?? DEFAULT_SAFETY;
    const systemPrompt = resolver.resolveSystemPrompt(mode, endpoint);
    let prompt = `${identity}\n\n${safety}\n\n${systemPrompt}`;
    // Inject workspace context so the agent knows its working directory
    if (ctx?.workspaceRoot) {
        prompt += `\n\n<workspaceContext>\nYou are working in the workspace: ${ctx.workspaceRoot}\nAll relative file paths and searches default to this directory. Use relative paths when possible. Do not search from the drive root — scope operations to this workspace.\n</workspaceContext>`;
    }
    return prompt;
}
export function getReminderInstructions(mode, endpoint) {
    const resolver = promptRegistry.resolve(endpoint);
    return resolver.resolveReminderInstructions?.(mode, endpoint) ?? DEFAULT_REMINDER;
}
//# sourceMappingURL=prompt-registry.js.map