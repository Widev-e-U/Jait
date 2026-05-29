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

function matchesCronMinute(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, weekday] = parts as [string, string, string, string, string];

  return (
    matchCronField(minute, date.getUTCMinutes()) &&
    matchCronField(hour, date.getUTCHours()) &&
    matchCronField(dayOfMonth, date.getUTCDate()) &&
    matchCronField(month, date.getUTCMonth() + 1) && // cron months are 1-12
    matchCronField(weekday, date.getUTCDay()) // cron weekdays: 0=Sun
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

function isScheduledAgentTask(input: unknown): boolean {
  const meta = asRecord(asRecord(input)?.["__jaitJobMeta"]);
  return meta?.["jobType"] === "agent_task" || meta?.["jobType"] === "agent_thread_job";
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

    this.options.db.update(scheduledJobs).set({
      lastRunAt: startedAt,
      updatedAt: completedAt,
    }).where(eq(scheduledJobs.id, id)).run();

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
        if (matchesCronMinute(job.cron, now) && !isSameUtcMinute(job.lastRunAt, now)) {
          try {
            await this.trigger(job.id, undefined, now, "schedule");
          } catch (err) {
            console.error(`Scheduled job failed: ${job.id}`, err);
          }
        }
      }
    } finally {
      this.ticking = false;
    }
  }
}
