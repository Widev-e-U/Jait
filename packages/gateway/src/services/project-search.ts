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

/**
 * Why a search could not run as asked.
 *
 * `safe_fallback_unavailable` is gone: enumeration no longer depends on Git, so
 * there is no longer a machine state in which a listing cannot be produced.
 */
export type ProjectSearchUnavailableReason = "regexp_requires_rg";

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

interface FileEnumerationResult {
  files: string[];
  limited: boolean;
}

/** One compiled `.gitignore` line. */
interface IgnoreRule {
  negated: boolean;
  dirOnly: boolean;
  regex: RegExp;
}

/** The rules from one `.gitignore`, plus the root-relative directory it governs. */
interface IgnoreScope {
  base: string;
  rules: IgnoreRule[];
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

/**
 * Spawns a search helper, keeping "the binary is missing" distinguishable from
 * "the cwd is unusable".
 *
 * `spawn` reports a bad `cwd` the same way it reports a missing executable —
 * asynchronously as ENOENT when the directory does not exist, and by throwing
 * synchronously as ENOTDIR when the path is a file. Both used to surface as
 * "ripgrep is unavailable and Git is required", which sent the model chasing a
 * non-existent tooling problem and retrying the same doomed call. The root is
 * validated by `assertSearchableRoot` before we get here, so anything left is a
 * genuinely missing binary — but a sync throw must still not escape as an
 * unhandled exception.
 */
function spawnSearchChild(command: string, args: string[], cwd: string) {
  try {
    return { child: spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] as const }) };
  } catch (error) {
    return { error: error as NodeJS.ErrnoException };
  }
}

function runCommandLines(
  command: string,
  args: string[],
  cwd: string,
  limit: number,
  keep?: (line: string) => boolean,
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const spawned = spawnSearchChild(command, args, cwd);
    if (spawned.error) {
      resolveResult({
        lines: [],
        missing: spawned.error.code === "ENOENT",
        code: null,
        stderr: spawned.error.message,
        limited: false,
        timedOut: false,
      });
      return;
    }
    const child = spawned.child;
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
    const spawned = spawnSearchChild(command, args, cwd);
    if (spawned.error) {
      resolveResult({
        lines: [],
        missing: spawned.error.code === "ENOENT",
        code: null,
        stderr: spawned.error.message,
        limited: false,
        timedOut: false,
      });
      return;
    }
    const child = spawned.child;
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

/**
 * Translates one `.gitignore` pattern into a matcher.
 *
 * Returns `null` for blanks and comments. Semantics follow gitignore(5) closely
 * enough for exclusion purposes: `!` negates, a trailing `/` restricts the rule
 * to directories, and a slash anywhere but the end anchors the pattern to the
 * directory holding the ignore file. `**` crosses path separators, `*` and `?`
 * do not.
 */
function compileIgnorePattern(rawPattern: string): IgnoreRule | null {
  // Trailing whitespace is insignificant unless escaped; a lone "\" is not a
  // pattern.
  const trimmed = rawPattern.replace(/(?<!\\)\s+$/, "");
  if (!trimmed || trimmed.startsWith("#")) return null;

  let pattern = trimmed;
  let negated = false;
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1);
  } else if (pattern.startsWith("\\#") || pattern.startsWith("\\!")) {
    pattern = pattern.slice(1);
  }

  let dirOnly = false;
  if (pattern.endsWith("/")) {
    dirOnly = true;
    pattern = pattern.slice(0, -1);
  }
  if (!pattern) return null;

  // A slash left anywhere anchors the pattern; otherwise it matches at any
  // depth below the ignore file.
  const anchored = pattern.includes("/");
  if (pattern.startsWith("/")) pattern = pattern.slice(1);

  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === "\\" && index + 1 < pattern.length) {
      index += 1;
      source += pattern[index]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      continue;
    }
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        // "**/" collapses to "any number of directories", so that "**/foo"
        // matches a bare "foo" too.
        if (pattern[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
        continue;
      }
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    if (char === "[") {
      const end = pattern.indexOf("]", index + 1);
      if (end > index) {
        const body = pattern.slice(index + 1, end).replace(/^!/, "^");
        source += `[${body}]`;
        index = end;
        continue;
      }
      source += "\\[";
      continue;
    }
    source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  const prefix = anchored ? "" : "(?:.*/)?";
  try {
    // Matching a directory must also ignore everything under it, hence the
    // optional trailing path segment.
    return { negated, dirOnly, regex: new RegExp(`^${prefix}${source}(?:/.*)?$`) };
  } catch {
    return null;
  }
}

function parseIgnoreFile(content: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const line of content.split(/\r?\n/)) {
    const rule = compileIgnorePattern(line);
    if (rule) rules.push(rule);
  }
  return rules;
}

/**
 * Loads the ignore rules a directory contributes, scoped to its own path.
 *
 * `base` is the directory's path relative to the search root, so rules are
 * matched against the same relative form regardless of how deep they were
 * declared.
 */
