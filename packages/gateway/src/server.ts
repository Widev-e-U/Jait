import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { WebSocket, WebSocketServer } from "ws";
import { existsSync } from "node:fs";
import { join, dirname, extname, relative, resolve, sep } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { AppConfig } from "./config.js";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../package.json") as { version: string };
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);

const __dirname = dirname(fileURLToPath(import.meta.url));
import { registerChatRoutes } from "./routes/chat.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerTerminalRoutes } from "./routes/terminals.js";
import { registerConsentRoutes } from "./routes/consent.js";
import { registerTrustRoutes } from "./routes/trust.js";
import { registerHookRoutes } from "./routes/hooks.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerMobileRoutes } from "./routes/mobile.js";
import { registerNetworkRoutes } from "./routes/network.js";
import { registerEnvironmentRoutes } from "./routes/environment.js";
import { registerVoiceRoutes } from "./routes/voice.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";
import { registerWorkspaceEntityRoutes } from "./routes/workspaces.js";
import { registerScreenShareRoutes } from "./routes/screen-share.js";
import { registerFilesystemRoutes } from "./routes/filesystem.js";
import { registerAssistantProfileRoutes } from "./routes/assistant-profiles.js";
import { registerThreadRoutes } from "./routes/threads.js";
import { registerRepoRoutes } from "./routes/repositories.js";
import { registerPlanRoutes } from "./routes/plans.js";
import { registerMaintenanceRoutes } from "./routes/maintenance.js";
import { registerMcpRoutes } from "./routes/mcp-server.js";
import { registerGitRoutes } from "./routes/git.js";
import { registerUpdateRoutes } from "./routes/update.js";
import { registerPreviewRoutes } from "./routes/preview.js";
import { registerArchitectureRoutes } from "./routes/architecture.js";
import { registerBrowserCollaborationRoutes } from "./routes/browser-collaboration.js";
import { registerPluginRoutes } from "./routes/plugins.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerStoreRoutes } from "./routes/store.js";
import type { SessionService } from "./services/sessions.js";
import type { AuditWriter } from "./services/audit.js";
import type { SurfaceRegistry } from "./surfaces/index.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { ToolContext, ToolResult } from "./tools/contracts.js";
import type { ConsentManager } from "./security/consent-manager.js";
import type { TrustEngine } from "./security/trust-engine.js";
import type { ToolPermission } from "./security/tool-permissions.js";
import type { ProfileName } from "./security/tool-profiles.js";
import type { JaitDB } from "./db/index.js";
import type { WsControlPlane } from "./ws.js";
import type { HookBus } from "./scheduler/hooks.js";
import type { SchedulerService } from "./scheduler/service.js";
import type { MemoryService } from "./memory/contracts.js";
import type { UserService } from "./services/users.js";
import type { DeviceRegistry } from "./services/device-registry.js";
import type { VoiceService } from "./voice/service.js";
import type { ScreenShareService } from "@jait/screen-share";
import type { SessionStateService } from "./services/session-state.js";
import type { WorkspaceStateService } from "./services/workspace-state.js";
import type { ThreadService } from "./services/threads.js";
import type { RepositoryService } from "./services/repositories.js";
import type { PlanService } from "./services/plans.js";
import type { ProviderRegistry } from "./providers/registry.js";
import type { SqliteDatabase } from "./db/sqlite-shim.js";
import { getSchemaVersion } from "./db/connection.js";
import type { WorkspaceService } from "./services/workspaces.js";
import type { AssistantProfileService } from "./services/assistant-profiles.js";
import type { BrowserCollaborationService } from "./services/browser-collaboration.js";

