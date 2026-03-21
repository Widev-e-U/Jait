import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { sessions, workspaces } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export interface CreateWorkspaceParams {
  userId?: string;
  title?: string;
  rootPath?: string | null;
  nodeId?: string | null;
  metadata?: Record<string, unknown>;
}

function fallbackWorkspaceTitle(rootPath?: string | null, fallback = "Untitled Workspace"): string {
  const normalized = rootPath?.trim();
  if (!normalized) return fallback;
  const parts = normalized.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || fallback;
}

export class WorkspaceService {
  constructor(private db: JaitDB) {}

  create(params: CreateWorkspaceParams = {}) {
    const id = uuidv7();
    const now = new Date().toISOString();
    this.db.insert(workspaces).values({
      id,
      userId: params.userId ?? null,
      title: params.title?.trim() || fallbackWorkspaceTitle(params.rootPath),
      rootPath: params.rootPath ?? null,
      nodeId: params.nodeId ?? "gateway",
      createdAt: now,
      lastActiveAt: now,
      status: "active",
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    }).run();
    return this.getById(id)!;
  }

  list(status?: string, userId?: string, limit?: number) {
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : undefined;

    let query = this.db.select().from(workspaces).$dynamic();
    if (status && userId) {
      query = query.where(and(eq(workspaces.status, status), eq(workspaces.userId, userId)));
    } else if (status) {
      query = query.where(eq(workspaces.status, status));
    } else if (userId) {
      query = query.where(eq(workspaces.userId, userId));
    }

    query = query.orderBy(desc(workspaces.lastActiveAt));
    return normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
  }

  listWithSessions(userId?: string, status = "active", limit?: number) {
    const workspaceRows = this.list(status, userId, typeof limit === "number" ? limit + 1 : undefined);
    const limitedRows = typeof limit === "number" ? workspaceRows.slice(0, limit) : workspaceRows;
    const workspaceIds = limitedRows.map((row) => row.id);
    const sessionRows = workspaceIds.length > 0
      ? this.db
          .select()
          .from(sessions)
          .where(
            and(
              inArray(sessions.workspaceId, workspaceIds),
              eq(sessions.status, "active"),
              userId ? eq(sessions.userId, userId) : sql`1 = 1`,
            ),
          )
          .orderBy(desc(sessions.lastActiveAt))
          .all()
      : [];
    const sessionMap = new Map<string, typeof sessionRows>();
    for (const row of sessionRows) {
      const bucket = sessionMap.get(row.workspaceId ?? "") ?? [];
      bucket.push(row);
      sessionMap.set(row.workspaceId ?? "", bucket);
    }

    return {
      workspaces: limitedRows.map((workspace) => ({
        ...workspace,
        sessions: sessionMap.get(workspace.id) ?? [],
      })),
      hasMore: typeof limit === "number" ? workspaceRows.length > limit : false,
    };
  }

  getById(id: string, userId?: string) {
    if (userId) {
      return this.db.select().from(workspaces).where(and(eq(workspaces.id, id), eq(workspaces.userId, userId))).get();
    }
    return this.db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  }

  getOrCreateForRoot(params: CreateWorkspaceParams) {
    const rootPath = params.rootPath?.trim();
    const nodeId = params.nodeId ?? "gateway";
    if (rootPath) {
      const conditions = [
        eq(workspaces.rootPath, rootPath),
        eq(workspaces.nodeId, nodeId),
        eq(workspaces.status, "active"),
      ];
      if (params.userId) {
        conditions.push(eq(workspaces.userId, params.userId));
      }
      const existing = this.db
        .select()
        .from(workspaces)
        .where(and(...conditions))
        .get();
      if (existing) return existing;
    }
    return this.create(params);
  }

  touch(id: string) {
    this.db
      .update(workspaces)
      .set({ lastActiveAt: new Date().toISOString() })
      .where(eq(workspaces.id, id))
      .run();
  }

  update(id: string, data: { title?: string; rootPath?: string | null; nodeId?: string | null; metadata?: Record<string, unknown> }, userId?: string) {
    const set: Record<string, string | null> = {};
    if (data.title !== undefined) set["title"] = data.title?.trim() || null;
    if (data.rootPath !== undefined) set["rootPath"] = data.rootPath;
    if (data.nodeId !== undefined) set["nodeId"] = data.nodeId;
    if (data.metadata !== undefined) set["metadata"] = JSON.stringify(data.metadata);
    if (Object.keys(set).length === 0) return;
    this.db
      .update(workspaces)
      .set(set)
      .where(userId ? and(eq(workspaces.id, id), eq(workspaces.userId, userId)) : eq(workspaces.id, id))
      .run();
  }
}
