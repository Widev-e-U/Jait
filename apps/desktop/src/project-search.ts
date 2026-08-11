import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";

export const PROJECT_SEARCH_MAX_RESULTS = 200;
export const PROJECT_SEARCH_DEFAULT_RESULTS = 20;

const PROJECT_SEARCH_TIMEOUT_MS = 20_000;
const PROJECT_SEARCH_MAX_CANDIDATES = 2_000;
const PROJECT_SEARCH_MIN_CANDIDATES = 500;
const PROJECT_SEARCH_MAX_LINE_CHARS = 500;
const PROJECT_SEARCH_MAX_FILE_BYTES = 2 * 1024 * 1024;
const PROJECT_SEARCH_MAX_MATCHES_PER_FILE = 50;
const PROJECT_SEARCH_MAX_STDERR_CHARS = 600;
const PROJECT_SEARCH_MAX_STDOUT_BYTES = 8 * 1024 * 1024;
const PROJECT_SEARCH_FALLBACK_MAX_DIRECTORIES = 2_000;
const PROJECT_SEARCH_FALLBACK_MAX_FILES = 10_000;
const PROJECT_SEARCH_FALLBACK_MAX_READ_BYTES = 16 * 1024 * 1024;

const ALWAYS_SKIPPED_DIRS = new Set([".git"]);

const SEARCHABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".html",
  ".md",
  ".yaml",
  ".yml",
  ".svelte",
  ".vue",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".sh",
  ".toml",
  ".env",
  ".txt",
]);

const SOURCE_PATH_PATTERN = /(^|\/)(src|app|apps|lib|packages)(\/|$)/i;
const TEST_PATH_PATTERN = /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[^/]+$/i;
const GENERATED_PATH_PATTERN = /(^|\/)(node_modules|dist|build|release|out|coverage|web-dist|generated|vendor)(\/|$)/i;
const DEFINITION_PATTERN =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var|def|fn|struct|trait)\b/i;

export type ProjectSearchMode = "files" | "content";

export class ProjectSearchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectSearchInputError";
  }
}

export type ProjectSearchUnavailableReason =
  | "regexp_requires_rg"
  | "safe_fallback_unavailable";

export class ProjectSearchUnavailableError extends Error {
  constructor(
    public readonly reason: ProjectSearchUnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = "ProjectSearchUnavailableError";
  }
}

export interface ProjectSearchFile {
  path: string;
  relativePath: string;
  name: string;
  score: number;
}

export interface ProjectSearchMatch {
  file: string;
  relativePath: string;
  line: number;
  content: string;
  score: number;
}

export type ProjectSearchResult =
  | {
      query: string;
      mode: "files";
      files: ProjectSearchFile[];
      limited: boolean;
    }
  | {
      query: string;
      mode: "content";
      matches: ProjectSearchMatch[];
      limited: boolean;
    };

export interface ProjectSearchOptions {
  root: string;
  query: string;
  mode?: ProjectSearchMode;
  limit?: number;
  include?: string;
  isRegexp?: boolean;
  includeIgnoredFiles?: boolean;
}

export interface ProjectSearchRuntime {
  rgCommand?: string;
  gitCommand?: string;
  now?: () => number;
}

export type DesktopProjectSearchMode = ProjectSearchMode;

export type DesktopProjectSearchResult =
  | {
      query: string;
      mode: "files";
      files: Array<{ path: string; name: string }>;
      limited: boolean;
    }
  | {
      query: string;
      mode: "content";
      matches: Array<{ file: string; line: number; content: string }>;
      limited: boolean;
    };

export type DesktopProjectSearchOptions = ProjectSearchOptions;
export type DesktopProjectSearchRuntime = ProjectSearchRuntime;
export {
  ProjectSearchUnavailableError as DesktopProjectSearchUnavailableError,
};

export function resolveDesktopSearchRoot(
  cwd: string,
  requestedPath?: string,
): string {
  return resolve(cwd, requestedPath?.trim() || ".");
}

interface FileEnumerationResult {
  files: string[];
  limited: boolean;
}

