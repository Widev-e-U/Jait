/**
 * Resource claims for orchestration tasks. Keys are project-relative paths
 * ("src/lib.rs"; "." is the whole project) or opaque "name:<id>" resources.
 * Claims conflict when one side writes something the other reads or writes.
 */

export interface ResourceClaims {
  reads: string[];
  writes: string[];
  /**
   * A restriction inside `writes`, not a claim: it never conflicts with other tasks.
   * Nothing under these paths may be created, changed or deleted by the task.
   * Absent means no restriction. See pathIsProtected for the entry syntax.
   */
  protects?: string[];
}

export const PROJECT_ROOT_KEY = ".";

const NAMED_RESOURCE = /^name:[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const MAX_KEY_LENGTH = 240;

export function isNamedResourceKey(key: string): boolean {
  return key.startsWith("name:");
}

/**
 * Canonical form of one declared key, or null when it is not a safe
 * project-relative path or a valid named resource. Rejects absolute paths,
 * traversal, backslashes, drive prefixes and control characters.
 */
export function normalizeResourceKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > MAX_KEY_LENGTH) return null;
  if (value.startsWith("name:")) return NAMED_RESOURCE.test(value) ? value : null;
  if (value.startsWith("/") || value.includes("\\") || value.includes(":")) return null;
  if ([...value].some((char) => char.charCodeAt(0) < 32)) return null;
  const segments: string[] = [];
  for (const segment of value.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    segments.push(segment);
  }
  return segments.length === 0 ? PROJECT_ROOT_KEY : segments.join("/");
}

/** Keys overlap when they name the same path or one lies inside the other. Named resources match exactly. */
export function keysOverlap(a: string, b: string): boolean {
  if (isNamedResourceKey(a) || isNamedResourceKey(b)) return a === b;
  if (a === b || a === PROJECT_ROOT_KEY || b === PROJECT_ROOT_KEY) return true;
  return a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function anyOverlap(left: readonly string[], right: readonly string[]): boolean {
  return left.some((a) => right.some((b) => keysOverlap(a, b)));
}

/** A write conflicts with any overlapping read or write. Read/read never conflicts. */
export function claimsConflict(a: ResourceClaims, b: ResourceClaims): boolean {
  return anyOverlap(a.writes, b.writes) || anyOverlap(a.writes, b.reads) || anyOverlap(a.reads, b.writes);
}

/** True for an entry written as a glob (`*` or `?`) rather than as one literal path. */
export function isGlobKey(key: string): boolean {
  return key.includes("*") || key.includes("?");
}

/**
 * Wildcard match of one path segment: `*` matches any run of characters and `?`
 * exactly one. Iterative with a single backtrack point and no regular expression,
 * so a hostile pattern cannot cause catastrophic backtracking.
 */
function matchSegment(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    const symbol = pattern[p];
    if (symbol === "*") {
      star = p;
      mark = t;
      p += 1;
    } else if (p < pattern.length && (symbol === "?" || symbol === text[t])) {
      p += 1;
      t += 1;
    } else if (star !== -1) {
      p = star + 1;
      mark += 1;
      t = mark;
    } else {
      return false;
    }
  }
  while (pattern[p] === "*") p += 1;
  return p === pattern.length;
}

/** Matches a whole path (as segments) against a pattern whose `**` segments span any number of segments. */
function matchSegments(pattern: readonly string[], parts: readonly string[]): boolean {
  const width = parts.length + 1;
  const memo = new Map<number, boolean>();
  const visit = (patternIndex: number, partIndex: number): boolean => {
    if (patternIndex === pattern.length) return partIndex === parts.length;
    const key = patternIndex * width + partIndex;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const segment = pattern[patternIndex] as string;
    const result =
      segment === "**"
        ? visit(patternIndex + 1, partIndex) || (partIndex < parts.length && visit(patternIndex, partIndex + 1))
        : partIndex < parts.length &&
          matchSegment(segment, parts[partIndex] as string) &&
          visit(patternIndex + 1, partIndex + 1);
    memo.set(key, result);
    return result;
  };
  return visit(0, 0);
}

function entryProtects(entry: string, parts: readonly string[]): boolean {
  if (isNamedResourceKey(entry)) return false;
  if (entry === PROJECT_ROOT_KEY) return true;
  const pattern = entry.split("/");
  if (!pattern.includes("**")) {
    return parts.length >= pattern.length && pattern.every((segment, index) => matchSegment(segment, parts[index] as string));
  }
  for (let length = 1; length <= parts.length; length += 1) {
    if (matchSegments(pattern, parts.slice(0, length))) return true;
  }
  return false;
}

/**
 * True when a project-relative path lies under a protected entry. An entry
 * protects what it matches and everything below a matching directory, so `tests`
 * covers `tests/unit/a.ts` but not `testsuite/a.ts`. Entries are canonical keys
 * (see normalizeResourceKey): a literal path, or a glob where `*` and `?` stay
 * inside one segment and a `**` segment spans any number of segments. "." protects
 * the whole project. Named resources never protect a path.
 */
export function pathIsProtected(path: string, protects: readonly string[] | undefined): boolean {
  if (!protects || protects.length === 0) return false;
  const parts = path === PROJECT_ROOT_KEY ? [] : path.split("/");
  return protects.some((entry) => entryProtects(entry, parts));
}
