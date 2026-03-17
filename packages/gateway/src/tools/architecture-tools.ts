import type { WsControlPlane } from "../ws.js";
import type { ToolDefinition } from "./contracts.js";

// ── architecture.generate ────────────────────────────────────────────

interface ArchitectureInput {
  diagram: string;
}

export function createArchitectureTool(
  ws?: WsControlPlane,
): ToolDefinition<ArchitectureInput> {
  return {
    name: "architecture.generate",
    description:
      "Generate and display a Mermaid architecture diagram of the current workspace. " +
      "Analyze the project structure, dependencies, modules, and data flow, then produce " +
      "a valid Mermaid diagram (flowchart, graph, C4, etc.). The diagram will be rendered " +
      "in the workspace Architecture tab. Output the Mermaid source as the `diagram` parameter.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        diagram: {
          type: "string",
          description:
            "The complete Mermaid diagram source code. Must be valid Mermaid syntax " +
            "(e.g. flowchart TD, graph LR, C4Context, etc.). Do not wrap in code fences.",
        },
      },
      required: ["diagram"],
    },
    async execute(input, context) {
      const diagram = input.diagram?.trim();
      if (!diagram) {
        return { ok: false, message: "No diagram content provided" };
      }

      // Push the diagram to the frontend via WS
      if (ws) {
        ws.sendUICommand(
          {
            command: "architecture.update",
            data: { diagram },
          },
          context.sessionId,
        );
      }

      return {
        ok: true,
        message: "Architecture diagram sent to the workspace panel.",
        data: { diagramLength: diagram.length },
      };
    },
  };
}
