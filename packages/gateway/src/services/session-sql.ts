/**
 * session.sql — read-only SQL queries over Jait's own SQLite session store.
 *
 * Inspired by VS Code Copilot Chat's `session_store_sql` tool (DuckDB over
 * agent session storage). Instead of building a bespoke search/summary code
 * path for every "what did I do last week" style question, the agent runs a
 * read-only SELECT directly against the gateway database.
 *
 * Safety model (layered, in order):
 *
 *   1. Statement validation — the only entry point to execution. The input
 *      must be exactly one statement whose first meaningful token is SELECT
 *      or WITH. Mutations (INSERT/UPDATE/DELETE/...), transactions,
 *      PRAGMA/ATTACH, and multi-statement input are rejected before SQLite
 *      ever sees the text. Comments and string literals are skipped, so a
 *      keyword inside a quoted value neither causes a false rejection nor
 *      masks a trailing statement.
 *   2. Table blocklist — credential/secret tables (`user_secrets`, `users`,
 *      `user_settings`, `automation_repositories`,
 *      `mobile_push_registrations`) are refused no matter where their name
 *      appears (FROM, JOIN, subquery, CTE body, quoted identifier).
 *      `consent_log` is intentionally allowed: it holds only consent
 *      metadata (decision/tool_name/timestamps), no credential material.
 *   3. Row cap + LIMIT clamping — top-level LIMIT is clamped to
 *      `maxRows + 1` (so truncation stays detectable) and results are cut to
 *      `maxRows`. The sqlite shim (bun:sqlite / node:sqlite /
 *      better-sqlite3) exposes no interrupt()/progress-handler API, so a
 *      wall-clock statement timeout is not enforceable; the row cap is the
 *      backstop against pathological queries.
 *
 * A dedicated read-only connection would be the stronger guarantee, but the
 * `SqliteDatabase` shim exposes only exec/prepare/close — no open flags.
 * Opening a backend-specific handle would fork runtime behavior, so
 * enforcement is purely validation: nothing but a validated SELECT/WITH
 * ever reaches SQLite.
 */
import type { SqliteDatabase, SqliteStatement } from "../db/sqlite-shim.js";

/** Per-call guardrails. */
export interface SessionSqlQueryInput {
  sql: string;
  maxRows?: number;
}

export interface SessionSqlColumn {
  name: string;
  type: string;
}

export interface SessionSqlTableSchema {
  table: string;
  columns: SessionSqlColumn[];
}

/** Compact schema summary: table → columns with types. */
export interface SessionSqlSchemaSummary {
  tables: SessionSqlTableSchema[];
  blockedTables: string[];
}

export interface SessionSqlQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  /** Full list of queryable tables — included on the first call per service. */
  tables?: string[];
}

/** Normalized failure: { ok: false, error, message } — same shape as tools. */
export type SessionSqlResult =
  | { ok: true; data: SessionSqlQueryResult | SessionSqlSchemaSummary }
  | { ok: false; error: string; message: string };

const DEFAULT_MAX_ROWS = 200;
const ABSOLUTE_MAX_ROWS = 200;

/** First-token allowlist: a single SELECT or WITH statement. */
const ALLOWED_FIRST_KEYWORDS = new Set(["select", "with"]);

/**
 * Statements that mutate schema/state or escape the current database.
 * `end` is banned as a first token (BEGIN…END transactions) but excluded
 * from the anywhere-scan because CASE…END is valid inside SELECT.
 */
const BANNED_KEYWORDS = new Set([
  "insert", "update", "delete", "drop", "create", "alter", "replace",
  "pragma", "attach", "detach", "vacuum", "reindex", "analyze",
  "begin", "commit", "end", "rollback", "savepoint", "release",
]);

/** Keywords that can never legitimately appear mid-SELECT/WITH. */
const BANNED_ANYWHERE_KEYWORDS = new Set([...BANNED_KEYWORDS].filter((word) => word !== "end"));

