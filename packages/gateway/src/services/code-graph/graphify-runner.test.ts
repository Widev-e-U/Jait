import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphifyRunner } from "./graphify-runner.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("GraphifyRunner", () => {
  it("waits for runtime provisioning before invoking Graphify", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jait-graphify-runner-"));
    dirs.push(dir);
    let releaseRuntime!: () => void;
    const runtimeReady = new Promise<void>((resolve) => { releaseRuntime = resolve; });
    const calls: string[] = [];
    const runner = new GraphifyRunner({
      command: "graphify-test",
      ensureRuntime: () => runtimeReady,
      execute: async (_command, args) => {
        calls.push(args[0]!);
        return { stdout: args[0] === "--version" ? "graphify 0.9.30" : "", stderr: "" };
      },
    });

    const build = runner.build({ projectRoot: dir, outputDir: join(dir, "out") });
    await Promise.resolve();
    expect(calls).toEqual([]);
    releaseRuntime();
    await build;
    expect(calls).toEqual(["--version", "extract"]);
  });
});
