import type { SqliteDatabase } from "../db/index.js";
import { limitUtf8, serializeBoundedJson } from "../lib/bounded-json.js";
import { serializePersistedToolCalls } from "../lib/persisted-tool-calls.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_CONTEXT_FLOW_BYTES = 64_000;
const MAX_RETAINED_TOOL_CALL_BYTES = 64_000;
const MAX_ACTIVITY_PAYLOAD_BYTES = 64_000;
const MAX_ACTIVITY_SUMMARY_BYTES = 8_000;
const LEGACY_CONTEXT_FLOW_BYTES = 512_000;
const LEGACY_ACTIVITY_PAYLOAD_BYTES = 512_000;
const MAX_CONTEXT_FLOW_PARSE_BYTES = 8 * 1024 * 1024;

const SEARCHABLE_ACTIVITY_KINDS = ["message", "tool.result", "tool.error", "error"] as const;

const TRANSIENT_ACTIVITY_KINDS = [
  "thinking",
  "agent_thought_chunk",
  "codex/event/agent_reasoning_delta",
  "codex/event/exec_command_output_delta",
  "codex/event/reasoning_content_delta",
  "account/rateLimits/updated",
  "available_commands_update",
  "codex/event/mcp_startup_update",
  "mcpServer/startupStatus/updated",
  "session_info_update",
  "thread/status/changed",
  "usage_update",
] as const;

export interface DatabaseRetentionPolicy {
  enabled: boolean;
  searchIndexCleanupEnabled: boolean;
  contextFlowDays: number | null;
  toolDetailDays: number | null;
  transientActivityDays: number | null;
  auditPayloadDays: number | null;
  auditRowDays: number | null;
  batchSize: number;
  maxBatchesPerRun: number;
  initialDelayMs: number;
  intervalMs: number;
}

export interface RetentionCandidate {
  rows: number;
  bytes: number;
}

export interface RetentionCandidates {
  unsearchableFtsRows: RetentionCandidate;
  oversizedContextFlows: RetentionCandidate;
  agedContextFlows: RetentionCandidate;
  oversizedToolCalls: RetentionCandidate;
  agedToolCalls: RetentionCandidate;
  oversizedActivityPayloads: RetentionCandidate;
  agedActivityPayloads: RetentionCandidate;
  transientActivities: RetentionCandidate;
  auditPayloads: RetentionCandidate;
  auditRows: RetentionCandidate;
}

export type RetentionMutation =
  | "searchIndexRowsRemoved"
  | "contextFlowsCompacted"
  | "toolCallsCompacted"
  | "activityPayloadsCompacted"
  | "transientActivitiesDeleted"
  | "auditPayloadsCleared"
  | "auditRowsDeleted";

export interface RetentionReport {
  enabled: boolean;
  dryRun: boolean;
  cutoffs: Record<string, string | null>;
  candidates: RetentionCandidates;
  processed: Record<RetentionMutation, number>;
  remaining?: RetentionCandidates;
  batches: number;
  busy: boolean;
  errors: string[];
  skippedReason?: "disabled" | "already-running" | "stopped";
}

export interface RetentionRunOptions {
  dryRun?: boolean;
  maxBatches?: number;
  now?: Date;
}