interface FallbackContentResult {
  matches: Array<Omit<ProjectSearchMatch, "file" | "score">>;
  limited: boolean;
}

interface CommandResult {
  lines: string[];
  missing: boolean;
  code: number | null;
  stderr: string;
  limited: boolean;
  timedOut: boolean;
}

export function normalizeProjectSearchLimit(
  value: unknown,
  fallback = PROJECT_SEARCH_DEFAULT_RESULTS,
): number {
  const candidate = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate < 1) {
    throw new ProjectSearchInputError("limit must be a positive integer");
  }
  return Math.min(candidate, PROJECT_SEARCH_MAX_RESULTS);
}

export function projectSearchCandidateLimit(limit: number): number {
  return Math.min(
    PROJECT_SEARCH_MAX_CANDIDATES,
    Math.max(PROJECT_SEARCH_MIN_CANDIDATES, limit * 10),
  );
}

function normalizeRelativePath(root: string, value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized) return "";
  if (resolve(normalized) === normalized || /^[a-zA-Z]:\//.test(normalized)) {
    return relative(root, normalized).replace(/\\/g, "/");
  }
  return normalized;
}

function truncateContent(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= PROJECT_SEARCH_MAX_LINE_CHARS) return trimmed;
  return `${trimmed.slice(0, PROJECT_SEARCH_MAX_LINE_CHARS)}… (truncated, ${trimmed.length - PROJECT_SEARCH_MAX_LINE_CHARS} more chars)`;
}

function cleanedFileQuery(query: string): string {
  return query.replace(/[*?[\]]/g, "").trim().toLowerCase();
}

function stemFor(name: string): string {
  const extension = extname(name);
  return extension ? name.slice(0, -extension.length) : name;
}

function scorePath(relativePath: string, query: string): number {
  const normalizedPath = relativePath.toLowerCase();
  const name = basename(normalizedPath);
  const stem = stemFor(name);
  const segments = normalizedPath.split("/").filter(Boolean);
  const depth = Math.max(0, segments.length - 1);
  let score = 0;

  if (name === query) score += 1_000;
  else if (stem === query) score += 950;
  else if (name.startsWith(query)) score += 800;
  else if (stem.startsWith(query)) score += 750;
  else if (name.includes(query)) score += 650;
  else if (segments.some((segment) => segment === query)) score += 500;
  else if (normalizedPath.includes(query)) score += 300;

  if (SOURCE_PATH_PATTERN.test(normalizedPath)) score += 120;
  if (TEST_PATH_PATTERN.test(normalizedPath)) score -= 100;
  if (GENERATED_PATH_PATTERN.test(normalizedPath)) score -= 300;
  score -= Math.min(depth, 20);

  return score;
}