export interface ServerDeps {
  db?: JaitDB;
  sqlite?: SqliteDatabase;
  sessionService?: SessionService;
  userService?: UserService;
  audit?: AuditWriter;
  surfaceRegistry?: SurfaceRegistry;
  toolRegistry?: ToolRegistry;
  consentManager?: ConsentManager;
  trustEngine?: TrustEngine;
  activeToolProfileName?: ProfileName;
  toolPermissions?: Map<string, ToolPermission>;
  ws?: WsControlPlane;
  hooks?: HookBus;
  scheduler?: SchedulerService;
  hookSecret?: string;
  onWakeHook?: () => Promise<unknown>;
  onAgentHook?: (payload: unknown) => Promise<unknown>;
  memoryService?: MemoryService;
  deviceRegistry?: DeviceRegistry;
  sessionState?: SessionStateService;
  workspaceService?: WorkspaceService;
  assistantProfileService?: AssistantProfileService;
  workspaceState?: WorkspaceStateService;
  toolExecutor?: (
    toolName: string,
    input: unknown,
    context: ToolContext,
    options?: { dryRun?: boolean; consentTimeoutMs?: number },
  ) => Promise<ToolResult>;
  voiceService?: VoiceService;
  screenShare?: ScreenShareService;
  threadService?: ThreadService;
  repoService?: RepositoryService;
  planService?: PlanService;
  maintenanceService?: import("./services/maintenance.js").MaintenanceService;
  notifications?: import("./services/notifications.js").NotificationService;
  providerRegistry?: ProviderRegistry;
  shutdown?: () => Promise<void>;
  gitService?: import("./routes/threads.js").ThreadRouteDeps["gitService"];
  previewService?: import("./services/preview.js").PreviewService;
  architectureDiagramService?: import("./services/architecture-diagrams.js").ArchitectureDiagramService;
  browserCollaborationService?: BrowserCollaborationService;
  pluginManager?: import("./plugins/manager.js").PluginManager;
  skillRegistry?: import("./skills/index.js").SkillRegistry;
  clawhubClient?: import("./clawhub/client.js").ClawHubClient;
  voiceAssistantService?: import("./voice-assistant/service.js").VoiceAssistantService;
}

