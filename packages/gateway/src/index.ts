import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { WsControlPlane } from "./ws.js";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { SessionService } from "./services/sessions.js";
import { AuditWriter } from "./services/audit.js";
import { SurfaceRegistry, TerminalSurfaceFactory, FileSystemSurfaceFactory } from "./surfaces/index.js";
import { createToolRegistry } from "./tools/index.js";
import { ConsentManager } from "./security/consent-manager.js";
import { TrustEngine } from "./security/trust-engine.js";
import { getProfile } from "./security/tool-profiles.js";
import { ConsentAwareExecutor } from "./security/consent-executor.js";
import { PtyBrokerClient } from "./pty-broker-client.js";

async function main() {
  const config = loadConfig();

  // Initialize SQLite database
  const { db, sqlite } = openDatabase();
  migrateDatabase(sqlite);
  console.log("Database initialized at ~/.jait/data/jait.db");

  // Services
  const sessionService = new SessionService(db);
  const audit = new AuditWriter(db);

  // Start PTY broker (Node.js subprocess for ConPTY on Windows)
  const broker = new PtyBrokerClient();
  await broker.start();

  // Surface registry — register all surface factories
  const surfaceRegistry = new SurfaceRegistry();
  surfaceRegistry.register(new TerminalSurfaceFactory({ broker }));
  surfaceRegistry.register(new FileSystemSurfaceFactory());
  console.log(`Surfaces registered: ${surfaceRegistry.registeredTypes.join(", ")}`);

  // Wire broker output/exit events → correct TerminalSurface
  broker.onOutput = (ptyId, data) => {
    const surface = surfaceRegistry
      .listSurfaces()
      .find((s) => s.type === "terminal" && (s as import("./surfaces/terminal.js").TerminalSurface).ptyId === ptyId);
    if (surface) {
      (surface as import("./surfaces/terminal.js").TerminalSurface).handleBrokerOutput(data);
    }
  };
  broker.onExit = (ptyId, exitCode, signal) => {
    const surface = surfaceRegistry
      .listSurfaces()
      .find((s) => s.type === "terminal" && (s as import("./surfaces/terminal.js").TerminalSurface).ptyId === ptyId);
    if (surface) {
      (surface as import("./surfaces/terminal.js").TerminalSurface).handleBrokerExit(exitCode, signal);
    }
  };
  // Tool registry — all Sprint 3 tools
  const toolRegistry = createToolRegistry(surfaceRegistry);
  console.log(`Tools registered: ${toolRegistry.listNames().join(", ")}`);

  // WebSocket control plane (created early so consent callbacks can reference it)
  const ws = new WsControlPlane(config);

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
  console.log(`Consent manager initialized (profile: coding, timeout: 120s, ${permissions.size} tool permissions)`);

  const server = await createServer(config, {
    db,
    sessionService,
    audit,
    surfaceRegistry,
    toolRegistry,
    consentManager,
    trustEngine,
    ws,
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
    await broker.stop();
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