export function rankProjectFilePaths(
  paths: readonly string[],
  query: string,
  limit: number,
): Array<{ relativePath: string; score: number }> {
  const needle = cleanedFileQuery(query);
  if (!needle) return [];
  return paths
    .map((relativePath, index) => ({
      relativePath: relativePath.replace(/\\/g, "/").replace(/^\.\//, ""),
      score: scorePath(relativePath, needle),
      index,
    }))
    .filter((candidate) => candidate.relativePath.toLowerCase().includes(needle))
    .sort(
      (left, right) =>
        right.score - left.score
        || left.relativePath.localeCompare(right.relativePath)
        || left.index - right.index,
    )
    .slice(0, limit)
    .map(({ relativePath, score }) => ({ relativePath, score }));
}

export function rankDesktopFilePaths(
  paths: readonly string[],
  query: string,
  limit: number,
): string[] {
  return rankProjectFilePaths(paths, query, limit)
    .map(({ relativePath }) => relativePath);
}

export function rankProjectContentMatches(
  matches: readonly Omit<ProjectSearchMatch, "file" | "score">[],
  query: string,
  limit: number,
): Array<Omit<ProjectSearchMatch, "file">> {
  const needle = query.toLowerCase();
  const escapedNeedle = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namedDefinitionPattern = escapedNeedle
    ? new RegExp(
        `\\b(?:function|class|interface|type|enum|const|let|var|def|fn|struct|trait)\\s+${escapedNeedle}\\b`,
        "i",
      )
    : null;

  return matches
    .map((match, index) => {
      const normalizedPath = match.relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
      const lowerContent = match.content.toLowerCase();
      let score = scorePath(normalizedPath, cleanedFileQuery(query) || needle);
      if (lowerContent.trim() === needle) score += 700;
      if (namedDefinitionPattern?.test(match.content)) score += 1_200;
      else if (DEFINITION_PATTERN.test(match.content)) score += 500;
      if (lowerContent.includes(needle)) score += 100;
      return { ...match, relativePath: normalizedPath, score, index };
    })
    .sort(
      (left, right) =>
        right.score - left.score
        || left.relativePath.localeCompare(right.relativePath)
        || left.line - right.line
        || left.index - right.index,
    )
    .slice(0, limit)
    .map(({ index: _index, ...match }) => match);
}

function matchesInclude(relativePath: string, include: string | undefined): boolean {
  if (!include) return true;
  const normalized = relativePath.replace(/\\/g, "/");
  if (include.startsWith("*.")) return normalized.endsWith(include.slice(1));
  if (include.endsWith("/**")) return normalized.startsWith(include.slice(0, -3));
  return normalized.includes(include.replace(/\*/g, ""));
}

function runCommandLines(
  command: string,
  args: string[],
  cwd: string,
  limit: number,
  keep?: (line: string) => boolean,
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const lines: string[] = [];
    let stdoutRest = "";
    let stderr = "";
    let settled = false;
    let limited = false;
    let timedOut = false;
    let stdoutBytes = 0;

    const finish = (missing: boolean, code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stdoutRest && lines.length < limit && (!keep || keep(stdoutRest))) {
        lines.push(stdoutRest);
      }
      resolveResult({ lines, missing, code, stderr, limited, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      finish(false, null);
    }, PROJECT_SEARCH_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (settled) return;
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes > PROJECT_SEARCH_MAX_STDOUT_BYTES) {
        limited = true;
        stdoutRest = "";
        child.kill("SIGKILL");
        finish(false, null);
        return;
      }
      stdoutRest += chunk;
      const parts = stdoutRest.split("\n");
      stdoutRest = parts.pop() ?? "";
      for (const part of parts) {
        if (!part || (keep && !keep(part))) continue;
        lines.push(part);
        if (lines.length >= limit) {
          limited = true;
          stdoutRest = "";
          child.kill("SIGKILL");
          finish(false, null);
          return;
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < PROJECT_SEARCH_MAX_STDERR_CHARS) {
        stderr += chunk.slice(0, PROJECT_SEARCH_MAX_STDERR_CHARS - stderr.length);
      }
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        finish(true, null);
        return;
      }
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => finish(false, code));
  });
}

function runNulRecords(
  command: string,
  args: string[],
  cwd: string,
  limit: number,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const lines: string[] = [];
    let rest = "";
    let stderr = "";
    let stdoutBytes = 0;
    let settled = false;
    let limited = false;
    let timedOut = false;

    const finish = (missing: boolean, code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!limited && !timedOut && rest && lines.length < limit) lines.push(rest);
      resolveResult({ lines, missing, code, stderr, limited, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      finish(false, null);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (settled) return;
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes > PROJECT_SEARCH_MAX_STDOUT_BYTES) {
        limited = true;
        rest = "";
        child.kill("SIGKILL");
        finish(false, null);
        return;
      }
      rest += chunk;
      const parts = rest.split("\0");
      rest = parts.pop() ?? "";
      for (const part of parts) {
        if (!part) continue;
        lines.push(part);
        if (lines.length >= limit) {
          limited = true;
          rest = "";
          child.kill("SIGKILL");
          finish(false, null);
          return;
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < PROJECT_SEARCH_MAX_STDERR_CHARS) {
        stderr += chunk.slice(0, PROJECT_SEARCH_MAX_STDERR_CHARS - stderr.length);
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        finish(true, null);
        return;
      }
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => finish(false, code));
  });
}

