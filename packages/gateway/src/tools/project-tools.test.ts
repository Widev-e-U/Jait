import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { ProjectService } from "../services/projects.js";
import { RepositoryService } from "../services/repositories.js";
import type { ToolContext } from "./contracts.js";
import { createProjectMoveTool } from "./project-tools.js";

describe("createProjectMoveTool", () => {
  let db: Awaited<ReturnType<typeof openDatabase>>["db"];
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let projectService: ProjectService;
  let repoService: RepositoryService;
  const tempRoots: string[] = [];

  function makeDir() {
    const root = mkdtempSync(join(tmpdir(), "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }

  function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  });

  afterEach(() => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires nodeId", async () => {
    const tool = createProjectMoveTool({ projectService, repoService });
    const result = await tool.execute({}, context());
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/nodeId is required/);
  });

  it("refuses to move when the destination path does not exist", async () => {
    const source = makeDir();
    const project = projectService.create({ userId: "user-1", rootPath: source, nodeId: "gateway" });
    const tool = createProjectMoveTool({ projectService, repoService });

    const result = await tool.execute(
      { projectId: project.id, nodeId: "gateway", rootPath: join(source, "does-not-exist") },
      context(),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not exist on node/);
    const unchanged = projectService.getById(project.id, "user-1");
    expect(unchanged?.rootPath).toBe(source);
  });

  it("moves a project to an existing destination path on the same node", async () => {
    const source = makeDir();
    const destination = makeDir();
    const project = projectService.create({ userId: "user-1", title: "My Project", rootPath: source, nodeId: "gateway" });
    const tool = createProjectMoveTool({ projectService, repoService });

    const result = await tool.execute(
      { projectId: project.id, nodeId: "gateway", rootPath: destination },
      context(),
    );

    expect(result.ok).toBe(true);
    const moved = projectService.getById(project.id, "user-1");
    expect(moved?.rootPath).toBe(destination);
    expect(moved?.nodeId).toBe("gateway");
  });

  it("is a no-op when the project is already at the destination", async () => {
    const source = makeDir();
    const project = projectService.create({ userId: "user-1", rootPath: source, nodeId: "gateway" });
    const tool = createProjectMoveTool({ projectService, repoService });

    const result = await tool.execute(
      { projectId: project.id, nodeId: "gateway", rootPath: source },
      context(),
    );

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/already on node/);
  });

  it("refuses to move to a remote node without a WebSocket control plane", async () => {
    const source = makeDir();
    const project = projectService.create({ userId: "user-1", rootPath: source, nodeId: "gateway" });
    const tool = createProjectMoveTool({ projectService, repoService });

    const result = await tool.execute(
      { projectId: project.id, nodeId: "remote-node-1", rootPath: "/remote/path" },
      context(),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Cannot reach node/);
    const unchanged = projectService.getById(project.id, "user-1");
    expect(unchanged?.nodeId).toBe("gateway");
  });

  it("errors when the project does not exist", async () => {
    const tool = createProjectMoveTool({ projectService, repoService });
    const result = await tool.execute(
      { projectId: "missing-project", nodeId: "gateway", rootPath: "/anywhere" },
      context(),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/);
  });
});
