/**
 * Plan runs for one plan: start a run, follow its tasks, workers, attempts and
 * pending approvals, cancel it, and resume it. Resuming needs a retry or fail
 * decision and a note for every interrupted task, so nothing restarts on a default.
 */
import { useCallback, useEffect, useState } from 'react'
import type { OrchestrationAttemptView, OrchestrationRunView, OrchestrationTaskView } from '@jait/shared'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { submitConsentDecision } from '@/components/consent/action-card'
import { agentsApi } from '@/lib/agents-api'
import {
  buildDecisions,
  canCancelRun,
  canResumeRun,
  describeWorker,
  interruptedTaskIds,
  MAX_DECISION_NOTE,
  type PlanRunDecisionKind,
  type PlanRunDraft,
  runProgress,
} from '@/lib/plan-run-model'

const RUN_STATUS: Record<OrchestrationRunView['status'], { label: string; className: string }> = {
  running: { label: 'Running', className: 'text-amber-600 bg-amber-500/10 dark:text-amber-400' },
  interrupted: { label: 'Needs decision', className: 'text-orange-600 bg-orange-500/10 dark:text-orange-400' },
  passed: { label: 'Passed', className: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' },
  failed: { label: 'Failed', className: 'text-destructive bg-destructive/10' },
  cancelled: { label: 'Cancelled', className: 'text-muted-foreground bg-muted/50' },
}

const TASK_STATE: Record<OrchestrationTaskView['state'], { label: string; className: string }> = {
  pending: { label: 'Waiting', className: 'text-muted-foreground bg-muted/50' },
  ready: { label: 'Ready', className: 'text-blue-600 bg-blue-500/10 dark:text-blue-400' },
  running: { label: 'Running', className: 'text-amber-600 bg-amber-500/10 dark:text-amber-400' },
  verifying: { label: 'Checking', className: 'text-amber-600 bg-amber-500/10 dark:text-amber-400' },
  passed: { label: 'Passed', className: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' },
  failed: { label: 'Failed', className: 'text-destructive bg-destructive/10' },
  blocked: { label: 'Blocked', className: 'text-muted-foreground bg-muted/50' },
  cancelled: { label: 'Cancelled', className: 'text-muted-foreground bg-muted/50' },
  interrupted: { label: 'Needs decision', className: 'text-orange-600 bg-orange-500/10 dark:text-orange-400' },
}

const MIN_WORKERS = 1
const MAX_WORKERS = 8
const DEFAULT_WORKERS = 2

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-medium ${className}`}>{label}</span>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function clampWorkers(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WORKERS
  return Math.min(MAX_WORKERS, Math.max(MIN_WORKERS, Math.round(value)))
}

export interface PlanRunDetailProps {
  run: OrchestrationRunView
  drafts: Readonly<Record<string, PlanRunDraft | undefined>>
  attempts: Readonly<Record<string, OrchestrationAttemptView[] | undefined>>
  busy: boolean
  onDraftChange: (taskId: string, draft: PlanRunDraft) => void
  onShowAttempts: (taskId: string) => void
  onCancel: () => void
  onResume: () => void
  onDecideApproval: (requestId: string, decision: 'approve' | 'reject') => void
}

/** One run in full. Pure, so the rules it shows can be rendered and checked without the gateway. */
export function PlanRunDetail({
  run, drafts, attempts, busy, onDraftChange, onShowAttempts, onCancel, onResume, onDecideApproval,
}: PlanRunDetailProps) {
  const progress = runProgress(run)
  const interrupted = interruptedTaskIds(run)
  const status = RUN_STATUS[run.status]
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge label={status.label} className={status.className} />
        {run.paused && <Badge label="Paused" className="text-muted-foreground bg-muted/50" />}
        <span className="text-muted-foreground">
          {progress.passed} of {progress.total} tasks passed, up to {run.maxWorkers} at once
        </span>
      </div>

      {run.error && <p className="text-destructive">{run.error}</p>}

      {run.pendingApprovals.length > 0 && (
        <div className="space-y-1 rounded border p-2">
          <p className="font-medium">Waiting for approval ({run.pendingApprovals.length})</p>
          <ul className="space-y-1">
            {run.pendingApprovals.map((approval) => (
              <li key={approval.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-mono">{approval.toolName}</span>: {approval.summary}
                </span>
                <Button size="sm" className="h-6 text-xs" disabled={busy} onClick={() => onDecideApproval(approval.id, 'approve')}>Approve</Button>
                <Button size="sm" variant="outline" className="h-6 text-xs" disabled={busy} onClick={() => onDecideApproval(approval.id, 'reject')}>Refuse</Button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Answer worker prompts here or from the notification. They do not appear in the chat that started the run.
            Approve lets the call run, Refuse stops it, and an unanswered prompt times out as a refusal.
          </p>
        </div>
      )}

      <ul className="divide-y rounded border">
        {run.tasks.map((task) => (
          <TaskRow
            key={task.taskId}
            task={task}
            attempts={attempts[task.taskId]}
            onShowAttempts={() => onShowAttempts(task.taskId)}
          />
        ))}
      </ul>

      {interrupted.length > 0 && (
        <div className="space-y-2 rounded border border-orange-500/40 p-2">
          <p className="font-medium">Decide each interrupted task after you inspect its worktree</p>
          {interrupted.map((taskId) => {
            const draft = drafts[taskId]
            return (
              <div key={taskId} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{taskId}</span>
                <select
                  aria-label={`Decision for ${taskId}`}
                  className="h-7 rounded border bg-background px-1 text-xs"
                  value={draft?.decision ?? ''}
                  onChange={(event) => {
                    const choice = event.target.value
                    const decision: PlanRunDecisionKind | undefined = choice === 'retry' || choice === 'fail' ? choice : undefined
                    onDraftChange(taskId, { decision, note: draft?.note ?? '' })
                  }}
                >
                  <option value="">Choose</option>
                  <option value="retry">Retry</option>
                  <option value="fail">Fail</option>
                </select>
                <Input
                  aria-label={`Note for ${taskId}`}
                  className="h-7 min-w-48 flex-1 text-xs"
                  placeholder="What you checked"
                  maxLength={MAX_DECISION_NOTE}
                  value={draft?.note ?? ''}
                  onChange={(event) => onDraftChange(taskId, { decision: draft?.decision, note: event.target.value })}
                />
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        {canResumeRun(run) && (
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={onResume}>Resume run</Button>
        )}
        {canCancelRun(run) && (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onCancel}>Cancel run</Button>
        )}
      </div>
    </div>
  )
}

function TaskRow({
  task, attempts, onShowAttempts,
}: {
  task: OrchestrationTaskView
  attempts: OrchestrationAttemptView[] | undefined
  onShowAttempts: () => void
}) {
  const state = TASK_STATE[task.state]
  return (
    <li className="space-y-1 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{task.title}</span>
        <span className="font-mono text-muted-foreground">{task.taskId}</span>
        <Badge label={state.label} className={state.className} />
        <span className="text-muted-foreground">attempt {task.attemptCount} of {task.maxAttempts}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-muted-foreground">
        <span>{task.dependsOn.length > 0 ? `After ${task.dependsOn.join(', ')}` : 'No dependencies'}</span>
        <span>{describeWorker(task.agentRef)}</span>
        {task.worktreeRef && <span className="font-mono">{task.worktreeRef}</span>}
      </div>
      {task.lastError && <p className="text-destructive">{task.lastError}</p>}
      {task.state === 'passed' && task.result?.summary && <p>{task.result.summary}</p>}
      <div>
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={onShowAttempts}>Show attempts</Button>
      </div>
      {attempts && (
        <ul className="space-y-0.5 rounded bg-muted/30 p-1.5">
          {attempts.length === 0 && <li className="text-muted-foreground">No attempts yet</li>}
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <span className="font-medium">#{attempt.attemptNo}</span> {attempt.state} · {describeWorker(attempt.agentRef)}
              {attempt.verification && attempt.verification.length > 0 && (
                <span className="text-muted-foreground">
                  {' · '}{attempt.verification.map((outcome) => `${outcome.gateId} ${outcome.passed ? 'passed' : 'failed'}`).join(', ')}
                </span>
              )}
              {attempt.error && <span className="text-destructive"> · {attempt.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** The runs of one plan, loaded from the gateway. A running run refreshes itself until it settles. */
export function PlanRunPanel({ planId }: { planId: string }) {
  const [runs, setRuns] = useState<OrchestrationRunView[]>([])
  const [selected, setSelected] = useState<OrchestrationRunView | null>(null)
  const [drafts, setDrafts] = useState<Record<string, PlanRunDraft | undefined>>({})
  const [attempts, setAttempts] = useState<Record<string, OrchestrationAttemptView[] | undefined>>({})
  const [maxWorkers, setMaxWorkers] = useState(DEFAULT_WORKERS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    try {
      const all = await agentsApi.listPlanRuns()
      setRuns(all.filter((run) => run.planId === planId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const selectedId = selected?.id
  const selectedStatus = selected?.status
  useEffect(() => {
    if (!selectedId || selectedStatus !== 'running') return
    const timer = setInterval(() => {
      void agentsApi.getPlanRun(selectedId).then(setSelected).catch(() => undefined)
    }, 4000)
    return () => clearInterval(timer)
  }, [selectedId, selectedStatus])

  const openRun = async (runId: string) => {
    setError(null)
    setDrafts({})
    setAttempts({})
    try {
      setSelected(await agentsApi.getPlanRun(runId))
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const startRun = async () => {
    setBusy(true)
    setError(null)
    try {
      const run = await agentsApi.startPlanRun(planId, maxWorkers)
      setDrafts({})
      setAttempts({})
      setSelected(run)
      await loadRuns()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const cancelRun = async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      setSelected(await agentsApi.cancelPlanRun(selected.id))
      await loadRuns()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const resumeRun = async () => {
    if (!selected) return
    const built = buildDecisions(interruptedTaskIds(selected), drafts)
    if (!built.ok) {
      setError(built.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      setSelected(await agentsApi.resumePlanRun(selected.id, built.decisions))
      setDrafts({})
      await loadRuns()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const decideApproval = async (requestId: string, decision: 'approve' | 'reject') => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const recorded = await submitConsentDecision(requestId, decision, () => undefined, decision === 'reject' ? 'Refused from the plan run' : undefined)
      if (!recorded) setError('The gateway did not record that decision. The prompt may already be answered or timed out.')
      setSelected(await agentsApi.getPlanRun(selected.id))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const showAttempts = async (taskId: string) => {
    if (!selected) return
    try {
      const list = await agentsApi.listPlanRunAttempts(selected.id, taskId)
      setAttempts((previous) => ({ ...previous, [taskId]: list }))
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <section aria-label="Plan runs" className="max-h-96 shrink-0 space-y-3 overflow-y-auto border-t px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold">Runs</h3>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor={`plan-run-workers-${planId}`} className="text-xs text-muted-foreground">Workers</label>
          <Input
            id={`plan-run-workers-${planId}`}
            type="number"
            min={MIN_WORKERS}
            max={MAX_WORKERS}
            className="h-7 w-16 text-xs"
            value={maxWorkers}
            onChange={(event) => setMaxWorkers(clampWorkers(Number(event.target.value)))}
          />
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void startRun()}>Start run</Button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No runs yet. A run starts the approved tasks in dependency order.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {runs.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                className={`rounded-full border px-2 py-0.5 text-xs ${selected?.id === run.id ? 'border-foreground' : ''}`}
                onClick={() => void openRun(run.id)}
              >
                {RUN_STATUS[run.status].label} · {new Date(run.createdAt).toLocaleString()}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <PlanRunDetail
          run={selected}
          drafts={drafts}
          attempts={attempts}
          busy={busy}
          onDraftChange={(taskId, draft) => setDrafts((previous) => ({ ...previous, [taskId]: draft }))}
          onShowAttempts={(taskId) => void showAttempts(taskId)}
          onCancel={() => void cancelRun()}
          onResume={() => void resumeRun()}
          onDecideApproval={(requestId, decision) => void decideApproval(requestId, decision)}
        />
      )}
    </section>
  )
}
