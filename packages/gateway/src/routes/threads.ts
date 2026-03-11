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

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { ThreadService } from "../services/threads.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import type { ProviderEvent, ProviderId } from "../providers/contracts.js";
import { RemoteCliProvider } from "../providers/remote-cli-provider.js";
import { GitService, type GitStackedAction, type GitStepResult } from "../services/git.js";
import type { UserService } from "../services/users.js";
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

  // Track active onEvent unsubscribe functions per thread so we can clean up
  const threadUnsubs = new Map<string, () => void>();

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

  function isThreadSessionEvent(event: ProviderEvent, sessionId: string): boolean {
    return event.sessionId === sessionId;
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
      ? threadService.listBySession(sessionId)
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
    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    return thread;
  });

  /** Update thread (title, config, etc.) */
  app.patch("/api/threads/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
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
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    broadcastThreadEvent(id, "updated", { thread });
    return thread;
  });

  /** Delete thread */
  app.delete("/api/threads/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const existing = threadService.getById(id);
    if (!existing) return reply.status(404).send({ error: "Thread not found" });

    // Stop any running session first
    if (existing.status === "running" && existing.providerSessionId) {
      try {
        const provider = providerRegistry.get(existing.providerId as ProviderId);
        if (provider) await provider.stopSession(existing.providerSessionId);
      } catch { /* best effort */ }
    }

    // Clean up the worktree on disk (best effort, don't block delete)
    if (existing.workingDirectory) {
      const fullGitService = new GitService();
      fullGitService.cleanupWorktree(existing.workingDirectory).catch(() => {});
    }

    threadService.delete(id);
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
    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    if (thread.providerSessionId) {
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

    if (!pathExistsLocally && ws && providerId !== "jait") {
      const remoteNode = findRemoteNodeForPath(ws, workingDirectory, providerId);
      if (remoteNode) {
        provider = new RemoteCliProvider(ws, remoteNode.id, providerId);
        isRemote = true;
      }
    }

    if (!provider) {
      return reply.status(400).send({ error: `Provider '${providerId}' not registered` });
    }

    // Fall back to cwd only for local providers with non-existent paths
    if (!pathExistsLocally && !isRemote) {
      workingDirectory = process.cwd();
    }

    // Check availability
    const available = await provider.checkAvailability();
    if (!available) {
      return reply.status(503).send({
        error: `Provider '${providerId}' is not available: ${provider.info.unavailableReason}`,
      });
    }

    // Build MCP server references so CLI agents can call Jait's tools
    const mcpServers = isRemote ? [] : [providerRegistry.buildJaitMcpServerRef(config)];

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

      // Flag to suppress turn.completed during the title-generation turn.
      // The title turn fires turn.completed before the real coding turn starts;
      // without this guard the thread would flip to "completed" prematurely.
      let suppressTurnCompleted = false;

      // Subscribe to provider events and log them
      const unsubscribe = provider.onEvent((event: ProviderEvent) => {
        if (!isThreadSessionEvent(event, session.id)) {
          return;
        }

        // During the title turn we still log events but skip status changes
        if (suppressTurnCompleted && event.type === "turn.completed") {
          return;
        }

        const activity = threadService.logProviderEvent(id, event);
        if (activity) {
          broadcastThreadEvent(id, "activity", { event, activity });
        }

        // Handle session / turn lifecycle
        if (event.type === "session.completed") {
          threadService.markCompleted(id);
          broadcastThreadEvent(id, "status", { status: "completed" });
          unsubscribe();
          threadUnsubs.delete(id);
        } else if (event.type === "session.error") {
          threadService.markError(id, event.error);
          broadcastThreadEvent(id, "status", { status: "error", error: event.error });
          unsubscribe();
          threadUnsubs.delete(id);
        } else if (event.type === "turn.completed") {
          // Turn finished but session is still alive — mark thread completed
          // while keeping providerSessionId set.  The frontend checks
          // providerSessionId to decide between /send and /start.
          threadService.update(id, { status: "completed", completedAt: new Date().toISOString() });
          broadcastThreadEvent(id, "status", { status: "completed" });
        }
      });

      threadUnsubs.set(id, unsubscribe);

      threadService.markRunning(id, session.id);
      broadcastThreadEvent(id, "status", { status: "running" });

      // Send initial message if provided
      const message = typeof body["message"] === "string" ? body["message"] : undefined;
      const titlePrefix = typeof body["titlePrefix"] === "string" ? body["titlePrefix"] : "";
      const titleTask = typeof body["titleTask"] === "string" ? body["titleTask"] : message ?? "";

      // ── Return response immediately — run title + coding turn in background ──
      // The session is alive and marked running. The frontend gets a fast
      // response; title generation and the coding turn happen asynchronously
      // with progress pushed via WS events.
      const updated = threadService.getById(id);

      void (async () => {
        try {
          // ── Title generation (via Codex turn) ─────────────────
          if (titleTask.trim()) {
            suppressTurnCompleted = true;
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
            } finally {
              suppressTurnCompleted = false;
            }
          }

          // ── Send the actual coding turn ────────────────────────
          if (message) {
            const userActivity = threadService.addActivity(id, "message", message.slice(0, 500), { role: "user", content: message });
            broadcastThreadEvent(id, "activity", { activity: userActivity });
            await provider.sendTurn(session.id, message);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          threadService.markError(id, errorMsg);
          broadcastThreadEvent(id, "status", { status: "error", error: errorMsg });
        }
      })();

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

    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    if (!thread.providerSessionId) {
      return reply.status(409).send({ error: "Thread has no active session — use /start instead" });
    }

    const provider = providerRegistry.get(thread.providerId as ProviderId);
    if (!provider) return reply.status(400).send({ error: `Provider '${thread.providerId}' not found` });

    // Persist user message BEFORE sendTurn so it survives provider errors
    const userActivity = threadService.addActivity(id, "message", message.slice(0, 500), { role: "user", content: message });
    broadcastThreadEvent(id, "activity", { activity: userActivity });

    threadService.update(id, { status: "running", error: null });
    broadcastThreadEvent(id, "status", { status: "running" });

    await provider.sendTurn(thread.providerSessionId, message, attachments);
    return reply.status(200).send({ ok: true });
  });

  /** Stop a running thread */
  app.post("/api/threads/:id/stop", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });

    if (thread.providerSessionId) {
      const provider = providerRegistry.get(thread.providerId as ProviderId);
      if (provider) {
        try {
          await provider.stopSession(thread.providerSessionId);
        } catch { /* best effort */ }
      }
    }

    threadService.markInterrupted(id);
    broadcastThreadEvent(id, "status", { status: "interrupted" });
    return reply.status(200).send({ ok: true });
  });

  /** Interrupt the current turn in a running thread */
  app.post("/api/threads/:id/interrupt", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
    if (!thread.providerSessionId) {
      return reply.status(409).send({ error: "Thread has no active session" });
    }

    const provider = providerRegistry.get(thread.providerId as ProviderId);
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

    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
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
    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });
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

    const thread = threadService.getById(id);
    if (!thread) return reply.status(404).send({ error: "Thread not found" });

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
        if (node.isGateway || !node.providers?.length) continue;
        remoteProviders.push({
          nodeId: node.id,
          nodeName: node.name,
          platform: node.platform,
          providers: node.providers,
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
