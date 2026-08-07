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
export type PolicySource = "profile" | "unknown-tool";

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
  /** Allowed file paths (glob patterns). Empty = all within project. */
  allowedPaths?: string[];
  /** Denied file paths (glob patterns). Takes precedence over allowed. */
  deniedPaths?: string[];
  /** Human-readable description of what this tool does */
  description: string;
}

export interface ResolvedToolPermission extends ToolPermission {
  /** Whether the tool has an explicit entry in the active profile */
  knownTool: boolean;
  /** Where this policy came from */
  source: PolicySource;
}

export interface ToolPermissionConfig {
  permissions: Map<string, ToolPermission>;
  /** Session-scoped set of tool names that have been approved via "once" */
  sessionApprovals: Set<string>;
}

const UNKNOWN_TOOL_DESCRIPTION =
  "Tool is not part of the active security profile and is treated as dangerous until explicitly configured.";

export function getUnknownToolPermission(toolName: string): ResolvedToolPermission {
  return {
    toolName,
    consentLevel: "dangerous",
    risk: "high",
    description: UNKNOWN_TOOL_DESCRIPTION,
    knownTool: false,
    source: "unknown-tool",
  };
}

export function resolveToolPermission(
  toolName: string,
  permissions: Map<string, ToolPermission>,
): ResolvedToolPermission {
  const permission = permissions.get(toolName);
  if (!permission) return getUnknownToolPermission(toolName);
  return {
    ...permission,
    knownTool: true,
    source: "profile",
  };
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
 * Shell commands that destroy work irreversibly.
 *
 * Consent is granted per *tool*, so a single approval of `terminal.run` (or an
 * approve-all session) authorizes every later command — including ones that
 * discard uncommitted work or kill processes by pattern. An agent that used
 * `git stash` to run a baseline test, or `pkill -f` to free a port, could then
 * destroy state nobody agreed to lose, as a side effect of an unrelated task.
 *
 * These patterns re-ask regardless of accumulated trust. They deliberately do
 * NOT cover ordinary outward-facing commands like `git push` or a deploy —
 * those get asked for explicitly and would only train users to click through.
 *
 * Matching runs over the whole command string so chained commands
 * (`a && b; c`) are covered. False positives fail safe: an extra prompt.
 */
const IRREVERSIBLE_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+stash\b(?!\s+list)/, reason: "git stash hides uncommitted work and can be lost on conflict" },
  { pattern: /\bgit\s+checkout\s+--\s/, reason: "git checkout -- discards uncommitted changes" },
  { pattern: /\bgit\s+restore\b(?!.*--staged\b)/, reason: "git restore discards uncommitted changes" },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: "git reset --hard discards commits and working-tree changes" },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/, reason: "git clean -f deletes untracked files" },
  { pattern: /\bgit\s+rm\b/, reason: "git rm removes files from the working tree or index" },
  { pattern: /\bgit\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b)/, reason: "force push rewrites remote history" },
  { pattern: /\brm\s+-[a-z]*[rf]/, reason: "rm -r/-f deletes files irreversibly" },
  { pattern: /\b(pkill|killall)\b/, reason: "kills processes by pattern and can hit unrelated ones" },
  { pattern: /\b(mkfs|dd)\s/, reason: "writes raw device or filesystem data" },
];

/**
 * Classify a shell command as irreversible. Used to force a consent prompt even
 * when the tool's own consent level would otherwise be satisfied.
 */
export function classifyIrreversibleCommand(
  command: string,
): { irreversible: boolean; reason?: string } {
  for (const { pattern, reason } of IRREVERSIBLE_COMMAND_PATTERNS) {
    if (pattern.test(command)) return { irreversible: true, reason };
  }
  return { irreversible: false };
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
