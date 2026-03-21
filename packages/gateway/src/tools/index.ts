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
  createImageViewTool,
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
export { createThreadControlTool } from "./thread-tools.js";
export { createNetworkScanTool, getLatestNetworkScan, setLatestNetworkScan } from "./network-tools.js";
export { createRedeployTool } from "./redeploy-tools.js";
export { createMaintenanceRunTool } from "./maintenance-tools.js";
export { createArchitectureTool } from "./architecture-tools.js";
export {
  createPreviewOpenTool,
  createPreviewStartTool,
  createPreviewStopTool,
  createPreviewRestartTool,
  createPreviewStatusTool,
  createPreviewLogsTool,
  createPreviewInspectTool,
} from "./preview-tools.js";
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
  buildSystemPrompt,
  getReminderInstructions,
  promptRegistry,
  type ModelEndpoint,
  type IAgentPrompt,
  type PromptContext,
} from "./prompts/index.js";
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
  createImageViewTool,
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
import { createThreadControlTool } from "./thread-tools.js";
import { createNetworkScanTool } from "./network-tools.js";
import { createRedeployTool } from "./redeploy-tools.js";
import { createMaintenanceRunTool } from "./maintenance-tools.js";
import { createArchitectureTool } from "./architecture-tools.js";
import {
  createPreviewOpenTool,
  createPreviewStartTool,
  createPreviewStopTool,
  createPreviewRestartTool,
  createPreviewStatusTool,
  createPreviewLogsTool,
  createPreviewInspectTool,
} from "./preview-tools.js";
import { createToolsListTool, createToolsSearchTool } from "./meta-tools.js";
import type { VoiceService } from "../voice/service.js";
import { type AppConfig, inferContextWindow } from "../config.js";
import type { ThreadService } from "../services/threads.js";
import type { UserService } from "../services/users.js";
import type { SessionStateService } from "../services/session-state.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { PreviewService } from "../services/preview.js";
import type { ArchitectureDiagramService } from "../services/architecture-diagrams.js";

// ── Core tools (simplified set of 8) ────────────────────────────────
import {
  createReadTool,
  createEditTool,
  createExecuteTool,
  createSearchTool,
  createWebTool,
  createAgentTool,
  createTodoTool,
  createJaitTool,
} from "./core/index.js";

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
  threadMcpConfig?: { host: string; port: number };
  threadService?: ThreadService;
  providerRegistry?: ProviderRegistry;
  userService?: UserService;
  sessionState?: SessionStateService;
  maintenanceService?: import("../services/maintenance.js").MaintenanceService;
  notifications?: import("../services/notifications.js").NotificationService;
  /** Graceful shutdown callback — needed by the redeploy tool */
  shutdown?: () => Promise<void>;
  previewService?: PreviewService;
  architectureDiagramService?: ArchitectureDiagramService;
}

