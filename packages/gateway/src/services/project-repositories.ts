import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { WsEventType } from "@jait/shared";
import type { GitService } from "./git.js";
import type { RepoRow, RepositoryService } from "./repositories.js";
import { getProjectRepositoryId, type ProjectService } from "./projects.js";
import type { WsControlPlane } from "../ws.js";

type ProjectRow = ReturnType<ProjectService["getById"]>;

export interface ProjectRepositoryAssignment {
  project: NonNullable<ProjectRow>;
  repo: RepoRow;
  assigned: boolean;
  skipped: boolean;
  created: boolean;
}

export class ProjectRepositoryAssignmentError extends Error {
  constructor(readonly code: "PROJECT_NOT_FOUND" | "REPOSITORY_NOT_FOUND" | "PROJECT_HAS_NO_ROOT" | "PROJECT_NOT_GIT", message: string) {
    super(message);
  }
}

function folderName(path: string): string {
  return basename(path.replace(/[\\/]+$/, "")) || path;
}

export function projectHasGitMetadata(rootPath: string | null | undefined): boolean {
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

export async function assignRepositoryToProject(params: {
  projectService: ProjectService;
  repoService: RepositoryService;
  gitService: GitService;
  projectId: string;
  userId?: string;
  repoId?: string | null;
  ws?: WsControlPlane;
}): Promise<ProjectRepositoryAssignment> {
  const project = params.projectService.getById(params.projectId, params.userId);
  if (!project) {
    throw new ProjectRepositoryAssignmentError("PROJECT_NOT_FOUND", "Project not found.");
  }

  const requestedRepoId = params.repoId?.trim();
  if (requestedRepoId) {
    const repo = params.repoService.getById(requestedRepoId);
    if (!repo || (params.userId && repo.userId !== params.userId)) {
      throw new ProjectRepositoryAssignmentError("REPOSITORY_NOT_FOUND", "Repository not found.");
    }
    const existingRepositoryId = getProjectRepositoryId(project);
    if (existingRepositoryId === repo.id) {
      return { project, repo, assigned: false, skipped: true, created: false };
    }
    const updatedProject = params.projectService.assignRepository(project.id, repo.id, params.userId);
    broadcastRepoEvent(params.ws, "updated", repo);
    return { project: updatedProject ?? project, repo, assigned: true, skipped: false, created: false };
  }

  const rootPath = project.rootPath?.trim();
  if (!rootPath) {
    throw new ProjectRepositoryAssignmentError("PROJECT_HAS_NO_ROOT", "Project has no folder path.");
  }

  const existingRepositoryId = getProjectRepositoryId(project);
  if (existingRepositoryId) {
    const existingRepo = params.repoService.getById(existingRepositoryId);
    if (existingRepo && (!params.userId || existingRepo.userId === params.userId)) {
      return { project, repo: existingRepo, assigned: false, skipped: true, created: false };
    }
  }

  if (!projectHasGitMetadata(rootPath)) {
    throw new ProjectRepositoryAssignmentError("PROJECT_NOT_GIT", "Project folder does not contain .git.");
  }

  let repo = params.repoService.findByPath(rootPath, project.userId ?? params.userId);
  let created = false;
  if (!repo) {
    const details = await detectRepoDetails(rootPath, params.gitService);
    repo = params.repoService.create({
      userId: project.userId ?? params.userId,
      deviceId: project.nodeId && project.nodeId !== "gateway" ? project.nodeId : undefined,
      name: project.title?.trim() || folderName(rootPath),
      defaultBranch: details.defaultBranch,
      localPath: rootPath,
      githubUrl: details.remoteUrl,
    });
    created = true;
    broadcastRepoEvent(params.ws, "created", repo);
  }

  const updatedProject = params.projectService.assignRepository(project.id, repo.id, params.userId);
  if (!created) broadcastRepoEvent(params.ws, "updated", repo);
  return { project: updatedProject ?? project, repo, assigned: true, skipped: false, created };
}

export async function autoAssignProjectRepositories(params: {
  projectService: ProjectService;
  repoService: RepositoryService;
  gitService: GitService;
  userId?: string;
  ws?: WsControlPlane;
}): Promise<ProjectRepositoryAssignment[]> {
  const assignments: ProjectRepositoryAssignment[] = [];
  for (const project of params.projectService.list("active", params.userId)) {
    const userId = project.userId ?? params.userId;
    const existingRepositoryId = getProjectRepositoryId(project);
    if (existingRepositoryId) {
      const existingRepo = params.repoService.getById(existingRepositoryId);
      if (existingRepo && (!userId || existingRepo.userId === userId)) continue;
    }
    if (!projectHasGitMetadata(project.rootPath)) continue;
    try {
      assignments.push(await assignRepositoryToProject({
        projectService: params.projectService,
        repoService: params.repoService,
        gitService: params.gitService,
        projectId: project.id,
        userId,
        ws: params.ws,
      }));
    } catch {
      // Startup/list auto-assignment must never block normal project loading.
    }
  }
  return assignments;
}
