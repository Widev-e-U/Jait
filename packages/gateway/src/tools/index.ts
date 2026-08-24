export type {
  ToolContext,
  ToolDefinition,
  ToolResult,
  ToolParametersSchema,
  ToolSourceMetadata,
} from "./contracts.js";
export { ToolRegistry } from "./registry.js";

export { createTerminalRunTool, createJaitTerminalTool, createTerminalStreamTool } from "./terminal-tools.js";
export {
  createFileReadTool,
  createFileWriteTool,
  createFilePatchTool,
  createFileListTool,
  createFileStatTool,
  createImageViewTool,
} from "./file-tools.js";
export { createOsQueryTool, createOsInstallTool } from "./os-tools.js";
export { createOsControlToolset } from "./os-control-tools.js";
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
export { createProjectAssignRepositoryTool, createProjectCreateTool, createProjectMoveTool } from "./project-tools.js";
export { createProjectMessageTool } from "./project-message-tool.js";
export { createProjectEditorOpenTool } from "./project-editor-tools.js";
export { createJaitTodosTool } from "./repo-proposal-tools.js";
export { createUserAskTool } from "./user-question-tools.js";
export { createScreenShareTool, createScreenCaptureTool, createScreenRecordTool, createOsTool } from "./screen-share-tools.js";
export {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInspectTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
  createBrowserSandboxStartTool,
} from "./browser-tools.js";
import { createScreenshotCaptureTool } from "./screenshot-tools.js";
export { createScreenshotCaptureTool } from "./screenshot-tools.js";
export {
  createWindowsSandboxStartTool,
  createWindowsSandboxStopTool,
  createLinuxDesktopSandboxStartTool,
  createLinuxDesktopSandboxStopTool,
} from "./sandbox-tools.js";
export {
  createMemorySaveTool,
  createMemorySearchTool,
  createMemoryForgetTool,
  createMemoryHygieneTool,
  createMemoryListTool,
  createMemoryReviewChatsTool,
  createMemoryUpdateTool,
} from "./memory-tools.js";
export { createSessionSearchTool } from "./session-search-tools.js";
export { createChatTracesTool } from "./chat-traces-tools.js";
export { createVoiceSpeakTool } from "./voice-tools.js";
export { createAgentSpawnTool } from "./agent-tools.js";
export { createAgentMessageTool } from "./agent-message-tool.js";
export { createThreadControlTool } from "./thread-tools.js";
export { createNetworkScanTool, getLatestNetworkScan, setLatestNetworkScan } from "./network-tools.js";
export { createEmailTools } from "./email-tools.js";
export { createCalendarTools } from "./calendar-tools.js";
export {
  createHomeAssistantCallServiceTool,
  createHomeAssistantServicesTool,
  createHomeAssistantStatesTool,
} from "./homeassistant-tools.js";
export {
  createSshRunTool,
  createSshSessionStartTool,
  createSshSessionRunTool,
  createSshSessionCloseTool,
} from "./ssh-tools.js";
export { createElevatedRunTool } from "./elevated-tools.js";
export { createRedeployTool } from "./redeploy-tools.js";
export { createMaintenanceRunTool } from "./maintenance-tools.js";
export { createArchitectureTool } from "./architecture-tools.js";
export { createCodeGraphTools } from "./code-graph-tools.js";
export {
  createPreviewOpenTool,
  createPreviewStopTool,
  createPreviewRestartTool,
  createPreviewStatusTool,
  createPreviewLogsTool,
  createPreviewInspectTool,
} from "./preview-tools.js";
export { createToolsListTool, createToolsSearchTool } from "./meta-tools.js";
export { createSkillsManageTool, createExtensionsManageTool } from "./skill-tools.js";
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
  pruneHistory,
  repairToolCallHistory,
  generateLLMConversationSummary,
  CONTEXT_COMPACT_TRIGGER_RATIO,
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
  type LlmContextFlowRound,
  type ExecutedToolCall,
  type ToolExecutor,
} from "./agent-loop.js";
export { computeContextUsage, type ContextUsage } from "./token-estimator.js";

