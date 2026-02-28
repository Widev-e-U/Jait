import Fastify from "fastify";
import cors from "@fastify/cors";
import type { AppConfig } from "./config.js";
import { VERSION } from "@jait/shared";
import { registerChatRoutes } from "./routes/chat.js";
import { registerHealthRoutes } from "./routes/health.js";

export async function createServer(config: AppConfig) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  await app.register(cors, { origin: config.corsOrigin });

  // Routes
  registerHealthRoutes(app);
  registerChatRoutes(app, config);

  app.get("/", async () => ({
    name: "jait-gateway",
    version: VERSION,
    status: "ok",
  }));

  return app;
}
