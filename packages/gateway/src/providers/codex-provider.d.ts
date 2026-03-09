/**
 * Codex CLI Provider — wraps OpenAI Codex CLI as a Jait provider.
 *
 * Spawns `codex app-server` as a child process and communicates
 * via JSON-RPC 2.0 over NDJSON on stdin/stdout.
 *
 * Protocol (codex-cli ≥ 0.111.0):
 *   1. spawn `codex app-server` with piped stdio
 *   2. send `initialize` request → get response
 *   3. send `initialized` notification (no response)
 *   4. send `thread/start` request → get threadId
 *   5. send `turn/start` request per user message
 *   6. listen for notifications: item/agentMessage/delta, turn/completed, etc.
 */
import type { CliProviderAdapter, ProviderInfo, ProviderModelInfo, ProviderSession, ProviderEvent, StartSessionOptions } from "./contracts.js";
export declare class CodexProvider implements CliProviderAdapter {
    readonly id: "codex";
    readonly info: ProviderInfo;
    private sessions;
    private emitter;
    private codexPath;
    checkAvailability(): Promise<boolean>;
    /**
     * List available models by spawning a short-lived `codex app-server`,
     * performing the initialize handshake, then calling `model/list`.
     */
    listModels(): Promise<ProviderModelInfo[]>;
    startSession(options: StartSessionOptions): Promise<ProviderSession>;
    sendTurn(sessionId: string, message: string, _attachments?: string[]): Promise<void>;
    interruptTurn(sessionId: string): Promise<void>;
    respondToApproval(sessionId: string, requestId: string, approved: boolean): Promise<void>;
    stopSession(sessionId: string): Promise<void>;
    onEvent(handler: (event: ProviderEvent) => void): () => void;
    private emit;
    private getState;
    private attachListeners;
    private handleStdoutLine;
    /** Response: has id, no method */
    private isResponse;
    /** Server request: has both method and id */
    private isServerRequest;
    /** Server notification: has method, no id */
    private isServerNotification;
    private handleResponse;
    private handleServerRequest;
    private handleServerNotification;
    private sendRequest;
    private writeMessage;
    private testCommand;
}
//# sourceMappingURL=codex-provider.d.ts.map