async function loadIgnoreScope(directory: string, base: string): Promise<IgnoreScope | null> {
  let content: string;
  try {
    content = await readFile(join(directory, ".gitignore"), "utf8");
  } catch {
    return null;
  }
  const rules = parseIgnoreFile(content);
  return rules.length > 0 ? { base, rules } : null;
}

/**
 * Whether `relativePath` is ignored by any scope in effect.
 *
 * Later rules win over earlier ones — including negations — and deeper scopes
 * win over shallower ones, matching how Git resolves conflicting patterns.
 */
function isIgnored(scopes: readonly IgnoreScope[], relativePath: string, isDirectory: boolean): boolean {
  let ignored = false;
  for (const scope of scopes) {
    if (scope.base && !relativePath.startsWith(`${scope.base}/`)) continue;
    const scoped = scope.base ? relativePath.slice(scope.base.length + 1) : relativePath;
    for (const rule of scope.rules) {
      // Files under a directory-only rule are excluded by never descending into
      // the directory, so the rule only has to be consulted for directories.
      if (rule.dirOnly && !isDirectory) continue;
      if (!rule.regex.test(scoped)) continue;
      ignored = !rule.negated;
    }
  }
  return ignored;
}

/**
 * Enumerates files under `root` without shelling out.
 *
 * When `respectIgnoreFiles` is set the walk honours `.gitignore` files as it
 * descends, which is what makes this usable as the primary enumeration path:
 * it produces the same privacy guarantee `git ls-files` provided without
 * needing Git — or any other binary — to be installed.
 */
async function walkFiles(
  root: string,
  maxFiles: number,
  deadline: number,
  now: () => number,
  respectIgnoreFiles = false,
): Promise<FileEnumerationResult> {
  const files: string[] = [];
  const queue: Array<{ path: string; relative: string; scopes: IgnoreScope[] }> = [
    { path: root, relative: "", scopes: [] },
  ];
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
      entries = await readdir(current.path, { withFileTypes: true });
    } catch (error) {
      if (current.path === root) throw error;
      limited = true;
      continue;
    }

    let scopes = current.scopes;
    if (respectIgnoreFiles) {
      const scope = await loadIgnoreScope(current.path, current.relative);
      if (scope) scopes = [...scopes, scope];
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (now() >= deadline) throw new Error("Project search timed out.");
      const fullPath = join(current.path, entry.name);
      const relativePath = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (ALWAYS_SKIPPED_DIRS.has(entry.name)) continue;
        if (respectIgnoreFiles && isIgnored(scopes, relativePath, true)) continue;
        if (discoveredDirectories >= PROJECT_SEARCH_FALLBACK_MAX_DIRECTORIES) {
          limited = true;
          continue;
        }
        discoveredDirectories += 1;
        queue.push({ path: fullPath, relative: relativePath, scopes });
        continue;
      }
      if (!entry.isFile()) continue;
      if (respectIgnoreFiles && isIgnored(scopes, relativePath, false)) continue;
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
  // Git is an optimisation here, not a requirement: it is faster and knows
  // about excludes the walker cannot see (global and repo-local excludes). When
  // it is absent, fails, or the directory is not a repository, the ignore-aware
  // walk produces an equivalent listing. Failing instead would surface a
  // machine-level problem the model can neither fix nor route around, which is
  // exactly the kind of dead end that turns one bad call into a retry loop.
  if (run.missing || run.timedOut || !(run.code === 0 || (run.limited && run.code === null))) {
    return walkFiles(root, PROJECT_SEARCH_FALLBACK_MAX_FILES, deadline, now, true);
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
  // Deliberately does NOT evaluate the pattern with the platform regex engine.
  // The pattern is model-supplied and JS regexes cannot be interrupted once
  // matching starts, so a catastrophic-backtracking pattern such as `(a+)+$`
  // would block the gateway's event loop outright. ripgrep's automaton has no
  // such failure mode, so regex stays gated on it.
  //
  // The caller turns this into an automatic literal search, so it is a routed
  // detour rather than a dead end.
  if (isRegexp) {
    throw new ProjectSearchUnavailableError(
      "regexp_requires_rg",
      "Regex search needs ripgrep, which is not installed; literal-text search is available without it.",
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

/**
 * Fails fast when the search root cannot be used as a working directory.
 *
 * Without this the bad root is only discovered by `spawn`, which reports it
 * identically to a missing binary — so a typo'd or relative-to-the-wrong-base
 * path came back as "ripgrep is unavailable and Git is required". That message
 * describes a machine-level problem the model cannot fix and does not name the
 * offending path, so the only apparent recovery is to try again.
 */
async function assertSearchableRoot(root: string): Promise<void> {
  let entry;
  try {
    entry = await stat(root);
  } catch {
    throw new ProjectSearchInputError(
      `Search path does not exist: ${root}. Pass a directory inside the project, or omit "path" to search from the project root.`,
    );
  }
  if (!entry.isDirectory()) {
    throw new ProjectSearchInputError(
      `Search path is a file, not a directory: ${root}. Pass its parent directory (optionally with an "include" glob), or read the file directly.`,
    );
  }
}

export async function searchProject(
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
  await assertSearchableRoot(root);
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
