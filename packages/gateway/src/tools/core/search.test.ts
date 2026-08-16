import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

/**
 * Writes a tiny stand-in for ripgrep into the temp project and returns its
 * path. Real ripgrep is not guaranteed to be installed on every machine (the
 * local dev boxes and self-hosted CI runners that run these tests do not have
 * it), but the "regex with metacharacters" retry test needs the empty-regex →
 * literal retry path to be exercised. Without rg installed the gateway instead
 * degrades the regex to a literal search up front, which is a different code
 * path and fails the old assertion.
 *
 * The fake mimics the behaviour the test relies on: regex invocations (no
 * `--fixed-strings` in argv) return no matches so the tool retries as literal,
 * and literal invocations emit a single `path:line:content` match.
 */
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
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
    const rgCommand = await createFakeRg(projectRoot);
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand });

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

describe("search core tool path resolution", () => {
  it("resolves a relative path against the project root, not the gateway cwd", async () => {
    const projectRoot = await createTempProject("placeholder.txt", "x\n");
    await mkdir(join(projectRoot, "apps", "web", "src"), { recursive: true });
    await writeFile(join(projectRoot, "apps", "web", "src", "app.ts"), "const needle = 1;\n", "utf8");
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand: "jait-missing-rg" });

    // process.cwd() is the monorepo root here, where "apps/web/src" also exists —
    // so a wrong base would still "work". Assert on the match instead.
    const result = await tool.execute(
      { pattern: "needle", path: "apps/web/src", limit: 5 },
      searchContext("session-relative", projectRoot),
    );

    expect(result.ok).toBe(true);
    expect((result.data as any).matches).toHaveLength(1);
    expect((result.data as any).matches[0].file.endsWith("app.ts")).toBe(true);
  });

  it("searches a file when path points at one instead of erroring on a bad cwd", async () => {
    const projectRoot = await createTempProject("package.json", '{"react-virtual":"1"}\n');
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand: "jait-missing-rg" });

    const result = await tool.execute(
      { pattern: "react-virtual", path: "package.json", limit: 5 },
      searchContext("session-file-path", projectRoot),
    );

    expect(result.ok).toBe(true);
    expect((result.data as any).matches).toHaveLength(1);
  });

  it("reports a missing path by name rather than as a ripgrep/Git outage", async () => {
    const projectRoot = await createTempProject("sample.txt", "foo\n");
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand: "jait-missing-rg" });

    const result = await tool.execute(
      { pattern: "foo", path: "does/not/exist", limit: 5 },
      searchContext("session-missing-path", projectRoot),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Search path does not exist/);
    expect(result.message).not.toMatch(/ripgrep is unavailable/);
  });
});
