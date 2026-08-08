import { config } from "dotenv";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { homedir } from "os";
import { randomBytes } from "crypto";

// Skip dotenv loading if already handled by CLI entry (bin/jait.mjs)
if (!process.env["__JAIT_CLI"]) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Try .env locations in priority order:
  //   1. CWD/.env  (user project)
  //   2. ~/.jait/.env  (global config)
  //   3. Monorepo root (dev; 3 levels up from src/config.ts)
  const candidates = [
    resolve(process.cwd(), ".env"),
    join(homedir(), ".jait", ".env"),
    resolve(__dirname, "../../../.env"),
  ];
  const envPath = candidates.find((p) => existsSync(p));
  if (envPath) config({ path: envPath });
}

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
  /**
   * Max autonomous tool-calling rounds per turn for the Jait provider.
   * `0` uses the agent loop's 64-round safety backstop. Local models in
   * particular make many small tool calls
   * and need a high ceiling. Override with env JAIT_MAX_ROUNDS (clamped to a
   * sane ceiling); per-user overrides come from the JAIT_MAX_ROUNDS settings key.
   */
  agentMaxRounds: number;
  /**
   * Context length (num_ctx) requested from ollama via its native /api/chat
   * endpoint. The OpenAI-compat /v1 endpoint ignores num_ctx and pins models
   * to the server default, so Jait sets this explicitly. Override per-user with
   * the OLLAMA_NUM_CTX setting, or globally with env OLLAMA_CONTEXT_LENGTH.
   */
  ollamaContextWindow: number;
  hookSecret: string;
  heartbeatCron: string;
  /** URL of the local Faster Whisper server (default http://localhost:8178) */
  whisperUrl: string;
  /** OpenAI model for the real-time voice assistant (Realtime API). */
  realtimeModel: string;
  /** Voice used by the real-time assistant (alloy, echo, shimmer, etc.). */
  realtimeVoice: string;
  /**
   * Hint string passed to the speech-to-text (STT) layer to bias recognition
   * toward domain-specific proper nouns. This fixes common mishearings such as
   * "Jait" being transcribed as "Jade". Override with env JAIT_STT_PROMPT.
   */
  sttPrompt: string;
  /**
   * URL of an upstream/primary gateway to link to as a filesystem node.
   * When set, this gateway opens an outbound WS to the primary, registers
   * itself as a browseable fs-node, and serves browse/roots/op requests from
   * its local disk — making it selectable in the primary's Open Project modal.
   * Empty string disables the link (default).
   */
  primaryGateway: string;
  /** Bearer token used to authenticate the primary-link WS (optional; not needed if the primary runs in development mode). */
  primaryToken: string;
  /** Display name advertised to the primary for this node (defaults to the hostname). */
  nodeName: string;
  /**
   * Run as a headless remote node only. In this mode the process does not
   * expose the gateway HTTP dashboard/API and only opens the outbound primary
   * link used for remote filesystem and terminal access.
   */
  nodeOnly: boolean;
}

/** Infer context window size from model name. Conservative defaults. */
export function inferContextWindow(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("gpt-5")) return 400_000;
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

  const jwtSecret = process.env["JWT_SECRET"]?.trim() || randomBytes(32).toString("hex");
  const hookSecret = process.env["HOOK_SECRET"]?.trim() || randomBytes(32).toString("hex");
  const primaryGateway = process.env["JAIT_PRIMARY_GATEWAY"]?.trim() ?? "";
  const nodeOnlyRaw = process.env["JAIT_NODE_ONLY"]?.trim().toLowerCase();
  const nodeOnly = nodeOnlyRaw
    ? ["1", "true", "yes", "on"].includes(nodeOnlyRaw)
    : Boolean(primaryGateway);

  return {
    port: parseInt(process.env["PORT"] ?? "8000", 10),
    wsPort: parseInt(process.env["WS_PORT"] ?? "18789", 10),
    host: process.env["HOST"] ?? "0.0.0.0",
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    corsOrigin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
    nodeEnv: process.env["NODE_ENV"] ?? "development",
    jwtSecret,
    llmProvider: explicitProvider ?? (hasOpenAiKey ? "openai" : "ollama"),
    ollamaUrl: process.env["OLLAMA_URL"] ?? "http://localhost:11434",
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
    agentMaxRounds: parseInt(process.env["JAIT_MAX_ROUNDS"] ?? "0", 10) || 0,
    ollamaContextWindow: parseInt(process.env["OLLAMA_CONTEXT_LENGTH"] ?? "0", 10) || 32768,
    hookSecret,
    heartbeatCron: process.env["HEARTBEAT_CRON"] ?? "* * * * *",
    whisperUrl: process.env["WHISPER_URL"] ?? "http://localhost:8178",
    realtimeModel: process.env["OPENAI_REALTIME_MODEL"] ?? "gpt-realtime-2.1",
    realtimeVoice: process.env["OPENAI_REALTIME_VOICE"] ?? "alloy",
    sttPrompt:
      process.env["JAIT_STT_PROMPT"]?.trim() ??
      "Jait (the assistant's name, pronounced like 'jate'), Hey Jait",
    primaryGateway,
    primaryToken: process.env["JAIT_PRIMARY_TOKEN"]?.trim() ?? "",
    nodeName: process.env["JAIT_NODE_NAME"]?.trim() ?? "",
    nodeOnly,
  };
}
