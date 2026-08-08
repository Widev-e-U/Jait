// Must be the very first import — patches globalThis.crypto before jose loads
import "./crypto-polyfill.js";

import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { WsControlPlane } from "./ws.js";
import { PrimaryLink } from "./services/primary-link.js";
import { openDatabase, migrateDatabase, sqliteBackend } from "./db/index.js";
import { SessionService } from "./services/sessions.js";
import { SessionStateService } from "./services/session-state.js";
import { ProjectStateService } from "./services/project-state.js";
import { AuditWriter } from "./services/audit.js";
import { SurfaceRegistry, TerminalSurfaceFactory, FileSystemSurfaceFactory, RemoteFileSystemSurfaceFactory, BrowserSurfaceFactory, BrowserSurface, RemoteTerminalSurface } from "./surfaces/index.js";
import { resolveProjectPanelOpen, type SurfaceRegistrySnapshot } from "@jait/shared";
import { shouldSyncProjectSurfaceUi } from "./surfaces/project-ui-sync.js";
import { createToolRegistry } from "./tools/index.js";
import { createRemoteToolExecutor, resolveRemoteNodeForSession } from "./tools/remote-executor.js";
import { SchedulerService } from "./scheduler/service.js";
import { HookBus, registerBuiltInHooks } from "./scheduler/hooks.js";
import { MemoryEngine } from "./memory/service.js";
import { SqliteMemoryBackend } from "./memory/sqlite-backend.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version: GATEWAY_VERSION } = require("../package.json") as { version: string };
import { ConsentManager } from "./security/consent-manager.js";
import { SandboxManager } from "./security/sandbox-manager.js";
import { TrustEngine } from "./security/trust-engine.js";
import { getProfile } from "./security/tool-profiles.js";
import { ConsentAwareExecutor } from "./security/consent-executor.js";
import { SecretInputService } from "./services/secret-input.js";
import { UserQuestionService } from "./services/user-questions.js";
import { UserSecretService } from "./services/user-secrets.js";
import { EmailService } from "./services/email/index.js";
import { CalendarService } from "./services/calendar/index.js";
import { UserService } from "./services/users.js";
import { ProviderAccountService } from "./services/provider-accounts.js";
import { ProviderUsageService } from "./services/provider-usage.js";
import { DeviceRegistry } from "./services/device-registry.js";
import { MobilePushService } from "./services/mobile-push.js";
import { VoiceService } from "./voice/service.js";
import { ScreenShareService } from "@jait/screen-share";
import { ThreadService } from "./services/threads.js";
import { RepositoryService } from "./services/repositories.js";
import { PlanService } from "./services/plans.js";
import { RepoProposalService } from "./services/repo-proposals.js";
import { ReminderService } from "./services/reminders.js";
import { ProviderRegistry } from "./providers/registry.js";
import { JaitProvider } from "./providers/jait-provider.js";
import { AcpProvider, loadAcpProviderConfigs } from "./providers/acp-provider.js";
import { VoiceAssistantService } from "./voice-assistant/service.js";
import { verifyAuthToken } from "./security/http-auth.js";
import { ProjectWatcher } from "./services/project-watcher.js";
import type { FileChangeEvent } from "./services/project-watcher.js";
import { GitService } from "./services/git.js";
import { MaintenanceService } from "./services/maintenance.js";
import { NotificationService } from "./services/notifications.js";
import { PreviewService } from "./services/preview.js";
import { setNetworkScanDb } from "./tools/network-tools.js";
import { ArchitectureDiagramService } from "./services/architecture-diagrams.js";
import { CodeGraphService } from "./services/code-graph/code-graphs.js";
import { ensureGraphifyRuntime } from "./services/code-graph/graphify-runtime.js";
import { ProjectService } from "./services/projects.js";
import {
  autoAssignProjectRepositories,
  shouldAutoClaimRepositoryForNode,
} from "./services/project-repositories.js";
import { AssistantProfileService } from "./services/assistant-profiles.js";
import { PluginManager } from "./plugins/manager.js";
import { resolveJaitLlmConfig } from "./services/jait-llm.js";
import { ThreadReviewSyncService } from "./services/thread-review-sync.js";
import { SessionSearchService } from "./services/session-search.js";
import { ChatTracesService } from "./services/chat-traces.js";


/**
 * How long a CLI provider may take to answer before the picker moves on.
 * A healthy Claude Code probe measures ~4s cold, so this leaves headroom
 * while staying far below the adapter's own 20s ceiling.
 */
const CLI_CATALOGUE_BUDGET_MS = 8_000;

/**
 * Resolve `promise`, or an empty list once the budget is up. The promise is
 * deliberately left running: provider adapters cache their catalogue on
 * success, so a slow probe still pays off for the next call.
 */
