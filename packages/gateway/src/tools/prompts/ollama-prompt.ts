/**
 * Ollama (local model) prompt — lightweight variant for slow local models.
 *
 * Keeps the same tool-use contract but strips verbose instructions down
 * to essentials so that small / slow models spend their context budget on
 * the actual conversation, not on pages of meta-instructions.
 */

import type { ChatMode } from "../chat-modes.js";
import type { IAgentPrompt, ModelEndpoint } from "./prompt-registry.js";
import { promptRegistry } from "./prompt-registry.js";
import { getModeInstructions } from "./shared-sections.js";

function resolveSystemPrompt(mode: ChatMode, _endpoint: ModelEndpoint): string {
  const modeBlock = getModeInstructions(mode);

  return `You are an expert coding agent. Use tools to read, edit, search files and run commands.
Implement changes directly. Read files before editing. Keep working until done.
Use Markdown in responses. Wrap filenames and symbols in backticks.
${modeBlock ? `${modeBlock}\n` : ""}`.trim();
}

const OllamaPromptResolver: IAgentPrompt = {
  name: "ollama",
  familyPrefixes: [],

  matchesModel(endpoint: ModelEndpoint): boolean {
    return endpoint.backend === "ollama";
  },

  resolveSystemPrompt,

  resolveReminderInstructions() {
    return `Keep going until the task is fully resolved.`;
  },
};

promptRegistry.register(OllamaPromptResolver);
