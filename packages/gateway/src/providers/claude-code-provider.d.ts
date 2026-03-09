/**
 * Claude Code CLI Provider — wraps Anthropic's Claude Code CLI as a Jait provider.
 *
 * Spawns `claude` CLI with `--output-format stream-json` for structured output.
 * Claude Code supports MCP natively via its config, so Jait tools can be exposed.
 *
 * Claude Code outputs newline-delimited JSON events to stdout:
 *   { type: "assistant", message: { ... } }
 *   { type: "tool_use", tool: "...", input: {...} }
 *   { type: "tool_result", ... }
 *   { type: "result", ... }
 */
import type { CliProviderAdapter, ProviderInfo, ProviderModelInfo, ProviderSession, ProviderEvent, StartSessionOptions } from "./contracts.js";
export declare class ClaudeCodeProvider implements CliProviderAdapter {
    readonly id: "claude-code";
    readonly info: ProviderInfo;
    private sessions;
    private emitter;
    private claudePath;
    checkAvailability(): Promise<boolean>;
    /**
     * Claude Code doesn't expose a model listing API.
     * Return known model aliases — the CLI accepts both aliases and full names.
     */
    listModels(): Promise<ProviderModelInfo[]>;
    startSession(options: StartSessionOptions): Promise<ProviderSession>;
    sendTurn(sessionId: string, message: string, _attachments?: string[]): Promise<void>;
    interruptTurn(sessionId: string): Promise<void>;
    respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void>;
    stopSession(sessionId: string): Promise<void>;
    onEvent(handler: (event: ProviderEvent) => void): () => void;
    private emit;
    private getState;
    private processBuffer;
    private handleEvent;
    private buildClaudeMcpConfig;
    private testCommand;
}
//# sourceMappingURL=claude-code-provider.d.ts.map