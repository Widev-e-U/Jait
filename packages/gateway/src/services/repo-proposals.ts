import { desc, eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { automationRepoProposals } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export interface CreateRepoProposalParams {
  repoId: string;
  userId?: string;
  message: string;
  sourceThreadId?: string | null;
  sourceThreadTitle?: string | null;
}

export interface UpdateRepoProposalParams {
  message?: string;
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
    this.db.update(automationRepoProposals).set(set).where(eq(automationRepoProposals.id, id)).run();
    return this.getById(id);
  }

  delete(id: string): void {
    this.db.delete(automationRepoProposals).where(eq(automationRepoProposals.id, id)).run();
  }
}
