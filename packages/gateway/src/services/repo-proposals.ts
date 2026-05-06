import { desc, eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { automationRepoProposals } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export interface CreateRepoProposalParams {
  repoId: string;
  userId?: string;
  message: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  tags?: string[];
  sourceThreadId?: string | null;
  sourceThreadTitle?: string | null;
}

export interface UpdateRepoProposalParams {
  message?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  tags?: string[];
}

export type RepoProposalRow = typeof automationRepoProposals.$inferSelect;

export class RepoProposalService {
  constructor(private db: JaitDB) {}

  listByRepo(repoId: string): RepoProposalRow[] {
    return this.db
      .select()
      .from(automationRepoProposals)
      .where(eq(automationRepoProposals.repoId, repoId))
      .orderBy(desc(automationRepoProposals.updatedAt))
      .all();
  }

  getById(id: string): RepoProposalRow | undefined {
    return this.db
      .select()
      .from(automationRepoProposals)
      .where(eq(automationRepoProposals.id, id))
      .get();
  }

  create(params: CreateRepoProposalParams): RepoProposalRow {
    const message = params.message.trim();
    const now = new Date().toISOString();
    const id = uuidv7();
    this.db.insert(automationRepoProposals).values({
      id,
      repoId: params.repoId,
      userId: params.userId ?? null,
      message,
      status: params.status ?? "open",
      priority: params.priority ?? "normal",
      dueDate: params.dueDate ?? null,
      tags: JSON.stringify(params.tags ?? []),
      sourceThreadId: params.sourceThreadId ?? null,
      sourceThreadTitle: params.sourceThreadTitle ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();
    return this.getById(id)!;
  }

  update(id: string, params: UpdateRepoProposalParams): RepoProposalRow | undefined {
    const set: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (params.message !== undefined) {
      set.message = params.message.trim();
    }
    if (params.status !== undefined) set.status = params.status;
    if (params.priority !== undefined) set.priority = params.priority;
    if (params.dueDate !== undefined) set.dueDate = params.dueDate;
    if (params.tags !== undefined) set.tags = JSON.stringify(params.tags);
    this.db.update(automationRepoProposals).set(set).where(eq(automationRepoProposals.id, id)).run();
    return this.getById(id);
  }

  delete(id: string): void {
    this.db.delete(automationRepoProposals).where(eq(automationRepoProposals.id, id)).run();
  }
}
