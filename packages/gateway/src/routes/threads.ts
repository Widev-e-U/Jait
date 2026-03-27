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
import type { SessionStateService } from "../services/session-state.js";
import { resolveThreadSelectionDefaults } from "../services/thread-defaults.js";
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
import type { ThreadInfo, ThreadRegistrySnapshot } from "@jait/shared";
import type { ProviderModelInfo } from "../providers/contracts.js";
import { interventionRunResumeRegistry } from "../services/intervention-run-resume.js";

const KNOWN_PROVIDER_IDS = new Set<ProviderId>(["jait", "codex", "claude-code", "gemini", "opencode", "copilot"]);

function resolveThreadProviderId(
  userSelectedProvider?: ProviderId | null,
  requestedProvider?: ProviderId | null,
  fallbackProvider?: ProviderId | null,
): { providerId?: ProviderId; error?: string } {
  const resolveSelectedProvider = (): { providerId?: ProviderId; error?: string } => {
    if (!userSelectedProvider) {
      return { error: "No selected provider is configured for this user." };
    }
    if (!KNOWN_PROVIDER_IDS.has(userSelectedProvider)) {
      return {
        error: `The current selected provider '${userSelectedProvider}' is not supported on this gateway.`,
      };
    }
    return { providerId: userSelectedProvider };
  };

  if (requestedProvider === "jait") {
    if (KNOWN_PROVIDER_IDS.has("jait")) return { providerId: "jait" };
    return { error: "Provider 'jait' is not supported on this gateway." };
  }

  if (requestedProvider) {
    if (KNOWN_PROVIDER_IDS.has(requestedProvider)) {
      return { providerId: requestedProvider };
    }
    return { error: `Provider '${requestedProvider}' is not supported on this gateway.` };
  }

  if (userSelectedProvider && KNOWN_PROVIDER_IDS.has(userSelectedProvider)) {
    return { providerId: userSelectedProvider };
  }

  const invalidFallback = fallbackProvider && !KNOWN_PROVIDER_IDS.has(fallbackProvider)
    ? fallbackProvider
    : null;
  if (invalidFallback) {
    return { error: `Provider '${invalidFallback}' is not supported on this gateway.` };
  }

  if (fallbackProvider === "jait") {
    if (KNOWN_PROVIDER_IDS.has("jait")) return { providerId: "jait" };
    return { error: "Provider 'jait' is not supported on this gateway." };
  }

  if (fallbackProvider && KNOWN_PROVIDER_IDS.has(fallbackProvider)) {
    return { providerId: fallbackProvider };
  }

  return resolveSelectedProvider();
}

/** Fetch models from OpenRouter API with a 5-second timeout and in-memory cache. */
let orCache: { models: ProviderModelInfo[]; fetchedAt: number } | null = null;
const OR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchOpenRouterModels(apiKey: string): Promise<ProviderModelInfo[]> {
  if (orCache && Date.now() - orCache.fetchedAt < OR_CACHE_TTL) {
    return orCache.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ id: string; name?: string; description?: string }> };
    const models: ProviderModelInfo[] = (data.data ?? [])
      .filter((m) => m.id && !m.id.includes(":free"))
      .slice(0, 100)
      .map((m) => ({
        id: m.id,
        name: m.name || m.id.split("/").pop() || m.id,
        description: m.description?.slice(0, 80),
      }));
    orCache = { models, fetchedAt: Date.now() };
    return models;
  } finally {
    clearTimeout(timeout);
  }
}

export interface ThreadRouteDeps {
  threadService: ThreadService;
  providerRegistry: ProviderRegistry;
  userService?: UserService;
  sessionState?: SessionStateService;
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
  const threadResumeUnsubs = new Map<string, () => void>();
  const pendingInterventionMessages = new Map<string, string[]>();

  // Track RemoteCliProvider instances per thread so /send, /stop, /interrupt
  // can access them (they're not in the global providerRegistry)
  const remoteProviders = new Map<string, RemoteCliProvider>();

