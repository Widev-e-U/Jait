import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runPrimaryProjectSearch,
  runPrimarySearchTool,
} from "./primary-link.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jait-primary-search-"));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

describe("PrimaryLink ranked project search", () => {
  it("passes shell metacharacters literally without executing them", async () => {
    const root = await createProject();
    const sentinel = join(root, "search-command-was-executed");
    const pattern = "${PRIMARY_SEARCH_VALUE};$(touch " + sentinel + ")";
    const target = `const value = "${pattern}"`;
    await writeProjectFile(root, "literal.ts", `${target}\n`);

    const result = await runPrimarySearchTool(
      { pattern, mode: "content", isRegexp: false, limit: 10 },
      root,
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      pattern,
      matches: [{ file: join(root, "literal.ts"), line: 1, content: target }],
    });
    await expect(access(sentinel)).rejects.toThrow();
  });

  it("threads include and limit through the core tool contract", async () => {
    const root = await createProject();
    await writeProjectFile(root, "src/target.ts", "export function targetAlpha() { return true; }\n");
    await writeProjectFile(root, "src/target.md", "export function targetAlpha() { return true; }\n");

    const result = await runPrimarySearchTool(
      {
        pattern: "targetAlpha",
        mode: "content",
        isRegexp: false,
        include: "*.ts",
        limit: 1,
      },
      root,
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      pattern: "targetAlpha",
      matches: [{
        file: join(root, "src/target.ts"),
        line: 1,
        content: "export function targetAlpha() { return true; }",
      }],
    });
  });

  it("resolves relative search paths from the remote project root", async () => {
    const root = await createProject();
    await writeProjectFile(root, "src/ranked-search.ts", "export {};\n");

    const result = await runPrimarySearchTool(
      { pattern: "ranked-search", mode: "files", path: "src", limit: 10 },
      root,
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      pattern: "ranked-search",
      files: [join(root, "src/ranked-search.ts")],
    });
  });

  it("keeps filesystem-operation results relative and honors ignored-file opt-in", async () => {
    const root = await createProject();
    await writeProjectFile(root, ".gitignore", "node_modules/\n");
    await writeProjectFile(root, "node_modules/private-search.ts", "export {};\n");

    const excluded = await runPrimaryProjectSearch({
      root,
      query: "private-search",
      mode: "files",
      limit: 10,
    });
    const included = await runPrimaryProjectSearch({
      root,
      query: "private-search",
      mode: "files",
      limit: 10,
      includeIgnoredFiles: true,
    });

    expect(excluded.mode).toBe("files");
    expect(included.mode).toBe("files");
    if (excluded.mode !== "files" || included.mode !== "files") {
      throw new Error("unexpected mode");
    }
    expect(excluded.files).toEqual([]);
    expect(included.files).toEqual([
      { path: "node_modules/private-search.ts", name: "private-search.ts" },
    ]);
  });
});
