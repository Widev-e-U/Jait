import { eq, desc } from "drizzle-orm";
import type { JaitDB } from "../db/index.js";
import { scheduledJobs } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";
import type { ToolResult } from "../tools/contracts.js";

export interface SchedulerToolExecution {
  toolName: string;
  input: unknown;
  sessionId: string;
  workspaceRoot: string;
}

export interface SchedulerExecutionResult {
  jobId: string;
  actionId: string;
  result: ToolResult;
}

export interface ScheduledJobRecord {
  id: string;
  name: string;
  cron: string;
  toolName: string;
  input: unknown;
  sessionId: string;
  workspaceRoot: string;
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

function matchesCronMinute(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const minute = parts[0];
  const hour = parts[1];

  const minuteOk = minute === "*" || minute === String(date.getUTCMinutes());
  const hourOk = hour === "*" || hour === String(date.getUTCHours());

  // keep support intentionally small for Sprint 7:
  // day-of-month, month, day-of-week are wildcard only.
  const day = parts[2] === "*";
  const month = parts[3] === "*";
  const weekday = parts[4] === "*";

  return minuteOk && hourOk && day && month && weekday;
}

function parseInput(input: string | null): unknown {
  if (!input) return {};
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return {};
  }
}

function mapJob(row: typeof scheduledJobs.$inferSelect): ScheduledJobRecord {
  return {
    id: row.id,
    name: row.name,
    cron: row.cron,
    toolName: row.toolName,
    input: parseInput(row.input),
    sessionId: row.sessionId ?? "default",
    workspaceRoot: row.workspaceRoot ?? process.cwd(),
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

  list(): ScheduledJobRecord[] {
    const rows = this.options.db
      .select()
      .from(scheduledJobs)
      .orderBy(desc(scheduledJobs.updatedAt))
      .all();
    return rows.map(mapJob);
  }

  create(params: {
    name: string;
    cron: string;
    toolName: string;
    input?: unknown;
    sessionId?: string;
    workspaceRoot?: string;
    enabled?: boolean;
  }): ScheduledJobRecord {
    const now = new Date().toISOString();
    const id = uuidv7();
    this.options.db.insert(scheduledJobs).values({
      id,
      name: params.name,
      cron: params.cron,
      toolName: params.toolName,
      input: JSON.stringify(params.input ?? {}),
      sessionId: params.sessionId ?? "default",
      workspaceRoot: params.workspaceRoot ?? process.cwd(),
      enabled: params.enabled === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    }).run();

    return this.get(id)!;
  }

  get(id: string): ScheduledJobRecord | null {
    const row = this.options.db.select().from(scheduledJobs).where(eq(scheduledJobs.id, id)).get();
    return row ? mapJob(row) : null;
  }

  remove(id: string): boolean {
    const exists = this.get(id);
    if (!exists) return false;
    this.options.db.delete(scheduledJobs).where(eq(scheduledJobs.id, id)).run();
    return true;
  }

  update(id: string, patch: { name?: string; cron?: string; enabled?: boolean; input?: unknown }): ScheduledJobRecord | null {
    const existing = this.get(id);
    if (!existing) return null;

    this.options.db.update(scheduledJobs).set({
      name: patch.name ?? existing.name,
      cron: patch.cron ?? existing.cron,
      enabled: patch.enabled === undefined ? (existing.enabled ? 1 : 0) : (patch.enabled ? 1 : 0),
      input: patch.input === undefined ? JSON.stringify(existing.input) : JSON.stringify(patch.input),
      updatedAt: new Date().toISOString(),
    }).where(eq(scheduledJobs.id, id)).run();

    return this.get(id);
  }

  async trigger(id: string): Promise<SchedulerExecutionResult> {
    const job = this.get(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    const actionId = uuidv7();
    const result = await this.options.executeTool({
      toolName: job.toolName,
      input: job.input,
      sessionId: job.sessionId,
      workspaceRoot: job.workspaceRoot,
    });

    this.options.db.update(scheduledJobs).set({
      lastRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
        if (matchesCronMinute(job.cron, now)) {
          await this.trigger(job.id);
        }
      }
    } finally {
      this.ticking = false;
    }
  }
}
