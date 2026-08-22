/**
 * RepositoryService — CRUD for automation repositories.
 *
 * Persists repos in SQLite so they sync across all devices.
 */

import { and, eq, desc } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { automationRepositories } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { CreateRepoRequest, UpdateRepoRequest } from "@jait/shared/types";

// ── Types ────────────────────────────────────────────────────────────

export interface CreateRepoParams extends CreateRepoRequest {
  userId?: string;
}

export interface UpdateRepoParams extends UpdateRepoRequest {}

export type RepoRow = typeof automationRepositories.$inferSelect;

// ── Service ──────────────────────────────────────────────────────────

export class RepositoryService {
  constructor(private db: JaitDB) {}

  /**
   * One row per (user, path). Callers check `findByPath` first, but a device
   * registering its folders sends those requests concurrently — every check can
   * pass before the first insert lands. The unique index settles the race and
   * the loser gets handed the row that won, instead of a duplicate.
   */
  create(params: CreateRepoParams): RepoRow {
    const id = uuidv7();
    const now = new Date().toISOString();
    try {
      this.db
        .insert(automationRepositories)
        .values({
          id,
          userId: params.userId ?? null,
          deviceId: params.deviceId ?? null,
          name: params.name,
          defaultBranch: params.defaultBranch ?? "main",
          localPath: params.localPath,
          githubUrl: params.githubUrl ?? params.forgeUrl ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } catch (error) {
      const existing = this.findByPath(params.localPath, params.userId);
      if (!existing) throw error;
      return existing;
    }
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
    const where = userId
      ? and(eq(automationRepositories.localPath, localPath), eq(automationRepositories.userId, userId))
      : eq(automationRepositories.localPath, localPath);
    return this.db.select().from(automationRepositories).where(where).get();
  }

  update(id: string, params: UpdateRepoParams): RepoRow | undefined {
    const now = new Date().toISOString();
    const { forgeUrl, ...repoParams } = params;
    const updates: Partial<typeof automationRepositories.$inferInsert> & { updatedAt: string } = {
      ...repoParams,
      updatedAt: now,
    };
    if (forgeUrl !== undefined && repoParams.githubUrl === undefined) {
      updates.githubUrl = forgeUrl;
    }
    this.db
      .update(automationRepositories)
      .set(updates)
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
