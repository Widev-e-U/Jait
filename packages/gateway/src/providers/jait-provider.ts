/**
 * Jait Provider — wraps Jait's own runAgentLoop as a provider adapter.
 *
 * This is the default provider that uses the existing OpenAI-compatible
 * agent loop with Jait's full tool registry, consent, and memory.
 * It doesn't spawn a child process — it runs in-process.
 */

import { EventEmitter } from "node:events";
import { uuidv7 } from "../db/uuidv7.js";
import type {
  CliProviderAdapter,
  ProviderInfo,
  ProviderModelInfo,
  ProviderSession,
  ProviderEvent,
  StartSessionOptions,
} from "./contracts.js";

export class JaitProvider implements CliProviderAdapter {
  readonly id = "jait" as const;
  readonly info: ProviderInfo = {
    id: "jait",
    name: "Jait (Built-in)",
    description: "Jait's native agent loop using OpenAI-compatible APIs with full tool access",
    available: true, // Always available — it's the built-in provider
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessions = new Map<string, ProviderSession>();

  async checkAvailability(): Promise<boolean> {
    this.info.available = true;
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return JAIT_MODELS;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const session: ProviderSession = {
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

  async sendTurn(_sessionId: string, _message: string): Promise<void> {
    // Jait provider delegates to the existing chat route / runAgentLoop.
    // The actual tool execution is handled by the chat.ts route.
    // This adapter is primarily for tracking session state in threads.
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) session.status = "interrupted";
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    // Jait uses its own ConsentManager — this is a no-op
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "completed";
      session.completedAt = new Date().toISOString();
    }
    this.sessions.delete(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}

const JAIT_MODELS: ProviderModelInfo[] = [
  { id: "gpt-4o", name: "GPT-4o", description: "OpenAI's flagship multimodal model", isDefault: true },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and affordable" },
  { id: "gpt-4.1", name: "GPT-4.1", description: "Latest GPT-4 series" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", description: "Fast GPT-4.1" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", description: "Ultra-fast, lightweight" },
  { id: "o4-mini", name: "o4 Mini", description: "Reasoning model" },
  { id: "o3", name: "o3", description: "Advanced reasoning" },
  { id: "o3-mini", name: "o3 Mini", description: "Fast reasoning" },
  { id: "claude-sonnet-4-6-20250318", name: "Claude Sonnet 4.6", description: "Via OpenRouter/compatible API" },
  { id: "deepseek-chat", name: "DeepSeek V3", description: "DeepSeek's latest" },
  { id: "deepseek-reasoner", name: "DeepSeek R1", description: "DeepSeek reasoning model" },
];