export interface RetentionLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const consoleLogger: RetentionLogger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalDays(value: string | undefined, fallback: number | null): number | null {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function loadDatabaseRetentionPolicy(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseRetentionPolicy {
  return {
    // On by default: left off, `context_flow` and tool-call payloads grow
    // without bound (observed: 3.9 GB of debug metadata behind 11 MB of chat).
    // Message content is never touched — only replay/debug detail is compacted.
    enabled: parseBoolean(env["JAIT_RETENTION_ENABLED"], true),
    searchIndexCleanupEnabled: parseBoolean(env["JAIT_SEARCH_INDEX_CLEANUP_ENABLED"], true),
    contextFlowDays: parseOptionalDays(env["JAIT_RETENTION_CONTEXT_FLOW_DAYS"], 90),
    toolDetailDays: parseOptionalDays(env["JAIT_RETENTION_TOOL_DETAIL_DAYS"], 90),
    transientActivityDays: parseOptionalDays(env["JAIT_RETENTION_TRANSIENT_ACTIVITY_DAYS"], 14),
    auditPayloadDays: parseOptionalDays(env["JAIT_RETENTION_AUDIT_PAYLOAD_DAYS"], 90),
    auditRowDays: parseOptionalDays(env["JAIT_RETENTION_AUDIT_ROW_DAYS"], null),
    batchSize: parsePositiveInteger(env["JAIT_RETENTION_BATCH_SIZE"], 100),
    maxBatchesPerRun: parsePositiveInteger(env["JAIT_RETENTION_MAX_BATCHES"], 20),
    initialDelayMs: parsePositiveInteger(env["JAIT_RETENTION_INITIAL_DELAY_MS"], 5 * 60 * 1_000),
    intervalMs: parsePositiveInteger(env["JAIT_RETENTION_INTERVAL_MS"], DAY_MS),
  };
}

function cutoffIso(now: Date, days: number | null): string | null {
  return days === null ? null : new Date(now.getTime() - days * DAY_MS).toISOString();
}

function emptyCandidate(): RetentionCandidate {
  return { rows: 0, bytes: 0 };
}

function emptyCandidates(): RetentionCandidates {
  return {
    unsearchableFtsRows: emptyCandidate(),
    oversizedContextFlows: emptyCandidate(),
    agedContextFlows: emptyCandidate(),
    oversizedToolCalls: emptyCandidate(),
    agedToolCalls: emptyCandidate(),
    oversizedActivityPayloads: emptyCandidate(),
    agedActivityPayloads: emptyCandidate(),
    transientActivities: emptyCandidate(),
    auditPayloads: emptyCandidate(),
    auditRows: emptyCandidate(),
  };
}

function retentionCutoffs(
  now: Date,
  policy: DatabaseRetentionPolicy,
): RetentionReport["cutoffs"] {
  return {
    contextFlow: cutoffIso(now, policy.contextFlowDays),
    toolDetails: cutoffIso(now, policy.toolDetailDays),
    transientActivities: cutoffIso(now, policy.transientActivityDays),
    auditPayloads: cutoffIso(now, policy.auditPayloadDays),
    auditRows: cutoffIso(now, policy.auditRowDays),
  };
}

function emptyProcessed(): Record<RetentionMutation, number> {
  return {
    searchIndexRowsRemoved: 0,
    contextFlowsCompacted: 0,
    toolCallsCompacted: 0,
    activityPayloadsCompacted: 0,
    transientActivitiesDeleted: 0,
    auditPayloadsCleared: 0,
    auditRowsDeleted: 0,
  };
}

function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|database is locked/i.test(message);
}

function retainedContextFlow(json: string): string {
  const sourceBytes = Buffer.byteLength(json, "utf8");
  if (sourceBytes > MAX_CONTEXT_FLOW_PARSE_BYTES) {
    return JSON.stringify({
      provider: "unknown",
      rounds: [],
      note: "Detailed context was compacted by Jait retention; message content and memory-provenance metadata remain available.",
      retentionCompacted: true,
      truncatedBytes: sourceBytes,
    });
  }

  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(json) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  const sourceRounds = Array.isArray(parsed["rounds"]) ? parsed["rounds"] : [];
  const selectedRounds = sourceRounds.length > 100
    ? [sourceRounds[0], ...sourceRounds.slice(-99)]
    : sourceRounds;
  const rounds = selectedRounds.map((round, index) => {
    const value = round && typeof round === "object"
      ? round as Record<string, unknown>
      : {};
    const compact: Record<string, unknown> = {
      round: typeof value["round"] === "number" ? value["round"] : index + 1,
      messages: [],
    };
    for (const key of ["createdAt", "model"] as const) {
      if (typeof value[key] === "string") compact[key] = limitUtf8(value[key], 1_024, "");
    }
    if (value["metrics"] && typeof value["metrics"] === "object") {
      compact["metrics"] = JSON.parse(serializeBoundedJson(value["metrics"], 4_000));
    }
    return compact;
  });

  const retained: Record<string, unknown> = {
    provider: typeof parsed["provider"] === "string" ? limitUtf8(parsed["provider"], 1_024, "") : "unknown",
    rounds,
    note: "Detailed context was compacted by Jait retention; message content and memory-provenance metadata remain available.",
    retentionCompacted: true,
  };
  if (typeof parsed["model"] === "string") retained["model"] = limitUtf8(parsed["model"], 1_024, "");

  let serialized = JSON.stringify(retained);
  if (Buffer.byteLength(serialized, "utf8") > MAX_CONTEXT_FLOW_BYTES) {
    retained["rounds"] = [];
    retained["truncatedRounds"] = sourceRounds.length;
    serialized = JSON.stringify(retained);
  }
  return serialized;
}

function compactActivityPayload(payload: string): string {
  try {
    return serializeBoundedJson(JSON.parse(payload), MAX_ACTIVITY_PAYLOAD_BYTES);
  } catch {
    return serializeBoundedJson({
      __jait_retention_compacted__: true,
      reason: "invalid JSON",
      preview: payload,
    }, MAX_ACTIVITY_PAYLOAD_BYTES);
  }
}

function searchablePlaceholders(): string {
  return SEARCHABLE_ACTIVITY_KINDS.map(() => "?").join(", ");
}

function transientPlaceholders(): string {
  return TRANSIENT_ACTIVITY_KINDS.map(() => "?").join(", ");
}

export class DatabaseRetentionService {
  private running = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private sqlite: SqliteDatabase,
    readonly policy: DatabaseRetentionPolicy = loadDatabaseRetentionPolicy(),
    private logger: RetentionLogger = consoleLogger,
  ) {}

