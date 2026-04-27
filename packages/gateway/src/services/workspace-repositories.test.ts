import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { GitService } from "./git.js";
import { RepositoryService } from "./repositories.js";
import { getWorkspaceRepositoryId, WorkspaceService } from "./workspaces.js";
import {
  assignRepositoryToWorkspace,
  WorkspaceRepositoryAssignmentError,
} from "./workspace-repositories.js";

const tempRoots: string[] = [];

function makeTempRoot(withGit: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "jait-workspace-repo-"));
  tempRoots.push(root);
  if (withGit) mkdirSync(join(root, ".git"));
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("workspace repository assignment", () => {
  it("creates a repository for a git workspace and skips repeated assignment", async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    try {
      const workspaceService = new WorkspaceService(opened.db);
      const repoService = new RepositoryService(opened.db);
      const gitService = new GitService();
      const rootPath = makeTempRoot(true);
      const workspace = workspaceService.create({
        userId: "user-1",
        title: "Repo workspace",
        rootPath,
      });

      const first = await assignRepositoryToWorkspace({
        workspaceService,
        repoService,
        gitService,
        workspaceId: workspace.id,
        userId: "user-1",
      });

      expect(first.assigned).toBe(true);
      expect(first.created).toBe(true);
      expect(first.repo.localPath).toBe(rootPath);
      expect(getWorkspaceRepositoryId(first.workspace)).toBe(first.repo.id);
      expect(repoService.list("user-1")).toHaveLength(1);

      const second = await assignRepositoryToWorkspace({
        workspaceService,
        repoService,
        gitService,
        workspaceId: workspace.id,
        userId: "user-1",
      });

      expect(second.skipped).toBe(true);
      expect(second.repo.id).toBe(first.repo.id);
      expect(repoService.list("user-1")).toHaveLength(1);
    } finally {
      opened.sqlite.close();
    }
  });

  it("rejects auto-assignment for a workspace without .git metadata", async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    try {
      const workspaceService = new WorkspaceService(opened.db);
      const repoService = new RepositoryService(opened.db);
      const gitService = new GitService();
      const rootPath = makeTempRoot(false);
      const workspace = workspaceService.create({
        userId: "user-1",
        title: "Not a repo",
        rootPath,
      });

      await expect(assignRepositoryToWorkspace({
        workspaceService,
        repoService,
        gitService,
        workspaceId: workspace.id,
        userId: "user-1",
      })).rejects.toMatchObject({
        code: "WORKSPACE_NOT_GIT",
      } satisfies Partial<WorkspaceRepositoryAssignmentError>);
    } finally {
      opened.sqlite.close();
    }
  });
});
