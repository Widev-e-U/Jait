import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../../tools/contracts.js";
import type { RepositoryService } from "../repositories.js";
import { createCommandVerifier, createWorkflowVerifier, type ToolExecutorFn } from "./command-verifier.js";
import type { VerificationRunInput } from "./orchestrator.js";

const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;

function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}

interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}

function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}

describe("command gates", () => {
  it("runs the approved command through the consent-aware executor in the task workspace", async () => {
    const { executor, calls } = recordingExecutor({ ok: true, message: "exit 0" });
    const verdict = await createCommandVerifier({ repositories, toolExecutor: executor }).run(input());

    expect(verdict).toEqual({ passed: true, detail: "exit 0" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "terminal.run",
      input: { command: "npm test", timeout: 120_000 },
      context: {
        projectRoot: "/workspaces/A",
        requestedBy: "workflow",
        userId: "owner",
        sessionId: "workflow:run-1",
        actionId: "attempt-1",
      },
    });
  });

  it("fails the gate when the owner rejects the command or it exits non-zero", async () => {
    const { executor } = recordingExecutor({ ok: false, message: "User rejected terminal.run: no" });
    const verdict = await createCommandVerifier({ repositories, toolExecutor: executor }).run(input());
    expect(verdict.passed).toBe(false);
    expect(verdict.detail).toContain("rejected");
  });

  it("fails closed without a consent-aware executor and never runs anything", async () => {
    const verdict = await createCommandVerifier({ repositories }).run(input());
    expect(verdict.passed).toBe(false);
    expect(verdict.detail).toContain("no consent-aware command runner");
  });

  it("runs in the repository root without a workspace, and only for a repository the owner owns", async () => {
    const { executor, calls } = recordingExecutor({ ok: true, message: "exit 0" });
    const verifier = createCommandVerifier({ repositories, toolExecutor: executor });

    await verifier.run(input({ workspacePath: null }));
    expect(calls[0]?.context.projectRoot).toBe("/repos/app");

    const foreign = await verifier.run(input({ workspacePath: null, repoId: "someone-elses" }));
    expect(foreign.passed).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("refuses to start once the attempt is stopped", async () => {
    const controller = new AbortController();
    controller.abort(new Error("halted"));
    const { executor, calls } = recordingExecutor({ ok: true, message: "exit 0" });
    await expect(createCommandVerifier({ repositories, toolExecutor: executor }).run(input({ signal: controller.signal }))).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("workflow verifier", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("checks artifacts inside the workspace and routes command gates to the executor", async () => {
    dir = await mkdtemp(join(tmpdir(), "jait-verify-"));
    await mkdir(join(dir, "docs"));
    await writeFile(join(dir, "docs", "a.md"), "a\n");
    const verifier = createWorkflowVerifier({ repositories: { getById: () => ({ ...OWNED_REPO, localPath: dir! }) } as unknown as Pick<RepositoryService, "getById">, toolExecutor: undefined });

    expect(await verifier.run(input({ check: { kind: "artifact", path: "docs/a.md" }, workspacePath: dir }))).toMatchObject({ passed: true });
    expect(await verifier.run(input({ check: { kind: "artifact", path: "docs/missing.md" }, workspacePath: dir }))).toMatchObject({ passed: false });
    expect(await verifier.run(input({ check: { kind: "command", command: "true" } }))).toMatchObject({ passed: false });
  });
});