/**
 * Tables whose rows may never be surfaced to the model:
 * - `user_secrets` holds encrypted credential material (key/iv/auth_tag/…).
 * - `users` holds `password_hash`; `user_settings` may contain tokens.
 * - `automation_repositories` holds git credentials for automation repos.
 * - `mobile_push_registrations` holds device push tokens.
 */
const BLOCKED_TABLES = new Set([
  "user_secrets",
  "users",
  "user_settings",
  "automation_repositories",
  "mobile_push_registrations",
]);

/**
 * SQLite functions that touch the filesystem or load native code. Their
 * availability varies by build, so refusal cannot be left to the engine: on
 * builds where they exist, e.g. `writefile('/path','x')` would otherwise pass
 * validation and execute. Matched only when used as a CALL (identifier
 * followed by `(`) — a table named `writefile_log`, a CTE named `zipfile`, or
 * the `strftime` date function is unaffected. Quoted calls (`"writefile"(…)`)
 * are caught too: the tokenizer emits a `quoted` token carrying the name.
 */
const BANNED_FUNCTIONS = new Set([
  "writefile", // shell function: writes bytes to an arbitrary filesystem path
  "readfile", // shell function: reads an arbitrary file into a blob
  "fts3_tokenizer", // FTS3 tokenizer registry: raw-pointer args (memory disclosure)
  "zipfile", // table-valued: reads zip archives from disk
  "sqlar", // table-valued: reads SQLite-archive files from disk
  "load_extension", // loads a shared library into the process
  "sqlite_load_extension", // C-API-style alias of load_extension (defensive)
]);

/** Internal bookkeeping tables that are noise for the model. */
const INTERNAL_TABLES = new Set(["_migrations"]);

/** fts5 shadow tables (`…_fts_data`, …) — the parent virtual table is listed. */
const FTS_SHADOW_TABLE_RE = /_fts_(data|idx|content|docsize|config)$/;

// ── Statement tokenization ──────────────────────────────────────────────────

interface SqlToken {
  kind: "word" | "quoted" | "other";
  value: string;
}

/**
 * Tokenize SQL, skipping comments (`-- …`, `/* … *​/`) and string literals.
 * Quoted identifiers ("x", [x], `x`) become `quoted` tokens carrying the
 * (lowercased) identifier text — their raw text is still scanned by the table
 * blocklist below, and the banned-function scan and the `pragma_*` prefix ban
 * use the carried name.
 */
function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'") {
      i += 1;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '"' || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      const start = i + 1;
      i += 1;
      while (i < n && sql[i] !== close) i += 1;
      // SQLite accepts ALL of these quoting styles as identifiers — including
      // in function-call position (`"writefile"('x','y')`, `[zipfile]('/a')`).
      // Keep the (lowercased) name so the banned-function scan can see it.
      tokens.push({ kind: "quoted", value: sql.slice(start, i).trim().toLowerCase() });
      i += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(sql[j]!)) j += 1;
      tokens.push({ kind: "word", value: sql.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    tokens.push({ kind: "other", value: ch });
    i += 1;
  }
  return tokens;
}

/** First meaningful word token, or null when the input has none. */
function firstKeyword(tokens: SqlToken[]): string | null {
  for (const token of tokens) {
    if (token.kind === "word") return token.value;
  }
  return null;
}

/**
 * Detect multiple statements: a `;` followed by any further non-comment
 * content. One trailing semicolon is allowed.
 */
function hasTrailingStatement(tokens: SqlToken[]): boolean {
  let sawSemicolon = false;
  for (const token of tokens) {
    if (token.kind === "other" && token.value === ";") {
      sawSemicolon = true;
      continue;
    }
    if (sawSemicolon) return true;
  }
  return false;
}

/**
 * Find a banned function used as a call: a whole identifier token (bare word
 * OR quoted identifier — SQLite accepts `"writefile"('/x','y')` and
 * `[zipfile]('/a')`; the tokenizer has already skipped comments and string
 * literals) followed by `(`. Whitespace between name and paren is fine — the
 * tokenizer dropped it (`zipfile (…)`). An identifier not directly followed
 * by `(` is a column/table/alias (even one named `writefile`) and is left
 * alone.
 */
