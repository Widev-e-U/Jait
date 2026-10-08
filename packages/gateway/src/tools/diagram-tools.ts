import type { ToolDefinition } from "./contracts.js";

export function createDiagramTool(): ToolDefinition<{ diagram: string; title?: string }> {
  return {
    name: "diagram.render",
    description: "Display a Mermaid diagram directly in chat. Use for flowcharts, sequences, and other visual explanations. Pass Mermaid source without code fences and an optional title. The chat card preserves the source; no files or editor tabs are changed.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    risk: "low",
    defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        diagram: { type: "string", description: "Mermaid source without code fences" },
        title: { type: "string", description: "Optional title, up to 200 characters" },
      },
      required: ["diagram"],
    },
    async execute(input) {
      if (typeof input.diagram !== "string" || !input.diagram.trim() || input.diagram.length > 20000) {
        return { ok: false, message: "Provide Mermaid source between 1 and 20000 characters." };
      }
      if (input.title !== undefined && (typeof input.title !== "string" || input.title.length > 200)) {
        return { ok: false, message: "Title must be a string of at most 200 characters." };
      }
      return {
        ok: true,
        message: "Mermaid source ready for display in chat.",
        data: { kind: "mermaid-diagram", diagram: input.diagram.trim(), title: input.title?.trim() || "Diagram" },
      };
    },
  };
}
