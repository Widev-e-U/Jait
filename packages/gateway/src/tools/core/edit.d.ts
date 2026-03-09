/**
 * edit — Create, overwrite, or patch files.
 *
 * Inspired by VS Code Copilot's create_file + replace_string_in_file,
 * unified into a single tool with an `explanation` field.
 *
 * Key design decisions (learned from Copilot):
 * - `explanation` param generates first → helps LLM reason about the change
 * - Create mode fails if file already exists with content (use patch instead)
 * - Patch mode requires exact literal match (like Copilot replace_string)
 * - Guidance: "read the file first before patching"
 * - Guidance: "include at least 3 lines of context for unambiguous matching"
 */
import type { ToolDefinition } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
interface EditInput {
    /** Short explanation of what the edit does (generated first by the LLM) */
    explanation: string;
    /** Path to the file to create or edit */
    path: string;
    /** Full file content (for create/overwrite) */
    content?: string;
    /** Exact literal text to find (for search-replace patch) */
    search?: string;
    /** Replacement text (for search-replace patch) */
    replace?: string;
}
export declare function createEditTool(registry: SurfaceRegistry): ToolDefinition<EditInput>;
export {};
//# sourceMappingURL=edit.d.ts.map