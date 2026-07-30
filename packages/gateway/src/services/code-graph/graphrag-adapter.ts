import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CodeGraphEdge,
  CodeGraphNode,
  CodeGraphSnapshot,
  GraphRagExportManifest,
} from "@jait/shared";

interface GraphRagEntity {
  id: string;
  human_readable_id: number;
  title: string;
  type: string;
  description: string;
  text_unit_ids: string[];
  degree: number;
  attributes: Record<string, unknown>;
}

interface GraphRagRelationship {
  id: string;
  human_readable_id: number;
  source: string;
  target: string;
  description: string;
  weight: number;
  combined_degree: number;
  text_unit_ids: string[];
  attributes: Record<string, unknown>;
}

interface GraphRagTextUnit {
  id: string;
  human_readable_id: number;
  text: string;
  n_tokens: number;
  document_ids: string[];
  entity_ids: string[];
  relationship_ids: string[];
  covariate_ids: string[];
}

export interface GraphRagPreparedData {
  entities: GraphRagEntity[];
  relationships: GraphRagRelationship[];
  textUnits: GraphRagTextUnit[];
}

function textUnitId(sourceFile: string): string {
  return `file:${sourceFile}`;
}

function nodeDescription(node: CodeGraphNode): string {
  const location = node.sourceFile
    ? `${node.sourceFile}${node.line ? `:${node.line}` : ""}`
    : "unknown source";
  return `${node.label} is a ${node.type} defined at ${location}.`;
}

function edgeDescription(edge: CodeGraphEdge, nodes: Map<string, CodeGraphNode>): string {
  const source = nodes.get(edge.source)?.label ?? edge.source;
  const target = nodes.get(edge.target)?.label ?? edge.target;
  return `${source} ${edge.relation} ${target}. Confidence: ${edge.confidence}.`;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function toGraphRagData(snapshot: CodeGraphSnapshot): GraphRagPreparedData {
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const entities = snapshot.nodes.map((node, index): GraphRagEntity => ({
    id: node.id,
    human_readable_id: index,
    title: node.label,
    type: node.type,
    description: nodeDescription(node),
    text_unit_ids: node.sourceFile ? [textUnitId(node.sourceFile)] : [],
    degree: node.degree,
    attributes: {
      source_file: node.sourceFile,
      line: node.line,
      end_line: node.endLine,
      community: node.community,
      file_type: node.fileType,
      ...node.properties,
    },
  }));

  const relationships = snapshot.edges.map((edge, index): GraphRagRelationship => ({
    id: edge.id,
    human_readable_id: index,
    source: edge.source,
    target: edge.target,
    description: edgeDescription(edge, nodes),
    weight: edge.confidenceScore ?? (edge.confidence === "EXTRACTED" ? 1 : 0.6),
    combined_degree: (nodes.get(edge.source)?.degree ?? 0) + (nodes.get(edge.target)?.degree ?? 0),
    text_unit_ids: edge.sourceFile ? [textUnitId(edge.sourceFile)] : [],
    attributes: {
      relation: edge.relation,
      confidence: edge.confidence,
      source_file: edge.sourceFile,
      line: edge.line,
      ...edge.properties,
    },
  }));

  const fileEntities = new Map<string, string[]>();
  const fileRelationships = new Map<string, string[]>();
  for (const node of snapshot.nodes) {
    if (!node.sourceFile) continue;
    const ids = fileEntities.get(node.sourceFile) ?? [];
    ids.push(node.id);
    fileEntities.set(node.sourceFile, ids);
  }
  for (const edge of snapshot.edges) {
    if (!edge.sourceFile) continue;
    const ids = fileRelationships.get(edge.sourceFile) ?? [];
    ids.push(edge.id);
    fileRelationships.set(edge.sourceFile, ids);
  }

  const sourceFiles = new Set([...fileEntities.keys(), ...fileRelationships.keys()]);
  const textUnits = [...sourceFiles].sort().map((sourceFile, index): GraphRagTextUnit => {
    const entityIds = fileEntities.get(sourceFile) ?? [];
    const relationshipIds = fileRelationships.get(sourceFile) ?? [];
    const entitySummary = entityIds.slice(0, 100)
      .map((id) => nodes.get(id)?.label ?? id)
      .join(", ");
    const text = `Source file: ${sourceFile}\nSymbols: ${entitySummary}`;
    return {
      id: textUnitId(sourceFile),
      human_readable_id: index,
      text,
      n_tokens: estimateTokens(text),
      document_ids: [sourceFile],
      entity_ids: entityIds,
      relationship_ids: relationshipIds,
      covariate_ids: [],
    };
  });

  return { entities, relationships, textUnits };
}

function jsonLines(rows: unknown[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
}

export async function writeGraphRagExport(
  snapshot: CodeGraphSnapshot,
  outputDirectory: string,
): Promise<GraphRagExportManifest> {
  if (!snapshot.index.graphVersion) {
    throw new Error("A versioned code graph is required before preparing GraphRAG data");
  }
  await mkdir(outputDirectory, { recursive: true });
  const entitiesPath = join(outputDirectory, "entities.jsonl");
  const relationshipsPath = join(outputDirectory, "relationships.jsonl");
  const textUnitsPath = join(outputDirectory, "text_units.jsonl");
  const manifestPath = join(outputDirectory, "manifest.json");
  const prepared = toGraphRagData(snapshot);
  const manifest: GraphRagExportManifest = {
    schemaVersion: 1,
    graphVersion: snapshot.index.graphVersion,
    generatedAt: new Date().toISOString(),
    entitiesPath,
    relationshipsPath,
    textUnitsPath,
    entityCount: prepared.entities.length,
    relationshipCount: prepared.relationships.length,
    textUnitCount: prepared.textUnits.length,
  };
  await Promise.all([
    writeFile(entitiesPath, jsonLines(prepared.entities), "utf8"),
    writeFile(relationshipsPath, jsonLines(prepared.relationships), "utf8"),
    writeFile(textUnitsPath, jsonLines(prepared.textUnits), "utf8"),
    writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8"),
  ]);
  return manifest;
}
