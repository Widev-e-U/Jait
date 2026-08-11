import type { SqliteDatabase } from "../db/sqlite-shim.js";

export type SessionSearchSource = "message" | "thread_activity";

export interface SessionSearchOptions {
  query: string;
  limit?: number;
  userId?: string;
  sessionId?: string;
  threadId?: string;
  includeMessages?: boolean;
  includeThreadActivities?: boolean;
}

export interface SessionSearchResult {
  source: SessionSearchSource;
  id: string;
  sessionId: string | null;
  sessionName?: string | null;
  threadId?: string | null;
  threadTitle?: string | null;
  role?: string | null;
  kind?: string | null;
  content: string;
  snippet: string;
  createdAt: string;
  score: number;
}

interface MessageSearchRow {
  id: string;
  sessionId: string;
  sessionName: string | null;
  role: string;
  content: string;
  snippet: string | null;
  createdAt: string;
  score: number;
}

interface ThreadActivitySearchRow {
  id: string;
  sessionId: string | null;
  threadId: string;
  threadTitle: string | null;
  kind: string;
  summary: string;
  payload: string | null;
  snippet: string | null;
  createdAt: string;
  score: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_CONTENT_LENGTH = 2_000;

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

export function buildFtsQuery(query: string): string | null {
  const terms = query
    .toLowerCase()
    .match(/[a-z0-9_]+/g)
    ?.map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 12) ?? [];

  if (terms.length === 0) return null;
  return [...new Set(terms)]
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" OR ");
}

function cleanSnippet(snippet: string | null | undefined, fallback: string): string {
  return (snippet?.replace(/\s+/g, " ").trim() || fallback.slice(0, 240)).trim();
}

function truncateContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_CONTENT_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_CONTENT_LENGTH - 3)}...`;
}

function mergeActivityContent(summary: string, payload: string | null): string {
  if (!payload) return summary;
  return `${summary}\n${payload}`;
}

/** Damping constant for reciprocal rank fusion; 60 is the value from the original paper. */
const RRF_K = 60;

/**
 * Merges results that were ranked by different FTS indexes.
 *
 * bm25() scores are only meaningful relative to the index that produced them —
 * `messages_fts` and `agent_thread_activities_fts` have different corpus sizes and
 * average document lengths, so comparing their raw scores lets whichever index happens
 * to run "colder" dominate the merged list. Fusing on rank instead of score keeps each
 * index's own ordering intact and interleaves them fairly.
 */
function fuseByRank(rankedLists: SessionSearchResult[][]): SessionSearchResult[] {
  const fused = rankedLists.flatMap((list) =>
    list.map((result, index) => ({ ...result, score: 1 / (RRF_K + index + 1) })),
  );

  return fused.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
}

export class SessionSearchService {
  constructor(private readonly sqlite: SqliteDatabase) {}

  search(options: SessionSearchOptions): SessionSearchResult[] {
    const ftsQuery = buildFtsQuery(options.query);
    if (!ftsQuery) return [];

    const limit = normalizeLimit(options.limit);
    const includeMessages = options.includeMessages !== false;
    const includeThreadActivities = options.includeThreadActivities !== false;
    const ranked: SessionSearchResult[][] = [];

    if (includeMessages) {
      ranked.push(this.searchMessages(ftsQuery, options, limit));
    }
    if (includeThreadActivities) {
      ranked.push(this.searchThreadActivities(ftsQuery, options, limit));
    }

    return fuseByRank(ranked).slice(0, limit);
  }

  private searchMessages(
    ftsQuery: string,
    options: SessionSearchOptions,
    limit: number,
  ): SessionSearchResult[] {
    const userId = options.userId ?? null;
    const sessionId = options.sessionId ?? null;
    const rows = this.sqlite.prepare(`
      SELECT
        m.id AS id,
        m.session_id AS sessionId,
        s.name AS sessionName,
        m.role AS role,
        m.content AS content,
        snippet(messages_fts, 0, '[', ']', '...', 24) AS snippet,
        m.created_at AS createdAt,
        (0 - bm25(messages_fts)) AS score
      FROM messages_fts
      JOIN messages m ON m.id = messages_fts.message_id
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
        AND (? IS NULL OR s.user_id = ?)
        AND (? IS NULL OR m.session_id = ?)
      ORDER BY bm25(messages_fts), m.created_at DESC
      LIMIT ?
    `).all(ftsQuery, userId, userId, sessionId, sessionId, limit) as MessageSearchRow[];

    return rows.map((row) => ({
      source: "message",
      id: row.id,
      sessionId: row.sessionId,
      sessionName: row.sessionName,
      role: row.role,
      content: truncateContent(row.content),
      snippet: cleanSnippet(row.snippet, row.content),
      createdAt: row.createdAt,
      score: row.score,
    }));
  }

  private searchThreadActivities(
    ftsQuery: string,
    options: SessionSearchOptions,
    limit: number,
  ): SessionSearchResult[] {
    const userId = options.userId ?? null;
    const sessionId = options.sessionId ?? null;
    const threadId = options.threadId ?? null;
    const rows = this.sqlite.prepare(`
      SELECT
        a.id AS id,
        t.session_id AS sessionId,
        a.thread_id AS threadId,
        t.title AS threadTitle,
        a.kind AS kind,
        a.summary AS summary,
        a.payload AS payload,
        snippet(agent_thread_activities_fts, 0, '[', ']', '...', 24) AS snippet,
        a.created_at AS createdAt,
        (0 - bm25(agent_thread_activities_fts)) AS score
      FROM agent_thread_activities_fts
      JOIN agent_thread_activities a ON a.id = agent_thread_activities_fts.activity_id
      JOIN agent_threads t ON t.id = a.thread_id
      WHERE agent_thread_activities_fts MATCH ?
        AND a.kind IN ('message', 'tool.result', 'tool.error', 'error')
        AND (? IS NULL OR t.user_id = ?)
        AND (? IS NULL OR t.session_id = ?)
        AND (? IS NULL OR a.thread_id = ?)
      ORDER BY bm25(agent_thread_activities_fts), a.created_at DESC
      LIMIT ?
    `).all(ftsQuery, userId, userId, sessionId, sessionId, threadId, threadId, limit) as ThreadActivitySearchRow[];

    return rows.map((row) => {
      const content = mergeActivityContent(row.summary, row.payload);
      return {
        source: "thread_activity",
        id: row.id,
        sessionId: row.sessionId,
        threadId: row.threadId,
        threadTitle: row.threadTitle,
        kind: row.kind,
        content: truncateContent(content),
        snippet: cleanSnippet(row.snippet, content),
        createdAt: row.createdAt,
        score: row.score,
      };
    });
  }
}
