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
export declare function requiresConsent(permission: ToolPermission | undefined, trustLevel: number, sessionApprovals: Set<string>): boolean;
/**
 * Check if a command is allowed by the permission's allow/deny lists.
 * Returns { allowed: boolean, reason?: string }.
 */
export declare function isCommandAllowed(command: string, permission: ToolPermission | undefined): {
    allowed: boolean;
    reason?: string;
};
/**
 * Check if a file path is allowed by the permission's allow/deny lists.
 */
export declare function isPathAllowedByPermission(filePath: string, permission: ToolPermission | undefined): {
    allowed: boolean;
    reason?: string;
};
/**
 * Simple glob matching: supports *, ?, and ** for path segments.
 * Not a full glob implementation — covers the common cases.
 */
export declare function matchGlob(value: string, pattern: string): boolean;
//# sourceMappingURL=tool-permissions.d.ts.map