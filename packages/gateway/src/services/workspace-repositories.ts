import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { WsEventType } from "@jait/shared";
import type { GitService } from "./git.js";
import type { RepoRow, RepositoryService } from "./repositories.js";
import { getWorkspaceRepositoryId, type WorkspaceService } from "./workspaces.js";
import type { WsControlPlane } from "../ws.js";

type WorkspaceRow = ReturnType<WorkspaceService["getById"]>;

export interface WorkspaceRepositoryAssignment {
  workspace: NonNullable<WorkspaceRow>;
  repo: RepoRow;
  assigned: boolean;
  skipped: boolean;
  created: boolean;
}

export class WorkspaceRepositoryAssignmentError extends Error {
  constructor(readonly code: "WORKSPACE_NOT_FOUND" | "REPOSITORY_NOT_FOUND" | "WORKSPACE_HAS_NO_ROOT" | "WORKSPACE_NOT_GIT", message: string) {
    super(message);
  }
}

function folderName(path: string): string {
  return basename(path.replace(/[\\/]+$/, "")) || path;
}

export function workspaceHasGitMetadata(rootPath: string | null | undefined): boolean {
  const root = rootPath?.trim();
  if (!root) return false;
  const gitPath = join(root, ".git");
  try {
    if (!existsSync(gitPath)) return false;
    const stat = statSync(gitPath);
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

async function detectRepoDetails(rootPath: string, gitService: GitService): Promise<{ defaultBranch: string; remoteUrl?: string }> {
  let branch: string | undefined;
  let remoteUrl: string | null = null;
  try {
    const status = await gitService.status(rootPath);
    branch = status.branch ?? undefined;
    remoteUrl = status.remoteUrl;
  } catch {
    // Not every test fixture has a fully initialized git repo; fall back below.
  }
  try {
    const remoteName = await gitService.getPreferredRemote(rootPath, branch);
    if (remoteName) {
      remoteUrl = await gitService.getRemoteUrl(rootPath, remoteName);
    }
  } catch {
    // ignore
  }
  let defaultBranch = branch ?? "main";
  try {
    defaultBranch = await gitService.resolveDefaultBranch(rootPath, remoteUrl);
  } catch {
    // keep fallback
  }
  return {
    defaultBranch,
    ...(remoteUrl ? { remoteUrl } : {}),
  };
}

function broadcastRepoEvent(ws: WsControlPlane | undefined, event: "created" | "updated", repo: RepoRow): void {
  if (!ws) return;
  ws.broadcastAll({
    type: `repo.${event}` as WsEventType,
    sessionId: "",
    timestamp: new Date().toISOString(),
    payload: { repo },
  });
}

export async function assignRepositoryToWorkspace(params: {
  workspaceService: WorkspaceService;
  repoService: RepositoryService;
  gitService: GitService;
  workspaceId: string;
  userId?: string;
  repoId?: string | null;
  ws?: WsControlPlane;
}): Promise<WorkspaceRepositoryAssignment> {
  const workspace = params.workspaceService.getById(params.workspaceId, params.userId);
  if (!workspace) {
    throw new WorkspaceRepositoryAssignmentError("WORKSPACE_NOT_FOUND", "Workspace not found.");
  }

  const requestedRepoId = params.repoId?.trim();
  if (requestedRepoId) {
    const repo = params.repoService.getById(requestedRepoId);
    if (!repo || (params.userId && repo.userId !== params.userId)) {
      throw new WorkspaceRepositoryAssignmentError("REPOSITORY_NOT_FOUND", "Repository not found.");
    }
    const existingRepositoryId = getWorkspaceRepositoryId(workspace);
    if (existingRepositoryId === repo.id) {
      return { workspace, repo, assigned: false, skipped: true, created: false };
    }
    const updatedWorkspace = params.workspaceService.assignRepository(workspace.id, repo.id, params.userId);
    broadcastRepoEvent(params.ws, "updated", repo);
    return { workspace: updatedWorkspace ?? workspace, repo, assigned: true, skipped: false, created: false };
  }

  const rootPath = workspace.rootPath?.trim();
  if (!rootPath) {
    throw new WorkspaceRepositoryAssignmentError("WORKSPACE_HAS_NO_ROOT", "Workspace has no folder path.");
  }

  const existingRepositoryId = getWorkspaceRepositoryId(workspace);
  if (existingRepositoryId) {
    const existingRepo = params.repoService.getById(existingRepositoryId);
    if (existingRepo && (!params.userId || existingRepo.userId === params.userId)) {
      return { workspace, repo: existingRepo, assigned: false, skipped: true, created: false };
    }
  }

  if (!workspaceHasGitMetadata(rootPath)) {
    throw new WorkspaceRepositoryAssignmentError("WORKSPACE_NOT_GIT", "Workspace folder does not contain .git.");
  }

  let repo = params.repoService.findByPath(rootPath, workspace.userId ?? params.userId);
  let created = false;
  if (!repo) {
    const details = await detectRepoDetails(rootPath, params.gitService);
    repo = params.repoService.create({
      userId: workspace.userId ?? params.userId,
      deviceId: workspace.nodeId && workspace.nodeId !== "gateway" ? workspace.nodeId : undefined,
      name: workspace.title?.trim() || folderName(rootPath),
      defaultBranch: details.defaultBranch,
      localPath: rootPath,
      githubUrl: details.remoteUrl,
    });
    created = true;
    broadcastRepoEvent(params.ws, "created", repo);
  }

  const updatedWorkspace = params.workspaceService.assignRepository(workspace.id, repo.id, params.userId);
  if (!created) broadcastRepoEvent(params.ws, "updated", repo);
  return { workspace: updatedWorkspace ?? workspace, repo, assigned: true, skipped: false, created };
}

export async function autoAssignWorkspaceRepositories(params: {
  workspaceService: WorkspaceService;
  repoService: RepositoryService;
  gitService: GitService;
  userId?: string;
  ws?: WsControlPlane;
}): Promise<WorkspaceRepositoryAssignment[]> {
  const assignments: WorkspaceRepositoryAssignment[] = [];
  for (const workspace of params.workspaceService.list("active", params.userId)) {
    const userId = workspace.userId ?? params.userId;
    const existingRepositoryId = getWorkspaceRepositoryId(workspace);
    if (existingRepositoryId) {
      const existingRepo = params.repoService.getById(existingRepositoryId);
      if (existingRepo && (!userId || existingRepo.userId === userId)) continue;
    }
    if (!workspaceHasGitMetadata(workspace.rootPath)) continue;
    try {
      assignments.push(await assignRepositoryToWorkspace({
        workspaceService: params.workspaceService,
        repoService: params.repoService,
        gitService: params.gitService,
        workspaceId: workspace.id,
        userId,
        ws: params.ws,
      }));
    } catch {
      // Startup/list auto-assignment must never block normal workspace loading.
    }
  }
  return assignments;
}
