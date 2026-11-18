/**
 * Verification runners for plan gates. Command gates run through the same
 * consent-aware tool executor as every other tool call, so approval rules,
 * command allow/deny lists and irreversible-command prompts all apply. The
 * command comes only from the approved plan snapshot, never from an agent
 * report. Without an executor, command gates fail closed.
 */
import { isAbsolute } from "node:path";
import type { ToolContext, ToolResult } from "../../tools/contracts.js";
import type { RepositoryService } from "../repositories.js";
import { createArtifactVerifier } from "./artifact-verifier.js";
import type { VerificationRunInput, VerificationRunner } from "./orchestrator.js";

export type ToolExecutorFn = (
  toolName: string,
  input: unknown,
  context: ToolContext,
  options?: { dryRun?: boolean; consentTimeoutMs?: number },
) => Promise<ToolResult>;

export interface WorkflowVerifierOptions {
  repositories: Pick<RepositoryService, "getById">;
  /** Consent-aware executor, normally ServerDeps.toolExecutor. */
  toolExecutor?: ToolExecutorFn;
}

const DEFAULT_COMMAND_TIMEOUT_SECONDS = 600;
const MAX_COMMAND_TIMEOUT_SECONDS = 86_400;
const MAX_DETAIL = 2_000;

/** The gateway-local repository root when the owner owns it, otherwise null. */
function ownedLocalRoot(
  repositories: Pick<RepositoryService, "getById">,
  userId: string,
  repoId: string | null,
): string | null {
  const repository = repoId ? repositories.getById(repoId) : undefined;
  if (!repository || repository.userId !== userId || repository.deviceId || !isAbsolute(repository.localPath)) {
    return null;
  }
  return repository.localPath;
}

export function createCommandVerifier(options: WorkflowVerifierOptions): VerificationRunner {
  return {
    async run(input: VerificationRunInput) {
      if (input.check.kind !== "command") {
        return { passed: false, detail: "not a command gate" };
      }
      input.signal.throwIfAborted();
      if (!options.toolExecutor) {
        return { passed: false, detail: "no consent-aware command runner is configured, so command gates cannot pass" };
      }
      const cwd = input.workspacePath ?? ownedLocalRoot(options.repositories, input.userId, input.repoId);
      if (!cwd) {
        return { passed: false, detail: "command gates need an owned gateway-local repository or a task workspace" };
      }
      const seconds = Math.min(
        input.check.timeoutSeconds ?? DEFAULT_COMMAND_TIMEOUT_SECONDS,
        MAX_COMMAND_TIMEOUT_SECONDS,
      );
      const result = await options.toolExecutor(
        "terminal.run",
        { command: input.check.command, timeout: seconds * 1000 },
        {
          sessionId: `workflow:${input.runId}`,
          actionId: input.attemptId,
          projectRoot: cwd,
          requestedBy: "workflow",
          userId: input.userId,
          signal: input.signal,
        },
      );
      if (input.signal.aborted) {
        return { passed: false, detail: "command gate cancelled before it finished" };
      }
      const detail = typeof result.message === "string" && result.message.trim() ? result.message : "no output";
      return {
        passed: result.ok === true,
        detail: detail.slice(0, MAX_DETAIL),
      };
    },
  };
}

/** Dispatches artifact and command gates to their runners. This is the verifier the orchestrator is given. */
export function createWorkflowVerifier(options: WorkflowVerifierOptions): VerificationRunner {
  const artifact = createArtifactVerifier(options.repositories);
  const command = createCommandVerifier(options);
  return {
    run: (input) => (input.check.kind === "artifact" ? artifact.run(input) : command.run(input)),
  };
}
