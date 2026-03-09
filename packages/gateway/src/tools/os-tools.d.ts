/**
 * OS Tools — Sprint 3.6
 *
 * os.query  — system info, processes, disk usage
 * os.install — winget/apt/brew wrapper
 */
import type { ToolDefinition } from "./contracts.js";
interface OsQueryInput {
    query: "info" | "processes" | "disk" | "env";
}
interface OsInstallInput {
    package: string;
    manager?: "winget" | "apt" | "brew" | "auto";
}
export declare function createOsQueryTool(): ToolDefinition<OsQueryInput>;
export declare function createOsInstallTool(): ToolDefinition<OsInstallInput>;
export {};
//# sourceMappingURL=os-tools.d.ts.map