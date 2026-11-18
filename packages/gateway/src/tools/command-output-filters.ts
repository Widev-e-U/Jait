/**
 * Command-aware output compression ("output filters").
 *
 * A native, dependency-free take on the idea behind rtk
 * (https://github.com/rtk-ai/rtk): the shell commands an agent runs most often
 * — `git status`/`log`/`diff`, `ls`/`find`, `grep`/`rg`, and test runners —
 * produce verbose, highly redundant output that costs model context without
 * adding information.
 *
 * Jait already bounds terminal output generically (per-line elision plus a
 * middle truncation in `terminal-tools.ts`). Bounding keeps the *ends* of a
 * flood; it does not understand the command, so it will happily keep 64 KB of
 * passing-test lines and clip the one assertion that failed. These filters run
 * *before* that bounding step and rewrite recognized output into a compact,
 * faithful summary.
 *
 * Design rules:
 *  - Never lose failure/error signal. Summaries always keep failures, error
 *    summaries and totals; only passing/unchanged/redundant detail is collapsed.
 *  - Never grow the output. A filter that cannot make the text strictly smaller
 *    returns `null`, and the generic bounding path runs unchanged.
 *  - Never fabricate. If the format is not recognized, bail out (`null`) rather
 *    than guess at a summary.
 *  - The user-facing terminal replay is untouched; only the model-facing copies
 *    are compressed (see `terminal-tools.ts`).
 *
 * Unlike rtk, this does not rewrite the command (`git status` stays `git
 * status`). Jait runs commands in a persistent, user-visible PTY — the command
 * has already produced its output by the time we see it, so compressing the
 * captured text is both simpler and cheaper than intercepting the command.
 *
 * Toggle with `JAIT_COMMAND_OUTPUT_FILTERS` (default on; `0`/`false`/`off`
 * disables).
 */

/** Minimum captured size before a command's output is worth summarizing. */
const MIN_OUTPUT_CHARS = 200;

const DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

/**
 * Whether model-facing command output may be compressed. Enabled by default;
 * `JAIT_COMMAND_OUTPUT_FILTERS=0` (or `false`/`off`/`no`) turns it off.
 */
export function commandOutputFilteringEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env["JAIT_COMMAND_OUTPUT_FILTERS"];
  if (raw === undefined) return true;
  return !DISABLED_VALUES.has(raw.trim().toLowerCase());
}

export interface CompressedCommandOutput {
  /** The compressed text to hand the model. */
  output: string;
  /** Stable id of the filter that applied (e.g. `git-status`). */
  filterId: string;
  /** Short human-readable provenance note for the tool result message. */
  note: string;
  originalChars: number;
  compressedChars: number;
}

// ── Command parsing ──────────────────────────────────────────────

/**
 * Reduce a raw command to the "primary" command whose output we are about to
 * summarize.
 *
 * Jait prefixes agent commands with pager/editor-disabling env
 * (`export PAGER=cat …;`) or the PowerShell `$env:X = '…'` form, and the model
 * frequently chains `cd somewhere && cmd` or runs `sudo cmd`. All of that is
 * stripped so the filter can recognize the real command, and only the first
 * pipeline stage is kept (`git status | head` is still a git-status command).
 */
export function normalizeCommandForFiltering(command: string): string {
  let cmd = command.trim();
  // Jait's agent preamble: `export PAGER=cat MANPAGER=cat …;`
  cmd = cmd.replace(/^export\s+[^;\n]*;\s*/, "");
  // PowerShell variant: `$env:PAGER = 'cat'; $env:…; `
  cmd = cmd.replace(/^(?:\$env:[A-Za-z_][A-Za-z0-9_]*\s*=\s*'[^']*'\s*;\s*)+/, "");
  // Leading POSIX env assignments: `FOO=bar BAZ=qux grep …`
  cmd = cmd.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "");
  // `cd dir && cmd`
  cmd = cmd.replace(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*/, "");
  cmd = cmd.replace(/^\(\s*/, "");
  cmd = cmd.replace(/^sudo\s+/, "");
  return cmd.trim();
}

/** Split on unquoted `|` (a `||` is left intact as part of a stage). */
function splitPipelineStages(command: string): string[] {
  const stages: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]!;
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    if (ch === "|" && command[i + 1] === "|") { current += "||"; i += 1; continue; }
    if (ch === "|") { stages.push(current); current = ""; continue; }
    current += ch;
  }
  stages.push(current);
  return stages;
}

