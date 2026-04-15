// Must be the very first import — patches globalThis.crypto before jose loads
import "./crypto-polyfill.js";

import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { WsControlPlane } from "./ws.js";
import { openDatabase, migrateDatabase, sqliteBackend } from "./db/index.js";
import { SessionService } from "./services/sessions.js";
import { SessionStateService } from "./services/session-state.js";
import { WorkspaceStateService } from "./services/workspace-state.js";
import { AuditWriter } from "./services/audit.js";
import { SurfaceRegistry, TerminalSurfaceFactory, FileSystemSurfaceFactory, RemoteFileSystemSurfaceFactory, BrowserSurfaceFactory } from "./surfaces/index.js";
import type { SurfaceRegistrySnapshot } from "@jait/shared";
import { createToolRegistry } from "./tools/index.js";
import { SchedulerService } from "./scheduler/service.js";
import { HookBus, registerBuiltInHooks } from "./scheduler/hooks.js";
import { MemoryEngine } from "./memory/service.js";
import { SqliteMemoryBackend } from "./memory/sqlite-backend.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version: GATEWAY_VERSION } = require("../package.json") as { version: string };
import { ConsentManager } from "./security/consent-manager.js";
import { TrustEngine } from "./security/trust-engine.js";
import { getProfile } from "./security/tool-profiles.js";
import { ConsentAwareExecutor } from "./security/consent-executor.js";
import { UserService } from "./services/users.js";
import { DeviceRegistry } from "./services/device-registry.js";
import { VoiceService } from "./voice/service.js";
import { ScreenShareService } from "@jait/screen-share";
import { ThreadService } from "./services/threads.js";
import { RepositoryService } from "./services/repositories.js";
import { PlanService } from "./services/plans.js";
import { ProviderRegistry } from "./providers/registry.js";
import { CodexProvider } from "./providers/codex-provider.js";
import { ClaudeCodeProvider } from "./providers/claude-code-provider.js";
import { JaitProvider } from "./providers/jait-provider.js";
import { GeminiProvider } from "./providers/gemini-provider.js";
import { OpenCodeProvider } from "./providers/opencode-provider.js";
import { CopilotProvider } from "./providers/copilot-provider.js";
import { VoiceAssistantService } from "./voice-assistant/service.js";
import { verifyAuthToken } from "./security/http-auth.js";
import { WorkspaceWatcher } from "./services/workspace-watcher.js";
import type { FileChangeEvent } from "./services/workspace-watcher.js";
import { GitService } from "./services/git.js";
import { MaintenanceService } from "./services/maintenance.js";
import { NotificationService } from "./services/notifications.js";
import { PreviewService } from "./services/preview.js";
import { setNetworkScanDb } from "./tools/network-tools.js";
import { ArchitectureDiagramService } from "./services/architecture-diagrams.js";
import { WorkspaceService } from "./services/workspaces.js";
import { AssistantProfileService } from "./services/assistant-profiles.js";
import { BrowserCollaborationService } from "./services/browser-collaboration.js";
import { PluginManager } from "./plugins/manager.js";
import { ThreadReviewSyncService } from "./services/thread-review-sync.js";

