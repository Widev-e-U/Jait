import "dotenv/config";

export interface AppConfig {
  port: number;
  wsPort: number;
  host: string;
  logLevel: string;
  corsOrigin: string;
  nodeEnv: string;
  jwtSecret: string;
  ollamaUrl: string;
  ollamaModel: string;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env["PORT"] ?? "8000", 10),
    wsPort: parseInt(process.env["WS_PORT"] ?? "18789", 10),
    host: process.env["HOST"] ?? "0.0.0.0",
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    corsOrigin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
    nodeEnv: process.env["NODE_ENV"] ?? "development",
    jwtSecret: process.env["JWT_SECRET"] ?? "jait-dev-secret-change-in-production",
    ollamaUrl: process.env["OLLAMA_URL"] ?? "http://192.168.178.60:11434",
    ollamaModel:
      process.env["OLLAMA_MODEL"] ??
      "CognitiveComputations/dolphin-mistral-nemo:12b",
  };
}
