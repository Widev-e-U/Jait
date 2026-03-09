export type LlmProvider = "ollama" | "openai";
export interface AppConfig {
    port: number;
    wsPort: number;
    host: string;
    logLevel: string;
    corsOrigin: string;
    nodeEnv: string;
    jwtSecret: string;
    llmProvider: LlmProvider;
    ollamaUrl: string;
    ollamaModel: string;
    openaiApiKey: string;
    openaiModel: string;
    openaiBaseUrl: string;
    /** Max context window tokens (auto-detected from model name if not set) */
    contextWindow: number;
    hookSecret: string;
    heartbeatCron: string;
}
/** Infer context window size from model name. Conservative defaults. */
export declare function inferContextWindow(model: string): number;
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=config.d.ts.map