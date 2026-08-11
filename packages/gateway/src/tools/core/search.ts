/**
 * search — Search files in the project by content or name.
 *
 * Search execution and ranking are shared with the project REST API. Commands
 * are launched with argv vectors, candidates are collected before ranking, and
 * only the final ranked results are capped for model context.
 */

import type { ToolDefinition, ToolResult, ToolContext } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import {
  PROJECT_SEARCH_DEFAULT_RESULTS,
  PROJECT_SEARCH_MAX_RESULTS,
  ProjectSearchUnavailableError,
  normalizeProjectSearchLimit,
  searchProject,
} from "../../services/project-search.js";
import type { ProjectSearchRuntime } from "../../services/project-search.js";
import { resolveProjectRoot } from "./get-fs.js";

interface SearchInput {
  /** The search pattern (text or regex) */
  pattern: string;
  /** Whether the pattern is a regex (default: false = literal text search) */
  isRegexp?: boolean;
  /** Directory to search in (defaults to project root) */
  path?: string;
  /** Search mode: "content" (grep) or "files" (find by name). Default: "content" */
  mode?: string;
  /** Include file glob pattern (e.g. "*.ts", "src/**"). Default: all files */
  include?: string;
  /** Maximum number of results (default: 20, max: 200) */
  limit?: number;
  /** Whether to include files normally ignored by .gitignore (default: false). */
  includeIgnoredFiles?: boolean;
}

function contentResultMessage(
  pattern: string,
  count: number,
  limit: number,
  limited: boolean,
): string {
  if (count === 0) return `No matches for "${pattern}"`;
  const suffix = limited
    ? ` (stopped at the ${limit}-result limit — narrow the pattern to see the rest)`
    : "";
  return `Found ${count} match${count === 1 ? "" : "es"} for "${pattern}"${suffix}`;
}

function fileResultMessage(pattern: string, count: number, limit: number, limited: boolean): string {
  if (count === 0) return `No files matching "${pattern}"`;
  const suffix = limited
    ? ` (stopped at the ${limit}-result limit — narrow the pattern to see the rest)`
    : "";
  return `Found ${count} file${count === 1 ? "" : "s"} matching "${pattern}"${suffix}`;
}

export function createSearchTool(
  registry: SurfaceRegistry,
  runtime: ProjectSearchRuntime = {},
): ToolDefinition<SearchInput> {
  return {
    name: "search",
    description:
      "Search for files or text in the project. "
      + 'mode="content" (default): grep through file contents and rank definitions/source files first. '
      + 'mode="files": rank filename and path matches. '
      + "Use isRegexp for regex patterns (e.g. 'word1|word2' for alternation).",
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
          description: "Directory to search in (defaults to project root).",
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
          description:
            `Max results (default: ${PROJECT_SEARCH_DEFAULT_RESULTS}, max: ${PROJECT_SEARCH_MAX_RESULTS}).`,
        },
        includeIgnoredFiles: {
          type: "boolean",
          description: "Include gitignored files (may be slower).",
        },
      },
      required: ["pattern"],
    },
    async execute(input: SearchInput, context: ToolContext): Promise<ToolResult> {
      const effectiveRoot = resolveProjectRoot(registry, context.sessionId, context.projectRoot);
      const searchRoot = input.path || effectiveRoot;

      try {
        const limit = normalizeProjectSearchLimit(input.limit);
        const mode = input.mode ?? "content";
        if (mode === "files") {
          const result = await searchProject(
            {
              root: searchRoot,
              query: input.pattern,
              mode: "files",
              limit,
              includeIgnoredFiles: input.includeIgnoredFiles,
            },
            runtime,
          );
          if (result.mode !== "files") throw new Error("Unexpected project search mode");
          const files = result.files.map((file) => file.path);
          return {
            ok: true,
            message: fileResultMessage(input.pattern, files.length, limit, result.limited),
            data: { pattern: input.pattern, files },
          };
        }

        const runContentSearch = async (isRegexp: boolean) => {
          const result = await searchProject(
            {
              root: searchRoot,
              query: input.pattern,
              mode: "content",
              limit,
              include: input.include,
              isRegexp,
              includeIgnoredFiles: input.includeIgnoredFiles,
            },
            runtime,
          );
          if (result.mode !== "content") throw new Error("Unexpected project search mode");
          return result;
        };

        const initialMode = input.isRegexp ?? false;
        let retriedAs: "regex" | "literal" | null = null;
        let result;
        try {
          result = await runContentSearch(initialMode);
        } catch (error) {
          const initialRegexUnavailable =
            initialMode
            && error instanceof ProjectSearchUnavailableError
            && error.reason === "regexp_requires_rg";
          if (!initialRegexUnavailable) throw error;
          const literalRetry = await runContentSearch(false);
          if (literalRetry.matches.length === 0) throw error;
          result = literalRetry;
          retriedAs = "literal";
        }
        if (result.matches.length === 0 && !retriedAs) {
          try {
            const retry = await runContentSearch(!initialMode);
            if (retry.matches.length > 0) {
              result = retry;
              retriedAs = initialMode ? "literal" : "regex";
            }
          } catch (error) {
            const optionalRegexRetryUnavailable =
              !initialMode
              && error instanceof ProjectSearchUnavailableError
              && error.reason === "regexp_requires_rg";
            if (!optionalRegexRetryUnavailable) throw error;
          }
        }

        const matches = result.matches.map(({ file, line, content }) => ({ file, line, content }));
        const retrySuffix = retriedAs ? ` (retried as ${retriedAs})` : "";
        return {
          ok: true,
          message:
            contentResultMessage(input.pattern, matches.length, limit, result.limited)
            + retrySuffix,
          data: { pattern: input.pattern, matches },
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Search failed",
        };
      }
    },
  };
}
