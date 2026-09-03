import { existsSync } from "node:fs";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import { GitService } from "../services/git.js";
import type { RepositoryService } from "../services/repositories.js";
import { getProjectRepositoryId, parseProjectMetadata, type ProjectService } from "../services/projects.js";
import {
  assignRepositoryToProject,
  ProjectRepositoryAssignmentError,
} from "../services/project-repositories.js";
import type { WsControlPlane } from "../ws.js";
import type { WsEventType } from "@jait/shared/types";

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createProjectCreateTool(deps: {
  projectService: ProjectService;
  repoService: RepositoryService;
  gitService?: GitService;
  ws?: WsControlPlane;
}): ToolDefinition {
  const gitService = deps.gitService ?? new GitService();
  return {
    name: "project.create",
    description:
      "Create a Jait project, or return the existing one for the same folder. When projectRoot points at a git working tree, a repository is detected/created and assigned to the project.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Display name for the project. Defaults to the project folder name.",
        },
        projectRoot: {
          type: "string",
          description:
            "Absolute path to the project folder. If it contains a .git repo it is detected/created and assigned.",
        },
        assignRepository: {
          type: "boolean",
          description: "Assign a repository detected at projectRoot. Defaults to true.",
        },
      },
    },
    execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const body = input && typeof input === "object" && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      const title = readString(body, "title");
      const projectRoot = readString(body, "projectRoot") ?? context.projectRoot?.trim();
      const assignRequested = typeof body["assignRepository"] === "boolean"
        ? (body["assignRepository"] as boolean)
        : true;

      const project = deps.projectService.getOrCreateForRoot({
        userId: context.userId,
        title,
        rootPath: projectRoot ?? null,
        nodeId: "gateway",
      });

      // Honour an explicit title even when the project already existed.
      if (title && project.title !== title) {
        deps.projectService.update(project.id, { title }, context.userId);
      }

      let repository: unknown;
      let repoNote: string | undefined;
      if (assignRequested && projectRoot) {
        try {
          const assignment = await assignRepositoryToProject({
            projectService: deps.projectService,
            repoService: deps.repoService,
            gitService,
            projectId: project.id,
            userId: context.userId,
            ws: deps.ws,
          });
          repository = assignment.repo;
        } catch (err) {
          // A missing git repo is not fatal — the project is still created.
          repoNote = err instanceof ProjectRepositoryAssignmentError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to assign repository.";
        }
      }

      const fresh = deps.projectService.getById(project.id, context.userId) ?? project;
      if (deps.ws && context.userId) {
        deps.ws.broadcastToUser(context.userId, {
          type: "project.created" as WsEventType,
          sessionId: "",
          timestamp: new Date().toISOString(),
          payload: { project: fresh },
        });
      }
      const repoName = repository && typeof repository === "object" && "name" in repository
        ? String((repository as { name: unknown }).name)
        : undefined;
      return {
        ok: true,
        message: `Created project "${fresh.title}" (${fresh.id})`
          + (repoName ? ` with repository ${repoName}.` : repoNote ? ` (no repository attached: ${repoNote}).` : "."),
        data: { project: fresh, repository, repoNote },
      };
    },
  };
}

export function createProjectAssignRepositoryTool(deps: {
  projectService: ProjectService;
  repoService: RepositoryService;
  gitService?: GitService;
  ws?: WsControlPlane;
}): ToolDefinition {
  const gitService = deps.gitService ?? new GitService();
  return {
    name: "project.assign_repository",
    description:
      "Assign a repository to a project. If repoId is omitted, detects or creates a repository from the project root when it contains .git.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project ID to update. If omitted, projectRoot or the current tool context project is used.",
        },
        projectRoot: {
          type: "string",
          description: "Project folder path to resolve or create when projectId is omitted.",
        },
        repoId: {
          type: "string",
          description: "Existing repository ID to assign. Omit to auto-detect/create from the project folder.",
        },
      },
    },
    execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const body = input && typeof input === "object" && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      let projectId = readString(body, "projectId");
      const repoId = readString(body, "repoId");
      let createdProject = false;

      if (!projectId) {
        const projectRoot = readString(body, "projectRoot") ?? context.projectRoot?.trim();
        if (!projectRoot) {
          return {
            ok: false,
            message: "projectId or projectRoot is required.",
          };
        }
        const project = deps.projectService.getOrCreateForRoot({
          userId: context.userId,
          rootPath: projectRoot,
          nodeId: "gateway",
        });
        projectId = project.id;
        createdProject = true;
      }

      try {
        const assignment = await assignRepositoryToProject({
          projectService: deps.projectService,
          repoService: deps.repoService,
          gitService,
          projectId: projectId,
          userId: context.userId,
          repoId,
          ws: deps.ws,
        });
        return {
          ok: true,
          message: assignment.skipped
            ? `Project already uses repository ${assignment.repo.name}.`
            : `Assigned repository ${assignment.repo.name} to project ${assignment.project.title ?? assignment.project.id}.`,
          data: {
            ...assignment,
            createdProject,
          },
        };
      } catch (err) {
        if (err instanceof ProjectRepositoryAssignmentError) {
          return {
            ok: false,
            message: err.message,
            data: { code: err.code },
          };
        }
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Failed to assign repository to project.",
        };
      }
    },
  };
}

