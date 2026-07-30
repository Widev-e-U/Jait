import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  CodeGraphConfidence,
  CodeGraphEdge,
  CodeGraphIndex,
  CodeGraphNode,
  CodeGraphPathResult,
  CodeGraphQueryResult,
  CodeGraphSnapshot,
  CodeGraphStats,
  GraphRagExportManifest,
} from "@jait/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { JaitDB } from "../../db/connection.js";
import { codeGraphIndexes } from "../../db/schema.js";
import { uuidv7 } from "../../db/uuidv7.js";
import { GraphifyRunner } from "./graphify-runner.js";
import { writeGraphRagExport } from "./graphrag-adapter.js";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_NODES = 2_000;
const QUERY_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "does", "for", "from",
  "how", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to",
  "what", "when", "where", "which", "who", "why", "with",
]);

type CodeGraphIndexRow = typeof codeGraphIndexes.$inferSelect;

interface RawGraph {
  nodes?: unknown[];
  links?: unknown[];
  edges?: unknown[];
}

interface ParsedGraph {
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
  stats: CodeGraphStats;
}

export interface CodeGraphServiceOptions {
  dataRoot?: string;
  runner?: GraphifyRunner;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function edgeEndpoint(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return firstString(asRecord(value), ["id", "key", "name"]);
}

function normalizeConfidence(value: unknown): CodeGraphConfidence {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "EXTRACTED" || normalized === "INFERRED" || normalized === "AMBIGUOUS") {
    return normalized;
  }
  return "UNKNOWN";
}

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function parseStats(value: string | null): CodeGraphStats | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as CodeGraphStats;
  } catch {
    return null;
  }
}

function toIndex(row: CodeGraphIndexRow): CodeGraphIndex {
  return {
    id: row.id,
    projectRoot: row.projectRoot,
    repositoryId: row.repositoryId,
    provider: "graphify",
    status: row.status as CodeGraphIndex["status"],
    graphPath: row.graphPath,
    graphVersion: row.graphVersion,
    sourceRevision: row.sourceRevision,
    graphifyVersion: row.graphifyVersion,
    stats: parseStats(row.stats),
    graphRagStatus: row.graphRagStatus as CodeGraphIndex["graphRagStatus"],
    graphRagPath: row.graphRagPath,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function missingIndex(projectRoot: string): CodeGraphIndex {
  const now = new Date().toISOString();
  return {
    id: `missing:${projectRoot}`,
    projectRoot,
    provider: "graphify",
    status: "missing",
    graphRagStatus: "not-prepared",
    createdAt: now,
    updatedAt: now,
  };
}

function parseGraph(raw: unknown): ParsedGraph {
  const graph = asRecord(raw) as RawGraph;
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.links)
    ? graph.links
    : Array.isArray(graph.edges)
      ? graph.edges
      : [];

  const nodes: CodeGraphNode[] = [];
  const nodeById = new Map<string, CodeGraphNode>();
  for (const value of rawNodes) {
    const record = asRecord(value);
    const id = firstString(record, ["id", "key", "name"]);
    if (!id || nodeById.has(id)) continue;
    const label = firstString(record, ["label", "name", "title"]) ?? id;
    const fileType = firstString(record, ["file_type", "fileType"]);
    const node: CodeGraphNode = {
      id,
      label,
      type: firstString(record, ["node_type", "nodeType", "kind", "type"]) ?? fileType ?? "unknown",
      fileType,
      sourceFile: firstString(record, ["source_file", "sourceFile", "path", "file"]),
      line: firstNumber(record, ["line", "start_line", "startLine", "line_number"]),
      endLine: firstNumber(record, ["end_line", "endLine"]),
      community: firstString(record, ["community", "community_id", "communityId", "cluster"]),
      degree: 0,
      properties: { ...record },
    };
    nodes.push(node);
    nodeById.set(id, node);
  }

  const edges: CodeGraphEdge[] = [];
  for (const [index, value] of rawEdges.entries()) {
    const record = asRecord(value);
    const source = edgeEndpoint(record["source"]);
    const target = edgeEndpoint(record["target"]);
    if (!source || !target || !nodeById.has(source) || !nodeById.has(target)) continue;
    const relation = firstString(record, ["relation", "type", "label", "kind"]) ?? "related_to";
    const edge: CodeGraphEdge = {
      id: firstString(record, ["id", "key"]) ?? `${source}->${target}:${relation}:${index}`,
      source,
      target,
      relation,
      confidence: normalizeConfidence(record["confidence"]),
      confidenceScore: firstNumber(record, ["confidence_score", "confidenceScore", "weight"]),
      sourceFile: firstString(record, ["source_file", "sourceFile", "file"]),
      line: firstNumber(record, ["line", "source_line", "sourceLine", "line_number"]),
      properties: { ...record },
    };
    edges.push(edge);
    nodeById.get(source)!.degree++;
    nodeById.get(target)!.degree++;
  }

  const nodeTypes: Record<string, number> = {};
  const relations: Record<string, number> = {};
  const confidence: Record<CodeGraphConfidence, number> = {
    EXTRACTED: 0,
    INFERRED: 0,
    AMBIGUOUS: 0,
    UNKNOWN: 0,
  };
  const communities = new Set<string>();
  for (const node of nodes) {
    increment(nodeTypes, node.type);
    if (node.community) communities.add(node.community);
  }
  for (const edge of edges) {
    increment(relations, edge.relation);
    confidence[edge.confidence]++;
  }

  return {
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      communityCount: communities.size,
      nodeTypes,
      relations,
      confidence,
    },
  };
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_$.-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !QUERY_STOP_WORDS.has(token));
}