export async function createServer(config: AppConfig, deps: ServerDeps = {}) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  await app.register(fastifyCookie);

  await app.register(cors, {
    origin: true, // allow any origin — auth is JWT-based, not origin-based
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  registerHealthRoutes(app, config, {
    getDeviceCount: () => deps.deviceRegistry?.count() ?? 0,
    getSchemaVersion: () => deps.sqlite ? getSchemaVersion(deps.sqlite) : 0,
    getUserCount: () => deps.userService?.countUsers() ?? 0,
  });
  if (deps.userService) {
    registerAuthRoutes(app, config, deps.userService, deps.toolRegistry);
  }
  registerChatRoutes(app, config, {
    db: deps.db,
    sessionService: deps.sessionService,
    toolRegistry: deps.toolRegistry,
    surfaceRegistry: deps.surfaceRegistry,
    audit: deps.audit,
    toolExecutor: deps.toolExecutor,
    memoryService: deps.memoryService,
    userService: deps.userService,
    ws: deps.ws,
    sessionState: deps.sessionState,
    workspaceService: deps.workspaceService,
    providerRegistry: deps.providerRegistry,
    skillRegistry: deps.skillRegistry,
  });

  if (deps.sessionService && deps.audit) {
    registerSessionRoutes(app, config, deps.sessionService, deps.audit, deps.hooks, deps.sessionState, deps.workspaceService);
  }
  if (deps.workspaceService && deps.sessionService) {
    registerWorkspaceEntityRoutes(app, config, deps.workspaceService, deps.sessionService, deps.workspaceState);
  }
  if (deps.assistantProfileService) {
    registerAssistantProfileRoutes(app, config, deps.assistantProfileService);
  }
  registerEnvironmentRoutes(app, config, {
    assistantProfileService: deps.assistantProfileService,
    workspaceService: deps.workspaceService,
    repoService: deps.repoService,
    providerRegistry: deps.providerRegistry,
    ws: deps.ws,
    sqlite: deps.sqlite,
  });

  if (deps.surfaceRegistry && deps.toolRegistry && deps.audit) {
    registerTerminalRoutes(app, deps.surfaceRegistry, deps.toolRegistry, deps.audit, deps.toolExecutor);
  }

  if (deps.consentManager && deps.audit) {
    registerConsentRoutes(app, deps.consentManager, deps.audit, {
      activeProfileName: deps.activeToolProfileName,
      permissions: deps.toolPermissions,
    });
  }
  if (deps.voiceService && deps.consentManager) {
    registerVoiceRoutes(app, deps.voiceService, deps.consentManager, config, deps.userService);
  }

  if (deps.trustEngine) {
    registerTrustRoutes(app, deps.trustEngine);
  }
  if (deps.hooks && deps.hookSecret && deps.onWakeHook && deps.onAgentHook) {
    registerHookRoutes(app, {
      hooks: deps.hooks,
      hookSecret: deps.hookSecret,
      onWake: deps.onWakeHook,
      onAgentHook: deps.onAgentHook,
    });
  }
  if (deps.scheduler) {
    registerJobRoutes(app, config, deps.scheduler);
  }

  if (deps.deviceRegistry && deps.consentManager) {
    registerMobileRoutes(app, {
      deviceRegistry: deps.deviceRegistry,
      consentManager: deps.consentManager,
      sessionService: deps.sessionService,
    });
  }

  registerNetworkRoutes(app, deps.ws, deps.sqlite, deps.providerRegistry);

  if (deps.screenShare && deps.ws) {
    registerScreenShareRoutes(app, { screenShare: deps.screenShare, ws: deps.ws });
  }

  registerFilesystemRoutes(app, deps.ws);
  registerBrowserAssetRoutes(app);
  registerWorkspacePreviewRoutes(app);
  registerDevProxyRoutes(app);
  registerLiveViewProxyRoutes(app);
  if (deps.previewService) {
    registerPreviewRoutes(app, config, {
      previewService: deps.previewService,
      browserCollaborationService: deps.browserCollaborationService,
    });
  }
  if (deps.browserCollaborationService) {
    registerBrowserCollaborationRoutes(app, config, {
      browserCollaborationService: deps.browserCollaborationService,
    });
  }
  if (deps.architectureDiagramService) {
    registerArchitectureRoutes(app, config, deps.architectureDiagramService);
  }

  if (deps.surfaceRegistry) {
    registerWorkspaceRoutes(app, deps.surfaceRegistry, deps.sessionState, deps.sessionService, deps.ws, deps.workspaceService, deps.workspaceState);
  }

  // Git API routes
  registerGitRoutes(app, config, {
    ws: deps.ws,
    userService: deps.userService,
    providerRegistry: deps.providerRegistry,
  });

  // Agent threads + provider routes
  if (deps.threadService && deps.providerRegistry) {
    registerThreadRoutes(app, config, {
      threadService: deps.threadService,
      providerRegistry: deps.providerRegistry,
      userService: deps.userService,
      sessionState: deps.sessionState,
      repoService: deps.repoService,
      skillRegistry: deps.skillRegistry,
      ws: deps.ws,
      gitService: deps.gitService,
    });
  }

  // Automation repository routes
  if (deps.repoService) {
    registerRepoRoutes(app, config, {
      repoService: deps.repoService,
      userService: deps.userService,
      ws: deps.ws,
    });
  }

  // Automation plan routes
  if (deps.planService && deps.repoService) {
    registerPlanRoutes(app, config, {
      planService: deps.planService,
      repoService: deps.repoService,
      threadService: deps.threadService,
      providerRegistry: deps.providerRegistry,
      userService: deps.userService,
      ws: deps.ws,
    });
  }

  // Maintenance routes (supervised self-test/self-fix)
  if (deps.maintenanceService) {
    registerMaintenanceRoutes(app, config, {
      maintenanceService: deps.maintenanceService,
      notifications: deps.notifications,
      ws: deps.ws,
    });
  }

  // Plugin / extension management routes
  if (deps.pluginManager) {
    registerPluginRoutes(app, deps.pluginManager);
  }

  // Skill management routes
  if (deps.skillRegistry) {
    registerSkillRoutes(app, deps.skillRegistry);
  }

  // ClawHub store routes (marketplace browse + install)
  if (deps.clawhubClient && deps.skillRegistry) {
    registerStoreRoutes(app, {
      clawhub: deps.clawhubClient,
      skillRegistry: deps.skillRegistry,
    });
  }

  // MCP SSE server for external CLI agents
  if (deps.toolRegistry) {
    registerMcpRoutes(app, {
      toolRegistry: deps.toolRegistry,
      config,
      sessionService: deps.sessionService,
      userService: deps.userService,
      sessionState: deps.sessionState,
    });
  }

  // Self-update routes
  if (deps.shutdown) {
    registerUpdateRoutes(app, config, { shutdown: deps.shutdown, port: config.port });
  }

  // ── Voice assistant WebSocket (OpenAI Realtime) ─────────────────
  // Status endpoint (always available — reports whether OpenAI key is set)
  app.get("/api/voice-assistant/status", async () => ({
    available: !!config.openaiApiKey,
    model: config.realtimeModel,
    voice: config.realtimeVoice,
  }));
  // The actual WebSocket upgrade for /ws/voice-assistant is attached to
  // the raw HTTP server in index.ts after app.listen(), since Fastify's
  // server object is needed for the upgrade handler.

  // ── Serve the web frontend (SPA) if the built files exist ────────
  // Probe paths in order: JAIT_WEB_DIR env, co-located ../web/dist
  // (npm global install), monorepo apps/web/dist (dev)
  const webDir = resolveWebDir();
  if (webDir) {
    await app.register(fastifyStatic, {
      root: webDir,
      prefix: "/",
      decorateReply: false,
      // Don't serve index.html for API routes
    });

    // SPA fallback — serve index.html for any non-API, non-file GET
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api") && !request.url.startsWith("/health")) {
        const indexPath = join(webDir, "index.html");
        const html = await readFile(indexPath, "utf8");
        return reply.type("text/html").send(html);
      }
      return reply.status(404).send({ error: "Not Found" });
    });

    console.log(`Serving web UI from ${webDir}`);
  } else {
    app.get("/", async () => ({
      name: "jait-gateway",
      version: PKG_VERSION,
      status: "ok",
    }));
  }

  return app;
}

