import type { WsControlPlane } from "../ws.js";
import type { SessionStateService } from "../services/session-state.js";
import type { ToolDefinition } from "./contracts.js";
import type { PreviewService } from "../services/preview.js";

interface PreviewOpenInput {
  target?: string;
  command?: string;
  port?: number;
  workspaceRoot?: string;
}

export function createPreviewOpenTool(
  ws?: WsControlPlane,
  sessionState?: SessionStateService,
  previewService?: PreviewService,
): ToolDefinition<PreviewOpenInput> {
  return {
    name: "preview.open",
    description: "Start or open a managed preview for the current workspace, or inspect a local loopback URL/port",
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
      },
    },
    async execute(input, context) {
      const target = input.target?.trim() || "";
      if (!ws) return { ok: false, message: "UI command channel is unavailable" };
      const sessionId = context.sessionId && context.sessionId !== "mcp-session"
        ? context.sessionId
        : "";
      const workspaceRoot = input.workspaceRoot?.trim() || context.workspaceRoot || "";
      const shouldStartManagedPreview = Boolean(previewService) && Boolean(workspaceRoot || input.command?.trim());

      let sessionData: unknown = undefined;
      if (previewService && sessionId && (shouldStartManagedPreview || target)) {
        const preview = await previewService.start({
          sessionId,
          workspaceRoot: workspaceRoot || undefined,
          target: target || undefined,
          command: input.command?.trim() || undefined,
          port: typeof input.port === "number" ? input.port : undefined,
        });
        sessionData = preview;
      }

      const panelState = { open: true, target: sessionData ? null : (target || null) };

      ws.sendUICommand(
        {
          command: "dev-preview.open",
          data: { target: sessionData ? null : (target || null) },
        },
        sessionId,
      );
      if (sessionId) {
        ws.broadcast(sessionId, {
          type: "ui.state-sync",
          sessionId,
          timestamp: new Date().toISOString(),
          payload: { key: "dev-preview.panel", value: panelState },
        });
        sessionState?.set(sessionId, { "dev-preview.panel": panelState });
      }

      return {
        ok: true,
        message: sessionData
          ? `Started managed preview${target ? ` for ${target}` : ""}`
          : `Opened preview${target ? ` for ${target}` : ""}`,
        data: sessionData ?? { target: target || null },
      };
    },
  };
}
