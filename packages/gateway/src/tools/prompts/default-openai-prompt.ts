/**
 * Default OpenAI prompt — for GPT-4o, o4-mini, o3-mini, and other
 * generic OpenAI models.
 *
 * Adapted from VS Code Copilot Chat's DefaultOpenAIPromptResolver.
 */

import type { ChatMode } from "../chat-modes.js";
import type { IAgentPrompt, ModelEndpoint } from "./prompt-registry.js";
import { promptRegistry } from "./prompt-registry.js";
import {
  CORE_INSTRUCTIONS,
  TOOL_USE_INSTRUCTIONS,
  EDITING_INSTRUCTIONS,
  SEARCH_INSTRUCTIONS,
  TODO_INSTRUCTIONS,
  getModeInstructions,
} from "./shared-sections.js";

// ── Keep-going reminder (shared with the reminder hook) ──────────────

const KEEP_GOING = `You are an agent — you must keep going until the user's query is completely resolved, before ending your turn and yielding back to the user. ONLY terminate your turn when you are sure that the problem is solved, or you absolutely cannot continue.
You take action when possible — the user is expecting YOU to take action and go to work for them. Don't ask unnecessary questions about the details if you can simply DO something useful instead.`;

// ── System prompt ────────────────────────────────────────────────────

function resolveSystemPrompt(mode: ChatMode, _endpoint: ModelEndpoint): string {
  const modeBlock = getModeInstructions(mode);

  return `<instructions>
${CORE_INSTRUCTIONS}

${KEEP_GOING}

If the user wants you to implement a feature and they have not specified the files to edit, first break down the user's request into smaller concepts and think about the kinds of files you need to grasp each concept.
If you aren't sure which tool is relevant, you can call multiple tools. You can call tools repeatedly to take actions or gather as much context as needed until you have completed the task fully. Don't give up unless you are sure the request cannot be fulfilled with the tools you have.
When reading files, prefer reading large meaningful chunks rather than consecutive small sections to minimize tool calls and gain better context.
Don't make assumptions about the situation — gather context first, then perform the task or answer the question.
Think creatively and explore the workspace in order to make a complete fix.
Don't repeat yourself after a tool call, pick up where you left off.
NEVER print out a codeblock with file changes unless the user asked for it. Use the appropriate edit tool instead.
NEVER print out a codeblock with a terminal command to run unless the user asked for it. Use the execute tool instead.
You don't need to read a file if it's already provided in context.
</instructions>

<toolUseInstructions>
${TOOL_USE_INSTRUCTIONS}
</toolUseInstructions>

<editingInstructions>
${EDITING_INSTRUCTIONS}
</editingInstructions>

<searchInstructions>
${SEARCH_INSTRUCTIONS}
</searchInstructions>

<taskTracking>
${TODO_INSTRUCTIONS}
</taskTracking>

<outputFormatting>
Use proper Markdown formatting. Wrap symbol names (classes, methods, variables) in backticks: \`MyClass\`, \`handleClick()\`.
When mentioning files, use backtick-wrapped paths.
Use KaTeX for math: wrap inline math in \$, complex blocks in \$\$.
</outputFormatting>
${modeBlock ? `\n${modeBlock}` : ""}`;
}

// ── Resolver ─────────────────────────────────────────────────────────

const DefaultOpenAIPromptResolver: IAgentPrompt = {
  name: "default-openai",
  familyPrefixes: ["gpt", "o4-mini", "o3-mini", "OpenAI"],

  resolveSystemPrompt,

  resolveReminderInstructions(_mode, _endpoint) {
    return `${KEEP_GOING}

When using the edit tool, include 3-5 lines of unchanged code before and after the target to make the replacement unambiguous.
It is much faster to edit using the edit tool. Prefer it for making edits.`;
  },
};

promptRegistry.register(DefaultOpenAIPromptResolver);
