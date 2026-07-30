import { describe, expect, it, vi } from "vitest";
import type { CodeGraphService } from "../services/code-graph/code-graphs.js";
import type { ToolContext } from "./contracts.js";
import { createCodeGraphTools } from "./code-graph-tools.js";

const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "test",
  userId: "user-1",
};

function toolByName(service: CodeGraphService, name: string) {
  const tool = createCodeGraphTools(service).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

describe("code graph tools", () => {
  it("passes the active project and user scope to graph queries", async () => {
    const query = vi.fn().mockResolvedValue({
      query: "authentication storage",
      mode: "hybrid",
      context: "AuthService -[calls]-> SessionStore",
      nodes: [{ id: "auth", label: "AuthService" }],
      edges: [{ id: "calls" }],
      graphRagStatus: "prepared",
    });
    const tool = toolByName({ query } as unknown as CodeGraphService, "codegraph.query");

    const result = await tool.execute({
      query: "authentication storage",
      mode: "hybrid",
      maxNodes: 80,
      maxDepth: 3,
    }, context);

    expect(result.ok).toBe(true);
    expect(query).toHaveBeenCalledWith({
      projectRoot: "/project/jait",
      userId: "user-1",
      query: "authentication storage",
      mode: "hybrid",
      maxNodes: 80,
      maxDepth: 3,
    });
  });

  it("exposes GraphRAG preparation as an explicit second stage", async () => {
    const prepareGraphRag = vi.fn().mockResolvedValue({
      index: { graphRagStatus: "prepared" },
      manifest: { entityCount: 12, relationshipCount: 18 },
    });
    const tool = toolByName(
      { prepareGraphRag } as unknown as CodeGraphService,
      "codegraph.prepare_graphrag",
    );

    const result = await tool.execute({}, context);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("12 entities and 18 relationships");
    expect(prepareGraphRag).toHaveBeenCalledWith({
      projectRoot: "/project/jait",
      userId: "user-1",
    });
  });

  it("fails clearly when no project is active", async () => {
    const index = vi.fn();
    const tool = toolByName({ index } as unknown as CodeGraphService, "codegraph.index");

    const result = await tool.execute({}, { ...context, projectRoot: undefined });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("project is required");
    expect(index).not.toHaveBeenCalled();
  });
});