  inspect(now = new Date()): RetentionReport {
    const cutoffs = retentionCutoffs(now, this.policy);

    const candidate = (sql: string, ...params: unknown[]): RetentionCandidate => {
      const row = this.sqlite.prepare(sql).get(...params) as {
        rows?: number | bigint;
        bytes?: number | bigint | null;
      } | undefined;
      return {
        rows: Number(row?.rows ?? 0),
        bytes: Number(row?.bytes ?? 0),
      };
    };

    const agedContextFlows = cutoffs.contextFlow
      ? candidate(
          `SELECT COUNT(*) AS rows, COALESCE(SUM(length(context_flow)), 0) AS bytes
           FROM messages
           WHERE context_flow IS NOT NULL
             AND created_at < ?
             AND context_flow NOT LIKE '%"retentionCompacted":true%'`,
          cutoffs.contextFlow,
        )
      : emptyCandidate();
    const agedToolCalls = cutoffs.toolDetails
      ? candidate(
          `SELECT COUNT(*) AS rows, COALESCE(SUM(length(tool_calls)), 0) AS bytes
           FROM messages
           WHERE tool_calls IS NOT NULL
             AND created_at < ?
             AND tool_calls NOT LIKE '%"storageCompacted":true%'`,
          cutoffs.toolDetails,
        )
      : emptyCandidate();
    const agedActivityPayloads = cutoffs.toolDetails
      ? candidate(
          `SELECT COUNT(*) AS rows,
                  COALESCE(SUM(COALESCE(length(a.payload), 0) + length(a.summary)), 0) AS bytes
           FROM agent_thread_activities a
           LEFT JOIN agent_threads t ON t.id = a.thread_id
           WHERE a.created_at < ?
             AND (length(a.payload) > ? OR length(a.summary) > ?)
             AND COALESCE(t.status, '') != 'running'`,
          cutoffs.toolDetails,
          MAX_ACTIVITY_PAYLOAD_BYTES,
          MAX_ACTIVITY_SUMMARY_BYTES,
        )
      : emptyCandidate();
    const transientActivities = cutoffs.transientActivities
      ? candidate(
          `SELECT COUNT(*) AS rows,
                  COALESCE(SUM(COALESCE(length(a.payload), 0) + length(a.summary)), 0) AS bytes
           FROM agent_thread_activities a
           LEFT JOIN agent_threads t ON t.id = a.thread_id
           WHERE a.kind IN (${transientPlaceholders()})
             AND a.created_at < ?
             AND COALESCE(t.status, '') != 'running'`,
          ...TRANSIENT_ACTIVITY_KINDS,
          cutoffs.transientActivities,
        )
      : emptyCandidate();
    const auditPayloads = cutoffs.auditPayloads
      ? candidate(
          `SELECT COUNT(*) AS rows,
                  COALESCE(SUM(COALESCE(length(inputs), 0) + COALESCE(length(outputs), 0) + COALESCE(length(side_effects), 0)), 0) AS bytes
           FROM audit_log
           WHERE timestamp < ?
             AND (inputs IS NOT NULL OR outputs IS NOT NULL OR side_effects IS NOT NULL)`,
          cutoffs.auditPayloads,
        )
      : emptyCandidate();
    const auditRows = cutoffs.auditRows
      ? candidate(
          `SELECT COUNT(*) AS rows,
                  COALESCE(SUM(COALESCE(length(inputs), 0) + COALESCE(length(outputs), 0) + COALESCE(length(side_effects), 0)), 0) AS bytes
           FROM audit_log
           WHERE timestamp < ?`,
          cutoffs.auditRows,
        )
      : emptyCandidate();

    return {
      enabled: this.policy.enabled,
      dryRun: true,
      cutoffs,
      candidates: {
        unsearchableFtsRows: candidate(
          `SELECT COUNT(*) AS rows, COALESCE(SUM(length(f.body)), 0) AS bytes
           FROM agent_thread_activities_fts f
           LEFT JOIN agent_thread_activities a ON a.rowid = f.rowid
           WHERE a.rowid IS NULL OR a.kind NOT IN (${searchablePlaceholders()})`,
          ...SEARCHABLE_ACTIVITY_KINDS,
        ),
        oversizedContextFlows: candidate(
          `SELECT COUNT(*) AS rows, COALESCE(SUM(length(context_flow)), 0) AS bytes
           FROM messages
           WHERE context_flow IS NOT NULL AND length(context_flow) > ?`,
          LEGACY_CONTEXT_FLOW_BYTES,
        ),
        agedContextFlows,
        oversizedToolCalls: candidate(
          `SELECT COUNT(*) AS rows, COALESCE(SUM(length(tool_calls)), 0) AS bytes
           FROM messages
           WHERE tool_calls IS NOT NULL AND length(tool_calls) > ?`,
          MAX_RETAINED_TOOL_CALL_BYTES,
        ),
        agedToolCalls,
        oversizedActivityPayloads: candidate(
          `SELECT COUNT(*) AS rows,
                  COALESCE(SUM(COALESCE(length(a.payload), 0) + length(a.summary)), 0) AS bytes
           FROM agent_thread_activities a
           LEFT JOIN agent_threads t ON t.id = a.thread_id
           WHERE (length(a.payload) > ? OR length(a.summary) > ?)
             AND COALESCE(t.status, '') != 'running'`,
          LEGACY_ACTIVITY_PAYLOAD_BYTES,
          MAX_ACTIVITY_SUMMARY_BYTES,
        ),
        agedActivityPayloads,
        transientActivities,
        auditPayloads,
        auditRows,
      },
      processed: emptyProcessed(),
      batches: 0,
      busy: false,
      errors: [],
    };
  }