function findBannedFunctionCall(tokens: SqlToken[]): string | null {
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i]!;
    if (token.kind !== "word" && token.kind !== "quoted") continue;
    if (!BANNED_FUNCTIONS.has(token.value)) continue;
    const next = tokens[i + 1]!;
    if (next.kind === "other" && next.value === "(") return token.value;
  }
  return null;
}

// ── LIMIT clamping ──────────────────────────────────────────────────────────

/**
 * Clamp top-level LIMIT to `maxRows + 1` so truncation stays detectable.
 * Handles a missing LIMIT (appends one) and an oversized LIMIT (tightens).
 * Depth-0 scanning keeps subquery/CTE LIMITs untouched; the outer clamp
 * still bounds total returned rows. Compound SELECTs (UNION/…) may carry at
 * most one top-level LIMIT in SQLite, and it applies to the whole result.
 *
 * A top-level LIMIT whose value is not a plain digit run (e.g. `LIMIT -1`,
 * which SQLite treats as unlimited, or `LIMIT +5`) counts as an
 * already-present LIMIT, so no clamp is appended — appending would emit
 * `LIMIT -1 LIMIT 201`, a raw double-LIMIT syntax error. The row cap still
 * holds because results are sliced to maxRows afterwards.
 */
function clampLimit(sql: string, maxRows: number): string {
  let out = "";
  let depth = 0;
  let inStr = false;
  let sawTopLevelLimit = false;
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i]!;
    if (inStr) {
      out += ch;
      if (ch === "'") inStr = false;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inStr = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      out += ch;
      i += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(sql[j]!)) j += 1;
      const word = sql.slice(i, j).toLowerCase();
      const wordStart = i === 0 || !/[A-Za-z0-9_$]/.test(sql[i - 1]!);
      const wordEnd = j === n || !/[A-Za-z0-9_$]/.test(sql[j]!);
      if (depth === 0 && word === "limit" && wordStart && wordEnd) {
        // Consume the integer that follows.
        let k = j;
        while (k < n && /\s/.test(sql[k]!)) k += 1;
        let m = k;
        while (m < n && /[0-9]/.test(sql[m]!)) m += 1;
        // `LIMIT -1` is valid SQLite (unlimited) and so is `LIMIT +5`. A
        // non-digit value means a LIMIT is already present — count it so no
        // clamp is appended (that would emit `LIMIT -1 LIMIT 201`, a syntax
        // error). The JS-side row cap still bounds the result.
        if (m > k || /[+\-]/.test(sql[k] ?? "")) {
          sawTopLevelLimit = true;
          if (m > k && Number(sql.slice(k, m)) > maxRows + 1) {
            out += ` LIMIT ${maxRows + 1}`;
            i = m;
            continue;
          }
        }
        out += sql.slice(i, m > k ? m : j);
        i = m > k ? m : j;
        continue;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }

  if (!sawTopLevelLimit) out += ` LIMIT ${maxRows + 1}`;
  return out.trimEnd();
}

// ── Service ─────────────────────────────────────────────────────────────────

