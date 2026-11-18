import { describe, expect, it } from "vitest";
import { type PlanGraphIssueCode, validatePlanGraph } from "./dag.js";

const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };

function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}

function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("validatePlanGraph", () => {
  it("orders a diamond deterministically and fills defaults", () => {
    const result = validatePlanGraph([
      task("A"),
      task("B", { dependsOn: ["A"] }),
      task("C", { dependsOn: ["A"] }),
      task("D", { dependsOn: ["B", "C"] }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order).toEqual(["A", "B", "C", "D"]);
    expect(result.tasks[0]).toMatchObject({
      maxAttempts: 2,
      timeoutSeconds: 1800,
      priority: 0,
      claims: { reads: [], writes: ["."] },
    });
  });

  it("treats empty resources as no claims and normalizes explicit claims", () => {
    const result = validatePlanGraph([
      task("A", { resources: {} }),
      task("B", { resources: { reads: ["./docs/"], writes: ["src", "name:build"] } }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tasks[0]?.claims).toEqual({ reads: [], writes: [] });
    expect(result.tasks[1]?.claims).toEqual({ reads: ["docs"], writes: ["src", "name:build"] });
  });

  it("rejects empty and oversized plans", () => {
    expect(codesOf([])).toEqual(["empty_plan"]);
    expect(codesOf(Array.from({ length: 101 }, (_, index) => task(`T${index}`)))).toEqual(["too_many_tasks"]);
  });

  it("rejects duplicate, malformed and self-referencing ids", () => {
    expect(codesOf([task("A"), task("A")])).toContain("duplicate_task_id");
    expect(codesOf([task("bad id")])).toContain("invalid_task_id");
    expect(codesOf([task("A", { dependsOn: ["A"] })])).toContain("self_dependency");
  });

  it("rejects dependencies on unknown tasks", () => {
    expect(codesOf([task("A", { dependsOn: ["Z"] })])).toEqual(["missing_dependency"]);
  });

  it("reports a cycle with its path", () => {
    const result = validatePlanGraph([task("A", { dependsOn: ["B"] }), task("B", { dependsOn: ["A"] })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([expect.objectContaining({ code: "cycle", message: "dependency cycle: A -> B -> A" })]);
  });

  it("rejects unsafe or contradictory resource declarations", () => {
    expect(codesOf([task("A", { resources: { writes: ["/etc/passwd"] } })])).toContain("invalid_resource");
    expect(codesOf([task("A", { resources: { reads: ["../x"] } })])).toContain("invalid_resource");
    expect(codesOf([task("A", { resources: { writes: ["C:\\x"] } })])).toContain("invalid_resource");
    expect(codesOf([task("A", { resources: { reads: ["src"], writes: ["src"] } })])).toContain("contradictory_resource");
  });

  it("normalizes protected paths and leaves them out when none are declared", () => {
    const result = validatePlanGraph([
      task("A", { resources: { writes: ["src"], protects: ["./src/tests/", "**/*.test.ts", "src/tests"] } }),
      task("B", { resources: { writes: ["docs"] } }),
      task("C", { resources: { writes: ["docs"], protects: [] } }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tasks[0]?.claims).toEqual({ reads: [], writes: ["src"], protects: ["src/tests", "**/*.test.ts"] });
    expect(result.tasks[1]?.claims).toEqual({ reads: [], writes: ["docs"] });
    expect(result.tasks[2]?.claims).toEqual({ reads: [], writes: ["docs"] });
  });

  it("rejects protected paths that are unsafe, named or leave the task unable to write", () => {
    const withProtects = (resources: Record<string, unknown>) => codesOf([task("A", { resources })]);
    expect(withProtects({ writes: ["src"], protects: ["../x"] })).toContain("invalid_resource");
    expect(withProtects({ writes: ["src"], protects: ["/etc"] })).toContain("invalid_resource");
    expect(withProtects({ writes: ["src"], protects: ["name:db"] })).toContain("invalid_resource");
    expect(withProtects({ writes: ["src"], protects: ["tests", 7] })).toContain("invalid_resource");
    expect(withProtects({ writes: ["src"], protects: "tests" })).toContain("invalid_resource");
    expect(withProtects({ reads: ["src"], protects: ["src/tests"] })).toContain("contradictory_resource");
    expect(withProtects({ writes: ["name:db"], protects: ["src/tests"] })).toContain("contradictory_resource");
    expect(withProtects({ writes: ["src/tests"], protects: ["src"] })).toContain("contradictory_resource");
    expect(withProtects({ writes: ["src"], protects: ["."] })).toContain("contradictory_resource");
    expect(withProtects({ writes: ["src"], protects: Array.from({ length: 51 }, (_, index) => `t${index}`) })).toContain(
      "invalid_resource",
    );
  });

  it("accepts a protected path inside a write, and a glob that may match anywhere", () => {
    expect(codesOf([task("A", { resources: { writes: ["src"], protects: ["src/tests"] } })])).toEqual([]);
    expect(codesOf([task("A", { resources: { writes: ["src"], protects: ["**/*.test.ts"] } })])).toEqual([]);
    expect(codesOf([task("A", { resources: { writes: ["."], protects: ["tests", "**/*.snap"] } })])).toEqual([]);
  });

  it("requires at least one well-formed verification gate per task", () => {
    expect(codesOf([task("A", { verification: [] })])).toEqual(["missing_verification"]);
    const unknownKind = { id: "g", label: "x", check: { kind: "shell" } };
    expect(codesOf([task("A", { verification: [unknownKind] })])).toContain("invalid_verification");
    const command = { id: "g", label: "tests", check: { kind: "command", command: "bun test" } };
    expect(validatePlanGraph([task("A", { verification: [command] })]).ok).toBe(true);
  });

  it("bounds attempts, timeouts and priority", () => {
    expect(codesOf([task("A", { maxAttempts: 9 })])).toEqual(["invalid_attempts"]);
    expect(codesOf([task("A", { timeoutSeconds: 0 })])).toEqual(["invalid_timeout"]);
    expect(codesOf([task("A", { priority: 11 })])).toEqual(["invalid_priority"]);
  });

  it("defaults to the in-process worker and accepts an ACP worker that declares writes", () => {
    const plain = validatePlanGraph([task("A", { resources: { writes: ["src"] } })]);
    expect(plain.ok && plain.tasks[0]?.worker).toEqual({ kind: "jait" });
    const acp = validatePlanGraph([
      task("A", { resources: { writes: ["src"] }, worker: { kind: "acp", providerId: "claude-code" } }),
    ]);
    expect(acp.ok && acp.tasks[0]?.worker).toEqual({ kind: "acp", providerId: "claude-code" });
  });

  it("refuses an ACP worker that cannot write inside an isolated worktree", () => {
    const worker = { kind: "acp", providerId: "codex" };
    expect(codesOf([task("A", { resources: { reads: ["."] }, worker })])).toEqual(["invalid_worker"]);
    expect(codesOf([task("A", { resources: {}, worker })])).toEqual(["invalid_worker"]);
    // Absent resources claim the whole project for writing, which is a write claim.
    expect(codesOf([task("A", { worker })])).toEqual([]);
  });

  it("refuses unknown worker kinds and malformed provider ids", () => {
    const writes = { writes: ["src"] };
    expect(codesOf([task("A", { resources: writes, worker: { kind: "shell" } })])).toEqual(["invalid_worker"]);
    expect(codesOf([task("A", { resources: writes, worker: { kind: "acp", providerId: "../escape" } })])).toEqual(["invalid_worker"]);
    expect(codesOf([task("A", { resources: writes, worker: "acp" })])).toEqual(["invalid_worker"]);
  });
});
