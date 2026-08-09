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
import { classifyIrreversibleCommand } from "../security/tool-permissions.js";
import type { Skill } from "../skills/index.js";
import type { ConsentManager, ConsentRequest, ConsentDecision } from "../security/consent-manager.js";
import { uuidv7 } from "../db/uuidv7.js";
import {
  CHANNEL_ACTIVATED_TOOLS,
  CHANNEL_ASSISTANT_NOTE,
  buildChannelContextBlock,
  hostTimeZone,
} from "./assistant.js";
import type {
  ChannelChoice,
  ChannelConfig,
  ChannelConnector,
  ChannelPairing,
  ChannelPairOptions,
  ChannelSetupGuide,
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

/** Everything a reply turn needs to know about where and how it is running. */
export interface ReplyContext {
  channelId: string;
  sessionId: string;
  allowedTools: Set<string>;
  model?: string;
  /** Provider serving `model` — a CLI provider id routes to the ACP path. */
  modelProvider?: string;
  /** Conversation the turn belongs to, for provider-side approval prompts. */
  conversationId?: string;
  /** Agent decides tool use itself instead of asking in the chat. */
  autoApprove?: boolean;
  /** Called for each tool call, to mirror the work into the chat. */
  onProgress?: (line: string) => void;
  /** Situational facts (chat id, local time, model) prepended to the prompt. */
  contextBlock?: string;
  /** Model to try once when `model` fails to authenticate. */
  fallbackModel?: string;
  /** Provider serving `fallbackModel`. */
  fallbackModelProvider?: string;
  /** Told when a turn had to fall back, so the chat can say so. */
  onFallback?: (from: string | undefined, to: string) => void;
}

/** Produces an assistant reply for a conversation. Injectable for testing. */
export interface ReplyGenerator {
  generate(history: AgentMessage[], ctx: ReplyContext): Promise<string>;
}

/** A model the channel can switch to with `/model`. */
export interface ChannelModelOption {
  id: string;
  label?: string;
  /** Backend grouping shown in the picker, e.g. "OpenAI" / "Ollama". */
  group?: string;
  /**
   * Provider id serving this model. Absent/"jait" for the HTTP backends; a
   * provider account id for CLI providers (Claude Code, Codex), which need the
   * ACP reply path rather than a chat-completions call.
   */
  provider?: string;
}

/** A message pushed into a channel by the gateway rather than by a reply turn. */
export interface ChannelNotification {
  title: string;
  body: string;
  level?: "info" | "success" | "warning" | "error";
  /** Deep link into the Jait UI, appended so the phone can jump straight there. */
  link?: string;
}

export interface ChannelManagerDeps {
  sqlite: SqliteDatabase;
  /**
   * Resolves the LLM config used for channel replies. `requestedModel` carries
   * the per-channel `/model` override and wins over the owner's picked model.
   */
  resolveLLM: (requestedModel?: string) => LLMConfig;
  /** Models offered by `/model`. Defaults to none, which disables switching. */
  resolveModels?: () => Promise<ChannelModelOption[]>;
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
  /**
   * Provider registry, needed to run turns against CLI providers picked with
   * `/model`. Absent → those models are offered by nobody and never selected.
   */
  providerRegistry?: import("../providers/registry.js").ProviderRegistry;
  /** Gateway host/port, so a CLI session can reach back for MCP tools. */
  gatewayAddress?: { host: string; port: number };
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

/** Hard ceiling on the per-user autonomous checkpoint interval. */
const CHANNEL_MAX_ROUNDS_CEILING = 200;

/** `0` delegates to the agent loop's default 64-round checkpoint interval. */
const CHANNEL_DEFAULT_MAX_ROUNDS = 0;

/** Resolve per-user JAIT_MAX_ROUNDS checkpoint interval, else the default. */
function resolveChannelMaxRounds(apiKeys?: Record<string, string>): number {
  const raw = apiKeys?.["JAIT_MAX_ROUNDS"]?.trim();
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, CHANNEL_MAX_ROUNDS_CEILING);
  }
  return CHANNEL_DEFAULT_MAX_ROUNDS;
}

/**
 * Whether the agent decides tool use itself on this channel. Defaults to on:
 * a chat assistant that asks before every step is unusable on a phone. The
 * consent executor still stops for irreversible commands regardless.
 */
export function autoApproves(config: ChannelConfig): boolean {
  return config.autoApprove !== false;
}

/**
 * Reason a tool call is irreversible, or undefined when it is not. Mirrors the
 * check in ConsentAwareExecutor for the channel's own executor, which runs
 * tools directly against the registry.
 */
export function irreversibleReasonFor(args: unknown): string | undefined {
  const command = (args as { command?: unknown } | null)?.command;
  if (typeof command !== "string" || !command.trim()) return undefined;
  const verdict = classifyIrreversibleCommand(command);
  return verdict.irreversible ? verdict.reason ?? "irreversible command" : undefined;
}

/** Telegram rejects rapid edits; this is a comfortable floor between them. */
const PROGRESS_EDIT_INTERVAL_MS = 2_000;

/** How many steps to keep visible in the live message. */
const PROGRESS_MAX_STEPS = 8;

/** One line per tool call, in the order they happened. */
export function formatProgress(steps: string[]): string {
  const shown = steps.slice(-PROGRESS_MAX_STEPS);
  const omitted = steps.length - shown.length;
  return [
    omitted > 0 ? `🔧 Working… (${omitted} earlier steps)` : "🔧 Working…",
    ...shown,
  ].join("\n");
}

/**
 * Mirrors the agent's tool calls into a single message that gets edited as the
 * turn runs, so a long reply shows its work instead of going quiet. Edits are
 * throttled and always best-effort — progress must never break the answer.
 */