function registerBrowserAssetRoutes(app: FastifyInstance): void {
  app.get("/api/browser/screenshot", async (request, reply) => {
    const { path } = request.query as { path?: string };
    if (!path || !path.trim()) {
      return reply.status(400).send({ error: "MISSING_PATH", message: "path is required" });
    }

    const resolvedPath = resolve(path);
    if (!isPathWithin(resolve(process.cwd()), resolvedPath)) {
      return reply.status(403).send({ error: "PATH_FORBIDDEN", message: "Screenshot path must stay within the gateway workspace" });
    }

    const extension = extname(resolvedPath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      return reply.status(400).send({ error: "UNSUPPORTED_FILE", message: "Only image screenshots can be served" });
    }

    try {
      const fileInfo = await stat(resolvedPath);
      if (!fileInfo.isFile()) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Screenshot file not found" });
      }

      const contentType = extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : extension === ".gif"
            ? "image/gif"
            : "image/jpeg";

      const data = await readFile(resolvedPath);
      return reply
        .header("Cache-Control", "no-store")
        .type(contentType)
        .send(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Screenshot file not found" });
      }
      throw error;
    }
  });
}

function registerWorkspacePreviewRoutes(app: FastifyInstance): void {
  const handler = async (request: any, reply: any) => {
    const params = request.params as { encodedPath?: string; "*"?: string };
    const rootPath = decodePreviewFilePath(params.encodedPath);
    if (!rootPath) {
      return reply.status(400).send({ error: "INVALID_PATH", message: "A valid HTML file path is required" });
    }

    const workspaceRoot = resolve(process.cwd());
    const resolvedRoot = resolve(rootPath);
    if (!isPathWithin(workspaceRoot, resolvedRoot)) {
      return reply.status(403).send({ error: "PATH_FORBIDDEN", message: "Preview path must stay within the gateway workspace" });
    }

    const rootExtension = extname(resolvedRoot).toLowerCase();
    if (!HTML_EXTENSIONS.has(rootExtension)) {
      return reply.status(400).send({ error: "UNSUPPORTED_FILE", message: "Only HTML files can be opened in preview" });
    }

    const relativeAssetPath = typeof params["*"] === "string" ? params["*"] : "";
    const targetPath = relativeAssetPath
      ? resolve(dirname(resolvedRoot), relativeAssetPath)
      : resolvedRoot;

    if (relativeAssetPath && !isPathWithin(dirname(resolvedRoot), targetPath)) {
      return reply.status(403).send({ error: "PATH_FORBIDDEN", message: "Preview asset path must stay within the HTML file directory" });
    }

    try {
      const fileInfo = await stat(targetPath);
      if (!fileInfo.isFile()) {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Preview file not found" });
      }

      const extension = extname(targetPath).toLowerCase();
      const contentType = getPreviewContentType(extension);
      const data = await readFile(targetPath);
      reply.header("Cache-Control", "no-store");

      if (HTML_EXTENSIONS.has(extension)) {
        const html = data.toString("utf8");
        const prefix = `/api/dev-file/${params.encodedPath}`;
        return reply.type("text/html; charset=utf-8").send(rewritePreviewHtml(html, prefix));
      }

      return reply.type(contentType).send(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return reply.status(404).send({ error: "NOT_FOUND", message: "Preview file not found" });
      }
      throw error;
    }
  };

  app.get("/api/dev-file/:encodedPath", handler);
  app.get("/api/dev-file/:encodedPath/*", handler);
}

