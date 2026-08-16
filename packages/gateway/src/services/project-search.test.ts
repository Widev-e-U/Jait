import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProjectSearchUnavailableError,
  normalizeProjectSearchLimit,
  projectSearchCandidateLimit,
  rankProjectFilePaths,
  searchProject,
} from "./project-search.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}

async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

describe("project search ranking", () => {
  it("ranks a late definition ahead of earlier usage matches", async () => {
    const root = await createProject();
    for (let index = 0; index < 30; index += 1) {
      await writeProjectFile(root, `decoy-${String(index).padStart(2, "0")}.ts`, "targetHelper();\n");
    }
    await writeProjectFile(
      root,
      "src/late-definition.ts",
      "export function targetHelper() { return true; }\n",
    );

    const result = await searchProject({
      root,
      query: "targetHelper",
      mode: "content",
      limit: 1,
    });

    expect(result.mode).toBe("content");
    if (result.mode !== "content") throw new Error("unexpected mode");
    expect(result.matches[0]?.relativePath).toBe("src/late-definition.ts");
    expect(result.limited).toBe(true);
  });

  it("ranks a late exact filename ahead of earlier fuzzy names", async () => {
    const root = await createProject();
    for (let index = 0; index < 30; index += 1) {
      await writeProjectFile(
        root,
        `a/search-service-helper-${String(index).padStart(2, "0")}.ts`,
        "export {};\n",
      );
    }
    await writeProjectFile(root, "z/search-service.ts", "export {};\n");

    const result = await searchProject({
      root,
      query: "search-service",
      mode: "files",
      limit: 1,
    });

    expect(result.mode).toBe("files");
    if (result.mode !== "files") throw new Error("unexpected mode");
    expect(result.files[0]?.relativePath).toBe("z/search-service.ts");
  });

  it("prefers source files over tests and generated output", () => {
    const ranked = rankProjectFilePaths(
      ["dist/parser.js", "tests/parser.test.ts", "src/parser.ts"],
      "parser",
      3,
    );

    expect(ranked.map((entry) => entry.relativePath)).toEqual([
      "src/parser.ts",
      "tests/parser.test.ts",
      "dist/parser.js",
    ]);
  });

  it("does not match the absolute root directory name", async () => {
    const root = await createProject("needle-root-");
    await writeProjectFile(root, "alpha.ts", "export {};\n");

    const result = await searchProject({
      root,
      query: "needle-root",
      mode: "files",
      limit: 10,
    });

    expect(result.mode).toBe("files");
    if (result.mode !== "files") throw new Error("unexpected mode");
    expect(result.files).toEqual([]);
  });

  it("uses alphabetical paths for stable score ties", () => {
    const ranked = rankProjectFilePaths(
      ["src/zeta-parser.ts", "src/alpha-parser.ts"],
      "parser",
      2,
    );

    expect(ranked.map((entry) => entry.relativePath)).toEqual([
      "src/alpha-parser.ts",
      "src/zeta-parser.ts",
    ]);
  });

  it("includes ignored directories only when explicitly requested", async () => {
    const root = await createProject();
    await writeProjectFile(root, ".gitignore", "node_modules/\n");
    await writeProjectFile(root, "node_modules/hidden-package.ts", "export {};\n");

    const excluded = await searchProject({
      root,
      query: "hidden-package",
      mode: "files",
      limit: 10,
    });
    const included = await searchProject({
      root,
      query: "hidden-package",
      mode: "files",
      limit: 10,
      includeIgnoredFiles: true,
    });

    expect(excluded.mode).toBe("files");
    expect(included.mode).toBe("files");
    if (excluded.mode !== "files" || included.mode !== "files") throw new Error("unexpected mode");
    expect(excluded.files).toEqual([]);
    expect(included.files.map((entry) => entry.relativePath)).toEqual([
      "node_modules/hidden-package.ts",
    ]);
  });

  it("treats shell metacharacters as literal content", async () => {
    const root = await createProject();
    const target = 'const value = "${VAR};$(touch impossible)"';
    await writeProjectFile(root, "literal.ts", `${target}\n`);

    const result = await searchProject({
      root,
      query: "${VAR};$(touch impossible)",
      mode: "content",
      limit: 10,
    });

    expect(result.mode).toBe("content");
    if (result.mode !== "content") throw new Error("unexpected mode");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.content).toBe(target);
  });
});

describe("project search input validation", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid result limit %s",
    (value) => {
      expect(() => normalizeProjectSearchLimit(value)).toThrow(
        "limit must be a positive integer",
      );
    },
  );

  it("caps valid limits at the supported maximum", () => {
    expect(normalizeProjectSearchLimit(10_000)).toBe(200);
  });

  it("uses a bounded candidate pool", () => {
    expect(projectSearchCandidateLimit(20)).toBe(500);
    expect(projectSearchCandidateLimit(200)).toBe(2_000);
  });
});

