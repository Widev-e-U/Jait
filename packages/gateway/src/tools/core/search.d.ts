/**
 * search — Search files in the workspace by content or name.
 *
 * Inspired by VS Code Copilot's grep_search + file_search:
 * - `isRegexp` flag for explicit regex vs literal mode
 * - Auto-retry with opposite mode if no results found
 * - `includeIgnoredFiles` to search in gitignored dirs (node_modules, etc.)
 * - Hard cap on max results (200)
 * - Rich description with regex alternation tips
 * - Timeout protection (20s)
 */
import type { ToolDefinition } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
interface SearchInput {
    /** The search pattern (text or regex) */
    pattern: string;
    /** Whether the pattern is a regex (default: false = literal text search) */
    isRegexp?: boolean;
    /** Directory to search in (defaults to workspace root) */
    path?: string;
    /** Search mode: "content" (grep) or "files" (find by name). Default: "content" */
    mode?: string;
    /** Include file glob pattern (e.g. "*.ts", "src/**"). Default: all files */
    include?: string;
    /** Maximum number of results (default: 20, max: 200) */
    limit?: number;
    /** Whether to include files normally ignored by .gitignore (default: false).
     *  Warning: this may be slower. Only set when you need to search in
     *  node_modules, build outputs, or other ignored directories. */
    includeIgnoredFiles?: boolean;
}
export declare function createSearchTool(registry: SurfaceRegistry): ToolDefinition<SearchInput>;
export {};
//# sourceMappingURL=search.d.ts.map