function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  const re = /(?:"[^"]*"|'[^']*'|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(segment)) !== null) {
    tokens.push(match[0].replace(/^['"]|['"]$/g, ""));
  }
  return tokens;
}

function basename(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut === -1 ? path : path.slice(cut + 1);
}

/** The tokenized first pipeline stage of the normalized command. */
export function resolvePrimaryCommand(command: string): { tokens: string[]; raw: string } {
  const first = splitPipelineStages(normalizeCommandForFiltering(command))[0] ?? "";
  return { tokens: tokenize(first), raw: first.trim() };
}

/**
 * The `git` subcommand, skipping global options that consume a value
 * (`-c name=value`, `-C dir`, `--git-dir=…`). Returns `null` when the command
 * is not a git invocation.
 */
function gitSubcommand(tokens: string[]): string | null {
  if (!tokens.length) return null;
  if (basename(tokens[0]!) !== "git" && basename(tokens[0]!) !== "git.exe") return null;
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token === "-c" || token === "-C" || token === "--git-dir" || token === "--work-tree") {
      i += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    return token;
  }
  return null;
}

const TEST_RUNNER_BINS = new Set([
  "vitest", "jest", "mocha", "ava", "tap", "phpunit", "rspec", "pytest",
]);

function isTestCommand(tokens: string[]): boolean {
  const bin = tokens[0] ? basename(tokens[0]) : "";
  if (!bin) return false;
  if (TEST_RUNNER_BINS.has(bin)) return true;
  const rest = tokens.slice(1);
  if (bin === "python" || bin === "python3" || bin === "py") {
    return rest.includes("-m") && rest.includes("pytest");
  }
  if (bin === "cargo" || bin === "go" || bin === "dotnet") {
    return rest[0] === "test";
  }
  if (bin === "npm" || bin === "pnpm" || bin === "yarn" || bin === "bun") {
    const script = rest[0] === "run" ? rest[1] : rest[0];
    return Boolean(script && (script === "test" || script.startsWith("test")));
  }
  return false;
}

// ── Shared helpers ───────────────────────────────────────────────

function truncateInline(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

// ── git status ───────────────────────────────────────────────────

type StatusCategory = "staged" | "modified" | "deleted" | "untracked" | "other";

interface StatusEntry {
  category: StatusCategory;
  path: string;
}

const HUMAN_STATUS_SECTIONS: Array<{ re: RegExp; category: StatusCategory }> = [
  { re: /^changes to be committed:/i, category: "staged" },
  { re: /^changes not staged for commit:/i, category: "modified" },
  { re: /^untracked files:/i, category: "untracked" },
  { re: /^unmerged paths:/i, category: "other" },
];

// In human `git status`, the section header decides staged vs. unstaged; only
// kinds whose meaning is unambiguous override it. A "modified" line under
// "Changes to be committed:" is a *staged* modification, so it must inherit the
// section rather than map to "modified".
const STATUS_ENTRY_KINDS: Record<string, StatusCategory | undefined> = {
  "new file": "staged",
  deleted: "deleted",
};

function parseHumanGitStatus(output: string): { branch: string | null; entries: StatusEntry[] } {
  const lines = output.split("\n");
  let branch: string | null = null;
  let category: StatusCategory | null = null;
  const entries: StatusEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const onBranch = /^on branch (.+)$/i.exec(trimmed);
    if (onBranch) { branch = onBranch[1]!.trim(); category = null; continue; }

    const ahead = /ahead of .*? by (\d+) commits?/i.exec(trimmed);
    if (ahead) { branch = `${branch ?? "?"} (ahead ${ahead[1]})`; continue; }
    const behind = /behind .*? by (\d+) commits?/i.exec(trimmed);
    if (behind) { branch = `${branch ?? "?"} (behind ${behind[1]})`; continue; }

    const section = HUMAN_STATUS_SECTIONS.find((s) => s.re.test(trimmed));
    if (section) { category = section.category; continue; }

    const entry = /^(new file|modified|deleted|renamed|typechange|copied|both modified):\s+(.+)$/i.exec(trimmed);
    if (entry && category) {
      const kind = entry[1]!.toLowerCase();
      entries.push({ category: STATUS_ENTRY_KINDS[kind] ?? category, path: entry[2]!.trim() });
      continue;
    }

    // Untracked (and other bare-list) sections list plain paths with no
    // "kind:" prefix; hint lines start with "(" and are skipped above.
    if (category === "untracked" && !trimmed.startsWith("(")) {
      entries.push({ category, path: trimmed });
    }
  }

  return { branch, entries };
}

/** Valid porcelain XY status codes; anything else is not an entry line. */
const PORCELAIN_CODES = new Set([" ", "M", "A", "D", "R", "C", "U", "T", "?", "!"]);

