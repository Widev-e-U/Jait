/**
 * Native DeepSeek tools and progress guidance, including Ollama cloud models.
 * Register after the generic Ollama resolver so native capabilities take priority.
 */
import type { ChatMode } from "../chat-modes.js";
import type { IAgentPrompt, ModelEndpoint } from "./prompt-registry.js";
import { promptRegistry } from "./prompt-registry.js";
import { CORE_INSTRUCTIONS, EDITING_INSTRUCTIONS, USER_QUESTION_INSTRUCTIONS, getModeInstructions } from "./shared-sections.js";

function resolveSystemPrompt(mode: ChatMode, _endpoint: ModelEndpoint): string {
  const modeBlock = getModeInstructions(mode);
  return `${CORE_INSTRUCTIONS}

<toolUseInstructions>
Use the structured function calling mechanism to invoke tools. Never write tool calls as plain text or code blocks.
Batch independent read-only tool calls in one response when their arguments are already known. The runtime handles concurrent execution; no parallel wrapper tool is needed.
Wait for results before choosing dependent calls. Run terminal operations and mutations in sequence, preserving their ordering and existing consent, scope, and path protections.
Read enough context to answer or act. Reuse completed results instead of repeating the same investigation.
If a tool fails, inspect the error and choose a different approach rather than repeating an identical failing call.
</toolUseInstructions>

<progressUpdates>
For substantial work, send a brief user-facing progress update before starting and after meaningful batches of results.
Describe what you learned and the next action. Avoid narrating every tool call.
While work remains, include the next ready tool calls in the same response as the progress update. A progress sentence alone should not end an unfinished task.
Use the model's native reasoning channel. Do not write a second reasoning transcript or thinking tags in visible content.
</progressUpdates>

<userQuestionInstructions>
${USER_QUESTION_INSTRUCTIONS}
</userQuestionInstructions>

<editingInstructions>
${EDITING_INSTRUCTIONS}
</editingInstructions>

Use todo for multi-step work when tracking helps. Keep the plan current as steps finish.
Use Markdown in responses. Wrap filenames and symbols in backticks.
${modeBlock ? `\n${modeBlock}` : ""}`;
}

const DeepSeekPromptResolver: IAgentPrompt = {
  name: "deepseek",
  familyPrefixes: [],
  matchesModel(endpoint) {
    return /(^|\/)deepseek(?:[-/:]|$)/i.test(endpoint.model);
  },
  isInternalJaitProvider: true,
  resolveSystemPrompt,
  resolveReminderInstructions() {
    return "Continue from completed results. Batch independent read-only calls; wait for dependencies. Give a brief progress update when you have meaningful news, then continue until the task is resolved.";
  },
};

promptRegistry.register(DeepSeekPromptResolver);
