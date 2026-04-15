import type { WsControlPlane } from "../ws.js";
import type { ToolDefinition } from "./contracts.js";
import { nanoid } from "nanoid";
import type { ArchitectureDiagramService } from "../services/architecture-diagrams.js";

// ── architecture.generate ────────────────────────────────────────────

interface ArchitectureInput {
  diagram: string;
}

export function createArchitectureTool(
  ws?: WsControlPlane,
  diagrams?: ArchitectureDiagramService,
): ToolDefinition<ArchitectureInput> {
  return {
    name: "architecture.generate",
    description:
      "Generate and display a Mermaid architecture diagram of the current workspace. " +
      "Analyze the project structure, dependencies, modules, and data flow, then produce " +
      "a valid Mermaid diagram (flowchart, graph, C4, etc.). The diagram will be rendered " +
      "in the editor Architecture tab. Output the Mermaid source as the `diagram` parameter.",
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
      const workspaceRoot = context.workspaceRoot?.trim();
      if (!workspaceRoot) {
        return { ok: false, message: "A workspace is required to store architecture diagrams" };
      }

      const requestId = nanoid();
      const filePath = typeof diagrams?.getFilePath === "function"
        ? diagrams.getFilePath(workspaceRoot)
        : undefined;

      // Push the diagram to the frontend via WS
      if (ws) {
        ws.sendUICommand(
          {
            command: "architecture.update",
            data: { diagram, requestId, workspaceRoot, filePath },
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

      const saved = await diagrams?.save({
        workspaceRoot,
        diagram,
        userId: context.userId,
      });

      return {
        ok: true,
        message: "Architecture diagram saved to architecture.mmd and sent to the editor.",
        data: {
          requestId,
          diagramLength: diagram.length,
          workspaceRoot,
          filePath: saved?.filePath ?? filePath ?? null,
          updatedAt: saved?.updatedAt ?? null,
        },
      };
    },
  };
}
