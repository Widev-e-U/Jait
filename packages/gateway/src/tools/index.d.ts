export type { ToolContext, ToolDefinition, ToolResult, ToolParametersSchema, } from "./contracts.js";
export { ToolRegistry } from "./registry.js";
export { createTerminalRunTool, createTerminalStreamTool } from "./terminal-tools.js";
export { createFileReadTool, createFileWriteTool, createFilePatchTool, createFileListTool, createFileStatTool, } from "./file-tools.js";
export { createOsQueryTool, createOsInstallTool } from "./os-tools.js";
export { createSurfacesListTool, createSurfacesStartTool, createSurfacesStopTool, } from "./surface-tools.js";
export { createCronAddTool, createCronListTool, createCronRemoveTool, createCronUpdateTool, } from "./cron-tools.js";
export { createGatewayStatusTool } from "./gateway-tools.js";
export { createScreenShareTool, createScreenCaptureTool, createScreenRecordTool, createOsTool } from "./screen-share-tools.js";
export { createBrowserNavigateTool, createBrowserSnapshotTool, createBrowserInteractionTools, createWebFetchTool, createWebSearchTool, createBrowserSandboxStartTool, } from "./browser-tools.js";
export { createMemorySaveTool, createMemorySearchTool, createMemoryForgetTool, } from "./memory-tools.js";
export { createVoiceSpeakTool } from "./voice-tools.js";
export { createAgentSpawnTool } from "./agent-tools.js";
export { createThreadControlTool } from "./thread-tools.js";
export { createNetworkScanTool, getLatestNetworkScan, setLatestNetworkScan } from "./network-tools.js";
export { createRedeployTool } from "./redeploy-tools.js";
export { createToolsListTool, createToolsSearchTool } from "./meta-tools.js";
export { McpManager, wrapMcpTool, registerMcpTools, unregisterMcpTools, type McpServerConfig, type McpConnection } from "./mcp-bridge.js";
export { ToolName, type ToolNameValue } from "./tool-names.js";
export { validateToolInput, type ValidationResult } from "./validate.js";
export { type ChatMode, CHAT_MODES, isValidChatMode, ASK_MODE_TOOLS, MUTATING_TOOLS, getSystemPromptForMode, type PlannedAction, type Plan, } from "./chat-modes.js";
export { buildSystemPrompt, getReminderInstructions, promptRegistry, type ModelEndpoint, type IAgentPrompt, type PromptContext, } from "./prompts/index.js";
export { runAgentLoop, retryToolCall, buildToolSchemas, buildTieredToolSchemas, toolDefsToSchemas, parseOpenAIStream, serializeMessages, toOpenAIName, fromOpenAIName, SteeringController, ToolCallQueue, ToolCallPriority, type AgentLoopOptions, type AgentLoopResult, type AgentLoopEvent, type AgentMessage, type OpenAIToolCall, type OpenAIToolSchema, type LLMConfig, type ExecutedToolCall, type ToolExecutor, } from "./agent-loop.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { SchedulerService } from "../scheduler/service.js";
import type { SessionService } from "../services/sessions.js";
import type { WsControlPlane } from "../ws.js";
import type { MemoryService } from "../memory/contracts.js";
import type { HookBus } from "../scheduler/hooks.js";
import type { ScreenShareService } from "@jait/screen-share";
import { ToolRegistry } from "./registry.js";
import type { VoiceService } from "../voice/service.js";
import { type AppConfig } from "../config.js";
import type { ThreadService } from "../services/threads.js";
import type { ProviderRegistry } from "../providers/registry.js";
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
    threadMcpConfig?: {
        host: string;
        port: number;
    };
    threadService?: ThreadService;
    providerRegistry?: ProviderRegistry;
    /** Graceful shutdown callback — needed by the redeploy tool */
    shutdown?: () => Promise<void>;
}
/** Create a ToolRegistry with all gateway tools pre-registered. */
export declare function createToolRegistry(surfaceRegistry: SurfaceRegistry, deps?: ToolRegistryDeps): ToolRegistry;
//# sourceMappingURL=index.d.ts.map