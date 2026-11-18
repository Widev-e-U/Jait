/**
 * Resource claims for orchestration tasks. Keys are project-relative paths
 * ("src/lib.rs"; "." is the whole project) or opaque "name:<id>" resources.
 * Claims conflict when one side writes something the other reads or writes.
 */

export interface ResourceClaims {
  reads: string[];
  writes: string[];
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
