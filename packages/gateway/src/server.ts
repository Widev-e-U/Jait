import Fastify from "fastify";
import cors from "@fastify/cors";
import type { AppConfig } from "./config.js";
import { VERSION } from "@jait/shared";
import { registerChatRoutes } from "./routes/chat.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerTerminalRoutes } from "./routes/terminals.js";
import { registerConsentRoutes } from "./routes/consent.js";
import { registerTrustRoutes } from "./routes/trust.js";
import { registerHookRoutes } from "./routes/hooks.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerMobileRoutes } from "./routes/mobile.js";
import { registerNetworkRoutes } from "./routes/network.js";
import { registerVoiceRoutes } from "./routes/voice.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";
import { registerScreenShareRoutes } from "./routes/screen-share.js";
import { registerFilesystemRoutes } from "./routes/filesystem.js";
import { registerThreadRoutes } from "./routes/threads.js";
import { registerRepoRoutes } from "./routes/repositories.js";
import { registerMcpRoutes } from "./routes/mcp-server.js";
import { registerGitRoutes } from "./routes/git.js";
import type { SessionService } from "./services/sessions.js";
import type { AuditWriter } from "./services/audit.js";
import type { SurfaceRegistry } from "./surfaces/index.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { ToolContext, ToolResult } from "./tools/contracts.js";
import type { ConsentManager } from "./security/consent-manager.js";
import type { TrustEngine } from "./security/trust-engine.js";
import type { JaitDB } from "./db/index.js";
import type { WsControlPlane } from "./ws.js";
import type { HookBus } from "./scheduler/hooks.js";
import type { SchedulerService } from "./scheduler/service.js";
import type { MemoryService } from "./memory/contracts.js";
import type { UserService } from "./services/users.js";
import type { DeviceRegistry } from "./services/device-registry.js";
import type { VoiceService } from "./voice/service.js";
import type { ScreenShareService } from "@jait/screen-share";
import type { SessionStateService } from "./services/session-state.js";
import type { ThreadService } from "./services/threads.js";
import type { RepositoryService } from "./services/repositories.js";
import type { ProviderRegistry } from "./providers/registry.js";
import type { Database } from "bun:sqlite";
import { getSchemaVersion } from "./db/connection.js";

export interface ServerDeps {
  db?: JaitDB;
  sqlite?: Database;
  sessionService?: SessionService;
  userService?: UserService;
  audit?: AuditWriter;
  surfaceRegistry?: SurfaceRegistry;
  toolRegistry?: ToolRegistry;
  consentManager?: ConsentManager;
  trustEngine?: TrustEngine;
  ws?: WsControlPlane;
  hooks?: HookBus;
  scheduler?: SchedulerService;
  hookSecret?: string;
  onWakeHook?: () => Promise<unknown>;
  onAgentHook?: (payload: unknown) => Promise<unknown>;
  memoryService?: MemoryService;
  deviceRegistry?: DeviceRegistry;
  sessionState?: SessionStateService;
  toolExecutor?: (
    toolName: string,
    input: unknown,
    context: ToolContext,
    options?: { dryRun?: boolean; consentTimeoutMs?: number },
  ) => Promise<ToolResult>;
  voiceService?: VoiceService;
  screenShare?: ScreenShareService;
  threadService?: ThreadService;
  repoService?: RepositoryService;
  providerRegistry?: ProviderRegistry;
}

export async function createServer(config: AppConfig, deps: ServerDeps = {}) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  await app.register(cors, {
    origin: true, // allow any origin — auth is JWT-based, not origin-based
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  registerHealthRoutes(app, config, {
    getDeviceCount: () => deps.deviceRegistry?.count() ?? 0,
    getSchemaVersion: () => deps.sqlite ? getSchemaVersion(deps.sqlite) : 0,
  });
  if (deps.userService) {
    registerAuthRoutes(app, config, deps.userService, deps.toolRegistry);
  }
  registerChatRoutes(app, config, {
    db: deps.db,
    sessionService: deps.sessionService,
    toolRegistry: deps.toolRegistry,
    surfaceRegistry: deps.surfaceRegistry,
    audit: deps.audit,
    toolExecutor: deps.toolExecutor,
    memoryService: deps.memoryService,
    userService: deps.userService,
    ws: deps.ws,
    sessionState: deps.sessionState,
    providerRegistry: deps.providerRegistry,
  });

  if (deps.sessionService && deps.audit) {
    registerSessionRoutes(app, config, deps.sessionService, deps.audit, deps.hooks, deps.sessionState);
  }

  if (deps.surfaceRegistry && deps.toolRegistry && deps.audit) {
    registerTerminalRoutes(app, deps.surfaceRegistry, deps.toolRegistry, deps.audit, deps.toolExecutor);
  }

  if (deps.consentManager && deps.audit) {
    registerConsentRoutes(app, deps.consentManager, deps.audit);
  }
  if (deps.voiceService && deps.consentManager) {
    registerVoiceRoutes(app, deps.voiceService, deps.consentManager);
  }
  if (deps.trustEngine) {
    registerTrustRoutes(app, deps.trustEngine);
  }
  if (deps.hooks && deps.hookSecret && deps.onWakeHook && deps.onAgentHook) {
    registerHookRoutes(app, {
      hooks: deps.hooks,
      hookSecret: deps.hookSecret,
      onWake: deps.onWakeHook,
      onAgentHook: deps.onAgentHook,
    });
  }
  if (deps.scheduler) {
    registerJobRoutes(app, config, deps.scheduler);
  }

  if (deps.deviceRegistry && deps.consentManager) {
    registerMobileRoutes(app, {
      deviceRegistry: deps.deviceRegistry,
      consentManager: deps.consentManager,
      sessionService: deps.sessionService,
    });
  }

  registerNetworkRoutes(app);

  if (deps.screenShare && deps.ws) {
    registerScreenShareRoutes(app, { screenShare: deps.screenShare, ws: deps.ws });
  }

  registerFilesystemRoutes(app, deps.ws);

  if (deps.surfaceRegistry) {
    registerWorkspaceRoutes(app, deps.surfaceRegistry, deps.sessionState, deps.sessionService);
  }

  // Git API routes
  registerGitRoutes(app, config);

  // Agent threads + provider routes
  if (deps.threadService && deps.providerRegistry) {
    registerThreadRoutes(app, config, {
      threadService: deps.threadService,
      providerRegistry: deps.providerRegistry,
      userService: deps.userService,
      ws: deps.ws,
    });
  }

  // Automation repository routes
  if (deps.repoService) {
    registerRepoRoutes(app, config, {
      repoService: deps.repoService,
      ws: deps.ws,
    });
  }

  // MCP SSE server for external CLI agents
  if (deps.toolRegistry) {
    registerMcpRoutes(app, { toolRegistry: deps.toolRegistry, config });
  }

  app.get("/", async () => ({
    name: "jait-gateway",
    version: VERSION,
    status: "ok",
  }));

  return app;
}
