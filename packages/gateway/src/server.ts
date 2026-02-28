import Fastify from "fastify";
import cors from "@fastify/cors";
import type { AppConfig } from "./config.js";
import { VERSION } from "@jait/shared";
import { registerChatRoutes } from "./routes/chat.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import type { SessionService } from "./services/sessions.js";
import type { AuditWriter } from "./services/audit.js";

export interface ServerDeps {
  sessionService?: SessionService;
  audit?: AuditWriter;
}

export async function createServer(config: AppConfig, deps: ServerDeps = {}) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  await app.register(cors, { origin: config.corsOrigin });

  // Routes
  registerHealthRoutes(app);
  registerChatRoutes(app, config);

  // Session + audit routes (only if DB is wired up)
  if (deps.sessionService && deps.audit) {
    registerSessionRoutes(app, deps.sessionService, deps.audit);
  }

  app.get("/", async () => ({
    name: "jait-gateway",
    version: VERSION,
    status: "ok",
  }));

  return app;
}
