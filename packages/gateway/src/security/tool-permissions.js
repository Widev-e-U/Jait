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
/**
 * Check if a tool execution requires consent based on its permission config,
 * the current trust level, and whether it's been session-approved.
 */
export function requiresConsent(permission, trustLevel, sessionApprovals) {
    if (!permission) {
        // Unknown tools always require consent
        return true;
    }
    switch (permission.consentLevel) {
        case "none":
            return false;
        case "once":
            // Already approved in this session?
            if (sessionApprovals.has(permission.toolName))
                return false;
            // Trust level 2+ auto-approves "once" tools
            if (trustLevel >= 2)
                return false;
            return true;
        case "always":
            // Trust level 3 (autopilot) can bypass "always"
            if (trustLevel >= 3)
                return false;
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
export function isCommandAllowed(command, permission) {
    if (!permission)
        return { allowed: true };
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
export function isPathAllowedByPermission(filePath, permission) {
    if (!permission)
        return { allowed: true };
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
export function matchGlob(value, pattern) {
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
//# sourceMappingURL=tool-permissions.js.map