/**
 * Tools that let the agent act on the messaging channel it is talking through.
 *
 * `channel.send` is the delivery primitive: it puts a message into a chat from
 * outside a reply turn. `channel.remind` is what the assistant actually reaches
 * for — it schedules a job that calls `channel.send` later, which is how
 * "remind me tomorrow at 5" becomes a message that arrives tomorrow at 5.
 *
 * Both tools default their target to the conversation the calling turn belongs
 * to, derived from the session id. Asking the model to copy a conversation id
 * out of its context block works right up until it doesn't, and a reminder
 * delivered to the wrong chat is a silent failure.
 */

import type { SchedulerService } from "../scheduler/service.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

/** The slice of ChannelManager these tools need — keeps the import one-way. */
export interface ChannelDeliveryTarget {
  deliver(params: {
    channelId: string;
    conversationId: string;
    text?: string;
    prompt?: string;
  }): Promise<void>;
}

export interface ChannelToolDeps {
  channels: ChannelDeliveryTarget;
  scheduler?: SchedulerService;
  /** Zone used when a caller gives no explicit one. Injectable for tests. */
  defaultTimeZone: () => string;
  /** Current time. Injectable so scheduling tests are not clock-dependent. */
  now?: () => Date;
}

/** A channel turn runs as session `channel:<channelId>:<conversationId>`. */
export function parseChannelSessionId(
  sessionId: string | undefined,
): { channelId: string; conversationId: string } | null {
  if (!sessionId?.startsWith("channel:")) return null;
  const rest = sessionId.slice("channel:".length);
  const split = rest.indexOf(":");
  // A conversation id may itself contain colons (WhatsApp JIDs), so only the
  // first separator is structural.
  if (split <= 0 || split === rest.length - 1) return null;
  return { channelId: rest.slice(0, split), conversationId: rest.slice(split + 1) };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Resolve the target chat from explicit arguments, else from the session. */
function resolveTarget(
  input: Record<string, unknown>,
  context: ToolContext,
): { channelId: string; conversationId: string } | null {
  const channelId = str(input["channelId"]);
  const conversationId = str(input["conversationId"]);
  if (channelId && conversationId) return { channelId, conversationId };
  const fromSession = parseChannelSessionId(context.sessionId);
  if (!fromSession) return null;
  return {
    channelId: channelId || fromSession.channelId,
    conversationId: conversationId || fromSession.conversationId,
  };
}

/* ------------------------------------------------------------------ */
/*  channel.send                                                       */
/* ------------------------------------------------------------------ */

export function createChannelSendTool(deps: ChannelToolDeps): ToolDefinition {
  return {
    name: "channel.send",
    description:
      "Send a message into a messaging channel conversation (Telegram, WhatsApp, …). " +
      "Give `text` for a fixed message, or `prompt` to work the answer out at send time " +
      "and deliver the result. Defaults to the conversation this turn belongs to.",
    tier: "standard",
    category: "channels",
    source: "builtin",
    // Reaches only chats the user has already paired with this gateway, so the
    // blast radius is "a message to yourself". Asking permission to answer in
    // the conversation you are being spoken to in is pure friction.
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Message to send verbatim." },
        prompt: {
          type: "string",
          description: "Instruction to run at send time; its answer is delivered instead of `text`.",
        },
        channelId: { type: "string", description: "Connector id, e.g. \"telegram\". Defaults to the current channel." },
        conversationId: { type: "string", description: "Chat to deliver to. Defaults to the current chat." },
      },
    },
    execute: async (input, context): Promise<ToolResult> => {
      const body = (input as Record<string, unknown>) ?? {};
      const text = str(body["text"]);
      const prompt = str(body["prompt"]);
      if (!text && !prompt) return { ok: false, message: "Nothing to send — give `text` or `prompt`." };

      const target = resolveTarget(body, context);
      if (!target) {
        return { ok: false, message: "No target chat — pass channelId and conversationId." };
      }

      try {
        await deps.channels.deliver({ ...target, text: text || undefined, prompt: prompt || undefined });
      } catch (err) {
        return { ok: false, message: `Delivery failed: ${err instanceof Error ? err.message : String(err)}` };
      }
      return { ok: true, message: `Sent to ${target.channelId}`, data: target };
    },
  };
}

/* ------------------------------------------------------------------ */
/*  channel.remind                                                     */
/* ------------------------------------------------------------------ */

/** Local wall-clock fields of an `at` timestamp, without a timezone shift. */
export interface LocalStamp {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Parse a local `YYYY-MM-DDTHH:mm` stamp.
 *
 * Deliberately *not* `new Date(...)`: the string carries no offset and must be
 * read as the user's wall clock, but `Date` would interpret it in the server's
 * zone and shift a 05:00 reminder by however far the gateway is from the user.
 * A trailing "Z" or offset is rejected for the same reason — it would mean the
 * caller measured the time somewhere other than the zone we schedule in.
 */
export function parseLocalStamp(value: string): LocalStamp | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match as unknown as [string, string, string, string, string, string];
  const stamp: LocalStamp = {
    year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi),
  };
  if (stamp.month < 1 || stamp.month > 12) return null;
  if (stamp.day < 1 || stamp.day > 31) return null;
  if (stamp.hour > 23 || stamp.minute > 59) return null;
  return stamp;
}

