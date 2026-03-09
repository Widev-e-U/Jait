/**
 * execute — Run shell commands in a persistent terminal.
 *
 * Inspired by VS Code Copilot's run_in_terminal:
 * - `isBackground` for long-running processes (servers, watchers)
 * - `explanation` for human-readable display of what the command does
 * - `goal` for short description shown in UI before the command runs
 * - `cwd` for setting working directory
 * - `timeout` with sensible defaults
 *
 * The terminal is visible to the user and persists between calls.
 */
import type { ToolDefinition } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
interface ExecuteInput {
    /** The shell command to execute */
    command: string;
    /** A one-sentence description of what the command does (shown to the user before running) */
    explanation: string;
    /** A short description of the goal or purpose (e.g. "Install dependencies", "Start dev server") */
    goal?: string;
    /** Whether this starts a background process (server, watcher, build --watch).
     *  If true, the command runs asynchronously and you won't see the output immediately.
     *  If false (default), the command blocks until complete and returns output. */
    isBackground?: boolean;
    /** Working directory for the command (defaults to workspace root) */
    cwd?: string;
    /** Reuse a specific terminal (omit to auto-select or create) */
    terminalId?: string;
    /** Execution timeout in ms (default 30000). Use 0 for no timeout.
     *  Be conservative — give enough time for the command to complete on a slow machine. */
    timeout?: number;
}
export declare function createExecuteTool(registry: SurfaceRegistry): ToolDefinition<ExecuteInput>;
export {};
//# sourceMappingURL=execute.d.ts.map