/**
 * read — Read file contents or list directory entries.
 *
 * Inspired by VS Code Copilot's read_file + list_dir, unified into one tool.
 * Auto-detects whether the path is a file or directory.
 *
 * Key design decisions (learned from Copilot):
 * - Hard cap at MAX_LINES_PER_READ to prevent context blowup
 * - Truncation notice when file exceeds limit
 * - Guidance to "prefer reading larger ranges over many small reads"
 * - Line numbers in output for easy reference
 * - Directory entries show trailing `/` for folders (like Copilot list_dir)
 */
import type { ToolDefinition } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
interface ReadInput {
    /** File or directory path (relative to workspace root, or absolute) */
    path: string;
    /** Start line (1-based, optional — for reading a range of a file) */
    startLine?: number;
    /** End line (1-based inclusive, optional) */
    endLine?: number;
}
export declare function createReadTool(registry: SurfaceRegistry): ToolDefinition<ReadInput>;
export {};
//# sourceMappingURL=read.d.ts.map