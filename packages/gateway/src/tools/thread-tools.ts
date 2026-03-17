import type { WsEventType } from "@jait/shared";
import type { ProviderId, ProviderEvent } from "../providers/contracts.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { GitService, cleanupWorktreeRemoteAware, type GitStackedAction, type GitStepResult } from "../services/git.js";
import type { ThreadRow, ThreadService } from "../services/threads.js";
import type { UserService } from "../services/users.js";
import type { WsControlPlane } from "../ws.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";
import { ToolName } from "./tool-names.js";

interface ThreadControlInput {
  action:
    | "list"
    | "get"
    | "create"
    | "create_many"
    | "update"
    | "delete"
    | "start"
    | "send"
    | "stop"
    | "interrupt"
    | "approve"
    | "activities"
    | "create_pr";
  threadId?: string;
  sessionId?: string;
  title?: string;
  providerId?: ProviderId;
  model?: string;
  runtimeMode?: "full-access" | "supervised";
  workingDirectory?: string;
  branch?: string;
  message?: string;
  attachments?: string[];
  start?: boolean;
  threads?: ThreadCreateSpec[];
  requestId?: string;
  approved?: boolean;
  limit?: number;
  prUrl?: string | null;
  prNumber?: number | null;
  prTitle?: string | null;
  prState?: "open" | "closed" | "merged" | null;
  cwd?: string;
  gitAction?: GitStackedAction;
  commitMessage?: string;
  baseBranch?: string;
  featureBranch?: boolean;
}

interface ThreadCreateSpec {
  title: string;
  providerId?: ProviderId;
  model?: string;
  runtimeMode?: "full-access" | "supervised";
  workingDirectory?: string;
  branch?: string;
  sessionId?: string;
  start?: boolean;
  message?: string;
  attachments?: string[];
}

interface ThreadControlGit {
  runStackedAction(
    cwd: string,
    action: GitStackedAction,
    commitMessage?: string,
    featureBranch?: boolean,
    baseBranch?: string,
    githubToken?: string,
  ): Promise<GitStepResult>;
}

export interface ThreadControlToolDeps {
  threadService: ThreadService;
  providerRegistry: ProviderRegistry;
  userService?: UserService;
  ws?: WsControlPlane;
  mcpConfig?: { host: string; port: number };
  gitService?: ThreadControlGit;
}

interface StartThreadResult {
  ok: boolean;
  message: string;
  thread?: ThreadRow;
}

