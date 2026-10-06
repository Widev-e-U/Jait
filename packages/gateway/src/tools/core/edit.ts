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

import type { ToolDefinition, ToolResult, ToolContext } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import { getFs } from "./get-fs.js";

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

export function createEditTool(registry: SurfaceRegistry): ToolDefinition<EditInput> {
  return {
    name: "edit",
    description:
      "Create, overwrite, or patch a file. " +
      "Create/overwrite: provide path + content. " +
      "Patch: provide path + search (exact literal text) + replace. " +
      "search must match exactly one location including whitespace/indentation. Read the file before patching. Content and replacement whitespace are preserved exactly; supply actual newline characters when needed. JSON escapes are decoded once; literal backslash sequences are preserved, not decoded again. Use only one mode per call.",
    tier: "core",
    category: "filesystem",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        explanation: {
          type: "string",
          description: "Short explanation of the edit.",
        },
        path: {
          type: "string",
          description: "File path to create or edit.",
        },
        content: {
          type: "string",
          description: "Full file content (create/overwrite mode). Whitespace is preserved exactly, including trailing newlines.",
        },
        search: {
          type: "string",
          description: "Exact literal text to find (patch mode). Include surrounding context for unique match.",
        },
        replace: {
          type: "string",
          description: "Replacement text (patch mode).",
        },
      },
      required: ["explanation", "path"],
    },
    async execute(input: EditInput, context: ToolContext): Promise<ToolResult> {
      try {
        if (input.content != null && (input.search != null || input.replace != null)) {
          return { ok: false, message: "Choose one edit mode: `content` for write, or `search` + `replace` for patch. Mixed modes are rejected without modifying the file." };
        }
        const fs = await getFs(registry, context, input.path);

        // ── Patch mode: search + replace ─────────────────────────
        if (input.search != null) {
          if (input.replace == null) {
            return { ok: false, message: "Patch mode requires both `search` and `replace`." };
          }
          if (input.search === input.replace) {
            return { ok: false, message: "Search and replacement are identical; no change was made. Include the actual changed whitespace or newline in `replace`." };
          }
          const result = await fs.patch(input.path, input.search, input.replace);
          if (!result.matched) {
            return {
              ok: false,
              message:
                `Search string not found in ${input.path}. ` +
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
        const size = Buffer.byteLength(input.content, "utf8");
        const trailingNewline = input.content.endsWith("\n");
        return {
          ok: true,
          message: `Wrote ${input.path} (${size} bytes; trailing newline: ${trailingNewline ? "yes" : "no"}): ${input.explanation}`,
          data: { path: input.path, mode: "write", size, trailingNewline, explanation: input.explanation },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Edit failed",
        };
      }
    },
  };
}
