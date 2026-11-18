import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../../tools/contracts.js";
import type { RepositoryService } from "../repositories.js";
import { createCommandVerifier, createWorkflowVerifier, type ToolExecutorFn } from "./command-verifier.js";
import type { VerificationRunInput } from "./orchestrator.js";
import type { ToolDefinition } from "../../tools/contracts.js";
import { ToolRegistry } from "../../tools/registry.js";
import { ConsentAwareExecutor } from "../../security/consent-executor.js";
import { ConsentManager } from "../../security/consent-manager.js";
import type { ToolPermission } from "../../security/tool-permissions.js";
import { TrustEngine } from "../../security/trust-engine.js";

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

  it("never passes a command that yielded to the background, because it has no verdict yet", async () => {
    const executor: ToolExecutorFn = async () => ({
      ok: true,
      message: "Command is still running after the 10000ms initial wait.",
      data: { yielded: true, isBackground: true, executionId: "exec-1" },
    });
    const verdict = await createCommandVerifier({ repositories, toolExecutor: executor }).run(input());
    expect(verdict.passed).toBe(false);
    expect(verdict.detail).toContain("did not finish");
  });

  it("reports a stopped command as cancelled and never passes it, even when it exited 0", async () => {
    const controller = new AbortController();
    const executor: ToolExecutorFn = async () => {
      controller.abort();
      return { ok: true, message: "exit 0" };
    };
    const verdict = await createCommandVerifier({ repositories, toolExecutor: executor })
      .run(input({ signal: controller.signal }));
    expect(verdict.passed).toBe(false);
    expect(verdict.detail).toContain("cancelled");
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

describe("command gates through the real consent path", () => {
  async function until(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("condition not reached in time");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  function setup() {
    const ran: Array<{ command: string; cwd: string }> = [];
    const registry = new ToolRegistry();
    registry.register({
      name: "terminal.run",
      description: "Run a command in the terminal",
      parameters: {
        type: "object",
        properties: { command: { type: "string" }, timeout: { type: "number" } },
        required: ["command"],
      },
      execute: async (toolInput: { command: string }, context: { projectRoot: string }) => {
        ran.push({ command: toolInput.command, cwd: context.projectRoot });
        return { ok: true, message: "exit 0" };
      },
    } as unknown as ToolDefinition);
    const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
    // The consent level that applies to terminal commands: every run asks the owner.
    const permissions = new Map<string, ToolPermission>([
      ["terminal.run", { consentLevel: "always", risk: "high", description: "Run a terminal command", knownTool: true, source: "profile" } as unknown as ToolPermission],
    ]);
    const executor = new ConsentAwareExecutor({
      toolRegistry: registry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions,
      sessionApprovals: new Set<string>(),
    });
    const toolExecutor: ToolExecutorFn = (name, toolInput, context, options) => executor.execute(name, toolInput, context, options);
    return { ran, consentManager, toolExecutor };
  }

  it("waits for the owner's approval before running the command, and runs it in the workspace once approved", async () => {
    const { ran, consentManager, toolExecutor } = setup();
    const verifier = createCommandVerifier({ repositories, toolExecutor });
    const verdict = verifier.run(input({ workspacePath: "/workspaces/A" }));

    await until(() => consentManager.listPending("workflow:run-1").length === 1);
    expect(ran).toHaveLength(0);
    const [request] = consentManager.listPending("workflow:run-1");
    expect(request?.toolName).toBe("terminal.run");
    expect(consentManager.approve(request!.id, "click")).toBe(true);

    await expect(verdict).resolves.toMatchObject({ passed: true });
    expect(ran).toEqual([{ command: "npm test", cwd: "/workspaces/A" }]);
  });

  it("fails the gate without running the command when the owner rejects it", async () => {
    const { ran, consentManager, toolExecutor } = setup();
    const verifier = createCommandVerifier({ repositories, toolExecutor });
    const verdict = verifier.run(input());

    await until(() => consentManager.listPending("workflow:run-1").length === 1);
    const [request] = consentManager.listPending("workflow:run-1");
    expect(consentManager.reject(request!.id, "click", "not now")).toBe(true);

    const outcome = await verdict;
    expect(outcome.passed).toBe(false);
    expect(outcome.detail).toContain("rejected");
    expect(ran).toHaveLength(0);
  });
});
