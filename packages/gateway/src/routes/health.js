import { VERSION } from "@jait/shared";
const startedAt = Date.now();
export function registerHealthRoutes(app, config, deps) {
    app.get("/health", async () => ({
        version: VERSION,
        schemaVersion: deps?.getSchemaVersion?.() ?? 0,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        sessions: 0,
        surfaces: 0,
        devices: deps?.getDeviceCount?.() ?? 0,
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
//# sourceMappingURL=health.js.map