function parsePorcelainGitStatus(output: string): { branch: string | null; entries: StatusEntry[] } | null {
  const lines = output.split("\n").filter((l) => l.length > 0);
  const entries: StatusEntry[] = [];
  let branch: string | null = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      branch = line.slice(3).trim().replace(/^\.\.\./, "");
      continue;
    }
    const match = /^(..) (.+)$/.exec(line);
    if (!match) continue;
    const x = match[1]![0]!;
    const y = match[1]![1]!;
    // Guard against prose lines ("On branch main") that also match the width.
    if (!PORCELAIN_CODES.has(x) || !PORCELAIN_CODES.has(y)) continue;
    const path = match[2]!;

    if (x === "?" && y === "?") { entries.push({ category: "untracked", path }); continue; }
    if (x === "!" && y === "!") continue; // ignored

    if (x !== " " && x !== "?") {
      entries.push({ category: x === "D" ? "deleted" : "staged", path });
    }
    if (y !== " " && y !== "?") {
      entries.push({ category: y === "D" ? "deleted" : "modified", path });
    }
  }

  return entries.length > 0 || branch ? { branch, entries } : null;
}

const STATUS_LIST_CAP = 20;

export function compressGitStatus(output: string): string | null {
  const human = parseHumanGitStatus(output);
  let branch = human.branch;
  let entries = human.entries;

  if (entries.length === 0) {
    const porcelain = parsePorcelainGitStatus(output);
    if (porcelain) {
      branch = branch ?? porcelain.branch;
      entries = porcelain.entries;
    }
  }

  if (entries.length === 0 && !branch) return null;

  const order: StatusCategory[] = ["staged", "modified", "deleted", "untracked", "other"];
  const byCategory = new Map<StatusCategory, string[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry.path);
    byCategory.set(entry.category, list);
  }

  const parts: string[] = [];
  if (branch) parts.push(`branch: ${branch}`);
  if (entries.length === 0) parts.push("clean");
  for (const category of order) {
    const paths = byCategory.get(category);
    if (!paths?.length) continue;
    const shown = paths.slice(0, STATUS_LIST_CAP).join(", ");
    const more = paths.length > STATUS_LIST_CAP ? `, +${paths.length - STATUS_LIST_CAP} more` : "";
    parts.push(`${category}(${paths.length}): ${shown}${more}`);
  }

  return parts.length ? parts.join("\n") : null;
}

// ── git log ──────────────────────────────────────────────────────

const GIT_LOG_CAP = 50;

export function compressGitLog(output: string): string | null {
  const lines = output.split("\n");
  if (!lines.some((line) => /^commit [0-9a-f]{7,40}\b/.test(line))) return null;

  const commits: string[] = [];
  let hash: string | null = null;
  let author: string | null = null;
  let subject: string | null = null;

  const flush = () => {
    if (!hash) return;
    const short = hash.slice(0, 7);
    const title = subject ?? "(no subject)";
    commits.push(author ? `${short} ${author} — ${title}` : `${short} ${title}`);
  };

  for (const line of lines) {
    const commitMatch = /^commit ([0-9a-f]{7,40})/.exec(line);
    if (commitMatch) {
      flush();
      hash = commitMatch[1]!;
      author = null;
      subject = null;
      continue;
    }
    if (!hash) continue;
    const authorMatch = /^Author:\s*(.+?)\s*<.*>$/.exec(line);
    if (authorMatch) { author = authorMatch[1]!.trim(); continue; }
    if (/^(?:Author|Date|Merge|CommitDate):/.test(line)) continue;
    if (subject === null && /^ {4}\S/.test(line)) {
      subject = line.trim();
    }
  }
  flush();

  if (commits.length === 0) return null;
  const shown = commits.slice(0, GIT_LOG_CAP);
  if (commits.length > GIT_LOG_CAP) shown.push(`…and ${commits.length - GIT_LOG_CAP} more commits`);
  return shown.join("\n");
}

// ── git diff ─────────────────────────────────────────────────────

/**
 * Strip the parts of a unified diff that carry no information for a reader:
 * `index <sha>..<sha> <mode>` bookkeeping and `\ No newline at end of file`
 * noise. Stat/numstat output (no hunks) is already compact and is left alone,
 * and if nothing is removed the filter declines so the original is kept.
 */
export function compressGitDiff(output: string): string | null {
  const lines = output.split("\n");
  if (!lines.some((line) => line.startsWith("@@") || line.startsWith("diff --git "))) return null;
  if (!lines.some((line) => line.startsWith("@@"))) return null;

  const kept: string[] = [];
  let dropped = 0;
  for (const line of lines) {
    if (/^index [0-9a-f]+\.\.[0-9a-f]+/.test(line)) { dropped += 1; continue; }
    if (line.startsWith("\\ No newline at end of file")) { dropped += 1; continue; }
    kept.push(line);
  }
  if (dropped === 0) return null;
  return kept.join("\n");
}

