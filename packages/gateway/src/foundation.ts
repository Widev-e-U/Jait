export type { Surface, SurfaceFactory, SurfaceSnapshot, SurfaceState } from "./surfaces/contracts.js";
export { SurfaceRegistry } from "./surfaces/registry.js";

export type {
  ConsentDecision,
  ConsentRequest,
  AuditRecord,
  SecurityService,
  TrustLevel,
} from "./security/contracts.js";

export type { ToolContext, ToolDefinition, ToolResult } from "./tools/contracts.js";

export type { MemoryEntry, MemoryService } from "./memory/contracts.js";

export type { ScheduledJob, SchedulerService } from "./scheduler/contracts.js";

export type { PluginContext, PluginModule } from "./plugins/contracts.js";

export type { SessionDescriptor, SessionRouter } from "./sessions/contracts.js";
