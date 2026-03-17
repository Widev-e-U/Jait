import type { WsControlPlane } from "../ws.js";
import type { ToolDefinition } from "./contracts.js";

interface PreviewOpenInput {
  target: string;
}

export function createPreviewOpenTool(ws?: WsControlPlane): ToolDefinition<PreviewOpenInput> {
  return {
    name: "preview.open",
    description: "Open the frontend Preview panel for a local loopback URL or port",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Local preview target such as 3000 or http://127.0.0.1:8765/index.html",
        },
      },
      required: ["target"],
    },
    async execute(input, context) {
      const target = input.target.trim();
      if (!target) return { ok: false, message: "target is required" };
      if (!ws) return { ok: false, message: "UI command channel is unavailable" };

      ws.sendUICommand(
        {
          command: "dev-preview.open",
          data: { target },
        },
        context.sessionId,
      );

      return {
        ok: true,
        message: `Opened preview for ${target}`,
        data: { target },
      };
    },
  };
}
