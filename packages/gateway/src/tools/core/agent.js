/**
 * agent — Delegate tasks to a sub-agent.
 *
 * Inspired by VS Code Copilot's runSubagent + search_subagent:
 * - `prompt` + `description` + `details` for clear task specification
 * - `allowedTools` for scoping what the sub-agent can do
 * - `maxRounds` to limit autonomous tool-calling loops
 *
 * Our advantage: single unified agent tool instead of Copilot's two
 * separate tools (runSubagent + search_subagent).
 */
import { createAgentSpawnTool } from "../agent-tools.js";
export function createAgentTool(deps) {
    const inner = createAgentSpawnTool(deps);
    return {
        name: "agent",
        description: "Launch a new agent to handle complex, multi-step tasks autonomously.\n\n" +
            "The sub-agent gets its own conversation and tools, works independently, and returns a single result. " +
            "This tool is good at researching complex questions, searching for code, and executing multi-step tasks.\n\n" +
            "When to use:\n" +
            "- Multi-file research or code search (when you're not confident you'll find the right match quickly)\n" +
            "- Analysis tasks that need several tool calls to complete\n" +
            "- Complex tasks you want to delegate while continuing your main work\n\n" +
            "Each agent invocation is stateless. You will not be able to send additional messages to it. " +
            "Your prompt should contain a highly detailed task description for the agent to perform autonomously " +
            "and you should specify exactly what information it should return.\n\n" +
            "The agent's outputs should generally be trusted.",
        tier: "core",
        category: "agent",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description: "A detailed description of the task for the agent to perform.",
                },
                description: {
                    type: "string",
                    description: "A short (3-5 word) description of the task.",
                },
                details: {
                    type: "string",
                    description: "A 2-3 sentence detailed objective. Specify exactly what the agent should search for, " +
                        "analyze, or return. The more specific, the better the result.",
                },
                allowedTools: {
                    type: "string",
                    description: "Comma-separated tool names the sub-agent may use. " +
                        "Defaults to a safe read-only subset. " +
                        "Example: 'read,search,execute,web'",
                },
                maxRounds: {
                    type: "number",
                    description: "Max tool-calling rounds (default: 8).",
                },
            },
            required: ["prompt", "description"],
        },
        async execute(input, context) {
            return inner.execute(input, context);
        },
    };
}
//# sourceMappingURL=agent.js.map