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
export { createScreenShareTool, createScreenCaptureTool, createScreenRecordTool, createOsTool } from "./screen-share-tools.js";
export {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
  createBrowserSandboxStartTool,
} from "./browser-tools.js";
export {
  createMemorySaveTool,
  createMemorySearchTool,
  createMemoryForgetTool,
} from "./memory-tools.js";
export { createVoiceSpeakTool } from "./voice-tools.js";
export { createAgentSpawnTool } from "./agent-tools.js";
export { createToolsListTool, createToolsSearchTool } from "./meta-tools.js";
export { McpManager, wrapMcpTool, registerMcpTools, unregisterMcpTools, type McpServerConfig, type McpConnection } from "./mcp-bridge.js";
export { ToolName, type ToolNameValue } from "./tool-names.js";
export { validateToolInput, type ValidationResult } from "./validate.js";
export {
  type ChatMode,
  CHAT_MODES,
  isValidChatMode,
  ASK_MODE_TOOLS,
  MUTATING_TOOLS,
  getSystemPromptForMode,
  type PlannedAction,
  type Plan,
} from "./chat-modes.js";
export {
  runAgentLoop,
  retryToolCall,
  buildToolSchemas,
  buildTieredToolSchemas,
  toolDefsToSchemas,
  parseOpenAIStream,
  serializeMessages,
  toOpenAIName,
  fromOpenAIName,
  SteeringController,
  ToolCallQueue,
  ToolCallPriority,
  type AgentLoopOptions,
  type AgentLoopResult,
  type AgentLoopEvent,
  type AgentMessage,
  type OpenAIToolCall,
  type OpenAIToolSchema,
  type LLMConfig,
  type ExecutedToolCall,
  type ToolExecutor,
} from "./agent-loop.js";

import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { SchedulerService } from "../scheduler/service.js";
import type { SessionService } from "../services/sessions.js";
import type { WsControlPlane } from "../ws.js";
import type { MemoryService } from "../memory/contracts.js";
import type { HookBus } from "../scheduler/hooks.js";
import type { ScreenShareService } from "@jait/screen-share";
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
import { createScreenShareTool, createScreenCaptureTool, createScreenRecordTool, createOsTool } from "./screen-share-tools.js";
import {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
  createBrowserSandboxStartTool,
} from "./browser-tools.js";
import {
  createMemorySaveTool,
  createMemorySearchTool,
  createMemoryForgetTool,
} from "./memory-tools.js";
import { createVoiceSpeakTool } from "./voice-tools.js";
import { createAgentSpawnTool } from "./agent-tools.js";
import { createToolsListTool, createToolsSearchTool } from "./meta-tools.js";
import type { VoiceService } from "../voice/service.js";
import type { AppConfig } from "../config.js";

export interface ToolRegistryDeps {
  scheduler?: SchedulerService;
  sessionService?: SessionService;
  ws?: WsControlPlane;
  startedAt?: number;
  memoryService?: MemoryService;
  hooks?: HookBus;
  voiceService?: VoiceService;
  screenShare?: ScreenShareService;
  config?: AppConfig;
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
        scheduler: deps.scheduler,
        hooks: deps.hooks,
      }),
    );
  }

  // Memory tools
  if (deps.memoryService) {
    tools.register(createMemorySaveTool(deps.memoryService));
    tools.register(createMemorySearchTool(deps.memoryService));
    tools.register(createMemoryForgetTool(deps.memoryService));
  }

  if (deps.voiceService) {
    tools.register(createVoiceSpeakTool(deps.voiceService));
  }

  if (deps.screenShare) {
    tools.register(createScreenShareTool(deps.screenShare));
    tools.register(createScreenCaptureTool(deps.screenShare));
    tools.register(createScreenRecordTool(deps.screenShare));
    tools.register(createOsTool(deps.screenShare, "os.tool"));
    tools.register(createOsTool(deps.screenShare, "os_tool"));
  }

  // Meta-tools (tool discovery — always core tier)
  tools.register(createToolsListTool(tools));
  tools.register(createToolsSearchTool(tools));

  // Browser + web tools
  tools.register(createBrowserNavigateTool(surfaceRegistry));
  tools.register(createBrowserSnapshotTool(surfaceRegistry));
  for (const tool of createBrowserInteractionTools(surfaceRegistry)) {
    tools.register(tool);
  }
  tools.register(createWebFetchTool());
  tools.register(createWebSearchTool());
  tools.register(createBrowserSandboxStartTool());

  // Agent spawn (sub-agent) tool — needs config for LLM settings
  if (deps.config) {
    tools.register(
      createAgentSpawnTool({
        toolRegistry: tools,
        getLLMConfig: (context) => ({
          openaiApiKey:
            context.apiKeys?.["OPENAI_API_KEY"]?.trim() || deps.config!.openaiApiKey,
          openaiBaseUrl:
            context.apiKeys?.["OPENAI_BASE_URL"]?.trim() || deps.config!.openaiBaseUrl,
          openaiModel:
            context.apiKeys?.["OPENAI_MODEL"]?.trim() || deps.config!.openaiModel,
        }),
      }),
    );
  }

  return tools;
}
