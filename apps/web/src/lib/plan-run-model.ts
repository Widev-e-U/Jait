/**
 * Pure rules for plan runs in the web UI. The gateway decides what is allowed;
 * these helpers only shape what the owner can do and what they must fill in.
 */
import type { OrchestrationRunView, OrchestrationTaskView } from '@jait/shared'

export type PlanRunDecisionKind = 'retry' | 'fail'

export interface PlanRunDecision {
  taskId: string
  decision: PlanRunDecisionKind
  note: string
}

/** A draft is what the owner has typed so far for one interrupted task. */
export interface PlanRunDraft {
  decision?: PlanRunDecisionKind
  note: string
}

export const MAX_DECISION_NOTE = 500

type RunLike = Pick<OrchestrationRunView, 'status' | 'paused' | 'tasks'>

/** A run can be stopped while it has not reached a final state. */
export function canCancelRun(run: Pick<OrchestrationRunView, 'status'>): boolean {
  return run.status === 'running' || run.status === 'interrupted'
}

/** Tasks whose outcome is unknown and wait for an owner's decision. */
export function interruptedTaskIds(run: Pick<OrchestrationRunView, 'tasks'>): string[] {
  return run.tasks.filter((task) => task.state === 'interrupted').map((task) => task.taskId)
}

/** A paused run (after a restart or halt), or one with interrupted tasks, waits for a resume. */
export function canResumeRun(run: RunLike): boolean {
  return run.paused || interruptedTaskIds(run).length > 0
}

/**
 * Every interrupted task needs an explicit retry or fail and a note on what was
 * inspected. Nothing restarts on a default, so a missing choice is an error.
 */
export function buildDecisions(
  taskIds: readonly string[],
  drafts: Readonly<Record<string, PlanRunDraft | undefined>>,
): { ok: true; decisions: PlanRunDecision[] } | { ok: false; error: string } {
  const decisions: PlanRunDecision[] = []
  for (const taskId of taskIds) {
    const draft = drafts[taskId]
    if (!draft?.decision) return { ok: false, error: `Choose retry or fail for task ${taskId}.` }
    const note = draft.note.trim()
    if (!note) return { ok: false, error: `Note what you checked for task ${taskId}.` }
    if (note.length > MAX_DECISION_NOTE) {
      return { ok: false, error: `Keep the note for task ${taskId} to ${MAX_DECISION_NOTE} characters.` }
    }
    decisions.push({ taskId, decision: draft.decision, note })
  }
  return { ok: true, decisions }
}

/** Names the worker from its reference: ACP attempts record `acp:<provider>:<attempt>`. */
export function describeWorker(agentRef: string | null): string {
  if (!agentRef) return 'No worker yet'
  if (agentRef.startsWith('acp:')) return `ACP agent · ${agentRef.split(':')[1] ?? 'unknown'}`
  return `In-process worker · ${agentRef.slice(0, 8)}`
}

export function runProgress(run: Pick<OrchestrationRunView, 'tasks'>): { passed: number; total: number } {
  return {
    passed: run.tasks.filter((task: OrchestrationTaskView) => task.state === 'passed').length,
    total: run.tasks.length,
  }
}
