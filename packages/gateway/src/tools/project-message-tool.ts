import type { FastifyInstance } from "fastify";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import { createThreadControlTool, type ThreadControlToolDeps } from "./thread-tools.js";
import type { AppConfig } from "../config.js";
import { signAuthToken } from "../security/http-auth.js";
import type { ProjectService } from "../services/projects.js";
import type { SessionService } from "../services/sessions.js";
import type { UserService } from "../services/users.js";
import type { WsControlPlane } from "../ws.js";
import type { WsEventType } from "@jait/shared/types";

/** Drizzle-inferred session row (sessions.ts doesn't export a named row type). */
type SessionRow = NonNullable<ReturnType<SessionService["getById"]>>;

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
  userService?: UserService;
  config?: AppConfig;
  /** Late-bound: set once the HTTP app exists (the registry is built first). */
  getApp?: () => FastifyInstance | undefined;
  ws?: WsControlPlane;
}

/**
 * Lets an agent hand work off to (or notify) the agent running in a
 * *different* project: resolves/creates the target project, then starts an
 * agent turn there. When the tool is called from a live chat, THAT chat is
 * reused: it is (re-)assigned to the project and the message goes through the
 * normal chat pipeline (queued if the chat is already streaming). Only when
 * there is no current chat (background/cron hand-off) does the tool open a
 * NEW chat in the project.
 */
