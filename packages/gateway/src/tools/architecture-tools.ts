import type { WsControlPlane } from "../ws.js";
import type { ToolDefinition } from "./contracts.js";
import { nanoid } from "nanoid";

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

      const requestId = nanoid();

      // Push the diagram to the frontend via WS
      if (ws) {
        ws.sendUICommand(
          {
            command: "architecture.update",
            data: { diagram, requestId },
          },
          context.sessionId,
        );

        try {
          const renderResult = await ws.waitForArchitectureRenderResult(requestId);
          if (!renderResult.ok) {
            return {
              ok: false,
              message: `Architecture render failed: ${renderResult.error}`,
              data: { requestId, diagramLength: diagram.length, error: renderResult.error },
            };
          }
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : "Architecture render confirmation failed",
            data: { requestId, diagramLength: diagram.length },
          };
        }
      }

      return {
        ok: true,
        message: "Architecture diagram sent to the workspace panel.",
        data: { requestId, diagramLength: diagram.length },
      };
    },
  };
}
