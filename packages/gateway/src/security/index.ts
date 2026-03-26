export { PathGuard, PathTraversalError, type PathGuardOptions } from "./path-guard.js";
export { ConsentManager, type ConsentRequest, type ConsentDecision, type ConsentStatus, type ConsentManagerOptions } from "./consent-manager.js";
export {
  type ToolPermission,
  type ConsentLevel,
  type PolicySource,
  type ResolvedToolPermission,
  type ToolPermissionConfig,
  requiresConsent,
  isCommandAllowed,
  isPathAllowedByPermission,
  matchGlob,
  getUnknownToolPermission,
  resolveToolPermission,
} from "./tool-permissions.js";
export { type ProfileName, getProfile, listProfiles, extendProfile, serializeProfile } from "./tool-profiles.js";
export { TrustEngine, type TrustState } from "./trust-engine.js";
export { ConsentAwareExecutor, type ConsentAwareExecutorOptions, type ExecuteOptions } from "./consent-executor.js";
export { SSRFGuard, type SSRFGuardOptions } from "./ssrf-guard.js";
export type { TrustLevel, SecurityService, AuditRecord } from "./contracts.js";
export { SandboxManager, type SandboxMountMode, type SandboxRunOptions, type SandboxRunResult, type SandboxBrowserOptions, type SandboxBrowserResult } from "./sandbox-manager.js";
