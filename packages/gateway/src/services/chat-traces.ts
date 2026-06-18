/**
 * ChatTracesService — retrieves the full execution trace of a chat session.
 *
 * A "chat id" is a session id. Its trace is everything that happened in that
 * chat: the persisted messages (with their executed tool calls, outbound LLM
 * context flow, and chain-of-thought) plus any agent threads spun off from the
 * session and their activity logs. This lets an agent inspect how a past chat
 * actually ran — useful for evaluating provider behaviour, diagnosing loops,
 * or auditing tool usage.
 */

import type { SqliteDatabase } from "../db/sqlite-shim.js";

export interface ChatTracesOptions {
  /** Chat (session) id to fetch traces for. */
  chatId: string;
  /** Restrict to a session owned by this user. Optional safety check. */
  userId?: string;
  /** Include chat messages. Defaults to true. */
  includeMessages?: boolean;
  /** Include agent threads + their activities. Defaults to true. */
  includeThreads?: boolean;
  /** Include parsed tool-call payloads on assistant messages. Defaults to true. */
  includeToolCalls?: boolean;
  /** Include the full outbound LLM context-flow rounds. Verbose — defaults to false. */
  includeContextFlow?: boolean;
  /** Include chain-of-thought / reasoning content. Defaults to false. */
  includeThinking?: boolean;
  /** Max messages to return (most recent). Defaults to 200, capped at 1000. */
  messageLimit?: number;
  /** Max thread activities per thread. Defaults to 200, capped at 2000. */
  activityLimit?: number;
}

export interface ChatTraceMessage {
  id: string;
  role: string;
  content: string;
  toolCalls?: unknown;
  segments?: unknown;
  contextFlow?: unknown;
  thinking?: string | null;
  createdAt: string;
}

export interface ChatTraceThreadActivity {
  id: string;
  kind: string;
  summary: string;
  payload?: unknown;
  createdAt: string;
}

export interface ChatTraceThread {
  id: string;
  title: string;
  providerId: string;
  model: string | null;
  runtimeMode: string;
  kind: string;
  status: string;
  error: string | null;
  workingDirectory: string | null;
  branch: string | null;
  prUrl: string | null;
  prState: string | null;
  executionNodeName: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  activities: ChatTraceThreadActivity[];
}

export interface ChatTracesResult {
  chatId: string;
  found: boolean;
  session: {
    id: string;
    name: string | null;
    userId: string | null;
    projectId: string | null;
    projectPath: string | null;
    status: string | null;
    createdAt: string;
    lastActiveAt: string;
  } | null;
  messages: ChatTraceMessage[];
  threads: ChatTraceThread[];
  counts: { messages: number; threads: number; threadActivities: number };
}

const DEFAULT_MESSAGE_LIMIT = 200;
const MAX_MESSAGE_LIMIT = 1000;
const DEFAULT_ACTIVITY_LIMIT = 200;
const MAX_ACTIVITY_LIMIT = 2000;

function normalizeLimit(limit: number | undefined, def: number, max: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return def;
  return Math.min(Math.floor(limit), max);
}

