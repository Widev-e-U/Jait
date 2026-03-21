import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db/connection.js";
import { ArchitectureDiagramService } from "./architecture-diagrams.js";

describe("ArchitectureDiagramService", () => {
  let service: ArchitectureDiagramService;

  beforeEach(async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    sqlite.exec(`
      CREATE TABLE architecture_diagrams (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        workspace_root TEXT NOT NULL,
        diagram TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    sqlite.exec(`CREATE UNIQUE INDEX idx_architecture_diagrams_user_workspace ON architecture_diagrams(user_id, workspace_root)`);
    service = new ArchitectureDiagramService(db);
  });

  it("upserts diagrams per user and workspace", () => {
    const created = service.save({
      userId: "user-1",
      workspaceRoot: "/workspace/app",
      diagram: "flowchart LR\nA-->B",
    });
    const updated = service.save({
      userId: "user-1",
      workspaceRoot: "/workspace/app",
      diagram: "flowchart LR\nA-->C",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.diagram).toContain("A-->C");
    expect(service.getByWorkspace("/workspace/app", "user-1")?.diagram).toContain("A-->C");
  });

  it("keeps diagrams isolated by user", () => {
    service.save({
      userId: "user-1",
      workspaceRoot: "/workspace/app",
      diagram: "flowchart LR\nA-->B",
    });
    service.save({
      userId: "user-2",
      workspaceRoot: "/workspace/app",
      diagram: "flowchart LR\nX-->Y",
    });

    expect(service.getByWorkspace("/workspace/app", "user-1")?.diagram).toContain("A-->B");
    expect(service.getByWorkspace("/workspace/app", "user-2")?.diagram).toContain("X-->Y");
  });
});
