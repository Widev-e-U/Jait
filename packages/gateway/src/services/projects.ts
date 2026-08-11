import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { sessions, projects } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import {
  getProjectAncestors,
  getProjectDescendantIds,
  normalizeProjectColor,
  renderInstructionChain,
  validateProjectMove,
  type MoveRejection,
  type ProjectKind,
} from "@jait/shared";

export interface CreateProjectParams {
  userId?: string;
  title?: string;
  rootPath?: string | null;
  nodeId?: string | null;
  metadata?: Record<string, unknown>;
  parentId?: string | null;
  instructions?: string | null;
  description?: string | null;
  color?: string | null;
}

export class ProjectMoveError extends Error {
  constructor(public readonly code: MoveRejection) {
    super(`Project move rejected: ${code}`);
    this.name = "ProjectMoveError";
  }
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

/**
 * A row with a directory is a project, one without is a folder. Kept as a
 * stored column rather than computed at read time so existing queries and the
 * client keep working, but it is always derived — never chosen by the caller.
 */
export function projectKindForRoot(rootPath: string | null | undefined): ProjectKind {
  return rootPath?.trim() ? "workspace" : "folder";
}

export class ProjectService {
  constructor(private db: JaitDB) {}

  create(params: CreateProjectParams = {}) {
    const id = uuidv7();
    const now = new Date().toISOString();
    const rootPath = params.rootPath?.trim() ? params.rootPath : null;
    // `kind` follows the directory rather than being chosen up front. A folder
    // is simply a row that has no directory *yet* — give it one and it becomes a
    // project, clear it and it is a folder again, with nothing recreated.
    const kind = projectKindForRoot(rootPath);
    this.db.insert(projects).values({
      id,
      userId: params.userId ?? null,
      title: params.title?.trim() || fallbackProjectTitle(rootPath, kind === "folder" ? "New folder" : undefined),
      rootPath,
      nodeId: params.nodeId ?? "gateway",
      createdAt: now,
      lastActiveAt: now,
      status: "active",
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      parentId: params.parentId ?? null,
      kind,
      instructions: params.instructions?.trim() || null,
      description: params.description?.trim() || null,
      color: normalizeProjectColor(params.color),
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
    let limitedRows = typeof limit === "number" ? projectRows.slice(0, limit) : projectRows;

    // Paging cuts the flat list by recency, which can slice a child away from
    // its parent. Pull any missing ancestors back in so the client always
    // receives a connected tree instead of orphans floating at the root.
    if (typeof limit === "number" && limitedRows.length > 0) {
      const all = this.list(status, userId);
      const byId = new Map(all.map((row) => [row.id, row]));
      const included = new Map(limitedRows.map((row) => [row.id, row]));
      for (const row of limitedRows) {
        let cursor = row.parentId;
        const guard = new Set<string>([row.id]);
        while (cursor && !included.has(cursor) && !guard.has(cursor)) {
          const ancestor = byId.get(cursor);
          if (!ancestor) break;
          included.set(ancestor.id, ancestor);
          guard.add(cursor);
          cursor = ancestor.parentId;
        }
      }
      limitedRows = [...included.values()].sort(
        (a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt),
      );
    }

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
          [project.title, project.rootPath, project.description]
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

  /**
   * The active project already using this directory, if any.
   *
   * Two rows on one directory would fight over the path-keyed side tables
   * (code graph, architecture diagrams), so this is the single place that
   * decides "taken". `getOrCreateForRoot` adopts what it finds; callers that
   * mean *create* use it to refuse instead.
   */
  findByRoot(rootPath: string, nodeId = "gateway", userId?: string): ProjectRow | undefined {
    const normalized = rootPath.trim();
    if (!normalized) return undefined;

    const conditions = [
      eq(projects.rootPath, normalized),
      eq(projects.nodeId, nodeId),
      eq(projects.status, "active"),
    ];
    if (userId) conditions.push(eq(projects.userId, userId));
    const exact = this.db.select().from(projects).where(and(...conditions)).get();
    if (exact) return exact;

    // The same directory reached from the gateway and from a remote node is one
    // project; separators and drive-letter case differ, the location does not.
    if (nodeId === "gateway" && userId) {
      const normalizedRoot = normalizeProjectRoot(normalized);
      return this.list("active", userId).find((project) => (
        project.nodeId !== "gateway"
        && typeof project.rootPath === "string"
        && normalizeProjectRoot(project.rootPath) === normalizedRoot
      ));
    }
    return undefined;
  }

  getOrCreateForRoot(params: CreateProjectParams) {
    const rootPath = params.rootPath?.trim();
    if (rootPath) {
      const existing = this.findByRoot(rootPath, params.nodeId ?? "gateway", params.userId);
      if (existing) return existing;
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

  update(
    id: string,
    data: {
      title?: string;
      rootPath?: string | null;
      nodeId?: string | null;
      metadata?: Record<string, unknown>;
      instructions?: string | null;
      description?: string | null;
      color?: string | null;
    },
    userId?: string,
  ) {
    const set: Record<string, string | null> = {};
    if (data.title !== undefined) set["title"] = data.title?.trim() || null;
    if (data.rootPath !== undefined) {
      const rootPath = data.rootPath?.trim() ? data.rootPath : null;
      set["rootPath"] = rootPath;
      // Kind is derived, so it has to move with the directory. Without this a
      // folder given a directory would keep calling itself a folder, and a
      // project whose directory was cleared would keep claiming to have one.
      set["kind"] = projectKindForRoot(rootPath);
    }
    if (data.nodeId !== undefined) set["nodeId"] = data.nodeId;
    if (data.metadata !== undefined) set["metadata"] = JSON.stringify(data.metadata);
    if (data.instructions !== undefined) set["instructions"] = data.instructions?.trim() || null;
    if (data.description !== undefined) set["description"] = data.description?.trim() || null;
    if (data.color !== undefined) set["color"] = normalizeProjectColor(data.color);
    if (Object.keys(set).length === 0) return;
    this.db
      .update(projects)
      .set(set)
      .where(userId ? and(eq(projects.id, id), eq(projects.userId, userId)) : eq(projects.id, id))
      .run();
  }

  /**
   * Re-parent a project. Throws `ProjectMoveError` when the move would create a
   * cycle, exceed the depth limit, or hang a node off a workspace.
   *
   * Validation runs against the user's *active* rows only — the same set the UI
   * offers as targets — so client and server always agree on what is allowed.
   */
  move(id: string, newParentId: string | null, userId?: string) {
    const rows = this.list("active", userId).map((row) => ({
      id: row.id,
      parentId: row.parentId,
      kind: row.kind,
    }));
    const rejection = validateProjectMove(rows, id, newParentId);
    if (rejection) throw new ProjectMoveError(rejection);

    this.db
      .update(projects)
      .set({ parentId: newParentId, lastActiveAt: new Date().toISOString() })
      .where(userId ? and(eq(projects.id, id), eq(projects.userId, userId)) : eq(projects.id, id))
      .run();
    return this.getById(id, userId);
  }

  /**
   * Instructions from the root folder down to `id`, ready for the system prompt.
   * Returns null when no ancestor (and not the project itself) sets any.
   */
  resolveInstructionChain(id: string, userId?: string): string | null {
    const project = this.getById(id, userId);
    if (!project) return null;

    const rows = this.list("active", userId);
    const chain = [...getProjectAncestors(rows, id), project].map((row) => ({
      id: row.id,
      title: row.title,
      instructions: row.instructions ?? "",
    }));
    return renderInstructionChain(chain);
  }

  /**
   * The working directory that actually applies to a project: its own, or the
   * nearest ancestor's.
   *
   * Without this a chat inside a folder that has no directory of its own would
   * fall through to the gateway's own cwd and run tools in the wrong place —
   * silently, since nothing errors.
   */
  effectiveRootPath(idOrProject: string | ProjectRow | null | undefined, userId?: string): string | null {
    if (!idOrProject) return null;
    const project = typeof idOrProject === "string" ? this.getById(idOrProject, userId) : idOrProject;
    if (!project) return null;
    if (project.rootPath?.trim()) return project.rootPath;

    const rows = this.list("active", userId);
    for (const ancestor of getProjectAncestors(rows, project.id).reverse()) {
      if (ancestor.rootPath?.trim()) return ancestor.rootPath;
    }
    return null;
  }

  /**
   * Detach the repository from a project.
   *
   * A repository is the project's directory seen through git, so clearing the
   * directory has to clear this too — otherwise the sidebar keeps advertising a
   * repository for a row that points nowhere. Both metadata spellings are
   * dropped because getProjectRepositoryId accepts either.
   */
  clearRepository(id: string, userId?: string) {
    const project = this.getById(id, userId);
    if (!project) return undefined;
    const metadata = parseProjectMetadata(project);
    if (!("repositoryId" in metadata) && !("repoId" in metadata)) return project;
    delete metadata["repositoryId"];
    delete metadata["repoId"];
    this.update(id, { metadata }, userId);
    return this.getById(id, userId);
  }

  /** Ids of every folder/project nested under `id`. */
  listDescendantIds(id: string, userId?: string): string[] {
    const rows = this.list("active", userId).map((row) => ({ id: row.id, parentId: row.parentId }));
    return getProjectDescendantIds(rows, id);
  }

  assignRepository(id: string, repositoryId: string, userId?: string) {
    const project = this.getById(id, userId);
    if (!project) return undefined;
    const metadata = parseProjectMetadata(project);
    metadata["repositoryId"] = repositoryId;
    this.update(id, { metadata }, userId);
    return this.getById(id, userId);
  }

  /**
   * Archive a project and everything nested under it. Without the recursive
   * step the children would keep `status: 'active'` while their parent is gone,
   * and `buildProjectTree` would surface them as stray roots.
   */
  archive(id: string, userId?: string) {
    const ids = [id, ...this.listDescendantIds(id, userId)];
    this.db
      .update(projects)
      .set({ status: "archived" })
      .where(userId ? and(inArray(projects.id, ids), eq(projects.userId, userId)) : inArray(projects.id, ids))
      .run();
    return ids;
  }

  /** Chats that would be affected by archiving this project and its descendants. */
  countSessionsInSubtree(id: string, userId?: string): number {
    const ids = [id, ...this.listDescendantIds(id, userId)];
    const rows = this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          inArray(sessions.projectId, ids),
          eq(sessions.status, "active"),
          userId ? eq(sessions.userId, userId) : sql`1 = 1`,
        ),
      )
      .all();
    return rows.length;
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