export function createThreadControlTool(deps: ThreadControlToolDeps): ToolDefinition<ThreadControlInput> {
  const gitService = deps.gitService ?? new GitService();

  const broadcastThreadEvent = (threadId: string, event: string, data: Record<string, unknown>): void => {
    if (!deps.ws) return;
    deps.ws.broadcastAll({
      type: `thread.${event}` as WsEventType,
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: { threadId, ...data },
    });
  };

  const ensureUserId = (context: ToolContext): string => {
    const userId = context.userId?.trim();
    return userId || "system";
  };

  const resolveProviderId = (requestedProviderId: ProviderId | undefined, userId: string): ProviderId => {
    if (requestedProviderId) return requestedProviderId;
    if (userId !== "system" && deps.userService) {
      const selectedProvider = deps.userService.getSettings(userId).chatProvider;
      if (deps.providerRegistry.get(selectedProvider)) {
        return selectedProvider;
      }
    }
    return "jait";
  };

  const getAccessibleThread = (threadId: string, userId: string): ThreadRow | undefined => {
    const thread = deps.threadService.getById(threadId);
    if (!thread) return undefined;
    if (thread.userId && thread.userId !== userId) return undefined;
    return thread;
  };

  const startThread = async (
    thread: ThreadRow,
    message?: string,
    attachments?: string[],
  ): Promise<StartThreadResult> => {
    if (thread.status === "running" && thread.providerSessionId) {
      return { ok: false, message: "Thread is already running" };
    }

    const provider = deps.providerRegistry.get(thread.providerId as ProviderId);
    if (!provider) {
      return { ok: false, message: `Provider '${thread.providerId}' not found` };
    }

    const available = await provider.checkAvailability();
    if (!available) {
      return { ok: false, message: `Provider '${thread.providerId}' is not available: ${provider.info.unavailableReason ?? "unknown reason"}` };
    }

    const mcpServers = deps.mcpConfig
      ? [deps.providerRegistry.buildJaitMcpServerRef(deps.mcpConfig)]
      : undefined;

    try {
      const session = await provider.startSession({
        threadId: thread.id,
        workingDirectory: thread.workingDirectory ?? process.cwd(),
        mode: (thread.runtimeMode as "full-access" | "supervised") ?? "full-access",
        model: thread.model ?? undefined,
        mcpServers,
      });

      const unsubscribe = provider.onEvent((event: ProviderEvent) => {
        if (event.sessionId !== session.id) {
          return;
        }

        const activity = deps.threadService.logProviderEvent(thread.id, event);
        if (activity) {
          broadcastThreadEvent(thread.id, "activity", { event, activity });
        }

        if (event.type === "session.completed") {
          deps.threadService.markCompleted(thread.id);
          broadcastThreadEvent(thread.id, "status", { status: "completed" });
          unsubscribe();
        } else if (event.type === "session.error") {
          deps.threadService.markError(thread.id, event.error);
          broadcastThreadEvent(thread.id, "status", { status: "error", error: event.error });
          unsubscribe();
        } else if (event.type === "turn.started") {
          // Re-assert running when a new turn begins
          const cur = deps.threadService.getById(thread.id);
          if (cur && cur.status !== "running") {
            deps.threadService.update(thread.id, { status: "running", error: null });
            broadcastThreadEvent(thread.id, "status", { status: "running" });
          }
        }
      });

      deps.threadService.markRunning(thread.id, session.id);
      broadcastThreadEvent(thread.id, "status", { status: "running" });

      if (message) {
        const userActivity = deps.threadService.addActivity(thread.id, "message", message.slice(0, 500), { role: "user" });
        broadcastThreadEvent(thread.id, "activity", { activity: userActivity });
        await provider.sendTurn(session.id, message, attachments);
      }

      const updated = deps.threadService.getById(thread.id) ?? thread;
      return { ok: true, message: "Thread started", thread: updated };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      deps.threadService.markError(thread.id, errorMessage);
      broadcastThreadEvent(thread.id, "status", { status: "error", error: errorMessage });
      return { ok: false, message: errorMessage };
    }
  };

  return {
    name: ToolName.ThreadControl,
    description:
      "Control agent threads end-to-end: create/list/update/delete threads, run them in parallel, " +
      "send turns, stop/interrupt, and create pull requests with direct links.",
    tier: "standard",
    category: "agent",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "Action: list, get, create, create_many, update, delete, start, send, stop, interrupt, approve, activities, create_pr.",
          enum: [
            "list",
            "get",
            "create",
            "create_many",
            "update",
            "delete",
            "start",
            "send",
            "stop",
            "interrupt",
            "approve",
            "activities",
            "create_pr",
          ],
        },
        threadId: { type: "string", description: "Thread ID for thread-specific actions." },
        sessionId: { type: "string", description: "Optional session filter or session assignment on create." },
        title: { type: "string", description: "Thread title (create/update)." },
        providerId: { type: "string", enum: ["jait", "codex", "claude-code"], description: "Thread provider." },
        model: { type: "string", description: "Optional provider model." },
        runtimeMode: { type: "string", enum: ["full-access", "supervised"], description: "Execution mode for thread runs." },
        workingDirectory: { type: "string", description: "Working directory for the thread." },
        branch: { type: "string", description: "Git branch metadata for the thread." },
        message: { type: "string", description: "Initial or follow-up user message for start/send." },
        attachments: {
          type: "array",
          description: "Optional attachments for provider sendTurn.",
          items: { type: "string" },
        },
        start: { type: "boolean", description: "For create/create_many: auto-start thread(s) after creation." },
        threads: {
          type: "array",
          description: "For create_many: array of thread specs to create in one call.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              providerId: { type: "string", enum: ["jait", "codex", "claude-code"] },
              model: { type: "string" },
              runtimeMode: { type: "string", enum: ["full-access", "supervised"] },
              workingDirectory: { type: "string" },
              branch: { type: "string" },
              sessionId: { type: "string" },
              start: { type: "boolean" },
              message: { type: "string" },
              attachments: { type: "array", items: { type: "string" } },
            },
            required: ["title"],
          },
        },
        requestId: { type: "string", description: "Approval request ID for approve action." },
        approved: { type: "boolean", description: "Approval decision (default true)." },
        limit: { type: "number", description: "Max activities to return (default 100, max 500)." },
        prUrl: { type: "string", description: "PR URL metadata for update." },
        prNumber: { type: "number", description: "PR number metadata for update." },
        prTitle: { type: "string", description: "PR title metadata for update." },
        prState: { type: "string", enum: ["open", "closed", "merged"], description: "PR state metadata for update." },
        cwd: { type: "string", description: "Repo path for create_pr action. Defaults to thread working directory." },
        gitAction: { type: "string", enum: ["commit", "commit_push", "commit_push_pr"], description: "Git stacked action for create_pr (default commit_push_pr)." },
        commitMessage: { type: "string", description: "Commit/PR title override for create_pr." },
        baseBranch: { type: "string", description: "Base branch for PR creation." },
        featureBranch: { type: "boolean", description: "Whether to create a feature branch before committing." },
      },
      required: ["action"],
    },

    async execute(input, context): Promise<ToolResult> {
      const userId = ensureUserId(context);

      try {
        switch (input.action) {
          case "list": {
            const threads = (input.sessionId
              ? deps.threadService.listBySession(input.sessionId)
              : deps.threadService.list(userId))
              .filter((t) => !t.userId || t.userId === userId);
            return {
              ok: true,
              message: `${threads.length} thread(s)`,
              data: { threads },
            };
          }

          case "get": {
            if (!input.threadId) return { ok: false, message: "get requires `threadId`." };
            const thread = getAccessibleThread(input.threadId, userId);
            if (!thread) return { ok: false, message: "Thread not found." };
            return { ok: true, message: "Thread loaded", data: { thread } };
          }

          case "create": {
            const providerId = resolveProviderId(input.providerId, userId);
            const thread = deps.threadService.create({
              userId,
              sessionId: input.sessionId,
              title: input.title?.trim() || "New Thread",
              providerId,
              model: input.model,
              runtimeMode: input.runtimeMode ?? "full-access",
              workingDirectory: input.workingDirectory,
              branch: input.branch,
            });
            broadcastThreadEvent(thread.id, "created", { thread });

            if (!input.start) {
              return { ok: true, message: "Thread created", data: { thread } };
            }

            const started = await startThread(thread, input.message, input.attachments);
            if (!started.ok) {
              return {
                ok: false,
                message: `Thread created but failed to start: ${started.message}`,
                data: { thread },
              };
            }
            return {
              ok: true,
              message: "Thread created and started",
              data: { thread: started.thread ?? thread },
            };
          }

          case "create_many": {
            if (!input.threads || input.threads.length === 0) {
              return { ok: false, message: "create_many requires non-empty `threads`." };
            }

            const defaultProviderId = resolveProviderId(input.providerId, userId);

            const created = input.threads.map((spec) => {
              const thread = deps.threadService.create({
                userId,
                sessionId: spec.sessionId ?? input.sessionId,
                title: spec.title?.trim() || "New Thread",
                providerId: spec.providerId ?? defaultProviderId,
                model: spec.model ?? input.model,
                runtimeMode: spec.runtimeMode ?? input.runtimeMode ?? "full-access",
                workingDirectory: spec.workingDirectory ?? input.workingDirectory,
                branch: spec.branch ?? input.branch,
              });
              broadcastThreadEvent(thread.id, "created", { thread });
              return { thread, spec };
            });

            const startTargets = created.filter(({ spec }) => spec.start === true || input.start === true);
            const startResults = await Promise.all(
              startTargets.map(async ({ thread, spec }) => {
                const started = await startThread(
                  thread,
                  spec.message ?? input.message,
                  spec.attachments ?? input.attachments,
                );
                return {
                  threadId: thread.id,
                  ok: started.ok,
                  message: started.message,
                  thread: started.thread ?? thread,
                };
              }),
            );

            const failedStarts = startResults.filter((r) => !r.ok);
            const threadById = new Map(created.map((entry) => [entry.thread.id, entry.thread]));
            for (const started of startResults) {
              threadById.set(started.threadId, started.thread);
            }
            const threads = [...threadById.values()];

            return {
              ok: failedStarts.length === 0,
              message:
                failedStarts.length === 0
                  ? `Created ${threads.length} thread(s).`
                  : `Created ${threads.length} thread(s), ${failedStarts.length} failed to start.`,
              data: {
                threads,
                startedCount: startResults.length - failedStarts.length,
                failedStarts,
              },
            };
          }

          case "update": {
            if (!input.threadId) return { ok: false, message: "update requires `threadId`." };
            const existing = getAccessibleThread(input.threadId, userId);
            if (!existing) return { ok: false, message: "Thread not found." };
            const thread = deps.threadService.update(input.threadId, {
              title: input.title,
              model: input.model,
              runtimeMode: input.runtimeMode,
              workingDirectory: input.workingDirectory,
              branch: input.branch,
              prUrl: typeof input.prUrl === "string" ? input.prUrl : input.prUrl === null ? null : undefined,
              prNumber: typeof input.prNumber === "number" ? input.prNumber : input.prNumber === null ? null : undefined,
              prTitle: typeof input.prTitle === "string" ? input.prTitle : input.prTitle === null ? null : undefined,
              prState:
                input.prState === "open" || input.prState === "closed" || input.prState === "merged"
                  ? input.prState
                  : input.prState === null
                    ? null
                    : undefined,
            });
            if (!thread) return { ok: false, message: "Thread not found after update." };
            broadcastThreadEvent(thread.id, "updated", { thread });
            return { ok: true, message: "Thread updated", data: { thread } };
          }

          case "delete": {
            if (!input.threadId) return { ok: false, message: "delete requires `threadId`." };
            const thread = getAccessibleThread(input.threadId, userId);
            if (!thread) return { ok: false, message: "Thread not found." };

            if (thread.status === "running" && thread.providerSessionId) {
              const provider = deps.providerRegistry.get(thread.providerId as ProviderId);
              if (provider) {
                try {
                  await provider.stopSession(thread.providerSessionId);
                } catch {
                  // Best effort stop before delete.
                }
              }
            }

            // Clean up the worktree on disk (best effort, don't block delete)
            if (thread.workingDirectory) {
              cleanupWorktreeRemoteAware(thread.workingDirectory, deps.ws).catch(() => {});
            }

            deps.threadService.delete(thread.id);
            broadcastThreadEvent(thread.id, "deleted", {});
            return { ok: true, message: "Thread deleted", data: { threadId: thread.id } };
          }

          case "start": {
            if (!input.threadId) return { ok: false, message: "start requires `threadId`." };
            const thread = getAccessibleThread(input.threadId, userId);
            if (!thread) return { ok: false, message: "Thread not found." };
            const started = await startThread(thread, input.message, input.attachments);
            return {
              ok: started.ok,
              message: started.message,
              data: started.thread ? { thread: started.thread } : undefined,
            };
          }

          case "send": {
            if (!input.threadId) return { ok: false, message: "send requires `threadId`." };
            if (!input.message?.trim()) return { ok: false, message: "send requires non-empty `message`." };
            const thread = getAccessibleThread(input.threadId, userId);
            if (!thread) return { ok: false, message: "Thread not found." };
            if (thread.status !== "running" || !thread.providerSessionId) {
              return { ok: false, message: "Thread is not running." };
            }

            const provider = deps.providerRegistry.get(thread.providerId as ProviderId);
            if (!provider) return { ok: false, message: `Provider '${thread.providerId}' not found` };

            deps.threadService.update(thread.id, { status: "running", error: null });
            broadcastThreadEvent(thread.id, "status", { status: "running" });
            await provider.sendTurn(thread.providerSessionId, input.message, input.attachments);
            const activity = deps.threadService.addActivity(thread.id, "message", input.message.slice(0, 500), { role: "user" });
            broadcastThreadEvent(thread.id, "activity", { activity });
            return { ok: true, message: "Turn sent", data: { threadId: thread.id } };
          }

          case "stop": {
            if (!input.threadId) return { ok: false, message: "stop requires `threadId`." };
            const thread = getAccessibleThread(input.threadId, userId);
            if (!thread) return { ok: false, message: "Thread not found." };

            if (thread.providerSessionId) {
              const provider = deps.providerRegistry.get(thread.providerId as ProviderId);
              if (provider) {
                try {
                  await provider.stopSession(thread.providerSessionId);
                } catch {
                  // Best effort stop.
                }
              }
            }

            deps.threadService.markInterrupted(thread.id);
            broadcastThreadEvent(thread.id, "status", { status: "interrupted" });
            const updated = deps.threadService.getById(thread.id) ?? thread;
            return { ok: true, message: "Thread stopped", data: { thread: updated } };
          }

          case "interrupt": {
            if (!input.threadId) return { ok: false, message: "interrupt requires `threadId`." };
            const thread = getAccessibleThread(input.threadId, userId);
            if (!thread) return { ok: false, message: "Thread not found." };
            if (!thread.providerSessionId) return { ok: false, message: "Thread has no active session." };

            const provider = deps.providerRegistry.get(thread.providerId as ProviderId);
            if (!provider) return { ok: false, message: `Provider '${thread.providerId}' not found` };

            await provider.interruptTurn(thread.providerSessionId);
            return { ok: true, message: "Thread turn interrupted", data: { threadId: thread.id } };
          }

          case "approve": {
            if (!input.threadId) return { ok: false, message: "approve requires `threadId`." };
            if (!input.requestId?.trim()) return { ok: false, message: "approve requires `requestId`." };
            const thread = getAccessibleThread(input.threadId, userId);
            if (!thread) return { ok: false, message: "Thread not found." };
            if (!thread.providerSessionId) return { ok: false, message: "Thread has no active session." };

            const provider = deps.providerRegistry.get(thread.providerId as ProviderId);
            if (!provider) return { ok: false, message: `Provider '${thread.providerId}' not found` };

            await provider.respondToApproval(thread.providerSessionId, input.requestId, input.approved !== false);
            return { ok: true, message: "Approval response sent", data: { threadId: thread.id } };
          }

          case "activities": {
            if (!input.threadId) return { ok: false, message: "activities requires `threadId`." };
            const thread = getAccessibleThread(input.threadId, userId);
            if (!thread) return { ok: false, message: "Thread not found." };
            const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
            const activities = deps.threadService.getActivities(thread.id, limit);
            return {
              ok: true,
              message: `${activities.length} activit${activities.length === 1 ? "y" : "ies"}`,
              data: { activities, threadId: thread.id },
            };
          }

          case "create_pr": {
            const thread = input.threadId ? getAccessibleThread(input.threadId, userId) : undefined;
            if (input.threadId && !thread) {
              return { ok: false, message: "Thread not found." };
            }
            if (thread && !thread.completedAt) {
              return {
                ok: false,
                message: "Thread must be completed before creating a pull request.",
              };
            }

            const cwd = input.cwd || thread?.workingDirectory || context.workspaceRoot;
            if (!cwd) return { ok: false, message: "create_pr requires `cwd` or a thread with `workingDirectory`." };

            const action = input.gitAction ?? "commit_push_pr";
            const result = await gitService.runStackedAction(
              cwd,
              action,
              input.commitMessage?.trim() || undefined,
              input.featureBranch === true,
              input.baseBranch,
            );

            const prUrl = result.pr.url ?? result.push.createPrUrl;

            let updatedThread: ThreadRow | undefined;
            if (thread) {
              updatedThread = deps.threadService.update(thread.id, {
                branch: result.push.branch ?? undefined,
                prUrl: result.pr.url ?? undefined,
                prNumber: result.pr.number ?? undefined,
                prTitle: result.pr.title ?? undefined,
                prState: result.pr.status === "created" || result.pr.status === "opened_existing" ? "open" : undefined,
              });
              if (updatedThread) {
                broadcastThreadEvent(thread.id, "updated", { thread: updatedThread });
              }

              if (prUrl) {
                const activity = deps.threadService.addActivity(
                  thread.id,
                  "activity",
                  result.pr.url ? `Pull request created: ${prUrl}` : `Open pull request: ${prUrl}`,
                  { action, prUrl, result },
                );
                broadcastThreadEvent(thread.id, "activity", { activity });
              }
            }

            const message = result.pr.url
              ? `Pull request ready: ${result.pr.url}`
              : prUrl
                ? `Create pull request here: ${prUrl}`
                : "Git action completed, but no pull request link is available.";

            return {
              ok: true,
              message,
              data: {
                action,
                prUrl: prUrl ?? null,
                result,
                thread: updatedThread,
              },
            };
          }

          default:
            return { ok: false, message: `Unsupported action: ${(input as { action?: string }).action ?? "(unknown)"}` };
        }
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "thread.control failed",
        };
      }
    },
  };
}
