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
import { getFs } from "./get-fs.js";
export function createEditTool(registry) {
    return {
        name: "edit",
        description: "Create a new file, overwrite an existing file, or patch (search-and-replace) part of a file.\n\n" +
            "**To create a new file:** provide `path` and `content`. The directory is created automatically. " +
            "Never use this to edit a file that already exists — use patch mode instead.\n\n" +
            "**To overwrite an existing file:** provide `path` and `content`. Use this when you want to replace the " +
            "entire file contents.\n\n" +
            "**To patch (search-and-replace):** provide `path`, `search` (exact literal text to find), and `replace` " +
            "(the replacement text). Each call replaces exactly ONE occurrence.\n\n" +
            "CRITICAL for `search`: Must be the EXACT literal text from the file, including all whitespace, " +
            "indentation, and newlines. Include at least 3 lines of context BEFORE and AFTER the target text " +
            "to ensure an unambiguous match. If the string matches multiple locations, or doesn't match at all, " +
            "the tool will fail.\n\n" +
            "Always generate the `explanation` property first. Always read the file before patching.",
        tier: "core",
        category: "filesystem",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                explanation: {
                    type: "string",
                    description: "A short explanation of the edit being made. Generate this FIRST before the other fields.",
                },
                path: {
                    type: "string",
                    description: "The absolute or workspace-relative file path to create or edit.",
                },
                content: {
                    type: "string",
                    description: "Full file content. Use this to create a new file or overwrite an existing file entirely.",
                },
                search: {
                    type: "string",
                    description: "The exact literal text to find in the file (for patch mode). " +
                        "MUST be the exact text including all whitespace, indentation, and newlines. " +
                        "Include at least 3 lines of context BEFORE and AFTER the target text for unambiguous matching. " +
                        "Must uniquely identify a single location in the file.",
                },
                replace: {
                    type: "string",
                    description: "The exact literal replacement text (for patch mode). " +
                        "Provide the complete replacement including surrounding context lines.",
                },
            },
            required: ["explanation", "path"],
        },
        async execute(input, context) {
            try {
                const fs = await getFs(registry, context, input.path);
                // ── Patch mode: search + replace ─────────────────────────
                if (input.search != null) {
                    if (input.replace == null) {
                        return { ok: false, message: "Patch mode requires both `search` and `replace`." };
                    }
                    const result = await fs.patch(input.path, input.search, input.replace);
                    if (!result.matched) {
                        return {
                            ok: false,
                            message: `Search string not found in ${input.path}. ` +
                                "Ensure the search text is an exact literal match including whitespace and indentation. " +
                                "Read the file first to get the exact text.",
                        };
                    }
                    return {
                        ok: true,
                        message: `Patched ${input.path}: ${input.explanation}`,
                        data: { path: input.path, mode: "patch", explanation: input.explanation },
                    };
                }
                // ── Create / overwrite mode ──────────────────────────────
                if (input.content == null) {
                    return {
                        ok: false,
                        message: "Provide `content` to create/overwrite, or `search` + `replace` to patch.",
                    };
                }
                await fs.write(input.path, input.content);
                return {
                    ok: true,
                    message: `Wrote ${input.path} (${input.content.length} bytes): ${input.explanation}`,
                    data: { path: input.path, mode: "write", size: input.content.length, explanation: input.explanation },
                };
            }
            catch (err) {
                return {
                    ok: false,
                    message: err instanceof Error ? err.message : "Edit failed",
                };
            }
        },
    };
}
//# sourceMappingURL=edit.js.map