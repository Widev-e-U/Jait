import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env from monorepo root (3 levels up from src/config.ts)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

export type LlmProvider = "ollama" | "openai";

export interface AppConfig {
  port: number;
  wsPort: number;
  host: string;
  logLevel: string;
  corsOrigin: string;
  nodeEnv: string;
  jwtSecret: string;
  // LLM provider selection
  llmProvider: LlmProvider;
  // Ollama
  ollamaUrl: string;
  ollamaModel: string;
  // OpenAI
  openaiApiKey: string;
  openaiModel: string;
  openaiBaseUrl: string;
  /** Max context window tokens (auto-detected from model name if not set) */
  contextWindow: number;
  hookSecret: string;
  heartbeatCron: string;
}

/** Infer context window size from model name. Conservative defaults. */
export function inferContextWindow(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("gpt-4o") || m.includes("gpt-4.1")) return 128_000;
  if (m.includes("gpt-4-turbo")) return 128_000;
  if (m.includes("gpt-4")) return 8_192;
  if (m.includes("gpt-3.5")) return 16_385;
  if (m.includes("claude-3") || m.includes("claude-4")) return 200_000;
  if (m.includes("claude")) return 100_000;
  if (m.includes("gemini")) return 128_000;
  if (m.includes("o1") || m.includes("o3") || m.includes("o4")) return 200_000;
  if (m.includes("deepseek")) return 64_000;
  if (m.includes("mistral") || m.includes("mixtral")) return 32_000;
  if (m.includes("llama")) return 8_192;
  return 128_000; // safe default
}

export function loadConfig(): AppConfig {
  // Auto-detect provider: if OPENAI_API_KEY is set, default to openai
  const hasOpenAiKey = !!process.env["OPENAI_API_KEY"];
  const explicitProvider = process.env["LLM_PROVIDER"] as LlmProvider | undefined;

  return {
    port: parseInt(process.env["PORT"] ?? "8000", 10),
    wsPort: parseInt(process.env["WS_PORT"] ?? "18789", 10),
    host: process.env["HOST"] ?? "0.0.0.0",
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    corsOrigin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
    nodeEnv: process.env["NODE_ENV"] ?? "development",
    jwtSecret: process.env["JWT_SECRET"] ?? "jait-dev-secret-change-in-production",
    llmProvider: explicitProvider ?? (hasOpenAiKey ? "openai" : "ollama"),
    ollamaUrl: process.env["OLLAMA_URL"] ?? "http://192.168.178.60:11434",
    ollamaModel:
      process.env["OLLAMA_MODEL"] ??
      "CognitiveComputations/dolphin-mistral-nemo:12b",
    openaiApiKey: process.env["OPENAI_API_KEY"] ?? "",
    openaiModel: process.env["OPENAI_MODEL"] ?? "gpt-4o",
    openaiBaseUrl: process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1",
    contextWindow: parseInt(
      process.env["CONTEXT_WINDOW"] ?? "0",
      10,
    ) || inferContextWindow(process.env["OPENAI_MODEL"] ?? "gpt-4o"),
    hookSecret: process.env["HOOK_SECRET"] ?? "jait-hook-secret",
    heartbeatCron: process.env["HEARTBEAT_CRON"] ?? "* * * * *",
  };
}