export function createProjectMoveTool(deps: {
  projectService: ProjectService;
  repoService: RepositoryService;
  gitService?: GitService;
  ws?: WsControlPlane;
}): ToolDefinition {
  const gitService = deps.gitService ?? new GitService();
  return {
    name: "project.move",
    description:
      "Retarget a project to a different node and/or folder path. This only repoints project metadata — it does NOT transfer files. "
      + "The destination folder must already exist on the destination node (e.g. via git clone, rsync, or an SSH copy run through a terminal tool) "
      + "before calling this; the tool verifies the path exists and refuses to move if it does not.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    risk: "medium",
    defaultConsentLevel: "once",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project ID to move. If omitted, resolved from the current tool context's project folder.",
        },
        nodeId: {
          type: "string",
          description: "Destination node ID (e.g. 'gateway' or a connected remote node ID).",
        },
        rootPath: {
          type: "string",
          description: "Destination absolute folder path on the destination node. Defaults to the project's current rootPath — use this when that exact path already exists on both nodes.",
        },
      },
      required: ["nodeId"],
    },
    execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const body = input && typeof input === "object" && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      const nodeId = readString(body, "nodeId");
      if (!nodeId) {
        return { ok: false, message: "nodeId is required." };
      }

      let projectId = readString(body, "projectId");
      if (!projectId) {
        const projectRoot = context.projectRoot?.trim();
        if (!projectRoot) {
          return { ok: false, message: "projectId is required (no project folder in the current context)." };
        }
        const project = deps.projectService.getOrCreateForRoot({
          userId: context.userId,
          rootPath: projectRoot,
          nodeId: "gateway",
        });
        projectId = project.id;
      }

      const project = deps.projectService.getById(projectId, context.userId);
      if (!project) {
        return { ok: false, message: `Project ${projectId} not found.` };
      }

      const targetRootPath = readString(body, "rootPath") ?? project.rootPath?.trim();
      if (!targetRootPath) {
        return { ok: false, message: "rootPath is required — the project has no existing folder path to reuse on the destination node." };
      }

      if (project.nodeId === nodeId && project.rootPath === targetRootPath) {
        return {
          ok: true,
          message: `Project "${project.title ?? project.id}" is already on node "${nodeId}" at ${targetRootPath}.`,
          data: { project },
        };
      }

      let exists: boolean;
      try {
        if (nodeId === "gateway") {
          exists = existsSync(targetRootPath);
        } else if (deps.ws) {
          exists = await deps.ws.proxyFsOp<boolean>(nodeId, "exists", { path: targetRootPath });
        } else {
          return { ok: false, message: `Cannot reach node "${nodeId}" to verify the destination path — no WebSocket control plane available.` };
        }
      } catch (err) {
        return { ok: false, message: `Could not verify ${targetRootPath} on node "${nodeId}": ${err instanceof Error ? err.message : String(err)}` };
      }
      if (!exists) {
        return {
          ok: false,
          message: `${targetRootPath} does not exist on node "${nodeId}". This tool retargets a project, it does not copy files — `
            + "get the project's files onto the destination node first (e.g. git clone or rsync via a terminal/ssh tool), then retry.",
        };
      }

      // The project's repositoryId metadata (if any) points at the old
      // location; clear it so re-assignment below detects/creates fresh
      // instead of short-circuiting on the now-stale repo record.
      const previousRepositoryId = getProjectRepositoryId(project);
      if (previousRepositoryId) {
        const metadata = parseProjectMetadata(project);
        delete metadata["repositoryId"];
        delete metadata["repoId"];
        deps.projectService.update(project.id, { metadata }, context.userId);
      }

      deps.projectService.update(project.id, { rootPath: targetRootPath, nodeId }, context.userId);

      let repoNote: string | undefined;
      try {
        await assignRepositoryToProject({
          projectService: deps.projectService,
          repoService: deps.repoService,
          gitService,
          projectId: project.id,
          userId: context.userId,
          ws: deps.ws,
        });
      } catch (err) {
        repoNote = err instanceof ProjectRepositoryAssignmentError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to re-link repository.";
      }

      const moved = deps.projectService.getById(project.id, context.userId) ?? project;
      if (deps.ws && context.userId) {
        deps.ws.broadcastToUser(context.userId, {
          type: "project.updated" as WsEventType,
          sessionId: "",
          timestamp: new Date().toISOString(),
          payload: { project: moved },
        });
      }

      return {
        ok: true,
        message: `Moved project "${moved.title ?? moved.id}" to node "${nodeId}" at ${targetRootPath}.`
          + (repoNote ? ` (repository not re-linked: ${repoNote})` : ""),
        data: { project: moved },
      };
    },
  };
}
