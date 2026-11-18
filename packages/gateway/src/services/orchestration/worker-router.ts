/**
 * Picks the sub-agent runner for an attempt from its worker kind. A kind whose
 * runner is not bound fails the attempt as an unknown outcome, so nothing runs
 * on a fallback path.
 */
import type { SubAgentRunner, SubAgentRunRequest, SubAgentRunResult } from "./executor.js";

export interface WorkerRunners {
  /** The in-process Jait worker, or the unbound stand-in. */
  jait: SubAgentRunner;
  /** The ACP coding-agent worker. Absent when no provider registry or consent manager is bound. */
  acp?: SubAgentRunner;
}

export function routeWorkers(runners: WorkerRunners): SubAgentRunner {
  return {
    run(request: SubAgentRunRequest): Promise<SubAgentRunResult> {
      if (request.worker.kind === "acp") {
        if (!runners.acp) return Promise.reject(new Error("ACP workers are not bound to plan orchestration"));
        return runners.acp.run(request);
      }
      return runners.jait.run(request);
    },
  };
}