function registerDevProxyRoutes(app: FastifyInstance): void {
  const handler = async (request: any, reply: any) => {
    const params = request.params as { port?: string; "*"?: string };
    const port = normalizeProxyPort(params.port);
    if (!port) {
      return reply.status(400).send({ error: "INVALID_PORT", message: "A valid localhost port is required" });
    }

    const proxiedPath = params["*"] ? `/${params["*"]}` : "/";
    const targetUrl = new URL(`http://127.0.0.1:${port}${proxiedPath}`);
    const query = request.query as Record<string, string | string[] | undefined>;
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const entry of value) targetUrl.searchParams.append(key, entry);
      } else if (typeof value === "string") {
        targetUrl.searchParams.set(key, value);
      }
    }

    return proxyPreviewRequest(request, reply, targetUrl, `/api/dev-proxy/${port}`, proxiedPath);
  };

  app.all("/api/dev-proxy/:port", handler);
  app.all("/api/dev-proxy/:port/*", handler);
}

function registerLiveViewProxyRoutes(app: FastifyInstance): void {
  const liveViewWss = new WebSocketServer({ noServer: true });

  liveViewWss.on("connection", (client, request) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const match = requestUrl.pathname.match(/^\/api\/live-view\/(\d+)\/websockify$/);
    const port = match?.[1];
    if (!port) {
      client.close(1008, "Invalid live-view target");
      return;
    }

    const upstream = new WebSocket(`ws://127.0.0.1:${port}/websockify${requestUrl.search}`);

    const closePeer = (
      source: WebSocket,
      target: WebSocket,
      code?: number,
      reason?: Buffer | string,
    ) => {
      if (target.readyState === WebSocket.OPEN || target.readyState === WebSocket.CONNECTING) {
        target.close(code, typeof reason === "string" ? reason : reason?.toString());
      }
      if (source.readyState === WebSocket.OPEN || source.readyState === WebSocket.CONNECTING) {
        source.close(code, typeof reason === "string" ? reason : reason?.toString());
      }
    };

    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    });
    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });

    client.on("close", (code, reason) => closePeer(client, upstream, code, reason));
    upstream.on("close", (code, reason) => closePeer(upstream, client, code, reason));

    client.on("error", () => closePeer(client, upstream, 1011, "Live-view client websocket error"));
    upstream.on("error", () => closePeer(upstream, client, 1011, "Live-view upstream websocket error"));
  });

  app.server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (!/^\/api\/live-view\/\d+\/websockify$/.test(requestUrl.pathname)) return;
    liveViewWss.handleUpgrade(request, socket, head, (ws) => {
      liveViewWss.emit("connection", ws, request);
    });
  });
}

async function proxyPreviewRequest(
  request: any,
  reply: any,
  targetUrl: URL,
  rewritePrefix: string,
  proxiedPath: string,
): Promise<unknown> {
  try {
    const upstream = await fetchDevProxyUpstream(targetUrl, request, proxiedPath);

    reply.code(upstream.status);
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    for (const [key, value] of upstream.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower === "content-length" || lower === "content-encoding" || lower === "transfer-encoding" || lower === "x-frame-options" || lower === "content-security-policy") {
        continue;
      }
      reply.header(key, value);
    }
    reply.header("Cache-Control", "no-store");

    if (contentType.includes("text/html") && isModuleLikeProxyPath(proxiedPath)) {
      return reply
        .code(502)
        .type("application/json; charset=utf-8")
        .send({
          error: "DEV_PROXY_MODULE_FALLBACK",
          message: `Dev server returned HTML for module request ${proxiedPath}. Open the server root or fix absolute asset routing.`,
        });
    }

    if (contentType.includes("text/html") || contentType.includes("javascript") || contentType.includes("ecmascript") || contentType.includes("css")) {
      const text = await upstream.text();
      return reply.type(contentType).send(rewriteDevProxyText(text, contentType, rewritePrefix, proxiedPath));
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    return reply.type(contentType).send(body);
  } catch (error) {
    return reply.status(502).send({
      error: "DEV_PROXY_FAILED",
      message: error instanceof Error ? error.message : "Failed to reach local dev server",
    });
  }
}