  if (ws) {
    ws.getThreadSnapshot = (userId: string): ThreadRegistrySnapshot => ({
      serverTime: new Date().toISOString(),
      threads: threadService.list(userId).map((thread): ThreadInfo => ({
        id: thread.id,
        userId: thread.userId,
        sessionId: thread.sessionId,
        title: thread.title,
        providerId: thread.providerId as ThreadInfo["providerId"],
        model: thread.model,
        runtimeMode: thread.runtimeMode as ThreadInfo["runtimeMode"],
        kind: thread.kind as ThreadInfo["kind"],
        workingDirectory: thread.workingDirectory,
        branch: thread.branch,
        status: thread.status as ThreadInfo["status"],
        providerSessionId: thread.providerSessionId,
        error: thread.error,
        prUrl: thread.prUrl,
        prNumber: thread.prNumber,
        prTitle: thread.prTitle,
        prState: normalizeThreadPrState(thread.prState),
        executionNodeId: thread.executionNodeId ?? null,
        executionNodeName: thread.executionNodeName ?? null,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        completedAt: thread.completedAt,
      })),
    });
  }

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

  function unregisterThreadResume(threadId: string): void {
    const unregister = threadResumeUnsubs.get(threadId);
    if (unregister) {
      unregister();
      threadResumeUnsubs.delete(threadId);
    }
    pendingInterventionMessages.delete(threadId);
  }

  function registerThreadResume(
    threadId: string,
    handler: (message: string) => Promise<{ status: "queued" | "not-running" | "error"; error?: string }>,
  ): void {
    unregisterThreadResume(threadId);
    threadResumeUnsubs.set(threadId, interventionRunResumeRegistry.registerThread(threadId, handler));
  }

  async function flushPendingInterventionMessage(
    threadId: string,
    providerSessionId: string,
    providerId: ProviderId,
  ): Promise<boolean> {
    const queued = pendingInterventionMessages.get(threadId);
    const nextMessage = queued?.shift();
    if (!nextMessage) return false;
    if (queued && queued.length > 0) pendingInterventionMessages.set(threadId, queued);
    else pendingInterventionMessages.delete(threadId);

    const thread = threadService.getById(threadId);
    if (!thread || thread.status !== "running" || thread.providerSessionId !== providerSessionId) {
      return false;
    }

    const provider = remoteProviders.get(threadId) ?? providerRegistry.get(providerId);
    if (!provider) {
      pendingInterventionMessages.delete(threadId);
      return false;
    }

    await provider.sendTurn(providerSessionId, nextMessage);
    const userActivity = threadService.addActivity(threadId, "message", nextMessage.slice(0, 500), {
      role: "user",
      content: nextMessage,
    });
    broadcastThreadEvent(threadId, "activity", { activity: userActivity });
    threadService.update(threadId, { status: "running", error: null });
    broadcastThreadStatus(threadId, "running");
    return true;
  }

