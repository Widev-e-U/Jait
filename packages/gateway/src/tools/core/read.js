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
import { getFs } from "./get-fs.js";
/** Hard cap on lines returned in a single read (matches Copilot's limit). */
const MAX_LINES_PER_READ = 2000;
export function createReadTool(registry) {
    return {
        name: "read",
        description: "Read the contents of a file, or list a directory.\n\n" +
            "If the path points to a file, returns its content (optionally a specific line range). " +
            "If the path points to a directory, returns the list of entries (names ending in `/` are folders).\n\n" +
            "You must specify the line range you're interested in for large files. Line numbers are 1-indexed. " +
            "This tool truncates output at " + MAX_LINES_PER_READ + " lines — call it again with an offset to read " +
            "more. Prefer reading larger ranges over doing many small reads.\n\n" +
            "Use this to understand code, check configs, explore project structure, or verify changes you made.",
        tier: "core",
        category: "filesystem",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "The file or directory path (relative to workspace root, or absolute).",
                },
                startLine: {
                    type: "number",
                    description: "The 1-based line number to start reading from. Omit to start from the beginning.",
                },
                endLine: {
                    type: "number",
                    description: "The 1-based inclusive line number to stop reading at. Omit to read to the end (capped at " + MAX_LINES_PER_READ + " lines).",
                },
            },
            required: ["path"],
        },
        async execute(input, context) {
            try {
                const fs = await getFs(registry, context, input.path);
                // ── Directory path → list entries ──────────────────────────
                let isDir = false;
                try {
                    const info = await fs.statFile(input.path);
                    isDir = info.isDirectory;
                }
                catch {
                    // stat failed — try reading as file (will throw its own error)
                }
                if (isDir) {
                    const entries = await fs.list(input.path);
                    // Append / to directory names (Copilot list_dir convention)
                    const formatted = entries.map((e) => {
                        if (typeof e === "string")
                            return e;
                        if (e.name && e.isDirectory)
                            return e.name + "/";
                        if (e.name)
                            return e.name;
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
                // Compute effective range
                const start = Math.max(1, input.startLine ?? 1) - 1; // 0-indexed
                const requestedEnd = input.endLine ?? totalLines;
                const cappedEnd = Math.min(totalLines, start + MAX_LINES_PER_READ, requestedEnd);
                const slice = allLines.slice(start, cappedEnd);
                const truncated = cappedEnd < totalLines && !input.endLine;
                // Build line-numbered content
                const numbered = slice
                    .map((line, i) => `${start + i + 1}\t${line}`)
                    .join("\n");
                const suffix = truncated
                    ? `\n\n[File content truncated. Showing lines ${start + 1}-${cappedEnd} of ${totalLines}. Use startLine/endLine to read more.]`
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
            }
            catch (err) {
                return {
                    ok: false,
                    message: err instanceof Error ? err.message : "Read failed",
                };
            }
        },
    };
}
//# sourceMappingURL=read.js.map