function safeParse(value: string | null | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export class ChatTracesService {
  constructor(private readonly sqlite: SqliteDatabase) {}

  traces(options: ChatTracesOptions): ChatTracesResult {
    const includeMessages = options.includeMessages !== false;
    const includeThreads = options.includeThreads !== false;
    const includeToolCalls = options.includeToolCalls !== false;
    const includeContextFlow = options.includeContextFlow === true;
    const includeThinking = options.includeThinking === true;
    const messageLimit = normalizeLimit(options.messageLimit, DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT);
    const activityLimit = normalizeLimit(options.activityLimit, DEFAULT_ACTIVITY_LIMIT, MAX_ACTIVITY_LIMIT);

    const session = this.loadSession(options.chatId, options.userId);

    const messages: ChatTraceMessage[] = includeMessages && session
      ? this.loadMessages(options.chatId, messageLimit, includeToolCalls, includeContextFlow, includeThinking)
      : [];

    const threads: ChatTraceThread[] = includeThreads && session
      ? this.loadThreads(options.chatId, activityLimit, options.userId)
      : [];

    const threadActivities = threads.reduce((sum, t) => sum + t.activities.length, 0);

    return {
      chatId: options.chatId,
      found: Boolean(session),
      session,
      messages,
      threads,
      counts: { messages: messages.length, threads: threads.length, threadActivities },
    };
  }

  private loadSession(chatId: string, userId?: string) {
    const rows = this.sqlite.prepare(`
      SELECT id, user_id AS userId, project_id AS projectId, name,
        project_path AS projectPath, status, created_at AS createdAt,
        last_active_at AS lastActiveAt
      FROM sessions
      WHERE id = ? AND (? IS NULL OR user_id = ?)
      LIMIT 1
    `).get(chatId, userId ?? null, userId ?? null) as
      | {
          id: string;
          userId: string | null;
          projectId: string | null;
          name: string | null;
          projectPath: string | null;
          status: string | null;
          createdAt: string;
          lastActiveAt: string;
        }
      | undefined;
    return rows ?? null;
  }

  private loadMessages(
    chatId: string,
    limit: number,
    includeToolCalls: boolean,
    includeContextFlow: boolean,
    includeThinking: boolean,
  ): ChatTraceMessage[] {
    // Take the most recent `limit` messages, returned oldest-first for readability.
    const rows = this.sqlite.prepare(`
      SELECT id, role, content, tool_calls AS toolCalls, segments,
        context_flow AS contextFlow, thinking, created_at AS createdAt
      FROM messages
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(chatId, limit) as Array<{
      id: string;
      role: string;
      content: string;
      toolCalls: string | null;
      segments: string | null;
      contextFlow: string | null;
      thinking: string | null;
      createdAt: string;
    }>;

    return rows
      .reverse()
      .map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        ...(includeToolCalls ? { toolCalls: safeParse(r.toolCalls) } : {}),
        ...(includeToolCalls ? { segments: safeParse(r.segments) } : {}),
        ...(includeContextFlow ? { contextFlow: safeParse(r.contextFlow) } : {}),
        ...(includeThinking ? { thinking: r.thinking } : {}),
        createdAt: r.createdAt,
      }));
  }

  private loadThreads(chatId: string, activityLimit: number, userId?: string): ChatTraceThread[] {
    const threads = this.sqlite.prepare(`
      SELECT id, user_id AS userId, title, provider_id AS providerId, model,
        runtime_mode AS runtimeMode, kind, status, error,
        working_directory AS workingDirectory, branch,
        pr_url AS prUrl, pr_state AS prState,
        execution_node_name AS executionNodeName,
        created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
      FROM agent_threads
      WHERE session_id = ? AND (? IS NULL OR user_id = ?)
      ORDER BY created_at ASC
    `).all(chatId, userId ?? null, userId ?? null) as Array<{
      id: string;
      userId: string | null;
      title: string;
      providerId: string;
      model: string | null;
      runtimeMode: string;
      kind: string;
      status: string;
      error: string | null;
      workingDirectory: string | null;
      branch: string | null;
      prUrl: string | null;
      prState: string | null;
      executionNodeName: string | null;
      createdAt: string;
      updatedAt: string;
      completedAt: string | null;
    }>;

    return threads.map((t) => ({
      id: t.id,
      title: t.title,
      providerId: t.providerId,
      model: t.model,
      runtimeMode: t.runtimeMode,
      kind: t.kind,
      status: t.status,
      error: t.error,
      workingDirectory: t.workingDirectory,
      branch: t.branch,
      prUrl: t.prUrl,
      prState: t.prState,
      executionNodeName: t.executionNodeName,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      completedAt: t.completedAt,
      activities: this.loadActivities(t.id, activityLimit),
    }));
  }

  private loadActivities(threadId: string, limit: number): ChatTraceThreadActivity[] {
    const rows = this.sqlite.prepare(`
      SELECT id, kind, summary, payload, created_at AS createdAt
      FROM agent_thread_activities
      WHERE thread_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(threadId, limit) as Array<{
      id: string;
      kind: string;
      summary: string;
      payload: string | null;
      createdAt: string;
    }>;

    return rows
      .reverse()
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        summary: r.summary,
        payload: safeParse(r.payload),
        createdAt: r.createdAt,
      }));
  }
}