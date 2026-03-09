import type { AppConfig } from "../config.js";
import type { CliProviderAdapter } from "../providers/contracts.js";
export declare const THREAD_TITLE_PROMPT = "Reply with ONLY a short task title (3-8 words). No quotes, bullets, or commentary.";
export interface GenerateThreadTitleOptions {
    task: string;
    config: AppConfig;
    apiKeys?: Record<string, string>;
    model?: string;
}
/**
 * Generate a title by sending a turn through an already-running provider
 * session.  The session must not be busy (turn completed / just started).
 * Returns the assistant text from the turn.
 */
export declare function generateTitleViaTurn(provider: CliProviderAdapter, sessionId: string, task: string): Promise<string>;
/**
 * Generate a title using a direct LLM API call (OpenAI / Ollama).
 * Used as fallback when the provider isn't a CLI agent or when no
 * session is available.
 */
export declare function generateTitleViaApi(options: GenerateThreadTitleOptions): Promise<string>;
export declare function normalizeGeneratedThreadTitle(raw: string, fallback: string): string;
//# sourceMappingURL=thread-title.d.ts.map