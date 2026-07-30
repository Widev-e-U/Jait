import type { CodeGraphQueryResult } from "@jait/shared";
import type { CodeGraphService } from "../services/code-graph/code-graphs.js";
import type { ToolDefinition } from "./contracts.js";

interface CodeGraphIndexInput {}

interface CodeGraphQueryInput {
  query: string;
  mode?: CodeGraphQueryResult["mode"];
  maxNodes?: number;
  maxDepth?: number;
}

interface CodeGraphPathInput {
  source: string;
  target: string;
  maxDepth?: number;
}

function requireProjectRoot(projectRoot: string | undefined): string {
  const normalized = projectRoot?.trim();
  if (!normalized) throw new Error("A project is required for code graph tools");
  return normalized;
}

export function createCodeGraphTools(service: CodeGraphService): ToolDefinition[] {
  const indexTool: ToolDefinition<CodeGraphIndexInput> = {
    name: "codegraph.index",
    description:
      "Build or refresh the current repository's local structural code graph with Graphify. " +
      "Use this before graph queries when no ready index exists.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute(_input, context) {
      try {
        const index = await service.index({
          projectRoot: requireProjectRoot(context.projectRoot),
          userId: context.userId,
          signal: context.signal,
        });
        return {
          ok: true,
          message: `Indexed ${index.stats?.nodeCount ?? 0} nodes and ${index.stats?.edgeCount ?? 0} edges.`,
          data: index,
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  const queryTool: ToolDefinition<CodeGraphQueryInput> = {
    name: "codegraph.query",
    description:
      "Retrieve a compact multi-hop subgraph for a codebase question with typed edges, " +
      "confidence, and file/line provenance.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Question or concept to retrieve from the code graph.",
        },
        mode: {
          type: "string",
          enum: ["structural", "global", "hybrid"],
          description: "Retrieval mode. Hybrid is the default.",
        },
        maxNodes: {
          type: "number",
          description: "Maximum nodes to return, up to 1000.",
        },
        maxDepth: {
          type: "number",
          description: "Traversal depth, up to 8.",
        },
      },
      required: ["query"],
    },
    async execute(input, context) {
      try {
        const result = await service.query({
          projectRoot: requireProjectRoot(context.projectRoot),
          userId: context.userId,
          query: input.query,
          mode: input.mode,
          maxNodes: input.maxNodes,
          maxDepth: input.maxDepth,
        });
        return {
          ok: true,
          message: `Retrieved ${result.nodes.length} nodes and ${result.edges.length} relationships.`,
          data: result,
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  const pathTool: ToolDefinition<CodeGraphPathInput> = {
    name: "codegraph.path",
    description:
      "Find the shortest structural path between two code symbols or concepts.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Source symbol label or node id.",
        },
        target: {
          type: "string",
          description: "Target symbol label or node id.",
        },
        maxDepth: {
          type: "number",
          description: "Maximum path depth, up to 50.",
        },
      },
      required: ["source", "target"],
    },
    async execute(input, context) {
      try {
        const result = await service.shortestPath({
          projectRoot: requireProjectRoot(context.projectRoot),
          userId: context.userId,
          source: input.source,
          target: input.target,
          maxDepth: input.maxDepth,
        });
        if (!result) {
          return { ok: false, message: "No code graph path found." };
        }
        return {
          ok: true,
          message: `Found a ${result.edges.length}-hop path.`,
          data: result,
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  const prepareGraphRagTool: ToolDefinition<Record<string, never>> = {
    name: "codegraph.prepare_graphrag",
    description:
      "Prepare the current structural graph as GraphRAG entity, relationship, and text-unit datasets. " +
      "This is the optional second stage for global and multi-hop reasoning.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute(_input, context) {
      try {
        const result = await service.prepareGraphRag({
          projectRoot: requireProjectRoot(context.projectRoot),
          userId: context.userId,
        });
        return {
          ok: true,
          message: `Prepared ${result.manifest.entityCount} entities and ${result.manifest.relationshipCount} relationships for GraphRAG.`,
          data: result,
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  const statusTool: ToolDefinition<Record<string, never>> = {
    name: "codegraph.status",
    description:
      "Get freshness, version, node counts, Graphify version, and GraphRAG preparation status for the current project.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute(_input, context) {
      try {
        const index = service.getIndex(
          requireProjectRoot(context.projectRoot),
          context.userId,
        );
        return {
          ok: true,
          message: index.status === "ready" ? "Code graph is ready." : `Code graph status: ${index.status}.`,
          data: index,
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  return [indexTool, queryTool, pathTool, prepareGraphRagTool, statusTool];
}
