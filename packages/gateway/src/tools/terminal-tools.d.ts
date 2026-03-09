/**
 * Terminal Tools — persistent-terminal edition (OSC 633 shell integration)
 *
 * terminal.run    — execute a command in a persistent interactive terminal (like VS Code)
 * terminal.stream — start a new interactive terminal
 *
 * Commands run inside a real, visible terminal that the user can open and
 * interact with in the frontend.  Output is captured via OSC 633 escape
 * sequences emitted by the shell integration scripts — the command itself
 * is sent unmodified.
 *
 * Terminals persist between commands (up to 10 globally — oldest is
 * stopped when the limit is exceeded).
 */
import type { ToolDefinition } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { SandboxManager, type SandboxMountMode } from "../security/sandbox-manager.js";
import type { WsControlPlane } from "../ws.js";
export declare function detectInteractivePrompt(output: string): boolean;
interface TerminalRunInput {
    command: string;
    sessionId?: string;
    terminalId?: string;
    timeout?: number;
    sandbox?: boolean;
    sandboxMountMode?: SandboxMountMode;
}
interface TerminalStreamInput {
    sessionId: string;
    workspaceRoot?: string;
    cols?: number;
    rows?: number;
}
export declare function createTerminalRunTool(registry: SurfaceRegistry, sandboxManager?: SandboxManager, ws?: WsControlPlane): ToolDefinition<TerminalRunInput>;
export declare function createTerminalStreamTool(registry: SurfaceRegistry): ToolDefinition<TerminalStreamInput>;
export {};
//# sourceMappingURL=terminal-tools.d.ts.map