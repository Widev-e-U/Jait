/**
 * Tool Profiles — Sprint 4.3
 *
 * Pre-configured permission sets for common use cases:
 *   - minimal: read-only, no terminal, no installs
 *   - coding:  read/write/patch files, run commands with consent
 *   - full:    everything enabled, dangerous ops require consent
 */
import type { ToolPermission } from "./tool-permissions.js";
export type ProfileName = "minimal" | "coding" | "full";
/**
 * Get a permission map for the given profile name.
 */
export declare function getProfile(name: ProfileName): Map<string, ToolPermission>;
/**
 * List all available profile names.
 */
export declare function listProfiles(): ProfileName[];
/**
 * Create a custom permission map by extending a base profile with overrides.
 */
export declare function extendProfile(baseName: ProfileName, overrides: ToolPermission[]): Map<string, ToolPermission>;
//# sourceMappingURL=tool-profiles.d.ts.map