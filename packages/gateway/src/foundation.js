export { SurfaceRegistry } from "./surfaces/registry.js";
export { TerminalSurface, TerminalSurfaceFactory } from "./surfaces/terminal.js";
export { FileSystemSurface, FileSystemSurfaceFactory } from "./surfaces/filesystem.js";
export { PathGuard, PathTraversalError } from "./security/path-guard.js";
// Sprint 4 — Consent & Trust
export { ConsentManager } from "./security/consent-manager.js";
export { TrustEngine } from "./security/trust-engine.js";
export { ConsentAwareExecutor } from "./security/consent-executor.js";
export { requiresConsent, isCommandAllowed, isPathAllowedByPermission, matchGlob } from "./security/tool-permissions.js";
export { getProfile, listProfiles, extendProfile } from "./security/tool-profiles.js";
export { ToolRegistry } from "./tools/registry.js";
export { createToolRegistry } from "./tools/index.js";
export { MemoryEngine } from "./memory/service.js";
export { SqliteMemoryBackend } from "./memory/sqlite-backend.js";
//# sourceMappingURL=foundation.js.map