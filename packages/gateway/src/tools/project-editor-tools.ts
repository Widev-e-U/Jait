import type { WsControlPlane } from "../ws.js";
import type { ToolDefinition } from "./contracts.js";

interface ProjectEditorOpenInput {}

export function createProjectEditorOpenTool(
  ws?: WsControlPlane,
): ToolDefinition<ProjectEditorOpenInput> {
  return {
    name: "project.editor.open",
    description: "Intentionally open the current project's editor UI. Use only when the user asks to see the editor or when opening it is necessary for the requested interaction; file edits do not open it automatically.",
    tier: "standard",
    category: "surfaces",
    source: "builtin",
    parameters: { type: "object", properties: {} },
    async execute(_input, context) {
      const sessionId = context.sessionId?.trim();
      const projectRoot = context.projectRoot?.trim();
      if (!sessionId) return { ok: false, message: "A session is required to open the project editor" };
      if (!projectRoot) return { ok: false, message: "A project is required to open the project editor" };
      if (!ws) return { ok: false, message: "The UI command channel is not available" };

      ws.sendUICommand({
        command: "project.editor.open",
        data: { projectRoot },
      }, sessionId);

      return {
        ok: true,
        message: "Project editor opened intentionally",
        data: { projectRoot },
      };
    },
  };
}
