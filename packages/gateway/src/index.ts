import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { WsControlPlane } from "./ws.js";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { SessionService } from "./services/sessions.js";
import { AuditWriter } from "./services/audit.js";

async function main() {
  const config = loadConfig();

  // Initialize SQLite database
  const { db, sqlite } = openDatabase();
  migrateDatabase(sqlite);
  console.log("Database initialized at ~/.jait/data/jait.db");

  // Services
  const sessionService = new SessionService(db);
  const audit = new AuditWriter(db);

  const server = await createServer(config, { sessionService, audit });
  const ws = new WsControlPlane(config);

  ws.start();

  await server.listen({ port: config.port, host: config.host });
  console.log(`Jait Gateway listening on http://${config.host}:${config.port}`);

  const shutdown = async () => {
    console.log("Shutting down...");
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