import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { SchedulerService } from "../scheduler/service.js";
import type { SessionService } from "../services/sessions.js";
import type { WsControlPlane } from "../ws.js";
import type { MemoryService } from "../memory/contracts.js";
import type { HookBus } from "../scheduler/hooks.js";
import type { ScreenShareService } from "@jait/screen-share";
import { ToolRegistry } from "./registry.js";
import { createTerminalRunTool, createJaitTerminalTool, createTerminalStreamTool } from "./terminal-tools.js";
import {
  createFileReadTool,
  createFileWriteTool,
  createFilePatchTool,
  createFileListTool,
  createFileStatTool,
  createImageViewTool,
} from "./file-tools.js";
import { createOsQueryTool, createOsInstallTool } from "./os-tools.js";
import { createOsControlToolset } from "./os-control-tools.js";
import { createOsControlResolver } from "../os-control/resolver.js";
import { SandboxManager } from "../security/sandbox-manager.js";
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
import { createProjectAssignRepositoryTool, createProjectCreateTool, createProjectMoveTool } from "./project-tools.js";
import { createProjectMessageTool } from "./project-message-tool.js";
import { createProjectEditorOpenTool } from "./project-editor-tools.js";
import { createJaitTodosTool } from "./repo-proposal-tools.js";
import { createUserAskTool } from "./user-question-tools.js";
import { createScreenShareTool, createScreenCaptureTool, createScreenRecordTool, createOsTool } from "./screen-share-tools.js";
import {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInspectTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
  createBrowserSandboxStartTool,
} from "./browser-tools.js";
import {
  createWindowsSandboxStartTool,
  createWindowsSandboxStopTool,
  createLinuxDesktopSandboxStartTool,
  createLinuxDesktopSandboxStopTool,
} from "./sandbox-tools.js";
import {
  createMemorySaveTool,
  createMemorySearchTool,
  createMemoryForgetTool,
  createMemoryHygieneTool,
  createMemoryListTool,
  createMemoryReviewChatsTool,
  createMemoryUpdateTool,
} from "./memory-tools.js";
import { createSessionSearchTool } from "./session-search-tools.js";
import { createChatTracesTool } from "./chat-traces-tools.js";
import { createVoiceSpeakTool } from "./voice-tools.js";
import { createAgentSpawnTool } from "./agent-tools.js";
import { createAgentMessageTool } from "./agent-message-tool.js";
import { createThreadControlTool } from "./thread-tools.js";
import { createNetworkScanTool } from "./network-tools.js";
import { createEmailTools } from "./email-tools.js";
import { createCalendarTools } from "./calendar-tools.js";
import {
  createHomeAssistantCallServiceTool,
  createHomeAssistantServicesTool,
  createHomeAssistantStatesTool,
} from "./homeassistant-tools.js";
import {
  createSshRunTool,
} from "./ssh-tools.js";
import { createElevatedRunTool } from "./elevated-tools.js";
import { createRedeployTool } from "./redeploy-tools.js";
import { createMaintenanceRunTool } from "./maintenance-tools.js";
import { createMobileAlarmScheduleTool } from "./mobile-tools.js";
import { createArchitectureTool } from "./architecture-tools.js";
import { createCodeGraphTools } from "./code-graph-tools.js";
import {
  createPreviewOpenTool,
  createPreviewStopTool,
  createPreviewRestartTool,
  createPreviewStatusTool,
  createPreviewLogsTool,
  createPreviewInspectTool,
} from "./preview-tools.js";
import { createToolsListTool, createToolsSearchTool } from "./meta-tools.js";
import type { VoiceService } from "../voice/service.js";
import { type AppConfig } from "../config.js";
import type { ThreadService } from "../services/threads.js";
import type { UserService } from "../services/users.js";
import type { SessionStateService } from "../services/session-state.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { PreviewService } from "../services/preview.js";
import type { ArchitectureDiagramService } from "../services/architecture-diagrams.js";
import type { CodeGraphService } from "../services/code-graph/code-graphs.js";
import type { SecretInputService } from "../services/secret-input.js";
import type { UserQuestionService } from "../services/user-questions.js";
import type { UserSecretService } from "../services/user-secrets.js";
import type { ProjectService } from "../services/projects.js";
import type { RepositoryService } from "../services/repositories.js";
import type { GitService } from "../services/git.js";
import type { RepoProposalService } from "../services/repo-proposals.js";
import type { ReminderService } from "../services/reminders.js";
import type { SessionSearchService } from "../services/session-search.js";
import type { ChatTracesService } from "../services/chat-traces.js";
import { resolveJaitLlmConfig } from "../services/jait-llm.js";
import type { JaitBackend } from "../services/users.js";

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
  projectService?: ProjectService;
  repoService?: RepositoryService;
  repoProposalService?: RepoProposalService;
  reminderService?: ReminderService;
  sessionSearchService?: SessionSearchService;
  chatTracesService?: ChatTracesService;
  gitService?: GitService;
  maintenanceService?: import("../services/maintenance.js").MaintenanceService;
  notifications?: import("../services/notifications.js").NotificationService;
  mobilePush?: import("../services/mobile-push.js").MobilePushService;
  /** Graceful shutdown callback — needed by the redeploy tool */
  shutdown?: () => Promise<void>;
  previewService?: PreviewService;
  architectureDiagramService?: ArchitectureDiagramService;
  codeGraphService?: CodeGraphService;
  secretInputService?: SecretInputService;
  userQuestionService?: UserQuestionService;
  userSecretService?: UserSecretService;
  emailService?: import("../services/email/index.js").EmailService;
  calendarService?: import("../services/calendar/index.js").CalendarService;
  skillRegistry?: import("../skills/index.js").SkillRegistry;
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
  tools.register(createExecuteTool(surfaceRegistry, deps.secretInputService, deps.ws));
  tools.register(createSearchTool(surfaceRegistry));
  tools.register(createWebTool());
  tools.register(createTodoTool());
  tools.register(createJaitTool({
    memoryService: deps.memoryService,
    reminderService: deps.reminderService,
    scheduler: deps.scheduler,
    sessionService: deps.sessionService,
    surfaceRegistry,
    ws: deps.ws,
    startedAt: deps.startedAt,
    hooks: deps.hooks,
  }));
  // Agent tool registered below (needs config for LLM settings)

  // ════════════════════════════════════════════════════════════════════
  // Standard tools (discovered via tools.search/tools.list)
  // ════════════════════════════════════════════════════════════════════

  // Terminal tools (underlying implementations for core "execute")
  tools.register(createTerminalRunTool(surfaceRegistry, undefined, deps.ws, deps.secretInputService));
  tools.register(createJaitTerminalTool(surfaceRegistry, undefined, deps.ws, deps.secretInputService));
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

  if (deps.projectService && deps.repoService) {
    tools.register(
      createProjectCreateTool({
        projectService: deps.projectService,
        repoService: deps.repoService,
        gitService: deps.gitService,
        ws: deps.ws,
      }),
    );
    tools.register(
      createProjectAssignRepositoryTool({
        projectService: deps.projectService,
        repoService: deps.repoService,
        gitService: deps.gitService,
        ws: deps.ws,
      }),
    );
    tools.register(
      createProjectMoveTool({
        projectService: deps.projectService,
        repoService: deps.repoService,
        gitService: deps.gitService,
        ws: deps.ws,
      }),
    );
  }

  tools.register(createProjectEditorOpenTool(deps.ws));

  if (deps.repoService && deps.repoProposalService) {
    tools.register(createJaitTodosTool({
      repoService: deps.repoService,
      repoProposalService: deps.repoProposalService,
      threadService: deps.threadService,
    }));
  }

  if (deps.userQuestionService) {
    tools.register(createUserAskTool(deps.userQuestionService));
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
    tools.register(createMemorySaveTool(deps.memoryService, deps.reminderService));
    tools.register(createMemorySearchTool(deps.memoryService, deps.reminderService));
    tools.register(createMemoryForgetTool(deps.memoryService, deps.reminderService));
  }
  if (deps.reminderService) {
    tools.register(createMemoryListTool(deps.reminderService));
    tools.register(createMemoryUpdateTool(deps.reminderService));
    tools.register(createMemoryHygieneTool(deps.reminderService));
    tools.register(createMemoryReviewChatsTool(deps.reminderService));
  }
  if (deps.sessionSearchService) {
    tools.register(createSessionSearchTool(deps.sessionSearchService));
  }
  if (deps.chatTracesService) {
    tools.register(createChatTracesTool(deps.chatTracesService));
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
        sessionState: deps.sessionState,
        skillRegistry: deps.skillRegistry,
        ws: deps.ws,
        mcpConfig: deps.threadMcpConfig,
        config: deps.config,
      }),
    );
  }

  if (deps.threadService && deps.providerRegistry && deps.projectService && deps.sessionService) {
    tools.register(
      createProjectMessageTool({
        projectService: deps.projectService,
        sessionService: deps.sessionService,
        threadService: deps.threadService,
        providerRegistry: deps.providerRegistry,
        userService: deps.userService,
        sessionState: deps.sessionState,
        skillRegistry: deps.skillRegistry,
        ws: deps.ws,
        mcpConfig: deps.threadMcpConfig,
        config: deps.config,
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
  tools.register(createBrowserNavigateTool(surfaceRegistry, undefined));
  tools.register(createBrowserSnapshotTool(surfaceRegistry, undefined));
  tools.register(createBrowserInspectTool(surfaceRegistry, undefined));
  for (const tool of createBrowserInteractionTools(surfaceRegistry, undefined)) {
    tools.register(tool);
  }
  tools.register(createPreviewOpenTool(deps.ws, deps.sessionState, deps.previewService));
  tools.register(createPreviewStopTool(deps.ws, deps.sessionState, deps.previewService));
  tools.register(createPreviewRestartTool(deps.previewService));
  tools.register(createPreviewStatusTool(deps.previewService));
  tools.register(createPreviewLogsTool(deps.previewService));
  tools.register(createPreviewInspectTool(deps.previewService));
  tools.register(createWebFetchTool());
  tools.register(createWebSearchTool());
  tools.register(createBrowserSandboxStartTool());
  tools.register(createWindowsSandboxStartTool());
  tools.register(createWindowsSandboxStopTool());
  tools.register(createLinuxDesktopSandboxStartTool());
  tools.register(createLinuxDesktopSandboxStopTool());

  // Operating-system control (desktop screen capture + input injection)
  // The Windows channel talks to the VM's OpenSSH; pass the dockur SSH
  // credentials through so the driver doesn't fall back to empty defaults.
  for (const tool of createOsControlToolset(
    createOsControlResolver(new SandboxManager(), {
      username: deps.config?.windowsSshUsername ?? "Docker",
      password: deps.config?.windowsSshPassword ?? "admin",
    }),
  )) {
    tools.register(tool);
  }
  tools.register(createScreenshotCaptureTool());

  // Email tools (Gmail / Outlook) — only when an EmailService is wired
  if (deps.emailService) {
    for (const tool of createEmailTools(deps.emailService, deps.ws)) {
      tools.register(tool);
    }
  }

  if (deps.calendarService) {
    for (const tool of createCalendarTools(deps.calendarService)) {
      tools.register(tool);
    }
  }

  tools.register(createHomeAssistantStatesTool());
  tools.register(createHomeAssistantServicesTool());
  tools.register(createHomeAssistantCallServiceTool());

  // Network tools
  tools.register(createNetworkScanTool());
  tools.register(createElevatedRunTool(deps.secretInputService));
  tools.register(createSshRunTool(deps.secretInputService, undefined, deps.userSecretService));

  // Architecture and code graph tools
  tools.register(createArchitectureTool(deps.ws, deps.architectureDiagramService));
  if (deps.codeGraphService) {
    for (const tool of createCodeGraphTools(deps.codeGraphService)) {
      tools.register(tool);
    }
  }

  // Maintenance tools
  if (deps.maintenanceService) {
    tools.register(createMaintenanceRunTool(deps.maintenanceService, deps.notifications));
  }
  if (deps.mobilePush) {
    tools.register(createMobileAlarmScheduleTool(deps.mobilePush));
  }

  // Agent spawn (sub-agent) tool — needs config for LLM settings
  if (deps.config) {
    const agentDeps = {
      toolRegistry: tools,
      getLLMConfig: (context: { apiKeys?: Record<string, string>; model?: string; jaitBackend?: string }) => {
        const llm = resolveJaitLlmConfig({
          config: deps.config!,
          apiKeys: context.apiKeys,
          requestedModel: context.model?.trim() || undefined,
          jaitBackend: context.jaitBackend as JaitBackend | undefined,
        });
        if (!(context.model?.trim() || context.apiKeys?.["OPENAI_MODEL"]?.trim())) {
          return { ...llm, contextWindow: deps.config!.contextWindow };
        }
        return llm;
      },
      // Lets sub-agents route through an ACP CLI provider (Claude Code,
      // Codex, ...) when the delegating context picked one as its chat
      // provider, instead of always falling through to the HTTP LLM path.
      providerRegistry: deps.providerRegistry,
      gatewayAddress: { host: deps.config.host, port: deps.config.port },
    };
    // Core: simplified "agent" tool
    tools.register(createAgentTool(agentDeps));
    // Standard: legacy "agent.spawn" tool (backward compat)
    tools.register(createAgentSpawnTool(agentDeps));
    // Lets concurrently-spawned swarm specialists message each other mid-run
    tools.register(createAgentMessageTool());
  }

  return tools;
}
