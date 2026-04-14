import type { WsControlPlane } from "../ws.js";
import type { SessionStateService } from "../services/session-state.js";
import type { ToolDefinition } from "./contracts.js";
import type { PreviewService } from "../services/preview.js";
import type { BrowserCollaborationService } from "../services/browser-collaboration.js";

interface DevPreviewPanelState {
  open: boolean;
  target?: string | null;
  workspaceRoot?: string | null;
  browserSessionId?: string | null;
  displayState?: "hidden" | "blank" | "connected";
  displayTarget?: string | null;
  storageScope?: "shared-browser" | "isolated-browser-session" | "unknown";
}

// ── preview.start (was preview.open) ─────────────────────────────────

interface PreviewStartInput {
  target?: string;
  command?: string;
  port?: number;
  workspaceRoot?: string;
  frameworkHint?: string;
}

function resolvePreviewSessionId(context: { sessionId?: string }): string {
  return context.sessionId?.trim() || "";
}

function resolvePreviewBrowserSession(
  browserCollaborationService: BrowserCollaborationService | undefined,
  sessionId: string,
) {
  return browserCollaborationService?.getSessionByPreviewSessionId(sessionId) ?? null;
}

function redactPreviewCapture<T extends {
  browserEvents: unknown[];
  logs: unknown[];
  screenshot: string | null;
  metrics?: unknown;
  page?: unknown;
  snapshot?: string | null;
}>(result: T): T & { captureSuppressed: true; suppressionReason: string } {
  return {
    ...result,
    browserEvents: [],
    logs: [],
    screenshot: null,
    metrics: null,
    page: null,
    snapshot: null,
    captureSuppressed: true,
    suppressionReason: "Preview capture is suppressed while the linked browser session is marked secret-safe.",
  };
}

export function createPreviewStartTool(
  ws?: WsControlPlane,
  sessionState?: SessionStateService,
  previewService?: PreviewService,
  browserCollaborationService?: BrowserCollaborationService,
): ToolDefinition<PreviewStartInput> {
  return {
    name: "preview.start",
    description: "Create the complete live preview flow for the current project. Use this tool when you want preview handled end-to-end: attach to an existing local target or start the project if needed, create the dedicated browser session, and expose the live VNC/noVNC preview.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Optional local preview target such as 3000 or http://127.0.0.1:8765/",
        },
        command: {
          type: "string",
          description: "Optional explicit preview command to run inside the workspace",
        },
        port: {
          type: "number",
          description: "Optional preferred preview port",
        },
        workspaceRoot: {
          type: "string",
          description: "Optional workspace root override for the preview session",
        },
        frameworkHint: {
          type: "string",
          description: "Optional framework hint (vite, next, nuxt, astro, remix) to improve auto-detection",
        },
      },
    },
    async execute(input, context) {
      const target = input.target?.trim() || "";
      const sessionId = resolvePreviewSessionId(context);
      const workspaceRoot = input.workspaceRoot?.trim() || context.workspaceRoot || "";

      if (!previewService) return { ok: false, message: "Preview service is not available" };
      if (!sessionId) return { ok: false, message: "A valid session is required to start a preview" };

      const preview = await previewService.start({
        sessionId,
        workspaceRoot: workspaceRoot || undefined,
        target: target || undefined,
        command: input.command?.trim() || undefined,
        port: typeof input.port === "number" ? input.port : undefined,
        frameworkHint: input.frameworkHint?.trim() || undefined,
      });
      if (preview.status === "ready") {
        // Persist the original user-facing target (e.g. "http://127.0.0.1:3000/")
        // rather than the ephemeral noVNC container URL. The live noVNC URL is
        // delivered via the managed preview session's remoteBrowser field and
        // changes whenever the sandbox container is recreated.
        const stableTarget = preview.target ?? target ?? null;
        browserCollaborationService?.syncPreviewSession(preview, {
          userId: context.userId,
          workspaceRoot: workspaceRoot || undefined,
          mode: target ? "shared" : "isolated",
        });

        const panelState: DevPreviewPanelState = {
          open: true,
          target: stableTarget,
          workspaceRoot: workspaceRoot || null,
          displayState: "connected",
          displayTarget: stableTarget,
          storageScope: "isolated-browser-session",
        };
        if (ws) {
          ws.sendUICommand(
            {
              command: "dev-preview.open",
              data: { target: panelState.target, workspaceRoot: panelState.workspaceRoot },
            },
            sessionId,
          );
          ws.broadcast(sessionId, {
            type: "ui.state-sync",
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { key: "dev-preview.panel", value: panelState },
          });
        }
        sessionState?.set(sessionId, { "dev-preview.panel": panelState });
      } else {
        const panelState: DevPreviewPanelState = {
          open: false,
          target: null,
          workspaceRoot: workspaceRoot || null,
          displayState: "hidden",
          displayTarget: null,
          storageScope: "unknown",
        };
        if (ws) {
          ws.broadcast(sessionId, {
            type: "ui.state-sync",
            sessionId,
            timestamp: new Date().toISOString(),
            payload: { key: "dev-preview.panel", value: panelState },
          });
        }
        sessionState?.set(sessionId, { "dev-preview.panel": panelState });
      }

      return {
        ok: preview.status === "ready",
        message: preview.status === "ready"
          ? `Preview started at ${preview.url} (${preview.mode} mode)`
          : `Preview failed: ${preview.lastError ?? "unknown error"}`,
        data: preview,
      };
    },
  };
}

