import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db/connection.js";
import { ArchitectureDiagramService, DEFAULT_ARCHITECTURE_DIAGRAM_FILE } from "./architecture-diagrams.js";

describe("ArchitectureDiagramService", () => {
  let service: ArchitectureDiagramService;
  let projectRoot: string;

  beforeEach(async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    sqlite.exec(`
      CREATE TABLE architecture_diagrams (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        project_root TEXT NOT NULL,
        diagram TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    sqlite.exec(`CREATE UNIQUE INDEX idx_architecture_diagrams_user_project ON architecture_diagrams(user_id, project_root)`);
    service = new ArchitectureDiagramService(db);
    projectRoot = await mkdtemp(join(tmpdir(), "jait-architecture-"));
  });

  it("writes diagrams to .jait/architecture.mmd in the project", async () => {
    const saved = await service.save({
      userId: "user-1",
      projectRoot,
      diagram: "flowchart LR\nA-->B",
    });

    const filePath = join(projectRoot, DEFAULT_ARCHITECTURE_DIAGRAM_FILE);
    expect(saved.filePath).toBe(filePath);
    expect(await readFile(filePath, "utf8")).toContain("A-->B");
    expect(service.getByProject(projectRoot, "user-1")?.source).toBe("file");
  });

  it("updates the same project file on subsequent saves", async () => {
    const created = await service.save({
      userId: "user-1",
      projectRoot,
      diagram: "flowchart LR\nA-->B",
    });
    const updated = await service.save({
      userId: "user-1",
      projectRoot,
      diagram: "flowchart LR\nA-->C",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.diagram).toContain("A-->C");
    expect(await readFile(updated.filePath, "utf8")).toContain("A-->C");
  });

  it("falls back to the legacy database value when the file does not exist yet", async () => {
    const saved = await service.save({
      userId: "user-1",
      projectRoot,
      diagram: "flowchart LR\nA-->B",
    });

    await writeFile(saved.filePath, "", "utf8");

    const legacyProject = await mkdtemp(join(tmpdir(), "jait-architecture-legacy-"));
    const legacy = await service.save({
      userId: "user-1",
      projectRoot: legacyProject,
      diagram: "flowchart LR\nLegacy-->Diagram",
    });
    await writeFile(legacy.filePath, "", "utf8");

    const loaded = service.getByProject(legacyProject, "user-1");
    expect(loaded?.diagram).toContain("Legacy-->Diagram");
    expect(loaded?.source).toBe("database");
  });
});
