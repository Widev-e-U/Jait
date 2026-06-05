/**
 * Channel manager — lifecycle, persistence, and the inbound→agent→outbound pipeline.
 *
 * Connectors are registered once; the manager starts/stops them, persists their
 * config, decides which inbound messages warrant a reply, runs the agent loop to
 * produce that reply, and sends it back through the connector.
 */

import type { SqliteDatabase } from "../db/sqlite-shim.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { AuditWriter } from "../services/audit.js";
import {
  runAgentLoop,
  buildToolSchemas,
  SteeringController,
  type LLMConfig,
  type AgentMessage,
  type ToolExecutor,
} from "../tools/agent-loop.js";
import { uuidv7 } from "../db/uuidv7.js";
import type {
  ChannelConfig,
  ChannelConnector,
  ChannelStatus,
  ChannelStatusDetail,
  InboundMessage,
} from "./types.js";

/** Produces an assistant reply for a conversation. Injectable for testing. */
export interface ReplyGenerator {
  generate(
    history: AgentMessage[],
    ctx: { channelId: string; sessionId: string; allowedTools: Set<string> },
  ): Promise<string>;
}

export interface ChannelManagerDeps {
  sqlite: SqliteDatabase;
  /** Resolves the LLM config used for channel replies. */
  resolveLLM: () => LLMConfig;
  toolRegistry?: ToolRegistry;
  audit?: AuditWriter;
  projectRoot?: string;
  /** Auth context for tool execution (per-user keys, backend, model). */
  auth?: { userId?: string; apiKeys?: Record<string, string>; jaitBackend?: string; model?: string };
  /** System prompt for the channel agent. */
  systemPrompt?: string;
  /** Max conversation messages to retain (excluding the system prompt). */
  maxHistory?: number;
  /** Override reply generation (defaults to the agent loop). */
  replyGenerator?: ReplyGenerator;
  log?: (msg: string, ...args: unknown[]) => void;
}

interface ManagedChannel {
  connector: ChannelConnector;
  status: ChannelStatus;
  detail: ChannelStatusDetail;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are Jait, a helpful AI assistant replying over a messaging channel (e.g. WhatsApp). " +
  "Keep replies concise and conversational — they are read on a phone. " +
  "Do not use markdown headings or code fences unless explicitly asked.";

const DEFAULT_MAX_HISTORY = 20;

/** Normalize a WhatsApp-style id to its bare number for allowlist comparison. */
export function normalizeSenderId(id: string): string {
  // "<number>@s.whatsapp.net" / "<number>:<device>@..." / "+<number>" → "<number>"
  return id.split("@")[0]!.split(":")[0]!.replace(/[^0-9]/g, "");
}

/** Decide whether the agent should reply to an inbound message. */
export function shouldRespond(msg: InboundMessage, config: ChannelConfig): boolean {
  // Never reply to our own outgoing messages to other people.
  if (msg.fromMe && !msg.isSelfChat) return false;
  // The self-chat is the user talking to themselves — always answer it, even
  // when an allowlist is configured. The allowlist gates *other* people, and a
  // self-chat message (especially LID-addressed) carries no usable sender id to
  // match against anyway, so it must short-circuit before the allowlist check.
  if (msg.isSelfChat) return true;
  if (config.respondToAll) return !msg.fromMe;

  const allow = (config.allowedSenders ?? []).map(normalizeSenderId).filter(Boolean);
  if (allow.length > 0) {
    return allow.includes(normalizeSenderId(msg.senderId));
  }
  // No allowlist configured and not the self-chat → stay silent (safe default).
  return false;
}

export class ChannelManager {
  private readonly deps: ChannelManagerDeps;
  private readonly channels = new Map<string, ManagedChannel>();
  /** Per-conversation message history (keyed by `${channelId}:${conversationId}`). */
  private readonly histories = new Map<string, AgentMessage[]>();
  /** Per-conversation serialization so messages are answered in order. */
  private readonly locks = new Map<string, Promise<void>>();

  private readonly replyGenerator: ReplyGenerator;

  constructor(deps: ChannelManagerDeps) {
    this.deps = deps;
    this.replyGenerator = deps.replyGenerator ?? new AgentLoopReplyGenerator(deps);
    this.ensureTable();
  }

