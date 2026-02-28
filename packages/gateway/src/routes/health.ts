import type { FastifyInstance } from "fastify";
import { VERSION } from "@jait/shared";
import type { AppConfig } from "../config.js";

const startedAt = Date.now();

export function registerHealthRoutes(app: FastifyInstance, config?: AppConfig) {
  app.get("/health", async () => ({
    version: VERSION,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    sessions: 0,
    surfaces: 0,
    devices: 0,
    healthy: true,
    provider: config?.llmProvider ?? "ollama",
    model: config?.llmProvider === "openai"
      ? config.openaiModel
      : config?.ollamaModel ?? null,
    ollamaUrl: config?.llmProvider !== "openai"
      ? config?.ollamaUrl ?? null
      : null,
  }));
}