  function buildThreadEventHandler(
    threadId: string,
    providerSessionId: string,
    providerId: ProviderId,
    options?: { suppressTitleTurnEvents?: () => number; decrementSuppressedTurn?: () => void },
  ): (event: ProviderEvent) => void {
    return (event: ProviderEvent) => {
      if (!isThreadSessionEvent(event, providerSessionId)) {
        return;
      }

      if ((options?.suppressTitleTurnEvents?.() ?? 0) > 0) {
        if (event.type === "turn.completed") {
          options?.decrementSuppressedTurn?.();
          return;
        }
        if (event.type === "turn.started") {
          return;
        }
      }

      const activity = threadService.logProviderEvent(threadId, event);
      if (activity) {
        broadcastThreadEvent(threadId, "activity", { event, activity });
      }

      if (event.type === "session.completed") {
        threadService.markCompleted(threadId);
        broadcastThreadStatus(threadId, "completed");
        const unsubscribe = threadUnsubs.get(threadId);
        if (unsubscribe) {
          unsubscribe();
          threadUnsubs.delete(threadId);
        }
        unregisterThreadResume(threadId);
      } else if (event.type === "session.error") {
        threadService.markError(threadId, event.error);
        broadcastThreadStatus(threadId, "error", event.error);
        const unsubscribe = threadUnsubs.get(threadId);
        if (unsubscribe) {
          unsubscribe();
          threadUnsubs.delete(threadId);
        }
        remoteProviders.delete(threadId);
        unregisterThreadResume(threadId);
      } else if (event.type === "turn.started") {
        const cur = threadService.getById(threadId);
        if (cur && cur.status !== "running") {
          threadService.update(threadId, { status: "running", error: null });
          broadcastThreadStatus(threadId, "running");
        }
      } else if (event.type === "turn.completed") {
        void flushPendingInterventionMessage(threadId, providerSessionId, providerId)
          .then((resumed) => {
            if (resumed) return;
            threadService.update(threadId, { status: "completed", error: null, completedAt: new Date().toISOString() });
            broadcastThreadStatus(threadId, "completed");
          })
          .catch((error) => {
            threadService.markError(threadId, error instanceof Error ? error.message : String(error));
            broadcastThreadStatus(threadId, "error", error instanceof Error ? error.message : String(error));
            unregisterThreadResume(threadId);
          });
      }
    };
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

  function parseThreadListLimit(value: unknown): number | undefined {
    if (typeof value !== "string") return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return undefined;
    return Math.min(parsed, 100);
  }

  function buildThreadTurnMessage(args: {
    message: string;
    repoStrategy?: string | null;
    prUrl?: string | null;
    prState?: "creating" | "open" | "closed" | "merged" | null;
    branch?: string | null;
  }): string {
    let fullMessage = args.message;

    if (args.repoStrategy?.trim()) {
      fullMessage = `<repository-strategy>\n${args.repoStrategy.trim()}\n</repository-strategy>\n\n${fullMessage}`;
    }

    if (args.prState === "open" && args.prUrl?.trim()) {
      const branchLine = args.branch?.trim() ? ` on branch \`${args.branch.trim()}\`` : "";
      fullMessage = [
        fullMessage,
        "<thread-pr-instructions>",
        `This thread already has an open pull request: ${args.prUrl.trim()}.`,
        `Apply this follow-up work to the existing PR${branchLine}.`,
        "When you finish the requested changes, commit and push them to the same branch.",
        "Do not open a new PR or switch to a different branch unless explicitly asked.",
        "</thread-pr-instructions>",
      ].join("\n\n");
    }

    return fullMessage;
  }

  function normalizeThreadPrState(value: string | null | undefined): "creating" | "open" | "closed" | "merged" | null {
    return value === "creating" || value === "open" || value === "closed" || value === "merged"
      ? value
      : null;
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
    const limit = parseThreadListLimit(query["limit"]);
    if (sessionId) {
      if (!limit) {
        return {
          threads: threadService.listBySession(sessionId).filter((thread) => thread.userId === authUser.id),
          hasMore: false,
        };
      }
      const threads = threadService
        .listBySession(sessionId, limit + 1)
        .filter((thread) => thread.userId === authUser.id);
      return {
        threads: threads.slice(0, limit),
        hasMore: threads.length > limit,
      };
    }
    if (!limit) {
      return { threads: threadService.list(authUser.id), hasMore: false };
    }
    const threads = threadService.list(authUser.id, limit + 1);
    return {
      threads: threads.slice(0, limit),
      hasMore: threads.length > limit,
    };
  });

