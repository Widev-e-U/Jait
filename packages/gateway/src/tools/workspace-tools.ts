import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import { GitService } from "../services/git.js";
import type { RepositoryService } from "../services/repositories.js";
import type { WorkspaceService } from "../services/workspaces.js";
import {
  assignRepositoryToWorkspace,
  WorkspaceRepositoryAssignmentError,
} from "../services/workspace-repositories.js";
import type { WsControlPlane } from "../ws.js";

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createWorkspaceAssignRepositoryTool(deps: {
  workspaceService: WorkspaceService;
  repoService: RepositoryService;
  gitService?: GitService;
  ws?: WsControlPlane;
}): ToolDefinition {
  const gitService = deps.gitService ?? new GitService();
  return {
    name: "workspace.assign_repository",
    description:
      "Assign a repository to a workspace. If repoId is omitted, detects or creates a repository from the workspace root when it contains .git.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        workspaceId: {
          type: "string",
          description: "Workspace ID to update. If omitted, workspaceRoot or the current tool context workspace is used.",
        },
        workspaceRoot: {
          type: "string",
          description: "Workspace folder path to resolve or create when workspaceId is omitted.",
        },
        repoId: {
          type: "string",
          description: "Existing repository ID to assign. Omit to auto-detect/create from the workspace folder.",
        },
      },
    },
    execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const body = input && typeof input === "object" && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      let workspaceId = readString(body, "workspaceId");
      const repoId = readString(body, "repoId");
      let createdWorkspace = false;

      if (!workspaceId) {
        const workspaceRoot = readString(body, "workspaceRoot") ?? context.workspaceRoot?.trim();
        if (!workspaceRoot) {
          return {
            ok: false,
            message: "workspaceId or workspaceRoot is required.",
          };
        }
        const workspace = deps.workspaceService.getOrCreateForRoot({
          userId: context.userId,
          rootPath: workspaceRoot,
          nodeId: "gateway",
        });
        workspaceId = workspace.id;
        createdWorkspace = true;
      }

      try {
        const assignment = await assignRepositoryToWorkspace({
          workspaceService: deps.workspaceService,
          repoService: deps.repoService,
          gitService,
          workspaceId,
          userId: context.userId,
          repoId,
          ws: deps.ws,
        });
        return {
          ok: true,
          message: assignment.skipped
            ? `Workspace already uses repository ${assignment.repo.name}.`
            : `Assigned repository ${assignment.repo.name} to workspace ${assignment.workspace.title ?? assignment.workspace.id}.`,
          data: {
            ...assignment,
            createdWorkspace,
          },
        };
      } catch (err) {
        if (err instanceof WorkspaceRepositoryAssignmentError) {
          return {
            ok: false,
            message: err.message,
            data: { code: err.code },
          };
        }
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Failed to assign repository to workspace.",
        };
      }
    },
  };
}
