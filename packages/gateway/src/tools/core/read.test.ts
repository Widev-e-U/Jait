import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SurfaceRegistry } from "../../surfaces/registry.js";
import { FileSystemSurface } from "../../surfaces/filesystem.js";
import type { ToolContext } from "../contracts.js";
import { createReadTool } from "./read.js";

const SESSION_ID = "session-read";

describe("read tool — line + byte caps", () => {
  let projectRoot: string;
  let registry: SurfaceRegistry;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "jait-read-test-"));
    registry = new SurfaceRegistry();
    const surface = new FileSystemSurface(`fs-${SESSION_ID}`);
    await surface.start({ sessionId: SESSION_ID, projectRoot });
    registry.registerInstance(surface.id, surface);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  function context(): ToolContext {
    return { sessionId: SESSION_ID, actionId: "action-1", projectRoot, requestedBy: "agent" };
  }

  it("returns the whole file untouched when it's small", async () => {
    await writeFile(join(projectRoot, "small.ts"), "line1\nline2\nline3");
    const tool = createReadTool(registry);
    const result = await tool.execute({ path: "small.ts" }, context());
    expect(result.ok).toBe(true);
    const data = result.data as { truncated: boolean; totalLines: number };
    expect(data.truncated).toBe(false);
    expect(data.totalLines).toBe(3);
  });

  it("truncates a file under the line cap but over the byte cap", async () => {
    // 2000 lines of ~80 chars each ≈ 160KB — well under MAX_LINES_PER_READ (6000)
    // but well over MAX_BYTES_PER_READ (50KB). Reproduces the exact scenario
    // that let a stuck session's context balloon (moderately-lined, large files).
    const line = "x".repeat(80);
    const lines = Array.from({ length: 2000 }, () => line);
    await writeFile(join(projectRoot, "big.ts"), lines.join("\n"));

    const tool = createReadTool(registry);
    const result = await tool.execute({ path: "big.ts" }, context());
    expect(result.ok).toBe(true);
    const data = result.data as { truncated: boolean; totalLines: number; endLine: number; content: string };
    expect(data.totalLines).toBe(2000);
    expect(data.truncated).toBe(true);
    expect(data.endLine).toBeLessThan(2000);
    expect(data.content).toMatch(/KB limit/);
    // The returned slice itself must actually respect the byte budget.
    expect(Buffer.byteLength(data.content, "utf-8")).toBeLessThan(55 * 1024);
  });

  it("does not falsely report truncation when an explicit endLine exceeds EOF", async () => {
    await writeFile(join(projectRoot, "small.ts"), "line1\nline2\nline3");
    const tool = createReadTool(registry);
    const result = await tool.execute({ path: "small.ts", endLine: 999_999 }, context());
    const data = result.data as { truncated: boolean; endLine: number };
    expect(data.truncated).toBe(false);
    expect(data.endLine).toBe(3);
  });

  it("still applies the byte cap even with an explicit endLine within range", async () => {
    const line = "y".repeat(80);
    const lines = Array.from({ length: 2000 }, () => line);
    await writeFile(join(projectRoot, "big.ts"), lines.join("\n"));

    const tool = createReadTool(registry);
    const result = await tool.execute({ path: "big.ts", startLine: 1, endLine: 2000 }, context());
    const data = result.data as { truncated: boolean; endLine: number };
    expect(data.truncated).toBe(true);
    expect(data.endLine).toBeLessThan(2000);
  });
});
