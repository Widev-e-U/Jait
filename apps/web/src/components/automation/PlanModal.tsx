/**
 * PlanModal — view, edit, generate, and start task plans for a repository.
 *
 * The AI proposes tasks, the human reviews them, and can start them as
 * parallel agent threads with a play button.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Loader2, Sparkles, Play, Check, ChevronDown, ChevronRight,
  Trash2, Plus, PlayCircle, SkipForward, Pencil,
} from 'lucide-react'
import {
  agentsApi,
  type AutomationPlan,
  type PlanTask,
  type PlanTaskStatus,
  type ProviderId,
} from '@/lib/agents-api'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'


// ── Status helpers ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<PlanTaskStatus, { label: string; color: string; bg: string }> = {
  proposed: { label: 'Proposed', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
  approved: { label: 'Ready', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/10' },
  running:  { label: 'Running', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  completed:{ label: 'Done', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  skipped:  { label: 'Skipped', color: 'text-muted-foreground', bg: 'bg-muted/50' },
}

function TaskStatusBadge({ status }: { status: PlanTaskStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-medium ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  )
}

// ── Props ────────────────────────────────────────────────────────────

interface PlanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoId: string
  repoName: string
  defaultBranch: string
  repoLocalPath: string
  provider: ProviderId
  model?: string | null
  onStartThread: (task: PlanTask, plan: AutomationPlan, repo: { name: string; localPath: string; defaultBranch: string }) => void
}

// ── Component ────────────────────────────────────────────────────────

export function PlanModal({
  open, onOpenChange, repoId, repoName, defaultBranch, repoLocalPath,
  provider, model,
  onStartThread,
}: PlanModalProps) {
  const confirm = useConfirmDialog()
  const [plans, setPlans] = useState<AutomationPlan[]>([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const activePlan = plans.find((p) => p.id === activePlanId) ?? plans[0] ?? null

  // ── Load plans when modal opens ────────────────────────────────

  useEffect(() => {
    if (!open || !repoId) return
    let cancelled = false

    setLoading(true)
    setError(null)
    agentsApi.listPlans(repoId)
      .then((p) => {
        if (cancelled) return
        setPlans(p)
        if (p.length > 0 && !activePlanId) {
          setActivePlanId(p[0].id)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load plans')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, repoId])

  // ── Create a new plan ──────────────────────────────────────────

  const handleCreatePlan = useCallback(async () => {
    setError(null)
    try {
      const plan = await agentsApi.createPlan(repoId, { title: 'New Plan' })
      setPlans((prev) => [plan, ...prev])
      setActivePlanId(plan.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan')
    }
  }, [repoId])

  // ── Generate tasks via AI ──────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!activePlan) return
    setGenerating(true)
    setError(null)
    try {
      const result = await agentsApi.generatePlanTasks(activePlan.id, {
        prompt: generatePrompt || undefined,
        provider,
        model: provider === 'jait' ? null : (model ?? null),
      })
      setPlans((prev) => prev.map((p) => p.id === result.plan.id ? result.plan : p))
      setGeneratePrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tasks')
    } finally {
      setGenerating(false)
    }
  }, [activePlan, generatePrompt, model, provider])

  // ── Task actions ───────────────────────────────────────────────

  const updateTaskStatus = useCallback(async (taskId: string, status: PlanTaskStatus) => {
    if (!activePlan) return
    const tasks = activePlan.tasks.map((t) =>
      t.id === taskId ? { ...t, status } : t,
    )
    try {
      const updated = await agentsApi.updatePlan(activePlan.id, { tasks })
      setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task')
    }
  }, [activePlan])

  const removeTask = useCallback(async (taskId: string) => {
    if (!activePlan) return
    const tasks = activePlan.tasks.filter((t) => t.id !== taskId)
    try {
      const updated = await agentsApi.updatePlan(activePlan.id, { tasks })
      setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove task')
    }
  }, [activePlan])

  const saveTaskEdit = useCallback(async () => {
    if (!activePlan || !editingTaskId) return
    const tasks = activePlan.tasks.map((t) =>
      t.id === editingTaskId ? { ...t, title: editTitle, description: editDescription } : t,
    )
    try {
      const updated = await agentsApi.updatePlan(activePlan.id, { tasks })
      setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p))
      setEditingTaskId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
    }
  }, [activePlan, editingTaskId, editTitle, editDescription])

  // ── Start a single task (creates thread on frontend) ───────────

  const handleStartTask = useCallback(async (task: PlanTask) => {
    if (!activePlan) return
    setError(null)
    try {
      // Mark as approved on backend
      await agentsApi.startPlanTask(activePlan.id, task.id)

      // Delegate thread creation to the parent (App.tsx / useAutomation)
      onStartThread(task, activePlan, {
        name: repoName,
        localPath: repoLocalPath,
        defaultBranch,
      })

      // Optimistically mark as running
      setPlans((prev) => prev.map((p) =>
        p.id === activePlan.id
          ? { ...p, tasks: p.tasks.map((t) => t.id === task.id ? { ...t, status: 'running' as const } : t) }
          : p,
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start task')
    }
  }, [activePlan, repoName, repoLocalPath, defaultBranch, onStartThread])

  // ── Start all approved tasks ───────────────────────────────────

  const handleStartAll = useCallback(async () => {
    if (!activePlan) return
    setError(null)

    const approved = activePlan.tasks.filter((t) => t.status === 'approved' || t.status === 'proposed')
    if (approved.length === 0) {
      setError('No tasks to start. Approve some tasks first, or generate new ones.')
      return
    }

    // First approve all proposed tasks
    const tasks = activePlan.tasks.map((t) =>
      t.status === 'proposed' ? { ...t, status: 'approved' as const } : t,
    )
    try {
      const updated = await agentsApi.updatePlan(activePlan.id, { tasks, status: 'active' })
      setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p))
    } catch { /* continue anyway */ }

    // Start each task
    for (const task of approved) {
      try {
        onStartThread(task, activePlan, {
          name: repoName,
          localPath: repoLocalPath,
          defaultBranch,
        })

        setPlans((prev) => prev.map((p) =>
          p.id === activePlan.id
            ? { ...p, tasks: p.tasks.map((t) => t.id === task.id ? { ...t, status: 'running' as const } : t) }
            : p,
        ))

        // Brief delay to stagger thread creation
        await new Promise((r) => setTimeout(r, 500))
      } catch {
        // Continue starting other tasks even if one fails
      }
    }
  }, [activePlan, repoName, repoLocalPath, defaultBranch, onStartThread])

  // ── Delete plan ────────────────────────────────────────────────

  const handleDeletePlan = useCallback(async () => {
    if (!activePlan) return
    const confirmed = await confirm({
      title: 'Delete plan',
      description: `Delete plan "${activePlan.title}"?`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await agentsApi.deletePlan(activePlan.id)
      setPlans((prev) => prev.filter((p) => p.id !== activePlan.id))
      setActivePlanId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete plan')
    }
  }, [activePlan, confirm])

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const startEditing = (task: PlanTask) => {
    setEditingTaskId(task.id)
    setEditTitle(task.title)
    setEditDescription(task.description)
    setExpandedTasks((prev) => new Set(prev).add(task.id))
  }

  const approvedCount = activePlan?.tasks.filter((t) => t.status === 'approved' || t.status === 'proposed').length ?? 0
  const completedCount = activePlan?.tasks.filter((t) => t.status === 'completed').length ?? 0
  const totalCount = activePlan?.tasks.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span>Plans</span>
            <span className="text-muted-foreground">—</span>
            <span className="font-normal text-muted-foreground">{repoName}</span>
            {activePlan && totalCount > 0 && (
              <span className="ml-auto text-2xs text-muted-foreground">
                {completedCount}/{totalCount} done
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !activePlan ? (
            // No plans yet
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
              <p className="text-sm text-muted-foreground">No plans yet for this repository.</p>
              <Button size="sm" className="gap-1.5 text-xs" onClick={handleCreatePlan}>
                <Plus className="h-3.5 w-3.5" />
                Create plan
              </Button>
            </div>
          ) : (
            <>
              {/* Plan selector (if multiple plans) */}
              {plans.length > 1 && (
                <div className="flex items-center gap-2 border-b px-4 py-2">
                  <select
                    className="flex-1 rounded border bg-transparent px-2 py-1 text-xs"
                    value={activePlan.id}
                    onChange={(e) => setActivePlanId(e.target.value)}
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.title} ({p.tasks.length} tasks)</option>
                    ))}
                  </select>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={handleCreatePlan}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* AI generation prompt */}
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <Input
                  placeholder="Describe what you want to accomplish…"
                  className="h-8 flex-1 text-xs"
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleGenerate()
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={generating}
                  onClick={() => void handleGenerate()}
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Generate
                </Button>
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto">
                {activePlan.tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8">
                    <p className="text-xs text-muted-foreground">No tasks yet. Use the prompt above to generate tasks, or add them manually.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {activePlan.tasks.map((task) => {
                      const isExpanded = expandedTasks.has(task.id)
                      const isEditing = editingTaskId === task.id
                      const canStart = task.status === 'proposed' || task.status === 'approved'
                      const canSkip = task.status === 'proposed' || task.status === 'approved'

                      return (
                        <div key={task.id} className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {/* Expand toggle */}
                            <button
                              type="button"
                              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                              onClick={() => toggleExpand(task.id)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>

                            {/* Status badge */}
                            <TaskStatusBadge status={task.status} />

                            {/* Title */}
                            {isEditing ? (
                              <Input
                                className="h-6 flex-1 text-xs"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void saveTaskEdit()
                                  if (e.key === 'Escape') setEditingTaskId(null)
                                }}
                                autoFocus
                              />
                            ) : (
                              <span
                                className={`flex-1 truncate text-xs ${
                                  task.status === 'skipped' ? 'line-through text-muted-foreground' : 'font-medium'
                                }`}
                              >
                                {task.title}
                              </span>
                            )}

                            {/* Actions */}
                            <div className="flex shrink-0 items-center gap-0.5">
                              {canStart && (
                                <button
                                  type="button"
                                  title="Start thread"
                                  className="rounded p-1 text-green-600 hover:bg-green-500/10 dark:text-green-400"
                                  onClick={() => void handleStartTask(task)}
                                >
                                  <Play className="h-3.5 w-3.5" fill="currentColor" />
                                </button>
                              )}
                              {task.status === 'proposed' && (
                                <button
                                  type="button"
                                  title="Approve"
                                  className="rounded p-1 text-green-600 hover:bg-green-500/10 dark:text-green-400"
                                  onClick={() => void updateTaskStatus(task.id, 'approved')}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canSkip && (
                                <button
                                  type="button"
                                  title="Skip"
                                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                                  onClick={() => void updateTaskStatus(task.id, 'skipped')}
                                >
                                  <SkipForward className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {!isEditing && (task.status === 'proposed' || task.status === 'approved') && (
                                <button
                                  type="button"
                                  title="Edit"
                                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                                  onClick={() => startEditing(task)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                              {isEditing && (
                                <button
                                  type="button"
                                  title="Save"
                                  className="rounded p-1 text-green-600 hover:bg-green-500/10"
                                  onClick={() => void saveTaskEdit()}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {(task.status === 'proposed' || task.status === 'approved' || task.status === 'skipped') && (
                                <button
                                  type="button"
                                  title="Remove"
                                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                                  onClick={() => void removeTask(task.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Description (expanded) */}
                          {isExpanded && (
                            <div className="mt-2 pl-6">
                              {isEditing ? (
                                <textarea
                                  className="w-full rounded border bg-transparent px-2 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
                                  rows={4}
                                  value={editDescription}
                                  onChange={(e) => setEditDescription(e.target.value)}
                                />
                              ) : (
                                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                                  {task.description || 'No description.'}
                                </p>
                              )}
                              {task.threadId && (
                                <p className="mt-1 text-2xs text-muted-foreground">
                                  Thread: <code className="rounded bg-muted px-1">{task.threadId.slice(-8)}</code>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {error && (
            <div className="border-t bg-destructive/5 px-4 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-4 py-3">
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
              {!activePlan && (
                <Button size="sm" className="gap-1.5 text-xs" onClick={handleCreatePlan}>
                  <Plus className="h-3.5 w-3.5" />
                  New plan
                </Button>
              )}
              {activePlan && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-destructive hover:text-destructive"
                  onClick={() => void handleDeletePlan()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete plan
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              {activePlan && approvedCount > 0 && (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => void handleStartAll()}
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  Start all ({approvedCount})
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