describe("project search fallback safety", () => {
  it("rejects regex fallback when ripgrep is unavailable without executing JS regex", async () => {
    const root = await createProject();
    await writeProjectFile(root, "safe.ts", "aaaa!\n");

    await expect(
      searchProject(
        {
          root,
          query: "(a+)+$",
          mode: "content",
          isRegexp: true,
        },
        { rgCommand: "jait-missing-rg" },
      ),
    ).rejects.toMatchObject<Partial<ProjectSearchUnavailableError>>({
      reason: "regexp_requires_rg",
    });
  });

  it("uses a gitignore-aware literal fallback when ripgrep is unavailable", async () => {
    const root = await createProject();
    await writeProjectFile(root, ".gitignore", "secret/\n");
    await writeProjectFile(root, "visible/needle.ts", "needle\n");
    await writeProjectFile(root, "secret/needle.ts", "needle\n");

    const result = await searchProject(
      { root, query: "needle", mode: "content" },
      { rgCommand: "jait-missing-rg" },
    );
    if (result.mode !== "content") throw new Error("unexpected mode");
    expect(result.matches.map((match) => match.relativePath)).toEqual([
      "visible/needle.ts",
    ]);
  });

  it("still honours .gitignore when neither ripgrep nor Git is available", async () => {
    // The old behaviour threw "safe_fallback_unavailable" here, which named a
    // machine-level problem the model could not fix or route around — so it
    // retried the identical call instead. Enumeration is now native, so the
    // search simply works, with the same privacy guarantee Git provided.
    const looseRoot = await mkdtemp(join(tmpdir(), "jait-project-search-loose-"));
    tempDirectories.push(looseRoot);
    await writeProjectFile(looseRoot, ".gitignore", "secret/\nbuild/*.js\n");
    await writeProjectFile(looseRoot, "needle.ts", "needle\n");
    await writeProjectFile(looseRoot, "nested/deep/needle.ts", "needle\n");
    await writeProjectFile(looseRoot, "secret/needle.ts", "needle\n");
    await writeProjectFile(looseRoot, "build/needle.js", "needle\n");

    const result = await searchProject(
      { root: looseRoot, query: "needle", mode: "content" },
      { rgCommand: "jait-missing-rg", gitCommand: "jait-missing-git" },
    );
    if (result.mode !== "content") throw new Error("unexpected mode");
    expect(result.matches.map((match) => match.relativePath).sort()).toEqual([
      "needle.ts",
      "nested/deep/needle.ts",
    ]);
  });

  it("applies nested .gitignore files and negations like Git does", async () => {
    const looseRoot = await mkdtemp(join(tmpdir(), "jait-project-search-nested-"));
    tempDirectories.push(looseRoot);
    await writeProjectFile(looseRoot, ".gitignore", "*.gen.ts\n");
    await writeProjectFile(looseRoot, "pkg/.gitignore", "!keep.gen.ts\ntmp/\n");
    await writeProjectFile(looseRoot, "top.gen.ts", "needle\n");
    await writeProjectFile(looseRoot, "pkg/keep.gen.ts", "needle\n");
    await writeProjectFile(looseRoot, "pkg/drop.gen.ts", "needle\n");
    await writeProjectFile(looseRoot, "pkg/tmp/needle.ts", "needle\n");
    await writeProjectFile(looseRoot, "pkg/src/needle.ts", "needle\n");

    const result = await searchProject(
      { root: looseRoot, query: "needle", mode: "content" },
      { rgCommand: "jait-missing-rg", gitCommand: "jait-missing-git" },
    );
    if (result.mode !== "content") throw new Error("unexpected mode");
    expect(result.matches.map((match) => match.relativePath).sort()).toEqual([
      "pkg/keep.gen.ts",
      "pkg/src/needle.ts",
    ]);
  });

  it("finds files by name without ripgrep or Git", async () => {
    const looseRoot = await mkdtemp(join(tmpdir(), "jait-project-search-files-"));
    tempDirectories.push(looseRoot);
    await writeProjectFile(looseRoot, ".gitignore", "node_modules/\n");
    await writeProjectFile(looseRoot, "src/widget-view.ts", "x\n");
    await writeProjectFile(looseRoot, "node_modules/widget-view.ts", "x\n");

    const result = await searchProject(
      { root: looseRoot, query: "widget-view", mode: "files" },
      { rgCommand: "jait-missing-rg", gitCommand: "jait-missing-git" },
    );
    if (result.mode !== "files") throw new Error("unexpected mode");
    expect(result.files.map((file) => file.relativePath)).toEqual(["src/widget-view.ts"]);
  });
});

describe("project search root validation", () => {
  it("names a missing search path instead of blaming ripgrep or Git", async () => {
    const root = await createProject();

    await expect(
      searchProject({ root: join(root, "not-here"), query: "anything" }, { rgCommand: "jait-missing-rg" }),
    ).rejects.toThrow(/Search path does not exist/);
  });

  it("rejects a file used as a search root rather than spawning with it as cwd", async () => {
    const root = await createProject();
    await writeProjectFile(root, "pkg.json", '{"name":"x"}\n');

    // spawn() throws ENOTDIR synchronously for a file cwd, and reports a missing
    // directory as ENOENT — indistinguishable from a missing binary.
    await expect(
      searchProject({ root: join(root, "pkg.json"), query: "name" }, { rgCommand: "jait-missing-rg" }),
    ).rejects.toThrow(/is a file, not a directory/);
  });

  it("falls back to Git enumeration without ripgrep when the root is valid", async () => {
    const root = await createProject();
    await writeProjectFile(root, "src/app.ts", "const measurementsCache = 1;\n");

    const result = await searchProject(
      { root, query: "measurementsCache", mode: "content", limit: 5 },
      { rgCommand: "jait-missing-rg" },
    );

    if (result.mode !== "content") throw new Error("expected content mode");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.file.endsWith("src/app.ts")).toBe(true);
  });
});
