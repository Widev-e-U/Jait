import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DesktopProjectSearchInputError,
  DesktopProjectSearchUnavailableError,
  rankDesktopFilePaths,
  resolveDesktopSearchRoot,
  runDesktopProjectSearch,
} from "./project-search.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createProject(prefix = "jait-desktop-search-"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
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
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

describe("desktop project search", () => {
  it("ranks exact source names above tests and generated files", () => {
    expect(
      rankDesktopFilePaths(
        ["dist/parser.js", "tests/parser.test.ts", "src/parser.ts"],
        "parser",
        3,
      ),
    ).toEqual(["src/parser.ts", "tests/parser.test.ts", "dist/parser.js"]);
  });

  it("resolves relative search paths from the supplied cwd", () => {
    expect(resolveDesktopSearchRoot("/workspace/project", "src")).toBe(
      resolve("/workspace/project", "src"),
    );
  });

  it("matches shell metacharacters literally in the safe fallback", async () => {
    const root = await createProject();
    const target = 'const value = "${VAR};$(touch impossible)"';
    await writeProjectFile(root, "literal.ts", `${target}\n`);

    const result = await runDesktopProjectSearch(
      {
        root,
        query: "${VAR};$(touch impossible)",
        mode: "content",
        limit: 10,
      },
      { rgCommand: "jait-missing-rg" },
    );

    if (result.mode !== "content") throw new Error("unexpected mode");
    expect(result.matches).toEqual([
      { file: "literal.ts", line: 1, content: target },
    ]);
  });

  it("does not match text that appears only in the root path", async () => {
    const root = await createProject("needle-root-");
    await writeProjectFile(root, "alpha.ts", "export {};\n");

    const result = await runDesktopProjectSearch(
      { root, query: "needle-root", mode: "files", limit: 10 },
      { rgCommand: "jait-missing-rg" },
    );

    if (result.mode !== "files") throw new Error("unexpected mode");
    expect(result.files).toEqual([]);
  });

  it("only traverses ignored directories when requested", async () => {
    const root = await createProject();
    await writeProjectFile(root, ".gitignore", "node_modules/\n");
    await writeProjectFile(root, "node_modules/hidden-package.ts", "export {};\n");

    const excluded = await runDesktopProjectSearch(
      { root, query: "hidden-package", mode: "files", limit: 10 },
      { rgCommand: "jait-missing-rg" },
    );
    const included = await runDesktopProjectSearch(
      {
        root,
        query: "hidden-package",
        mode: "files",
        limit: 10,
        includeIgnoredFiles: true,
      },
      { rgCommand: "jait-missing-rg" },
    );

    if (excluded.mode !== "files" || included.mode !== "files") {
      throw new Error("unexpected mode");
    }
    expect(excluded.files).toEqual([]);
    expect(included.files.map((file) => file.path)).toEqual([
      "node_modules/hidden-package.ts",
    ]);
  });

  it("honors include and limit in the fallback", async () => {
    const root = await createProject();
    await writeProjectFile(root, "alpha.ts", "needle\n");
    await writeProjectFile(root, "beta.ts", "needle\n");
    await writeProjectFile(root, "gamma.md", "needle\n");

    const result = await runDesktopProjectSearch(
      {
        root,
        query: "needle",
        mode: "content",
        include: "*.ts",
        limit: 1,
      },
      { rgCommand: "jait-missing-rg" },
    );

    if (result.mode !== "content") throw new Error("unexpected mode");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.file.endsWith(".ts")).toBe(true);
    expect(result.limited).toBe(true);
  });
});

describe("desktop project search fallback safety", () => {
  it("rejects regex when ripgrep is unavailable", async () => {
    const root = await createProject();

    await expect(
      runDesktopProjectSearch(
        { root, query: "(a+)+$", mode: "content", isRegexp: true },
        { rgCommand: "jait-missing-rg" },
      ),
    ).rejects.toMatchObject<Partial<DesktopProjectSearchUnavailableError>>({
      reason: "regexp_requires_rg",
    });
  });

  it("still finds content without ripgrep or Git, via the native ignore-aware walker", async () => {
    const root = await mkdtemp(join(tmpdir(), "jait-desktop-search-loose-"));
    tempDirectories.push(root);
    await writeProjectFile(root, "needle.ts", "needle\n");
    await writeProjectFile(root, ".gitignore", "node_modules/\n*.gen.ts\n");
    await writeProjectFile(root, "node_modules/dep.ts", "needle\n");
    await writeProjectFile(root, "out.gen.ts", "needle\n");

    // Neither binary is present, so this used to throw
    // `safe_fallback_unavailable` ("ripgrep is unavailable and Git is
    // required") — a machine-level dead end the caller can neither fix nor
    // route around, which is what turned one bad call into a retry loop. The
    // native walker now produces the listing itself, so the search succeeds.
    const result = await runDesktopProjectSearch(
      { root, query: "needle", mode: "content" },
      {
        rgCommand: "jait-missing-rg",
        gitCommand: "jait-missing-git",
      },
    );
    if (result.mode !== "content") throw new Error("unexpected mode");
    expect(result.matches.map((m) => m.file)).toEqual(["needle.ts"]);
  });

  it("reports a bad root as an input problem, not a missing-binary problem", async () => {
    // A typo'd or non-existent path used to surface as the same ENOENT spawn
    // error as a missing ripgrep, so the message claimed the machine lacked
    // tooling the model could not install.
    await expect(
      runDesktopProjectSearch(
        { root: join(tmpdir(), "jait-desktop-no-such-dir-xyz"), query: "needle", mode: "content" },
        { rgCommand: "jait-missing-rg" },
      ),
    ).rejects.toMatchObject<Partial<DesktopProjectSearchInputError>>({
      name: "ProjectSearchInputError",
    });
  });
});