export class SessionSqlService {
  private readonly db: SqliteDatabase;
  private tablesSent = false;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  /** Run a validated read-only SELECT/WITH against the session store. */
  query(input: SessionSqlQueryInput): SessionSqlResult {
    // Defensive type guard: non-string sql (number/array/object from an LLM
    // client) must yield a clean invalid_sql result, not a TypeError from
    // `.trim()`. Also covers input itself being null/undefined.
    if (typeof input?.sql !== "string") {
      return {
        ok: false,
        error: "invalid_sql",
        message: "sql must be a string — pass a single SELECT or WITH query.",
      };
    }
    const sql = input.sql.trim();
    if (!sql) {
      return {
        ok: false,
        error: "invalid_sql",
        message: "sql is required — pass a single SELECT or WITH query.",
      };
    }

    const tokens = tokenizeSql(sql);
    if (tokens.length === 0) {
      return {
        ok: false,
        error: "invalid_sql",
        message: "sql is required — the input is empty or comment-only; pass a single SELECT or WITH query.",
      };
    }

    if (hasTrailingStatement(tokens)) {
      return {
        ok: false,
        error: "multi_statement",
        message: "Refused: multiple SQL statements detected — pass exactly one SELECT or WITH query.",
      };
    }

    const first = firstKeyword(tokens);
    if (!first || !ALLOWED_FIRST_KEYWORDS.has(first)) {
      return {
        ok: false,
        error: "readonly_violation",
        message:
          first && BANNED_KEYWORDS.has(first)
            ? `Refused: "${first}" is not allowed — this tool runs read-only SELECT queries only.`
            : `Refused: only a single SELECT or WITH statement is allowed (got "${first ?? "nothing"}").`,
      };
    }

    // Defense in depth: a mutation keyword anywhere in the statement (e.g.
    // `WITH x AS (…) DELETE FROM …`) is rejected. String literals and
    // comments are already skipped by the tokenizer. `pragma_*` table-valued
    // functions (pragma_table_info, pragma_journal_mode, …) are refused too —
    // schema introspection belongs in mode:"schema", and some writable pragmas
    // mutate connection/database state when invoked as functions. The
    // `pragma_*` prefix ban also covers quoted spellings: SQLite accepts
    // quoted identifiers in function-name position
    // (`"pragma_table_info"('t')`), and quoting must not defeat the ban. The
    // tokenizer lowercases quoted names, so the prefix check stays
    // case-insensitive.
    const mutation = tokens.find(
      (token) =>
        (token.kind === "word" &&
          (BANNED_ANYWHERE_KEYWORDS.has(token.value) || token.value.startsWith("pragma_"))) ||
        (token.kind === "quoted" && token.value.startsWith("pragma_")),
    );
    if (mutation) {
      return {
        ok: false,
        error: "readonly_violation",
        message: `Refused: "${mutation.value}" is not allowed — this tool runs read-only SELECT queries only.`,
      };
    }

    // Dangerous SQLite functions (filesystem write/read, extension loader,
    // FTS tokenizer registry, zip/archive readers) are refused outright.
    // Their availability varies by build, so the engine's "no such function"
    // is not a reliable guard — on builds where they exist they would
    // otherwise pass validation and execute.
    const bannedFn = findBannedFunctionCall(tokens);
    if (bannedFn) {
      return {
        ok: false,
        error: "banned_function",
        message: `Refused: function "${bannedFn}" is not allowed — filesystem/extension SQLite functions are disabled in this tool.`,
      };
    }

    const blocked = this.findBlockedTable(sql);
    if (blocked) {
      return {
        ok: false,
        error: "blocked_table",
        message: `Refused: table "${blocked}" is excluded from this tool (credentials / sensitive configuration).`,
      };
    }

    const maxRows = normalizeMaxRows(input.maxRows);
    const clampedSql = clampLimit(sql, maxRows);

    let columns: string[];
    let rawRows: Record<string, unknown>[];
    try {
      const stmt = this.db.prepare(clampedSql);
      rawRows = stmt.all() as Record<string, unknown>[];
      // Empty result set: prefer real statement metadata (exact projection,
      // aliases) over table-based inference, which would wrongly report every
      // column of the FROM table even for a partial SELECT list.
      columns =
        rawRows.length > 0
          ? Object.keys(rawRows[0]!)
          : statementColumns(stmt) ?? this.inferColumns(clampedSql);
    } catch (err) {
      return {
        ok: false,
        error: "sql_error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const truncated = rawRows.length > maxRows;
    const rows = rawRows.slice(0, maxRows).map((row) => sanitizeRow(row));

    const data: SessionSqlQueryResult = {
      columns,
      rows,
      rowCount: rows.length,
      truncated,
    };
    if (!this.tablesSent) {
      data.tables = this.listQueryableTables();
      this.tablesSent = true;
    }
    return { ok: true, data };
  }

  /**
   * Compact schema summary (table → columns with types) for schema
   * discovery. Blocked and internal tables are excluded.
   */
  schema(): SessionSqlResult {
    try {
      const summaries: SessionSqlTableSchema[] = this.listQueryableTables().map((table) => ({
        table,
        columns: this.tableColumns(table),
      }));
      return { ok: true, data: { tables: summaries, blockedTables: [...BLOCKED_TABLES].sort() } };
    } catch (err) {
      return {
        ok: false,
        error: "schema_error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  private listQueryableTables(): string[] {
    const stmt = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const rows = stmt.all() as { name: string }[];
    return rows
      .map((row) => row.name)
      .filter((name) => !BLOCKED_TABLES.has(name) && !INTERNAL_TABLES.has(name) && !FTS_SHADOW_TABLE_RE.test(name));
  }

  private tableColumns(table: string): SessionSqlColumn[] {
    // `table` comes from sqlite_master (never user input) — safe to bind.
    const stmt = this.db.prepare("SELECT name, type FROM pragma_table_info(?)");
    const rows = stmt.all(table) as { name: string; type: string }[];
    return rows.map((row) => ({ name: row.name, type: row.type || "" }));
  }

  /** Derive column names for empty `SELECT * FROM <table>` results. */
  private inferColumns(sql: string): string[] {
    const fromMatch = /\bFROM\s+(?:"([^"]+)"|\[([^\]]+)\]|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))/i.exec(sql);
    const table = fromMatch?.slice(1).find((group) => group !== undefined);
    if (!table || BLOCKED_TABLES.has(table.toLowerCase())) return [];
    try {
      return this.tableColumns(table).map((column) => column.name);
    } catch {
      return [];
    }
  }

  private findBlockedTable(sql: string): string | null {
    // Textual scan over the statement with string literals blanked out: any
    // blocked table name appearing as a standalone word is a refusal. Covers
    // FROM/JOIN, subqueries, CTE bodies, aliases, and quoted identifiers.
    const withoutStrings = sql.replace(/'(?:[^']|'')*'/g, "''");
    for (const table of BLOCKED_TABLES) {
      const pattern = new RegExp(`(^|[^A-Za-z0-9_])${table}([^A-Za-z0-9_]|$)`, "i");
      if (pattern.test(withoutStrings)) return table;
    }
    return null;
  }
}

/**
 * Column names from prepared-statement metadata, when the backend exposes it.
 * Handles both shapes: a `columns()` method (better-sqlite3, node:sqlite) and
 * a `columns` getter, plus bun:sqlite's `columnNames` string-array getter.
 * Returns null when unavailable or malformed so callers can fall back to
 * inference.
 */
function statementColumns(stmt: SqliteStatement): string[] | null {
  try {
    const raw: unknown = (stmt as { columns?: unknown }).columns;
    let cols: unknown;
    if (typeof raw === "function") cols = (raw as () => unknown).call(stmt);
    else if (Array.isArray(raw)) cols = raw;
    if (Array.isArray(cols) && cols.every((c) => typeof (c as { name?: unknown })?.name === "string")) {
      return (cols as Array<{ name: string }>).map((c) => c.name);
    }
    // bun:sqlite: `columnNames` is a plain string[] getter.
    const names: unknown = (stmt as { columnNames?: unknown }).columnNames;
    if (Array.isArray(names) && names.every((n) => typeof n === "string")) {
      return names as string[];
    }
  } catch {
    // metadata unavailable on this backend — fall back
  }
  return null;
}

function normalizeMaxRows(maxRows: number | undefined): number {
  if (maxRows === undefined || maxRows === null || !Number.isFinite(maxRows)) return DEFAULT_MAX_ROWS;
  const value = Math.floor(maxRows);
  if (value <= 0) return DEFAULT_MAX_ROWS;
  return Math.min(value, ABSOLUTE_MAX_ROWS);
}

/** Make values JSON-safe (Uint8Array → placeholder, BigInt → string). */
function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Uint8Array
      ? `<blob ${value.length} bytes>`
      : typeof value === "bigint"
        ? value.toString()
        : value;
  }
  return out;
}