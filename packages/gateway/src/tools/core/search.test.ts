import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createSearchTool } from "./search.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempProject(fileName: string, content: string): Promise<string> {
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
    const projectRoot = await createTempProject("sample.txt", "foo\n");
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "fo+", isRegexp: false, limit: 5 },
      {
        sessionId: "session-1",
        actionId: "action-1",
        projectRoot,
        requestedBy: "user",
      } as any,
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain('(retried as regex)');
    expect(result.data).toEqual({
      pattern: "fo+",
      matches: [
        {
          file: join(projectRoot, "sample.txt"),
          line: 1,
          content: "foo",
        },
      ],
    });
  });

  it("retries a regex search as literal when the pattern contains regex metacharacters", async () => {
    const projectRoot = await createTempProject("sample.txt", "literal[1]\n");
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "literal[1]", isRegexp: true, limit: 5 },
      {
        sessionId: "session-2",
        actionId: "action-2",
        projectRoot,
        requestedBy: "user",
      } as any,
    );

    expect(result.ok).toBe(true);
    expect(result.message).toContain('(retried as literal)');
    expect(result.data).toEqual({
      pattern: "literal[1]",
      matches: [
        {
          file: join(projectRoot, "sample.txt"),
          line: 1,
          content: "literal[1]",
        },
      ],
    });
  });

  it("truncates matches on very long single lines instead of overflowing the buffer", async () => {
    const longLine = "needle-" + "x".repeat(100_000);
    const projectRoot = await createTempProject("bundle.js", `${longLine}\n`);
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "needle", isRegexp: false, limit: 5 },
      {
        sessionId: "session-3",
        actionId: "action-3",
        projectRoot,
        requestedBy: "user",
      } as any,
    );

    expect(result.ok).toBe(true);
    const matches = (result.data as any).matches;
    expect(matches).toHaveLength(1);
    expect(matches[0].content).toContain("needle-");
    expect(matches[0].content).toContain("(truncated,");
    // A truncated match must never be anywhere near 100k chars.
    expect(matches[0].content.length).toBeLessThan(1_000);
  });
});