/**
 * The cron expression that fires at a single wall-clock moment.
 *
 * Cron cannot express a year, so this recurs annually on paper — which is why
 * every `at` reminder is stored as a one-shot and disarmed by the scheduler
 * after it fires.
 */
export function cronForLocalStamp(stamp: LocalStamp): string {
  return `${stamp.minute} ${stamp.hour} ${stamp.day} ${stamp.month} *`;
}

/** Read `now` as wall-clock fields in `timeZone`. */
function localNow(now: Date, timeZone: string): LocalStamp {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: parts["year"] ?? 0, month: parts["month"] ?? 0, day: parts["day"] ?? 0,
    hour: parts["hour"] ?? 0, minute: parts["minute"] ?? 0,
  };
}

/** Compare two wall-clock stamps without leaving the user's zone. */
function stampValue(stamp: LocalStamp): number {
  return ((((stamp.year * 12 + stamp.month) * 31 + stamp.day) * 24 + stamp.hour) * 60) + stamp.minute;
}

export function createChannelRemindTool(deps: ChannelToolDeps): ToolDefinition {
  return {
    name: "channel.remind",
    description:
      "Schedule a reminder delivered into this chat. Use `at` (local \"YYYY-MM-DDTHH:mm\") for a " +
      "one-off, or `cron` (5-field) for something recurring. Provide `text` for a fixed message, " +
      "or `prompt` to work the answer out at delivery time. Times are read in the channel's local zone.",
    tier: "standard",
    category: "channels",
    source: "builtin",
    // Same reasoning as channel.send: a reminder the user asked for, delivered
    // to the user. `cron.list` / `cron.remove` make it reversible.
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Message to deliver verbatim." },
        prompt: { type: "string", description: "Instruction to run at delivery time; its answer is delivered." },
        at: { type: "string", description: "One-off local time, \"YYYY-MM-DDTHH:mm\" — no offset, no \"Z\"." },
        cron: { type: "string", description: "5-field cron for a recurring reminder, e.g. \"0 7 * * 1-5\"." },
        timeZone: { type: "string", description: "IANA zone the time is measured in. Defaults to the gateway's." },
        name: { type: "string", description: "Short label shown in the scheduled-jobs list." },
        channelId: { type: "string", description: "Connector id. Defaults to the current channel." },
        conversationId: { type: "string", description: "Chat to deliver to. Defaults to the current chat." },
      },
    },
    execute: async (input, context): Promise<ToolResult> => {
      const scheduler = deps.scheduler;
      if (!scheduler) return { ok: false, message: "The scheduler is not available on this gateway." };

      const body = (input as Record<string, unknown>) ?? {};
      const text = str(body["text"]);
      const prompt = str(body["prompt"]);
      if (!text && !prompt) return { ok: false, message: "Nothing to deliver — give `text` or `prompt`." };

      const target = resolveTarget(body, context);
      if (!target) {
        return { ok: false, message: "No target chat — pass channelId and conversationId." };
      }

      const at = str(body["at"]);
      const cronArg = str(body["cron"]);
      if (!at && !cronArg) return { ok: false, message: "When? Give `at` for a one-off or `cron` for a routine." };
      if (at && cronArg) return { ok: false, message: "Give either `at` or `cron`, not both." };

      const timeZone = str(body["timeZone"]) || deps.defaultTimeZone();
      const now = (deps.now ?? (() => new Date()))();

      let cron = cronArg;
      let once = false;
      if (at) {
        const stamp = parseLocalStamp(at);
        if (!stamp) {
          return { ok: false, message: `Could not read "${at}" — use local "YYYY-MM-DDTHH:mm".` };
        }
        // A past time would sit armed until the same date next year, which is
        // never what was meant. Better to say so than to deliver in 12 months.
        if (stampValue(stamp) <= stampValue(localNow(now, timeZone))) {
          return { ok: false, message: `${at} is in the past for ${timeZone} — pick a future time.` };
        }
        cron = cronForLocalStamp(stamp);
        once = true;
      }

      const label = str(body["name"]) || (text ? text.slice(0, 60) : prompt.slice(0, 60));
      const job = scheduler.create({
        userId: context.userId,
        name: label || "Reminder",
        cron,
        toolName: "channel.send",
        input: {
          channelId: target.channelId,
          conversationId: target.conversationId,
          ...(text ? { text } : {}),
          ...(prompt ? { prompt } : {}),
          __jaitJobMeta: {
            jobType: "channel_reminder",
            timeZone,
            ...(once ? { once: true } : {}),
          },
        },
        // Runs as the chat's own session, so a delivery that needs the agent
        // lands in the same conversation it was scheduled from.
        sessionId: `channel:${target.channelId}:${target.conversationId}`,
        projectRoot: context.projectRoot,
      });

      return {
        ok: true,
        message: once
          ? `Reminder set for ${at} (${timeZone}).`
          : `Recurring reminder set (${cron}, ${timeZone}).`,
        data: { id: job.id, cron, once, timeZone, ...target },
      };
    },
  };
}
