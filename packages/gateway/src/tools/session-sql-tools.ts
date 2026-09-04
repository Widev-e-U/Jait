/**
 * session.sql — read-only SQL queries over Jait's own SQLite session store.
 *
 * Inspired by VS Code Copilot Chat's `session_store_sql` tool. Lets the agent
 * answer "what did I do last week" / "which chats touched this repo" /
 * "cron job success rate" style questions with a plain SELECT instead of a
 * bespoke search code path. All mutations, PRAGMA/ATTACH, and
 * credentials/secret tables are refused; see services/session-sql.ts for the
 * enforcement layers.
 */

import type { ToolDefinition } from "./contracts.js";
import { ToolName } from "./tool-names.js";
import type { SessionSqlService } from "../services/session-sql.js";

export interface SessionSqlToolInput {
  /** A single read-only SQL statement: SELECT or WITH only. */
  sql?: string;
  /** Max rows to return. Defaults to 200, capped at 200. */
  max_rows?: number;
  /** "schema" returns a compact table→columns summary instead of running a query. */
  mode?: "query" | "schema";
}

const TOOL_DESCRIPTION = [
  "Run a read-only SQL SELECT query directly against Jait's SQLite session database to answer questions about past activity (what did I do last week, which chats touched this repo, cron job success rate).",
  "Only a single SELECT or WITH statement is allowed — INSERT/UPDATE/DELETE/DDL/PRAGMA/ATTACH, multiple statements, and dangerous SQLite functions (writefile, readfile, load_extension, …) are refused.",
  "",
  "Key tables (timestamps are ISO-8601 TEXT, e.g. '2026-02-10T13:45:00.000Z'; use substr(created_at,1,10) for dates):",
  "- sessions: one row per chat — id, user_id, name, status, project_path, created_at, last_active_at.",
  "- messages: chat turns — session_id, role ('user'|'assistant'|'tool'), content, created_at.",
  "- agent_threads: subagent thread runs — session_id, kind, status, provider_id, model, created_at.",
  "- agent_thread_activities: per-thread steps — thread_id, kind, summary, payload, created_at.",
  "- memories: saved memory entries — scope, content, source_type, source_id, created_at, updated_at.",
  "- scheduled_jobs: cron definitions — id, user_id, name, cron, tool_name, enabled, last_run_at.",
  "- scheduled_job_runs: cron executions — job_id, status, triggered_by, started_at, completed_at.",
  "- audit_log: tool-call audit trail — timestamp, session_id, tool_name, action_type, status.",
  "",
  "Examples:",
  "1. Messages per day, last 14 days:",
  "   SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM messages GROUP BY day ORDER BY day DESC LIMIT 14",
  "2. Chats per repo, with thread counts:",
  "   SELECT s.project_path, COUNT(DISTINCT s.id) AS chats, COUNT(t.id) AS threads FROM sessions s LEFT JOIN agent_threads t ON t.session_id = s.id GROUP BY s.project_path ORDER BY chats DESC LIMIT 20",
  "",
  "Pass mode:\"schema\" first (or omit sql) to list every queryable table with its columns; credentials/secret tables are excluded and cannot be queried.",
].join("\n");

export function createSessionSqlTool(sessionSqlService: SessionSqlService): ToolDefinition<SessionSqlToolInput> {
  return {
    name: ToolName.SessionSql,
    description: TOOL_DESCRIPTION,
    tier: "standard",
    category: "memory",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description:
            "A single read-only SQL statement (SELECT or WITH only). Omit when mode is \"schema\".",
        },
        max_rows: {
          type: "number",
          description: "Maximum rows to return. Defaults to 200, capped at 200.",
        },
        mode: {
          type: "string",
          enum: ["query", "schema"],
          description:
            "\"schema\" returns a compact table → columns summary instead of executing a query. Defaults to \"query\".",
        },
      },
      required: [],
    },
    async execute(input) {
      if (input.mode === "schema") {
        const schema = sessionSqlService.schema();
        if (!schema.ok) return { ok: false, message: schema.message, data: { error: schema.error } };
        return { ok: true, message: "Session database schema summary.", data: schema.data };
      }
      if (typeof input.sql !== "string" || !input.sql.trim()) {
        return {
          ok: false,
          message: "Provide a sql SELECT statement, or mode:\"schema\" to discover the database schema.",
          data: { error: "invalid_input" },
        };
      }
      const result = sessionSqlService.query({ sql: input.sql, maxRows: input.max_rows });
      if (!result.ok) {
        return { ok: false, message: result.message, data: { error: result.error } };
      }
      const data = result.data;
      if (!("rowCount" in data)) {
        return { ok: true, message: "Session database schema summary.", data };
      }
      return {
        ok: true,
        message: `Returned ${data.rowCount} row(s)${data.truncated ? " (truncated to max_rows)" : ""} from the session database.`,
        data,
      };
    },
  };
}