// ── preview.open (backward-compat alias for preview.start) ───────────

export function createPreviewOpenTool(
  ws?: WsControlPlane,
  sessionState?: SessionStateService,
  previewService?: PreviewService,
  browserCollaborationService?: BrowserCollaborationService,
): ToolDefinition<PreviewStartInput> {
  const tool = createPreviewStartTool(ws, sessionState, previewService, browserCollaborationService);
  return { ...tool, name: "preview.open" };
}

// ── preview.stop ─────────────────────────────────────────────────────

interface PreviewStopInput {
  // empty — uses context.sessionId
}

export function createPreviewStopTool(
  ws?: WsControlPlane,
  sessionState?: SessionStateService,
  previewService?: PreviewService,
  browserCollaborationService?: BrowserCollaborationService,
): ToolDefinition<PreviewStopInput> {
  return {
    name: "preview.stop",
    description: "Stop the active live preview flow and clean up its browser session and any managed preview process",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: { type: "object", properties: {} },
    async execute(_input, context) {
      if (!previewService) return { ok: false, message: "Preview service is not available" };
      const sessionId = resolvePreviewSessionId(context);
      if (!sessionId) return { ok: false, message: "No active session" };

      const stopped = await previewService.stop(sessionId);
      if (!stopped) return { ok: false, message: "No active preview session found" };
      browserCollaborationService?.closePreviewSession(sessionId);

      const panelState: DevPreviewPanelState = {
        open: false,
        target: null,
        workspaceRoot: null,
        displayState: "hidden",
        displayTarget: null,
        storageScope: "unknown",
      };
      if (ws) {
        ws.sendUICommand(
          { command: "dev-preview.open", data: { target: null, workspaceRoot: null } },
          sessionId,
        );
        ws.broadcast(sessionId, {
          type: "ui.state-sync",
          sessionId,
          timestamp: new Date().toISOString(),
          payload: { key: "dev-preview.panel", value: panelState },
        });
      }
      sessionState?.set(sessionId, { "dev-preview.panel": panelState });

      return { ok: true, message: "Preview session stopped" };
    },
  };
}

// ── preview.restart ──────────────────────────────────────────────────

interface PreviewRestartInput {
  // empty
}

export function createPreviewRestartTool(
  previewService?: PreviewService,
  browserCollaborationService?: BrowserCollaborationService,
): ToolDefinition<PreviewRestartInput> {
  return {
    name: "preview.restart",
    description: "Restart the active preview session (stops old process, starts fresh, re-attaches browser)",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: { type: "object", properties: {} },
    async execute(_input, context) {
      if (!previewService) return { ok: false, message: "Preview service is not available" };
      const sessionId = resolvePreviewSessionId(context);
      if (!sessionId) return { ok: false, message: "No active session" };

      const session = await previewService.restart(sessionId);
      if (!session) return { ok: false, message: "No active preview session to restart" };
      browserCollaborationService?.syncPreviewSession(session, {
        userId: context.userId,
        workspaceRoot: session.workspaceRoot ?? context.workspaceRoot,
        mode: session.target ? "shared" : "isolated",
      });

      return {
        ok: session.status === "ready",
        message: session.status === "ready"
          ? `Preview restarted at ${session.url}`
          : `Preview restart failed: ${session.lastError ?? "unknown"}`,
        data: session,
      };
    },
  };
}

// ── preview.status ───────────────────────────────────────────────────

interface PreviewStatusInput {
  // empty
}

export function createPreviewStatusTool(
  previewService?: PreviewService,
): ToolDefinition<PreviewStatusInput> {
  return {
    name: "preview.status",
    description: "Get the current status of the managed preview session including URL, mode, errors, and browserId for use with browser.click/type/etc.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: { type: "object", properties: {} },
    async execute(_input, context) {
      if (!previewService) return { ok: false, message: "Preview service is not available" };
      const sessionId = resolvePreviewSessionId(context);
      if (!sessionId) return { ok: false, message: "No active session" };

      const session = await previewService.refreshSessionCapture(sessionId);
      if (!session) return { ok: true, message: "No active preview session", data: { active: false } };

      return {
        ok: true,
        message: `Preview ${session.status} at ${session.url ?? "unknown"} (${session.mode} mode)`,
        data: {
          active: true,
          browserId: session.browserId,
          status: session.status,
          mode: session.mode,
          url: session.url,
          port: session.port,
          command: session.command,
          processId: session.processId,
          containerId: session.containerId,
          lastError: session.lastError,
          eventCount: session.browserEvents.length,
          logCount: session.logs.length,
          metrics: session.metrics,
        },
      };
    },
  };
}

