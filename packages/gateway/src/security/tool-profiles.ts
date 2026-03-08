/**
 * Tool Profiles — Sprint 4.3
 *
 * Pre-configured permission sets for common use cases:
 *   - minimal: read-only, no terminal, no installs
 *   - coding:  read/write/patch files, run commands with consent
 *   - full:    everything enabled, dangerous ops require consent
 */

import type { ToolPermission, ConsentLevel } from "./tool-permissions.js";

export type ProfileName = "minimal" | "coding" | "full";

/** Build a permission entry shorthand */
function perm(
  toolName: string,
  consentLevel: ConsentLevel,
  risk: ToolPermission["risk"],
  extra: Partial<ToolPermission> = {},
): ToolPermission {
  return { toolName, consentLevel, risk, ...extra };
}

// ── Minimal Profile ──────────────────────────────────────────────────
// Read-only. No terminal, no installs, no writes.

const MINIMAL: ToolPermission[] = [
  perm("file.read", "none", "low"),
  perm("file.list", "none", "low"),
  perm("file.stat", "none", "low"),
  perm("file.write", "dangerous", "high"),
  perm("file.patch", "dangerous", "high"),
  perm("terminal.run", "dangerous", "high"),
  perm("terminal.stream", "dangerous", "high"),
  perm("os.query", "once", "low"),
  perm("os.install", "dangerous", "high"),
  perm("surfaces.list", "none", "low"),
  perm("surfaces.start", "always", "medium"),
  perm("surfaces.stop", "always", "medium"),
  perm("network.scan", "none", "low"),
  perm("thread.control", "dangerous", "high"),
];

// ── Coding Profile ───────────────────────────────────────────────────
// File read/write/patch auto, terminal requires consent.

const CODING: ToolPermission[] = [
  perm("file.read", "none", "low"),
  perm("file.list", "none", "low"),
  perm("file.stat", "none", "low"),
  perm("file.write", "once", "medium"),
  perm("file.patch", "once", "medium"),
  perm("terminal.run", "once", "medium", {
    deniedCommands: ["rm -rf *", "del /s /q *", "format *", "mkfs*", "dd if=*"],
  }),
  perm("terminal.stream", "once", "medium"),
  perm("os.query", "none", "low"),
  perm("os.install", "always", "high"),
  perm("surfaces.list", "none", "low"),
  perm("surfaces.start", "once", "low"),
  perm("surfaces.stop", "once", "low"),
  perm("network.scan", "none", "low"),
  perm("thread.control", "once", "high"),
];

// ── Full Profile ─────────────────────────────────────────────────────
// Maximum capability. Dangerous ops still require consent.

const FULL: ToolPermission[] = [
  perm("file.read", "none", "low"),
  perm("file.list", "none", "low"),
  perm("file.stat", "none", "low"),
  perm("file.write", "none", "low"),
  perm("file.patch", "none", "low"),
  perm("terminal.run", "once", "medium", {
    deniedCommands: ["rm -rf /", "format C:", "mkfs*", "dd if=/dev/zero*"],
  }),
  perm("terminal.stream", "once", "medium"),
  perm("os.query", "none", "low"),
  perm("os.install", "once", "high"),
  perm("surfaces.list", "none", "low"),
  perm("surfaces.start", "none", "low"),
  perm("surfaces.stop", "none", "low"),
  perm("network.scan", "none", "low"),
  perm("thread.control", "once", "high"),
];

// ── Profile Map ──────────────────────────────────────────────────────

const PROFILES: Record<ProfileName, ToolPermission[]> = {
  minimal: MINIMAL,
  coding: CODING,
  full: FULL,
};

/**
 * Get a permission map for the given profile name.
 */
export function getProfile(name: ProfileName): Map<string, ToolPermission> {
  const perms = PROFILES[name];
  if (!perms) {
    throw new Error(`Unknown profile: ${name}`);
  }
  return new Map(perms.map((p) => [p.toolName, p]));
}

/**
 * List all available profile names.
 */
export function listProfiles(): ProfileName[] {
  return Object.keys(PROFILES) as ProfileName[];
}

/**
 * Create a custom permission map by extending a base profile with overrides.
 */
export function extendProfile(
  baseName: ProfileName,
  overrides: ToolPermission[],
): Map<string, ToolPermission> {
  const base = getProfile(baseName);
  for (const override of overrides) {
    base.set(override.toolName, override);
  }
  return base;
}