async function main() {
  const config = loadConfig();

  // Initialize SQLite database
  const { db, sqlite } = await openDatabase();
  migrateDatabase(sqlite);
  setNetworkScanDb(sqlite);
  console.log(`Database initialized at ~/.jait/data/jait.db (${sqliteBackend})`);

  // Services
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const workspaceService = new WorkspaceService(db);
  const assistantProfileService = new AssistantProfileService(db);
  const workspaceState = new WorkspaceStateService(db);
  const userService = new UserService(db);
  const audit = new AuditWriter(db);
  const deviceRegistry = new DeviceRegistry();

  // Agent threads + provider registry
  const threadService = new ThreadService(db);

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
  const planService = new PlanService(db);
  const maintenanceService = new MaintenanceService(db, planService, repoService);
  const architectureDiagramService = new ArchitectureDiagramService(db);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(new CodexProvider());
  providerRegistry.register(new ClaudeCodeProvider());
  providerRegistry.register(new GeminiProvider());
  providerRegistry.register(new OpenCodeProvider());
  providerRegistry.register(new CopilotProvider());

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

  // Workspace file watcher — uses @parcel/watcher (same as VS Code) for
  // native recursive watching with event coalescing.
  const workspaceWatcher = new WorkspaceWatcher();
  /** Active session ID for the current workspace watcher */
  let watcherSessionId = "";
  /** Active surface ID for the current workspace watcher */
  let watcherSurfaceId = "";

  workspaceWatcher.on("changes", (changes: FileChangeEvent[]) => {
    if (!watcherSessionId) return;
    ws.broadcast(watcherSessionId, {
      type: "fs.changes" as any,
      sessionId: watcherSessionId,
      timestamp: new Date().toISOString(),
      payload: { surfaceId: watcherSurfaceId, changes },
    });
  });
  workspaceWatcher.on("error", (err: Error) => {
    console.error("Workspace watcher error:", err.message);
  });

  // Register remote-filesystem factory (needs ws reference for proxying ops to nodes)
  surfaceRegistry.register(new RemoteFileSystemSurfaceFactory(ws));
  console.log(`Surfaces registered: ${surfaceRegistry.registeredTypes.join(", ")}`);
  const previewService = new PreviewService(surfaceRegistry);
  previewService.onSessionChanged((session) => {
    ws.broadcastAll({
      type: "preview.session" as any,
      sessionId: session.sessionId,
      timestamp: new Date().toISOString(),
      payload: { session },
    });
  });
  const browserCollaborationService = new BrowserCollaborationService(db);
  browserCollaborationService.onSessionChanged((session) => {
    ws.broadcastAll({
      type: "browser.session" as any,
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: { session },
    });
  });
  browserCollaborationService.onInterventionChanged((intervention) => {
    ws.broadcastAll({
      type: "browser.intervention" as any,
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: { intervention },
    });
  });
  ws.getBrowserSnapshot = (userId?: string | null) => ({
    serverTime: new Date().toISOString(),
    sessions: browserCollaborationService.listSessions(userId ?? undefined),
    interventions: browserCollaborationService.listInterventions(userId ?? undefined),
  });
  ws.getSurfaceSnapshot = (): SurfaceRegistrySnapshot => ({
    serverTime: new Date().toISOString(),
    surfaces: surfaceRegistry.listSnapshots(),
  });

  // Auto-wire terminal output → WebSocket for ALL terminals (REST, tool, etc.)
  // Also broadcast workspace activation for filesystem surfaces.
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
      const workspaceRoot = (snap.metadata as Record<string, unknown>)?.workspaceRoot ?? null;
      const nodeId = (snap.metadata as Record<string, unknown>)?.nodeId as string | undefined;
      const panelState = { open: true, remotePath: workspaceRoot, surfaceId: id, nodeId: nodeId ?? 'gateway' };

      // Start native file watcher for local filesystems
      if (surface.type === "filesystem" && typeof workspaceRoot === "string") {
        watcherSessionId = sid;
        watcherSurfaceId = id;
        workspaceWatcher.watch(workspaceRoot).catch((err) =>
          console.error("Failed to start workspace watcher:", err.message),
        );
      }

      // Push a UI command to open the workspace panel
      ws.sendUICommand(
        {
          command: "workspace.open",
          data: {
            surfaceId: id,
            workspaceRoot: workspaceRoot as string,
            nodeId: nodeId ?? 'gateway',
          },
        },
        sid,
      );
      // Also broadcast ui.state-sync so handleStateSync fires on all clients
      ws.broadcast(sid, {
        type: "ui.state-sync",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: { key: "workspace.panel", value: panelState },
      });
      if (sid) {
        const session = sessionService.getById(sid);
        if (session?.workspaceId) {
          try {
            const existing = workspaceState.get(session.workspaceId, ["workspace.ui"])["workspace.ui"] as {
              panel?: unknown;
              tabs?: unknown;
              layout?: unknown;
              terminal?: unknown;
              preview?: unknown;
            } | null | undefined;
            workspaceState.set(session.workspaceId, {
              "workspace.ui": {
                panel: panelState,
                tabs: existing?.tabs ?? null,
                layout: existing?.layout ?? null,
                terminal: existing?.terminal ?? null,
                preview: existing?.preview ?? null,
              },
            });
          } catch (err) {
            console.error("Failed to persist workspace state:", err);
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
        workspaceWatcher.stop().catch((err) =>
          console.error("Failed to stop workspace watcher:", err.message),
        );
        watcherSessionId = "";
        watcherSurfaceId = "";
      }

      const snap = surface.snapshot();
      const sid = snap.sessionId ?? "";
      ws.sendUICommand(
        {
          command: "workspace.close",
          data: { surfaceId: id },
        },
        sid,
      );
      // Also broadcast ui.state-sync so handleStateSync fires on all clients
      ws.broadcast(sid, {
        type: "ui.state-sync",
        sessionId: sid,
        timestamp: new Date().toISOString(),
        payload: { key: "workspace.panel", value: null },
      });
      if (sid && context?.reason !== "shutdown") {
        const session = sessionService.getById(sid);
        if (session?.workspaceId) {
          try {
            const existing = workspaceState.get(session.workspaceId, ["workspace.ui"])["workspace.ui"] as {
              panel?: unknown;
              tabs?: unknown;
              layout?: unknown;
              terminal?: unknown;
              preview?: unknown;
            } | null | undefined;
            workspaceState.set(session.workspaceId, {
              "workspace.ui": {
                panel: null,
                tabs: existing?.tabs ?? null,
                layout: existing?.layout ?? null,
                terminal: existing?.terminal ?? null,
                preview: existing?.preview ?? null,
              },
            });
          } catch (err) {
            console.error("Failed to clear workspace state:", err);
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
    maintenanceService,
    notifications,
    previewService,
    architectureDiagramService,
    browserCollaborationService,
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
  const activeToolProfileName = "coding" as const;
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
      console.log(`Consent required: ${request.toolName} (${request.id})`);
    },
    onDecision: (decision) => {
      ws.broadcastAll({
        type: "consent.resolved",
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: decision,
      });
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
        workspaceRoot: execution.workspaceRoot,
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
    maintenanceService,
    notifications,
    config,
    shutdown: shutdownRef,
    previewService,
    architectureDiagramService,
    browserCollaborationService,
  });
  console.log(`Tools registered: ${toolRegistry.listNames().join(", ")}`);

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

  console.log(`Consent manager initialized (profile: ${activeToolProfileName}, timeout: 120s, ${permissions.size} tool permissions)`);

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
    gatewayVersion: GATEWAY_VERSION,
    workspaceRoot: process.cwd(),
    openclawExtensionsDirs: openclawDirs,
  });
  await pluginManager.syncAndLoad();

  // Skill registry — discover skills from user dir, workspace, and OpenClaw
  const { SkillRegistry, userSkillsDir } = await import("./skills/index.js");
  const skillRegistry = new SkillRegistry();
  const skillScanDirs: { path: string; source: "bundled" | "user" | "workspace" | "plugin" }[] = [
    { path: userSkillsDir(), source: "user" },
    { path: join(process.cwd(), ".jait", "skills"), source: "workspace" },
    { path: join(process.cwd(), ".agents", "skills"), source: "workspace" },
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

  // Voice assistant (OpenAI Realtime — global session, not workspace-scoped)
  const voiceAssistantService = new VoiceAssistantService({
    config,
    verifyToken: (token) => verifyAuthToken(token, config.jwtSecret),
    sessionService,
    threadService,
    workspaceService,
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
    sessionState,
    workspaceService,
    assistantProfileService,
    workspaceState,
    voiceService,
    toolExecutor,
    screenShare,
    threadService,
    repoService,
    planService,
    maintenanceService,
    notifications,
    providerRegistry,
    previewService,
    architectureDiagramService,
    browserCollaborationService,
    pluginManager,
    skillRegistry,
    clawhubClient,
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
      if (key === "workspace.layout" || key === "workspace.panel") {
        const session = sessionService.getById(sid);
        if (session?.workspaceId) {
          const existing = workspaceState.get(session.workspaceId, ["workspace.ui"])["workspace.ui"] as {
            panel?: unknown;
            tabs?: unknown;
            layout?: unknown;
            terminal?: unknown;
            preview?: unknown;
          } | null | undefined;
          workspaceState.set(session.workspaceId, {
            "workspace.ui": {
              panel: key === "workspace.panel" ? value : existing?.panel ?? null,
              tabs: existing?.tabs ?? null,
              layout: key === "workspace.layout" ? value : existing?.layout ?? null,
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
  // workspace-scoped state in one message so the frontend can hydrate
  // immediately without waiting for REST round-trips.
  //
  // AGENT NOTE: To add new persisted state keys to the initial push:
  //   1. Session-scoped keys: automatically included (sessionState.get
  //      returns all keys for the session).
  //   2. Workspace-scoped keys: all workspace state lives in a single
  //      `workspace.ui` key (WorkspaceUIState). Add new fields there.
  //      The _workspace envelope below includes it automatically.
  //   3. Frontend: handle in handleFullState() in App.tsx.
  ws.onClientSubscribe = (sid, clientId) => {
    try {
      const allState: Record<string, unknown> = sessionState.get(sid);

      // Include workspace-scoped state (workspace.ui) so the client
      // doesn't need a separate REST round-trip.
      const session = sessionService.getById(sid);
      if (session?.workspaceId) {
        allState._workspace = {
          id: session.workspaceId,
          state: workspaceState.get(session.workspaceId),
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

  // When a desktop/mobile FsNode registers, auto-claim repos that have no
  // deviceId but a matching local path platform. This ensures repos created
  // before deviceId tracking get properly associated.
  ws.onFsNodeRegistered = (node) => {
    if (node.isGateway) return;
    const isWindowsNode = node.platform === "windows";
    const git = new GitService();
    for (const repo of repoService.list()) {
      if (repo.deviceId) continue; // already claimed
      const path = repo.localPath;
      const pathIsWindows = /^[A-Za-z]:[\\\/]/.test(path);
      if (pathIsWindows === isWindowsNode) {
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
  };

  // Start Fastify first, then attach WS to its HTTP server (shared port)
  await server.listen({ port: config.port, host: config.host });
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
      await previewService.stopAll();
      await surfaceRegistry.stopAll("shutdown");
      scheduler.stop();
      threadReviewSync.stop();
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
