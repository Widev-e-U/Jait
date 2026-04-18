/**
 * PlanService — CRUD for automation plans.
 *
 * A plan holds a list of proposed tasks for a repository.
 * Each task can become a thread when the human approves and starts it.
 */

import { eq, desc } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { automationPlans } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

// ── Types ────────────────────────────────────────────────────────────

export type PlanStatus = "draft" | "active" | "completed" | "archived";
export type PlanTaskStatus = "proposed" | "approved" | "running" | "completed" | "skipped";

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: PlanTaskStatus;
  skillCandidate?: boolean;
  skillTitle?: string;
  skillRationale?: string;
  threadId?: string;
  dependsOn?: string[];
}

export interface CreatePlanParams {
  repoId: string;
  userId?: string;
  title: string;
  tasks?: PlanTask[];
}

export interface UpdatePlanParams {
  title?: string;
  status?: PlanStatus;
  tasks?: PlanTask[];
}

export type PlanRow = typeof automationPlans.$inferSelect;

export interface PlanWithTasks extends Omit<PlanRow, "tasks"> {
  tasks: PlanTask[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseTasks(raw: string): PlanTask[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hydrate(row: PlanRow): PlanWithTasks {
  return { ...row, tasks: parseTasks(row.tasks) };
}

export function newTaskId(): string {
  return uuidv7().slice(-8);
}

// ── Service ──────────────────────────────────────────────────────────

export class PlanService {
  constructor(private db: JaitDB) {}

  create(params: CreatePlanParams): PlanWithTasks {
    const id = uuidv7();
    const now = new Date().toISOString();
    const tasks = params.tasks ?? [];
    this.db
      .insert(automationPlans)
      .values({
        id,
        repoId: params.repoId,
        userId: params.userId ?? null,
        title: params.title,
        status: "draft",
        tasks: JSON.stringify(tasks),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return this.getById(id)!;
  }

  getById(id: string): PlanWithTasks | undefined {
    const row = this.db
      .select()
      .from(automationPlans)
      .where(eq(automationPlans.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  listByRepo(repoId: string): PlanWithTasks[] {
    return this.db
      .select()
      .from(automationPlans)
      .where(eq(automationPlans.repoId, repoId))
      .orderBy(desc(automationPlans.updatedAt))
      .all()
      .map(hydrate);
  }

  listByUser(userId: string): PlanWithTasks[] {
    return this.db
      .select()
      .from(automationPlans)
      .where(eq(automationPlans.userId, userId))
      .orderBy(desc(automationPlans.updatedAt))
      .all()
      .map(hydrate);
  }

  update(id: string, params: UpdatePlanParams): PlanWithTasks | undefined {
    const now = new Date().toISOString();
    const set: Record<string, unknown> = { updatedAt: now };
    if (params.title !== undefined) set.title = params.title;
    if (params.status !== undefined) set.status = params.status;
    if (params.tasks !== undefined) set.tasks = JSON.stringify(params.tasks);
    this.db
      .update(automationPlans)
      .set(set)
      .where(eq(automationPlans.id, id))
      .run();
    return this.getById(id);
  }

  /** Update a single task within a plan */
  updateTask(planId: string, taskId: string, patch: Partial<PlanTask>): PlanWithTasks | undefined {
    const plan = this.getById(planId);
    if (!plan) return undefined;
    const tasks = plan.tasks.map((t) =>
      t.id === taskId ? { ...t, ...patch } : t,
    );
    return this.update(planId, { tasks });
  }

  delete(id: string): void {
    this.db
      .delete(automationPlans)
      .where(eq(automationPlans.id, id))
      .run();
  }
}
