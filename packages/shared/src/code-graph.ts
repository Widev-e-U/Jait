export type CodeGraphIndexStatus = "missing" | "building" | "ready" | "error";
export type GraphRagIndexStatus = "not-prepared" | "preparing" | "prepared" | "error";
export type CodeGraphConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS" | "UNKNOWN";

export interface CodeGraphNode {
  id: string;
  label: string;
  type: string;
  fileType?: string;
  sourceFile?: string;
  line?: number;
  endLine?: number;
  community?: string;
  degree: number;
  properties: Record<string, unknown>;
}

export interface CodeGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  confidence: CodeGraphConfidence;
  confidenceScore?: number;
  sourceFile?: string;
  line?: number;
  properties: Record<string, unknown>;
}

export interface CodeGraphStats {
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  nodeTypes: Record<string, number>;
  relations: Record<string, number>;
  confidence: Record<CodeGraphConfidence, number>;
}

export interface CodeGraphIndex {
  id: string;
  projectRoot: string;
  repositoryId?: string | null;
  provider: "graphify";
  status: CodeGraphIndexStatus;
  graphPath?: string | null;
  graphVersion?: string | null;
  sourceRevision?: string | null;
  graphifyVersion?: string | null;
  stats?: CodeGraphStats | null;
  graphRagStatus: GraphRagIndexStatus;
  graphRagPath?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodeGraphSnapshot {
  index: CodeGraphIndex;
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
  truncated: boolean;
}

export interface CodeGraphQueryResult {
  query: string;
  mode: "structural" | "global" | "hybrid";
  context: string;
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
  graphVersion?: string | null;
  graphRagStatus: GraphRagIndexStatus;
}

export interface CodeGraphPathResult {
  source: CodeGraphNode;
  target: CodeGraphNode;
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
}

export interface GraphRagExportManifest {
  schemaVersion: 1;
  graphVersion: string;
  generatedAt: string;
  entitiesPath: string;
  relationshipsPath: string;
  textUnitsPath: string;
  entityCount: number;
  relationshipCount: number;
  textUnitCount: number;
}