export class ProgressReporter {
  private steps: string[] = [];
  private messageId: string | null = null;
  private lastEditAt = 0;
  private pending: string | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly connector: ChannelConnector,
    private readonly conversationId: string,
  ) {}

  /** True when this connector can show live progress at all. */
  static supportedBy(connector: ChannelConnector): boolean {
    return typeof connector.sendLive === "function" && typeof connector.editLive === "function";
  }

  step(line: string): void {
    this.steps.push(line);
    this.pending = formatProgress(this.steps);
    this.flushSoon();
  }

  /** Remove the progress message once the real answer is on its way. */
  finish(): void {
    this.pending = null;
    const id = this.messageId;
    if (!id) return;
    this.messageId = null;
    this.chain = this.chain
      .then(() => this.connector.editLive?.(this.conversationId, id, formatProgress(this.steps).replace("🔧 Working…", "✅ Done")))
      .catch(() => { /* best effort */ });
  }

  private flushSoon(): void {
    const now = Date.now();
    if (this.messageId && now - this.lastEditAt < PROGRESS_EDIT_INTERVAL_MS) return;
    this.lastEditAt = now;
    const text = this.pending;
    if (!text) return;
    this.pending = null;

    this.chain = this.chain
      .then(async () => {
        if (!this.messageId) {
          this.messageId = await this.connector.sendLive?.(this.conversationId, text) ?? null;
          return;
        }
        await this.connector.editLive?.(this.conversationId, this.messageId, text);
      })
      .catch(() => { /* best effort */ });
  }
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

/**
 * Commands the gateway answers itself, before the agent sees the message.
 *
 * Single source of truth: the in-chat `/help` text, the dispatcher, and the
 * messenger's own command menu (Telegram's `/` autocomplete) are all derived
 * from this list, so a new command shows up everywhere at once.
 */
export const CHANNEL_COMMAND_DEFS = [
  { name: "model", description: "Pick a provider and model for this channel", usage: "/model [number|id|provider <name>|fallback <id>|reset]" },
  { name: "notifications", description: "Send routines and gateway alerts to this chat", usage: "/notifications on|off" },
  { name: "approvals", description: "Ask before each tool instead of deciding automatically", usage: "/approvals ask|auto" },
  { name: "progress", description: "Show tool calls while the agent works", usage: "/progress on|off" },
  { name: "status", description: "Channel, model and notification state", usage: "/status" },
  { name: "help", description: "Show the available commands", usage: "/help" },
] as const;

type ChannelCommand = (typeof CHANNEL_COMMAND_DEFS)[number]["name"];

const CHANNEL_COMMANDS: readonly string[] = CHANNEL_COMMAND_DEFS.map((c) => c.name);

const COMMAND_HELP = [
  "Commands:",
  ...CHANNEL_COMMAND_DEFS.map((c) => `${c.usage} — ${c.description}`),
  "",
  "Anything else goes to the assistant.",
].join("\n");

/**
 * Parse a leading slash command. Telegram appends `@botname` to commands sent
 * in groups, so that suffix is stripped. Returns null for ordinary messages.
 */
export function parseCommand(text: string): { command: ChannelCommand; args: string } | null {
  const match = /^\/([a-zA-Z]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  const name = match[1]!.toLowerCase();
  if (!CHANNEL_COMMANDS.includes(name)) return null;
  return { command: name as ChannelCommand, args: match[2] ?? "" };
}

/**
 * How long a resolved model catalogue is reused. Walking the picker fires
 * several `/model` calls in a row (providers → models → back), and re-resolving
 * each time means re-probing every CLI provider for the same answer.
 */
const MODEL_CACHE_TTL_MS = 60_000;

/**
 * Options offered as buttons by `/model`. A catalogue can run to hundreds of
 * entries; past a couple of dozen a dialog is worse than useless on a phone, so
 * the rest stay reachable by id.
 */
const MAX_MODEL_CHOICES = 24;

/** Button caption for a model — provider and current marker where they help. */
export function modelChoiceLabel(model: ChannelModelOption, active?: string): string {
  const name = model.label ?? model.id;
  const grouped = model.group ? `${name} (${model.group})` : name;
  return model.id === active ? `✅ ${grouped}` : grouped;
}

/** Providers present in a catalogue, with their model counts, biggest first. */
export function groupModelsByProvider(models: ChannelModelOption[]): { group: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const model of models) {
    const group = model.group?.trim();
    if (!group) continue;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));
}

const NOTIFICATION_ICONS = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "🚨",
} as const;