function nodeSearchText(node: CodeGraphNode): string {
  return [node.id, node.label, node.type, node.sourceFile, node.community]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreNode(node: CodeGraphNode, tokens: string[]): number {
  if (tokens.length === 0) return node.degree;
  const label = node.label.toLowerCase();
  const id = node.id.toLowerCase();
  const text = nodeSearchText(node);
  let score = 0;
  for (const token of tokens) {
    if (label === token || id === token) score += 20;
    else if (label.startsWith(token)) score += 10;
    else if (label.includes(token)) score += 7;
    else if (id.includes(token)) score += 5;
    else if (text.includes(token)) score += 2;
  }
  return score + Math.min(node.degree / 100, 1);
}

function graphContext(nodes: CodeGraphNode[], edges: CodeGraphEdge[]): string {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const lines = edges.slice(0, 80).map((edge) => {
    const source = nodeById.get(edge.source)?.label ?? edge.source;
    const target = nodeById.get(edge.target)?.label ?? edge.target;
    const provenance = edge.sourceFile
      ? ` · ${edge.sourceFile}${edge.line ? `:${edge.line}` : ""}`
      : "";
    return `${source} -[${edge.relation}]-> ${target} [${edge.confidence}]${provenance}`;
  });
  if (lines.length === 0) {
    return nodes.slice(0, 40).map((node) => {
      const location = node.sourceFile ? ` · ${node.sourceFile}${node.line ? `:${node.line}` : ""}` : "";
      return `${node.label} (${node.type})${location}`;
    }).join("\n");
  }
  return lines.join("\n");
}

export class CodeGraphService {
  private readonly dataRoot: string;
  private readonly runner: GraphifyRunner;
  private readonly activeBuilds = new Map<string, Promise<CodeGraphIndex>>();

  constructor(
    private readonly db: JaitDB,
    options: CodeGraphServiceOptions = {},
  ) {
    this.dataRoot = options.dataRoot ?? join(homedir(), ".jait", "data", "code-graphs");
    this.runner = options.runner ?? new GraphifyRunner();
  }

  private getStoredRow(projectRoot: string, userId?: string): CodeGraphIndexRow | null {
    const conditions = [eq(codeGraphIndexes.projectRoot, projectRoot)];
    conditions.push(userId
      ? eq(codeGraphIndexes.userId, userId)
      : isNull(codeGraphIndexes.userId));
    return this.db
      .select()
      .from(codeGraphIndexes)
      .where(and(...conditions))
      .get() ?? null;
  }

  private saveIndex(params: {
    projectRoot: string;
    userId?: string;
    repositoryId?: string | null;
    status: CodeGraphIndex["status"];
    graphPath?: string | null;
    graphVersion?: string | null;
    sourceRevision?: string | null;
    graphifyVersion?: string | null;
    stats?: CodeGraphStats | null;
    graphRagStatus?: CodeGraphIndex["graphRagStatus"];
    graphRagPath?: string | null;
    error?: string | null;
  }): CodeGraphIndex {
    const now = new Date().toISOString();
    const existing = this.getStoredRow(params.projectRoot, params.userId);
    const values = {
      repositoryId: params.repositoryId ?? existing?.repositoryId ?? null,
      provider: "graphify",
      status: params.status,
      graphPath: params.graphPath === undefined ? existing?.graphPath ?? null : params.graphPath,
      graphVersion: params.graphVersion === undefined ? existing?.graphVersion ?? null : params.graphVersion,
      sourceRevision: params.sourceRevision === undefined ? existing?.sourceRevision ?? null : params.sourceRevision,
      graphifyVersion: params.graphifyVersion === undefined ? existing?.graphifyVersion ?? null : params.graphifyVersion,
      stats: params.stats === undefined
        ? existing?.stats ?? null
        : params.stats
          ? JSON.stringify(params.stats)
          : null,
      graphRagStatus: params.graphRagStatus ?? existing?.graphRagStatus ?? "not-prepared",
      graphRagPath: params.graphRagPath === undefined ? existing?.graphRagPath ?? null : params.graphRagPath,
      error: params.error ?? null,
      updatedAt: now,
    };
    if (existing) {
      this.db.update(codeGraphIndexes)
        .set(values)
        .where(eq(codeGraphIndexes.id, existing.id))
        .run();
      return toIndex(this.getStoredRow(params.projectRoot, params.userId)!);
    }

    const id = uuidv7();
    this.db.insert(codeGraphIndexes).values({
      id,
      userId: params.userId ?? null,
      projectRoot: params.projectRoot,
      createdAt: now,
      ...values,
    }).run();
    return toIndex(this.getStoredRow(params.projectRoot, params.userId)!);
  }

  private normalizeProjectRoot(projectRoot: string): string {
    const normalized = projectRoot.trim();
    if (!normalized) throw new Error("projectRoot is required");
    if (!isAbsolute(normalized)) throw new Error("projectRoot must be absolute");
    return resolve(normalized);
  }

  private outputDirectory(projectRoot: string, userId?: string): string {
    const key = createHash("sha256")
      .update(`${userId ?? "system"}\0${projectRoot}`)
      .digest("hex")
      .slice(0, 24);
    return join(this.dataRoot, key, "graphify");
  }

  private async sourceRevision(projectRoot: string): Promise<string | null> {
    try {
      const [head, status] = await Promise.all([
        execFileAsync("git", ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8" }),
        execFileAsync("git", ["-C", projectRoot, "status", "--porcelain"], { encoding: "utf8" }),
      ]);
      const revision = String(head.stdout).trim();
      return status.stdout ? `${revision}:dirty` : revision;
    } catch {
      return null;
    }
  }

  private async readParsedGraph(index: CodeGraphIndex): Promise<ParsedGraph> {
    if (index.status !== "ready" || !index.graphPath) {
      throw new Error(index.error || "Code graph has not been indexed");
    }
    const content = await readFile(index.graphPath, "utf8");
    return parseGraph(JSON.parse(content) as unknown);
  }

  getIndex(projectRoot: string, userId?: string): CodeGraphIndex {
    const normalizedRoot = this.normalizeProjectRoot(projectRoot);
    const row = this.getStoredRow(normalizedRoot, userId);
    return row ? toIndex(row) : missingIndex(normalizedRoot);
  }

  async index(params: {
    projectRoot: string;
    userId?: string;
    repositoryId?: string | null;
    signal?: AbortSignal;
  }): Promise<CodeGraphIndex> {
    const projectRoot = this.normalizeProjectRoot(params.projectRoot);
    const key = `${params.userId ?? "system"}:${projectRoot}`;
    const active = this.activeBuilds.get(key);
    if (active) return active;

    const build = (async () => {
      const outputDir = this.outputDirectory(projectRoot, params.userId);
      await mkdir(outputDir, { recursive: true });
      this.saveIndex({
        projectRoot,
        userId: params.userId,
        repositoryId: params.repositoryId,
        status: "building",
        error: null,
      });

      try {
        const result = await this.runner.build({
          projectRoot,
          outputDir,
          signal: params.signal,
        });
        if (!existsSync(result.graphPath)) {
          throw new Error(`Graphify completed without producing ${result.graphPath}`);
        }
        const content = await readFile(result.graphPath, "utf8");
        const parsed = parseGraph(JSON.parse(content) as unknown);
        const graphVersion = createHash("sha256").update(content).digest("hex");
        return this.saveIndex({
          projectRoot,
          userId: params.userId,
          repositoryId: params.repositoryId,
          status: "ready",
          graphPath: result.graphPath,
          graphVersion,
          sourceRevision: await this.sourceRevision(projectRoot),
          graphifyVersion: result.version,
          stats: parsed.stats,
          graphRagStatus: "not-prepared",
          graphRagPath: null,
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.saveIndex({
          projectRoot,
          userId: params.userId,
          repositoryId: params.repositoryId,
          status: "error",
          error: message,
        });
        throw error;
      }
    })();

    this.activeBuilds.set(key, build);
    try {
      return await build;
    } finally {
      this.activeBuilds.delete(key);
    }
  }

  async snapshot(params: {
    projectRoot: string;
    userId?: string;
    maxNodes?: number;
  }): Promise<CodeGraphSnapshot> {
    const index = this.getIndex(params.projectRoot, params.userId);
    const graph = await this.readParsedGraph(index);
    const maxNodes = Math.max(1, Math.min(params.maxNodes ?? DEFAULT_MAX_NODES, 10_000));
    if (graph.nodes.length <= maxNodes) {
      return { index, nodes: graph.nodes, edges: graph.edges, truncated: false };
    }
    const nodes = [...graph.nodes].sort((left, right) => right.degree - left.degree).slice(0, maxNodes);
    const ids = new Set(nodes.map((node) => node.id));
    return {
      index,
      nodes,
      edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
      truncated: true,
    };
  }

  async query(params: {
    projectRoot: string;
    userId?: string;
    query: string;
    mode?: CodeGraphQueryResult["mode"];
    maxNodes?: number;
    maxDepth?: number;
  }): Promise<CodeGraphQueryResult> {
    const query = params.query.trim();
    if (!query) throw new Error("query is required");
    const index = this.getIndex(params.projectRoot, params.userId);
    const graph = await this.readParsedGraph(index);
    const tokens = tokenize(query);
    const seeds = graph.nodes
      .map((node) => ({ node, score: scoreNode(node, tokens) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((entry) => entry.node);
    if (seeds.length === 0) {
      seeds.push(...[...graph.nodes].sort((left, right) => right.degree - left.degree).slice(0, 3));
    }

    const edgesByNode = new Map<string, CodeGraphEdge[]>();
    for (const edge of graph.edges) {
      const sourceEdges = edgesByNode.get(edge.source) ?? [];
      sourceEdges.push(edge);
      edgesByNode.set(edge.source, sourceEdges);
      const targetEdges = edgesByNode.get(edge.target) ?? [];
      targetEdges.push(edge);
      edgesByNode.set(edge.target, targetEdges);
    }

    const maxNodes = Math.max(1, Math.min(params.maxNodes ?? 120, 1_000));
    const maxDepth = Math.max(0, Math.min(params.maxDepth ?? 2, 8));
    const selectedIds = new Set<string>();
    const selectedEdges = new Map<string, CodeGraphEdge>();
    const queue = seeds.map((node) => ({ id: node.id, depth: 0 }));
    for (const seed of seeds) selectedIds.add(seed.id);

    while (queue.length > 0 && selectedIds.size < maxNodes) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      for (const edge of edgesByNode.get(current.id) ?? []) {
        selectedEdges.set(edge.id, edge);
        const nextId = edge.source === current.id ? edge.target : edge.source;
        if (selectedIds.has(nextId)) continue;
        selectedIds.add(nextId);
        queue.push({ id: nextId, depth: current.depth + 1 });
        if (selectedIds.size >= maxNodes) break;
      }
    }

    const nodes = graph.nodes.filter((node) => selectedIds.has(node.id));
    const edges = [...selectedEdges.values()].filter(
      (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
    );
    return {
      query,
      mode: params.mode ?? "hybrid",
      context: graphContext(nodes, edges),
      nodes,
      edges,
      graphVersion: index.graphVersion,
      graphRagStatus: index.graphRagStatus,
    };
  }

  async prepareGraphRag(params: {
    projectRoot: string;
    userId?: string;
  }): Promise<{ index: CodeGraphIndex; manifest: GraphRagExportManifest }> {
    const projectRoot = this.normalizeProjectRoot(params.projectRoot);
    const current = this.getIndex(projectRoot, params.userId);
    if (current.status !== "ready" || !current.graphPath) {
      throw new Error(current.error || "Code graph has not been indexed");
    }
    this.saveIndex({
      projectRoot,
      userId: params.userId,
      status: "ready",
      graphRagStatus: "preparing",
      error: null,
    });
    const outputDirectory = resolve(dirname(current.graphPath), "..", "graphrag");
    try {
      const snapshot = await this.snapshot({
        projectRoot,
        userId: params.userId,
        maxNodes: 10_000,
      });
      const manifest = await writeGraphRagExport(snapshot, outputDirectory);
      const index = this.saveIndex({
        projectRoot,
        userId: params.userId,
        status: "ready",
        graphRagStatus: "prepared",
        graphRagPath: join(outputDirectory, "manifest.json"),
        error: null,
      });
      return { index, manifest };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.saveIndex({
        projectRoot,
        userId: params.userId,
        status: "ready",
        graphRagStatus: "error",
        error: message,
      });
      throw error;
    }
  }

  async shortestPath(params: {
    projectRoot: string;
    userId?: string;
    source: string;
    target: string;
    maxDepth?: number;
  }): Promise<CodeGraphPathResult | null> {
    const index = this.getIndex(params.projectRoot, params.userId);
    const graph = await this.readParsedGraph(index);
    const findNode = (value: string) => {
      const normalized = value.trim().toLowerCase();
      return graph.nodes.find((node) => node.id.toLowerCase() === normalized)
        ?? graph.nodes.find((node) => node.label.toLowerCase() === normalized)
        ?? graph.nodes.find((node) => node.label.toLowerCase().includes(normalized));
    };
    const source = findNode(params.source);
    const target = findNode(params.target);
    if (!source || !target) return null;

    const adjacency = new Map<string, Array<{ next: string; edge: CodeGraphEdge }>>();
    for (const edge of graph.edges) {
      const sourceList = adjacency.get(edge.source) ?? [];
      sourceList.push({ next: edge.target, edge });
      adjacency.set(edge.source, sourceList);
      const targetList = adjacency.get(edge.target) ?? [];
      targetList.push({ next: edge.source, edge });
      adjacency.set(edge.target, targetList);
    }

    const maxDepth = Math.max(1, Math.min(params.maxDepth ?? 12, 50));
    const queue: Array<{ id: string; depth: number }> = [{ id: source.id, depth: 0 }];
    const previous = new Map<string, { nodeId: string; edge: CodeGraphEdge }>();
    const visited = new Set([source.id]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === target.id) break;
      if (current.depth >= maxDepth) continue;
      for (const neighbor of adjacency.get(current.id) ?? []) {
        if (visited.has(neighbor.next)) continue;
        visited.add(neighbor.next);
        previous.set(neighbor.next, { nodeId: current.id, edge: neighbor.edge });
        queue.push({ id: neighbor.next, depth: current.depth + 1 });
      }
    }
    if (!visited.has(target.id)) return null;

    const nodeIds = [target.id];
    const edges: CodeGraphEdge[] = [];
    let cursor = target.id;
    while (cursor !== source.id) {
      const step = previous.get(cursor);
      if (!step) return null;
      edges.push(step.edge);
      cursor = step.nodeId;
      nodeIds.push(cursor);
    }
    nodeIds.reverse();
    edges.reverse();
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    return {
      source,
      target,
      nodes: nodeIds.map((id) => nodeById.get(id)!).filter(Boolean),
      edges,
    };
  }
}

export { parseGraph as parseGraphifyGraph };
