import { useState } from 'react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Switch } from '../ui/switch'
import { TooltipHint } from '../ui/tooltip'
import { ModelIcon } from '../icons/model-icons'
import { describeCron, formatRelativeTime, getNextRunTime } from '@/lib/cron-utils'
import type { ScheduledJob, JobRun } from '@/lib/jobs-api'
import { cn } from '@/lib/utils'
import { Play, Trash2, History, Edit, Clock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

interface JobsTableProps {
  jobs: ScheduledJob[]
  recentRuns: Record<string, JobRun | null>
  onToggle: (id: string, enabled: boolean) => void
  onTrigger: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (job: ScheduledJob) => void
  onViewHistory: (job: ScheduledJob) => void
  isLoading?: boolean
}

const jobTypeLabels: Record<string, string> = {
  agent_task: 'Agent Task',
  system_job: 'System Job',
}

/** "3m ago" style helper for last-run timestamps */
function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diffMs)) return ''
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

interface JobRowProps {
  job: ScheduledJob
  recentRun?: JobRun | null
  onToggle: (id: string, enabled: boolean) => void
  onTrigger: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (job: ScheduledJob) => void
  onViewHistory: (job: ScheduledJob) => void
  isLoading?: boolean
}

function JobRow({
  job,
  recentRun,
  onToggle,
  onTrigger,
  onDelete,
  onEdit,
  onViewHistory,
  isLoading = false,
}: JobRowProps) {
  const [isToggling, setIsToggling] = useState(false)
  const [isTriggering, setIsTriggering] = useState(false)

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true)
    try {
      await onToggle(job.id, checked)
    } finally {
      setIsToggling(false)
    }
  }

  const handleTrigger = async () => {
    setIsTriggering(true)
    try {
      await onTrigger(job.id)
    } finally {
      setIsTriggering(false)
    }
  }

  const nextRun = job.enabled ? getNextRunTime(job.cron_expression) : null

  const actionButtonClass =
    'h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent'

  return (
    <tr
      data-testid={`job-row-${job.id}`}
      className={cn(
        'group border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30',
        isLoading && 'opacity-50',
        !job.enabled && 'opacity-60',
      )}
    >
      {/* Name */}
      <td className="px-3 py-2 align-middle sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {job.job_type === 'agent_task' && job.model && job.provider && (
            <ModelIcon provider={job.provider} model={job.model} size={18} className="shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{job.name}</span>
              <Badge
                variant={job.job_type === 'agent_task' ? 'default' : 'secondary'}
                className="hidden shrink-0 px-1.5 py-0 text-[10px] sm:inline-flex"
              >
                {jobTypeLabels[job.job_type]}
              </Badge>
              {job.provider && (
                <Badge
                  variant="outline"
                  className="hidden shrink-0 px-1.5 py-0 text-[10px] sm:inline-flex"
                >
                  {job.provider}
                </Badge>
              )}
            </div>
            {job.prompt && (
              <div
                className="mt-0.5 hidden max-w-[28rem] truncate text-xs italic text-muted-foreground xl:block"
                title={job.prompt}
              >
                "{job.prompt}"
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Schedule */}
      <td className="px-3 py-2 align-middle sm:px-4">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="whitespace-nowrap font-mono text-xs">{job.cron_expression}</span>
        </div>
        <div className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
          {describeCron(job.cron_expression)}
        </div>
      </td>

      {/* Next run */}
      <td className="hidden whitespace-nowrap px-3 py-2 align-middle sm:table-cell">
        {nextRun ? (
          <span
            className="text-xs text-muted-foreground"
            title={`Next run: ${nextRun.toLocaleString()}`}
          >
            {formatRelativeTime(nextRun)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Last run */}
      <td className="hidden px-3 py-2 align-middle md:table-cell">
        {recentRun ? (
          <div className="whitespace-nowrap">
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs',
                recentRun.status === 'completed' && 'text-green-600 dark:text-green-400',
                recentRun.status === 'failed' && 'text-red-600 dark:text-red-400',
                recentRun.status === 'running' && 'text-blue-600 dark:text-blue-400',
              )}
            >
              {recentRun.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}
              {recentRun.status === 'failed' && <AlertCircle className="h-3.5 w-3.5" />}
              {recentRun.status === 'running' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {recentRun.status === 'completed' && 'Succeeded'}
              {recentRun.status === 'failed' && 'Failed'}
              {recentRun.status === 'running' && 'Running'}
            </div>
            {recentRun.started_at && (
              <div
                className="mt-0.5 text-xs text-muted-foreground"
                title={new Date(recentRun.started_at).toLocaleString()}
              >
                {formatTimeAgo(recentRun.started_at)}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Enabled switch */}
      <td className="px-2 py-2 text-center align-middle">
        <Switch
          checked={job.enabled}
          onCheckedChange={handleToggle}
          disabled={isToggling}
          aria-label={job.enabled ? `Pause job ${job.name}` : `Enable job ${job.name}`}
        />
      </td>

      {/* Actions */}
      <td className="px-2 py-2 align-middle sm:px-3">
        <div className="flex items-center justify-end gap-0.5">
          <TooltipHint content="Run now" side="top">
            <Button
              variant="ghost"
              size="icon"
              className={actionButtonClass}
              onClick={handleTrigger}
              disabled={isTriggering || !job.enabled}
              data-testid={`job-trigger-${job.id}`}
              aria-label={`Run job ${job.name} now`}
            >
              {isTriggering ? <Loader2 className="animate-spin" /> : <Play />}
            </Button>
          </TooltipHint>
          <TooltipHint content="History" side="top">
            <Button
              variant="ghost"
              size="icon"
              className={actionButtonClass}
              onClick={() => onViewHistory(job)}
              data-testid={`job-history-${job.id}`}
              aria-label={`View history for job ${job.name}`}
            >
              <History />
            </Button>
          </TooltipHint>
          <TooltipHint content="Edit" side="top">
            <Button
              variant="ghost"
              size="icon"
              className={actionButtonClass}
              onClick={() => onEdit(job)}
              aria-label={`Edit job ${job.name}`}
              data-testid={`job-edit-${job.id}`}
            >
              <Edit />
            </Button>
          </TooltipHint>
          <TooltipHint content="Delete" side="top">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(job.id)}
              aria-label={`Delete job ${job.name}`}
              data-testid={`job-delete-${job.id}`}
            >
              <Trash2 />
            </Button>
          </TooltipHint>
        </div>
      </td>
    </tr>
  )
}

export function JobsTable({
  jobs,
  recentRuns,
  onToggle,
  onTrigger,
  onDelete,
  onEdit,
  onViewHistory,
  isLoading = false,
}: JobsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium sm:px-4">Job</th>
            <th scope="col" className="px-3 py-2 font-medium sm:px-4">Schedule</th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Next run</th>
            <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Last run</th>
            <th scope="col" className="px-2 py-2 text-center font-medium">Status</th>
            <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">
              <span className="sr-only sm:not-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              recentRun={recentRuns[job.id]}
              onToggle={onToggle}
              onTrigger={onTrigger}
              onDelete={onDelete}
              onEdit={onEdit}
              onViewHistory={onViewHistory}
              isLoading={isLoading}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}