import type { WsControlPlane } from "../ws.js";
import type { SessionStateService } from "../services/session-state.js";
import type { ToolDefinition } from "./contracts.js";
import type { PreviewService } from "../services/preview.js";

// ── preview.start (was preview.open) ─────────────────────────────────

interface PreviewStartInput {
  target?: string;
  command?: string;
  port?: number;
  workspaceRoot?: string;
  frameworkHint?: string;
}

export function createPreviewStartTool(
  ws?: WsControlPlane,
  sessionState?: SessionStateService,
  previewService?: PreviewService,
): ToolDefinition<PreviewStartInput> {
  return {
    name: "preview.start",
    description: "Start a managed preview session for the current workspace. Launches the dev server, opens a browser, and begins capturing console/network/errors.",
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
      const sessionId = context.sessionId && context.sessionId !== "mcp-session"
        ? context.sessionId
        : "";
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

      const panelState = { open: true, target: null };
      if (ws) {
        ws.sendUICommand(
          { command: "dev-preview.open", data: { target: null } },
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
): ToolDefinition<PreviewStartInput> {
  const tool = createPreviewStartTool(ws, sessionState, previewService);
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
      const sessionId = context.sessionId && context.sessionId !== "mcp-session"
        ? context.sessionId : "";
      if (!sessionId) return { ok: false, message: "No active session" };

      const stopped = await previewService.stop(sessionId);
      if (!stopped) return { ok: false, message: "No active preview session found" };

      const panelState = { open: false, target: null };
      if (ws) {
        ws.sendUICommand(
          { command: "dev-preview.open", data: { target: null } },
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
      const sessionId = context.sessionId && context.sessionId !== "mcp-session"
        ? context.sessionId : "";
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
      const sessionId = context.sessionId && context.sessionId !== "mcp-session"
        ? context.sessionId : "";
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
      const sessionId = context.sessionId && context.sessionId !== "mcp-session"
        ? context.sessionId : "";
      if (!sessionId) return { ok: false, message: "No active session" };

      const session = previewService.get(sessionId);
      if (!session) return { ok: false, message: "No active preview session" };

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
      const sessionId = context.sessionId && context.sessionId !== "mcp-session"
        ? context.sessionId : "";
      if (!sessionId) return { ok: false, message: "No active session" };

      const result = await previewService.inspect(sessionId);
      if (!result) return { ok: false, message: "No active preview session" };

      // Strip screenshot if not requested
      if (!input.screenshot) {
        result.screenshot = null;
      }

      const errorCount = result.browserEvents.filter((e) =>
        e.type === "pageerror" || e.type === "requestfailed" || (e.type === "response" && (e.status ?? 0) >= 400),
      ).length;

      return {
        ok: true,
        message: `Preview ${result.status} at ${result.url ?? "unknown"} — ${result.browserEvents.length} events, ${errorCount} errors${result.screenshot ? ", screenshot included" : ""}`,
        data: result,
      };
    },
  };
}
