import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { sessions, projects } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export interface CreateProjectParams {
  userId?: string;
  title?: string;
  rootPath?: string | null;
  nodeId?: string | null;
  metadata?: Record<string, unknown>;
}

type ProjectRow = typeof projects.$inferSelect;

function fallbackProjectTitle(rootPath?: string | null, fallback = "Untitled Project"): string {
  const normalized = rootPath?.trim();
  if (!normalized) return fallback;
  const parts = normalized.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || fallback;
}

function normalizeProjectRoot(rootPath: string): string {
  const normalized = rootPath.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function parseProjectMetadata(project: Pick<ProjectRow, "metadata"> | null | undefined): Record<string, unknown> {
  if (!project?.metadata) return {};
  try {
    const parsed = JSON.parse(project.metadata) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function getProjectRepositoryId(project: Pick<ProjectRow, "metadata"> | null | undefined): string | null {
  const metadata = parseProjectMetadata(project);
  const value = metadata["repositoryId"] ?? metadata["repoId"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class ProjectService {
  constructor(private db: JaitDB) {}

  create(params: CreateProjectParams = {}) {
    const id = uuidv7();
    const now = new Date().toISOString();
    this.db.insert(projects).values({
      id,
      userId: params.userId ?? null,
      title: params.title?.trim() || fallbackProjectTitle(params.rootPath),
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

    let query = this.db.select().from(projects).$dynamic();
    if (status && userId) {
      query = query.where(and(eq(projects.status, status), eq(projects.userId, userId)));
    } else if (status) {
      query = query.where(eq(projects.status, status));
    } else if (userId) {
      query = query.where(eq(projects.userId, userId));
    }

    query = query.orderBy(desc(projects.lastActiveAt));
    return normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
  }

  listWithSessions(userId?: string, status = "active", limit?: number) {
    const projectRows = this.list(status, userId, typeof limit === "number" ? limit + 1 : undefined);
    const limitedRows = typeof limit === "number" ? projectRows.slice(0, limit) : projectRows;
    const projectIds = limitedRows.map((row) => row.id);
    const sessionRows = projectIds.length > 0
      ? this.db
          .select()
          .from(sessions)
          .where(
            and(
              inArray(sessions.projectId, projectIds),
              eq(sessions.status, "active"),
              userId ? eq(sessions.userId, userId) : sql`1 = 1`,
            ),
          )
          .orderBy(desc(sessions.lastActiveAt))
          .all()
      : [];
    const sessionMap = new Map<string, typeof sessionRows>();
    for (const row of sessionRows) {
      const bucket = sessionMap.get(row.projectId ?? "") ?? [];
      bucket.push(row);
      sessionMap.set(row.projectId ?? "", bucket);
    }

    return {
      projects: limitedRows.map((project) => ({
        ...project,
        sessions: sessionMap.get(project.id) ?? [],
      })),
      hasMore: typeof limit === "number" ? projectRows.length > limit : false,
    };
  }

  searchWithSessions(userId: string, rawQuery: string) {
    const query = rawQuery.trim().toLowerCase();
    if (!query) return { projects: [], personalSessions: [] };

    const projectRows = this.list("active", userId);
    const sessionRows = this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.status, "active"), eq(sessions.userId, userId)))
      .orderBy(desc(sessions.lastActiveAt))
      .all();

    const matchingSessions = sessionRows.filter((session) => (
      [session.name, session.projectPath]
        .some((value) => value?.toLowerCase().includes(query))
    ));
    const sessionsByProject = new Map<string, typeof matchingSessions>();
    const personalSessions: typeof matchingSessions = [];
    for (const session of matchingSessions) {
      if (!session.projectId) {
        personalSessions.push(session);
        continue;
      }
      const bucket = sessionsByProject.get(session.projectId) ?? [];
      bucket.push(session);
      sessionsByProject.set(session.projectId, bucket);
    }

    return {
      projects: projectRows
        .filter((project) => (
          [project.title, project.rootPath]
            .some((value) => value?.toLowerCase().includes(query))
          || sessionsByProject.has(project.id)
        ))
        .map((project) => ({
          ...project,
          sessions: sessionsByProject.get(project.id) ?? [],
        })),
      personalSessions,
    };
  }

  getById(id: string, userId?: string) {
    if (userId) {
      return this.db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).get();
    }
    return this.db.select().from(projects).where(eq(projects.id, id)).get();
  }

  getOrCreateForRoot(params: CreateProjectParams) {
    const rootPath = params.rootPath?.trim();
    const nodeId = params.nodeId ?? "gateway";
    if (rootPath) {
      const conditions = [
        eq(projects.rootPath, rootPath),
        eq(projects.nodeId, nodeId),
        eq(projects.status, "active"),
      ];
      if (params.userId) {
        conditions.push(eq(projects.userId, params.userId));
      }
      const existing = this.db
        .select()
        .from(projects)
        .where(and(...conditions))
        .get();
      if (existing) return existing;

      if (nodeId === "gateway" && params.userId) {
        const normalizedRoot = normalizeProjectRoot(rootPath);
        const remoteExisting = this.list("active", params.userId).find((project) => (
          project.nodeId !== "gateway"
          && typeof project.rootPath === "string"
          && normalizeProjectRoot(project.rootPath) === normalizedRoot
        ));
        if (remoteExisting) return remoteExisting;
      }
    }
    return this.create(params);
  }

  touch(id: string) {
    this.db
      .update(projects)
      .set({ lastActiveAt: new Date().toISOString() })
      .where(eq(projects.id, id))
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
      .update(projects)
      .set(set)
      .where(userId ? and(eq(projects.id, id), eq(projects.userId, userId)) : eq(projects.id, id))
      .run();
  }

  assignRepository(id: string, repositoryId: string, userId?: string) {
    const project = this.getById(id, userId);
    if (!project) return undefined;
    const metadata = parseProjectMetadata(project);
    metadata["repositoryId"] = repositoryId;
    this.update(id, { metadata }, userId);
    return this.getById(id, userId);
  }

  archive(id: string, userId?: string) {
    this.db
      .update(projects)
      .set({ status: "archived" })
      .where(userId ? and(eq(projects.id, id), eq(projects.userId, userId)) : eq(projects.id, id))
      .run();
  }

  restore(id: string, userId?: string) {
    this.db
      .update(projects)
      .set({ status: "active" })
      .where(userId ? and(eq(projects.id, id), eq(projects.userId, userId)) : eq(projects.id, id))
      .run();
  }

  delete(id: string, userId?: string) {
    this.db
      .update(projects)
      .set({ status: "deleted" })
      .where(userId ? and(eq(projects.id, id), eq(projects.userId, userId)) : eq(projects.id, id))
      .run();
  }

  /** Delete (soft) all archived projects for a user. Returns count of affected rows. */
  deleteArchived(userId: string): number {
    const archived = this.list("archived", userId);
    if (archived.length === 0) return 0;
    const ids = archived.map((w) => w.id);
    this.db
      .update(projects)
      .set({ status: "deleted" })
      .where(and(inArray(projects.id, ids), eq(projects.userId, userId)))
      .run();
    return archived.length;
  }

  getActiveSessionCounts(userId: string): Map<string, number> {
    const rows = this.db
      .select({
        projectId: sessions.projectId,
        count: sql<number>`count(*)`,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "active")))
      .groupBy(sessions.projectId)
      .all();
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.projectId) counts.set(row.projectId, Number(row.count));
    }
    return counts;
  }
}