async function withCatalogueBudget<T>(
  promise: Promise<T[]>,
  budgetMs: number,
  onOverrun: () => void,
): Promise<T[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<T[]>((resolve) => {
    timer = setTimeout(() => { onOverrun(); resolve([]); }, budgetMs);
  });
  try {
    return await Promise.race([promise.catch(() => [] as T[]), budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Bind, retrying on EADDRINUSE for up to `maxWaitMs`. The bare-process
 * redeploy handoff (redeploy-tools.ts) spawns the replacement on the same
 * port the outgoing process still holds, then kills the old process shortly
 * after — without a retry here, that race reliably crashes the replacement
 * before the port is actually free, leaving nothing listening.
 */
async function listenWithRetryOnConflict(
  server: { listen: (opts: { port: number; host: string }) => Promise<unknown> },
  opts: { port: number; host: string },
  maxWaitMs = 20_000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await server.listen(opts);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "EADDRINUSE" || Date.now() - start >= maxWaitMs) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function main() {
  await ensureGraphifyRuntime({
    onProgress: (message) => console.log(`[graphify] ${message}`),
  });
  const config = loadConfig();

  if (config.nodeOnly) {
    if (!config.primaryGateway) {
      throw new Error("JAIT_NODE_ONLY requires JAIT_PRIMARY_GATEWAY");
    }
    const primaryLink = new PrimaryLink({
      primaryGateway: config.primaryGateway,
      primaryToken: config.primaryToken || undefined,
      nodeName: config.nodeName || undefined,
    });
    primaryLink.start();
    console.log("Jait node listening only through outbound primary link; HTTP dashboard/API disabled.");

    const shutdownNode = () => {
      console.log("Shutting down node link...");
      primaryLink.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdownNode);
    process.on("SIGTERM", shutdownNode);
    return;
  }

  // Initialize SQLite database
  const { db, sqlite } = await openDatabase();
  migrateDatabase(sqlite);
  setNetworkScanDb(sqlite);
  console.log(`Database initialized at ~/.jait/data/jait.db (${sqliteBackend})`);

  // Services
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const projectService = new ProjectService(db);
  const assistantProfileService = new AssistantProfileService(db);
  const projectState = new ProjectStateService(db);
  const userService = new UserService(db);
  const audit = new AuditWriter(db);
  const deviceRegistry = new DeviceRegistry();
  const mobilePush = MobilePushService.fromEnvironment(db);

  // Agent threads + provider registry
  const threadService = new ThreadService(db);
  const sessionSearchService = new SessionSearchService(sqlite);
  const chatTracesService = new ChatTracesService(sqlite);

  // ── Recover threads stuck in "running" from a previous crash/restart ──
  const staleThreads = threadService.listRunning();
  if (staleThreads.length > 0) {
    for (const t of staleThreads) {
      threadService.update(t.id, {
        status: "interrupted",
        providerSessionId: null,
        error: "Gateway restarted — session was lost. You can restart this thread.",
      });
      threadService.addActivity(t.id, "session", "Gateway restarted — agent session was lost");
    }
    console.log(`Recovered ${staleThreads.length} stale thread(s) from previous run`);
  }

  const repoService = new RepositoryService(db);
  const gitService = new GitService();
  const planService = new PlanService(db);
  const repoProposalService = new RepoProposalService(db);
  const reminderService = new ReminderService(db);
  const userSecretService = new UserSecretService(db, config.jwtSecret);
  const emailService = new EmailService(db, userSecretService);
  const calendarService = new CalendarService(db, userSecretService);
  const maintenanceService = new MaintenanceService(db, planService, repoService);
  const architectureDiagramService = new ArchitectureDiagramService(db);
  const codeGraphService = new CodeGraphService(db);
  const providerRegistry = new ProviderRegistry();
  const acpProviderConfigs = loadAcpProviderConfigs();
  for (const acpProvider of acpProviderConfigs) {
    if (acpProvider.auth === false) providerRegistry.register(new AcpProvider(acpProvider));
  }
  const providerUsageService = new ProviderUsageService(db);
  const providerAccountService = new ProviderAccountService(db, providerRegistry, acpProviderConfigs, undefined, providerUsageService);
  providerAccountService.load();

  // Surface registry — register all surface factories
  const surfaceRegistry = new SurfaceRegistry();
  surfaceRegistry.register(new TerminalSurfaceFactory());
  surfaceRegistry.register(new FileSystemSurfaceFactory());
  surfaceRegistry.register(new BrowserSurfaceFactory());

  // WebSocket control plane (created early so consent callbacks can reference it)
  const ws = new WsControlPlane(config);
  const threadReviewSync = new ThreadReviewSyncService({ threadService, ws });

  // Notification service — broadcasts to all connected clients
  const notifications = new NotificationService(ws);
  providerUsageService.attachNotifications(notifications);

  // Project file watcher — uses @parcel/watcher (same as VS Code) for
  // native recursive watching with event coalescing.
  const projectWatcher = new ProjectWatcher();
  /** Active session ID for the current project watcher */
  let watcherSessionId = "";
  /** Active surface ID for the current project watcher */
  let watcherSurfaceId = "";

  projectWatcher.on("changes", (changes: FileChangeEvent[]) => {
    if (!watcherSessionId) return;
    ws.broadcast(watcherSessionId, {
      type: "fs.changes" as any,
      sessionId: watcherSessionId,
      timestamp: new Date().toISOString(),
      payload: { surfaceId: watcherSurfaceId, changes },
    });
  });
  projectWatcher.on("error", (err: Error) => {
    console.error("Project watcher error:", err.message);
  });

  // Register remote-filesystem factory (needs ws reference for proxying ops to nodes)
  surfaceRegistry.register(new RemoteFileSystemSurfaceFactory(ws));
  console.log(`Surfaces registered: ${surfaceRegistry.registeredTypes.join(", ")}`);
  const previewService = new PreviewService(surfaceRegistry);
  const browserSandboxManager = new SandboxManager();
  const startupBrowserCleanup = await browserSandboxManager.cleanupBrowserSandboxes().catch((err) => {
    console.warn("[browser] Failed to clean stale browser sandboxes on startup:", err instanceof Error ? err.message : err);
    return [];
  });
  if (startupBrowserCleanup.length > 0) {
    console.log(`[browser] Removed ${startupBrowserCleanup.length} stale browser sandbox container(s) from previous runs.`);
  }
  previewService.onSessionChanged((session) => {
    ws.broadcastAll({
      type: "preview.session" as any,
      sessionId: session.sessionId,
      timestamp: new Date().toISOString(),
      payload: { session },
    });
  });
  ws.getSurfaceSnapshot = (): SurfaceRegistrySnapshot => ({
    serverTime: new Date().toISOString(),
    surfaces: surfaceRegistry.listSnapshots(),
  });

  // Auto-wire terminal output → WebSocket for ALL terminals (REST, tool, etc.)
  // Also broadcast project activation for filesystem surfaces.
  surfaceRegistry.onSurfaceStarted = (id, surface) => {
    ws.broadcastAll({
      type: "surface.updated",
      sessionId: surface.sessionId ?? "",
      timestamp: new Date().toISOString(),
      payload: { surface: surface.snapshot() },
    });
    if (surface.type === "terminal" && "write" in surface) {
      (surface as import("./surfaces/terminal.js").TerminalSurface).onOutput = (data) =>
        ws.broadcastTerminalOutput(id, data);
    }
    if (surface.type === "filesystem" || surface.type === "remote-filesystem") {
      const snap = surface.snapshot();
      const sid = snap.sessionId ?? "";
      const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
      const nodeId = (snap.metadata as Record<string, unknown>)?.nodeId as string | undefined;
      const requestedPanelOpen = (snap.metadata as Record<string, unknown>)?.panelOpen;
      const panelOpen = resolveProjectPanelOpen(
        typeof requestedPanelOpen === 'boolean' ? requestedPanelOpen : undefined,
        null,
      );
      const panelState = { open: panelOpen, remotePath: projectRoot, surfaceId: id, nodeId: nodeId ?? 'gateway' };

      // Start native file watcher for local filesystems
      if (surface.type === "filesystem" && typeof projectRoot === "string") {
        watcherSessionId = sid;
        watcherSurfaceId = id;
        projectWatcher.watch(projectRoot).catch((err) =>
          console.error("Failed to start project watcher:", err.message),
        );
      }

      if (!shouldSyncProjectSurfaceUi(surface)) return;

      // Push a UI command to open the project panel
      ws.sendUICommand(
        {
          command: "project.open",
          data: {
            surfaceId: id,
            projectRoot: projectRoot as string,
            nodeId: nodeId ?? 'gateway',
            panelOpen,
          },
        },
        sid,
      );
      // Also broadcast ui.state-sync so handleStateSync fires on all clients
      ws.broadcast(sid, {
        type: "ui.state-sync",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: { key: "project.panel", value: panelState },
      });
      if (sid) {
        const session = sessionService.getById(sid);
        if (session?.projectId) {
          try {
            const existing = projectState.get(session.projectId, ["project.ui"])["project.ui"] as {
              panel?: unknown;
              tabs?: unknown;
              layout?: unknown;
              terminal?: unknown;
              preview?: unknown;
            } | null | undefined;
            projectState.set(session.projectId, {
              "project.ui": {
                panel: panelState,
                tabs: existing?.tabs ?? null,
                layout: existing?.layout ?? null,
                terminal: existing?.terminal ?? null,
                preview: existing?.preview ?? null,
              },
            });
          } catch (err) {
            console.error("Failed to persist project state:", err);
          }
        }
      }
    }
  };

  surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
    ws.broadcastAll({
      type: "surface.disconnected",
      sessionId: surface.sessionId ?? "",
      timestamp: new Date().toISOString(),
      payload: { surfaceId: id, surface: surface.snapshot(), reason: context?.reason ?? null },
    });
    if (surface.type === "filesystem" || surface.type === "remote-filesystem") {
      // Stop the file watcher if it was watching this surface
      if (watcherSurfaceId === id) {
        projectWatcher.stop().catch((err) =>
          console.error("Failed to stop project watcher:", err.message),
        );
        watcherSessionId = "";
        watcherSurfaceId = "";
      }

      const snap = surface.snapshot();
      const sid = snap.sessionId ?? "";
      ws.sendUICommand(
        {
          command: "project.close",
          data: { surfaceId: id },
        },
        sid,
      );
      // Also broadcast ui.state-sync so handleStateSync fires on all clients
      ws.broadcast(sid, {
        type: "ui.state-sync",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: { key: "project.panel", value: null },
      });
      if (sid && context?.reason !== "shutdown") {
        const session = sessionService.getById(sid);
        if (session?.projectId) {
          try {
            const existing = projectState.get(session.projectId, ["project.ui"])["project.ui"] as {
              panel?: unknown;
              tabs?: unknown;
              layout?: unknown;
              terminal?: unknown;
              preview?: unknown;
            } | null | undefined;
            projectState.set(session.projectId, {
              "project.ui": {
                panel: null,
                tabs: existing?.tabs ?? null,
                layout: existing?.layout ?? null,
                terminal: existing?.terminal ?? null,
                preview: existing?.preview ?? null,
              },
            });
          } catch (err) {
            console.error("Failed to clear project state:", err);
          }
        }
      }
    }
  };

  // Hook bus + built-ins
  const hooks = new HookBus();
  registerBuiltInHooks(hooks);


  // Memory engine — Sprint 6
  const memory = new MemoryEngine({
    backend: new SqliteMemoryBackend(db),
    memoryDir: join(homedir(), ".jait", "memory"),
  });

  // Tool registry — Sprint 3 + Sprint 10
  const voiceService = new VoiceService();
  const screenShare = new ScreenShareService();
  let toolRegistry = createToolRegistry(surfaceRegistry, {
    memoryService: memory,
    hooks,
    voiceService,
    screenShare,
    ws,
    threadMcpConfig: { host: config.host, port: config.port },
    threadService,
    providerRegistry,
    userService,
    sessionState,
    projectService,
    repoService,
    repoProposalService,
    reminderService,
    sessionSearchService,
    chatTracesService,
    gitService,
    userSecretService,
    emailService,
    calendarService,
    maintenanceService,
    notifications,
    previewService,
    architectureDiagramService,
    codeGraphService,
  });
  providerRegistry.register(new JaitProvider({
    config,
    threadService,
    userService,
    toolRegistry,
    toolExecutor: (toolName, input, context) => toolRegistry.execute(toolName, input, context, audit),
  }));
  console.log(`Providers registered: ${providerRegistry.list().map(p => p.id).join(", ")}`);
  console.log(`Tools registered: ${toolRegistry.listNames().join(", ")}`);

  // Consent & Trust — Sprint 4
  const trustEngine = new TrustEngine(db);
  const secretInputService = new SecretInputService({
    defaultTimeoutMs: 120_000,
    onRequest: (request) => {
      ws.broadcastAll({
        type: "secret.requested",
        sessionId: request.sessionId,
        timestamp: new Date().toISOString(),
        payload: request,
      });
      console.log(`Secret requested: ${request.title} (${request.id})`);
    },
    onResolved: (request) => {
      ws.broadcastAll({
        type: "secret.resolved",
        sessionId: request.sessionId,
        timestamp: new Date().toISOString(),
        payload: { id: request.id, sessionId: request.sessionId, status: request.status },
      });
      console.log(`Secret request ${request.status}: ${request.id}`);
    },
  });
  const userQuestionService = new UserQuestionService({
    defaultTimeoutMs: 300_000,
    onRequest: (request) => {
      ws.broadcastAll({
        type: "user-question.requested",
        sessionId: request.sessionId,
        timestamp: new Date().toISOString(),
        payload: request,
      });
      console.log(`User question requested: ${request.title} (${request.id})`);
      void mobilePush.sendQuestion(request).catch((error) => {
        console.warn("[mobile-push] Failed to deliver question", error);
      });
    },
    onResolved: (request) => {
      ws.broadcastAll({
        type: "user-question.resolved",
        sessionId: request.sessionId,
        timestamp: new Date().toISOString(),
        payload: { id: request.id, sessionId: request.sessionId, status: request.status },
      });
      console.log(`User question ${request.status}: ${request.id}`);
    },
  });
  const activeToolProfileName = "coding" as const;
  // Bridges to the channel manager (constructed later) so messaging-channel
  // consent prompts can be sent/cleared in-band. Assigned after the manager exists.
  let channelConsentRequestBridge: ((request: import("./security/consent-manager.js").ConsentRequest) => void) | undefined;
  let channelConsentDecisionBridge: ((decision: import("./security/consent-manager.js").ConsentDecision) => void) | undefined;
  const consentManager = new ConsentManager({
    defaultTimeoutMs: 120_000,
    db,
    onRequest: (request) => {
      ws.broadcastAll({
        type: "consent.required",
        sessionId: request.sessionId,
        timestamp: new Date().toISOString(),
        payload: request,
      });
      // Mirror to the originating messaging channel (no-op for web sessions).
      channelConsentRequestBridge?.(request);
      console.log(`Consent required: ${request.toolName} (${request.id})`);
    },
    onDecision: (decision) => {
      ws.broadcastAll({
        type: "consent.resolved",
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: decision,
      });
      channelConsentDecisionBridge?.(decision);
      console.log(`Consent ${decision.approved ? "approved" : "rejected"}: ${decision.requestId}`);
    },
  });
  const permissions = getProfile(activeToolProfileName);
  const sessionApprovalsBySession = new Map<string, Set<string>>();
  const getSessionApprovals = (sessionId: string): Set<string> => {
    const existing = sessionApprovalsBySession.get(sessionId);
    if (existing) return existing;
    const created = new Set<string>();
    sessionApprovalsBySession.set(sessionId, created);
    return created;
  };

  // The actual (post-consent) tool execution. When the session's project
  // lives on a remote node (e.g. a Windows desktop while the gateway runs
  // on Linux), we transparently delegate terminal/execute/search/file tool
  // calls to that node via the WS control plane instead of running them on
  // the gateway's local filesystem. Gateway-local tools (memory, cron, …)
  // always run here regardless of the project location.
  const resolveAndExecute = async (
    toolName: string,
    input: unknown,
    context: import("./tools/contracts.js").ToolContext,
    auditWriter?: typeof audit,
  ): Promise<import("./tools/contracts.js").ToolResult> => {
    const sessionRecord = sessionService.getById(context.sessionId);
    const projectRecord = sessionRecord?.projectId
      ? projectService.getById(sessionRecord.projectId, context.userId)
      : undefined;
    const projectPath = projectRecord?.rootPath ?? sessionRecord?.projectPath;
    const remoteNodeId = resolveRemoteNodeForSession(ws, projectPath ?? undefined, projectRecord?.nodeId);
    const executor = createRemoteToolExecutor(
      {
        ws,
        localExecutor: (tName, tInput, ctx) => toolRegistry.execute(tName, tInput, ctx, auditWriter),
      },
      remoteNodeId,
    );
    return executor(toolName, input, context);
  };

  const toolExecutor = async (
    toolName: string,
    input: unknown,
    context: import("./tools/contracts.js").ToolContext,
    options?: { dryRun?: boolean; consentTimeoutMs?: number },
  ) => {
    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager,
      trustEngine,
      audit,
      permissions,
      sessionApprovals: getSessionApprovals(context.sessionId),
      profileName: activeToolProfileName,
      delegate: (tName, tInput, ctx) => resolveAndExecute(tName, tInput, ctx, audit),
    });
    return executor.execute(toolName, input, context, options);
  };

  const scheduler = new SchedulerService({
    db,
    executeTool: async (execution) => {
      const userApiKeys = execution.userId ? userService.getSettings(execution.userId).apiKeys : undefined;
      const context = {
        sessionId: execution.sessionId,
        actionId: `sched-${Date.now()}`,
        projectRoot: execution.projectRoot,
        requestedBy: "scheduler",
        userId: execution.userId ?? undefined,
        apiKeys: userApiKeys,
      } as const;
      return toolExecutor(execution.toolName, execution.input, context);
    },
    onExecuted: (result) => {
      hooks.emit("scheduler.executed", result);
      ws.broadcastAll({
        type: "session.created",
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { type: "scheduler.executed", ...result },
      });
    },
  });

  // Rebuild tool registry with Sprint 7 scheduler + gateway status tools.
  // shutdown ref is assigned after server.listen — use late-bound wrapper
  let shutdownFn: (() => Promise<void>) | undefined;
  const shutdownRef = async () => { if (shutdownFn) await shutdownFn(); else process.exit(0); };

  toolRegistry = createToolRegistry(surfaceRegistry, {
    scheduler,
    sessionService,
    ws,
    startedAt: Date.now(),
    memoryService: memory,
    hooks,
    voiceService,
    screenShare,
    threadMcpConfig: { host: config.host, port: config.port },
    threadService,
    providerRegistry,
    userService,
    projectService,
    repoService,
    repoProposalService,
    reminderService,
    sessionSearchService,
    chatTracesService,
    gitService,
    maintenanceService,
    notifications,
    config,
    shutdown: shutdownRef,
    previewService,
    architectureDiagramService,
    codeGraphService,
    secretInputService,
    userQuestionService,
    userSecretService,
    emailService,
    calendarService,
  });
  console.log(`Tools registered: ${toolRegistry.listNames().join(", ")}`);

  try {
    const projectRepoAssignments = await autoAssignProjectRepositories({
      projectService,
      repoService,
      gitService,
      ws,
    });
    if (projectRepoAssignments.length > 0) {
      console.log(`Auto-assigned ${projectRepoAssignments.length} project repos`);
    }
  } catch (err) {
    console.error("Project repo auto-assignment failed:", err);
  }

  scheduler.start(30_000);
  threadReviewSync.start();

  // Seed built-in "Network Scan" job if it doesn't already exist
  {
    const existingJobs = scheduler.list();
    const hasNetworkScan = existingJobs.some(
      (j) => j.toolName === "network.scan" && j.name === "Network Scan",
    );
    if (!hasNetworkScan) {
      // Remove legacy "Device Discovery" job if present
      const legacy = existingJobs.find(
        (j) => j.toolName === "network.scan" && j.name === "Device Discovery",
      );
      if (legacy) scheduler.remove(legacy.id);

      scheduler.create({
        name: "Network Scan",
        cron: "0 * * * *", // every hour at :00
        toolName: "network.scan",
        input: {
          __jaitJobMeta: {
            jobType: "system_job",
            description:
              "Scans the local network for devices, checks SSH connectivity, and detects running Jait gateway nodes.",
          },
        },
        enabled: true,
      });
      console.log("Seeded built-in job: Network Scan (hourly)");
    }
  }

  // Seed built-in "Self-Test" maintenance job if it doesn't already exist
  {
    const existingJobs = scheduler.list();
    const hasSelfTest = existingJobs.some(
      (j) => j.toolName === "maintenance.run" && j.name === "Self-Test",
    );
    if (!hasSelfTest) {
      scheduler.create({
        name: "Self-Test",
        cron: "30 3 * * *", // daily at 03:30 UTC
        toolName: "maintenance.run",
        input: {
          __jaitJobMeta: {
            jobType: "system_job",
            description:
              "Runs typecheck, tests, and lint on all registered repositories. " +
              "Creates fix plans with proposed tasks when checks fail. " +
              "Review and approve proposed tasks to start agent fix threads.",
          },
        },
        enabled: false, // disabled by default — user enables when ready
      });
      console.log("Seeded built-in job: Self-Test (daily, disabled — enable to activate)");
    }
  }

  // Seed built-in memory background jobs if they don't already exist.
  {
    const existingJobs = scheduler.list();
    const hasMemoryReview = existingJobs.some(
      (j) => j.toolName === "memory.review_chats" && j.name === "Memory Review",
    );
    if (!hasMemoryReview) {
      scheduler.create({
        name: "Memory Review",
        cron: "10 2 * * *", // daily at 02:10 UTC
        toolName: "memory.review_chats",
        input: {
          limit: 300,
          __jaitJobMeta: {
            jobType: "system_job",
            description:
              "Scans older chat messages for durable preferences and project facts that should become editable Memory entries.",
          },
        },
        enabled: true,
      });
      console.log("Seeded built-in job: Memory Review (daily)");
    }

    const hasMemoryHygiene = existingJobs.some(
      (j) => j.toolName === "memory.hygiene" && j.name === "Memory Hygiene",
    );
    if (!hasMemoryHygiene) {
      scheduler.create({
        name: "Memory Hygiene",
        cron: "40 2 * * 0", // weekly Sunday at 02:40 UTC
        toolName: "memory.hygiene",
        input: {
          __jaitJobMeta: {
            jobType: "system_job",
            description:
              "Archives stale low-value Memory entries and tags likely conflicts for user review.",
          },
        },
        enabled: true,
      });
      console.log("Seeded built-in job: Memory Hygiene (weekly)");
    }
  }

  console.log(`Consent manager initialized (profile: ${activeToolProfileName}, timeout: 120s, ${permissions.size} tool permissions)`);

  // External messaging channels are populated by enabled extensions.
  const { ChannelManager } = await import("./channels/manager.js");
  // Resolve the owner user's stored context (API keys, backend, picked model,
  // disabled tools) for channel agent turns. Channels run without request
  // context, so this reads the owner's persisted settings live — replies use
  // the same provider/model/tool surface as the web chat.
  const resolveChannelAuth = () => {
    try {
      const owner = sqlite
        .prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
        .get() as { id?: string } | undefined;
      if (!owner?.id) return undefined;
      const s = userService.getSettings(owner.id);
      return {
        userId: owner.id,
        apiKeys: s.apiKeys,
        jaitBackend: s.jaitBackend,
        model: s.selectedModel ?? undefined,
        reasoningEffort: s.reasoningEffort ?? undefined,
        disabledTools: s.disabledTools?.length ? new Set(s.disabledTools) : undefined,
      };
    } catch {
      return undefined;
    }
  };
  const channelManager = new ChannelManager({
    sqlite,
    toolRegistry,
    audit,
    consentManager,
    projectRoot: process.cwd(),
    resolveAuth: resolveChannelAuth,
    // Skill catalogue for the channel agent's system prompt — gives WhatsApp the
    // same skills as the web chat. `skillRegistry` is declared below; the
    // closure runs at reply time (after startup), so it is always initialized.
    resolveSkills: () => skillRegistry.listEnabled(),
    resolveLLM: (requestedModel?: string) => {
      // Read the owner's selected provider/model from persisted settings —
      // otherwise replies fall back to the default model and ignore the
      // chosen provider. A per-channel `/model` override wins over both.
      const a = resolveChannelAuth();
      return resolveJaitLlmConfig({
        config,
        apiKeys: a?.apiKeys,
        jaitBackend: a?.jaitBackend as never,
        requestedModel: requestedModel ?? a?.model,
      });
    },
    // Catalogue behind `/model` — the HTTP backends resolved through the same
    // service the web UI model picker uses, plus the CLI provider accounts
    // (Claude Code, Codex) the owner has logged in.
    resolveModels: async () => {
      const owner = resolveChannelAuth();
      if (!owner?.userId) return [];
      const userId = owner.userId;

      const jaitProvider = providerRegistry.getForUser("jait", userId);
      const fallbackModels = (await jaitProvider?.listModels?.()) ?? [];
      const { listJaitModels } = await import("./services/jait-models.js");

      // Only account-backed providers: the shared ACP entries (cursor, pi, …)
      // have no login behind them, so probing them costs a 20s timeout each and
      // yields nothing.
      const cliProviders = providerRegistry.list().filter((candidate) =>
        candidate.id !== "jait" && candidate.ownerUserId === userId);

      // Probing a CLI provider spawns its process, so the catalogues are
      // gathered concurrently and a provider that is down contributes nothing
      // instead of failing the whole list.
      const [httpModels, ...cliCatalogues] = await Promise.all([
        listJaitModels({ config, apiKeys: owner.apiKeys, fallbackModels }),
        ...cliProviders.map(async (candidate) => {
          try {
            // No availability probe: it spawns the CLI binary just to read
            // `--version`, which costs more than the catalogue call itself.
            // listModels() already fails soft when the provider is down.
            //
            // The probe opens an ACP session and gives up only after 20s, which
            // is far too long to keep someone waiting on a model picker. Wait a
            // short budget, then answer without this provider — the probe keeps
            // running and populates the adapter's own cache, so the next call
            // has the models. Better to miss them once than to stall the menu.
            const catalogue = candidate.listModels?.() ?? Promise.resolve([]);
            const models = await withCatalogueBudget(
              catalogue,
              CLI_CATALOGUE_BUDGET_MS,
              () => {
                console.warn(`[channels] ${candidate.id}: model catalogue slow, answering without it`);
                // Once it does answer, the cached partial list is stale.
                void catalogue
                  .then((late) => { if (late.length > 0) channelManager.invalidateModelCache(); })
                  .catch(() => { /* nothing to refresh */ });
              },
            );
            return models.map((model) => ({
              id: model.id,
              label: model.name,
              group: candidate.info.name,
              provider: candidate.id,
            }));
          } catch {
            return [];
          }
        }),
      ]);

      return [
        ...httpModels.map((model) => ({ id: model.id, label: model.name, group: model.group })),
        ...cliCatalogues.flat(),
      ];
    },
    providerRegistry,
    gatewayAddress: { host: config.host, port: config.port },
  });
  // Resolve the model catalogue in the background so the first `/model` in a
  // chat doesn't pay for a cold CLI provider probe.
  channelManager.warmModelCatalogue();

  // Delivery back into a chat — the tools behind "remind me tomorrow at 5".
  // Registered here rather than in createToolRegistry because they need the
  // channel manager, which is built after the registry.
  {
    const { createChannelSendTool, createChannelRemindTool } = await import("./tools/channel-tools.js");
    const { hostTimeZone } = await import("./channels/assistant.js");
    const channelToolDeps = { channels: channelManager, scheduler, defaultTimeZone: hostTimeZone };
    toolRegistry.register(createChannelSendTool(channelToolDeps));
    toolRegistry.register(createChannelRemindTool(channelToolDeps));
  }

  // Forward gateway notifications (maintenance, routines, provider limits) to
  // every channel the user opted in via Settings → Connectors.
  notifications.addSink((notification) => {
    void channelManager.notify({
      title: notification.title,
      body: notification.body,
      level: notification.level,
      link: notification.link,
    }).catch((err) => console.error("Channel notification failed:", err));
  });

  // Now that the channel manager exists, route channel-session consent prompts
  // to it (sends the in-band yes/no message; clears mappings on decision).
  channelConsentRequestBridge = (request) => channelManager.handleConsentRequest(request);
  channelConsentDecisionBridge = (decision) => channelManager.handleConsentDecision(decision);

  // Plugin manager — discover and load enabled extensions
  // Also scan for OpenClaw-format plugins in common locations
  const openclawDirs: string[] = [];
  const openclawEnvDir = process.env.OPENCLAW_EXTENSIONS_DIR;
  if (openclawEnvDir) openclawDirs.push(openclawEnvDir);
  // Auto-detect sibling openclaw/extensions directory (dev convenience)
  const siblingOpenClaw = join(process.cwd(), "..", "openclaw", "extensions");
  try { const s = await import("node:fs").then(fs => fs.statSync(siblingOpenClaw)); if (s.isDirectory()) openclawDirs.push(siblingOpenClaw); } catch { /* not present */ }

  const pluginManager = new PluginManager({
    sqlite,
    toolRegistry,
    channelManager,
    gatewayVersion: GATEWAY_VERSION,
    projectRoot: process.cwd(),
    openclawExtensionsDirs: openclawDirs,
  });
  await pluginManager.syncAndLoad();

  // Built-in connectors — selectable in Settings → Connectors without installing
  // an extension first. Registered after plugins so a plugin that contributes the
  // same channel id keeps ownership of it.
  const { TelegramConnector } = await import("./channels/telegram/connector.js");
  const builtinConnectors = [new TelegramConnector()];
  for (const connector of builtinConnectors) {
    if (channelManager.list().some((c) => c.id === connector.id)) continue;
    channelManager.register(connector);
  }

  // Skill registry — discover skills from bundled, user dir, project, and OpenClaw
  const { SkillRegistry, userSkillsDir } = await import("./skills/index.js");
  const skillRegistry = new SkillRegistry();
  const skillScanDirs: { path: string; source: "bundled" | "user" | "project" | "plugin" }[] = [
    // Bundled skills shipped with the gateway package
    { path: join(typeof (import.meta as any).dir === "string" ? (import.meta as any).dir : dirname(fileURLToPath(import.meta.url)), "..", "skills"), source: "bundled" },
    { path: userSkillsDir(), source: "user" },
    { path: join(process.cwd(), ".jait", "skills"), source: "project" },
    { path: join(process.cwd(), ".agents", "skills"), source: "project" },
  ];
  // Scan OpenClaw skills directory if present
  const siblingOpenClawSkills = join(process.cwd(), "..", "openclaw", "skills");
  try { const fs = await import("node:fs"); if (fs.statSync(siblingOpenClawSkills).isDirectory()) skillScanDirs.push({ path: siblingOpenClawSkills, source: "bundled" }); } catch { /* not present */ }
  const openclawSkillsEnv = process.env.OPENCLAW_SKILLS_DIR;
  if (openclawSkillsEnv) skillScanDirs.push({ path: openclawSkillsEnv, source: "bundled" });
  await skillRegistry.discover(skillScanDirs);
  console.log(`Skills: ${skillRegistry.size} discovered (${skillRegistry.listEnabled().length} enabled)`);

  // ClawHub marketplace client
  const { ClawHubClient } = await import("./clawhub/client.js");
  const clawhubClient = new ClawHubClient(process.env.CLAWHUB_REGISTRY);

  // Agent-callable management tools — registered now that the skill registry,
  // plugin manager, and ClawHub client exist (they post-date the tool registry
  // because the plugin manager itself depends on the tool registry).
  const { createSkillsManageTool, createExtensionsManageTool } = await import("./tools/index.js");
  toolRegistry.register(createSkillsManageTool({ skillRegistry, clawhub: clawhubClient }));
  toolRegistry.register(createExtensionsManageTool({ pluginManager, clawhub: clawhubClient }));

  // Voice assistant (OpenAI Realtime — global session, not project-scoped)
  const voiceAssistantService = new VoiceAssistantService({
    config,
    verifyToken: (token) => verifyAuthToken(token, config.jwtSecret),
    userService,
    sessionService,
    sessionState,
    threadService,
    projectService,
    memoryService: memory,
    toolRegistry,
    providerRegistry,
    toolExecutor: async (name, input, ctx) => toolExecutor(name, input, ctx),
    getUserApiKeys: (userId) => userService.getSettings(userId).apiKeys,
  });

  const server = await createServer(config, {
    db,
    sqlite,
    sessionService,
    userService,
    audit,
    surfaceRegistry,
    toolRegistry,
    consentManager,
    trustEngine,
    activeToolProfileName,
    toolPermissions: permissions,
    ws,
    hooks,
    scheduler,
    hookSecret: config.hookSecret,
    onWakeHook: async () => scheduler.tick(),
    onAgentHook: async (payload) => {
      hooks.emit("agent.webhook", payload);
      return { accepted: true };
    },
    memoryService: memory,
    deviceRegistry,
    mobilePush,
    sessionState,
    projectService,
    assistantProfileService,
    projectState,
    voiceService,
    toolExecutor,
    screenShare,
    threadService,
    repoService,
    planService,
    repoProposalService,
    reminderService,
    maintenanceService,
    notifications,
    providerRegistry,
    providerAccountService,
    providerUsageService,
    previewService,
    architectureDiagramService,
    codeGraphService,
    gitService,
    secretInputService,
    userQuestionService,
    userSecretService,
    emailService,
    calendarService,
    pluginManager,
    skillRegistry,
    clawhubClient,
    channelManager,
    voiceAssistantService,
    shutdown: shutdownRef,
  });

  // Wire terminal WS ↔ PTY
  ws.onTerminalInput = (terminalId, data) => {
    try {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "write" in surface) {
        (surface as import("./surfaces/terminal.js").TerminalSurface).write(data);
      }
    } catch (err) {
      console.error(`Terminal write error (${terminalId}):`, err);
    }
  };
  ws.onTerminalResize = (terminalId, cols, rows) => {
    try {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "resize" in surface) {
        (surface as import("./surfaces/terminal.js").TerminalSurface).resize(cols, rows);
      }
    } catch (err) {
      console.error(`Terminal resize error (${terminalId}):`, err);
    }
  };
  ws.onTerminalReplay = (terminalId) => {
    try {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "getRecentOutput" in surface) {
        (surface as import("./surfaces/terminal.js").TerminalSurface).touch();
        return (surface as import("./surfaces/terminal.js").TerminalSurface).getRecentOutput();
      }
    } catch {
      // ignore
    }
    return null;
  };
  ws.onRemoteTerminalOutput = (terminalId, data, nodeId) => {
    const surface = surfaceRegistry.getSurface(terminalId);
    if (!(surface instanceof RemoteTerminalSurface)) return;
    const ownerNodeId = surface.snapshot().metadata.nodeId;
    if (nodeId && ownerNodeId !== nodeId) return;
    surface.ingestOutput(data);
  };
  ws.onRemoteTerminalExit = (terminalId, exitCode, signal, nodeId) => {
    const surface = surfaceRegistry.getSurface(terminalId);
    if (!(surface instanceof RemoteTerminalSurface)) return;
    const ownerNodeId = surface.snapshot().metadata.nodeId;
    if (nodeId && ownerNodeId !== nodeId) return;
    surface.ingestExit(exitCode, signal);
  };

  // Wire consent WS ↔ ConsentManager
  ws.onConsentApprove = (requestId) => {
    consentManager.approve(requestId, "click");
  };
  ws.onConsentReject = (requestId, reason) => {
    consentManager.reject(requestId, "click", reason);
  };

  // UI state sync (client → server → DB → other clients)
  ws.onUIStateUpdate = (sid, key, value, clientId) => {
    try {
      sessionState.set(sid, { [key]: value });
      if (key === "project.layout" || key === "project.panel") {
        const session = sessionService.getById(sid);
        if (session?.projectId) {
          const existing = projectState.get(session.projectId, ["project.ui"])["project.ui"] as {
            panel?: unknown;
            tabs?: unknown;
            layout?: unknown;
            terminal?: unknown;
            preview?: unknown;
          } | null | undefined;
          projectState.set(session.projectId, {
            "project.ui": {
              panel: key === "project.panel" ? value : existing?.panel ?? null,
              tabs: existing?.tabs ?? null,
              layout: key === "project.layout" ? value : existing?.layout ?? null,
              terminal: existing?.terminal ?? null,
              preview: existing?.preview ?? null,
            },
          });
        }
      }
      // Broadcast to other session clients so they stay in sync
      ws.broadcastExcluding(sid, clientId, {
        type: "ui.state-sync",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: { key, value },
      });
      console.log(`UI state synced: session=${sid} key=${key} value=${value === null ? "null" : "set"}`);
      if (key === "queued_messages") {
        const serverWithQueueDrain = server as typeof server & {
          drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
        };
        void serverWithQueueDrain.drainQueuedChatMessages?.(sid);
      } else if (key === "queued_thread_messages") {
        const serverWithThreadQueueDrain = server as typeof server & {
          drainQueuedThreadMessages?: (sessionId?: string) => Promise<void>;
        };
        void serverWithThreadQueueDrain.drainQueuedThreadMessages?.(sid);
      }
    } catch (err) {
      console.error(`Failed to persist UI state (${key}):`, err);
    }
  };

  // ── Full state push on client subscribe ─────────────────────────────
  // This is the single authoritative source for initial UI state.
  // When a client subscribes to a session, push ALL session-scoped AND
  // project-scoped state in one message so the frontend can hydrate
  // immediately without waiting for REST round-trips.
  //
  // AGENT NOTE: To add new persisted state keys to the initial push:
  //   1. Session-scoped keys: automatically included (sessionState.get
  //      returns all keys for the session).
  //   2. Project-scoped keys: all project state lives in a single
  //      `project.ui` key (ProjectUIState). Add new fields there.
  //      The _project envelope below includes it automatically.
  //   3. Frontend: handle in handleFullState() in App.tsx.
  ws.onClientSubscribe = (sid, clientId) => {
    try {
      const allState: Record<string, unknown> = sessionState.get(sid);

      // Include project-scoped state (project.ui) so the client
      // doesn't need a separate REST round-trip.
      const session = sessionService.getById(sid);
      if (session?.projectId) {
        allState._project = {
          id: session.projectId,
          state: projectState.get(session.projectId),
        };
      }

      ws.sendToClient(clientId, {
        type: "ui.full-state",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: allState,
      });
      console.log(`Full state pushed to client ${clientId}: session=${sid} keys=${Object.keys(allState).join(", ") || "(empty)"}`);

      // Re-push active preview session so the client can hydrate the managed
      // preview immediately without waiting for a REST round-trip.
      const activePreview = previewService.get(sid);
      if (activePreview) {
        ws.sendToClient(clientId, {
          type: "preview.session" as any,
          sessionId: sid,
          timestamp: new Date().toISOString(),
          payload: { session: activePreview },
        });
      }
    } catch (err) {
      console.error(`Failed to push full state to client ${clientId}:`, err);
    }
  };

  const serverWithQueueDrain = server as typeof server & {
    drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    drainQueuedThreadMessages?: (sessionId?: string) => Promise<void>;
  };
  for (const session of sessionService.list("active")) {
    void serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
  }
  void serverWithQueueDrain.drainQueuedThreadMessages?.();

  // Screen-share WS start callback is no longer needed here — the start-request
  // is relayed directly to clients by the WS handler, and session creation happens
  // via the REST route or tool. This callback is kept as a no-op for safety.
  ws.onScreenShareStart = (hostDeviceId, _viewerDeviceIds) => {
    console.log(`Screen share start-request relayed for host: ${hostDeviceId}`);
  };
  ws.onScreenShareStop = (sessionId) => {
    const session = screenShare.stopShare();
    if (session) {
      ws.broadcastScreenShareState(session);
      console.log(`Screen share stopped: ${sessionId}`);
    }
  };

  // When a desktop/mobile FsNode registers, auto-claim legacy repos that have
  // no deviceId, are not present on the gateway, and match the node platform.
  ws.onFsNodeRegistered = (node) => {
    if (node.isGateway) return;
    const git = new GitService();
    for (const repo of repoService.list()) {
      if (repo.deviceId) continue; // already claimed
      const path = repo.localPath;
      if (shouldAutoClaimRepositoryForNode(path, node.platform)) {
        repoService.update(repo.id, { deviceId: node.id });
        ws.broadcastAll({
          type: "repo.updated",
          sessionId: "",
          timestamp: new Date().toISOString(),
          payload: { repo: { ...repo, deviceId: node.id } },
        });
        console.log(`[ws] auto-claimed repo "${repo.name}" for node ${node.name} (${node.id})`);
        // Also try to fill in missing githubUrl asynchronously
        if (!repo.githubUrl) {
          git.getPreferredRemote(path).then(async (remoteName) => {
            if (!remoteName) return;
            const url = await git.getRemoteUrl(path, remoteName);
            if (!url) return;
            repoService.update(repo.id, { githubUrl: url });
            ws.broadcastAll({
              type: "repo.updated",
              sessionId: "",
              timestamp: new Date().toISOString(),
              payload: { repo: { ...repo, deviceId: node.id, githubUrl: url } },
            });
            console.log(`[ws] detected githubUrl for repo "${repo.name}": ${url}`);
          }).catch(() => {});
        }
      }
    }

    // ── Self-heal stale project nodeIds ───────────────────────────────
    // Projects created during the old device-id race got stamped with a
    // throwaway random nodeId that never matched any registered node, so they
    // permanently showed "Node offline". When a node (re)registers, rebind any
    // active project whose nodeId is stale (not "gateway" and not currently a
    // registered fs node) and whose rootPath platform matches this node, so the
    // project points at the live node and comes back online.
    try {
      const registeredIds = new Set(ws.getFsNodes().map((n) => n.id));
      for (const project of projectService.list("active")) {
        const pid = project.nodeId;
        if (!pid || pid === "gateway" || registeredIds.has(pid)) continue;
        const rootPath = project.rootPath ?? "";
        const pathIsWindows = /^[A-Za-z]:[\\/]/.test(rootPath);
        const nodeIsWindows = node.platform === "windows";
        if (pathIsWindows !== nodeIsWindows) continue;
        projectService.update(project.id, { nodeId: node.id });
        console.log(`[ws] self-healed project "${project.title}" nodeId ${pid} -> ${node.id} (node ${node.name})`);
        ws.broadcastAll({
          type: "project.updated" as any,
          sessionId: "",
          timestamp: new Date().toISOString(),
          payload: { project: { ...project, nodeId: node.id } },
        });
      }
    } catch (err) {
      console.error("[ws] project nodeId self-heal failed:", err);
    }
  };

  // Start Fastify first, then attach WS to its HTTP server (shared port)
  await listenWithRetryOnConflict(server, { port: config.port, host: config.host });
  ws.start(server.server); // shares port with Fastify

  // Attach voice-assistant WebSocket upgrade to the HTTP server
  const httpServer = server.server;
  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0];
    if (pathname === "/ws/voice-assistant") {
      voiceAssistantService.handleUpgrade(req, socket, head);
    }
    // Other upgrade requests (WsControlPlane) are handled by ws.start() above
  });

  console.log(`Jait Gateway listening on http://${config.host}:${config.port} (HTTP + WS)`);
  console.log(`Voice assistant available at ws://${config.host}:${config.port}/ws/voice-assistant`);

  // Auto-start channels (e.g. WhatsApp) that were previously enabled.
  void channelManager.startEnabled().catch((err) => console.error("Channel auto-start failed:", err));

  // ── Primary-link — register this gateway as a filesystem node on an upstream
  //    gateway so it shows up (browseable/openable) in the primary's picker. ──
  let primaryLink: PrimaryLink | null = null;
  if (config.primaryGateway) {
    primaryLink = new PrimaryLink({
      primaryGateway: config.primaryGateway,
      primaryToken: config.primaryToken || undefined,
      nodeName: config.nodeName || undefined,
    });
    primaryLink.start();
  }

  // ── Terminal idle reaper — stop PTY terminals idle for 30+ minutes ──
  const TERMINAL_IDLE_MS = 30 * 60 * 1000; // 30 minutes
  const terminalReaperInterval = setInterval(() => {
    const terminals = surfaceRegistry
      .listSurfaces()
      .filter((s) => s.type === "terminal" && s.state === "running") as import("./surfaces/terminal.js").TerminalSurface[];
    for (const term of terminals) {
      if (term.idleMs >= TERMINAL_IDLE_MS) {
        console.log(`[terminal] Stopping idle terminal ${term.id} (idle ${Math.round(term.idleMs / 1000)}s)`);
        surfaceRegistry.stopSurface(term.id, "idle timeout").catch((err) =>
          console.error(`Failed to stop idle terminal ${term.id}:`, err),
        );
      }
    }
  }, 60_000); // check every minute
  if (terminalReaperInterval.unref) terminalReaperInterval.unref();

  const BROWSER_IDLE_MS = parsePositiveIntegerEnv("JAIT_BROWSER_IDLE_MS", 15 * 60 * 1000);
  const BROWSER_STALE_SANDBOX_MS = parsePositiveIntegerEnv("JAIT_BROWSER_STALE_SANDBOX_MS", 60 * 60 * 1000);
  const BROWSER_REAPER_INTERVAL_MS = parsePositiveIntegerEnv("JAIT_BROWSER_REAPER_INTERVAL_MS", 60 * 1000);
  const PREVIEW_BROWSER_PREFIX = "preview-browser-";
  let browserReaperRunning = false;
  const reapBrowserResources = async () => {
    if (browserReaperRunning) return;
    browserReaperRunning = true;
    try {
      const browsers = surfaceRegistry
        .listSurfaces()
        .filter((s) => s.type === "browser" && s.state === "running") as BrowserSurface[];
      const activeContainers = new Set<string>();
      for (const browser of browsers) {
        const liveView = browser.getLiveViewInfo();
        if (liveView?.containerName) activeContainers.add(liveView.containerName);
      }
      for (const browser of browsers) {
        if (browser.idleMs < BROWSER_IDLE_MS) continue;
        const idleSeconds = Math.round(browser.idleMs / 1000);
        console.log(`[browser] Stopping idle browser ${browser.id} (idle ${idleSeconds}s)`);
        if (browser.id.startsWith(PREVIEW_BROWSER_PREFIX)) {
          const sessionId = browser.id.slice(PREVIEW_BROWSER_PREFIX.length);
          previewService.stop(sessionId).catch((err) =>
            console.error(`Failed to stop idle preview browser ${browser.id}:`, err),
          );
        } else {
          surfaceRegistry.stopSurface(browser.id, "browser idle timeout").catch((err) =>
            console.error(`Failed to stop idle browser ${browser.id}:`, err),
          );
        }
      }

      const stopped = await browserSandboxManager.cleanupBrowserSandboxes({
        maxAgeMs: BROWSER_STALE_SANDBOX_MS,
        excludeNames: activeContainers,
      });
      if (stopped.length > 0) {
        console.log(`[browser] Removed ${stopped.length} stale unmanaged browser sandbox container(s).`);
      }
    } catch (err) {
      console.error("[browser] Browser resource reaper failed:", err);
    } finally {
      browserReaperRunning = false;
    }
  };
  const browserReaperInterval = setInterval(() => {
    void reapBrowserResources();
  }, BROWSER_REAPER_INTERVAL_MS);
  if (browserReaperInterval.unref) browserReaperInterval.unref();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("Shutting down...");
    // Force exit after 5 seconds if graceful shutdown hangs
    const forceTimer = setTimeout(() => {
      console.error("Graceful shutdown timed out, forcing exit.");
      process.exit(1);
    }, 5_000);
    // Ensure the timer doesn't keep the process alive
    if (forceTimer.unref) forceTimer.unref();
    try {
      consentManager.cancelAll("shutdown");
      await pluginManager.disposeAll();
      await channelManager.dispose();
      await previewService.stopAll();
      await surfaceRegistry.stopAll("shutdown");
      clearInterval(browserReaperInterval);
      clearInterval(terminalReaperInterval);
      scheduler.stop();
      threadReviewSync.stop();
      primaryLink?.stop();
      ws.stop();
      await server.close();
      sqlite.close();
    } catch (err) {
      console.error("Error during shutdown:", err);
    }
    process.exit(0);
  };
  // Wire shutdown into redeploy tool's late-bound reference
  shutdownFn = shutdown;

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // Prevent uncaught native errors (e.g. node-pty ConPTY) from crashing the gateway
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception (non-fatal):", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection (non-fatal):", reason);
  });
}

export { main };

// Auto-run when invoked directly (not via CLI bin entry)
if (!process.env["__JAIT_CLI"]) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
