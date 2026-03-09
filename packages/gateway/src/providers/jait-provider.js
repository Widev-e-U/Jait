/**
 * Jait Provider — wraps Jait's own runAgentLoop as a provider adapter.
 *
 * This is the default provider that uses the existing OpenAI-compatible
 * agent loop with Jait's full tool registry, consent, and memory.
 * It doesn't spawn a child process — it runs in-process.
 */
import { EventEmitter } from "node:events";
import { uuidv7 } from "../lib/uuidv7.js";
export class JaitProvider {
    id = "jait";
    info = {
        id: "jait",
        name: "Jait (Built-in)",
        description: "Jait's native agent loop using OpenAI-compatible APIs with full tool access",
        available: true, // Always available — it's the built-in provider
        modes: ["full-access", "supervised"],
    };
    emitter = new EventEmitter();
    sessions = new Map();
    async checkAvailability() {
        this.info.available = true;
        return true;
    }
    async startSession(options) {
        const session = {
            id: uuidv7(),
            providerId: "jait",
            threadId: options.threadId,
            status: "running",
            runtimeMode: options.mode,
            startedAt: new Date().toISOString(),
        };
        this.sessions.set(session.id, session);
        this.emit({ type: "session.started", sessionId: session.id });
        return session;
    }
    async sendTurn(_sessionId, _message) {
        // Jait provider delegates to the existing chat route / runAgentLoop.
        // The actual tool execution is handled by the chat.ts route.
        // This adapter is primarily for tracking session state in threads.
    }
    async interruptTurn(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session)
            session.status = "interrupted";
    }
    async respondToApproval(_sessionId, _requestId, _approved) {
        // Jait uses its own ConsentManager — this is a no-op
    }
    async stopSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = "completed";
            session.completedAt = new Date().toISOString();
        }
        this.sessions.delete(sessionId);
    }
    onEvent(handler) {
        this.emitter.on("event", handler);
        return () => this.emitter.off("event", handler);
    }
    emit(event) {
        this.emitter.emit("event", event);
    }
}
//# sourceMappingURL=jait-provider.js.map