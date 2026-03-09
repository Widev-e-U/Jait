/**
 * Default fallback prompt — used when no model-specific resolver matches.
 *
 * Adapted from VS Code Copilot Chat's DefaultAgentPrompt.
 */
import { promptRegistry } from "./prompt-registry.js";
import { CORE_INSTRUCTIONS, TOOL_USE_INSTRUCTIONS, EDITING_INSTRUCTIONS, SEARCH_INSTRUCTIONS, TODO_INSTRUCTIONS, getModeInstructions, } from "./shared-sections.js";
function resolveSystemPrompt(mode, _endpoint) {
    const modeBlock = getModeInstructions(mode);
    return `<instructions>
${CORE_INSTRUCTIONS}
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
Use proper Markdown formatting in your answers. When referring to a filename or symbol in the user's workspace, wrap it in backticks.

Example:
  The class \`Person\` is in \`src/models/person.ts\`.
  The function \`calculateTotal\` is defined in \`lib/utils/math.ts\`.
</outputFormatting>
${modeBlock ? `\n${modeBlock}` : ""}`;
}
const DefaultPromptResolver = {
    name: "default",
    familyPrefixes: [],
    resolveSystemPrompt,
    resolveReminderInstructions(_mode, _endpoint) {
        return `You are an agent — keep going until the user's query is completely resolved before ending your turn. ONLY terminate your turn when you are sure that the problem is solved, or you absolutely cannot continue.
You take action when possible — the user is expecting YOU to take action and go to work for them. Don't ask unnecessary questions about the details if you can simply DO something useful instead.`;
    },
};
// Register FIRST — serves as the fallback when nothing more specific matches.
promptRegistry.register(DefaultPromptResolver);
//# sourceMappingURL=default-prompt.js.map