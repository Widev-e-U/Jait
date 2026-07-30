import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../db/connection.js";
import { CodeGraphService, parseGraphifyGraph } from "./code-graphs.js";
import { GraphifyRunner } from "./graphify-runner.js";

const sampleGraph = {
  directed: true,
  multigraph: false,
  graph: { hyperedges: [] },
  nodes: [
    {
      id: "src/auth.ts::AuthService",
      label: "AuthService",
      type: "class",
      file_type: "code",
      source_file: "src/auth.ts",
      line: 10,
      community: 1,
    },
    {
      id: "src/session.ts::SessionStore",
      label: "SessionStore",
      type: "class",
      file_type: "code",
      source_file: "src/session.ts",
      line: 5,
      community: 1,
    },
    {
      id: "src/db.ts::DatabasePool",
      label: "DatabasePool",
      type: "class",
      file_type: "code",
      source_file: "src/db.ts",
      line: 8,
      community: 2,
    },
  ],
  links: [
    {
      source: "src/auth.ts::AuthService",
      target: "src/session.ts::SessionStore",
      relation: "calls",
      confidence: "EXTRACTED",
      source_file: "src/auth.ts",
      line: 42,
    },
    {
      source: "src/session.ts::SessionStore",
      target: "src/db.ts::DatabasePool",
      relation: "uses",
      confidence: "INFERRED",
      confidence_score: 0.85,
      source_file: "src/session.ts",
      line: 27,
    },
  ],
};

describe("parseGraphifyGraph", () => {
  it("normalizes NetworkX nodes, links, statistics, and provenance", () => {
    const parsed = parseGraphifyGraph(sampleGraph);

    expect(parsed.stats).toMatchObject({
      nodeCount: 3,
      edgeCount: 2,
      communityCount: 2,
      relations: { calls: 1, uses: 1 },
    });
    expect(parsed.nodes.find((node) => node.label === "SessionStore")?.degree).toBe(2);
    expect(parsed.edges[1]).toMatchObject({
      relation: "uses",
      confidence: "INFERRED",
      confidenceScore: 0.85,
      sourceFile: "src/session.ts",
      line: 27,
    });
  });

  it("drops dangling edges instead of returning an invalid graph", () => {
    const parsed = parseGraphifyGraph({
      nodes: sampleGraph.nodes.slice(0, 1),
      links: sampleGraph.links,
    });

    expect(parsed.edges).toEqual([]);
  });
});

describe("CodeGraphService", () => {
  let projectRoot: string;
  let dataRoot: string;
  let service: CodeGraphService;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "jait-code-graph-project-"));
    dataRoot = await mkdtemp(join(tmpdir(), "jait-code-graph-data-"));
    const { db, sqlite } = await openDatabase(":memory:");
    sqlite.exec(`
      CREATE TABLE code_graph_indexes (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        repository_id TEXT,
        project_root TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'graphify',
        status TEXT NOT NULL DEFAULT 'missing',
        graph_path TEXT,
        graph_version TEXT,
        source_revision TEXT,
        graphify_version TEXT,
        stats TEXT,
        graphrag_status TEXT NOT NULL DEFAULT 'not-prepared',
        graphrag_path TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    sqlite.exec(`CREATE UNIQUE INDEX idx_code_graph_indexes_user_project ON code_graph_indexes(user_id, project_root)`);

    const runner = new GraphifyRunner({
      execute: async (_command, args) => {
        if (args[0] === "--version") return { stdout: "graphify 0.9.25", stderr: "" };
        const outIndex = args.indexOf("--out");
        const outputDir = join(args[outIndex + 1]!, "graphify-out");
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, "graph.json"), JSON.stringify(sampleGraph), "utf8");
        return { stdout: "indexed", stderr: "" };
      },
    });
    service = new CodeGraphService(db, { dataRoot, runner });
  });

  it("indexes into Jait-managed storage and returns a bounded snapshot", async () => {
    const index = await service.index({
      projectRoot,
      userId: "user-1",
      repositoryId: "repo-1",
    });

    expect(index).toMatchObject({
      projectRoot,
      repositoryId: "repo-1",
      status: "ready",
      graphifyVersion: "graphify 0.9.25",
    });
    expect(index.graphPath).toContain(dataRoot);
    expect(index.stats).toMatchObject({ nodeCount: 3, edgeCount: 2 });

    const snapshot = await service.snapshot({ projectRoot, userId: "user-1", maxNodes: 2 });
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.edges.every((edge) => (
      snapshot.nodes.some((node) => node.id === edge.source)
      && snapshot.nodes.some((node) => node.id === edge.target)
    ))).toBe(true);
  });

  it("retrieves a relevant subgraph with traceable context", async () => {
    await service.index({ projectRoot, userId: "user-1" });

    const result = await service.query({
      projectRoot,
      userId: "user-1",
      query: "how does authentication reach the database",
      mode: "hybrid",
    });

    expect(result.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(["AuthService", "SessionStore", "DatabasePool"]),
    );
    expect(result.context).toContain("AuthService -[calls]-> SessionStore");
    expect(result.context).toContain("src/auth.ts:42");
  });

  it("prepares GraphRAG entity, relationship, and text-unit datasets", async () => {
    await service.index({ projectRoot, userId: "user-1" });

    const result = await service.prepareGraphRag({ projectRoot, userId: "user-1" });

    expect(result.index.graphRagStatus).toBe("prepared");
    expect(result.manifest).toMatchObject({
      entityCount: 3,
      relationshipCount: 2,
      textUnitCount: 3,
    });
    const entities = await readFile(result.manifest.entitiesPath, "utf8");
    const relationships = await readFile(result.manifest.relationshipsPath, "utf8");
    expect(entities).toContain('"title":"AuthService"');
    expect(relationships).toContain('"confidence":"EXTRACTED"');
  });

  it("finds shortest paths by human-readable labels", async () => {
    await service.index({ projectRoot, userId: "user-1" });

    const result = await service.shortestPath({
      projectRoot,
      userId: "user-1",
      source: "AuthService",
      target: "DatabasePool",
    });

    expect(result?.nodes.map((node) => node.label)).toEqual([
      "AuthService",
      "SessionStore",
      "DatabasePool",
    ]);
    expect(result?.edges).toHaveLength(2);
  });
});
