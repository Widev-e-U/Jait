import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { VERSION } from "@jait/shared";
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
import { registerVoiceRoutes } from "./routes/voice.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";
import { registerScreenShareRoutes } from "./routes/screen-share.js";
import { registerFilesystemRoutes } from "./routes/filesystem.js";
import { registerThreadRoutes } from "./routes/threads.js";
import { registerRepoRoutes } from "./routes/repositories.js";
import { registerMcpRoutes } from "./routes/mcp-server.js";
import { registerGitRoutes } from "./routes/git.js";
import { getSchemaVersion } from "./db/connection.js";
export async function createServer(config, deps = {}) {
    const app = Fastify({
        logger: {
            level: config.logLevel,
        },
    });
    await app.register(cors, {
        origin: true, // allow any origin — auth is JWT-based, not origin-based
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    });
    registerHealthRoutes(app, config, {
        getDeviceCount: () => deps.deviceRegistry?.count() ?? 0,
        getSchemaVersion: () => deps.sqlite ? getSchemaVersion(deps.sqlite) : 0,
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
        providerRegistry: deps.providerRegistry,
    });
    if (deps.sessionService && deps.audit) {
        registerSessionRoutes(app, config, deps.sessionService, deps.audit, deps.hooks, deps.sessionState);
    }
    if (deps.surfaceRegistry && deps.toolRegistry && deps.audit) {
        registerTerminalRoutes(app, deps.surfaceRegistry, deps.toolRegistry, deps.audit, deps.toolExecutor);
    }
    if (deps.consentManager && deps.audit) {
        registerConsentRoutes(app, deps.consentManager, deps.audit);
    }
    if (deps.voiceService && deps.consentManager) {
        registerVoiceRoutes(app, deps.voiceService, deps.consentManager);
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
    registerNetworkRoutes(app);
    if (deps.screenShare && deps.ws) {
        registerScreenShareRoutes(app, { screenShare: deps.screenShare, ws: deps.ws });
    }
    registerFilesystemRoutes(app, deps.ws);
    if (deps.surfaceRegistry) {
        registerWorkspaceRoutes(app, deps.surfaceRegistry, deps.sessionState, deps.sessionService);
    }
    // Git API routes
    registerGitRoutes(app, config);
    // Agent threads + provider routes
    if (deps.threadService && deps.providerRegistry) {
        registerThreadRoutes(app, config, {
            threadService: deps.threadService,
            providerRegistry: deps.providerRegistry,
            userService: deps.userService,
            ws: deps.ws,
        });
    }
    // Automation repository routes
    if (deps.repoService) {
        registerRepoRoutes(app, config, {
            repoService: deps.repoService,
            ws: deps.ws,
        });
    }
    // MCP SSE server for external CLI agents
    if (deps.toolRegistry) {
        registerMcpRoutes(app, { toolRegistry: deps.toolRegistry, config });
    }
    // ── Serve the web frontend (SPA) if the built files exist ────────
    // Probe paths in order: JAIT_WEB_DIR env, co-located ../web/dist
    // (npm global install or Docker), monorepo apps/web/dist (dev)
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
    }
    else {
        app.get("/", async () => ({
            name: "jait-gateway",
            version: VERSION,
            status: "ok",
        }));
    }
    return app;
}
/** Resolve the directory containing the built web frontend. */
function resolveWebDir() {
    // 1. Explicit env override
    if (process.env["JAIT_WEB_DIR"] && existsSync(process.env["JAIT_WEB_DIR"])) {
        return process.env["JAIT_WEB_DIR"];
    }
    // 2. Probe known locations for @jait/web/dist
    const candidates = [
        // npm global install: node_modules/@jait/web/dist (relative to gateway dist/)
        join(__dirname, "../../web/dist"),
        // If @jait/web is hoisted into top-level node_modules
        join(__dirname, "../../../@jait/web/dist"),
        // Try require.resolve to find @jait/web regardless of hoist layout
        (() => {
            try {
                // Resolve @jait/web package.json, then look for dist/ next to it
                const webPkg = require.resolve("@jait/web/package.json", { paths: [__dirname, process.cwd()] });
                return join(dirname(webPkg), "dist");
            }
            catch {
                return null;
            }
        })(),
        // Monorepo dev layout
        join(__dirname, "../../../../apps/web/dist"),
        // Manual placement in CWD
        join(process.cwd(), "web-dist"),
    ].filter((c) => c !== null);
    for (const dir of candidates) {
        if (existsSync(join(dir, "index.html")))
            return dir;
    }
    return null;
}
//# sourceMappingURL=server.js.map