function assertCommandSucceeded(command: string, result: CommandResult): void {
  if (result.timedOut) throw new Error(`${command} timed out.`);
  if (result.limited && result.code === null) return;
  if (result.code === 0 || result.code === 1 || result.missing) return;
  const detail = result.stderr.trim().split("\n")[0]?.trim();
  throw new Error(
    detail
      ? `${command} failed (exit ${result.code}): ${detail}`
      : `${command} failed${result.code === null ? "" : ` (exit ${result.code})`}.`,
  );
}

async function walkFiles(
  root: string,
  maxFiles: number,
  deadline: number,
  now: () => number,
): Promise<FileEnumerationResult> {
  const files: string[] = [];
  const queue = [root];
  let queueIndex = 0;
  let directories = 0;
  let discoveredDirectories = 1;
  let visitedFiles = 0;
  let limited = false;

  while (queueIndex < queue.length) {
    if (now() >= deadline) throw new Error("Project search timed out.");
    if (directories >= PROJECT_SEARCH_FALLBACK_MAX_DIRECTORIES) {
      limited = true;
      break;
    }
    const current = queue[queueIndex++]!;
    directories += 1;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (current === root) throw error;
      limited = true;
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (now() >= deadline) throw new Error("Project search timed out.");
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (ALWAYS_SKIPPED_DIRS.has(entry.name)) continue;
        if (discoveredDirectories >= PROJECT_SEARCH_FALLBACK_MAX_DIRECTORIES) {
          limited = true;
          continue;
        }
        discoveredDirectories += 1;
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      visitedFiles += 1;
      if (visitedFiles > PROJECT_SEARCH_FALLBACK_MAX_FILES) {
        limited = true;
        break;
      }
      files.push(relative(root, fullPath).replace(/\\/g, "/"));
      if (files.length >= maxFiles) {
        limited = true;
        break;
      }
    }
    if (
      limited
      && (
        visitedFiles > PROJECT_SEARCH_FALLBACK_MAX_FILES
        || files.length >= maxFiles
      )
    ) break;
  }
  return { files, limited };
}

function insideRoot(path: string): boolean {
  return path !== ".." && !path.startsWith("../") && !/^[A-Za-z]:\//.test(path);
}

async function enumerateFallbackFiles(
  root: string,
  includeIgnoredFiles: boolean,
  deadline: number,
  runtime: ProjectSearchRuntime,
): Promise<FileEnumerationResult> {
  const now = runtime.now ?? Date.now;
  if (now() >= deadline) throw new Error("Project search timed out.");
  if (includeIgnoredFiles) {
    return walkFiles(root, PROJECT_SEARCH_FALLBACK_MAX_FILES, deadline, now);
  }

  const run = await runNulRecords(
    runtime.gitCommand ?? "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."],
    root,
    PROJECT_SEARCH_FALLBACK_MAX_FILES,
    Math.max(1, deadline - now()),
  );
  if (run.missing) {
    throw new ProjectSearchUnavailableError(
      "safe_fallback_unavailable",
      "ripgrep is unavailable and Git is required for a privacy-safe fallback search.",
    );
  }
  if (run.timedOut) throw new Error("git ls-files timed out during fallback search.");
  if (!(run.code === 0 || (run.limited && run.code === null))) {
    throw new ProjectSearchUnavailableError(
      "safe_fallback_unavailable",
      "ripgrep is unavailable and a privacy-safe Git file listing could not be produced.",
    );
  }
  return {
    files: run.lines
      .map((value) => normalizeRelativePath(root, value))
      .filter((value) => value && insideRoot(value)),
    limited: run.limited,
  };
}

