export type MemoryScope = "workspace" | "project" | "contact";

export interface MemorySource {
  type: string;
  id: string;
  surface: string;
}

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  content: string;
  source: MemorySource;
  embedding: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface SaveMemoryInput {
  scope: MemoryScope;
  content: string;
  source: MemorySource;
  expiresAt?: string;
}

export interface SearchMemoryInput {
  query: string;
  scope?: MemoryScope;
  limit?: number;
  now?: Date;
}

export interface MemoryBackend {
  save(entry: MemoryEntry): Promise<void>;
  list(scope?: MemoryScope): Promise<MemoryEntry[]>;
  forget(id: string): Promise<boolean>;
  forgetExpired(now?: Date): Promise<number>;
}

export interface MemoryService {
  save(entry: SaveMemoryInput): Promise<MemoryEntry>;
  search(query: string, limit?: number, scope?: MemoryScope): Promise<MemoryEntry[]>;
  forget(id: string): Promise<boolean>;
  forgetExpired(now?: Date): Promise<number>;
  flushPreCompaction(sessionId: string, snippets: string[]): Promise<number>;
}
