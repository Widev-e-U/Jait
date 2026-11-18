import { isAbsolute, win32 } from "node:path";
import type { Readable } from "node:stream";
import { signAuthToken } from "../security/http-auth.js";
import { resolveThreadSelectionDefaults } from "../services/thread-defaults.js";
import type { WsEventType } from "@jait/shared/types";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import type { ProjectMessageToolDeps } from "./project-message-tool.js";

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Wait for the chat route's persisted-turn or queued-message event. */
export function waitForChatAcceptance(stream: Readable, queued: boolean, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let buffer = "";
    let timer: ReturnType<typeof setTimeout>;
    const finish = (accepted: boolean) => {
      clearTimeout(timer);
      stream.off("data", onData); stream.off("end", onEnd); stream.off("error", onError);
      signal?.removeEventListener("abort", onAbort);
      stream.on("error", () => {}); stream.resume();
      resolve(accepted);
    };
    const onAbort = () => finish(false);
    const onEnd = () => finish(false);
    const onError = () => finish(false);
    const onData = (chunk: Buffer | string) => {
      buffer += String(chunk);
      if (buffer.length > 1_000_000) return finish(false);
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as { type?: unknown };
          if (event.type === (queued ? "queued" : "request")) return finish(true);
        } catch { /* Other SSE lines may not contain JSON. */ }
      }
    };
    timer = setTimeout(() => finish(false), 10_000);
    stream.on("data", onData); stream.once("end", onEnd); stream.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) return finish(false);
    stream.resume();
  });
}

