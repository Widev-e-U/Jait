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

interface CompletionHistoryEntry {
  completedAt: string;
  previousStatus: string | null;
}

function parseCompletionHistory(value: string | null | undefined): CompletionHistoryEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is CompletionHistoryEntry => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry as Record<string, unknown>;
      return typeof record.completedAt === "string"
        && (typeof record.previousStatus === "string" || record.previousStatus === null);
    });
  } catch {
    return [];
  }
}

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
    const status = params.status ?? "open";
    const completionHistory = status === "done"
      ? JSON.stringify([{ completedAt: now, previousStatus: null }])
      : "[]";
    this.db.insert(automationRepoProposals).values({
      id,
      repoId: params.repoId,
      userId: params.userId ?? null,
      message,
      status,
      priority: params.priority ?? "normal",
      dueDate: params.dueDate ?? null,
      tags: JSON.stringify(params.tags ?? []),
      completedAt: status === "done" ? now : null,
      completionHistory,
      sourceThreadId: params.sourceThreadId ?? null,
      sourceThreadTitle: params.sourceThreadTitle ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();
    return this.getById(id)!;
  }

  update(id: string, params: UpdateRepoProposalParams): RepoProposalRow | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const set: Record<string, unknown> = {
      updatedAt: now,
    };
    if (params.message !== undefined) {
      set.message = params.message.trim();
    }
    if (params.status !== undefined) {
      set.status = params.status;
      if (params.status === "done" && existing.status !== "done") {
        const history = parseCompletionHistory(existing.completionHistory);
        set.completedAt = now;
        set.completionHistory = JSON.stringify([
          { completedAt: now, previousStatus: existing.status },
          ...history,
        ].slice(0, 100));
      } else if (params.status !== "done" && existing.status === "done") {
        set.completedAt = null;
      }
    }
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