  /** Create a new thread */
  app.post("/api/threads", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = request.body as Record<string, unknown>;
    const defaults = resolveThreadSelectionDefaults({
      userId: authUser.id,
      sessionId: typeof body["sessionId"] === "string" ? body["sessionId"] : undefined,
      userService: deps.userService,
      sessionState: deps.sessionState,
    });
    const requestedProviderId = (body["providerId"] as ProviderId | undefined) ?? defaults.providerId ?? null;
    const userSelectedProvider = defaults.providerId ?? null;
    const resolvedProvider = resolveThreadProviderId(userSelectedProvider, requestedProviderId);
    if (!resolvedProvider.providerId) {
      return reply.status(400).send({ error: resolvedProvider.error });
    }
    const thread = threadService.create({
      userId: authUser.id,
      sessionId: typeof body["sessionId"] === "string" ? body["sessionId"] : undefined,
      title: typeof body["title"] === "string" ? body["title"] : "New Thread",
      providerId: resolvedProvider.providerId,
      model: typeof body["model"] === "string" ? body["model"] : defaults.model,
      runtimeMode:
        body["runtimeMode"] === "supervised"
          ? "supervised"
          : body["runtimeMode"] === "full-access"
            ? "full-access"
            : defaults.runtimeMode ?? "full-access",
      kind: body["kind"] === "delegation" ? "delegation" : "delivery",
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
      body["prState"] === "creating" || body["prState"] === "open" || body["prState"] === "closed" || body["prState"] === "merged"
        ? body["prState"]
        : body["prState"] === null
          ? null
          : undefined;
    let providerId: ProviderId | undefined;
    if (body["providerId"] !== undefined) {
      const requestedProviderId = body["providerId"] as ProviderId;
      const userSelectedProvider = deps.userService?.getSettings(authUser.id).chatProvider ?? null;
      const resolvedProvider = resolveThreadProviderId(
        userSelectedProvider,
        requestedProviderId,
        existing.providerId as ProviderId,
      );
      if (!resolvedProvider.providerId) {
        return reply.status(400).send({ error: resolvedProvider.error });
      }
      providerId = resolvedProvider.providerId;
    }
    const thread = threadService.update(id, {
      title: typeof body["title"] === "string" ? body["title"] : undefined,
      providerId,
      model: typeof body["model"] === "string" ? body["model"] : undefined,
      runtimeMode: body["runtimeMode"] === "supervised" ? "supervised" : body["runtimeMode"] === "full-access" ? "full-access" : undefined,
      kind: body["kind"] === "delegation" ? "delegation" : body["kind"] === "delivery" ? "delivery" : undefined,
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
        prState === "creating"
          ? "Creating pull request"
          : prState === "open"
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

      // When the PR is merged (or closed), tear down the session,
      // worktree, and branch so re-entering the thread starts fresh.
      if (prState === "merged" || prState === "closed") {
        threadService.clearSession(id);
        const unsub = threadUnsubs.get(id);
        if (unsub) { unsub(); threadUnsubs.delete(id); }
        remoteProviders.delete(id);
        unregisterThreadResume(id);

        // Clean up worktree + branch (best effort, don't block the response)
        if (existing.workingDirectory) {
          cleanupWorktreeRemoteAware(existing.workingDirectory, ws, existing.branch).catch(() => {});
        }
        // Clear the working directory and branch so the next /start creates new ones
        threadService.update(id, { workingDirectory: null, branch: null });
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
      const unsub = threadUnsubs.get(id);
      if (unsub) { unsub(); threadUnsubs.delete(id); }
    }

    // Clean up the worktree and branch on disk (best effort, don't block delete)
    if (existing.workingDirectory) {
      cleanupWorktreeRemoteAware(existing.workingDirectory, ws, existing.branch).catch(() => {});
    }

    threadService.delete(id);
    remoteProviders.delete(id);
    unregisterThreadResume(id);
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
    const mcpServers = [providerRegistry.buildJaitMcpServerRef(config, getRequestBaseUrl(request), {
      sessionId: id,
      workspaceRoot: workingDirectory,
    })];

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
      const unsubscribe = provider.onEvent(buildThreadEventHandler(id, session.id, thread.providerId as ProviderId, {
        suppressTitleTurnEvents: () => suppressTitleTurnEvents,
        decrementSuppressedTurn: () => { suppressTitleTurnEvents--; },
      }));

      threadUnsubs.set(id, unsubscribe);
      registerThreadResume(id, async (message) => {
        const activeThread = threadService.getById(id);
        if (!activeThread?.providerSessionId || activeThread.status !== "running") {
          return { status: "not-running" };
        }
        const queued = pendingInterventionMessages.get(id) ?? [];
        queued.push(message);
        pendingInterventionMessages.set(id, queued);
        return { status: "queued" };
      });

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
      const displaySegments = Array.isArray(body["displaySegments"])
        ? (() => {
            const parsed: Array<{ type: "text"; text: string } | { type: "file"; path: string; name: string }> = [];
            for (const entry of body["displaySegments"] as unknown[]) {
              if (!entry || typeof entry !== "object") continue;
              const record = entry as Record<string, unknown>;
              if (record.type === "text" && typeof record.text === "string") {
                parsed.push({ type: "text", text: record.text });
                continue;
              }
              if (record.type === "file" && typeof record.path === "string") {
                parsed.push({
                  type: "file",
                  path: record.path,
                  name: typeof record.name === "string" ? record.name : record.path.split("/").pop() ?? record.path,
                });
              }
            }
            return parsed.length > 0 ? parsed : undefined;
          })()
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
                const settings = deps.userService?.getSettings(authUser.id);
                generatedTitle = await generateTitleViaApi({
                  task: titleTask,
                  config,
                  apiKeys: settings?.apiKeys,
                  model: thread.model ?? undefined,
                  jaitBackend: providerId === "jait" ? settings?.jaitBackend : undefined,
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
            let repoStrategy: string | null = null;
            if (repoService && workingDirectory) {
              const matchingRepo = repoService.list(authUser.id).find((r) =>
                workingDirectory.startsWith(r.localPath) ||
                workingDirectory.includes(r.name),
              );
              repoStrategy = matchingRepo?.strategy ?? null;
            }
            const fullMessage = buildThreadTurnMessage({
              message,
              repoStrategy,
              prUrl: thread.prUrl,
              prState: normalizeThreadPrState(thread.prState),
              branch: thread.branch,
            });

            const userActivity = threadService.addActivity(id, "message", (displayContent ?? message).slice(0, 500), {
              role: "user",
              content: displayContent ?? message,
              fullContent: message,
              referencedFiles,
              displaySegments,
            });
            broadcastThreadEvent(id, "activity", { activity: userActivity });
            await provider.sendTurn(session.id, fullMessage, attachments);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          threadService.markError(id, errorMsg);
          unregisterThreadResume(id);
          broadcastThreadStatus(id, "error", errorMsg);
        }
      })();

      const updated = getOwnedThread(id, authUser.id);
      if (!assertOwnership(reply, updated, authUser.id, "Thread not found")) return;
      return reply.status(200).send(updated);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      threadService.markError(id, errorMsg);
      unregisterThreadResume(id);
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
    const displaySegments = Array.isArray(body["displaySegments"])
      ? (() => {
          const parsed: Array<{ type: "text"; text: string } | { type: "file"; path: string; name: string }> = [];
          for (const entry of body["displaySegments"] as unknown[]) {
            if (!entry || typeof entry !== "object") continue;
            const record = entry as Record<string, unknown>;
            if (record.type === "text" && typeof record.text === "string") {
              parsed.push({ type: "text", text: record.text });
              continue;
            }
            if (record.type === "file" && typeof record.path === "string") {
              parsed.push({
                type: "file",
                path: record.path,
                name: typeof record.name === "string" ? record.name : record.path.split("/").pop() ?? record.path,
              });
            }
          }
          return parsed.length > 0 ? parsed : undefined;
        })()
      : undefined;

    const thread = getOwnedThread(id, authUser.id);
    if (!assertOwnership(reply, thread, authUser.id, "Thread not found")) return;
    if (!thread.providerSessionId) {
      return reply.status(409).send({ error: "Thread has no active session — use /start instead" });
    }
    if (thread.status === "running") {
      return reply.status(409).send({ error: "A turn is already in progress" });
    }

    const provider = remoteProviders.get(id) ?? providerRegistry.get(thread.providerId as ProviderId);
    if (!provider) return reply.status(400).send({ error: `Provider '${thread.providerId}' not found` });

    // Persist user message BEFORE sendTurn so it survives provider errors
    const userActivity = threadService.addActivity(id, "message", (displayContent ?? message).slice(0, 500), {
      role: "user",
      content: displayContent ?? message,
      fullContent: message,
      referencedFiles,
      displaySegments,
    });
    broadcastThreadEvent(id, "activity", { activity: userActivity });

    threadService.update(id, { status: "running", error: null });
    broadcastThreadStatus(id, "running");

    const fullMessage = buildThreadTurnMessage({
      message,
      prUrl: thread.prUrl,
      prState: normalizeThreadPrState(thread.prState),
      branch: thread.branch,
    });

    await provider.sendTurn(thread.providerSessionId, fullMessage, attachments);
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
    unregisterThreadResume(id);
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
    if (thread.kind === "delegation") {
      return reply.status(400).send({
        error: "Delegation threads do not support pull request creation.",
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
      const creatingThread = threadService.update(thread.id, { prState: "creating" });
      if (creatingThread) {
        broadcastThreadEvent(thread.id, "updated", { thread: creatingThread });
      }
      const startedActivity = threadService.addActivity(
        thread.id,
        "activity",
        "Creating pull request",
        { action: "create_pr_started" },
      );
      broadcastThreadEvent(thread.id, "activity", { activity: startedActivity });

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
          const resetThread = threadService.update(thread.id, { prState: null });
          if (resetThread) {
            broadcastThreadEvent(thread.id, "updated", { thread: resetThread });
          }
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
              const mcpServers = [providerRegistry.buildJaitMcpServerRef(config, getRequestBaseUrl(request), {
                sessionId: id,
                workspaceRoot: wdir,
              })];
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

              const unsub = provider.onEvent(buildThreadEventHandler(id, newSession.id, thread.providerId as ProviderId));
              threadUnsubs.set(id, unsub);
              registerThreadResume(id, async (message) => {
                const activeThread = threadService.getById(id);
                if (!activeThread?.providerSessionId || activeThread.status !== "running") {
                  return { status: "not-running" };
                }
                const queued = pendingInterventionMessages.get(id) ?? [];
                queued.push(message);
                pendingInterventionMessages.set(id, queued);
                return { status: "queued" };
              });

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
          const completedThread = threadService.update(id, {
            status: "completed",
            error: "Push failed and automatic resume was not possible. Use the Start button to retry manually.",
            completedAt: new Date().toISOString(),
            prState: null,
          });
          if (completedThread) {
            broadcastThreadEvent(id, "updated", { thread: completedThread });
          }
          broadcastThreadStatus(id, "completed");
        } else {
          const resumedThread = threadService.update(id, { prState: null });
          if (resumedThread) {
            broadcastThreadEvent(id, "updated", { thread: resumedThread });
          }
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
            : null,
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
      const failedThread = threadService.update(thread.id, { prState: null });
      if (failedThread) {
        broadcastThreadEvent(thread.id, "updated", { thread: failedThread });
      }
      const failedActivity = threadService.addActivity(
        thread.id,
        "error",
        err instanceof Error ? err.message : "Failed to create pull request",
        { action: "create_pr_failed" },
      );
      broadcastThreadEvent(thread.id, "activity", { activity: failedActivity });
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
      let models = await provider.listModels();

      // For jait provider, check the user's configured backend
      if (id === "jait" && deps.userService) {
        const settings = deps.userService.getSettings(authUser.id);
        const userApiKeys = settings.apiKeys ?? {};
        const jaitBackend = settings.jaitBackend || "openai";

        if (jaitBackend === "openrouter") {
          const openRouterKey = userApiKeys["OPENROUTER_API_KEY"]?.trim();
          if (openRouterKey) {
            // Try fetching live models from OpenRouter
            try {
              const orModels = await fetchOpenRouterModels(openRouterKey);
              if (orModels.length > 0) {
                models = orModels;
              } else {
                // Fallback to static list
                const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
                models = OPENROUTER_MODELS;
              }
            } catch {
              const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
              models = OPENROUTER_MODELS;
            }
          } else {
            // No key but openrouter backend selected — show static list
            const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
            models = OPENROUTER_MODELS;
          }
        } else {
          // openai backend — still append OpenRouter models if key present (backwards compat)
          const hasOpenRouterKey = Boolean(userApiKeys["OPENROUTER_API_KEY"]?.trim());
          const baseUrl = userApiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl;
          const isOpenRouterBaseUrl = baseUrl?.toLowerCase().includes("openrouter.ai");
          if (hasOpenRouterKey || isOpenRouterBaseUrl) {
            const { OPENROUTER_MODELS } = await import("../providers/jait-provider.js");
            models = [...models, ...OPENROUTER_MODELS];
          }
        }

        // Prepend recent models (if they exist in the full list)
        const recentIds = settings.recentModels ?? [];
        if (recentIds.length > 0) {
          const modelMap = new Map(models.map((m) => [m.id, m]));
          const recents = recentIds
            .filter((rid) => modelMap.has(rid))
            .map((rid) => ({ ...modelMap.get(rid)!, isRecent: true }));
          // Return recents info in response
          return { models, recentModels: recents.slice(0, 5).map((r) => r.id) };
        }
      }

      return { models };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to list models" });
    }
  });

  app.log.info("Agent thread routes registered at /api/threads");
}