  async runOnce(options: RetentionRunOptions = {}): Promise<RetentionReport> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? true;
    const report: RetentionReport = dryRun
      ? this.inspect(now)
      : {
          enabled: this.policy.enabled,
          dryRun: false,
          cutoffs: retentionCutoffs(now, this.policy),
          candidates: emptyCandidates(),
          processed: emptyProcessed(),
          batches: 0,
          busy: false,
          errors: [],
        };

    if (this.stopped) {
      report.skippedReason = "stopped";
      return report;
    }
    if (!this.policy.enabled && !this.policy.searchIndexCleanupEnabled) {
      report.skippedReason = "disabled";
      return report;
    }
    if (this.running) {
      report.skippedReason = "already-running";
      return report;
    }
    if (dryRun) return report;

    this.running = true;
    const maxBatches = Math.max(
      1,
      Math.floor(options.maxBatches ?? this.policy.maxBatchesPerRun),
    );
    const batchSize = Math.max(1, Math.floor(this.policy.batchSize));
    const blobBatchSize = 1;
    let halted = false;

    const runBatch = async (
      mutation: RetentionMutation,
      operation: () => number,
    ): Promise<boolean> => {
      if (halted || report.batches >= maxBatches) return false;
      try {
        const changed = operation();
        if (changed === 0) return false;
        report.processed[mutation] += changed;
        report.batches += 1;
        await new Promise<void>((resolve) => setImmediate(resolve));
        return report.batches < maxBatches;
      } catch (error) {
        halted = true;
        const message = error instanceof Error ? error.message : String(error);
        if (isBusyError(error)) {
          report.busy = true;
          this.logger.warn(`[retention] SQLite busy; deferring remaining work: ${message}`);
        } else {
          report.errors.push(message);
          this.logger.error(`[retention] Batch failed: ${message}`);
        }
        return false;
      }
    };

