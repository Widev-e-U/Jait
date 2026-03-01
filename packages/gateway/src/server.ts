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

export interface ServerDeps {
  db?: JaitDB;
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
  toolExecutor?: (
    toolName: string,
    input: unknown,
    context: ToolContext,
    options?: { dryRun?: boolean; consentTimeoutMs?: number },
  ) => Promise<ToolResult>;
}

export async function createServer(config: AppConfig, deps: ServerDeps = {}) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  await app.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  registerHealthRoutes(app, config);
  if (deps.userService) {
    registerAuthRoutes(app, config, deps.userService);
  }
  registerChatRoutes(app, config, {
    db: deps.db,
    sessionService: deps.sessionService,
    toolRegistry: deps.toolRegistry,
    audit: deps.audit,
    toolExecutor: deps.toolExecutor,
    memoryService: deps.memoryService,
    userService: deps.userService,
  });

  if (deps.sessionService && deps.audit) {
    registerSessionRoutes(app, config, deps.sessionService, deps.audit, deps.hooks);
  }

  if (deps.surfaceRegistry && deps.toolRegistry && deps.audit) {
    registerTerminalRoutes(app, deps.surfaceRegistry, deps.toolRegistry, deps.audit, deps.toolExecutor);
  }

  if (deps.consentManager && deps.audit) {
    registerConsentRoutes(app, deps.consentManager, deps.audit);
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

  app.get("/", async () => ({
    name: "jait-gateway",
    version: VERSION,
    status: "ok",
  }));

  return app;
}
