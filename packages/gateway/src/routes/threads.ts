/**
 * Agent Thread REST + WS routes.
 *
 * Manages parallel agent threads — each thread is an independent agent
 * session running on a specific provider (jait, codex, claude-code).
 *
 *   GET    /api/threads              — list threads
 *   POST   /api/threads              — create thread
 *   GET    /api/threads/:id          — get thread
 *   PATCH  /api/threads/:id          — update thread
 *   DELETE /api/threads/:id          — delete thread
 *   POST   /api/threads/:id/start    — start agent session
 *   POST   /api/threads/:id/send     — send a turn
 *   POST   /api/threads/:id/stop     — stop agent session
 *   POST   /api/threads/:id/interrupt — interrupt current turn
 *   POST   /api/threads/:id/approve  — approve a tool call
 *   POST   /api/threads/:id/create-pr — create a PR for a completed thread
 *   GET    /api/threads/:id/activities — get activity log
 *   GET    /api/providers            — list available providers
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { ThreadService } from "../services/threads.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import type { ProviderEvent, ProviderId } from "../providers/contracts.js";
import { RemoteCliProvider } from "../providers/remote-cli-provider.js";
import { GitService, cleanupWorktreeRemoteAware, type GitStackedAction, type GitStepResult } from "../services/git.js";
import type { UserService } from "../services/users.js";
import type { RepositoryService } from "../services/repositories.js";
import { assertOwnership } from "../security/ownership.js";
import { existsSync } from "node:fs";
import {
  generateTitleViaTurn,
  generateTitleViaApi,
  normalizeGeneratedThreadTitle,
} from "../services/thread-title.js";
import type { WsEventType } from "@jait/shared";

export interface ThreadRouteDeps {
  threadService: ThreadService;
  providerRegistry: ProviderRegistry;
  userService?: UserService;
  repoService?: RepositoryService;
  ws?: WsControlPlane;
  gitService?: {
    runStackedAction(
      cwd: string,
      action: GitStackedAction,
      commitMessage?: string,
      featureBranch?: boolean,
      baseBranch?: string,
      githubToken?: string,
    ): Promise<GitStepResult>;
  };
}

export function registerThreadRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: ThreadRouteDeps,
): void {
  const { threadService, providerRegistry, ws } = deps;
  const gitService = deps.gitService ?? new GitService();
  const repoService = deps.repoService;

  // Track active onEvent unsubscribe functions per thread so we can clean up
  const threadUnsubs = new Map<string, () => void>();

  // Track RemoteCliProvider instances per thread so /send, /stop, /interrupt
  // can access them (they're not in the global providerRegistry)
  const remoteProviders = new Map<string, RemoteCliProvider>();

  // ── Helpers ──────────────────────────────────────────────────────

  /** Broadcast a thread event over WS to all clients */
  function broadcastThreadEvent(
    threadId: string,
    event: string,
    data: unknown,
  ): void {
    if (!ws) return;
    ws.broadcastAll({
      type: `thread.${event}` as WsEventType,
      sessionId: "", // thread events are global
      timestamp: new Date().toISOString(),
      payload: { threadId, ...data as Record<string, unknown> },
    });
  }

  function broadcastThreadStatus(
    threadId: string,
    status: "running" | "completed" | "error" | "interrupted",
    error?: string,
  ): void {
    const thread = threadService.getById(threadId);
    broadcastThreadEvent(threadId, "status", {
      status,
      ...(thread ? { thread } : {}),
      ...(error ? { error } : {}),
    });
  }

  function isThreadSessionEvent(event: ProviderEvent, sessionId: string): boolean {
    return event.sessionId === sessionId;
  }

  function getOwnedThread(threadId: string, userId: string) {
    const thread = threadService.getById(threadId);
    return thread?.userId === userId ? thread : null;
  }

  function getRequestBaseUrl(request: FastifyRequest): string | undefined {
    const forwardedProto = request.headers["x-forwarded-proto"];
    const proto = typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : request.protocol;
    const forwardedHost = request.headers["x-forwarded-host"];
    const host = typeof forwardedHost === "string"
      ? forwardedHost.split(",")[0]?.trim()
      : request.headers.host;
    if (!proto || !host) return undefined;
    return `${proto}://${host}`;
  }

  /**
   * Find a connected remote node that can run a provider for a given path.
   * Matches the path's platform format (e.g. Windows drive letter) to a
   * connected FsNode's platform, and checks that the node has the provider.
   */
  function findRemoteNodeForPath(
    wsPlane: WsControlPlane,
    dirPath: string,
    provId: ProviderId,
  ) {
    // Detect path platform: drive letter (C:\) or backslash → windows
    const isWindowsPath = /^[A-Za-z]:[\\\/]/.test(dirPath);
    const expectedPlatform = isWindowsPath ? "windows" : null;

    for (const node of wsPlane.getFsNodes()) {
      if (node.isGateway) continue;
      // Match platform if we can detect it from the path
      if (expectedPlatform && node.platform !== expectedPlatform) continue;
      // If we can't detect platform from path, accept any remote node
      // Check that the node has the requested provider
      if (!node.providers?.includes(provId === "claude-code" ? "claude-code" : provId)) continue;
      return node;
    }
    return null;
  }

  // ── CRUD Routes ──────────────────────────────────────────────────

  /** List threads (optionally filtered by sessionId) */
  app.get("/api/threads", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = request.query as Record<string, string>;
    const sessionId = query["sessionId"];
    const threads = sessionId
      ? threadService.listBySession(sessionId).filter((thread) => thread.userId === authUser.id)
      : threadService.list(authUser.id);
    return { threads };
  });

  /** Create a new thread */
  app.post("/api/threads", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as Record<string, unknown>;
    const thread = threadService.create({
      userId: authUser.id,
      sessionId: typeof body["sessionId"] === "string" ? body["sessionId"] : undefined,
      title: typeof body["title"] === "string" ? body["title"] : "New Thread",
      providerId: (body["providerId"] as ProviderId) ?? "jait",
      model: typeof body["model"] === "string" ? body["model"] : undefined,
      runtimeMode: body["runtimeMode"] === "supervised" ? "supervised" : "full-access",
      workingDirectory: typeof body["workingDirectory"] === "string" ? body["workingDirectory"] : undefined,
      branch: typeof body["branch"] === "string" ? body["branch"] : undefined,
    });
    broadcastThreadEvent(thread.id, "created", { thread });
    return reply.status(201).send(thread);
  });

  /** Get thread by ID */
  app.get("/api/threads/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const thread = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, thread, authUser.id, "Thread not found")) return;
    return thread;
  });

  /** Update thread (title, config, etc.) */
  app.patch("/api/threads/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const existing = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, existing, authUser.id, "Thread not found")) return;
    const body = request.body as Record<string, unknown>;
    const prState =
      body["prState"] === "open" || body["prState"] === "closed" || body["prState"] === "merged"
        ? body["prState"]
        : body["prState"] === null
          ? null
          : undefined;
    const thread = threadService.update(id, {
      title: typeof body["title"] === "string" ? body["title"] : undefined,
      model: typeof body["model"] === "string" ? body["model"] : undefined,
      runtimeMode: body["runtimeMode"] === "supervised" ? "supervised" : body["runtimeMode"] === "full-access" ? "full-access" : undefined,
      workingDirectory: typeof body["workingDirectory"] === "string" ? body["workingDirectory"] : undefined,
      branch: typeof body["branch"] === "string" ? body["branch"] : undefined,
      prUrl: typeof body["prUrl"] === "string" ? body["prUrl"] : body["prUrl"] === null ? null : undefined,
      prNumber: typeof body["prNumber"] === "number" ? body["prNumber"] : body["prNumber"] === null ? null : undefined,
      prTitle: typeof body["prTitle"] === "string" ? body["prTitle"] : body["prTitle"] === null ? null : undefined,
      prState,
    });
    if (
      thread &&
      prState !== undefined &&
      prState !== existing.prState
    ) {
      const prUrl = thread.prUrl ?? existing.prUrl ?? null;
      const summary =
        prState === "open"
          ? prUrl ? `Pull request created: ${prUrl}` : "Pull request created"
          : prState === "merged"
            ? prUrl ? `Pull request merged: ${prUrl}` : "Pull request merged"
            : prState === "closed"
              ? prUrl ? `Pull request closed: ${prUrl}` : "Pull request closed"
              : null;

      if (summary) {
        const activity = threadService.addActivity(id, "activity", summary, {
          action: "pr_state_changed",
          previousPrState: existing.prState,
          prState,
          prUrl,
        });
        broadcastThreadEvent(id, "activity", { activity });
      }

      // When the PR is merged (or closed), the session is no longer needed.
      if (prState === "merged" || prState === "closed") {
        threadService.clearSession(id);
        const unsub = threadUnsubs.get(id);
        if (unsub) { unsub(); threadUnsubs.delete(id); }
        remoteProviders.delete(id);
      }
    }

    broadcastThreadEvent(id, "updated", { thread });
    return thread;
  });

  /** Delete thread */
  app.delete("/api/threads/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const existing = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, existing, authUser.id, "Thread not found")) return;

    // Stop any running session first
    if (existing.status === "running" && existing.providerSessionId) {
      try {
        const provider = providerRegistry.get(existing.providerId as ProviderId);
        if (provider) await provider.stopSession(existing.providerSessionId);
      } catch { /* best effort */ }
    }

    // Clean up the worktree on disk (best effort, don't block delete)
    if (existing.workingDirectory) {
      cleanupWorktreeRemoteAware(existing.workingDirectory, ws).catch(() => {});
    }

    threadService.delete(id);
    remoteProviders.delete(id);
    broadcastThreadEvent(id, "deleted", {});
    return reply.status(204).send();
  });

  // ── Lifecycle Routes ─────────────────────────────────────────────

  /** Start an agent session for this thread */
  app.post("/api/threads/:id/start", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const thread = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, thread, authUser.id, "Thread not found")) return;
    if (thread.providerSessionId && thread.status === "running") {
      return reply.status(409).send({ error: "Thread already has an active session" });
    }

    const providerId = thread.providerId as ProviderId;

    // Resolve working directory — the stored path may come from a
    // different device/OS (e.g. Windows path on a Linux gateway).
    let workingDirectory = thread.workingDirectory ?? process.cwd();
    const pathExistsLocally = existsSync(workingDirectory);

    // Determine if we need a remote provider:
    // If the path doesn't exist locally, look for a connected remote node
    // that matches the path's platform and has the requested provider.
    let provider = providerRegistry.get(providerId);
    let isRemote = false;
    let executionNode: { id: string; name: string } | null = null;

    if (!pathExistsLocally && ws && providerId !== "jait") {
      const remoteNode = findRemoteNodeForPath(ws, workingDirectory, providerId);
      if (remoteNode) {
        provider = new RemoteCliProvider(ws, remoteNode.id, providerId);
        isRemote = true;
        executionNode = { id: remoteNode.id, name: remoteNode.name };
      }
    }

    if (!provider) {
      return reply.status(400).send({ error: `Provider '${providerId}' not registered` });
    }

    // Fall back to cwd only for local providers with non-existent paths
    if (!pathExistsLocally && !isRemote) {
      // Check if the caller wants to clone the repo to the gateway
      const cloneToGateway = body["cloneToGateway"] === true;

      if (!cloneToGateway) {
        // Return a structured error so the frontend can offer to clone
        return reply.status(422).send({
          error: "The repo path is not accessible on this gateway and no desktop app is connected. You can clone the repo to the gateway to proceed.",
          code: "NODE_OFFLINE",
          workingDirectory,
          threadId: id,
        });
      }

      // Clone-to-gateway: find the matching repo for its GitHub URL
      const matchingRepo = repoService
        ? (repoService.list(authUser.id).find((r) =>
          workingDirectory.startsWith(r.localPath) || workingDirectory.includes(r.name),
        ) ?? null)
        : null;

      const repoUrl =
        (typeof body["repoUrl"] === "string" ? body["repoUrl"] : null) ??
        (matchingRepo as Record<string, unknown> | null)?.["githubUrl"] as string | null;

      if (!repoUrl) {
        return reply.status(400).send({
          error: "Cannot clone: no GitHub URL available. Register the repo with a GitHub URL first.",
          code: "NO_REPO_URL",
        });
      }

      const repoName = matchingRepo?.name ?? "repo";
      const defaultBranch = matchingRepo?.defaultBranch ?? "main";
      const localGit = new GitService();

      try {
        // Clone or update the repo on the gateway
        const clonePath = await localGit.cloneOrFetch(repoUrl, repoName, defaultBranch);

        // Create a worktree for this thread's branch
        const branch = thread.branch ?? `jait/${id.slice(-8)}`;
        const wt = await localGit.createWorktree(clonePath, defaultBranch, branch);
        workingDirectory = wt.path;

        // Update the thread record with the gateway-local working directory
        threadService.update(id, { workingDirectory, branch });
      } catch (err) {
        return reply.status(500).send({
          error: `Failed to clone repo to gateway: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // Check availability
    const available = await provider.checkAvailability();
    if (!available) {
      return reply.status(503).send({
        error: `Provider '${providerId}' is not available: ${provider.info.unavailableReason}`,
      });
    }

    // Build MCP server references so CLI agents can call Jait's tools
    const mcpServers = [providerRegistry.buildJaitMcpServerRef(config, getRequestBaseUrl(request))];

    // Store remote provider for /send, /stop, /interrupt access
    if (isRemote && provider instanceof RemoteCliProvider) {
      remoteProviders.set(id, provider);
    }

    try {
      const session = await provider.startSession({
        threadId: id,
        workingDirectory,
        mode: (thread.runtimeMode as "full-access" | "supervised") ?? "full-access",
        model: thread.model ?? undefined,
        mcpServers,
      });

      // Clean up any previous listener for this thread (e.g. stop → start cycle)
      const prevUnsub = threadUnsubs.get(id);
      if (prevUnsub) {
        prevUnsub();
        threadUnsubs.delete(id);
      }

      // Counter to suppress turn.completed / turn.started events during
      // the title-generation turn.  The title turn fires these before the
      // real coding turn starts; without this guard the thread would flip
      // to "completed" prematurely.
      let suppressTitleTurnEvents = 0;

      // Subscribe to provider events and log them
      const unsubscribe = provider.onEvent((event: ProviderEvent) => {
        if (!isThreadSessionEvent(event, session.id)) {
          return;
        }

        // During the title turn we still log events but skip status changes
        if (suppressTitleTurnEvents > 0) {
          if (event.type === "turn.completed") {
            suppressTitleTurnEvents--;
            return;
          }
          // Also suppress turn.started during title gen to avoid redundant broadcasts
          if (event.type === "turn.started") {
            return;
          }
        }

        const activity = threadService.logProviderEvent(id, event);
        if (activity) {
          broadcastThreadEvent(id, "activity", { event, activity });
        }

        // Handle session / turn lifecycle
        if (event.type === "session.completed") {
          threadService.markCompleted(id);
          broadcastThreadStatus(id, "completed");
          unsubscribe();
          threadUnsubs.delete(id);
          // Keep remoteProviders entry — the thread can still be resumed
          // with a new session (e.g. to fix push failures). Cleaned up on
          // PR merge/close or thread deletion.
        } else if (event.type === "session.error") {
          threadService.markError(id, event.error);
          broadcastThreadStatus(id, "error", event.error);
          unsubscribe();
          threadUnsubs.delete(id);
          remoteProviders.delete(id);
        } else if (event.type === "turn.started") {
          // A new turn began — make sure the thread is marked running.
          // This acts as a safety net: if a previous turn.completed leaked
          // (e.g. race between title-gen and suppression), this corrects it.
          const cur = threadService.getById(id);
          if (cur && cur.status !== "running") {
            threadService.update(id, { status: "running", error: null });
            broadcastThreadStatus(id, "running");
          }
        } else if (event.type === "turn.completed") {
          // Turn finished but session is still alive — mark thread completed
          // while keeping providerSessionId set.  The frontend checks
          // providerSessionId to decide between /send and /start.
          threadService.update(id, { status: "completed", error: null, completedAt: new Date().toISOString() });
          broadcastThreadStatus(id, "completed");
        }
      });

      threadUnsubs.set(id, unsubscribe);

      threadService.markRunning(id, session.id);
      if (executionNode) {
        threadService.update(id, {
          executionNodeId: executionNode.id,
          executionNodeName: executionNode.name,
        });
      }
      broadcastThreadStatus(id, "running");

      // Send initial message if provided
      const message = typeof body["message"] === "string" ? body["message"] : undefined;
      const attachments = Array.isArray(body["attachments"]) ? body["attachments"] as string[] : undefined;
      const displayContent = typeof body["displayContent"] === "string" ? body["displayContent"] : message;
      const referencedFiles = Array.isArray(body["referencedFiles"])
        ? (body["referencedFiles"] as unknown[]).flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const path = typeof (entry as Record<string, unknown>).path === "string" ? (entry as Record<string, unknown>).path as string : null;
            const name = typeof (entry as Record<string, unknown>).name === "string" ? (entry as Record<string, unknown>).name as string : null;
            return path && name ? [{ path, name }] : [];
          })
        : undefined;
      const titlePrefix = typeof body["titlePrefix"] === "string" ? body["titlePrefix"] : "";
      const titleTask = typeof body["titleTask"] === "string" ? body["titleTask"] : displayContent ?? message ?? "";

      // ── Return response immediately — run title + coding turn in background ──
      // The session is alive and marked running. The frontend gets a fast
      // response; title generation and the coding turn happen asynchronously
      // with progress pushed via WS events.
      void (async () => {
        try {
          // ── Title generation (via Codex turn) ─────────────────
          if (titleTask.trim()) {
            suppressTitleTurnEvents = 1;
            try {
              let generatedTitle: string;
              if (providerId === "codex" || providerId === "claude-code") {
                const raw = await generateTitleViaTurn(provider, session.id, titleTask);
                generatedTitle = normalizeGeneratedThreadTitle(raw, "");
              } else {
                const apiKeys = deps.userService?.getSettings(authUser.id).apiKeys ?? {};
                generatedTitle = await generateTitleViaApi({
                  task: titleTask,
                  config,
                  apiKeys,
                  model: thread.model ?? undefined,
                });
              }
              if (generatedTitle) {
                const titleUpdated = threadService.update(id, {
                  title: `${titlePrefix}${generatedTitle}`.trim(),
                });
                if (titleUpdated) broadcastThreadEvent(id, "updated", { thread: titleUpdated });
              }
            } catch {
              // Title generation failed — leave the placeholder title
            }
          }

          // ── Send the actual coding turn ────────────────────────
          if (message) {
            // Look up repository strategy to prepend as agent instructions
            let fullMessage = message;
            if (repoService && workingDirectory) {
              const matchingRepo = repoService.list(authUser.id).find((r) =>
                workingDirectory.startsWith(r.localPath) ||
                workingDirectory.includes(r.name),
              );
              if (matchingRepo?.strategy?.trim()) {
                fullMessage = `<repository-strategy>\n${matchingRepo.strategy.trim()}\n</repository-strategy>\n\n${message}`;
              }
            }

            const userActivity = threadService.addActivity(id, "message", (displayContent ?? message).slice(0, 500), {
              role: "user",
              content: displayContent ?? message,
              fullContent: message,
              referencedFiles,
            });
            broadcastThreadEvent(id, "activity", { activity: userActivity });
            await provider.sendTurn(session.id, fullMessage, attachments);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          threadService.markError(id, errorMsg);
          broadcastThreadStatus(id, "error", errorMsg);
        }
      })();

      const updated = getOwnedThread(id, authUser.id);
      if (!assertOwnership(reply, updated, authUser.id, "Thread not found")) return;
      return reply.status(200).send(updated);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      threadService.markError(id, errorMsg);
      return reply.status(500).send({ error: errorMsg });
    }
  });

  /** Send a message/turn to a running thread */
  app.post("/api/threads/:id/send", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const message = typeof body["message"] === "string" ? body["message"] : "";
    const attachments = Array.isArray(body["attachments"]) ? body["attachments"] as string[] : undefined;
    const displayContent = typeof body["displayContent"] === "string" ? body["displayContent"] : message;
    const referencedFiles = Array.isArray(body["referencedFiles"])
      ? (body["referencedFiles"] as unknown[]).flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const path = typeof (entry as Record<string, unknown>).path === "string" ? (entry as Record<string, unknown>).path as string : null;
          const name = typeof (entry as Record<string, unknown>).name === "string" ? (entry as Record<string, unknown>).name as string : null;
          return path && name ? [{ path, name }] : [];
        })
      : undefined;

    const thread = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, thread, authUser.id, "Thread not found")) return;
    if (!thread.providerSessionId) {
      return reply.status(409).send({ error: "Thread has no active session — use /start instead" });
    }

    const provider = remoteProviders.get(id) ?? providerRegistry.get(thread.providerId as ProviderId);
    if (!provider) return reply.status(400).send({ error: `Provider '${thread.providerId}' not found` });

    // Persist user message BEFORE sendTurn so it survives provider errors
    const userActivity = threadService.addActivity(id, "message", (displayContent ?? message).slice(0, 500), {
      role: "user",
      content: displayContent ?? message,
      fullContent: message,
      referencedFiles,
    });
    broadcastThreadEvent(id, "activity", { activity: userActivity });

    threadService.update(id, { status: "running", error: null });
    broadcastThreadStatus(id, "running");

    await provider.sendTurn(thread.providerSessionId, message, attachments);
    return reply.status(200).send({ ok: true });
  });

  /** Stop a running thread */
  app.post("/api/threads/:id/stop", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const thread = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, thread, authUser.id, "Thread not found")) return;

    if (thread.providerSessionId) {
      const provider = remoteProviders.get(id) ?? providerRegistry.get(thread.providerId as ProviderId);
      if (provider) {
        try {
          await provider.stopSession(thread.providerSessionId);
        } catch { /* best effort */ }
      }
      remoteProviders.delete(id);
    }

    threadService.markInterrupted(id);
    broadcastThreadStatus(id, "interrupted");
    return reply.status(200).send({ ok: true });
  });

  /** Interrupt the current turn in a running thread */
  app.post("/api/threads/:id/interrupt", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const thread = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, thread, authUser.id, "Thread not found")) return;
    if (!thread.providerSessionId) {
      return reply.status(409).send({ error: "Thread has no active session" });
    }

    const provider = remoteProviders.get(id) ?? providerRegistry.get(thread.providerId as ProviderId);
    if (!provider) return reply.status(400).send({ error: `Provider '${thread.providerId}' not found` });

    await provider.interruptTurn(thread.providerSessionId);
    return reply.status(200).send({ ok: true });
  });

  /** Approve a tool call in supervised mode */
  app.post("/api/threads/:id/approve", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const requestId = typeof body["requestId"] === "string" ? body["requestId"] : "";
    const approved = body["approved"] !== false;

    const thread = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, thread, authUser.id, "Thread not found")) return;
    if (!thread.providerSessionId) {
      return reply.status(409).send({ error: "Thread has no active session" });
    }

    const provider = providerRegistry.get(thread.providerId as ProviderId);
    if (!provider) return reply.status(400).send({ error: `Provider '${thread.providerId}' not found` });

    await provider.respondToApproval(thread.providerSessionId, requestId, approved);
    return reply.status(200).send({ ok: true });
  });

  /** Create a pull request for a completed thread */
  app.post("/api/threads/:id/create-pr", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const thread = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, thread, authUser.id, "Thread not found")) return;
    if (!thread.completedAt) {
      return reply.status(409).send({
        error: "Thread must be completed before creating a pull request.",
      });
    }
    if (!thread.workingDirectory) {
      return reply.status(400).send({ error: "Thread has no working directory configured." });
    }

    const commitMessage =
      typeof body["commitMessage"] === "string"
        ? body["commitMessage"].trim() || undefined
        : undefined;
    const baseBranch = typeof body["baseBranch"] === "string" ? body["baseBranch"] : undefined;
    const githubToken = typeof body["githubToken"] === "string" ? body["githubToken"] : undefined;

    try {
      let result: GitStepResult;
      const cwd = thread.workingDirectory;

      // Check if the working directory is on a remote node
      const isRemotePath = !existsSync(cwd);
      if (isRemotePath && ws) {
        // Find the remote node that owns this path
        const isWindowsPath = /^[A-Za-z]:[\\\/]/.test(cwd);
        const expectedPlatform = isWindowsPath ? "windows" : null;
        let remoteNodeId: string | null = null;
        for (const node of ws.getFsNodes()) {
          if (node.isGateway) continue;
          if (expectedPlatform && node.platform !== expectedPlatform) continue;
          remoteNodeId = node.id;
          break;
        }
        if (!remoteNodeId) {
          return reply.status(502).send({ error: "No remote node connected to run git operations on this path." });
        }
        result = await ws.proxyFsOp<GitStepResult>(remoteNodeId, "git-stacked-action", {
          cwd,
          action: "commit_push_pr",
          commitMessage,
          featureBranch: false,
          baseBranch,
          githubToken,
        }, 120_000);
      } else {
        result = await gitService.runStackedAction(
          cwd,
          "commit_push_pr",
          commitMessage,
          false,
          baseBranch,
          githubToken,
        );
      }

      const prUrl = result.pr.url ?? result.push.createPrUrl;

      // ── Push failed — resume the thread so the agent can fix the issue ──
      if (result.push.status === "failed") {
        const pushError = result.push.error ?? "Unknown push error";
        const resumeMessage = [
          `Git push failed with the following error:\n\n${pushError}\n`,
          "Please investigate and fix the issue (e.g. linting errors, type errors, or git hook failures),",
          "then let me know when you're done so I can retry the push and PR creation.",
        ].join("\n");

        // Log the failure as a thread activity
        const activity = threadService.addActivity(
          thread.id,
          "activity",
          `Push failed: ${pushError}`,
          { action: "push_failed", error: pushError, result },
        );
        broadcastThreadEvent(thread.id, "activity", { activity });

        // Try to resume the thread with the error message
        let resumed = false;
        const provider = remoteProviders.get(id) ?? providerRegistry.get(thread.providerId as ProviderId);
        if (provider) {
          // 1) Try sending a turn on the existing session
          if (thread.providerSessionId) {
            try {
              await provider.sendTurn(thread.providerSessionId, resumeMessage);
              // sendTurn succeeded — now mark running and log the user message
              const userActivity = threadService.addActivity(id, "message", resumeMessage.slice(0, 500), { role: "user", content: resumeMessage });
              broadcastThreadEvent(id, "activity", { activity: userActivity });
              threadService.update(id, { status: "running", error: null });
              broadcastThreadStatus(id, "running");
              resumed = true;
            } catch { /* session may be dead — start a new one below */ }
          }

          // 2) If existing session was dead or absent, start a fresh session
          if (!resumed) {
            try {
              const wdir = thread.workingDirectory ?? process.cwd();
              const mcpServers = [providerRegistry.buildJaitMcpServerRef(config, getRequestBaseUrl(request))];
              const newSession = await provider.startSession({
                threadId: id,
                workingDirectory: wdir,
                mode: (thread.runtimeMode as "full-access" | "supervised") ?? "full-access",
                model: thread.model ?? undefined,
                mcpServers,
              });

              // Set up event listener for the new session
              const prevUnsub = threadUnsubs.get(id);
              if (prevUnsub) { prevUnsub(); threadUnsubs.delete(id); }

              const unsub = provider.onEvent((evt: ProviderEvent) => {
                if (!isThreadSessionEvent(evt, newSession.id)) return;
                const act = threadService.logProviderEvent(id, evt);
                if (act) broadcastThreadEvent(id, "activity", { event: evt, activity: act });

                if (evt.type === "session.completed") {
                  threadService.markCompleted(id);
                  broadcastThreadStatus(id, "completed");
                  unsub(); threadUnsubs.delete(id);
                } else if (evt.type === "session.error") {
                  threadService.markError(id, evt.error);
                  broadcastThreadStatus(id, "error", evt.error);
                  unsub(); threadUnsubs.delete(id);
                } else if (evt.type === "turn.started") {
                  const cur = threadService.getById(id);
                  if (cur && cur.status !== "running") {
                    threadService.update(id, { status: "running", error: null });
                    broadcastThreadStatus(id, "running");
                  }
                } else if (evt.type === "turn.completed") {
                  threadService.update(id, { status: "completed", error: null, completedAt: new Date().toISOString() });
                  broadcastThreadStatus(id, "completed");
                }
              });
              threadUnsubs.set(id, unsub);

              // Send the turn first — only mark running if it succeeds
              try {
                await provider.sendTurn(newSession.id, resumeMessage);
                threadService.markRunning(id, newSession.id);
                broadcastThreadStatus(id, "running");
                const userActivity = threadService.addActivity(id, "message", resumeMessage.slice(0, 500), { role: "user", content: resumeMessage });
                broadcastThreadEvent(id, "activity", { activity: userActivity });
                resumed = true;
              } catch {
                // sendTurn failed on new session — clean up
                unsub(); threadUnsubs.delete(id);
              }
            } catch { /* session start failed */ }
          }
        }

        // If resume failed, revert thread to completed (not stuck as "running")
        if (!resumed) {
          threadService.update(id, {
            status: "completed",
            error: "Push failed and automatic resume was not possible. Use the Start button to retry manually.",
            completedAt: new Date().toISOString(),
          });
          broadcastThreadStatus(id, "completed");
        }

        return reply.status(200).send({
          error: `Push failed: ${pushError}`,
          pushFailed: true,
          resumed,
          result,
          thread: threadService.getById(thread.id),
        });
      }

      const updatedThread = threadService.update(thread.id, {
        branch: result.push.branch ?? undefined,
        prUrl: result.pr.url ?? undefined,
        prNumber: result.pr.number ?? undefined,
        prTitle: result.pr.title ?? undefined,
        prState:
          result.pr.status === "created" || result.pr.status === "opened_existing"
            ? "open"
            : undefined,
      });

      if (updatedThread) {
        broadcastThreadEvent(thread.id, "updated", { thread: updatedThread });
      }

      if (prUrl) {
        const activity = threadService.addActivity(
          thread.id,
          "activity",
          result.pr.url ? `Pull request created: ${prUrl}` : `Open pull request: ${prUrl}`,
          { action: "commit_push_pr", prUrl, result },
        );
        broadcastThreadEvent(thread.id, "activity", { activity });
      }

      return reply.status(200).send({
        message: result.pr.url
          ? `Pull request ready: ${result.pr.url}`
          : prUrl
            ? `Create pull request here: ${prUrl}`
            : "Git action completed, but no pull request link is available.",
        prUrl: prUrl ?? null,
        result,
        thread: updatedThread,
      });
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : "Failed to create pull request",
      });
    }
  });

  // ── Activity log ─────────────────────────────────────────────────

  /** Get activities for a thread */
  app.get("/api/threads/:id/activities", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string>;
    const rawLimit = query["limit"];
    const parsedLimit = rawLimit == null ? undefined : parseInt(rawLimit, 10);
    const limit =
      parsedLimit == null || Number.isNaN(parsedLimit)
        ? undefined
        : Math.min(Math.max(parsedLimit, 1), 2000);

    const thread = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, thread, authUser.id, "Thread not found")) return;

    const activities = threadService.getActivities(id, limit);
    return { activities };
  });

  // ── Provider info ────────────────────────────────────────────────

  /** List available providers (local + remote) */
  app.get("/api/providers", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const providers = providerRegistry.list();
    // Check availability in parallel
    await Promise.all(
      providers.map((p) => p.checkAvailability().catch(() => false)),
    );

    // Collect remote provider info from connected filesystem nodes
    const remoteProviders: { nodeId: string; nodeName: string; platform: string; providers: string[] }[] = [];
    if (ws) {
      for (const node of ws.getFsNodes()) {
        if (node.isGateway) continue;
        remoteProviders.push({
          nodeId: node.id,
          nodeName: node.name,
          platform: node.platform,
          providers: node.providers ?? [],
        });
      }
    }

    return {
      providers: providers.map((p) => ({
        id: p.id,
        name: p.info.name,
        description: p.info.description,
        available: p.info.available,
        unavailableReason: p.info.unavailableReason,
        modes: p.info.modes,
      })),
      remoteProviders,
    };
  });

  /** List models for a specific provider */
  app.get("/api/providers/:id/models", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const { id } = request.params as { id: string };
    const provider = providerRegistry.get(id as ProviderId);
    if (!provider) {
      return reply.status(404).send({ error: `Unknown provider: ${id}` });
    }

    if (!provider.listModels) {
      return { models: [] };
    }

    try {
      const models = await provider.listModels();
      return { models };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to list models" });
    }
  });

  app.log.info("Agent thread routes registered at /api/threads");
}
