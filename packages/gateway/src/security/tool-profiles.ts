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
  description: string,
  extra: Partial<ToolPermission> = {},
): ToolPermission {
  return { toolName, consentLevel, risk, description, ...extra };
}

// ── Minimal Profile ──────────────────────────────────────────────────
// Read-only. No terminal, no installs, no writes.

const MINIMAL: ToolPermission[] = [
  perm("file.read", "none", "low", "Read a file from the workspace."),
  perm("file.list", "none", "low", "List files and directories in the workspace."),
  perm("file.stat", "none", "low", "Inspect file metadata without changing contents."),
  perm("file.write", "dangerous", "high", "Create or overwrite files in the workspace."),
  perm("file.patch", "dangerous", "high", "Apply targeted edits to existing files."),
  perm("terminal.run", "dangerous", "high", "Run a non-interactive shell command."),
  perm("terminal.stream", "dangerous", "high", "Open an interactive terminal session."),
  perm("os.query", "once", "low", "Inspect operating-system information."),
  perm("os.install", "dangerous", "high", "Install system packages on the host."),
  perm("surfaces.list", "none", "low", "List active surfaces such as terminals or browsers."),
  perm("surfaces.start", "always", "medium", "Start a new surface instance."),
  perm("surfaces.stop", "always", "medium", "Stop a running surface instance."),
  perm("network.scan", "none", "low", "Scan the local network for reachable devices."),
  perm("thread.control", "dangerous", "high", "Create, run, or modify agent threads."),
  perm("gateway.redeploy", "always", "high", "Redeploy the running gateway process."),
];

// ── Coding Profile ───────────────────────────────────────────────────
// File read/write/patch auto, terminal requires consent.

const CODING: ToolPermission[] = [
  perm("file.read", "none", "low", "Read a file from the workspace."),
  perm("file.list", "none", "low", "List files and directories in the workspace."),
  perm("file.stat", "none", "low", "Inspect file metadata without changing contents."),
  perm("file.write", "once", "medium", "Create or overwrite files in the workspace."),
  perm("file.patch", "once", "medium", "Apply targeted edits to existing files."),
  perm("terminal.run", "once", "medium", "Run a non-interactive shell command.", {
    deniedCommands: ["rm -rf *", "del /s /q *", "format *", "mkfs*", "dd if=*"],
  }),
  perm("terminal.stream", "once", "medium", "Open an interactive terminal session."),
  perm("os.query", "none", "low", "Inspect operating-system information."),
  perm("os.install", "always", "high", "Install system packages on the host."),
  perm("surfaces.list", "none", "low", "List active surfaces such as terminals or browsers."),
  perm("surfaces.start", "once", "low", "Start a new surface instance."),
  perm("surfaces.stop", "once", "low", "Stop a running surface instance."),
  perm("network.scan", "none", "low", "Scan the local network for reachable devices."),
  perm("thread.control", "once", "high", "Create, run, or modify agent threads."),
  perm("gateway.redeploy", "always", "high", "Redeploy the running gateway process."),
];

// ── Full Profile ─────────────────────────────────────────────────────
// Maximum capability. Dangerous ops still require consent.

const FULL: ToolPermission[] = [
  perm("file.read", "none", "low", "Read a file from the workspace."),
  perm("file.list", "none", "low", "List files and directories in the workspace."),
  perm("file.stat", "none", "low", "Inspect file metadata without changing contents."),
  perm("file.write", "none", "low", "Create or overwrite files in the workspace."),
  perm("file.patch", "none", "low", "Apply targeted edits to existing files."),
  perm("terminal.run", "once", "medium", "Run a non-interactive shell command.", {
    deniedCommands: ["rm -rf /", "format C:", "mkfs*", "dd if=/dev/zero*"],
  }),
  perm("terminal.stream", "once", "medium", "Open an interactive terminal session."),
  perm("os.query", "none", "low", "Inspect operating-system information."),
  perm("os.install", "once", "high", "Install system packages on the host."),
  perm("surfaces.list", "none", "low", "List active surfaces such as terminals or browsers."),
  perm("surfaces.start", "none", "low", "Start a new surface instance."),
  perm("surfaces.stop", "none", "low", "Stop a running surface instance."),
  perm("network.scan", "none", "low", "Scan the local network for reachable devices."),
  perm("thread.control", "once", "high", "Create, run, or modify agent threads."),
  perm("gateway.redeploy", "always", "high", "Redeploy the running gateway process."),
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

export function serializeProfile(name: ProfileName): { name: ProfileName; permissions: ToolPermission[] } {
  return {
    name,
    permissions: [...getProfile(name).values()],
  };
}