/** Create an independent project conversation through the normal chat pipeline. */
export function createProjectChatTool(deps: ProjectMessageToolDeps): ToolDefinition {
  return {
    name: "project.chat.create",
    displayName: "Create Project Chat",
    page: "chat",
    description: "Create a NEW, separate chat in a Jait project and send the exact initial message to start its agent. Use this when asked to create a chat, ask an agent in a project, or hand off a request. The current chat is never moved or reused. Specify projectId or projectRoot. Provider, model, reasoning effort and runtime mode default to the user's selection in the current chat; supply overrides only when requested. Returns a link and reports whether the turn was accepted.",
    discovery: { aliases: ["new project chat", "start project conversation", "ask agent in project", "create chat with message"], capabilities: ["create a separate project chat and start a message"] },
    tier: "standard", category: "gateway", source: "builtin", risk: "medium", defaultConsentLevel: "once",
    parameters: { type: "object", properties: {
      projectId: { type: "string", description: "Existing target project ID. Use project tools to find it." },
      projectRoot: { type: "string", description: "Target project folder; resolves or creates the project when projectId is omitted." },
      message: { type: "string", maxLength: 100_000, description: "Exact initial message to send to the new chat's agent." },
      title: { type: "string", description: "Optional new chat title; defaults to the first line of the message." },
      providerId: { type: "string", description: "Optional provider override. Defaults to the user's current chat selection." },
      model: { type: "string", description: "Optional model override for the chosen provider." },
      reasoningEffort: { type: "string", description: "Optional reasoning effort for the chosen model (for example medium, high, or ultra)." },
      runtimeMode: { type: "string", enum: ["full-access", "supervised"], description: "Optional runtime mode; otherwise inherits the current chat's selection." },
    }, required: ["message"] },
    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
      if (context.signal?.aborted) return { ok: false, message: "Chat creation was cancelled before it started." };
      const body = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
      const message = typeof body.message === "string" ? body.message : "";
      if (!message.trim()) return { ok: false, message: "message is required." };
      if (message.length > 100_000) return { ok: false, message: "message exceeds 100,000 characters." };
      const userId = context.userId?.trim();
      if (!userId) return { ok: false, message: "An authenticated user is required." };
      const projectId = readString(body, "projectId");
      const projectRoot = readString(body, "projectRoot");
      if (!projectId && !projectRoot) return { ok: false, message: "projectId or projectRoot is required." };
      if (!projectId && projectRoot && !isAbsolute(projectRoot) && !win32.isAbsolute(projectRoot)) return { ok: false, message: "projectRoot must be an absolute path." };
      const app = deps.getApp?.();
      const user = deps.userService?.findById(userId);
      if (!app || !user || !deps.config) return { ok: false, message: "The normal chat service is unavailable; no chat was created." };

      const selection = resolveThreadSelectionDefaults({ sessionId: context.sessionId, sessionState: deps.sessionState });
      const provider = readString(body, "providerId") ?? selection.providerId ?? context.providerId;
      const model = readString(body, "model") ?? (provider === selection.providerId ? selection.model : undefined)
        ?? (provider === context.providerId ? context.model : undefined);
      const requestedEffort = readString(body, "reasoningEffort");
      if (body.reasoningEffort !== undefined && (!requestedEffort || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(requestedEffort))) return { ok: false, message: "Invalid reasoningEffort." };
      const reasoningEffort = requestedEffort ?? (provider === selection.providerId && (!readString(body, "model") || model === selection.model) ? selection.reasoningEffort : undefined);
      const requestedMode = body.runtimeMode === "supervised" || body.runtimeMode === "full-access" ? body.runtimeMode : undefined;
      const contextMode = context.runtimeMode === "supervised" || context.runtimeMode === "full-access" ? context.runtimeMode : undefined;
      const runtimeMode = requestedMode ?? selection.runtimeMode ?? contextMode;
      if (!provider || (provider === "jait" && !model)) return { ok: false, message: "Choose a provider and model in the current chat or supply them explicitly before creating a project chat." };

      const existingProject = !projectId && projectRoot ? deps.projectService.findByRoot(projectRoot, "gateway", userId) : undefined;
      const project = projectId ? deps.projectService.getById(projectId, userId)
        : deps.projectService.getOrCreateForRoot({ userId, rootPath: projectRoot!, nodeId: "gateway" });
      if (!project) return { ok: false, message: `Project ${projectId} not found.` };
      if (!project.rootPath) return { ok: false, message: "The selected project has no folder; assign a project folder before starting an agent." };
      if (!projectId && !existingProject) deps.ws?.broadcastToUser(userId, { type: "project.created" as WsEventType, sessionId: "", timestamp: new Date().toISOString(), payload: { project } });
      const firstLine = message.trim().split("\n")[0] ?? "New chat";
      const title = readString(body, "title") ?? (firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine);
      const session = deps.sessionService.create({ userId, projectId: project.id, name: title, projectPath: project.rootPath ?? undefined });
      deps.projectService.touch(project.id);
      deps.sessionState?.set(session.id, {
        "chat.provider": provider,
        ...(model ? { "chat.cliModels": { [provider]: model } } : {}),
        ...(runtimeMode ? { "chat.providerRuntimeMode": runtimeMode } : {}),
        ...(reasoningEffort ? { "chat.reasoningEffort": reasoningEffort } : {}),
      });
      deps.ws?.broadcastToUser(userId, { type: "chat.created" as WsEventType, sessionId: "", timestamp: new Date().toISOString(), payload: { projectId: project.id, session } });
      const href = `/chat?sessionId=${encodeURIComponent(session.id)}`;
      const pageLinks = [{ pageId: "chat", title: "Open the new project chat", href }];
      try {
        const token = await signAuthToken({ id: user.id, username: user.username }, deps.config.jwtSecret);
        if (context.signal?.aborted) return { ok: false, message: "Created the chat, but message submission was cancelled before it started.", data: { project, session, href, pageLinks, accepted: false } };
        // Streaming injection resolves at response headers; drain the stream so
        // the new chat runs independently without buffering its entire output.
        const response = await app.inject({ method: "POST", url: "/api/chat", headers: { authorization: `Bearer ${token}` }, payloadAsStream: true,
          payload: { sessionId: session.id, content: message, provider, ...(model ? { model } : {}), ...(runtimeMode ? { runtimeMode } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}) } });
        const stream = response.stream();
        if (response.statusCode !== 200 && response.statusCode !== 202) {
          let detail = "";
          for await (const chunk of stream) detail = (detail + String(chunk)).slice(0, 2000);
          return { ok: false, message: `Created the chat, but the message was rejected (HTTP ${response.statusCode}): ${detail}`, data: { project, session, href, pageLinks, accepted: false } };
        }
        const queued = response.statusCode === 202;
        if (!await waitForChatAcceptance(stream, queued, context.signal)) return { ok: false, message: "Created the chat, but submission status is unknown. Open the chat before retrying.", data: { project, session, href, pageLinks, accepted: null } };
        return { ok: true, message: "Created a separate project chat and accepted its initial message. Open the chat to follow the agent's progress.", data: { project, session, href, pageLinks, accepted: true, queued } };
      } catch {
        return { ok: false, message: "Created the chat, but submission status is unknown. Open the chat before retrying.", data: { project, session, href, pageLinks, accepted: null } };
      }
    },
  };
}
