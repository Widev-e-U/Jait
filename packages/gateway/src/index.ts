// Must be the very first import — patches globalThis.crypto before jose loads
import "./crypto-polyfill.js";

import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { WsControlPlane } from "./ws.js";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { SessionService } from "./services/sessions.js";
import { SessionStateService } from "./services/session-state.js";
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
import { DeviceRegistry } from "./services/device-registry.js";
import { VoiceService } from "./voice/service.js";
import { ScreenShareService } from "@jait/screen-share";
import { ThreadService } from "./services/threads.js";
import { RepositoryService } from "./services/repositories.js";
import { ProviderRegistry } from "./providers/registry.js";
import { CodexProvider } from "./providers/codex-provider.js";
import { ClaudeCodeProvider } from "./providers/claude-code-provider.js";
import { JaitProvider } from "./providers/jait-provider.js";

async function main() {
  const config = loadConfig();

  // Initialize SQLite database
  const { db, sqlite } = openDatabase();
  migrateDatabase(sqlite);
  console.log("Database initialized at ~/.jait/data/jait.db");

  // Services
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const audit = new AuditWriter(db);
  const deviceRegistry = new DeviceRegistry();

  // Agent threads + provider registry
  const threadService = new ThreadService(db);
  const repoService = new RepositoryService(db);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(new JaitProvider());
  providerRegistry.register(new CodexProvider());
  providerRegistry.register(new ClaudeCodeProvider());
  console.log(`Providers registered: ${providerRegistry.list().map(p => p.id).join(", ")}`);

  // Surface registry — register all surface factories
  const surfaceRegistry = new SurfaceRegistry();
  surfaceRegistry.register(new TerminalSurfaceFactory());
  surfaceRegistry.register(new FileSystemSurfaceFactory());
  surfaceRegistry.register(new BrowserSurfaceFactory());
  console.log(`Surfaces registered: ${surfaceRegistry.registeredTypes.join(", ")}`);

  // WebSocket control plane (created early so consent callbacks can reference it)
  const ws = new WsControlPlane(config);

  // Auto-wire terminal output → WebSocket for ALL terminals (REST, tool, etc.)
  // Also broadcast workspace activation for filesystem surfaces.
  surfaceRegistry.onSurfaceStarted = (id, surface) => {
    if (surface.type === "terminal" && "write" in surface) {
      (surface as import("./surfaces/terminal.js").TerminalSurface).onOutput = (data) =>
        ws.broadcastTerminalOutput(id, data);
    }
    if (surface.type === "filesystem") {
      const snap = surface.snapshot();
      const sid = snap.sessionId ?? "";
      const workspaceRoot = (snap.metadata as Record<string, unknown>)?.workspaceRoot ?? null;
      const panelState = { open: true, remotePath: workspaceRoot, surfaceId: id };
      // Push a UI command to open the workspace panel
      ws.sendUICommand(
        {
          command: "workspace.open",
          data: {
            surfaceId: id,
            workspaceRoot: workspaceRoot as string,
          },
        },
        sid,
      );
      // Also broadcast ui.state-sync so handleStateSync fires on all clients
      ws.broadcast(sid, {
        type: "ui.state-sync",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: { key: "workspace.panel", value: panelState },
      });
      // Persist workspace state to DB so late-joining clients get it
      if (sid) {
        try {
          sessionState.set(sid, { "workspace.panel": panelState });
        } catch (err) {
          console.error("Failed to persist workspace state:", err);
        }
      }
    }
  };

  surfaceRegistry.onSurfaceStopped = (id, surface) => {
    if (surface.type === "filesystem") {
      const snap = surface.snapshot();
      const sid = snap.sessionId ?? "";
      ws.sendUICommand(
        {
          command: "workspace.close",
          data: { surfaceId: id },
        },
        sid,
      );
      // Also broadcast ui.state-sync so handleStateSync fires on all clients
      ws.broadcast(sid, {
        type: "ui.state-sync",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: { key: "workspace.panel", value: null },
      });
      // Clear workspace state from DB
      if (sid) {
        try {
          sessionState.set(sid, { "workspace.panel": null });
        } catch (err) {
          console.error("Failed to clear workspace state:", err);
        }
      }
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

  // Tool registry — Sprint 3 + Sprint 10
  const voiceService = new VoiceService();
  const screenShare = new ScreenShareService();
  let toolRegistry = createToolRegistry(surfaceRegistry, {
    memoryService: memory,
    hooks,
    voiceService,
    screenShare,
    ws,
    threadMcpConfig: { host: config.host, port: config.port },
    threadService,
    providerRegistry,
  });
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
  // shutdown ref is assigned after server.listen — use late-bound wrapper
  let shutdownFn: (() => Promise<void>) | undefined;
  const shutdownRef = async () => { if (shutdownFn) await shutdownFn(); else process.exit(0); };

  toolRegistry = createToolRegistry(surfaceRegistry, {
    scheduler,
    sessionService,
    ws,
    startedAt: Date.now(),
    memoryService: memory,
    hooks,
    voiceService,
    screenShare,
    threadMcpConfig: { host: config.host, port: config.port },
    threadService,
    providerRegistry,
    config,
    shutdown: shutdownRef,
  });
  console.log(`Tools registered: ${toolRegistry.listNames().join(", ")}`);

  scheduler.start(30_000);

  // Seed built-in "Network Scan" job if it doesn't already exist
  {
    const existingJobs = scheduler.list();
    const hasNetworkScan = existingJobs.some(
      (j) => j.toolName === "network.scan" && j.name === "Network Scan",
    );
    if (!hasNetworkScan) {
      // Remove legacy "Device Discovery" job if present
      const legacy = existingJobs.find(
        (j) => j.toolName === "network.scan" && j.name === "Device Discovery",
      );
      if (legacy) scheduler.remove(legacy.id);

      scheduler.create({
        name: "Network Scan",
        cron: "0 * * * *", // every hour at :00
        toolName: "network.scan",
        input: {
          __jaitJobMeta: {
            jobType: "system_job",
            description:
              "Scans the local network for devices, checks SSH connectivity, and detects running Jait gateway nodes.",
          },
        },
        enabled: true,
      });
      console.log("Seeded built-in job: Network Scan (hourly)");
    }
  }

  console.log(`Consent manager initialized (profile: coding, timeout: 120s, ${permissions.size} tool permissions)`);

  const server = await createServer(config, {
    db,
    sqlite,
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
    deviceRegistry,
    sessionState,
    voiceService,
    toolExecutor,
    screenShare,
    threadService,
    repoService,
    providerRegistry,
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

  // UI state sync (client → server → DB → other clients)
  ws.onUIStateUpdate = (sid, key, value, clientId) => {
    try {
      sessionState.set(sid, { [key]: value });
      // Broadcast to other session clients so they stay in sync
      ws.broadcastExcluding(sid, clientId, {
        type: "ui.state-sync",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: { key, value },
      });
      console.log(`UI state synced: session=${sid} key=${key} value=${value === null ? "null" : "set"}`);
    } catch (err) {
      console.error(`Failed to persist UI state (${key}):`, err);
    }
  };

  // Push full session state when a client subscribes to a session.
  // This ensures every client gets the authoritative state on connect/reconnect.
  ws.onClientSubscribe = (sid, clientId) => {
    try {
      const allState = sessionState.get(sid);
      ws.sendToClient(clientId, {
        type: "ui.full-state",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: allState, // Record<string, unknown>
      });
      console.log(`Full state pushed to client ${clientId}: session=${sid} keys=${Object.keys(allState).join(", ") || "(empty)"}`);
    } catch (err) {
      console.error(`Failed to push full state to client ${clientId}:`, err);
    }
  };

  // Screen-share WS start callback is no longer needed here — the start-request
  // is relayed directly to clients by the WS handler, and session creation happens
  // via the REST route or tool. This callback is kept as a no-op for safety.
  ws.onScreenShareStart = (hostDeviceId, _viewerDeviceIds) => {
    console.log(`Screen share start-request relayed for host: ${hostDeviceId}`);
  };
  ws.onScreenShareStop = (sessionId) => {
    const session = screenShare.stopShare();
    if (session) {
      ws.broadcastScreenShareState(session);
      console.log(`Screen share stopped: ${sessionId}`);
    }
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
  // Wire shutdown into redeploy tool's late-bound reference
  shutdownFn = shutdown;

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

export { main };

// Auto-run when invoked directly (not via CLI bin entry)
if (!process.env["__JAIT_CLI"]) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
