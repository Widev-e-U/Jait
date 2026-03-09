/**
 * Core tools — The 8 essential tools that form the agent's primary toolkit.
 *
 * Design inspired by VS Code Copilot Chat's tool system, adapted for
 * Jait's gateway-centric architecture:
 *
 * | Tool    | Copilot Equivalent(s)              | Category    |
 * |---------|------------------------------------|-------------|
 * | read    | read_file + list_dir               | filesystem  |
 * | edit    | create_file + replace_string       | filesystem  |
 * | execute | run_in_terminal                    | terminal    |
 * | search  | grep_search + file_search          | filesystem  |
 * | web     | fetch_webpage (+ web search)       | web         |
 * | agent   | runSubagent + search_subagent      | agent       |
 * | todo    | manage_todo_list                   | meta        |
 * | jait    | memory + (no equiv for cron/status) | gateway    |
 */
export { createReadTool } from "./read.js";
export { createEditTool } from "./edit.js";
export { createExecuteTool } from "./execute.js";
export { createSearchTool } from "./search.js";
export { createWebTool } from "./web.js";
export { createAgentTool } from "./agent.js";
export { createTodoTool, getSessionTodos, clearSessionTodos } from "./todo.js";
export { createJaitTool } from "./jait.js";
//# sourceMappingURL=index.js.map