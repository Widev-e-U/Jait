/**
 * RepositoryService — CRUD for automation repositories.
 *
 * Persists repos in SQLite so they sync across all devices.
 */

import { eq, desc } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { automationRepositories } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";

// ── Types ────────────────────────────────────────────────────────────

export interface CreateRepoParams {
  userId?: string;
  deviceId?: string;
  name: string;
  defaultBranch?: string;
  localPath: string;
}

export interface UpdateRepoParams {
  name?: string;
  defaultBranch?: string;
  localPath?: string;
  deviceId?: string;
}

export type RepoRow = typeof automationRepositories.$inferSelect;

// ── Service ──────────────────────────────────────────────────────────

export class RepositoryService {
  constructor(private db: JaitDB) {}

  create(params: CreateRepoParams): RepoRow {
    const id = uuidv7();
    const now = new Date().toISOString();
    this.db
      .insert(automationRepositories)
      .values({
        id,
        userId: params.userId ?? null,
        deviceId: params.deviceId ?? null,
        name: params.name,
        defaultBranch: params.defaultBranch ?? "main",
        localPath: params.localPath,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return this.getById(id)!;
  }

  getById(id: string): RepoRow | undefined {
    return this.db
      .select()
      .from(automationRepositories)
      .where(eq(automationRepositories.id, id))
      .get();
  }

  list(userId?: string): RepoRow[] {
    const base = this.db.select().from(automationRepositories);
    if (userId) {
      return base
        .where(eq(automationRepositories.userId, userId))
        .orderBy(desc(automationRepositories.updatedAt))
        .all();
    }
    return base.orderBy(desc(automationRepositories.updatedAt)).all();
  }

  findByPath(localPath: string, userId?: string): RepoRow | undefined {
    const all = this.list(userId);
    return all.find((r) => r.localPath === localPath);
  }

  update(id: string, params: UpdateRepoParams): RepoRow | undefined {
    const now = new Date().toISOString();
    this.db
      .update(automationRepositories)
      .set({ ...params, updatedAt: now })
      .where(eq(automationRepositories.id, id))
      .run();
    return this.getById(id);
  }

  delete(id: string): void {
    this.db
      .delete(automationRepositories)
      .where(eq(automationRepositories.id, id))
      .run();
  }
}
