export interface MemoryEntry {
  id: string;
  scope: "workspace" | "project" | "contact";
  content: string;
  source: string;
  createdAt: string;
  expiresAt?: string;
}

export interface MemoryService {
  save(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  forget(id: string): Promise<boolean>;
}
