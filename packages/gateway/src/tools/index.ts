export type { ToolContext, ToolDefinition, ToolResult, ToolParametersSchema } from "./contracts.js";
export { ToolRegistry } from "./registry.js";

export { createTerminalRunTool, createTerminalStreamTool } from "./terminal-tools.js";
export { createFileReadTool, createFileWriteTool, createFilePatchTool, createFileListTool, createFileStatTool } from "./file-tools.js";
export { createOsQueryTool, createOsInstallTool } from "./os-tools.js";
export { createSurfacesListTool, createSurfacesStartTool, createSurfacesStopTool } from "./surface-tools.js";
export {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
} from "./browser-tools.js";

import type { SurfaceRegistry } from "../surfaces/registry.js";
import { ToolRegistry } from "./registry.js";
import { createTerminalRunTool, createTerminalStreamTool } from "./terminal-tools.js";
import { createFileReadTool, createFileWriteTool, createFilePatchTool, createFileListTool, createFileStatTool } from "./file-tools.js";
import { createOsQueryTool, createOsInstallTool } from "./os-tools.js";
import { createSurfacesListTool, createSurfacesStartTool, createSurfacesStopTool } from "./surface-tools.js";
import {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
} from "./browser-tools.js";

/** Create a ToolRegistry with all Sprint 3 tools pre-registered */
export function createToolRegistry(surfaceRegistry: SurfaceRegistry): ToolRegistry {
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

  // Browser & web tools (Sprint 5)
  tools.register(createBrowserNavigateTool(surfaceRegistry));
  tools.register(createBrowserSnapshotTool(surfaceRegistry));
  for (const tool of createBrowserInteractionTools(surfaceRegistry)) {
    tools.register(tool);
  }
  tools.register(createWebFetchTool());
  tools.register(createWebSearchTool());

  return tools;
}