// ── grep / rg / git grep ─────────────────────────────────────────

const GREP_MIN_LINES = 25;
const GREP_FILE_CAP = 20;
const GREP_PER_FILE_CAP = 8;

export function compressGrepOutput(output: string): string | null {
  const lines = output.split("\n").filter((line) => line.length > 0);
  if (lines.length < GREP_MIN_LINES) return null;

  const parsed: Array<{ file: string; line: string; text: string }> = [];
  for (const line of lines) {
    // Multi-file `-n` shape: `path:line:content`.
    const match = /^(.+?):(\d+):(.*)$/.exec(line);
    if (!match) return null;
    parsed.push({ file: match[1]!, line: match[2]!, text: match[3]! });
  }

  const byFile = new Map<string, Array<{ line: string; text: string }>>();
  for (const entry of parsed) {
    const list = byFile.get(entry.file) ?? [];
    list.push({ line: entry.line, text: entry.text });
    byFile.set(entry.file, list);
  }
  // A single file offers no grouping win — leave it to the generic path.
  if (byFile.size < 2) return null;

  const files = [...byFile.entries()];
  const out: string[] = [];
  for (const [file, matches] of files.slice(0, GREP_FILE_CAP)) {
    const shown = matches
      .slice(0, GREP_PER_FILE_CAP)
      .map((m) => `${m.line}:${truncateInline(m.text, 120)}`);
    const more = matches.length > GREP_PER_FILE_CAP ? `, +${matches.length - GREP_PER_FILE_CAP} more` : "";
    out.push(`${file} (${matches.length}): ${shown.join(", ")}${more}`);
  }
  if (files.length > GREP_FILE_CAP) out.push(`…and ${files.length - GREP_FILE_CAP} more files`);
  return out.join("\n");
}

// ── test runners ─────────────────────────────────────────────────

const TEST_SUMMARY_PATTERNS = [
  /^(?:Tests?|Test Suites?|Test Files|Suites?|Snapshots?|Time|Duration|Ran)\b.*\d/i,
  /\b\d+\s+(?:passed|failed|skipped|pending|todo|flaky|errors?|failures?)\b/i,
  /^test result:/i,
  /^(?:PASS|FAIL|PASSED|FAILED)\b/,
  /^ok\s+\S+/,
  /^\s*\d+\s+passing\b/i,
  /^\s*\d+\s+failing\b/i,
  /\bin \d+(?:\.\d+)?s\b/,
  /^=+ .*(?:passed|failed|error).* =+$/i,
];

const TEST_FAILURE_PATTERNS = [
  /^\s*FAIL(?:ED)?\b/,
  // Symbol markers (non-word chars) must not be followed by a word boundary.
  /^\s*(?:✗|✕|✘|×|✖|●)/,
  /^\s*--- FAIL:/,
  /^\s*not ok\b/,
  /^\s*E\s+\S/,
  /\bAssertionError\b/,
  /^\s*(?:error|Error|expected|Expected)\b/,
];

const TEST_MIN_LINES = 40;
const TEST_FAILURE_CONTEXT = 8;

/**
 * Keep failures, their immediate context and the run's summary lines; drop the
 * rest of a long run. Declines unless it actually removes a meaningful share of
 * the output, so short/clean runs are untouched.
 */