/** Create a ToolRegistry with all gateway tools pre-registered. */
export function createToolRegistry(
  surfaceRegistry: SurfaceRegistry,
  deps: ToolRegistryDeps = {},
): ToolRegistry {
  const tools = new ToolRegistry();

  // ════════════════════════════════════════════════════════════════════
  // Core tools (8 simplified tools — always sent to LLM)
  // ════════════════════════════════════════════════════════════════════
  tools.register(createReadTool(surfaceRegistry));
  tools.register(createEditTool(surfaceRegistry));
  tools.register(createExecuteTool(surfaceRegistry));
  tools.register(createSearchTool(surfaceRegistry));
  tools.register(createWebTool());
  tools.register(createTodoTool());
  tools.register(createJaitTool({
    memoryService: deps.memoryService,
    scheduler: deps.scheduler,
    sessionService: deps.sessionService,
    surfaceRegistry,
    ws: deps.ws,
    startedAt: deps.startedAt,
    hooks: deps.hooks,
  }));
  // Agent tool registered below (needs config for LLM settings)

  // ════════════════════════════════════════════════════════════════════
  // Standard tools (available via tools.search/tools.list, or for
  // backward compat — not sent to LLM by default in tiered mode)
  // ════════════════════════════════════════════════════════════════════

  // Terminal tools (underlying implementations for core "execute")
  tools.register(createTerminalRunTool(surfaceRegistry, undefined, deps.ws));
  tools.register(createTerminalStreamTool(surfaceRegistry));

  // File tools (underlying implementations for core "read"/"edit")
  tools.register(createFileReadTool(surfaceRegistry));
  tools.register(createFileWriteTool(surfaceRegistry));
  tools.register(createFilePatchTool(surfaceRegistry));
  tools.register(createFileListTool(surfaceRegistry));
  tools.register(createFileStatTool(surfaceRegistry));
  tools.register(createImageViewTool(surfaceRegistry));

  // OS tools
  tools.register(createOsQueryTool());
  tools.register(createOsInstallTool());

  // Surface self-control tools
  tools.register(createSurfacesListTool(surfaceRegistry));
  tools.register(createSurfacesStartTool(surfaceRegistry));
  tools.register(createSurfacesStopTool(surfaceRegistry));

  // Scheduler tools (underlying implementations for jait cron.*)
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

  // Self-update / redeploy tool
  if (deps.config && deps.shutdown) {
    tools.register(
      createRedeployTool({
        port: deps.config.port,
        shutdown: deps.shutdown,
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

  if (deps.threadService && deps.providerRegistry) {
    tools.register(
      createThreadControlTool({
        threadService: deps.threadService,
        providerRegistry: deps.providerRegistry,
        userService: deps.userService,
        ws: deps.ws,
        mcpConfig: deps.threadMcpConfig,
      }),
    );
  }

  if (deps.screenShare) {
    tools.register(createScreenShareTool(deps.screenShare, deps.ws));
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
  tools.register(createPreviewOpenTool(deps.ws, deps.sessionState, deps.previewService));
  tools.register(createPreviewStartTool(deps.ws, deps.sessionState, deps.previewService));
  tools.register(createPreviewStopTool(deps.ws, deps.sessionState, deps.previewService));
  tools.register(createPreviewRestartTool(deps.previewService));
  tools.register(createPreviewStatusTool(deps.previewService));
  tools.register(createPreviewLogsTool(deps.previewService));
  tools.register(createPreviewInspectTool(deps.previewService));
  tools.register(createWebFetchTool());
  tools.register(createWebSearchTool());
  tools.register(createBrowserSandboxStartTool());

  // Network tools
  tools.register(createNetworkScanTool());

  // Architecture tools
  tools.register(createArchitectureTool(deps.ws, deps.architectureDiagramService));

  // Maintenance tools
  if (deps.maintenanceService) {
    tools.register(createMaintenanceRunTool(deps.maintenanceService, deps.notifications));
  }

  // Agent spawn (sub-agent) tool — needs config for LLM settings
  if (deps.config) {
    const agentDeps = {
      toolRegistry: tools,
      getLLMConfig: (context: { apiKeys?: Record<string, string> }) => {
        const effectiveModel =
          context.apiKeys?.["OPENAI_MODEL"]?.trim() || deps.config!.openaiModel;
        return {
          openaiApiKey:
            context.apiKeys?.["OPENAI_API_KEY"]?.trim() || deps.config!.openaiApiKey,
          openaiBaseUrl:
            context.apiKeys?.["OPENAI_BASE_URL"]?.trim() || deps.config!.openaiBaseUrl,
          openaiModel: effectiveModel,
          contextWindow: context.apiKeys?.["OPENAI_MODEL"]?.trim()
            ? inferContextWindow(effectiveModel)
            : deps.config!.contextWindow,
        };
      },
    };
    // Core: simplified "agent" tool
    tools.register(createAgentTool(agentDeps));
    // Standard: legacy "agent.spawn" tool (backward compat)
    tools.register(createAgentSpawnTool(agentDeps));
  }

  return tools;
}
