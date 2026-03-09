/**
 * Prompt system barrel — import order matters!
 *
 * The default prompt is registered FIRST so it ends up at the bottom
 * of the resolution stack (fallback). More specific resolvers register
 * later and take priority via matchesModel() or familyPrefixes.
 *
 * Modelled after VS Code Copilot Chat's allAgentPrompts.ts import order.
 */
import "./default-prompt.js";
import "./claude-prompt.js";
import "./gemini-prompt.js";
import "./default-openai-prompt.js";
import "./gpt51-prompt.js";
import "./gpt52-prompt.js";
import "./gpt5-codex-prompt.js";
import "./gpt5-prompt.js";
import "./xai-prompt.js";
export { promptRegistry, buildSystemPrompt, getReminderInstructions, DEFAULT_IDENTITY, DEFAULT_SAFETY, DEFAULT_REMINDER, } from "./prompt-registry.js";
export type { PromptContext } from "./prompt-registry.js";
export type { IAgentPrompt, ModelEndpoint } from "./prompt-registry.js";
//# sourceMappingURL=index.d.ts.map