/** Render a notification as the plain text a messenger shows well. */
export function formatNotification(notification: ChannelNotification): string {
  const icon = NOTIFICATION_ICONS[notification.level ?? "info"];
  const lines = [`${icon} ${notification.title}`.trim()];
  if (notification.body.trim()) lines.push(notification.body.trim());
  // Notification links are usually in-app paths ("/plans/abc"), which mean
  // nothing in a messenger — only absolute URLs are worth sending.
  if (/^https?:\/\//i.test(notification.link ?? "")) lines.push(notification.link!);
  return lines.join("\n\n");
}

/**
 * Who receives a notification on a channel. Only the paired/allowlisted
 * accounts — `respondToAll` governs who may *talk to* the agent and must not
 * turn the channel into a broadcast list.
 */
export function notificationRecipients(config: ChannelConfig): string[] {
  return [...new Set((config.allowedSenders ?? []).map((s) => s.trim()).filter(Boolean))];
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
  /** Last resolved model catalogue, reused while walking the `/model` picker. */
  private modelCache: { at: number; models: ChannelModelOption[] } | null = null;
  /** In-flight catalogue resolution, so parallel taps don't each probe. */
  private modelCacheInflight: Promise<ChannelModelOption[]> | null = null;

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

  list(): { id: string; label: string; status: ChannelStatus; enabled: boolean; qr: string | null; link: string | null; expiresAt: string | null; config: ChannelConfig }[] {
    return [...this.channels.values()].map((c) => {
      const config = this.getConfig(c.connector.id);
      return {
        id: c.connector.id,
        label: c.connector.label,
        status: c.status,
        enabled: Boolean(config.enabled),
        qr: c.detail.qr ?? c.connector.currentQr(),
        // Kept alongside the QR so reloading mid-pairing still offers the link
        // and can keep counting down instead of showing a dead code.
        link: c.detail.link ?? null,
        expiresAt: c.detail.expiresAt ?? null,
        config,
      };
    });
  }

  get(id: string): ManagedChannel | undefined {
    return this.channels.get(id);
  }

  /** Start a connector and persist enabled=true. */
  async start(id: string, options?: ChannelPairOptions): Promise<void> {
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
      onPaired: (pairing) => { this.recordPairing(id, pairing); },
    }, this.getConfig(id), options);

    await this.publishCommandMenu(managed);
  }

  /**
   * Publish the slash commands to the messenger's own menu, so typing `/`
   * offers them. Best-effort: the channel is already up at this point, and a
   * rejected menu update must not turn a working connection into a failure.
   */
  private async publishCommandMenu(managed: ManagedChannel): Promise<void> {
    if (!managed.connector.setCommandMenu) return;
    try {
      await managed.connector.setCommandMenu(
        CHANNEL_COMMAND_DEFS.map(({ name, description }) => ({ name, description })),
      );
    } catch (err) {
      this.log(`${managed.connector.id}: command menu not published:`, err);
    }
  }

  /**
   * Re-enter pairing mode so another account can be linked. Only connectors
   * that support repeated pairing (Telegram) implement this.
   */
  async pair(id: string, options?: ChannelPairOptions): Promise<void> {
    const managed = this.channels.get(id);
    if (!managed) throw new Error(`Channel '${id}' not found`);
    if (!managed.connector.pair) {
      throw new Error(`Channel '${id}' does not support re-pairing`);
    }
    await managed.connector.pair(options);
  }

  /**
   * Setup instructions for creating the underlying messenger account. Returns
   * null for channels that need no such step (WhatsApp links an existing app).
   */
  async setupGuide(id: string): Promise<ChannelSetupGuide | null> {
    const managed = this.channels.get(id);
    if (!managed) throw new Error(`Channel '${id}' not found`);
    if (!managed.connector.setupGuide) return null;
    return managed.connector.setupGuide();
  }

  /**
   * Persist a paired sender into the channel allowlist, so the agent replies to
   * them without the user having to copy a numeric id by hand.
   */
  private recordPairing(id: string, pairing: ChannelPairing): void {
    const senderId = pairing.senderId.trim();
    if (!senderId) return;
    const existing = this.getConfig(id).allowedSenders ?? [];
    const normalized = normalizeSenderId(senderId);
    if (existing.some((s) => normalizeSenderId(s) === normalized)) return;
    this.setConfig(id, { allowedSenders: [...existing, senderId] });
    this.log(`${id}: paired ${pairing.senderName ?? senderId}`);
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

  /* ── Outbound notifications (gateway → channel) ─────────────────── */

  /**
   * Push a gateway notification into every channel opted in via
   * `config.notifications`. Recipients are the channel's allowed senders — the
   * accounts that completed pairing — so nothing is sent to strangers.
   *
   * Fire-and-forget by design: a messenger being down must never break the
   * task that produced the notification. Returns the delivery count for tests
   * and callers that want to report reach.
   */
  async notify(notification: ChannelNotification): Promise<number> {
    const text = formatNotification(notification);
    let delivered = 0;

    for (const managed of this.channels.values()) {
      const id = managed.connector.id;
      const config = this.getConfig(id);
      if (!config.notifications) continue;
      if (managed.status !== "connected") {
        this.log(`${id}: notification skipped (status=${managed.status})`);
        continue;
      }

      for (const recipient of notificationRecipients(config)) {
        try {
          await managed.connector.send({ conversationId: recipient, text });
          delivered += 1;
        } catch (err) {
          this.log(`${id}: notification to ${recipient} failed:`, err);
        }
      }
    }
    return delivered;
  }

  /**
   * Put a message into a conversation from outside a reply turn — today, a
   * scheduled reminder coming due.
   *
   * With `text` the message is delivered verbatim. With `prompt` the assistant
   * works the answer out first, as a normal turn in that conversation: same
   * model, same history, same approvals. That is what makes "every morning,
   * tell me what's on today" different from a fixed string.
   *
   * Queued behind the conversation lock, so a reminder that fires while the
   * user is mid-question waits its turn instead of interleaving with the reply.
   */
  async deliver(params: {
    channelId: string;
    conversationId: string;
    text?: string;
    prompt?: string;
  }): Promise<void> {
    const managed = this.channels.get(params.channelId);
    if (!managed) throw new Error(`Channel '${params.channelId}' is not registered`);
    if (managed.status !== "connected") {
      throw new Error(`Channel '${params.channelId}' is ${managed.status}`);
    }

    if (params.text) {
      await managed.connector.send({ conversationId: params.conversationId, text: params.text });
      return;
    }
    if (!params.prompt) throw new Error("Nothing to deliver — give text or prompt");

    const config = this.getConfig(params.channelId);
    await this.enqueue(
      `${params.channelId}:${params.conversationId}`,
      () => this.runTurn(managed, params.conversationId, params.prompt!, config),
    );
  }

  /* ── Inbound → agent → outbound ─────────────────────────────────── */

  /**
   * Run `task` after whatever is already queued for this conversation, so
   * answers stay in order. Returns when `task` itself has finished.
   */
  private async enqueue(key: string, task: () => Promise<void>): Promise<void> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(task);
    const settled = next.then(() => {}, () => {});
    this.locks.set(key, settled);
    // Drop the lock once the queue drains, so the next message isn't told the
    // channel is busy when it is idle.
    void settled.then(() => {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    });
    await next;
  }

  private async handleInbound(msg: InboundMessage): Promise<void> {
    const managed = this.channels.get(msg.channelId);
    if (!managed) return;
    if (!msg.text.trim()) return;

    const config = this.getConfig(msg.channelId);
    if (!shouldRespond(msg, config)) return;

    const key = `${msg.channelId}:${msg.conversationId}`;

    // Slash commands are handled by the gateway, not the model — they change
    // channel settings, which the agent cannot do. Checked before the consent
    // branch: a command is never a yes/no answer, so it must not be swallowed
    // as one, and a pending approval stays pending while the user runs /status.
    if (await this.tryHandleCommand(managed, msg, config)) return;

    // If we're awaiting a yes/no approval in this conversation, this message is
    // the answer to it. Handle it OUTSIDE the per-conversation lock — the reply
    // turn that requested consent is holding the lock while it blocks on this
    // very message, so queuing behind the lock would deadlock.
    if (await this.tryResolveConsent(managed, msg, key)) return;

    // Serialize replies per conversation so answers stay in order. A turn can
    // run for minutes (tools, many rounds), and queueing behind it silently
    // looks exactly like the bot being broken — so say so once.
    const busy = this.locks.has(key);
    if (busy) {
      void managed.connector
        .send({ conversationId: msg.conversationId, text: "⏳ Still working on the previous message — I'll get to this next." })
        .catch(() => { /* connector may be down */ });
    }

    await this.enqueue(key, () => this.replyTo(managed, msg, config));
  }

  private async replyTo(managed: ManagedChannel, msg: InboundMessage, config: ChannelConfig): Promise<void> {
    await this.runTurn(managed, msg.conversationId, msg.text, config);
  }

  /**
   * One agent turn in a conversation: append the prompt, generate, send.
   *
   * Shared by inbound messages and by scheduled deliveries — a reminder that has
   * to work something out at delivery time is the same turn as a reply, and
   * running it through a second path would give it a different model, a
   * different history and a different set of approvals.
   */
  private async runTurn(
    managed: ManagedChannel,
    conversationId: string,
    prompt: string,
    config: ChannelConfig,
  ): Promise<void> {
    const key = `${managed.connector.id}:${conversationId}`;
    const msg = { channelId: managed.connector.id, conversationId };
    const maxHistory = this.deps.maxHistory ?? DEFAULT_MAX_HISTORY;

    let history = this.histories.get(key);
    if (!history) {
      history = [{ role: "system", content: this.deps.systemPrompt ?? DEFAULT_SYSTEM_PROMPT }];
      this.histories.set(key, history);
    }
    history.push({ role: "user", content: prompt });

    // Resolve allowed tools (filtered to those that actually exist).
    const allowedTools = new Set(
      (config.tools ?? []).filter((t) => this.deps.toolRegistry?.has(t)),
    );

    let stopTyping: (() => void) | undefined;

    // Record where this session lives so consent prompts reach the right chat.
    const sessionId = `channel:${key}`;
    this.sessionTargets.set(sessionId, { channelId: msg.channelId, conversationId: msg.conversationId, key });

    // Hand the decision to the agent, or back to the user, for this turn.
    if (this.deps.consentManager) {
      if (autoApproves(config)) this.deps.consentManager.enableApproveAllForSession(sessionId);
      else this.deps.consentManager.disableApproveAllForSession(sessionId);
    }

    try {
      // Live progress, when the channel can edit messages and it's switched on.
      const wantsProgress = config.progress !== false && ProgressReporter.supportedBy(managed.connector);
      const progress = wantsProgress ? new ProgressReporter(managed.connector, msg.conversationId) : null;
      // "typing…" for as long as the turn runs — cleared in the finally below,
      // so a thrown turn cannot leave the indicator (and its timer) running.
      stopTyping = managed.connector.startTyping?.(msg.conversationId);

      // Told by the generator when the picked model refused to authenticate and
      // the fallback answered instead — reported once, after the answer, so the
      // user learns their model is broken without losing this reply to it.
      let fellBackTo: string | null = null;

      const reply = (await this.replyGenerator.generate(history, {
        channelId: msg.channelId,
        sessionId,
        allowedTools,
        onProgress: progress ? (line) => progress.step(line) : undefined,
        model: config.model?.trim() || undefined,
        modelProvider: config.modelProvider?.trim() || undefined,
        conversationId: msg.conversationId,
        autoApprove: autoApproves(config),
        contextBlock: buildChannelContextBlock({
          channelId: msg.channelId,
          channelLabel: managed.connector.label,
          conversationId: msg.conversationId,
          model: config.model?.trim() || undefined,
          timeZone: config.timeZone?.trim() || hostTimeZone(),
          now: new Date(),
        }),
        fallbackModel: config.fallbackModel?.trim() || undefined,
        fallbackModelProvider: config.fallbackModelProvider?.trim() || undefined,
        onFallback: (_from, to) => { fellBackTo = to; },
      })).trim();

      progress?.finish();

      if (fellBackTo) {
        await managed.connector
          .send({
            conversationId: msg.conversationId,
            text: `⚠️ ${config.model ?? "The selected model"} couldn't authenticate — answered with ${fellBackTo} this once. Fix the key, or switch with /model.`,
          })
          .catch(() => { /* the answer matters more than the notice */ });
      }

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
      stopTyping?.();
      this.sessionTargets.delete(sessionId);
    }
  }

  /* ── In-chat commands ───────────────────────────────────────────── */

  /**
   * Handle a slash command. Returns true when the message was a command and
   * must not reach the agent.
   */
  private async tryHandleCommand(
    managed: ManagedChannel,
    msg: InboundMessage,
    config: ChannelConfig,
  ): Promise<boolean> {
    const parsed = parseCommand(msg.text);
    if (!parsed) return false;

    // Commands that resolve catalogues can be slow on a cold cache; log how
    // long the user actually waited so a "this takes ages" report has numbers.
    const startedAt = Date.now();
    const reply = async (text: string, choices?: ChannelChoice[]) => {
      try {
        await managed.connector.send({ conversationId: msg.conversationId, text, choices });
        this.log(`${msg.channelId}: /${parsed.command} answered in ${Date.now() - startedAt}ms`);
      } catch (err) {
        this.log(`${msg.channelId}: command reply failed:`, err);
      }
    };

    switch (parsed.command) {
      case "help":
        await reply(COMMAND_HELP);
        return true;

      case "status": {
        const auth = this.deps.resolveAuth?.() ?? this.deps.auth;
        await reply([
          `Channel: ${managed.connector.label} (${managed.status})`,
          `Model: ${config.model ?? auth?.model ?? "gateway default"}${config.model ? " (channel override)" : ""}`,
          `Fallback: ${config.fallbackModel ?? "gateway default"}`,
          `Time zone: ${config.timeZone ?? hostTimeZone()}`,
          `Notifications: ${config.notifications ? "on" : "off"}`,
          `Tool approvals: ${autoApproves(config) ? "automatic" : "ask each time"}`,
          `Progress updates: ${config.progress === false ? "off" : "on"}`,
          `Allowed senders: ${(config.allowedSenders ?? []).join(", ") || "none"}`,
        ].join("\n"));
        return true;
      }

      case "approvals": {
        const arg = parsed.args.trim().toLowerCase();
        if (arg !== "ask" && arg !== "auto") {
          await reply(autoApproves(config)
            ? "Tools run automatically. Use /approvals ask to be asked each time."
            : "I ask before each tool. Use /approvals auto to let me decide.");
          return true;
        }
        this.setConfig(msg.channelId, { autoApprove: arg === "auto" });
        await reply(arg === "auto"
          ? "⚡ I'll decide about tools myself. Irreversible commands still ask."
          : "🔒 I'll ask before each tool.");
        return true;
      }

      case "progress": {
        const arg = parsed.args.trim().toLowerCase();
        if (arg !== "on" && arg !== "off") {
          await reply(`Progress updates are ${config.progress === false ? "off" : "on"}. Use /progress on or /progress off.`);
          return true;
        }
        this.setConfig(msg.channelId, { progress: arg === "on" });
        await reply(arg === "on" ? "👀 I'll show what I'm doing." : "🤫 No more step-by-step updates.");
        return true;
      }

      case "notifications": {
        const arg = parsed.args.trim().toLowerCase();
        if (arg !== "on" && arg !== "off") {
          await reply(`Notifications are ${config.notifications ? "on" : "off"}. Use /notifications on or /notifications off.`);
          return true;
        }
        this.setConfig(msg.channelId, { notifications: arg === "on" });
        await reply(arg === "on"
          ? "✅ Notifications on — routines and gateway alerts land here."
          : "🔕 Notifications off.");
        return true;
      }

      case "model": {
        const result = await this.runModelCommand(
          msg.channelId,
          config,
          parsed.args,
          Boolean(managed.connector.supportsChoices),
        );
        await reply(result.text, result.choices);
        return true;
      }
    }
  }

  /**
   * `/model` — offer the catalogue, or switch to a model by number or id.
   *
   * With a channel that renders dialogs the catalogue comes back as tappable
   * options; otherwise as the numbered list, which `/model <n>` still accepts.
   */
  private async runModelCommand(
    channelId: string,
    config: ChannelConfig,
    args: string,
    supportsChoices: boolean,
  ): Promise<{ text: string; choices?: ChannelChoice[] }> {
    const auth = this.deps.resolveAuth?.() ?? this.deps.auth;
    const active = config.model ?? auth?.model;
    const arg = args.trim();

    const resetToDefault = () => {
      this.setConfig(channelId, { model: "", modelProvider: "" });
      return { text: `↩️ Back to the gateway default${auth?.model ? ` (${auth.model})` : ""}.` };
    };

    // `reset` is reserved. `default` is not: Claude Code ships a model with
    // exactly that id, and swallowing it as "reset" silently sent the channel
    // back to the fallback model instead of selecting it.
    if (arg.toLowerCase() === "reset") return resetToDefault();

    let models: ChannelModelOption[] = [];
    try {
      models = await this.resolveModelsCached();
    } catch (err) {
      this.log(`${channelId}: model catalogue failed:`, err);
    }

    if (arg.toLowerCase() === "default" && !models.some((model) => model.id.toLowerCase() === "default")) {
      return resetToDefault();
    }

    // `/model fallback …` — the model that answers a single message when the
    // picked one is refused. Kept separate from the selection itself: a rescue
    // must never quietly become the choice.
    const fallbackArg = /^fallback(?:\s+(.+))?$/i.exec(arg);
    if (fallbackArg) return this.runFallbackCommand(channelId, config, fallbackArg[1]?.trim() ?? "", models);

    if (models.length === 0 && !arg) {
      return {
        text: `Current model: ${active ?? "gateway default"}\n\nNo catalogue is available, so switching is off. Set the model in the web UI instead.`,
      };
    }

    // `/model provider <name>` — the second step of the dialog, and typeable.
    const providerArg = /^provider\s+(.+)$/i.exec(arg);
    if (providerArg) {
      const wanted = providerArg[1]!.trim();
      const matching = wanted.toLowerCase() === "all"
        ? models
        : models.filter((model) => (model.group ?? "").toLowerCase() === wanted.toLowerCase());
      if (matching.length === 0) {
        return { text: `No models from "${wanted}". Send /model to see the providers.` };
      }
      return this.renderModelPicker(matching, active, supportsChoices, wanted);
    }

    if (!arg) {
      // More than one backend is configured → pick the provider first, so a
      // 100-model OpenRouter catalogue doesn't bury the three local Ollama ones.
      const providers = groupModelsByProvider(models);
      if (supportsChoices && providers.length > 1) {
        const choices: ChannelChoice[] = providers.map(({ group, count }) => ({
          label: `${group} (${count})`,
          value: `/model provider ${group}`,
        }));
        choices.push({ label: `All models (${models.length})`, value: "/model provider all" });
        if (active) choices.push({ label: "↩️ Gateway default", value: "/model reset" });
        return {
          text: `Current model: ${active ?? "gateway default"}\nPick a provider:`,
          choices,
        };
      }
      return this.renderModelPicker(models, active, supportsChoices);
    }

    // A number picks from the list just shown; anything else is treated as an id.
    const index = /^\d+$/.test(arg) ? parseInt(arg, 10) - 1 : -1;
    const picked = index >= 0
      ? models[index]
      : models.find((model) => model.id.toLowerCase() === arg.toLowerCase());

    if (index >= 0 && !picked) return { text: `There is no model ${arg} in the list. Send /model to see it again.` };

    // Unknown ids are accepted when no catalogue could be loaded — otherwise a
    // failed model fetch would lock the channel to its current model.
    const modelId = picked?.id ?? (models.length === 0 ? arg : null);
    if (!modelId) return { text: `Unknown model "${arg}". Send /model to see what is available.` };

    this.setConfig(channelId, { model: modelId, modelProvider: picked?.provider ?? "" });
    const suffix = picked?.group ? ` (${picked.group})` : "";
    const cliNote = picked?.provider && picked.provider !== "jait"
      ? "\n\nThis one runs as a supervised CLI session — I'll ask before each tool."
      : "";
    return { text: `✅ Now using ${picked?.label ?? modelId}${suffix} on this channel.${cliNote}` };
  }

  /** `/model fallback [id|number|off]` — show, set, or clear the rescue model. */
  private runFallbackCommand(
    channelId: string,
    config: ChannelConfig,
    arg: string,
    models: ChannelModelOption[],
  ): { text: string; choices?: ChannelChoice[] } {
    if (!arg) {
      return {
        text: config.fallbackModel
          ? `Fallback: ${config.fallbackModel} — used for one message when the picked model is refused.\nChange it with /model fallback <id>, or turn it off with /model fallback off.`
          : "No fallback set. If the picked model is refused I try the gateway default once.\nPick a specific one with /model fallback <id>.",
      };
    }
    if (arg.toLowerCase() === "off" || arg.toLowerCase() === "reset") {
      this.setConfig(channelId, { fallbackModel: "", fallbackModelProvider: "" });
      return { text: "↩️ Fallback cleared — the gateway default stands in instead." };
    }

    const index = /^\d+$/.test(arg) ? parseInt(arg, 10) - 1 : -1;
    const picked = index >= 0
      ? models[index]
      : models.find((model) => model.id.toLowerCase() === arg.toLowerCase());
    const modelId = picked?.id ?? (models.length === 0 ? arg : null);
    if (!modelId) return { text: `Unknown model "${arg}". Send /model to see what is available.` };

    this.setConfig(channelId, { fallbackModel: modelId, fallbackModelProvider: picked?.provider ?? "" });
    return { text: `🛟 Fallback set to ${picked?.label ?? modelId}. I'll use it for a single message when the main model is refused.` };
  }

  /**
   * Drop the cached catalogue. Called when a provider that missed its budget
   * finally answers, so the next `/model` shows its models instead of serving
   * the partial list for the rest of the TTL.
   */
  invalidateModelCache(): void {
    this.modelCache = null;
  }

  /**
   * Resolve the catalogue ahead of the first `/model`, so nobody waits for a
   * cold CLI probe in a chat. Fire-and-forget: failures just leave the cache
   * empty and the next real call retries.
   */
  warmModelCatalogue(): void {
    void this.resolveModelsCached().catch((err) => {
      this.log("model catalogue warm-up failed:", err);
    });
  }

  /**
   * The model catalogue, cached briefly. Resolving it probes every configured
   * backend and CLI provider, which is far too slow to repeat for each step of
   * the picker. Concurrent callers share one resolution.
   */
  private async resolveModelsCached(): Promise<ChannelModelOption[]> {
    if (!this.deps.resolveModels) return [];
    if (this.modelCache && Date.now() - this.modelCache.at < MODEL_CACHE_TTL_MS) {
      return this.modelCache.models;
    }
    if (this.modelCacheInflight) return this.modelCacheInflight;

    this.modelCacheInflight = this.deps.resolveModels()
      .then((models) => {
        // Never cache an empty result: it would pin the picker to "no models"
        // for the whole TTL after a single hiccup.
        if (models.length > 0) this.modelCache = { at: Date.now(), models };
        return models;
      })
      .finally(() => { this.modelCacheInflight = null; });
    return this.modelCacheInflight;
  }

  /**
   * Render a set of models as tappable options, or as the numbered list that
   * `/model <n>` accepts on channels without dialogs.
   */
  private renderModelPicker(
    models: ChannelModelOption[],
    active: string | undefined,
    supportsChoices: boolean,
    providerLabel?: string,
  ): { text: string; choices?: ChannelChoice[] } {
    const heading = providerLabel
      ? `${providerLabel} — current model: ${active ?? "gateway default"}`
      : `Current model: ${active ?? "gateway default"}`;

    if (supportsChoices) {
      const offered = models.slice(0, MAX_MODEL_CHOICES);
      const choices: ChannelChoice[] = offered.map((model) => ({
        label: modelChoiceLabel(model, active),
        value: `/model ${model.id}`,
      }));
      // Step two of the dialog — offer the way back up rather than making the
      // user retype /model to see the other providers.
      if (providerLabel) choices.push({ label: "⬅️ Back to providers", value: "/model" });
      if (active) choices.push({ label: "↩️ Gateway default", value: "/model reset" });
      const truncated = models.length - offered.length;
      return {
        text: [heading, truncated > 0 ? `Pick one — ${truncated} more available with /model <id>.` : "Pick one:"].join("\n"),
        choices,
      };
    }

    const list = models
      .map((model, index) => {
        const group = model.group ? ` (${model.group})` : "";
        return `${index + 1}. ${model.label ?? model.id}${group}${model.id === active ? "  ← current" : ""}`;
      })
      .join("\n");
    return {
      text: [
        heading,
        "",
        list,
        "",
        "Switch with /model <number> or /model <id>, /model provider <name> to filter, /model reset for the default.",
      ].join("\n"),
    };
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


/**
 * Flatten the recent conversation into one prompt. A CLI turn is a fresh
 * session every time, so without this the provider would answer each message
 * with no idea what was said before.
 */
export function buildCliPrompt(history: AgentMessage[], maxTurns = 8): string {
  const turns = history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-maxTurns);
  const latest = turns.at(-1);
  const earlier = turns.slice(0, -1);
  const asText = (content: unknown) => (typeof content === "string" ? content : JSON.stringify(content));

  if (earlier.length === 0) return asText(latest?.content ?? "");
  const transcript = earlier
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${asText(message.content)}`)
    .join("\n");
  return `Earlier in this chat:\n${transcript}\n\nUser: ${asText(latest?.content ?? "")}`;
}

/**
 * Provider statuses where the request was refused over credentials or budget
 * rather than over what was asked. Another model may well answer the same
 * question, which is what makes these worth a fallback: 401/403 a bad or
 * expired key, 402 an unpaid account, 429 an exhausted quota.
 */
const CREDENTIAL_FAILURE_STATUSES = new Set([401, 402, 403, 429]);

/** The model that answers a single message when the picked one is refused. */
export interface FallbackChoice {
  /** Model id, or undefined to let the gateway resolve its default. */
  model?: string;
  provider?: string;
  /** How to name it to the user. */
  label: string;
}

/**
 * Pick the model to retry on.
 *
 * The channel's configured fallback wins. Without one the only other option is
 * the gateway default, and that is only a *different* model when this channel
 * overrode it — retrying the same model with the same rejected credential would
 * just spend another round trip failing identically.
 */
export function chooseFallbackModel(
  ctx: Pick<ReplyContext, "model" | "modelProvider" | "fallbackModel" | "fallbackModelProvider">,
  ownerModel?: string,
): FallbackChoice | null {
  const configured = ctx.fallbackModel?.trim();
  if (configured) {
    return { model: configured, provider: ctx.fallbackModelProvider?.trim() || undefined, label: configured };
  }
  if (!ctx.model?.trim() && !ctx.modelProvider?.trim()) return null;
  const owner = ownerModel?.trim();
  if (owner && owner === ctx.model?.trim()) return null;
  return { label: owner ?? "the gateway default" };
}

/** A turn that failed because the model would not take the credential. */
class CredentialFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialFailure";
  }
}

/** Whether a thrown turn is one another model could plausibly rescue. */
function isAuthFailure(err: unknown): boolean {
  return err instanceof CredentialFailure;
}

/**
 * Whether a CLI provider's refusal was about its login.
 *
 * CLI providers answer with prose rather than status codes, so this reads their
 * wording — narrowly, and only to decide whether to try a second model. A false
 * positive costs one extra attempt; a false negative just surfaces the original
 * message, which is what would have happened anyway.
 */
export function looksLikeCliAuthFailure(message: string): boolean {
  return /\b(unauthori[sz]ed|not logged in|log ?in again|authentication|auth failed|credential|api key|token (?:expired|invalid)|session expired|subscription)\b/i
    .test(message);
}

/** Context a CLI-provider turn needs on top of the usual reply context. */
interface CliTurnContext {
  channelId: string;
  sessionId: string;
  model?: string;
  modelProvider?: string;
  conversationId?: string;
  autoApprove?: boolean;
}

export class AgentLoopReplyGenerator implements ReplyGenerator {
  constructor(private readonly deps: ChannelManagerDeps) {}

  /**
   * Answer one turn, retrying once on a different model when the picked one
   * cannot authenticate.
   *
   * A dead key is the one failure a chat assistant should not pass on to the
   * user as "sorry, I hit an error": the question is answerable, just not by
   * that model. The retry is scoped to this message — `config.model` is left
   * alone, because a fallback is a rescue, not a decision.
   */
  async generate(history: AgentMessage[], ctx: ReplyContext): Promise<string> {
    try {
      return await this.generateOnce(history, ctx);
    } catch (err) {
      if (!isAuthFailure(err)) throw err;

      const owner = (this.deps.resolveAuth?.() ?? this.deps.auth)?.model;
      const fallback = chooseFallbackModel(ctx, owner);
      if (!fallback) throw err;

      this.deps.log?.(`${ctx.channelId}: ${ctx.model ?? "default model"} refused auth, retrying on ${fallback.label}`);
      ctx.onFallback?.(ctx.model, fallback.label);
      return this.generateOnce(history, {
        ...ctx,
        model: fallback.model,
        modelProvider: fallback.provider,
        // The fallback must not itself fall back — one rescue per message.
        fallbackModel: undefined,
        fallbackModelProvider: undefined,
      });
    }
  }

  private async generateOnce(history: AgentMessage[], ctx: ReplyContext): Promise<string> {
    const { toolRegistry, audit } = this.deps;
    const auth = this.deps.resolveAuth?.() ?? this.deps.auth;

    // A CLI provider (Claude Code, Codex) speaks ACP, not chat-completions, so
    // it gets its own one-shot session instead of the HTTP agent loop.
    if (ctx.modelProvider && ctx.modelProvider !== "jait") {
      return this.generateViaCliProvider(history, ctx as CliTurnContext);
    }

    const llm = this.deps.resolveLLM(ctx.model);
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
          // Memory, reminders and skill authoring are what make this an
          // assistant rather than a chat window. Leaving them to `tools.search`
          // costs a round trip, and a model that doesn't take it answers "I
          // can't schedule that" — so they are always on the table.
          activatedToolNames: CHANNEL_ACTIVATED_TOOLS,
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
      const channelNote = this.deps.systemPrompt ?? CHANNEL_ASSISTANT_NOTE;
      const systemPrompt = [
        buildSystemPrompt("agent", modelEndpoint, promptCtx),
        channelNote,
        // Rebuilt every turn: the chat's clock moves and its model can change
        // between two messages, so this cannot be cached with the history.
        ctx.contextBlock,
      ]
        .filter(Boolean)
        .join("\n\n");
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
      //
      // With auto-approve the agent decides instead — except for irreversible
      // commands. This path calls the tool registry directly rather than going
      // through ConsentAwareExecutor, so that carve-out has to be applied here
      // too; without it, auto-approve would also wave through `rm -rf`.
      const consent = this.deps.consentManager;
      const autoApproved = consent?.isApproveAllEnabledForSession(sid) ?? false;
      const irreversible = autoApproved ? irreversibleReasonFor(args) : undefined;
      if (consent && MUTATING_TOOLS.has(name) && (!autoApproved || irreversible)) {
        const decision = await consent.requestConsent({
          actionId,
          toolName: name,
          summary: irreversible ? `Run ${name} — ${irreversible}` : `Run ${name}`,
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

    // The loop reports a rejected key as an `error` event and returns whatever
    // it had — it does not throw. Remembered here so an answerless turn can be
    // retried on another model instead of reaching the user as "I hit an error".
    let credentialFailure: string | null = null;

    const result = await runAgentLoop(
      {
        onEvent: (event) => {
          if (event.type === "error" && event.status && CREDENTIAL_FAILURE_STATUSES.has(event.status)) {
            credentialFailure = event.message;
          }
          if (!ctx.onProgress) return;
          if (event.type === "tool_start") ctx.onProgress(`• ${event.tool}`);
          else if (event.type === "tool_result") {
            ctx.onProgress(`${event.ok ? "  ✓" : "  ✗"} ${event.tool}${event.ok ? "" : ` — ${event.message.slice(0, 80)}`}`);
          }
        },
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
        continuous: hasTools,
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

    // Only when the turn produced nothing: a key that expires mid-answer has
    // still said something worth keeping, and re-running it on another model
    // would repeat the tool calls it already made.
    if (credentialFailure && !result.content?.trim()) {
      throw new CredentialFailure(credentialFailure);
    }

    return result.content ?? "";
  }

  /**
   * Run one turn against a CLI (ACP) provider — Claude Code, Codex, and the
   * like. They are separate processes rather than an HTTP endpoint, so the turn
   * is a scoped session that is torn down afterwards.
   *
   * The session runs *supervised*: every tool the CLI wants to use becomes the
   * same in-band yes/no question the Jait agent loop already asks over the
   * chat. Without a consent manager there is nobody to ask, so the turn is
   * refused rather than silently run with full access.
   */
  private async generateViaCliProvider(history: AgentMessage[], ctx: CliTurnContext): Promise<string> {
    const { providerRegistry, gatewayAddress, consentManager } = this.deps;
    const auth = this.deps.resolveAuth?.() ?? this.deps.auth;

    if (!providerRegistry || !gatewayAddress || !auth?.userId) {
      return "⚠️ CLI providers aren't wired up on this gateway — pick an API model with /model.";
    }
    // Supervised mode is only usable with somebody to answer the approvals.
    const supervised = !ctx.autoApprove;
    if (supervised && !consentManager) {
      return "⚠️ This model runs a CLI with tool access, which needs the in-band approval flow. Pick an API model with /model.";
    }

    const { runAcpSpecialistTurn } = await import("../tools/agent-acp-runner.js");
    const prompt = buildCliPrompt(history);

    const result = await runAcpSpecialistTurn({
      providerRegistry,
      config: gatewayAddress,
      providerId: ctx.modelProvider!,
      userId: auth.userId,
      sessionId: ctx.sessionId,
      subAgentId: "channel",
      projectRoot: this.deps.projectRoot ?? process.cwd(),
      // Auto-approve hands the decision to the CLI itself; otherwise it runs
      // supervised and every tool becomes a yes/no question in the chat.
      runtimeMode: supervised ? "supervised" : "full-access",
      model: ctx.model,
      prompt,
      onApprovalRequired: !supervised ? undefined : async ({ tool, args }) => {
        const decision = await consentManager!.requestConsent({
          actionId: `channel-cli:${ctx.channelId}:${tool}`,
          toolName: tool,
          summary: `${tool} (via ${ctx.modelProvider})`,
          preview: (args ?? {}) as Record<string, unknown>,
          risk: "high",
          policy: {
            consentLevel: "dangerous",
            description: `Requested by ${ctx.modelProvider} while answering in this chat`,
            // The CLI's tool vocabulary is its own, not Jait's tool registry.
            knownTool: false,
            source: "unknown-tool",
          },
          sessionId: ctx.sessionId,
          timeoutMs: this.deps.consentTimeoutMs,
        });
        return decision.approved;
      },
    });

    if (!result.ok) {
      // An expired CLI login is the most likely way this fails — and the case
      // the fallback exists for. Anything else is reported as it came.
      if (looksLikeCliAuthFailure(result.message)) throw new CredentialFailure(result.message);
      return `⚠️ ${result.message}`;
    }
    return result.message;
  }
}
