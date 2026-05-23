import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import { GitService } from "../services/git.js";
import type { RepositoryService } from "../services/repositories.js";
import type { ProjectService } from "../services/projects.js";
import {
  assignRepositoryToProject,
  ProjectRepositoryAssignmentError,
} from "../services/project-repositories.js";
import type { WsControlPlane } from "../ws.js";

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
