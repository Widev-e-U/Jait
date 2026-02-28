import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { WsControlPlane } from "./ws.js";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { SessionService } from "./services/sessions.js";
import { AuditWriter } from "./services/audit.js";
import { SurfaceRegistry, TerminalSurfaceFactory, FileSystemSurfaceFactory } from "./surfaces/index.js";
import { createToolRegistry } from "./tools/index.js";

async function main() {
  const config = loadConfig();

  // Initialize SQLite database
  const { db, sqlite } = openDatabase();
  migrateDatabase(sqlite);
  console.log("Database initialized at ~/.jait/data/jait.db");

  // Services
  const sessionService = new SessionService(db);
  const audit = new AuditWriter(db);

  // Surface registry — register all surface factories
  const surfaceRegistry = new SurfaceRegistry();
  surfaceRegistry.register(new TerminalSurfaceFactory());
  surfaceRegistry.register(new FileSystemSurfaceFactory());
  console.log(`Surfaces registered: ${surfaceRegistry.registeredTypes.join(", ")}`);

  // Tool registry — all Sprint 3 tools
  const toolRegistry = createToolRegistry(surfaceRegistry);
  console.log(`Tools registered: ${toolRegistry.listNames().join(", ")}`);

  const server = await createServer(config, {
    sessionService,
    audit,
    surfaceRegistry,
    toolRegistry,
  });
  const ws = new WsControlPlane(config);

  // Wire terminal WS ↔ PTY
  ws.onTerminalInput = (terminalId, data) => {
    const surface = surfaceRegistry.getSurface(terminalId);
    if (surface && surface.type === "terminal" && "write" in surface) {
      (surface as import("./surfaces/terminal.js").TerminalSurface).write(data);
    }
  };
  ws.onTerminalResize = (terminalId, cols, rows) => {
    const surface = surfaceRegistry.getSurface(terminalId);
    if (surface && surface.type === "terminal" && "resize" in surface) {
      (surface as import("./surfaces/terminal.js").TerminalSurface).resize(cols, rows);
    }
  };

  ws.start();

  await server.listen({ port: config.port, host: config.host });
  console.log(`Jait Gateway listening on http://${config.host}:${config.port}`);

  const shutdown = async () => {
    console.log("Shutting down...");
    await surfaceRegistry.stopAll("shutdown");
    ws.stop();
    await server.close();
    sqlite.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