    const repeat = async (
      mutation: RetentionMutation,
      operation: () => number,
      operationBatchLimit = 1,
    ): Promise<void> => {
      let operationBatches = 0;
      while (report.batches < maxBatches && operationBatches < operationBatchLimit) {
        const previousBatches = report.batches;
        const shouldContinue = await runBatch(mutation, operation);
        if (report.batches === previousBatches) break;
        operationBatches += 1;
        if (!shouldContinue) break;
      }
    };

    try {
      if (this.policy.searchIndexCleanupEnabled) {
        const reservedRetentionBatches = this.policy.enabled ? 9 : 0;
        await repeat(
          "searchIndexRowsRemoved",
          () => this.removeUnsearchableFtsBatch(batchSize),
          Math.max(1, maxBatches - reservedRetentionBatches),
        );
      }

      if (this.policy.enabled) {
      await repeat("contextFlowsCompacted", () =>
        this.compactContextFlowBatch(
          `length(context_flow) > ?`,
          [LEGACY_CONTEXT_FLOW_BYTES],
          blobBatchSize,
        ), 2);
      if (report.batches < maxBatches && report.cutoffs.contextFlow) {
        await repeat("contextFlowsCompacted", () =>
          this.compactContextFlowBatch(
            `created_at < ? AND context_flow NOT LIKE '%"retentionCompacted":true%'`,
            [report.cutoffs.contextFlow],
            blobBatchSize,
          ));
      }

      if (report.batches < maxBatches) {
        await repeat("toolCallsCompacted", () =>
          this.compactToolCallsBatch(
            `length(tool_calls) > ?`,
            [MAX_RETAINED_TOOL_CALL_BYTES],
            blobBatchSize,
          ));
      }
      if (report.batches < maxBatches && report.cutoffs.toolDetails) {
        await repeat("toolCallsCompacted", () =>
          this.compactToolCallsBatch(
            `created_at < ? AND tool_calls NOT LIKE '%"storageCompacted":true%'`,
            [report.cutoffs.toolDetails],
            blobBatchSize,
          ));
      }

      if (report.batches < maxBatches) {
        await repeat("activityPayloadsCompacted", () =>
          this.compactActivityBatch(
            `(length(a.payload) > ? OR length(a.summary) > ?)`,
            [LEGACY_ACTIVITY_PAYLOAD_BYTES, MAX_ACTIVITY_SUMMARY_BYTES],
            blobBatchSize,
          ));
      }
      if (report.batches < maxBatches && report.cutoffs.toolDetails) {
        await repeat("activityPayloadsCompacted", () =>
          this.compactActivityBatch(
            `a.created_at < ? AND (length(a.payload) > ? OR length(a.summary) > ?)`,
            [
              report.cutoffs.toolDetails,
              MAX_ACTIVITY_PAYLOAD_BYTES,
              MAX_ACTIVITY_SUMMARY_BYTES,
            ],
            blobBatchSize,
          ));
      }

      if (report.batches < maxBatches && report.cutoffs.transientActivities) {
        await repeat("transientActivitiesDeleted", () =>
          this.deleteTransientActivityBatch(
            report.cutoffs.transientActivities!,
            batchSize,
          ));
      }

      if (report.batches < maxBatches && report.cutoffs.auditPayloads) {
        await repeat("auditPayloadsCleared", () =>
          this.clearAuditPayloadBatch(report.cutoffs.auditPayloads!, batchSize));
      }

      if (report.batches < maxBatches && report.cutoffs.auditRows) {
        await repeat("auditRowsDeleted", () =>
          this.deleteAuditRowBatch(report.cutoffs.auditRows!, batchSize));
      }
      }
    } finally {
      this.running = false;
    }

