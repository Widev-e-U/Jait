import type { WsControlPlane } from "../ws.js";
import type { SessionStateService } from "../services/session-state.js";
import type { ToolDefinition } from "./contracts.js";
import type { PreviewService } from "../services/preview.js";
import type { BrowserCollaborationService } from "../services/browser-collaboration.js";
import type { DevPreviewPanelState } from "@jait/shared";

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
  page?: unknown;
  snapshot?: string | null;
}>(result: T): T & { captureSuppressed: true; suppressionReason: string } {
  return {
    ...result,
    browserEvents: [],
    logs: [],
    screenshot: null,
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
    description: "Open a project preview. If `target` is a localhost URL or port, attach to the existing server. Otherwise, start a managed preview for the current workspace, launch the dev server, open a browser, and capture console/network/errors.",
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
      browserCollaborationService?.syncPreviewSession(preview, {
        userId: context.userId,
        workspaceRoot: workspaceRoot || undefined,
        mode: target ? "shared" : "isolated",
      });

      const panelState: DevPreviewPanelState = {
        open: true,
        target: (preview.url ?? target) || null,
        workspaceRoot: workspaceRoot || null,
        displayState: ((preview.url ?? target) ? "connected" : "blank"),
        displayTarget: (preview.url ?? target) || null,
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
    description: "Stop the active managed preview session and kill its dev server process",
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
    description: "Get the current status of the managed preview session including URL, mode, and any errors",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: { type: "object", properties: {} },
    async execute(_input, context) {
      if (!previewService) return { ok: false, message: "Preview service is not available" };
      const sessionId = resolvePreviewSessionId(context);
      if (!sessionId) return { ok: false, message: "No active session" };

      const session = previewService.get(sessionId);
      if (!session) return { ok: true, message: "No active preview session", data: { active: false } };

      return {
        ok: true,
        message: `Preview ${session.status} at ${session.url ?? "unknown"} (${session.mode} mode)`,
        data: {
          active: true,
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

      const session = previewService.get(sessionId);
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
    description: "Inspect the active preview: get browser events, errors, current DOM snapshot, and optionally a screenshot",
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
      const data = browserSession?.secretSafe ? redactPreviewCapture(result) : result;

      const errorCount = data.browserEvents.filter((e) =>
        e.type === "pageerror" || e.type === "requestfailed" || (e.type === "response" && (e.status ?? 0) >= 400),
      ).length;

      return {
        ok: true,
        message: browserSession?.secretSafe
          ? `Preview ${data.status} at ${data.url ?? "unknown"} — capture suppressed because the linked browser session is marked secret-safe`
          : `Preview ${data.status} at ${data.url ?? "unknown"} — ${data.browserEvents.length} events, ${errorCount} errors${data.screenshot ? ", screenshot included" : ""}`,
        data,
      };
    },
  };
}
