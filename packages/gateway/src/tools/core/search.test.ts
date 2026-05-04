import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createSearchTool } from "./search.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempWorkspace(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "jait-search-test-"));
  tempDirs.push(dir);
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}

function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}

describe("search core tool retry behavior", () => {
  it("retries a literal search as regex when the initial pass finds no matches", async () => {
    const workspaceRoot = await createTempWorkspace("sample.txt", "foo\n");
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "fo+", isRegexp: false, limit: 5 },
      {
        sessionId: "session-1",
        actionId: "action-1",
        workspaceRoot,
        requestedBy: "user",
      } as any,
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain('(retried as regex)');
    expect(result.data).toEqual({
      pattern: "fo+",
      matches: [
        {
          file: join(workspaceRoot, "sample.txt"),
          line: 1,
          content: "foo",
        },
      ],
    });
  });

  it("retries a regex search as literal when the pattern contains regex metacharacters", async () => {
    const workspaceRoot = await createTempWorkspace("sample.txt", "literal[1]\n");
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "literal[1]", isRegexp: true, limit: 5 },
      {
        sessionId: "session-2",
        actionId: "action-2",
        workspaceRoot,
        requestedBy: "user",
      } as any,
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain('(retried as literal)');
    expect(result.data).toEqual({
      pattern: "literal[1]",
      matches: [
        {
          file: join(workspaceRoot, "sample.txt"),
          line: 1,
          content: "literal[1]",
        },
      ],
    });
  });
});
