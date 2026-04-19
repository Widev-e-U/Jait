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

import type { ToolDefinition, ToolResult, ToolContext } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import { resolveWorkspaceRoot } from "./get-fs.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";

const execAsync = promisify(exec);

/** Absolute maximum results to prevent context blowup. */
const MAX_RESULTS_CAP = 200;
/** Default number of results when not specified. */
const DEFAULT_MAX_RESULTS = 20;
/** Search timeout in ms. */
const SEARCH_TIMEOUT = 20_000;

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

export function createSearchTool(registry: SurfaceRegistry): ToolDefinition<SearchInput> {
  return {
    name: "search",
    description:
      "Search for files or text in the workspace. " +
      'mode="content" (default): grep through file contents, returns matching lines. ' +
      'mode="files": find files by name substring. ' +
      "Use isRegexp for regex patterns (e.g. 'word1|word2' for alternation).",
    tier: "core",
    category: "filesystem",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Text or regex pattern to search for.",
        },
        isRegexp: {
          type: "boolean",
          description: "True if pattern is a regex.",
        },
        path: {
          type: "string",
          description: "Directory to search in (defaults to workspace root).",
        },
        mode: {
          type: "string",
          description: '"content" (grep, default) or "files" (find by name).',
          enum: ["content", "files"],
        },
        include: {
          type: "string",
          description: 'File glob filter (e.g. "*.ts", "src/**").',
        },
        limit: {
          type: "number",
          description: `Max results (default: ${DEFAULT_MAX_RESULTS}, max: ${MAX_RESULTS_CAP}).`,
        },
        includeIgnoredFiles: {
          type: "boolean",
          description: "Include gitignored files (may be slower).",
        },
      },
      required: ["pattern"],
    },
    async execute(input: SearchInput, context: ToolContext): Promise<ToolResult> {
      const effectiveRoot = resolveWorkspaceRoot(registry, context.sessionId);
      const searchDir = input.path || effectiveRoot;
      const limit = Math.min(input.limit ?? DEFAULT_MAX_RESULTS, MAX_RESULTS_CAP);
      const mode = input.mode ?? "content";

      try {
        if (mode === "files") {
          return await searchFiles(searchDir, input.pattern, limit);
        }

        // Try content search with the given regex mode
        const result = await searchContent(
          searchDir, input.pattern, input.include, limit,
          input.isRegexp ?? false, input.includeIgnoredFiles ?? false,
        );

        // Auto-retry with opposite mode if no results (Copilot pattern)
        if (result.ok && (result.data as any)?.matches?.length === 0) {
          const retryResult = await searchContent(
            searchDir, input.pattern, input.include, limit,
            !(input.isRegexp ?? false), input.includeIgnoredFiles ?? false,
          );
          if ((retryResult.data as any)?.matches?.length > 0) {
            return {
              ...retryResult,
              message: retryResult.message + ` (retried as ${!(input.isRegexp ?? false) ? "regex" : "literal"})`,
            };
          }
        }

        return result;
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Search failed",
        };
      }
    },
  };
}

async function searchContent(
  dir: string,
  pattern: string,
  include: string | undefined,
  limit: number,
  isRegexp: boolean,
  includeIgnored: boolean,
): Promise<ToolResult> {
  const isWin = platform() === "win32";

  // Escape pattern for shell safety
  const safePattern = pattern.replace(/"/g, '\\"');
  const safeDir = dir.replace(/"/g, '\\"');

  let cmd: string;
  if (isWin) {
    // Prefer ripgrep (fast, handles .gitignore)
    const regexpFlag = isRegexp ? "" : "--fixed-strings";
    const includeArg = include ? `--glob "${include}"` : "";
    const ignoreArg = includeIgnored ? "--no-ignore" : "";
    cmd = `rg --no-heading --line-number --max-count ${limit} --ignore-case ${regexpFlag} ${includeArg} ${ignoreArg} -- "${safePattern}" "${safeDir}" 2>nul`;
    // Fallback to findstr if rg not installed
    cmd += ` || findstr /s /n /i /c:"${safePattern}" "${safeDir}\\${include || "*"}" 2>nul`;
  } else {
    const regexpFlag = isRegexp ? "" : "--fixed-strings";
    const includeArg = include ? `--glob "${include}"` : "";
    const ignoreArg = includeIgnored ? "--no-ignore" : "";
    cmd = `rg --no-heading --line-number --max-count ${limit} --ignore-case ${regexpFlag} ${includeArg} ${ignoreArg} -- "${safePattern}" "${safeDir}" 2>/dev/null`;
    // Fallback to grep
    const grepInclude = include ? `--include="${include}"` : "";
    const grepRegexp = isRegexp ? "-E" : "-F";
    cmd += ` || grep -rn -i ${grepRegexp} --max-count=${limit} ${grepInclude} -- "${safePattern}" "${safeDir}" 2>/dev/null`;
  }

  const { stdout } = await execAsync(cmd, { timeout: SEARCH_TIMEOUT, maxBuffer: 2 * 1024 * 1024 });
  const lines = stdout.trim().split("\n").filter(Boolean).slice(0, limit);

  if (lines.length === 0) {
    return { ok: true, message: `No matches for "${pattern}"`, data: { matches: [] } };
  }

  const matches = lines.map((line) => {
    // Parse "file:line:content" format
    const m = line.match(/^(.+?):(\d+):(.*)$/);
    if (m) {
      return { file: m[1]!, line: parseInt(m[2]!, 10), content: m[3]!.trim() };
    }
    return { file: "", line: 0, content: line.trim() };
  });

  return {
    ok: true,
    message: `Found ${matches.length} match${matches.length === 1 ? "" : "es"} for "${pattern}"`,
    data: { pattern, matches },
  };
}

async function searchFiles(
  dir: string,
  pattern: string,
  limit: number,
): Promise<ToolResult> {
  const isWin = platform() === "win32";
  const safeDir = dir.replace(/"/g, '\\"');
  // Strip glob wildcards — the LLM sometimes passes "*readme*" instead of "readme".
  // findstr and rg treat * as regex (0+ of prev char), which breaks matching.
  const cleanedPattern = pattern.replace(/[*?[\]]/g, "");
  if (!cleanedPattern) {
    return { ok: true, message: `No files matching "${pattern}" (empty after cleaning)`, data: { files: [] } };
  }
  const safePattern = cleanedPattern.replace(/"/g, '\\"');

  let cmd: string;
  if (isWin) {
    // Try ripgrep (respects .gitignore) then fall back to dir+findstr.
    // The `|| (...)` ensures the fallback runs when rg is not installed.
    cmd = `(rg --files "${safeDir}" 2>nul | findstr /i "${safePattern}") || (dir /s /b "${safeDir}" 2>nul | findstr /i "${safePattern}")`;
  } else {
    cmd = `find "${safeDir}" -type f -iname "*${safePattern}*" 2>/dev/null | head -n ${limit}`;
  }

  const { stdout } = await execAsync(cmd, { timeout: SEARCH_TIMEOUT, maxBuffer: 2 * 1024 * 1024 });
  const files = stdout.trim().split("\n").filter(Boolean).slice(0, limit);

  if (files.length === 0) {
    return { ok: true, message: `No files matching "${pattern}"`, data: { files: [] } };
  }

  return {
    ok: true,
    message: `Found ${files.length} file${files.length === 1 ? "" : "s"} matching "${pattern}"`,
    data: { pattern, files },
  };
}
