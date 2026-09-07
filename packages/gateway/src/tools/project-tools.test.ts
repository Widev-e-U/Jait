import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { ProjectService } from "../services/projects.js";
import { RepositoryService } from "../services/repositories.js";
import type { WsControlPlane } from "../ws.js";
import type { ToolContext } from "./contracts.js";
import { createProjectCreateTool, createProjectMoveTool, createProjectTransferTool } from "./project-tools.js";

describe("project tools", () => {
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

  it("broadcasts projects created by the agent tool to the live UI", async () => {
    const broadcastToUser = vi.fn();
    const ws = { broadcastToUser } as unknown as WsControlPlane;
    const tool = createProjectCreateTool({ projectService, repoService, ws });

    const result = await tool.execute(
      { title: "Agent Project", assignRepository: false },
      context(),
    );

    expect(result.ok).toBe(true);
    const project = (result.data as { project: { id: string } }).project;
    expect(broadcastToUser).toHaveBeenCalledWith("user-1", expect.objectContaining({
      type: "project.created",
      payload: { project: expect.objectContaining({ id: project.id }) },
    }));
  });

  it.each([false, true])("moves the current chat into the created project (existing project: %s)", async (existing) => {
    const sessionService = new SessionService(db);
    const previous = projectService.create({ userId: "user-1", rootPath: "/old" });
    const chat = sessionService.create({ userId: "user-1", projectId: previous.id, projectPath: "/old" });
    if (existing) projectService.create({ userId: "user-1", rootPath: "/new", nodeId: "gateway" });
    const broadcastToUser = vi.fn();
    const tool = createProjectCreateTool({ projectService, repoService, sessionService, ws: { broadcastToUser } as unknown as WsControlPlane });
    const result = await tool.execute({ projectRoot: "/new", assignRepository: false }, context({ sessionId: chat.id }));
    const project = (result.data as { project: { id: string } }).project;
    expect(sessionService.getById(chat.id)?.projectId).toBe(project.id);
    expect(sessionService.getById(chat.id)?.projectPath).toBe("/new");
    expect(broadcastToUser.mock.calls.map((call) => call[1].type)).toEqual(["project.created", "chat.moved"]);
    expect(broadcastToUser).toHaveBeenLastCalledWith("user-1", expect.objectContaining({
      payload: expect.objectContaining({ fromProjectId: previous.id, toProjectId: project.id, sessionId: chat.id }),
    }));
  });

  it("does not move another user's chat", async () => {
    const sessionService = new SessionService(db);
    const chat = sessionService.create({ userId: "user-2", projectPath: "/old" });
    const tool = createProjectCreateTool({ projectService, repoService, sessionService });
    await tool.execute({ projectRoot: "/new", assignRepository: false }, context({ sessionId: chat.id }));
    expect(sessionService.getById(chat.id)?.projectId).toBeNull();
    expect(sessionService.getById(chat.id)?.projectPath).toBe("/old");
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

  it("transfers with SCP before retargeting the project", async () => {
    const source = makeDir();
    const project = projectService.create({ userId: "user-1", title: "Move Me", rootPath: source, nodeId: "gateway" });
    const transfer = vi.fn(async () => ({ output: "copied" }));
    const proxyFsOp = vi.fn(async () => true);
    const broadcastToUser = vi.fn();
    const ws = {
      getFsNodes: () => [{ id: "node-2", name: "Studio", isGateway: false }],
      proxyFsOp,
      broadcastToUser,
    } as unknown as WsControlPlane;
    const tool = createProjectTransferTool({ projectService, repoService, transfer, ws });

    const result = await tool.execute({
      projectId: project.id,
      nodeId: "node-2",
      rootPath: "/work/move-me",
      sshHost: "studio.local",
      sshUser: "jakob",
    }, context());

    expect(result.ok).toBe(true);
    expect(transfer).toHaveBeenCalledWith({
      sourcePath: source,
      destinationPath: "/work/move-me",
      sshHost: "studio.local",
      sshUser: "jakob",
      sshPort: undefined,
    });
    expect(proxyFsOp).toHaveBeenCalledWith("node-2", "exists", { path: "/work/move-me" }, 30_000);
    expect(projectService.getById(project.id, "user-1")).toMatchObject({ nodeId: "node-2", rootPath: "/work/move-me" });
  });

  it("keeps project metadata unchanged when SCP fails", async () => {
    const source = makeDir();
    const project = projectService.create({ userId: "user-1", rootPath: source, nodeId: "gateway" });
    const transfer = vi.fn(async () => { throw new Error("authentication failed"); });
    const ws = {
      getFsNodes: () => [{ id: "node-2", name: "Studio", isGateway: false }],
    } as unknown as WsControlPlane;
    const tool = createProjectTransferTool({ projectService, repoService, transfer, ws });

    const result = await tool.execute({
      projectId: project.id,
      nodeId: "node-2",
      rootPath: "/work/move-me",
      sshHost: "studio.local",
      sshUser: "jakob",
    }, context());

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/metadata was not changed/);
    expect(projectService.getById(project.id, "user-1")).toMatchObject({ nodeId: "gateway", rootPath: source });
  });
});