export function compressTestOutput(output: string): string | null {
  const lines = output.split("\n");
  if (lines.length < TEST_MIN_LINES) return null;

  const kept: string[] = [];
  let dropped = 0;
  let context = 0;
  let keptSignal = false;

  for (const line of lines) {
    if (TEST_SUMMARY_PATTERNS.some((re) => re.test(line))) {
      kept.push(line);
      context = 0;
      keptSignal = true;
      continue;
    }
    if (TEST_FAILURE_PATTERNS.some((re) => re.test(line))) {
      kept.push(line);
      context = TEST_FAILURE_CONTEXT;
      keptSignal = true;
      continue;
    }
    if (context > 0) {
      kept.push(line);
      context -= 1;
      if (!line.trim()) context = 0;
      continue;
    }
    dropped += 1;
  }

  if (!keptSignal) return null;
  if (dropped < lines.length * 0.25) return null;

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── ls / find path lists ─────────────────────────────────────────

const PATH_LIST_MIN_ENTRIES = 40;
const PATH_LIST_SAMPLE = 30;

const LONG_LIST_RE =
  /^[-dlbcps][-rwxsStT]{9}[.+@]?\s+\d+\s+\S+\s+\S+\s+\d+\s+(?:[A-Za-z]{3}\s+\d+\s+(?:\d{4}|\d{2}:\d{2})|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/;

/**
 * Collapse a long bare list of names/paths (`ls`, `ls -1`, `find`) into a count
 * plus an extension histogram and a short sample. Long `ls -l` rows are parsed
 * for their filename; unrecognized long rows abort the filter rather than
 * treating permission/owner columns as filenames.
 */
export function compressPathList(output: string): string | null {
  const names: string[] = [];

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^total\s+\d+$/.test(line)) continue;

    if (/^[-dlbcps][-rwxsStT]{9}/.test(line)) {
      const match = LONG_LIST_RE.exec(line);
      if (!match) return null; // long format we cannot parse safely
      names.push(match[1]!.trim());
      continue;
    }

    for (const token of line.split(/\s+/)) if (token) names.push(token);
  }

  if (names.length < PATH_LIST_MIN_ENTRIES) return null;

  const extCounts = new Map<string, number>();
  let withoutExt = 0;
  for (const name of names) {
    const dot = name.lastIndexOf(".");
    const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
    if (dot > slash && dot !== -1 && dot < name.length - 1) {
      const ext = name.slice(dot);
      if (ext.length <= 8) {
        extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
        continue;
      }
    }
    withoutExt += 1;
  }

  const hist = [...extCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ext, count]) => `${ext}: ${count}`)
    .join(", ");

  const parts = [`${names.length} entries`];
  if (hist) parts.push(`extensions: ${hist}`);
  if (withoutExt) parts.push(`no/other extension: ${withoutExt}`);
  parts.push(`sample: ${names.slice(0, PATH_LIST_SAMPLE).map((n) => basename(n)).join(", ")}`);
  if (names.length > PATH_LIST_SAMPLE) parts.push(`…and ${names.length - PATH_LIST_SAMPLE} more`);
  return parts.join("\n");
}

// ── Dispatch ─────────────────────────────────────────────────────

interface OutputFilter {
  id: string;
  matches: (tokens: string[]) => boolean;
  apply: (output: string) => string | null;
}

const OUTPUT_FILTERS: OutputFilter[] = [
  {
    id: "git-status",
    matches: (tokens) => gitSubcommand(tokens) === "status",
    apply: compressGitStatus,
  },
  {
    id: "git-log",
    matches: (tokens) => gitSubcommand(tokens) === "log",
    apply: compressGitLog,
  },
  {
    id: "git-diff",
    matches: (tokens) => gitSubcommand(tokens) === "diff",
    apply: compressGitDiff,
  },
  {
    id: "git-grep",
    matches: (tokens) => gitSubcommand(tokens) === "grep",
    apply: compressGrepOutput,
  },
  {
    id: "grep",
    matches: (tokens) => ["grep", "egrep", "fgrep", "rg", "ag"].includes(basename(tokens[0] ?? "")),
    apply: compressGrepOutput,
  },
  {
    id: "tests",
    matches: isTestCommand,
    apply: compressTestOutput,
  },
  {
    id: "path-list",
    matches: (tokens) => ["ls", "find", "tree"].includes(basename(tokens[0] ?? "")),
    apply: compressPathList,
  },
];

/**
 * Compress `output` according to the command that produced it.
 *
 * Returns `null` when the command is unrecognized, the output is too small to
 * matter, or the filter could not shrink it — in every case the caller falls
 * back to the generic bounding path.
 */
export function compressCommandOutput(
  command: string,
  output: string,
  options: { enabled?: boolean } = {},
): CompressedCommandOutput | null {
  if (options.enabled === false) return null;
  if (!output || output.length < MIN_OUTPUT_CHARS) return null;

  const { tokens } = resolvePrimaryCommand(command);
  if (tokens.length === 0) return null;

  for (const filter of OUTPUT_FILTERS) {
    if (!filter.matches(tokens)) continue;
    let compressed: string | null;
    try {
      compressed = filter.apply(output);
    } catch {
      compressed = null;
    }
    if (compressed === null) continue;

    const trimmed = compressed.trim();
    if (!trimmed || trimmed.length >= output.trim().length) continue;

    const originalChars = output.length;
    const compressedChars = trimmed.length;
    return {
      output: trimmed,
      filterId: filter.id,
      note: `output compressed (${filter.id}: ${originalChars.toLocaleString("en-US")}→${compressedChars.toLocaleString("en-US")} chars)`,
      originalChars,
      compressedChars,
    };
  }

  return null;
}
