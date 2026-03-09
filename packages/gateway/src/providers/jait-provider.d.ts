/**
 * Jait Provider — wraps Jait's own runAgentLoop as a provider adapter.
 *
 * This is the default provider that uses the existing OpenAI-compatible
 * agent loop with Jait's full tool registry, consent, and memory.
 * It doesn't spawn a child process — it runs in-process.
 */
import type { CliProviderAdapter, ProviderInfo, ProviderSession, ProviderEvent, StartSessionOptions } from "./contracts.js";
export declare class JaitProvider implements CliProviderAdapter {
    readonly id: "jait";
    readonly info: ProviderInfo;
    private emitter;
    private sessions;
    checkAvailability(): Promise<boolean>;
    startSession(options: StartSessionOptions): Promise<ProviderSession>;
    sendTurn(_sessionId: string, _message: string): Promise<void>;
    interruptTurn(sessionId: string): Promise<void>;
    respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void>;
    stopSession(sessionId: string): Promise<void>;
    onEvent(handler: (event: ProviderEvent) => void): () => void;
    private emit;
}
//# sourceMappingURL=jait-provider.d.ts.map