async function fallbackContentSearch(
  root: string,
  query: string,
  include: string | undefined,
  isRegexp: boolean,
  includeIgnoredFiles: boolean,
  limit: number,
  deadline: number,
  runtime: ProjectSearchRuntime,
): Promise<FallbackContentResult> {
  if (isRegexp) {
    throw new ProjectSearchUnavailableError(
      "regexp_requires_rg",
      "Regex search requires ripgrep; the bounded fallback supports literal text only.",
    );
  }

  const now = runtime.now ?? Date.now;
  const enumeration = await enumerateFallbackFiles(
    root,
    includeIgnoredFiles,
    deadline,
    runtime,
  );
  const needle = query.toLowerCase();
  const matches: Array<Omit<ProjectSearchMatch, "file" | "score">> = [];
  let limited = enumeration.limited;
  let readBytes = 0;

  for (const relativePath of enumeration.files) {
    if (now() >= deadline) throw new Error("Project search timed out.");
    if (!matchesInclude(relativePath, include)) continue;
    if (!SEARCHABLE_EXTENSIONS.has(extname(relativePath).toLowerCase())) continue;
    const absolutePath = resolve(root, relativePath);
    try {
      const info = await stat(absolutePath);
      if (!info.isFile()) continue;
      if (info.size > PROJECT_SEARCH_MAX_FILE_BYTES) {
        limited = true;
        continue;
      }
      if (readBytes + info.size > PROJECT_SEARCH_FALLBACK_MAX_READ_BYTES) {
        limited = true;
        break;
      }
      readBytes += info.size;
      const lines = (await readFile(absolutePath, "utf8")).split("\n");
      let perFile = 0;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (!line.toLowerCase().includes(needle)) continue;
        matches.push({
          relativePath,
          line: index + 1,
          content: truncateContent(line),
        });
        perFile += 1;
        if (perFile >= PROJECT_SEARCH_MAX_MATCHES_PER_FILE) {
          limited = true;
          break;
        }
        if (matches.length >= limit) {
          limited = true;
          break;
        }
      }
    } catch {
      limited = true;
    }
    if (matches.length >= limit) break;
  }

  return { matches, limited };
}

async function searchDesktopProjectCore(
  options: ProjectSearchOptions,
  runtime: ProjectSearchRuntime = {},
): Promise<ProjectSearchResult> {
  const root = resolve(options.root);
  const query = options.query.trim();
  if (!query) throw new ProjectSearchInputError("query is required");
  const mode = options.mode ?? "content";
  if (mode !== "files" && mode !== "content") {
    throw new ProjectSearchInputError('mode must be "files" or "content"');
  }
  const limit = normalizeProjectSearchLimit(options.limit);
  const maxCandidates = projectSearchCandidateLimit(limit);
  const now = runtime.now ?? Date.now;
  const deadline = now() + PROJECT_SEARCH_TIMEOUT_MS;
  const rgCommand = runtime.rgCommand ?? "rg";

  if (mode === "files") {
    const needle = cleanedFileQuery(query);
    if (!needle) return { query: options.query, mode, files: [], limited: false };
    const rgArgs = ["--files"];
    if (options.includeIgnoredFiles) {
      rgArgs.push("--no-ignore", "--hidden", "--glob", "!.git/**");
    }
    rgArgs.push(".");
    const run = await runCommandLines(
      rgCommand,
      rgArgs,
      root,
      maxCandidates,
      (line) => normalizeRelativePath(root, line).toLowerCase().includes(needle),
    );
    if (!run.missing) assertCommandSucceeded(rgCommand, run);
    const enumeration = run.missing
      ? await enumerateFallbackFiles(
          root,
          options.includeIgnoredFiles ?? false,
          deadline,
          runtime,
        )
      : {
          files: run.lines
            .map((line) => normalizeRelativePath(root, line))
            .filter((value) => value && insideRoot(value)),
          limited: run.limited,
        };
    const matchingCandidates = enumeration.files.filter(
      (path) => path.toLowerCase().includes(needle),
    );
    const candidates = matchingCandidates.slice(0, maxCandidates);
    const ranked = rankProjectFilePaths(candidates, query, limit);
    return {
      query: options.query,
      mode,
      limited:
        enumeration.limited
        || matchingCandidates.length > maxCandidates
        || candidates.length > limit,
      files: ranked.map(({ relativePath, score }) => ({
        path: resolve(root, relativePath),
        relativePath,
        name: basename(relativePath),
        score,
      })),
    };
  }

  const rgArgs = [
    "--no-heading",
    "--line-number",
    "--ignore-case",
    "--max-count",
    String(PROJECT_SEARCH_MAX_MATCHES_PER_FILE),
    "--max-columns",
    "2000",
    "--max-columns-preview",
  ];
  if (!options.isRegexp) rgArgs.push("--fixed-strings");
  if (options.include) rgArgs.push("--glob", options.include);
  if (options.includeIgnoredFiles) {
    rgArgs.push("--no-ignore", "--hidden", "--glob", "!.git/**");
  }
  rgArgs.push("--", query, ".");

  const run = await runCommandLines(rgCommand, rgArgs, root, maxCandidates);
  if (!run.missing) assertCommandSucceeded(rgCommand, run);
  const fallback = run.missing
    ? await fallbackContentSearch(
        root,
        query,
        options.include,
        options.isRegexp ?? false,
        options.includeIgnoredFiles ?? false,
        maxCandidates,
        deadline,
        runtime,
      )
    : null;
  const parsed = fallback
    ? fallback.matches
    : run.lines
        .map((line) => {
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (!match) return null;
          const relativePath = normalizeRelativePath(root, match[1]!);
          if (!relativePath || !insideRoot(relativePath)) return null;
          return {
            relativePath,
            line: Number.parseInt(match[2]!, 10),
            content: truncateContent(match[3]!),
          };
        })
        .filter((match): match is Omit<ProjectSearchMatch, "file" | "score"> => match !== null);

  const ranked = rankProjectContentMatches(parsed, query, limit);
  return {
    query: options.query,
    mode,
    limited: (fallback?.limited ?? run.limited) || parsed.length > limit,
    matches: ranked.map((match) => ({
      ...match,
      file: resolve(root, match.relativePath),
    })),
  };
}

