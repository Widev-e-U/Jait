export { PathGuard, PathTraversalError, type PathGuardOptions } from "./path-guard.js";
export { ConsentManager, type ConsentRequest, type ConsentDecision, type ConsentStatus, type ConsentManagerOptions } from "./consent-manager.js";
export { type ToolPermission, type ConsentLevel, type ToolPermissionConfig, requiresConsent, isCommandAllowed, isPathAllowedByPermission, matchGlob } from "./tool-permissions.js";
export { type ProfileName, getProfile, listProfiles, extendProfile } from "./tool-profiles.js";
export { TrustEngine, type TrustState } from "./trust-engine.js";
export { ConsentAwareExecutor, type ConsentAwareExecutorOptions, type ExecuteOptions } from "./consent-executor.js";
export type { TrustLevel, SecurityService, AuditRecord } from "./contracts.js";
