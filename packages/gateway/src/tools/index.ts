export type {
  ToolContext,
  ToolDefinition,
  ToolResult,
  ToolParametersSchema,
} from "./contracts.js";
export { ToolRegistry } from "./registry.js";

export { createTerminalRunTool, createTerminalStreamTool } from "./terminal-tools.js";
export {
  createFileReadTool,
  createFileWriteTool,
  createFilePatchTool,
  createFileListTool,
  createFileStatTool,
} from "./file-tools.js";
export { createOsQueryTool, createOsInstallTool } from "./os-tools.js";
export {
  createSurfacesListTool,
  createSurfacesStartTool,
  createSurfacesStopTool,
} from "./surface-tools.js";
export {
  createCronAddTool,
  createCronListTool,
  createCronRemoveTool,
  createCronUpdateTool,
} from "./cron-tools.js";
export { createGatewayStatusTool } from "./gateway-tools.js";
export {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
} from "./browser-tools.js";
export {
  createMemorySaveTool,
  createMemorySearchTool,
  createMemoryForgetTool,
} from "./memory-tools.js";

import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { SchedulerService } from "../scheduler/service.js";
import type { SessionService } from "../services/sessions.js";
import type { WsControlPlane } from "../ws.js";
import type { MemoryService } from "../memory/contracts.js";
import { ToolRegistry } from "./registry.js";
import { createTerminalRunTool, createTerminalStreamTool } from "./terminal-tools.js";
import {
  createFileReadTool,
  createFileWriteTool,
  createFilePatchTool,
  createFileListTool,
  createFileStatTool,
} from "./file-tools.js";
import { createOsQueryTool, createOsInstallTool } from "./os-tools.js";
import {
  createSurfacesListTool,
  createSurfacesStartTool,
  createSurfacesStopTool,
} from "./surface-tools.js";
import {
  createCronAddTool,
  createCronListTool,
  createCronRemoveTool,
  createCronUpdateTool,
} from "./cron-tools.js";
import { createGatewayStatusTool } from "./gateway-tools.js";
import {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
} from "./browser-tools.js";
import {
  createMemorySaveTool,
  createMemorySearchTool,
  createMemoryForgetTool,
} from "./memory-tools.js";

export interface ToolRegistryDeps {
  scheduler?: SchedulerService;
  sessionService?: SessionService;
  ws?: WsControlPlane;
  startedAt?: number;
  memoryService?: MemoryService;
}

/** Create a ToolRegistry with all gateway tools pre-registered. */
export function createToolRegistry(
  surfaceRegistry: SurfaceRegistry,
  deps: ToolRegistryDeps = {},
): ToolRegistry {
  const tools = new ToolRegistry();

  // Terminal tools
  tools.register(createTerminalRunTool(surfaceRegistry));
  tools.register(createTerminalStreamTool(surfaceRegistry));

  // File tools
  tools.register(createFileReadTool(surfaceRegistry));
  tools.register(createFileWriteTool(surfaceRegistry));
  tools.register(createFilePatchTool(surfaceRegistry));
  tools.register(createFileListTool(surfaceRegistry));
  tools.register(createFileStatTool(surfaceRegistry));

  // OS tools
  tools.register(createOsQueryTool());
  tools.register(createOsInstallTool());

  // Surface self-control tools
  tools.register(createSurfacesListTool(surfaceRegistry));
  tools.register(createSurfacesStartTool(surfaceRegistry));
  tools.register(createSurfacesStopTool(surfaceRegistry));

  // Scheduler tools
  if (deps.scheduler) {
    tools.register(createCronAddTool(deps.scheduler));
    tools.register(createCronListTool(deps.scheduler));
    tools.register(createCronRemoveTool(deps.scheduler));
    tools.register(createCronUpdateTool(deps.scheduler));
  }

  // Runtime status tool
  if (deps.sessionService && deps.ws) {
    tools.register(
      createGatewayStatusTool({
        sessionService: deps.sessionService,
        surfaceRegistry,
        ws: deps.ws,
        startedAt: deps.startedAt ?? Date.now(),
      }),
    );
  }

  // Memory tools
  if (deps.memoryService) {
    tools.register(createMemorySaveTool(deps.memoryService));
    tools.register(createMemorySearchTool(deps.memoryService));
    tools.register(createMemoryForgetTool(deps.memoryService));
  }

  // Browser + web tools
  tools.register(createBrowserNavigateTool(surfaceRegistry));
  tools.register(createBrowserSnapshotTool(surfaceRegistry));
  for (const tool of createBrowserInteractionTools(surfaceRegistry)) {
    tools.register(tool);
  }
  tools.register(createWebFetchTool());
  tools.register(createWebSearchTool());

  return tools;
}
