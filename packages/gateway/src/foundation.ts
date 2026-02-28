export type { Surface, SurfaceFactory, SurfaceSnapshot, SurfaceState } from "./surfaces/contracts.js";
export { SurfaceRegistry } from "./surfaces/registry.js";
export { TerminalSurface, TerminalSurfaceFactory } from "./surfaces/terminal.js";
export { FileSystemSurface, FileSystemSurfaceFactory } from "./surfaces/filesystem.js";

export { PathGuard, PathTraversalError } from "./security/path-guard.js";

// Sprint 4 — Consent & Trust
export { ConsentManager } from "./security/consent-manager.js";
export type { ConsentRequest as ConsentReq, ConsentDecision as ConsentDec, ConsentStatus, ConsentManagerOptions } from "./security/consent-manager.js";
export { TrustEngine } from "./security/trust-engine.js";
export type { TrustState } from "./security/trust-engine.js";
export { ConsentAwareExecutor } from "./security/consent-executor.js";
export type { ConsentAwareExecutorOptions, ExecuteOptions } from "./security/consent-executor.js";
export { requiresConsent, isCommandAllowed, isPathAllowedByPermission, matchGlob } from "./security/tool-permissions.js";
export type { ToolPermission, ConsentLevel, ToolPermissionConfig } from "./security/tool-permissions.js";
export { getProfile, listProfiles, extendProfile } from "./security/tool-profiles.js";
export type { ProfileName } from "./security/tool-profiles.js";

export type {
  ConsentDecision,
  ConsentRequest,
  AuditRecord,
  SecurityService,
  TrustLevel,
} from "./security/contracts.js";

export type { ToolContext, ToolDefinition, ToolResult } from "./tools/contracts.js";
export { ToolRegistry } from "./tools/registry.js";
export { createToolRegistry } from "./tools/index.js";

export type { MemoryEntry, MemoryService, SaveMemoryInput, MemorySource, MemoryScope, MemoryBackend } from "./memory/contracts.js";
export { MemoryEngine } from "./memory/service.js";
export { SqliteMemoryBackend } from "./memory/sqlite-backend.js";

export type { ScheduledJob, SchedulerService } from "./scheduler/contracts.js";

export type { PluginContext, PluginModule } from "./plugins/contracts.js";

export type { SessionDescriptor, SessionRouter } from "./sessions/contracts.js";
