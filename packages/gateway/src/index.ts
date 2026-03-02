import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { WsControlPlane } from "./ws.js";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { SessionService } from "./services/sessions.js";
import { AuditWriter } from "./services/audit.js";
import { SurfaceRegistry, TerminalSurfaceFactory, FileSystemSurfaceFactory, BrowserSurfaceFactory } from "./surfaces/index.js";
import { createToolRegistry } from "./tools/index.js";
import { SchedulerService } from "./scheduler/service.js";
import { HookBus, registerBuiltInHooks } from "./scheduler/hooks.js";
import { MemoryEngine } from "./memory/service.js";
import { SqliteMemoryBackend } from "./memory/sqlite-backend.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { ConsentManager } from "./security/consent-manager.js";
import { TrustEngine } from "./security/trust-engine.js";
import { getProfile } from "./security/tool-profiles.js";
import { ConsentAwareExecutor } from "./security/consent-executor.js";
import { UserService } from "./services/users.js";
import { ScreenShareService } from "@jait/screen-share";

async function main() {
  const config = loadConfig();

  // Initialize SQLite database
  const { db, sqlite } = openDatabase();
  migrateDatabase(sqlite);
  console.log("Database initialized at ~/.jait/data/jait.db");

  // Services
  const sessionService = new SessionService(db);
  const userService = new UserService(db);
  const audit = new AuditWriter(db);

  // Surface registry — register all surface factories
  const surfaceRegistry = new SurfaceRegistry();
  surfaceRegistry.register(new TerminalSurfaceFactory());
  surfaceRegistry.register(new FileSystemSurfaceFactory());
  surfaceRegistry.register(new BrowserSurfaceFactory());
  console.log(`Surfaces registered: ${surfaceRegistry.registeredTypes.join(", ")}`);

  // WebSocket control plane (created early so consent callbacks can reference it)
  const ws = new WsControlPlane(config);

  // Auto-wire terminal output → WebSocket for ALL terminals (REST, tool, etc.)
  surfaceRegistry.onSurfaceStarted = (id, surface) => {
    if (surface.type === "terminal" && "write" in surface) {
      (surface as import("./surfaces/terminal.js").TerminalSurface).onOutput = (data) =>
        ws.broadcastTerminalOutput(id, data);
    }
  };

  // Hook bus + built-ins
  const hooks = new HookBus();
  registerBuiltInHooks(hooks);


  // Memory engine — Sprint 6
  const memory = new MemoryEngine({
    backend: new SqliteMemoryBackend(db),
    memoryDir: join(homedir(), ".jait", "memory"),
  });

  const screenShare = new ScreenShareService();

  // Tool registry — Sprint 3 + Sprint 10
  let toolRegistry = createToolRegistry(surfaceRegistry, { memoryService: memory, hooks, screenShare });
  console.log(`Tools registered: ${toolRegistry.listNames().join(", ")}`);

  // Consent & Trust — Sprint 4
  const trustEngine = new TrustEngine(db);
  const consentManager = new ConsentManager({
    defaultTimeoutMs: 120_000,
    db,
    onRequest: (request) => {
      ws.broadcastAll({
        type: "consent.required",
        sessionId: request.sessionId,
        timestamp: new Date().toISOString(),
        payload: request,
      });
      console.log(`Consent required: ${request.toolName} (${request.id})`);
    },
    onDecision: (decision) => {
      ws.broadcastAll({
        type: "consent.resolved",
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: decision,
      });
      console.log(`Consent ${decision.approved ? "approved" : "rejected"}: ${decision.requestId}`);
    },
  });
  const permissions = getProfile("coding");
  const sessionApprovalsBySession = new Map<string, Set<string>>();
  const getSessionApprovals = (sessionId: string): Set<string> => {
    const existing = sessionApprovalsBySession.get(sessionId);
    if (existing) return existing;
    const created = new Set<string>();
    sessionApprovalsBySession.set(sessionId, created);
    return created;
  };

  const toolExecutor = async (
    toolName: string,
    input: unknown,
    context: import("./tools/contracts.js").ToolContext,
    options?: { dryRun?: boolean; consentTimeoutMs?: number },
  ) => {
    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager,
      trustEngine,
      audit,
      permissions,
      sessionApprovals: getSessionApprovals(context.sessionId),
    });
    return executor.execute(toolName, input, context, options);
  };

  const scheduler = new SchedulerService({
    db,
    executeTool: async (execution) => {
      const userApiKeys = execution.userId ? userService.getSettings(execution.userId).apiKeys : undefined;
      const context = {
        sessionId: execution.sessionId,
        actionId: `sched-${Date.now()}`,
        workspaceRoot: execution.workspaceRoot,
        requestedBy: "scheduler",
        userId: execution.userId ?? undefined,
        apiKeys: userApiKeys,
      } as const;
      return toolExecutor(execution.toolName, execution.input, context);
    },
    onExecuted: (result) => {
      hooks.emit("scheduler.executed", result);
      ws.broadcastAll({
        type: "session.created",
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { type: "scheduler.executed", ...result },
      });
    },
  });

  // Rebuild tool registry with Sprint 7 scheduler + gateway status tools.
  toolRegistry = createToolRegistry(surfaceRegistry, {
    scheduler,
    sessionService,
    ws,
    startedAt: Date.now(),
    memoryService: memory,
    hooks,
    screenShare,
  });
  console.log(`Tools registered: ${toolRegistry.listNames().join(", ")}`);

  scheduler.start(30_000);

  console.log(`Consent manager initialized (profile: coding, timeout: 120s, ${permissions.size} tool permissions)`);

  const server = await createServer(config, {
    db,
    sessionService,
    userService,
    audit,
    surfaceRegistry,
    toolRegistry,
    consentManager,
    trustEngine,
    ws,
    hooks,
    scheduler,
    hookSecret: config.hookSecret,
    onWakeHook: async () => scheduler.tick(),
    onAgentHook: async (payload) => {
      hooks.emit("agent.webhook", payload);
      return { accepted: true };
    },
    memoryService: memory,
    toolExecutor,
  });

  // Wire terminal WS ↔ PTY
  ws.onTerminalInput = (terminalId, data) => {
    try {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "write" in surface) {
        (surface as import("./surfaces/terminal.js").TerminalSurface).write(data);
      }
    } catch (err) {
      console.error(`Terminal write error (${terminalId}):`, err);
    }
  };
  ws.onTerminalResize = (terminalId, cols, rows) => {
    try {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "resize" in surface) {
        (surface as import("./surfaces/terminal.js").TerminalSurface).resize(cols, rows);
      }
    } catch (err) {
      console.error(`Terminal resize error (${terminalId}):`, err);
    }
  };
  ws.onTerminalReplay = (terminalId) => {
    try {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "getRecentOutput" in surface) {
        return (surface as import("./surfaces/terminal.js").TerminalSurface).getRecentOutput();
      }
    } catch {
      // ignore
    }
    return null;
  };

  // Wire consent WS ↔ ConsentManager
  ws.onConsentApprove = (requestId) => {
    consentManager.approve(requestId, "click");
  };
  ws.onConsentReject = (requestId, reason) => {
    consentManager.reject(requestId, "click", reason);
  };

  // Start Fastify first, then attach WS to its HTTP server (shared port)
  await server.listen({ port: config.port, host: config.host });
  ws.start(server.server); // shares port with Fastify
  console.log(`Jait Gateway listening on http://${config.host}:${config.port} (HTTP + WS)`);

  const shutdown = async () => {
    console.log("Shutting down...");
    consentManager.cancelAll("shutdown");
    await surfaceRegistry.stopAll("shutdown");
    scheduler.stop();
    ws.stop();
    await server.close();
    sqlite.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // Prevent uncaught native errors (e.g. node-pty ConPTY) from crashing the gateway
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception (non-fatal):", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection (non-fatal):", reason);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