    return report;
  }

  start(): boolean {
    if ((!this.policy.enabled && !this.policy.searchIndexCleanupEnabled) || this.stopped || this.timer) return false;
    this.schedule(this.policy.initialDelayMs);
    this.logger.info("[retention] Scheduled database retention.");
    return true;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runOnce({ dryRun: false })
        .then((report) => {
          const processed = Object.values(report.processed).reduce((sum, count) => sum + count, 0);
          this.logger.info(`[retention] Completed ${report.batches} batch(es), processed ${processed} row(s).`);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`[retention] Run failed: ${message}`);
        })
        .finally(() => this.schedule(this.policy.intervalMs));
    }, Math.max(1, delayMs));
    this.timer.unref?.();
  }

  private removeUnsearchableFtsBatch(limit: number): number {
    const rows = this.sqlite.prepare(
      `SELECT f.rowid AS rowId
       FROM agent_thread_activities_fts f
       LEFT JOIN agent_thread_activities a ON a.rowid = f.rowid
       WHERE a.rowid IS NULL OR a.kind NOT IN (${searchablePlaceholders()})
       ORDER BY f.rowid
       LIMIT ?`,
    ).all(...SEARCHABLE_ACTIVITY_KINDS, limit) as Array<{ rowId: number }>;
    const remove = this.sqlite.prepare(
      `DELETE FROM agent_thread_activities_fts WHERE rowid = ?`,
    );
    for (const row of rows) remove.run(row.rowId);
    return rows.length;
  }

  private compactContextFlowBatch(
    predicate: string,
    params: unknown[],
    limit: number,
  ): number {
    const rows = this.sqlite.prepare(
      `SELECT id, context_flow AS contextFlow
       FROM messages
       WHERE context_flow IS NOT NULL AND ${predicate}
       ORDER BY created_at, id
       LIMIT ?`,
    ).all(...params, limit) as Array<{ id: string; contextFlow: string }>;
    const update = this.sqlite.prepare(`UPDATE messages SET context_flow = ? WHERE id = ?`);
    for (const row of rows) update.run(retainedContextFlow(row.contextFlow), row.id);
    return rows.length;
  }

  private compactToolCallsBatch(
    predicate: string,
    params: unknown[],
    limit: number,
  ): number {
    const rows = this.sqlite.prepare(
      `SELECT id, tool_calls AS toolCalls
       FROM messages
       WHERE tool_calls IS NOT NULL AND ${predicate}
       ORDER BY created_at, id
       LIMIT ?`,
    ).all(...params, limit) as Array<{ id: string; toolCalls: string }>;
    const update = this.sqlite.prepare(`UPDATE messages SET tool_calls = ? WHERE id = ?`);
    for (const row of rows) {
      const compact = serializePersistedToolCalls(row.toolCalls, {
        maxBytes: MAX_RETAINED_TOOL_CALL_BYTES,
        forceCompact: true,
        detailBytes: 2_000,
        textBytes: 2_000,
        markCompacted: true,
      }) ?? "[]";
      update.run(compact, row.id);
    }
    return rows.length;
  }

  private compactActivityBatch(
    predicate: string,
    params: unknown[],
    limit: number,
  ): number {
    const rows = this.sqlite.prepare(
      `SELECT a.id, a.summary, a.payload
       FROM agent_thread_activities a
       LEFT JOIN agent_threads t ON t.id = a.thread_id
       WHERE ${predicate}
         AND COALESCE(t.status, '') != 'running'
       ORDER BY a.created_at, a.id
       LIMIT ?`,
    ).all(...params, limit) as Array<{
      id: string;
      summary: string;
      payload: string | null;
    }>;
    const update = this.sqlite.prepare(
      `UPDATE agent_thread_activities SET summary = ?, payload = ? WHERE id = ?`,
    );
    for (const row of rows) {
      update.run(
        limitUtf8(row.summary, MAX_ACTIVITY_SUMMARY_BYTES),
        row.payload ? compactActivityPayload(row.payload) : null,
        row.id,
      );
    }
    return rows.length;
  }

  private deleteTransientActivityBatch(cutoff: string, limit: number): number {
    const rows = this.sqlite.prepare(
      `SELECT a.id
       FROM agent_thread_activities a
       LEFT JOIN agent_threads t ON t.id = a.thread_id
       WHERE a.kind IN (${transientPlaceholders()})
         AND a.created_at < ?
         AND COALESCE(t.status, '') != 'running'
       ORDER BY a.created_at, a.id
       LIMIT ?`,
    ).all(...TRANSIENT_ACTIVITY_KINDS, cutoff, limit) as Array<{ id: string }>;
    const remove = this.sqlite.prepare(`DELETE FROM agent_thread_activities WHERE id = ?`);
    for (const row of rows) remove.run(row.id);
    return rows.length;
  }

  private clearAuditPayloadBatch(cutoff: string, limit: number): number {
    const rows = this.sqlite.prepare(
      `SELECT id
       FROM audit_log
       WHERE timestamp < ?
         AND (inputs IS NOT NULL OR outputs IS NOT NULL OR side_effects IS NOT NULL)
       ORDER BY timestamp, id
       LIMIT ?`,
    ).all(cutoff, limit) as Array<{ id: string }>;
    const update = this.sqlite.prepare(
      `UPDATE audit_log SET inputs = NULL, outputs = NULL, side_effects = NULL WHERE id = ?`,
    );
    for (const row of rows) update.run(row.id);
    return rows.length;
  }

  private deleteAuditRowBatch(cutoff: string, limit: number): number {
    const rows = this.sqlite.prepare(
      `SELECT id FROM audit_log WHERE timestamp < ? ORDER BY timestamp, id LIMIT ?`,
    ).all(cutoff, limit) as Array<{ id: string }>;
    const remove = this.sqlite.prepare(`DELETE FROM audit_log WHERE id = ?`);
    for (const row of rows) remove.run(row.id);
    return rows.length;
  }
}