// ── preview.logs ─────────────────────────────────────────────────────

interface PreviewLogsInput {
  sinceId?: number;
  stream?: string;
}

export function createPreviewLogsTool(
  previewService?: PreviewService,
  browserCollaborationService?: BrowserCollaborationService,
): ToolDefinition<PreviewLogsInput> {
  return {
    name: "preview.logs",
    description: "Read recent server and browser logs from the active preview session. Returns process stdout/stderr, browser console messages, page errors, and failed network requests.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        sinceId: {
          type: "number",
          description: "Only return log entries with an ID greater than this value (for incremental reads)",
        },
        stream: {
          type: "string",
          description: "Filter to a specific stream: stdout, stderr, system, or all (default: all)",
          enum: ["stdout", "stderr", "system", "all"],
        },
      },
    },
    async execute(input, context) {
      if (!previewService) return { ok: false, message: "Preview service is not available" };
      const sessionId = resolvePreviewSessionId(context);
      if (!sessionId) return { ok: false, message: "No active session" };

      const session = await previewService.refreshSessionCapture(sessionId);
      if (!session) return { ok: false, message: "No active preview session" };
      const browserSession = resolvePreviewBrowserSession(browserCollaborationService, sessionId);
      if (browserSession?.secretSafe) {
        return {
          ok: true,
          message: "Preview logs are suppressed because the linked browser session is marked secret-safe",
          data: {
            logs: [],
            console: [],
            errors: [],
            lastLogId: 0,
            captureSuppressed: true,
            suppressionReason: "Preview capture is suppressed while the linked browser session is marked secret-safe.",
          },
        };
      }

      let logs = previewService.getLogs(sessionId, input.sinceId ?? 0);
      if (input.stream && input.stream !== "all") {
        logs = logs.filter((entry) => entry.stream === input.stream);
      }

      const browserEvents = session.browserEvents;
      const errors = browserEvents.filter((e) =>
        e.type === "pageerror" || e.type === "requestfailed" || (e.type === "response" && (e.status ?? 0) >= 400),
      );
      const consoleEntries = browserEvents.filter((e) => e.type === "console");

      return {
        ok: true,
        message: `${logs.length} log entries, ${consoleEntries.length} console messages, ${errors.length} browser errors`,
        data: {
          logs: logs.slice(-100),
          console: consoleEntries.slice(-50),
          errors: errors.slice(-30),
          lastLogId: logs[logs.length - 1]?.id ?? 0,
          metrics: session.metrics,
        },
      };
    },
  };
}

// ── preview.inspect ──────────────────────────────────────────────────

interface PreviewInspectInput {
  screenshot?: boolean;
}

export function createPreviewInspectTool(
  previewService?: PreviewService,
  browserCollaborationService?: BrowserCollaborationService,
): ToolDefinition<PreviewInspectInput> {
  return {
    name: "preview.inspect",
    description: "Inspect the active preview and return its browserId, interactive elements with CSS selectors (for browser.click/type), DOM snapshot, browser events/errors, and optionally a screenshot. Use the returned browserId and element selectors with browser.* tools to interact with the preview.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        screenshot: {
          type: "boolean",
          description: "Whether to include a base64 screenshot (default: false)",
        },
      },
    },
    async execute(input, context) {
      if (!previewService) return { ok: false, message: "Preview service is not available" };
      const sessionId = resolvePreviewSessionId(context);
      if (!sessionId) return { ok: false, message: "No active session" };

      const result = await previewService.inspect(sessionId);
      if (!result) return { ok: false, message: "No active preview session" };
      const browserSession = resolvePreviewBrowserSession(browserCollaborationService, sessionId);

      // Strip screenshot if not requested
      if (!input.screenshot) {
        result.screenshot = null;
      }
      const session = previewService.get(sessionId);
      const browserId = session?.browserId ?? null;
      const data = browserSession?.secretSafe ? redactPreviewCapture(result) : result;

      const errorCount = data.browserEvents.filter((e) =>
        e.type === "pageerror" || e.type === "requestfailed" || (e.type === "response" && (e.status ?? 0) >= 400),
      ).length;

      return {
        ok: true,
        message: browserSession?.secretSafe
          ? `Preview ${data.status} at ${data.url ?? "unknown"} — capture suppressed because the linked browser session is marked secret-safe`
          : `Preview ${data.status} at ${data.url ?? "unknown"} — ${data.browserEvents.length} events, ${errorCount} errors${data.metrics ? ", metrics included" : ""}${data.screenshot ? ", screenshot included" : ""}`,
        data: { browserId, ...data },
      };
    },
  };
}
