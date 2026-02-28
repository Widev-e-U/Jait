/**
 * Tool Permission Model — Sprint 4.2
 *
 * Per-tool configuration: consent level, allowed/denied commands & paths.
 * The consent level determines when user approval is required:
 *
 *   "none"      — always auto-execute (safe reads)
 *   "once"      — ask once, then auto for the session
 *   "always"    — always ask
 *   "dangerous" — always ask + show risk warning
 */

export type ConsentLevel = "none" | "once" | "always" | "dangerous";

export interface ToolPermission {
  /** Tool name (e.g. "terminal.run") */
  toolName: string;
  /** Consent level for this tool */
  consentLevel: ConsentLevel;
  /** Risk assessment shown in consent UI */
  risk: "low" | "medium" | "high";
  /** Allowed shell commands (glob patterns). Empty = all allowed. */
  allowedCommands?: string[];
  /** Denied shell commands (glob patterns). Takes precedence over allowed. */
  deniedCommands?: string[];
  /** Allowed file paths (glob patterns). Empty = all within workspace. */
  allowedPaths?: string[];
  /** Denied file paths (glob patterns). Takes precedence over allowed. */
  deniedPaths?: string[];
  /** Human-readable description of what this tool does */
  description?: string;
}

export interface ToolPermissionConfig {
  permissions: Map<string, ToolPermission>;
  /** Session-scoped set of tool names that have been approved via "once" */
  sessionApprovals: Set<string>;
}

/**
 * Check if a tool execution requires consent based on its permission config,
 * the current trust level, and whether it's been session-approved.
 */
export function requiresConsent(
  permission: ToolPermission | undefined,
  trustLevel: number,
  sessionApprovals: Set<string>,
): boolean {
  if (!permission) {
    // Unknown tools always require consent
    return true;
  }

  switch (permission.consentLevel) {
    case "none":
      return false;

    case "once":
      // Already approved in this session?
      if (sessionApprovals.has(permission.toolName)) return false;
      // Trust level 2+ auto-approves "once" tools
      if (trustLevel >= 2) return false;
      return true;

    case "always":
      // Trust level 3 (autopilot) can bypass "always"
      if (trustLevel >= 3) return false;
      return true;

    case "dangerous":
      // Always requires consent, regardless of trust level
      return true;

    default:
      return true;
  }
}

/**
 * Check if a command is allowed by the permission's allow/deny lists.
 * Returns { allowed: boolean, reason?: string }.
 */
export function isCommandAllowed(
  command: string,
  permission: ToolPermission | undefined,
): { allowed: boolean; reason?: string } {
  if (!permission) return { allowed: true };

  // Check denied commands first (takes precedence)
  if (permission.deniedCommands?.length) {
    for (const pattern of permission.deniedCommands) {
      if (matchGlob(command, pattern)) {
        return { allowed: false, reason: `Command matches denied pattern: ${pattern}` };
      }
    }
  }

  // If allowed commands are specified, command must match at least one
  if (permission.allowedCommands?.length) {
    const matches = permission.allowedCommands.some((p) => matchGlob(command, p));
    if (!matches) {
      return { allowed: false, reason: "Command not in allowed list" };
    }
  }

  return { allowed: true };
}

/**
 * Check if a file path is allowed by the permission's allow/deny lists.
 */
export function isPathAllowedByPermission(
  filePath: string,
  permission: ToolPermission | undefined,
): { allowed: boolean; reason?: string } {
  if (!permission) return { allowed: true };

  if (permission.deniedPaths?.length) {
    for (const pattern of permission.deniedPaths) {
      if (matchGlob(filePath, pattern)) {
        return { allowed: false, reason: `Path matches denied pattern: ${pattern}` };
      }
    }
  }

  if (permission.allowedPaths?.length) {
    const matches = permission.allowedPaths.some((p) => matchGlob(filePath, p));
    if (!matches) {
      return { allowed: false, reason: "Path not in allowed list" };
    }
  }

  return { allowed: true };
}

// ── Simple glob matcher ──────────────────────────────────────────────

/**
 * Simple glob matching: supports *, ?, and ** for path segments.
 * Not a full glob implementation — covers the common cases.
 */
export function matchGlob(value: string, pattern: string): boolean {
  // Escape regex special chars except * and ?
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".")
    .replace(/<<GLOBSTAR>>/g, ".*");

  const regex = new RegExp(`^${regexStr}$`, "i");
  return regex.test(value);
}
