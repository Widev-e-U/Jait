import { describe, expect, it } from "vitest";
import type { MemoryBackend, MemoryEntry, MemoryScope } from "./contracts.js";
import { MemoryEngine } from "./service.js";

class InMemoryBackend implements MemoryBackend {
  entries: MemoryEntry[] = [];

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async update(entry: MemoryEntry): Promise<void> {
    const index = this.entries.findIndex((item) => item.id === entry.id);
    if (index === -1) throw new Error(`Missing memory ${entry.id}`);
    this.entries[index] = entry;
  }

  async list(scope?: MemoryScope): Promise<MemoryEntry[]> {
    return this.entries.filter((entry) => !scope || entry.scope === scope);
  }

  async forget(id: string): Promise<boolean> {
    const previous = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return this.entries.length !== previous;
  }

  async forgetExpired(): Promise<number> {
    return 0;
  }
}

describe("MemoryEngine", () => {
  it("updates repeated memory facts instead of appending duplicates", async () => {
    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    const first = await memory.save({
      scope: "project",
      content: "User prefers compact todo controls with icons.",
      source: { type: "chat", id: "session-1", surface: "chat" },
    });
    const second = await memory.save({
      scope: "project",
      content: "User prefers compact todo controls with icon buttons.",
      source: { type: "chat", id: "session-2", surface: "chat" },
    });

    expect(second.id).toBe(first.id);
    expect(backend.entries).toHaveLength(1);
    expect(backend.entries[0]?.content).toContain("icon buttons");
    expect(backend.entries[0]?.createdAt).toBe(first.createdAt);
  });

  it("combines lexical, vector, and recency ranking for search", async () => {
    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    const older = await memory.save({
      scope: "project",
      content: "Use sparse visual layouts for marketing pages.",
      source: { type: "chat", id: "old", surface: "chat" },
    });
    backend.entries[0] = {
      ...older,
      updatedAt: "2020-01-01T00:00:00.000Z",
    };

    await memory.save({
      scope: "project",
      content: "Use compact todo controls with icons and tooltips.",
      source: { type: "chat", id: "new", surface: "chat" },
    });

    const results = await memory.search("compact todo icon controls", 2, "project");

    expect(results[0]?.content).toContain("compact todo controls");
  });

  it("does not return unrelated memories solely because they are recent", async () => {
    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    await memory.save({
      scope: "project",
      content: "Use compact todo controls with icons and tooltips.",
      source: { type: "chat", id: "recent", surface: "chat" },
    });

    const results = await memory.search("database migration rollback", 5, "project");

    expect(results).toHaveLength(0);
  });

  it("extracts durable facts before pre-compaction and skips transient turns", async () => {
    const backend = new InMemoryBackend();
    const memory = new MemoryEngine({ backend });

    const saved = await memory.flushPreCompaction("session-7", [
      "[user] Please continue with the current implementation.",
      "[assistant] ok",
      "[user] Remember that API contracts should live in packages/shared.",
      "[assistant] The gateway package version is the release source of truth.",
      "[user] Remember that API contracts should live in packages/shared.",
    ]);

    expect(saved).toBe(2);
    expect(backend.entries.map((entry) => entry.content)).toEqual([
      "API contracts should live in packages/shared.",
      "The gateway package version is the release source of truth.",
    ]);
    expect(backend.entries.every((entry) => entry.source.type === "pre_compaction")).toBe(true);
    expect(backend.entries.every((entry) => entry.source.id === "session-7")).toBe(true);
  });
});
