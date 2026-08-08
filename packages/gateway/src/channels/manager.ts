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
  buildTieredToolSchemas,
  toOpenAIName,
  SteeringController,
  type LLMConfig,
  type AgentMessage,
  type ToolExecutor,
} from "../tools/agent-loop.js";
import { buildSystemPrompt, type ModelEndpoint, type PromptContext } from "../tools/prompts/index.js";
import { MUTATING_TOOLS } from "../tools/chat-modes.js";
import type { Skill } from "../skills/index.js";
import type { ConsentManager, ConsentRequest, ConsentDecision } from "../security/consent-manager.js";
import { uuidv7 } from "../db/uuidv7.js";
import type {
  ChannelConfig,
  ChannelConnector,
  ChannelStatus,
  ChannelStatusDetail,
  InboundMessage,
} from "./types.js";

/** Owner user context for channel agent turns — keys, backend, picked model, disabled tools. */
export interface ChannelAuthContext {
  userId?: string;
  apiKeys?: Record<string, string>;
  jaitBackend?: string;
  model?: string;
  /** Reasoning effort level for reasoning-capable models (minimal|low|medium|high). */
  reasoningEffort?: string | null;
  /** Tools the owner has disabled in settings — never sent to the LLM, never executed. */
  disabledTools?: Set<string>;
}

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
  auth?: ChannelAuthContext;
  /**
   * Resolves the owner user context (keys, backend, picked model, disabled
   * tools) for each turn. Preferred over the static `auth` — channels run
   * without request context, so this reads the owner's persisted settings live
   * so replies use the same provider/model/tool surface as the web chat.
   */
  resolveAuth?: () => ChannelAuthContext | undefined;
  /**
   * Resolves the enabled skills to inject into the channel agent's system
   * prompt — gives WhatsApp et al. the same skill catalogue as the web chat.
   */
  resolveSkills?: () => Skill[];
  /**
   * Consent manager — when present, mutating tools require an in-band yes/no
   * approval from the user before they run (the channel sends a prompt and waits
   * for the reply). Without it, channel tools auto-execute.
   */
  consentManager?: ConsentManager;
  /** Approval timeout (ms) before a consent prompt auto-denies. Default 5 min. */
  consentTimeoutMs?: number;
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

/**
 * Channel-style guidance appended to the full agent system prompt. The base
 * prompt grants the same tools/skills as the web chat; this note just adapts
 * tone/format for a messaging surface.
 */
const CHANNEL_STYLE_NOTE =
  "You are replying over a messaging channel (e.g. WhatsApp), read on a phone, so keep replies " +
  "concise and conversational and avoid markdown headings or code fences unless explicitly asked. " +
  "You have the same tools and skills as the desktop app — use them to actually perform tasks " +
  "(run commands, search, read/edit files, manage skills, etc.) instead of only describing them.";

const DEFAULT_MAX_HISTORY = 20;

/** Hard ceiling on per-user max rounds to avoid runaway loops. */
const CHANNEL_MAX_ROUNDS_CEILING = 200;

/** `0` delegates to the agent loop's 64-round safety backstop. */
const CHANNEL_DEFAULT_MAX_ROUNDS = 0;

/** Resolve per-user JAIT_MAX_ROUNDS (clamped), else the channel safety default. */
function resolveChannelMaxRounds(apiKeys?: Record<string, string>): number {
  const raw = apiKeys?.["JAIT_MAX_ROUNDS"]?.trim();
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, CHANNEL_MAX_ROUNDS_CEILING);
  }
  return CHANNEL_DEFAULT_MAX_ROUNDS;
}

