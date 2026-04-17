import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { architectureDiagrams } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import { PathGuard } from "../security/path-guard.js";

export type ArchitectureDiagramRow = typeof architectureDiagrams.$inferSelect;
export const DEFAULT_ARCHITECTURE_DIAGRAM_FILE = ".jait/architecture.mmd";

export interface ArchitectureDiagramRecord extends ArchitectureDiagramRow {
  filePath: string;
  source: "file" | "database";
}

export class ArchitectureDiagramService {
  constructor(private readonly db: JaitDB) {}

  private getStoredRow(workspaceRoot: string, userId?: string): ArchitectureDiagramRow | null {
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

  getFilePath(workspaceRoot: string): string {
    const normalizedRoot = workspaceRoot.trim();
    if (!normalizedRoot) throw new Error("workspaceRoot is required");
    const guard = new PathGuard({ workspaceRoot: normalizedRoot });
    return guard.validate(DEFAULT_ARCHITECTURE_DIAGRAM_FILE);
  }

  getByWorkspace(workspaceRoot: string, userId?: string): ArchitectureDiagramRecord | null {
    const normalizedRoot = workspaceRoot.trim();
    if (!normalizedRoot) return null;

    const filePath = this.getFilePath(normalizedRoot);
    try {
      const diagram = readFileSync(filePath, "utf8").trim();
      if (diagram) {
        const existing = this.getStoredRow(normalizedRoot, userId);
        const now = new Date().toISOString();
        return {
          id: existing?.id ?? `file:${normalizedRoot}`,
          userId: userId ?? existing?.userId ?? null,
          workspaceRoot: normalizedRoot,
          diagram,
          createdAt: existing?.createdAt ?? now,
          updatedAt: existing?.updatedAt ?? now,
          filePath,
          source: "file",
        };
      }
    } catch {
      // Fall through to the legacy DB-backed value.
    }

    const existing = this.getStoredRow(normalizedRoot, userId);
    if (!existing) return null;
    return {
      ...existing,
      filePath,
      source: "database",
    };
  }

  async save(params: { workspaceRoot: string; diagram: string; userId?: string }): Promise<ArchitectureDiagramRecord> {
    const workspaceRoot = params.workspaceRoot.trim();
    const diagram = params.diagram.trim();
    if (!workspaceRoot) throw new Error("workspaceRoot is required");
    if (!diagram) throw new Error("diagram is required");

    const filePath = this.getFilePath(workspaceRoot);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${diagram}\n`, "utf8");

    const now = new Date().toISOString();
    const existing = this.getStoredRow(workspaceRoot, params.userId);
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
