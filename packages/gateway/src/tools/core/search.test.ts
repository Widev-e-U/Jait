import { execFileSync } from "node:child_process";
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
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}

function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}

function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}

describe("search core tool retry behavior", () => {
  it("keeps a literal no-match successful when optional regex retry is unavailable", async () => {
    const projectRoot = await createTempProject("sample.txt", "foo\n");
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand: "jait-missing-rg" });

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
    expect(result.message).toBe('No matches for "fo+"');
    expect(result.data).toEqual({
      pattern: "fo+",
      matches: [],
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

describe("search core tool shell safety", () => {
  // Patterns used to be interpolated into an `sh -c` string with only `"`
  // escaped, so the shell expanded `$…` and ran anything in backticks before
  // the matcher ever saw the pattern.
  it.each([
    ["a shell variable reference", 'const total = "${SUM}" // running total', "${SUM}"],
    ["a backtick expression", "const label = `id-${row}`", "`id-${row}`"],
    ["a backslash escape", "const re = /\\d+\\.\\d+/", "\\d+\\.\\d+"],
  ])("matches a literal pattern containing %s", async (_label, targetLine, pattern) => {
    // The surrounding lines are what make this a real check: a pattern the
    // shell mangled into an empty string matches *every* line, not just one.
    const projectRoot = await createTempProject(
      "sample.ts",
      ["const alpha = 1", targetLine, "const beta = 2", "const gamma = 3"].join("\n") + "\n",
    );
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern, isRegexp: false, limit: 5 },
      searchContext("session-shell-safety", projectRoot),
    );

    expect(result.ok).toBe(true);
    expect((result.data as any).matches).toHaveLength(1);
    expect((result.data as any).matches[0].content).toBe(targetLine);
  });
});

describe("search core tool result limits", () => {
  it("stops at the global result limit and says so", async () => {
    const projectRoot = await createTempProject(
      "many.txt",
      Array.from({ length: 200 }, (_, i) => `needle line ${i}`).join("\n") + "\n",
    );
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "needle", isRegexp: false, limit: 5 },
      searchContext("session-limit", projectRoot),
    );

    expect(result.ok).toBe(true);
    expect((result.data as any).matches).toHaveLength(5);
    expect(result.message).toContain("stopped at the 5-result limit");
  });
});

describe("search core tool filename mode", () => {
  it("finds files by name substring", async () => {
    const projectRoot = await createTempProject("provider-model-selector.tsx", "export {}\n");
    await writeFile(join(projectRoot, "unrelated.md"), "docs\n", "utf8");
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "model-selector", mode: "files", limit: 5 },
      searchContext("session-files", projectRoot),
    );

    expect(result.ok).toBe(true);
    expect((result.data as any).files).toEqual([join(projectRoot, "provider-model-selector.tsx")]);
  });

  it("reports no matches rather than failing when nothing matches the name", async () => {
    const projectRoot = await createTempProject("sample.txt", "content\n");
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "nothing-here", mode: "files", limit: 5 },
      searchContext("session-files-empty", projectRoot),
    );

    expect(result.ok).toBe(true);
    expect((result.data as any).files).toEqual([]);
  });
});