export function runDesktopProjectSearch(
  options: DesktopProjectSearchOptions,
  runtime?: DesktopProjectSearchRuntime,
): Promise<DesktopProjectSearchResult>;
export function runDesktopProjectSearch(
  projectRoot: string,
  query: string,
  mode: DesktopProjectSearchMode,
  requestedLimit: number,
  includeIgnoredFiles?: boolean,
): Promise<DesktopProjectSearchResult>;
export async function runDesktopProjectSearch(
  optionsOrRoot: DesktopProjectSearchOptions | string,
  runtimeOrQuery: DesktopProjectSearchRuntime | string = {},
  legacyMode: DesktopProjectSearchMode = "content",
  legacyLimit = PROJECT_SEARCH_DEFAULT_RESULTS,
  legacyIncludeIgnoredFiles = false,
): Promise<DesktopProjectSearchResult> {
  const options: DesktopProjectSearchOptions = typeof optionsOrRoot === "string"
    ? {
        root: optionsOrRoot,
        query: typeof runtimeOrQuery === "string" ? runtimeOrQuery : "",
        mode: legacyMode,
        limit: legacyLimit,
        includeIgnoredFiles: legacyIncludeIgnoredFiles,
      }
    : optionsOrRoot;
  const runtime: DesktopProjectSearchRuntime =
    typeof optionsOrRoot === "string" || typeof runtimeOrQuery === "string"
      ? {}
      : runtimeOrQuery;
  const result = await searchDesktopProjectCore(options, runtime);
  if (result.mode === "files") {
    return {
      query: result.query,
      mode: result.mode,
      limited: result.limited,
      files: result.files.map(({ relativePath, name }) => ({
        path: relativePath,
        name,
      })),
    };
  }
  return {
    query: result.query,
    mode: result.mode,
    limited: result.limited,
    matches: result.matches.map(({ relativePath, line, content: matchContent }) => ({
      file: relativePath,
      line,
      content: matchContent,
    })),
  };
}

export async function runDesktopContentSearch(
  projectRoot: string,
  query: string,
  limit = 50,
): Promise<string> {
  const result = await runDesktopProjectSearch({
    root: projectRoot,
    query,
    mode: "content",
    limit,
  });
  if (result.mode !== "content") return "";
  return result.matches
    .map((match) => `${match.file}:${match.line}:${match.content}`)
    .join("\n");
}
