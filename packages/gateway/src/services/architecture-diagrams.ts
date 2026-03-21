import { and, desc, eq, isNull } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { architectureDiagrams } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export type ArchitectureDiagramRow = typeof architectureDiagrams.$inferSelect;

export class ArchitectureDiagramService {
  constructor(private readonly db: JaitDB) {}

  getByWorkspace(workspaceRoot: string, userId?: string): ArchitectureDiagramRow | null {
    const normalizedRoot = workspaceRoot.trim();
    if (!normalizedRoot) return null;
    if (userId) {
      return this.db
        .select()
        .from(architectureDiagrams)
        .where(and(
          eq(architectureDiagrams.userId, userId),
          eq(architectureDiagrams.workspaceRoot, normalizedRoot),
        ))
        .get() ?? null;
    }
    return this.db
      .select()
      .from(architectureDiagrams)
      .where(and(
        isNull(architectureDiagrams.userId),
        eq(architectureDiagrams.workspaceRoot, normalizedRoot),
      ))
      .get() ?? null;
  }

  save(params: { workspaceRoot: string; diagram: string; userId?: string }): ArchitectureDiagramRow {
    const workspaceRoot = params.workspaceRoot.trim();
    const diagram = params.diagram.trim();
    if (!workspaceRoot) throw new Error("workspaceRoot is required");
    if (!diagram) throw new Error("diagram is required");

    const now = new Date().toISOString();
    const existing = this.getByWorkspace(workspaceRoot, params.userId);
    if (existing) {
      this.db
        .update(architectureDiagrams)
        .set({
          diagram,
          updatedAt: now,
        })
        .where(eq(architectureDiagrams.id, existing.id))
        .run();
      return this.getByWorkspace(workspaceRoot, params.userId)!;
    }

    const id = uuidv7();
    this.db
      .insert(architectureDiagrams)
      .values({
        id,
        userId: params.userId ?? null,
        workspaceRoot,
        diagram,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return this.getByWorkspace(workspaceRoot, params.userId)!;
  }

  list(userId?: string): ArchitectureDiagramRow[] {
    const query = this.db.select().from(architectureDiagrams);
    if (userId) {
      return query
        .where(eq(architectureDiagrams.userId, userId))
        .orderBy(desc(architectureDiagrams.updatedAt))
        .all();
    }
    return query
      .where(isNull(architectureDiagrams.userId))
      .orderBy(desc(architectureDiagrams.updatedAt))
      .all();
  }
}
