import { eq, desc } from "drizzle-orm";
import type { JaitDB } from "../db/index.js";
import { scheduledJobRuns, scheduledJobs } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { ToolResult } from "../tools/contracts.js";
import { ToolName } from "../tools/tool-names.js";

export interface SchedulerToolExecution {
  toolName: string;
  input: unknown;
  sessionId: string;
  projectRoot: string;
  userId?: string | null;
}

export interface SchedulerExecutionResult {
  jobId: string;
  actionId: string;
  result: ToolResult;
}

export type SchedulerRunTrigger = "manual" | "schedule";

export interface ScheduledJobRecord {
  id: string;
  userId: string | null;
  name: string;
  cron: string;
  toolName: string;
  input: unknown;
  sessionId: string;
  projectRoot: string;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SchedulerOptions {
  db: JaitDB;
  executeTool: (execution: SchedulerToolExecution) => Promise<ToolResult>;
  onExecuted?: (result: SchedulerExecutionResult) => void;
}

const MINUTE_MS = 60_000;

/**
 * How long a *failed* one-off stays in the list before it is cleaned away.
 * Long enough that "did my 05:00 reminder go out?" is answerable the same day.
 */
const ONE_SHOT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** How often the sweep runs. The work is cheap, but not once-a-minute cheap. */
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Match a single cron field against a value.
 * Supports: "*" (any), exact number, comma lists, ranges, and step syntax.
 */
function matchCronField(field: string, value: number): boolean {
  if (field === "*") return true;
  // Step syntax: */N
  if (field.startsWith("*/")) {
    const step = Number.parseInt(field.slice(2), 10);
    return !Number.isNaN(step) && step > 0 && value % step === 0;
  }
  // Comma-separated list: 1,15,30
  if (field.includes(",")) {
    return field.split(",").some((v) => Number.parseInt(v.trim(), 10) === value);
  }
  // Range syntax: N-M
  if (field.includes("-")) {
    const [startRaw, endRaw] = field.split("-", 2);
    const start = Number.parseInt(startRaw?.trim() ?? "", 10);
    const end = Number.parseInt(endRaw?.trim() ?? "", 10);
    return !Number.isNaN(start) && !Number.isNaN(end) && start <= end && value >= start && value <= end;
  }
  // Exact match
  return Number.parseInt(field, 10) === value;
}

function getCronDateParts(date: Date, timeZone?: string): { minute: number; hour: number; day: number; month: number; weekday: number } {
  if (!timeZone) {
    return { minute: date.getUTCMinutes(), hour: date.getUTCHours(), day: date.getUTCDate(), month: date.getUTCMonth() + 1, weekday: date.getUTCDay() };
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, minute: "2-digit", hour: "2-digit", hourCycle: "h23",
    day: "2-digit", month: "2-digit", weekday: "short",
  });
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    minute: Number(values["minute"]), hour: Number(values["hour"]),
    day: Number(values["day"]), month: Number(values["month"]),
    weekday: weekdays[values["weekday"] ?? ""] ?? date.getUTCDay(),
  };
}

export function matchesCronMinute(cron: string, date: Date, timeZone?: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, weekday] = parts as [string, string, string, string, string];
  let local;
  try { local = getCronDateParts(date, timeZone); } catch { return false; }

  return (
    matchCronField(minute, local.minute) &&
    matchCronField(hour, local.hour) &&
    matchCronField(dayOfMonth, local.day) &&
    matchCronField(month, local.month) &&
    matchCronField(weekday, local.weekday)
  );
}

function isSameUtcMinute(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const previous = new Date(iso);
  if (Number.isNaN(previous.getTime())) return false;
  return previous.getUTCFullYear() === now.getUTCFullYear()
    && previous.getUTCMonth() === now.getUTCMonth()
    && previous.getUTCDate() === now.getUTCDate()
    && previous.getUTCHours() === now.getUTCHours()
    && previous.getUTCMinutes() === now.getUTCMinutes();
}

function parseInput(input: string | null): unknown {
  if (!input) return {};
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return {};
  }
}

