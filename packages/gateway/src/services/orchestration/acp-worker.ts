/**
 * ACP coding-agent worker for plan runs. It runs one turn of an ACP provider
 * (Claude Code, Codex, ...) inside the task's isolated worktree, in supervised
 * mode only. Each tool approval the agent asks for becomes a consent request on
 * the run's workflow session, so the owner decides it there. A stopped attempt
 * denies its pending requests at once. The scope and integration gates still
 * check what the agent changed.
 *
 * Only a finished turn is an answer. A timeout, a stop or a failed start leaves
 * the outcome unknown, so the attempt is interrupted and nothing re-runs on its own.
 */
import type { ProviderRegistry } from "../../providers/registry.js";
import type { ConsentManager } from "../../security/consent-manager.js";
import { runAcpSpecialistTurn } from "../../tools/agent-acp-runner.js";
import { boundText, redactSecrets } from "./agent-report.js";
import type { SubAgentRunner, SubAgentRunRequest, SubAgentRunResult } from "./executor.js";
import { workflowSessionId } from "./orchestrator.js";

const MAX_PREVIEW = 2000;

export interface AcpWorkerOptions {
  config: { host: string; port: number };
  providerRegistry: ProviderRegistry;
  consentManager: ConsentManager;
  /** How long an approval waits for a decision before it is denied. Defaults to the consent manager's timeout. */
  approvalTimeoutMs?: number;
}

export function createAcpWorkflowWorker(options: AcpWorkerOptions): SubAgentRunner {
  return {
    async run(request: SubAgentRunRequest): Promise<SubAgentRunResult> {
      const { worker, workspace, signal } = request;
      signal.throwIfAborted();
      if (worker.kind !== "acp") throw new Error("the ACP worker only runs ACP tasks");
      if (!workspace || workspace.mode !== "write") {
        throw new Error("ACP workers need an isolated write worktree for their task");
      }
      const provider = options.providerRegistry.getForUser(worker.providerId, request.userId);
      if (!provider) throw new Error(`ACP provider "${worker.providerId}" is not available for this account`);
      // Never fall back to full access. Without a supervised mode the task does not run.
      if (!provider.info.modes.includes("supervised")) {
        throw new Error(`ACP provider "${worker.providerId}" cannot run supervised, so it cannot carry a workflow task`);
      }

      const sessionId = workflowSessionId(request.runId);
      const subAgentId = request.attemptId;
      request.recordAgentRef?.(`acp:${worker.providerId}:${subAgentId}`);
      const result = await runAcpSpecialistTurn({
        providerRegistry: options.providerRegistry,
        config: options.config,
        providerId: worker.providerId,
        userId: request.userId,
        sessionId,
        subAgentId,
        projectRoot: workspace.path,
        runtimeMode: "supervised",
        jaitMcpTools: false,
        prompt: request.prompt,
        abortSignal: signal,
        timeoutMs: request.timeoutMs,
        onApprovalRequired: async ({ tool, args }) => {
          const decision = await options.consentManager.requestConsent({
            actionId: request.attemptId,
            toolName: `acp.${worker.providerId}`,
            summary: `${worker.providerId} asks to run "${tool}" for task ${request.taskId}`,
            preview: { tool, args: previewOf(args) },
            risk: "high",
            policy: {
              consentLevel: "dangerous",
              description: "A coding agent's tool call inside its task worktree.",
              knownTool: false,
              source: "unknown-tool",
            },
            sessionId,
            signal,
            timeoutMs: options.approvalTimeoutMs,
          });
          return decision.approved;
        },
      });

      signal.throwIfAborted();
      const data = result.data as { turnCompleted?: unknown; content?: unknown } | undefined;
      if (data?.turnCompleted !== true || typeof data.content !== "string") {
        throw new Error(`ACP worker ${worker.providerId} did not finish its turn: ${result.message}`);
      }
      return { text: data.content };
    },
  };
}

/** Consent previews must not carry secrets, and must stay small enough to read on a prompt. */
function previewOf(args: unknown): string {
  try {
    return boundText(redactSecrets(JSON.stringify(args) ?? "null"), MAX_PREVIEW);
  } catch {
    return "(arguments could not be shown)";
  }
}
