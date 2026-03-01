/**
 * Sprint 6 Tests — Memory Engine
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { SqliteMemoryBackend } from "./memory/sqlite-backend.js";
import { MemoryEngine } from "./memory/service.js";
import { createMemorySaveTool, createMemorySearchTool, createMemoryForgetTool } from "./tools/memory-tools.js";

describe("MemoryEngine (Sprint 6)", () => {
  it("saves and retrieves relevant memories with scope filtering", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });

    await memory.save({
      scope: "workspace",
      content: "Use pnpm install for this monorepo.",
      source: { type: "chat", id: "msg-1", surface: "web" },
    });

    await memory.save({
      scope: "project",
      content: "Payment API retries failed webhooks 3 times.",
      source: { type: "doc", id: "doc-1", surface: "filesystem" },
    });

    const workspaceOnly = await memory.search("install dependencies", 5, "workspace");
    const projectOnly = await memory.search("webhook retries", 5, "project");

    expect(workspaceOnly).toHaveLength(1);
    expect(workspaceOnly[0]?.content).toContain("pnpm");
    expect(projectOnly).toHaveLength(1);
    expect(projectOnly[0]?.source.type).toBe("doc");

    sqlite.close();
  });

  it("forgets expired entries and supports explicit forget", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });
    const expired = await memory.save({
      scope: "workspace",
      content: "Old note to expire",
      source: { type: "chat", id: "msg-old", surface: "web" },
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const alive = await memory.save({
      scope: "workspace",
      content: "Important permanent note",
      source: { type: "chat", id: "msg-new", surface: "web" },
    });

    const deleted = await memory.forgetExpired();
    expect(deleted).toBe(1);

    const results = await memory.search("note", 10, "workspace");
    expect(results.map((r) => r.id)).not.toContain(expired.id);

    const forgotten = await memory.forget(alive.id);
    expect(forgotten).toBe(true);

    sqlite.close();
  });

  it("writes daily memory log and curated MEMORY.md", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const root = mkdtempSync(join(tmpdir(), "jait-memory-"));
    const memoryDir = join(root, "memory");
    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db), memoryDir });

    await memory.save({
      scope: "contact",
      content: "Alice prefers PR updates in Slack.",
      source: { type: "contact", id: "alice", surface: "slack" },
    });

    const day = new Date().toISOString().slice(0, 10);
    const daily = readFileSync(join(memoryDir, `${day}.md`), "utf-8");
    const curated = readFileSync(join(root, "MEMORY.md"), "utf-8");

    expect(daily).toContain("Alice prefers PR updates");
    expect(curated).toContain("source=contact:alice@slack");

    rmSync(root, { recursive: true, force: true });
    sqlite.close();
  });


  it("flushes snippets before compaction for later retrieval", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });
    const saved = await memory.flushPreCompaction("session-42", [
      "  Keep note about release checklist.  ",
      "",
      "User asked to revisit DB migration risk.",
    ]);

    expect(saved).toBe(2);

    const results = await memory.search("release checklist", 5, "workspace");
    expect(results).toHaveLength(1);
    expect(results[0]?.source.type).toBe("pre_compaction");
    expect(results[0]?.source.id).toBe("session-42");

    sqlite.close();
  });

  it("exposes memory.save/search/forget tools", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });
    const saveTool = createMemorySaveTool(memory);
    const searchTool = createMemorySearchTool(memory);
    const forgetTool = createMemoryForgetTool(memory);

    const context = {
      sessionId: "s1",
      actionId: "a1",
      workspaceRoot: "/tmp",
      requestedBy: "test",
    };

    const saveResult = await saveTool.execute({
      scope: "project",
      content: "Release branch is cut every Thursday.",
      sourceType: "chat",
      sourceId: "m1",
      sourceSurface: "web",
    }, context);

    expect(saveResult.ok).toBe(true);
    const id = (saveResult.data as { id: string }).id;

    const searchResult = await searchTool.execute({ query: "release branch" }, context);
    expect(searchResult.ok).toBe(true);
    expect((searchResult.data as unknown[]).length).toBeGreaterThan(0);

    const forgetResult = await forgetTool.execute({ id }, context);
    expect(forgetResult.ok).toBe(true);

    sqlite.close();
  });
});
