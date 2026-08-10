import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { UserService } from "./users.js";
import { getProjectRepositoryId, ProjectService } from "./projects.js";
import { SessionService } from "./sessions.js";

describe("ProjectService", () => {
  let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
  let projects: ProjectService;
  let sessions: SessionService;
  let users: UserService;
  let userId: string;

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  });

  afterEach(() => {
    sqlite.close();
  });

  it("reuses a remote Windows project when an agent requests the same root as gateway", () => {
    const remote = projects.create({
      userId,
      rootPath: "E:\\TizenAnilabStream",
      nodeId: "electron-windows"
    });

    const resolved = projects.getOrCreateForRoot({
      userId,
      rootPath: "e:/tizenanilabstream/",
      nodeId: "gateway"
    });

    expect(resolved.id).toBe(remote.id);
    expect(projects.list("active", userId)).toHaveLength(1);
    expect(resolved.nodeId).toBe("electron-windows");
  });

  it("keeps the same path separate on two explicit remote nodes", () => {
    const first = projects.getOrCreateForRoot({ userId, rootPath: "/workspace/app", nodeId: "node-a" });
    const second = projects.getOrCreateForRoot({ userId, rootPath: "/workspace/app", nodeId: "node-b" });

    expect(second.id).not.toBe(first.id);
    expect(projects.list("active", userId)).toHaveLength(2);
  });

  it("searches every active project and chat while preserving user boundaries", () => {
    const matchingProject = projects.create({ userId, title: "Desktop reliability", rootPath: "/workspace/desktop" });
    const otherProject = projects.create({ userId, title: "Gateway", rootPath: "/workspace/gateway" });
    sessions.create({ userId, projectId: matchingProject.id, name: "Investigate gray window" });
    sessions.create({ userId, projectId: otherProject.id, name: "Improve global chat search" });
    sessions.create({ userId, name: "Personal gray-screen notes" });

    const otherUserId = users.createUser("other-owner", "password123").id;
    const privateProject = projects.create({ userId: otherUserId, title: "Gray private project" });
    sessions.create({ userId: otherUserId, projectId: privateProject.id, name: "Gray private chat" });

    const grayResults = projects.searchWithSessions(userId, "gray");
    expect(grayResults.projects.map((project) => project.id)).toEqual([matchingProject.id]);
    expect(grayResults.projects[0]?.sessions.map((session) => session.name)).toEqual(["Investigate gray window"]);
    expect(grayResults.personalSessions.map((session) => session.name)).toEqual(["Personal gray-screen notes"]);

    const olderChatResults = projects.searchWithSessions(userId, "global chat search");
    expect(olderChatResults.projects.map((project) => project.id)).toEqual([otherProject.id]);
    expect(olderChatResults.projects[0]?.sessions.map((session) => session.name)).toEqual(["Improve global chat search"]);
  });

  describe("folders", () => {
    it("is a folder while it has no directory", () => {
      const folder = projects.create({ userId, title: "Work" });
      expect(folder.kind).toBe("folder");
      expect(folder.rootPath).toBeNull();
    });

    it("becomes a project the moment it is given a directory, and back again", () => {
      const folder = projects.create({ userId, title: "Work" });

      projects.update(folder.id, { rootPath: "/tmp/app" }, userId);
      expect(projects.getById(folder.id, userId)?.kind).toBe("workspace");

      // Kind is derived, never chosen, so clearing the directory has to restore
      // the folder rather than leave a project claiming a path it lost.
      projects.update(folder.id, { rootPath: null }, userId);
      const cleared = projects.getById(folder.id, userId);
      expect(cleared?.kind).toBe("folder");
      expect(cleared?.rootPath).toBeNull();
    });

    it("defaults existing-style creates to workspace", () => {
      const project = projects.create({ userId, rootPath: "/tmp/app" });
      expect(project.kind).toBe("workspace");
      expect(project.parentId).toBeNull();
    });

    it("detaches the repository when the directory is cleared", () => {
      const project = projects.create({ userId, rootPath: "/tmp/app" });
      projects.assignRepository(project.id, "repo-1", userId);
      expect(getProjectRepositoryId(projects.getById(project.id, userId))).toBe("repo-1");

      projects.update(project.id, { rootPath: null }, userId);
      projects.clearRepository(project.id, userId);

      expect(getProjectRepositoryId(projects.getById(project.id, userId))).toBeNull();
    });

    it("inherits the nearest ancestor's directory", () => {
      const mono = projects.create({ userId, title: "Monorepo", rootPath: "/srv/mono" });
      const group = projects.create({ userId, title: "Experiments", parentId: mono.id });
      const leaf = projects.create({ userId, title: "Spike", parentId: group.id });

      // Without this a chat under a pathless folder would run in the gateway's
      // own cwd instead of the project it visibly sits in.
      expect(projects.effectiveRootPath(leaf.id, userId)).toBe("/srv/mono");
      expect(projects.effectiveRootPath(mono.id, userId)).toBe("/srv/mono");
    });

    it("reports no directory when nothing in the chain has one", () => {
      const folder = projects.create({ userId, title: "Ideas" });
      const child = projects.create({ userId, title: "Later", parentId: folder.id });
      expect(projects.effectiveRootPath(child.id, userId)).toBeNull();
    });

    it("stores description and normalises colour", () => {
      const folder = projects.create({
        userId,
        title: "Ops",
        description: "  Infra chats  ",
        color: "#AABBCC"
      });
      expect(folder.description).toBe("Infra chats");
      expect(folder.color).toBe("#aabbcc");
    });

    it("drops a colour that is neither a palette token nor hex", () => {
      const folder = projects.create({ userId, color: "url(evil)" });
      expect(folder.color).toBeNull();
    });

    it("moves a project under a folder", () => {
      const parent = projects.create({ userId, title: "Parent" });
      const child = projects.create({ userId, rootPath: "/tmp/child" });
      const moved = projects.move(child.id, parent.id, userId);
      expect(moved?.parentId).toBe(parent.id);
    });

    it("rejects a move that would create a cycle", () => {
      const a = projects.create({ userId, title: "A" });
      const b = projects.create({ userId, title: "B", parentId: a.id });
      expect(() => projects.move(a.id, b.id, userId)).toThrowError(/CYCLE/);
    });

    it("allows nesting under a project that owns a directory", () => {
      const ws = projects.create({ userId, rootPath: "/tmp/ws" });
      const folder = projects.create({ userId, title: "F" });
      // The child inherits /tmp/ws unless it gets a directory of its own, so
      // there is nothing ambiguous about hanging it here.
      expect(projects.move(folder.id, ws.id, userId)?.parentId).toBe(ws.id);
      expect(projects.effectiveRootPath(folder.id, userId)).toBe("/tmp/ws");
    });

    it("resolves an instruction chain root-first", () => {
      const root = projects.create({ userId, title: "Root", instructions: "always german" });
      const leaf = projects.create({ userId, title: "Leaf", parentId: root.id, instructions: "be brief" });
      const chain = projects.resolveInstructionChain(leaf.id, userId)!;
      expect(chain).toContain("always german");
      expect(chain).toContain("be brief");
      expect(chain.indexOf("always german")).toBeLessThan(chain.indexOf("be brief"));
    });

    it("gives a workspace the context of the folder it sits in", () => {
      // The point of "Work" / "Private" folders: a real project with a path on
      // disk is categorised under one and picks up its context.
      const folder = projects.create({ userId, title: "Private", instructions: "casual tone" });
      const ws = projects.create({ userId, rootPath: "/tmp/side-project", title: "Side project" });
      projects.move(ws.id, folder.id, userId);

      const chain = projects.resolveInstructionChain(ws.id, userId)!;
      expect(chain).toContain("casual tone");
      // Categorising must not disturb the workspace's own identity.
      expect(projects.getById(ws.id, userId)?.rootPath).toBe("/tmp/side-project");
      expect(projects.getById(ws.id, userId)?.kind).toBe("workspace");
    });

    it("layers nested folder context above a workspace", () => {
      const outer = projects.create({ userId, title: "Private", instructions: "casual tone" });
      const inner = projects.create({ userId, title: "OSS", parentId: outer.id, instructions: "answer in english" });
      const ws = projects.create({ userId, rootPath: "/tmp/oss", title: "Lib" });
      projects.move(ws.id, inner.id, userId);

      const chain = projects.resolveInstructionChain(ws.id, userId)!;
      expect(chain.indexOf("casual tone")).toBeLessThan(chain.indexOf("answer in english"));
    });

    it("returns null when no folder in the chain sets instructions", () => {
      const root = projects.create({ userId, title: "Root" });
      const leaf = projects.create({ userId, title: "Leaf", parentId: root.id });
      expect(projects.resolveInstructionChain(leaf.id, userId)).toBeNull();
    });

    it("archives descendants along with the folder", () => {
      const root = projects.create({ userId, title: "Root" });
      const mid = projects.create({ userId, title: "Mid", parentId: root.id });
      const leaf = projects.create({ userId, rootPath: "/tmp/leaf" });
      projects.move(leaf.id, mid.id, userId);

      projects.archive(root.id, userId);

      expect(projects.getById(mid.id, userId)?.status).toBe("archived");
      expect(projects.getById(leaf.id, userId)?.status).toBe("archived");
    });

    it("counts chats in a subtree before archiving", () => {
      const root = projects.create({ userId, title: "Root" });
      const child = projects.create({ userId, title: "Child", parentId: root.id });
      sessions.create({ userId, projectId: root.id, name: "one" });
      sessions.create({ userId, projectId: child.id, name: "two" });
      expect(projects.countSessionsInSubtree(root.id, userId)).toBe(2);
    });

    it("keeps a paged list connected by pulling in missing ancestors", () => {
      const root = projects.create({ userId, title: "Root" });
      const child = projects.create({ userId, title: "Child", parentId: root.id });
      // Make the child the most recent so a limit of 1 would otherwise cut the
      // parent away and strand the child at the tree root.
      projects.touch(child.id);
      const { projects: page } = projects.listWithSessions(userId, "active", 1);
      expect(page.map((p) => p.id).sort()).toEqual([root.id, child.id].sort());
    });
  });
});
