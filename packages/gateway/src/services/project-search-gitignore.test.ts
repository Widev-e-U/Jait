import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { searchProject } from "./project-search.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function write(root: string, rel: string, content: string) {
  const abs = join(root, rel);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content, "utf8");
}

/**
 * Pins the native ignore-aware walker to real Git behaviour.
 *
 * The walker is what lets search run without ripgrep or Git installed, so it
 * has to reproduce `git ls-files --exclude-standard` rather than approximate
 * it — otherwise "search works everywhere" would quietly mean "search leaks
 * ignored files into model context on machines without Git".
 */
it("enumerates exactly what git ls-files would, without invoking either binary", async () => {
  const root = await mkdtemp(join(tmpdir(), "jait-gitignore-diff-"));
  dirs.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });

  await write(root, ".gitignore", [
    "node_modules/",
    "dist",
    "*.gen.ts",
    "/only-root.ts",
    "**/deep-anywhere.ts",
    "build/*.js",
    "!important.gen.ts",
    "logs/**",
    "?ingle.ts",
    "[abc]bracket.ts",
  ].join("\n") + "\n");
  await write(root, "pkg/.gitignore", "!nested-keep.gen.ts\nlocal-tmp/\n");

  const files = [
    "keep.ts", "only-root.ts", "sub/only-root.ts", "important.gen.ts",
    "a.gen.ts", "sub/b.gen.ts", "pkg/nested-keep.gen.ts", "pkg/other.gen.ts",
    "node_modules/x.ts", "dist/y.ts", "sub/dist/z.ts",
    "deep-anywhere.ts", "a/b/deep-anywhere.ts",
    "build/app.js", "build/app.ts", "sub/build/app.js",
    "logs/today/run.ts", "single.ts", "sing.ts",
    "abracket.ts", "bbracket.ts", "dbracket.ts",
    "pkg/local-tmp/t.ts", "pkg/src/main.ts",
  ];
  for (const f of files) await write(root, f, "needle\n");

  const gitListed = new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: root, encoding: "utf8",
    }).split("\n").filter(Boolean).filter((p) => p.endsWith(".ts") || p.endsWith(".js")),
  );

  const result = await searchProject(
    { root, query: "needle", mode: "content", limit: 200 },
    { rgCommand: "jait-missing-rg", gitCommand: "jait-missing-git" },
  );
  if (result.mode !== "content") throw new Error("mode");
  const native = new Set(result.matches.map((m) => m.relativePath));

  // Only compare files that actually contain the needle and are searchable.
  const expected = [...gitListed].filter((p) => p.endsWith(".ts") || p.endsWith(".js")).sort();
  expect([...native].sort()).toEqual(expected);
});
