/**
 * GLM (Zhipu / BigModel) prompt — full treatment for Jait's *internal* provider.
 *
 * GLM models (e.g. `zhipu/glm-4.5` via OpenRouter, or `glm-4.5` / `glm-4.6`
 * via the BigModel OpenAI-compatible API) run natively inside Jait's agent
 * loop with Jait tools registered directly — they are NOT an external CLI
 * provider like codex / claude-code. So this resolver sets
 * `isInternalJaitProvider`, which makes `buildSystemPrompt` skip the
 * `<jaitExternalProvider>` steering block (no provider-native shell-command
 * fallback exists to steer away from).
 *
 * GLM is nonetheless a capable frontier-class model that deserves the same
 * detailed system prompt given to big providers like GPT-5 / Claude — not
 * the lightweight default fallback. This resolver applies the full
 * CORE_INSTRUCTIONS + keep-going contract plus all shared
 * tool/edit/search/todo sections, with explicit tool-call format discipline
 * (GLM occasionally emits tool calls as plain text, like Qwen). The
 * `<toolUseInstructions>` section carries the `tools.search` discovery
 * mechanism so the model can find the search tool and other Jait tools.
 *
 * Matches: model IDs containing "glm" (case-insensitive), covering OpenRouter
 * (`zhipu/glm-*`) and the BigModel OpenAI-compatible API (`glm-*`).
 */

import type { ChatMode } from "../chat-modes.js";
import type { IAgentPrompt, ModelEndpoint } from "./prompt-registry.js";
import { promptRegistry } from "./prompt-registry.js";
import {
  CORE_INSTRUCTIONS,
  TOOL_USE_INSTRUCTIONS,
  USER_QUESTION_INSTRUCTIONS,
  EDITING_INSTRUCTIONS,
  SEARCH_INSTRUCTIONS,
  TODO_INSTRUCTIONS,
  getModeInstructions,
} from "./shared-sections.js";

// ── Keep-going reminder (shared with the reminder hook) ──────────────

const KEEP_GOING = `You are an agent — you must keep going until the user's query is completely resolved, before ending your turn and yielding back to the user. ONLY terminate your turn when you are sure that the problem is solved, or you absolutely cannot continue.
You take action when possible — the user is expecting YOU to take action and go to work for them. Don't ask unnecessary questions about the details if you can simply DO something useful instead.`;

// ── Model matcher ────────────────────────────────────────────────────

function isGlmFamily(endpoint: ModelEndpoint): boolean {
  return endpoint.model.toLowerCase().includes("glm");
}

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
Think creatively and explore the project in order to make a complete fix.
Don't repeat yourself after a tool call, pick up where you left off.
NEVER print out a codeblock with file changes unless the user asked for it. Use the appropriate edit tool instead.
NEVER print out a codeblock with a terminal command to run unless the user asked for it. Use the execute tool instead.
You don't need to read a file if it's already provided in context.
</instructions>

<toolCallFormat>
You MUST invoke tools using the structured function calling mechanism provided by the API.

**Rules:**
- When you want to use a tool, emit a proper \`tool_call\` in the API response format.
- NEVER write tool names, function signatures, or JSON arguments as plain text in your response content.
- NEVER output tool calls in markdown code blocks, XML tags, or any other text format.
- If you are unsure how to call a tool, just call it — the system handles the structured format.
- Call one tool at a time. Wait for each result before deciding your next step.
- If a tool call fails, read the error and try a different approach. Do not repeat the exact same call.
</toolCallFormat>

<toolUseInstructions>
${TOOL_USE_INSTRUCTIONS}
</toolUseInstructions>

<userQuestionInstructions>
${USER_QUESTION_INSTRUCTIONS}
</userQuestionInstructions>

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
Use KaTeX for math: wrap inline math in $, complex blocks in $$.
</outputFormatting>
${modeBlock ? `\n${modeBlock}` : ""}`;
}

// ── Resolver ─────────────────────────────────────────────────────────

const GlmPromptResolver: IAgentPrompt = {
  name: "glm",
  familyPrefixes: ["glm"],

  matchesModel(endpoint) {
    return isGlmFamily(endpoint);
  },

  // GLM runs natively inside Jait's agent loop (Jait tools registered
  // directly) — it is NOT an external CLI provider, so it does not get the
  // `<jaitExternalProvider>` steering block. The resolver's own prompt
  // carries the tool-use / search-discovery instructions the model needs.
  isInternalJaitProvider: true,

  resolveSystemPrompt,

  resolveReminderInstructions(_mode, _endpoint) {
    return `When using the edit tool, include 3-5 lines of unchanged code before and after the target to make the replacement unambiguous.
You MUST use the structured tool calling mechanism — never write tool calls as text.
Keep going until the task is fully resolved. If you have a todo list, update it before your next action.`;
  },
};

promptRegistry.register(GlmPromptResolver);