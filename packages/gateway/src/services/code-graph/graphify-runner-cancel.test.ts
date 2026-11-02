import { describe, expect, it } from "vitest";
import { GraphifyRunner } from "./graphify-runner.js";
describe("Graphify cancellation", () => {
  it("does not prepare or invoke a build when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const calls: string[] = [];
    const runner = new GraphifyRunner({
      ensureRuntime: async () => { calls.push("ensure"); },
      execute: async () => { calls.push("execute"); return { stdout: "", stderr: "" }; },
    });
    await expect(runner.build({ projectRoot: "/project", outputDir: "/output", signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError", code: "ABORT_ERR" });
    expect(calls).toEqual([]);
  });

});