function toRunOutputText(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  // If the name already contains dots, it's already in canonical form — don't touch it
  if (trimmed.includes(".")) return trimmed;
  const firstUnderscore = trimmed.indexOf("_");
  if (firstUnderscore === -1) return trimmed;
  return `${trimmed.slice(0, firstUnderscore)}.${trimmed.slice(firstUnderscore + 1)}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function getScheduledTimeZone(input: unknown): string | undefined {
  const meta = asRecord(asRecord(input)?.["__jaitJobMeta"]);
  return typeof meta?.["timeZone"] === "string" ? meta["timeZone"] : undefined;
}

function isScheduledAgentTask(input: unknown): boolean {
  const meta = asRecord(asRecord(input)?.["__jaitJobMeta"]);
  return meta?.["jobType"] === "agent_task" || meta?.["jobType"] === "agent_thread_job";
}

/**
 * Whether this job is meant to fire exactly once.
 *
 * Cron has no way to express "tomorrow at 05:00" — the closest it gets is
 * `0 5 9 8 *`, which comes back every year. So a one-off carries a flag and the
 * scheduler disables it after it has fired.
 */
export function isOneShotJob(input: unknown): boolean {
  return asRecord(asRecord(input)?.["__jaitJobMeta"])?.["once"] === true;
}

function normalizeScheduledExecution(job: ScheduledJobRecord): SchedulerToolExecution {
  const toolName = normalizeToolName(job.toolName);
  const input = job.input;
  if (!isScheduledAgentTask(input)) {
    return {
      toolName,
      input,
      sessionId: job.sessionId,
      projectRoot: job.projectRoot,
      userId: job.userId,
    };
  }

  const record = asRecord(input) ?? {};
  const { title: _title, ...inputWithoutTitle } = record;

  if (toolName === ToolName.ThreadControl) {
    return {
      toolName: ToolName.ThreadControl,
      input: {
        ...inputWithoutTitle,
        action: "create",
        kind: "delivery",
        workingDirectory: typeof inputWithoutTitle["workingDirectory"] === "string"
          ? inputWithoutTitle["workingDirectory"]
          : job.projectRoot,
        start: true,
        detach: true,
      },
      sessionId: job.sessionId,
      projectRoot: job.projectRoot,
      userId: job.userId,
    };
  }

  if (toolName !== ToolName.AgentSpawn) {
    return {
      toolName,
      input: inputWithoutTitle,
      sessionId: job.sessionId,
      projectRoot: job.projectRoot,
      userId: job.userId,
    };
  }

  const meta = asRecord(record["__jaitJobMeta"]) ?? {};
  const prompt = typeof record["prompt"] === "string" ? record["prompt"] : "";
  const model = typeof meta["model"] === "string" ? meta["model"] : undefined;
  const providerId = typeof meta["provider"] === "string" ? meta["provider"] : undefined;

  return {
    toolName: ToolName.ThreadControl,
    input: {
      action: "create",
      kind: "delivery",
      workingDirectory: job.projectRoot,
      providerId,
      model,
      start: true,
      detach: true,
      prompt,
    },
    sessionId: job.sessionId,
    projectRoot: job.projectRoot,
    userId: job.userId,
  };
}

function mapJob(row: typeof scheduledJobs.$inferSelect): ScheduledJobRecord {
  return {
    id: row.id,
    userId: row.userId ?? null,
    name: row.name,
    cron: row.cron,
    toolName: normalizeToolName(row.toolName),
    input: parseInput(row.input),
    sessionId: row.sessionId ?? "default",
    projectRoot: row.projectRoot ?? process.cwd(),
    enabled: row.enabled === 1,
    lastRunAt: row.lastRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  /** Epoch millis of the last cleanup sweep. `0` → sweep on the first tick. */
  private lastPurgeAt = 0;

  constructor(private options: SchedulerOptions) {}

  start(pollMs = MINUTE_MS) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, pollMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  list(userId?: string): ScheduledJobRecord[] {
    const rows = this.options.db
      .select()
      .from(scheduledJobs)
      .orderBy(desc(scheduledJobs.updatedAt))
      .all();
    const all = rows.map(mapJob);
    if (!userId) return all;
    // Include both the user's own jobs AND system-level jobs (userId === null)
    return all.filter((job) => job.userId === userId || job.userId === null);
  }

  create(params: {
    userId?: string;
    name: string;
    cron: string;
    toolName: string;
    input?: unknown;
    sessionId?: string;
    projectRoot?: string;
    enabled?: boolean;
  }): ScheduledJobRecord {
    const now = new Date().toISOString();
    const id = uuidv7();
    this.options.db.insert(scheduledJobs).values({
      id,
      userId: params.userId ?? null,
      name: params.name,
      cron: params.cron,
      toolName: normalizeToolName(params.toolName),
      input: JSON.stringify(params.input ?? {}),
      sessionId: params.sessionId ?? "default",
      projectRoot: params.projectRoot ?? process.cwd(),
      enabled: params.enabled === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    }).run();

    return this.get(id)!;
  }

  get(id: string, userId?: string): ScheduledJobRecord | null {
    const row = this.options.db.select().from(scheduledJobs).where(eq(scheduledJobs.id, id)).get();
    const job = row ? mapJob(row) : null;
    if (!job) return null;
    // Allow access to system-level jobs (userId === null) for any authenticated user
    if (userId && job.userId !== null && job.userId !== userId) return null;
    return job;
  }

  remove(id: string, userId?: string): boolean {
    const exists = this.get(id, userId);
    if (!exists) return false;
    this.options.db.delete(scheduledJobs).where(eq(scheduledJobs.id, id)).run();
    return true;
  }

  update(
    id: string,
    patch: { name?: string; cron?: string; toolName?: string; enabled?: boolean; input?: unknown },
    userId?: string,
  ): ScheduledJobRecord | null {
    const existing = this.get(id, userId);
    if (!existing) return null;

    this.options.db.update(scheduledJobs).set({
      name: patch.name ?? existing.name,
      cron: patch.cron ?? existing.cron,
      toolName: patch.toolName ? normalizeToolName(patch.toolName) : existing.toolName,
      enabled: patch.enabled === undefined ? (existing.enabled ? 1 : 0) : (patch.enabled ? 1 : 0),
      input: patch.input === undefined ? JSON.stringify(existing.input) : JSON.stringify(patch.input),
      updatedAt: new Date().toISOString(),
    }).where(eq(scheduledJobs.id, id)).run();

    return this.get(id, userId);
  }

  listRuns(jobId: string): Array<typeof scheduledJobRuns.$inferSelect> {
    return this.options.db
      .select()
      .from(scheduledJobRuns)
      .where(eq(scheduledJobRuns.jobId, jobId))
      .orderBy(desc(scheduledJobRuns.startedAt))
      .all();
  }

  /**
   * What becomes of a one-shot job the schedule has just fired.
   *
   * - `"delete"` — it did its job. Nothing is left to look at, and a spent
   *   reminder in the job list is clutter the user has to mentally filter.
   * - `"disarm"` — it failed. The cron behind "tomorrow at 05:00" repeats
   *   yearly, so it must not stay armed; but deleting it would hide the failure
   *   at the moment it matters most, so it lingers until {@link purgeSpentOneShots}
   *   collects it.
   * - `"keep"` — recurring, or a manual run. Trying a reminder to see what it
   *   does must never cancel it.
   */
  private oneShotOutcome(
    job: ScheduledJobRecord,
    triggeredBy: SchedulerRunTrigger,
    succeeded: boolean,
  ): "delete" | "disarm" | "keep" {
    if (triggeredBy !== "schedule" || !isOneShotJob(job.input)) return "keep";
    return succeeded ? "delete" : "disarm";
  }

  /**
   * Delete a job and the run history that belongs to it.
   *
   * Runs are keyed by job id with no foreign key behind them, so dropping the
   * job alone would leave rows nothing can ever join back to a name.
   */
  private forget(id: string): void {
    this.options.db.delete(scheduledJobRuns).where(eq(scheduledJobRuns.jobId, id)).run();
    this.options.db.delete(scheduledJobs).where(eq(scheduledJobs.id, id)).run();
  }

  /**
   * Collect one-shots that fired, failed, and have since been read.
   *
   * The retention window exists so "did my 05:00 reminder go out?" is still
   * answerable the same day. Successful ones never get here — they are deleted
   * the moment they deliver.
   */
  purgeSpentOneShots(now = new Date(), retentionMs = ONE_SHOT_RETENTION_MS): number {
    const cutoff = now.getTime() - retentionMs;
    const spent = this.list().filter((job) => {
      if (job.enabled || !isOneShotJob(job.input) || !job.lastRunAt) return false;
      const ranAt = new Date(job.lastRunAt).getTime();
      return Number.isFinite(ranAt) && ranAt <= cutoff;
    });
    for (const job of spent) this.forget(job.id);
    return spent.length;
  }

  async trigger(
    id: string,
    userId?: string,
    runAt = new Date(),
    triggeredBy: SchedulerRunTrigger = "manual",
  ): Promise<SchedulerExecutionResult> {
    const job = this.get(id, userId);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    const actionId = uuidv7();
    const startedAt = runAt.toISOString();

    this.options.db.insert(scheduledJobRuns).values({
      id: actionId,
      jobId: id,
      status: "running",
      triggeredBy,
      startedAt,
    }).run();

    let result: ToolResult;
    try {
      result = await this.options.executeTool(normalizeScheduledExecution(job));
    } catch (err) {
      const completedAt = new Date().toISOString();
      const message = err instanceof Error ? err.message : String(err);
      this.options.db.update(scheduledJobRuns).set({
        status: "failed",
        error: message,
        completedAt,
      }).where(eq(scheduledJobRuns.id, actionId)).run();

      this.options.db.update(scheduledJobs).set({
        lastRunAt: startedAt,
        updatedAt: completedAt,
        // A throw is a failure, so this never deletes — the job stays visible.
        ...(this.oneShotOutcome(job, triggeredBy, false) === "disarm" ? { enabled: 0 } : {}),
      }).where(eq(scheduledJobs.id, id)).run();

      throw err;
    }

    const completedAt = new Date().toISOString();
    this.options.db.update(scheduledJobRuns).set({
      status: result.ok ? "completed" : "failed",
      output: result.ok ? toRunOutputText(result.data ?? result.message) : null,
      error: result.ok ? null : result.message,
      completedAt,
    }).where(eq(scheduledJobRuns.id, actionId)).run();

    const outcome = this.oneShotOutcome(job, triggeredBy, result.ok);
    if (outcome === "delete") {
      // Written and immediately dropped: the run row exists so the failure path
      // above can share this code, and the delivered message is the receipt.
      this.forget(id);
    } else {
      this.options.db.update(scheduledJobs).set({
        lastRunAt: startedAt,
        updatedAt: completedAt,
        ...(outcome === "disarm" ? { enabled: 0 } : {}),
      }).where(eq(scheduledJobs.id, id)).run();
    }

    const payload = { jobId: id, actionId, result };
    this.options.onExecuted?.(payload);
    return payload;
  }

  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const jobs = this.list().filter((j) => j.enabled);
      for (const job of jobs) {
        if (matchesCronMinute(job.cron, now, getScheduledTimeZone(job.input)) && !isSameUtcMinute(job.lastRunAt, now)) {
          try {
            await this.trigger(job.id, undefined, now, "schedule");
          } catch (err) {
            console.error(`Scheduled job failed: ${job.id}`, err);
          }
        }
      }
      this.purgeIfDue(now);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Sweep spent one-shots, at most hourly.
   *
   * Deliberately part of the tick rather than a seeded cron job: a cleanup the
   * user can disable is a cleanup that eventually stops running, and the job
   * list would fill up with exactly the entries it was meant to remove.
   */
  private purgeIfDue(now: Date): void {
    if (now.getTime() - this.lastPurgeAt < PURGE_INTERVAL_MS) return;
    this.lastPurgeAt = now.getTime();
    try {
      const removed = this.purgeSpentOneShots(now);
      if (removed > 0) console.log(`Scheduler: cleaned up ${removed} spent one-off job(s)`);
    } catch (err) {
      // Housekeeping must never take the scheduler down with it.
      console.error("Scheduler cleanup failed:", err);
    }
  }
}
