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
      "Search for files or text in the workspace.\n\n" +
      '**Content search** (default, mode="content"): Fast text/regex search through file contents. ' +
      "Returns matching lines with file paths and line numbers. " +
      "Use `isRegexp: true` when searching with regex patterns. " +
      "If you are not sure what words will appear in the workspace, prefer using regex patterns with " +
      'alternation (|) or character classes to search for multiple potential words at once instead of ' +
      "making separate searches. For example, use `function|method|procedure` to find all of those " +
      "at once. Use `include` to search within files matching a specific glob (e.g. \"*.ts\", \"src/**\").\n\n" +
      '**File search** (mode="files"): Find files by name pattern. Returns only file paths.\n\n' +
      "Use `includeIgnoredFiles: true` to search in normally-ignored directories like node_modules " +
      "or build outputs — but be aware this may be slower.\n\n" +
      "Use this tool when you want to see an overview of a file, instead of calling read many times.",
    tier: "core",
    category: "filesystem",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description:
            "The pattern to search for. Use regex with alternation (e.g. 'word1|word2') or character " +
            "classes to find multiple words in a single search. Set `isRegexp` appropriately.",
        },
        isRegexp: {
          type: "boolean",
          description:
            "Whether the pattern is a regex (default: false). Search is case-insensitive by default.",
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
          description:
            'File glob to filter results (e.g. "*.ts", "src/**/*.py"). ' +
            "Applied to paths relative to the search directory.",
        },
        limit: {
          type: "number",
          description:
            `Maximum number of results (default: ${DEFAULT_MAX_RESULTS}, max: ${MAX_RESULTS_CAP}). ` +
            "Don't set this unless necessary — it can slow things down.",
        },
        includeIgnoredFiles: {
          type: "boolean",
          description:
            "Whether to include files normally ignored by .gitignore and search.exclude settings. " +
            "Warning: may be slower. Only set when searching in node_modules or build outputs.",
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
  const safePattern = pattern.replace(/"/g, '\\"');

  let cmd: string;
  if (isWin) {
    cmd = `rg --files "${safeDir}" 2>nul | findstr /i "${safePattern}" | more +0 2>nul || dir /s /b "${safeDir}" 2>nul | findstr /i "${safePattern}"`;
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
