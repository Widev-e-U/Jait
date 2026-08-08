import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { GitService } from "./git.js";
import { RepositoryService } from "./repositories.js";
import { getProjectRepositoryId, ProjectService } from "./projects.js";
import {
  assignRepositoryToProject,
  ProjectRepositoryAssignmentError,
  shouldAutoClaimRepositoryForNode,
} from "./project-repositories.js";

const tempRoots: string[] = [];

function makeTempRoot(withGit: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "jait-project-repo-"));
  tempRoots.push(root);
  if (withGit) mkdirSync(join(root, ".git"));
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("project repository assignment", () => {
  it("creates a repository for a git project and skips repeated assignment", async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    try {
      const projectService = new ProjectService(opened.db);
      const repoService = new RepositoryService(opened.db);
      const gitService = new GitService();
      const rootPath = makeTempRoot(true);
      const project = projectService.create({
        userId: "user-1",
        title: "Repo project",
        rootPath,
      });

      const first = await assignRepositoryToProject({
        projectService,
        repoService,
        gitService,
        projectId: project.id,
        userId: "user-1",
      });

      expect(first.assigned).toBe(true);
      expect(first.created).toBe(true);
      expect(first.repo.localPath).toBe(rootPath);
      expect(getProjectRepositoryId(first.project)).toBe(first.repo.id);
      expect(repoService.list("user-1")).toHaveLength(1);

      const second = await assignRepositoryToProject({
        projectService,
        repoService,
        gitService,
        projectId: project.id,
        userId: "user-1",
      });

      expect(second.skipped).toBe(true);
      expect(second.repo.id).toBe(first.repo.id);
      expect(repoService.list("user-1")).toHaveLength(1);
    } finally {
      opened.sqlite.close();
    }
  });

  it("repairs an assigned gateway repository that was stale-claimed by a remote node", async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    try {
      const projectService = new ProjectService(opened.db);
      const repoService = new RepositoryService(opened.db);
      const gitService = new GitService();
      const rootPath = makeTempRoot(true);
      const project = projectService.create({
        userId: "user-1",
        title: "Gateway project",
        rootPath,
        nodeId: "gateway",
      });
      const staleRepo = repoService.create({
        userId: "user-1",
        name: "Gateway project",
        localPath: rootPath,
        deviceId: "base-node",
      });
      projectService.assignRepository(project.id, staleRepo.id, "user-1");

      const result = await assignRepositoryToProject({
        projectService,
        repoService,
        gitService,
        projectId: project.id,
        userId: "user-1",
      });

      expect(result.repo.deviceId).toBeNull();
      expect(repoService.getById(staleRepo.id)?.deviceId).toBeNull();
    } finally {
      opened.sqlite.close();
    }
  });

  it("does not let a remote node claim a repository that exists on the gateway", () => {
    const rootPath = makeTempRoot(true);

    expect(shouldAutoClaimRepositoryForNode(rootPath, "linux")).toBe(false);
    expect(shouldAutoClaimRepositoryForNode(join(rootPath, "missing"), "linux")).toBe(true);
  });

  it("rejects auto-assignment for a project without .git metadata", async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    try {
      const projectService = new ProjectService(opened.db);
      const repoService = new RepositoryService(opened.db);
      const gitService = new GitService();
      const rootPath = makeTempRoot(false);
      const project = projectService.create({
        userId: "user-1",
        title: "Not a repo",
        rootPath,
      });

      await expect(assignRepositoryToProject({
        projectService,
        repoService,
        gitService,
        projectId: project.id,
        userId: "user-1",
      })).rejects.toMatchObject({
        code: "PROJECT_NOT_GIT",
      } satisfies Partial<ProjectRepositoryAssignmentError>);
    } finally {
      opened.sqlite.close();
    }
  });
});