export function createProjectMessageTool(deps: ProjectMessageToolDeps): ToolDefinition {
  const threadControlTool = createThreadControlTool(deps);

  const broadcast = (userId: string | undefined, type: string, payload: Record<string, unknown>): void => {
    if (!userId || !deps.ws) return;
    deps.ws.broadcastToUser(userId, {
      type: type as WsEventType,
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload,
    });
  };

  const getHttpApp = (): FastifyInstance | undefined => {
    if (!deps.getApp) return undefined;
    try {
      return deps.getApp();
    } catch {
      return undefined;
    }
  };

  /**
   * Assign a chat to the project. Preferred: the HTTP route (mirrors UI drag &
   * drop, including audit + chat.moved broadcast). Without an HTTP app (unit
   * tests / bare gateway) the same move is applied directly via the session
   * service — `viaRoute` tells the caller whether IT must broadcast.
   */
  const assignChatToProject = async (
    sessionId: string,
    userId: string,
    projectId: string,
  ): Promise<{ moved: boolean; viaRoute: boolean }> => {
    const app = getHttpApp();
    const { userService, config } = deps;
    if (app && userService && config) {
      const user = userService.findById(userId);
      if (user) {
        try {
          const token = await signAuthToken(
            { id: user.id, username: user.username },
            config.jwtSecret,
          );
          const response = await app.inject({
            method: "POST",
            url: `/api/sessions/${sessionId}/move`,
            headers: { authorization: `Bearer ${token}` },
            payload: { projectId },
          });
          if (response.statusCode === 200) return { moved: true, viaRoute: true };
          console.warn(
            `[project.message] chat assignment failed (HTTP ${response.statusCode}); falling back to direct move`,
          );
        } catch (error) {
          console.warn(
            "[project.message] chat assignment failed; falling back to direct move:",
            error,
          );
        }
      }
    }
    try {
      const project = deps.projectService.getById(projectId, userId);
      deps.sessionService.moveToProject(sessionId, projectId, project?.rootPath ?? null, userId);
      deps.projectService.touch(projectId);
      return { moved: true, viaRoute: false };
    } catch (error) {
      console.warn("[project.message] direct chat assignment failed:", error);
      return { moved: false, viaRoute: false };
    }
  };

  return {
    name: "project.message",
    displayName: "Message Another Project",
    description:
      "Start a chat in a DIFFERENT Jait project and post a message to it, kicking off a new agent turn there. " +
      "Use this to hand off work or notify the agent running in another project — e.g. \"go tell the agent in " +
      "project X that the deploy failed.\" Resolves the target project by projectId or projectRoot (creating it " +
      "if it doesn't exist yet). When called from a live chat, THAT chat is used: it is assigned to the project " +
      "and the turn runs in it (queued while the current turn is still streaming) — no new chat is created. " +
      "Only background callers (cron) create a new chat in the project.",
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
          description:
            "Message to post into the chat in the target project — starts an agent turn there.",
        },
        title: {
          type: "string",
          description:
            "Title for a newly created chat. Ignored when an existing chat is reused (that chat keeps its name).",
        },
        providerId: {
          type: "string",
          description:
            "Agent provider for a newly created chat (e.g. 'codex', 'claude-code', 'jait'). Only used when a new chat is created.",
        },
        model: {
          type: "string",
          description: "Model override for a newly created chat. Only used when a new chat is created.",
        },
        runtimeMode: {
          type: "string",
          enum: ["full-access", "supervised"],
          description: "Runtime mode for a newly created chat. Only used when a new chat is created.",
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

      // A tool call always runs in a user context — narrow it once so the
      // session service / auth calls below get a definite string.
      const userId = context.userId?.trim();
      if (!userId) {
        return { ok: false, message: "project.message requires a user context (userId)." };
      }

      const projectId = readString(body, "projectId");
      const projectRoot = readString(body, "projectRoot");
      if (!projectId && !projectRoot) {
        return { ok: false, message: "projectId or projectRoot is required." };
      }

      const project = projectId
        ? deps.projectService.getById(projectId, userId)
        : deps.projectService.getOrCreateForRoot({
            userId,
            rootPath: projectRoot ?? null,
            nodeId: "gateway",
          });
      if (!project) {
        return { ok: false, message: `Project ${projectId} not found.` };
      }

      const title = readString(body, "title") ?? deriveTitleFromMessage(message);
      const currentSessionId = context.sessionId?.trim() ?? "";
      const currentSession = currentSessionId
        ? deps.sessionService.getById(currentSessionId, userId)
        : undefined;

      if (currentSession) {
        // Preferred path: THIS chat is the project's chat — assign it and run
        // the turn through the normal chat pipeline (no new chat is created).
        const beforeProjectId = currentSession.projectId ?? null;
        let session: SessionRow = currentSession;
        let assigned = beforeProjectId === project.id;
        if (!assigned) {
          const assignResult = await assignChatToProject(currentSession.id, userId, project.id);
          assigned = assignResult.moved;
          if (assigned) {
            const moved = deps.sessionService.getById(currentSession.id, userId);
            if (moved) {
              session = moved;
              // The HTTP route already broadcasts chat.moved itself — only the
              // direct (service-level) move needs a broadcast from here.
              if (!assignResult.viaRoute) broadcast(context.userId, "chat.moved", {
                fromProjectId: beforeProjectId,
                toProjectId: project.id,
                projectId: project.id,
                sessionId: session.id,
                session,
              });
            }
          }
        }

        const app = getHttpApp();
        const { userService, config } = deps;
        if (app && userService && config) {
          const user = userService.findById(userId);
          if (user) {
            try {
              const token = await signAuthToken(
                { id: user.id, username: user.username },
                config.jwtSecret,
              );
              const response = await app.inject({
                method: "POST",
                url: "/api/chat",
                headers: { authorization: `Bearer ${token}` },
                payload: { sessionId: session.id, message },
              });
              if (response.statusCode === 200 || response.statusCode === 202) {
                const queued = response.statusCode === 202;
                const suffix = queued
                  ? " — the turn starts as soon as the current turn finishes."
                  : "";
                const name = session.name ?? session.id;
                return {
                  ok: true,
                  message: `Assigned chat "${name}" to project "${project.title ?? project.id}" and queued a message that starts the agent turn there.${suffix}`,
                  data: { project, session, assigned, queued },
                };
              }
              console.warn(
                `[project.message] /api/chat returned ${response.statusCode}; falling back to thread.control`,
              );
            } catch (error) {
              console.warn("[project.message] /api/chat failed; falling back:", error);
            }
          }
        }

        // Fallback: no HTTP app available (unit tests / cron without app) —
        // start the turn on this chat via thread.control instead.
        const threadContext: ToolContext = {
          ...context,
          sessionId: session.id,
          projectRoot: project.rootPath ?? context.projectRoot,
        };
        const result = await threadControlTool.execute(
          {
            action: "create",
            sessionId: session.id,
            message,
            workingDirectory: project.rootPath ?? undefined,
            start: true,
          },
          threadContext,
        );
        const resultData = result.data && typeof result.data === "object"
          ? result.data as Record<string, unknown>
          : {};
        const name = session.name ?? session.id;
        if (!result.ok) {
          return {
            ok: false,
            message: `Assigned chat "${name}" to project "${project.title ?? project.id}" but failed to start the turn: ${result.message}`,
            data: { project, session, assigned, ...resultData },
          };
        }
        return {
          ok: true,
          message: `Assigned chat "${name}" to project "${project.title ?? project.id}" and started an agent turn there.`,
          data: { project, session, assigned, ...resultData },
        };
      }

      // Background/cron path: no current chat to reuse — create one in the project.
      const session = deps.sessionService.create({
        userId,
        projectId: project.id,
        name: title,
        projectPath: project.rootPath ?? undefined,
      });
      deps.projectService.touch(project.id);

      if (deps.ws) {
        deps.ws.broadcastToUser(userId, {
          type: "project.created" as WsEventType,
          sessionId: "",
          timestamp: new Date().toISOString(),
          payload: { project },
        });
        deps.ws.broadcastToUser(userId, {
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
        message: `Created chat "${title}" in project "${project.title ?? project.id}" and started an agent turn there.`,
        data: { project, session, ...resultData },
      };
    },
  };
}