/** Default approval window for an in-band consent prompt before auto-deny. */
const DEFAULT_CONSENT_TIMEOUT_MS = 5 * 60_000;

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
  /** sessionId → conversation target, so consent prompts reach the right chat. */
  private readonly sessionTargets = new Map<string, { channelId: string; conversationId: string; key: string }>();
  /** conversationKey → pending consent requestId (one outstanding approval per chat). */
  private readonly consentByConversation = new Map<string, string>();
  /** requestId → conversation, to clear mappings once a decision lands. */
  private readonly consentTargets = new Map<string, { channelId: string; conversationId: string; key: string }>();

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

    // If we're awaiting a yes/no approval in this conversation, this message is
    // the answer to it. Handle it OUTSIDE the per-conversation lock — the reply
    // turn that requested consent is holding the lock while it blocks on this
    // very message, so queuing behind the lock would deadlock.
    if (await this.tryResolveConsent(managed, msg, key)) return;

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

    // Record where this session lives so consent prompts reach the right chat.
    const sessionId = `channel:${key}`;
    this.sessionTargets.set(sessionId, { channelId: msg.channelId, conversationId: msg.conversationId, key });

    try {
      const reply = (await this.replyGenerator.generate(history, {
        channelId: msg.channelId,
        sessionId,
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
    } finally {
      this.sessionTargets.delete(sessionId);
    }
  }

  /* ── In-band tool approval (consent over the chat) ──────────────── */

  /**
   * Called (via the ConsentManager `onRequest` bridge) when a tool in a channel
   * session needs approval. Sends an in-band yes/no prompt to the originating
   * chat and records the pending request so a reply can resolve it.
   */
  handleConsentRequest(request: ConsentRequest): void {
    const target = this.sessionTargets.get(request.sessionId);
    if (!target) return; // not a channel session (e.g. web chat) — ignore.
    const managed = this.channels.get(target.channelId);
    if (!managed) return;
    this.consentByConversation.set(target.key, request.id);
    this.consentTargets.set(request.id, target);
    const text = buildConsentPrompt(request);
    void managed.connector.send({ conversationId: target.conversationId, text }).catch((err) => {
      this.log(`failed to send consent prompt for ${target.key}:`, err);
    });
  }

  /**
   * Called (via the ConsentManager `onDecision` bridge) when any consent
   * request resolves. Clears channel-side mappings and, on timeout, lets the
   * user know the action was skipped.
   */
  handleConsentDecision(decision: ConsentDecision): void {
    const target = this.consentTargets.get(decision.requestId);
    if (!target) return; // not a channel consent.
    this.consentTargets.delete(decision.requestId);
    if (this.consentByConversation.get(target.key) === decision.requestId) {
      this.consentByConversation.delete(target.key);
    }
    if (decision.decidedVia === "timeout") {
      const managed = this.channels.get(target.channelId);
      void managed?.connector
        .send({ conversationId: target.conversationId, text: "⌛ No reply — skipped that action." })
        .catch(() => { /* connector may be down */ });
    }
  }

  /**
   * If the conversation has an outstanding approval, interpret this inbound
   * message as the yes/no answer and resolve the consent request. Returns true
   * when the message was consumed as a consent reply (and must NOT start a turn).
   */
  private async tryResolveConsent(managed: ManagedChannel, msg: InboundMessage, key: string): Promise<boolean> {
    const requestId = this.consentByConversation.get(key);
    if (!requestId || !this.deps.consentManager) return false;

    const verdict = parseYesNo(msg.text);
    if (verdict === "yes") {
      this.deps.consentManager.approve(requestId, "click", "Approved over channel");
      return true;
    }
    if (verdict === "no") {
      this.deps.consentManager.reject(requestId, "click", "Declined over channel");
      return true;
    }
    // Ambiguous — keep the request pending and re-prompt.
    try {
      await managed.connector.send({
        conversationId: msg.conversationId,
        text: "Please reply *yes* to proceed or *no* to skip.",
      });
    } catch { /* connector may be down */ }
    return true;
  }
}

/** Classify a free-text reply as a yes/no/unknown approval verdict. */
function parseYesNo(text: string): "yes" | "no" | "unknown" {
  const t = text.trim().toLowerCase().replace(/[!.,]+$/, "");
  if (/^(y|yes|yeah|yep|yup|ok|okay|sure|go|do it|proceed|approve|approved|ja|👍|✅)$/.test(t)) return "yes";
  if (/^(n|no|nope|nah|stop|cancel|skip|deny|denied|don'?t|nein|👎|🚫|❌)$/.test(t)) return "no";
  return "unknown";
}

/** Render an in-band approval prompt for a pending tool execution. */
function buildConsentPrompt(request: ConsentRequest): string {
  const preview = request.preview ?? {};
  let detail = "";
  if (typeof preview.command === "string") detail = `\n\`${preview.command}\``;
  else if (typeof preview.path === "string") detail = `\n${preview.path}`;
  else if (typeof preview.package === "string") detail = `\n${preview.package}`;
  return `⚠️ I'd like to run *${request.toolName}*${detail}\nReply *yes* to proceed or *no* to skip. (auto-skips in 5 min)`;
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
    const { toolRegistry, audit } = this.deps;
    const auth = this.deps.resolveAuth?.() ?? this.deps.auth;
    const llm = this.deps.resolveLLM();
    const disabledTools = auth?.disabledTools;

    // Tools: the channel agent gets the same tiered registry as the web chat
    // (respecting the owner's disabled tools). The per-channel `tools` allowlist,
    // when non-empty, narrows further; empty/undefined → full access.
    const restrictTo = ctx.allowedTools.size > 0 ? ctx.allowedTools : undefined;
    const isOllama = (auth?.jaitBackend ?? "") === "ollama";
    const latestUserQuery = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
    let toolSchemas = toolRegistry
      ? buildTieredToolSchemas(toolRegistry, disabledTools, {
          ollamaEssentials: isOllama,
          query: latestUserQuery,
        })
      : [];
    if (restrictTo) {
      const allowedOpenAiNames = new Set([...restrictTo].map(toOpenAIName));
      toolSchemas = toolSchemas.filter((s) => allowedOpenAiNames.has(s.function.name));
    }
    const hasTools = toolSchemas.length > 0;
    const abort = new AbortController();
    const steering = new SteeringController();

    // Refresh the system prompt each turn with the full agent capabilities +
    // skill catalogue, so the channel agent knows about (and can use) the same
    // tools and skills as the desktop chat.
    if (hasTools) {
      const modelEndpoint: ModelEndpoint = {
        model: llm.openaiModel,
        baseUrl: llm.openaiBaseUrl,
        backend: auth?.jaitBackend,
      };
      const promptCtx: PromptContext = {
        projectRoot: this.deps.projectRoot ?? process.cwd(),
        skills: this.deps.resolveSkills?.(),
        backend: auth?.jaitBackend,
      };
      const channelNote = this.deps.systemPrompt ?? CHANNEL_STYLE_NOTE;
      const systemPrompt = `${buildSystemPrompt("agent", modelEndpoint, promptCtx)}\n\n${channelNote}`;
      if (history[0]?.role === "system") history[0] = { role: "system", content: systemPrompt };
      else history.unshift({ role: "system", content: systemPrompt });
    }

    const executor: ToolExecutor = async (name, args, sid, _auth, onChunk, signal) => {
      if (!toolRegistry || !toolRegistry.has(name)) {
        return { ok: false, message: `Tool '${name}' is not available` };
      }
      if (restrictTo && !restrictTo.has(name)) {
        return { ok: false, message: `Tool '${name}' is not available to this channel` };
      }
      if (disabledTools?.has(name)) {
        return { ok: false, message: `Tool '${name}' is disabled` };
      }

      const actionId = uuidv7();

      // In-band approval: mutating tools require a yes/no reply from the user
      // before running. The ConsentManager `onRequest` bridge sends the prompt
      // to the chat; this awaits the decision (or the timeout).
      const consent = this.deps.consentManager;
      if (consent && MUTATING_TOOLS.has(name)) {
        const decision = await consent.requestConsent({
          actionId,
          toolName: name,
          summary: `Run ${name}`,
          preview: (args as Record<string, unknown>) ?? {},
          risk: "high",
          policy: {
            consentLevel: "always",
            description: "Mutating tool invoked over a messaging channel",
            knownTool: true,
            source: "profile",
          },
          sessionId: sid,
          timeoutMs: this.deps.consentTimeoutMs ?? DEFAULT_CONSENT_TIMEOUT_MS,
        });
        if (!decision.approved) {
          return {
            ok: false,
            message: decision.decidedVia === "timeout"
              ? `Approval for ${name} timed out — skipped.`
              : `User declined to run ${name}.`,
            data: { consentRejected: true, decidedVia: decision.decidedVia },
          };
        }
      }

      return toolRegistry.execute(
        name,
        args,
        {
          sessionId: sid,
          actionId,
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
        llm,
        history,
        toolSchemas,
        hasTools,
        sessionId: ctx.sessionId,
        auth: auth?.userId
          ? { userId: auth.userId, apiKeys: auth.apiKeys, jaitBackend: auth.jaitBackend, model: auth.model, reasoningEffort: auth.reasoningEffort }
          : undefined,
        abort,
        maxRounds: hasTools ? resolveChannelMaxRounds(auth?.apiKeys) : 1,
        maxRetries: 1,
        // Sequential so at most one approval prompt is outstanding per chat —
        // a messaging surface can only field one yes/no at a time.
        parallel: false,
        toolRegistry,
        disabledTools,
        mode: "agent",
        allowedTools: restrictTo,
      },
      executor,
      steering,
    );

    return result.content ?? "";
  }
}
