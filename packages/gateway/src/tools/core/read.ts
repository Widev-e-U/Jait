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

import type { ToolDefinition, ToolResult, ToolContext } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import { getFs } from "./get-fs.js";

/**
 * Hard cap on lines returned in a single read. Raised well above Copilot's
 * 2000-line default — most source files fit comfortably under this, so a
 * single read returns the whole file instead of forcing needless follow-up
 * reads for anything moderately large.
 */
const MAX_LINES_PER_READ = 6000;

/**
 * Hard cap on bytes returned in a single read, independent of the line cap.
 * A file well under MAX_LINES_PER_READ can still be huge (long lines, dense
 * source) — without this, a handful of full-file reads can silently stuff
 * hundreds of KB into the conversation history, ballooning context and
 * slowing every subsequent LLM round. Matches the byte side of Copilot/pi's
 * read-tool default (50KB).
 */
const MAX_BYTES_PER_READ = 50 * 1024;

interface ReadInput {
  /** File or directory path (relative to project root, or absolute) */
  path: string;
  /** Start line (1-based, optional — for reading a range of a file) */
  startLine?: number;
  /** End line (1-based inclusive, optional) */
  endLine?: number;
}

export function createReadTool(registry: SurfaceRegistry): ToolDefinition<ReadInput> {
  return {
    name: "read",
    description:
      "Read a file or list a directory. Returns file content (with optional line range) or directory entries. " +
      "Truncates at " + MAX_LINES_PER_READ + " lines or " + (MAX_BYTES_PER_READ / 1024) +
      "KB, whichever is hit first; call again with startLine/endLine for more.",
    tier: "core",
    category: "filesystem",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File or directory path.",
        },
        startLine: {
          type: "number",
          description: "1-based start line.",
        },
        endLine: {
          type: "number",
          description: "1-based end line (inclusive).",
        },
      },
      required: ["path"],
    },
    async execute(input: ReadInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = await getFs(registry, context, input.path);

        // ── Directory path → list entries ──────────────────────────
        let isDir = false;
        try {
          const info = await fs.statFile(input.path);
          isDir = info.isDirectory;
        } catch {
          // stat failed — try reading as file (will throw its own error)
        }

        if (isDir) {
          const entries = await fs.list(input.path);
          // Append / to directory names (Copilot list_dir convention)
          const formatted = entries.map((e: any) => {
            if (typeof e === "string") return e;
            if (e.name && e.isDirectory) return e.name + "/";
            if (e.name) return e.name;
            return String(e);
          });
          return {
            ok: true,
            message: `Directory ${input.path} — ${formatted.length} entries`,
            data: { path: input.path, type: "directory", entries: formatted },
          };
        }

        // ── File path → read contents ──────────────────────────────
        const content = await fs.read(input.path);
        const allLines = content.split("\n");
        const totalLines = allLines.length;

        // Compute effective range. `available` is what actually exists to
        // return (clamped to the file's real length, so an endLine beyond
        // EOF doesn't get misreported as truncated below).
        const start = Math.max(1, input.startLine ?? 1) - 1; // 0-indexed
        const requestedEnd = input.endLine ?? totalLines;
        const available = Math.min(totalLines, requestedEnd);
        const lineCappedEnd = Math.min(available, start + MAX_LINES_PER_READ);

        // Walk forward from `start`, accumulating bytes, stopping at
        // lineCappedEnd or once the next line would exceed the byte budget
        // (always emit at least one line so a single huge line still returns
        // something rather than nothing). Applies even when the caller gave
        // an explicit endLine — a big enough explicit range can still blow
        // the byte budget.
        let cappedEnd = start;
        let byteCount = 0;
        while (cappedEnd < lineCappedEnd) {
          const currentLine = allLines[cappedEnd] ?? "";
          const lineBytes = Buffer.byteLength(currentLine, "utf-8") + 1; // +1 for newline
          if (byteCount + lineBytes > MAX_BYTES_PER_READ && cappedEnd > start) break;
          byteCount += lineBytes;
          cappedEnd++;
        }

        const hitByteCap = cappedEnd < lineCappedEnd;
        const hitLineCap = !hitByteCap && lineCappedEnd < available;
        const truncated = hitByteCap || hitLineCap;
        const slice = allLines.slice(start, cappedEnd);

        // Build line-numbered content
        const numbered = slice
          .map((line, i) => `${start + i + 1}\t${line}`)
          .join("\n");

        const limitLabel = hitByteCap ? `${MAX_BYTES_PER_READ / 1024}KB limit` : `${MAX_LINES_PER_READ} line limit`;
        const suffix = truncated
          ? `\n\n[File content truncated (${limitLabel}). Showing lines ${start + 1}-${cappedEnd} of ${totalLines}. Use startLine=${cappedEnd + 1} to continue.]`
          : "";

        return {
          ok: true,
          message: `${input.path} — lines ${start + 1}-${cappedEnd} of ${totalLines}`,
          data: {
            path: input.path,
            type: "file",
            content: numbered + suffix,
            totalLines,
            startLine: start + 1,
            endLine: cappedEnd,
            truncated,
          },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Read failed",
        };
      }
    },
  };
}
