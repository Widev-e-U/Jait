import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import { createThreadControlTool, type ThreadControlToolDeps } from "./thread-tools.js";
import type { ProjectService } from "../services/projects.js";
import type { SessionService } from "../services/sessions.js";
import type { WsControlPlane } from "../ws.js";
import type { WsEventType } from "@jait/shared/types";

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function deriveTitleFromMessage(message: string): string {
  const firstLine = message.split("\n")[0]?.trim() ?? message.trim();
  if (!firstLine) return "New chat";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

export interface ProjectMessageToolDeps extends ThreadControlToolDeps {
  projectService: ProjectService;
  sessionService: SessionService;
  ws?: WsControlPlane;
}

/**
 * Lets an agent hand work off to (or notify) the agent running in a
 * *different* project: resolves/creates the target project, opens a new
 * chat in it, and starts an agent turn there — reusing thread.control's
 * create+start flow instead of re-implementing provider bootstrapping.
 */
export function createProjectMessageTool(deps: ProjectMessageToolDeps): ToolDefinition {
  const threadControlTool = createThreadControlTool(deps);

  return {
    name: "project.message",
    displayName: "Message Another Project",
    description:
      "Start a chat in a DIFFERENT Jait project and post a message to it, kicking off a new agent turn there. " +
      "Use this to hand off work or notify the agent running in another project — e.g. \"go tell the agent in " +
      "project X that the deploy failed.\" Resolves the target project by projectId or projectRoot (creating it " +
      "if it doesn't exist yet), creates a new chat in it, and starts an agent turn with `message`.",
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
          description: "Target project ID. If omitted, projectRoot is used to resolve or create the project.",
        },
        projectRoot: {
          type: "string",
          description: "Absolute folder path of the target project. Used to resolve/create the project when projectId is omitted.",
        },
        message: {
          type: "string",
          description: "Message to post into the new chat — this text starts the agent's turn in the target project.",
        },
        title: {
          type: "string",
          description: "Title for the new chat. Defaults to a title derived from the message.",
        },
        providerId: {
          type: "string",
          description:
            "Agent provider to run in the target project (e.g. 'codex', 'claude-code', 'jait'). Defaults to the calling agent's own provider, or the target user's default.",
        },
        model: { type: "string", description: "Model override for the new chat's agent." },
        runtimeMode: {
          type: "string",
          enum: ["full-access", "supervised"],
          description: "Runtime mode for the new chat's agent. Defaults to full-access.",
        },
      },
      required: ["message"],
    },
    execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const body = input && typeof input === "object" && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      const message = readString(body, "message");
      if (!message) return { ok: false, message: "message is required." };

      const projectId = readString(body, "projectId");
      const projectRoot = readString(body, "projectRoot");
      if (!projectId && !projectRoot) {
        return { ok: false, message: "projectId or projectRoot is required." };
      }

      const project = projectId
        ? deps.projectService.getById(projectId, context.userId)
        : deps.projectService.getOrCreateForRoot({
            userId: context.userId,
            rootPath: projectRoot ?? null,
            nodeId: "gateway",
          });
      if (!project) {
        return { ok: false, message: `Project ${projectId} not found.` };
      }

      const title = readString(body, "title") ?? deriveTitleFromMessage(message);
      const session = deps.sessionService.create({
        userId: context.userId,
        projectId: project.id,
        name: title,
        projectPath: project.rootPath ?? undefined,
      });
      deps.projectService.touch(project.id);

      if (context.userId && deps.ws) {
        deps.ws.broadcastToUser(context.userId, {
          type: "chat.created" as WsEventType,
          sessionId: "",
          timestamp: new Date().toISOString(),
          payload: { projectId: project.id, session },
        });
      }

      const runtimeMode = body["runtimeMode"] === "supervised" || body["runtimeMode"] === "full-access"
        ? (body["runtimeMode"] as "supervised" | "full-access")
        : undefined;

      const threadContext: ToolContext = {
        ...context,
        sessionId: session.id,
        projectRoot: project.rootPath ?? context.projectRoot,
      };

      const result = await threadControlTool.execute(
        {
          action: "create",
          sessionId: session.id,
          title,
          message,
          workingDirectory: project.rootPath ?? undefined,
          providerId: readString(body, "providerId"),
          model: readString(body, "model"),
          runtimeMode,
          start: true,
        },
        threadContext,
      );

      const resultData = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};

      if (!result.ok) {
        return {
          ok: false,
          message: `Created chat "${title}" in project "${project.title ?? project.id}" but failed to start it: ${result.message}`,
          data: { project, session, ...resultData },
        };
      }

      return {
        ok: true,
        message: `Posted a message to a new chat in project "${project.title ?? project.id}".`,
        data: { project, session, ...resultData },
      };
    },
  };
}