  private log(msg: string, ...args: unknown[]) {
    (this.deps.log ?? ((m, ...a) => console.log("[channels]", m, ...a)))(msg, ...args);
  }

  /* ── DB ─────────────────────────────────────────────────────────── */

  private ensureTable() {
    this.deps.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      )
    `);
  }

  getConfig(id: string): ChannelConfig {
    const row = this.deps.sqlite
      .prepare("SELECT enabled, config FROM channels WHERE id = ?")
      .get(id) as { enabled?: number; config?: string } | null;
    if (!row) return {};
    const parsed = JSON.parse(row.config || "{}") as ChannelConfig;
    return { ...parsed, enabled: Boolean(row.enabled) };
  }

  setConfig(id: string, patch: Partial<ChannelConfig>): ChannelConfig {
    const current = this.getConfig(id);
    const next: ChannelConfig = { ...current, ...patch };
    const enabled = next.enabled ? 1 : 0;
    const { enabled: _e, ...rest } = next;
    this.deps.sqlite
      .prepare(
        `INSERT INTO channels (id, enabled, config, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, config = excluded.config, updated_at = excluded.updated_at`,
      )
      .run(id, enabled, JSON.stringify(rest), new Date().toISOString());
    return next;
  }

  /* ── Registration / lifecycle ───────────────────────────────────── */

  register(connector: ChannelConnector): void {
    const existing = this.channels.get(connector.id);
    if (existing) {
      if (existing.connector === connector) return;
      throw new Error(`Channel '${connector.id}' is already registered`);
    }
    this.channels.set(connector.id, { connector, status: "stopped", detail: {} });
  }

  /** Remove a connector from the available channel list. Config is preserved. */
  async unregister(id: string): Promise<void> {
    const managed = this.channels.get(id);
    if (!managed) return;
    try {
      await managed.connector.stop();
    } finally {
      this.channels.delete(id);
    }
  }

  list(): { id: string; label: string; status: ChannelStatus; enabled: boolean; qr: string | null; config: ChannelConfig }[] {
    return [...this.channels.values()].map((c) => {
      const config = this.getConfig(c.connector.id);
      return {
        id: c.connector.id,
        label: c.connector.label,
        status: c.status,
        enabled: Boolean(config.enabled),
        qr: c.detail.qr ?? c.connector.currentQr(),
        config,
      };
    });
  }

  get(id: string): ManagedChannel | undefined {
    return this.channels.get(id);
  }

  /** Start a connector and persist enabled=true. */
  async start(id: string): Promise<void> {
    const managed = this.channels.get(id);
    if (!managed) throw new Error(`Channel '${id}' not found`);
    this.setConfig(id, { enabled: true });

    if (managed.status === "connected" || managed.status === "connecting" || managed.status === "qr") {
      return;
    }

    await managed.connector.start({
      onInbound: (msg) => { void this.handleInbound(msg); },
      onStatus: (status, detail) => {
        managed.status = status;
        managed.detail = detail ?? {};
        this.log(`${id}: status=${status}${detail?.error ? ` error=${detail.error}` : ""}`);
      },
    });
  }

  /** Stop a connector and persist enabled=false. */
  async stop(id: string): Promise<void> {
    const managed = this.channels.get(id);
    if (!managed) throw new Error(`Channel '${id}' not found`);
    this.setConfig(id, { enabled: false });
    await managed.connector.stop();
    managed.status = "stopped";
    managed.detail = {};
  }

  /** Start every connector whose persisted config has enabled=true. */
  async startEnabled(): Promise<void> {
    for (const { connector } of this.channels.values()) {
      if (this.getConfig(connector.id).enabled) {
        try {
          await this.start(connector.id);
        } catch (err) {
          this.log(`Failed to auto-start ${connector.id}:`, err);
        }
      }
    }
  }

  async dispose(): Promise<void> {
    for (const { connector } of this.channels.values()) {
      try { await connector.stop(); } catch { /* best effort */ }
    }
  }

  /* ── Inbound → agent → outbound ─────────────────────────────────── */

  private async handleInbound(msg: InboundMessage): Promise<void> {
    const managed = this.channels.get(msg.channelId);
    if (!managed) return;
    if (!msg.text.trim()) return;

    const config = this.getConfig(msg.channelId);
    if (!shouldRespond(msg, config)) return;

    const key = `${msg.channelId}:${msg.conversationId}`;
    // Serialize replies per conversation.
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => this.replyTo(managed, msg, config));
    this.locks.set(key, next.then(() => {}, () => {}));
    await next;
  }

  private async replyTo(managed: ManagedChannel, msg: InboundMessage, config: ChannelConfig): Promise<void> {
    const key = `${msg.channelId}:${msg.conversationId}`;
    const maxHistory = this.deps.maxHistory ?? DEFAULT_MAX_HISTORY;

    let history = this.histories.get(key);
    if (!history) {
      history = [{ role: "system", content: this.deps.systemPrompt ?? DEFAULT_SYSTEM_PROMPT }];
      this.histories.set(key, history);
    }
    history.push({ role: "user", content: msg.text });

    // Resolve allowed tools (filtered to those that actually exist).
    const allowedTools = new Set(
      (config.tools ?? []).filter((t) => this.deps.toolRegistry?.has(t)),
    );

    try {
      const reply = (await this.replyGenerator.generate(history, {
        channelId: msg.channelId,
        sessionId: `channel:${key}`,
        allowedTools,
      })).trim();

      if (reply) {
        history.push({ role: "assistant", content: reply });
        // Trim history (keep system prompt + last N turns).
        if (history.length > maxHistory + 1) {
          const system = history[0]!;
          this.histories.set(key, [system, ...history.slice(history.length - maxHistory)]);
        }
        await managed.connector.send({ conversationId: msg.conversationId, text: reply });
      }
    } catch (err) {
      this.log(`reply failed for ${key}:`, err);
      try {
        await managed.connector.send({
          conversationId: msg.conversationId,
          text: "⚠️ Sorry — I hit an error generating a reply.",
        });
      } catch { /* connector may be down */ }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Default reply generator — runs the agent loop                      */
/* ------------------------------------------------------------------ */

export class AgentLoopReplyGenerator implements ReplyGenerator {
  constructor(private readonly deps: ChannelManagerDeps) {}

  async generate(
    history: AgentMessage[],
    ctx: { channelId: string; sessionId: string; allowedTools: Set<string> },
  ): Promise<string> {
    const { toolRegistry, audit, auth } = this.deps;
    const allowedTools = ctx.allowedTools;
    const toolSchemas = toolRegistry && allowedTools.size > 0
      ? buildToolSchemas(toolRegistry, allowedTools)
      : [];
    const hasTools = toolSchemas.length > 0;
    const abort = new AbortController();
    const steering = new SteeringController();

    const executor: ToolExecutor = async (name, args, sid, _auth, onChunk, signal) => {
      if (!allowedTools.has(name) || !toolRegistry) {
        return { ok: false, message: `Tool '${name}' is not available to this channel` };
      }
      return toolRegistry.execute(
        name,
        args,
        {
          sessionId: sid,
          actionId: uuidv7(),
          projectRoot: this.deps.projectRoot ?? process.cwd(),
          requestedBy: `channel:${ctx.channelId}`,
          userId: auth?.userId,
          apiKeys: auth?.apiKeys,
          jaitBackend: auth?.jaitBackend,
          model: auth?.model,
          onOutputChunk: onChunk,
          signal,
        },
        audit,
      );
    };

    const result = await runAgentLoop(
      {
        llm: this.deps.resolveLLM(),
        history,
        toolSchemas,
        hasTools,
        sessionId: ctx.sessionId,
        auth: auth?.userId
          ? { userId: auth.userId, apiKeys: auth.apiKeys, jaitBackend: auth.jaitBackend, model: auth.model }
          : undefined,
        abort,
        maxRounds: hasTools ? 6 : 1,
        maxRetries: 1,
        parallel: true,
        toolRegistry,
        allowedTools: hasTools ? allowedTools : undefined,
      },
      executor,
      steering,
    );

    return result.content ?? "";
  }
}
