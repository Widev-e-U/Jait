import type { FastifyInstance } from "fastify";
import { VERSION } from "@jait/shared";

const startedAt = Date.now();

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    version: VERSION,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    sessions: 0,
    surfaces: 0,
    devices: 0,
    healthy: true,
  }));
}