async function fetchDevProxyUpstream(targetUrl: URL, request: any, proxiedPath: string): Promise<Response> {
  const doFetch = () => fetch(targetUrl, {
    method: request.method,
    headers: buildProxyRequestHeaders(request.headers),
    body: buildProxyRequestBody(request.method, request.body),
    redirect: "follow",
  });

  let upstream = await doFetch();
  if (upstream.status === 504 && proxiedPath.startsWith("/node_modules/.vite/deps/")) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    upstream = await doFetch();
  }
  return upstream;
}


function normalizeProxyPort(value?: string): number | null {
  if (!value) return null;
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
  return port;
}

function buildProxyRequestHeaders(input: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length" || lower === "accept-encoding" || lower === "origin" || lower === "referer") {
      continue;
    }
    if (Array.isArray(value)) {
      headers[key] = value.join(", ");
    } else if (typeof value === "string") {
      headers[key] = value;
    }
  }
  return headers;
}

function buildProxyRequestBody(method: string, body: unknown): RequestInit["body"] | undefined {
  if (method === "GET" || method === "HEAD" || body == null) return undefined;
  if (typeof body === "string" || body instanceof Uint8Array || body instanceof ArrayBuffer) {
    return body;
  }
  return JSON.stringify(body);
}

function rewritePreviewHtml(html: string, prefix: string): string {
  let rewritten = html;
  rewritten = rewritten.replace(/\b(src|href|action|poster)=("|')\/(?!\/)/gi, `$1=$2${prefix}/`);
  rewritten = rewritten.replace(/\bcontent=("|')([^"']*url=)\/(?!\/)/gi, `content=$1$2${prefix}/`);
  if (!/<base\b/i.test(rewritten)) {
    rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${prefix}/">`);
  }
  return rewritten;
}

function rewriteDevProxyText(body: string, contentType: string, prefix: string, proxiedPath = "/"): string {
  if (contentType.includes("text/html")) {
    const withoutViteClient = body.replace(
      /<script\b[^>]*type=(["'])module\1[^>]*src=(["'])\/@vite\/client(?:\?[^"']*)?\2[^>]*>\s*<\/script>\s*/gi,
      "",
    );
    return rewritePreviewHtml(withoutViteClient, prefix);
  }

  if (contentType.includes("javascript") || contentType.includes("ecmascript") || contentType.includes("css")) {
    let rewritten = body.replace(/(["'`(])\/(@fs\/|@vite\/|node_modules\/|src\/)/g, (_match, boundary: string, pathPrefix: string) => {
      return `${boundary}${prefix}/${pathPrefix}`;
    });
    if (proxiedPath === "/@vite/client") {
      rewritten = rewritten.replace(
        /console\.info\(`\[vite\] connecting\.\.\.`\);?/g,
        "",
      );
    }
    return rewritten;
  }

  return body;
}

function isModuleLikeProxyPath(path: string): boolean {
  return /^\/(?:@fs\/|@vite\/|node_modules\/|src\/)/.test(path)
    || /\.(?:m?js|cjs|ts|tsx|jsx|css)(?:$|[?#])/.test(path);
}

function isPathWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`));
}

function decodePreviewFilePath(encodedPath?: string): string | null {
  if (!encodedPath) return null;
  try {
    const normalized = encodedPath.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return decoded.startsWith("/") ? decoded : resolve(process.cwd(), decoded);
  } catch {
    return null;
  }
}

function getPreviewContentType(extension: string): string {
  switch (extension) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".map":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

/** Resolve the directory containing the built web frontend. */
function resolveWebDir(): string | null {
  // Explicit env override
  if (process.env["JAIT_WEB_DIR"] && existsSync(process.env["JAIT_WEB_DIR"])) {
    return process.env["JAIT_WEB_DIR"];
  }
  const candidates = [
    // Bundled inside gateway package (npm publish + global install)
    join(__dirname, "../web-dist"),
    // Monorepo dev layout (bun run dev)
    join(__dirname, "../../../../apps/web/dist"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return null;
}
