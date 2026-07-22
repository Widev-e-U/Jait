import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import type { WsControlPlane } from "../ws.js";
import { GitService } from "./git.js";
import { RepositoryService } from "./repositories.js";
import { getProjectRepositoryId, ProjectService } from "./projects.js";
import {
  assignRepositoryToProject,
  ProjectRepositoryAssignmentError,
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

  it("detects and assigns a repository on the project's remote Windows node", async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    try {
      const projectService = new ProjectService(opened.db);
      const repoService = new RepositoryService(opened.db);
      const gitService = new GitService();
      const rootPath = "E:\\TizenAnilabStream";
      const project = projectService.create({
        userId: "user-1",
        title: "TizenAnilabStream",
        rootPath,
        nodeId: "windows-node",
      });
      const proxyFsOp = vi.fn(async (_nodeId: string, op: string, params: Record<string, unknown>) => {
        if (op === "stat") return { isDirectory: true };
        if (op === "git") {
          const args = String(params["args"] ?? "");
          if (args === "rev-parse --abbrev-ref HEAD") return { stdout: "master\n" };
          if (args === "remote") return { stdout: "origin\n" };
          if (args === "remote get-url origin") return { stdout: "https://github.com/JakobWl/TizenAnilabStream.git\n" };
          if (args === "symbolic-ref refs/remotes/origin/HEAD") return { stdout: "refs/remotes/origin/master\n" };
        }
        throw new Error("Unexpected remote operation: " + op);
      });
      const ws = {
        findNodeByDeviceId: vi.fn(() => ({ id: "windows-node", isGateway: false })),
        proxyFsOp,
        broadcastAll: vi.fn(),
      } as unknown as WsControlPlane;

      const assignment = await assignRepositoryToProject({
        projectService,
        repoService,
        gitService,
        projectId: project.id,
        userId: "user-1",
        ws,
      });

      expect(assignment.created).toBe(true);
      expect(assignment.repo.localPath).toBe(rootPath);
      expect(assignment.repo.deviceId).toBe("windows-node");
      expect(assignment.repo.defaultBranch).toBe("master");
      expect(proxyFsOp).toHaveBeenCalledWith(
        "windows-node",
        "stat",
        { path: "E:\\TizenAnilabStream\\.git" },
      );
    } finally {
      opened.sqlite.close();
    }
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
